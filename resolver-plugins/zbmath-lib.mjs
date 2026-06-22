import { Cite } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import { citeName, invariant, text } from './utils.mjs';
export { invariant };

// The server accepts the zbMATH "AN:" identifier prefix case-insensitively (the
// manifest pattern is matched with the `i` flag in pluginAcceptsInput), in both
// the bare `AN:1234.56789` form and the `?q=AN:...` URL form. The plugin must
// therefore strip the prefix case-insensitively so every accepted input yields
// the bare zbMATH number; a literal lowercase-only strip would re-send an
// unstripped `AN:` to zbMATH (e.g. `an:AN:...`) and never resolve.
const AN_PREFIX = /^an:/i;

// The manifest URL pattern (`^https?://...`) is matched case-insensitively in
// pluginAcceptsInput, so `HTTPS://...`/`Https://...` are contract-valid URL
// inputs. The scheme check must be case-insensitive too, otherwise an
// uppercase-scheme URL falls through to the bare branch and the whole URL is
// sent upstream as a zbMATH number, which never resolves.
const URL_SCHEME = /^https?:\/\//i;

export function parseZblNumber(input) {
  if (URL_SCHEME.test(input)) {
    const url = new URL(input);
    const query = url.searchParams.get('q');
    invariant(query, 'ZBMath URL must contain a q parameter');
    invariant(AN_PREFIX.test(query), 'ZBMath URL q parameter must start with an:');
    return query.replace(AN_PREFIX, '').trim();
  }

  return input.replace(AN_PREFIX, '').trim();
}

// zbMath returns `year` as free-text. Extract the four-digit year the same way
// the ISBN resolver does for Open Library's free-text publish_date, and throw
// loudly when none is present. `Number.parseInt` is wrong here: it yields NaN
// for "circa 2019" (serialized as `year = {NaN}`) and silently truncates
// "2020a" to a partially-parsed value.
function year(document) {
  const raw = text(document.year, 'ZBMath document must contain a year');
  const match = /\d{4}/.exec(raw);
  invariant(match, `ZBMath year must contain a four-digit year: ${raw}`);
  return Number.parseInt(match[0], 10);
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
  return entries.map(author => text(author.name, 'ZBMath author must contain a name'));
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
  const record = {
    'citation-key': `zbl_${zblNumber.replaceAll('.', '_')}`,
    type: 'article-journal',
    title: title(document),
    author: authors(document).map(name => ({ literal: citeName(name, 'ZBMath author must contain a name') })),
    'container-title': text(source.title, 'ZBMath source must contain a journal title'),
    issued: { 'date-parts': [[year(document)]] },
  };

  const doiValue = doi(document);
  if (doiValue) {
    record.DOI = doiValue;
  }
  if (typeof source.volume === 'string' && source.volume.trim().length > 0) {
    record.volume = text(source.volume, 'ZBMath source volume must be text');
  }
  if (typeof source.issue === 'string' && source.issue.trim().length > 0) {
    record.issue = text(source.issue, 'ZBMath source issue must be text');
  }
  if (typeof document.source.pages === 'string' && document.source.pages.trim().length > 0) {
    record.page = text(document.source.pages, 'ZBMath source pages must be text');
  }

  return new Cite([record]).format('bibtex').trim();
}
