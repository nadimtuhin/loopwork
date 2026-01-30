/**
 * Statistics Box Component
 * Shows task statistics in a grid layout
 */

import type { Widgets } from 'blessed';
import type { TaskStats } from '../../core/types';
import { formatPercentage, createProgressBar } from '../utils';

export class StatsBox {
  private box: Widgets.BoxElement;

  constructor(screen: Widgets.Screen) {
    this.box = (screen as any).constructor.box({
      top: 7,
      left: 0,
      width: '50%',
      height: 8,
      label: ' Statistics ',
      border: { type: 'line' },
      style: {
        border: { fg: 'green' },
        label: { fg: 'green' }
      },
      tags: true
    });

    screen.append(this.box);
  }

  update(stats: TaskStats): void {
    this.box.setContent(this.renderStats(stats));
  }

  private renderStats(stats: TaskStats): string {
    const successRate = stats.total > 0 ? stats.completed / stats.total : 0;
    const failureRate = stats.total > 0 ? stats.failed / stats.total : 0;

    const progressBar = createProgressBar(
      stats.completed + stats.failed,
      stats.total,
      25
    );

    const lines = [
      '',
      `  Total Tasks:     {bold}${stats.total}{/bold}`,
      `  Pending:         {yellow-fg}${stats.pending}{/yellow-fg}`,
      `  Completed:       {green-fg}${stats.completed}{/green-fg}`,
      `  Failed:          {red-fg}${stats.failed}{/red-fg}`,
      '',
      `  Success Rate:    {green-fg}${formatPercentage(successRate)}{/green-fg}`,
      `  Progress:        ${progressBar}`,
      ''
    ];

    return lines.join('\n');
  }

  getBox(): Widgets.BoxElement {
    return this.box;
  }
}
