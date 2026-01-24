"use client";

import { useEffect, useState, useRef } from 'react';

export interface Task {
  id: string;
  type?: string;
  status?: string;
  [key: string]: any;
}

export interface DashboardEvent {
  type: string;
  payload: any;
  timestamp: string;
}

export function useDashboardStream() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<DashboardEvent | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const connect = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const url = 'http://localhost:3333/api/events';
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsConnected(true);
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const dashboardEvent: DashboardEvent = {
            type: data.type || 'unknown',
            payload: data.payload || data,
            timestamp: new Date().toISOString(),
          };

          setLastEvent(dashboardEvent);

          if (dashboardEvent.type === 'state_update') {
            const newTasks = dashboardEvent.payload.tasks || dashboardEvent.payload;
            if (Array.isArray(newTasks)) {
              setTasks(newTasks);
            }
          }
        } catch (error) {
          console.error('Error parsing dashboard event:', error);
        }
      };
      
      es.addEventListener('state_update', (event) => {
          try {
              const data = JSON.parse(event.data);
              const dashboardEvent: DashboardEvent = {
                type: 'state_update',
                payload: data,
                timestamp: new Date().toISOString(),
              };
              setLastEvent(dashboardEvent);
              
              const newTasks = data.tasks || data;
               if (Array.isArray(newTasks)) {
                setTasks(newTasks);
              }
          } catch (err) {
              console.error('Error parsing state_update event:', err);
          }
      });

      es.onerror = (error) => {
        console.error('Dashboard stream connection error');
        setIsConnected(false);
        es.close();
        
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };
    };

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  return {
    isConnected,
    lastEvent,
    tasks
  };
}
