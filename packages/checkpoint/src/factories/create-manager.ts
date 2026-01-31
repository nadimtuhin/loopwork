import { CheckpointManager } from '../core/checkpoint-manager'
import { FileCheckpointStorage } from '../core/file-storage'
import { NodeFileSystem } from '../core/node-filesystem'
import type { ICheckpointManager, ICheckpointStorage, IFileSystem } from '../contracts'

export function createCheckpointManager(options?: {
  storage?: ICheckpointStorage
  fs?: IFileSystem
  basePath?: string
}): ICheckpointManager {
  const storage =
    options?.storage ??
    new FileCheckpointStorage(
      options?.fs ?? new NodeFileSystem(),
      options?.basePath ?? '.loopwork/agents'
    )
  return new CheckpointManager(storage)
}
