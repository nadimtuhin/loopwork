export class ProcessRegistry {
  register(pid: number): void {}
  unregister(pid: number): void {}
  getAll(): number[] {
    return []
  }
}

export const globalRegistry = new ProcessRegistry()
