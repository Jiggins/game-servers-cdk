import { Construct } from 'constructs'
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam'
import { ILogGroup } from 'aws-cdk-lib/aws-logs'
import { IRepository } from 'aws-cdk-lib/aws-ecr'

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

    role.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'kms:Decrypt',
        'secretsmanager:GetSecretValue',
        'ssm:GetParameters'
      ],
      resources: ['*']
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
