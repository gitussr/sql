# SQL Guide PWA — Master Development Prompt

## 0. Role

You are a senior full-stack PWA engineer, UI/UX designer, database architect, and technical documentation engineer.

Build a production-quality **SQL Guide Progressive Web App (PWA)** from the requirements below.

The application is a long-form SQL/database engineering handbook converted into an interactive learning platform.

The goal is **not** to create a generic documentation website.

The goal is to create a focused, fast, readable, offline-capable **SQL learning PWA** that makes a large technical handbook easy to study, search, navigate, revisit, and progressively master.

---

# 1. Product Name

Use:

**SQL Guide**

The product should feel like a serious technical learning/reference tool rather than an ordinary blog.

---

# 2. Core Product Philosophy

Follow these principles throughout development:

1. **Content first**
2. **Learning first**
3. **Fast first**
4. **Mobile first**
5. **Offline capable**
6. **Minimal visual clutter**
7. **Excellent typography**
8. **Excellent code readability**
9. **Strong information architecture**
10. **No unnecessary dependencies**
11. **No overengineering**
12. **Progressive enhancement**
13. **Accessible by default**
14. **SEO-friendly where applicable**
15. **PWA-native experience**

The application should feel closer to:

* a professional developer handbook
* a technical reference manual
* an interactive study application

than:

* a traditional WordPress blog
* an LMS dashboard
* a social network
* a visually overloaded documentation portal

---

# 3. Existing Content Structure

The handbook is already organized into numbered chapters and sections.

The current completed major structure includes:

## Chapter 03

Database Relationships and Real-World Relationship Case Studies

Including:

* 03.08.09.06 — Social Media Platform
* 03.08.09.07 — ERP System
* 03.08.09.08 — Hotel Reservation System
* 03.08.09.09 — Food Delivery Platform
* 03.08.09.10 — Airline Reservation System
* 03.08.09.11 — Logistics & Supply Chain Management System
* 03.08.09.12 — Manufacturing Execution System (MES)
* 03.08.09.13 — Customer Relationship Management (CRM) System
* 03.08.09.14 — Learning Management System (LMS)
* 03.08.09.15 — Government e-Governance System
* 03.08.09.16 — Multi-Tenant SaaS Platform (Capstone)

Database Design Patterns:

* 03.09.01 — Lookup (Reference) Table Pattern
* 03.09.02 — Master–Detail Pattern
* 03.09.03 — Junction Table Pattern
* 03.09.04 — Status History Pattern
* 03.09.05 — Audit Log Pattern
* 03.09.06 — Soft Delete Pattern
* 03.09.07 — Versioning Pattern
* 03.09.08 — Hierarchical (Tree) Pattern
* 03.09.09 — Polymorphic Association Pattern
* 03.09.10 — Event Log Pattern
* 03.09.11 — Multi-Tenant Pattern
* 03.09.12 — Outbox Pattern
* 03.09.13 — Idempotency Pattern
* 03.09.14 — Pattern Selection Decision Tree

---

# Chapter 04 — SQL Fundamentals

Completed sections include:

* 04.01 — SQL Syntax
* 04.02 — SQL Statements
* 04.03 — SQL Processing Pipeline
* 04.04 — SQL Keywords
* 04.05 — SQL Clauses
* 04.06 — SQL Operators & Expressions
* 04.07 — SQL Command Categories
* 04.08 — DDL Deep Dive
* 04.09 — DML Deep Dive
* 04.10 — DQL Deep Dive
* 04.11 — DCL Deep Dive
* 04.12 — TCL Deep Dive
* 04.13 — Putting It All Together: The Life of an SQL Statement
* 04.14 — SQL Comments
* 04.15 — SQL Identifiers
* 04.16 — SQL Naming Conventions
* 04.17 — SQL Formatting & Style Guide
* 04.18 — SQL Reserved Words
* 04.19 — SQL Execution Order
* 04.20 — SQL Cheat Sheet
* 04.21 — Interview Questions & Exercises
* 04.22 — Chapter 04 Recap & Knowledge Map

---

# Chapter 05 — SELECT Statement

Completed sections:

