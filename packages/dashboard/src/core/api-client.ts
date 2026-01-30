/**
 * API client for fetching data from dashboard server
 * Framework-agnostic, works in both browser and Node.js
 */

import type { Task, TaskStats, ApiResponse } from './types';

export interface DashboardApiClientConfig {
  baseUrl?: string;
  timeout?: number;
}

export class DashboardApiClient {
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(config: DashboardApiClientConfig = {}) {
    this.baseUrl = config.baseUrl || 'http://localhost:3333';
    this.timeout = config.timeout || 5000;
  }

  /**
   * Fetch data with timeout support
   */
  private async fetchWithTimeout<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      clearTimeout(timeoutId);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  /**
   * Get all tasks
   */
  async getTasks(): Promise<Task[]> {
    const result = await this.fetchWithTimeout<Task[]>('/api/tasks');
    return result.success && result.data ? result.data : [];
  }

  /**
   * Get current task being worked on
   */
  async getCurrentTask(): Promise<Task | null> {
    const result = await this.fetchWithTimeout<Task>('/api/tasks/current');
    return result.success && result.data ? result.data : null;
  }

  /**
   * Get next task to be picked up
   */
  async getNextTask(): Promise<Task | null> {
    const result = await this.fetchWithTimeout<Task>('/api/tasks/next');
    return result.success && result.data ? result.data : null;
  }

  /**
   * Get all pending tasks
   */
  async getPendingTasks(): Promise<Task[]> {
    const result = await this.fetchWithTimeout<Task[]>('/api/tasks/pending');
    return result.success && result.data ? result.data : [];
  }

  /**
   * Get all completed tasks
   */
  async getCompletedTasks(): Promise<Task[]> {
    const result = await this.fetchWithTimeout<Task[]>('/api/tasks/completed');
    return result.success && result.data ? result.data : [];
  }

  /**
   * Get all failed tasks
   */
  async getFailedTasks(): Promise<Task[]> {
    const result = await this.fetchWithTimeout<Task[]>('/api/tasks/failed');
    return result.success && result.data ? result.data : [];
  }

  /**
   * Get task statistics
   */
  async getStats(): Promise<TaskStats> {
    const result = await this.fetchWithTimeout<TaskStats>('/api/stats');
    return result.success && result.data
      ? result.data
      : {
          total: 0,
          pending: 0,
          inProgress: 0,
          completed: 0,
          failed: 0,
          successRate: 0,
        };
  }

  /**
   * Create a new task
   */
  async createTask(task: Partial<Task>): Promise<Task | null> {
    const result = await this.fetchWithTimeout<Task>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    });
    return result.success && result.data ? result.data : null;
  }

  /**
   * Update an existing task
   */
  async updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
    const result = await this.fetchWithTimeout<Task>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return result.success && result.data ? result.data : null;
  }

  /**
   * Delete a task
   */
  async deleteTask(id: string): Promise<boolean> {
    const result = await this.fetchWithTimeout<void>(`/api/tasks/${id}`, {
      method: 'DELETE',
    });
    return result.success;
  }

  /**
   * Health check
   */
  async ping(): Promise<boolean> {
    const result = await this.fetchWithTimeout<{ status: string }>('/api/health');
    return result.success && result.data?.status === 'ok';
  }
}
