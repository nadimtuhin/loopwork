import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { CheckpointIntegrator } from '../../src/core/checkpoint-integrator'
import fs from 'fs'
import path from 'path'
import { rm } from 'fs/promises'

describe('CheckpointIntegrator', () => {
  const testRoot = path.join(process.cwd(), '.test-checkpoint')

  beforeEach(async () => {
    if (fs.existsSync(testRoot)) {
      await rm(testRoot, { recursive: true, force: true })
    }
  })

  afterEach(async () => {
    if (fs.existsSync(testRoot)) {
      await rm(testRoot, { recursive: true, force: true })
    }
  })

  test('should not checkpoint if disabled', async () => {
    const integrator = new CheckpointIntegrator({ enabled: false }, testRoot)
    await integrator.checkpoint({ taskId: 'test' })
    
    expect(fs.existsSync(path.join(testRoot, '.loopwork/checkpoints'))).toBe(false)
  })

  test('should checkpoint if enabled', async () => {
    const integrator = new CheckpointIntegrator({ enabled: true }, testRoot)
    await integrator.checkpoint({ 
      taskId: 'test-task',
      iteration: 1,
      context: { foo: 'bar' }
    })
    
    const checkpointPath = path.join(testRoot, '.loopwork/checkpoints/loopwork-core/context.json')
    expect(fs.existsSync(checkpointPath)).toBe(true)
    
    const content = JSON.parse(fs.readFileSync(checkpointPath, 'utf-8'))
    expect(content.taskId).toBe('test-task')
    expect(content.iteration).toBe(1)
    expect(content.state.context.foo).toBe('bar')
  })

  test('should respect interval', () => {
    const integrator = new CheckpointIntegrator({ enabled: true, interval: 3 }, testRoot)
    
    expect(integrator.shouldCheckpoint(0)).toBe(false)
    expect(integrator.shouldCheckpoint(1)).toBe(false)
    expect(integrator.shouldCheckpoint(2)).toBe(false)
    expect(integrator.shouldCheckpoint(3)).toBe(true)
    expect(integrator.shouldCheckpoint(6)).toBe(true)
  })

  test('should restore checkpoint', async () => {
    const integrator = new CheckpointIntegrator({ enabled: true }, testRoot)
    await integrator.checkpoint({ 
      taskId: 'test-task',
      context: { val: 42 }
    })
    
    const restored = await integrator.restore()
    expect(restored.context.val).toBe(42)
  })

  test('should increment iteration', () => {
    const integrator = new CheckpointIntegrator({}, testRoot)
    expect(integrator.getIteration()).toBe(0)
    integrator.incrementIteration()
    expect(integrator.getIteration()).toBe(1)
  })
})
