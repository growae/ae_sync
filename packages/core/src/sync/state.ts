import type { ContractSyncState, SyncStatus } from './types.js'

export interface SyncStateManager {
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
  ): void
  getAllStates(): ContractSyncState[]
  resetAboveHeight(height: number): void
}

/**
 * In-memory sync state manager. Tracks per-contract sync progress.
 * Will be replaced with DB-backed persistence when the Database layer is ready.
 */
export function createSyncStateManager(): SyncStateManager {
  const states = new Map<string, ContractSyncState>()

  function key(contractId: string, contractName: string): string {
    return `${contractId}:${contractName}`
  }

  function ensureState(
    contractId: string,
    contractName: string,
  ): ContractSyncState {
    const k = key(contractId, contractName)
    let state = states.get(k)
    if (!state) {
      state = {
        contractId,
        contractName,
        status: 'pending' as SyncStatus,
        lastHeight: 0,
        eventsProcessed: 0,
      }
      states.set(k, state)
    }
    return state
  }

  return {
    getState(contractId, contractName) {
      return states.get(key(contractId, contractName))
    },

    updateState(contractId, contractName, update) {
      const state = ensureState(contractId, contractName)
      if (update.status !== undefined) state.status = update.status
      if (update.lastCursor !== undefined) state.lastCursor = update.lastCursor
      if (update.lastHeight !== undefined) state.lastHeight = update.lastHeight
      if (update.eventsProcessed !== undefined)
        state.eventsProcessed = update.eventsProcessed
      if (update.error !== undefined) state.error = update.error
    },

    getAllStates() {
      return [...states.values()]
    },

    resetAboveHeight(height) {
      for (const state of states.values()) {
        if (state.lastHeight > height) {
          state.lastHeight = height
          state.status = 'pending'
          state.error = undefined
        }
      }
    },
  }
}
