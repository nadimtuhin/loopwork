// Public API
export * from './interfaces/index.js';
export { 
  createCacheKey, 
  createTTLManager, 
  createLRUPolicy, 
  createSimilarityMatcher,
  createMemoryStore,
  createFileStore
} from './factories/index.js';
export { withCacheManager } from './plugin.js';
