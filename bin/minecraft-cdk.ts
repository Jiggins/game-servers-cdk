#!/usr/bin/env node
import 'source-map-support/register'
import { App } from '@aws-cdk/core'

import { CrewLinkServer } from '../lib/servers/crewlink'
import { GameServersBaseStack } from '../lib/gameServersBaseStack'
import { MinecraftServer } from '../lib/servers/minecraft'

const app = new App()
const baseStack = new GameServersBaseStack(app, 'GameServersBaseStack')

new MinecraftServer(app, 'Minecraft', {
  vpc: baseStack.vpc,
  securityGroup: baseStack.securityGroup,
  repository: baseStack.repository,

  tags: {
    Name: 'Minecraft'
  }
})

new CrewLinkServer(app, 'CrewLink', {
  vpc: baseStack.vpc,
  securityGroup: baseStack.securityGroup,

  tags: {
    Name: 'CrewLink'
  }
})
