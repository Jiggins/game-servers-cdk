import { Construct } from '@aws-cdk/core'
import { Vpc, SubnetType, SecurityGroup, Peer, Port } from '@aws-cdk/aws-ec2'

export class Networking extends Construct {
  readonly vpc: Vpc
  readonly securityGroup: SecurityGroup

  constructor (scope: Construct, id: string) {
    super(scope, id)

    this.vpc = new Vpc(this, 'VPC', {
      cidr: '10.0.1.0/27',
      maxAzs: 1,
      subnetConfiguration: [
        {
          cidrMask: 28,
          name: 'Minecraft',
          subnetType: SubnetType.PUBLIC
        }
      ]
    })

    this.securityGroup = new SecurityGroup(this, 'ExternalAccess', {
      description: 'Allow inbound traffic on 25565',
      vpc: this.vpc,
      allowAllOutbound: false
    })

    this.securityGroup.addIngressRule(Peer.anyIpv4(), Port.udp(25565))
  }
}
