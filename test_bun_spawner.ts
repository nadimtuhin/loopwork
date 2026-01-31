
import { BunSpawner } from './packages/loopwork/src/core/spawners/bun-spawner'

async function test() {
  const spawner = new BunSpawner()
  if (!spawner.isAvailable()) {
    console.log('BunSpawner not available')
    return
  }
  
  console.log('Spawning "echo hello"')
  const proc = spawner.spawn('echo', ['hello'])
  
  proc.stdout?.on('data', (data) => {
    console.log(`STDOUT: ${data.toString()}`)
  })
  
  proc.on('close', (code) => {
    console.log(`Process exited with code ${code}`)
  })
}

test().catch(console.error)
