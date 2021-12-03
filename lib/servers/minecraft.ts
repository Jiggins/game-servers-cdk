import { Construct, Duration } from '@aws-cdk/core'
import { ContainerDefinitionOptions, ContainerImage, EnvironmentFile, LogDrivers } from '@aws-cdk/aws-ecs'
import { GraphWidget, Metric, Dashboard } from '@aws-cdk/aws-cloudwatch'
import { PolicyStatement, Effect } from '@aws-cdk/aws-iam'
import { Repository } from '@aws-cdk/aws-ecr'

import { Server, ServerProps } from '../server'
import { Protocol } from '../util/types'

type RequiredServerProps = Omit<ServerProps, 'networkProps'>

export interface MincecraftServerProps extends RequiredServerProps {
  environmentFile: string
}

export class MinecraftServer extends Server {
  static readonly healthCheckPort = 8443

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

  constructor(scope: Construct, id: string, props: MincecraftServerProps) {
    super(scope, id, {
      networkProps: {
        port: 25565,
        protocol: Protocol.TCP,
        healthCheck: {
          healthCheckPort: 8443,
          protocol: Protocol.TCP
        }
      },

      ...props
    })

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

  protected containerDefinition(props: ServerProps): ContainerDefinitionOptions {
    return {
      image: ContainerImage.fromEcrRepository(Repository.fromRepositoryName(this, 'repository', 'minecraft')),

      healthCheck: {
        command: ['CMD-SHELL', `curl -f http://localhost:${MinecraftServer.healthCheckPort}`],
        startPeriod: Duration.minutes(5)
      },

      environmentFiles: [
        EnvironmentFile.fromAsset(props.environmentFile!)
      ],

      logging: LogDrivers.awsLogs({
        streamPrefix: 'minecraft',
        logGroup: this.logGroup
      }),

      ...props.containerDefinitionProps
    }
  }

  protected addMetrics(dashboard: Dashboard): void {
    dashboard.addWidgets(
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
