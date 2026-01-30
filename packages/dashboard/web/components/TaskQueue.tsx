"use client";

import { useState } from 'react';

interface Task {
  id: string;
  title: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  priority?: string;
  feature?: string;
}

interface TaskQueueProps {
  nextTask?: Task;
  pendingTasks: Task[];
  completedTasks: Task[];
}

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case "completed":
      return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800";
    case "in-progress":
      return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800";
    case "pending":
      return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800";
    case "failed":
      return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-700";
  }
};

export function TaskQueue({ nextTask, pendingTasks, completedTasks }: TaskQueueProps) {
  const [showCompleted, setShowCompleted] = useState(false);

  return (
    <div className="bg-white dark:bg-gray-900 shadow-lg rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
          Task Queue
        </h2>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {nextTask && (
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-indigo-50 dark:bg-indigo-900/20">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wide">
                  Next Up
                </span>
              </div>
            </div>
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  {nextTask.title}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                  #{nextTask.id}
                </div>
              </div>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(
                  nextTask.status
                )}`}
              >
                {nextTask.status.replace('-', ' ')}
              </span>
            </div>
          </div>
        )}

        {pendingTasks.length > 0 ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {pendingTasks.map((task) => (
              <div
                key={task.id}
                className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-gray-100 mb-1 truncate">
                      {task.title}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500 dark:text-gray-400 font-mono">
                        #{task.id}
                      </span>
                      {task.feature && (
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded">
                          {task.feature}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(
                      task.status
                    )}`}
                  >
                    {task.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm italic">
            No pending tasks
          </div>
        )}

        {completedTasks.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-800">
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="w-full p-4 flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <span>Completed ({completedTasks.length})</span>
              <svg
                className={`w-4 h-4 transition-transform ${
                  showCompleted ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {showCompleted && (
              <div className="divide-y divide-gray-100 dark:divide-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                {completedTasks.map((task) => (
                  <div key={task.id} className="p-4 opacity-75">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-700 dark:text-gray-300 mb-1 truncate">
                          {task.title}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                          #{task.id}
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(
                          task.status
                        )}`}
                      >
                        {task.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
