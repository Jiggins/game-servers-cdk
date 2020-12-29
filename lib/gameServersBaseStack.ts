import { Repository } from '@aws-cdk/aws-ecr'
import { CfnOutput, Construct, RemovalPolicy, Stack, StackProps } from '@aws-cdk/core'
import { SecurityGroup, Vpc } from '@aws-cdk/aws-ec2'

import { Networking } from './networking'

export class GameServersBaseStack extends Stack {
  readonly repository: Repository
  readonly vpc: Vpc
  readonly securityGroup: SecurityGroup

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const repository = new Repository(this, 'MinecraftRepository', {
      repositoryName: 'minecraft',
      imageScanOnPush: true,
      removalPolicy: RemovalPolicy.DESTROY
    })

    const network = new Networking(this, 'MinecraftNetwork')
    this.vpc = network.vpc
    this.securityGroup = network.securityGroup

    new CfnOutput(this, 'RepositoryUri', {
      description: 'ECR repository URI',
      value: repository.repositoryUri
    })
  }
}
