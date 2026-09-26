---
title: "11.17 - Window Function Cheat Sheet & Visual Knowledge Map"
description: "A complete window function reference: OVER syntax, every function family, frame units and defaults, common patterns (running totals, moving averages, top-N, dedup, gaps and islands, carry-forward), NULL rules, execution and indexing rules, vendor support, and a chapter-wide knowledge map."
chapter: 11
section: 11.17
category: Data Query Language (DQL)
difficulty: All Levels
readingTime: 25 min
lastUpdated: 2026-09-25
---

# 11.17 Window Function Cheat Sheet & Visual Knowledge Map

---

# Learning Objectives

After completing this section, you will be able to:

- Recall window syntax and every function family from one reference.
- Recall frame units, boundaries and defaults.
- Apply the standard window patterns quickly.
- Recall the `NULL`, execution and indexing rules.
- Locate any topic in the chapter from the knowledge map.

---

# Syntax Reference

```sql
function(args) OVER (
    [PARTITION BY p1, p2]
    [ORDER BY o1 [ASC|DESC] [NULLS FIRST|LAST], o2]
    [{ROWS | RANGE | GROUPS} BETWEEN start AND end [EXCLUDE …]]
)

function(args) OVER w
function(args) OVER (w ROWS BETWEEN …)
… WINDOW w AS (PARTITION BY … ORDER BY …)        -- after HAVING, before ORDER BY

-- Ranking
ROW_NUMBER() OVER (PARTITION BY p ORDER BY o, pk)
RANK()       OVER (PARTITION BY p ORDER BY o)
DENSE_RANK() OVER (PARTITION BY p ORDER BY o)
NTILE(4)     OVER (ORDER BY o)

-- Aggregates
SUM(x)   OVER (PARTITION BY p)                                           -- partition total
SUM(x)   OVER (PARTITION BY p ORDER BY o, pk ROWS UNBOUNDED PRECEDING)   -- running total
AVG(x)   OVER (ORDER BY d ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)      -- moving average
x / SUM(x) OVER ()                                                       -- share of total
SUM(SUM(x)) OVER (PARTITION BY year)                                     -- window over GROUP BY

-- Offset and value
LAG(x [, n [, default]])  OVER (PARTITION BY p ORDER BY o, pk)
LEAD(x [, n [, default]]) OVER (PARTITION BY p ORDER BY o, pk)
FIRST_VALUE(x) OVER (PARTITION BY p ORDER BY o, pk)
FIRST_VALUE(x) OVER (PARTITION BY p ORDER BY o DESC, pk DESC)            -- "last" value
NTH_VALUE(x, 2) OVER (… ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)

-- Distribution
PERCENT_RANK() OVER (ORDER BY o)
CUME_DIST()    OVER (ORDER BY o)
PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x) [OVER (PARTITION BY p)]   -- vendor-specific

-- Filter on a window result
SELECT * FROM (SELECT …, ROW_NUMBER() OVER (…) AS rn FROM t) AS s WHERE rn = 1;
```

---

# Function Families

| Family | Functions | `ORDER BY` | Frame | Ties |
|--------|-----------|-----------|-------|------|
| Ranking | `ROW_NUMBER` | Required | Ignored | Broken arbitrarily (add pk) |
| | `RANK` | Required | Ignored | Shared, gaps after |
| | `DENSE_RANK` | Required | Ignored | Shared, no gaps |
| | `NTILE(n)` | Required | Ignored | May split ties |
| Aggregate | `SUM AVG COUNT MIN MAX …` | Optional | Used | Peers share value under `RANGE` |
| Offset | `LAG`, `LEAD` | Required | Ignored | Order among ties arbitrary |
| Value | `FIRST_VALUE`, `LAST_VALUE`, `NTH_VALUE` | Needed in practice | Used | Order among ties arbitrary |
| Distribution | `PERCENT_RANK`, `CUME_DIST` | Required | Ignored | Shared |

---

# Frames

```text
Units      ROWS    physical rows
           RANGE   value distance on the single ORDER BY key (peers included)
           GROUPS  peer groups

Bounds     UNBOUNDED PRECEDING · n PRECEDING · CURRENT ROW · n FOLLOWING · UNBOUNDED FOLLOWING

Defaults   no ORDER BY   → whole partition
           ORDER BY      → RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW   (ties included!)

Common     running       ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           moving 7      ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
           7 days        RANGE BETWEEN INTERVAL '6' DAY PRECEDING AND CURRENT ROW
           centered      ROWS BETWEEN 3 PRECEDING AND 3 FOLLOWING
           remaining     ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING
           whole         ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
           previous only ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
```

---

# Pattern Library

