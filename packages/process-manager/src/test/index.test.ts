import { describe, expect, test } from 'bun:test'
import { isProcessAlive } from '../index'

describe('index', () => {

  describe('isProcessAlive', () => {
    test('should be a function', () => {
      expect(typeof isProcessAlive).toBe('function')
    })

    test('should detect current process as alive', () => {
      expect(isProcessAlive(process.pid)).toBe(true)
    })
  })
})
