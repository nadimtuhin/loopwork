
import { StreamLogger, logger } from './packages/loopwork/src/core/utils'
import chalk from 'chalk'

// Mock logger.renderer.render to see when it's called
const originalRender = logger.renderer.render.bind(logger.renderer)
let lastRenderTime = Date.now()

logger.renderer.render = (event) => {
  const now = Date.now()
  const diff = now - lastRenderTime
  console.log(`[RENDER] Type: ${event.type}, Diff: ${diff}ms, Content: ${event.content || event.message || ''}`)
  lastRenderTime = now
  // originalRender(event) // Don't actually render to avoid cluttering
}

const streamLogger = new StreamLogger('TEST')

async function test() {
  console.log('Sending "Hello "')
  streamLogger.log('Hello ')
  
  await new Promise(resolve => setTimeout(resolve, 500))
  
  console.log('Sending "World"')
  streamLogger.log('World')
  
  await new Promise(resolve => setTimeout(resolve, 500))
  
  console.log('Sending "\\n"')
  streamLogger.log('\n')
  
  await new Promise(resolve => setTimeout(resolve, 500))
  
  console.log('Sending "Token-by-token stream: "')
  const tokens = ['This ', 'is ', 'real-time ', 'streaming.']
  for (const token of tokens) {
    console.log(`Sending "${token}"`)
    streamLogger.log(token)
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  
  console.log('Sending "\\n"')
  streamLogger.log('\n')
}

test().catch(console.error)
