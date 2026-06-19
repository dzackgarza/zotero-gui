import React, { useState, useEffect } from 'react';
import { RefreshCw, Terminal } from 'lucide-react';
import { ColumnDefinition, AdvancedSearchSettings } from './types';
import { DEFAULT_COLUMNS } from './data/samples';
import { selectVisibleLibraryItems, type SortKey } from './librarySelectors';
import { formatCreatorsCompact } from './utils/fuzzy';
import { useLibraryApi } from './useLibraryApi';
import { createAppCommands } from './appCommands';

// Top level components
import TopBar from './components/TopBar';
import SidebarCollections from './components/SidebarCollections';
import InspectorPanel from './components/InspectorPanel';
import CommandPalette from './components/CommandPalette';
import AdvancedSearchModal from './components/AdvancedSearchModal';
import AddByIdentifierModal from './components/AddByIdentifierModal';
import LibraryTable from './components/LibraryTable';

export default function App() {
  // --- Core Library State (loaded from live Zotero DB via /api/library) ---
  const {
    items,
    collections,
    isLoading,
    libraryLoadError,
    status: libraryStatus,
    reloadLibrary,
  } = useLibraryApi();

  const [columns, setColumns] = useState<ColumnDefinition[]>(() => {
    const savedStr = localStorage.getItem('zotero_columns');
    if (!savedStr) return DEFAULT_COLUMNS;
    try {
      const saved = JSON.parse(savedStr) as ColumnDefinition[];
      const merged = [...saved];
      DEFAULT_COLUMNS.forEach(defCol => {
        if (!merged.some(c => c.key === defCol.key)) {
          merged.push(defCol);
        }
      });
      return merged;
    } catch (e) {
      return DEFAULT_COLUMNS;
    }
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

  // Column reordering states & handlers
  const [draggedColKey, setDraggedColKey] = useState<string | null>(null);

  const handleColumnDragStart = (e: React.DragEvent, colKey: string) => {
    setDraggedColKey(colKey);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', colKey);
  };

  const handleColumnDragOver = (e: React.DragEvent, colKey: string) => {
    e.preventDefault();
  };

  const handleColumnDrop = (e: React.DragEvent, targetColKey: string) => {
    e.preventDefault();
    if (!draggedColKey || draggedColKey === targetColKey) return;

    setColumns(prev => {
      const draggedIdx = prev.findIndex(c => c.key === draggedColKey);
      const targetIdx = prev.findIndex(c => c.key === targetColKey);
      if (draggedIdx === -1 || targetIdx === -1) return prev;

      const updated = [...prev];
      const [removed] = updated.splice(draggedIdx, 1);
      updated.splice(targetIdx, 0, removed);
      return updated;
    });
    setDraggedColKey(null);
  };

  const moveColumn = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= columns.length) return;
    setColumns(prev => {
      const updated = [...prev];
      const temp = updated[index];
      updated[index] = updated[newIndex];
      updated[newIndex] = temp;
      return updated;
    });
  };

  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);
  const [isAddByIdentifierOpen, setIsAddByIdentifierOpen] = useState(false);

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortDesc, setSortDesc] = useState(false);

  // Search setups
  const [searchSettings, setSearchSettings] = useState<AdvancedSearchSettings>(() => {
    const fields: Record<string, boolean> = {};
    DEFAULT_COLUMNS.forEach(col => {
      fields[col.key] = ['title', 'creators_compact', 'publicationTitle', 'date', 'citekey'].includes(col.key);
    });
    return {
      query: '',
      matchCase: false,
      fuzzyThreshold: 0.5,
      matchType: 'all',
      searchFields: fields
    };
  });

  // Notifications
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('zotero_columns', JSON.stringify(columns));
  }, [columns]);

  useEffect(() => {
    localStorage.setItem('zotero_theme', theme);
  }, [theme]);

  const [paletteInitialInput, setPaletteInitialInput] = useState('');

  // Global Keydown Hotkeys for Ctrl+P / Cmd+P / Ctrl+Shift+P
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      // Ctrl+Shift+P / Cmd+Shift+P opens command palette in command mode
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setPaletteInitialInput('>');
        setIsPaletteOpen(true);
      }
      // Ctrl+P / Cmd+P toggles command palette
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setPaletteInitialInput('');
        setIsPaletteOpen(prev => !prev);
      }
      
      // Escape closes overlays
      if (e.key === 'Escape') {
        setIsPaletteOpen(false);
        setIsAdvancedSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, []);

  const toggleColumn = (key: string) => {
    setColumns(prev => prev.map(col => {
      if (col.key === key) {
        return { ...col, visible: !col.visible };
      }
      return col;
    }));
  };

  const setAllColumns = (visible: boolean) => {
    setColumns(prev => prev.map(col => {
      if (col.key === 'title') return { ...col, visible: true };
      return { ...col, visible };
    }));
  };

  const resetColumns = () => {
    setColumns(DEFAULT_COLUMNS);
  };

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

  const handleAddResolvedItem = () => {
    reloadLibrary();
    showToast('Successfully added item to Zotero.');
  };

  // Reload from live DB
  const reloadFromDb = () => {
    reloadLibrary();
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

  if (libraryStatus === 'failed') {
    return (
      <div className="h-screen bg-[#1e1e1e] text-[#cccccc] flex items-center justify-center p-6">
        <section className="w-full max-w-2xl border border-red-500/40 bg-[#252526] p-6 shadow-2xl">
          <h1 className="text-lg font-semibold text-red-400">Zotero Library Load Failed</h1>
          <p className="mt-3 font-mono text-xs text-red-200">
            {libraryLoadError.message}
          </p>
          <button
            onClick={reloadLibrary}
            className="mt-5 inline-flex items-center gap-2 border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reload Library
          </button>
        </section>
      </div>
    );
  }

  const filteredLibraryItems = selectVisibleLibraryItems({
    items,
    collections,
    selectedCollectionId,
    selectedTag,
    searchSettings,
    sortKey,
    sortDesc,
  });

  const handleHeaderSort = (key: SortKey) => {
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
    if (selectedCollectionId === 'no-pdf') return 'No PDF Attachment';
    if (selectedCollectionId === 'no-extraction') return 'No Extraction';
    if (selectedCollectionId === 'nonstandard-citekey') return 'Nonstandard Citation Key';
    const found = collections.find(c => c.id === selectedCollectionId);
    return found ? found.name : 'My Library';
  };

  // --- Commands List for Palette ---
  const commandsList = createAppCommands({
    reloadFromDb,
    setTheme,
    exportDatabaseJson,
    copyCitationFormatted,
    showAllColumns: () => setAllColumns(true),
    resetColumns,
  });

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
        <div className="flex min-w-32" />
        <div className="flex-grow text-center text-xs text-[#808080] font-sans font-medium truncate">
          {isLoading ? 'Zotero Pro — Loading…' : `Zotero Pro — My Library (${items.length} items)`}
        </div>
        <div className="flex items-center space-x-3 text-[#969696]">
          <button 
            onClick={() => {
              reloadFromDb();
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
        onOpenAddByIdentifier={() => setIsAddByIdentifierOpen(true)}
        theme={theme}
        setTheme={setTheme}
      />

      {/* Main Workspace Frame split */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        
        {/* 2. Left Activity rail & Sidebar Explorer */}
        <div className={`w-60 flex flex-col shrink-0 ${getSubpanelClass()}`}>
          <SidebarCollections
            collections={collections}
            selectedCollectionId={selectedCollectionId}
            onSelectCollection={setSelectedCollectionId}
            items={items}
            selectedTag={selectedTag}
            onSelectTag={setSelectedTag}
            theme={theme}
          />
        </div>

        {/* 3. Main Central Bibliographic Table Area */}
        <div className={`flex-1 flex flex-col min-w-0 relative ${theme === 'code-dark' ? 'bg-[#1e1e1e]' : 'bg-slate-950/40'}`}>
          
          {/* List operations bar */}
          <div className={`h-8 px-3.5 border-b flex items-center justify-between text-[11px] shrink-0 ${theme === 'code-dark' ? 'bg-[#252526] border-[#2b2b2b]' : 'border-slate-900 bg-slate-950/80'}`}>
            <div className={`flex items-center gap-2 ${theme === 'code-dark' ? 'text-[#808080]' : 'text-slate-400'}`}>
              <span>Showing: <strong className={theme === 'code-dark' ? 'text-white' : 'text-sky-400'}>{filteredLibraryItems.length} entries</strong></span>
              {selectedTag && (
                <>
                  <span>•</span>
                  <span>Filtered Tag: <strong className={`font-mono ${theme === 'code-dark' ? 'text-[#0e639c]' : 'text-sky-400'}`}>[{selectedTag}]</strong></span>
                </>
              )}
            </div>
          </div>

          <LibraryTable
            columns={columns}
            items={filteredLibraryItems}
            theme={theme}
            tableClass={getTableClass()}
            selectedItemId={selectedItemId}
            expandedItems={expandedItems}
            sortKey={sortKey}
            sortDesc={sortDesc}
            draggedColKey={draggedColKey}
            resizingCol={resizingCol}
            searchSettings={searchSettings}
            onSelectItem={setSelectedItemId}
            onResetFilters={(settings) => {
              setSearchSettings(settings);
              setSelectedTag(null);
            }}
            onToggleExpand={toggleExpand}
            onColumnDragStart={handleColumnDragStart}
            onColumnDragOver={handleColumnDragOver}
            onColumnDrop={handleColumnDrop}
            onHeaderSort={handleHeaderSort}
            onResizeStart={handleResizeStart}
            onToggleColumn={toggleColumn}
            onSetAllColumns={setAllColumns}
            onResetColumns={resetColumns}
            onMoveColumn={moveColumn}
          />
        </div>

        {/* 4. Right side Inspector detail panel */}
        {activeSelectedItem && (
          <div className="w-80 shrink-0">
            <InspectorPanel
              item={activeSelectedItem}
              allItems={items}
              onClose={() => setSelectedItemId(null)}
              theme={theme}
            />
          </div>
        )}
      </div>

      {/* Ctrl+P palette overlay portal */}
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        initialInput={paletteInitialInput}
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
        columns={columns}
      />

      {/* Add by identifier modal portal */}
      <AddByIdentifierModal
        isOpen={isAddByIdentifierOpen}
        onClose={() => setIsAddByIdentifierOpen(false)}
        onAddResolvedItem={handleAddResolvedItem}
        collections={collections.some(collection => collection.id === selectedCollectionId) ? [selectedCollectionId] : []}
        theme={theme}
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
