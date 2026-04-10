import type { Command } from 'commander'
import { createBuild } from '../../build/index.js'

interface CodegenOptions {
  config?: string
}

export function registerCodegen(program: Command): void {
  program
    .command('codegen')
    .description('Generate TypeScript type definitions for contracts')
    .option('--config <path>', 'Path to config file')
    .action(async (opts: CodegenOptions) => {
      await runCodegen(opts)
    })
}

async function runCodegen(opts: CodegenOptions): Promise<void> {
  const rootDir = process.cwd()

  console.log('\x1b[36m◆\x1b[0m ae-sync codegen')
  console.log('')

  const build = await createBuild({
    rootDir,
    watch: false,
    configPath: opts.config,
  })

  try {
    const result = await build.run()
    const contractCount = result.contracts.size
    console.log(
      `\x1b[32m✓\x1b[0m Generated ae-sync-env.d.ts (${contractCount} contract${contractCount !== 1 ? 's' : ''})`,
    )
    await result.database.close()
  } catch (err) {
    console.error(
      '\x1b[31m✗\x1b[0m Codegen failed:',
      err instanceof Error ? err.message : err,
    )
    process.exit(1)
  } finally {
    await build.close()
  }
}
