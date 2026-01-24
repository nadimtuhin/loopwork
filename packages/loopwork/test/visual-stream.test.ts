import { logger, StreamLogger } from '../src/core/utils'

/**
 * MANUAL VISUAL VERIFICATION SCRIPT
 * 
 * This script is intended for manual visual verification of the terminal output.
 * It tests if the logger.update (bottom line) and StreamLogger (scrolling lines above)
 * work correctly together without leaving artifacts or double lines.
 * 
 * This is specifically to verify that log lines from subprocesses (via StreamLogger)
 * correctly clear the transient status line (via logger.update) and push it down.
 * 
 * Run with: bun test/visual-stream.test.ts
 */

async function runVisualTest() {
  console.log('Starting visual test for 2 seconds...')
  
  const startTime = Date.now()
  const streamLogger = new StreamLogger('SUBPROCESS')

  // Timer interval every 100ms using logger.update (transient status line)
  const timerInterval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    logger.update(`Running visual test: ${elapsed}s elapsed...`)
  }, 100)

  // Stream logs every 300ms using StreamLogger (persistent log lines)
  const logInterval = setInterval(() => {
    const randomValue = Math.floor(Math.random() * 1000)
    streamLogger.log(`Simulated subprocess output: data=${randomValue}\n`)
  }, 300)

  // Run for 2 seconds to allow visual observation
  await new Promise((resolve) => setTimeout(resolve, 2000))

  clearInterval(timerInterval)
  clearInterval(logInterval)
  
  streamLogger.flush()
  process.stdout.write('\n')
  logger.success('Visual test completed.')
}

runVisualTest().catch(console.error)
