---
title: "11.16 - Common Window Function Mistakes & Best Practices"
description: "A catalogue of window function mistakes—filtering in WHERE, non-deterministic ordering, the default RANGE frame, the LAST_VALUE trap, missing PARTITION BY, wrong ranking function, filtering too early or too late, DISTINCT after windows, NULL ordering, sparse time series and unaligned definitions—with symptoms, fixes and a review checklist."
chapter: 11
section: 11.16
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 35 min
lastUpdated: 2026-09-25
---

# 11.16 Common Window Function Mistakes & Best Practices

---

# Learning Objectives

After completing this section, you will be able to:

- Recognise the most common window function mistakes from their symptoms.
- Explain the cause of each mistake.
- Apply the standard fix for each.
- Review window queries with a checklist.

---

# How Window Mistakes Show Up

| Symptom | Likely mistake |
|---------|----------------|
| "Window functions are not allowed in WHERE" | 1 |
| Different "latest" row on each run | 2 |
| Running total jumps on tied dates | 3 |
| `LAST_VALUE` equals the current row | 4 |
| Per-customer figure identical on every row | 5 missing `PARTITION BY` |
| Wrong number of rows in a top-N | 6 wrong ranking function |
| Running total starts at zero in the displayed range | 7 filtering too early |
| Ranking includes rows that should not compete | 8 filtering too late |
| `DISTINCT` does not reduce rows | 9 |
| `NULL`s appear as top earners | 10 |
| 7-day average spans two weeks | 11 sparse time series |
| Query slow, several sorts in plan | 12 unaligned definitions |

---

# Mistake 1: Filtering on a Window in WHERE

```sql
-- ❌
SELECT * FROM Orders
WHERE ROW_NUMBER() OVER (PARTITION BY CustomerID ORDER BY OrderDate DESC) = 1;

-- ✅
SELECT * FROM (
    SELECT o.*, ROW_NUMBER() OVER (PARTITION BY CustomerID
                                   ORDER BY OrderDate DESC, OrderID DESC) AS rn
    FROM Orders AS o
) AS t
WHERE t.rn = 1;
```

**Cause:** windows are computed after `WHERE`. **Fix:** derived table or CTE (or `QUALIFY` where supported).

---

# Mistake 2: Non-Deterministic Ordering

```sql
-- ❌ Two orders on the latest date: which gets rn = 1 is arbitrary
ROW_NUMBER() OVER (PARTITION BY CustomerID ORDER BY OrderDate DESC)

-- ✅
ROW_NUMBER() OVER (PARTITION BY CustomerID ORDER BY OrderDate DESC, OrderID DESC)
```

**Symptom:** results differ between runs, environments or after index changes. Also affects `LAG`, `LEAD`, `FIRST_VALUE` and `ROWS` frames. **Fix:** add the primary key as a final tiebreaker.

---

# Mistake 3: Relying on the Default RANGE Frame

```sql
-- ❌ Rows with the same OrderDate share one running total
SUM(TotalAmount) OVER (ORDER BY OrderDate)

-- ✅
SUM(TotalAmount) OVER (ORDER BY OrderDate, OrderID
                       ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
```

**Cause:** with `ORDER BY`, the default frame is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`, which includes peers. It is also slower on SQL Server.

---

# Mistake 4: The LAST_VALUE Trap

```sql
-- ❌ Returns the current row's value
LAST_VALUE(OrderDate) OVER (PARTITION BY CustomerID ORDER BY OrderDate)

-- ✅
FIRST_VALUE(OrderDate) OVER (PARTITION BY CustomerID ORDER BY OrderDate DESC, OrderID DESC)
```

**Cause:** the default frame ends at the current row (Section 11.08).

---

# Mistake 5: Missing PARTITION BY

```sql
-- ❌ Rank across all customers, not within each
RANK() OVER (ORDER BY TotalAmount DESC)

