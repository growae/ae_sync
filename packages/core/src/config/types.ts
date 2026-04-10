export interface NetworkConfig {
  name: string
  mdwUrl: string
  mdwWsUrl?: string
  nodeUrl?: string
}

export interface DatabaseConfig {
  kind: 'postgres' | 'pglite'
  connectionString?: string
  directory?: string
  poolConfig?: { max?: number }
}

export interface FactoryConfig {
  contract: string
  event: string
  parameter: string
}

export interface ContractConfig {
  aci?: object
  source?: string
  fileSystem?: Record<string, string>
  address?: string
  factory?: FactoryConfig
  startHeight?: number
  endHeight?: number
}

export interface AeSyncConfig {
  network: NetworkConfig
  database: DatabaseConfig
  contracts: Record<string, ContractConfig>
  finalityDepth: number
  port: number
}

export interface CreateConfigParameters {
  network: NetworkConfig
  database?: Partial<DatabaseConfig>
  contracts: Record<string, ContractConfig>
  finalityDepth?: number
  port?: number
}
