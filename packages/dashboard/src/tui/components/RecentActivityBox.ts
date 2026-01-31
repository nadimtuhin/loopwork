/**
 * Recent Activity Box Component
 * Shows scrollable list of recent activity items
 */

import * as blessed from 'blessed';
import type { Widgets } from 'blessed';
import { truncate, formatRelativeTime } from '../utils';

interface ActivityItem {
  time: string
  namespace: string
  type: 'completed' | 'failed' | 'progress'
  message: string
}

export class RecentActivityBox {
  private box: Widgets.BoxElement;

  constructor(screen: Widgets.Screen) {
    this.box = blessed.box({
      bottom: 1, // Above status bar
      left: 0,
      width: '100%',
      height: 15, // Fixed height for activity area
      label: ' Recent Activity ',
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        label: { fg: 'cyan' }
      },
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      mouse: true
    });

    screen.append(this.box);
  }

  update(activity: ActivityItem[]): void {
    this.box.setContent(this.renderActivity(activity));
  }

  private renderActivity(activity: ActivityItem[]): string {
    if (activity.length === 0) {
      return '\n  {gray-fg}No recent activity{/gray-fg}';
    }

    const lines = [''];

    // Show most recent 10 items
    for (const item of activity.slice(0, 10)) {
      const icon = this.getActivityIcon(item.type);
      const iconColor = this.getActivityColor(item.type);

      // Format: [icon] time namespace: message
      const line =
        `  ${iconColor}${icon}{/} ` +
        `{dim}${item.time}{/dim} ` +
        `{white-fg}${item.namespace}{/}: ` +
        `${truncate(item.message, 60)}`;

      lines.push(line);
    }

    if (activity.length > 10) {
      lines.push('');
      lines.push(`  {dim}... and ${activity.length - 10} more (scroll to view){/dim}`);
    }

    lines.push('');
    return lines.join('\n');
  }

  private getActivityIcon(type: ActivityItem['type']): string {
    switch (type) {
      case 'completed':
        return '✓';
      case 'failed':
        return '✗';
      case 'progress':
        return '→';
      default:
        return '-';
    }
  }

  private getActivityColor(type: ActivityItem['type']): string {
    switch (type) {
      case 'completed':
        return '{green-fg}';
      case 'failed':
        return '{red-fg}';
      case 'progress':
        return '{blue-fg}';
      default:
        return '{white-fg}';
    }
  }

  getBox(): Widgets.BoxElement {
    return this.box;
  }
}
