import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_COLUMNS } from '../../src/data/samples';
import { PALETTE_SEARCH_KEYS } from '../../src/utils/fuzzy';
import { fixtureApiUrl, setFixtureScenario } from './helpers';

async function openCommandPalette(page: Page): Promise<void> {
  await page.keyboard.press('Control+Shift+P');
}

async function runCommand(page: Page, name: string): Promise<void> {
  await openCommandPalette(page);
  await page.getByText(name).click();
}

test('shows the loading state while the startup boundary is pending', async ({ page, request }) => {
  await setFixtureScenario(request, 'startup-pending');

  await page.goto('/');

  await expect(page.getByRole('status', { name: /loading zotero database/i })).toBeVisible();
  await expect(page.getByText('Loading Zotero database')).toBeVisible();
});

test('renders library-load failures from the real API route as the App failure view', async ({ page, request }) => {
  await setFixtureScenario(request, 'library-failure');

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Zotero Library Load Failed' })).toBeVisible();
  await expect(page.getByText('Database query failed')).toBeVisible();
  await expect(page.getByRole('button', { name: /reload library/i })).toBeVisible();
});

test('boots with historical array-shaped persisted column state and rewrites it', async ({ page, request }) => {
  await setFixtureScenario(request, 'ready');
  const historicalColumnLayout = DEFAULT_COLUMNS.map(column => ({
    key: column.key,
    visible: column.visible,
    width: column.width,
  }));
  const expectedPersistedLayout = {
    version: 2,
    columnVisibility: Object.fromEntries(DEFAULT_COLUMNS.map(column => [column.key, column.visible])),
    columnOrder: DEFAULT_COLUMNS.map(column => column.key),
    columnSizing: Object.fromEntries(DEFAULT_COLUMNS.map(column => [column.key, column.width])),
  };
  await page.addInitScript(columns => {
    localStorage.setItem('zotero-gui:columns:v1', JSON.stringify(columns));
  }, historicalColumnLayout);

  await page.goto('/');

  await expect(page.getByText('Small gaps between primes')).toBeVisible();
  await expect(page.getByText('Maynard')).toBeVisible();
  await expect(page.getByText('Number theory')).toBeVisible();

  const rewrittenColumnLayout = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('zotero-gui:columns:v1') as string),
  );
  expect(rewrittenColumnLayout).toEqual(expectedPersistedLayout);
  await expect(page.getByText('Application Render Error')).toHaveCount(0);
});

test('reconciles a selected collection after reload drops it', async ({ page, request }) => {
  await setFixtureScenario(request, 'stale-collection-reload');

  await page.goto('/');
  await page.getByText('Soon Deleted').first().click();
  await expect(page.getByText('Selected Collection Paper')).toBeVisible();

  const reloadResponse = page.waitForResponse(response =>
    response.url().endsWith('/api/library') && response.request().method() === 'GET',
  );
  await page.getByTitle('Sync library now').click();
  const response = await reloadResponse;
  expect(response.status()).toBe(200);
  const payload = await response.json() as {
    items: Array<{ title: string }>;
    collections: Array<{ kind: string; id: string; name: string }>;
  };
  expect(payload.items.map(item => item.title)).toEqual(['Other Library Paper']);
  expect(payload.collections).toEqual([{ kind: 'library-root', id: 'all', name: 'My Library' }]);

  await expect(page.getByText('Other Library Paper')).toBeVisible();
  await expect(page.getByText('Selected Collection Paper')).toHaveCount(0);
  await expect(page.getByText('Soon Deleted')).toHaveCount(0);
  await expect(page.getByText('Library is empty or filter returned zero matches.')).toHaveCount(0);
  await expect(page.getByText('Application Render Error')).toHaveCount(0);
});

test('reloads the library after the startup check recovers', async ({ page, request }) => {
  await setFixtureScenario(request, 'startup-recovers');

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Zotero is not running' })).toBeVisible();

  await page.getByRole('button', { name: /reload library/i }).click();

  await expect(page.getByText('Reloaded Zotero Item')).toBeVisible();
});

