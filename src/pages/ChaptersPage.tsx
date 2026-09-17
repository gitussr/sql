import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Body1,
  Button,
  Caption1,
  Field,
  makeStyles,
  SearchBox,
  Title1,
  tokens,
  type AccordionToggleEventHandler,
} from '@fluentui/react-components';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ComingSoonBadge } from '../components/learning/ComingSoonBadge';
import { PageBreadcrumb } from '../components/navigation/PageBreadcrumb';
import { SectionList } from '../components/navigation/SectionList';
import { chapters } from '../content/handbook';
import { chapterPath } from '../content/navigation';
import { filterChapters } from '../features/chapters/filterChapters';
import { useDocumentTitle } from '../lib/utils/useDocumentTitle';
import { usePageStyles } from './pageStyles';

const useStyles = makeStyles({
  filter: { marginBottom: tokens.spacingVerticalS },
  item: {
    scrollMarginTop: '72px',
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  header: { display: 'flex', alignItems: 'baseline', gap: tokens.spacingHorizontalM, width: '100%' },
  headerNumber: { fontFamily: tokens.fontFamilyMonospace, color: tokens.colorNeutralForeground3 },
  headerTitle: { flexGrow: 1, fontWeight: tokens.fontWeightSemibold },
  panel: { paddingBlockEnd: tokens.spacingVerticalM },
  overview: {
    display: 'inline-block',
    marginBlock: `0 ${tokens.spacingVerticalXS}`,
    marginInlineStart: tokens.spacingHorizontalS,
    color: tokens.colorBrandForegroundLink,
    ':hover': { color: tokens.colorBrandForegroundLinkHover },
  },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: tokens.spacingVerticalM },
  status: { minHeight: '20px', marginBlock: `0 ${tokens.spacingVerticalM}`, color: tokens.colorNeutralForeground3 },
});

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function ChaptersPage() {
  const page = usePageStyles();
  const styles = useStyles();
  const [query, setQuery] = useState('');
  const [openItems, setOpenItems] = useState<string[]>(() =>
    chapters.filter((chapter) => chapter.status === 'available').map((chapter) => chapter.number),
  );
  useDocumentTitle('All chapters');

  const matches = useMemo(() => filterChapters(chapters, query), [query]);
  const filtering = query.trim().length > 0;
  const matchedSections = matches.reduce((total, match) => total + match.sections.length, 0);

  // While filtering, every chapter with results is expanded.
  const expanded = filtering ? matches.map((match) => match.chapter.number) : openItems;
  const onToggle: AccordionToggleEventHandler<string> = (_, data) => {
    if (!filtering) setOpenItems(data.openItems);
  };

  return (
    <div className={page.container}>
      <PageBreadcrumb items={[{ label: 'SQL Guide', href: '/' }, { label: 'All chapters' }]} />
      <header className={page.header}>
        <Title1 as="h1" className={page.title}>
          All chapters
        </Title1>
        <Body1 as="p" className={page.lead}>
          The complete handbook structure.
        </Body1>
      </header>

      <Field label="Filter chapters and sections" className={styles.filter}>
        <SearchBox value={query} onChange={(_, data) => setQuery(data.value)} placeholder="Number or title, e.g. 05.11 or DISTINCT" />
      </Field>
      <Caption1 as="p" role="status" className={styles.status}>
        {filtering ? `${plural(matchedSections, 'section')} in ${plural(matches.length, 'chapter')}` : ''}
      </Caption1>

      {matches.length === 0 ? (
        <div className={styles.empty}>
          <Body1>No chapters or sections match “{query.trim()}”.</Body1>
          <Button onClick={() => setQuery('')}>Clear filter</Button>
        </div>
      ) : (
        <Accordion multiple collapsible openItems={expanded} onToggle={onToggle}>
          {matches.map(({ chapter, sections }) => (
            <AccordionItem key={chapter.number} value={chapter.number} id={`chapter-${chapter.number}`} className={styles.item}>
              <AccordionHeader as="h2" size="large" expandIconPosition="end">
                <span className={styles.header}>
                  <span className={styles.headerNumber}>{chapter.number}</span>
                  <span className={styles.headerTitle}>{chapter.title}</span>
                  {chapter.status === 'coming-soon' ? (
                    <ComingSoonBadge />
                  ) : (
                    <Caption1>{plural(chapter.sections.length, 'section')}</Caption1>
                  )}
                </span>
              </AccordionHeader>
              <AccordionPanel className={styles.panel}>
                <Link to={chapterPath(chapter)} className={styles.overview}>
                  {chapter.status === 'coming-soon' ? 'About this chapter' : 'Chapter introduction'}
                </Link>
                {sections.length > 0 && <SectionList chapter={chapter} sections={sections} highlight={query} />}
              </AccordionPanel>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
