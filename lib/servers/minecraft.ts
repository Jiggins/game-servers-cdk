import * as elb from '@aws-cdk/aws-elasticloadbalancingv2'
import { LogGroup } from '@aws-cdk/aws-logs'
import { Repository } from '@aws-cdk/aws-ecr'
import { Peer, Port, SecurityGroup } from '@aws-cdk/aws-ec2'
import { FileSystem } from '@aws-cdk/aws-efs'
import { PolicyStatement, Effect } from '@aws-cdk/aws-iam'
import { GraphWidget, Metric } from '@aws-cdk/aws-cloudwatch'
import {
  ContainerImage,
  FargateTaskDefinition,
  LogDrivers,
  Protocol
} from '@aws-cdk/aws-ecs'
import {
  Construct,
  Duration
} from '@aws-cdk/core'
import {
  NetworkLoadBalancer,
  NetworkTargetGroup
} from '@aws-cdk/aws-elasticloadbalancingv2'

import { Server, ServerProps } from '../server'

export interface MincecraftServerProps extends ServerProps {
  fileSystem: FileSystem
}

export class MinecraftServer extends Server {
  readonly logGroup: LogGroup
  readonly loadBalancer: NetworkLoadBalancer
  targetGroup: NetworkTargetGroup

  static healthCheckPort = 8443

  constructor(scope: Construct, id: string, props: MincecraftServerProps) {
    super(scope, id, props)

    this.taskRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'ec2:DescribeNetworkInterfaces',
        'ecs:DescribeTasks',
        'route53:ChangeResourceRecordSets',
        'route53:ListHostedZonesByName'
      ],
      resources: ['*']
    }))
  }

  protected createSecurityGroup(id: string, props: MincecraftServerProps): SecurityGroup {
    const securityGroup = super.createSecurityGroup(id, props)
    securityGroup.connections.allowTo(props.fileSystem, Port.tcp(2049))

    return securityGroup
  }

  protected createTaskDefinition(id: string, props: MincecraftServerProps): FargateTaskDefinition {
    const taskDefinition = super.createTaskDefinition(id, props)

    // Health check is usually on the same port but not for Minecraft
    const healthCheckPort = props.networkProps.healthCheckPort ?? props.networkProps.port

    taskDefinition.addVolume({
      name: id,
      efsVolumeConfiguration: {
        fileSystemId: props.fileSystem.fileSystemId
      }
    })

    const container = taskDefinition.addContainer('Container', {
      image: ContainerImage.fromEcrRepository(Repository.fromRepositoryName(this, 'repository', 'minecraft')),

      healthCheck: {
        command: ['CMD-SHELL', `curl -f http://localhost:${healthCheckPort}`],
        startPeriod: Duration.minutes(5)
      },

      logging: LogDrivers.awsLogs({
        streamPrefix: 'minecraft',
        logGroup: this.logGroup
      })
    })

    /** Minecraft server port */
    container.addPortMappings({
      containerPort: props.networkProps.port,
      hostPort: props.networkProps.port,
      protocol: Protocol.TCP
    })

    /** TCP Health check */
    container.addPortMappings({
      containerPort: MinecraftServer.healthCheckPort,
      hostPort: MinecraftServer.healthCheckPort,
      protocol: Protocol.TCP
    })

    container.addMountPoints({
      sourceVolume: 'Minecraft',
      containerPath: '/mnt/minecraft',
      readOnly: false
    })

    return taskDefinition
  }

  protected addMetrics() {
    this.dashboard.addWidgets(
      new GraphWidget({
        title: 'CPU & Memory VS Player Count',
        left: [
          new Metric({
            namespace: 'AWS/ECS',
            metricName: 'CPUUtilization',
            dimensionsMap: {
              ServiceName: this.service.serviceName,
              ClusterName: this.cluster.clusterName
            }
          }),

          new Metric({
            namespace: 'AWS/ECS',
            metricName: 'MemoryUtilization',
            dimensionsMap: {
              ServiceName: this.service.serviceName,
              ClusterName: this.cluster.clusterName
            }
          })
        ]
      })
    )
  }
}
