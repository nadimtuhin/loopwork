/**
 * Unified status system for Loopwork
 *
 * Provides consistent status colors, icons, and styling across:
 * - CLI output (chalk colors)
 * - TUI (blessed tags)
 * - Web UI (Tailwind classes)
 *
 * This module eliminates code duplication and ensures consistent
 * status representation across all output channels.
 */

/**
 * Task status types
 */
export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed' | 'cancelled' | 'quarantined'

/**
 * Status style for different output modes
 */
export interface StatusStyle {
  /** Chalk color (for CLI) */
  chalk?: string
  /** Blessed tag (for TUI) */
  blessed?: string
  /** Tailwind class (for Web) */
  tailwind?: string
  /** Emoji or symbol (for UI) */
  icon?: string
}

/**
 * Status color/icon mapping with support for multiple output modes
 */
export const STATUS_STYLES: Record<TaskStatus, StatusStyle> = {
  pending: {
    chalk: 'yellow',
    blessed: '{yellow-fg}',
    tailwind: 'text-yellow-500',
    icon: '○',
  },
  'in-progress': {
    chalk: 'blue',
    blessed: '{cyan-fg}',
    tailwind: 'text-blue-500',
    icon: '●',
  },
  completed: {
    chalk: 'green',
    blessed: '{green-fg}',
    tailwind: 'text-green-500',
    icon: '✓',
  },
  failed: {
    chalk: 'red',
    blessed: '{red-fg}',
    tailwind: 'text-red-500',
    icon: '✗',
  },
  cancelled: {
    chalk: 'gray',
    blessed: '{gray-fg}',
    tailwind: 'text-gray-500',
    icon: '×',
  },
  quarantined: {
    chalk: 'magenta',
    blessed: '{magenta-fg}',
    tailwind: 'text-purple-500',
    icon: '☣',
  },
}

/**
 * Get status style for a given status
 *
 * @param status - Task status
 * @returns Status style object
 *
 * @example
 * getStatusStyle('completed')
 * // { chalk: 'green', blessed: '{green-fg}', tailwind: 'text-green-500', icon: '✓' }
 */
export function getStatusStyle(status: TaskStatus): StatusStyle {
  return STATUS_STYLES[status]
}

/**
 * Get chalk color for a given status (for CLI output)
 *
 * @param status - Task status
 * @returns Chalk color string
 *
 * @example
 * getStatusColor('completed') // 'green'
 */
export function getStatusColor(status: TaskStatus): string {
  return STATUS_STYLES[status].chalk || 'white'
}

/**
 * Get blessed tag for a given status (for TUI output)
 *
 * @param status - Task status
 * @returns Blessed tag string
 *
 * @example
 * getStatusBlessedTag('completed') // '{green-fg}'
 */
export function getStatusBlessedTag(status: TaskStatus): string {
  return STATUS_STYLES[status].blessed || '{white-fg}'
}

/**
 * Get Tailwind class for a given status (for Web UI)
 *
 * @param status - Task status
 * @returns Tailwind class string
 *
 * @example
 * getStatusTailwindClass('completed') // 'text-green-500'
 */
export function getStatusTailwindClass(status: TaskStatus): string {
  return STATUS_STYLES[status].tailwind || 'text-white'
}

/**
 * Get status icon/symbol for a given status (for UI displays)
 *
 * @param status - Task status
 * @returns Icon string
 *
 * @example
 * getStatusIcon('completed') // '✓'
 */
export function getStatusIcon(status: TaskStatus): string {
  return STATUS_STYLES[status].icon || '•'
}

/**
 * Check if status is terminal (final states)
 *
 * @param status - Task status
 * @returns True if status is terminal
 */
export function isTerminalStatus(status: TaskStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

/**
 * Check if status is active (in-progress)
 *
 * @param status - Task status
 * @returns True if status is in-progress
 */
export function isActiveStatus(status: TaskStatus): boolean {
  return status === 'in-progress'
}

/**
 * Get status label for display
 *
 * @param status - Task status
 * @returns Human-readable label
 *
 * @example
 * getStatusLabel('completed') // 'Completed'
 */
export function getStatusLabel(status: TaskStatus): string {
  const labels: Record<TaskStatus, string> = {
    pending: 'Pending',
    'in-progress': 'In Progress',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
    quarantined: 'Quarantined',
  }
  return labels[status] || status
}

/**
 * Get status background color for badge displays
 *
 * @param status - Task status
 * @returns Chalk background color
 *
 * @example
 * getStatusBackgroundColor('completed') // 'bgGreenBright'
 */
export function getStatusBackgroundColor(status: TaskStatus): string {
  const bgColors: Record<TaskStatus, string> = {
    pending: 'bgYellow',
    'in-progress': 'bgBlue',
    completed: 'bgGreen',
    failed: 'bgRed',
    cancelled: 'bgGray',
    quarantined: 'bgMagenta',
  }
  return bgColors[status] || 'bgWhite'
}

/**
 * Get status border color for fancy displays
 *
 * @param status - Task status
 * @returns Chalk border color
 *
 * @example
 * getStatusBorderColor('completed') // 'green'
 */
export function getStatusBorderColor(status: TaskStatus): string {
  return getStatusColor(status)
}
