import type {
  IVirtualFileSystem,
  VirtualFileMetadata,
  VirtualFileOptions,
} from '@loopwork-ai/contracts'

interface FileEntry {
  content: string
  metadata: VirtualFileMetadata
}

/**
 * VirtualFileSystem - In-memory file system for testing
 *
 * Provides an isolated file system environment that operates entirely
 * in memory without touching the real disk. Useful for testing file
 * operations in a controlled, reproducible manner.
 */
export class VirtualFileSystem implements IVirtualFileSystem {
  readonly id: string
  private files: Map<string, FileEntry>
  private mounts: Map<string, IVirtualFileSystem | string>

  constructor(id: string, initialContents?: Record<string, string>) {
    this.id = id
    this.files = new Map()
    this.mounts = new Map()

    if (initialContents) {
      for (const [path, content] of Object.entries(initialContents)) {
        this.writeFile(path, content)
      }
    }
  }

  private normalizePath(path: string): string {
    // Remove leading/trailing slashes and resolve . and ..
    const parts = path.split('/').filter(p => p && p !== '.')
    const resolved: string[] = []

    for (const part of parts) {
      if (part === '..') {
        resolved.pop()
      } else {
        resolved.push(part)
      }
    }

    return '/' + resolved.join('/')
  }

  private getDirectoryPath(path: string): string {
    const normalized = this.normalizePath(path)
    const lastSlash = normalized.lastIndexOf('/')
    if (lastSlash <= 0) return '/'
    return normalized.slice(0, lastSlash)
  }

  private getBaseName(path: string): string {
    const normalized = this.normalizePath(path)
    const parts = normalized.split('/')
    return parts[parts.length - 1] || ''
  }

  private ensureDirectoryExists(path: string, options?: VirtualFileOptions): void {
    if (path === '/') return

    const normalized = this.normalizePath(path)
    if (this.files.has(normalized)) {
      const entry = this.files.get(normalized)!
      if (!entry.metadata.isDirectory) {
        throw new Error(`ENOTDIR: not a directory, '${path}'`)
      }
      return
    }

    if (options?.recursive) {
      const parentDir = this.getDirectoryPath(normalized)
      this.ensureDirectoryExists(parentDir, options)
    }

    const now = Date.now()
    this.files.set(normalized, {
      content: '',
      metadata: {
        size: 0,
        createdAt: now,
        modifiedAt: now,
        isDirectory: true,
        mode: options?.mode ?? 0o755,
      },
    })
  }

  private checkMount(path: string): { vfs: IVirtualFileSystem; relativePath: string } | null {
    const normalized = this.normalizePath(path)
    for (const [mountPoint, source] of this.mounts) {
      if (normalized.startsWith(mountPoint)) {
        const relativePath = normalized.slice(mountPoint.length) || '/'
        if (typeof source === 'string') {
          // Real directory mount - not supported in this implementation
          return null
        }
        return { vfs: source, relativePath }
      }
    }
    return null
  }

