import { IpcMessageBus } from '../../src/ipc-bus'
import { createEvent } from '../../src/local-bus'

const bus = new IpcMessageBus()

bus.send(createEvent('worker:ready', { pid: process.pid }))

bus.subscribe('ping', async (event) => {
  await bus.send(createEvent('pong', { 
    originalId: event.id,
    timestamp: Date.now() 
  }))
})

bus.subscribe('echo', async (event) => {
  await bus.send(createEvent('echo-reply', event.payload))
})

bus.subscribe('terminate', () => {
  process.exit(0)
})

setInterval(() => {}, 10000)