test('surfaces attachment-open route errors in the App toast', async ({ page, request }) => {
  await setFixtureScenario(request, 'attachment-missing-path');

  await page.goto('/');
  await page.getByText('Paper With Attachment').click();
  const attachmentResponse = page.waitForResponse(response =>
    response.url().endsWith('/api/attachments/ATT_NOPATH/open'),
  );
  await page.getByRole('button', { name: /open/i }).click();
  const response = await attachmentResponse;
  expect(response.status()).toBe(400);
  const payload = await response.json() as { error: { kind: string; message: string } };
  expect(payload.error.kind).toBe('attachment_path_missing');

  await expect(page.getByText(payload.error.message)).toBeVisible();
});

test('routes Add Item through resolver metadata, resolver execution, and the import boundary', async ({ page, request }) => {
  await setFixtureScenario(request, 'add-item');

  await page.goto('/');
  await page.getByText('Number theory').first().click();
  await page.getByRole('button', { name: 'Add Item' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Journal Article')).toHaveCount(0);
  await expect(dialog.getByText('Conference Paper')).toHaveCount(0);
  await dialog.getByRole('combobox').selectOption('crossref-doi');
  await dialog.getByRole('textbox').fill('10.1090/noti1234');
  await dialog.getByRole('button', { name: 'Add Item' }).click();

  await expect(page.getByText('Successfully added item to Zotero.')).toBeVisible();

  const importResponse = await request.get(fixtureApiUrl('/__e2e/imports'));
  const importPayload = await importResponse.json() as { imports: Array<{ operation: string; collection_keys: string[] }> };
  expect(importPayload.imports).toHaveLength(1);
  expect(importPayload.imports[0]).toMatchObject({
    operation: 'import_bibtex',
    collection_keys: ['NTKEYAB12'],
  });
});

test('seeds the advanced-search default scope from the canonical palette key source', async ({ page, request }) => {
  await setFixtureScenario(request, 'ready');

  await page.goto('/');
  await expect(page.getByText('Small gaps between primes')).toBeVisible();
  await page.getByRole('button', { name: /advanced search scopes/i }).click();

  const canonical = new Set<string>(PALETTE_SEARCH_KEYS);
  for (const column of DEFAULT_COLUMNS) {
    const checkbox = page.getByRole('checkbox', { name: column.label, exact: true });
    if (canonical.has(column.key)) {
      await expect(checkbox).toBeChecked();
    } else {
      await expect(checkbox).not.toBeChecked();
    }
  }
});

test('copies APA citations for citable selections and rejects attachment selections', async ({ page, context, request }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await setFixtureScenario(request, 'citation-items');

  await page.goto('/');
  await page.getByText('Citable Journal Paper').click();
  await runCommand(page, 'Copy Selected APA Citation');

  await expect(page.getByText('APA Citation copied to clipboard!')).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('Germain');
  expect(copied).toContain('1816');
  expect(copied).toContain('Citable Journal Paper');

  await page.getByText('Standalone Attachment File').click();
  await runCommand(page, 'Copy Selected APA Citation');

  await expect(page.getByText('This item type cannot be cited.')).toBeVisible();
  const rejectedClipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(rejectedClipboard).toBe(copied);
  expect(rejectedClipboard).not.toContain('Standalone Attachment File');
  await expect(page.getByText('Application Render Error')).toHaveCount(0);
});

test('keeps a second toast visible for its own full duration', async ({ page, context, request }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await setFixtureScenario(request, 'toast-timing');

  await page.goto('/');
  await page.getByText('Citable Journal Paper').click();

  const download = page.waitForEvent('download');
  await runCommand(page, 'Export Stored Database Backup (JSON)');
  await download;
  await expect(page.getByText('Database backup exported to JSON!')).toBeVisible();

  await page.waitForTimeout(2000);
  await runCommand(page, 'Copy Selected APA Citation');
  await expect(page.getByText('APA Citation copied to clipboard!')).toBeVisible();

  await page.waitForTimeout(1000);
  await expect(page.getByText('APA Citation copied to clipboard!')).toBeVisible();

  await page.waitForTimeout(2200);
  await expect(page.getByText('APA Citation copied to clipboard!')).toHaveCount(0);
});
