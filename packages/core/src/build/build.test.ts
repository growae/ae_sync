import { describe, expect, expectTypeOf, it } from 'vitest'
import { parseAci } from '../aci/index.js'
import type { AeSyncConfig } from '../config/types.js'
import type { CompiledContract } from '../sync/types.js'
import { generateEnvDtsContent } from './codegen.js'
import { compileContracts } from './contracts.js'
import type { Build, BuildResult } from './index.js'
import { vitePluginAeSync } from './plugin.js'

const PAIR_ACI = {
  contract: {
    name: 'Pair',
    kind: 'contract_main',
    event: {
      variant: [
        { Swap: ['address', 'int', 'int', 'int', 'int', 'address'] },
        { Mint: ['address', 'int', 'int'] },
        { Transfer: ['address', 'address', 'int'] },
      ],
    },
    functions: [],
  },
}

const TOKEN_ACI = {
  contract: {
    name: 'Token',
    kind: 'contract_main',
    event: {
      variant: [{ Transfer: ['address', 'address', 'int'] }],
    },
  },
}

function makeConfig(contracts: AeSyncConfig['contracts']): AeSyncConfig {
  return {
    network: { name: 'testnet', mdwUrl: 'http://localhost' },
    database: { kind: 'pglite' },
    contracts,
    finalityDepth: 10,
    port: 42069,
  }
}

