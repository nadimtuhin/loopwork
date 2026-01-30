"use client";

import { useEffect, useState, useCallback } from 'react';

export interface Task {
  id: string;
  type?: string;
  status?: string;
  [key: string]: any;
}

const API_URL = typeof window !== 'undefined' && process.env.NEXT_PUBLIC_DASHBOARD_API_URL
  ? process.env.NEXT_PUBLIC_DASHBOARD_API_URL
  : 'http://localhost:3333';

export function useCompletedTasks() {
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchCompletedTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/api/tasks/completed`);

      if (!response.ok) {
        throw new Error(`Failed to fetch completed tasks: ${response.statusText}`);
      }

      const data = await response.json();
      setCompletedTasks(Array.isArray(data) ? data : data.tasks || []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      console.error('Error fetching completed tasks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompletedTasks();
  }, [fetchCompletedTasks]);

  return {
    completedTasks,
    loading,
    error
  };
}
