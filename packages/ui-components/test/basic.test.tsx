import { expect, test, describe } from 'bun:test'
import { HelloWorld } from '../src/components'
import React from 'react'

describe('HelloWorld', () => {
  test('is a function', () => {
    expect(typeof HelloWorld).toBe('function')
  })
})
