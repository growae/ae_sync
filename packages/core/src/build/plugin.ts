import { resolve } from 'node:path'
import type { Plugin } from 'vite'

const VIRTUAL_PREFIX = '\0'
const REGISTRY_ID = 'aesync:registry'
const SCHEMA_ID = 'aesync:schema'
const API_ID = 'aesync:api'

const VIRTUAL_IDS = new Set([REGISTRY_ID, SCHEMA_ID, API_ID])

export function vitePluginAeSync(options: { rootDir: string }): Plugin {
  return {
    name: 'aesync',

    resolveId(id: string) {
      if (VIRTUAL_IDS.has(id)) {
        return VIRTUAL_PREFIX + id
      }
      return null
    },

    load(id: string) {
      if (id === VIRTUAL_PREFIX + REGISTRY_ID) {
        return REGISTRY_CODE
      }
      if (id === VIRTUAL_PREFIX + SCHEMA_ID) {
        const schemaPath = resolve(options.rootDir, 'schema.ts').replace(
          /\\/g,
          '/',
        )
        return `export * from '${schemaPath}';`
      }
      if (id === VIRTUAL_PREFIX + API_ID) {
        return API_CODE
      }
      return null
    },
  }
}

const REGISTRY_CODE = `\
const aesync = {
  fns: [],
  _api_routes: [],
  _api_middleware: [],
  on(name, fn) { this.fns.push({ name, fn }); },
  get(path, handler) { this._api_routes.push({ method: 'GET', path, handler }); },
  post(path, handler) { this._api_routes.push({ method: 'POST', path, handler }); },
  use(handler) { this._api_middleware.push(handler); },
};
export { aesync };`

const API_CODE = `\
export const db = globalThis.__AESYNC_DB__;
export const client = globalThis.__AESYNC_CLIENT__;`
