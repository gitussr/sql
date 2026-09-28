---
title: "14.13 - Materialization and Inlining (MATERIALIZED and NOT MATERIALIZED)"
description: "Whether a CTE is inlined into the outer query or materialized into a work table, and why it matters: predicate pushdown, index use, repeated evaluation and optimization fences; the rules on PostgreSQL before and after version 12 with MATERIALIZED and NOT MATERIALIZED, SQL Server's always-inline behaviour, Oracle's MATERIALIZE and INLINE hints, MySQL merge and materialize with MERGE/NO_MERGE hints, SQLite's materialization hints, and how to choose deliberately."
chapter: 14
section: 14.13
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 14.13 Materialization and Inlining (MATERIALIZED and NOT MATERIALIZED)

---

# Learning Objectives

After completing this section, you will be able to:

- Explain the difference between inlining and materializing a CTE.
- Predict each engine's default behaviour.
- Force either behaviour where the engine allows it.
- Recognise when materialization helps and when it hurts.
- Read the plan to see which one happened.

---

# Two Ways to Run a CTE

```text
INLINING                                      MATERIALIZATION
the CTE's text is substituted into the         the CTE is computed once into a temporary
outer query, like a derived table              work table; references scan that table

+ outer WHERE can be pushed into the CTE       + computed once, however often referenced
+ indexes on base tables usable for outer      + acts as an "optimization fence":
  filters and joins                              isolates a complex step
- referenced N times → computed N times        - outer filters NOT pushed in → computes
                                                 rows that are then thrown away
                                               - work table has no indexes, rough statistics
```

Neither is always better. The same query can be 1000× faster or slower depending on which one happens.

---

# Why It Matters: Predicate Pushdown

```sql
WITH CustomerTotals AS (
    SELECT CustomerID, SUM(TotalAmount) AS Total
    FROM Orders
    GROUP BY CustomerID
)
SELECT * FROM CustomerTotals WHERE CustomerID = 42;
```

```text
inlined:       filter pushed into the CTE → index seek on Orders(CustomerID = 42) → aggregate 1 customer
materialized:  aggregate ALL customers into a work table → scan it → keep customer 42
```

On a table with millions of orders, the inlined plan reads a handful of rows; the materialized plan reads everything.

# Why It Matters: Repeated References

```sql
WITH Expensive AS (
    SELECT … heavy aggregation over a large table …
)
SELECT … FROM Expensive AS a JOIN Expensive AS b ON …;
```

```text
inlined:       heavy aggregation runs twice
materialized:  heavy aggregation runs once; both references scan the result
```

---

# PostgreSQL

| Version | Default |
|---------|---------|
| ≤ 11 | **Always materialized** — every CTE is an optimization fence |
| 12+ | Inlined if non-recursive, free of side effects (no data modification, no volatile functions) and referenced **once**; otherwise materialized |

PostgreSQL 12+ lets you choose:

```sql
-- Force materialization (compute once; fence)
WITH Totals AS MATERIALIZED (
    SELECT CustomerID, SUM(TotalAmount) AS Total FROM Orders GROUP BY CustomerID
)
SELECT … FROM Totals AS a JOIN Totals AS b ON …;

-- Force inlining even though referenced twice (allow pushdown into each reference)
WITH Recent AS NOT MATERIALIZED (
    SELECT * FROM Orders WHERE OrderDate >= CURRENT_DATE - 30
)
SELECT * FROM Recent WHERE CustomerID = 42
UNION ALL
SELECT * FROM Recent WHERE CustomerID = 43;
```

Upgrading from PostgreSQL 11 to 12 changed the behaviour of existing CTEs: queries that relied on the fence (for example, to force a join order) became different, usually faster. Recursive and data-modifying CTEs are always materialized.

---

# SQL Server

SQL Server **never** materializes a non-recursive CTE. It is always expanded like a view:

```text
WITH X AS (…) SELECT … FROM X a JOIN X b …   → X's plan appears twice in the execution plan
```

There is no hint to change this. To compute once, write the intermediate result to a **temporary table** (`#X`) or a table variable, which also gives it statistics (temporary tables) and allows indexes.

