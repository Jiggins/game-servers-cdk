import { Construct } from '@aws-cdk/core'
import { Effect, PolicyStatement, Role, ServicePrincipal } from '@aws-cdk/aws-iam'
import { LogGroup, ILogGroup } from '@aws-cdk/aws-logs/lib'
import { IRepository } from '@aws-cdk/aws-ecr/lib'

interface CommonRoleProps {
  logGroup: ILogGroup
  repository?: IRepository
}

export class CommonRoles {
  static taskRole(scope: Construct, id: string): Role {
    const role = new Role(scope, 'TaskRole', {
      roleName: `${id}TaskRole`,
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

  static taskExecutionRole(scope: Construct, id: string, props: CommonRoleProps): Role {
    const role = new Role(scope, 'TaskExecutionRole', {
      roleName: `${id}TaskExecutionRole`,
      description: 'Read from ECR and write to CloudWatch logs',
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com')
    })

    // Write to CloudWatch logs
    role.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [
        props.logGroup.logGroupArn
      ]
    }))

    // Read from local ECR repository
    role.addToPolicy(new PolicyStatement({
      actions: [
        'ecr:BatchCheckLayerAvailability',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage'
      ],
      resources: [
        props.repository ? props.repository.repositoryArn : '*'
      ],
      effect: Effect.ALLOW
    }))

    // log into any ECR registry
    role.addToPolicy(new PolicyStatement({
      actions: [
        'ecr:GetAuthorizationToken'
      ],
      resources: [
        '*'
      ],
      effect: Effect.ALLOW
    }))

    return role
  }
}