-- ✅
RANK() OVER (PARTITION BY CustomerID ORDER BY TotalAmount DESC)
```

Also: `LAG` without `PARTITION BY` compares a customer's first order with another customer's last.

---

# Mistake 6: Wrong Ranking Function

| Requirement | Wrong | Right |
|-------------|-------|-------|
| Exactly 3 rows per group | `RANK() <= 3` | `ROW_NUMBER() <= 3` |
| Top 3 with ties | `ROW_NUMBER() <= 3` | `RANK() <= 3` |
| Top 3 distinct values | `RANK() <= 3` | `DENSE_RANK() <= 3` |

Decide the tie rule first (Section 11.03).

---

# Mistake 7: Filtering Too Early

```sql
-- ❌ September rows only: running total restarts at September 1
SELECT SalesDate, SUM(Revenue) OVER (ORDER BY SalesDate ROWS UNBOUNDED PRECEDING) AS YTD
FROM DailySales
WHERE SalesDate >= DATE '2026-09-01';

-- ✅ Compute over the year, display September
SELECT * FROM (
    SELECT SalesDate, Revenue,
           SUM(Revenue) OVER (PARTITION BY EXTRACT(YEAR FROM SalesDate)
                              ORDER BY SalesDate ROWS UNBOUNDED PRECEDING) AS YTD
    FROM DailySales
    WHERE SalesDate >= DATE '2026-01-01'
) AS t
WHERE t.SalesDate >= DATE '2026-09-01';
```

The same applies to `LAG` (previous period needed), moving averages (preceding days needed) and ranks against a full population.

---

# Mistake 8: Filtering Too Late

```sql
-- ❌ Cancelled orders compete for rn = 1, then are removed: some customers get no row
SELECT * FROM (
    SELECT o.*, ROW_NUMBER() OVER (PARTITION BY CustomerID ORDER BY OrderDate DESC, OrderID DESC) AS rn
    FROM Orders AS o
) AS t
WHERE t.rn = 1 AND t.Status <> 'Cancelled';

-- ✅ Exclude cancelled orders before ranking
SELECT * FROM (
    SELECT o.*, ROW_NUMBER() OVER (PARTITION BY CustomerID ORDER BY OrderDate DESC, OrderID DESC) AS rn
    FROM Orders AS o
    WHERE o.Status <> 'Cancelled'
) AS t
WHERE t.rn = 1;
```

Mistakes 7 and 8 are two sides of one rule: filter **inside** the windowed query for rows that should not participate; filter **outside** for rows that should participate but not be displayed.

---

# Mistake 9: DISTINCT After Windows

```sql
-- ❌ Expecting one row per customer; DISTINCT sees different rn values
SELECT DISTINCT CustomerID, ROW_NUMBER() OVER (ORDER BY CustomerID) FROM Orders;

-- ❌ Using DISTINCT to collapse window aggregates—works, but hides intent and sorts twice
SELECT DISTINCT CustomerID, SUM(TotalAmount) OVER (PARTITION BY CustomerID) FROM Orders;

-- ✅
SELECT CustomerID, SUM(TotalAmount) FROM Orders GROUP BY CustomerID;
```

---

# Mistake 10: NULLs in Rankings

```sql
-- ❌ PostgreSQL/Oracle: NULL salaries rank first in DESC order
DENSE_RANK() OVER (PARTITION BY DepartmentID ORDER BY Salary DESC)

-- ✅
... WHERE Salary IS NOT NULL                         -- exclude, or
DENSE_RANK() OVER (… ORDER BY Salary DESC NULLS LAST) -- PostgreSQL, Oracle, SQLite
```

---

# Mistake 11: Row Frames over Sparse Time Series

```sql
-- ❌ "Last 7 days" = last 7 rows, spanning more days when data is missing
AVG(Revenue) OVER (ORDER BY SalesDate ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)

