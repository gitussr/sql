# SQL Guide PWA — Architecture Assessment

Assessment performed 2026-09-17, before Phase 2 (Foundation). See `MASTER_PROMPT.md` for requirements.

## Starting state

| Area | Finding |
| --- | --- |
| Stack | None. The folder held only handbook Markdown, `README.md`, and `MASTER_PROMPT.md`. |
| Git | Local folder was not a repository. `github.com/gitussr/sql` held an older upload of 88 Markdown files, all byte-identical to the local copies; local additionally had Chapter 05 sections and `MASTER_PROMPT.md`. Local history was attached to the remote rather than replacing it. |
| Tooling | Node 22.18, npm 11.6 (pnpm also installed; npm chosen as the default). |
| Existing UI / design system | None to preserve. |
| Content | Markdown with YAML frontmatter (`title`, `description`, `chapter`, `section`, `category`, `difficulty`, `readingTime`, `lastUpdated`). Fences: `sql` (722) and `text` (964), plus a handful of json/ts/md/http/python/c. |

## Content issues found during assessment

Recorded, not changed — content is the source of truth. Items 1, 2, 5 and 6 are handled by the Phase 3 importer (see below).

1. **05.14 (SELECT Cheat Sheet & Visual Knowledge Map) has no source file**, although the master prompt lists it as complete. The manifest stops at 05.13.
2. **Frontmatter `section: 5.10` is a YAML number and parses as `5.1`**. Section numbers must come from the title (or a quoted string), never from the numeric `section` field.
3. Inconsistent filenames: `Chapter 05-03-select-all-columns.md`, `Chapter Chapter 05 - SELECT Statement.md`.
4. Duplicate file: `Chapter - 03.07.06 - Super Key.md` is identical to `Chapter 03.07.06 - Super Key.md`.
5. Callouts are not uniform: Chapter 05 uses `# ⚡ Performance Tip` headings; other chapters use `> **Note:**` / `> **Portability Tip:**` blockquotes. The importer needs an explicit mapping.
6. Execution Order Reminder is authored as a numbered `text` block with inline `← …` markers (e.g. 05.07), which can map onto `<ExecutionOrderReminder highlight="DISTINCT" />`.
7. Gaps noted in `README.md`: 03.08.02 missing, 03.09.14 CQRS stub, 03.09.15–20 not written. The master prompt's "03.09.14 — Pattern Selection Decision Tree" is actually file 03.09.21.

## Decisions

### Design system: Microsoft Fluent 2 via Fluent UI React v9

