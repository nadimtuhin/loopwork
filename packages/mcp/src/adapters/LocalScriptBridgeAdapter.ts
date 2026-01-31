import { spawnSync } from 'child_process'
import { logger } from '@loopwork-ai/loopwork'
import type { McpScript } from '../index'

export interface LocalScriptRunResult {
  stdout: string
  stderr: string
  exitCode: number | null
  data?: any
}

export class LocalScriptBridgeAdapter {
  constructor(private readonly scripts: Record<string, McpScript> = {}) {}

  async run(name: string, args: Record<string, unknown>): Promise<LocalScriptRunResult> {
    const script = this.scripts[name]
    if (!script) {
      throw new Error(`Script not found: ${name}`)
    }

    const runtime = script.runtime || this.detectRuntime(script.source)
    const env = { 
      ...process.env, 
      ...(script.env || {}),
      MCP_TOOL_ARGS: JSON.stringify(args)
    }

    let command = ''
    let spawnArgs: string[] = []

    switch (runtime) {
      case 'node':
        command = 'node'
        spawnArgs = [script.source, JSON.stringify(args)]
        break
      case 'bun':
        command = 'bun'
        spawnArgs = ['run', script.source, JSON.stringify(args)]
        break
      case 'python':
        command = 'python3'
        spawnArgs = [script.source, JSON.stringify(args)]
        break
      case 'bash':
        command = 'bash'
        spawnArgs = [script.source, JSON.stringify(args)]
        break
      default:
        throw new Error(`Unsupported runtime: ${runtime}`)
    }

    logger.debug(`Executing local script tool: ${name} (${command} ${spawnArgs.join(' ')})`)

    const result = spawnSync(command, spawnArgs, {
      env,
      encoding: 'utf-8',
      timeout: 30000,
    })

    if (result.error) {
      logger.error(`Error executing local script ${name}: ${result.error.message}`)
      throw result.error
    }

    let data: any
    try {
      const lines = result.stdout.trim().split('\n')
      const lastLine = lines[lines.length - 1]
      if (lastLine.startsWith('{') || lastLine.startsWith('[')) {
        data = JSON.parse(lastLine)
      }
    } catch {
    }

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.status,
      data,
    }
  }

  private detectRuntime(source: string): 'node' | 'bun' | 'python' | 'bash' {
    if (source.endsWith('.js')) return 'node'
    if (source.endsWith('.ts')) return 'bun'
    if (source.endsWith('.py')) return 'python'
    if (source.endsWith('.sh')) return 'bash'
    return 'node'
  }

  registerTools(registry: any): void {
    for (const name of Object.keys(this.scripts)) {
      registry.registerLocalTool({
        name,
        description: `Local script tool: ${name}`,
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: true,
        },
        handler: async (args: any) => {
          const result = await this.run(name, args)
          if (result.exitCode !== 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Script failed with exit code ${result.exitCode}\n\nSTDOUT:\n${result.stdout}\n\nSTDERR:\n${result.stderr}`,
                }
              ],
              isError: true,
            }
          }
          
          return {
            content: [
              {
                type: 'text',
                text: result.data ? JSON.stringify(result.data, null, 2) : result.stdout,
              }
            ]
          }
        }
      })
    }
  }
}

