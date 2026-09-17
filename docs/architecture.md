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
