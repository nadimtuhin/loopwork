import { describe, it, expect } from 'bun:test'
import { sum } from './math'

describe('sum', () => {
  it('should add two positive integers', () => {
    const result = sum(2, 3)
    expect(result).toBe(5)
  })

  it('should add two negative integers', () => {
    const result = sum(-2, -3)
    expect(result).toBe(-5)
  })

  it('should add positive and negative integers', () => {
    const result = sum(5, -3)
    expect(result).toBe(2)
  })

  it('should handle decimal numbers', () => {
    const result = sum(2.5, 3.7)
    expect(result).toBe(6.2)
  })

  it('should handle zero', () => {
    const result = sum(0, 5)
    expect(result).toBe(5)
  })
})
