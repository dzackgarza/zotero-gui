let input = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk;
});

process.stdin.on('end', () => {
  const source = input.trim();
  process.stdout.write(`@book{resolver_fixture,
  title = {Resolved ${source}},
  author = {Noether, Emmy},
  publisher = {Independent Resolver Press},
  year = {2026},
  isbn = {9780262033848}
}`);
});
