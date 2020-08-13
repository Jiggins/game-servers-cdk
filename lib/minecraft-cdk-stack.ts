import { Construct, Stack, StackProps, RemovalPolicy, CfnOutput } from '@aws-cdk/core'
import { Repository } from '@aws-cdk/aws-ecr'
import { Server } from './server'
import { Networking } from './networking'

export class MinecraftCdkStack extends Stack {
  constructor (scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const repository = new Repository(this, 'MinecraftRepository', {
      repositoryName: 'minecraft',
      imageScanOnPush: true,
      removalPolicy: RemovalPolicy.DESTROY
    })

    const network = new Networking(this, 'MinecraftNetwork')

    const server = new Server(this, 'MinecraftServer', {
      vpc: network.vpc,
      securityGroup: network.securityGroup,
      repository: repository
    })

    new CfnOutput(this, 'RepositoryUri', {
      description: 'ECR repository URI',
      value: repository.repositoryUri
    })
  }
}
