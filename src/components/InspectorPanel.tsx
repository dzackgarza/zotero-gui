import React, { useState } from 'react';
import {
  FileText, Info, Copy, ExternalLink
} from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { ZoteroItem, getItemTypeLabel, Creator } from '../types';
import type { AppTheme } from '../useThemePreference';

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

interface InspectorPanelProps {
  item: ZoteroItem | null;
  allItems: ZoteroItem[];
  onClose: () => void;
  theme: AppTheme;
}

export default function InspectorPanel({
  item,
  allItems,
  onClose,
  theme
}: InspectorPanelProps) {
  const [copied, setCopied] = useState(false);
  const [attachmentOpenError, setAttachmentOpenError] = useState<string | null>(null);

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

  // Compute read-only representations synchronously during render
  const creatorsText = serializeCreators(item.creators);
  const citekeyConflict = !!item.citekey && allItems.some(
    other => other.id !== item.id && other.citekey?.trim().toLowerCase() === item.citekey?.trim().toLowerCase()
  );

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

  const openAttachment = (attachmentId: string) => {
    setAttachmentOpenError(null);
    fetch(`/api/attachments/${encodeURIComponent(attachmentId)}/open`, { method: 'POST' })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Attachment open failed with HTTP ${response.status}`);
        }
      })
      .catch((error: Error) => setAttachmentOpenError(error.message));
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
            <span>{getItemTypeLabel(item.itemType)}</span>
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

        {/* Single Scrollable Container for All Metadata Sections */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-800 select-text">
          {/* Details Section */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-mono text-slate-550 border-b border-slate-850 pb-1.5 uppercase tracking-wider font-semibold">
              Details
            </h4>
            
            {/* Item Type */}
            <div>
              <label className="block text-[10px] font-mono text-slate-550 mb-0.5">Item Type</label>
              <div className={`text-xs font-medium ${theme === 'code-light' ? 'text-slate-800' : 'text-slate-200'}`}>
                {getItemTypeLabel(item.itemType)}
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
          </div>

          {/* Notes Section */}
          <div className="space-y-3 pt-2">
            <h4 className="text-[10px] font-mono text-slate-555 border-b border-slate-850 pb-1.5 uppercase tracking-wider font-semibold">
              Notes ({item.notes.length})
            </h4>
            {item.notes.length === 0 ? (
              <div className="text-center py-2 text-slate-550 text-[11px]">
                No scholarly notes attached to this record.
              </div>
            ) : (
              <div className="space-y-2.5">
                {item.notes.map(note => (
                  <article key={note.id} className={`rounded-md border p-2.5 space-y-2 ${
                    theme === 'code-light' ? 'bg-white border-[#e4e4e7]' : theme === 'monokai' ? 'bg-[#1e1f1c] border-[#3e3d32]' : 'bg-slate-955 border-slate-800'
                  }`}>
                    <div className="flex items-center justify-between text-[9px] font-mono text-slate-555 uppercase tracking-wide">
                      <span>Attached Note</span>
                      <span>{new Date(note.dateModified).toLocaleDateString()}</span>
                    </div>
                    <div className={`max-h-72 overflow-y-auto rounded border p-2 whitespace-pre-wrap leading-relaxed text-[11px] ${
                      theme === 'code-light'
                        ? 'border-zinc-200 bg-slate-50 text-slate-800'
                        : theme === 'monokai'
                          ? 'border-[#3e3d32] bg-[#272822] text-[#f8f8f2]'
                          : 'border-slate-850 bg-slate-950 text-slate-200'
                    }`}>
                      <p className={
                        theme === 'code-light' ? 'text-slate-700' : theme === 'monokai' ? 'text-[#f8f8f2]' : 'text-slate-200'
                      }>
                        {note.note}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          {/* Tags Section */}
          <div className="space-y-3 pt-2">
            <h4 className="text-[10px] font-mono text-slate-555 uppercase tracking-wider border-b border-slate-850 pb-1.5 font-semibold">
              Tags ({item.tags.length})
            </h4>
            {item.tags.length === 0 ? (
              <p className="text-slate-550 text-center py-2 text-[11px]">No tagging indices established.</p>
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

          {/* Attachments Section */}
          <div className="space-y-3 pt-2">
            <h4 className="text-[10px] font-mono text-slate-555 border-b border-slate-850 pb-1.5 uppercase tracking-wider font-semibold">
              Attachments ({item.attachments.length})
            </h4>
            {item.attachments.length === 0 ? (
              <div className="text-center py-4 border border-dashed border-slate-800 rounded-md text-slate-555 text-[10px] p-2">
                No linked files or datasets.
              </div>
            ) : (
              <div className="space-y-2">
                {attachmentOpenError && (
                  <div className="rounded border border-red-500/40 bg-red-950/30 px-2 py-1.5 text-[10px] font-mono text-red-300">
                    {attachmentOpenError}
                  </div>
                )}
                {item.attachments.map(a => (
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
                        onClick={() => openAttachment(a.id)}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-805 hover:bg-slate-700 text-sky-400 text-[9px] font-mono cursor-pointer"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Tooltip.Provider>
  );
}
