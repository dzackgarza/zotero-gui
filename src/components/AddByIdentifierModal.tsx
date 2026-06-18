import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Sparkles, Terminal, ChevronDown, Check } from 'lucide-react';
import { registry, MetadataResolverPlugin } from '../utils/resolvers';
import { parseBibTeXToItem } from '../utils/bibtexParser';
import { ZoteroItem } from '../types';

interface AddByIdentifierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddResolvedItem: (item: Partial<ZoteroItem>) => void;
  theme: string;
}

export default function AddByIdentifierModal({
  isOpen,
  onClose,
  onAddResolvedItem,
  theme
}: AddByIdentifierModalProps) {
  const [input, setInput] = useState('');
  const [selectedPluginId, setSelectedPluginId] = useState<string>('auto');
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedPlugin, setDetectedPlugin] = useState<MetadataResolverPlugin | null>(null);

  const plugins = registry.getAllPlugins();

  // Handle auto-detection
  useEffect(() => {
    if (selectedPluginId === 'auto') {
      const matches = registry.getMatchingPlugins(input);
      if (matches.length > 0) {
        setDetectedPlugin(matches[0]);
      } else {
        setDetectedPlugin(null);
      }
    } else {
      const plugin = registry.getPluginById(selectedPluginId);
      setDetectedPlugin(plugin || null);
    }
  }, [input, selectedPluginId]);

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = input.trim();
    if (!query) return;

    setResolving(true);
    setError(null);

    try {
      let bibtex = '';
      if (selectedPluginId === 'auto') {
        if (!detectedPlugin) {
          throw new Error('No matching resolver found for this input. Please select a specific plugin.');
        }
        bibtex = await detectedPlugin.resolve(query);
      } else {
        bibtex = await registry.resolveWithPlugin(selectedPluginId, query);
      }

      // Parse the BibTeX entry and validate schema
      const resolvedItem = parseBibTeXToItem(bibtex);
      onAddResolvedItem(resolvedItem);
      setInput('');
      setSelectedPluginId('auto');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to resolve and parse identifier.');
    } finally {
      setResolving(false);
    }
  };

  const isLight = theme === 'code-light';
  const isMonokai = theme === 'monokai';

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) { setInput(''); setError(null); setSelectedPluginId('auto'); onClose(); } }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs animate-fade-in" />
        <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4 focus:outline-hidden">
          <div className={`w-full max-w-md rounded-lg border p-4 shadow-2xl space-y-4 animate-scale-up ${
            isLight ? 'bg-white border-zinc-200 text-slate-800' : isMonokai ? 'bg-[#1e1f1c] border-[#3e3d32] text-[#f8f8f2] font-mono' : 'bg-slate-900 border-slate-800 text-slate-100'
          }`}>
            <Dialog.Title className="text-sm font-semibold flex items-center gap-2 select-none">
              <Sparkles className="h-4 w-4 text-sky-400 shrink-0" />
              <span>Add Item by Identifier</span>
            </Dialog.Title>
            
            <Dialog.Description className={`text-[11px] leading-relaxed ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Enter an identifier (DOI, ISBN, arXiv ID, zbMATH key, or MathSciNet link). The input will be resolved into a BibTeX entry and parsed semantically.
            </Dialog.Description>

            <form onSubmit={handleResolve} className="space-y-3">
              {/* Plugin Selector */}
              <div className="space-y-1">
                <label className={`text-[10px] uppercase tracking-wider font-semibold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  Resolver Plugin
                </label>
                <div className="relative">
                  <select
                    value={selectedPluginId}
                    onChange={e => setSelectedPluginId(e.target.value)}
                    className={`w-full appearance-none rounded border px-3 py-1.5 text-xs focus:outline-hidden cursor-pointer ${
                      isLight 
                        ? 'border-zinc-200 bg-white text-slate-850 focus:border-blue-600' 
                        : isMonokai 
                        ? 'border-[#3e3d32] bg-[#272822] text-[#f8f8f2] focus:border-[#a6e22e]' 
                        : 'border-slate-800 bg-slate-950 text-slate-100 focus:border-sky-500'
                    }`}
                  >
                    <option value="auto">Auto-detect Plugin</option>
                    {plugins.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-2.5 h-3.5 w-3.5 pointer-events-none opacity-60" />
                </div>
              </div>

              {/* Identifier Input */}
              <div className="space-y-1">
                <label className={`text-[10px] uppercase tracking-wider font-semibold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  Identifier / URL
                </label>
                <input
                  type="text"
                  required
                  value={input}
                  disabled={resolving}
                  onChange={e => setInput(e.target.value)}
                  placeholder={
                    selectedPluginId === 'doi' ? 'e.g., 10.1145/3318464.3389700' :
                    selectedPluginId === 'isbn' ? 'e.g., 9780262033848' :
                    selectedPluginId === 'arxiv' ? 'e.g., arXiv:1706.03762' :
                    selectedPluginId === 'zbmath' ? 'e.g., 1234.56789' :
                    selectedPluginId === 'mathscinet' ? 'e.g., 2050123' :
                    'e.g., DOI, ISBN, arXiv ID, zbMATH, or MathSciNet Link'
                  }
                  className={`w-full rounded border px-3 py-2 text-xs focus:outline-hidden ${
                    isLight 
                      ? 'border-zinc-200 bg-white text-slate-850 focus:border-blue-600' 
                      : isMonokai 
                      ? 'border-[#3e3d32] bg-[#272822] text-[#f8f8f2] focus:border-[#a6e22e]' 
                      : 'border-slate-800 bg-slate-950 text-slate-100 focus:border-sky-500'
                  }`}
                />
              </div>

              {/* Match Indicator */}
              {selectedPluginId === 'auto' && input.trim() && (
                <div className={`text-[10px] flex items-center gap-1 ${detectedPlugin ? 'text-emerald-550 dark:text-emerald-400' : 'text-amber-550 dark:text-amber-400'}`}>
                  {detectedPlugin ? (
                    <>
                      <Check className="h-3 w-3 shrink-0" />
                      <span>Auto-detected: <strong>{detectedPlugin.name}</strong></span>
                    </>
                  ) : (
                    <span>No auto-detected plugin. Select one above manually or check input formatting.</span>
                  )}
                </div>
              )}

              {error && (
                <div className="rounded bg-red-500/10 border border-red-500/20 p-2.5 text-[10px] text-red-400 flex items-start gap-1.5 leading-normal font-mono">
                  <Terminal className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 text-xs pt-1.5 select-none">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    disabled={resolving}
                    className={`px-3 py-1.5 rounded-sm hover:bg-slate-800 hover:text-slate-100 cursor-pointer ${
                      isLight ? 'hover:bg-slate-100 text-slate-500' : isMonokai ? 'text-[#75715e] hover:bg-[#3e3d32]' : 'text-slate-400'
                    }`}
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={resolving || !input.trim() || (selectedPluginId === 'auto' && !detectedPlugin)}
                  className={`px-4 py-1.5 bg-blue-600 hover:bg-blue-500 font-semibold text-white rounded-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:hover:bg-blue-600 disabled:cursor-not-allowed`}
                >
                  {resolving ? 'Resolving...' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
