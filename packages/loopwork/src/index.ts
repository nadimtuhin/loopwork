import { logger } from './core/utils'

// Export library API for use in config files
export { defineConfig, compose, withPlugin, withJSONBackend, withGitHubBackend, withClaudeCode } from './plugins'
export type { LoopworkConfig, LoopworkPlugin, ConfigWrapper } from './contracts'

// Only run CLI if this is the main module
if (import.meta.main) {
  async function main() {
    const args = process.argv.slice(2)
    const command = args[0]

    if (command === 'init') {
      const { init } = await import('./commands/init')
      await init()
    } else {
      const { run } = await import('./commands/run')
      await run()
    }
  }

  main().catch((err) => {
    logger.error(`Unhandled error: ${err.message}`)
    process.exit(1)
  })
}
