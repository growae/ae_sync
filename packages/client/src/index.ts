export { createClient } from './client.js'
export type { AeSyncClient } from './client.js'

export type {
  ClientConfig,
  ContractStatus,
  HealthStatus,
  QueryResult,
  ReadyStatus,
  SyncStatus,
} from './types.js'

export { HttpError, createHttpTransport } from './http.js'
export type { HttpTransport } from './http.js'

export { createQueryProxy } from './query.js'
export type { QueryBuilder, QueryProxy } from './query.js'
