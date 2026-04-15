import type { MdwHttpClient } from '../mdw/http.js'
import { extractCursor } from '../mdw/pagination.js'
import type { MdwContractLog, MdwPaginatedResponse } from '../mdw/types.js'
import type { CompiledContract } from './types.js'

export interface HistoricalSyncOptions {
  lastCursor?: string
  startHeight?: number
  endHeight?: number
}

/**
 * Create an async generator that yields batches of contract logs
 * for historical backfill. Paginates through MDW results, respecting
 * `startHeight`/`endHeight` via the `scope` parameter and resuming
 * from `lastCursor` if provided.
 */
export async function* createHistoricalSync(
  mdw: MdwHttpClient,
  contract: CompiledContract,
  opts?: HistoricalSyncOptions,
): AsyncGenerator<MdwContractLog[], void, undefined> {
  let cursor = opts?.lastCursor

  const start = opts?.startHeight
  const end = opts?.endHeight
  let scope: string | undefined
  if (start != null && end != null) {
    scope = `gen:${start}-${end}`
  } else if (start != null) {
    scope = `gen:${start}-${start + 10_000_000}`
  } else if (end != null) {
    scope = `gen:0-${end}`
  }

  while (true) {
    const page: MdwPaginatedResponse<MdwContractLog> =
      await mdw.getContractLogs(contract.address, {
        cursor,
        scope,
        limit: 100,
      })

    if (page.data.length > 0) {
      yield page.data
    }

    if (!page.next) break

    const nextCursor = extractCursor(page.next)
    if (!nextCursor) break
    cursor = nextCursor
  }
}
