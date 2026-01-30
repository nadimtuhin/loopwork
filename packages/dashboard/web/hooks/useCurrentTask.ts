"use client";

import { useMemo } from 'react';
import { useTasks } from './useTasks';

export function useCurrentTask() {
  const { tasks, loading, error } = useTasks();

  const currentTask = useMemo(() => {
    return tasks.find(t => t.status === 'running') || null;
  }, [tasks]);

  return {
    currentTask,
    loading,
    error
  };
}
