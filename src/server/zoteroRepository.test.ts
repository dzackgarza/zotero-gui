import { describe, expect, it } from 'vitest';
import { noteToPlainText } from './zoteroRepository';

// Zotero stores notes as HTML; noteToPlainText flattens them for display. These
// cases are the ones the previous regex stripper got wrong: it left entities
// literal and leaked <script>/<style> text. Each assertion is exact output of a
// real note shape.
describe('noteToPlainText', () => {
  it('extracts plain text from a real Zotero note wrapper', () => {
    expect(noteToPlainText('<div class="zotero-note znv1">Comment: 14 pages</div>')).toBe(
      'Comment: 14 pages',
    );
  });

  it('decodes HTML entities instead of leaving them literal', () => {
    expect(
      noteToPlainText('<p>Tom &amp; Jerry &lt;tag&gt; &quot;q&quot; &#39;a&#39;&nbsp;end</p>'),
    ).toBe('Tom & Jerry <tag> "q" \'a\' end');
  });

  it('drops script and style content rather than leaking it as text', () => {
    expect(
      noteToPlainText('<style>.x{color:red}</style><p>Visible</p><script>alert(1)</script>'),
    ).toBe('Visible');
  });

  it('flattens multi-paragraph notes to collapsed plain text', () => {
    expect(noteToPlainText('<p>Line one.</p><p>Line two.</p>')).toBe('Line one. Line two.');
  });

  it('keeps link text and discards the href', () => {
    expect(noteToPlainText('<p>See <a href="https://example.com/x">this link</a> now.</p>')).toBe(
      'See this link now.',
    );
  });
});
