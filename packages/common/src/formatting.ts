import chalk from 'chalk'

/**
 * Shared formatting utilities for Loopwork dashboard and CLI output systems
 */

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number | undefined): string {
  if (!ms) return '0s'

  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

/**
 * Format duration in milliseconds to short format for UI displays
 */
export function formatDurationShort(ms: number | undefined): string {
  if (!ms) return '0s'

  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h`
  }
  if (minutes > 0) {
    const secs = seconds % 60
    return secs === 0 ? `${minutes}m` : `${minutes}m${secs}s`
  }
  return `${seconds}s`
}

/**
 * Format relative time from timestamp
 */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const diff = now - timestamp

  if (diff < 60000) { // Less than 1 minute
    return 'just now'
  }
  if (diff < 3600000) { // Less than 1 hour
    const minutes = Math.floor(diff / 60000)
    return `${minutes}m ago`
  }
  if (diff < 86400000) { // Less than 1 day
    const hours = Math.floor(diff / 3600000)
    return `${hours}h ago`
  }

  const days = Math.floor(diff / 86400000)
  return `${days}d ago`
}

/**
 * Truncate text to specified length with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength - 3) + '...'
}

/**
 * Pad text to right with spaces
 */
export function padRight(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - text.length))
}

/**
 * Pad text to left with spaces
 */
export function padLeft(text: string, width: number): string {
  return ' '.repeat(Math.max(0, width - text.length)) + text
}

/**
 * Center text within specified width
 */
export function center(text: string, width: number): string {
  const padding = Math.max(0, width - text.length)
  const leftPad = Math.floor(padding / 2)
  const rightPad = padding - leftPad
  return ' '.repeat(leftPad) + text + ' '.repeat(rightPad)
}

/**
 * Format task ID for display
 */
export function formatTaskId(id: string): string {
  return `[${id}]`
}

/**
 * Format percentage to string
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`
}

/**
 * Get percentage as fraction (0-1)
 */
export function fractionPercentage(value: number): number {
  return Math.min(Math.max(value / 100, 0), 1)
}

/**
 * Calculate filled length for progress bars
 */
export function calculateBarFilled(current: number, total: number, barLength: number): number {
  if (total === 0 || current > total) return barLength
  return Math.round((current / total) * barLength)
}

/**
 * Calculate empty length for progress bars
 */
export function calculateBarEmpty(current: number, total: number, barLength: number): number {
  if (total === 0) return barLength
  return barLength - calculateBarFilled(current, total, barLength)
}
