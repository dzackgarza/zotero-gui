// @citation-js/core ships no type declarations and no @types package exists.
// Minimal typed surface for the BibTeX serialization the resolvers use.
declare module '@citation-js/core' {
  export class Cite {
    constructor(data: unknown);
    readonly data: Array<Record<string, unknown>>;
    format(format: string, options?: Record<string, unknown>): string;
  }
}

declare module '@citation-js/plugin-bibtex';
