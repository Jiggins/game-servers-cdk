import * as elb from '@aws-cdk/aws-elasticloadbalancingv2'
import { LogGroup } from '@aws-cdk/aws-logs'
import { Repository } from '@aws-cdk/aws-ecr'
import { SubnetSelection } from '@aws-cdk/aws-ec2'
import {
  Cluster,
  ContainerImage,
  FargateService,
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

export interface MinecraftServerProps extends ServerProps {
  repository: Repository
}

export class MinecraftServer extends Server {
  readonly taskDefinition: FargateTaskDefinition
  readonly logGroup: LogGroup
  readonly cluster: Cluster
  readonly service: FargateService
  readonly loadBalancer: NetworkLoadBalancer
  targetGroup: NetworkTargetGroup

  readonly subnet: SubnetSelection

  constructor(scope: Construct, id: string, props: MinecraftServerProps) {
    super(scope, id, props)

    this.subnet = this.vpc.selectSubnets({
      subnetGroupName: 'GameServers'
    })

    this.taskDefinition = new FargateTaskDefinition(this, 'TaskDefinition', {
      family: id,

      cpu: 2048,
      memoryLimitMiB: 8192,

      executionRole: this.taskExecutionRole,
      taskRole: this.taskRole

    })

    const container = this.taskDefinition.addContainer('Container', {
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

    /** Minecraft server port */
    container.addPortMappings({
      containerPort: 25565,
      hostPort: 25565,
      // TODO: This should be UDP
      protocol: Protocol.TCP
    })

    /** TCP Health check */
    container.addPortMappings({
      containerPort: 8443,
      hostPort: 8443,
      protocol: Protocol.TCP
    })

    this.cluster = new Cluster(this, 'Cluster', {
      clusterName: id,
      vpc: this.vpc
    })

    this.service = new FargateService(this, 'FargateService', {
      serviceName: id,
      cluster: this.cluster,
      taskDefinition: this.taskDefinition,
      assignPublicIp: true,
      securityGroup: props.securityGroup,
      vpcSubnets: this.subnet,

      desiredCount: 0,

      // We do not want autscaling to spin up a second instance! That sounds
      // expensive
      maxHealthyPercent: 100,
      healthCheckGracePeriod: Duration.minutes(5)
    })

    this.loadBalancer = this.createLoadBalancer()
  }

  private createLoadBalancer() {
    const loadBalancer = new NetworkLoadBalancer(this, 'NLB', {
      loadBalancerName: 'Minecraft',
      vpc: this.vpc,
      vpcSubnets: this.subnet,
      internetFacing: true
    })

    const listener = loadBalancer.addListener('Listener', {
      port: 25565,
      protocol: elb.Protocol.UDP
    })

    this.targetGroup = listener.addTargets('ECSTarget', {
      targetGroupName: 'Minecraft',
      port: 25565,

      targets: [
        this.service
      ],

      healthCheck: {
        port: '8443'
      }
    })

    return loadBalancer
  }
}
