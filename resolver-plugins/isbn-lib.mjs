import { XMLParser } from 'fast-xml-parser';

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function array(value, message) {
  invariant(value, message);
  return Array.isArray(value) ? value : [value];
}

function text(value, message) {
  invariant(typeof value === 'string' && value.trim().length > 0, message);
  return value.trim();
}

function subfields(field, code) {
  return array(field.subfield, `MARC field ${field['@_tag']} must contain subfields`)
    .filter(subfield => subfield['@_code'] === code)
    .map(subfield => text(subfield['#text'], `MARC field ${field['@_tag']}$${code} must contain text`));
}

function firstField(record, tag) {
  const field = array(record.datafield, 'LoC MARC record must contain data fields')
    .find(datafield => datafield['@_tag'] === tag);
  invariant(field, `LoC MARC record must contain ${tag}`);
  return field;
}

function values(record, tag, code) {
  return array(record.datafield, 'LoC MARC record must contain data fields')
    .filter(datafield => datafield['@_tag'] === tag)
    .flatMap(datafield => subfields(datafield, code));
}

function cleanMarcValue(value) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s+([:;,])/g, '$1')
    .replace(/[ /,.;:]+$/g, '')
    .trim();
}

function title(record) {
  const field = firstField(record, '245');
  const mainTitle = subfields(field, 'a')[0];
  const subtitle = subfields(field, 'b')[0];
  return cleanMarcValue(`${mainTitle} ${subtitle}`);
}

function author(record) {
  const field = firstField(record, '100');
  return cleanMarcValue(subfields(field, 'a')[0]);
}

function publisher(record) {
  return cleanMarcValue(subfields(firstField(record, '260'), 'b')[0]);
}

function year(record) {
  const publicationDate = subfields(firstField(record, '260'), 'c')[0];
  const match = /\d{4}/.exec(publicationDate);
  invariant(match, 'LoC MARC publication date must contain a year');
  return match[0];
}

function isbns(record) {
  const found = values(record, '020', 'a').map(cleanMarcValue);
  invariant(found.length > 0, 'LoC MARC record must contain ISBN values');
  return found.join(' ');
}

export function bookBibTeX(xmlText, isbn) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
  });
  const parsed = parser.parse(xmlText);
  const result = parsed.searchRetrieveResponse;
  invariant(Number(result.numberOfRecords) > 0, `Library of Congress did not return ISBN ${isbn}`);
  const record = result.records.record.recordData.record;
  invariant(record, 'Library of Congress ISBN lookup must return a MARC record');

  return `@book{isbn_${isbn},
  title = {${title(record)}},
  author = {${author(record)}},
  publisher = {${publisher(record)}},
  year = {${year(record)}},
  isbn = {${isbns(record)}}
}`;
}
