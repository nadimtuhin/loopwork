#!/usr/bin/env node

/**
 * Simple IPC Message Capture Example
 *
 * This script spawns loopwork and captures IPC messages from stdout.
 * Run with: node capture-ipc.js
 */

import { spawn } from 'child_process'

console.log('🚀 Starting loopwork with IPC monitoring...\n')

const loopwork = spawn('npx', ['loopwork'], {
  stdio: ['pipe', 'pipe', 'pipe']
})

let buffer = ''
const ipcPattern = /__IPC_START__(.*?)__IPC_END__/g

// Track statistics
const stats = {
  messages: 0,
  tasks_started: 0,
  tasks_completed: 0,
  tasks_failed: 0
}

// Capture stdout (IPC messages + regular logs)
loopwork.stdout.on('data', (chunk) => {
  const text = chunk.toString()
  buffer += text

  // Extract and process IPC messages
  let match
  while ((match = ipcPattern.exec(buffer)) !== null) {
    try {
      const message = JSON.parse(match[1])

      if (message.type === 'ipc') {
        stats.messages++
        handleIPCMessage(message)

        // Remove processed message from buffer
        buffer = buffer.replace(match[0], '')
      }
    } catch (e) {
      console.error('❌ Failed to parse IPC message:', e.message)
    }
  }

  // Also print regular logs (everything that's not IPC)
  const cleanText = text.replace(ipcPattern, '').trim()
  if (cleanText) {
    console.log(cleanText)
  }
})

// Capture stderr
loopwork.stderr.on('data', (chunk) => {
  console.error(chunk.toString())
})

// Handle process exit
loopwork.on('close', (code) => {
  console.log('\n' + '='.repeat(50))
  console.log('📊 IPC Statistics:')
  console.log('='.repeat(50))
  console.log(`Total IPC Messages:   ${stats.messages}`)
  console.log(`Tasks Started:        ${stats.tasks_started}`)
  console.log(`Tasks Completed:      ${stats.tasks_completed}`)
  console.log(`Tasks Failed:         ${stats.tasks_failed}`)
  console.log('='.repeat(50))
  console.log(`\nLoopwork exited with code: ${code}`)
})

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n⚠️  Stopping loopwork...')
  loopwork.kill('SIGINT')
})

/**
 * Handle IPC messages
 */
function handleIPCMessage(message) {
  const timestamp = new Date(message.timestamp).toLocaleTimeString()
  const eventEmoji = {
    loop_start: '🔄',
    loop_end: '🏁',
    task_start: '▶️',
    task_complete: '✅',
    task_failed: '❌'
  }

  const emoji = eventEmoji[message.event] || '📬'

  switch (message.event) {
    case 'loop_start':
      console.log(`\n${emoji} [${timestamp}] Loop started`)
      console.log(`   Namespace: ${message.data.namespace}`)
      break

    case 'loop_end':
      console.log(`\n${emoji} [${timestamp}] Loop ended`)
      console.log(`   Completed: ${message.data.completed}`)
      console.log(`   Failed: ${message.data.failed}`)
      console.log(`   Duration: ${Math.round(message.data.duration / 1000)}s`)
      break

    case 'task_start':
      stats.tasks_started++
      console.log(`\n${emoji} [${timestamp}] Task started`)
      console.log(`   ID: ${message.data.taskId}`)
      console.log(`   Title: ${message.data.title}`)
      console.log(`   Iteration: ${message.data.iteration}`)
      break

    case 'task_complete':
      stats.tasks_completed++
      const minutes = Math.floor(message.data.duration / 60000)
      const seconds = Math.floor((message.data.duration % 60000) / 1000)
      console.log(`\n${emoji} [${timestamp}] Task completed`)
      console.log(`   ID: ${message.data.taskId}`)
      console.log(`   Title: ${message.data.title}`)
      console.log(`   Duration: ${minutes}m ${seconds}s`)
      console.log(`   Success: ${message.data.success}`)
      break

    case 'task_failed':
      stats.tasks_failed++
      console.log(`\n${emoji} [${timestamp}] Task failed`)
      console.log(`   ID: ${message.data.taskId}`)
      console.log(`   Title: ${message.data.title}`)
      console.log(`   Error: ${message.data.error}`)
      break

    default:
      console.log(`\n${emoji} [${timestamp}] ${message.event}`)
      console.log(`   Data:`, JSON.stringify(message.data, null, 2))
  }

  // Show message ID for debugging
  if (process.env.DEBUG) {
    console.log(`   Message ID: ${message.messageId}`)
  }
}
