import type { Checkpoint } from './types.js'

export interface CheckpointManager {
  addCheckpoint(height: number, blockHash: string): void
  getCheckpoints(): Checkpoint[]
  getLastCheckpoint(): Checkpoint | undefined
  removeAbove(height: number): void
}

export function createCheckpointManager(): CheckpointManager {
  const checkpoints: Checkpoint[] = []

  return {
    addCheckpoint(height, blockHash) {
      const existing = checkpoints.findIndex((c) => c.height === height)
      if (existing !== -1) {
        checkpoints[existing] = { height, blockHash }
      } else {
        checkpoints.push({ height, blockHash })
        checkpoints.sort((a, b) => a.height - b.height)
      }
    },

    getCheckpoints() {
      return [...checkpoints]
    },

    getLastCheckpoint() {
      return checkpoints.length > 0
        ? checkpoints[checkpoints.length - 1]
        : undefined
    },

    removeAbove(height) {
      let i = checkpoints.length
      while (i > 0 && checkpoints[i - 1]!.height > height) {
        i--
      }
      checkpoints.length = i
    },
  }
}
