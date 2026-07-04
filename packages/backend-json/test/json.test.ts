import { describe, expect, test } from 'bun:test'
import { JsonTaskAdapter } from '../src/index'

/**
 * JSON Backend Tests
 * 
 * Test suite for JsonTaskAdapter
 */

describe('JsonTaskAdapter', () => {
  test('should instantiate without errors', () => {
    const instance = new JsonTaskAdapter({ type: 'json' })
    expect(instance).toBeDefined()
    expect(instance).toBeInstanceOf(JsonTaskAdapter)
  })

  test('should maintain instance identity', () => {
    const instance1 = new JsonTaskAdapter({ type: 'json' })
    const instance2 = new JsonTaskAdapter({ type: 'json' })
    expect(instance1).not.toBe(instance2)
  })

  test('should have correct name property', () => {
    const instance = new JsonTaskAdapter({ type: 'json' })
    expect(instance.name).toBe('json')
  })
})

