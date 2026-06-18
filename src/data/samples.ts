import { ZoteroItem, Collection } from '../types';

export const INITIAL_COLLECTIONS: Collection[] = [
  { id: 'all', name: 'My Library' },
  { id: 'cs-ml', name: 'AI & Machine Learning' },
  { id: 'cs-ml-deep', name: 'Deep Learning', parentId: 'cs-ml' },
  { id: 'cs-ml-nlp', name: 'Natural Language Processing', parentId: 'cs-ml' },
  { id: 'bio-med', name: 'Biomedical & Genetics' },
  { id: 'bio-med-crispr', name: 'Gene Editing & CRISPR', parentId: 'bio-med' },
  { id: 'humanities', name: 'Digital Humanities & History' },
];

export const INITIAL_ITEMS: ZoteroItem[] = [
  {
    id: 'vaswani-2017',
    itemType: 'journalArticle',
    title: 'Attention Is All You Need',
    creators: [
      { firstName: 'Ashish', lastName: 'Vaswani', creatorType: 'author' },
      { firstName: 'Noam', lastName: 'Shazeer', creatorType: 'author' },
      { firstName: 'Niki', lastName: 'Parmar', creatorType: 'author' },
      { firstName: 'Jakob', lastName: 'Uszkoreit', creatorType: 'author' },
      { firstName: 'Llion', lastName: 'Jones', creatorType: 'author' },
      { firstName: 'Aidan N.', lastName: 'Gomez', creatorType: 'author' },
      { firstName: 'Lukasz', lastName: 'Kaiser', creatorType: 'author' },
      { firstName: 'Illia', lastName: 'Polosukhin', creatorType: 'author' },
    ],
    publicationTitle: 'Advances in Neural Information Processing Systems',
    volume: '30',
    issue: '1',
    pages: '5998-6008',
    date: '2017',
    publisher: 'Curran Associates, Inc.',
    place: 'Long Beach, CA',
    doi: '10.5555/3295222.3295349',
    url: 'https://arxiv.org/abs/1706.03762',
    language: 'en',
    citekey: 'vaswani_attention_2017',
    abstractNote: 'We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely. Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train.',
    tags: ['Transformers', 'NLP', 'Self-Attention', 'Neural Networks', 'Machine Translation'],
    collections: ['cs-ml', 'cs-ml-nlp'],
    dateAdded: '2026-01-10T10:30:15Z',
    dateModified: '2026-06-15T14:22:11Z',
    notes: [
      {
        id: 'note-1',
        note: 'Introduced the encoder-decoder attention architecture that is now standard in LLMs like GPT-4 and Gemini. Crucial reference paper!',
        dateAdded: '2026-01-10T10:35:00Z',
        dateModified: '2026-01-10T10:35:00Z'
      }
    ],
    attachments: [
      {
        id: 'attach-1',
        title: 'Vaswani et al. - 2017 - Attention Is All You Need.pdf',
        mimeType: 'application/pdf',
        path: '/storage/Vaswani_2017_Attention_Is_All_You_Need.pdf'
      }
    ]
  },
  {
    id: 'he-2016',
    itemType: 'conferencePaper',
    title: 'Deep Residual Learning for Image Recognition',
    creators: [
      { firstName: 'Kaiming', lastName: 'He', creatorType: 'author' },
      { firstName: 'Xiangyu', lastName: 'Zhang', creatorType: 'author' },
      { firstName: 'Shaoqing', lastName: 'Ren', creatorType: 'author' },
      { firstName: 'Jian', lastName: 'Sun', creatorType: 'author' }
    ],
    publicationTitle: 'Proceedings of the IEEE Conference on Computer Vision and Pattern Recognition',
    pages: '770-778',
    date: '2016',
    publisher: 'IEEE',
    place: 'Las Vegas, NV',
    doi: '10.1109/CVPR.2016.90',
    url: 'https://ieeexplore.ieee.org/document/7780459',
    language: 'en',
    citekey: 'he_deep_2016',
    abstractNote: 'Deeper neural networks are more difficult to train. We present a residual learning framework to ease the training of networks that are substantially deeper than those previously used. We explicitly reformulate the layers as learning residual functions with reference to the layer inputs, instead of learning unreferenced functions.',
    tags: ['Computer Vision', 'ResNet', 'Deep Learning', 'Neural Networks', 'Residual Connections'],
    collections: ['cs-ml', 'cs-ml-deep'],
    dateAdded: '2026-01-12T08:15:24Z',
    dateModified: '2026-05-18T11:04:19Z',
    notes: [
      {
        id: 'note-2',
        note: 'Winner of ILSVRC 2015. Demonstrates training networks up to 152 layers using skip connections to bypass vanishing gradients.',
        dateAdded: '2026-01-12T08:20:00Z',
        dateModified: '2026-01-12T08:20:00Z'
      }
    ],
    attachments: [
      {
        id: 'attach-2',
        title: 'He et al. - 2016 - Deep Residual Learning for Image Recognition.pdf',
        mimeType: 'application/pdf',
        path: '/storage/He_2016_Deep_Residual_Learning.pdf'
      }
    ]
  },
  {
    id: 'shannon-1948',
    itemType: 'journalArticle',
    title: 'A Mathematical Theory of Communication',
    creators: [
      { firstName: 'Claude E.', lastName: 'Shannon', creatorType: 'author' }
    ],
    publicationTitle: 'The Bell System Technical Journal',
    volume: '27',
    issue: '3',
    pages: '379–423',
    date: '1948',
    publisher: 'AT&T',
    doi: '10.1002/j.1538-7305.1948.tb01338.x',
    url: 'https://ieeexplore.ieee.org/document/6773024',
    language: 'en',
    citekey: 'shannon_mathematical_1948',
    abstractNote: 'The recent development of various methods of modulation such as PCM and PPM which exchange bandwidth for signal-to-noise ratio has intensified the interest in a general theory of communication. A basis for such a theory is contained in the important papers of Nyquist and Hartley on this subject. In the present paper we will extend the theory to include a number of new factors...',
    tags: ['Information Theory', 'Entropy', 'Communication', 'Foundational'],
    collections: ['cs-ml'],
    dateAdded: '2026-02-01T12:00:00Z',
    dateModified: '2026-02-01T12:00:00Z',
    notes: [],
    attachments: []
  },
  {
    id: 'doudna-2012',
    itemType: 'journalArticle',
    title: 'A Programmable Dual-RNA-Guided DNA Endonuclease in Adaptive Bacterial Immunity',
    creators: [
      { firstName: 'Martin', lastName: 'Jinek', creatorType: 'author' },
      { firstName: 'Krzysztof', lastName: 'Chylinski', creatorType: 'author' },
      { firstName: 'Ines', lastName: 'Fonfara', creatorType: 'author' },
      { firstName: 'Michael', lastName: 'Hauer', creatorType: 'author' },
      { firstName: 'Jennifer A.', lastName: 'Doudna', creatorType: 'author' },
      { firstName: 'Emmanuelle', lastName: 'Charpentier', creatorType: 'author' }
    ],
    publicationTitle: 'Science',
    volume: '337',
    issue: '6096',
    pages: '816–821',
    date: '2012',
    publisher: 'American Association for the Advancement of Science',
    doi: '10.1126/science.1225829',
    url: 'https://www.science.org/doi/10.1126/science.1225829',
    language: 'en',
    citekey: 'jinek_programmable_2012',
    abstractNote: 'Clustered regularly interspaced short palindromic repeats (CRISPR)/CRISPR-associated (Cas) systems provide bacteria and archaea with adaptive immunity against viral invasion. Here, we demonstrate that the Cas9 endonuclease can be programmed with single guide RNAs to target and cleave specific double-stranded DNA sequences, establishing a highly versatile tool for genomic engineering.',
    tags: ['CRISPR', 'Genetics', 'Gene Editing', 'Cas9', 'Nobel Prize'],
    collections: ['bio-med', 'bio-med-crispr'],
    dateAdded: '2026-03-05T09:44:00Z',
    dateModified: '2026-06-01T15:20:10Z',
    notes: [
      {
        id: 'note-3',
        note: 'The landmark paper that showed CRISPR-Cas9 could be used for automated, programmable genome editing. Charpentier and Doudna shared the 2020 Nobel Prize in Chemistry for this work.',
        dateAdded: '2026-03-05T09:50:00Z',
        dateModified: '2026-03-05T09:50:00Z'
      }
    ],
    attachments: [
      {
        id: 'attach-3',
        title: 'Jinek et al. - 2012 - A Programmable Dual-RNA-Guided DNA Endonuclease.pdf',
        mimeType: 'application/pdf',
        path: '/storage/Jinek_2012_CRISPR.pdf'
      }
    ]
  },
  {
    id: 'lander-2001',
    itemType: 'journalArticle',
    title: 'Initial sequencing and analysis of the human genome',
    creators: [
      { firstName: 'Eric S.', lastName: 'Lander', creatorType: 'author' },
      { firstName: 'Linton M.', lastName: 'Linton', creatorType: 'author' },
      { firstName: 'Bruce', lastName: 'Birren', creatorType: 'author' },
      { firstName: 'Chad', lastName: 'Nusbaum', creatorType: 'author' }
    ],
    publicationTitle: 'Nature',
    volume: '409',
    issue: '6822',
    pages: '860–921',
    date: '2001',
    publisher: 'Nature Publishing Group',
    doi: '10.1038/35057062',
    url: 'https://www.nature.com/articles/35057062',
    language: 'en',
    citekey: 'lander_initial_2001',
    abstractNote: 'The human genome holds an extraordinary trove of information about the heritage, biology, and medicine of mankind. Here we report the results of the Human Genome Project: a draft sequence of the euchromatic genome, analyzing its structure, composition, evolutionary roots, and clinical implications.',
    tags: ['Human Genome Project', 'Genomics', 'DNA Sequencing', 'Medicine'],
    collections: ['bio-med'],
    dateAdded: '2026-03-10T14:14:00Z',
    dateModified: '2026-03-10T14:14:00Z',
    notes: [],
    attachments: []
  },
  {
    id: 'moretti-2005',
    itemType: 'book',
    title: 'Graphs, Maps, Trees: Abstract Models for a Literary History',
    creators: [
      { firstName: 'Franco', lastName: 'Moretti', creatorType: 'author' }
    ],
    date: '2005',
    publisher: 'Verso',
    place: 'London; New York',
    isbn: '9781844670260',
    url: 'https://www.versobooks.com/products/1231-graphs-maps-trees',
    language: 'en',
    citekey: 'moretti_graphs_2005',
    abstractNote: 'In this provocative book, Moretti argues that literary history has to be completely rewritten using quantitative data and digital tools. He advocates for "distant reading"—the quantitative analysis of thousands of texts rather than the close study of a select canon.',
    tags: ['Distant Reading', 'Literary Criticism', 'Digital Humanities', 'Data Models'],
    collections: ['humanities'],
    dateAdded: '2026-04-01T11:22:10Z',
    dateModified: '2026-06-12T16:01:22Z',
    notes: [
      {
        id: 'note-4',
        note: 'Pioneered the concept of distant reading. Very influential across comparative literature and computational linguistics studies.',
        dateAdded: '2026-04-01T11:30:00Z',
        dateModified: '2026-04-01T11:30:00Z'
      }
    ],
    attachments: []
  },
  {
    id: 'busa-1980',
    itemType: 'journalArticle',
    title: 'The Annals of Humanities Computing: The Index Thomisticus',
    creators: [
      { firstName: 'Roberto', lastName: 'Busa', creatorType: 'author' }
    ],
    publicationTitle: 'Computers and the Humanities',
    volume: '14',
    issue: '2',
    pages: '83-90',
    date: '1980',
    publisher: 'Springer',
    doi: '10.1007/BF02403798',
    url: 'https://link.springer.com/article/10.1007/BF02403798',
    language: 'en',
    citekey: 'busa_annals_1980',
    abstractNote: 'The massive text indexing of Thomas Aquinas writings started in 1946 is completed. 11 million words are fully Lemmatized, presenting a retrospective on computational tools from punched cards to tape reels.',
    tags: ['Historicity', 'Index Thomisticus', 'Digital Humanities', 'Lemmatization'],
    collections: ['humanities'],
    dateAdded: '2026-04-02T13:00:00Z',
    dateModified: '2026-04-02T13:00:00Z',
    notes: [],
    attachments: []
  },
  {
    id: 'duplicate-item-test',
    itemType: 'journalArticle',
    title: 'Attention Is All You Need',
    creators: [
      { firstName: 'Ashish', lastName: 'Vaswani', creatorType: 'author' },
      { firstName: 'Noam', lastName: 'Shazeer', creatorType: 'author' }
    ],
    publicationTitle: 'NIPS (Alternative Entry Duplicate)',
    volume: '30',
    issue: '1',
    pages: '5998-6008',
    date: '2017',
    doi: '10.5555/3295222.3295349',
    citekey: 'vaswani_attention_2017_dup',
    abstractNote: 'This is a duplicate test item with incomplete author metadata for debugging citation merges.',
    tags: ['Transformers', 'Duplicate'],
    collections: ['cs-ml'],
    dateAdded: '2026-05-10T11:00:00Z',
    dateModified: '2026-05-10T11:00:00Z',
    notes: [],
    attachments: []
  },
  {
    id: 'trash-item-example',
    itemType: 'report',
    title: 'Draft Protocol: Outdated Sequencing Protocols 2011',
    creators: [
      { firstName: 'John', lastName: 'Smith', creatorType: 'author' }
    ],
    date: '2011',
    publisher: 'Private Report Archive',
    abstractNote: 'This report is deprecated and moved to the trash bin to show operational status of deleted records.',
    tags: ['Obsolete', 'Draft'],
    collections: ['bio-med'],
    dateAdded: '2026-01-01T09:00:00Z',
    dateModified: '2026-06-10T10:00:00Z',
    inTrash: true,
    notes: [],
    attachments: []
  }
];

