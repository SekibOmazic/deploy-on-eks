import * as cdk from '@aws-cdk/core'
import * as iam from '@aws-cdk/aws-iam'
import * as eks from '@aws-cdk/aws-eks'
import * as ec2 from '@aws-cdk/aws-ec2'

export class ClusterStack extends cdk.Stack {
  public readonly cluster: eks.Cluster
  public readonly deploymentRole: iam.Role

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const clusterAdmin = new iam.Role(this, 'AdminRole', {
      assumedBy: new iam.AccountRootPrincipal(),
    })

    this.cluster = new eks.Cluster(this, 'eks-cluster', {
      clusterName: 'sample-eks-cluster',
      version: eks.KubernetesVersion.V1_19,
      mastersRole: clusterAdmin,
      defaultCapacity: 2,
      defaultCapacityInstance: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MEDIUM
      ),
    })

    this.deploymentRole = new iam.Role(this, 'cluster-admin-role', {
      roleName: cdk.PhysicalName.GENERATE_IF_NEEDED,
      assumedBy: new iam.AccountRootPrincipal(),
    })

    this.cluster.awsAuth.addMastersRole(this.deploymentRole)
  }
}
