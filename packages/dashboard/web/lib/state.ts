import { DashboardStateManager } from '../../src/core';
import { apiClient } from './api';

export const stateManager = new DashboardStateManager(apiClient);

// Re-export for convenience
export { DashboardStateManager } from '../../src/core';
