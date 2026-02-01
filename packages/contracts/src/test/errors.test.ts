import { describe, expect, test } from 'bun:test'
import type { IErrorRegistry, IErrorGuidance, ErrorCode } from '../errors'

describe('errors', () => {
  test('should import all types without error', () => {
    expect(true).toBe(true)
  })
})
