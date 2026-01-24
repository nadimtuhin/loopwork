import { describe, it, expect } from 'bun:test'
import { sayHello } from './hello'

describe('sayHello', () => {
  it('should return "Hello, World!"', () => {
    const result = sayHello()
    expect(result).toBe('Hello, World!')
  })
})
