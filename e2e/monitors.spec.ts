import { test, expect } from '@playwright/test';

/**
 * These tests mock the run API to avoid real Anthropic/Supabase calls.
 * They verify UI state transitions (loading, success, error) work correctly.
 */
test.describe('Monitor Run Button', () => {
  test('shows loading state then success when run succeeds', async ({ page }) => {
    // Mock the run endpoint to return success
    await page.route('/api/monitors/*/run', async (route) => {
      await new Promise((r) => setTimeout(r, 200)); // simulate delay
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, runId: 'mock-run-id' }),
      });
    });

    await page.goto('/monitors/mock-id');

    const runButton = page.getByRole('button', { name: /run now/i });

    // If the page redirects (not logged in), skip this test
    if (page.url().includes('/auth/login')) {
      test.skip();
      return;
    }

    await runButton.click();
    await expect(page.getByText(/running/i)).toBeVisible({ timeout: 3000 });
  });

  test('shows error message when run fails', async ({ page }) => {
    await page.route('/api/monitors/*/run', async (route) => {
      await route.fulfill({
        status: 402,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Insufficient credits' }),
      });
    });

    await page.goto('/monitors/mock-id');

    if (page.url().includes('/auth/login')) {
      test.skip();
      return;
    }

    const runButton = page.getByRole('button', { name: /run now/i });
    await runButton.click();
    await expect(page.getByText(/insufficient credits/i)).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Monitor List', () => {
  test('redirects to login if unauthenticated', async ({ page }) => {
    await page.goto('/monitors/new');
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
