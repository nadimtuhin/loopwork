import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { createSpawner, getDefaultSpawner, isPtyFunctional } from '../../src/core/spawners'
import { isPtyAvailable } from '../../src/core/spawners/pty-spawner'
import type { ProcessSpawner } from '../../src/contracts/spawner'

describe('Spawner Factory', () => {
  afterEach(() => {
    mock.restore()
  })

  describe('createSpawner', () => {
    test('returns a ProcessSpawner', () => {
      const spawner = createSpawner()
      expect(spawner).toBeDefined()
      expect(typeof spawner.spawn).toBe('function')
      expect(typeof spawner.isAvailable).toBe('function')
      expect(typeof spawner.name).toBe('string')
    })

    test('createSpawner(true) prefers PTY when functional', () => {
      const spawner = createSpawner(true)
      if (isPtyFunctional()) {
        expect(spawner.name).toBe('pty')
      } else {
        // Falls back to standard if PTY not functional
        expect(spawner.name).toBe('standard')
      }
    })

    test('createSpawner(false) always returns standard spawner', () => {
      const spawner = createSpawner(false)
      expect(spawner.name).toBe('standard')
    })

    test('default (no args) behaves like createSpawner(true)', () => {
      const spawnerDefault = createSpawner()
      const spawnerTrue = createSpawner(true)
      expect(spawnerDefault.name).toBe(spawnerTrue.name)
    })

    test('returns spawner that can spawn processes', async () => {
      const spawner = createSpawner()
      const proc = spawner.spawn('echo', ['factory test'])

      let output = ''
      proc.stdout?.on('data', (data: Buffer | string) => {
        output += data.toString()
      })

      await new Promise<void>((resolve) => {
        proc.on('close', () => resolve())
        proc.on('exit', () => resolve())
      })

      expect(output).toContain('factory test')
    })

    test('returned spawner isAvailable returns true', () => {
      const spawner = createSpawner()
      expect(spawner.isAvailable()).toBe(true)
    })
  })

  describe('getDefaultSpawner', () => {
    test('returns a ProcessSpawner', () => {
      const spawner = getDefaultSpawner()
      expect(spawner).toBeDefined()
      expect(typeof spawner.spawn).toBe('function')
      expect(typeof spawner.isAvailable).toBe('function')
    })

    test('returns same instance on multiple calls (singleton)', () => {
      const spawner1 = getDefaultSpawner()
      const spawner2 = getDefaultSpawner()
      expect(spawner1).toBe(spawner2)
    })

    test('returned spawner prefers PTY when functional', () => {
      const spawner = getDefaultSpawner()
      if (isPtyFunctional()) {
        expect(spawner.name).toBe('pty')
      } else {
        expect(spawner.name).toBe('standard')
      }
    })
  })

  describe('fallback behavior', () => {
    test('always returns a working spawner regardless of PTY availability', async () => {
      // This test ensures the factory always provides a working spawner
      const spawner = createSpawner(true)
      expect(spawner.isAvailable()).toBe(true)

      const proc = spawner.spawn('echo', ['fallback test'])

      const code = await new Promise<number | null>((resolve) => {
        proc.on('close', (c) => resolve(c))
        proc.on('exit', (c) => resolve(c))
      })

      expect(code).toBe(0)
    })
  })
})
