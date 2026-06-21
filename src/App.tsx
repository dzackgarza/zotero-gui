import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Terminal } from 'lucide-react';
import { AdvancedSearchSettings } from './types';
import { DEFAULT_COLUMNS } from './data/samples';
import { selectVisibleLibraryItems } from './librarySelectors';
import { reconcileSelectedLibraryView, selectModalImportCollections } from './libraryViews';
import { toFormattedCitation } from './utils/citation';
import { isDefaultSearchField } from './utils/fuzzy';
import { useLibraryApi } from './useLibraryApi';
import { createAppCommands } from './appCommands';
import { resetColumnLayout, useLibraryTable } from './useLibraryTable';
import { THEME_CLASSES, useThemePreference } from './useThemePreference';

// Top level components
import TopBar from './components/TopBar';
import SidebarCollections from './components/SidebarCollections';
import InspectorPanel from './components/InspectorPanel';
import CommandPaletteHost, { type CommandPaletteHostHandle } from './components/CommandPaletteHost';
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

  const [theme, setTheme] = useThemePreference();

  // --- UI Interactivity/Focus States ---
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);
  const [isAddByIdentifierOpen, setIsAddByIdentifierOpen] = useState(false);
  const paletteHostRef = useRef<CommandPaletteHostHandle>(null);

  // Search setups
  const [searchSettings, setSearchSettings] = useState<AdvancedSearchSettings>(() => {
    const fields: Record<string, boolean> = {};
    DEFAULT_COLUMNS.forEach(col => {
      fields[col.key] = isDefaultSearchField(col.key);
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

  // Global Escape handling for non-palette overlays.
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAdvancedSearchOpen(false);
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
    const { columnVisibility, columnOrder, columnSizing } = libraryTable.getState();
    const columns = { columnVisibility, columnOrder, columnSizing };
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

  // Generate an APA citation via the shared Citation.js mapping (citeproc).
  const copyCitationFormatted = () => {
    const selectedItem = items.find(it => it.id === selectedItemId);
    if (!selectedItem) {
      showToast('Please select a bibliography item first.');
      return;
    }
    const citation = toFormattedCitation(selectedItem);
    navigator.clipboard.writeText(citation).then(() => {
      showToast('APA Citation copied to clipboard!');
    });
  };

  const openAttachment = (attachmentId: string) => {
    fetch(`/api/attachments/${encodeURIComponent(attachmentId)}/open`, { method: 'POST' })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Attachment open failed with HTTP ${response.status}`);
        }
        showToast('Opening attachment with xdg-open.');
      })
      .catch((error: Error) => showToast(error.message));
  };

  // Reconcile the selection against live collections BEFORE it drives view
  // derivation. A live reload can drop the selected collection; the stale id
  // must not reach selectItemsForCollection (whose unknown-id guard throws).
  // Deriving the corrected id during render keeps the selection a correct
  // function of live data; the effect below syncs it back into state so the
  // sidebar highlight and active-view name stay consistent.
  const reconciledCollectionId = reconcileSelectedLibraryView(collections, selectedCollectionId);

  useEffect(() => {
    if (reconciledCollectionId !== selectedCollectionId) {
      setSelectedCollectionId(reconciledCollectionId);
    }
  }, [reconciledCollectionId, selectedCollectionId]);

  const filteredLibraryItems = useMemo(() => selectVisibleLibraryItems({
    items,
    collections,
    selectedCollectionId: reconciledCollectionId,
    selectedTag,
    searchSettings,
  }), [collections, items, searchSettings, reconciledCollectionId, selectedTag]);

  // Headless table engine (column visibility/order/sizing/sorting + persistence).
  // Sorting state lives here and orders rows via the columnModel sortingFn.
  const libraryTable = useLibraryTable(filteredLibraryItems);

  const openPaletteFromToolbar = useCallback(() => {
    const paletteHost = paletteHostRef.current;
    if (paletteHost === null) {
      throw new Error('Command palette host is not mounted.');
    }
    paletteHost.openItemPalette();
  }, []);

  if (libraryStatus === 'loading') {
    return (
      <div className="h-screen bg-[#1e1e1e] text-[#cccccc] flex items-center justify-center p-6">
        <section
          role="status"
          aria-label="Loading Zotero database"
          className="flex flex-col items-center gap-4 text-slate-200"
        >
          <RefreshCw className="h-8 w-8 animate-spin text-sky-400" />
          <p className="text-sm font-semibold">Loading Zotero database</p>
        </section>
      </div>
    );
  }

  if (libraryStatus === 'failed') {
    const isZoteroUnavailable = libraryLoadError.kind === 'zotero_unavailable';
    return (
      <div className="h-screen bg-[#1e1e1e] text-[#cccccc] flex items-center justify-center p-6">
        <section className="w-full max-w-2xl border border-red-500/40 bg-[#252526] p-6 shadow-2xl">
          <h1 className="text-lg font-semibold text-red-400">
            {isZoteroUnavailable ? 'Zotero is not running' : 'Zotero Library Load Failed'}
          </h1>
          {isZoteroUnavailable && (
            <p className="mt-3 text-sm text-slate-200">
              Start Zotero, then reload the library.
            </p>
          )}
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

  const getCollectionName = () => {
    if (reconciledCollectionId === 'duplicates') return 'Duplicate Entries';
    if (reconciledCollectionId === 'no-pdf') return 'No PDF Attachment';
    if (reconciledCollectionId === 'no-extraction') return 'No Extraction';
    if (reconciledCollectionId === 'nonstandard-citekey') return 'Nonstandard Citation Key';
    const found = collections.find(c => c.id === reconciledCollectionId);
    return found ? found.name : 'My Library';
  };

  // --- Commands List for Palette ---
  const commandsList = createAppCommands({
    reloadFromDb,
    setTheme,
    exportDatabaseJson,
    copyCitationFormatted,
    showAllColumns: () => libraryTable.toggleAllColumnsVisible(true),
    resetColumns: () => resetColumnLayout(libraryTable),
  });

  const activeSelectedItem = items.find(it => it.id === selectedItemId) || null;

  return (
    <div className={`h-screen flex flex-col overflow-hidden text-xs ${THEME_CLASSES[theme].app}`}>
      
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
        onOpenPalette={openPaletteFromToolbar}
        activeCollectionName={getCollectionName()}
        onOpenAddByIdentifier={() => setIsAddByIdentifierOpen(true)}
        theme={theme}
        setTheme={setTheme}
      />

      {/* Main Workspace Frame split */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        
        {/* 2. Left Activity rail & Sidebar Explorer */}
        <div className={`w-60 flex flex-col shrink-0 ${THEME_CLASSES[theme].subpanel}`}>
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
        <div className={`flex-1 flex flex-col min-w-0 relative ${THEME_CLASSES[theme].workspace}`}>
          
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
            table={libraryTable}
            theme={theme}
            tableClass={THEME_CLASSES[theme].table}
            selectedItemId={selectedItemId}
            expandedItems={expandedItems}
            searchSettings={searchSettings}
            onSelectItem={setSelectedItemId}
            onOpenAttachment={openAttachment}
            onResetFilters={(settings) => {
              setSearchSettings(settings);
              setSelectedTag(null);
            }}
            onToggleExpand={toggleExpand}
          />
        </div>

        {/* 4. Right side Inspector detail panel */}
        {activeSelectedItem && (
          <div className="w-80 shrink-0">
            <InspectorPanel
              item={activeSelectedItem}
              allItems={items}
              onClose={() => setSelectedItemId(null)}
              onOpenAttachment={openAttachment}
              theme={theme}
            />
          </div>
        )}
      </div>

      {/* Command palette overlay portal */}
      <CommandPaletteHost
        ref={paletteHostRef}
        items={items}
        onSelectItem={(id) => {
          setSelectedItemId(id);
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
        columns={DEFAULT_COLUMNS}
      />

      {/* Add by identifier modal portal */}
      <AddByIdentifierModal
        isOpen={isAddByIdentifierOpen}
        onClose={() => setIsAddByIdentifierOpen(false)}
        onAddResolvedItem={handleAddResolvedItem}
        collections={selectModalImportCollections(collections, reconciledCollectionId)}
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
