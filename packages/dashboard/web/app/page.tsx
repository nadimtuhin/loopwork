"use client";

import { useState } from 'react';
import { useDashboardStream, Task } from '../hooks/useDashboardStream';
import { LogViewer } from '../components/LogViewer';
import { NewTaskDialog } from '../components/NewTaskDialog';

function TaskList({ tasks }: { tasks: Task[] }) {
  return (
    <div className="bg-white dark:bg-gray-900 shadow-lg rounded-lg p-4 border border-gray-200 dark:border-gray-800 h-96 overflow-y-auto">
      <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100 sticky top-0 bg-white dark:bg-gray-900 pb-2 border-b border-gray-100 dark:border-gray-800">Tasks</h2>
      {tasks.length === 0 ? (
        <p className="text-gray-500 text-sm italic">No active tasks.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li 
              key={task.id} 
              className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-md border border-gray-100 dark:border-gray-700/50 flex justify-between items-start transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <div className="flex-1 min-w-0 mr-4">
                <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {task.type || 'Unknown Task'}
                </div>
                <div className="text-xs text-gray-500 truncate font-mono mt-0.5">
                  ID: {task.id}
                </div>
              </div>
              <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${
                task.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                task.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                task.status === 'running' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
              }`}>
                {task.status || 'pending'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Home() {
  const { isConnected, lastEvent, tasks } = useDashboardStream();
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);

  const handleCreateTask = async (task: {
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    feature?: string;
  }) => {
    const response = await fetch('http://localhost:3333/api/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(task),
    });

    if (!response.ok) {
      throw new Error('Failed to create task');
    }
  };

  return (
    <main className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-gray-100 p-6 md:p-10 transition-colors">
      <header className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Loopwork Dashboard</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Real-time task monitoring system</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowNewTaskDialog(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
            New Task
          </button>
          <div className="flex items-center space-x-2.5 bg-gray-50 dark:bg-gray-900 px-4 py-2 rounded-full border border-gray-200 dark:border-gray-800">
            <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`}></div>
            <span className={`text-sm font-medium ${isConnected ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
              {isConnected ? 'System Online' : 'Disconnected'}
            </span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="flex flex-col gap-2">
            <TaskList tasks={tasks} />
        </section>

        <section className="flex flex-col gap-2">
             <LogViewer lastEvent={lastEvent} />
        </section>
      </div>

      {showNewTaskDialog && (
        <NewTaskDialog
          onClose={() => setShowNewTaskDialog(false)}
          onCreate={handleCreateTask}
        />
      )}
    </main>
  );
}
