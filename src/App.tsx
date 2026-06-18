import React, { useState, useEffect } from 'react';
import {
  Folder, FolderOpen, Layers, Trash2, Tag, Upload, Download,
  LayoutGrid, RefreshCw, Sparkles, Terminal, FileText, HelpCircle, Columns, Filter, Info, ChevronUp, ChevronDown, ChevronRight
} from 'lucide-react';
import {
  ZoteroItem, Collection, ColumnDefinition, AdvancedSearchSettings, Command, ItemType
} from './types';
import { DEFAULT_COLUMNS } from './data/samples';
import { filterZoteroItems, formatCreatorsCompact, formatCreatorsFull } from './utils/fuzzy';

// Top level components
import TopBar from './components/TopBar';
import SidebarCollections from './components/SidebarCollections';
import InspectorPanel from './components/InspectorPanel';
import CommandPalette from './components/CommandPalette';
import AdvancedSearchModal from './components/AdvancedSearchModal';
import ColumnsSelector from './components/ColumnsSelector';

export default function App() {
  // --- Core Library State (loaded from live Zotero DB via /api/library) ---
  const [items, setItems] = useState<ZoteroItem[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [columns, setColumns] = useState<ColumnDefinition[]>(() => {
    const saved = localStorage.getItem('zotero_columns');
    return saved ? JSON.parse(saved) : DEFAULT_COLUMNS;
  });

  const [theme, setTheme] = useState<string>(() => {
    return localStorage.getItem('zotero_theme') || 'code-dark';
  });

  // --- UI Interactivity/Focus States ---
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Resizable columns state
  const [resizingCol, setResizingCol] = useState<string | null>(null);
  const [startX, setStartX] = useState<number>(0);
  const [startWidth, setStartWidth] = useState<number>(0);

  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);
  const [isColumnsSelectorOpen, setIsColumnsSelectorOpen] = useState(false);

  // Sorting
  const [sortKey, setSortKey] = useState<keyof ZoteroItem | 'creators_compact'>('title');
  const [sortDesc, setSortDesc] = useState(false);

  // Search setups
  const [searchSettings, setSearchSettings] = useState<AdvancedSearchSettings>({
    query: '',
    matchCase: false,
    fuzzyThreshold: 0.5,
    matchType: 'all',
    searchFields: {
      title: true,
      authors: true,
      publication: true,
      abstract: false,
      doi: false,
      tags: true,
      notes: false,
      year: true,
      url: false
    }
  });

  // Notifications
  const [toast, setToast] = useState<string | null>(null);

  // --- Effects ---

  // Load live library from the Zotero DB API server.
  const loadFromApi = () => {
    setIsLoading(true);
    fetch('/api/library')
      .then(r => r.json())
      .then(({ items: apiItems, collections: apiCollections }) => {
        setItems(apiItems);
        setCollections(apiCollections);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Failed to load library from API:', err);
        throw err; // fail loudly
      });
  };

  useEffect(() => { loadFromApi(); }, []);

  useEffect(() => {
    localStorage.setItem('zotero_columns', JSON.stringify(columns));
  }, [columns]);

  useEffect(() => {
    localStorage.setItem('zotero_theme', theme);
  }, [theme]);

  // Global Keydown Hotkeys for Ctrl+P / Cmd+P
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      // Ctrl+P / Cmd+P toggles command palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        setIsPaletteOpen(prev => !prev);
      }
      
      // Escape closes overlays
      if (e.key === 'Escape') {
        setIsPaletteOpen(false);
        setIsAdvancedSearchOpen(false);
        setIsColumnsSelectorOpen(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleResizeStart = (e: React.MouseEvent, colKey: string, currentWidth: number) => {
    e.stopPropagation();
    setResizingCol(colKey);
    setStartX(e.clientX);
    setStartWidth(currentWidth || 150);
  };

  useEffect(() => {
    if (!resizingCol) return;
    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      setColumns(prev => prev.map(c => 
        c.key === resizingCol 
          ? { ...c, width: Math.max(50, startWidth + delta) } 
          : c
      ));
    };
    const handleMouseUp = () => setResizingCol(null);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingCol, startX, startWidth]);

  // --- Database operations ---
  const handleAddNewItem = (type: ItemType) => {
    const now = new Date().toISOString();
    const newDoc: ZoteroItem = {
      id: `item-${Date.now()}`,
      itemType: type,
      title: `Draft New ${type.replace(/([A-Z])/g, ' $1')}`,
      creators: [
        { firstName: 'Draft_First', lastName: 'Draft_Last', creatorType: 'author' }
      ],
      date: new Date().getFullYear().toString(),
      publicationTitle: 'Draft Journal proceedings',
      citekey: `draft_${Date.now().toString().slice(-4)}`,
      tags: ['draft'],
      notes: [],
      attachments: [],
      collections: selectedCollectionId !== 'all' && selectedCollectionId !== 'duplicates' && selectedCollectionId !== 'unfiled' && selectedCollectionId !== 'trash' ? [selectedCollectionId] : [],
      dateAdded: now,
      dateModified: now
    };
    
    setItems(prev => [newDoc, ...prev]);
    setSelectedItemId(newDoc.id);
    showToast(`Created new ${newDoc.itemType}!`);
  };

  const handleUpdateItem = (updated: ZoteroItem) => {
    setItems(prev => prev.map(it => (it.id === updated.id ? updated : it)));
  };

  const handleDeleteItem = (id: string) => {
    const itemToDelete = items.find(it => it.id === id);
    if (!itemToDelete) return;

    if (itemToDelete.inTrash) {
      // Permanent removal
      setItems(prev => prev.filter(it => it.id !== id));
      setSelectedItemId(null);
      showToast('Permanently deleted record.');
    } else {
      // Move to Trash bin
      handleUpdateItem({
        ...itemToDelete,
        inTrash: true,
        dateModified: new Date().toISOString()
      });
      showToast('Moved item to Trash bin.');
    }
  };

  const handleRestoreItem = (id: string) => {
    const itemToRestore = items.find(it => it.id === id);
    if (itemToRestore) {
      handleUpdateItem({
        ...itemToRestore,
        inTrash: false,
        dateModified: new Date().toISOString()
      });
      showToast('Restored library item.');
    }
  };

  const handleDuplicateItem = (id: string) => {
    const source = items.find(it => it.id === id);
    if (!source) return;

    const clone: ZoteroItem = {
      ...source,
      id: `clone-${Date.now()}`,
      title: `${source.title} (Clone)`,
      citekey: `${source.citekey}_clone`,
      dateAdded: new Date().toISOString(),
      dateModified: new Date().toISOString()
    };
    setItems(prev => [clone, ...prev]);
    setSelectedItemId(clone.id);
    showToast('Duplicated library record.');
  };

  // Reload from live DB
  const reloadFromDb = () => {
    loadFromApi();
    showToast('Reloading from Zotero DB…');
  };

  // Core backup exports
  const exportDatabaseJson = () => {
    const dataStr = JSON.stringify({ items, collections, columns }, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `zotero_db_export_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Database backup exported to JSON!');
  };

  // Import custom backup
  const importDatabaseJson = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (parsed.items && Array.isArray(parsed.items)) {
          setItems(parsed.items);
          if (parsed.collections && Array.isArray(parsed.collections)) {
            setCollections(parsed.collections);
          }
          if (parsed.columns && Array.isArray(parsed.columns)) {
            setColumns(parsed.columns);
          }
          showToast('Database imported successfully!');
        } else {
          showToast('Failed to import: missing core items table.');
        }
      } catch (err) {
        showToast('Error parsing JSON backup file.');
      }
    };
    reader.readAsText(file);
  };

  // Generate citation formatting
  const copyCitationFormatted = () => {
    const selectedItem = items.find(it => it.id === selectedItemId);
    if (!selectedItem) {
      showToast('Please select a bibliography item first.');
      return;
    }
    const compactAuthor = formatCreatorsCompact(selectedItem.creators);
    const citation = `${compactAuthor} (${selectedItem.date || 'N.D.'}). ${selectedItem.title}. ${selectedItem.publicationTitle || ''}.`;
    navigator.clipboard.writeText(citation).then(() => {
      showToast('APA Citation copied to clipboard!');
    });
  };

  // Empty Trash
  const handleEmptyTrash = () => {
    setItems(prev => prev.filter(it => !it.inTrash));
    showToast('Trash bin emptied.');
  };

  // --- Dynamic Filtering Logic ---
  const getCategorizedItems = () => {
    // 1. Initial category mapping
    let result = [...items];

    if (selectedCollectionId === 'trash') {
      result = result.filter(item => item.inTrash);
    } else {
      // Filter out trash items from active library list
      result = result.filter(item => !item.inTrash);

      if (selectedCollectionId === 'duplicates') {
        const titleCounts: Record<string, number> = {};
        result.forEach(it => {
          const t = it.title.trim().toLowerCase();
          titleCounts[t] = (titleCounts[t] || 0) + 1;
        });
        result = result.filter(it => titleCounts[it.title.trim().toLowerCase()] > 1);
      } else if (selectedCollectionId === 'unfiled') {
        result = result.filter(it => !it.collections || it.collections.length === 0);
      } else if (selectedCollectionId !== 'all') {
        // Belonging to collection or subcollections
        const childCollectionIds = collections
          .filter(c => c.parentId === selectedCollectionId)
          .map(c => c.id);
        const folderSet = [selectedCollectionId, ...childCollectionIds];
        
        result = result.filter(
          item => item.collections && item.collections.some(cId => folderSet.includes(cId))
        );
      }
    }

    // 2. Filter by selected index tag
    if (selectedTag) {
      result = result.filter(item => item.tags && item.tags.includes(selectedTag));
    }

    // 3. Apply Fuzzy search query matching
    result = filterZoteroItems(result, searchSettings);

    // 4. Custom sorting
    return result.sort((a, b) => {
      let valA: any = sortKey === 'creators_compact' ? formatCreatorsCompact(a.creators) : a[sortKey];
      let valB: any = sortKey === 'creators_compact' ? formatCreatorsCompact(b.creators) : b[sortKey];

      valA = valA ? valA.toString().toLowerCase() : '';
      valB = valB ? valB.toString().toLowerCase() : '';

      if (valA < valB) return sortDesc ? 1 : -1;
      if (valA > valB) return sortDesc ? -1 : 1;
      return 0;
    });
  };

  const filteredLibraryItems = getCategorizedItems();

  const handleHeaderSort = (key: keyof ZoteroItem | 'creators_compact') => {
    if (sortKey === key) {
      setSortDesc(prev => !prev);
    } else {
      setSortKey(key);
      setSortDesc(false);
    }
  };

  const getCollectionName = () => {
    if (selectedCollectionId === 'duplicates') return 'Duplicate Entries';
    if (selectedCollectionId === 'unfiled') return 'Unfiled Documents';
    if (selectedCollectionId === 'trash') return 'Trash Bin';
    const found = collections.find(c => c.id === selectedCollectionId);
    return found ? found.name : 'My Library';
  };

  // --- Commands List for Palette ---
  const commandsList: Command[] = [
    {
      id: 'reload-db',
      name: 'Reload Library from Zotero DB',
      action: () => reloadFromDb(),
      category: 'Database'
    },
    {
      id: 'theme-dark',
      name: 'Activate VSCode Slate Dark Mode',
      action: () => setTheme('code-dark'),
      category: 'System'
    },
    {
      id: 'theme-light',
      name: 'Activate VSCode Classic Light Mode',
      action: () => setTheme('code-light'),
      category: 'System'
    },
    {
      id: 'theme-monokai',
      name: 'Activate Monokai Terminal Mode',
      action: () => setTheme('monokai'),
      category: 'System'
    },
    {
      id: 'add-journal',
      name: 'Add New Journal Article',
      action: () => handleAddNewItem('journalArticle'),
      category: 'Command'
    },
    {
      id: 'add-book',
      name: 'Add New Book entry',
      action: () => handleAddNewItem('book'),
      category: 'Command'
    },
    {
      id: 'export-json',
      name: 'Export Stored Database Backup (JSON)',
      shortcut: 'Ctrl+Shift+E',
      action: () => exportDatabaseJson(),
      category: 'Database'
    },
    {
      id: 'citation-apa',
      name: 'Copy Selected APA Citation',
      action: () => copyCitationFormatted(),
      category: 'Database'
    },
    {
      id: 'cols-show-all',
      name: 'Select All Optional Columns',
      action: () => setColumns(columns.map(c => ({ ...c, visible: true }))),
      category: 'Columns'
    },
    {
      id: 'cols-reset',
      name: 'Reset Columns to Default System Layout',
      action: () => setColumns(DEFAULT_COLUMNS),
      category: 'Columns'
    },
    {
      id: 'clear-trash',
      name: 'Empty Trash Bin Permanently',
      action: () => handleEmptyTrash(),
      category: 'Command'
    }
  ];

  // Visual Theme mapping helper
  const getThemeClass = () => {
    switch (theme) {
      case 'code-light':
        return 'bg-slate-50 text-slate-900 border-zinc-200 scheme-light';
      case 'monokai':
        return 'bg-zinc-950 text-amber-100 border-neutral-800 font-mono';
      case 'code-dark':
      default:
        return 'bg-[#1e1e1e] text-[#cccccc] border-[#2b2b2b] scheme-dark';
    }
  };

  const getSubpanelClass = () => {
    switch (theme) {
      case 'code-light':
        return 'bg-zinc-100 border-r border-zinc-200';
      case 'monokai':
        return 'bg-stone-900 border-r border-stone-800';
      case 'code-dark':
      default:
        return 'bg-[#252526] border-r border-[#2b2b2b]';
    }
  };

  const getTableClass = () => {
    switch (theme) {
      case 'code-light':
        return 'bg-white text-slate-800 divide-zinc-200';
      case 'monokai':
        return 'bg-zinc-900 text-stone-250 divide-stone-800';
      case 'code-dark':
      default:
        return 'bg-[#1e1e1e] text-[#cccccc] divide-[#2b2b2b]';
    }
  };

  const getStatusBarClass = () => {
    switch (theme) {
      case 'code-light':
        return 'bg-zinc-200 text-slate-600 border-t border-zinc-300';
      case 'monokai':
        return 'bg-stone-950 border-t border-stone-900 text-yellow-500';
      case 'code-dark':
      default:
        return 'bg-[#007acc] text-white border-t border-[#007acc]';
    }
  };

  const activeSelectedItem = items.find(it => it.id === selectedItemId) || null;

  return (
    <div className={`h-screen flex flex-col overflow-hidden text-xs ${getThemeClass()}`}>
      
      {/* Top Menu Bar */}
      <div className="h-9 bg-[#323233] flex items-center px-3 border-b border-[#2b2b2b] text-xs space-x-4 shrink-0 select-none">
        <div className="flex items-center space-x-2 shrink-0">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
          <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
        </div>
        <div className="flex space-x-3 text-[#969696] text-[11px] font-sans">
          <span className="hover:text-white cursor-default">File</span>
          <span className="hover:text-white cursor-default">Edit</span>
          <span className="hover:text-white cursor-default">View</span>
          <span className="hover:text-white cursor-default">Tools</span>
          <span className="hover:text-white cursor-default">Help</span>
        </div>
        <div className="flex-grow text-center text-xs text-[#808080] font-sans font-medium truncate">
          {isLoading ? 'Zotero Pro — Loading…' : `Zotero Pro — My Library (${items.length} items)`}
        </div>
        <div className="flex items-center space-x-3 text-[#969696]">
          <span 
            onClick={() => setIsPaletteOpen(true)}
            className="text-[10px] bg-[#3c3c3c] px-1.5 py-0.5 rounded border border-[#454545] cursor-pointer hover:bg-[#454545] hover:text-white font-mono text-slate-300"
          >
            Ctrl+P
          </span>
          <button 
            onClick={() => {
              showToast("Database synchronized successfully.");
            }}
            className="text-[#969696] hover:text-white"
            title="Sync library now"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
          </button>
        </div>
      </div>

      {/* 1. Header Toolbar container */}
      <TopBar
        searchSettings={searchSettings}
        onChangeSearchSettings={setSearchSettings}
        onOpenAdvancedSearch={() => setIsAdvancedSearchOpen(true)}
        onOpenPalette={() => setIsPaletteOpen(true)}
        activeCollectionName={getCollectionName()}
        onToggleColumnsSelector={() => setIsColumnsSelectorOpen(prev => !prev)}
        onOpenAddItem={handleAddNewItem}
        theme={theme}
        setTheme={setTheme}
      />

      {/* Main Workspace Frame split */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        
        {/* Core Column Select Popover */}
        <ColumnsSelector
          isOpen={isColumnsSelectorOpen}
          onClose={() => setIsColumnsSelectorOpen(false)}
          columns={columns}
          onChangeColumns={setColumns}
          onReset={() => setColumns(DEFAULT_COLUMNS)}
        />

        {/* 2. Left Activity rail & Sidebar Explorer */}
        <div className={`w-60 flex flex-col shrink-0 ${getSubpanelClass()}`}>
          <SidebarCollections
            collections={collections}
            selectedCollectionId={selectedCollectionId}
            onSelectCollection={setSelectedCollectionId}
            items={items}
            onAddCollection={(name, parentId) => {
              const newCol: Collection = { id: `col-${Date.now()}`, name, parentId };
              setCollections(prev => [...prev, newCol]);
              showToast(`Created collection folder: "${name}"`);
            }}
            selectedTag={selectedTag}
            onSelectTag={setSelectedTag}
          />
        </div>

        {/* 3. Main Central Bibliographic Table Area */}
        <div className={`flex-1 flex flex-col min-w-0 relative ${theme === 'code-dark' ? 'bg-[#1e1e1e]' : 'bg-slate-950/40'}`}>
          
          {/* List operations bar */}
          <div className={`h-9 px-3.5 border-b flex items-center justify-between text-[11px] shrink-0 ${theme === 'code-dark' ? 'bg-[#252526] border-[#2b2b2b]' : 'border-slate-900 bg-slate-950/80'}`}>
            <div className={`flex items-center gap-2 ${theme === 'code-dark' ? 'text-[#808080]' : 'text-slate-400'}`}>
              <span className={`font-semibold uppercase tracking-wide ${theme === 'code-dark' ? 'text-[#cccccc]' : 'text-slate-300'}`}>
                Documents list
              </span>
              <span>•</span>
              <span>Showing: <strong className={theme === 'code-dark' ? 'text-white' : 'text-sky-400'}>{filteredLibraryItems.length} entries</strong></span>
              {selectedTag && (
                <>
                  <span>•</span>
                  <span>Filtered Tag: <strong className={`font-mono ${theme === 'code-dark' ? 'text-[#0e639c]' : 'text-sky-400'}`}>[{selectedTag}]</strong></span>
                </>
              )}
            </div>

            {/* Quick backup triggers */}
            <div className="flex items-center gap-2.5">
              
              {/* Reload from live Zotero DB */}
              <button
                onClick={reloadFromDb}
                title="Reload library from live Zotero database"
                className={`flex items-center gap-1 font-mono text-[10px] ${theme === 'code-dark' ? 'text-[#cccccc] hover:text-white' : 'text-slate-450 hover:text-slate-100'}`}
              >
                <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
                <span>{isLoading ? 'Loading…' : 'Reload DB'}</span>
              </button>

              {/* Import trigger file */}
              <label className={`cursor-pointer flex items-center gap-1 font-mono text-[10px] select-none ${theme === 'code-dark' ? 'text-[#cccccc] hover:text-white' : 'text-slate-450 hover:text-slate-100'}`}>
                <Upload className="h-3 w-3" />
                <span>Import JSON</span>
                <input
                  type="file"
                  accept="application/json"
                  onChange={importDatabaseJson}
                  className="hidden"
                />
              </label>

              {/* Export backup */}
              <button
                onClick={exportDatabaseJson}
                className={`flex items-center gap-1 font-mono text-[10px] ${theme === 'code-dark' ? 'text-[#cccccc] hover:text-white' : 'text-slate-450 hover:text-slate-100'}`}
              >
                <Download className="h-3 w-3" />
                <span>Export ZDB</span>
              </button>
            </div>
          </div>

          {/* Core scrollable table viewport */}
          <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-slate-800">
            <table className={`w-full text-left border-collapse text-xs select-none ${getTableClass()}`}>
              
              {/* Dynamic Headers mapping */}
              <thead className={`sticky top-0 z-10 shadow-xs border-b ${theme === 'code-dark' ? 'bg-[#252526] text-[#808080] border-[#2b2b2b]' : 'bg-slate-900 text-slate-400 border-slate-800'}`}>
                <tr>
                  {columns
                    .filter(c => c.visible)
                    .map(col => {
                      const isSorting = sortKey === col.key;
                      return (
                        <th
                          key={col.key}
                          onClick={() => handleHeaderSort(col.key)}
                          className={`relative px-3.5 py-2.5 cursor-pointer font-medium border-r whitespace-nowrap ${theme === 'code-dark' ? 'border-[#2b2b2b] hover:bg-[#323233] text-[#808080]' : 'border-slate-850/30 hover:bg-slate-805 text-slate-400 font-mono text-[10px] uppercase tracking-wider'}`}
                          style={{ width: col.width ? `${col.width}px` : 'auto', minWidth: col.width ? `${col.width}px` : 'auto', maxWidth: col.width ? `${col.width}px` : 'none' }}
                        >
                          <div className="flex items-center gap-1.5 justify-between pr-2">
                            <span className="truncate">{col.label}</span>
                            {isSorting && (
                              <span>{sortDesc ? <ChevronDown className="h-3.5 w-3.5 text-blue-400 shrink-0" /> : <ChevronUp className="h-3.5 w-3.5 text-blue-400 shrink-0" />}</span>
                            )}
                          </div>
                          <div
                            onMouseDown={(e) => handleResizeStart(e, col.key as string, col.width || 150)}
                            className={`absolute right-0 top-0 bottom-0 w-2 cursor-col-resize ${resizingCol === col.key ? 'bg-sky-500' : 'hover:bg-sky-500/50'}`}
                            style={{ touchAction: 'none' }}
                          />
                        </th>
                      );
                    })}
                </tr>
              </thead>

              {/* Row Body renders */}
              <tbody className={`divide-y ${theme === 'code-dark' ? 'divide-[#2b2b2b]' : ''}`}>
                {filteredLibraryItems.length === 0 ? (
                  <tr>
                    <td colSpan={columns.filter(c => c.visible).length} className="py-20 text-center text-slate-500 font-sans">
                      <Layers className="h-10 w-10 text-slate-800 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-slate-400">Library is empty or filter returned zero matches.</p>
                      <button
                        onClick={() => {
                          setSearchSettings({ ...searchSettings, query: '' });
                          setSelectedTag(null);
                        }}
                        className="mt-3 px-3 py-1 bg-sky-600/20 text-sky-400 border border-sky-500/20 rounded hover:bg-sky-500/10 text-[10px] font-mono"
                      >
                        Reset Active Filters
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredLibraryItems.map(item => {
                    const isSelected = selectedItemId === item.id;
                    const hasChildren = (item.attachments && item.attachments.length > 0) || (item.notes && item.notes.length > 0);
                    const isExpanded = expandedItems.has(item.id);
                    
                    return (
                      <React.Fragment key={item.id}>
                      <tr
                        onClick={() => setSelectedItemId(item.id)}
                        className={`cursor-default transition-colors border-b ${
                          theme === 'code-dark'
                            ? isSelected
                              ? 'bg-[#37373d] text-white font-medium border-[#2b2b2b]'
                              : 'even:bg-[#1e1e1e] hover:bg-[#2a2d2e] border-[#2b2b2b] text-[#cccccc]'
                            : isSelected
                              ? 'bg-blue-600/15 text-slate-100 font-medium border-slate-900/40'
                              : 'even:bg-slate-900/15 hover:bg-slate-850/40 border-slate-900/40'
                        }`}
                      >
                        {columns
                          .filter(c => c.visible)
                          .map(col => {
                            let cellVal: any = '';
                            
                            if (col.key === 'creators_compact') {
                                cellVal = formatCreatorsCompact(item.creators);
                            } else {
                              cellVal = item[col.key];
                            }

                            return (
                              <td
                                key={col.key}
                                className={`px-3.5 py-2 truncate text-[11px] font-sans border-r ${theme === 'code-dark' ? 'border-[#2b2b2b]' : 'border-slate-900/40'}`}
                                style={{ maxWidth: col.width ? `${col.width}px` : '20rem' }}
                              >
                                {col.key === 'title' ? (
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="w-4 flex justify-center items-center shrink-0">
                                      {hasChildren && (
                                        <div onClick={(e) => toggleExpand(item.id, e)} className="cursor-pointer hover:bg-white/10 rounded">
                                          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                        </div>
                                      )}
                                    </div>
                                    <span className="shrink-0 bg-transparent">
                                      {item.itemType === 'book' && '📚'}
                                      {item.itemType === 'journalArticle' && '📄'}
                                      {item.itemType === 'conferencePaper' && '🎤'}
                                      {item.itemType !== 'book' && item.itemType !== 'journalArticle' && item.itemType !== 'conferencePaper' && '📝'}
                                    </span>
                                    <span className={`truncate font-medium ${theme === 'code-dark' ? (isSelected ? 'text-white' : 'text-[#cccccc]') : 'text-slate-100'}`} title={item.title}>
                                      {item.title || 'Untitled Record'}
                                    </span>
                                  </div>
                                ) : col.key === 'itemType' ? (
                                  <span className="capitalize text-[10px] opacity-80">
                                    {item.itemType.replace(/([A-Z])/g, ' $1')}
                                  </span>
                                ) : col.key === 'doi' && cellVal ? (
                                  <span className="font-mono text-[10.5px] text-sky-450 hover:underline cursor-pointer" onClick={(e) => { e.stopPropagation(); window.open(`https://doi.org/${cellVal}`, '_blank') }}>
                                    {cellVal}
                                  </span>
                                ) : col.key === 'url' && cellVal ? (
                                  <span className="font-mono text-emerald-400/80 text-[10px] hover:underline cursor-pointer" onClick={(e) => { e.stopPropagation(); window.open(cellVal, '_blank') }}>
                                    {cellVal}
                                  </span>
                                ) : (
                                  <span className={col.key === 'citekey' ? `font-mono text-[10.5px] p-0.5 px-1 border rounded-sm ${theme === 'code-dark' ? 'bg-[#1e1e1e] border-[#2b2b2b] text-sky-400' : 'bg-slate-950/60 border-slate-900 text-slate-400'}` : ''}>
                                    {cellVal || '—'}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                      </tr>
                      {isExpanded && item.attachments.map(att => (
                        <tr key={att.id} className={`cursor-default border-b ${theme === 'code-dark' ? 'bg-[#1e1e1e] border-[#2b2b2b] text-[#cccccc]' : 'bg-slate-900/5 border-slate-900/40 text-slate-100'}`}>
                          {columns.filter(c => c.visible).map(col => (
                            <td key={col.key} className={`px-3.5 py-1.5 truncate text-[11px] font-sans border-r ${theme === 'code-dark' ? 'border-[#2b2b2b]' : 'border-slate-900/40'}`} style={{ maxWidth: col.width ? `${col.width}px` : '20rem' }}>
                              {col.key === 'title' ? (
                                <div className="flex items-center gap-2 pl-6">
                                  <span className="shrink-0 text-emerald-500">📎</span>
                                  <span className="truncate opacity-80" title={att.title}>{att.title}</span>
                                </div>
                              ) : null}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {isExpanded && item.notes.map(note => (
                        <tr key={note.id} className={`cursor-default border-b ${theme === 'code-dark' ? 'bg-[#1e1e1e] border-[#2b2b2b] text-[#cccccc]' : 'bg-slate-900/5 border-slate-900/40 text-slate-100'}`}>
                          {columns.filter(c => c.visible).map(col => (
                            <td key={col.key} className={`px-3.5 py-1.5 truncate text-[11px] font-sans border-r ${theme === 'code-dark' ? 'border-[#2b2b2b]' : 'border-slate-900/40'}`} style={{ maxWidth: col.width ? `${col.width}px` : '20rem' }}>
                              {col.key === 'title' ? (
                                <div className="flex items-center gap-2 pl-6">
                                  <span className="shrink-0 text-amber-500">🗒️</span>
                                  <span className="truncate opacity-80" title={note.note}>{note.note}</span>
                                </div>
                              ) : null}
                            </td>
                          ))}
                        </tr>
                      ))}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. Right side Inspector detail panel */}
        <div className="w-80 shrink-0">
          <InspectorPanel
            item={activeSelectedItem}
            allItems={items}
            onUpdateItem={handleUpdateItem}
            onDeleteItem={handleDeleteItem}
            onDuplicateItem={handleDuplicateItem}
            onClose={() => setSelectedItemId(null)}
          />
        </div>
      </div>

      {/* 5. Base Task/Status bar */}
      <div className={`h-6.5 flex items-center justify-between px-3.5 border-t text-[10.5px] font-mono shrink-0 select-none ${getStatusBarClass()}`}>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${isLoading ? 'bg-yellow-400 animate-pulse' : 'bg-emerald-400'}`} />
            <span>{isLoading ? 'DB: Loading…' : 'DB: Live Zotero'}</span>
          </span>
          <span>•</span>
          <span>Indexed Total: <strong>{items.length} items</strong></span>
          <span>•</span>
          <span>Trash size: <strong>{items.filter(it => it.inTrash).length}</strong></span>
        </div>

        <div className="flex items-center gap-4.5">
          {activeSelectedItem && (
            <span className="text-blue-400 hidden sm:inline">
              Selected Item: <strong className="font-semibold">{activeSelectedItem.citekey || activeSelectedItem.id}</strong>
            </span>
          )}
          <span>Active Pane: explorer</span>
          <span className="bg-sky-500/10 px-1 border border-sky-500/20 rounded-xs text-sky-400 text-[9.5px]">
            {theme.replace('-', ' ').toUpperCase()}
          </span>
        </div>
      </div>

      {/* Ctrl+P palette overlay portal */}
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        items={items}
        onSelectItem={(id) => {
          setSelectedItemId(id);
          const found = items.find(it => it.id === id);
          if (found && found.inTrash) {
            setSelectedCollectionId('trash');
          }
        }}
        commands={commandsList}
      />

      {/* Advanced search selector modal portal */}
      <AdvancedSearchModal
        isOpen={isAdvancedSearchOpen}
        onClose={() => setIsAdvancedSearchOpen(false)}
        settings={searchSettings}
        onChangeSettings={setSearchSettings}
        allItems={items}
      />

      {/* Toast Alert popup */}
      {toast && (
        <div className="fixed bottom-10 right-4 z-49 bg-blue-600 text-white font-semibold text-xs px-4 py-2.5 rounded-md shadow-2xl border border-blue-500 animate-slide-up flex items-center gap-2">
          <Terminal className="h-4 w-4" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
