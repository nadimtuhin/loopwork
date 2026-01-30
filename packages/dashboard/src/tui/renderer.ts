/**
 * Terminal renderer using blessed for TUI dashboard
 */

import * as blessed from 'blessed';
import type { Widgets } from 'blessed';
import type { DashboardState } from '../core/types';
import { CurrentTaskBox } from './components/CurrentTaskBox';
import { StatsBox } from './components/StatsBox';
import { QueueBox } from './components/QueueBox';
import { CompletedBox } from './components/CompletedBox';
import { getConnectionStatus } from './utils';

export interface RendererOptions {
  title?: string;
}

export class TerminalRenderer {
  private screen: Widgets.Screen;
  private statusBar: Widgets.BoxElement;
  private currentTaskBox: CurrentTaskBox;
  private statsBox: StatsBox;
  private queueBox: QueueBox;
  private completedBox: CompletedBox;
  private lastUpdate: number = 0;
  private connected: boolean = false;

  constructor(options: RendererOptions = {}) {
    // Create screen
    this.screen = blessed.screen({
      smartCSR: true,
      title: options.title || 'Loopwork Dashboard',
      fullUnicode: true,
      dockBorders: true
    });

    // Initialize components
    this.currentTaskBox = new CurrentTaskBox(this.screen);
    this.statsBox = new StatsBox(this.screen);
    this.queueBox = new QueueBox(this.screen);
    this.completedBox = new CompletedBox(this.screen);

    // Create status bar
    this.statusBar = blessed.box({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: '',
      style: {
        bg: 'blue',
        fg: 'white'
      },
      tags: true
    });
    this.screen.append(this.statusBar);

    this.setupKeyBindings();
    this.screen.render();
  }

  private setupKeyBindings(): void {
    // Quit on Q, Escape, or Ctrl-C
    this.screen.key(['q', 'Q', 'escape', 'C-c'], () => {
      this.destroy();
      process.exit(0);
    });

    // Refresh on R
    this.screen.key(['r', 'R'], () => {
      this.screen.render();
    });

    // Focus switching
    this.screen.key(['tab'], () => {
      this.screen.focusNext();
    });

    this.screen.key(['S-tab'], () => {
      this.screen.focusPrevious();
    });
  }

  /**
   * Update dashboard with new state
   */
  update(state: DashboardState): void {
    this.connected = true;
    this.lastUpdate = Date.now();

    // Combine all tasks for components
    const allTasks = [
      ...(state.pendingTasks || []),
      ...(state.completedTasks || []),
      ...(state.failedTasks || [])
    ];

    // Update all components
    this.currentTaskBox.update(state.currentTask);
    this.statsBox.update(state.stats);
    this.queueBox.update(state.pendingTasks || []);
    this.completedBox.update([
      ...(state.completedTasks || []),
      ...(state.failedTasks || [])
    ]);

    // Update status bar
    this.updateStatusBar();

    // Render
    this.screen.render();
  }

  /**
   * Update connection status
   */
  setConnected(connected: boolean): void {
    this.connected = connected;
    this.updateStatusBar();
    this.screen.render();
  }

  private updateStatusBar(): void {
    const status = getConnectionStatus(this.connected);
    const lastUpdated = this.lastUpdate
      ? new Date(this.lastUpdate).toLocaleTimeString()
      : 'never';

    const content =
      ` ${status.color}${status.text}{/} | ` +
      `Last updated: {cyan-fg}${lastUpdated}{/cyan-fg} | ` +
      `{dim}Press 'q' to quit, 'r' to refresh{/dim}`;

    this.statusBar.setContent(content);
  }

  /**
   * Show error message
   */
  showError(message: string): void {
    const errorBox = blessed.message({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 'shrink',
      height: 'shrink',
      border: { type: 'line' },
      style: {
        border: { fg: 'red' },
        label: { fg: 'red' }
      },
      tags: true,
      label: ' Error '
    });

    errorBox.display(`\n  {red-fg}${message}{/red-fg}\n  \n  Press any key to continue\n  `, () => {
      errorBox.destroy();
      this.screen.render();
    });

    this.screen.render();
  }

  /**
   * Show loading message
   */
  showLoading(message: string = 'Loading...'): void {
    const loadingBox = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: message.length + 8,
      height: 3,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        label: { fg: 'yellow' }
      },
      tags: true,
      content: `\n  {yellow-fg}${message}{/yellow-fg}`
    });

    this.screen.render();
  }

  /**
   * Get screen instance
   */
  getScreen(): Widgets.Screen {
    return this.screen;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.screen.destroy();
  }
}
