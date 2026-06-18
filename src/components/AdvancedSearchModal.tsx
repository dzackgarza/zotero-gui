import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Filter, X, Sliders, CheckSquare, Square, Info } from 'lucide-react';
import { AdvancedSearchSettings, ZoteroItem } from '../types';
import { filterZoteroItems } from '../utils/fuzzy';

interface AdvancedSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AdvancedSearchSettings;
  onChangeSettings: (settings: AdvancedSearchSettings) => void;
  allItems: ZoteroItem[];
}

export default function AdvancedSearchModal({
  isOpen,
  onClose,
  settings,
  onChangeSettings,
  allItems
}: AdvancedSearchModalProps) {

  // Toggle dynamic fields
  const handleToggleField = (field: keyof AdvancedSearchSettings['searchFields']) => {
    onChangeSettings({
      ...settings,
      searchFields: {
        ...settings.searchFields,
        [field]: !settings.searchFields[field]
      }
    });
  };

  const setPreset = (preset: 'all' | 'author_title' | 'citation_indices') => {
    const updated = { ...settings.searchFields };
    if (preset === 'all') {
      Object.keys(updated).forEach(k => {
        (updated as any)[k] = true;
      });
    } else if (preset === 'author_title') {
      Object.keys(updated).forEach(k => {
        (updated as any)[k] = false;
      });
      updated.title = true;
      updated.authors = true;
    } else if (preset === 'citation_indices') {
      Object.keys(updated).forEach(k => {
        (updated as any)[k] = false;
      });
      updated.title = true;
      updated.doi = true;
      updated.year = true;
    }
    onChangeSettings({ ...settings, searchFields: updated });
  };

  // Preview total matches
  const matchingItems = filterZoteroItems(allItems, settings);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs font-sans">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-md overflow-hidden rounded-lg border border-slate-700/60 bg-slate-900 text-slate-100 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3">
              <div className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-sky-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Advanced Filters Scopes
                </span>
              </div>
              <button
                onClick={onClose}
                className="rounded-sm p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content Area */}
            <div className="space-y-4 p-4 text-xs">
              
              {/* Query Mirror */}
              <div>
                <label className="block font-semibold text-slate-400 mb-1">
                  Active Query String
                </label>
                <div className="flex items-center gap-1.5 rounded-sm border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-200">
                  <span className="font-mono text-xs">{settings.query ? `"${settings.query}"` : 'None (displays all entries)'}</span>
                </div>
              </div>

              {/* Match Options */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-400 mb-1.5">
                    Match Case
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-slate-100">
                    <input
                      type="checkbox"
                      checked={settings.matchCase}
                      onChange={e => onChangeSettings({ ...settings, matchCase: e.target.checked })}
                      className="rounded border-slate-800 bg-slate-950 text-sky-600 focus:ring-0"
                    />
                    <span>Case Sensitive</span>
                  </label>
                </div>

                <div>
                  <label className="block font-semibold text-slate-400 mb-1.5">
                    Match Criterion
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onChangeSettings({ ...settings, matchType: 'all' })}
                      className={`px-2 py-1 rounded-sm border text-[10px] ${
                        settings.matchType === 'all'
                          ? 'bg-sky-600/20 border-sky-500 text-sky-400'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      AND (All Terms)
                    </button>
                    <button
                      onClick={() => onChangeSettings({ ...settings, matchType: 'any' })}
                      className={`px-2 py-1 rounded-sm border text-[10px] ${
                        settings.matchType === 'any'
                          ? 'bg-sky-600/20 border-sky-500 text-sky-400'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      OR (Any Word)
                    </button>
                  </div>
                </div>
              </div>

              {/* Scoped fields selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-semibold text-slate-400">
                    Search Targets
                  </label>
                  <div className="flex gap-2 text-[9px]">
                    <button
                      onClick={() => setPreset('all')}
                      className="text-sky-400 hover:underline"
                    >
                      All Fields
                    </button>
                    <span className="text-slate-600">|</span>
                    <button
                      onClick={() => setPreset('author_title')}
                      className="text-sky-400 hover:underline"
                    >
                      Title & Author Only
                    </button>
                    <span className="text-slate-600">|</span>
                    <button
                      onClick={() => setPreset('citation_indices')}
                      className="text-sky-400 hover:underline"
                    >
                      DOI & Year Only
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-sm border border-slate-800/80 bg-slate-950/40 p-3">
                  {(Object.keys(settings.searchFields) as Array<keyof AdvancedSearchSettings['searchFields']>).map(
                    field => (
                      <label
                        key={field}
                        className="flex items-center gap-2 cursor-pointer select-none text-slate-300 hover:text-slate-100"
                      >
                        <input
                          type="checkbox"
                          checked={settings.searchFields[field]}
                          onChange={() => handleToggleField(field)}
                          className="rounded border-slate-800 bg-slate-950 text-sky-600 focus:ring-0"
                        />
                        <span className="capitalize">{field === 'year' ? 'Date/Year' : field === 'doi' ? 'DOI' : field}</span>
                      </label>
                    )
                  )}
                </div>
              </div>

              {/* Preview Matching Metrics */}
              <div className="flex items-center gap-2.5 rounded-sm bg-slate-950 px-3 py-2 border-l-2 border-blue-500">
                <Info className="h-4 w-4 text-blue-400 shrink-0" />
                <div className="text-[11px] text-slate-400">
                  Search returns <strong className="text-slate-100">{matchingItems.length}</strong> of{' '}
                  <strong className="text-slate-100">{allItems.length}</strong> database documents.
                </div>
              </div>
            </div>

            {/* Footer triggers */}
            <div className="flex justify-end gap-2 border-t border-slate-800 bg-slate-950 px-4 py-3">
              <button
                onClick={onClose}
                className="rounded-sm bg-blue-600 px-4 py-1.5 font-medium text-white hover:bg-blue-500 hover:shadow-md transition-all text-xs"
              >
                Apply & Save Scopes
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
