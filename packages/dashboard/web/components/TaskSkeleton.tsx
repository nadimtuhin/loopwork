"use client";

import React from 'react';

export function TaskSkeleton() {
  return (
    <div className="relative flex flex-col p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse" />
        <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-gray-200 dark:border-gray-800 h-6 w-16 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse" />
      </div>

      <div className="h-6 w-3/4 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse mb-4" />

      <div className="flex items-center gap-2">
        <div className="h-3.5 w-16 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse" />
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
        <div className="h-3.5 w-14 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse" />
        <div className="h-3.5 w-10 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse" />
      </div>
    </div>
  );
}