Recursive CTEs use spool operators internally, but that is the recursion mechanism, not user-controllable materialization.

---

# Oracle

Oracle's optimizer decides, typically materializing a `WITH` subquery that is referenced more than once (shown in the plan as `TEMP TABLE TRANSFORMATION` and a `SYS_TEMP_…` table) and inlining one referenced once. Hints override the choice:

```sql
WITH Totals AS (
    SELECT /*+ MATERIALIZE */ CustomerID, SUM(TotalAmount) AS Total
    FROM Orders GROUP BY CustomerID
)
SELECT …;

WITH Totals AS (
    SELECT /*+ INLINE */ CustomerID, SUM(TotalAmount) AS Total
    FROM Orders GROUP BY CustomerID
)
SELECT …;
```

`MATERIALIZE` is widely used; `INLINE` is less formally documented but supported.

---

# MySQL

MySQL treats a CTE like a derived table: the optimizer **merges** it into the outer query when possible, otherwise **materializes** it. A CTE referenced several times is materialized once and shared. Merging is prevented by aggregation, `DISTINCT`, `LIMIT`, window functions and similar constructs—but MySQL 8.0.22+ can still push outer conditions down into a materialized derived table/CTE (`derived_condition_pushdown`).

Hints:

```sql
WITH Totals AS (SELECT CustomerID, SUM(TotalAmount) AS Total FROM Orders GROUP BY CustomerID)
SELECT /*+ NO_MERGE(Totals) */ * FROM Totals WHERE CustomerID = 42;   -- force materialization
-- /*+ MERGE(t) */ requests merging (when the CTE is mergeable)
```

Materialized CTEs can get an automatically created index on the join key ("auto_key") when they are joined.

---

# SQLite

SQLite 3.35+ supports the same keywords as PostgreSQL:

```sql
WITH Totals AS MATERIALIZED (SELECT …) SELECT …;
WITH Totals AS NOT MATERIALIZED (SELECT …) SELECT …;
```

By default, a CTE used more than once is materialized; one used once may be flattened into the outer query like a view.

---

# Choosing Deliberately

```text
Materialize when:                               Inline when:
  - the CTE is expensive AND referenced          - the outer query filters or joins on a
    several times                                  selective column the CTE's tables index
  - the result is small compared with its        - the CTE is referenced once
    inputs (a heavy aggregate → few rows)        - the result would be large
  - you must isolate a step to stop the          - you want the optimizer to see the whole
    optimizer from a bad plan                      query
  - the CTE uses volatile functions whose
    results must be consistent across references
```

When the engine offers no control (SQL Server) or the materialized result needs indexes and real statistics, use a temporary table.

---

# Visual Representation

```text
   WITH T AS (SELECT … FROM Orders GROUP BY CustomerID)
   SELECT … FROM T WHERE CustomerID = 42

   INLINED                                   MATERIALIZED
   Aggregate                                 Filter CustomerID = 42
     └─ Index Seek Orders (CustomerID = 42)    └─ CTE Scan T
                                                     └─ Aggregate (all customers)
                                                          └─ Seq Scan Orders
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← inlined CTE: merged into this query's FROM · materialized: scanned from a work table
2. JOIN        ← inlined: join keys can use base-table indexes · materialized: work table (maybe auto-indexed in MySQL)
3. WHERE       ← inlined: predicates pushed into the CTE · materialized: applied after the CTE is fully computed
4. GROUP BY
5. HAVING
6. WINDOW
7. SELECT
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP   ← a LIMIT cannot make a materialized CTE compute fewer rows
```

---

# How the DBMS Executes This

```text
PostgreSQL EXPLAIN:   "CTE totals" node + "CTE Scan on totals"        → materialized
                      no CTE node, base tables inside the plan        → inlined
SQL Server plan:      CTE's operators repeated per reference          → inlined (always)
Oracle plan:          TEMP TABLE TRANSFORMATION, LOAD AS SELECT       → materialized
MySQL EXPLAIN:        select_type DERIVED / <derivedN> table          → materialized
                      base tables directly in the outer select        → merged
```

