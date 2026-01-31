/**
 * Namespaces Box Component
 * Shows stopped/available namespaces with last run timestamp
 */

import * as blessed from 'blessed';
import type { Widgets } from 'blessed';
import { truncate } from '../utils';

interface Namespace {
  name: string;
  status: 'running' | 'stopped';
  lastRun?: string;
}

export class NamespacesBox {
  private box: Widgets.BoxElement;

  constructor(screen: Widgets.Screen) {
    this.box = blessed.box({
      top: '25%',
      left: '50%',
      width: '50%',
      height: '20%',
      label: ' Available Namespaces ',
      border: { type: 'line' },
      style: {
        border: { fg: 'white' },
        label: { fg: 'white' }
      },
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true
    });

    screen.append(this.box);
  }

  update(namespaces: Namespace[]): void {
    // Filter to only show stopped namespaces
    const stopped = namespaces.filter(ns => ns.status === 'stopped');
    this.box.setContent(this.renderNamespaces(stopped));
  }

  private renderNamespaces(namespaces: Namespace[]): string {
    if (namespaces.length === 0) {
      return '\n  {gray-fg}No stopped namespaces{/gray-fg}';
    }

    const lines = [''];

    for (const ns of namespaces) {
      const lastRunStr = ns.lastRun || 'never';
      lines.push(`  {gray-fg}○ ${truncate(ns.name, 30)} Last run: ${lastRunStr}{/gray-fg}`);
    }

    lines.push('');
    return lines.join('\n');
  }

  getBox(): Widgets.BoxElement {
    return this.box;
  }
}
