import { expect, test } from 'bun:test'
import { version } from '../src/index'

test('version should be 0.1.0', () => {
  expect(version).toBe('0.1.0')
})
