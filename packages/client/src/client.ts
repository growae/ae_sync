import { HttpError, type HttpTransport, createHttpTransport } from './http.js'
import { type QueryProxy, createQueryProxy } from './query.js'
import type { ClientConfig, HealthStatus, SyncStatus } from './types.js'

export interface AeSyncClient {
  db: QueryProxy
  getHealth(): Promise<HealthStatus>
  isReady(): Promise<boolean>
  getStatus(): Promise<SyncStatus>
  graphql<T = unknown>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T>
}

export function createClient(config: ClientConfig): AeSyncClient {
  const transport: HttpTransport = createHttpTransport(
    config.url,
    config.headers,
  )
  const db = createQueryProxy(transport)

  return {
    db,

    async getHealth(): Promise<HealthStatus> {
      return transport.get<HealthStatus>('/health')
    },

    async isReady(): Promise<boolean> {
      try {
        await transport.get('/ready')
        return true
      } catch (error) {
        if (error instanceof HttpError && error.status === 503) {
          return false
        }
        throw error
      }
    },

    async getStatus(): Promise<SyncStatus> {
      return transport.get<SyncStatus>('/status')
    },

    async graphql<T = unknown>(
      query: string,
      variables?: Record<string, unknown>,
    ): Promise<T> {
      return transport.post<T>('/graphql', { query, variables })
    },
  }
}
