"use client";

interface TaskStatusCardProps {
  taskId: string;
  title: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  startTime?: Date;
  duration?: number;
  progress?: number;
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

const formatDuration = (ms?: number): string => {
  if (!ms) return '0s';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
};

export function TaskStatusCard({
  taskId,
  title,
  status,
  startTime,
  duration,
  progress = 0,
}: TaskStatusCardProps) {
  return (
    <div className="bg-white dark:bg-gray-900 shadow-lg rounded-lg p-6 border border-gray-200 dark:border-gray-800">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
              #{taskId}
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(status)}`}
            >
              {status.replace('-', ' ')}
            </span>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
            {title}
          </h3>
        </div>
      </div>

      <div className="space-y-3">
        {startTime && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Started</span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">
              {startTime.toLocaleTimeString()}
            </span>
          </div>
        )}

        {duration !== undefined && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Duration</span>
            <span className="text-gray-900 dark:text-gray-100 font-medium font-mono">
              {formatDuration(duration)}
            </span>
          </div>
        )}

        {progress > 0 && (
          <div className="pt-2">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-gray-500 dark:text-gray-400">Progress</span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">
                {Math.round(progress)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
