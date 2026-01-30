import { OrphanProcess, detectOrphans } from './orphan-detector'
import { OrphanKiller, KillResult } from './orphan-killer'
import { logger } from './utils'

/**
 * Test runner patterns to match
 */
const TEST_RUNNER_PATTERNS = [
  'bun test',
  'jest',
  'vitest',
  'mocha',
  'npm test',
  'pnpm test',
  'yarn test',
  'npx jest',
  'npx vitest',
  'npx mocha',
]

export interface StaleTestKillerOptions {
  projectRoot: string
  maxAge?: number
  dryRun?: boolean
  silent?: boolean
}

/**
 * StaleTestKiller - Targets stale test runner processes specifically
 *
 * This class provides aggressive cleanup of test runners that have been
 * running longer than expected (default 10 minutes).
 */
export class StaleTestKiller {
  private options: Required<StaleTestKillerOptions>
  private killer: OrphanKiller

  constructor(options: StaleTestKillerOptions) {
    this.options = {
      projectRoot: options.projectRoot,
      maxAge: options.maxAge ?? 600000, // 10 minutes default
      dryRun: options.dryRun ?? false,
      silent: options.silent ?? false,
    }

    this.killer = new OrphanKiller()
  }

  /**
   * Get the test runner patterns being watched
   */
  getPatterns(): string[] {
    return [...TEST_RUNNER_PATTERNS]
  }

  /**
   * Find stale test runners without killing them
   */
  async findStaleTestRunners(): Promise<OrphanProcess[]> {
    const { projectRoot, maxAge } = this.options

    // Use orphan detector with test runner patterns
    const allOrphans = await detectOrphans({
      projectRoot,
      patterns: TEST_RUNNER_PATTERNS,
      maxAge,
    })

    // Filter to only test runners (double-check pattern matching)
    const testRunners = allOrphans.filter((orphan) => {
      return TEST_RUNNER_PATTERNS.some((pattern) => orphan.command.includes(pattern))
    })

    return testRunners
  }

  /**
   * Find and kill all stale test runners
   */
  async kill(): Promise<KillResult> {
    const { dryRun, silent } = this.options

    if (!silent) {
      logger.debug(`Scanning for stale test runners (maxAge: ${this.options.maxAge}ms)`)
    }

    // Find stale test runners
    const staleTestRunners = await this.findStaleTestRunners()

    if (staleTestRunners.length === 0) {
      if (!silent) {
        logger.debug('No stale test runners found')
      }
      return {
        killed: [],
        skipped: [],
        failed: [],
      }
    }

    if (!silent) {
      logger.info(`Found ${staleTestRunners.length} stale test runner(s)`)
      for (const runner of staleTestRunners) {
        const ageMinutes = Math.floor(runner.age / 60000)
        logger.debug(`  PID ${runner.pid}: ${runner.command} (age: ${ageMinutes}m)`)
      }
    }

    // Kill them (force=true to kill both confirmed and suspected)
    const result = await this.killer.kill(staleTestRunners, {
      force: true,
      dryRun,
      silent,
    })

    if (!silent && !dryRun) {
      if (result.killed.length > 0) {
        logger.success(`Killed ${result.killed.length} stale test runner(s)`)
      }
      if (result.failed.length > 0) {
        logger.warn(`Failed to kill ${result.failed.length} test runner(s)`)
        for (const failure of result.failed) {
          logger.debug(`  PID ${failure.pid}: ${failure.error}`)
        }
      }
    }

    return result
  }
}

/**
 * Factory function to create a StaleTestKiller instance
 */
export function createStaleTestKiller(options: StaleTestKillerOptions): StaleTestKiller {
  return new StaleTestKiller(options)
}
