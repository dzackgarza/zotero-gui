export function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function text(value, message) {
  invariant(typeof value === 'string' && value.trim().length > 0, message);
  return value.replace(/\s+/g, ' ').trim();
}

// Citation.js's BibTeX output module escapes braces in string fields (title,
// publisher, journal) but emits CSL name fields by wrapping the raw value in
// `{...}` WITHOUT escaping interior braces. A `{`/`}` inside an author name
// therefore produces unbalanced BibTeX (e.g. `author = {{Smith }}}`) that the
// validation gate truncates, silently dropping the title. A brace is never
// legitimate content in a personal name, so reject it loudly rather than emit
// corrupt BibTeX. This is not a sanitizing replace: the input is invalid and
// fails. Every resolver that maps a name into a CSL name field shares this one
// invariant — it must have a single owned definition so the rule cannot diverge.
export function citeName(name, message) {
  const value = text(name, message);
  invariant(
    !value.includes('{') && !value.includes('}'),
    `author name must not contain a BibTeX brace delimiter: ${value}`,
  );
  return value;
}

export async function readRawStdin() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input.trim();
}
