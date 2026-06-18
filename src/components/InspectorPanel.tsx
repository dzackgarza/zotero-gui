import React, { useState, useEffect } from 'react';
import {
  FileText, Link, Clipboard, UserPlus, Trash, Plus, FileSpreadsheet,
  Info, Tag, Paperclip, Share2, Copy, Trash2, Calendar, LayoutGrid
} from 'lucide-react';
import { ZoteroItem, ItemType, ITEM_TYPE_LABELS, Creator } from '../types';

interface InspectorPanelProps {
  item: ZoteroItem | null;
  allItems: ZoteroItem[];
  onUpdateItem: (item: ZoteroItem) => void;
  onDeleteItem: (id: string) => void;
  onDuplicateItem: (id: string) => void;
  onClose: () => void;
}

export default function InspectorPanel({
  item,
  allItems,
  onUpdateItem,
  onDeleteItem,
  onDuplicateItem,
  onClose
}: InspectorPanelProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'notes' | 'tags' | 'attachments'>('info');
  const [copied, setCopied] = useState(false);
  const [citekeyConflict, setCitekeyConflict] = useState(false);

  // Notes state
  const [newNoteText, setNewNoteText] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  // Attachments state
  const [newAttachTitle, setNewAttachTitle] = useState('');
  const [pdfReaderUrl, setPdfReaderUrl] = useState<string | null>(null);

  // New Tag state
  const [newTag, setNewTag] = useState('');

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
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-slate-500 font-sans border-l border-slate-800 bg-slate-900/60 select-none">
        <FileText className="h-10 w-10 text-slate-700 mb-2.5 animate-pulse" />
        <p className="text-xs font-semibold text-slate-400">No Item Selected</p>
        <p className="text-[10px] text-slate-500 leading-normal text-center mt-1 max-w-xs">
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

  // Creators/Authors management
  const handleCreatorChange = (index: number, field: keyof Creator, value: string) => {
    const updatedCreators = [...item.creators];
    updatedCreators[index] = {
      ...updatedCreators[index],
      [field]: value
    };
    handleFieldChange('creators', updatedCreators);
  };

  const addCreator = () => {
    const updatedCreators = [
      ...item.creators,
      { firstName: '', lastName: '', creatorType: 'author' as const }
    ];
    handleFieldChange('creators', updatedCreators);
  };

  const removeCreator = (index: number) => {
    const updatedCreators = item.creators.filter((_, i) => i !== index);
    handleFieldChange('creators', updatedCreators);
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
    <div className="h-full flex flex-col bg-slate-900 border-l border-slate-800 text-xs font-sans">
      
      {/* Title / Close pane */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-3 py-2 shrink-0">
        <span className="font-semibold text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5 text-blue-400" />
          <span>Item Inspector</span>
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={copyBibtex}
            title="Generate BibTeX citation"
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-sky-400 transition"
          >
            {copied ? (
              <span className="text-[10px] text-green-400 font-mono">Copied!</span>
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={() => onDuplicateItem(item.id)}
            title="Duplicate record"
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-yellow-400 transition"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDeleteItem(item.id)}
            title={item.inTrash ? "Delete permanently" : "Move to Trash"}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-red-500 transition"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 font-mono text-[11px]"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Item summary label */}
      <div className="bg-slate-950/60 p-3 border-b border-slate-800 shrink-0">
        <div className="font-mono text-[9px] text-sky-400 mb-1 flex items-center justify-between">
          <span>{ITEM_TYPE_LABELS[item.itemType]}</span>
          {item.inTrash && (
            <span className="text-red-400 font-semibold uppercase px-1 border border-red-500 rounded-xs text-[8px] tracking-wide animate-pulse">
              Trash Bin
            </span>
          )}
        </div>
        <h3 className="font-semibold text-slate-100 text-xs line-clamp-2 leading-snug">
          {item.title || 'Untitled'}
        </h3>
      </div>

      {/* Selector Tabs */}
      <div className="flex border-b border-slate-850 bg-slate-900 shrink-0 font-medium text-[10px] uppercase tracking-wide">
        {(['info', 'notes', 'tags', 'attachments'] as const).map(tab => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 text-center border-b-2 hover:text-slate-100 transition ${
                isActive
                  ? 'border-blue-500 text-slate-100 bg-slate-950/40'
                  : 'border-transparent text-slate-400'
              }`}
            >
              {tab === 'info' && 'Details'}
              {tab === 'notes' && `Notes (${item.notes.length})`}
              {tab === 'tags' && `Tags (${item.tags.length})`}
              {tab === 'attachments' && `Files (${item.attachments.length})`}
            </button>
          );
        })}
      </div>

      {/* Active Tab Panel Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4 scrollbar-thin scrollbar-thumb-slate-800">
        {activeTab === 'info' && (
          <div className="space-y-3">
            {/* Item type change */}
            <div>
              <label className="block text-[10px] font-mono text-slate-500 mb-1">Item Type</label>
              <select
                value={item.itemType}
                onChange={e => handleFieldChange('itemType', e.target.value as ItemType)}
                className="w-full rounded border border-slate-800 bg-slate-950 text-slate-300 py-1 px-1.5 focus:border-blue-600 focus:outline-hidden"
              >
                {(Object.keys(ITEM_TYPE_LABELS) as ItemType[]).map(key => (
                  <option key={key} value={key}>
                    {ITEM_TYPE_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>

            {/* Core Text Input helper */}
            <div>
              <label className="block text-[10px] font-mono text-slate-500 mb-1">Title</label>
              <textarea
                value={item.title}
                onChange={e => handleFieldChange('title', e.target.value)}
                rows={2}
                className="w-full text-xs font-semibold rounded border border-slate-800 bg-slate-950 text-slate-100 py-1 px-2 focus:border-blue-600 focus:outline-hidden resize-none leading-normal"
              />
            </div>

            {/* Citekey section with conflict alert */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono text-slate-500">Citation Key</label>
                {citekeyConflict && (
                  <span className="text-[9px] font-mono text-amber-400 bg-amber-500/10 px-1 border border-amber-500/20 rounded animate-pulse">
                    Conflict Detected!
                  </span>
                )}
              </div>
              <input
                type="text"
                value={item.citekey || ''}
                onChange={e => handleFieldChange('citekey', e.target.value)}
                placeholder="e.g. author_title_year"
                className={`w-full rounded border font-mono text-[11px] py-1 px-1.5 bg-slate-950 focus:outline-hidden focus:border-blue-600 ${
                  citekeyConflict ? 'border-amber-500 text-amber-300' : 'border-slate-800 text-slate-300'
                }`}
              />
            </div>

            {/* Creator / Authors Section */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-mono text-slate-500">Creators / Authors</label>
                <button
                  type="button"
                  onClick={addCreator}
                  className="p-1 px-2 rounded-sm bg-slate-800/80 hover:bg-slate-855 text-sky-400 hover:text-sky-305 flex items-center gap-1 text-[9px] font-mono leading-none"
                >
                  <UserPlus className="h-3 w-3" />
                  <span>Add Author</span>
                </button>
              </div>

              <div className="space-y-2">
                {item.creators.map((creator, index) => (
                  <div key={index} className="flex items-center gap-1.5 rounded bg-slate-950/40 p-1.5 border border-slate-850/50">
                    <input
                      type="text"
                      value={creator.lastName}
                      onChange={e => handleCreatorChange(index, 'lastName', e.target.value)}
                      placeholder="Last Name"
                      className="flex-1 rounded border border-slate-850 bg-slate-950 text-slate-100 py-1 px-1.5 min-w-0"
                    />
                    <input
                      type="text"
                      value={creator.firstName}
                      onChange={e => handleCreatorChange(index, 'firstName', e.target.value)}
                      placeholder="First Name"
                      className="flex-1 rounded border border-slate-850 bg-slate-950 text-slate-100 py-1 px-1.5 min-w-0"
                    />
                    <select
                      value={creator.creatorType}
                      onChange={e => handleCreatorChange(index, 'creatorType', e.target.value as any)}
                      className="rounded border border-slate-850 bg-slate-950 text-slate-400 py-1 text-[10px] min-w-0 font-sans"
                    >
                      <option value="author">Author</option>
                      <option value="editor">Editor</option>
                      <option value="translator">Translator</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => removeCreator(index)}
                      className="p-1 text-slate-500 hover:text-red-400"
                    >
                      <Trash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Standard Zotero bibliographic metadata boxes */}
            <div className="space-y-2 border-t border-slate-800 pt-3">
              <div>
                <label className="block text-[10px] font-mono text-slate-500 mb-0.5">Publication Journal / Book</label>
                <input
                  type="text"
                  value={item.publicationTitle || ''}
                  onChange={e => handleFieldChange('publicationTitle', e.target.value)}
                  className="w-full rounded border border-slate-800 bg-slate-950 text-slate-300 py-1 px-1.5 focus:border-blue-600 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-mono text-slate-500 mb-0.5">Date / Year</label>
                  <input
                    type="text"
                    value={item.date || ''}
                    onChange={e => handleFieldChange('date', e.target.value)}
                    className="w-full rounded border border-slate-800 bg-slate-950 text-slate-300 py-1 px-1.5 focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-500 mb-0.5">Pages</label>
                  <input
                    type="text"
                    value={item.pages || ''}
                    onChange={e => handleFieldChange('pages', e.target.value)}
                    placeholder="e.g. 10-25"
                    className="w-full rounded border border-slate-800 bg-slate-950 text-slate-300 py-1 px-1.5 focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-mono text-slate-500 mb-0.5">Volume</label>
                  <input
                    type="text"
                    value={item.volume || ''}
                    onChange={e => handleFieldChange('volume', e.target.value)}
                    className="w-full rounded border border-slate-800 bg-slate-950 text-slate-300 py-1 px-1.5 focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-500 mb-0.5">Issue</label>
                  <input
                    type="text"
                    value={item.issue || ''}
                    onChange={e => handleFieldChange('issue', e.target.value)}
                    className="w-full rounded border border-slate-800 bg-slate-950 text-slate-300 py-1 px-1.5 focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-500 mb-0.5">DOI</label>
                <input
                  type="text"
                  value={item.doi || ''}
                  onChange={e => handleFieldChange('doi', e.target.value)}
                  placeholder="e.g. 10.1000/xyz123"
                  className="w-full rounded border border-slate-800 bg-slate-950 text-slate-300 py-1 px-1.5 focus:border-blue-600 focus:outline-hidden font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-500 mb-0.5">URL</label>
                <input
                  type="text"
                  value={item.url || ''}
                  onChange={e => handleFieldChange('url', e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded border border-slate-800 bg-slate-950 text-slate-300 py-1 px-1.5 focus:border-blue-600 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-mono text-slate-500 mb-0.5">Publisher</label>
                  <input
                    type="text"
                    value={item.publisher || ''}
                    onChange={e => handleFieldChange('publisher', e.target.value)}
                    className="w-full rounded border border-slate-800 bg-slate-950 text-slate-300 py-1 px-1.5 focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-500 mb-0.5">Place</label>
                  <input
                    type="text"
                    value={item.place || ''}
                    onChange={e => handleFieldChange('place', e.target.value)}
                    className="w-full rounded border border-slate-800 bg-slate-950 text-slate-300 py-1 px-1.5 focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-500 mb-0.5">ISBN / ISSN</label>
                <input
                  type="text"
                  value={item.isbn || item.issn || ''}
                  onChange={e => handleFieldChange('isbn', e.target.value)}
                  className="w-full rounded border border-slate-800 bg-slate-950 text-slate-300 py-1 px-1.5 focus:border-blue-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-500 mb-0.5">Language</label>
                <input
                  type="text"
                  value={item.language || ''}
                  onChange={e => handleFieldChange('language', e.target.value)}
                  className="w-full rounded border border-slate-800 bg-slate-950 text-slate-300 py-1 px-1.5 focus:border-blue-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-500 mb-0.5">Abstract / Description Notes</label>
                <textarea
                  value={item.abstractNote || ''}
                  onChange={e => handleFieldChange('abstractNote', e.target.value)}
                  rows={4}
                  className="w-full rounded border border-slate-800 bg-slate-950 text-slate-300 py-1 px-2 focus:border-blue-600 focus:outline-hidden leading-normal text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-[9px] font-mono text-slate-600 pt-2 border-t border-slate-850">
                <div>Added: {new Date(item.dateAdded).toLocaleDateString()}</div>
                <div>Modified: {new Date(item.dateModified).toLocaleDateString()}</div>
              </div>
            </div>
          </div>
        )}

        {/* Notes Tab */}
        {activeTab === 'notes' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="block text-[10px] font-semibold text-slate-400">Add Bibliographical Note</label>
              <div className="space-y-2">
                <textarea
                  value={newNoteText}
                  onChange={e => setNewNoteText(e.target.value)}
                  placeholder="Record summary details, qualitative takeaways, experimental outcomes, or literature quotes..."
                  rows={3}
                  className="w-full rounded border border-slate-800 bg-slate-950 text-slate-200 py-1.5 px-2 focus:border-blue-600 focus:outline-hidden leading-normal text-xs"
                />
                <button
                  type="button"
                  onClick={handleAddNote}
                  className="w-full py-1.5 rounded bg-blue-600 hover:bg-blue-500 font-semibold text-white flex items-center justify-center gap-1 shadow-sm text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Attach New Note</span>
                </button>
              </div>
            </div>

            {/* Note lists */}
            <div className="space-y-3 pt-2">
              <h4 className="text-[10px] font-mono text-slate-500 border-b border-slate-850 pb-1 uppercase tracking-wider">
                Attached Notes ({item.notes.length})
              </h4>
              {item.notes.length === 0 ? (
                <div className="text-center py-4 text-slate-500 text-[11px]">
                  No scholarly notes attached to this bibliography record.
                </div>
              ) : (
                item.notes.map(note => {
                  const isEditing = editingNoteId === note.id;
                  return (
                    <div key={note.id} className="rounded-md border border-slate-800 bg-slate-950 p-2.5 space-y-2">
                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={editingNoteText}
                            onChange={e => setEditingNoteText(e.target.value)}
                            rows={3}
                            className="w-full rounded border border-slate-800 bg-slate-900 text-slate-100 p-1.5 text-xs focus:ring-0 focus:outline-hidden leading-normal"
                          />
                          <div className="flex justify-end gap-1.5 text-[10px]">
                            <button
                              onClick={() => setEditingNoteId(null)}
                              className="px-2 py-1 text-slate-400 hover:text-slate-100"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSaveEditNote(note.id)}
                              className="px-2.5 py-1 text-white bg-blue-600 hover:bg-blue-500 rounded-sm"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-slate-200 whitespace-pre-wrap leading-relaxed text-[11px]">
                            {note.note}
                          </p>
                          <div className="flex items-center justify-between border-t border-slate-900/60 mt-2.5 pt-2 text-[9px] text-slate-550">
                            <span>Modified {new Date(note.dateModified).toLocaleDateString()}</span>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => handleStartEditNote(note.id, note.note)}
                                className="text-sky-400 hover:underline"
                              >
                                Edit
                              </button>
                              <span className="text-slate-800">|</span>
                              <button
                                onClick={() => handleDeleteNote(note.id)}
                                className="text-red-400 hover:underline"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tags Tab */}
        {activeTab === 'tags' && (
          <div className="space-y-4 font-sans text-xs">
            {/* Form */}
            <form onSubmit={handleAddTag} className="space-y-1.5">
              <label className="block text-[10px] font-semibold text-slate-400">Add Index Tag</label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  placeholder="e.g. CRISPR, Transformer, NLP..."
                  className="flex-1 rounded border border-slate-800 bg-slate-950 text-slate-100 py-1 px-1.5"
                />
                <button
                  type="submit"
                  className="px-2.5 bg-blue-600 hover:bg-sky-500 text-white rounded shrink-0"
                >
                  Add
                </button>
              </div>
            </form>

            {/* List */}
            <div className="space-y-2.5">
              <h4 className="text-[10px] font-mono text-slate-500 uppercase tracking-widest border-b border-slate-850 pb-1">
                Document Tags ({item.tags.length})
              </h4>
              {item.tags.length === 0 ? (
                <p className="text-slate-500 text-center py-4">No tagging indices established.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {item.tags.map(t => (
                    <span
                      key={t}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-blue-500/20 bg-blue-500/5 text-blue-300 font-medium text-[10px]"
                    >
                      <span>{t}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(t)}
                        className="p-0.5 text-blue-500 hover:text-red-400 shrink-0 font-bold"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Attachments Tab */}
        {activeTab === 'attachments' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-semibold text-slate-400">Link File Attachment</label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newAttachTitle}
                  onChange={e => setNewAttachTitle(e.target.value)}
                  placeholder="e.g. vaswani_supplementary_2017.pdf"
                  className="flex-1 rounded border border-slate-800 bg-slate-900 text-slate-200 py-1 px-1.5 text-xs focus:ring-0 focus:outline-hidden"
                />
                <button
                  onClick={handleAddAttachment}
                  className="px-3 bg-blue-600 hover:bg-blue-550 text-white rounded font-semibold text-xs py-1"
                >
                  Link
                </button>
              </div>
            </div>

            {/* PDF attachment listing */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-mono text-slate-500 border-b border-slate-850 pb-1 uppercase tracking-wider">
                Files linked ({item.attachments.length})
              </h4>
              {item.attachments.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-slate-800 rounded-md text-slate-500 text-[10px] p-4">
                  No linked PDFs, datasets, or manuscript attachments. Click link to index local materials.
                </div>
              ) : (
                item.attachments.map(a => (
                  <div key={a.id} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950 p-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-emerald-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-200 truncate text-[11px] max-w-xs">{a.title}</p>
                        <p className="text-[9px] text-slate-550 truncate font-mono uppercase mt-0.5">{a.mimeType}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setPdfReaderUrl(a.title)}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-400 text-[9px] font-mono"
                      >
                        Read
                      </button>
                      <button
                        onClick={() => handleDeleteAttachment(a.id)}
                        className="text-slate-500 hover:text-red-400 p-0.5"
                      >
                        <Trash className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* PDF file mock reader overlay popup modal */}
      {pdfReaderUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 font-sans animate-fade-in">
          <div className="w-full max-w-4xl h-[90vh] flex flex-col rounded-lg overflow-hidden border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between bg-slate-900 border-b border-slate-800 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-red-500" />
                <span className="font-semibold text-xs text-slate-200 truncate max-w-lg">
                  {pdfReaderUrl} — Mock Academic PDF Viewer
                </span>
              </div>
              <button
                onClick={() => setPdfReaderUrl(null)}
                className="p-1 rounded text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              >
                ✕ Close Reader
              </button>
            </div>

            {/* PDF Book Area */}
            <div className="flex-1 flex overflow-hidden">
              {/* Paper page simulated design */}
              <div className="flex-1 bg-slate-800 overflow-y-auto p-8 flex justify-center">
                <div className="w-full max-w-2xl bg-white text-slate-800 shadow-2xl p-10 font-serif leading-relaxed text-xs space-y-6 relative rounded">
                  {/* Watermark/Markings list */}
                  <div className="absolute top-2 right-4 font-mono text-[8px] text-slate-400 tracking-wider">
                    ZOTERO READER • OFFLINE CACHE
                  </div>

                  <h1 className="text-lg font-bold font-sans text-center text-slate-900 border-b border-slate-200 pb-3">
                    {item.title}
                  </h1>

                  <div className="text-[10px] text-center font-sans font-medium text-slate-600">
                    {item.creators.map(c => `${c.firstName} ${c.lastName}`).join(', ')} <br />
                    Published: {item.publicationTitle || 'Academic Archive'} ({item.date || 'N/A'})
                  </div>

                  <div className="border border-slate-200 rounded-sm bg-slate-50 p-4 font-sans text-[11px] leading-normal ml-4 mr-4 italic">
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
                      By wrapping structural database components in an reactive local layout, scientific documents can be quickly indexed, citation keys conflict-checked automatically, and researchers can toggle specific column layers (e.g. DOI, ISSN) to match their personal workflow requirements.
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
                    Page 1 of {item.pages ? 'Simulated Article' : '1'} • DOI Indicator: {item.doi || 'N/A'}
                  </div>
                </div>
              </div>

              {/* Reader annotations sidebar */}
              <div className="w-64 bg-slate-900 border-l border-slate-800 p-3.5 space-y-3.5 text-[11px]">
                <h4 className="font-semibold text-slate-400 border-b border-slate-800 pb-1 flex items-center gap-1.5">
                  <LayoutGrid className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Reader Annotations</span>
                </h4>
                <div className="space-y-2">
                  <div className="rounded bg-slate-950 p-2 border-l-2 border-emerald-500">
                    <p className="text-slate-300 italic">"This clone application emulates Zotero..."</p>
                    <span className="text-[9px] font-mono text-slate-500 block mt-1">Highlighted on Page 1</span>
                  </div>
                  <div className="rounded bg-slate-950 p-2 border-l-2 border-yellow-500">
                    <p className="text-slate-300 italic">"Ctrl+P command utility triggers direct piping..."</p>
                    <span className="text-[9px] font-mono text-slate-500 block mt-1">Highlighted on Page 1</span>
                  </div>
                </div>
                <div className="rounded p-2 border border-slate-805 bg-slate-950/40 text-slate-400 italic leading-snug">
                  Note: This reader generates interactive PDF content. You can write custom notes on the Notes tab to attach persistent study thoughts.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
