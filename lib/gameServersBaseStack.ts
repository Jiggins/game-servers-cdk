import { Construct } from 'constructs'
import { CfnOutput, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib'
import { Repository } from 'aws-cdk-lib/aws-ecr'
import { SecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2'
import { FileSystem, LifecyclePolicy } from 'aws-cdk-lib/aws-efs'

import { Networking } from './networking'

export class GameServersBaseStack extends Stack {
  readonly repository: Repository
  readonly vpc: Vpc
  readonly securityGroup: SecurityGroup
  readonly fileSystem: FileSystem

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const repository = new Repository(this, 'MinecraftRepository', {
      repositoryName: 'minecraft',
      imageScanOnPush: true,
      removalPolicy: RemovalPolicy.DESTROY
    })

    const network = new Networking(this, 'MinecraftNetwork')
    this.vpc = network.vpc
    this.securityGroup = network.securityGroup

    this.fileSystem = this.createEfsVolume('Minecraft')

    new CfnOutput(this, 'RepositoryUri', {
      description: 'ECR repository URI',
      value: repository.repositoryUri
    })
  }

  createEfsVolume(name: string): FileSystem {
    const securityGroup = new SecurityGroup(this, `${name}EfsSecurityGroup`, {
      securityGroupName: `${name} EFS`,
      description: `Allow access to the ${name} EFS volume`,
      allowAllOutbound: false,
      vpc: this.vpc
    })

    const filesystem = new FileSystem(this, name, {
      fileSystemName: name,
      vpc: this.vpc,
      securityGroup: securityGroup,

      encrypted: true,
      enableAutomaticBackups: true,

      // https://aws.amazon.com/efs/features/infrequent-access/?&trk=el_a131L0000057zi2QAA&trkCampaign=CSI_Q2_2019_Storage_BizApps_EFS-IA_LP&sc_channel=el&sc_campaign=CSI_08_2019_Storage_EFS_Console&sc_outcome=CSI_Digital_Marketing
      lifecyclePolicy: LifecyclePolicy.AFTER_30_DAYS,
      removalPolicy: RemovalPolicy.SNAPSHOT
    })

    filesystem.addAccessPoint(`${name}AccessPoint`)

    return filesystem
  }
}
