import { countResources, expect as expectCDK } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import * as CiCd from '../lib/cicd-stack'
import { ClusterStack } from '../lib/cluster-stack'

test('Pipeline Created', () => {
  const app = new cdk.App()
  // WHEN
  const clusterStack = new ClusterStack(app, 'MyCluster', {
    env: {
      account: '123456789012',
      region: 'us-east-1',
    },
  })

  const stack = new CiCd.CicdStack(app, 'MyTestCiCdStack', {
    cluster: clusterStack.cluster,
    deploymentRole: clusterStack.deploymentRole,
    apiName: 'simple-api',
    env: {
      account: '123456789012',
      region: 'us-east-1',
    },
    githubRepoName: 'deploy-on-eks',
    githubRepoOwner: 'SekibOmazic',
  })
  // THEN
  expectCDK(stack).to(countResources('AWS::CodePipeline::Pipeline', 1))
  expectCDK(stack).to(countResources('AWS::CodeBuild::Project', 2))
})
