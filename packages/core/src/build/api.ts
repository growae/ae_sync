import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ViteNodeRunner } from 'vite-node/client'

interface ApiRoute {
  method: string
  path: string
  handler: (...args: unknown[]) => unknown
}

type MiddlewareFn = (...args: unknown[]) => unknown

export interface CompiledApi {
  routes: ApiRoute[]
  middleware: MiddlewareFn[]
}

export async function compileApi(
  runner: ViteNodeRunner,
  rootDir: string,
): Promise<CompiledApi | null> {
  const apiPath = resolve(rootDir, 'src/api/index.ts')
  if (!existsSync(apiPath)) {
    return null
  }

  await runner.executeFile(apiPath)

  const registry = (await runner.executeId('ae-sync:registry')) as {
    aesync: { _api_routes: ApiRoute[]; _api_middleware: MiddlewareFn[] }
  }

  return {
    routes: registry.aesync._api_routes,
    middleware: registry.aesync._api_middleware,
  }
}