* 05.01 — Introduction to SELECT
* 05.02 — SELECT Syntax
* 05.03 — SELECT *
* 05.04 — Selecting Specific Columns
* 05.05 — Column Aliases
* 05.06 — Expressions & Calculated Columns
* 05.07 — DISTINCT
* 05.08 — NULL Handling in SELECT
* 05.09 — SELECT Without FROM
* 05.10 — SELECT into Variables (DBMS Differences)
* 05.11 — FROM Clause (Deep Dive)
* 05.12 — Execution Flow of SELECT
* 05.13 — Common SELECT Mistakes & Best Practices
* 05.14 — SELECT Cheat Sheet & Visual Knowledge Map

Chapter 05 therefore represents the first complete content module that the PWA must support.

---

# 4. Important Content Principle

Do NOT hard-code individual chapter content into UI components.

Content must be represented as structured data.

The architecture must allow future chapters to be added without rewriting application components.

For example, conceptually:

```text
Chapter
 ├── Section
 │    ├── Metadata
 │    ├── Markdown content
 │    ├── Code examples
 │    ├── Callouts
 │    ├── Exercises
 │    └── Related topics
```

The UI should consume this content model.

---

# 5. Recommended Technology Stack

Use a modern, lightweight stack.

Preferred:

* React
* TypeScript
* Vite
* React Router
* Markdown/MDX-based content
* Tailwind CSS or a similarly lightweight utility system
* Service Worker / Workbox where genuinely useful
* LocalStorage or IndexedDB for local progress
* GitHub for source control
* Vercel for deployment

Do not introduce:

* unnecessary backend infrastructure
* authentication
* external database
* CMS
* analytics platform
* complicated state-management library

unless there is a demonstrated requirement.

The first version should be **local-first and static-first**.

---

# 6. PWA Requirements

The application must behave like a real installable PWA.

Implement:

* Web App Manifest
* Service Worker
* Offline application shell
* Offline access to previously cached content
* Installability
* Proper icons
* Splash/loading behavior where appropriate
* Responsive layout
* Fast startup
* Cache strategy appropriate for static handbook content

The application must remain useful when offline.

---

# 7. Core Screens

Build the following primary screens.

## 7.1 Home

Purpose:

Introduce SQL Guide and provide immediate access to learning.

Include:

* Product title
* Short description
* Continue Learning
* Chapter navigation
* Progress overview
* Recently visited section
* Search
* Quick access to important references

Avoid a marketing-heavy landing page.

The user should reach useful content immediately.

---

# 7.2 Chapter List

Display the complete handbook structure.

Example:

```text
03 Database Relationships
    03.08 Real-World Relationship Case Studies
    03.09 Database Design Patterns

04 SQL Fundamentals
    04.01 SQL Syntax
    04.02 SQL Statements
    ...

05 SELECT Statement
    05.01 Introduction to SELECT
    05.02 SELECT Syntax
    ...
    05.14 SELECT Cheat Sheet & Visual Knowledge Map

06 WHERE Clause
    Coming Soon
```

Support:

* Expand/collapse
* Chapter numbering
* Section numbering
* Completion indicators
* Current location
* Search/filter

---

# 7.3 Reading View

This is the most important screen.

Optimize heavily for reading.

Structure:

```text
┌───────────────────────────────┐
│ Header / navigation           │
├───────────────────────────────┤
│ Breadcrumb                    │
│                               │
│ 05.11                         │
│ FROM Clause (Deep Dive)       │
│                               │
│ Introduction                  │
│                               │
│ Content                       │
│                               │
│ Code Block                    │
│                               │
│ Architecture Insight          │
│                               │
│ Content                       │
│                               │
├───────────────────────────────┤
│ Previous      Contents       Next
└───────────────────────────────┘
```

Reading must remain the dominant experience.

---

# 8. Reading Typography

Prioritize readability over visual decoration.

Requirements:

* Comfortable line height
* Reasonable content width
* Strong heading hierarchy
* Excellent code font
* Clear paragraph spacing
* Proper list spacing
* Excellent table readability
* Responsive typography
* Good contrast

Do not make the content area excessively wide.

Recommended reading width:

approximately 700–850px.

---

# 9. Code Blocks

SQL code is a major part of the application.

Code blocks must support:

* Syntax highlighting
* Copy button
* Horizontal scrolling on mobile
* Good contrast
* Line wrapping control
* Optional line numbers
* Language indicator

