/**
 * Example usage of Dashboard Core Module
 * This demonstrates how to use the core module in both TUI and Web UI
 */

import {
  DashboardApiClient,
  DashboardStateManager,
  type Task,
  type DashboardState,
} from './index';

/**
 * Example 1: Basic API Client Usage
 */
async function basicApiExample() {
  // Create API client
  const apiClient = new DashboardApiClient({
    baseUrl: 'http://localhost:3333',
    timeout: 5000,
  });

  // Check connection
  const isConnected = await apiClient.ping();
  console.log('Connected:', isConnected);

  // Fetch tasks
  const tasks = await apiClient.getTasks();
  console.log('All tasks:', tasks);

  // Get current task
  const currentTask = await apiClient.getCurrentTask();
  console.log('Current task:', currentTask);

  // Get statistics
  const stats = await apiClient.getStats();
  console.log('Stats:', stats);
}

/**
 * Example 2: State Manager with Auto-refresh
 */
async function stateManagerExample() {
  // Create API client
  const apiClient = new DashboardApiClient();

  // Create state manager with auto-refresh
  const stateManager = new DashboardStateManager(apiClient, {
    autoRefresh: true,
    refreshInterval: 5000, // 5 seconds
  });

  // Subscribe to state changes
  const unsubscribe = stateManager.subscribe((state: DashboardState) => {
    console.log('State updated at:', state.lastUpdated);
    console.log('Connected:', state.isConnected);
    console.log('Current task:', state.currentTask?.title);
    console.log('Stats:', state.stats);
  });

  // Manual refresh when needed
  await stateManager.refresh();

  // Query helpers
  const completedTasks = stateManager.getTasksByStatus('completed');
  const highPriorityTasks = stateManager.getTasksByPriority('high');
  const specificTask = stateManager.getTaskById('TASK-001');

  console.log('Completed tasks:', completedTasks);
  console.log('High priority tasks:', highPriorityTasks);
  console.log('Specific task:', specificTask);

  // Cleanup
  setTimeout(() => {
    unsubscribe();
    stateManager.destroy();
  }, 30000); // Stop after 30 seconds
}

/**
 * Example 3: Web UI Integration (React-like)
 */
function webUIExample() {
  const apiClient = new DashboardApiClient();
  const stateManager = new DashboardStateManager(apiClient);

  // In React component:
  // useEffect(() => {
  //   const unsubscribe = stateManager.subscribe((state) => {
  //     setDashboardState(state);
  //   });
  //   stateManager.startPolling(5000);
  //   return () => {
  //     unsubscribe();
  //     stateManager.stopPolling();
  //   };
  // }, []);

  console.log('Web UI would use stateManager.subscribe() in useEffect');
}

/**
 * Example 4: TUI Integration (Terminal UI)
 */
function tuiExample() {
  const apiClient = new DashboardApiClient();
  const stateManager = new DashboardStateManager(apiClient);

  // In TUI render loop:
  stateManager.subscribe((state) => {
    // Update terminal UI widgets
    // updateTaskList(state.pendingTasks);
    // updateStatsBox(state.stats);
    // updateCurrentTask(state.currentTask);
    console.log('TUI would render:', {
      pending: state.stats.pending,
      completed: state.stats.completed,
      current: state.currentTask?.title,
    });
  });

  stateManager.startPolling(3000); // Poll every 3 seconds
}

/**
 * Example 5: Creating and Updating Tasks
 */
async function taskManagementExample() {
  const apiClient = new DashboardApiClient();

  // Create a new task
  const newTask = await apiClient.createTask({
    title: 'Implement authentication',
    status: 'pending',
    priority: 'high',
    feature: 'AUTH',
    description: 'Add user authentication with JWT',
  });
  console.log('Created task:', newTask);

  if (newTask) {
    // Update task status
    const updated = await apiClient.updateTask(newTask.id, {
      status: 'in-progress',
      startedAt: new Date().toISOString(),
    });
    console.log('Updated task:', updated);

    // Complete the task
    const completed = await apiClient.updateTask(newTask.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });
    console.log('Completed task:', completed);
  }
}

// Export examples for documentation
export {
  basicApiExample,
  stateManagerExample,
  webUIExample,
  tuiExample,
  taskManagementExample,
};
