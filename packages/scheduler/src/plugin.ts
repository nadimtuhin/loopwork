import type { LoopworkPlugin } from '@loopwork-ai/loopwork';
import { createTaskScheduler } from './factories/index.js';
import type { TaskScheduler, SchedulerConfig } from './interfaces/index.js';

export interface SchedulerPluginConfig extends SchedulerConfig {
  enabled?: boolean;
  reportStats?: boolean;
  networkAware?: boolean; // Defer tasks when offline
}

export function withScheduler(config: SchedulerPluginConfig = {}): (loopworkConfig: any) => any {
  if (config.enabled === false) {
    return (loopworkConfig) => loopworkConfig;
  }

  const scheduler = createTaskScheduler(config);

  const plugin: LoopworkPlugin = {
    name: 'task-scheduler',

    onLoopStart: async () => {
      console.log('[Scheduler] Initialized');
    },

    onLoopEnd: async (stats) => {
      if (config.reportStats) {
        const schedStats = scheduler.getStats();
        console.log('[Scheduler] Stats:', schedStats);
      }
    }
  };

  return (loopworkConfig: any) => ({
    ...loopworkConfig,
    plugins: [...(loopworkConfig.plugins || []), plugin]
  });
}
