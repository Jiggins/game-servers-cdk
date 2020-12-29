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
          name: 'Endpoint',
          subnetType: SubnetType.PRIVATE
        },

        {
          cidrMask: 28,
          name: 'GameServers',
          subnetType: SubnetType.PUBLIC
        }
      ]
    })

    const endpointSubnet = this.vpc.selectSubnets({
      subnetGroupName: 'Endpoint'
    })

    this.securityGroup = new SecurityGroup(this, 'ExternalAccess', {
      description: 'Allow inbound traffic on 25565',
      vpc: this.vpc,
      allowAllOutbound: false
    })

    this.securityGroup.addIngressRule(Peer.anyIpv4(), Port.udp(25565))

    this.securityGroup.addIngressRule(
      Peer.ipv4(endpointSubnet.subnets[0].ipv4CidrBlock),
      Port.tcp(443),
      'Allow HTTPS traffic to the endpoint subnet'
    )

    endpointSubnet.subnets.map((subnet) => {
      this.securityGroup.addEgressRule(
        Peer.ipv4(subnet.ipv4CidrBlock),
        Port.tcp(443),
        'Allow HTTPS traffic to the endpoint subnet'
      )
    })

    this.createVpcEndpoints()
  }

  private createVpcEndpoints(): void {
    const endpointSecurityGroup = new SecurityGroup(this, 'EndpointSecurityGroup', {
      securityGroupName: 'Endpoint Security Group',
      description: 'Allow HTTPS to the Endpoint Subnet',

      // TODO: limit egress rules to only the vpc
      vpc: this.vpc,
      allowAllOutbound: true
    })

    endpointSecurityGroup.addIngressRule(
      Peer.ipv4(this.vpc.vpcCidrBlock),
      Port.tcp(443)
    )

    const interfaceEndpoints = [
      InterfaceVpcEndpointAwsService.CLOUDWATCH,
      InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      InterfaceVpcEndpointAwsService.ECR,
      InterfaceVpcEndpointAwsService.ECR_DOCKER,
      InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      InterfaceVpcEndpointAwsService.SSM
    ]

    interfaceEndpoints.forEach((service, index) => {
      this.vpc.addInterfaceEndpoint(`Endpoint${index}`, {
        service: service,
        subnets: { subnetType: SubnetType.PRIVATE },
        securityGroups: [endpointSecurityGroup]
      })
    })

    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: GatewayVpcEndpointAwsService.S3,
      subnets: [
        { subnetType: SubnetType.PRIVATE }
      ]
    })
  }
}
