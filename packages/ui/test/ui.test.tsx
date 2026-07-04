import { expect, test, describe } from 'bun:test'
import { Banner, ProgressBar } from '../src/components'
import React from 'react'

describe('UI Components', () => {
  test('Banner is a function', () => {
    expect(typeof Banner).toBe('function')
  })

  test('ProgressBar is a function', () => {
    expect(typeof ProgressBar).toBe('function')
  })
})
