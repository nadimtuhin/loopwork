import type { IFileSystem, ICheckpointStorage, AgentCheckpoint } from '../contracts'

export class FileCheckpointStorage implements ICheckpointStorage {
  constructor(
    private readonly fs: IFileSystem,
    private readonly basePath: string = '.loopwork/agents'
  ) {}

  private getPath(agentId: string): string {
    return `${this.basePath}/${agentId}`
  }

  async save(checkpoint: AgentCheckpoint): Promise<void> {
    const path = `${this.getPath(checkpoint.agentId)}/context.json`
    await this.fs.writeFile(path, JSON.stringify(checkpoint, null, 2))
  }

  async load(agentId: string): Promise<AgentCheckpoint | null> {
    const path = `${this.getPath(agentId)}/context.json`
    if (!(await this.fs.exists(path))) return null
    const content = await this.fs.readFile(path)
    const data = JSON.parse(content)
    // Convert timestamp string back to Date
    data.timestamp = new Date(data.timestamp)
    return data
  }

  async appendOutput(agentId: string, output: string): Promise<void> {
    const path = `${this.getPath(agentId)}/output.log`
    await this.fs.appendFile(path, output)
  }

  async getOutput(agentId: string): Promise<string> {
    const path = `${this.getPath(agentId)}/output.log`
    if (!(await this.fs.exists(path))) return ''
    return this.fs.readFile(path)
  }

  async delete(agentId: string): Promise<void> {
    await this.fs.remove(this.getPath(agentId))
  }

  async list(): Promise<string[]> {
    if (!(await this.fs.exists(this.basePath))) return []
    return this.fs.readdir(this.basePath)
  }

  async cleanup(maxAgeDays: number): Promise<number> {
    const ids = await this.list()
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
    const now = Date.now()
    let deleted = 0

    for (const id of ids) {
      const checkpoint = await this.load(id)
      if (checkpoint && now - checkpoint.timestamp.getTime() > maxAgeMs) {
        await this.delete(id)
        deleted++
      }
    }
    return deleted
  }
}
