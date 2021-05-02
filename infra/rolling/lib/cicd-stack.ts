import * as cdk from '@aws-cdk/core'
import * as codebuild from '@aws-cdk/aws-codebuild'
import * as codepipeline from '@aws-cdk/aws-codepipeline'
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions'
import * as ecr from '@aws-cdk/aws-ecr'
import * as iam from '@aws-cdk/aws-iam'
import * as eks from '@aws-cdk/aws-eks'
import * as secretsManager from '@aws-cdk/aws-secretsmanager'

export interface CicdProps extends cdk.StackProps {
  readonly cluster: eks.Cluster
  readonly deploymentRole: iam.Role
  readonly githubRepoName: string
  readonly githubRepoOwner: string
  readonly apiName: string
  readonly dockerHubUsername: string
  readonly dockerHubPassword: string
}

export class CicdStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: CicdProps) {
    super(scope, id, props)

    // ECR repository for the docker images
    const ecrRepo = new ecr.Repository(this, 'EcrRepo', {
      // just a convention I like: ECR repo and the Github repo have the same name
      repositoryName: props.githubRepoName,
      imageScanOnPush: true,
    })

    // secrets manager for DockerHub login
    const dockerHubSecret = new secretsManager.CfnSecret(
      this,
      'dockerHubSecret',
      {
        secretString: JSON.stringify({
          username: props.dockerHubUsername,
          password: props.dockerHubPassword,
        }),
        description: 'DockerHub secrets for CodeBuild',
      }
    )

    // SOURCE
    const githubAccessToken = cdk.SecretValue.secretsManager(
      '/github.com/sekibomazic',
      {
        jsonField: 'token',
      }
    )

    const sourceOutput = new codepipeline.Artifact('SourceArtifact')

    const sourceAction = new codepipeline_actions.GitHubSourceAction({
      actionName: 'GitHubSource',
      branch: 'main',
      owner: props.githubRepoOwner,
      repo: props.githubRepoName,
      oauthToken: githubAccessToken,
      output: sourceOutput,
    })

    // BUILD
    const buildOutput = new codepipeline.Artifact('BuildArtifact')

    const buildProject = createBuildProject(
      this,
      ecrRepo,
      props.env!.account!,
      props.apiName,
      dockerHubSecret
    )

    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'CodeBuild',
      project: buildProject,
      input: sourceOutput,
      outputs: [buildOutput],
    })

    // DEPLOY
    const tag = process.env.IMAGE_TAG ? process.env.IMAGE_TAG : 'latest'
    const imageUri = `${ecrRepo.repositoryUri}:${tag}`
    const deployOutput = new codepipeline.Artifact('DeployArtifact')
    const deployProject = createDeployProject(
      this,
      ecrRepo,
      props.apiName,
      props.env!.account!,
      props.cluster.clusterName,
      props.deploymentRole
    )
    const deployAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'CodeBuild-DeployOnEks',
      project: deployProject,
      input: sourceOutput,
      outputs: [deployOutput],
    })

    // PIPELINE
    new codepipeline.Pipeline(this, 'deploy-to-eks-rolling', {
      pipelineName: 'deploy-to-eks-rolling',
      stages: [
        {
          stageName: 'Source',
          actions: [sourceAction],
        },
        {
          stageName: 'Build',
          actions: [buildAction],
        },
        {
          stageName: 'Deploy',
          actions: [deployAction],
        },
      ],
    })
  }
}

