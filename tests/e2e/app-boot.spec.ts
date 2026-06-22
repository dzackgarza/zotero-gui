import { expect, test, type Page } from '@playwright/test';
import { setFixtureScenario } from './helpers';

function isRenderBoundaryFailure(message: string): boolean {
  if (message.includes('Application Render Error')) {
    return true;
  }
  return message.includes('Invalid input: expected object, received array');
}

async function expectBootedGui(page: Page): Promise<void> {
  await expect(page.getByText('Small gaps between primes')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Maynard')).toBeVisible();
  await expect(page.getByText('Number theory')).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  await setFixtureScenario(request, 'ready');
});

test('boots the full Zotero GUI against the fixture API without a render-boundary crash', async ({ page }) => {
  const pageErrors: string[] = [];
  const browserConsoleErrors: string[] = [];

  page.on('pageerror', error => {
    pageErrors.push(error.message);
  });
  page.on('console', message => {
    if (message.type() === 'error') {
      browserConsoleErrors.push(message.text());
    }
  });

  await page.goto('/');

  await expect(page.getByText('Application Render Error')).toHaveCount(0);
  await expect(page.getByText('Invalid input: expected object, received array')).toHaveCount(0);
  await expectBootedGui(page);

  expect(pageErrors.filter(isRenderBoundaryFailure)).toEqual([]);
  expect(browserConsoleErrors.filter(isRenderBoundaryFailure)).toEqual([]);
});
