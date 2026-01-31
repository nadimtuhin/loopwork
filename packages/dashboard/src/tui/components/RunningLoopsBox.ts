/**
 * Running Loops Box Component
 * Shows list of running loops with their status
 */

import * as blessed from 'blessed';
import type { Widgets } from 'blessed';
import { truncate } from '../utils';

export interface TaskStats {
  completed: number;
  failed: number;
  pending: number;
}

export interface RunningLoop {
  namespace: string;
  pid: number;
  startedAt: string;
  currentTask?: string;
  tasks: TaskStats;
  uptime?: string;
}

export class RunningLoopsBox {
  private box: Widgets.BoxElement;

  constructor(screen: Widgets.Screen) {
    this.box = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: '25%',
      label: ' Running Loops ',
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        label: { fg: 'cyan' }
      },
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      vi: true
    });

    screen.append(this.box);
  }

  update(loops: RunningLoop[]): void {
    this.box.setContent(this.renderLoops(loops));
  }

  private renderLoops(loops: RunningLoop[]): string {
    if (loops.length === 0) {
      return '\n  {gray-fg}No loops currently running{/gray-fg}';
    }

    const lines: string[] = [''];

    for (const loop of loops) {
      const uptime = this.calculateUptime(loop.startedAt, loop.uptime);

      // Main loop line with green indicator
      lines.push(
        `  {green-fg}● {bold}${truncate(loop.namespace, 20)}{/bold}{/green-fg} ` +
        `{gray-fg}PID: ${loop.pid}{/gray-fg} ` +
        `{cyan-fg}Uptime: ${uptime}{/cyan-fg}`
      );

      // Current task line (if any)
      if (loop.currentTask) {
        lines.push(`    {gray-fg}└─ Current: ${truncate(loop.currentTask, 50)}{/gray-fg}`);
      }

      // Task stats line
      const statsLine =
        `Completed: {green-fg}${loop.tasks.completed}{/green-fg} | ` +
        `Failed: {red-fg}${loop.tasks.failed}{/red-fg} | ` +
        `Pending: {yellow-fg}${loop.tasks.pending}{/yellow-fg}`;

      lines.push(`    {gray-fg}└─ ${statsLine}{/gray-fg}`);

      // Add spacing between loops
      lines.push('');
    }

    return lines.join('\n');
  }

  private calculateUptime(startedAt: string, uptimeStr?: string): string {
    if (uptimeStr) {
      return uptimeStr;
    }

    try {
      const start = new Date(startedAt).getTime();
      const now = Date.now();
      const diff = now - start;

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (hours > 0) {
        return `${hours}h ${mins}m`;
      }
      return `${mins}m`;
    } catch {
      return '0m';
    }
  }

  getBox(): Widgets.BoxElement {
    return this.box;
  }
}
