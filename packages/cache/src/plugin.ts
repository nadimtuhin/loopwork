import type { LoopworkPlugin } from '@loopwork-ai/loopwork';
import { createCacheManager } from './factories/index.js';
import type { CacheManager, CacheConfig } from './interfaces/index.js';

export interface CacheManagerPluginConfig extends CacheConfig {
  enabled?: boolean;
  reportStats?: boolean;
}

export function withCacheManager(config: CacheManagerPluginConfig = {}): (loopworkConfig: any) => any {
  if (config.enabled === false) {
    return (loopworkConfig) => loopworkConfig;
  }

  const cache = createCacheManager<string>(config);

  const plugin: LoopworkPlugin = {
    name: 'cache-manager',

    onLoopStart: async () => {
      console.log('[Cache] Initialized cache manager');
    },

    onLoopEnd: async (stats) => {
      if (config.reportStats) {
        const cacheStats = await cache.getStats();
        console.log('[Cache] Stats:', {
          hits: cacheStats.hits,
          misses: cacheStats.misses,
          hitRate: `${cacheStats.hitRate.toFixed(2)}%`,
          size: cacheStats.size,
          evictions: cacheStats.evictions
        });
      }
    }
  };

  return (loopworkConfig: any) => ({
    ...loopworkConfig,
    plugins: [...(loopworkConfig.plugins || []), plugin]
  });
}
