import { LogGroup } from '@aws-cdk/aws-logs'
import { Repository } from '@aws-cdk/aws-ecr'
import {
  Cluster,
  ContainerImage,
  FargateService,
  FargateTaskDefinition,
  LogDrivers
} from '@aws-cdk/aws-ecs'
import {
  Construct,
  Duration
} from '@aws-cdk/core'

import { Server, ServerProps } from '../server'

export interface MinecraftServerProps extends ServerProps {
  repository: Repository
}

export class MinecraftServer extends Server {
  readonly taskDefinition: FargateTaskDefinition
  readonly logGroup: LogGroup
  readonly cluster: Cluster
  readonly service: FargateService

  constructor(scope: Construct, id: string, props: MinecraftServerProps) {
    super(scope, id, props)

    this.taskDefinition = new FargateTaskDefinition(this, 'TaskDefinition', {
      family: id,

      cpu: 2048,
      memoryLimitMiB: 8192,

      executionRole: this.taskExecutionRole,
      taskRole: this.taskRole

    })

    this.taskDefinition.addContainer('Container', {
      image: ContainerImage.fromEcrRepository(Repository.fromRepositoryName(this, 'repository', 'minecraft')),

      healthCheck: {
        command: ['CMD-SHELL', '/opt/minecraft/bin/healthcheck.py'],
        startPeriod: Duration.minutes(5)
      },

      logging: LogDrivers.awsLogs({
        streamPrefix: 'minecraft',
        logGroup: this.logGroup
      })
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

      vpcSubnets: props.vpc.selectSubnets({
        subnetGroupName: 'GameServers'
      }),

      desiredCount: 1,

      // We do not want autscaling to spin up a second instance! That sounds
      // expensive
      maxHealthyPercent: 100
    })
  }
}
