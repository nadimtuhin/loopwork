import type { AgentCheckpoint, CheckpointEvent, RestoredContext } from './checkpoint'

export interface IFileSystem {
  writeFile(path: string, content: string): Promise<void>
  readFile(path: string): Promise<string>
  appendFile(path: string, content: string): Promise<void>
  exists(path: string): Promise<boolean>
  remove(path: string): Promise<void>
  readdir(path: string): Promise<string[]>
  stat(path: string): Promise<{ mtime: Date; size: number }>
  mkdir(path: string): Promise<void>
}

export interface ICheckpointStorage {
  save(checkpoint: AgentCheckpoint): Promise<void>
  load(agentId: string): Promise<AgentCheckpoint | null>
  appendOutput(agentId: string, output: string): Promise<void>
  getOutput(agentId: string): Promise<string>
  delete(agentId: string): Promise<void>
  list(): Promise<string[]>
  cleanup(maxAgeDays: number): Promise<number>
}

export interface ICheckpointManager {
  checkpoint(agentId: string, state: Partial<AgentCheckpoint>): Promise<void>
  restore(agentId: string): Promise<RestoredContext | null>
  onEvent(agentId: string, event: CheckpointEvent): Promise<void>
  clear(agentId: string): Promise<void>
}
