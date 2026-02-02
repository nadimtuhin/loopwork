import type { IGitAdapter } from '@loopwork-ai/contracts'
import { spawn } from 'child_process'

/**
 * Git adapter implementation using system git command
 */
export class GitAdapter implements IGitAdapter {
  constructor(private readonly workDir: string) {}

  /**
   * Run git diff
   */
  async diff(args: string[]): Promise<string> {
    return this.runGit(['diff', ...args])
  }

  /**
   * Run git status
   */
  async status(): Promise<string> {
    return this.runGit(['status', '--porcelain'])
  }

  private async runGit(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('git', args, {
        cwd: this.workDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (data) => {
        stdout += data
      })
      proc.stderr.on('data', (data) => {
        stderr += data
      })

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout)
        } else {
          reject(new Error(`git ${args[0]} failed: ${stderr}`))
        }
      })

      proc.on('error', reject)
    })
  }
}
