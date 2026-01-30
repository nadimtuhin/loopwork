#!/usr/bin/env bun

/**
 * Output Utilities Demo
 *
 * Demonstrates the usage of Table, Banner, and separator utilities.
 */

import { logger, Table, Banner, separator } from '../src/core/utils'
import chalk from 'chalk'

console.log('\n' + chalk.bold.cyan('Output Utilities Demo') + '\n')

// ===== SEPARATOR DEMO =====
console.log(chalk.bold('1. Separators'))
console.log(separator('light', 60))
console.log('Light separator (single line)')
console.log(separator('heavy', 60))
console.log('Heavy separator (double line)')
console.log(separator('section', 60))
console.log('Section separator (with padding)\n')

// ===== TABLE DEMO =====
console.log(chalk.bold('2. Tables'))

const table1 = new Table(['PID', 'Command', 'Age', 'Status'])
table1.addRow(['12345', 'node server.js', '2h 30m', chalk.green('Running')])
table1.addRow(['12346', 'bun test', '15m', chalk.yellow('Pending')])
table1.addRow(['12347', 'claude --help', '5m', chalk.red('Failed')])
logger.raw(table1.render())

console.log('\nTable with alignment:')
const table2 = new Table(
  ['Name', 'Count', 'Status'],
  [
    { align: 'left', width: 20 },
    { align: 'right', width: 10 },
    { align: 'center', width: 15 },
  ]
)
table2.addRow(['Completed Tasks', '42', chalk.green('✓')])
table2.addRow(['Failed Tasks', '3', chalk.red('✗')])
table2.addRow(['Pending Tasks', '5', chalk.yellow('○')])
logger.raw(table2.render())

// ===== BANNER DEMO =====
console.log('\n' + chalk.bold('3. Banners'))

const banner1 = new Banner('Build Complete', 'heavy')
banner1.addRow('Duration', '5m 30s')
banner1.addRow('Tests Passed', '42/45')
banner1.addRow('Coverage', '87.3%')
logger.raw(banner1.render())

console.log('')

const banner2 = new Banner('System Status', 'light')
banner2.addRow('Uptime', '3d 12h 45m')
banner2.addRow('Memory', '4.2 GB / 16 GB')
banner2.addRow('Active Loops', '3')
logger.raw(banner2.render())

// ===== LOGGER INTEGRATION =====
console.log('\n' + chalk.bold('4. Logger Integration'))
logger.info('Regular info message with timestamp')
logger.success('Success message with emoji')
logger.warn('Warning message')
logger.raw(separator('heavy', 60))
logger.raw('Raw output - no timestamp, no prefix, just the text')
logger.raw(separator('heavy', 60))

console.log('\n' + chalk.bold.green('Demo complete!') + '\n')
