
import React, { useState, useEffect } from 'react';
import { render } from 'ink';
import { InkApp, InkAppState } from './packages/loopwork/src/output/InkApp';

const initialState: InkAppState = {
  logs: [],
  currentTask: { id: 'TASK-001', title: 'Test Task', status: 'running', startTime: Date.now() },
  tasks: [],
  stats: { completed: 5, failed: 1, total: 10 },
  loopStartTime: Date.now() - 10000,
  progressMessage: 'Processing...',
  progressPercent: 50,
  namespace: 'test',
  iteration: 1,
  maxIterations: 10,
  layout: 'fullscreen',
  logScrollOffset: 0,
  workerStatus: {
    totalWorkers: 2,
    activeWorkers: 1,
    pendingTasks: 4,
    runningTasks: 1,
    completedTasks: 5,
    failedTasks: 1
  }
};

let currentState = { ...initialState };
const listeners: ((state: InkAppState) => void)[] = [];

const subscribe = (callback: (state: InkAppState) => void) => {
  listeners.push(callback);
  return () => {
    const index = listeners.indexOf(callback);
    if (index > -1) listeners.splice(index, 1);
  };
};

const updateState = (updates: Partial<InkAppState>) => {
  currentState = { ...currentState, ...updates };
  listeners.forEach(l => l(currentState));
};

let logId = 0;
setInterval(() => {
  const levels = ['info', 'warn', 'error', 'success'];
  const level = levels[Math.floor(Math.random() * levels.length)];
  updateState({
    logs: [
      ...currentState.logs,
      {
        id: logId++,
        timestamp: new Date().toLocaleTimeString(),
        level,
        message: `Log message ${logId}`,
        color: level === 'info' ? 'blue' : level === 'warn' ? 'yellow' : level === 'error' ? 'red' : 'green'
      }
    ]
  });
}, 1000);

render(<InkApp initialState={initialState} subscribe={subscribe} onExit={() => process.exit(0)} />);
