import { BaseCliInvoker, stripModelPrefix } from './base-invoker'
import type { CliInvokeOptions } from '../contracts/invoker'

/**
 * Droid CLI Invoker
 *
 * Supports Gemini models via droid CLI
 * CLI: droid
 *
 * Handles prefixed models like "google/gemini-3-flash"
 */
export class DroidInvoker extends BaseCliInvoker {
  readonly name = 'droid'
  readonly description = 'Droid CLI (Google Gemini)'
  readonly command = 'droid'

  private static readonly MODELS = [
    // Gemini models (primary for droid)
    'gemini-pro',
    'gemini-flash',
    'gemini-2.0-flash',
    'gemini-3-flash',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    // Legacy/alternative models
    'gpt-4',
    'gpt-4o',
    'gpt-3.5-turbo',
  ]

  getSupportedModels(): string[] {
    return DroidInvoker.MODELS
  }

  buildArgs(options: CliInvokeOptions): string[] {
    const args: string[] = []

    // Model selection - strip any provider prefix (e.g., "google/gemini-3-flash" → "gemini-3-flash")
    if (options.model) {
      const strippedModel = stripModelPrefix(options.model)
      args.push('-m', strippedModel)
    }

    // Add prompt (droid uses -p for prompt)
    args.push('-p', options.prompt)

    return args
  }
}