  readFile(path: string, options?: VirtualFileOptions): string {
    const mount = this.checkMount(path)
    if (mount) {
      return mount.vfs.readFile(mount.relativePath, options)
    }

    const normalized = this.normalizePath(path)
    const entry = this.files.get(normalized)

    if (!entry) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`)
    }

    if (entry.metadata.isDirectory) {
      throw new Error(`EISDIR: illegal operation on a directory, read '${path}'`)
    }

    return entry.content
  }

  async readFileAsync(path: string, options?: VirtualFileOptions): Promise<string> {
    return this.readFile(path, options)
  }

  writeFile(path: string, content: string, options?: VirtualFileOptions): void {
    const mount = this.checkMount(path)
    if (mount) {
      return mount.vfs.writeFile(mount.relativePath, content, options)
    }

    const normalized = this.normalizePath(path)
    const parentDir = this.getDirectoryPath(normalized)

    if (options?.recursive) {
      this.ensureDirectoryExists(parentDir, options)
    } else if (parentDir !== '/' && !this.files.has(parentDir)) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`)
    }

    const now = Date.now()
    const existing = this.files.get(normalized)

    this.files.set(normalized, {
      content,
      metadata: {
        size: Buffer.byteLength(content, options?.encoding ?? 'utf8'),
        createdAt: existing?.metadata.createdAt ?? now,
        modifiedAt: now,
        isDirectory: false,
        mode: options?.mode ?? 0o644,
      },
    })
  }

  async writeFileAsync(path: string, content: string, options?: VirtualFileOptions): Promise<void> {
    this.writeFile(path, content, options)
  }

  exists(path: string): boolean {
    const mount = this.checkMount(path)
    if (mount) {
      return mount.vfs.exists(mount.relativePath)
    }

    const normalized = this.normalizePath(path)
    return this.files.has(normalized)
  }

  delete(path: string, options?: { recursive?: boolean }): void {
    const mount = this.checkMount(path)
    if (mount) {
      return mount.vfs.delete(mount.relativePath, options)
    }

    const normalized = this.normalizePath(path)
    const entry = this.files.get(normalized)

    if (!entry) {
      throw new Error(`ENOENT: no such file or directory, '${path}'`)
    }

    if (entry.metadata.isDirectory && !options?.recursive) {
      // Check if directory is empty
      const hasChildren = Array.from(this.files.keys()).some(
        key => key.startsWith(normalized + '/') && key !== normalized
      )
      if (hasChildren) {
        throw new Error(`ENOTEMPTY: directory not empty, '${path}'`)
      }
    }

    if (entry.metadata.isDirectory && options?.recursive) {
      // Delete all children first
      for (const key of Array.from(this.files.keys())) {
        if (key.startsWith(normalized + '/')) {
          this.files.delete(key)
        }
      }
    }

    this.files.delete(normalized)
  }

  async deleteAsync(path: string, options?: { recursive?: boolean }): Promise<void> {
    this.delete(path, options)
  }

  mkdir(path: string, options?: VirtualFileOptions): void {
    const mount = this.checkMount(path)
    if (mount) {
      return mount.vfs.mkdir(mount.relativePath, options)
    }

    const normalized = this.normalizePath(path)

    if (this.files.has(normalized)) {
      throw new Error(`EEXIST: file already exists, '${path}'`)
    }

    if (options?.recursive) {
      this.ensureDirectoryExists(normalized, options)
    } else {
      const parentDir = this.getDirectoryPath(normalized)
      if (parentDir !== '/' && !this.files.has(parentDir)) {
        throw new Error(`ENOENT: no such file or directory, '${path}'`)
      }

      const now = Date.now()
      this.files.set(normalized, {
        content: '',
        metadata: {
          size: 0,
          createdAt: now,
          modifiedAt: now,
          isDirectory: true,
          mode: options?.mode ?? 0o755,
        },
      })
    }
  }

  async mkdirAsync(path: string, options?: VirtualFileOptions): Promise<void> {
    this.mkdir(path, options)
  }

  readdir(path: string): string[] {
    const mount = this.checkMount(path)
    if (mount) {
      return mount.vfs.readdir(mount.relativePath)
    }

    const normalized = this.normalizePath(path)
    const entry = this.files.get(normalized)

    if (!entry) {
      throw new Error(`ENOENT: no such file or directory, '${path}'`)
    }

    if (!entry.metadata.isDirectory) {
      throw new Error(`ENOTDIR: not a directory, '${path}'`)
    }

    const entries: Set<string> = new Set()
    const prefix = normalized === '/' ? '/' : normalized + '/'

    for (const key of this.files.keys()) {
      if (key.startsWith(prefix) && key !== normalized) {
        const relativePath = key.slice(prefix.length)
        const firstPart = relativePath.split('/')[0]
        if (firstPart) {
          entries.add(firstPart)
        }
      }
    }

    return Array.from(entries).sort()
  }

  async readdirAsync(path: string): Promise<string[]> {
    return this.readdir(path)
  }

  stat(path: string): VirtualFileMetadata {
    const mount = this.checkMount(path)
    if (mount) {
      return mount.vfs.stat(mount.relativePath)
    }

    const normalized = this.normalizePath(path)
    const entry = this.files.get(normalized)

    if (!entry) {
      throw new Error(`ENOENT: no such file or directory, '${path}'`)
    }

    return { ...entry.metadata }
  }

  async statAsync(path: string): Promise<VirtualFileMetadata> {
    return this.stat(path)
  }

  copy(src: string, dest: string, options?: { recursive?: boolean }): void {
    const srcNormalized = this.normalizePath(src)
    const destNormalized = this.normalizePath(dest)
    const srcEntry = this.files.get(srcNormalized)

    if (!srcEntry) {
      throw new Error(`ENOENT: no such file or directory, '${src}'`)
    }

    if (srcEntry.metadata.isDirectory) {
      if (!options?.recursive) {
        throw new Error(`EISDIR: illegal operation on a directory, copy '${src}'`)
      }

      // Copy directory recursively
      this.mkdir(dest, { recursive: true })

      for (const key of this.files.keys()) {
        if (key.startsWith(srcNormalized + '/') && key !== srcNormalized) {
          const relativePath = key.slice(srcNormalized.length)
          const destPath = destNormalized + relativePath
          const entry = this.files.get(key)!

          if (entry.metadata.isDirectory) {
            this.mkdir(destPath, { recursive: true })
          } else {
            this.writeFile(destPath, entry.content)
          }
        }
      }
    } else {
      // Copy file
      this.writeFile(dest, srcEntry.content)
    }
  }

  move(src: string, dest: string): void {
    this.copy(src, dest, { recursive: true })
    this.delete(src, { recursive: true })
  }

  resolve(path: string): string {
    return this.normalizePath(path)
  }

  reset(): void {
    this.files.clear()
    this.mounts.clear()
  }

  getAllPaths(): string[] {
    return Array.from(this.files.keys()).sort()
  }

  mount(path: string, source: IVirtualFileSystem | string): void {
    const normalized = this.normalizePath(path)
    this.mounts.set(normalized, source)
  }
}
