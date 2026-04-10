import {
  DEFAULT_DATABASE,
  DEFAULT_FINALITY_DEPTH,
  DEFAULT_PORT,
} from './defaults.js'
import type { AeSyncConfig, CreateConfigParameters } from './types.js'
import { validateConfig } from './validate.js'

export function createConfig(params: CreateConfigParameters): AeSyncConfig {
  const resolved = applyEnvFallbacks(params)
  validateConfig(resolved)

  const config: AeSyncConfig = {
    network: resolved.network,
    database: {
      ...DEFAULT_DATABASE,
      ...resolved.database,
    },
    contracts: resolved.contracts,
    finalityDepth: resolved.finalityDepth ?? DEFAULT_FINALITY_DEPTH,
    port: resolved.port ?? DEFAULT_PORT,
  }

  return Object.freeze(config)
}

function applyEnvFallbacks(
  params: CreateConfigParameters,
): CreateConfigParameters {
  if (!params.network) return params

  return {
    ...params,
    network: {
      ...params.network,
      mdwUrl: params.network.mdwUrl || process.env.AE_MDW_URL || '',
      mdwWsUrl: params.network.mdwWsUrl || process.env.AE_MDW_WS_URL,
      nodeUrl: params.network.nodeUrl || process.env.AE_NODE_URL,
    },
    database: {
      ...params.database,
      connectionString:
        params.database?.connectionString || process.env.DATABASE_URL,
    },
  }
}

export type {
  AeSyncConfig,
  ContractConfig,
  CreateConfigParameters,
  DatabaseConfig,
  FactoryConfig,
  NetworkConfig,
} from './types.js'
