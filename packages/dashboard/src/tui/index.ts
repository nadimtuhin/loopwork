/**
 * Terminal UI (TUI) Dashboard
 * Rich terminal rendering for Loopwork task monitoring
 */

import { TerminalRenderer } from './renderer';
import type { DashboardState } from '../core/types';

export interface TuiOptions {
  port?: number;
  watch?: boolean;
  host?: string;
}

const DEFAULT_PORT = 3333;
const DEFAULT_HOST = 'localhost';
const REFRESH_INTERVAL = 2000; // 2 seconds

/**
 * Start the Terminal UI dashboard
 */
export async function startTui(options: TuiOptions = {}): Promise<void> {
  const port = options.port || DEFAULT_PORT;
  const host = options.host || DEFAULT_HOST;
  const watch = options.watch ?? true;

  const renderer = new TerminalRenderer({
    title: `Loopwork Dashboard - ${host}:${port}`
  });

  renderer.showLoading('Connecting to dashboard server...');

  // Fetch dashboard state
  const fetchState = async (): Promise<DashboardState | null> => {
    try {
      const response = await fetch(`http://${host}:${port}/api/state`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      return null;
    }
  };

  // Initial fetch
  const initialState = await fetchState();
  if (!initialState) {
    renderer.showError(
      `Failed to connect to dashboard server at ${host}:${port}\n` +
      `Please ensure the dashboard is running with:\n` +
      `  loopwork dashboard --port ${port}`
    );
    return;
  }

  renderer.update(initialState);

  // Watch mode - auto-refresh
  if (watch) {
    const intervalId = setInterval(async () => {
      const state = await fetchState();
      if (state) {
        renderer.setConnected(true);
        renderer.update(state);
      } else {
        renderer.setConnected(false);
      }
    }, REFRESH_INTERVAL);

    // Cleanup on process termination
    process.on('SIGINT', () => {
      clearInterval(intervalId);
      renderer.destroy();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      clearInterval(intervalId);
      renderer.destroy();
      process.exit(0);
    });
  }
}

// Export components for external use
export { TerminalRenderer } from './renderer';
export { CurrentTaskBox } from './components/CurrentTaskBox';
export { StatsBox } from './components/StatsBox';
export { QueueBox } from './components/QueueBox';
export { CompletedBox } from './components/CompletedBox';
export * from './utils';
