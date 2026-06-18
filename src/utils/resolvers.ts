export interface MetadataResolverPlugin {
  id: string;
  name: string;
  pattern: RegExp;
  resolve(input: string): Promise<string>;
}

// 1. DOI Resolver Plugin
export const doiResolver: MetadataResolverPlugin = {
  id: 'doi',
  name: 'DOI Resolver',
  pattern: /^(10\.\d{4,9}\/[-._;()/:A-Z0-9]+|https?:\/\/dx\.doi\.org\/10\.\d{4,9}\/[-._;()/:A-Z0-9]+|https?:\/\/doi\.org\/10\.\d{4,9}\/[-._;()/:A-Z0-9]+)$/i,
  async resolve(input: string): Promise<string> {
    let cleanDoi = input.trim();
    if (cleanDoi.includes('doi.org/')) {
      cleanDoi = cleanDoi.split('doi.org/')[1];
    } else if (cleanDoi.includes('dx.doi.org/')) {
      cleanDoi = cleanDoi.split('dx.doi.org/')[1];
    }
    cleanDoi = cleanDoi.trim();

    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`);
    if (!res.ok) {
      throw new Error(`CrossRef lookup failed with HTTP status ${res.status}`);
    }
    const data = await res.json();
    const work = data.message;
    const title = work.title ? work.title[0] : `Document ${cleanDoi}`;
    const authors = (work.author || []).map((a: any) => `${a.family}, ${a.given || ''}`).join(' and ');
    const year = work.published && work.published['date-parts'] 
      ? String(work.published['date-parts'][0][0]) 
      : new Date().getFullYear().toString();
    const journal = work['container-title'] ? work['container-title'][0] : 'CrossRef Journal';
    
    return `@article{doi_${cleanDoi.replace(/[^a-zA-Z0-9]/g, '_')},
  title = {${title}},
  author = {${authors || 'Unknown Author'}},
  journal = {${journal}},
  year = {${year}},
  doi = {${cleanDoi}}
}`;
  }
};

// 2. ISBN Resolver Plugin
export const isbnResolver: MetadataResolverPlugin = {
  id: 'isbn',
  name: 'ISBN Resolver',
  pattern: /^(isbn:?\s*)?((?:97[89])?\d{9}[\dxX])$/i,
  async resolve(input: string): Promise<string> {
    const isbn = input.trim().toLowerCase().replace(/isbn:?/i, '').replace(/[- ]/g, '');
    const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
    if (!res.ok) {
      throw new Error(`OpenLibrary lookup failed with HTTP status ${res.status}`);
    }
    const data = await res.json();
    const bookInfo = data[`ISBN:${isbn}`];
    if (!bookInfo) {
      throw new Error(`ISBN ${isbn} not found on OpenLibrary`);
    }
    const title = bookInfo.title || `Book ${isbn}`;
    const authors = (bookInfo.authors || []).map((a: any) => {
      const parts = a.name.split(' ');
      const lastName = parts.pop() || 'Unknown';
      const firstName = parts.join(' ');
      return `${lastName}, ${firstName}`;
    }).join(' and ');
    const year = bookInfo.publish_date || new Date().getFullYear().toString();
    const publisher = bookInfo.publishers ? bookInfo.publishers.map((p: any) => p.name).join(', ') : 'OpenLibrary Publisher';
    
    return `@book{isbn_${isbn},
  title = {${title}},
  author = {${authors || 'Unknown Author'}},
  publisher = {${publisher}},
  year = {${year}},
  isbn = {${isbn}}
}`;
  }
};

// 3. arXiv Resolver Plugin
export const arxivResolver: MetadataResolverPlugin = {
  id: 'arxiv',
  name: 'arXiv Resolver',
  pattern: /^(arxiv:)?(\d{4}\.\d{4,5}(v\d+)?|abs\/\d{4}\.\d{4,5}(v\d+)?|https?:\/\/arxiv\.org\/(abs|pdf)\/\d{4}\.\d{4,5}(v\d+)?(\.pdf)?)$/i,
  async resolve(input: string): Promise<string> {
    let arxivId = input.trim();
    if (arxivId.includes('arxiv.org/abs/')) {
      arxivId = arxivId.split('arxiv.org/abs/')[1].split('?')[0].split('#')[0];
    } else if (arxivId.includes('arxiv.org/pdf/')) {
      arxivId = arxivId.split('arxiv.org/pdf/')[1].replace(/\.pdf$/, '').split('?')[0];
    } else if (arxivId.toLowerCase().startsWith('arxiv:')) {
      arxivId = arxivId.substring(6);
    }

    const res = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`);
    if (!res.ok) {
      throw new Error(`arXiv lookup failed with HTTP status ${res.status}`);
    }
    const text = await res.text();
    if (text.includes('<entry>') && text.includes('<title>Error</title>')) {
      throw new Error(`arXiv ID ${arxivId} not found`);
    }
    const titleMatch = text.match(/<title>([^]*?)<\/title>/);
    const title = titleMatch 
      ? titleMatch[1].replace(/\n/g, ' ').trim().replace(/Title:\s*/i, '') 
      : `arXiv Article ${arxivId}`;
      
    const authorsList: string[] = [];
    const authorMatches = text.matchAll(/<author>[^]*?<name>(.*?)<\/name>[^]*?<\/author>/g);
    for (const m of authorMatches) {
      const name = m[1].trim();
      const parts = name.split(' ');
      const lastName = parts.pop() || 'Unknown';
      const firstName = parts.join(' ');
      authorsList.push(`${lastName}, ${firstName}`);
    }
    const authors = authorsList.join(' and ');
    
    const dateMatch = text.match(/<published>(.*?)<\/published>/);
    const year = dateMatch ? dateMatch[1].substring(0, 4) : new Date().getFullYear().toString();
    
    return `@article{arxiv_${arxivId.replace(/[^a-zA-Z0-9]/g, '_')},
  title = {${title}},
  author = {${authors || 'Unknown Author'}},
  journal = {arXiv preprint arXiv:${arxivId}},
  year = {${year}},
  url = {https://arxiv.org/abs/${arxivId}}
}`;
  }
};