---

# 🏗️ Architecture Insight

Relying on an engine's materialization behaviour to force a plan is fragile: PostgreSQL 12 changed it, and other engines adjust heuristics between versions. If a step must be computed once or isolated, make that explicit—with a `MATERIALIZED` hint where supported, or a temporary table—so the intent survives upgrades.

---

# ⚡ Performance Tip

When a CTE query is unexpectedly slow, check two things first: whether an outer filter on a selective column was pushed into the CTE, and whether a CTE referenced several times was computed several times. The plan answers both.

---

# 🌍 Production Consideration

Queries written for PostgreSQL 11 or earlier sometimes used CTEs as deliberate fences. After upgrading, add `MATERIALIZED` to those CTEs if the old plan was better—or, preferably, fix the underlying estimation problem.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Default (referenced once) | Implementation | Inline (12+), materialize (≤ 11) | Merge if possible | Inline | Usually inline | Inline / flatten |
| Default (referenced 2+ times) | Implementation | Materialize | Materialize once | Inline each time | Usually materialize | Materialize |
| Force materialize | ❌ | `AS MATERIALIZED` | `NO_MERGE` hint | Temp table | `/*+ MATERIALIZE */` | `AS MATERIALIZED` |
| Force inline | ❌ | `AS NOT MATERIALIZED` | `MERGE` hint | Default | `/*+ INLINE */` | `AS NOT MATERIALIZED` |

> **Portability Tip:** Materialization control is not portable. Write CTEs so they perform acceptably when inlined, and use temporary tables where computing once really matters.

---

# Common Mistakes

### Mistake 1

Assuming a CTE referenced several times is computed once on SQL Server.

---

### Mistake 2

Materializing a large CTE and then filtering it down to a few rows.

---

### Mistake 3

Relying on PostgreSQL 11's fence behaviour after upgrading.

---

### Mistake 4

Forcing `NOT MATERIALIZED` on an expensive CTE referenced many times.

---

# Best Practices

✔ Check the plan for pushdown and repeated evaluation.

✔ Materialize expensive, reused, small-result CTEs; inline selective, single-use ones.

✔ Use hints or temporary tables to make intent explicit.

✔ Re-test CTE-heavy queries after engine upgrades.

---

# Interview Questions

## Basic

1. What does it mean to inline a CTE?
2. What does materializing a CTE mean?
3. Does SQL Server materialize CTEs?

## Intermediate

4. How did CTE behaviour change in PostgreSQL 12?
5. Why can materialization make a filtered query slow?
6. How do you force materialization in PostgreSQL and Oracle?

## Advanced

7. When would you choose a temporary table over a materialized CTE?
8. How can you tell from a plan whether a CTE was materialized?

---

# Hands-on Exercises

## Exercise 1

On PostgreSQL 12+, compare plans of a filtered CTE with `MATERIALIZED` and `NOT MATERIALIZED`.

---

## Exercise 2

On SQL Server, reference an aggregate CTE twice and find both copies in the plan.

---

## Exercise 3

Replace the doubly-referenced CTE with a temporary table and compare timings.

---

# Related Topics

- **14.04 — CTEs vs Subqueries, Derived Tables and Views**
- **14.14 — Execution Flow of CTEs**
- **14.15 — CTE Performance and Index Strategy**
- **09.14 — Execution Flow of Subqueries (Unnesting and Decorrelation)**

---

# Summary

A CTE is either inlined—substituted into the outer query, allowing predicate pushdown and index use but recomputed per reference—or materialized into a work table, computed once but acting as a fence that blocks pushdown. PostgreSQL ≤ 11 always materialized; 12+ inlines single-use CTEs and offers `MATERIALIZED` / `NOT MATERIALIZED`. SQL Server always inlines, Oracle decides with `MATERIALIZE` / `INLINE` hints available, MySQL merges or materializes with `MERGE` / `NO_MERGE` hints, and SQLite 3.35+ supports PostgreSQL's keywords. Choose deliberately, check the plan, and use temporary tables when computing once really matters.