Example:

```sql
SELECT
    EmployeeName,
    Salary
FROM Employees
WHERE Salary > 50000;
```

The copy button should provide clear feedback:

```text
Copy
↓
Copied ✓
```

---

# 10. Architecture Callout Boxes

The handbook uses recurring architecture callouts.

Support these as first-class content components.

### 🏗️ Architecture Insight

Used for system/database architecture concepts.

### ⚡ Performance Tip

Used for optimization and performance guidance.

### 🔒 Security Note

Used for security considerations.

### 🌍 Production Consideration

Used for real-world production implications.

### 🚀 Enterprise Practice

Used for enterprise engineering practices.

Do NOT render these as ordinary blockquotes.

Give them a visually distinct but restrained treatment.

Avoid excessive colors or decorative UI.

---

# 11. Execution Order Reminder

Starting from Chapter 04 and especially Chapter 05, execution order is an important recurring teaching device.

Create a reusable component:

```text
📍 Execution Order Reminder

FROM
↓
JOIN
↓
WHERE
↓
GROUP BY
↓
HAVING
↓
SELECT
↓
DISTINCT
↓
ORDER BY
↓
LIMIT
```

The component should support highlighting the relevant clause.

For example, on a future WHERE chapter:

```text
FROM
↓
JOIN
↓
WHERE  ← You are here
↓
GROUP BY
...
```

Do not duplicate the markup manually in every chapter.

---

# 12. Navigation

Reading navigation should include:

* Previous section
* Table of Contents
* Next section

Also provide:

* Breadcrumb
* Current chapter
* Current section
* Section number

Example:

```text
SQL Guide
› Chapter 05
› SELECT Statement
› 05.11 FROM Clause
```

---

# 13. Sticky Navigation

On desktop:

A compact table-of-contents/sidebar may remain visible.

On mobile:

Use a collapsible drawer or bottom/top navigation.

Never allow navigation to dominate the reading area.

---

# 14. Search

Search is a core feature.

It must eventually search:

* Chapter titles
* Section titles
* Content
* SQL keywords
* Concepts
* Code examples

Examples:

```text
SELECT
FROM
NULL
MVCC
JOIN
SARGability
WAL
ACID
```

Search results should show:

```text
05.08 — NULL Handling in SELECT

"...NULL values behave differently from ordinary values..."

Chapter 05
```

Highlight the matching term where practical.

---

# 15. Search Architecture

Do not require a server-side search engine initially.

Generate a static search index during build.

Possible structure:

```text
search-index.json
```

Each record:

```json
{
  "id": "05.08",
  "title": "NULL Handling in SELECT",
  "chapter": "05",
  "content": "...",
  "keywords": [
    "NULL",
    "COALESCE",
    "three-valued logic"
  ]
}
```

Use client-side search.

If the content eventually becomes extremely large, reassess the architecture rather than prematurely introducing Elasticsearch or another external search service.

---

# 16. Progress Tracking

The PWA should track local learning progress.

For each section:

```text
Not Started
In Progress
Completed
```

Store progress locally.

Example:

```json
{
  "05.01": "completed",
  "05.02": "completed",
  "05.03": "in-progress"
}
```

Do not require login.

---

# 17. Continue Learning

The home screen should remember:

```text
Continue Learning

05.11 — FROM Clause (Deep Dive)

[Continue]
```

Store:

* Last section
* Reading position where practical
* Completion state

Use local storage initially.

---

# 18. Bookmarks

Allow users to bookmark sections.

Example:

```text
🔖 05.11 FROM Clause (Deep Dive)
```

Create a dedicated:

**Bookmarks**

view.

Do not require an account.

---

# 19. Notes — Recommendation

For the first version, do not implement cloud synchronization.

If notes are implemented, make them local-first:

```text
My Note

"Review cardinality estimation again."
```

Store using IndexedDB or LocalStorage depending on complexity.

This can later evolve into cloud synchronization if needed.

---

# 20. Theme

Support:

* Light
* Dark
* System

Default:

System preference.

Persist the user's choice locally.

The theme must affect:

* Reading content
* Code blocks
* Tables
* Callouts
* Navigation
* Search
* Modals
* Forms

