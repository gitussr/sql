import {
  Hamburger,
  makeStyles,
  mergeClasses,
  NavCategory,
  NavCategoryItem,
  NavDrawer,
  NavDrawerBody,
  NavDrawerHeader,
  NavItem,
  NavSectionHeader,
  NavSubItem,
  NavSubItemGroup,
  tokens,
  Tooltip,
  type NavDrawerProps,
} from '@fluentui/react-components';
import { BookOpen20Filled, BookOpen20Regular, bundleIcon, Home20Filled, Home20Regular } from '@fluentui/react-icons';
import { useEffect, useState, type MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { chapters } from '../../content/handbook';
import { chapterPath, sectionPath } from '../../content/navigation';

const useStyles = makeStyles({
  // Fluent's nav surface (and its items) use colorNeutralBackground4, which is #0a0a0a in
  // dark mode. Remap the token for this subtree so the panel stays clearly off-black.
  root: {
    '--colorNeutralBackground4': tokens.colorNeutralBackground3,
    backgroundColor: tokens.colorNeutralBackground3,
  },
});

const HomeIcon = bundleIcon(Home20Filled, Home20Regular);
const ChaptersIcon = bundleIcon(BookOpen20Filled, BookOpen20Regular);

interface HandbookNavProps {
  open: boolean;
  type: NonNullable<NavDrawerProps['type']>;
  onOpenChange: (open: boolean) => void;
  className?: string;
}

const NAV_ID = 'handbook-nav';

/** Handbook navigation tree, driven entirely by chapter metadata. */
export function HandbookNav({ open, type, onOpenChange, className }: HandbookNavProps) {
  const styles = useStyles();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const currentChapter = pathname.match(/^\/chapter\/(\d+)/)?.[1];
  const [openCategories, setOpenCategories] = useState<string[]>(() => [
    currentChapter ?? chapters.find((chapter) => chapter.status === 'available')?.number ?? '',
  ]);

  // Moving to another chapter (via links, previous/next or shortcuts) always reveals it.
  useEffect(() => {
    if (currentChapter) setOpenCategories((categories) => (categories.includes(currentChapter) ? categories : [...categories, currentChapter]));
  }, [currentChapter]);

  // Keep the current page visible in a long, scrolled sidebar.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(NAV_ID)?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, open, openCategories]);

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
      id={NAV_ID}
      openCategories={openCategories}
      onNavCategoryItemToggle={(_, data) => {
        const value = String(data.categoryValue ?? data.value);
        setOpenCategories((categories) => (categories.includes(value) ? categories.filter((item) => item !== value) : [...categories, value]));
      }}
      onOpenChange={(_, data) => onOpenChange(data.open)}
      className={mergeClasses(styles.root, className)}
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
                  Introduction
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
