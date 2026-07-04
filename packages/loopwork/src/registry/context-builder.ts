/**
 * Command Context Builder
 *
 * Helper functions to build CommandContext objects for ICommand execution.
 * Bridges commander.js execution context with the ICommand interface.
 */

import type { CommandContext, FileSystem, Path, ProcessUtils } from '@loopwork-ai/contracts'
import fs from 'fs'
import path from 'path'

/**
 * Build a CommandContext object with standard implementations
 * for filesystem, path, and process utilities.
 */
export function buildCommandContext(deps?: Record<string, unknown>): CommandContext {
  return {
    logger: {
      info: (msg: string) => console.log(msg),
      warn: (msg: string) => console.warn(msg),
      error: (msg: string) => console.error(msg),
      debug: (msg: string) => {
        if (process.env.DEBUG === 'true') {
          console.log(`[DEBUG] ${msg}`)
        }
      },
      success: (msg: string) => console.log(msg),
      raw: (msg: string) => console.log(msg),
    },
    fs: {
      existsSync: (filePath: string) => fs.existsSync(filePath),
      readFileSync: (filePath: string, encoding = 'utf-8') => {
        return fs.readFileSync(filePath, encoding) as string
      },
      writeFileSync: (filePath: string, content: string) => {
        fs.writeFileSync(filePath, content, 'utf-8')
      },
      readdirSync: (dirPath: string) => {
        return fs.readdirSync(dirPath)
      },
      mkdirSync: (dirPath: string, options?: { recursive?: boolean }) => {
        fs.mkdirSync(dirPath, options)
      },
    },
    path: {
      join: (...paths: string[]) => path.join(...paths),
      dirname: (filePath: string) => path.dirname(filePath),
      basename: (filePath: string) => path.basename(filePath),
      relative: (from: string, to: string) => path.relative(from, to),
    },
    process: {
      cwd: () => process.cwd(),
      exit: (code: number) => process.exit(code),
      env: () => ({ ...process.env }),
      isCI: () => {
        return process.env.CI === 'true' || process.env.CONTINUOUS_INTEGRATION === 'true'
      },
      isTTY: () => Boolean(process.stdout.isTTY),
    },
    deps,
  }
}
