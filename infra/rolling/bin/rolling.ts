#!/usr/bin/env node
import * as cdk from '@aws-cdk/core'
import { CicdStack } from '../lib/cicd-stack'
import { ClusterStack } from '../lib/cluster-stack'

// const GITHUB_REPO_NAME = 'deploy-on-eks'
// const GITHUB_REPO_OWNER = 'SekibOmazic'
// const API_NAME = 'simple-api'

const app = new cdk.App()

const account =
  app.node.tryGetContext('account') ||
  process.env.CDK_INTEG_ACCOUNT ||
  process.env.CDK_DEFAULT_ACCOUNT
const region = process.env.CDK_DEFAULT_REGION || 'us-east-1'

const clusterStack = new ClusterStack(app, 'ClusterStack', {
  env: {
    account: account,
    region: region,
  },
})

new CicdStack(app, 'RollingStack', {
  stackName: 'deploy-on-eks-pipeline',
  cluster: clusterStack.cluster,
  deploymentRole: clusterStack.deploymentRole,
  githubRepoName: process.env!.GITHUB_REPO_NAME!,
  githubRepoOwner: process.env!.GITHUB_REPO_OWNER!,
  apiName: process.env!.API_NAME!,
  dockerHubUsername: process.env.DOCKERHUB_USERNAME!,
  dockerHubPassword: process.env.DOCKERHUB_PASSWORD!,
  env: {
    account: account,
    region: region,
  },
})
