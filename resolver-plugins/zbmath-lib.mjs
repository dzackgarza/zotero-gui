export function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function parseZblNumber(input) {
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

function doi(document) {
  const links = document.links;
  invariant(Array.isArray(links), 'ZBMath document must contain links data');
  const doiLink = links.find(link => link?.type === 'doi');
  return doiLink ? text(doiLink.identifier, 'ZBMath DOI link must contain an identifier') : null;
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

export function articleBibTeX(document, zblNumber) {
  const source = serialSource(document);
  const fields = [
    ['title', title(document)],
    ['author', authors(document)],
    ['journal', text(source.title, 'ZBMath source must contain a journal title')],
    ['year', text(document.year, 'ZBMath document must contain a year')],
    ['zblnumber', zblNumber],
    ['zbmath', String(document.id)],
  ];
  const doiValue = doi(document);

  if (doiValue) {
    fields.push(['doi', doiValue]);
  }

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
