import * as elb from '@aws-cdk/aws-elasticloadbalancingv2'
import { Construct, Tags } from '@aws-cdk/core'
import { LogGroup } from '@aws-cdk/aws-logs'
import {
  Cluster,
  ContainerImage,
  FargatePlatformVersion,
  FargateService,
  FargateTaskDefinition,
  LogDrivers,
  Protocol
} from '@aws-cdk/aws-ecs'
import {
  NetworkLoadBalancer,
  NetworkTargetGroup
} from '@aws-cdk/aws-elasticloadbalancingv2'
import {
  Peer,
  Port,
  SubnetSelection,
  SubnetType
} from '@aws-cdk/aws-ec2'

import { Server, ServerProps } from '../server'

export class CrewLinkServer extends Server {
  readonly taskDefinition: FargateTaskDefinition
  readonly logGroup: LogGroup
  readonly cluster: Cluster
  readonly service: FargateService

  readonly subnet: SubnetSelection

  static readonly port = 9736
  targetGroup: NetworkTargetGroup

  constructor(scope: Construct, id: string, props: ServerProps) {
    super(scope, id, props)

    Tags.of(this).add('Name', 'CrewLink')

    this.subnet = this.vpc.selectSubnets({
      subnetGroupName: 'GameServers'
    })

    props.securityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.tcp(CrewLinkServer.port),
      `Allow HTTP Ingress for CrewLink on port ${CrewLinkServer.port}`
    )

    this.taskDefinition = new FargateTaskDefinition(this, 'TaskDefinition', {
      family: id
    })

    const container = this.taskDefinition.addContainer('Container', {
      image: ContainerImage.fromRegistry('ottomated/crewlink-server'),

      logging: LogDrivers.awsLogs({
        streamPrefix: id,
        logGroup: this.logGroup
      }),

      environment: {
        ADDRESS: '0.0.0.0'
      },

      healthCheck: {
        command: ['CMD-SHELL', `curl --fail http://localhost:${CrewLinkServer.port}`]
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

      desiredCount: 1,

      // We do not want autscaling to spin up a second instance! That sounds
      // expensive
      maxHealthyPercent: 100
    })

    this.createLoadBalancer()
  }

  private createLoadBalancer() {
    const loadBalancer = new NetworkLoadBalancer(this, 'NLB', {
      loadBalancerName: 'CrewLink',
      vpc: this.vpc,
      vpcSubnets: this.subnet,
      internetFacing: true
    })

    const listener = loadBalancer.addListener('Listener', {
      port: CrewLinkServer.port,
      protocol: elb.Protocol.TCP
    })

    this.targetGroup = listener.addTargets('ECSTarget', {
      targetGroupName: 'CrewLink',
      port: CrewLinkServer.port,

      targets: [
        this.service
      ]
    })

    return loadBalancer
  }
}
