/**
 * State management for Dashboard
 * Framework-agnostic, can be used by both TUI and Web UI
 */

import type { DashboardState, Task, TaskStats } from './types';
import type { DashboardApiClient } from './api-client';

export type StateChangeCallback = (state: DashboardState) => void;

export interface StateManagerConfig {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export class DashboardStateManager {
  private state: DashboardState;
  private subscribers: Set<StateChangeCallback> = new Set();
  private apiClient: DashboardApiClient;
  private pollingInterval: NodeJS.Timeout | null = null;
  private isRefreshing = false;

  constructor(
    apiClient: DashboardApiClient,
    config: StateManagerConfig = {}
  ) {
    this.apiClient = apiClient;
    this.state = this.createInitialState();

    if (config.autoRefresh) {
      this.startPolling(config.refreshInterval || 5000);
    }
  }

  /**
   * Create initial empty state
   */
  private createInitialState(): DashboardState {
    return {
      currentTask: null,
      nextTask: null,
      pendingTasks: [],
      completedTasks: [],
      failedTasks: [],
      stats: {
        total: 0,
        pending: 0,
        inProgress: 0,
        completed: 0,
        failed: 0,
        successRate: 0,
      },
      isConnected: false,
      lastUpdated: new Date(),
    };
  }

  /**
   * Get current state (immutable copy)
   */
  getState(): DashboardState {
    return { ...this.state };
  }

  /**
   * Refresh state from API
   */
  async refresh(): Promise<void> {
    if (this.isRefreshing) {
      return; // Prevent concurrent refreshes
    }

    this.isRefreshing = true;

    try {
      // Check connection first
      const isConnected = await this.apiClient.ping();

      if (!isConnected) {
        this.updateState({
          ...this.state,
          isConnected: false,
          lastUpdated: new Date(),
        });
        return;
      }

      // Fetch all data in parallel
      const [
        currentTask,
        nextTask,
        pendingTasks,
        completedTasks,
        failedTasks,
        stats,
      ] = await Promise.all([
        this.apiClient.getCurrentTask(),
        this.apiClient.getNextTask(),
        this.apiClient.getPendingTasks(),
        this.apiClient.getCompletedTasks(),
        this.apiClient.getFailedTasks(),
        this.apiClient.getStats(),
      ]);

      // Update state with fetched data
      this.updateState({
        currentTask,
        nextTask,
        pendingTasks,
        completedTasks,
        failedTasks,
        stats,
        isConnected: true,
        lastUpdated: new Date(),
      });
    } catch (error) {
      // On error, mark as disconnected but keep existing data
      this.updateState({
        ...this.state,
        isConnected: false,
        lastUpdated: new Date(),
      });
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Update state and notify subscribers
   */
  private updateState(newState: DashboardState): void {
    this.state = newState;
    this.notifySubscribers();
  }

  /**
   * Notify all subscribers of state change
   */
  private notifySubscribers(): void {
    this.subscribers.forEach((callback) => {
      try {
        callback(this.getState());
      } catch (error) {
        console.error('Error in state subscriber:', error);
      }
    });
  }

  /**
   * Subscribe to state changes
   * Returns unsubscribe function
   */
  subscribe(callback: StateChangeCallback): () => void {
    this.subscribers.add(callback);

    // Immediately call with current state
    callback(this.getState());

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Start polling for updates
   */
  startPolling(intervalMs: number = 5000): void {
    if (this.pollingInterval) {
      return; // Already polling
    }

    // Initial refresh
    this.refresh();

    // Set up polling interval
    this.pollingInterval = setInterval(() => {
      this.refresh();
    }, intervalMs);
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopPolling();
    this.subscribers.clear();
  }

  /**
   * Get specific task by ID from current state
   */
  getTaskById(id: string): Task | undefined {
    const allTasks = [
      this.state.currentTask,
      this.state.nextTask,
      ...this.state.pendingTasks,
      ...this.state.completedTasks,
      ...this.state.failedTasks,
    ].filter((task): task is Task => task !== null);

    return allTasks.find((task) => task.id === id);
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(status: Task['status']): Task[] {
    switch (status) {
      case 'in-progress':
        return this.state.currentTask ? [this.state.currentTask] : [];
      case 'pending':
        return this.state.pendingTasks;
      case 'completed':
        return this.state.completedTasks;
      case 'failed':
        return this.state.failedTasks;
      default:
        return [];
    }
  }

  /**
   * Get tasks by priority
   */
  getTasksByPriority(priority: Task['priority']): Task[] {
    const allTasks = [
      this.state.currentTask,
      this.state.nextTask,
      ...this.state.pendingTasks,
      ...this.state.completedTasks,
      ...this.state.failedTasks,
    ].filter((task): task is Task => task !== null);

    return allTasks.filter((task) => task.priority === priority);
  }
}
