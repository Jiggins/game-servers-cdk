import { Construct } from 'constructs'
import {
  Duration,
  RemovalPolicy,
  Stack,
  StackProps
} from 'aws-cdk-lib'
import {
  Cluster,
  ContainerDefinition,
  ContainerDefinitionOptions,
  ContainerImage,
  EnvironmentFileConfig,
  FargatePlatformVersion,
  FargateService,
  FargateTaskDefinition,
  FargateTaskDefinitionProps,
  LogDrivers
} from 'aws-cdk-lib/aws-ecs'
import { Dashboard, GraphWidget, Metric } from 'aws-cdk-lib/aws-cloudwatch'
import { FileSystem } from 'aws-cdk-lib/aws-efs'
import { IRepository, Repository } from 'aws-cdk-lib/aws-ecr'
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs'
import { NetworkLoadBalancer, NetworkTargetGroup } from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import { Peer, Port, SecurityGroup, SubnetSelection, Vpc } from 'aws-cdk-lib/aws-ec2'
import { Role } from 'aws-cdk-lib/aws-iam'

import { CommonRoles } from './commonRoles'
import { Protocol, UnifiedProtocol } from './util/types'

import { Iam } from './util/iam'

type TaskDefinitionProps = Pick<FargateTaskDefinitionProps, 'cpu' | 'memoryLimitMiB'>

interface ImageProps {
  repository: IRepository | string
  tag?: string
}

interface HealthCheckProps {
  healthCheckPort: number
  protocol: Protocol
}

interface NetworkProps {
  readonly port: number
  readonly protocol: Protocol
  readonly healthCheck?: HealthCheckProps
  readonly createLoadBalancer?: boolean
}

export interface ServerProps extends StackProps {
  readonly vpc: Vpc
  readonly imageProps: ImageProps
  readonly networkProps: NetworkProps
  readonly taskDefinitionProps?: TaskDefinitionProps
  readonly environmentFile?: string
  readonly containerDefinitionProps?: Omit<ContainerDefinitionOptions, 'image'>
  readonly fileSystem?: FileSystem
}

export class Server extends Stack {
  readonly serverName: string

  readonly vpc: Vpc
  readonly subnet: SubnetSelection
  readonly securityGroup: SecurityGroup

  readonly logGroup: LogGroup
  readonly taskRole: Role
  readonly taskExecutionRole: Role

  readonly cluster: Cluster
  readonly service: FargateService
  readonly container: ContainerDefinition
  readonly taskDefinition: FargateTaskDefinition

  readonly targetGroup?: NetworkTargetGroup
  readonly dashboard: Dashboard

  constructor(scope: Construct, id: string, props: ServerProps) {
    super(scope, id)

    this.serverName = id
    this.vpc = props.vpc

    this.subnet = this.vpc.selectSubnets({
      subnetGroupName: 'GameServers'
    })

    this.securityGroup = this.createSecurityGroup(props)

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

    this.cluster = this.createCluster(props)

    this.taskDefinition = this.createTaskDefinition(props)
    this.container = this.taskDefinition.addContainer(id, this.containerDefinition(props))
    this.container.addPortMappings({
      containerPort: props.networkProps.port,
      hostPort: props.networkProps.port,
      protocol: props.networkProps.protocol
    })

    if (props.fileSystem) {
      this.addContainerEfsVolume(this.taskDefinition, props.fileSystem)
    }

    if (props.networkProps.healthCheck) {
      this.addHealthCheck(this.container, props.networkProps.healthCheck)
    }

    this.addContainerMountPoints(id, this.container)

    if (this.container.environmentFiles) {
      this.addAccessToEnvironmentFiles(this.container.environmentFiles)
    }

    this.service = this.createService(this.cluster, this.taskDefinition, this.subnet, this.securityGroup)

    if (props.networkProps.createLoadBalancer) {
      this.createLoadBalancer(this.vpc, this.subnet, this.service, props)
    }

    this.dashboard = this.createDashboard(this.serverName)
    this.addMetrics(this.dashboard)
  }

