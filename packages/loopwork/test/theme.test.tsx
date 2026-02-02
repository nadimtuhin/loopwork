import { describe, test, expect } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { Text } from 'ink'
import { mockTTY } from './setup-ink'
import {
  ThemeProvider,
  useTheme,
  useThemeColors,
  useThemeColor,
  createTheme,
  getAvailableThemes,
  isHighContrast,
  defaultTheme,
  type ThemeVariant,
} from '../src/theme'
import {
  lightThemeColors,
  darkThemeColors,
  highContrastLightColors,
  highContrastDarkColors,
} from '../src/theme'

// Setup TTY mock for Ink rendering
mockTTY(true)

describe('Theme System', () => {
  describe('Color Palettes', () => {
    test('light theme colors should have all required tokens', () => {
      expect(lightThemeColors).toHaveProperty('primary')
      expect(lightThemeColors).toHaveProperty('secondary')
      expect(lightThemeColors).toHaveProperty('background')
      expect(lightThemeColors).toHaveProperty('text')
      expect(lightThemeColors).toHaveProperty('success')
      expect(lightThemeColors).toHaveProperty('warning')
      expect(lightThemeColors).toHaveProperty('error')
      expect(lightThemeColors).toHaveProperty('info')
      expect(lightThemeColors).toHaveProperty('border')
      expect(lightThemeColors).toHaveProperty('borderHighlight')
      expect(lightThemeColors).toHaveProperty('accent')
      expect(lightThemeColors).toHaveProperty('progressBar')
      expect(lightThemeColors).toHaveProperty('progressTrack')
      expect(lightThemeColors).toHaveProperty('spinner')
    })

    test('dark theme colors should have all required tokens', () => {
      expect(darkThemeColors).toHaveProperty('primary')
      expect(darkThemeColors).toHaveProperty('background')
      expect(darkThemeColors).toHaveProperty('text')
      expect(darkThemeColors.background).toBe('black')
      expect(darkThemeColors.text).toBe('white')
    })

    test('high contrast light theme extends light theme', () => {
      expect(highContrastLightColors.primary).not.toBe(lightThemeColors.primary)
      expect(highContrastLightColors.background).toBe(lightThemeColors.background)
      expect(highContrastLightColors.text).toBe(lightThemeColors.text)
    })

    test('high contrast dark theme extends dark theme', () => {
      // High contrast dark uses same primary as dark theme
      expect(highContrastDarkColors.primary).toBe(darkThemeColors.primary)
      expect(highContrastDarkColors.background).toBe(darkThemeColors.background)
      expect(highContrastDarkColors.text).toBe(darkThemeColors.text)
    })
  })

  describe('Helper Functions', () => {
    test('getAvailableThemes should return all theme variants', () => {
      const themes = getAvailableThemes()
      expect(themes).toContain('light')
      expect(themes).toContain('dark')
      expect(themes).toContain('high-contrast-light')
      expect(themes).toContain('high-contrast-dark')
      expect(themes.length).toBe(4)
    })

    test('isHighContrast should identify high contrast themes', () => {
      expect(isHighContrast('high-contrast-light')).toBe(true)
      expect(isHighContrast('high-contrast-dark')).toBe(true)
      expect(isHighContrast('light')).toBe(false)
      expect(isHighContrast('dark')).toBe(false)
    })

    test('createTheme should return correct theme config', () => {
      const theme = createTheme('dark')
      expect(theme.variant).toBe('dark')
      expect(theme.colors).toEqual(darkThemeColors)
    })

    test('createTheme should support all variants', () => {
      const variants: ThemeVariant[] = ['light', 'dark', 'high-contrast-light', 'high-contrast-dark']
      for (const variant of variants) {
        const theme = createTheme(variant)
        expect(theme.variant).toBe(variant)
        expect(theme.colors).toBeDefined()
      }
    })
  })

  describe('defaultTheme', () => {
    test('default theme should be dark', () => {
      expect(defaultTheme.variant).toBe('dark')
      expect(defaultTheme.colors).toEqual(darkThemeColors)
    })
  })
})

describe('ThemeProvider Component', () => {
  test('ThemeProvider should be instantiable', () => {
    // Verify ThemeProvider is a valid React component
    expect(typeof ThemeProvider).toBe('function')
  })

  test('useTheme should be a function', () => {
    expect(typeof useTheme).toBe('function')
  })

  test('useThemeColors should be a function', () => {
    expect(typeof useThemeColors).toBe('function')
  })

  test('useThemeColor should be a function', () => {
    expect(typeof useThemeColor).toBe('function')
  })
})

describe('Theme Integration', () => {
  test('theme colors should be compatible with Ink color types', () => {
    // Verify colors are valid ink color names
    const validColors = [
      'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
      'gray', 'grey', 'brightBlack', 'brightRed', 'brightGreen', 'brightYellow',
      'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'
    ]

    // Check dark theme colors are valid
    for (const [key, value] of Object.entries(darkThemeColors)) {
      expect(validColors).toContain(value)
    }

    // Check light theme colors are valid
    for (const [key, value] of Object.entries(lightThemeColors)) {
      expect(validColors).toContain(value)
    }
  })

  test('theme variants should have consistent structure', () => {
    const themeKeys = Object.keys(darkThemeColors)
    const lightThemeKeys = Object.keys(lightThemeColors)

    expect(themeKeys.length).toBe(lightThemeKeys.length)
    expect(themeKeys).toEqual(lightThemeKeys)
  })

  test('color contrast should differ between light and dark themes', () => {
    // Background and text should differ between themes
    expect(darkThemeColors.background).not.toBe(lightThemeColors.background)
    expect(darkThemeColors.text).not.toBe(lightThemeColors.text)

    // But certain semantic colors should remain consistent
    expect(darkThemeColors.success).toBe(lightThemeColors.success)
    expect(darkThemeColors.warning).toBe(lightThemeColors.warning)
    expect(darkThemeColors.error).toBe(lightThemeColors.error)
    expect(darkThemeColors.info).toBe(lightThemeColors.info)
  })
})
