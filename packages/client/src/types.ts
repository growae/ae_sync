export interface ClientConfig {
  url: string
  headers?: Record<string, string>
}

export interface QueryResult<T> {
  rows: T[]
  rowCount: number
}

export interface HealthStatus {
  status: 'ok'
}

export interface ReadyStatus {
  ready: boolean
}

export interface ContractStatus {
  name: string
  status: string
  eventsProcessed: number
  lastHeight: number
}

export interface SyncStatus {
  version: string
  ready: boolean
  contracts: ContractStatus[]
}
