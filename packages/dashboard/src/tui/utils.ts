/**
 * Terminal UI utilities for formatting and color handling
 */

export interface ColorOptions {
  bold?: boolean;
  fg?: string;
  bg?: string;
}

/**
 * Get color for task status
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return '{green-fg}';
    case 'pending':
      return '{yellow-fg}';
    case 'failed':
      return '{red-fg}';
    case 'in-progress':
      return '{blue-fg}';
    default:
      return '{white-fg}';
  }
}

/**
 * Get status icon
 */
export function getStatusIcon(status: string): string {
  switch (status) {
    case 'completed':
      return '✓';
    case 'pending':
      return '○';
    case 'failed':
      return '✗';
    case 'in-progress':
      return '●';
    default:
      return '-';
  }
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number | undefined): string {
  if (!ms) return '0s';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Format relative time
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) { // Less than 1 minute
    return 'just now';
  }
  if (diff < 3600000) { // Less than 1 hour
    const minutes = Math.floor(diff / 60000);
    return `${minutes}m ago`;
  }
  if (diff < 86400000) { // Less than 1 day
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  }

  const days = Math.floor(diff / 86400000);
  return `${days}d ago`;
}

/**
 * Create a progress bar string
 */
export function createProgressBar(current: number, total: number, width: number = 20): string {
  if (total === 0) return '░'.repeat(width);

  const percentage = Math.min(current / total, 1);
  const filled = Math.round(percentage * width);
  const empty = width - filled;

  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Truncate text to fit width
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Pad text to width
 */
export function padRight(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - text.length));
}

/**
 * Center text within width
 */
export function center(text: string, width: number): string {
  const padding = Math.max(0, width - text.length);
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
}

/**
 * Format task ID for display
 */
export function formatTaskId(id: string): string {
  return `[${id}]`;
}

/**
 * Get connection status color and text
 */
export function getConnectionStatus(connected: boolean): { color: string; text: string } {
  if (connected) {
    return { color: '{green-fg}', text: '● Connected' };
  }
  return { color: '{red-fg}', text: '○ Disconnected' };
}
