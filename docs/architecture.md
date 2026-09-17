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

## Content issues to resolve in Phase 3

Recorded, not changed — content is the source of truth.

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
  components/     layout (AppShell), navigation (HandbookNav, SectionList)
  content/        types, chapter manifest, navigation helpers
  features/theme/ preference logic, Fluent themes, provider, switcher
  lib/            storage (guarded localStorage), utils (hooks)
  pages/          Home, Chapters, Chapter, Reader, NotFound
  styles/         global.css (reset + pre-paint background)
```

Search, progress, bookmarks and PWA folders are created in their phases, not ahead of time.

### Routing

`/`, `/chapters`, `/chapter/:number/:slug`, `/chapter/:number/:slug/:sectionSlug`, `*`. A wrong chapter slug with a valid number redirects to the canonical URL. `vercel.json` rewrites all paths to `index.html` so deep links work.

### Theme

Light / Dark / System, default System, persisted as `sql-guide:theme`. An inline script in `index.html` applies the resolved theme before first paint.
