import { describe, expect, it, vi } from 'vitest'
import { createConfig } from './index.js'
import type { CreateConfigParameters } from './types.js'

const MOCK_ACI = { functions: [], name: 'TestContract' }

function validParams(
  overrides?: Partial<CreateConfigParameters>,
): CreateConfigParameters {
  return {
    network: {
      name: 'testnet',
      mdwUrl: 'https://testnet.aeternity.io/mdw',
    },
    contracts: {
      TestContract: {
        aci: MOCK_ACI,
        address: 'ct_test123',
      },
    },
    ...overrides,
  }
}

describe('createConfig', () => {
  describe('valid config', () => {
    it('creates config with all fields', () => {
      const config = createConfig({
        network: {
          name: 'testnet',
          mdwUrl: 'https://testnet.aeternity.io/mdw',
          mdwWsUrl: 'wss://testnet.aeternity.io/mdw/v3/websocket',
          nodeUrl: 'https://testnet.aeternity.io',
        },
        database: {
          kind: 'postgres',
          connectionString: 'postgresql://localhost/aesync',
          poolConfig: { max: 10 },
        },
        finalityDepth: 50,
        port: 3000,
        contracts: {
          DexPair: {
            aci: MOCK_ACI,
            address: 'ct_pair123',
            startHeight: 500000,
          },
          PairFactory: {
            aci: MOCK_ACI,
            address: 'ct_factory456',
          },
        },
      })

      expect(config.network.name).toBe('testnet')
      expect(config.network.mdwUrl).toBe('https://testnet.aeternity.io/mdw')
      expect(config.network.mdwWsUrl).toBe(
        'wss://testnet.aeternity.io/mdw/v3/websocket',
      )
      expect(config.network.nodeUrl).toBe('https://testnet.aeternity.io')
      expect(config.database.kind).toBe('postgres')
      expect(config.database.connectionString).toBe(
        'postgresql://localhost/aesync',
      )
      expect(config.database.poolConfig).toEqual({ max: 10 })
      expect(config.finalityDepth).toBe(50)
      expect(config.port).toBe(3000)
      expect(config.contracts.DexPair?.startHeight).toBe(500000)
    })

    it('creates config with factory references', () => {
      const config = createConfig({
        network: {
          name: 'testnet',
          mdwUrl: 'https://testnet.aeternity.io/mdw',
        },
        contracts: {
          PairFactory: {
            aci: MOCK_ACI,
            address: 'ct_factory456',
          },
          DexPair: {
            aci: MOCK_ACI,
            factory: {
              contract: 'PairFactory',
              event: 'PairCreated',
              parameter: 'pair',
            },
          },
        },
      })

      expect(config.contracts.DexPair?.factory?.contract).toBe('PairFactory')
    })
  })

  describe('defaults', () => {
    it('applies default finalityDepth of 20', () => {
      const config = createConfig(validParams())
      expect(config.finalityDepth).toBe(20)
    })

    it('applies default database as pglite', () => {
      const config = createConfig(validParams())
      expect(config.database.kind).toBe('pglite')
      expect(config.database.directory).toBe('.aesync/pglite')
    })

    it('applies default port of 42069', () => {
      const config = createConfig(validParams())
      expect(config.port).toBe(42069)
    })

    it('merges partial database config with defaults', () => {
      const config = createConfig(
        validParams({ database: { kind: 'postgres' } }),
      )
      expect(config.database.kind).toBe('postgres')
      expect(config.database.directory).toBe('.aesync/pglite')
    })
  })

  describe('environment variable fallbacks', () => {
    it('falls back to AE_MDW_URL when mdwUrl is empty', () => {
      vi.stubEnv('AE_MDW_URL', 'https://env.mdw.url')
      const config = createConfig(
        validParams({
          network: { name: 'testnet', mdwUrl: '' },
        }),
      )
      expect(config.network.mdwUrl).toBe('https://env.mdw.url')
      vi.unstubAllEnvs()
    })

    it('falls back to AE_MDW_WS_URL when mdwWsUrl is not set', () => {
      vi.stubEnv('AE_MDW_WS_URL', 'wss://env.ws.url')
      const config = createConfig(validParams())
      expect(config.network.mdwWsUrl).toBe('wss://env.ws.url')
      vi.unstubAllEnvs()
    })

    it('falls back to AE_NODE_URL when nodeUrl is not set', () => {
      vi.stubEnv('AE_NODE_URL', 'https://env.node.url')
      const config = createConfig(validParams())
      expect(config.network.nodeUrl).toBe('https://env.node.url')
      vi.unstubAllEnvs()
    })

    it('falls back to DATABASE_URL when connectionString is not set', () => {
      vi.stubEnv('DATABASE_URL', 'postgresql://env/db')
      const config = createConfig(validParams())
      expect(config.database.connectionString).toBe('postgresql://env/db')
      vi.unstubAllEnvs()
    })

    it('prefers explicit config over env variables', () => {
      vi.stubEnv('AE_MDW_URL', 'https://env.mdw.url')
      const config = createConfig(
        validParams({
          network: {
            name: 'testnet',
            mdwUrl: 'https://explicit.mdw.url',
          },
        }),
      )
      expect(config.network.mdwUrl).toBe('https://explicit.mdw.url')
      vi.unstubAllEnvs()
    })
  })

  describe('validation errors', () => {
    it('throws when network is missing', () => {
      expect(() =>
        createConfig({
          network: undefined as any,
          contracts: { Test: { aci: MOCK_ACI, address: 'ct_test' } },
        }),
      ).toThrow("Config error: 'network' is required")
    })

    it('throws when network.mdwUrl is missing', () => {
      expect(() =>
        createConfig({
          network: { name: 'testnet', mdwUrl: '' },
          contracts: { Test: { aci: MOCK_ACI, address: 'ct_test' } },
        }),
      ).toThrow("Config error: 'network.mdwUrl' is required")
    })

    it('throws when contracts is empty', () => {
      expect(() =>
        createConfig({
          network: {
            name: 'testnet',
            mdwUrl: 'https://testnet.aeternity.io/mdw',
          },
          contracts: {},
        }),
      ).toThrow('at least one contract must be defined')
    })

    it('throws when contract has neither aci nor source', () => {
      expect(() =>
        createConfig(
          validParams({
            contracts: {
              Bad: { address: 'ct_test' },
            },
          }),
        ),
      ).toThrow(
        "contract 'Bad' must have either 'aci' or 'source', got neither",
      )
    })

    it('throws when contract has both aci and source', () => {
      expect(() =>
        createConfig(
          validParams({
            contracts: {
              Bad: {
                aci: MOCK_ACI,
                source: './test.aes',
                address: 'ct_test',
              },
            },
          }),
        ),
      ).toThrow("contract 'Bad' must have either 'aci' or 'source', got both")
    })

    it('throws when contract has neither address nor factory', () => {
      expect(() =>
        createConfig(
          validParams({
            contracts: {
              Bad: { aci: MOCK_ACI },
            },
          }),
        ),
      ).toThrow(
        "contract 'Bad' must have either 'address' or 'factory', got neither",
      )
    })

    it('throws when contract has both address and factory', () => {
      expect(() =>
        createConfig(
          validParams({
            contracts: {
              Factory: { aci: MOCK_ACI, address: 'ct_factory' },
              Bad: {
                aci: MOCK_ACI,
                address: 'ct_test',
                factory: {
                  contract: 'Factory',
                  event: 'Created',
                  parameter: 'addr',
                },
              },
            },
          }),
        ),
      ).toThrow(
        "contract 'Bad' must have either 'address' or 'factory', got both",
      )
    })

    it('throws when factory references unknown contract', () => {
      expect(() =>
        createConfig(
          validParams({
            contracts: {
              Bad: {
                aci: MOCK_ACI,
                factory: {
                  contract: 'NonExistent',
                  event: 'Created',
                  parameter: 'addr',
                },
              },
            },
          }),
        ),
      ).toThrow("factory references unknown contract 'NonExistent'")
    })

    it('throws when finalityDepth is not a positive integer', () => {
      expect(() => createConfig(validParams({ finalityDepth: -5 }))).toThrow(
        "'finalityDepth' must be a positive integer",
      )
    })

    it('throws when finalityDepth is not an integer', () => {
      expect(() => createConfig(validParams({ finalityDepth: 2.5 }))).toThrow(
        "'finalityDepth' must be a positive integer",
      )
    })

    it('throws when finalityDepth is zero', () => {
      expect(() => createConfig(validParams({ finalityDepth: 0 }))).toThrow(
        "'finalityDepth' must be a positive integer",
      )
    })
  })

  describe('immutability', () => {
    it('returns a frozen config object', () => {
      const config = createConfig(validParams())
      expect(Object.isFrozen(config)).toBe(true)
    })

    it('prevents modification of config properties', () => {
      const config = createConfig(validParams())
      expect(() => {
        ;(config as any).finalityDepth = 999
      }).toThrow()
    })
  })
})
