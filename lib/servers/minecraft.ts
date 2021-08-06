import { LogGroup } from '@aws-cdk/aws-logs'
import { Repository } from '@aws-cdk/aws-ecr'
import { Port, SecurityGroup } from '@aws-cdk/aws-ec2'
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

  /** The worlds added by both Minecraft and various mods. Used in graphs */
  static readonly worlds = [
    'Overall:',
    'appliedenergistics2:spatial_storage',
    'compactmachines:compact_world',
    'jamd:mining',
    'javd:void',
    'minecraft:overworld',
    'minecraft:the_end',
    'minecraft:the_nether',
    'mythicbotany:alfheim',
    'rats:ratlantis',
    'twilightforest:skylight_forest',
    'twilightforest:twilightforest',
    'undergarden:undergarden',
    'woot:tartarus'
  ]

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

    this.addMetrics()
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

        height: 6,
        width: 12,
        period: Duration.minutes(1),

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
        ],

        leftYAxis: {
          min: 0,
          max: 100,
          showUnits: true
        },

        right: [
          new Metric({
            namespace: 'GameServers/Minecraft',
            metricName: 'PlayerCount',
            dimensionsMap: {
              ServerName: this.service.serviceName
            }
          })
        ],

        rightYAxis: {
          min: 0,
          showUnits: false
        }
      }),

      new GraphWidget({
        title: 'CPU & Memory Vs Tick Time',

        height: 6,
        width: 12,
        period: Duration.minutes(1),

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
        ],

        leftYAxis: {
          min: 0,
          max: 100,
          showUnits: true
        },

        right: [
          new Metric({
            namespace: 'GameServers/Minecraft',
            metricName: 'Tick Time',
            dimensionsMap: {
              ServerName: this.service.serviceName,
              dimension: 'Overall:'
            }
          })
        ],

        rightYAxis: {
          min: 0,
          showUnits: true
        }
      }),

      new GraphWidget({
        title: 'TPS by World',
        height: 6,
        width: 12,

        left: MinecraftServer.worlds.map(dimension => {
          return new Metric({
            namespace: 'GameServers/Minecraft',
            metricName: 'TPS',
            dimensionsMap: {
              ServerName: this.service.serviceName,
              dimension: dimension
            }
          })
        }),

        leftYAxis: {
          min: 0,
          showUnits: false
        }
      }),

      new GraphWidget({
        title: 'Tick Time by World',
        height: 6,
        width: 12,

        left: MinecraftServer.worlds.map(dimension => {
          return new Metric({
            namespace: 'GameServers/Minecraft',
            metricName: 'Tick Time',
            dimensionsMap: {
              ServerName: this.service.serviceName,
              dimension: dimension
            }
          })
        }),

        leftYAxis: {
          min: 0,
          showUnits: true
        }
      })
    )
  }
}
