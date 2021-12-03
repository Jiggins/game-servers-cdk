#!/usr/bin/env node

import 'source-map-support/register'

import { App } from 'aws-cdk-lib'

import { CrewLinkServer } from '../lib/servers/crewlink'
import { GameServersBaseStack } from '../lib/gameServersBaseStack'
import { MinecraftServer } from '../lib/servers/minecraft'
import { Protocol } from '../lib/util/types'
import { ValheimServer } from '../lib/servers/valheim'

const app = new App()
const baseStack = new GameServersBaseStack(app, 'GameServersBaseStack')

const valheimVolume = baseStack.createEfsVolume('Valheim')

new MinecraftServer(app, 'Minecraft', {
  vpc: baseStack.vpc,
  fileSystem: baseStack.fileSystem,
  environmentFile: 'etc/minecraft.env',
  imageProps: {
    repository: baseStack.repository
  },

  taskDefinitionProps: {
    cpu: 4096,
    memoryLimitMiB: 10240
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
