import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Sparkles, Terminal, ChevronDown } from 'lucide-react';

interface ResolverPluginMetadata {
  id: string;
  name: string;
}

interface AddByIdentifierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddResolvedItem: () => void;
  collections: string[];
  theme: string;
}

export default function AddByIdentifierModal({
  isOpen,
  onClose,
  onAddResolvedItem,
  collections,
  theme
}: AddByIdentifierModalProps) {
  const [input, setInput] = useState('');
  const [selectedPluginId, setSelectedPluginId] = useState<string>('');
  const [plugins, setPlugins] = useState<ResolverPluginMetadata[]>([]);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function invariant(condition: unknown, message: string): asserts condition {
    if (!condition) {
      throw new Error(message);
    }
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    fetch('/api/resolver-plugins')
      .then(response => {
        invariant(response.ok, `Resolver plugin list failed with HTTP ${response.status}`);
        return response.json();
      })
      .then((metadata: ResolverPluginMetadata[]) => {
        setPlugins(metadata);
      });
  }, [isOpen]);

  const handleResolve = (e: React.FormEvent) => {
    e.preventDefault();
    const query = input.trim();

    setResolving(true);
    setError(null);

    fetch('/api/items/from-source', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        resolverId: selectedPluginId,
        input: query,
        collections,
      }),
    })
      .then(async response => {
        if (!response.ok) {
          throw new Error(`Resolver ingestion failed with HTTP ${response.status}: ${await response.text()}`);
        }
        return response.json();
      })
      .then(() => {
        onAddResolvedItem();
        setInput('');
        setSelectedPluginId('');
        onClose();
      })
      .catch((caught: Error) => {
        setError(caught.message);
      })
      .finally(() => {
        setResolving(false);
      });
  };

  const isLight = theme === 'code-light';
  const isMonokai = theme === 'monokai';

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) { setInput(''); setError(null); setSelectedPluginId(''); onClose(); } }}>
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
              Select a resolver plugin and enter the source identifier. The server runs the plugin and adds validated BibTeX to Zotero.
            </Dialog.Description>

            <form onSubmit={handleResolve} className="space-y-3">
              <div className="space-y-1">
                <label className={`text-[10px] uppercase tracking-wider font-semibold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  Resolver Plugin
                </label>
                <div className="relative">
                  <select
                    required
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
                    <option value="" disabled>Select Plugin</option>
                    {plugins.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-2.5 h-3.5 w-3.5 pointer-events-none opacity-60" />
                </div>
              </div>

              <div className="space-y-1">
                <label className={`text-[10px] uppercase tracking-wider font-semibold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  Source Identifier
                </label>
                <input
                  type="text"
                  required
                  value={input}
                  disabled={resolving}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Identifier or URL accepted by the selected plugin"
                  className={`w-full rounded border px-3 py-2 text-xs focus:outline-hidden ${
                    isLight 
                      ? 'border-zinc-200 bg-white text-slate-850 focus:border-blue-600' 
                      : isMonokai 
                      ? 'border-[#3e3d32] bg-[#272822] text-[#f8f8f2] focus:border-[#a6e22e]' 
                      : 'border-slate-800 bg-slate-950 text-slate-100 focus:border-sky-500'
                  }`}
                />
              </div>

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
                  disabled={resolving || !input.trim() || !selectedPluginId}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 font-semibold text-white rounded-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:hover:bg-blue-600 disabled:cursor-not-allowed"
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
