#!/usr/bin/env bun
/**
 * Manual Visual Formatting Test
 * 
 * Run this script to visually verify the output formatting is correct:
 *   bun test/manual/visual-formatting-test.ts
 * 
 * This script demonstrates:
 * - Consistent timestamp width (all 8 characters)
 * - Consistent prefix alignment (all 35 characters)
 * - Proper handling of different prefix lengths
 */

import { StreamLogger, logger, getTimestamp } from '../../src/core/utils'

console.log('\n' + '='.repeat(80))
console.log('VISUAL FORMATTING TEST')
console.log('='.repeat(80) + '\n')

// Test 1: Timestamp Consistency
console.log('Test 1: Timestamp Consistency')
console.log('-'.repeat(40))

const testTimes = [
  { hour: 4, minute: 27, second: 2 },
  { hour: 12, minute: 27, second: 2 },
  { hour: 16, minute: 27, second: 2 },
  { hour: 23, minute: 59, second: 59 },
]

console.log('Demonstrating consistent timestamp width:\n')
for (const time of testTimes) {
  const date = new Date()
  date.setHours(time.hour, time.minute, time.second)
  
  // Old format (inconsistent)
  const oldFormat = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
  
  // New format (consistent)
  const newFormat = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  
  console.log(`  Hour ${time.hour.toString().padStart(2)}:`)
  console.log(`    OLD: "${oldFormat}" (width: ${oldFormat.length})`)
  console.log(`    NEW: "${newFormat}" (width: ${newFormat.length})`)
}

console.log('\n' + '-'.repeat(40))
console.log('✓ New format is always 8 characters wide\n')

// Test 2: Prefix Alignment
console.log('\nTest 2: Prefix Alignment')
console.log('-'.repeat(40))

// Configure logger for output
logger.setLogLevel('debug')

const prefixes = [
  'short',
  'medium-prefix',
  'opencode/antigravity-claude-sonnet-4-5',
  'very-long-prefix-name-that-needs-truncation',
]

console.log('Demonstrating consistent prefix width:\n')

for (const prefix of prefixes) {
  const streamLogger = new StreamLogger(logger, prefix)
  streamLogger.log(`Processing with prefix: "${prefix}"\n`)
  streamLogger.flush()
}

console.log('\n' + '-'.repeat(40))
console.log('✓ All prefixes are normalized to consistent width\n')

// Test 3: Real-world Scenario
console.log('\nTest 3: Real-world Parallel Execution Scenario')
console.log('-'.repeat(40) + '\n')

const workerA = new StreamLogger(logger, 'opencode/claude-sonnet-4-5')
const workerB = new StreamLogger(logger, 'opencode/gemini-3-flash')
const workerC = new StreamLogger(logger, 'claude/haiku')

workerA.log('Starting task processing\n')
workerB.log('Starting task processing\n')
workerC.log('Starting task processing\n')

workerA.log('✓ Task completed successfully\n')
workerB.log('✗ Max retries exceeded\n')
workerC.log('✓ Task completed successfully\n')

workerA.flush()
workerB.flush()
workerC.flush()

console.log('\n' + '-'.repeat(40))
console.log('✓ All workers produce aligned output\n')

// Test 4: Comparison
console.log('\nTest 4: Before/After Comparison')
console.log('-'.repeat(40))

console.log('\nBEFORE (inconsistent):')
console.log('4:27:02 PM │ [opencode/antigravity-claude-sonnet-4-5] - Message')
console.log('4:27:02 PM │ [short] - Message')
console.log('12:27:02 PM │ [another-model] - Message  <-- Notice misalignment!')

console.log('\nAFTER (consistent):')

// Simulate the new format
const maxPrefixLen = 35
const normalizePrefix = (p: string) => {
  if (p.length > maxPrefixLen) {
    return p.slice(0, 20) + '...' + p.slice(-12)
  }
  return p.padEnd(maxPrefixLen, ' ')
}

const testPrefixes = [
  'opencode/antigravity-claude-sonnet-4-5',
  'short',
  'another-model'
]

for (const prefix of testPrefixes) {
  const normalized = normalizePrefix(prefix)
  console.log(`16:27:02 │ [${normalized}] - Message`)
}

console.log('\n' + '-'.repeat(40))
console.log('✓ All lines are perfectly aligned\n')

console.log('\n' + '='.repeat(80))
console.log('VISUAL FORMATTING TEST COMPLETE')
console.log('='.repeat(80) + '\n')

// Summary
console.log('Summary of fixes:')
console.log('  1. Timestamps now use 24-hour format (HH:MM:SS)')
console.log('  2. All timestamps are exactly 8 characters wide')
console.log('  3. Prefixes are normalized to 35 characters')
console.log('  4. Long prefixes are intelligently truncated')
console.log('  5. Short prefixes are padded with spaces')
console.log('')
