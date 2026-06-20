import { z } from 'zod';

export const KEYBOARD_MODIFIERS = ['ctrl', 'shift', 'alt', 'meta'] as const;

export const KeyboardModifierSchema = z.enum(KEYBOARD_MODIFIERS);

export const KeyboardShortcutSchema = z.strictObject({
  key: z.string().min(1),
  modifiers: z.array(KeyboardModifierSchema).superRefine((modifiers, context) => {
    const seen = new Set<string>();
    for (const modifier of modifiers) {
      if (seen.has(modifier)) {
        context.addIssue({
          code: 'custom',
          message: `duplicate keyboard modifier: ${modifier}`,
        });
      }
      seen.add(modifier);
    }
  }),
});

export const KeyboardShortcutsConfigSchema = z.strictObject({
  openItemPalette: KeyboardShortcutSchema,
  openCommandPalette: KeyboardShortcutSchema,
});

export type KeyboardModifier = z.infer<typeof KeyboardModifierSchema>;
export type KeyboardShortcut = z.infer<typeof KeyboardShortcutSchema>;
export type KeyboardShortcutsConfig = z.infer<typeof KeyboardShortcutsConfigSchema>;
