import {
  Hamburger,
  NavCategory,
  NavCategoryItem,
  NavDrawer,
  NavDrawerBody,
  NavDrawerHeader,
  NavItem,
  NavSectionHeader,
  NavSubItem,
  NavSubItemGroup,
  Tooltip,
  type NavDrawerProps,
} from '@fluentui/react-components';
import { BookOpen20Filled, BookOpen20Regular, bundleIcon, Home20Filled, Home20Regular } from '@fluentui/react-icons';
import type { MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { chapters } from '../../content/chapters';
import { chapterPath, sectionPath } from '../../content/navigation';

const HomeIcon = bundleIcon(Home20Filled, Home20Regular);
const ChaptersIcon = bundleIcon(BookOpen20Filled, BookOpen20Regular);

interface HandbookNavProps {
  open: boolean;
  type: NonNullable<NavDrawerProps['type']>;
  onOpenChange: (open: boolean) => void;
  className?: string;
}

/** Handbook navigation tree, driven entirely by chapter metadata. */
export function HandbookNav({ open, type, onOpenChange, className }: HandbookNavProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const currentChapter = pathname.match(/^\/chapter\/(\d+)/)?.[1];

  // Keep real hrefs for semantics (open in new tab, copy link) but route client-side.
  const go = (path: string) => (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate(path);
    if (type === 'overlay') onOpenChange(false);
  };

  return (
    <NavDrawer
      open={open}
      type={type}
      selectedValue={decodeURI(pathname)}
      defaultOpenCategories={currentChapter ? [currentChapter] : ['05']}
      onOpenChange={(_, data) => onOpenChange(data.open)}
      className={className}
      aria-label="Handbook navigation"
    >
      {type === 'overlay' && (
        <NavDrawerHeader>
          <Tooltip content="Close navigation" relationship="label">
            <Hamburger onClick={() => onOpenChange(false)} />
          </Tooltip>
        </NavDrawerHeader>
      )}
      <NavDrawerBody>
        <NavItem href="/" value="/" icon={<HomeIcon />} onClick={go('/')}>
          Home
        </NavItem>
        <NavItem href="/chapters" value="/chapters" icon={<ChaptersIcon />} onClick={go('/chapters')}>
          All chapters
        </NavItem>

        <NavSectionHeader>Chapters</NavSectionHeader>
        {chapters.map((chapter) => {
          const path = chapterPath(chapter);
          if (chapter.sections.length === 0) {
            return (
              <NavItem key={chapter.number} href={path} value={path} onClick={go(path)}>
                {chapter.number} {chapter.title} · Coming soon
              </NavItem>
            );
          }
          return (
            <NavCategory key={chapter.number} value={chapter.number}>
              <NavCategoryItem>
                {chapter.number} {chapter.title}
              </NavCategoryItem>
              <NavSubItemGroup>
                <NavSubItem href={path} value={path} onClick={go(path)}>
                  Overview
                </NavSubItem>
                {chapter.sections.map((section) => {
                  const sectionHref = sectionPath(chapter, section);
                  return (
                    <NavSubItem key={section.id} href={sectionHref} value={sectionHref} onClick={go(sectionHref)}>
                      {section.number} {section.title}
                    </NavSubItem>
                  );
                })}
              </NavSubItemGroup>
            </NavCategory>
          );
        })}
      </NavDrawerBody>
    </NavDrawer>
  );
}
