function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readStdin() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const value = input.trim();
  invariant(value.length > 0, 'ZBMath resolver input must not be empty');
  return value;
}

function parseZblNumber(input) {
  if (input.startsWith('http://') || input.startsWith('https://')) {
    const url = new URL(input);
    const query = url.searchParams.get('q');
    invariant(query, 'ZBMath URL must contain a q parameter');
    const prefix = 'an:';
    invariant(query.startsWith(prefix), 'ZBMath URL q parameter must start with an:');
    return query.slice(prefix.length).trim();
  }

  const prefix = 'an:';
  return input.startsWith(prefix) ? input.slice(prefix.length).trim() : input.trim();
}

function text(value, message) {
  invariant(typeof value === 'string' && value.trim().length > 0, message);
  return value.replace(/\s+/g, ' ').trim();
}

function title(document) {
  invariant(document.title && typeof document.title === 'object', 'ZBMath document must contain title data');
  const mainTitle = text(document.title.title, 'ZBMath document must contain a title');
  const subtitle = document.title.subtitle;
  return typeof subtitle === 'string' && subtitle.trim().length > 0
    ? `${mainTitle}: ${text(subtitle, 'ZBMath document subtitle must be text')}`
    : mainTitle;
}

function authors(document) {
  const entries = document.contributors?.authors;
  invariant(Array.isArray(entries) && entries.length > 0, 'ZBMath document must contain authors');
  return entries.map(author => text(author.name, 'ZBMath author must contain a name')).join(' and ');
}

function serialSource(document) {
  const source = document.source;
  invariant(source && typeof source === 'object', 'ZBMath document must contain source data');

  const serials = source.serial;
  const series = source.series;
  const entries = Array.isArray(serials) && serials.length > 0 ? serials : series;
  invariant(Array.isArray(entries) && entries.length > 0, 'ZBMath article must contain serial or series source data');

  const entry = entries[0];
  invariant(entry && typeof entry === 'object', 'ZBMath source entry must be an object');
  return entry;
}

function articleBibTeX(document, zblNumber) {
  const source = serialSource(document);
  const fields = [
    ['title', title(document)],
    ['author', authors(document)],
    ['journal', text(source.title, 'ZBMath source must contain a journal title')],
    ['year', text(document.year, 'ZBMath document must contain a year')],
    ['zblnumber', zblNumber],
    ['zbmath', String(document.id)],
  ];

  if (typeof source.volume === 'string' && source.volume.trim().length > 0) {
    fields.push(['volume', text(source.volume, 'ZBMath source volume must be text')]);
  }
  if (typeof source.issue === 'string' && source.issue.trim().length > 0) {
    fields.push(['number', text(source.issue, 'ZBMath source issue must be text')]);
  }
  if (typeof document.source.pages === 'string' && document.source.pages.trim().length > 0) {
    fields.push(['pages', text(document.source.pages, 'ZBMath source pages must be text')]);
  }

  const key = `zbl_${zblNumber.replaceAll('.', '_')}`;
  const body = fields.map(([name, value]) => `  ${name} = {${value}}`).join(',\n');
  return `@article{${key},\n${body}\n}`;
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
