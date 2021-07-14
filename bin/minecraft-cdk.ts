#!/usr/bin/env node
import 'source-map-support/register'
import { App } from '@aws-cdk/core'
import { Protocol } from '@aws-cdk/aws-elasticloadbalancingv2'

import { CrewLinkServer } from '../lib/servers/crewlink'
import { GameServersBaseStack } from '../lib/gameServersBaseStack'
import { MinecraftServer } from '../lib/servers/minecraft'

const app = new App()
const baseStack = new GameServersBaseStack(app, 'GameServersBaseStack')

new MinecraftServer(app, 'Minecraft', {
  vpc: baseStack.vpc,
  fileSystem: baseStack.fileSystem,
  imageProps: {
    repository: baseStack.repository
  },

  containerProps: {
    cpu: 2048,
    memoryLimitMiB: 10240
  },

  networkProps: {
    port: 25565,
    healthCheckPort: 8443,
    protocol: Protocol.TCP
  },

  tags: {
    Name: 'Minecraft'
  }
})

new CrewLinkServer(app, 'CrewLink', {
  vpc: baseStack.vpc,
  imageProps: {
    repository: 'ottomated/crewlink-server'
  },

  networkProps: {
    port: 9736,
    protocol: Protocol.TCP
  },

  tags: {
    Name: 'CrewLink'
  }
})
