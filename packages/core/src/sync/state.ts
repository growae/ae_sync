import { sql } from 'drizzle-orm'
import type { Database, DrizzleInstance } from '../database/types.js'
import { aesyncContractState } from '../schema/internal.js'
import type { ContractSyncState, SyncStatus } from './types.js'

export interface SyncStateManager {
  /** Load all existing state rows from the database into memory. */
  load(): Promise<void>
  getState(
    contractId: string,
    contractName: string,
  ): ContractSyncState | undefined
  updateState(
    contractId: string,
    contractName: string,
    update: Partial<
      Pick<
        ContractSyncState,
        'status' | 'lastCursor' | 'lastHeight' | 'eventsProcessed' | 'error'
      >
    >,
  ): Promise<void>
  getAllStates(): ContractSyncState[]
  resetAboveHeight(height: number): Promise<void>
}

/**
 * DB-backed sync state manager. Persists per-contract sync progress
 * to `_aesync_contract_state` and maintains an in-memory cache for
 * fast reads.
 */
export function createSyncStateManager(db: Database): SyncStateManager {
  const cache = new Map<string, ContractSyncState>()

  function key(contractId: string, contractName: string): string {
    return `${contractId}:${contractName}`
  }

  function toState(row: {
    contractId: string
    contractName: string
    status: string
    lastCursor: string | null
    lastHeight: number | null
    eventsProcessed: bigint | null
    error: string | null
  }): ContractSyncState {
    return {
      contractId: row.contractId,
      contractName: row.contractName,
      status: row.status as SyncStatus,
      lastCursor: row.lastCursor ?? undefined,
      lastHeight: row.lastHeight ?? 0,
      eventsProcessed: Number(row.eventsProcessed ?? 0),
      error: row.error ?? undefined,
    }
  }

  async function upsertRow(
    qb: DrizzleInstance,
    state: ContractSyncState,
  ): Promise<void> {
    await qb
      .insert(aesyncContractState)
      .values({
        contractId: state.contractId,
        contractName: state.contractName,
        status: state.status,
        lastCursor: state.lastCursor ?? null,
        lastHeight: state.lastHeight,
        eventsProcessed: BigInt(state.eventsProcessed),
        error: state.error ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          aesyncContractState.contractId,
          aesyncContractState.contractName,
        ],
        set: {
          status: sql`excluded.status`,
          lastCursor: sql`excluded.last_cursor`,
          lastHeight: sql`excluded.last_height`,
          eventsProcessed: sql`excluded.events_processed`,
          error: sql`excluded.error`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
  }

  return {
    async load() {
      const rows = await db.qb.select().from(aesyncContractState)
      cache.clear()
      for (const row of rows) {
        const state = toState(row)
        cache.set(key(state.contractId, state.contractName), state)
      }
    },

    getState(contractId, contractName) {
      return cache.get(key(contractId, contractName))
    },

    async updateState(contractId, contractName, update) {
      const k = key(contractId, contractName)
      let state = cache.get(k)
      if (!state) {
        state = {
          contractId,
          contractName,
          status: 'pending' as SyncStatus,
          lastHeight: 0,
          eventsProcessed: 0,
        }
      }

      if (update.status !== undefined) state.status = update.status
      if (update.lastCursor !== undefined) state.lastCursor = update.lastCursor
      if (update.lastHeight !== undefined) state.lastHeight = update.lastHeight
      if (update.eventsProcessed !== undefined)
        state.eventsProcessed = update.eventsProcessed
      if (update.error !== undefined) state.error = update.error

      cache.set(k, state)
      await upsertRow(db.qb, state)
    },

    getAllStates() {
      return [...cache.values()]
    },

    async resetAboveHeight(height) {
      const affected: ContractSyncState[] = []
      for (const state of cache.values()) {
        if (state.lastHeight > height) {
          state.lastHeight = height
          state.status = 'pending'
          state.error = undefined
          affected.push(state)
        }
      }
      for (const state of affected) {
        await upsertRow(db.qb, state)
      }
    },
  }
}
