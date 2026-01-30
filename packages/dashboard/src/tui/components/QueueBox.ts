/**
 * Queue Box Component
 * Shows task queue with next task highlighted
 */

import type { Widgets } from 'blessed';
import type { Task } from '../../core/types';
import { getStatusIcon, truncate } from '../utils';

export class QueueBox {
  private box: Widgets.BoxElement;

  constructor(screen: Widgets.Screen) {
    this.box = (screen as any).constructor.box({
      top: 7,
      left: '50%',
      width: '50%',
      height: 8,
      label: ' Task Queue ',
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        label: { fg: 'yellow' }
      },
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true
    });

    screen.append(this.box);
  }

  update(tasks: Task[]): void {
    const pendingTasks = tasks.filter(t => t.status === 'pending');
    this.box.setContent(this.renderQueue(pendingTasks));
  }

  private renderQueue(tasks: Task[]): string {
    if (tasks.length === 0) {
      return '\n  {gray-fg}No pending tasks{/gray-fg}';
    }

    const lines = [''];

    // Show next task highlighted
    const nextTask = tasks[0];
    if (nextTask) {
      lines.push(`  {bold}{yellow-fg}▶ NEXT{/yellow-fg}{/bold}`);
      lines.push(`  {bold}${truncate(nextTask.title, 45)}{/bold}`);
      lines.push('');
    }

    // Show remaining tasks
    if (tasks.length > 1) {
      lines.push(`  {dim}Remaining: ${tasks.length - 1}{/dim}`);
      for (let i = 1; i < Math.min(tasks.length, 4); i++) {
        const task = tasks[i];
        const icon = getStatusIcon(task.status);
        lines.push(`  ${icon} ${truncate(task.title, 40)}`);
      }

      if (tasks.length > 4) {
        lines.push(`  {dim}... and ${tasks.length - 4} more{/dim}`);
      }
    }

    lines.push('');
    return lines.join('\n');
  }

  getBox(): Widgets.BoxElement {
    return this.box;
  }
}
