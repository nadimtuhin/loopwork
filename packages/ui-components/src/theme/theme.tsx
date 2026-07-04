/**
 * Theme System
 *
 * Provides a centralized theme management system with dark/light mode support
 * for the Loopwork terminal UI components.
 */

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { ThemeColors, InkColor } from './colors'
import {
  lightThemeColors,
  darkThemeColors,
  highContrastLightColors,
  highContrastDarkColors,
} from './colors'

/**
 * Theme variant options.
 */
export type ThemeVariant = 'light' | 'dark' | 'high-contrast-light' | 'high-contrast-dark'

/**
 * Theme configuration interface.
 */
export interface ThemeConfig {
  variant: ThemeVariant
  colors: ThemeColors
}

/**
 * Default theme configuration.
 */
export const defaultTheme: ThemeConfig = {
  variant: 'dark',
  colors: darkThemeColors,
}

/**
 * Map of theme variants to their colors.
 */
const themeColorMap: Record<ThemeVariant, ThemeColors> = {
  'light': lightThemeColors,
  'dark': darkThemeColors,
  'high-contrast-light': highContrastLightColors,
  'high-contrast-dark': highContrastDarkColors,
}

/**
 * Theme context interface.
 */
export interface ThemeContextValue {
  theme: ThemeConfig
  setTheme: (variant: ThemeVariant) => void
  toggleTheme: () => void
  colors: ThemeColors
}

/**
 * Theme context for managing theme state across components.
 */
export const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Theme provider component.
 * Wraps children with theme context and handles theme switching.
 */
export function ThemeProvider({
  children,
  initialVariant = 'dark',
}: {
  children: ReactNode
  initialVariant?: ThemeVariant
}): React.ReactElement {
  const [variant, setVariant] = useState<ThemeVariant>(initialVariant)

  const theme: ThemeConfig = {
    variant,
    colors: themeColorMap[variant],
  }

  const setTheme = (newVariant: ThemeVariant): void => {
    setVariant(newVariant)
  }

  const toggleTheme = (): void => {
    if (variant === 'dark') {
      setVariant('light')
    } else if (variant === 'light') {
      setVariant('dark')
    }
  }

  const value: ThemeContextValue = {
    theme,
    setTheme,
    toggleTheme,
    colors: theme.colors,
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

/**
 * Hook to access the current theme.
 * Must be used within a ThemeProvider.
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

/**
 * Hook to access only the theme colors.
 * Convenience hook for components that only need colors.
 */
export function useThemeColors(): ThemeColors {
  return useTheme().colors
}

/**
 * Get a specific color from the current theme.
 */
export function useThemeColor<K extends keyof ThemeColors>(colorKey: K): InkColor {
  const colors = useThemeColors()
  return colors[colorKey]
}

/**
 * Helper function to create a theme configuration.
 */
export function createTheme(variant: ThemeVariant): ThemeConfig {
  return {
    variant,
    colors: themeColorMap[variant],
  }
}

/**
 * Get all available theme variants.
 */
export function getAvailableThemes(): ThemeVariant[] {
  return ['light', 'dark', 'high-contrast-light', 'high-contrast-dark']
}

/**
 * Check if a theme variant is high contrast.
 */
export function isHighContrast(variant: ThemeVariant): boolean {
  return variant.startsWith('high-contrast')
}
