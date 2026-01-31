import { BaseCliInvoker, stripModelPrefix } from './base-invoker'
import type { CliInvokeOptions } from '../contracts/invoker'

/**
 * Claude Code CLI Invoker
 *
 * Supports models: opus, sonnet, haiku
 * CLI: claude
 *
 * Handles prefixed models like "anthropic/claude-3-sonnet"
 */
export class ClaudeInvoker extends BaseCliInvoker {
  readonly name = 'claude'
  readonly description = 'Claude Code CLI (Anthropic)'
  readonly command = 'claude'

  private static readonly MODELS = [
    'opus',
    'sonnet',
    'haiku',
    'claude-3-opus',
    'claude-3-sonnet',
    'claude-3-haiku',
    'claude-sonnet-4-20250514',
    'claude-haiku-3-20240307',
  ]

  getSupportedModels(): string[] {
    return ClaudeInvoker.MODELS
  }

  buildArgs(options: CliInvokeOptions): string[] {
    const args: string[] = ['--print'] // Non-interactive mode

    // Model selection - strip any provider prefix first
    if (options.model) {
      const strippedModel = stripModelPrefix(options.model)
      const normalizedModel = this.normalizeModel(strippedModel)
      args.push('--model', normalizedModel)
    }

    // Tool allowlist
    if (options.tools && options.tools.length > 0) {
      args.push('--allowedTools', options.tools.join(','))
    }

    // Add prompt as positional arg
    args.push(options.prompt)

    return args
  }

  private normalizeModel(model: string): string {
    // Map short names to full model IDs
    const modelMap: Record<string, string> = {
      opus: 'claude-sonnet-4-20250514',
      sonnet: 'claude-sonnet-4-20250514',
      haiku: 'claude-haiku-3-20240307',
    }
    return modelMap[model.toLowerCase()] ?? model
  }
}
