/**
 * Debugger TUI (Text User Interface)
 *
 * Provides interactive terminal UI for debugging sessions.
 * Supports inspect, breakpoint management, and edit-and-continue.
 */

/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as readline from 'readline'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { spawn } from 'child_process'
import chalk from 'chalk'
import type {
  IDebuggerTUI,
  DebugEvent,
  TUICommand,
  TUIResult,
  DebugEventType,
  PrePromptEvent,
} from '../contracts/debugger'
import type { TaskContext } from '../contracts/plugin'

/**
 * TUI implementation for interactive debugging
 */
export class DebuggerTUI implements IDebuggerTUI {
  private rl: readline.Interface | null = null

  /**
   * Show prompt and wait for user command
   */
  async prompt(event: DebugEvent, context?: TaskContext): Promise<TUIResult> {
    this.displayState(event, context)

    const input = await this.readline(chalk.cyan('debug> '))
    const parts = input.trim().toLowerCase().split(/\s+/)
    const cmd = parts[0] || ''

    switch (cmd) {
      case 'c':
      case 'continue':
        return { command: 'continue' }

      case 's':
      case 'step':
        return { command: 'step' }

      case 'i':
      case 'inspect':
        return { command: 'inspect' }

      case 'b':
      case 'breakpoint':
      case 'bp':
        const eventType = this.parseEventType(parts[1])
        return { command: 'breakpoint', eventType }

      case 'l':
      case 'list':
        return { command: 'list' }

      case 'e':
      case 'edit':
        if (event.type !== 'PRE_PROMPT') {
          console.log(chalk.yellow('Edit command only available at PRE_PROMPT breakpoints'))
          return this.prompt(event, context)
        }
        return { command: 'edit' }

      case 'q':
      case 'quit':
        return { command: 'quit' }

      case 'h':
      case 'help':
      case '?':
        return { command: 'help' }

      default:
        if (cmd) {
          console.log(chalk.yellow(`Unknown command: ${cmd}. Type 'help' for available commands.`))
        }
        return this.prompt(event, context)
    }
  }

  /**
   * Display current debugger state
   */
  displayState(event: DebugEvent, context?: TaskContext): void {
    console.log('')
    console.log(chalk.bgBlue.white(' DEBUGGER PAUSED '))
    console.log('')

    // Event info
    console.log(chalk.bold('Event:'), chalk.yellow(event.type))
    if (event.taskId) {
      console.log(chalk.bold('Task:'), event.taskId)
    }
    if (event.iteration !== undefined) {
      console.log(chalk.bold('Iteration:'), event.iteration)
    }
    console.log(chalk.bold('Time:'), new Date(event.timestamp).toISOString())

    // Event-specific data
    if (event.data) {
      console.log(chalk.bold('Data:'))
      for (const [key, value] of Object.entries(event.data)) {
        const displayValue = typeof value === 'string' && value.length > 100
          ? value.substring(0, 100) + '...'
          : JSON.stringify(value)
        console.log(`  ${key}: ${displayValue}`)
      }
    }

    // Error info
    if (event.error) {
      console.log(chalk.bold.red('Error:'), event.error)
    }

    // Task context
    if (context) {
      console.log('')
      console.log(chalk.bold('Task Context:'))
      console.log(`  ID: ${context.task.id}`)
      console.log(`  Title: ${context.task.title}`)
      console.log(`  Status: ${context.task.status}`)
      if (context.retryAttempt !== undefined && context.retryAttempt > 0) {
        console.log(`  Retry Attempt: ${context.retryAttempt}`)
      }
    }

    // PRE_PROMPT specific: show prompt preview
    if (event.type === 'PRE_PROMPT') {
      const prePromptEvent = event as PrePromptEvent
      if (prePromptEvent.prompt) {
        console.log('')
        console.log(chalk.bold('Prompt Preview:'))
        const lines = prePromptEvent.prompt.split('\n')
        const preview = lines.slice(0, 10).join('\n')
        console.log(chalk.gray(preview))
        if (lines.length > 10) {
          console.log(chalk.gray(`... (${lines.length - 10} more lines)`))
        }
        console.log('')
        console.log(chalk.cyan('Tip: Use "edit" command to modify the prompt before execution'))
      }
    }

    console.log('')
  }

