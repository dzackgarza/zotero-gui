import React, { useState, useEffect } from 'react';
import {
  FileText, Plus, Info, Share2, Copy, Trash2, LayoutGrid, Check, ChevronDown
} from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import * as Select from '@radix-ui/react-select';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tooltip from '@radix-ui/react-tooltip';
import { ZoteroItem, ItemType, ITEM_TYPE_LABELS, Creator } from '../types';

const serializeCreators = (creators: Creator[]): string => {
  return creators
    .map(c => {
      if (c.lastName && c.firstName) {
        return `${c.lastName}, ${c.firstName}`;
      }
      return c.lastName || c.firstName || '';
    })
    .filter(Boolean)
    .join('; ');
};

const deserializeCreators = (str: string): Creator[] => {
  return str
    .split(';')
    .map(part => {
      const trimmed = part.trim();
      if (!trimmed) return null;
      const commaIndex = trimmed.indexOf(',');
      if (commaIndex !== -1) {
        const lastName = trimmed.substring(0, commaIndex).trim();
        const firstName = trimmed.substring(commaIndex + 1).trim();
        return { firstName, lastName, creatorType: 'author' };
      }
      return { firstName: '', lastName: trimmed, creatorType: 'author' };
    })
    .filter((c): c is Creator => c !== null);
};

interface InspectorPanelProps {
  item: ZoteroItem | null;
  allItems: ZoteroItem[];
  onUpdateItem: (item: ZoteroItem) => void;
  onDeleteItem: (id: string) => void;
  onDuplicateItem: (id: string) => void;
  onClose: () => void;
  theme: string;
}

