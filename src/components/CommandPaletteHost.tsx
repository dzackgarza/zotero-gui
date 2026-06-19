import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import type { Command, ZoteroItem } from '../types';
import CommandPalette from './CommandPalette';

export interface CommandPaletteHostHandle {
  openItemPalette: () => void;
  openCommandPalette: () => void;
}

interface CommandPaletteHostProps {
  commands: Command[];
  items: ZoteroItem[];
  onSelectItem: (id: string) => void;
}

const CommandPaletteHost = forwardRef<CommandPaletteHostHandle, CommandPaletteHostProps>(
  function CommandPaletteHost({ commands, items, onSelectItem }, ref) {
    const [isOpen, setIsOpen] = useState(false);
    const [initialInput, setInitialInput] = useState('');

    const openItemPalette = useCallback(() => {
      setInitialInput('');
      setIsOpen(true);
    }, []);

    const openCommandPalette = useCallback(() => {
      setInitialInput('>');
      setIsOpen(true);
    }, []);

    const toggleItemPalette = useCallback(() => {
      setInitialInput('');
      setIsOpen(open => !open);
    }, []);

    const closePalette = useCallback(() => {
      setIsOpen(false);
    }, []);

    useImperativeHandle(ref, () => ({
      openItemPalette,
      openCommandPalette,
    }), [openCommandPalette, openItemPalette]);

    useEffect(() => {
      const handleGlobalKeys = (event: KeyboardEvent) => {
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
          event.preventDefault();
          openCommandPalette();
          return;
        }

        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'p') {
          event.preventDefault();
          toggleItemPalette();
          return;
        }

        if (event.key === 'Escape') {
          closePalette();
        }
      };

      window.addEventListener('keydown', handleGlobalKeys, { capture: true });
      return () => window.removeEventListener('keydown', handleGlobalKeys, { capture: true });
    }, [closePalette, openCommandPalette, toggleItemPalette]);

    return (
      <CommandPalette
        isOpen={isOpen}
        onClose={closePalette}
        initialInput={initialInput}
        items={items}
        onSelectItem={onSelectItem}
        commands={commands}
      />
    );
  },
);

export default CommandPaletteHost;