| Problem | Pattern | Section |
|---------|---------|---------|
| Detail + group figure | `AGG(x) OVER (PARTITION BY g)` | 11.04 |
| Percent of total | `x / SUM(x) OVER ()` | 11.04 |
| Running total / balance | `SUM … ROWS UNBOUNDED PRECEDING` | 11.06 |
| Period-to-date | Partition by period + running frame | 11.06 |
| Moving average | Bounded `ROWS` / `RANGE` frame | 11.06 |
| Change vs previous | `x − LAG(x)` | 11.07 |
| Year-over-year | `LAG(x) OVER (PARTITION BY month ORDER BY year)` | 11.07 |
| Validity intervals | `LEAD(ChangedAt)` | 11.07 |
| First/latest attributes | `FIRST_VALUE` (reversed for latest) | 11.08 |
| Median / percentiles | `PERCENTILE_CONT` or `ROW_NUMBER` + `COUNT` | 11.09 |
| Latest row per key / top N | `ROW_NUMBER` in derived table | 11.10 |
| Deduplicate | `ROW_NUMBER … > 1` → delete | 11.10 |
| Gaps | `LEAD(x) − x > 1` | 11.12 |
| Consecutive runs | `x − ROW_NUMBER()` | 11.12 |
| Runs of equal state / sessions | `LAG` flag + running `SUM` | 11.12 |
| Merge intervals | Running `MAX(end)` over previous + flag + sum | 11.12 |
| Carry forward | `IGNORE NULLS` or running `COUNT(x)` groups | 11.13 |

---

# NULL Rules

```text
PARTITION BY    all NULL keys → one partition
ORDER BY        NULLs first (MySQL, SQL Server, SQLite) or last (PostgreSQL, Oracle) ascending
                → NULLS FIRST/LAST or CASE ordering
Aggregates      skip NULLs; empty / all-NULL frame → NULL (COUNT → 0)
LAG/LEAD        default only when no row exists, not when the value is NULL
IGNORE NULLS    Oracle, SQL Server 2022+; else running-COUNT carry-forward
Change detect   IS DISTINCT FROM / <=> instead of <>
```

---

# Filtering Rules

```text
Participation (who is ranked / summed)   → WHERE inside the windowed query
Display (which rows are shown)           → WHERE outside, on the derived table
Window results                           → derived table / CTE (or QUALIFY where available)
One row per group                        → GROUP BY, not window + DISTINCT
```

---

# Execution and Performance

```text
Logical position   … HAVING → WINDOW → SELECT → DISTINCT → ORDER BY → LIMIT
Cost               sort by (PARTITION BY, ORDER BY) — one per distinct definition
Streams            ranking, LAG, running and sliding ROWS frames
Buffers            whole-partition aggregates, NTILE, PERCENT_RANK, CUME_DIST,
                   UNBOUNDED FOLLOWING frames, RANGE peers, OVER () (entire result)

Performance rules
1. Filter, pre-aggregate and project narrowly before windowing
2. Share window definitions (named windows); align final ORDER BY
3. Index (equality filters, partition, order) and cover the query
4. Explicit ROWS frames; reversed FIRST_VALUE instead of LAST_VALUE
5. Top-N: ROW_NUMBER for many small groups, LATERAL for few large ones
6. Watch plans for extra sorts and spills
```

---

# Vendor Quick Reference

| Feature | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|---------|-----------|-------|-----------|--------|--------|
| Window functions | 8.4+ | 8.0+ | 2005+ (full 2012+) | 8i+ | 3.25+ |
| `RANGE` value offsets | ✅ (11+) | ✅ | ❌ | ✅ | ✅ numeric |
| `GROUPS`, `EXCLUDE` | ✅ (11+) | ❌ | ❌ | ✅ (21c+) | ✅ (3.28+) |
| `WINDOW` clause | ✅ | ✅ | ✅ (2022+) | ✅ (21c+) | ✅ |
| `NULLS FIRST/LAST` | ✅ | ❌ | ❌ | ✅ | ✅ (3.30+) |
| `IGNORE NULLS` | ❌ | ❌ | ✅ (2022+) | ✅ | ❌ |
| `NTH_VALUE` | ✅ | ✅ | ❌ | ✅ | ✅ |
| `COUNT(DISTINCT) OVER` | ❌ | ❌ | ❌ | ✅ | ❌ |
| Windowed `PERCENTILE_CONT` | ❌ | ❌ | ✅ | ✅ | ❌ |
| `QUALIFY` | ❌ | ❌ | ❌ | ❌ | ❌ |
| Rank-filter early stop | ✅ (15+) | ❌ | Partial | ✅ | ❌ |

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← participation filters
4. GROUP BY    ← windows can run over groups (SUM(SUM(x)) OVER …)
5. HAVING
6. WINDOW      ← every window function in the chapter is computed here
7. SELECT
8. DISTINCT
9. ORDER BY    ← may use window results
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Parse → Bind → Optimize → Execute

