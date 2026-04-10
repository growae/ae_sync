import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ViteNodeRunner } from 'vite-node/client'
import { createConfig } from '../config/index.js'
import type { AeSyncConfig, CreateConfigParameters } from '../config/types.js'

const CONFIG_FILES = ['ae-sync.config.ts', 'ae-sync.config.js'] as const

export async function compileConfig(
  runner: ViteNodeRunner,
  rootDir: string,
): Promise<AeSyncConfig> {
  let configPath: string | undefined
  for (const name of CONFIG_FILES) {
    const candidate = resolve(rootDir, name)
    if (existsSync(candidate)) {
      configPath = candidate
      break
    }
  }

  if (!configPath) {
    throw new Error(
      `No config file found. Expected ae-sync.config.ts or ae-sync.config.js in ${rootDir}`,
    )
  }

  const mod = (await runner.executeFile(configPath)) as Record<string, unknown>
  const raw = mod.default ?? mod.config

  if (!raw || typeof raw !== 'object') {
    throw new Error(
      `Config file ${configPath} must export a default config or named "config" export`,
    )
  }

  return createConfig(raw as CreateConfigParameters)
}