  protected createSecurityGroup(props: ServerProps): SecurityGroup {
    const securityGroup = new SecurityGroup(this, 'SecurityGroup', {
      securityGroupName: this.serverName,
      description: `${this.serverName} Security Group`,
      allowAllOutbound: false,
      vpc: this.vpc
    })

    securityGroup.addEgressRule(
      Peer.anyIpv4(),
      Port.tcp(443),
      'Allow outbound HTTPS traffic'
    )

    if (props.networkProps.protocol === Protocol.TCP) {
      securityGroup.addIngressRule(
        Peer.anyIpv4(),
        Port.tcp(props.networkProps.port),
        `Ingress on port ${props.networkProps.port} for ${this.serverName}`
      )
    } else {
      securityGroup.addIngressRule(
        Peer.anyIpv4(),
        Port.udp(props.networkProps.port),
        `Ingress on port ${props.networkProps.port} for ${this.serverName}`
      )
    }

    if (props.networkProps.healthCheck) {
      securityGroup.addIngressRule(
        Peer.anyIpv4(),
        Port.tcp(props.networkProps.healthCheck.healthCheckPort),
        `Ingress on port ${props.networkProps.healthCheck.healthCheckPort} for ${this.serverName} Health Check`
      )
    }

    if (props.fileSystem) {
      securityGroup.connections.allowTo(props.fileSystem, Port.tcp(2049))
    }

    return securityGroup
  }

  protected createCluster(props: ServerProps): Cluster {
    return new Cluster(this, 'Cluster', {
      clusterName: this.serverName,
      vpc: props.vpc
    })
  }

  protected createService(cluster: Cluster, taskDefinition: FargateTaskDefinition, subnet: SubnetSelection, securityGroup: SecurityGroup): FargateService {
    return new FargateService(this, 'FargateService', {
      serviceName: this.serverName,
      cluster: cluster,
      taskDefinition: taskDefinition,
      assignPublicIp: true,
      securityGroups: [securityGroup],
      platformVersion: FargatePlatformVersion.VERSION1_4,
      vpcSubnets: subnet,

      circuitBreaker: {
        rollback: true
      },

      desiredCount: 1,

      // We do not want autscaling to spin up a second instance! That sounds expensive
      maxHealthyPercent: 100
    })
  }

  protected createTaskDefinition(props: ServerProps): FargateTaskDefinition {
    return new FargateTaskDefinition(this, 'TaskDefinition', {
      family: this.serverName,

      executionRole: this.taskExecutionRole,
      taskRole: this.taskRole,

      ...props.taskDefinitionProps
    })
  }

  protected containerDefinition(props: ServerProps): ContainerDefinitionOptions {
    return {
      containerName: this.serverName,
      image: this.containerImage(props.imageProps),
      essential: true,

      logging: LogDrivers.awsLogs({
        streamPrefix: this.serverName,
        logGroup: this.logGroup
      }),

      ...props.containerDefinitionProps
    }
  }

  protected containerImage(imageProps: ImageProps): ContainerImage {
    if (typeof imageProps.repository === 'string') {
      return ContainerImage.fromRegistry(imageProps.repository)
    }

    return ContainerImage.fromEcrRepository(imageProps.repository, imageProps.tag)
  }

  protected addContainerEfsVolume(taskDefinition: FargateTaskDefinition, fileSystem: FileSystem) {
    return taskDefinition.addVolume({
      name: this.serverName,
      efsVolumeConfiguration: {
        fileSystemId: fileSystem.fileSystemId
      }
    })
  }

  /** Health check */
  protected addHealthCheck(container: ContainerDefinition, props: HealthCheckProps) {
    container.addPortMappings({
      containerPort: props.healthCheckPort,
      hostPort: props.healthCheckPort,
      protocol: props.protocol
    })
  }

  protected addContainerMountPoints(volumeName: string, container: ContainerDefinition) {
    return container.addMountPoints({
      sourceVolume: volumeName,
      containerPath: `/mnt/${volumeName.toLowerCase()}`,
      readOnly: false
    })
  }

  protected addAccessToEnvironmentFiles(envConfigs: EnvironmentFileConfig[]) {
    envConfigs.forEach((file: EnvironmentFileConfig) => {
      Iam.createS3FileAccessPolicy(file.s3Location).forEach(statement => {
        this.taskExecutionRole.addToPolicy(statement)
      })
    })
  }

  protected createLoadBalancer(
    vpc: Vpc,
    subnet: SubnetSelection,
    service: FargateService,
    props: ServerProps
  ): NetworkLoadBalancer {
    const loadBalancer = new NetworkLoadBalancer(this, 'NLB', {
      loadBalancerName: this.serverName,
      vpc: vpc,
      vpcSubnets: subnet,
      internetFacing: true
    })

    const listener = loadBalancer.addListener('Listener', {
      port: props.networkProps.port,
      protocol: UnifiedProtocol.toElbProtocol(props.networkProps.protocol)
    })

    listener.addTargets('ECSTarget', {
      targetGroupName: this.serverName,
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

  protected addMetrics(dashboard: Dashboard): void {
    dashboard.addWidgets(
      new GraphWidget({
        title: 'CPU & Memory',

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
        }
      })
    )
  }
}
