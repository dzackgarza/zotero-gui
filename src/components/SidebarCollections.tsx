import React from 'react';
import {
  Folder, FolderOpen, ChevronDown, Trash2, Tag,
  Layers, PackageMinus,
  FileMinus, FileText, Key
} from 'lucide-react';
import * as Accordion from '@radix-ui/react-accordion';
import { Collection, ZoteroItem } from '../types';
import { countItemsForCollection, selectTagCloud } from '../librarySelectors';

interface SidebarCollectionsProps {
  collections: Collection[];
  selectedCollectionId: string;
  onSelectCollection: (id: string) => void;
  items: ZoteroItem[];
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  theme: string;
}

export default function SidebarCollections({
  collections,
  selectedCollectionId,
  onSelectCollection,
  items,
  selectedTag,
  onSelectTag,
  theme
}: SidebarCollectionsProps) {
  // Styles dynamically based on the VS theme
  const getSidebarBg = () => {
    switch (theme) {
      case 'code-light':
        return 'bg-[#f3f3f3] text-slate-800 border-r border-[#e4e4e7]';
      case 'monokai':
        return 'bg-[#272822] text-[#f8f8f2] border-r border-[#3e3d32] font-mono';
      case 'code-dark':
      default:
        return 'bg-[#252526] text-[#cccccc] border-r border-[#2b2b2b]';
    }
  };

  const getFolderSelectedClass = (isSelected: boolean) => {
    if (isSelected) {
      switch (theme) {
        case 'code-light':
          return 'bg-blue-600/10 border-l-2 border-blue-600 text-blue-600 font-semibold';
        case 'monokai':
          return 'bg-[#3e3d32] border-l-2 border-[#a6e22e] text-[#a6e22e] font-semibold';
        case 'code-dark':
        default:
          return 'bg-blue-600/20 border-l-2 border-blue-500 text-sky-400 font-semibold';
      }
    } else {
      switch (theme) {
        case 'code-light':
          return 'hover:bg-slate-200/80 text-slate-550 hover:text-slate-800';
        case 'monokai':
          return 'hover:bg-[#3e3d32]/50 text-[#75715e] hover:text-[#f8f8f2]';
        case 'code-dark':
        default:
          return 'hover:bg-slate-800/60 text-slate-400 hover:text-slate-200';
      }
    }
  };

  const getCounterClass = (isSelected: boolean) => {
    switch (theme) {
      case 'code-light':
        return isSelected ? 'bg-blue-600/15 text-blue-600 font-semibold' : 'bg-slate-200 text-slate-500';
      case 'monokai':
        return isSelected ? 'bg-[#3e3d32] text-[#a6e22e] font-semibold' : 'bg-[#1e1f1c] text-[#75715e]';
      case 'code-dark':
      default:
        return isSelected ? 'bg-slate-950/50 text-sky-400 font-semibold' : 'bg-slate-950/50 text-slate-500';
    }
  };

  const getItemCount = (collectionId: string) => {
    return countItemsForCollection(items, collections, collectionId);
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
          className={`group flex items-center justify-between py-1.5 pr-2.5 rounded-sm cursor-pointer transition select-none ${getFolderSelectedClass(isSelected)}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {childNodes.length > 0 ? (
              <ChevronDown className="h-3 w-3 text-slate-500 shrink-0" />
            ) : (
              <span className="w-3" />
            )}
            <Folder className={`h-3.5 w-3.5 shrink-0 ${isSelected ? (theme === 'code-light' ? 'text-blue-600' : theme === 'monokai' ? 'text-[#a6e22e]' : 'text-blue-400') : 'text-slate-550'}`} />
            <span className="truncate text-xs">{col.name}</span>
          </div>
          <span className={`text-[10px] font-mono px-1 rounded-sm ${getCounterClass(isSelected)}`}>
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
  const tagCloud = selectTagCloud(items, 15);

  return (
    <div className={`h-full flex flex-col ${getSidebarBg()} select-none`}>
        <Accordion.Root type="multiple" defaultValue={["collections", "views", "tags"]} className="w-full flex-1 flex flex-col space-y-4 min-h-0 overflow-hidden">
          
          {/* Collections Section */}
          <Accordion.Item value="collections" className="flex flex-col min-h-0 overflow-hidden">
            <div className={`flex items-center justify-between pb-2 shrink-0 select-none border-b ${theme === 'code-light' ? 'border-zinc-200' : theme === 'monokai' ? 'border-[#3e3d32]' : 'border-slate-850'}`}>
              <Accordion.Trigger className="font-semibold text-[10px] text-slate-400 uppercase tracking-widest flex items-center gap-1.5 cursor-pointer hover:text-slate-200 outline-hidden select-none">
                <ChevronDown className="h-3.5 w-3.5 text-sky-400 shrink-0 transition-transform duration-200 data-[state=closed]:-rotate-90" />
                <span>Collections</span>
              </Accordion.Trigger>
            </div>

            <Accordion.Content className="flex-1 overflow-y-auto pr-1 mt-2 space-y-0.5 min-h-[80px] scrollbar-thin scrollbar-thumb-slate-800 select-none data-[state=closed]:animate-slide-up data-[state=open]:animate-slide-down">
              {/* Core 'All items' folder */}
              <div
                onClick={() => {
                  onSelectCollection('all');
                  onSelectTag(null);
                }}
                className={`flex items-center justify-between py-1.5 px-2 rounded-sm cursor-pointer transition select-none ${getFolderSelectedClass(selectedCollectionId === 'all' && !selectedTag)}`}
              >
                <div className="flex items-center gap-2">
                  <FolderOpen className={`h-3.5 w-3.5 ${selectedCollectionId === 'all' && !selectedTag ? (theme === 'code-light' ? 'text-blue-600' : theme === 'monokai' ? 'text-[#a6e22e]' : 'text-blue-400') : 'text-slate-550'}`} />
                  <span className="font-semibold text-xs">My Library (All)</span>
                </div>
                <span className={`text-[10px] font-mono px-1 rounded ${getCounterClass(selectedCollectionId === 'all' && !selectedTag)}`}>
                  {getItemCount('all')}
                </span>
              </div>

              {/* Nested user collections */}
              {rootCollections.map(rootItem => renderCollectionNode(rootItem))}
            </Accordion.Content>
          </Accordion.Item>

          {/* Views Section */}
          <Accordion.Item value="views" className={`flex flex-col min-h-0 shrink-0 border-t pt-2 ${theme === 'code-light' ? 'border-zinc-200' : theme === 'monokai' ? 'border-[#3e3d32]' : 'border-slate-850'}`}>
            <Accordion.Trigger className="font-semibold text-[10px] text-slate-400 uppercase tracking-widest pl-2 mb-2 flex items-center gap-1.5 cursor-pointer select-none hover:text-slate-205 outline-hidden">
              <ChevronDown className="h-3.5 w-3.5 text-sky-400 shrink-0 transition-transform duration-200 data-[state=closed]:-rotate-90" />
              <span>Views</span>
            </Accordion.Trigger>

            <Accordion.Content className="space-y-0.5 select-none max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 pr-1 data-[state=closed]:animate-slide-up data-[state=open]:animate-slide-down">
              {/* Duplicate Items */}
              <div
                onClick={() => {
                  onSelectCollection('duplicates');
                  onSelectTag(null);
                }}
                className={`flex items-center justify-between py-1.5 px-2 rounded-sm cursor-pointer transition select-none ${getFolderSelectedClass(selectedCollectionId === 'duplicates')}`}
              >
                <div className="flex items-center gap-2">
                  <Layers className={`h-3.5 w-3.5 ${selectedCollectionId === 'duplicates' ? 'text-amber-500' : 'text-slate-500'}`} />
                  <span>Duplicate Items</span>
                </div>
                <span className={`text-[10.5px] font-mono px-1 rounded ${getCounterClass(selectedCollectionId === 'duplicates')}`}>
                  {getItemCount('duplicates')}
                </span>
              </div>

              {/* Unfiled Items */}
              <div
                onClick={() => {
                  onSelectCollection('unfiled');
                  onSelectTag(null);
                }}
                className={`flex items-center justify-between py-1.5 px-2 rounded-sm cursor-pointer transition select-none ${getFolderSelectedClass(selectedCollectionId === 'unfiled')}`}
              >
                <div className="flex items-center gap-2">
                  <PackageMinus className={`h-3.5 w-3.5 ${selectedCollectionId === 'unfiled' ? 'text-orange-400' : 'text-slate-500'}`} />
                  <span>Unfiled Items</span>
                </div>
                <span className={`text-[10px] font-mono px-1 rounded ${getCounterClass(selectedCollectionId === 'unfiled')}`}>
                  {getItemCount('unfiled')}
                </span>
              </div>

              {/* No PDF Attachment */}
              <div
                onClick={() => {
                  onSelectCollection('no-pdf');
                  onSelectTag(null);
                }}
                className={`flex items-center justify-between py-1.5 px-2 rounded-sm cursor-pointer transition select-none ${getFolderSelectedClass(selectedCollectionId === 'no-pdf')}`}
              >
                <div className="flex items-center gap-2">
                  <FileMinus className={`h-3.5 w-3.5 ${selectedCollectionId === 'no-pdf' ? 'text-red-400' : 'text-slate-500'}`} />
                  <span>No PDF Attachment</span>
                </div>
                <span className={`text-[10px] font-mono px-1 rounded ${getCounterClass(selectedCollectionId === 'no-pdf')}`}>
                  {getItemCount('no-pdf')}
                </span>
              </div>

              {/* No Extraction */}
              <div
                onClick={() => {
                  onSelectCollection('no-extraction');
                  onSelectTag(null);
                }}
                className={`flex items-center justify-between py-1.5 px-2 rounded-sm cursor-pointer transition select-none ${getFolderSelectedClass(selectedCollectionId === 'no-extraction')}`}
              >
                <div className="flex items-center gap-2">
                  <FileText className={`h-3.5 w-3.5 ${selectedCollectionId === 'no-extraction' ? 'text-yellow-500' : 'text-slate-500'}`} />
                  <span>No Extraction</span>
                </div>
                <span className={`text-[10px] font-mono px-1 rounded ${getCounterClass(selectedCollectionId === 'no-extraction')}`}>
                  {getItemCount('no-extraction')}
                </span>
              </div>

              {/* Nonstandard Citation Key */}
              <div
                onClick={() => {
                  onSelectCollection('nonstandard-citekey');
                  onSelectTag(null);
                }}
                className={`flex items-center justify-between py-1.5 px-2 rounded-sm cursor-pointer transition select-none ${getFolderSelectedClass(selectedCollectionId === 'nonstandard-citekey')}`}
              >
                <div className="flex items-center gap-2">
                  <Key className={`h-3.5 w-3.5 ${selectedCollectionId === 'nonstandard-citekey' ? 'text-purple-400' : 'text-slate-500'}`} />
                  <span>Nonstandard Citation Key</span>
                </div>
                <span className={`text-[10px] font-mono px-1 rounded ${getCounterClass(selectedCollectionId === 'nonstandard-citekey')}`}>
                  {getItemCount('nonstandard-citekey')}
                </span>
              </div>

              {/* Trash */}
              <div
                onClick={() => {
                  onSelectCollection('trash');
                  onSelectTag(null);
                }}
                className={`flex items-center justify-between py-1.5 px-2 rounded-sm cursor-pointer transition select-none ${getFolderSelectedClass(selectedCollectionId === 'trash')}`}
              >
                <div className="flex items-center gap-2">
                  <Trash2 className={`h-3.5 w-3.5 ${selectedCollectionId === 'trash' ? 'text-red-500' : 'text-slate-500'}`} />
                  <span>Trash bin</span>
                </div>
                <span className={`text-[10px] font-mono px-1 rounded ${getCounterClass(selectedCollectionId === 'trash')}`}>
                  {getItemCount('trash')}
                </span>
              </div>
            </Accordion.Content>
          </Accordion.Item>

          {/* Tags Section */}
          <Accordion.Item value="tags" className={`flex-1 flex flex-col min-h-[160px] border-t pt-3 min-h-0 overflow-hidden ${theme === 'code-light' ? 'border-zinc-200' : theme === 'monokai' ? 'border-[#3e3d32]' : 'border-slate-850'}`}>
            <Accordion.Trigger className="flex items-center gap-1.5 text-slate-400 font-semibold text-[10px] uppercase tracking-widest pl-2 mb-2 cursor-pointer select-none hover:text-slate-200 outline-hidden">
              <ChevronDown className="h-3.5 w-3.5 text-sky-400 shrink-0 transition-transform duration-200 data-[state=closed]:-rotate-90" />
              <Tag className="h-3.5 w-3.5 text-sky-400 shrink-0" />
              <span>Active Tag Filter</span>
            </Accordion.Trigger>

            <Accordion.Content className="flex-1 flex flex-col min-h-0 overflow-hidden select-none data-[state=closed]:animate-slide-up data-[state=open]:animate-slide-down">
              {selectedTag && (
                <div className={`flex items-center justify-between border rounded p-1.5 mb-2.5 text-xs text-sky-400 shrink-0 select-none ${
                  theme === 'code-light' ? 'bg-blue-50 border-blue-200 text-blue-600' : theme === 'monokai' ? 'bg-[#3e3d32] border-[#a6e22e]/30 text-[#a6e22e]' : 'bg-blue-600/10 border-blue-500/20 text-sky-400'
                }`}>
                  <span className="truncate font-semibold">Active: {selectedTag}</span>
                  <button
                    onClick={() => onSelectTag(null)}
                    className="font-bold text-[10px] hover:text-red-400 cursor-pointer"
                  >
                    ✕ Clear
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto pr-1.5 space-y-1 scrollbar-thin scrollbar-thumb-slate-800 select-none">
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
                            ? (theme === 'code-light' ? 'bg-blue-600 text-white font-medium' : theme === 'monokai' ? 'bg-[#a6e22e] text-black font-medium' : 'bg-sky-600 text-white font-medium')
                            : (theme === 'code-light' ? 'hover:bg-slate-200 text-slate-600' : theme === 'monokai' ? 'hover:bg-[#3e3d32]/50 text-[#f8f8f2]' : 'hover:bg-slate-800 text-slate-400')
                        }`}
                      >
                        <span className="truncate pr-1.5">{tag}</span>
                        <span className={`text-[9px] font-mono px-1 rounded-xs ${
                          isTagSelected 
                            ? (theme === 'code-light' ? 'bg-blue-700 text-white' : theme === 'monokai' ? 'bg-[#8ec027] text-black' : 'bg-sky-700 text-white') 
                            : (theme === 'code-light' ? 'bg-slate-200 text-slate-550' : theme === 'monokai' ? 'bg-[#1e1f1c] text-[#75715e]' : 'bg-slate-950/40 text-slate-550')
                        }`}>
                          {count}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </Accordion.Content>
          </Accordion.Item>
        </Accordion.Root>
      </div>
  );
}
