/**
 * Task Backend Module
 *
 * Provides adapter pattern for multiple task sources.
 * Use createBackend() factory to instantiate appropriate adapter.
 */

/**
 * Task Backend Module
 *
 * Provides adapter pattern for multiple task sources.
 * Use createBackend() factory to instantiate appropriate adapter.
 */

export * from './types'
export { JsonTaskAdapter } from '@loopwork-ai/backend-json'
export { GitHubTaskAdapter } from '@loopwork-ai/backend-github'
export { FallbackTaskBackend } from './fallback'
export { LocalVectorStore } from '../vector-stores/local-vector-store'
export {
  withJSONBackend,
  withGitHubBackend,
  withFallbackBackend,
  getBackendPlugin,
  createJSONBackendPlugin,
  createGitHubBackendPlugin,
  createFallbackBackendPlugin,
  type BackendPlugin,
  type BackendConfig,
  type FallbackBackendConfig,
} from './plugin'

import type { TaskBackend, BackendConfig, JsonBackendConfig, GithubBackendConfig } from './types'
import { JsonTaskAdapter, type JsonBackendConfig as JsonBackendConfigType } from '@loopwork-ai/backend-json'
import { GitHubTaskAdapter, type GitHubBackendConfig as GitHubBackendConfigType } from '@loopwork-ai/backend-github'
import { LoopworkError } from '../core/errors'

/**
 * Create a task backend based on configuration
 *
 * @example
 * // GitHub Issues backend
 * const backend = createBackend({ type: 'github', repo: 'owner/repo' })
 *
 * @example
 * // JSON file backend
 * const backend = createBackend({
 *   type: 'json',
 *   tasksFile: '.specs/tasks/tasks.json'
 * })
 */
export function createBackend(config: BackendConfig): TaskBackend {
  switch (config.type) {
    case 'github':
      return new GitHubTaskAdapter({ repo: config.repo } as GitHubBackendConfigType)

    case 'json':
      return new JsonTaskAdapter({
        tasksFile: config.tasksFile,
        tasksDir: config.tasksDir,
      } as JsonBackendConfigType)

    case 'fallback':
      throw new LoopworkError(
        'ERR_BACKEND_INVALID',
        'Fallback backend must be initialized via plugins',
        [
          'The fallback backend requires nested primary and fallback backends.',
          'Use the withFallbackBackend() plugin in your loopwork.config.ts instead.',
          'Example:',
          '  export default compose(',
          '    withFallbackBackend({',
          '      primary: createGitHubBackendPlugin({ repo: "..." }),',
          '      fallback: createJSONBackendPlugin()',
          '    })',
          '  )(defineConfig({ ... }))'
        ]
      )

    default:
      throw new LoopworkError(
        'ERR_BACKEND_INVALID',
        `Unknown backend type: "${(config as { type?: string }).type}"`,
        [
          'Valid backend types: "json" or "github"',
          'Check your loopwork.config.ts backend configuration',
          'Example: backend: { type: "json", tasksFile: "..." }',
          'Or run: npx loopwork init'
        ],
        'https://github.com/nadimtuhin/loopwork#configuration'
      )
  }
}

/**
 * Auto-detect backend from environment/files
 *
 * Detection order:
 * 1. If LOOPWORK_BACKEND env var is set, use that
 * 2. If .specs/tasks/tasks.json exists, use json
 * 3. Default to github
 */
export function detectBackend(projectRoot: string): BackendConfig {
  const envBackend = process.env.LOOPWORK_BACKEND

  if (envBackend === 'json') {
    return {
      type: 'json',
      tasksFile: `${projectRoot}/.specs/tasks/tasks.json`,
      tasksDir: `${projectRoot}/.specs/tasks`,
    }
  }

  if (envBackend === 'github') {
    return {
      type: 'github',
      repo: process.env.LOOPWORK_REPO,
    }
  }

  // Auto-detect
  const fs = require('fs')
  const jsonTasksFile = `${projectRoot}/.specs/tasks/tasks.json`

  if (fs.existsSync(jsonTasksFile)) {
    return {
      type: 'json',
      tasksFile: jsonTasksFile,
      tasksDir: `${projectRoot}/.specs/tasks`,
    }
  }

  // Default to GitHub
  return {
    type: 'github',
    repo: process.env.LOOPWORK_REPO,
  }
}