const createBuildProject = (
  scope: cdk.Construct,
  ecrRepo: ecr.Repository,
  accountId: string,
  apiName: string,
  dockerHubSecret: secretsManager.CfnSecret
): codebuild.PipelineProject => {
  const buildProject = new codebuild.PipelineProject(scope, 'CodeBuildEks', {
    description: 'Code build project for the application',
    environment: {
      buildImage: codebuild.LinuxBuildImage.STANDARD_4_0,
      computeType: codebuild.ComputeType.SMALL,
      privileged: true,
      environmentVariables: {
        ECR_REPOSITORY_URI: {
          value: ecrRepo.repositoryUri,
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
        },
        AWS_ACCOUNT_ID: {
          value: accountId,
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
        },
        API_NAME: {
          value: apiName,
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
        },
        DOCKER_HUB_SECRET_ARN: {
          value: dockerHubSecret.ref,
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
        },
      },
    },
    buildSpec: codebuild.BuildSpec.fromObject({
      version: '0.2',
      env: {
        'exported-variables': ['IMAGE_TAG'],
        'secrets-manager': {
          DOCKER_HUB_USERNAME: '$DOCKER_HUB_SECRET_ARN:username',
          DOCKER_HUB_PASSWORD: '$DOCKER_HUB_SECRET_ARN:password',
        },
      },
      phases: {
        install: {
          'runtime-versions': {
            nodejs: 'latest',
          },
          commands: ['npm install -g npm@latest', 'npm --version'],
        },
        pre_build: {
          commands: [
            'env',
            'echo Logging in to DockerHub ...',
            'docker login --username $DOCKER_HUB_USERNAME --password $DOCKER_HUB_PASSWORD',
            'echo Logging in to Amazon ECR...',
            'aws --version',
            'ECR_REPO=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com',
            'aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REPO',
            'COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)',
            'TAG=${COMMIT_HASH:=latest}',
            'export IMAGE_TAG=$TAG',
          ],
        },
        build: {
          commands: [
            'echo Build started on `date`',
            'echo Building the Docker image...',
            'npm i',
            'npm run build',
            'docker build -t $ECR_REPOSITORY_URI:latest .',
            'docker tag $ECR_REPOSITORY_URI:latest $ECR_REPOSITORY_URI:$TAG',
          ],
        },
        post_build: {
          commands: [
            'echo Pushing the Docker images...',
            'docker push $ECR_REPOSITORY_URI:latest',
            'docker push $ECR_REPOSITORY_URI:$TAG',
            'printf "[{"name":"${API_NAME}","imageUri":"${ECR_REPOSITORY_URI}:$TAG"}]" > imagedefinitions.json',
            'cat imagedefinitions.json',
          ],
        },
      },
      artifacts: {
        files: ['**/*'],
      },
    }),
  })
  buildProject.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['ecr:GetAuthorizationToken', 'secretsmanager:GetSecretValue'],
      resources: ['*'],
    })
  )
  buildProject.addToRolePolicy(
    new iam.PolicyStatement({
      actions: [
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage',
        'ecr:BatchCheckLayerAvailability',
        'ecr:PutImage',
        'ecr:InitiateLayerUpload',
        'ecr:UploadLayerPart',
        'ecr:CompleteLayerUpload',
      ],
      resources: [ecrRepo.repositoryArn],
    })
  )

  return buildProject
}

const createDeployProject = (
  scope: cdk.Construct,
  ecrRepo: ecr.Repository,
  apiName: string,
  accountId: string,
  clusterName: string,
  roleToAssume: iam.Role
): codebuild.PipelineProject => {
  const deployProject = new codebuild.PipelineProject(scope, 'DeployOnEks', {
    description: 'Deployment on EKS',
    environment: {
      buildImage: codebuild.LinuxBuildImage.STANDARD_4_0,
      computeType: codebuild.ComputeType.SMALL,
      privileged: true,
      environmentVariables: {
        ECR_REPOSITORY_URI: {
          value: ecrRepo.repositoryUri,
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
        },
        AWS_ACCOUNT_ID: {
          value: accountId,
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
        },
        API_NAME: {
          value: apiName,
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
        },
        CLUSTER_NAME: {
          value: clusterName,
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
        },
        DEPLOYMENT_ROLE_ARN: {
          value: roleToAssume.roleArn,
          type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
        },
      },
    },
    buildSpec: codebuild.BuildSpec.fromObject({
      version: '0.2',
      phases: {
        install: {
          'runtime-versions': {
            docker: 18,
          },
          commands: [
            'echo Installing kubectl ...',
            'curl -o kubectl https://amazon-eks.s3.us-west-2.amazonaws.com/1.19.6/2021-01-05/bin/linux/amd64/kubectl',
            'chmod +x ./kubectl',
            'mv ./kubectl /usr/local/bin/kubectl',
            'mkdir ~/.kube',
            'aws eks update-kubeconfig --region ${AWS_REGION} --name $CLUSTER_NAME --role-arn $DEPLOYMENT_ROLE_ARN',
          ],
        },
        build: {
          commands: [
            'echo Build started on `date`',
            'COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)',
            'echo COMMIT_HASH=$COMMIT_HASH',
            'IMAGE_URI=$ECR_REPOSITORY_URI:$COMMIT_HASH',
            'echo $IMAGE_URI',
            'echo Updating yaml configs ...',
            `sed -i 's@<API_NAME>@'$API_NAME'@g' infra/rolling/kubernetes/service.yaml`,
            `sed -i 's@<API_NAME>@'$API_NAME'@g' infra/rolling/kubernetes/deployment.yaml`,
            `sed -i 's@<IMAGE_URI>@'$IMAGE_URI'@g' infra/rolling/kubernetes/deployment.yaml`,
            'cat infra/rolling/kubernetes/deployment.yaml',
          ],
        },
        post_build: {
          commands: [
            'echo Updating EKS deployment ...',
            'kubectl apply -f infra/rolling/kubernetes/deployment.yaml',
            'kubectl apply -f infra/rolling/kubernetes/service.yaml',
          ],
        },
      },
    }),
  })

  deployProject.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['eks:DescribeCluster'],
      resources: [`*`],
    })
  )

  deployProject.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: [roleToAssume.roleArn],
    })
  )

  return deployProject
}
