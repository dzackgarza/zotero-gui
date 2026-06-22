import { describe, expect, it } from 'vitest';
import { parseBibTeXToMetadata } from './bibtexParser';

// The import gate (parseBibTeXToMetadata) and the citation contract
// (citation.ts: isCitable / itemToCsl / hasNameBearingCreator) are two
// repository-owned boundaries that must agree on what counts as a citable
// record. The citation contract treats a record with at least one NAME-BEARING
// creator — author OR editor — as valid, and is proven to render an edited
// volume that has an editor but no author (see citation.test.ts). The import
// gate must agree: a record the app can cite must be importable. It must accept
// any record carrying at least one author OR editor, and must still reject a
// record with neither.
describe('parseBibTeXToMetadata accepts records with a name-bearing creator (author OR editor)', () => {
  it('accepts an author-only @article', () => {
    const bibtex = `@article{serre1968,
  title = {Good Reduction of Abelian Varieties},
  author = {Serre, Jean-Pierre and Tate, John},
  year = {1968},
  journal = {Annals of Mathematics}
}`;
    expect(() => parseBibTeXToMetadata(bibtex)).not.toThrow();
  });

  // The edited volume: editor present, NO author. The citation contract renders
  // this (it is bibliographically valid — the editor is the name-bearing
  // creator). The gate previously rejected it for lacking an author, so a record
  // the app can cite could not be imported. The gate must accept it.
  it('accepts an editor-only @book (an edited volume the citation contract can cite)', () => {
    const bibtex = `@book{gowers2008,
  title = {The Princeton Companion to Mathematics},
  editor = {Gowers, Timothy and Barrow-Green, June and Leader, Imre},
  year = {2008},
  publisher = {Princeton University Press}
}`;
    expect(() => parseBibTeXToMetadata(bibtex)).not.toThrow();
  });

  // The gate must NOT be weakened into accepting truly nameless records. A book
  // with a title and year but NEITHER author NOR editor renders as a nameless
  // citation, which the citation contract refuses. The gate must still reject it.
  it('rejects a record with neither author nor editor', () => {
    const bibtex = `@book{nameless2020,
  title = {An Anonymous Treatise},
  year = {2020},
  publisher = {Unknown Press}
}`;
    expect(() => parseBibTeXToMetadata(bibtex)).toThrow();
  });

  // A record that has a name-bearing creator but no title is still rejected: the
  // title invariant is independent of the creator invariant and is not relaxed.
  it('still rejects a record with creators but no title', () => {
    const bibtex = `@book{notitle2020,
  editor = {Gowers, Timothy},
  year = {2020},
  publisher = {Princeton University Press}
}`;
    expect(() => parseBibTeXToMetadata(bibtex)).toThrow();
  });
});
