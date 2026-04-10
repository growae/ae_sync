#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { cyan, green, red, yellow } from 'kolorist'
import prompts from 'prompts'
import { TEMPLATES, scaffold } from './index.js'

function detectPackageManager(): string {
  const agent = process.env.npm_config_user_agent ?? ''
  if (agent.startsWith('pnpm')) return 'pnpm'
  if (agent.startsWith('yarn')) return 'yarn'
  return 'npm'
}

function parseArgs(argv: string[]): {
  projectName?: string
  template?: string
} {
  const args = argv.slice(2)
  let projectName: string | undefined
  let template: string | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--template' || arg === '-t') {
      template = args[++i]
    } else if (!arg.startsWith('-')) {
      projectName = arg
    }
  }

  return { projectName, template }
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv)
  let { projectName, template } = parsed

  console.log()
  console.log(`  ${cyan('◆')} ${green('create-aesync')}`)
  console.log()

  if (!projectName) {
    const res = await prompts({
      type: 'text',
      name: 'projectName',
      message: 'Project name:',
      initial: 'my-aesync-app',
    })
    projectName = res.projectName as string | undefined
    if (!projectName) {
      console.log(red('✖ Operation cancelled'))
      process.exit(1)
    }
  }

  if (!template) {
    const res = await prompts({
      type: 'select',
      name: 'template',
      message: 'Select a template:',
      choices: [
        {
          title: 'Empty',
          description: 'Minimal starter project',
          value: 'empty',
        },
        { title: 'DEX', description: 'DEX pair & swap indexer', value: 'dex' },
        {
          title: 'Token Tracker',
          description: 'AEX-9 token transfer tracker',
          value: 'token-tracker',
        },
      ],
    })
    template = res.template as string | undefined
    if (!template) {
      console.log(red('✖ Operation cancelled'))
      process.exit(1)
    }
  }

  if (!TEMPLATES.includes(template as (typeof TEMPLATES)[number])) {
    console.log(red(`✖ Unknown template: ${template}`))
    console.log(`  Available templates: ${TEMPLATES.join(', ')}`)
    process.exit(1)
  }

  const targetDir = resolve(process.cwd(), projectName)

  if (existsSync(targetDir)) {
    console.log(red(`✖ Directory "${projectName}" already exists`))
    process.exit(1)
  }

  await scaffold({ projectName, template, targetDir })

  const pm = detectPackageManager()
  const runCmd = pm === 'npm' ? 'npx' : pm

  console.log(green('✔ Project scaffolded successfully!'))
  console.log()
  console.log('  Next steps:')
  console.log()
  console.log(`  ${cyan('cd')} ${projectName}`)
  console.log(`  ${cyan(`${pm} install`)}`)
  console.log(`  ${cyan('cp .env.example .env')}`)
  console.log(`  ${cyan(`${runCmd} ae-sync dev`)}`)
  console.log()
  console.log(`  ${yellow('Docs:')} https://aesync.dev`)
  console.log()
}

main().catch((err) => {
  // biome-ignore lint/suspicious/noConsole: CLI entry point must report fatal errors
  console.error(err)
  process.exit(1)
})

export { parseArgs, detectPackageManager }
