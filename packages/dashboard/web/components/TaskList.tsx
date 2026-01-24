"use client";

import React from "react";

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  [key: string]: any;
}

interface TaskListProps {
  tasks: Task[];
}

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case "completed":
    case "done":
      return "bg-green-100 text-green-800 border-green-200";
    case "in_progress":
    case "running":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "pending":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "failed":
    case "cancelled":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority.toLowerCase()) {
    case "high":
    case "critical":
      return "text-red-600 font-medium";
    case "medium":
      return "text-yellow-600 font-medium";
    case "low":
      return "text-blue-600 font-medium";
    default:
      return "text-gray-600";
  }
};

export default function TaskList({ tasks = [] }: TaskListProps) {
  if (!tasks || tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
        <h3 className="mt-2 text-sm font-semibold text-gray-900">No tasks</h3>
        <p className="mt-1 text-sm text-gray-500">
          There are currently no tasks to display.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tasks.map((task) => (
        <div
          key={task.id}
          className="relative flex flex-col p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-gray-400 truncate max-w-[50%]">
              #{task.id}
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(
                task.status || "unknown"
              )}`}
            >
              {task.status || "Unknown"}
            </span>
          </div>

          <h3 className="mb-4 text-lg font-semibold text-gray-900 line-clamp-2" title={task.title}>
            {task.title || "Untitled Task"}
          </h3>

          <div className="mt-auto flex items-center justify-between pt-4 border-t border-gray-100">
            <span className="text-sm text-gray-500">Priority:</span>
            <span className={`text-sm ${getPriorityColor(task.priority || "normal")}`}>
              {task.priority || "Normal"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