-- ✅ Value-based frame (PostgreSQL, MySQL, Oracle)
AVG(Revenue) OVER (ORDER BY SalesDate RANGE BETWEEN INTERVAL '6' DAY PRECEDING AND CURRENT ROW)
-- ✅ or densify with a calendar table first (Section 11.06)
```

---

# Mistake 12: Unaligned Window Definitions

```sql
-- ❌ Three sorts for no reason
ROW_NUMBER() OVER (PARTITION BY CustomerID ORDER BY OrderDate)
LAG(TotalAmount) OVER (PARTITION BY CustomerID ORDER BY OrderDate, OrderID)
SUM(TotalAmount) OVER (PARTITION BY CustomerID ORDER BY OrderID ROWS UNBOUNDED PRECEDING)

-- ✅ One definition
WINDOW w AS (PARTITION BY CustomerID ORDER BY OrderDate, OrderID)
```

---

# Mistake 13: Windows Where GROUP BY Was Meant

```sql
-- ❌ Five rows per customer, each repeating the same total
SELECT CustomerID, SUM(TotalAmount) OVER (PARTITION BY CustomerID) FROM Orders;
```

If the output grain is "one row per customer", use `GROUP BY`. Use windows when the output grain is the detail row.

---

# Mistake 14: Integer Division in Shares

```sql
-- ❌ SQL Server / integers: 0 for everything below 100%
Quantity / SUM(Quantity) OVER ()

-- ✅
1.0 * Quantity / NULLIF(SUM(Quantity) OVER (), 0)
```

---

# Review Checklist

```text
Definition
  □ PARTITION BY present for every per-group figure
  □ ORDER BY unique (primary key tiebreaker) for position-dependent functions
  □ Explicit ROWS/RANGE frame on every aggregate window with ORDER BY
  □ No LAST_VALUE without a full frame (prefer reversed FIRST_VALUE)
  □ Ranking function matches the tie rule

Filtering
  □ Participation filters inside; display filters outside
  □ Window results filtered in a derived table / CTE
  □ NULLs excluded or explicitly ordered

Semantics
  □ Output grain matches (window for detail, GROUP BY for groups)
  □ Time windows correct for sparse data
  □ Ratios use decimal arithmetic and NULLIF

Performance
  □ Window definitions shared (named windows)
  □ Input filtered / pre-aggregated / narrow
  □ Index in (partition, order) order for hot queries
  □ Plan checked for sorts and spills
