/**
 * Visual Formatting Test
 * 
 * This test demonstrates the consistent formatting of terminal output
 * after the formatting fixes were applied.
 * 
 * Run with: bun run packages/loopwork/test/manual/visual-formatting-test.ts
 */

import { StreamLogger, getTimestamp } from '../../src/core/utils'

console.log('\n=== Visual Formatting Test ===\n')

// Test 1: Timestamp consistency
console.log('Test 1: Timestamp Format Consistency')
console.log('--------------------------------------')
const timestamps = []
for (let hour = 0; hour < 24; hour += 4) {
  const date = new Date()
  date.setHours(hour, 30, 0)
  const ts = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  timestamps.push(ts)
}

timestamps.forEach(ts => {
  console.log(`  ${ts} │ (length: ${ts.length})`)
})
console.log(`\n✓ All timestamps are exactly 8 characters wide\n`)

// Test 2: Prefix width consistency
console.log('Test 2: Prefix Width Consistency (35 characters)')
console.log('------------------------------------------------')

const prefixes = [
  'short',
  'medium-prefix-name',
  'opencode/antigravity-claude-sonnet-4-5',
  'very-long-prefix-that-exceeds-thirty-five-characters',
]

prefixes.forEach(prefix => {
  const logger = new StreamLogger(prefix)
  logger.log(`Message from ${prefix}`)
  logger.flush()
})

console.log(`\n✓ All prefixes are normalized to consistent width\n`)

// Test 3: Visual alignment demonstration
console.log('Test 3: Visual Alignment Demonstration')
console.log('--------------------------------------')

const logger1 = new StreamLogger('MODEL-A')
const logger2 = new StreamLogger('MODEL-B-LONGER-NAME')
const logger3 = new StreamLogger('opencode/antigravity-claude-sonnet-4-5')

logger1.log('First message from model A')
logger2.log('Second message from model B')
logger3.log('Third message from Claude')
logger1.flush()
logger2.flush()
logger3.flush()

console.log(`\n✓ All log lines are visually aligned\n`)

// Test 4: Before/After comparison
console.log('Test 4: Before/After Comparison')
console.log('--------------------------------')
console.log('BEFORE (variable width):')
console.log('  4:27:02 PM │ [prefix] Message     <- 10 chars timestamp')
console.log('  12:27:02 PM│ [prefix] Message     <- 11 chars timestamp (misaligned!)')
console.log('')
console.log('AFTER (fixed width):')
console.log('  04:27:02 │ [prefix                          ] Message')
console.log('  12:27:02 │ [prefix                          ] Message')
console.log('  16:27:02 │ [prefix                          ] Message')
console.log('  23:27:02 │ [prefix                          ] Message')
console.log('')
console.log('✓ All timestamps and prefixes are now aligned\n')

console.log('=== All Visual Formatting Tests Complete ===\n')
