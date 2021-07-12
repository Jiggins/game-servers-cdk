import {
  Construct,
  RemovalPolicy,
  Stack,
  StackProps
} from '@aws-cdk/core'
import {
  Cluster,
  ContainerImage,
  FargatePlatformVersion,
  FargateService,
  FargateTaskDefinition,
  FargateTaskDefinitionProps
} from '@aws-cdk/aws-ecs'
import {
  NetworkLoadBalancer,
  NetworkTargetGroup
} from '@aws-cdk/aws-elasticloadbalancingv2'
import { Dashboard } from '@aws-cdk/aws-cloudwatch'
import { Peer, Port, SecurityGroup, SubnetSelection, Vpc } from '@aws-cdk/aws-ec2'
import { IRepository, Repository } from '@aws-cdk/aws-ecr'
import { LogGroup, RetentionDays } from '@aws-cdk/aws-logs'
import { Role } from '@aws-cdk/aws-iam'

import * as elb from '@aws-cdk/aws-elasticloadbalancingv2'

import { CommonRoles } from './commonRoles'

type ContainerProps = Pick<FargateTaskDefinitionProps, 'cpu' | 'memoryLimitMiB'>

interface ImageProps {
  repository: IRepository | string
  tag?: string
}

interface NetworkProps {
  readonly port: number
  readonly healthCheckPort?: number
  readonly protocol: elb.Protocol
  readonly createLoadBalancer?: boolean
}

export interface ServerProps extends StackProps {
  readonly vpc: Vpc
  readonly imageProps: ImageProps
  readonly containerProps?: ContainerProps
  readonly networkProps: NetworkProps
}

export class Server extends Stack {
  readonly healthCheckPort: number

  readonly vpc: Vpc
  readonly subnet: SubnetSelection
  readonly securityGroup: SecurityGroup

  readonly logGroup: LogGroup
  readonly taskRole: Role
  readonly taskExecutionRole: Role

  readonly cluster: Cluster
  readonly service: FargateService
  readonly taskDefinition: FargateTaskDefinition

  readonly targetGroup?: NetworkTargetGroup
  readonly dashboard: Dashboard

  constructor(scope: Construct, id: string, props: ServerProps) {
    super(scope, id)

    this.vpc = props.vpc

    this.subnet = this.vpc.selectSubnets({
      subnetGroupName: 'GameServers'
    })

    this.securityGroup = this.createSecurityGroup(id, props)

    this.logGroup = new LogGroup(this, 'LogGroup', {
      logGroupName: this.stackName,
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY
    })

    this.taskRole = CommonRoles.taskRole(this, id)
    this.taskExecutionRole = CommonRoles.taskExecutionRole(this, id, {
      logGroup: this.logGroup,
      repository: props.imageProps.repository instanceof Repository ? props.imageProps.repository : undefined
    })

    this.cluster = this.createCluster(id, props)
    this.taskDefinition = this.createTaskDefinition(id, props)
    this.service = this.createService(id, this.cluster, this.taskDefinition, this.subnet, this.securityGroup)

    if (props.networkProps.createLoadBalancer) {
      this.createLoadBalancer(id, this.vpc, this.subnet, this.service, props)
    }

    this.dashboard = this.createDashboard(id)
  }

  protected createSecurityGroup(id: string, props: ServerProps): SecurityGroup {
    const securityGroup = new SecurityGroup(this, 'SecurityGroup', {
      securityGroupName: id,
      description: `${id} Security Group`,
      allowAllOutbound: false,
      vpc: this.vpc
    })

    securityGroup.addEgressRule(
      Peer.anyIpv4(),
      Port.tcp(443),
      'Allow outbound HTTPS traffic'
    )

    securityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.tcp(props.networkProps.port),
      `Ingress on port ${props.networkProps.port} for ${id}`
    )

    if (props.networkProps.healthCheckPort) {
      securityGroup.addIngressRule(
        Peer.anyIpv4(),
        Port.tcp(props.networkProps.healthCheckPort),
        `Ingress on port ${props.networkProps.healthCheckPort} for ${id} Health Check`
      )
    }

    return securityGroup
  }

  protected createCluster(id: string, props: ServerProps): Cluster {
    return new Cluster(this, 'Cluster', {
      clusterName: id,
      vpc: props.vpc
    })
  }

  protected createService(id: string, cluster: Cluster, taskDefinition: FargateTaskDefinition, subnet: SubnetSelection, securityGroup: SecurityGroup): FargateService {
    return new FargateService(this, 'FargateService', {
      serviceName: id,
      cluster: cluster,
      taskDefinition: taskDefinition,
      assignPublicIp: true,
      securityGroup: securityGroup,
      platformVersion: FargatePlatformVersion.VERSION1_4,
      vpcSubnets: subnet,

      desiredCount: 1,

      // We do not want autscaling to spin up a second instance! That sounds expensive
      maxHealthyPercent: 100
    })
  }

  protected createTaskDefinition(id: string, props: ServerProps): FargateTaskDefinition {
    return new FargateTaskDefinition(this, 'TaskDefinition', {
      family: id,

      executionRole: this.taskExecutionRole,
      taskRole: this.taskRole,

      ...props.containerProps
    })
  }

  protected containerImage(imageProps: ImageProps): ContainerImage {
    if (typeof imageProps.repository === 'string') {
      return ContainerImage.fromRegistry(imageProps.repository)
    }

    return ContainerImage.fromEcrRepository(imageProps.repository, imageProps.tag)
  }

  protected createLoadBalancer(
    id: string,
    vpc: Vpc,
    subnet: SubnetSelection,
    service: FargateService,
    props: ServerProps
  ): NetworkLoadBalancer {
    const loadBalancer = new NetworkLoadBalancer(this, 'NLB', {
      loadBalancerName: id,
      vpc: vpc,
      vpcSubnets: subnet,
      internetFacing: true
    })

    const listener = loadBalancer.addListener('Listener', {
      port: props.networkProps.port,
      protocol: props.networkProps.protocol
    })

    listener.addTargets('ECSTarget', {
      targetGroupName: id,
      port: props.networkProps.port,

      targets: [
        service
      ]
    })

    return loadBalancer
  }

  protected createDashboard(name: string): Dashboard {
    return new Dashboard(this, 'Dashboard', {
      dashboardName: name
    })
  }
}
