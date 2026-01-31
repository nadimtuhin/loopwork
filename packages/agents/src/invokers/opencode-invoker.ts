import { BaseCliInvoker, stripModelPrefix } from './base-invoker'
import type { CliInvokeOptions } from '../contracts/invoker'

/**
 * OpenCode CLI Invoker
 *
 * Supports models: gemini-flash, gemini-pro, gpt-4, gpt-4o
 * CLI: opencode
 *
 * Handles prefixed models like "openai/gpt-4o" or "google/gemini-flash"
 */
export class OpenCodeInvoker extends BaseCliInvoker {
  readonly name = 'opencode'
  readonly description = 'OpenCode CLI (Multi-provider)'
  readonly command = 'opencode'

  private static readonly MODELS = [
    'gemini-flash',
    'gemini-pro',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gpt-4',
    'gpt-4o',
    'gpt-4-turbo',
    'claude-3-opus',
    'claude-3-sonnet',
    'sonnet',
    'haiku',
  ]

  getSupportedModels(): string[] {
    return OpenCodeInvoker.MODELS
  }

  buildArgs(options: CliInvokeOptions): string[] {
    const args: string[] = []

    // Model selection - strip any provider prefix
    if (options.model) {
      const strippedModel = stripModelPrefix(options.model)
      args.push('--model', strippedModel)
    }

    // Non-interactive mode
    args.push('--yes')

    // Add prompt
    args.push('--prompt', options.prompt)

    return args
  }
}
