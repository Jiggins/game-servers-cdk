import { Repository } from '@aws-cdk/aws-ecr'
import {
  Construct,
  RemovalPolicy,
  Stack,
  StackProps
} from '@aws-cdk/core'
import {
  Effect,
  PolicyStatement,
  Role,
  ServicePrincipal
} from '@aws-cdk/aws-iam'
import { LogGroup, RetentionDays } from '@aws-cdk/aws-logs/lib'
import { SecurityGroup, Vpc } from '@aws-cdk/aws-ec2'

export interface ServerProps extends StackProps {
  vpc: Vpc
  securityGroup: SecurityGroup
  repository?: Repository
}

export abstract class Server extends Stack {
  readonly logGroup: LogGroup
  readonly taskRole: Role
  readonly taskExecutionRole: Role
  readonly vpc: Vpc

  constructor(scope: Construct, id: string, props: ServerProps) {
    super(scope, id)

    this.vpc = props.vpc

    this.logGroup = new LogGroup(this, 'LogGroup', {
      logGroupName: this.stackName,
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY
    })

    this.taskRole = this.createTaskRole()
    this.taskExecutionRole = this.createTaskExecutionRole(props)
  }

  private createTaskRole(): Role {
    const role = new Role(this, 'TaskRole', {
      roleName: 'GameServerTaskRole',
      description: 'Write CloudWatch metrics',
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com')
    })

    // Write to CloudWatch metrics
    role.addToPolicy(new PolicyStatement({
      actions: [
        'cloudwatch:PutMetricData'
      ],
      resources: [
        '*'
      ],
      effect: Effect.ALLOW
    }))

    return role
  }

  private createTaskExecutionRole(props: ServerProps): Role {
    const role = new Role(this, 'TaskExecutionRole', {
      roleName: 'GameServerTaskExecutionRole',
      description: 'Read from ECR and write to CloudWatch logs',
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com')
    })

    // Write to CloudWatch logs
    role.addToPolicy(new PolicyStatement({
      actions: [
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [
        this.logGroup.logGroupArn
      ],
      effect: Effect.ALLOW
    }))

    if (props.repository) {
      // Read from local ECR repository
      role.addToPolicy(new PolicyStatement({
        actions: [
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage'
        ],
        resources: [
          props.repository.repositoryArn
        ],
        effect: Effect.ALLOW
      }))

      // log into any ECR repository
      role.addToPolicy(new PolicyStatement({
        actions: [
          'ecr:GetAuthorizationToken'
        ],
        resources: [
          '*'
        ],
        effect: Effect.ALLOW
      }))
    }

    return role
  }
}