- `@fluentui/react-components` provides accessible primitives the prompt requires (nav drawer, menus, dialogs, breadcrumb, focus management via Tabster) and WCAG-oriented light/dark themes.
- Styling uses Fluent's own Griffel `makeStyles` + design tokens. **Tailwind is intentionally not added**: two styling systems would duplicate the token layer.
- Themes are `webLightTheme` / `webDarkTheme` unchanged except the monospace stack, which leads with Cascadia Code (Microsoft's developer font) using system fonts only — no font downloads. Dark background is `#292929`, not pure black.
- `@fluentui/react-icons` is tree-shaken; only imported icons ship.

**Cost:** Fluent contributes ~104 KB gzip and React + React Router ~99 KB gzip; app code is ~6 KB. Vendor code is split into separately cached chunks. If Lighthouse performance falls short on low-end mobile, the alternative is Fluent 2 tokens with hand-built CSS components (or Fluent Web Components) for the reader route.

### Structure

```
src/
  app/            routes + route/render tests
  components/     layout (AppShell), navigation (HandbookNav, SectionList), content (SectionMeta, SectionOutline)
  content/        types, generated-handbook access, lazy content hooks, navigation helpers
  features/theme/ preference logic, Fluent themes, provider, switcher
  lib/            storage (guarded localStorage), utils (hooks)
  pages/          Home, Chapters, Chapter, Reader, NotFound
  styles/         global.css (reset + pre-paint background)
scripts/
  handbook/       build-time Markdown importer, validation, Vite plugin (+ tests)
  validate-content.ts
```

Search, progress, bookmarks and PWA folders are created in their phases, not ahead of time.

### Routing

`/`, `/chapters`, `/chapter/:number/:slug`, `/chapter/:number/:slug/:sectionSlug`, `*`. A wrong chapter slug with a valid number redirects to the canonical URL. `vercel.json` rewrites all paths to `index.html` so deep links work.

### Theme

Light / Dark / System, default System, persisted as `sql-guide:theme`. An inline script in `index.html` applies the resolved theme before first paint.

## Phase 3 — Content import

### Pipeline

The handbook Markdown stays where authors keep it (repository root) and is never modified. At build time `scripts/handbook/vitePlugin.ts`:

1. Reads `Chapter*.md` files and parses frontmatter with the YAML **failsafe** schema, so `section: 5.10` stays `"5.10"`.
2. Publishes only chapters listed in `scripts/handbook/config.ts` (currently 05, plus 06 as coming soon).
3. Takes chapter and section **numbers and titles from the frontmatter `title`**, cross-checked against the `section`/`chapter` fields and the `#` title heading. Slugs derive from the title: `05-11-from-clause-deep-dive`, `05-03-select-all`.
4. Parses bodies with `mdast-util-from-markdown` + GFM and converts them into typed blocks (`src/content/types.ts`).
5. Emits `virtual:handbook` (chapter metadata + lazy loaders) and one module per section. Each section is its own ~5–6.5 KB gzip chunk; the Markdown parser never ships to the browser. Module ids use `05-07`, not `05.07`, because Vite's dev server treats a dot as a file extension.

The parser, YAML reader and mdast types are **dev dependencies only**.

### Structured content

| Markdown | Structured as |
| --- | --- |
| `# 🏗️ Architecture Insight`, `⚡`, `🔒`, `🌍`, `🚀`, `🔬 Engine Deep Dive`, `💡 Did You Know?` | `callout` block with `variant` and `icon` |
| `# 📍 Execution Order Reminder` | `execution-order` block. Numbered or arrow-flow `text` listings become `executionOrder` nodes with steps and author-marked highlights (`← note` or `(… here)`); written-order listings stay code; the original text is kept in `source`. |
| Learning Objectives, Interview Questions, Hands-on Exercises, Summary | Dedicated block kinds |
| Related Topics list | `topics`, linked to a section only when number **and** title agree |
| `> **Label:** text` | `aside` node |
| Inline raw HTML | Literal text, never rendered as HTML |
| Headings inside a block | Shifted one level down, given anchor ids, collected into `outline` |

Only `---` separators at block edges are dropped. An integrity test compares heading, code block, table, list and blockquote counts, plus total code characters, between each Chapter 05 source file and its import.

### Validation

Errors fail `vite build` and `npm run validate:content`: missing or invalid frontmatter, title/number disagreements, duplicate section ids or slugs, a missing chapter introduction, chapters without sections, unclosed code fences.

Warnings are reported without failing: numbering gaps, code blocks without a language, unknown languages, stray fences, unresolvable or mismatched related-topic references.

### Current Chapter 05 warnings (content, not code)

- 30 code blocks without a language across 05.01, 05.06–05.11 and 05.13.
- 05.11's Summary paragraph ends with a stray four-backtick fence.
- Related Topics whose number and title disagree (left unlinked): in 05.08, "05.09 — FROM Clause"; in 05.09, "05.10 — FROM Clause"; in the chapter introduction, 05.01–05.04 each carry the following section's title.
- 05.14 does not exist yet, so the chapter ends at 05.13.

## Phase 4 — Reading experience

### Rendering

`src/components/content/ContentRenderer.tsx` maps the imported node tree straight to React elements. No HTML strings are injected anywhere (no `dangerouslySetInnerHTML`); link and image URLs are restricted to safe schemes, and external links open with `rel="noopener noreferrer"`.

| Component | Purpose |
| --- | --- |
| `SectionBody` | Maps blocks to components; every block title is an `h2` with a shareable `#` link |
| `CodeBlock` | Language label, Copy → "Copied ✓" (with a selection fallback and screen-reader announcement), wrap toggle, optional line numbers, keyboard-scrollable |
| `DataTable` | Column headers, GFM alignment, horizontal scroll inside a focusable container named after its columns |
| `Callout` | The seven callout variants: Fluent icon + restrained accent border; the title always names the callout |
| `Aside` | Labelled notes (`Portability Tip`, `Remember`) |
| `ExecutionOrderReminder` | Authored steps with the marked clause highlighted (`aria-current="step"`), or `<ExecutionOrderReminder highlight="WHERE" />` for the canonical order |
| `RelatedTopics` | Links resolved sections/chapters; unresolved references stay as muted text |
| `OnThisPage` | Sticky right column with active-heading tracking at ≥1400px; collapsible disclosure below that |

Chapter pages render the chapter introduction below the section list.

### Syntax highlighting

Highlighting runs **at build time** (`scripts/handbook/highlight.ts`, Prism grammars via `refractor`, dev dependency only). Code nodes carry compact `[text, kind]` segments; an integrity test asserts the segments spell out the source exactly. Text diagrams and unlabelled blocks are not highlighted. Highlighting added ~6% to section data and no JavaScript to the client.

Token colours (`src/features/theme/codeColors.ts`) follow VS Code Light+/Dark+, with two light colours darkened so every token meets WCAG AA on the code background (enforced by a test). They are exposed as CSS custom properties on the theme root.

### Typography

Reading text is 16px with a 1.7 line height in a 760px column. Headings step 24/20/16px, with scroll margins so anchors clear the sticky header.

### Import changes made for the reader

- Line endings are normalised to LF when files are read. Windows checkouts had put `\r\n` into code blocks, making builds OS-dependent and copied code CRLF.
- Heading levels are clamped so they never skip (05.07 and 05.11 go from `# Common Mistakes` to `### Mistake 1`). The author's relative nesting is kept; heading text and order are unchanged.

### Verification

- Every Chapter 05 section and the chapter introduction render through the components in tests, with code block, table, callout and execution-order counts matching the imported content, and unique anchor ids.
- Headless Chrome at 320/375/768/1280/1440px, light and dark: no page-level horizontal overflow (wide code and tables scroll inside their containers), no console errors.
- Copy verified with a real click: the clipboard receives the code exactly (Windows converts to CRLF on the clipboard itself).
- axe-core (WCAG 2.0–2.2 A/AA plus best practices) on 05.07, 05.11 and the chapter page, both themes, desktop and mobile: no contrast, landmark, heading-order or target-size violations. The one remaining report, `aria-hidden-focus`, is Fluent's Tabster focus sentinels (`data-tabster-dummy`) inside `NavDrawerBody`, not app markup.

## Phase 5 — Navigation

### Reading sequence

`readingSequence()` defines one linear order: each available chapter's introduction, then its sections (coming-soon chapters are skipped). Previous/next on section and chapter pages, and the keyboard shortcuts, all follow it, so 05.01's "Previous" is the Chapter 05 introduction.

### Components

| Component | Purpose |
| --- | --- |
| `PageBreadcrumb` | `SQL Guide › Chapter 05 › SELECT Statement › 05.11 …`. "Chapter 05" links to the chapter's entry in the full list; below 640px only `Chapter 05 › SELECT Statement` is shown (the section title is the page heading). |
| `SequencePager` | Previous / Contents / Next. Links carry `rel="prev"/"next"` and `aria-keyshortcuts`; a key hint appears only on devices with a fine pointer. |
| `ReadingLayout` + `CollapsibleOutline` | Shared by section and chapter pages: 760px column, sticky "On this page" at ≥1400px, collapsible outline below. |
| `ChaptersPage` | Expand/collapse per chapter, filter by number or title ("05.11", "5.11", "distinct", "chapter 5") with highlighted matches, result count announced via `role="status"`, empty state with a clear action. |
| `HandbookNav` | Categories are controlled: the current chapter always opens when you navigate into it, and the current page is scrolled into view. |

Chapter pages gained the breadcrumb, a "Start with 05.01" action, "On this page" (Sections + introduction headings) and previous/next.

### Keyboard shortcuts

`n` next, `p` previous. They never fire with Ctrl/Alt/⌘, while composing text, or when focus is in an input, textarea, contenteditable, menu, list box, combo box or dialog (`shouldHandleShortcut`, unit tested). They are optional: every action has a visible control.

### Verification

Type checks and 126 tests pass (reading sequence, filter, shortcut guard, breadcrumb/pager rendering on chapter and section pages).

Verified in headless Chrome on 2026-09-19 (once memory allowed a build): `n`/`p` navigate and do not fire with Ctrl or while typing in the filter; the sidebar scrolls the current section into view; `p` from 05.01 reaches the chapter introduction; the filter highlights matches, reports counts and shows the empty state; chapters collapse; the mobile breadcrumb shows `Chapter 05 › SELECT Statement` with no overflow. An axe run on the chapter list is still outstanding.

## Content — Chapter 06

Chapter 06 (WHERE Clause) was added on 2026-09-19: an introduction plus sections 06.01–06.14, written in the Chapter 05 format (frontmatter, callouts, Execution Order Reminder, vendor table, mistakes, interview questions, exercises, related topics). It is published in `scripts/handbook/config.ts`; Chapter 07 (JOINs) is now the "coming soon" chapter.

- Validation: 0 errors and no Chapter 06 warnings (every code block has a language; every related topic resolves or points to a future `xx` section).
- Integrity and rendering tests now cover every published chapter, not only Chapter 05.
- 06.08 provides the full three-valued-logic treatment that 05.08 defers to "the WHERE chapter".

## Content — Chapter 07

Chapter 07 (JOINs) was added on 2026-09-22: an introduction plus sections 07.01–07.17, in the same format as Chapters 05 and 06. It covers the join family (inner, left, right, full, cross, self, natural/USING), multi-table joins, `ON` vs `WHERE`, `NULL` behaviour, semi-/anti-joins, join algorithms, index strategy, a mistakes catalogue and a cheat sheet. It is published in `scripts/handbook/config.ts`; Chapter 08 (GROUP BY and HAVING) is now the "coming soon" chapter.

- Validation: 0 errors and no Chapter 07 warnings (every code block has a language; every related topic resolves or points to a future `xx` section).
- Typecheck, 237 tests and a production build pass; the build emits 17 section chunks plus the chapter overview.
- 07.11 (ON vs WHERE) and 07.12 (NULL Handling in JOINs) carry the three-valued-logic thread from 06.08 into outer joins; 07.13 continues the `EXISTS` introduction from 06.10.
- Chapter 07 sections are the first to be referenced by a later chapter placeholder (`08.xx — GROUP BY and HAVING`).

## Content — Chapter 08

Chapter 08 (GROUP BY and HAVING) was added on 2026-09-24: an introduction plus sections 08.01–08.17, in the same format as Chapters 05–07. It covers aggregate functions, `COUNT` forms, `NULL` in aggregates, `GROUP BY` semantics, grouping on several columns and expressions, the SELECT list rule and functional dependency, `HAVING`, `WHERE` vs `HAVING`, conditional aggregation, aggregating across joins (fan and chasm traps), `ROLLUP`/`CUBE`/`GROUPING SETS`, string/percentile/statistical aggregates, hash and stream aggregation, index strategy, a mistakes catalogue and a cheat sheet. It is published in `scripts/handbook/config.ts`; Chapter 09 (Subqueries) is now the "coming soon" chapter.

- Validation: 0 errors and no Chapter 08 warnings (every code block has a language; every related topic resolves or points to a future `xx` section).
- Typecheck, 293 tests and a production build pass; the build emits 17 section chunks plus the chapter overview.
- The chapter reuses the Chapter 07 sample schema, adding `Orders.Status`, `Products.ListPrice`, `Departments`, and `Employees.Salary`/`HireDate`.
- Chapter 09 is titled "Subqueries" to match the `09.xx — Subqueries` placeholders used since Chapter 06. Chapter 05 also has `09.xx — CASE Expressions` placeholders, so CASE will need a chapter number of its own.
- The chapter filter now matches Chapter 08 sections for "NULL handling" (08.04) and "joins" (08.11); `filterChapters.test.ts` covers both.

## Content — Chapter 09

Chapter 09 (Subqueries) was added on 2026-09-25: an introduction plus sections 09.01–09.17, in the same format as Chapters 05–08. It covers subquery syntax and scope, scalar subqueries, `IN`/`NOT IN`, `EXISTS`/`NOT EXISTS` (including relational division), `ANY`/`SOME`/`ALL`, correlated subqueries, derived tables, comparing rows and groups with aggregates, `LATERAL` and `APPLY`, subqueries in `INSERT`/`UPDATE`/`DELETE`/`MERGE`, `NULL` handling, subqueries versus joins, unnesting and decorrelation (including the count bug), index strategy, a mistakes catalogue and a cheat sheet. It is published in `scripts/handbook/config.ts`; Chapter 10 (Indexes) is now the "coming soon" chapter.

- Validation: 0 errors and no Chapter 09 warnings (the remaining 15 warnings are in Chapter 05, as before).
- Typecheck, 349 tests and a production build pass; the build emits 17 section chunks plus the chapter overview.
- The chapter reuses the Chapter 08 schema and adds a `Returns` table (`OrderID`, `ProductID`, `CustomerID`); `Orders.CustomerID` is treated as nullable (guest checkouts) to demonstrate the `NOT IN` trap.
- Chapter 10 is titled "Indexes" to match the `10.xx — Indexes` placeholders used since Chapter 05. `09.xx — CASE Expressions` placeholders in Chapter 05 still point at a chapter number that is now Subqueries.
- The chapter filter now matches Chapter 09 sections for "NULL handling" (09.12) and "joins" (09.13); `filterChapters.test.ts` covers both, and "indexes" is the coming-soon case.
