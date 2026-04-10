export interface ServerConfig {
  port: number
  hostname: string
}

export interface ContractSyncStatus {
  name: string
  status: string
  eventsProcessed: number
  lastHeight: number
}

export type SyncStatusProvider = () => {
  ready: boolean
  contracts: ContractSyncStatus[]
}
