import appConfig from '../zotero-gui.config.json';
import {
  KEYBOARD_MODIFIERS,
  KeyboardShortcutsConfigSchema,
  type KeyboardModifier,
  type KeyboardShortcut,
} from './keyboardShortcutsSchema';

export const KEYBOARD_SHORTCUTS = KeyboardShortcutsConfigSchema.parse(appConfig.keyboardShortcuts);

type KeyboardEventLike = Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>;

const MODIFIER_LABELS: Record<KeyboardModifier, string> = {
  ctrl: 'Ctrl',
  shift: 'Shift',
  alt: 'Alt',
  meta: 'Meta',
};

function hasModifier(shortcut: KeyboardShortcut, modifier: KeyboardModifier): boolean {
  return shortcut.modifiers.includes(modifier);
}

function eventModifierState(event: KeyboardEventLike, modifier: KeyboardModifier): boolean {
  switch (modifier) {
    case 'ctrl':
      return event.ctrlKey;
    case 'shift':
      return event.shiftKey;
    case 'alt':
      return event.altKey;
    case 'meta':
      return event.metaKey;
  }
}

export function keyboardEventMatchesShortcut(event: KeyboardEventLike, shortcut: KeyboardShortcut): boolean {
  return (
    event.key.toLowerCase() === shortcut.key.toLowerCase()
    && KEYBOARD_MODIFIERS.every(modifier => eventModifierState(event, modifier) === hasModifier(shortcut, modifier))
  );
}

export function formatKeyboardShortcut(shortcut: KeyboardShortcut): string {
  const modifiers = KEYBOARD_MODIFIERS
    .filter(modifier => hasModifier(shortcut, modifier))
    .map(modifier => MODIFIER_LABELS[modifier]);
  return [...modifiers, shortcut.key.toUpperCase()].join('+');
}

export type { KeyboardShortcut };
