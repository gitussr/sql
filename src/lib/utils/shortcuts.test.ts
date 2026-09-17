import { describe, expect, it } from 'vitest';
import { shouldHandleShortcut } from './shortcuts';

function event(overrides: Partial<Parameters<typeof shouldHandleShortcut>[0]> = {}) {
  return { key: 'n', altKey: false, ctrlKey: false, metaKey: false, defaultPrevented: false, target: null, ...overrides };
}

/** Minimal element stand-in: `closest` matches when the element sits inside one of `contexts`. */
function element(contexts: string[] = [], contentEditable = false) {
  return {
    isContentEditable: contentEditable,
    closest: (selector: string) => (contexts.some((context) => selector.includes(context)) ? {} : null),
  } as unknown as EventTarget;
}

describe('shouldHandleShortcut', () => {
  it('handles plain keys on the page', () => {
    expect(shouldHandleShortcut(event())).toBe(true);
    expect(shouldHandleShortcut(event({ target: element() }))).toBe(true);
  });

  it('ignores keys combined with modifiers', () => {
    expect(shouldHandleShortcut(event({ ctrlKey: true }))).toBe(false);
    expect(shouldHandleShortcut(event({ metaKey: true }))).toBe(false);
    expect(shouldHandleShortcut(event({ altKey: true }))).toBe(false);
  });

  it('ignores typing in fields and editable content', () => {
    expect(shouldHandleShortcut(event({ target: element(['input']) }))).toBe(false);
    expect(shouldHandleShortcut(event({ target: element(['textarea']) }))).toBe(false);
    expect(shouldHandleShortcut(event({ target: element([], true) }))).toBe(false);
  });

  it('ignores keys used by menus, list boxes and dialogs', () => {
    expect(shouldHandleShortcut(event({ target: element(['[role="menuitemradio"]']) }))).toBe(false);
    expect(shouldHandleShortcut(event({ target: element(['[role="dialog"]']) }))).toBe(false);
  });

  it('ignores handled or composing events', () => {
    expect(shouldHandleShortcut(event({ defaultPrevented: true }))).toBe(false);
    expect(shouldHandleShortcut(event({ isComposing: true }))).toBe(false);
  });
});
