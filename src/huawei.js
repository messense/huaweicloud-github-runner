const core = require('@actions/core');
const sdkcore = require('@huaweicloud/huaweicloud-sdk-core');
const ecs = require("@huaweicloud/huaweicloud-sdk-ecs");
const config = require('./config');

function setOutput(label, ecsInstanceId) {
    core.setOutput('label', label);
    core.setOutput('ecs-instance-id', ecsInstanceId);
}

function createEcsClient() {
    const credentials = new sdkcore.BasicCredentials()
        .withAk(config.input.ak)
        .withSk(config.input.sk)
        .withProjectId(config.input.projectId)
    const region = config.input.availabilityZone.slice(0, config.input.availabilityZone.length - 1);
    const endpoint = `https://ecs.${region}.myhuaweicloud.com`;
    return ecs.EcsClient.newBuilder()
        .withCredential(credentials)
        .withEndpoint(endpoint)
        .build();
}

async function waitForInstanceRunning(client, jobId) {
    const sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));
    const request = new ecs.ShowJobRequest();
    request.jobId = jobId;
    for (; ;) {
        const result = (await client.showJob(request)).result;
        if (result.status === ecs.ShowJobResponseStatusEnum.SUCCESS) {
            return;
        } else if (result.status == ecs.ShowJobResponseStatusEnum.FAIL) {
            throw new Error(`Wait for instance running error: ${result.failReason}`);
        } else {
            await sleep(5000);
        }
    }
}

async function startEcsInstance(label, githubRegistrationToken) {
    // User data scripts are run as the root user.
    // Docker and git are necessary for GitHub runner and should be pre-installed on the AMI.
    const userData = `#!/bin/bash
        if ! [ -x "$(command -v docker)" ]; then
            if [ -x "$(command -v apt-get)" ]; then
                apt-get update
                apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release
                curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
                case $(uname -m) in aarch64) export DOCKER_ARCH="arm64" ;; amd64|x86_64) export DOCKER_ARCH="amd64" ;; esac
                echo "deb [arch=$DOCKER_ARCH signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
                apt-get update
                apt-get install -y docker-ce docker-ce-cli containerd.io
            elif [ -x "$(command -v yum)" ]; then
                yum install -y yum-utils
                yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
                yum install -y docker-ce docker-ce-cli containerd.io
            fi
        fi

        mkdir -p /root
        export HOME=/root

        mkdir actions-runner && cd actions-runner
        case $(uname -m) in aarch64) ARCH="arm64" ;; amd64|x86_64) ARCH="x64" ;; esac && export RUNNER_ARCH=$ARCH
        curl -O -L https://github.com/actions/runner/releases/download/v2.282.0/actions-runner-linux-$RUNNER_ARCH-2.282.0.tar.gz
        tar xzf ./actions-runner-linux-$RUNNER_ARCH-2.282.0.tar.gz
        rm ./actions-runner-linux-$RUNNER_ARCH-2.282.0.tar.gz
        export RUNNER_ALLOW_RUNASROOT=1
        export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1
        ./config.sh --unattended --ephemeral --url https://github.com/${config.githubContext.owner}/${config.githubContext.repo} --token ${githubRegistrationToken} --labels ${label},huaweicloud
        ./run.sh`;
    const client = createEcsClient();
    const request = new ecs.CreateServersRequest();
    const body = new ecs.CreateServersRequestBody();
    const listServerServerTags = new Array();
    if (config.input.serverTags && config.input.serverTags.length > 0) {
        for (const tag of config.input.serverTags) {
            listServerServerTags.push(
                new ecs.PostPaidServerTag()
                    .withKey(tag.key)
                    .withValue(tag.value)
            );
        }
    }
    const extendparamServer = new ecs.PostPaidServerExtendParam();
    const listServerSecurityGroups = new Array();
    listServerSecurityGroups.push(
        new ecs.PostPaidServerSecurityGroup()
            .withId(config.input.securityGroupId)
    );
    const rootVolumeServer = new ecs.PostPaidServerRootVolume();
    rootVolumeServer.withVolumetype(ecs.PostPaidServerRootVolumeVolumetypeEnum.SSD)
        .withSize(40);
    const extendparamEip = new ecs.PostPaidServerEipExtendParam();
    extendparamEip.withChargingMode(ecs.PostPaidServerEipExtendParamChargingModeEnum.POSTPAID);
    const bandwidthEip = new ecs.PostPaidServerEipBandwidth();
    bandwidthEip.withSize(300)
        .withSharetype(ecs.PostPaidServerEipBandwidthSharetypeEnum.PER)
        .withChargemode("traffic");
    const eipPublicip = new ecs.PostPaidServerEip();
    eipPublicip.withIptype("5_bgp")
        .withBandwidth(bandwidthEip)
        .withExtendparam(extendparamEip);
    const publicipServer = new ecs.PostPaidServerPublicip();
    publicipServer.withEip(eipPublicip);
    const listServerNics = new Array();
    listServerNics.push(
        new ecs.PostPaidServerNic()
            .withSubnetId(config.input.subnetId)
    );
    const serverbody = new ecs.PostPaidServer();
    serverbody.withImageRef(config.input.ecsImageId)
        .withFlavorRef(config.input.ecsInstanceType)
        .withName(label)
        .withUserData(Buffer.from(userData).toString('base64'))
        .withVpcid(config.input.vpcId)
        .withNics(listServerNics)
        .withPublicip(publicipServer)
        .withCount(config.input.count)
        .withRootVolume(rootVolumeServer)
        .withSecurityGroups(listServerSecurityGroups)
        .withAvailabilityZone(config.input.availabilityZone)
        .withExtendparam(extendparamServer)
        .withServerTags(listServerServerTags);
    body.withServer(serverbody);
    request.withBody(body);
    try {
        const result = (await client.createServers(request)).result;
        const instanceIds = result.serverIds.join(',');
        const jobId = result.job_id;
        core.info(`ECS instance ${instanceIds} created, waiting for job ${jobId} running...`);
        setOutput(label, instanceIds);

        await waitForInstanceRunning(client, jobId);
        core.info(`ECS instance ${instanceIds} ready for work.`);
    } catch (error) {
        core.setFailed(`Huawei Cloud ECS instance starting error: ${error.errorMsg}`);
        throw error;
    }
}

async function terminateEcsInstance() {
    const client = createEcsClient();
    const request = new ecs.DeleteServersRequest();
    const body = new ecs.DeleteServersRequestBody();
    const listbodyServers = new Array();
    const instanceIds = config.input.ecsInstanceId.split(',');
    for (const instanceId of instanceIds) {
        listbodyServers.push(
            new ecs.ServerId()
                .withId(instanceId)
        );
    }
    body.withServers(listbodyServers);
    body.withDeleteVolume(true);
    body.withDeletePublicip(true);
    request.withBody(body);
    try {
        await client.deleteServers(request);
        core.info(`Huawei Cloud ECS instance ${config.input.ecsInstanceId} terminated`);
        return;
    } catch (error) {
        core.setFailed(`Huawei Cloud ECS instance ${config.input.ecsInstanceId} termination error: ${error.errorMsg}`);
        throw error;
    }
}

module.exports = {
    startEcsInstance,
    terminateEcsInstance,
};
