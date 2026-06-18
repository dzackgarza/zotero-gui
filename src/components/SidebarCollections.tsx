import React, { useState } from 'react';
import {
  Folder, FolderOpen, ChevronRight, ChevronDown, Trash2, Tag,
  Layers, PackageMinus, RefreshCw, FolderPlus, HelpCircle,
  FileMinus, FileText, Key
} from 'lucide-react';
import { Collection, ZoteroItem } from '../types';
import { getStandardCitekey } from '../utils/fuzzy';

interface SidebarCollectionsProps {
  collections: Collection[];
  selectedCollectionId: string;
  onSelectCollection: (id: string) => void;
  items: ZoteroItem[];
  onAddCollection: (name: string, parentId?: string) => void;
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
}

export default function SidebarCollections({
  collections,
  selectedCollectionId,
  onSelectCollection,
  items,
  onAddCollection,
  selectedTag,
  onSelectTag
}: SidebarCollectionsProps) {
  const [newColName, setNewColName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newColParent, setNewColParent] = useState<string>('');
  
  const [collectionsExpanded, setCollectionsExpanded] = useState(true);
  const [viewsExpanded, setViewsExpanded] = useState(true);
  const [tagsExpanded, setTagsExpanded] = useState(true);

  // Calculate item counters for each collection safely
  const getItemCount = (collectionId: string) => {
    const activeItems = items.filter(item => !item.inTrash);
    if (collectionId === 'all') return activeItems.length;

    // Filter by collection or its subcollections
    const childCollectionIds = collections
      .filter(c => c.parentId === collectionId)
      .map(c => c.id);

    const targetIds = [collectionId, ...childCollectionIds];

    return activeItems.filter(item =>
      item.collections && item.collections.some(cId => targetIds.includes(cId))
    ).length;
  };

  // Duplicate items count: simple match on overlapping titles or keys
  const getDuplicateCount = () => {
    const titles = new Set<string>();
    const duplicates = new Set<string>();
    const active = items.filter(item => !item.inTrash);
    
    active.forEach(item => {
      const normalized = item.title.trim().toLowerCase();
      if (titles.has(normalized)) {
        duplicates.add(normalized);
      } else {
        titles.add(normalized);
      }
    });

    return active.filter(item => duplicates.has(item.title.trim().toLowerCase())).length;
  };

  // Unfiled items: items with empty collections list
  const getUnfiledCount = () => {
    return items.filter(
      item => !item.inTrash && (!item.collections || item.collections.length === 0)
    ).length;
  };

  // Trash count
  const getTrashCount = () => {
    return items.filter(item => item.inTrash).length;
  };

  // No PDF Attachment count
  const getNoPdfCount = () => {
    return items.filter(item => {
      if (item.inTrash) return false;
      const hasPdf = item.attachments && item.attachments.some(att => 
        (att.path && att.path.toLowerCase().endsWith('.pdf')) ||
        (att.title && att.title.toLowerCase().includes('.pdf')) ||
        (att.mimeType && att.mimeType === 'application/pdf')
      );
      return !hasPdf;
    }).length;
  };

  // No Extraction count
  const getNoExtractionCount = () => {
    return items.filter(item => {
      if (item.inTrash) return false;
      const hasExtraction = item.attachments && item.attachments.some(att => 
        (att.title && att.title.toLowerCase().includes('extracted.md')) ||
        (att.path && att.path.toLowerCase().includes('extracted.md'))
      );
      return !hasExtraction;
    }).length;
  };

  // Nonstandard Citation Key count
  const getNonstandardCitekeyCount = () => {
    return items.filter(item => {
      if (item.inTrash) return false;
      const standard = getStandardCitekey(item);
      return !item.citekey || item.citekey !== standard;
    }).length;
  };

  // Collect active tag list to display alongside counts
  const getActiveTagCloud = () => {
    const tagCount: Record<string, number> = {};
    items
      .filter(item => !item.inTrash)
      .forEach(item => {
        item.tags.forEach(t => {
          tagCount[t] = (tagCount[t] || 0) + 1;
        });
      });
    return Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1]) // highest tags first
      .slice(0, 15); // Show top 15 tags
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;
    onAddCollection(newColName.trim(), newColParent ? newColParent : undefined);
    setNewColName('');
    setNewColParent('');
    setShowAddForm(false);
  };

  // Recursively render collection nodes safely
  const renderCollectionNode = (col: Collection, depth: number = 0) => {
    const count = getItemCount(col.id);
    const isSelected = selectedCollectionId === col.id;

    // Render child sub-collections
    const childNodes = collections.filter(c => c.parentId === col.id);

    return (
      <div key={col.id} className="space-y-0.5">
        <div
          onClick={() => {
            onSelectCollection(col.id);
            onSelectTag(null); // Clear tag selection when moving categories
          }}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          className={`group flex items-center justify-between py-1.5 pr-2.5 rounded-sm cursor-pointer transition select-none ${
            isSelected
              ? 'bg-blue-600/25 border-l-2 border-blue-500 text-slate-100'
              : 'hover:bg-slate-800/60 text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {childNodes.length > 0 ? (
              <ChevronDown className="h-3 w-3 text-slate-500 shrink-0" />
            ) : (
              <span className="w-3" />
            )}
            <Folder className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-blue-400' : 'text-slate-500'}`} />
            <span className="truncate text-xs">{col.name}</span>
          </div>
          <span className={`text-[10px] font-mono px-1 rounded-sm bg-slate-950/50 ${isSelected ? 'text-blue-300' : 'text-slate-500'}`}>
            {count}
          </span>
        </div>

        {/* Sub-directories recursive drawer */}
        {childNodes.length > 0 && (
          <div className="space-y-0.5">
            {childNodes.map(child => renderCollectionNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const rootCollections = collections.filter(c => !c.parentId && c.id !== 'all');
  const tagCloud = getActiveTagCloud();

  return (
    <div className="h-full flex flex-col bg-slate-900 border-r border-slate-800 text-xs font-sans p-3 space-y-4 select-none scrollbar-thin scrollbar-thumb-slate-800">
      
      {/* Search/Collection Folder Creator */}
      <div className="flex items-center justify-between border-b border-slate-850 pb-2 shrink-0">
        <span
          onClick={() => setCollectionsExpanded(!collectionsExpanded)}
          className="font-semibold text-[10px] text-slate-400 uppercase tracking-widest flex items-center gap-1.5 cursor-pointer hover:text-slate-200"
        >
          {collectionsExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-sky-400 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-sky-400 shrink-0" />
          )}
          <span>Collections</span>
        </span>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          title="Create Collection Folder"
          className="rounded p-1 text-slate-450 hover:bg-slate-800 hover:text-sky-400 transition"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Drawer Creation Toggle */}
      {showAddForm && (
        <form onSubmit={handleAddSubmit} className="bg-slate-950 p-2.5 rounded-md border border-slate-800 space-y-2 animate-fade-in shrink-0">
          <p className="text-[10px] font-mono text-slate-400 font-semibold mb-1">New Collection</p>
          <input
            type="text"
            required
            value={newColName}
            onChange={e => setNewColName(e.target.value)}
            placeholder="e.g. NLP, Genetics..."
            className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-100"
          />
          <div className="space-y-1">
            <label className="block text-[9px] font-mono text-slate-500">Nest Under (Optional)</label>
            <select
              value={newColParent}
              onChange={e => setNewColParent(e.target.value)}
              className="w-full rounded border border-slate-800 bg-slate-900 text-slate-300 py-0.5 text-[10px]"
            >
              <option value="">No Parent (Root level)</option>
              {collections
                .filter(c => c.id !== 'all')
                .map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex justify-end gap-1.5 text-[10px] pt-1">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-2 py-1 text-slate-400 hover:text-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-2.5 py-1 text-white bg-blue-600 hover:bg-blue-500 rounded-sm font-semibold"
            >
              Create
            </button>
          </div>
        </form>
      )}

      {/* Main Folders list */}
      {collectionsExpanded && (
        <div className="space-y-0.5 shrink-0 max-h-48 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
          {/* Core 'All items' folder */}
          <div
            onClick={() => {
              onSelectCollection('all');
              onSelectTag(null);
            }}
            className={`flex items-center justify-between py-1.5 px-2 rounded-sm cursor-pointer transition select-none ${
              selectedCollectionId === 'all' && !selectedTag
                ? 'bg-blue-600/25 border-l-2 border-blue-500 text-slate-100'
                : 'hover:bg-slate-800/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <FolderOpen className="h-3.5 w-3.5 text-blue-400" />
              <span className="font-semibold text-xs">My Library (All)</span>
            </div>
            <span className="text-[10px] font-mono px-1 rounded bg-slate-950/50 text-slate-500">
              {getItemCount('all')}
            </span>
          </div>

          {/* Nested user collections */}
          {rootCollections.map(rootItem => renderCollectionNode(rootItem))}
        </div>
      )}

      {/* Specialized smart folders */}
      <div className="space-y-0.5 pt-2 border-t border-slate-850 shrink-0">
        <h4
          onClick={() => setViewsExpanded(!viewsExpanded)}
          className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest pl-2 mb-2 flex items-center gap-1.5 cursor-pointer select-none hover:text-slate-205"
        >
          {viewsExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-sky-400 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-sky-400 shrink-0" />
          )}
          <span>Views</span>
        </h4>

        {viewsExpanded && (
          <div className="space-y-0.5">
            {/* Duplicate Items */}
            <div
              onClick={() => {
                onSelectCollection('duplicates');
                onSelectTag(null);
              }}
              className={`flex items-center justify-between py-1.5 px-2 rounded-sm cursor-pointer transition select-none ${
                selectedCollectionId === 'duplicates'
                  ? 'bg-blue-600/25 border-l-2 border-blue-500 text-slate-100'
                  : 'hover:bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-amber-500" />
                <span>Duplicate Items</span>
              </div>
              <span className="text-[10.5px] font-mono px-1 rounded bg-slate-950/50 text-slate-500">
                {getDuplicateCount()}
              </span>
            </div>

            {/* Unfiled Items */}
            <div
              onClick={() => {
                onSelectCollection('unfiled');
                onSelectTag(null);
              }}
              className={`flex items-center justify-between py-1.5 px-2 rounded-sm cursor-pointer transition select-none ${
                selectedCollectionId === 'unfiled'
                  ? 'bg-blue-600/25 border-l-2 border-blue-500 text-slate-100'
                  : 'hover:bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <PackageMinus className="h-3.5 w-3.5 text-orange-400" />
                <span>Unfiled Items</span>
              </div>
              <span className="text-[10px] font-mono px-1 rounded bg-slate-950/50 text-slate-500 font-semibold text-sky-400">
                {getUnfiledCount()}
              </span>
            </div>

            {/* No PDF Attachment */}
            <div
              onClick={() => {
                onSelectCollection('no-pdf');
                onSelectTag(null);
              }}
              className={`flex items-center justify-between py-1.5 px-2 rounded-sm cursor-pointer transition select-none ${
                selectedCollectionId === 'no-pdf'
                  ? 'bg-blue-600/25 border-l-2 border-blue-500 text-slate-100'
                  : 'hover:bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileMinus className="h-3.5 w-3.5 text-red-400" />
                <span>No PDF Attachment</span>
              </div>
              <span className="text-[10px] font-mono px-1 rounded bg-slate-950/50 text-slate-500">
                {getNoPdfCount()}
              </span>
            </div>

            {/* No Extraction */}
            <div
              onClick={() => {
                onSelectCollection('no-extraction');
                onSelectTag(null);
              }}
              className={`flex items-center justify-between py-1.5 px-2 rounded-sm cursor-pointer transition select-none ${
                selectedCollectionId === 'no-extraction'
                  ? 'bg-blue-600/25 border-l-2 border-blue-500 text-slate-100'
                  : 'hover:bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-yellow-500" />
                <span>No Extraction</span>
              </div>
              <span className="text-[10px] font-mono px-1 rounded bg-slate-950/50 text-slate-500">
                {getNoExtractionCount()}
              </span>
            </div>

            {/* Nonstandard Citation Key */}
            <div
              onClick={() => {
                onSelectCollection('nonstandard-citekey');
                onSelectTag(null);
              }}
              className={`flex items-center justify-between py-1.5 px-2 rounded-sm cursor-pointer transition select-none ${
                selectedCollectionId === 'nonstandard-citekey'
                  ? 'bg-blue-600/25 border-l-2 border-blue-500 text-slate-100'
                  : 'hover:bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <Key className="h-3.5 w-3.5 text-purple-400" />
                <span>Nonstandard Citation Key</span>
              </div>
              <span className="text-[10px] font-mono px-1 rounded bg-slate-950/50 text-slate-500">
                {getNonstandardCitekeyCount()}
              </span>
            </div>

            {/* Trash */}
            <div
              onClick={() => {
                onSelectCollection('trash');
                onSelectTag(null);
              }}
              className={`flex items-center justify-between py-1.5 px-2 rounded-sm cursor-pointer transition select-none ${
                selectedCollectionId === 'trash'
                  ? 'bg-blue-600/25 border-l-2 border-blue-500 text-slate-100'
                  : 'hover:bg-slate-800/60 text-slate-400 hover:text-slate-250'
              }`}
            >
              <div className="flex items-center gap-2">
                <Trash2 className="h-3.5 w-3.5 text-red-400" />
                <span>Trash bin</span>
              </div>
              <span className="text-[10px] font-mono px-1 rounded bg-slate-950/50 text-slate-500">
                {getTrashCount()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Tag filtering Cloud widget */}
      <div className="flex-1 flex flex-col min-h-[160px] pt-3 border-t border-slate-850 min-h-0 overflow-hidden">
        <div
          onClick={() => setTagsExpanded(!tagsExpanded)}
          className="flex items-center gap-1.5 text-slate-400 font-semibold text-[10px] uppercase tracking-widest pl-2 mb-2 cursor-pointer select-none hover:text-slate-200"
        >
          {tagsExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-sky-400 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-sky-400 shrink-0" />
          )}
          <Tag className="h-3.5 w-3.5 text-sky-400 shrink-0" />
          <span>Active Tag Filter</span>
        </div>

        {tagsExpanded && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {selectedTag && (
              <div className="flex items-center justify-between bg-blue-600/10 border border-blue-500/20 rounded p-1.5 mb-2.5 text-xs text-sky-400 shrink-0">
                <span className="truncate font-semibold">Active: {selectedTag}</span>
                <button
                  onClick={() => onSelectTag(null)}
                  className="font-bold text-[10px] hover:text-red-400 cursor-pointer"
                >
                  ✕ Clear
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto pr-1.5 space-y-1 scrollbar-thin scrollbar-thumb-slate-800">
              {tagCloud.length === 0 ? (
                <p className="text-[10px] text-slate-500 text-center italic py-2">No tags detected.</p>
              ) : (
                tagCloud.map(([tag, count]) => {
                  const isTagSelected = selectedTag === tag;
                  return (
                    <div
                      key={tag}
                      onClick={() => onSelectTag(isTagSelected ? null : tag)}
                      className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer text-[11px] transition ${
                        isTagSelected
                          ? 'bg-sky-600 text-white font-medium'
                          : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span className="truncate pr-1.5">{tag}</span>
                      <span className={`text-[9px] font-mono px-1 rounded-xs ${isTagSelected ? 'bg-sky-700 text-white' : 'bg-slate-950/40 text-slate-500'}`}>
                        {count}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
