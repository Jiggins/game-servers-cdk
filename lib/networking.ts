import { Construct } from '@aws-cdk/core'
import {
  GatewayVpcEndpointAwsService,
  InterfaceVpcEndpointAwsService,
  Peer,
  Port,
  SecurityGroup,
  SubnetType,
  Vpc
} from '@aws-cdk/aws-ec2'

export class Networking extends Construct {
  readonly vpc: Vpc
  readonly securityGroup: SecurityGroup

  constructor(scope: Construct, id: string) {
    super(scope, id)

    this.vpc = new Vpc(this, 'VPC', {
      cidr: '10.0.1.0/24',
      maxAzs: 1,
      enableDnsHostnames: true,
      enableDnsSupport: true,

      subnetConfiguration: [
        {
          cidrMask: 28,
          name: 'GameServers',
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

    this.securityGroup.addEgressRule(
      Peer.anyIpv4(),
      Port.tcp(443),
      'Allow outbound HTTPS traffic'
    )
  }
}