Do not use pure black backgrounds unless required for accessibility/contrast.

---

# 21. Responsive Design

Design from approximately:

```text
320px
```

upward.

Test at:

* 320px
* 375px
* 414px
* 768px
* 1024px
* 1280px
* 1440px+

The application must remain usable at narrow mobile widths.

---

# 22. Mobile Reading Experience

On mobile:

Prioritize:

1. Content
2. Code
3. Navigation
4. Search

Avoid:

* Large hero banners
* Excessive cards
* Huge headings
* Floating widgets covering text
* Unnecessary animations

---

# 23. Tables

Technical content contains many comparison tables.

Tables must:

* Scroll horizontally on mobile
* Maintain readable typography
* Have clear headers
* Support dark mode
* Avoid forcing the entire page wider than the viewport

Example:

```text
┌────────────┬──────────┬──────────┐
│ Feature    │ PostgreSQL│ MySQL   │
├────────────┼──────────┼──────────┤
│ CTE        │ Yes      │ Yes      │
└────────────┴──────────┴──────────┘
```

---

# 24. Diagrams

The handbook contains conceptual architecture diagrams.

Initially support diagrams through:

* Markdown
* Mermaid where appropriate
* SVG
* CSS diagrams

Do not turn every conceptual diagram into an image.

Diagrams must remain responsive.

---

# 25. Interactive Learning Blocks

The SQL Guide may eventually contain interactive visualizations.

Design the content architecture so a section can declare:

```text
type: interactive
```

without forcing interactive components into every chapter.

Examples for future development:

* SQL execution pipeline
* JOIN visualizer
* Index structure
* Query execution plan
* Transaction isolation visualization
* Normalization visualizer

Do not implement all of these now.

Create the architecture so they can be added later.

---

# 26. Content Components

Create reusable components such as:

```text
<Callout />
<CodeBlock />
<ExecutionOrderReminder />
<ComparisonTable />
<Diagram />
<Exercise />
<InterviewQuestions />
<RelatedTopics />
<ChapterNavigation />
<ProgressIndicator />
```

Do not duplicate UI logic inside content files.

---

# 27. Content Schema

Define a predictable content structure.

Example:

```ts
type Section = {
    id: string;
    number: string;
    title: string;
    slug: string;
    chapter: string;
    description?: string;
    content: string;
    difficulty?: string;
    readingTime?: number;
    tags?: string[];
    relatedTopics?: string[];
};
```

Extend this only when a real requirement appears.

Avoid building an enormous CMS-style schema.

---

# 28. Chapter Metadata

Example:

```json
{
  "number": "05",
  "title": "SELECT Statement",
  "slug": "select-statement",
  "sections": [
    {
      "number": "05.01",
      "title": "Introduction to SELECT",
      "slug": "introduction-to-select"
    }
  ]
}
```

This metadata should drive:

* navigation
* breadcrumbs
* search
* progress
* previous/next
* chapter lists

---

# 29. URL Structure

Use clean URLs.

Recommended:

```text
/chapter/05/select-statement
/chapter/05/select-statement/05-01-introduction-to-select
```

or an equally consistent structure.

Do not use query-string-based navigation such as:

```text
?page=05.11
```

URLs should be shareable and bookmarkable.

---

# 30. SEO

Although this is an application, individual sections should remain indexable where possible.

Each section should have:

* unique `<title>`
* meta description
* canonical URL
* semantic headings
* proper HTML structure

Do not sacrifice PWA behavior for SEO.

---

# 31. Accessibility

Target WCAG 2.2 AA principles.

Implement:

* Keyboard navigation
* Visible focus states
* Semantic HTML
* Proper heading hierarchy
* Accessible buttons
* Accessible dialogs
* Sufficient contrast
* Reduced-motion support
* Screen-reader-friendly labels

Do not rely on color alone.

---

# 32. Performance

Performance is a first-class requirement.

Target:

* Very fast initial load
* Minimal JavaScript
* Code splitting where appropriate
* Lazy loading for heavy features
* Efficient search
* Optimized fonts
* Optimized assets
* No unnecessary API calls

Do not add dependencies simply because they are popular.

---

# 33. Offline Architecture

The service worker should cache:

## App Shell

* HTML
* CSS
* JS
* icons
* essential fonts

