import { Hamburger, makeStyles, Text, tokens, Tooltip } from '@fluentui/react-components';
import { useEffect, useState } from 'react';
import { Link, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { ThemeSwitcher } from '../../features/theme/ThemeSwitcher';
import { useMediaQuery } from '../../lib/utils/useMediaQuery';
import { HandbookNav } from '../navigation/HandbookNav';

const HEADER_HEIGHT = '48px';

const useStyles = makeStyles({
  skipLink: {
    position: 'absolute',
    left: '-9999px',
    top: tokens.spacingVerticalS,
    zIndex: 100,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    ':focus': { left: tokens.spacingHorizontalS },
  },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    height: HEADER_HEIGHT,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    paddingInline: tokens.spacingHorizontalS,
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  brand: {
    color: tokens.colorNeutralForeground1,
    textDecoration: 'none',
    paddingInline: tokens.spacingHorizontalXS,
    borderRadius: tokens.borderRadiusMedium,
    ':hover': { color: tokens.colorBrandForeground1 },
  },
  spacer: { flexGrow: 1 },
  body: { display: 'flex', alignItems: 'flex-start' },
  inlineNav: {
    position: 'sticky',
    top: HEADER_HEIGHT,
    height: `calc(100dvh - ${HEADER_HEIGHT})`,
    flexShrink: 0,
  },
  main: {
    flexGrow: 1,
    minWidth: 0,
    paddingBlock: `${tokens.spacingVerticalXXL} ${tokens.spacingVerticalXXXL}`,
    paddingInline: tokens.spacingHorizontalL,
    '@media (min-width: 768px)': { paddingInline: tokens.spacingHorizontalXXXL },
  },
  content: {
    maxWidth: '780px',
    marginInline: 'auto',
  },
});

export function AppShell() {
  const styles = useStyles();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [desktopNavOpen, setDesktopNavOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { pathname } = useLocation();

  const navOpen = isDesktop ? desktopNavOpen : mobileNavOpen;
  const setNavOpen = isDesktop ? setDesktopNavOpen : setMobileNavOpen;

  useEffect(() => setMobileNavOpen(false), [pathname]);

  return (
    <>
      <a href="#main" className={styles.skipLink}>
        Skip to content
      </a>
      <header className={styles.header}>
        <Tooltip content={navOpen ? 'Hide navigation' : 'Show navigation'} relationship="label">
          <Hamburger onClick={() => setNavOpen(!navOpen)} aria-expanded={navOpen} />
        </Tooltip>
        <Link to="/" className={styles.brand}>
          <Text weight="semibold" size={400}>
            SQL Guide
          </Text>
        </Link>
        <div className={styles.spacer} />
        <ThemeSwitcher />
      </header>
      <div className={styles.body}>
        <HandbookNav
          open={navOpen}
          type={isDesktop ? 'inline' : 'overlay'}
          onOpenChange={setNavOpen}
          className={isDesktop ? styles.inlineNav : undefined}
        />
        <main id="main" tabIndex={-1} className={styles.main}>
          <div className={styles.content}>
            <Outlet />
          </div>
        </main>
      </div>
      <ScrollRestoration />
    </>
  );
}
