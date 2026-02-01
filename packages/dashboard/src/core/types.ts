/**
 * Shared TypeScript types for Dashboard
 * Used by both TUI and Web UI implementations
 */

export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed' | 'cancelled' | 'quarantined';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority?: TaskPriority;
  feature?: string;
  description?: string;
  startedAt?: string;
  completedAt?: string;
  dependencies?: string[];
  subtasks?: string[];
}

export interface TaskStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
  successRate: number;
}

export interface DashboardState {
  currentTask: Task | null;
  nextTask: Task | null;
  pendingTasks: Task[];
  completedTasks: Task[];
  failedTasks: Task[];
  stats: TaskStats;
  isConnected: boolean;
  lastUpdated: Date;
}

export interface DashboardConfig {
  baseUrl: string;
  refreshInterval?: number;
  autoConnect?: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
