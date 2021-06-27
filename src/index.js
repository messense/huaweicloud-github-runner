const gh = require('./gh');
const huawei = require('./huawei');
const config = require('./config');
const core = require('@actions/core');

function setOutput(label, ecsInstanceId) {
  core.setOutput('label', label);
  core.setOutput('ecs-instance-id', ecsInstanceId);
}

async function start() {
  const label = config.generateUniqueLabel();
  const githubRegistrationToken = await gh.getRegistrationToken();
  const ecsInstanceId = await huawei.startEcsInstance(label, githubRegistrationToken);
  setOutput(label, ecsInstanceId);
  await gh.waitForRunnerRegistered(label);
}

async function stop() {
  await huawei.terminateEcsInstance();
  await gh.removeRunner();
}

(async function () {
  try {
    config.input.mode === 'start' ? await start() : await stop();
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
})();
