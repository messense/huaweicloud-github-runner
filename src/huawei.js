const core = require('@huaweicloud/huaweicloud-sdk-core');
const ecs = require("@huaweicloud/huaweicloud-sdk-ecs");
const config = require('./config');

function createEcsClient() {
    const credentials = new core.BasicCredentials()
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
    const request = new ecs.ShowJobRequest(jobId);
    for (; ;) {
        const result = await client.showJob(request);
        if (result.status === ecs.ShowJobResponseStatusEnum.SUCCESS) {
            break;
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
    const userData = [
        '#!/bin/bash',
        'apt-get update',
        'apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release',
        'curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg',
        'case $(uname -m) in aarch64) export DOCKER_ARCH="arm64" ;; amd64|x86_64) export DOCKER_ARCH="amd64" ;; esac',
        'echo "deb [arch=${DOCKER_ARCH} signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null',
        'apt-get update',
        'apt-get install -y docker-ce docker-ce-cli containerd.io',
        'mkdir actions-runner && cd actions-runner',
        'case $(uname -m) in aarch64) ARCH="arm64" ;; amd64|x86_64) ARCH="x64" ;; esac && export RUNNER_ARCH=${ARCH}',
        'curl -O -L https://github.com/actions/runner/releases/download/v2.278.0/actions-runner-linux-${RUNNER_ARCH}-2.278.0.tar.gz',
        'tar xzf ./actions-runner-linux-${RUNNER_ARCH}-2.278.0.tar.gz',
        'rm ./actions-runner-linux-${RUNNER_ARCH}-2.278.0.tar.gz',
        'export RUNNER_ALLOW_RUNASROOT=1',
        'export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1',
        `./config.sh --url https://github.com/${config.githubContext.owner}/${config.githubContext.repo} --token ${githubRegistrationToken} --labels ${label}`,
        './run.sh',
    ];
    const client = createEcsClient();
    const body = ecs.CreateServersRequestBody({
        name: label,
        imageRef: config.input.ecsImageId,
        flavorRef: config.input.ecsInstanceType,
        user_data: Buffer.from(userData.join('\n')).toString('base64'),
        vpcid: config.input.vpcId,
        nics: {
            subnet_id: config.input.subnetId
        },
        publicip: {
            eip: {
                iptype: '5_bgp',
                bandwidth: {
                    size: 300,
                    sharetype: 'PER',
                    chargemode: 'traffic'
                },
                extendparam: {
                    chargingMode: 'postPaid'
                }
            }
        },
        root_volume: {
            volumetype: 'SSD',
            size: 40
        },
        security_groups: [
            { id: config.input.securityGroupId }
        ],
        availability_zone: config.input.availabilityZone,
        extendparam: {
            chargingMode: 'postPaid',
            isAutoPay: true
        },
        server_tags: config.input.serverTags
    });
    const request = new ecs.CreateServersRequest().withBody(body);
    try {
        const result = await client.createServers(request);
        const instanceId = result.serverIds[0];
        await waitForInstanceRunning(client, result.jobId);
        return instanceId;
    } catch (error) {
        core.error('Huawei Cloud ECS instance starting error');
        throw error;
    }
}

async function terminateEcsInstance() {
    const client = createEcsClient();
    const request = new ecs.DeleteServersRequest().withBody(new ecs.DeleteServersRequestBody([
        { id: config.input.ecsInstanceId }
    ]).withDeleteVolume(true).withDeletePublicip(true));
    try {
        await client.deleteServers(request);
        core.info(`Huawei Cloud ECS instance ${config.input.ecsInstanceId} is terminated`);
        return;
    } catch (error) {
        core.error(`Huawei Cloud ECS instance ${config.input.ecsInstanceId} termination error`);
        throw error;
    }
}

module.exports = {
    startEcsInstance,
    terminateEcsInstance,
};