export const ALL_FIELDS: Array<{ key: keyof ZoteroItem | 'creators_compact'; label: string }> = [
  { key: 'title', label: 'Title' },
  { key: 'creators_compact', label: 'Authors / Creators' },
  { key: 'itemType', label: 'Item Type' },
  { key: 'date', label: 'Date / Year' },
  { key: 'publicationTitle', label: 'Publication (Journal/Book)' },
  { key: 'doi', label: 'DOI' },
  { key: 'url', label: 'URL' },
  { key: 'volume', label: 'Volume' },
  { key: 'issue', label: 'Issue' },
  { key: 'pages', label: 'Pages' },
  { key: 'publisher', label: 'Publisher' },
  { key: 'place', label: 'Place' },
  { key: 'isbn', label: 'ISBN' },
  { key: 'issn', label: 'ISSN' },
  { key: 'language', label: 'Language' },
  { key: 'citekey', label: 'Citekey' },
  { key: 'dateAdded', label: 'Date Added' },
  { key: 'dateModified', label: 'Date Modified' },
  { key: 'extra', label: 'Extra Info' },
  { key: 'rights', label: 'Rights' },
  { key: 'archive', label: 'Archive' },
  { key: 'archiveLocation', label: 'Archive Location' },
  { key: 'callNumber', label: 'Call Number' }
];

export const DEFAULT_COLUMNS = [
  { key: 'title', label: 'Title', visible: true, width: 280 },
  { key: 'creators_compact', label: 'Creators', visible: true, width: 180 },
  { key: 'itemType', label: 'Type', visible: true, width: 100 },
  { key: 'publicationTitle', label: 'Publication', visible: true, width: 160 },
  { key: 'date', label: 'Date', visible: true, width: 80 },
  { key: 'doi', label: 'DOI', visible: false, width: 120 },
  { key: 'url', label: 'URL', visible: false, width: 150 },
  { key: 'citekey', label: 'Citekey', visible: true, width: 110 },
  { key: 'dateAdded', label: 'Date Added', visible: false, width: 130 },
  { key: 'dateModified', label: 'Date Modified', visible: false, width: 130 }
] as any[];