## Content

Cache handbook content intelligently.

The user should be able to open previously visited chapters offline.

Eventually consider precaching the entire handbook if its size remains reasonable.

---

# 34. Error Handling

Create friendly states for:

* Page not found
* Search returns no results
* Content unavailable
* Offline request failure

Example:

```text
You're offline.

This section hasn't been cached yet.

Reconnect to the internet and try again.
```

Do not expose technical stack traces to users.

---

# 35. Loading States

Keep loading states subtle.

Avoid large spinners.

Prefer:

* Skeletons
* Small progress indicators
* Instant static rendering wherever possible

---

# 36. Content Integrity

The application must preserve the handbook's technical structure.

Do not:

* rewrite content automatically
* remove sections
* merge sections
* renumber sections
* change terminology
* silently simplify technical explanations

Content and application structure are separate concerns.

---

# 37. Chapter Number Integrity

This is important.

Section numbers must never be silently changed.

For example:

```text
05.11
05.12
05.13
05.14
```

must remain exactly those numbers.

The application should validate duplicate or missing section IDs during build.

Create a build-time validation process.

Example:

```text
✓ No duplicate section IDs
✓ No duplicate slugs
✓ No missing required metadata
✓ Navigation sequence valid
```

Fail the build if serious structural errors exist.

---

# 38. Content Validation

Create validation for:

* Duplicate IDs
* Duplicate slugs
* Missing titles
* Missing section numbers
* Broken internal links
* Missing referenced sections
* Invalid code block metadata

This is especially important because the handbook will become large.

---

# 39. Design Language

Visual direction:

**Professional Developer Handbook**

Characteristics:

* Minimal
* Technical
* Clean
* Calm
* Modern
* High readability
* Strong typography
* Restrained accent color

Avoid:

* Excessive gradients
* Glassmorphism everywhere
* Excessive shadows
* Huge cards
* Gamification overload
* Cartoon illustrations
* Marketing-style UI

---

# 40. Icons

Use icons sparingly.

Icons should communicate meaning.

Examples:

```text
🔖 Bookmark
✓ Completed
▶ Continue
← Previous
→ Next
⌕ Search
☰ Menu
```

Do not place icons next to every piece of text.

---

# 41. Homepage Information Hierarchy

Suggested structure:

```text
SQL Guide

Master SQL from syntax
to database engineering.

[Continue Learning]

────────────────────

Your Progress
████████░░ 80%

────────────────────

Chapters

03 Database Relationships
04 SQL Fundamentals
05 SELECT Statement
06 WHERE Clause
...

────────────────────

Quick Reference

SQL Execution Order
SQL Cheat Sheet
...
```

Keep it compact.

---

# 42. Chapter Page

Suggested:

```text
Chapter 05

SELECT Statement

Learn how SQL retrieves,
projects, filters and processes data.

Progress: 14 / 14

Sections

✓ 05.01 Introduction to SELECT
✓ 05.02 SELECT Syntax
✓ 05.03 SELECT *
...
✓ 05.14 Cheat Sheet
```

---

# 43. Reading Page

Desktop:

```text
┌──────────────┬──────────────────────────────┬──────────────┐
│ Chapter      │                              │ On This Page │
│ Navigation   │       Reading Content        │              │
│              │                              │              │
│ 05 SELECT    │       05.11 FROM Clause     │              │
│              │                              │              │
│ ✓ 05.01      │       Content...            │              │
│ ✓ 05.02      │       Content...            │              │
│ → 05.11      │       Code...               │              │
│ ...          │                              │              │
└──────────────┴──────────────────────────────┴──────────────┘
```

Keep the right-side "On This Page" navigation optional.

Do not force a three-column layout on smaller screens.

---

# 44. Keyboard Shortcuts

Consider lightweight shortcuts:

```text
/
Search

n
Next section

p
Previous section

b
Bookmark
```

But implement only if they do not conflict with normal typing behavior.

Do not make shortcuts necessary.

---

# 45. Reading Progress

Show section reading progress subtly.

Example:

```text
05.11 FROM Clause

───────────────
Reading: 62%
```

Do not make this visually dominant.

---

# 46. Completion

At the end of a section:

```text
Section Complete

[✓ Mark as Complete]

Previous Section        Next Section
```

