import {
  Construct,
  RemovalPolicy,
  Stack,
  StackProps
} from '@aws-cdk/core'
import { IRepository } from '@aws-cdk/aws-ecr'
import { Role } from '@aws-cdk/aws-iam'
import { LogGroup, RetentionDays } from '@aws-cdk/aws-logs/lib'
import { SecurityGroup, Vpc } from '@aws-cdk/aws-ec2'

import { CommonRoles } from './commonRoles'

export interface ServerProps extends StackProps {
  vpc: Vpc
  securityGroup: SecurityGroup
  repository: IRepository
}

export class Server extends Stack {
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

    this.taskRole = CommonRoles.taskRole(this, id)
    this.taskExecutionRole = CommonRoles.taskExecutionRole(this, id, {
      logGroup: this.logGroup,
      repository: props.repository
    })
  }
}
