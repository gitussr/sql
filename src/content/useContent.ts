import { useEffect, useState } from 'react';
import { loadChapterOverview, loadSectionContent } from './handbook';
import type { SectionContent } from './types';

export type ContentState =
  | { status: 'loading' }
  | { status: 'ready'; content: SectionContent }
  | { status: 'error' };

function useContent(key: string | undefined, load: (key: string) => Promise<SectionContent>): ContentState {
  const [state, setState] = useState<{ key?: string; value: ContentState }>({ value: { status: 'loading' } });

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    load(key).then(
      (content) => !cancelled && setState({ key, value: { status: 'ready', content } }),
      () => !cancelled && setState({ key, value: { status: 'error' } }),
    );
    return () => {
      cancelled = true;
    };
  }, [key, load]);

  // Never show the previous section's content while the next one loads.
  return state.key === key ? state.value : { status: 'loading' };
}

export function useSectionContent(sectionId: string | undefined): ContentState {
  return useContent(sectionId, loadSectionContent);
}

export function useChapterOverview(chapterNumber: string | undefined): ContentState {
  return useContent(chapterNumber, loadChapterOverview);
}