If the user reaches the end naturally, do not automatically mark everything complete without a deliberate product decision.

---

# 47. Chapter Completion

When all sections are completed:

```text
Chapter 05 Complete ✓
```

Progress should be calculated automatically from section states.

---

# 48. Data Persistence

Initial version:

```text
LocalStorage
```

or IndexedDB if notes/bookmarks become complex.

No account system.

No backend database.

No synchronization.

Design storage behind a small abstraction so cloud sync can be introduced later without rewriting the UI.

Example:

```ts
progressRepository
bookmarkRepository
notesRepository
```

Keep implementations simple.

---

# 49. Architecture

Use a clean but pragmatic structure.

Suggested:

```text
src/
│
├── app/
│   ├── router/
│   └── providers/
│
├── components/
│   ├── layout/
│   ├── navigation/
│   ├── content/
│   ├── code/
│   ├── callouts/
│   └── learning/
│
├── content/
│   ├── chapters/
│   ├── sections/
│   └── index.ts
│
├── data/
│   ├── chapters.ts
│   └── search-index.ts
│
├── features/
│   ├── progress/
│   ├── bookmarks/
│   ├── search/
│   └── theme/
│
├── lib/
│   ├── storage/
│   ├── validation/
│   └── utils/
│
├── pages/
│   ├── Home/
│   ├── Chapter/
│   ├── Reader/
│   ├── Search/
│   └── Bookmarks/
│
├── styles/
│
└── main.tsx
```

Adjust this structure if a simpler architecture is demonstrably better.

Do not create folders merely for architectural decoration.

---

# 50. State Management

Do not introduce Redux or another large state-management solution initially.

Use:

* React state
* Context where genuinely appropriate
* URL state
* LocalStorage/IndexedDB

Only introduce a dedicated state library if actual application complexity justifies it.

---

# 51. Testing

Implement tests for critical functionality.

At minimum:

## Content

* Section IDs
* Navigation
* Previous/next
* Chapter ordering

## Search

* Exact keyword search
* Partial search
* No-result state

## Progress

* Mark complete
* Persist completion
* Calculate chapter progress

## Bookmarks

* Add
* Remove
* Persist

## PWA

Verify:

* Manifest
* Service worker
* Installability
* Offline shell

---

# 52. Browser Testing

Test:

* Chrome
* Edge
* Firefox
* Mobile Chrome
* Mobile Safari where possible

Prioritize Chromium initially but do not knowingly introduce browser-specific behavior.

---

# 53. Lighthouse Targets

Aim for:

```text
Performance: 90+
Accessibility: 95+
Best Practices: 95+
SEO: 90+
PWA: Pass
```

Do not game Lighthouse.

Real user experience takes priority.

---

# 54. Security

Even though the first version is static/local-first:

* Do not use `dangerouslySetInnerHTML` unnecessarily.
* Sanitize rendered HTML where required.
* Do not execute arbitrary code from Markdown.
* Do not trust user-created notes as HTML.
* Avoid exposing environment secrets.
* Keep dependencies updated.
* Do not add unnecessary third-party scripts.

---

# 55. Git Workflow

Use Git properly.

Create meaningful commits such as:

```text
feat: initialize SQL Guide PWA
feat: add handbook content model
feat: implement chapter navigation
feat: implement reading view
feat: add code blocks
feat: add search
feat: add local progress
feat: add bookmarks
feat: add PWA offline support
test: add content validation
perf: optimize initial loading
```

Do not make one giant commit containing the entire project.

---

# 56. Development Process

Work incrementally.

Do NOT attempt to build the entire application in one step.

Follow this sequence.

## Phase 1 — Discovery

Inspect the existing project.

Determine:

* Current files
* Existing package manager
* Existing dependencies
* Existing configuration
* Existing content
* Existing Git state

Do not overwrite existing work blindly.

---

## Phase 2 — Foundation

Implement:

* React/Vite setup
* TypeScript
* Routing
* Global styles
* Theme system
* Basic layout
* Content model

---

## Phase 3 — Content

Import the existing Chapter 05 content first.

Do not import hundreds of future chapters before the architecture is validated.

Use Chapter 05 as the reference implementation.

---

## Phase 4 — Reading Experience

