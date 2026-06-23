import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { LibraryPayloadSchema, StartupStatusSchema, type LibraryPayload } from '../../src/schemas';

interface BibliographicWitness {
  title: string;
  creatorLastName: string;
}

async function responseStatus(responsePromise: Promise<{ status: () => number; dispose: () => Promise<void> }>): Promise<number> {
  const response = await responsePromise;
  const status = response.status();
  await response.dispose();
  return status;
}

async function waitForStartup(request: APIRequestContext): Promise<void> {
  await expect.poll(
    () => responseStatus(request.get('/api/startup')),
    {
      message: 'canonical app entrypoint must expose the API server through Vite',
      timeout: 30_000,
    },
  ).toBe(200);

  const response = await request.get('/api/startup');
  expect(StartupStatusSchema.parse(await response.json())).toEqual({ zotero: { running: true } });
  await response.dispose();
}

function selectBibliographicWitness(library: LibraryPayload): BibliographicWitness {
  for (const candidate of library.items) {
    const creator = candidate.creators[0];
    if (candidate.inTrash === false
      && candidate.title !== undefined
      && candidate.title.trim().length > 0
      && creator !== undefined
      && creator.lastName.trim().length > 0) {
      return {
        title: candidate.title,
        creatorLastName: creator.lastName,
      };
    }
  }
  throw new Error('Live Zotero library must contain a titled active item with a creator.');
}

async function loadLiveWitness(request: APIRequestContext): Promise<BibliographicWitness> {
  const response = await request.get('/api/library');
  expect(response.status(), 'actual app entrypoint must serve the live library API').toBe(200);
  const library = LibraryPayloadSchema.parse(await response.json());
  await response.dispose();
  return selectBibliographicWitness(library);
}

async function searchForWitness(page: Page, witness: BibliographicWitness): Promise<void> {
  await page.goto('/');
  await page.getByPlaceholder('Search authors, titles, DOI, tags...').fill(witness.title);
}

test('canonical app entrypoint searches the real Zotero library', async ({ page, request }) => {
  await waitForStartup(request);
  const witness = await loadLiveWitness(request);

  await searchForWitness(page, witness);

  const matchingRow = page
    .locator('tbody tr')
    .filter({ hasText: witness.title })
    .filter({ hasText: witness.creatorLastName })
    .first();
  await expect(matchingRow).toBeVisible();
});
