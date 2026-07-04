/**
 * Theme Color Palette
 *
 * Defines semantic color tokens for consistent theming across the terminal UI.
 * Colors are organized by category and use descriptive names that indicate their purpose.
 */

// Base color names supported by ink
export type InkColor =
  | 'black'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'gray'
  | 'grey'
  | 'brightBlack'
  | 'brightRed'
  | 'brightGreen'
  | 'brightYellow'
  | 'brightBlue'
  | 'brightMagenta'
  | 'brightCyan'
  | 'brightWhite'

/**
 * Semantic color tokens for the theme system.
 * Each token represents a specific use case rather than a raw color value.
 */
export interface ThemeColors {
  // Primary/Background
  primary: InkColor
  secondary: InkColor
  background: InkColor
  backgroundAlt: InkColor

  // Text colors
  text: InkColor
  textMuted: InkColor
  textHighlight: InkColor

  // Status colors
  success: InkColor
  warning: InkColor
  error: InkColor
  info: InkColor

  // UI element colors
  border: InkColor
  borderHighlight: InkColor
  accent: InkColor

  // Progress colors
  progressBar: InkColor
  progressTrack: InkColor

  // Spinner
  spinner: InkColor
}

/**
 * Default light theme colors.
 * Optimized for light terminal backgrounds.
 */
export const lightThemeColors: ThemeColors = {
  primary: 'cyan',
  secondary: 'blue',
  background: 'white',
  backgroundAlt: 'gray',
  text: 'black',
  textMuted: 'gray',
  textHighlight: 'blue',
  success: 'green',
  warning: 'yellow',
  error: 'red',
  info: 'blue',
  border: 'gray',
  borderHighlight: 'cyan',
  accent: 'cyan',
  progressBar: 'cyan',
  progressTrack: 'gray',
  spinner: 'cyan',
}

/**
 * Default dark theme colors.
 * Optimized for dark terminal backgrounds.
 */
export const darkThemeColors: ThemeColors = {
  primary: 'cyan',
  secondary: 'blue',
  background: 'black',
  backgroundAlt: 'gray',
  text: 'white',
  textMuted: 'gray',
  textHighlight: 'cyan',
  success: 'green',
  warning: 'yellow',
  error: 'red',
  info: 'blue',
  border: 'gray',
  borderHighlight: 'cyan',
  accent: 'cyan',
  progressBar: 'cyan',
  progressTrack: 'gray',
  spinner: 'cyan',
}

/**
 * High contrast light theme for accessibility.
 */
export const highContrastLightColors: ThemeColors = {
  ...lightThemeColors,
  primary: 'blue',
  text: 'black',
  textMuted: 'gray',
  textHighlight: 'blue',
  accent: 'blue',
}

/**
 * High contrast dark theme for accessibility.
 */
export const highContrastDarkColors: ThemeColors = {
  ...darkThemeColors,
  primary: 'cyan',
  text: 'white',
  textMuted: 'gray',
  textHighlight: 'cyan',
  accent: 'cyan',
}

/**
 * All available color tokens for reference.
 */
export const allColorTokens: Record<keyof ThemeColors, InkColor> = {
  primary: 'cyan',
  secondary: 'blue',
  background: 'black',
  backgroundAlt: 'gray',
  text: 'white',
  textMuted: 'gray',
  textHighlight: 'cyan',
  success: 'green',
  warning: 'yellow',
  error: 'red',
  info: 'blue',
  border: 'gray',
  borderHighlight: 'cyan',
  accent: 'cyan',
  progressBar: 'cyan',
  progressTrack: 'gray',
  spinner: 'cyan',
}
