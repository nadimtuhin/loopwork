"use client";

interface TaskStatsProps {
  total: number;
  pending: number;
  completed: number;
  failed: number;
}

export function TaskStats({ total, pending, completed, failed }: TaskStatsProps) {
  const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const inProgress = total - pending - completed - failed;

  const stats = [
    {
      label: 'Total Tasks',
      value: total,
      color: 'text-gray-900 dark:text-gray-100',
      bgColor: 'bg-gray-100 dark:bg-gray-800/50',
    },
    {
      label: 'Pending',
      value: pending,
      color: 'text-yellow-700 dark:text-yellow-400',
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    },
    {
      label: 'In Progress',
      value: inProgress,
      color: 'text-blue-700 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      label: 'Completed',
      value: completed,
      color: 'text-green-700 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      label: 'Failed',
      value: failed,
      color: 'text-red-700 dark:text-red-400',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
    },
  ];

  return (
    <div className="bg-white dark:bg-gray-900 shadow-lg rounded-lg p-6 border border-gray-200 dark:border-gray-800">
      <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100">
        Statistics
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`${stat.bgColor} rounded-lg p-3 border border-gray-200 dark:border-gray-700/50`}
          >
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
              {stat.label}
            </div>
            <div className={`text-2xl font-bold ${stat.color}`}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-gray-600 dark:text-gray-400 font-medium">
            Success Rate
          </span>
          <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {successRate}%
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
          <div
            className={`h-3 rounded-full transition-all duration-500 ease-out ${
              successRate >= 80
                ? 'bg-green-500'
                : successRate >= 50
                ? 'bg-yellow-500'
                : 'bg-red-500'
            }`}
            style={{ width: `${successRate}%` }}
          />
        </div>
      </div>
    </div>
  );
}