Bind      resolve named windows; reject windows in WHERE / GROUP BY / HAVING
Optimize  group functions by definition; order to share sorts;
          use index order / incremental sort; push rank filters as run conditions
Execute   Sort → Window operator (partitions, peers, frames) → Project
          stream where possible, buffer partitions where required, spill if too large
```

---

# Visual Knowledge Map

```text
                           CHAPTER 11 — Window Functions
                                        │
     ┌──────────────────┬───────────────┴───────────────┬────────────────────┐
     │                  │                               │                    │
 FOUNDATIONS        FUNCTIONS                       PATTERNS            EXECUTION
     │                  │                               │                    │
11.01 Intro        11.03 Ranking                  11.06 Running /       11.14 Execution
11.02 OVER         11.04 Aggregates                     Moving                flow
11.05 Frames       11.07 LAG / LEAD               11.10 Top-N / Dedup   11.15 Performance
11.11 WINDOW       11.08 FIRST / LAST / NTH       11.12 Gaps & Islands        + Indexes
                   11.09 Distribution             11.13 NULLs
                                        │
                              ┌─────────┴─────────┐
                         11.16 Mistakes      11.17 Cheat Sheet
```

```text
Dependencies

  08.02 Aggregate functions             ──→ 11.04
  08.04 NULL in aggregates              ──→ 11.04, 11.13
  08.13 Percentiles                     ──→ 11.09
  09.07 Correlated subqueries           ──→ 11.01, 11.03, 11.07 (replaced by windows)
  09.08 Derived tables                  ──→ 11.10 (filtering window results)
  09.10 LATERAL                         ──→ 11.10, 11.15 (top-N alternative)
  10.11 Indexing for ORDER BY           ──→ 11.15
  11.xx Window Functions                ──→ 12.xx Scalar Functions, 13.xx Date and Time Functions,
                                            15.xx Query Optimization
```

---

# One-Page Summary

```text
CONCEPTS
  A window function adds a value per row, computed over related rows; rows are not collapsed
  OVER = PARTITION BY (which rows) + ORDER BY (in what order) + frame (how far)
  Windows run after HAVING, before DISTINCT / ORDER BY / LIMIT

RULES
  Unique ORDER BY (add the primary key) for anything position-dependent
  Write the frame explicitly whenever an aggregate window has ORDER BY
  ROWS for row counts; RANGE intervals or a calendar table for time
  Reversed FIRST_VALUE instead of LAST_VALUE
  ROW_NUMBER = exactly N · RANK = with ties · DENSE_RANK = top values
  Filter window results in a derived table; participation filters inside
  Decide NULL treatment: exclude, NULLS LAST, IS DISTINCT FROM, carry forward
  Filter / aggregate before windowing; share definitions; index (partition, order)
```

---

# 🏗️ Architecture Insight

The chapter reduces to one idea: *keep the row, add the context*. Every pattern—running totals, rankings, comparisons with previous periods, sessions, latest state—is a way of giving each detail row information about its neighbours or its group, computed once from sorted data. Designs that store immutable detail and derive context with windows stay simpler and more correct than designs that store derived context and keep it in sync.

---

# ⚡ Performance Tip

If you remember one performance rule from this chapter: a window query costs a sort per distinct window definition, so reduce the rows, share the definitions, and let an index in `(partition, order)` order do the sorting for you.

---

# 💡 Did You Know?

Many analysts learn window functions through the "gaps and islands" puzzles popularised in the SQL Server community by Itzik Ben-Gan. The row-number-difference technique for consecutive runs is decades old, from the time when ranks had to be computed with self-joins. Window functions made it a two-line idiom.

---

# Related Topics

- **11.01 — Introduction to Window Functions**
- **11.05 — Window Frames (ROWS, RANGE and GROUPS)**
- **11.10 — Top-N per Group, Deduplication and QUALIFY**
- **11.16 — Common Window Function Mistakes & Best Practices**
- **10.17 — Index Cheat Sheet & Visual Knowledge Map**
- **09.17 — Subquery Cheat Sheet & Visual Knowledge Map**
- **08.17 — GROUP BY Cheat Sheet & Visual Knowledge Map**
- **12.xx — Scalar Functions**

---

# Summary

This section condenses Chapter 11 into a single reference: `OVER` syntax with partitions, orderings, frames and named windows; ranking, aggregate, offset, value and distribution functions and how each treats ties and frames; frame units and defaults; a library of patterns from running totals to gaps and islands and carry-forward; rules for `NULL`s and for where to filter; the execution model of sorts, streaming and buffering; indexing and performance rules; and vendor support. One idea carries the whole chapter—keep the row, add the context—and the knowledge map shows how windows build on aggregation, subqueries and indexing from earlier chapters.
