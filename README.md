# On-demand self-hosted [Huawei Cloud](https://www.huaweicloud.com/) ECS runner for GitHub Actions

[![Integration Test](https://github.com/messense/huaweicloud-github-runner/actions/workflows/test.yml/badge.svg)](https://github.com/messense/huaweicloud-github-runner/actions/workflows/test.yml)

Start your [ECS](https://www.huaweicloud.com/product/ecs.html) [self-hosted runner](https://docs.github.com/en/free-pro-team@latest/actions/hosting-your-own-runners) right before you need it.
Run the job on it.
Finally, stop it when you finish.
And all this automatically as a part of your GitHub Actions workflow.

This project was forked from [machulav/ec2-github-runner](https://github.com/machulav/ec2-github-runner) with modifications.

See [below](#example) the YAML code of the depicted workflow. 

## Usage

### How to start

Use the following steps to prepare your workflow for running on your ECS self-hosted runner:

**1. Prepare [IAM](https://console.huaweicloud.com/iam) user with access keys**

1. Create new acccess keys for the new or an existing IAM user with required [ECS server adminstrator](https://support.huaweicloud.com/productdesc-ecs/ecs_01_0059.html#section5) permisions.
2. Add the keys to GitHub secrets

**2. Prepare GitHub personal access token**

1. Create a new [GitHub personal access token](https://github.com/settings/tokens) with the repo scope. The action will use the token for self-hosted runners management in the GitHub account on the repository level.
2. Add the token to GitHub secrets.

**3. Prepare ECS image (optional)**

1. You can use the default Ubuntu/CentOS image, but it's recommended to create your own image with Docker pre-installed.

**4. Prepare VPC with subnet and security group**

1. Create a new VPC and a new subnet in it. Or use the existing VPC and subnet.
2. Create a new security group for the runners in the VPC.
   Only the outbound traffic on port 443 should be allowed for pulling jobs from GitHub.
   No inbound traffic is required.

**5. Configure the GitHub workflow**

1. Create a new GitHub Actions workflow or edit the existing one.
2. Use the documentation and example below to configure your workflow.
3. Please don't forget to set up a job for removing the ECS instance at the end of the workflow execution.
   Otherwise, the ECS instance won't be removed and continue to run even after the workflow execution is finished.

### Inputs

| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | Required                                            | Description                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`                                                                                                                                                                       | Always required.                                    | Specify here which mode you want to use: <br> - `start` - to start a new runner; <br> - `stop` - to stop the previously created runner.                                                                                             |
| `github-token`                                                                                                                                                               | Always required.                                    | GitHub Personal Access Token with the `repo` scope assigned.                                                                                                                                                                        |
| `huawei-cloud-ak`                                                                                                                                                            | Always required.                                    | Huawei Cloud AK                                                                                                                                                                                                                     |
| `huawei-cloud-sk`                                                                                                                                                            | Always required.                                    | Huawei Cloud SK                                                                                                                                                                                                                     |
| `project-id`                                                                                                                                                                 | Always required.                                    | Huawei Cloud project id                                                                                                                                                                                                             |
| `availability-zone`                                                                                                                                                          | Alwasy required.                                    | ECS availability zone                                                                                                                                                                                                               |
| `ecs-image-id`                                                                                                                                                               | Required if you use the `start` mode.               | [ECS Image](https://www.huaweicloud.com/product/ims.html) Id. <br><br> The new runner will be launched from this image. <br><br> The action is compatible with Ubuntu/CentOS images.                                                |
| `ecs-instance-type`                                                                                                                                                          | Required if you use the `start` mode.               | [ECS Instance Type](https://www.huaweicloud.com/product/ecs/instance-types.html).                                                                                                                                                   |
| `vpc-id`                                                                                                                                                                     | This input is required if you use the `start` mode. | [VPC](https://www.huaweicloud.com/product/vpc.html) Id                                                                                                                                                                              |
| `subnet-id`                                                                                                                                                                  | Required if you use the `start` mode.               | VPC Subnet Id. <br><br> The subnet should belong to the same VPC as the specified security group.                                                                                                                                   |
| `security-group-id`                                                                                                                                                          | Required if you use the `start` mode.               | ECS Security Group Id. <br><br> The security group should belong to the same VPC as the specified subnet. <br><br> Only the outbound traffic for port 443 should be allowed. No inbound traffic is required.                        |
| `label`                                                                                                                                                                      | Required if you use the `stop` mode.                | Name of the unique label assigned to the runner. <br><br> The label is provided by the output of the action in the `start` mode. <br><br> The label is used to remove the runner from GitHub when the runner is not needed anymore. |
| `ecs-instance-id`                                                                                                                                                            | Required if you use the `stop` mode.                | ECS Instance Id of the created runner. <br><br> The id is provided by the output of the action in the `start` mode. <br><br> The id is used to terminate the ECS instance when the runner is not needed anymore.                    |
| `count`                                                                                                                                                                      | Not required                                        | ECS instance count, defaults to 1                                                                                                                                                                                                   |
| `server-tags`                                                                                                                                                                | Optional. Used only with the `start` mode.          | Specifies tags to add to the ECS instance and any attached storage. <br><br> This field is a stringified JSON array of tag objects, each containing a `key` and `value` field (see example below).                                  |

The runners created by this action will have `self-hosted` and `huaweicloud` labels, you can use them in `runs-on`.

## Example

The workflow showed in the picture above and declared in `do-the-job.yml` looks like this:

```yaml
name: do-the-job
on: [push]

jobs:
  start-runner:
    name: Start self-hosted ECS runner
    runs-on: ubuntu-latest
    outputs:
      label: ${{ steps.start-ecs-runner.outputs.label }}
      ecs-instance-id: ${{ steps.start-ecs-runner.outputs.ecs-instance-id }}
    steps:
      - uses: actions/checkout@v2
      - name: Start ECS runner
        id: start-ecs-runner
        uses: messense/huaweicloud-github-runner@main
        with:
          mode: start
          github-token: ${{ secrets.GH_PAT }}
          huawei-cloud-ak: ${{ secrets.HUAWEI_CLOUD_AK }}
          huawei-cloud-sk: ${{ secrets.HUAWEI_CLOUD_SK }}
          project-id: ${{ secrets.PROJECT_ID }}
          availability-zone: ap-southeast-1b
          ecs-image-id: 93b1fc8d-ee4e-4126-950e-8f4404408acc
          ecs-instance-type: kc1.large.2
          vpc-id: ${{ secrets.VPC_ID }}
          subnet-id: ${{ secrets.SUBNET_ID }}
          security-group-id: ${{ secrets.SECURITY_GROUP_ID }}
  do-the-job:
    name: Do the job on the runner
    needs: start-runner
    runs-on: ${{ needs.start-runner.outputs.label }}
    steps:
      - name: Hello World
        run: echo 'Hello World!'
  stop-runner:
    name: Stop self-hosted ECS runner
    needs: [start-runner, do-the-job]
    runs-on: ubuntu-latest
    if: ${{ always() }}
    steps:
      - uses: actions/checkout@v2
      - name: Stop ECS runner
        if: ${{ needs.start-runner.outputs.ecs-instance-id }}
        uses: messense/huaweicloud-github-runner@main
        with:
          mode: stop
          github-token: ${{ secrets.GH_PAT }}
          huawei-cloud-ak: ${{ secrets.HUAWEI_CLOUD_AK }}
          huawei-cloud-sk: ${{ secrets.HUAWEI_CLOUD_SK }}
          project-id: ${{ secrets.PROJECT_ID }}
          availability-zone: ap-southeast-1b
          label: ${{ needs.start-runner.outputs.label }}
          ecs-instance-id: ${{ needs.start-runner.outputs.ecs-instance-id }}
```

## License

This work is released under the MIT license. A copy of the license is provided in the [LICENSE](./LICENSE) file.