describe('Build System', () => {
  describe('Vite Plugin — resolveId', () => {
    const plugin = vitePluginAeSync({ rootDir: '/tmp/test' })
    const resolveId = plugin.resolveId as (id: string) => string | null

    it('resolves aesync:registry', () => {
      expect(resolveId.call(plugin, 'aesync:registry')).toBe(
        '\0aesync:registry',
      )
    })

    it('resolves aesync:schema', () => {
      expect(resolveId.call(plugin, 'aesync:schema')).toBe('\0aesync:schema')
    })

    it('resolves aesync:api', () => {
      expect(resolveId.call(plugin, 'aesync:api')).toBe('\0aesync:api')
    })

    it('returns null for non-virtual IDs', () => {
      expect(resolveId.call(plugin, 'some-other-module')).toBeNull()
    })
  })

  describe('Vite Plugin — load', () => {
    const plugin = vitePluginAeSync({ rootDir: '/tmp/test' })
    const load = plugin.load as (id: string) => string | null

    it('loads aesync:registry with aesync object', () => {
      const code = load.call(plugin, '\0aesync:registry')
      expect(code).toContain('aesync')
      expect(code).toContain('fns')
      expect(code).toContain('_api_routes')
      expect(code).toContain('_api_middleware')
      expect(code).toContain('on(')
      expect(code).toContain('get(')
      expect(code).toContain('post(')
      expect(code).toContain('use(')
    })

    it('loads aesync:schema re-exporting schema.ts', () => {
      const code = load.call(plugin, '\0aesync:schema')
      expect(code).toContain('export * from')
      expect(code).toContain('/tmp/test/schema.ts')
    })

    it('loads aesync:api with db and client from globalThis', () => {
      const code = load.call(plugin, '\0aesync:api')
      expect(code).toContain('globalThis.__AESYNC_DB__')
      expect(code).toContain('globalThis.__AESYNC_CLIENT__')
    })

    it('returns null for unknown module IDs', () => {
      expect(load.call(plugin, 'unknown')).toBeNull()
    })
  })

  describe('Contract Compilation', () => {
    it('parses ACIs and extracts events', async () => {
      const config = makeConfig({
        Pair: { aci: PAIR_ACI, address: 'ct_pair123' },
      })

      const result = await compileContracts(config)

      expect(result.size).toBe(1)
      const pair = result.get('ct_pair123')!
      expect(pair.name).toBe('Pair')
      expect(pair.address).toBe('ct_pair123')
      expect(pair.events).toHaveLength(3)
      expect(pair.events.map((e) => e.name)).toEqual([
        'Swap',
        'Mint',
        'Transfer',
      ])
    })

    it('compiles multiple contracts', async () => {
      const config = makeConfig({
        Pair: { aci: PAIR_ACI, address: 'ct_pair' },
        Token: { aci: TOKEN_ACI, address: 'ct_token' },
      })

      const result = await compileContracts(config)

      expect(result.size).toBe(2)
      expect(result.get('ct_pair')!.events).toHaveLength(3)
      expect(result.get('ct_token')!.events).toHaveLength(1)
    })

    it('throws on missing ACI', async () => {
      const config = makeConfig({ NoAci: { address: 'ct_noaci' } })
      await expect(compileContracts(config)).rejects.toThrow('missing an ACI')
    })

    it('computes event hashes', async () => {
      const config = makeConfig({
        Token: { aci: TOKEN_ACI, address: 'ct_token' },
      })

      const result = await compileContracts(config)
      const transfer = result
        .get('ct_token')!
        .events.find((e) => e.name === 'Transfer')!

      expect(transfer.hash).toBeDefined()
      expect(transfer.hash).toHaveLength(56)
    })

    it('defaults address to empty string when not provided', async () => {
      const config = makeConfig({ Token: { aci: TOKEN_ACI } })
      const result = await compileContracts(config)
      const token = result.get('Token')!
      expect(token.address).toBe('')
    })
  })

  describe('Codegen', () => {
    it('generates aesync-env.d.ts with event types', () => {
      const contracts = new Map<string, CompiledContract>()
      const parsed = parseAci(PAIR_ACI)
      contracts.set('Pair', {
        name: 'Pair',
        address: 'ct_pair',
        aci: parsed,
        events: parsed.events,
      })

      const content = generateEnvDtsContent(contracts)

      expect(content).toContain("declare module 'aesync:registry'")
      expect(content).toContain("declare module 'aesync:schema'")
      expect(content).toContain("declare module 'aesync:api'")
      expect(content).toContain("'Pair:Swap'")
      expect(content).toContain("'Pair:Mint'")
      expect(content).toContain("'Pair:Transfer'")
    })

    it('generates d.ts with multiple contracts', () => {
      const contracts = new Map<string, CompiledContract>()

      const pairParsed = parseAci(PAIR_ACI)
      contracts.set('Pair', {
        name: 'Pair',
        address: 'ct_pair',
        aci: pairParsed,
        events: pairParsed.events,
      })

      const tokenParsed = parseAci(TOKEN_ACI)
      contracts.set('Token', {
        name: 'Token',
        address: 'ct_token',
        aci: tokenParsed,
        events: tokenParsed.events,
      })

      const content = generateEnvDtsContent(contracts)

      expect(content).toContain("'Pair:Swap'")
      expect(content).toContain("'Token:Transfer'")
      expect(content).toContain('on(name:')
    })

    it('falls back to string type when no events', () => {
      const contracts = new Map<string, CompiledContract>()
      const content = generateEnvDtsContent(contracts)
      expect(content).toContain('on(name: string,')
    })

    it('includes auto-generated header', () => {
      const contracts = new Map<string, CompiledContract>()
      const content = generateEnvDtsContent(contracts)
      expect(content).toContain('Auto-generated by @growae/aesync')
    })
  })

  describe('Build Pipeline Types', () => {
    it('Build has run and close methods', () => {
      expectTypeOf<Build>().toHaveProperty('run')
      expectTypeOf<Build>().toHaveProperty('close')
    })

    it('BuildResult has all required properties', () => {
      expectTypeOf<BuildResult>().toHaveProperty('config')
      expectTypeOf<BuildResult>().toHaveProperty('contracts')
      expectTypeOf<BuildResult>().toHaveProperty('schema')
      expectTypeOf<BuildResult>().toHaveProperty('database')
      expectTypeOf<BuildResult>().toHaveProperty('indexing')
      expectTypeOf<BuildResult>().toHaveProperty('api')
      expectTypeOf<BuildResult>().toHaveProperty('mdw')
    })

    it('run returns Promise<BuildResult>', () => {
      expectTypeOf<Build['run']>().returns.resolves.toEqualTypeOf<BuildResult>()
    })

    it('close returns Promise<void>', () => {
      expectTypeOf<Build['close']>().returns.resolves.toBeVoid()
    })
  })
})
