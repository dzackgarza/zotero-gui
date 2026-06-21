import { articleBibTeX, invariant, parseZblNumber } from './zbmath-lib.mjs';

import { readRawStdin } from './utils.mjs';

async function readStdin() {
  const raw = await readRawStdin();
  invariant(raw.length > 0, 'ZBMath resolver input must not be empty');
  return raw;
}

const zblNumber = parseZblNumber(await readStdin());
invariant(zblNumber.length > 0, 'ZBMath resolver input must contain a Zbl number');

const searchUrl = new URL('https://api.zbmath.org/v1/document/_search');
searchUrl.searchParams.set('search_string', `an:${zblNumber}`);
searchUrl.searchParams.set('results_per_page', '1');

const response = await fetch(searchUrl);
invariant(response.ok, `ZBMath document search failed with HTTP ${response.status}`);

const payload = await response.json();
invariant(payload.status?.status_code === 200, 'ZBMath document search did not return status 200');
invariant(payload.status.nr_total_results === 1, `ZBMath search for ${zblNumber} must return exactly one result`);
invariant(Array.isArray(payload.result) && payload.result.length === 1, `ZBMath search for ${zblNumber} must return one document`);

const document = payload.result[0];
invariant(document.database === 'Zbl', `ZBMath search for ${zblNumber} must return a Zbl document`);
invariant(document.document_type?.code === 'j', 'ZBMath resolver currently accepts journal article records');

process.stdout.write(articleBibTeX(document, zblNumber));
