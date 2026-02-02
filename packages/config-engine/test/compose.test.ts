import { describe, expect, test, mock } from 'bun:test'
import { compose, defineConfig, withPlugin } from '../src/compose'
import { validateConfig, LoopworkConfig } from '../src/validator'
import type { LoopworkPlugin } from '@loopwork-ai/contracts'

describe('Config Engine', () => {
  test('defineConfig returns config with defaults', () => {
    const config = defineConfig({
      backend: { type: 'json', tasksFile: 'tasks.json' }
    } as LoopworkConfig)

    expect(config.cli).toBe('claude')
    expect(config.maxIterations).toBe(50)
    expect(config.backend).toEqual({ type: 'json', tasksFile: 'tasks.json' })
    expect(config.plugins).toEqual([])
  })

  test('withPlugin adds plugin to config', () => {
    const plugin: LoopworkPlugin = { name: 'test-plugin' }
    const wrapper = withPlugin(plugin)
    
    const config = wrapper({
      backend: { type: 'json', tasksFile: 'tasks.json' }
    } as LoopworkConfig)

    expect(config.plugins).toContain(plugin)
  })

  test('compose applies multiple wrappers', () => {
    const plugin1: LoopworkPlugin = { name: 'p1' }
    const plugin2: LoopworkPlugin = { name: 'p2' }
    
    const composed = compose(
      withPlugin(plugin1),
      withPlugin(plugin2)
    )

    const config = composed(defineConfig({
      backend: { type: 'json', tasksFile: 'tasks.json' }
    } as LoopworkConfig))

    expect(config.plugins).toHaveLength(2)
    expect(config.plugins).toContain(plugin1)
    expect(config.plugins).toContain(plugin2)
  })

  test('validator validates correct config', () => {
    const config = {
      backend: { type: 'json', tasksFile: 'tasks.json' },
      cli: 'claude',
      maxIterations: 10
    }

    const validated = validateConfig(config)
    expect(validated.cli).toBe('claude')
  })

  test('validator throws on invalid config', () => {
    const config = {
      // missing backend
      cli: 'claude'
    }

    expect(() => validateConfig(config)).toThrow()
  })
})
