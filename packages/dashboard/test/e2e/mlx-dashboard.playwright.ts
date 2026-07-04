import { test, expect } from '@playwright/test';

const PROFILES = [
  { id: 'model-1', name: 'llama-3-8b', status: 'loaded', memoryMB: 4096, tokensPerSec: 42.5 },
  { id: 'model-2', name: 'mistral-7b', status: 'loaded', memoryMB: 3840, tokensPerSec: 38.1 },
];

test.describe('MlxDashboardPage — profile polling', () => {
  test.beforeEach(async ({ page }) => {
    // Stub existing dashboard routes to prevent noise
    await page.route('**/api/events', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/status', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'idle', currentTask: null }),
      });
    });
    await page.route('**/api/tasks', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
  });

  test('profile cards render within 4s on sidecar response', async ({ page }) => {
    await page.route('**/api/mlx/profiles', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PROFILES),
      });
    });

    await page.goto('/mlx');

    // All profile cards must appear within 4s of page load
    await expect(page.getByTestId('profile-card')).toHaveCount(PROFILES.length, { timeout: 4000 });
    await expect(page.getByText('llama-3-8b')).toBeVisible();
    await expect(page.getByText('mistral-7b')).toBeVisible();
  });

  test('polling interval cleared on unmount — no requests after navigation', async ({ page }) => {
    let requestCount = 0;

    await page.route('**/api/mlx/profiles', async route => {
      requestCount++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PROFILES),
      });
    });

    await page.goto('/mlx');
    // Wait for initial render + at least one poll (3s interval)
    await expect(page.getByTestId('profile-card')).toHaveCount(PROFILES.length, { timeout: 4000 });
    await page.waitForTimeout(3500);

    const countAfterMount = requestCount;
    expect(countAfterMount).toBeGreaterThanOrEqual(1);

    // Navigate away — component unmounts, interval must be cleared
    await page.goto('/');
    const countAtUnmount = requestCount;

    // Wait longer than one poll interval; no new requests should fire
    await page.waitForTimeout(4000);
    expect(requestCount).toBe(countAtUnmount);
  });

  test('stale data shown when sidecar drops mid-session', async ({ page }) => {
    let callCount = 0;

    await page.route('**/api/mlx/profiles', async route => {
      callCount++;
      if (callCount === 1) {
        // First poll: sidecar alive
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(PROFILES),
        });
      } else {
        // Subsequent polls: sidecar dropped
        await route.fulfill({ status: 503, body: '' });
      }
    });

    await page.goto('/mlx');

    // Initial data renders
    await expect(page.getByText('llama-3-8b')).toBeVisible({ timeout: 4000 });
    await expect(page.getByText('mistral-7b')).toBeVisible();

    // Wait for at least one failed poll cycle
    await page.waitForTimeout(4000);

    // Stale profile cards must still be visible (not wiped on error)
    await expect(page.getByText('llama-3-8b')).toBeVisible();
    await expect(page.getByText('mistral-7b')).toBeVisible();

    // Page must surface a stale-data indicator
    await expect(page.getByTestId('stale-indicator')).toBeVisible();
  });
});
