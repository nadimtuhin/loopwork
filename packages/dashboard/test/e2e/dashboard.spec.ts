import { test, expect } from '@playwright/test';

test.describe('Dashboard E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API routes
    await page.route('**/api/tasks', async route => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({ 
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]) 
        });
      } else if (method === 'POST') {
        const postData = route.request().postDataJSON();
        await route.fulfill({ 
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'TASK-MOCK-1', ...postData }) 
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/events', async route => {
      await route.fulfill({ 
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]) 
      });
    });

    await page.route('**/api/status', async route => {
      await route.fulfill({ 
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'idle', currentTask: null }) 
      });
    });
  });

  test('should create a new task via modal', async ({ page }) => {
    // Visit dashboard
    await page.goto('/');

    // Check title (approximate check for "Loopwork Dashboard")
    await expect(page).toHaveTitle(/Loopwork Dashboard/);

    // Click "New Task" button
    await page.getByRole('button', { name: 'New Task' }).click();

    // Fill "Title"
    const taskTitle = 'E2E Test Task';
    await page.getByLabel('Title').fill(taskTitle);

    // Setup request interception to verify payload
    const requestPromise = page.waitForRequest(request => 
      request.url().includes('/api/tasks') && request.method() === 'POST'
    );

    // Click "Create"
    await page.getByRole('button', { name: 'Create' }).click();

    // Verify the POST request was sent with correct data
    const request = await requestPromise;
    const postData = request.postDataJSON();
    expect(postData).toMatchObject({
      title: taskTitle
    });

    // Verify the dialog closes
    await expect(page.getByRole('dialog')).toBeHidden();
  });
});
