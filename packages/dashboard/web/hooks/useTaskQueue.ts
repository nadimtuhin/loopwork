"use client";

import { useMemo } from 'react';
import { useTasks } from './useTasks';

export function useTaskQueue() {
  const { tasks, loading, error, refetch } = useTasks();

  const queue = useMemo(() => {
    const pending = tasks.filter(t => t.status === 'pending');
    const completed = tasks.filter(t => t.status === 'completed');
    const failed = tasks.filter(t => t.status === 'failed');

    return {
      pending,
      completed,
      failed,
      nextTask: pending[0] || null
    };
  }, [tasks]);

  return {
    queue,
    loading,
    error,
    refetch
  };
}
