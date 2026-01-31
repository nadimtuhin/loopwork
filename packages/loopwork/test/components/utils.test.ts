import { describe, test, expect, mock } from 'bun:test'
import { supportsEmoji, getEmoji } from '../../src/components/utils'

describe('Component Utils', () => {
  describe('supportsEmoji', () => {
    test('should return a boolean', () => {
      const result = supportsEmoji()
      expect(typeof result).toBe('boolean')
    })
  })

  describe('getEmoji', () => {
    test('should return emoji or fallback', () => {
      const result = getEmoji('✅')
      expect(['✅', '[OK]']).toContain(result)
    })

    test('should handle unknown emoji', () => {
      const result = getEmoji('🚀')
      expect(result).toBe('🚀')
    })
  })
})
