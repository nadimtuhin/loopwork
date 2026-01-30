/**
 * Completed Tasks Box Component
 * Shows scrollable list of completed tasks
 */

import type { Widgets } from 'blessed';
import type { Task } from '../../core/types';
import { getStatusIcon, getStatusColor, formatDuration, truncate, formatRelativeTime } from '../utils';

export class CompletedBox {
  private box: Widgets.BoxElement;

  constructor(screen: Widgets.Screen) {
    this.box = (screen as any).constructor.box({
      top: 15,
      left: 0,
      width: '100%',
      height: 'shrink',
      bottom: 1, // Leave room for status bar
      label: ' Completed Tasks ',
      border: { type: 'line' },
      style: {
        border: { fg: 'blue' },
        label: { fg: 'blue' }
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

  update(tasks: Task[]): void {
    const completedTasks = tasks.filter(
      t => t.status === 'completed' || t.status === 'failed'
    );
    this.box.setContent(this.renderCompleted(completedTasks));
  }

  private renderCompleted(tasks: Task[]): string {
    if (tasks.length === 0) {
      return '\n  {gray-fg}No completed tasks yet{/gray-fg}';
    }

    const lines = [''];

    // Sort by completion time (most recent first)
    const sortedTasks = [...tasks].sort((a, b) => {
      const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return timeB - timeA;
    });

    // Show most recent completed tasks
    for (const task of sortedTasks.slice(0, 50)) {
      const statusColor = getStatusColor(task.status);
      const icon = getStatusIcon(task.status);

      // Calculate duration
      let duration = '0s';
      if (task.startedAt) {
        const startTime = new Date(task.startedAt).getTime();
        const endTime = task.completedAt
          ? new Date(task.completedAt).getTime()
          : Date.now();
        duration = formatDuration(endTime - startTime);
      }

      const relativeTime = task.completedAt
        ? formatRelativeTime(new Date(task.completedAt).getTime())
        : '';

      lines.push(
        `  ${statusColor}${icon}{/} ${truncate(task.title, 55)} ` +
        `{dim}(${duration}${relativeTime ? ', ' + relativeTime : ''}){/dim}`
      );
    }

    if (tasks.length > 50) {
      lines.push('');
      lines.push(`  {dim}... and ${tasks.length - 50} more (scroll to view){/dim}`);
    }

    lines.push('');
    return lines.join('\n');
  }

  getBox(): Widgets.BoxElement {
    return this.box;
  }
}