```

---

# Visual Representation

```text
                         Window mistakes
                               │
    ┌───────────────┬──────────┼────────────┬───────────────┐
    │               │          │            │               │
 DEFINITION      FRAMES     FILTERING     NULLS / DATA    PERFORMANCE
    │               │          │            │               │
 no PARTITION   default     in WHERE      NULLs rank      many sorts
 ties in ORDER  RANGE       too early     first           wide rows
 wrong rank fn  LAST_VALUE  too late      sparse series   no index
 GROUP BY meant             DISTINCT      int division    OVER () huge
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← mistakes 7 and 8: what participates is decided here
4. GROUP BY    ← mistake 13: GROUP BY may be what you wanted
5. HAVING
6. WINDOW      ← mistakes 2–6, 10–12 happen here
7. SELECT
8. DISTINCT    ← mistake 9: too late to remove window rows
9. ORDER BY
10. LIMIT / FETCH / TOP
```

Mistake 1 is simply trying to use step 6's results at step 3.

---

# How the DBMS Executes This

```text
Mistake                        What the engine does
─────────────────────────────  ───────────────────────────────────────────
Window in WHERE                parse/bind error
Ties in ORDER BY               picks whatever order the sort produced
Default RANGE frame            includes peers; SQL Server uses on-disk spool
LAST_VALUE default frame       returns last row of frame = current row/peers
Missing PARTITION BY           one partition for the whole result
Unaligned definitions          one sort per definition
```

None of these is a bug in the engine; each is the standard behaviour of what was written.

---

# 🔬 Engine Deep Dive

Non-determinism from ties is especially treacherous because it often appears stable: the same plan returns the same order day after day. It changes when the plan changes—a new index, parallelism, a version upgrade, different statistics—so the bug surfaces far from the code that caused it. Parallel plans are a common trigger, because rows from different workers interleave nondeterministically.

---

# 🏗️ Architecture Insight

Window mistakes are mostly **specification** mistakes: which rows participate, how ties break, what "last 7 days" means, whether `NULL` is a value. Writing those decisions into the requirement—and into comments beside each window—prevents most of them before SQL is written.

---

# ⚡ Performance Tip

When reviewing window queries for performance, count distinct window definitions first. Each extra definition is usually an extra full sort of the input.

---

# 🔒 Security Note

Mistake 8 (filtering too late) can leak data: if rows a user may not see are ranked alongside their rows and filtered out afterwards, the remaining ranks and running totals still reflect the hidden rows. Apply permission filters inside the windowed query.

---

# SQL Standard vs Vendor Differences

| Mistake | Engine-specific twist |
|---------|----------------------|
| Default `RANGE` frame | Same semantics everywhere; much slower on SQL Server row mode |
| `NULL` order | First for `DESC` on PostgreSQL/Oracle; last on MySQL/SQL Server/SQLite |
| Time-based frames | `RANGE INTERVAL` unavailable on SQL Server and SQLite |
| `LAST_VALUE` fix | `IGNORE NULLS` variants only on Oracle / SQL Server 2022 |
| Integer division | SQL Server and SQLite divide integers; PostgreSQL divides integers too; MySQL returns decimals |

> **Portability Tip:** Explicit frames, unique orderings, `CASE`-based `NULL` ordering and decimal arithmetic make window queries behave identically on every engine.

---

# Common Mistakes

### Mistake 1

Fixing a symptom (adding `DISTINCT`, filtering results) instead of the definition (partition, order, frame).

---

### Mistake 2

Testing on data without ties, `NULL`s or missing days.

---

# Best Practices

✔ Unique ordering, explicit frames, explicit partitions.

✔ Participation filters inside, display filters outside.

✔ Choose the ranking function by the tie rule.

✔ Handle `NULL`s and sparse time explicitly.

✔ Share definitions and check plans.

✔ Test with ties, `NULL`s and gaps in the data.

---

# Interview Questions

## Basic

1. Why can't a window function be used in `WHERE`?
2. Why does a running total sometimes repeat the same value on consecutive rows?
3. Why does `LAST_VALUE` often return the current row?

## Intermediate

4. What is the difference between filtering inside and outside a windowed subquery?
5. Why is `ROW_NUMBER` with a non-unique order dangerous?
6. How do `NULL`s affect a descending ranking on PostgreSQL?

## Advanced

7. How can filtering too late leak information?
8. Why do non-determinism bugs from ties often appear only after a plan change?
9. How would you review a report query with twelve window columns?

---

# Hands-on Exercises

## Exercise 1

For mistakes 2, 3, 4 and 7, write the incorrect query, construct data that exposes it, and fix it.

---

## Exercise 2

Apply the review checklist to three window queries from earlier sections of this chapter.

---

## Exercise 3

Create test data with duplicate dates, `NULL` salaries and missing days, and run the chapter's examples against it.

---

## Exercise 4

Reduce a query with four window definitions to one or two and compare plans.

---

# Related Topics

- **11.02 — The OVER Clause (PARTITION BY and ORDER BY)**
- **11.05 — Window Frames (ROWS, RANGE and GROUPS)**
- **11.10 — Top-N per Group, Deduplication and QUALIFY**
- **11.13 — NULL Handling in Window Functions**
- **10.16 — Common Index Mistakes & Best Practices**
- **09.16 — Common Subquery Mistakes & Best Practices**

---

# Summary

Window function mistakes fall into five families: definition (missing partitions, non-unique orderings, the wrong ranking function, windows where `GROUP BY` was meant), frames (the default `RANGE` frame's peer behaviour and the `LAST_VALUE` trap), filtering (using windows in `WHERE`, filtering participation too late or display too early, `DISTINCT` after windows), data (`NULL` ordering, sparse time series, integer division) and performance (unaligned definitions and unfiltered input). Each has a mechanical fix, most of them captured by one habit: write the partition, a unique order and the frame explicitly, and decide which rows participate before ranking.
