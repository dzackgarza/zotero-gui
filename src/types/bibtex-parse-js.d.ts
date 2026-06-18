declare module 'bibtex-parse-js' {
  export interface BibTeXEntry {
    citationKey: string;
    entryType: string;
    entryTags: Record<string, string>;
  }
  export function toJSON(bibtex: string): BibTeXEntry[];
}
