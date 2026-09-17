import { useEffect, useRef } from 'react';

interface ShortcutEvent {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey?: boolean;
  defaultPrevented: boolean;
  isComposing?: boolean;
  target: EventTarget | null;
}

/** Widgets that consume letter keys themselves (typing, menus with type-ahead, dialogs). */
const INTERACTIVE_CONTEXT = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="menu"], [role="menuitem"], [role="menuitemradio"], [role="listbox"], [role="combobox"], [role="dialog"]';

/**
 * Single-key shortcuts must never fire while the reader is typing or using a
 * widget, and never with modifiers (browser/OS shortcuts keep working).
 */
export function shouldHandleShortcut(event: ShortcutEvent): boolean {
  if (event.defaultPrevented || event.isComposing) return false;
  if (event.altKey || event.ctrlKey || event.metaKey) return false;
  const target = event.target as { closest?: (selector: string) => unknown; isContentEditable?: boolean } | null;
  if (target?.isContentEditable) return false;
  if (typeof target?.closest === 'function' && target.closest(INTERACTIVE_CONTEXT)) return false;
  return true;
}

/** Binds lowercase single-letter shortcuts (e.g. { n: goNext }) for the lifetime of the component. */
export function useKeyboardShortcuts(bindings: Record<string, (() => void) | undefined>): void {
  const latest = useRef(bindings);
  latest.current = bindings;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.shiftKey || !shouldHandleShortcut(event)) return;
      const action = latest.current[event.key.toLowerCase()];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
