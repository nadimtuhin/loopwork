"use client";

import { useMemo } from 'react';
import { useTasks } from './useTasks';

export interface TaskStats {
  total: number;
  pending: number;
  completed: number;
  failed: number;
  running: number;
  successRate: number;
}

export function useTaskStats() {
  const { tasks, loading, error } = useTasks();

  const stats = useMemo(() => {
    const total = tasks.length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const failed = tasks.filter(t => t.status === 'failed').length;
    const running = tasks.filter(t => t.status === 'running').length;
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      pending,
      completed,
      failed,
      running,
      successRate
    };
  }, [tasks]);

  return {
    stats,
    loading,
    error
  };
}
