/**
 * Current Task Box Component
 * Shows the currently executing task with progress information
 */

import type { Widgets } from 'blessed';
import type { Task } from '../../core/types';
import { getStatusColor, getStatusIcon, formatDuration, truncate } from '../utils';

export class CurrentTaskBox {
  private box: Widgets.BoxElement;

  constructor(screen: Widgets.Screen) {
    this.box = (screen as any).constructor.box({
      top: 0,
      left: 0,
      width: '100%',
      height: 7,
      label: ' Current Task ',
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        label: { fg: 'cyan' }
      },
      tags: true
    });

    screen.append(this.box);
  }

  update(task: Task | null): void {
    if (!task) {
      this.box.setContent(this.renderIdle());
    } else {
      this.box.setContent(this.renderTask(task));
    }
  }

  private renderIdle(): string {
    return '\n  {gray-fg}No task currently running{/gray-fg}\n  {dim}Waiting for tasks...{/dim}';
  }

  private renderTask(task: Task): string {
    const statusColor = getStatusColor(task.status);
    const statusIcon = getStatusIcon(task.status);

    // Calculate duration if we have timestamps
    let duration = 'calculating...';
    if (task.startedAt) {
      const startTime = new Date(task.startedAt).getTime();
      const endTime = task.completedAt
        ? new Date(task.completedAt).getTime()
        : Date.now();
      duration = formatDuration(endTime - startTime);
    }

    const lines = [
      '',
      `  ${statusColor}${statusIcon}{/} {bold}${truncate(task.title, 70)}{/bold}`,
      `  ID: {cyan-fg}${task.id}{/cyan-fg}`,
      `  Status: ${statusColor}${task.status}{/}  Duration: {yellow-fg}${duration}{/yellow-fg}`,
      ''
    ];

    return lines.join('\n');
  }

  getBox(): Widgets.BoxElement {
    return this.box;
  }
}
