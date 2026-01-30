"use client";

interface TaskCardProps {
  id: string;
  title: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  priority?: 'high' | 'medium' | 'low';
  feature?: string;
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

const getPriorityColor = (priority?: string) => {
  switch (priority?.toLowerCase()) {
    case "high":
    case "critical":
      return "text-red-600 dark:text-red-400 font-medium";
    case "medium":
      return "text-yellow-600 dark:text-yellow-400 font-medium";
    case "low":
      return "text-blue-600 dark:text-blue-400 font-medium";
    default:
      return "text-gray-600 dark:text-gray-400";
  }
};

export function TaskCard({ id, title, status, priority, feature }: TaskCardProps) {
  return (
    <div className="relative flex flex-col p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono text-gray-400 dark:text-gray-500 truncate max-w-[50%]">
          #{id}
        </span>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(
            status
          )}`}
        >
          {status.replace('-', ' ')}
        </span>
      </div>

      <h3
        className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100 line-clamp-2"
        title={title}
      >
        {title}
      </h3>

      <div className="mt-auto space-y-2">
        {feature && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Feature:</span>
            <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-xs rounded-md font-medium">
              {feature}
            </span>
          </div>
        )}

        {priority && (
          <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
            <span className="text-sm text-gray-500 dark:text-gray-400">Priority:</span>
            <span className={`text-sm ${getPriorityColor(priority)} capitalize`}>
              {priority}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
