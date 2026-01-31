import { mkdir, readFile, writeFile, rm, readdir, stat, appendFile } from 'fs/promises'
import { existsSync } from 'fs'
import { dirname } from 'path'
import type { IFileSystem } from '../contracts'

export class NodeFileSystem implements IFileSystem {
  async writeFile(path: string, content: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content, 'utf-8')
  }

  async readFile(path: string): Promise<string> {
    return readFile(path, 'utf-8')
  }

  async appendFile(path: string, content: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    await appendFile(path, content, 'utf-8')
  }

  async exists(path: string): Promise<boolean> {
    return existsSync(path)
  }

  async remove(path: string): Promise<void> {
    await rm(path, { recursive: true, force: true })
  }

  async readdir(path: string): Promise<string[]> {
    return readdir(path)
  }

  async stat(path: string): Promise<{ mtime: Date; size: number }> {
    const s = await stat(path)
    return { mtime: s.mtime, size: s.size }
  }

  async mkdir(path: string): Promise<void> {
    await mkdir(path, { recursive: true })
  }
}
