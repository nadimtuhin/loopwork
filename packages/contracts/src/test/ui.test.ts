import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_BOX_CHARS,
  DEFAULT_COLORS,
  COLOR_RESET,
  DEFAULT_PROGRESS_BAR,
  DEFAULT_TABLE,
  DEFAULT_SPINNER,
  DEFAULT_THEME,
  LIGHTWEIGHT_SPINNER,
  LIGHTWEIGHT_THEME,
  type ThemeColors,
  type BoxChars,
  type ProgressBarStyle,
  type TableStyle,
  type SpinnerStyle,
  type Theme,
  type IRenderContext,
  type RenderEnvironment
} from '../ui'

/**
 * ui Tests
 *
 * Auto-generated test suite for ui
 */

describe('ui', () => {
  describe('DEFAULT_BOX_CHARS', () => {
    test('should be defined', () => {
      expect(DEFAULT_BOX_CHARS).toBeDefined()
      expect(typeof DEFAULT_BOX_CHARS).toBe('object')
    })
  })

  describe('DEFAULT_COLORS', () => {
    test('should be defined', () => {
      expect(DEFAULT_COLORS).toBeDefined()
      expect(typeof DEFAULT_COLORS).toBe('object')
    })
  })

  describe('COLOR_RESET', () => {
    test('should be defined', () => {
      expect(COLOR_RESET).toBeDefined()
      expect(typeof COLOR_RESET).toBe('string')
    })
  })

  describe('DEFAULT_PROGRESS_BAR', () => {
    test('should be defined', () => {
      expect(DEFAULT_PROGRESS_BAR).toBeDefined()
      expect(typeof DEFAULT_PROGRESS_BAR).toBe('object')
    })
  })

  describe('DEFAULT_TABLE', () => {
    test('should be defined', () => {
      expect(DEFAULT_TABLE).toBeDefined()
      expect(typeof DEFAULT_TABLE).toBe('object')
    })
  })

  describe('DEFAULT_SPINNER', () => {
    test('should be defined', () => {
      expect(DEFAULT_SPINNER).toBeDefined()
      expect(typeof DEFAULT_SPINNER).toBe('object')
    })
  })

  describe('DEFAULT_THEME', () => {
    test('should be defined', () => {
      expect(DEFAULT_THEME).toBeDefined()
      expect(typeof DEFAULT_THEME).toBe('object')
    })
  })

  describe('LIGHTWEIGHT_SPINNER', () => {
    test('should be defined', () => {
      expect(LIGHTWEIGHT_SPINNER).toBeDefined()
      expect(typeof LIGHTWEIGHT_SPINNER).toBe('object')
    })
  })

  describe('LIGHTWEIGHT_THEME', () => {
    test('should be defined', () => {
      expect(LIGHTWEIGHT_THEME).toBeDefined()
      expect(typeof LIGHTWEIGHT_THEME).toBe('object')
    })
  })
})