export default function InspectorPanel({
  item,
  allItems,
  onUpdateItem,
  onDeleteItem,
  onDuplicateItem,
  onClose,
  theme
}: InspectorPanelProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'notes' | 'tags' | 'attachments'>('info');
  const [copied, setCopied] = useState(false);
  const [citekeyConflict, setCitekeyConflict] = useState(false);

  const [creatorsText, setCreatorsText] = useState('');
  const [isEditingCreators, setIsEditingCreators] = useState(false);

  useEffect(() => {
    if (item && !isEditingCreators) {
      setCreatorsText(serializeCreators(item.creators));
    }
  }, [item, isEditingCreators]);

  // Notes state
  const [newNoteText, setNewNoteText] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  // Attachments state
  const [newAttachTitle, setNewAttachTitle] = useState('');
  const [pdfReaderUrl, setPdfReaderUrl] = useState<string | null>(null);

  // New Tag state
  const [newTag, setNewTag] = useState('');

  // Styles dynamically based on the VS theme
  const getPanelBg = () => {
    switch (theme) {
      case 'code-light':
        return 'bg-[#f3f3f3] text-slate-800 border-l border-[#e4e4e7]';
      case 'monokai':
        return 'bg-[#272822] text-[#f8f8f2] border-l border-[#3e3d32] font-mono';
      case 'code-dark':
      default:
        return 'bg-[#252526] text-[#cccccc] border-l border-[#2b2b2b]';
    }
  };

  const getSubpanelHeaderBg = () => {
    switch (theme) {
      case 'code-light':
        return 'bg-white border-b border-[#e4e4e7]';
      case 'monokai':
        return 'bg-[#1e1f1c] border-b border-[#3e3d32]';
      case 'code-dark':
      default:
        return 'bg-slate-950 border-b border-[#2b2b2b]';
    }
  };

  const getInputClass = () => {
    switch (theme) {
      case 'code-light':
        return 'bg-white border border-[#e4e4e7] text-slate-800 placeholder:text-slate-400 focus:border-blue-600';
      case 'monokai':
        return 'bg-[#272822] border border-[#3e3d32] text-[#f8f8f2] placeholder:text-stone-500 focus:border-[#a6e22e]';
      case 'code-dark':
      default:
        return 'bg-slate-950 border border-slate-800 text-slate-100 placeholder:text-slate-550 focus:border-blue-600';
    }
  };

  // Validate citekey unique matches
  useEffect(() => {
    if (item && item.citekey) {
      const conflict = allItems.some(
        other => other.id !== item.id && other.citekey?.trim().toLowerCase() === item.citekey?.trim().toLowerCase()
      );
      setCitekeyConflict(conflict);
    } else {
      setCitekeyConflict(false);
    }
  }, [item, allItems]);

  if (!item) {
    const isLight = theme === 'code-light';
    const isMonokai = theme === 'monokai';
    return (
      <div className={`h-full flex flex-col items-center justify-center p-6 select-none ${getPanelBg()}`}>
        <FileText className={`h-10 w-10 mb-2.5 animate-pulse ${isLight ? 'text-slate-400' : isMonokai ? 'text-[#75715e]' : 'text-slate-700'}`} />
        <p className={`text-xs font-semibold ${isLight ? 'text-slate-500' : isMonokai ? 'text-[#f8f8f2]' : 'text-slate-400'}`}>No Item Selected</p>
        <p className={`text-[10px] leading-normal text-center mt-1 max-w-xs ${isLight ? 'text-slate-400' : isMonokai ? 'text-[#75715e]' : 'text-slate-550'}`}>
          Select any bibliography row or press <kbd className="bg-slate-950 px-1 py-0.5 rounded border border-slate-800 text-[9px] text-slate-400 font-mono">Ctrl+P</kbd> to inspect detailed metadata.
        </p>
      </div>
    );
  }

  // Handle generic text/input updates
  const handleFieldChange = (key: keyof ZoteroItem, value: any) => {
    onUpdateItem({
      ...item,
      [key]: value,
      dateModified: new Date().toISOString()
    });
  };

  // Notes management
  const handleAddNote = () => {
    if (!newNoteText.trim()) return;
    const now = new Date().toISOString();
    const newNote = {
      id: `note-${Date.now()}`,
      note: newNoteText.trim(),
      dateAdded: now,
      dateModified: now
    };
    handleFieldChange('notes', [...item.notes, newNote]);
    setNewNoteText('');
  };

  const handleStartEditNote = (noteId: string, text: string) => {
    setEditingNoteId(noteId);
    setEditingNoteText(text);
  };

  const handleSaveEditNote = (noteId: string) => {
    const updatedNotes = item.notes.map(n => {
      if (n.id === noteId) {
        return {
          ...n,
          note: editingNoteText.trim(),
          dateModified: new Date().toISOString()
        };
      }
      return n;
    });
    handleFieldChange('notes', updatedNotes);
    setEditingNoteId(null);
  };

  const handleDeleteNote = (noteId: string) => {
    const updatedNotes = item.notes.filter(n => n.id !== noteId);
    handleFieldChange('notes', updatedNotes);
  };

  // Tags management
  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const tag = newTag.trim();
    if (!tag) return;
    if (item.tags.includes(tag)) {
      setNewTag('');
      return;
    }
    handleFieldChange('tags', [...item.tags, tag]);
    setNewTag('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    handleFieldChange('tags', item.tags.filter(t => t !== tagToRemove));
  };

  // Attachments management
  const handleAddAttachment = () => {
    if (!newAttachTitle.trim()) return;
    const newAttach = {
      id: `attach-${Date.now()}`,
      title: newAttachTitle.trim(),
      mimeType: 'application/pdf',
      path: `/local/${newAttachTitle.trim().replace(/\s+/g, '_')}.pdf`
    };
    handleFieldChange('attachments', [...item.attachments, newAttach]);
    setNewAttachTitle('');
  };

  const handleDeleteAttachment = (attachId: string) => {
    handleFieldChange('attachments', item.attachments.filter(a => a.id !== attachId));
  };

  // Clipboard citation formatting (simplified BibTeX)
  const copyBibtex = () => {
    const mainCreator = item.creators[0] ? item.creators[0].lastName.toLowerCase() : 'anonymous';
    const cleanTitle = item.title.replace(/\s+/g, '_').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 15);
    const year = item.date || 'unknown';
    const entryKey = item.citekey || `${mainCreator}_${cleanTitle}_${year}`;

    const bibtex = `@article{${entryKey},
  title = {${item.title}},
  author = {${item.creators.map(c => `${c.lastName}, ${c.firstName}`).join(' and ')}},
  journal = {${item.publicationTitle || ''}},
  year = {${year}},
  doi = {${item.doi || ''}},
  url = {${item.url || ''}}
}`;

    navigator.clipboard.writeText(bibtex).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Tooltip.Provider delayDuration={400}>
      <div className={`h-full flex flex-col ${getPanelBg()}`}>
        
        {/* Title / Close pane */}
        <div className={`flex items-center justify-between px-3 py-2 shrink-0 ${getSubpanelHeaderBg()}`}>
          <span className="font-semibold text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-blue-400" />
            <span>Item Inspector</span>
          </span>
          <div className="flex items-center gap-1">
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  onClick={copyBibtex}
                  className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-sky-400 transition cursor-pointer"
                >
                  {copied ? (
                    <span className="text-[10px] text-green-400 font-mono">Copied!</span>
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  side="top"
                  className="z-50 rounded bg-slate-955 border border-slate-800 px-2.5 py-1.5 text-[10px] text-slate-355 font-sans shadow-md"
                >
                  Generate BibTeX citation
                  <Tooltip.Arrow className="fill-slate-800" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>

            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  onClick={() => onDuplicateItem(item.id)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-yellow-400 transition cursor-pointer"
                >
                  <Share2 className="h-3.5 w-3.5" />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  side="top"
                  className="z-50 rounded bg-slate-955 border border-slate-800 px-2.5 py-1.5 text-[10px] text-slate-355 font-sans shadow-md"
                >
                  Duplicate record
                  <Tooltip.Arrow className="fill-slate-800" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>

            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  onClick={() => onDeleteItem(item.id)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-red-505 transition cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  side="top"
                  className="z-50 rounded bg-slate-955 border border-slate-805 px-2.5 py-1.5 text-[10px] text-slate-355 font-sans shadow-md"
                >
                  {item.inTrash ? "Delete permanently" : "Move to Trash"}
                  <Tooltip.Arrow className="fill-slate-800" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>

            <button
              onClick={onClose}
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 font-mono text-[11px] cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Item summary label */}
        <div className={`p-3 shrink-0 ${theme === 'code-light' ? 'bg-[#eaeaea] border-b border-[#e4e4e7]' : theme === 'monokai' ? 'bg-[#1e1f1c] border-b border-[#3e3d32]' : 'bg-slate-950/60 border-b border-slate-800'}`}>
          <div className="font-mono text-[9px] text-sky-400 mb-1 flex items-center justify-between">
            <span>{ITEM_TYPE_LABELS[item.itemType]}</span>
            {item.inTrash && (
              <span className="text-red-400 font-semibold uppercase px-1 border border-red-500 rounded-xs text-[8px] tracking-wide animate-pulse">
                Trash Bin
              </span>
            )}
          </div>
          <h3 className={`font-semibold text-xs line-clamp-2 leading-snug ${theme === 'code-light' ? 'text-slate-900' : 'text-slate-100'}`}>
            {item.title || 'Untitled'}
          </h3>
        </div>

        {/* Tabs Panels Container */}
        <Tabs.Root value={activeTab} onValueChange={val => setActiveTab(val as any)} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <Tabs.List className={`flex border-b shrink-0 font-medium text-[10px] uppercase tracking-wide select-none ${
            theme === 'code-light' ? 'bg-[#ffffff] border-[#e4e4e7]' : theme === 'monokai' ? 'bg-[#1e1f1c] border-[#3e3d32]' : 'bg-slate-900 border-[#2b2b2b]'
          }`}>
            {(['info', 'notes', 'tags', 'attachments'] as const).map(tab => (
              <Tabs.Trigger
                key={tab}
                value={tab}
                className={`flex-1 py-1.5 text-center border-b-2 hover:text-slate-100 transition cursor-pointer outline-hidden ${
                  theme === 'code-light' 
                    ? 'data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:bg-slate-50 data-[state=inactive]:border-transparent data-[state=inactive]:text-slate-500 hover:text-slate-800' 
                    : theme === 'monokai' 
                    ? 'data-[state=active]:border-[#a6e22e] data-[state=active]:text-[#a6e22e] data-[state=active]:bg-[#272822] data-[state=inactive]:border-transparent data-[state=inactive]:text-[#75715e] hover:text-[#f8f8f2]' 
                    : 'data-[state=active]:border-blue-500 data-[state=active]:text-slate-100 data-[state=active]:bg-slate-950/40 data-[state=inactive]:border-transparent data-[state=inactive]:text-slate-400'
                }`}
              >
                {tab === 'info' && 'Details'}
                {tab === 'notes' && `Notes (${item.notes.length})`}
                {tab === 'tags' && `Tags (${item.tags.length})`}
                {tab === 'attachments' && `Files (${item.attachments.length})`}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <div className="flex-1 overflow-y-auto p-3.5 space-y-4 scrollbar-thin scrollbar-thumb-slate-800">
            {/* Details Tab */}
            {/* Details Tab */}
            <Tabs.Content value="info" className="space-y-4 outline-hidden select-text">
              {/* Item Type */}
              <div>
                <label className="block text-[10px] font-mono text-slate-550 mb-0.5">Item Type</label>
                <div className={`text-xs font-medium ${theme === 'code-light' ? 'text-slate-800' : 'text-slate-200'}`}>
                  {ITEM_TYPE_LABELS[item.itemType] || item.itemType}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-[10px] font-mono text-slate-550 mb-0.5">Title</label>
                <div className={`text-xs font-semibold leading-relaxed break-words ${theme === 'code-light' ? 'text-slate-900' : 'text-slate-100'}`}>
                  {item.title || 'Untitled'}
                </div>
              </div>

              {/* Citekey section with conflict alert */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-mono text-slate-550 mb-0.5">Citation Key</label>
                  {citekeyConflict && (
                    <span className="text-[9px] font-mono text-amber-400 bg-amber-500/10 px-1 border border-amber-500/20 rounded">
                      Conflict Detected!
                    </span>
                  )}
                </div>
                <div className={`font-mono text-xs ${citekeyConflict ? 'text-amber-400' : (theme === 'code-light' ? 'text-slate-800' : 'text-sky-400')}`}>
                  {item.citekey || '—'}
                </div>
              </div>

              {/* Creator / Authors Section */}
              <div>
                <label className="block text-[10px] font-mono text-slate-550 mb-0.5">Creators / Authors</label>
                <div className={`text-xs break-words ${theme === 'code-light' ? 'text-slate-800' : 'text-slate-200'}`}>
                  {creatorsText || '—'}
                </div>
              </div>

              {/* Standard Zotero bibliographic metadata boxes */}
              <div className={`space-y-3 border-t pt-3 ${theme === 'code-light' ? 'border-zinc-200' : theme === 'monokai' ? 'border-[#3e3d32]' : 'border-slate-800'}`}>
                <div>
                  <label className="block text-[10px] font-mono text-slate-550 mb-0.5">Publication Journal / Book</label>
                  <div className={`text-xs ${theme === 'code-light' ? 'text-slate-800' : 'text-slate-200'}`}>
                    {item.publicationTitle || '—'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-550 mb-0.5">Date / Year</label>
                    <div className={`text-xs ${theme === 'code-light' ? 'text-slate-800' : 'text-slate-200'}`}>
                      {item.date || '—'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-slate-550 mb-0.5">Pages</label>
                    <div className={`text-xs ${theme === 'code-light' ? 'text-slate-800' : 'text-slate-200'}`}>
                      {item.pages || '—'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-550 mb-0.5">Volume</label>
                    <div className={`text-xs ${theme === 'code-light' ? 'text-slate-800' : 'text-slate-200'}`}>
                      {item.volume || '—'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-slate-550 mb-0.5">Issue</label>
                    <div className={`text-xs ${theme === 'code-light' ? 'text-slate-800' : 'text-slate-200'}`}>
                      {item.issue || '—'}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-550 mb-0.5">DOI</label>
                  <div className={`font-mono text-[11px] break-all ${theme === 'code-light' ? 'text-slate-800' : 'text-slate-200'}`}>
                    {item.doi || '—'}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-550 mb-0.5">URL</label>
                  <div className={`text-xs break-all ${theme === 'code-light' ? 'text-sky-600' : 'text-sky-400'}`}>
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{item.url}</a>
                    ) : '—'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-550 mb-0.5">Publisher</label>
                    <div className={`text-xs ${theme === 'code-light' ? 'text-slate-800' : 'text-slate-200'}`}>
                      {item.publisher || '—'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-slate-550 mb-0.5">Place</label>
                    <div className={`text-xs ${theme === 'code-light' ? 'text-slate-800' : 'text-slate-200'}`}>
                      {item.place || '—'}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-550 mb-0.5">ISBN / ISSN</label>
                  <div className={`text-xs ${theme === 'code-light' ? 'text-slate-800' : 'text-slate-200'}`}>
                    {item.isbn || item.issn || '—'}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-550 mb-0.5">Language</label>
                  <div className={`text-xs ${theme === 'code-light' ? 'text-slate-800' : 'text-slate-200'}`}>
                    {item.language || '—'}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-550 mb-0.5">Abstract / Description Notes</label>
                  <div className={`text-xs leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto ${theme === 'code-light' ? 'text-slate-700' : 'text-slate-300'}`}>
                    {item.abstractNote || '—'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[9px] font-mono text-slate-650 pt-2 border-t border-slate-800">
                  <div>Added: {new Date(item.dateAdded).toLocaleDateString()}</div>
                  <div>Modified: {new Date(item.dateModified).toLocaleDateString()}</div>
                </div>
              </div>
            </Tabs.Content>

            {/* Notes Tab */}
            <Tabs.Content value="notes" className="space-y-4 outline-hidden select-text">
              {/* Note lists */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-mono text-slate-550 border-b border-slate-850 pb-1 uppercase tracking-wider">
                  Attached Notes ({item.notes.length})
                </h4>
                {item.notes.length === 0 ? (
                  <div className="text-center py-4 text-slate-550 text-[11px]">
                    No scholarly notes attached to this bibliography record.
                  </div>
                ) : (
                  item.notes.map(note => {
                    return (
                      <div key={note.id} className={`rounded-md border p-2.5 space-y-2 ${
                        theme === 'code-light' ? 'bg-white border-[#e4e4e7]' : theme === 'monokai' ? 'bg-[#1e1f1c] border-[#3e3d32]' : 'bg-slate-955 border-slate-800'
                      }`}>
                        <div>
                          <p className={`whitespace-pre-wrap leading-relaxed text-[11px] ${
                            theme === 'code-light' ? 'text-slate-700' : theme === 'monokai' ? 'text-[#f8f8f2]' : 'text-slate-200'
                          }`}>
                            {note.note}
                          </p>
                          <div className="flex items-center justify-between border-t border-slate-900/60 mt-2.5 pt-2 text-[9px] text-slate-550">
                            <span>Modified {new Date(note.dateModified).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Tabs.Content>
            {/* Tags Tab */}
            <Tabs.Content value="tags" className="space-y-4 outline-hidden select-text">
              {/* List */}
              <div className="space-y-2.5">
                <h4 className="text-[10px] font-mono text-slate-550 uppercase tracking-widest border-b border-slate-850 pb-1">
                  Document Tags ({item.tags.length})
                </h4>
                {item.tags.length === 0 ? (
                  <p className="text-slate-550 text-center py-4">No tagging indices established.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {item.tags.map(t => (
                      <span
                        key={t}
                        className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] ${
                          theme === 'code-light' 
                            ? 'border-blue-200 bg-blue-50 text-blue-650 font-medium' 
                            : theme === 'monokai' 
                            ? 'border-[#a6e22e]/30 bg-[#a6e22e]/5 text-[#a6e22e] font-medium' 
                            : 'border-blue-500/20 bg-blue-500/5 text-blue-300 font-medium'
                        }`}
                      >
                        <span>{t}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Tabs.Content>
 
            {/* Attachments Tab */}
            <Tabs.Content value="attachments" className="space-y-4 outline-hidden select-text">
              {/* PDF attachment listing */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-mono text-slate-550 border-b border-slate-850 pb-1 uppercase tracking-wider">
                  Files linked ({item.attachments.length})
                </h4>
                {item.attachments.length === 0 ? (
                  <div className="text-center py-6 border border-dashed border-slate-800 rounded-md text-slate-555 text-[10px] p-4 leading-relaxed">
                    No linked PDFs, datasets, or manuscript attachments.
                  </div>
                ) : (
                  item.attachments.map(a => (
                    <div key={a.id} className={`flex items-center justify-between rounded border p-2.5 ${
                      theme === 'code-light' ? 'bg-white border-[#e4e4e7]' : theme === 'monokai' ? 'bg-[#1e1f1c] border-[#3e3d32]' : 'bg-slate-950 border-slate-800'
                    }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-emerald-400 shrink-0" />
                        <div className="min-w-0">
                          <p className={`font-semibold truncate text-[11px] max-w-xs ${theme === 'code-light' ? 'text-slate-800' : 'text-slate-200'}`}>{a.title}</p>
                          <p className="text-[9px] text-slate-555 truncate font-mono uppercase mt-0.5">{a.mimeType}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setPdfReaderUrl(a.title)}
                          className="px-1.5 py-0.5 rounded bg-slate-805 hover:bg-slate-700 text-sky-400 text-[9px] font-mono cursor-pointer"
                        >
                          Read
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Tabs.Content>
          </div>
        </Tabs.Root>

        {/* Fullscreen PDF dialogue Modal */}
        <Dialog.Root open={!!pdfReaderUrl} onOpenChange={(open) => { if (!open) setPdfReaderUrl(null); }}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm animate-fade-in" />
            <Dialog.Content className="fixed inset-4 z-50 flex items-center justify-center font-sans focus:outline-hidden">
              <div className="w-full max-w-4xl h-[90vh] flex flex-col rounded-lg overflow-hidden border border-slate-800 bg-slate-955 text-slate-100 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between bg-slate-900 border-b border-slate-800 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-red-500" />
                    <span className="font-semibold text-xs text-slate-200 truncate max-w-lg">
                      {pdfReaderUrl} — Mock Academic PDF Viewer
                    </span>
                  </div>
                  <Dialog.Close asChild>
                    <button
                      className="p-1 px-2 bg-slate-805 hover:bg-slate-700 rounded text-slate-350 hover:text-slate-100 cursor-pointer outline-hidden text-[10px] font-semibold transition-colors"
                    >
                      ✕ Close Reader
                    </button>
                  </Dialog.Close>
                </div>

                {/* PDF content block */}
                <div className="flex-1 flex overflow-hidden">
                  <div className="flex-1 bg-slate-800 overflow-y-auto p-8 flex justify-center scrollbar-thin scrollbar-thumb-slate-900">
                    <div className="w-full max-w-2xl bg-white text-slate-800 shadow-2xl p-10 font-serif leading-relaxed text-xs space-y-6 relative rounded">
                      <div className="absolute top-2 right-4 font-mono text-[8px] text-slate-400 tracking-wider">
                        ZOTERO READER • OFFLINE CACHE
                      </div>

                      <h1 className="text-lg font-bold font-sans text-center text-slate-900 border-b border-slate-200 pb-3 leading-snug">
                        {item.title}
                      </h1>

                      <div className="text-[10px] text-center font-sans font-medium text-slate-650">
                        {item.creators.map(c => `${c.firstName} ${c.lastName}`).join(', ')} <br />
                        Published: {item.publicationTitle || 'Academic Archive'} ({item.date || 'N/A'})
                      </div>

                      <div className="border border-slate-200 rounded-sm bg-slate-50 p-4 font-sans text-[11px] leading-normal ml-4 mr-4 italic text-slate-600">
                        <span className="font-bold text-slate-800 block not-italic uppercase tracking-wider text-[9px] mb-1">
                          Abstract Note
                        </span>
                        {item.abstractNote || 'No abstract note was registered for this record.'}
                      </div>

                      <div className="space-y-4 text-slate-700">
                        <h2 className="text-sm font-bold font-sans text-slate-900">1. INTRODUCTION AND BACKGROUND</h2>
                        <p>
                          Modern computer linguistics and cognitive indexing depend heavily on efficient search systems.
                          This clone application emulates Zotero, the open-source reference management tool.
                          We extend the metadata storage to demonstrate live selectable column views, instant fuzzy queries,
                          and keyboard-focused command palettes to reduce researcher fatigue.
                        </p>
                        <p>
                          By wrapping structural database components in a reactive local layout, scientific documents can be quickly indexed, citation keys conflict-checked automatically, and researchers can toggle specific column layers (e.g. DOI, ISSN) to match their personal workflow requirements.
                        </p>
                        <p>
                          Furthermore, real-time citation formatters (e.g. BibTeX entries) are generated in the inspector to ease transcription into LaTeX packages.
                        </p>

                        <h2 className="text-sm font-bold font-sans text-slate-900">2. METHODOLOGY AND INTERACTIVE CAPABILITIES</h2>
                        <p>
                          This system implements partial tokenized matching. By executing fuzzy matching against all available fields, queries are automatically evaluated across author headers, abstract briefs, and note databases. This allows multi-field querying (e.g. finding a 2017 paper by Vaswani on translation) in a single unified entry block.
                        </p>
                        <p>
                          Additionally, the <code>Ctrl+P</code> command utility triggers direct command piping. Prefixing commands with the chevron symbol enables rapid terminal actions without breaking focus.
                        </p>
                      </div>

                      <div className="border-t border-slate-200 pt-3 mt-14 font-mono text-[8px] text-slate-400 text-center">
                        Page 1 of Simulated Article • DOI Indicator: {item.doi || 'N/A'}
                      </div>
                    </div>
                  </div>

                  {/* Reader sidebar annotator */}
                  <div className="w-64 bg-slate-900 border-l border-slate-800 p-3.5 space-y-3.5 text-[11px] shrink-0 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
                    <h4 className="font-semibold text-slate-400 border-b border-slate-800 pb-1 flex items-center gap-1.5 select-none">
                      <LayoutGrid className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Reader Annotations</span>
                    </h4>
                    <div className="space-y-2">
                      <div className="rounded bg-slate-950 p-2 border-l-2 border-emerald-500">
                        <p className="text-slate-350 italic">"This clone application emulates Zotero..."</p>
                        <span className="text-[9px] font-mono text-slate-600 block mt-1">Highlighted on Page 1</span>
                      </div>
                      <div className="rounded bg-slate-950 p-2 border-l-2 border-yellow-500">
                        <p className="text-slate-350 italic">"Ctrl+P command utility triggers direct piping..."</p>
                        <span className="text-[9px] font-mono text-slate-600 block mt-1">Highlighted on Page 1</span>
                      </div>
                    </div>
                    <div className="rounded p-2.5 border border-slate-805 bg-slate-950/40 text-slate-500 italic leading-snug">
                      Note: This reader generates interactive PDF content. You can write custom notes on the Notes tab to attach persistent study thoughts.
                    </div>
                  </div>
                </div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </Tooltip.Provider>
  );
}
