import { Construct } from 'constructs'
import { Duration, Tags } from 'aws-cdk-lib'
import { LogGroup } from 'aws-cdk-lib/aws-logs'
import { Peer, Port, SubnetSelection } from 'aws-cdk-lib/aws-ec2'
import {
  Cluster,
  FargateService,
  FargateTaskDefinition,
  Protocol
} from 'aws-cdk-lib/aws-ecs'

import { Server, ServerProps } from '../server'

type RequiredServerProps = Omit<ServerProps, 'imageProps' | 'networkProps'>

interface ValheimServerProps extends RequiredServerProps {
  /** Environment variables used by the Valheim image */
  valheimEnvironment: {
    /** SERVER_NAME - Name that will be shown in the server browser */
    serverName: string,

    /** WORLD_NAME - Name of the world without .db/.fwl file extension */
    worldName: string,

    /** SERVER_PASS - Password for logging into the server - min. 5 characters! */
    serverPass: string,

    /** SERVER_PUBLIC - Whether the server should be listed in the server browser (true) or not (false) */
    serverPublic?: boolean
  }
}

export class ValheimServer extends Server {
  readonly taskDefinition: FargateTaskDefinition
  readonly logGroup: LogGroup
  readonly cluster: Cluster
  readonly service: FargateService

  readonly subnet: SubnetSelection

  constructor(scope: Construct, id: string, props: ValheimServerProps) {
    super(scope, id, {
      imageProps: {
        repository: 'lloesche/valheim-server'
      },

      networkProps: {
        port: 2456,
        protocol: Protocol.UDP,
        healthCheck: {
          healthCheckPort: 80,
          protocol: Protocol.TCP
        }
      },

      containerDefinitionProps: {
        stopTimeout: Duration.seconds(120),

        healthCheck: {
          command: ['CMD-SHELL', 'curl -f http://localhost/status.json'],
          interval: Duration.minutes(1)
        },

        environment: {
          SERVER_NAME: props.valheimEnvironment.serverName,
          WORLD_NAME: props.valheimEnvironment.worldName,
          SERVER_PASS: props.valheimEnvironment.serverPass,
          SERVER_PUBLIC: 'true',
          STATUS_HTTP: 'true'
        }
      },

      ...props
    })

    Tags.of(this).add('Name', 'Valheim')

    this.subnet = this.vpc.selectSubnets({
      subnetGroupName: 'GameServers'
    })

    this.container.addMountPoints({
      sourceVolume: id,
      containerPath: '/config',
      readOnly: false
    })

    this.container.addMountPoints({
      sourceVolume: id,
      containerPath: '/opt/valheim',
      readOnly: false
    })

    this.securityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.udpRange(2456, 2457),
      'Valheim needs these extra ports for some reason'
    )

    this.securityGroup.addEgressRule(
      Peer.anyIpv4(),
      Port.tcp(80),
      'Valheim needs to download files from Steam during container startup'
    )
  }
}
