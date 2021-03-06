const core = require('@actions/core');
const github = require('@actions/github');

class Config {
  constructor() {
    this.input = {
      mode: core.getInput('mode'),
      githubToken: core.getInput('github-token'),
      ak: core.getInput('huawei-cloud-ak'),
      sk: core.getInput('huawei-cloud-sk'),
      projectId: core.getInput('project-id'),
      ecsImageId: core.getInput('ecs-image-id'),
      ecsInstanceType: core.getInput('ecs-instance-type'),
      availabilityZone: core.getInput('availability-zone'),
      vpcId: core.getInput('vpc-id'),
      subnetId: core.getInput('subnet-id'),
      securityGroupId: core.getInput('security-group-id'),
      label: core.getInput('label'),
      ecsInstanceId: core.getInput('ecs-instance-id'),
      serverTags: JSON.parse(core.getInput('server-tags')) || [],
      count: parseInt(core.getInput('count')),
    };

    // the values of github.context.repo.owner and github.context.repo.repo are taken from
    // the environment variable GITHUB_REPOSITORY specified in "owner/repo" format and
    // provided by the GitHub Action on the runtime
    this.githubContext = {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
    };

    //
    // validate input
    //

    if (!this.input.mode) {
      throw new Error(`The 'mode' input is not specified`);
    }

    if (!this.input.githubToken) {
      throw new Error(`The 'github-token' input is not specified`);
    }

    if (!this.input.ak) {
      throw new Error("The 'huawei-cloud-ak' input is not specified");
    }

    if (!this.input.sk) {
      throw new Error("The 'huawei-cloud-ak' input is not specified");
    }

    if (!this.input.projectId) {
      throw new Error("The 'project-id' input is not specified");
    }

    if (this.input.mode === 'start') {
      if (!this.input.availabilityZone || !this.input.ecsImageId || !this.input.ecsInstanceType || !this.input.vpcId || !this.input.subnetId || !this.input.securityGroupId) {
        throw new Error(`Not all the required inputs are provided for the 'start' mode`);
      }
    } else if (this.input.mode === 'stop') {
      if (!this.input.label || !this.input.availabilityZone || !this.input.ecsInstanceId) {
        throw new Error(`Not all the required inputs are provided for the 'stop' mode`);
      }
    } else {
      throw new Error('Wrong mode. Allowed values: start, stop.');
    }
  }

  generateUniqueLabel() {
    return 'actions-' + Math.random().toString(36).substr(2, 8);
  }
}

try {
  module.exports = new Config();
} catch (error) {
  core.error(error);
  core.setFailed(error.message);
}