  /**
   * Display help information
   */
  displayHelp(): void {
    console.log('')
    console.log(chalk.bold('Debugger Commands:'))
    console.log('')
    console.log('  ' + chalk.cyan('c, continue') + '     Continue execution')
    console.log('  ' + chalk.cyan('s, step') + '         Step to next event')
    console.log('  ' + chalk.cyan('i, inspect') + '      Show current state')
    console.log('  ' + chalk.cyan('b, bp <event>') + '   Toggle breakpoint (e.g., bp PRE_PROMPT)')
    console.log('  ' + chalk.cyan('l, list') + '         List all breakpoints')
    console.log('  ' + chalk.cyan('e, edit') + '         Edit prompt in $EDITOR (PRE_PROMPT only)')
    console.log('  ' + chalk.cyan('h, help') + '         Show this help')
    console.log('  ' + chalk.cyan('q, quit') + '         Exit debugger')
    console.log('')
    console.log(chalk.bold('Event Types:'))
    console.log('  LOOP_START, LOOP_END, TASK_START, PRE_TASK,')
    console.log('  POST_TASK, PRE_PROMPT, TOOL_CALL, ERROR')
    console.log('')
  }

  /**
   * Open prompt in editor for editing (Edit & Continue)
   *
   * Creates a temp file with the prompt content, opens $EDITOR,
   * and reads back the modified content.
   */
  async editPrompt(prompt: string): Promise<string | null> {
    const editor = process.env.EDITOR || process.env.VISUAL || 'vi'
    const tmpDir = os.tmpdir()
    const tmpFile = path.join(tmpDir, `loopwork-prompt-${Date.now()}.md`)

    try {
      // Write prompt to temp file
      fs.writeFileSync(tmpFile, prompt, 'utf-8')

      // Get original stats for comparison
      const originalStat = fs.statSync(tmpFile)
      const originalContent = prompt

      console.log(chalk.cyan(`Opening prompt in ${editor}...`))
      console.log(chalk.gray(`Temp file: ${tmpFile}`))

      // Spawn editor and wait for it to close
      await new Promise<void>((resolve, reject) => {
        const child = spawn(editor, [tmpFile], {
          stdio: 'inherit',
          shell: true,
        })

        child.on('error', (err) => {
          reject(new Error(`Failed to open editor: ${err.message}`))
        })

        child.on('close', (code) => {
          if (code === 0) {
            resolve()
          } else {
            reject(new Error(`Editor exited with code ${code}`))
          }
        })
      })

      // Read back the file
      const newContent = fs.readFileSync(tmpFile, 'utf-8')

      // Check if file was modified
      const newStat = fs.statSync(tmpFile)
      const wasModified = newStat.mtime > originalStat.mtime || newContent !== originalContent

      // Validate the edited content
      if (!newContent.trim()) {
        console.log(chalk.yellow('Warning: Empty prompt detected. Using original prompt.'))
        return null
      }

      if (wasModified) {
        console.log(chalk.green('Prompt modified successfully'))
        return newContent
      } else {
        console.log(chalk.gray('No changes detected'))
        return null
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.log(chalk.red(`Error editing prompt: ${message}`))
      return null
    } finally {
      // Clean up temp file
      try {
        if (fs.existsSync(tmpFile)) {
          fs.unlinkSync(tmpFile)
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Read a line from stdin
   */
  private readline(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      if (!this.rl) {
        this.rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        })
      }

      this.rl.question(prompt, (answer) => {
        resolve(answer)
      })
    })
  }

  /**
   * Parse event type from user input
   */
  private parseEventType(input?: string): DebugEventType | undefined {
    if (!input) return undefined

    const normalized = input.toUpperCase()
    const validTypes: DebugEventType[] = [
      'LOOP_START',
      'LOOP_END',
      'TASK_START',
      'PRE_TASK',
      'POST_TASK',
      'PRE_PROMPT',
      'TOOL_CALL',
      'AGENT_RESPONSE',
      'ERROR',
    ]

    const match = validTypes.find(t => t === normalized || t.startsWith(normalized))
    if (!match) {
      console.log(chalk.yellow(`Unknown event type: ${input}`))
      console.log(chalk.gray(`Valid types: ${validTypes.join(', ')}`))
    }
    return match
  }

  /**
   * Close the readline interface
   */
  close(): void {
    if (this.rl) {
      this.rl.close()
      this.rl = null
    }
  }
}
