import { DashboardApiClient } from '../../src/core';

const API_URL = process.env.NEXT_PUBLIC_DASHBOARD_API_URL || 'http://localhost:3333';

export const apiClient = new DashboardApiClient({ baseUrl: API_URL });

// Re-export for convenience
export { DashboardApiClient } from '../../src/core';
