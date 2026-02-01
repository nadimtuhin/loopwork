import { describe, test, expect } from 'bun:test'

describe('expect.resolvers.not.toThrow', () => {
  test('should pass when promise resolves to undefined', async () => {
    const promise = Promise.resolve(undefined)
    await expect(promise).resolves.not.toThrow()
  })

  test('should fail when promise rejects with undefined', async () => {
    const promise = Promise.reject(new Error('test'))
    await expect(promise).resolves.not.toThrow()
  })
})
