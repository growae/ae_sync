#!/usr/bin/env node
import 'dotenv/config'
import { createRequire } from 'node:module'
import { Command } from 'commander'
import { registerCodegen } from './commands/codegen.js'
import { registerDb } from './commands/db.js'
import { registerDev } from './commands/dev.js'
import { registerServe } from './commands/serve.js'
import { registerStart } from './commands/start.js'

const require = createRequire(import.meta.url)
const pkg = require('../../package.json') as { version: string }

const program = new Command()

program
  .name('ae-sync')
  .description('Aeternity contract indexing framework')
  .version(pkg.version, '-V, --version', 'Output the version number')

registerDev(program)
registerStart(program)
registerServe(program)
registerCodegen(program)
registerDb(program)

program.parse()
