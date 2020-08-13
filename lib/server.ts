import { Construct, RemovalPolicy, Duration } from '@aws-cdk/core'
import { Repository } from '@aws-cdk/aws-ecr'
import { FargateService, Compatibility, Cluster, FargateTaskDefinition, ContainerImage, LogDrivers } from '@aws-cdk/aws-ecs'
import { Vpc, SecurityGroup, SubnetSelection } from '@aws-cdk/aws-ec2'
import { LogGroup, RetentionDays } from '@aws-cdk/aws-logs'

export interface ServerProps {
  vpc: Vpc
  securityGroup: SecurityGroup
  repository: Repository
}

export class Server extends Construct {
  readonly taskDefinition: FargateTaskDefinition
  readonly logGroup: LogGroup
  readonly cluster: Cluster
  readonly service: FargateService

  constructor (scope: Construct, id: string, props: ServerProps) {
    super(scope, id)

    this.logGroup = new LogGroup(this, 'LogGroups', {
      logGroupName: id,
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY
    })

    this.taskDefinition = new FargateTaskDefinition(this, 'TaskDefinition', {
      family: id
    })

    this.taskDefinition.addContainer('Container', {
      image: ContainerImage.fromEcrRepository(props.repository),
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
      vpcSubnets: props.vpc.selectSubnets(),
      securityGroup: props.securityGroup,

      // desiredCount is 0 since the task will be launched via a CloudWatch
      // event rule
      desiredCount: 0,

      // We do not want autscaling to spin up a second instance! That sounds
      // expensive
      maxHealthyPercent: 100
    })
  }
}
