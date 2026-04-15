import { MdwConnectionError, MdwHttpError, MdwTimeoutError } from './errors.js'
import type {
  GetAex9TransfersOptions,
  GetContractCallsOptions,
  GetContractLogsOptions,
  MdwAex9Token,
  MdwAex9Transfer,
  MdwContractCall,
  MdwContractLog,
  MdwHttpClientOptions,
  MdwKeyBlock,
  MdwPaginatedResponse,
  MdwStatus,
  PaginationOptions,
} from './types.js'

const DEFAULT_TIMEOUT = 30_000

export interface MdwHttpClient {
  getContractLogs(
    contractId: string,
    opts?: GetContractLogsOptions,
  ): Promise<MdwPaginatedResponse<MdwContractLog>>
  getAllContractLogs(
    opts?: GetContractLogsOptions,
  ): Promise<MdwPaginatedResponse<MdwContractLog>>
  getContractCalls(
    contractId: string,
    opts?: GetContractCallsOptions,
  ): Promise<MdwPaginatedResponse<MdwContractCall>>
  getStatus(): Promise<MdwStatus>
  getKeyBlock(heightOrHash: number | string): Promise<MdwKeyBlock>
  getAex9Tokens(
    opts?: PaginationOptions,
  ): Promise<MdwPaginatedResponse<MdwAex9Token>>
  getAex9Transfers(
    contractId: string,
    opts?: GetAex9TransfersOptions,
  ): Promise<MdwPaginatedResponse<MdwAex9Transfer>>
}

function buildParams(opts?: object): URLSearchParams {
  const params = new URLSearchParams()
  if (!opts) return params

  for (const [key, value] of Object.entries(opts)) {
    if (value != null) {
      params.set(key, String(value))
    }
  }

  return params
}

export function createMdwHttpClient(
  baseUrl: string,
  options?: MdwHttpClientOptions,
): MdwHttpClient {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT
  const base = baseUrl.replace(/\/+$/, '')

  async function request<T>(
    path: string,
    params?: URLSearchParams,
  ): Promise<T> {
    const url = new URL(`${base}${path}`)
    if (params) {
      for (const [k, v] of params) {
        url.searchParams.set(k, v)
      }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    const href = url.href

    try {
      const res = await fetch(href, { signal: controller.signal })

      if (!res.ok) {
        const body = await res.text().catch(() => undefined)
        throw new MdwHttpError(res.status, href, body)
      }

      return (await res.json()) as T
    } catch (error) {
      if (error instanceof MdwHttpError) throw error

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new MdwTimeoutError(timeout, href)
      }

      throw new MdwConnectionError(`Failed to connect to ${href}`, {
        cause: error,
      })
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    getContractLogs(contractId, opts) {
      return request<MdwPaginatedResponse<MdwContractLog>>(
        `/v3/contracts/${contractId}/logs`,
        buildParams(opts),
      )
    },

    getAllContractLogs(opts) {
      return request<MdwPaginatedResponse<MdwContractLog>>(
        '/v3/contracts/logs',
        buildParams(opts),
      )
    },

    getContractCalls(contractId, opts) {
      return request<MdwPaginatedResponse<MdwContractCall>>(
        `/v3/contracts/${contractId}/calls`,
        buildParams(opts),
      )
    },

    getStatus() {
      return request<MdwStatus>('/v3/status')
    },

    getKeyBlock(heightOrHash) {
      return request<MdwKeyBlock>(`/v3/key-blocks/${heightOrHash}`)
    },

    getAex9Tokens(opts) {
      return request<MdwPaginatedResponse<MdwAex9Token>>(
        '/v3/aex9',
        buildParams(opts),
      )
    },

    getAex9Transfers(contractId, opts) {
      return request<MdwPaginatedResponse<MdwAex9Transfer>>(
        `/v3/aex9/${contractId}/transfers`,
        buildParams(opts),
      )
    },
  }
}