Build:

* Reader
* Headings
* Markdown
* Code blocks
* Tables
* Callouts
* Execution Order Reminder
* Navigation

---

## Phase 5 — Navigation

Implement:

* Chapter list
* Section list
* Breadcrumbs
* Previous/next
* Table of contents

---

## Phase 6 — Search

Implement client-side static search.

---

## Phase 7 — Progress

Implement:

* Completion
* Continue Learning
* Progress calculation

---

## Phase 8 — Bookmarks

Implement local bookmarks.

---

## Phase 9 — PWA

Implement:

* Manifest
* Service worker
* Offline caching
* Installability

---

## Phase 10 — Quality

Perform:

* Responsive testing
* Accessibility testing
* Lighthouse
* Performance testing
* Content validation
* Broken-link testing
* Offline testing

---

# 57. Critical Rule: Do Not Overbuild

Do NOT add:

* Authentication
* User accounts
* Backend API
* Database
* Admin panel
* CMS
* Payments
* Social features
* Notifications
* Complex analytics

unless explicitly requested later.

The initial product is a **static/local-first learning PWA**.

---

# 58. Future-Proofing

The architecture should make these possible later:

```text
Current

Static Content
      +
Local Progress
      +
Local Bookmarks

          ↓

Future

Authentication
      +
Cloud Sync
      +
User Accounts
      +
Cross-device Progress
```

But do not implement the future architecture prematurely.

---

# 59. Definition of Done

The first production-ready milestone is complete only when:

### Content

* Chapter 05 is available.
* All 05.01–05.14 sections are correctly numbered.
* Content renders correctly.
* Code examples render correctly.
* Tables work.
* Callouts work.

### Navigation

* Chapter navigation works.
* Previous/next works.
* Breadcrumbs work.
* URLs are shareable.

### Learning

* Progress works.
* Continue Learning works.
* Bookmarks work.

### Search

* Chapter 05 content is searchable.
* Search results navigate correctly.

### PWA

* Installable.
* Offline shell works.
* Cached content works.

### UI

* Mobile responsive.
* Desktop responsive.
* Dark mode works.
* Accessibility is acceptable.

### Engineering

* TypeScript has no avoidable errors.
* Build succeeds.
* No broken routes.
* No console errors in normal operation.
* Content validation passes.

---

# 60. Important Instruction About Existing Content

The handbook content is the source of truth.

Do not invent missing chapters.

Do not silently modify technical content.

Do not change section numbering.

Do not simplify content unless explicitly instructed.

If content must be transformed from Markdown into structured content, preserve:

* headings
* code
* tables
* lists
* callouts
* exercises
* interview questions
* summaries

exactly in meaning.

---

# 61. Final UX Goal

When the user opens SQL Guide, the experience should communicate:

> "This is a serious SQL handbook that I can actually study from."

The application should feel:

```text
Fast
+
Calm
+
Technical
+
Readable
+
Structured
+
Reliable
```

rather than:

```text
Flashy
+
Crowded
+
Gamified
+
Marketing-heavy
```

---

# 62. First Task

Before writing application code:

1. Inspect the existing repository/project.
2. Identify the current stack.
3. Identify where the SQL handbook content currently exists.
4. Identify whether any existing UI or design system should be preserved.
5. Identify package manager and build tooling.
6. Identify current Git status.
7. Produce a concise architecture assessment.
8. Propose the minimum required changes.
9. Do NOT start a massive rewrite automatically.

After the assessment, proceed with **Phase 1 — Foundation** only.

Stop after completing the phase and report:

* What was inspected
* What was changed
* Files created
* Files modified
* Dependencies added
* Why each dependency was necessary
* Tests/build performed
* Any issues discovered
* What the next phase should be

Do not silently proceed through all phases.

---

# 63. Engineering Principle

For every implementation decision, ask:

> **"Is this necessary for the SQL Guide's current requirements?"**

If the answer is no, don't build it yet.

Prefer:

```text
Simple architecture
+
Strong content model
+
Excellent reading experience
+
Progressive enhancement
```

over:

```text
Complex architecture
+
Premature abstraction
+
Unnecessary infrastructure
```

Build the smallest architecture capable of becoming a genuinely excellent SQL learning PWA.
