import { chapters, overviewLoaders, sectionLoaders } from 'virtual:handbook';
import type { SectionContent } from './types';

export { chapters };

export async function loadSectionContent(sectionId: string): Promise<SectionContent> {
  const loader = sectionLoaders[sectionId];
  if (!loader) throw new Error(`No content for section ${sectionId}`);
  return (await loader()).default;
}

export async function loadChapterOverview(chapterNumber: string): Promise<SectionContent> {
  const loader = overviewLoaders[chapterNumber];
  if (!loader) throw new Error(`No introduction for chapter ${chapterNumber}`);
  return (await loader()).default;
}