// 4. zbMATH Resolver Plugin
export const zbmathResolver: MetadataResolverPlugin = {
  id: 'zbmath',
  name: 'zbMATH Resolver',
  pattern: /^(zbmath:)?(zbl\s*\d{4}\.\d{5}|an:\s*\d{4}\.\d{5}|\d{4}\.\d{5}|https?:\/\/zbmath\.org\/\?q=an:\d{4}\.\d{5}|https?:\/\/zbmath\.org\/an\/\d{4}\.\d{5})$/i,
  async resolve(input: string): Promise<string> {
    throw new Error('zbMATH lookup is not implemented');
  }
};

// 5. MathSciNet Resolver Plugin
export const mathscinetResolver: MetadataResolverPlugin = {
  id: 'mathscinet',
  name: 'MathSciNet Resolver',
  pattern: /^(mr:)?(\d{6,8}|https?:\/\/ams\.org\/mathscinet-mref\?mr=\d+|https?:\/\/mathscinet\.ams\.org\/mathscinet-mref\?mr=\d+)$/i,
  async resolve(input: string): Promise<string> {
    throw new Error('MathSciNet lookup is not implemented');
  }
};

// Plugin Registry Class
export class MetadataResolverRegistry {
  private plugins: MetadataResolverPlugin[] = [];

  constructor() {
    this.register(doiResolver);
    this.register(isbnResolver);
    this.register(arxivResolver);
    this.register(zbmathResolver);
    this.register(mathscinetResolver);
  }

  register(plugin: MetadataResolverPlugin) {
    // Avoid duplicates
    if (!this.plugins.some(p => p.id === plugin.id)) {
      this.plugins.push(plugin);
    }
  }

  getAllPlugins(): MetadataResolverPlugin[] {
    return [...this.plugins];
  }

  getMatchingPlugins(input: string): MetadataResolverPlugin[] {
    const query = input.trim();
    if (!query) return [];
    return this.plugins.filter(p => p.pattern.test(query));
  }

  getPluginById(id: string): MetadataResolverPlugin | undefined {
    return this.plugins.find(p => p.id === id);
  }

  async resolveWithPlugin(pluginId: string, input: string): Promise<string> {
    const plugin = this.getPluginById(pluginId);
    if (!plugin) {
      throw new Error(`Plugin "${pluginId}" not found in registry.`);
    }
    return plugin.resolve(input);
  }

  async resolve(input: string): Promise<string> {
    const matches = this.getMatchingPlugins(input);
    if (matches.length === 0) {
      throw new Error(`No metadata resolver plugin matched input pattern: "${input}"`);
    }
    // Default to the first matching plugin
    return matches[0].resolve(input);
  }
}

export const registry = new MetadataResolverRegistry();
