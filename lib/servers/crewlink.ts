import { Construct, Tags } from '@aws-cdk/core'
import { LogGroup } from '@aws-cdk/aws-logs'
import { SubnetSelection } from '@aws-cdk/aws-ec2'
import {
  Cluster,
  FargateService,
  FargateTaskDefinition,
  LogDrivers,
  Protocol
} from '@aws-cdk/aws-ecs'

import { Server, ServerProps } from '../server'

export class CrewLinkServer extends Server {
  readonly taskDefinition: FargateTaskDefinition
  readonly logGroup: LogGroup
  readonly cluster: Cluster
  readonly service: FargateService

  readonly subnet: SubnetSelection

  constructor(scope: Construct, id: string, props: ServerProps) {
    super(scope, id, props)

    Tags.of(this).add('Name', 'CrewLink')

    this.subnet = this.vpc.selectSubnets({
      subnetGroupName: 'GameServers'
    })
  }

  protected createTaskDefinition(props: ServerProps): FargateTaskDefinition {
    const taskDefinition = super.createTaskDefinition(props)

    const container = taskDefinition.addContainer('Container', {
      image: this.containerImage(props.imageProps),

      logging: LogDrivers.awsLogs({
        streamPrefix: this.serverName,
        logGroup: this.logGroup
      }),

      environment: {
        ADDRESS: '0.0.0.0'
      },

      healthCheck: {
        command: ['CMD-SHELL', `curl --fail http://localhost:${props.networkProps.port}`]
      }
    })

    container.addPortMappings({
      containerPort: props.networkProps.port,
      protocol: Protocol.TCP
    })
    return taskDefinition
  }
}
