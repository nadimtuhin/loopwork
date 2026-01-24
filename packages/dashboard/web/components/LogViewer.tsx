"use client";

import { useEffect, useState, useRef } from 'react';
import { DashboardEvent } from '../hooks/useDashboardStream';

interface LogViewerProps {
  lastEvent: DashboardEvent | null;
}

export function LogViewer({ lastEvent }: LogViewerProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (lastEvent && lastEvent.type === 'log') {
      const logMessage = typeof lastEvent.payload === 'string' 
        ? lastEvent.payload 
        : JSON.stringify(lastEvent.payload);
        
      setLogs(prev => {
        if (prev.length >= 1000) {
          return [...prev.slice(1), logMessage];
        }
        return [...prev, logMessage];
      });
    }
  }, [lastEvent]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div 
      ref={scrollRef}
      className="bg-black text-green-400 p-4 rounded-lg font-mono h-96 overflow-y-auto text-sm border border-gray-800 shadow-lg"
    >
      {logs.length === 0 ? (
        <div className="text-gray-500 italic">Waiting for logs...</div>
      ) : (
        logs.map((log, index) => (
          <div key={index} className="whitespace-pre-wrap break-all mb-1">
            <span className="text-gray-600 mr-2 select-none">$</span>
            {log}
          </div>
        ))
      )}
    </div>
  );
}
