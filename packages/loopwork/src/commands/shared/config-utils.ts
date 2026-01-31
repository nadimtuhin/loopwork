import { getConfig, type Config } from '../../core/config'
import { createBackend } from '../../backends'
import type { TaskBackend } from '../../contracts/backend'

/**
 * Helper to get both backend and config in one call.
 * Useful for CLI commands.
 * 
 * @param options CLI options to pass to getConfig
 * @param deps Optional dependencies for injection
 */
export async function getBackendAndConfig(
  options: Record<string, unknown> = {},
  deps: {
    getConfig?: typeof getConfig
    createBackend?: typeof createBackend
  } = {}
): Promise<{ backend: TaskBackend; config: Config }> {
  const resolveConfig = deps.getConfig ?? getConfig
  const resolveBackend = deps.createBackend ?? createBackend

  const config = await resolveConfig(options)
  const backend = resolveBackend(config.backend)

  return { backend, config }
}
