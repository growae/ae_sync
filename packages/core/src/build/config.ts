import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ViteNodeRunner } from 'vite-node/client'
import { createConfig } from '../config/index.js'
import type { AeSyncConfig, CreateConfigParameters } from '../config/types.js'

const CONFIG_FILES = ['aesync.config.ts', 'aesync.config.js'] as const

export async function compileConfig(
  runner: ViteNodeRunner,
  rootDir: string,
  customPath?: string,
): Promise<AeSyncConfig> {
  let configPath: string | undefined

  if (customPath) {
    const resolved = resolve(rootDir, customPath)
    if (!existsSync(resolved)) {
      throw new Error(`Config file not found: ${resolved}`)
    }
    configPath = resolved
  } else {
    for (const name of CONFIG_FILES) {
      const candidate = resolve(rootDir, name)
      if (existsSync(candidate)) {
        configPath = candidate
        break
      }
    }
  }

  if (!configPath) {
    throw new Error(
      `No config file found. Expected aesync.config.ts or aesync.config.js in ${rootDir}`,
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
