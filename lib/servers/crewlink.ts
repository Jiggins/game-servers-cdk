import { Construct } from '@aws-cdk/core'
import { LogGroup } from '@aws-cdk/aws-logs'
import { SubnetType } from '@aws-cdk/aws-ec2'
import {
  Cluster,
  ContainerImage,
  FargatePlatformVersion,
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

  static readonly port = 9736

  constructor(scope: Construct, id: string, props: ServerProps) {
    super(scope, id, props)

    this.taskDefinition = new FargateTaskDefinition(this, 'TaskDefinition', {
      family: id
    })

    const container = this.taskDefinition.addContainer('Container', {
      image: ContainerImage.fromRegistry('ottomated/crewlink-server'),

      logging: LogDrivers.awsLogs({
        streamPrefix: id,
        logGroup: this.logGroup
      }),

      healthCheck: {
        command: ['CMD-SHELL', `nc -vz localhost ${CrewLinkServer.port}`]
      }
    })

    container.addPortMappings({
      containerPort: CrewLinkServer.port,
      protocol: Protocol.TCP
    })

    this.cluster = new Cluster(this, 'Cluster', {
      clusterName: id,
      vpc: props.vpc
    })

    this.service = new FargateService(this, 'FargateService', {
      serviceName: id,
      cluster: this.cluster,
      taskDefinition: this.taskDefinition,
      assignPublicIp: true,
      securityGroup: props.securityGroup,
      platformVersion: FargatePlatformVersion.VERSION1_4,

      vpcSubnets: props.vpc.selectSubnets({
        subnetType: SubnetType.PUBLIC
      }),

      // desiredCount is 0 since the task will be launched via a CloudWatch
      // event rule
      desiredCount: 1,

      // We do not want autscaling to spin up a second instance! That sounds
      // expensive
      maxHealthyPercent: 100
    })
  }
}
