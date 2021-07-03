import * as elb from '@aws-cdk/aws-elasticloadbalancingv2'
import { LogGroup } from '@aws-cdk/aws-logs'
import { Repository } from '@aws-cdk/aws-ecr'
import { Peer, Port, SubnetSelection } from '@aws-cdk/aws-ec2'
import { FileSystem } from '@aws-cdk/aws-efs'
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
import { PolicyStatement, Effect } from '@aws-cdk/aws-iam/lib'

export interface MincecraftServerProps extends ServerProps {
  fileSystem: FileSystem
}

export class MinecraftServer extends Server {
  readonly taskDefinition: FargateTaskDefinition
  readonly logGroup: LogGroup
  readonly cluster: Cluster
  readonly service: FargateService
  readonly loadBalancer: NetworkLoadBalancer
  targetGroup: NetworkTargetGroup

  readonly subnet: SubnetSelection

  readonly port: number
  readonly healthCheckPort: number

  constructor(scope: Construct, id: string, props: MincecraftServerProps) {
    super(scope, id, props)

    this.port = 25565
    this.healthCheckPort = 8443

    this.subnet = this.vpc.selectSubnets({
      subnetGroupName: 'GameServers'
    })

    props.securityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.tcp(this.port),
      `Ingress on port ${this.port} for Minecraft`
    )

    props.securityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.tcp(this.healthCheckPort),
      `Ingress on port ${this.healthCheckPort} for Minecraft Health Check`
    )

    props.securityGroup.connections.allowTo(props.fileSystem, Port.tcp(2049))

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

    this.taskDefinition = new FargateTaskDefinition(this, 'TaskDefinition', {
      family: id,

      cpu: 2048,
      memoryLimitMiB: 8192,

      executionRole: this.taskExecutionRole,
      taskRole: this.taskRole

    })

    this.taskDefinition.addVolume({
      name: id,
      efsVolumeConfiguration: {
        fileSystemId: props.fileSystem.fileSystemId
      }
    })

    const container = this.taskDefinition.addContainer('Container', {
      image: ContainerImage.fromEcrRepository(Repository.fromRepositoryName(this, 'repository', 'minecraft')),

      healthCheck: {
        command: ['CMD-SHELL', `curl -f http://localhost:${this.healthCheckPort}`],
        startPeriod: Duration.minutes(5)
      },

      logging: LogDrivers.awsLogs({
        streamPrefix: 'minecraft',
        logGroup: this.logGroup
      })
    })

    /** Minecraft server port */
    container.addPortMappings({
      containerPort: this.port,
      hostPort: this.port,
      protocol: Protocol.TCP
    })

    /** TCP Health check */
    container.addPortMappings({
      containerPort: this.healthCheckPort,
      hostPort: this.healthCheckPort,
      protocol: Protocol.TCP
    })

    container.addMountPoints({
      sourceVolume: 'Minecraft',
      containerPath: '/mnt/minecraft',
      readOnly: false
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

      desiredCount: 1,

      // We do not want autscaling to spin up a second instance! That sounds expensive
      maxHealthyPercent: 100
    })
  }

  private createLoadBalancer() {
    const loadBalancer = new NetworkLoadBalancer(this, 'NLB', {
      loadBalancerName: 'Minecraft',
      vpc: this.vpc,
      vpcSubnets: this.subnet,
      internetFacing: true
    })

    const listener = loadBalancer.addListener('Listener', {
      port: 8443,
      protocol: elb.Protocol.TCP
    })

    this.targetGroup = listener.addTargets('ECSTarget', {
      targetGroupName: 'Minecraft',
      port: 8443,

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
