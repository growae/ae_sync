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

  const scopeParts: string[] = []
  if (opts?.startHeight != null) {
    scopeParts.push(`gen:${opts.startHeight}`)
  }
  if (opts?.endHeight != null) {
    if (scopeParts.length > 0) {
      scopeParts[0] = `${scopeParts[0]}-${opts.endHeight}`
    } else {
      scopeParts.push(`gen:0-${opts.endHeight}`)
    }
  }
  const scope = scopeParts.length > 0 ? scopeParts[0] : undefined

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
