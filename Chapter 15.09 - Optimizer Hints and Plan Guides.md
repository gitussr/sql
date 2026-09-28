---
title: "15.09 - Optimizer Hints and Plan Guides"
description: "When and how to override the optimizer: index, join, join-order, parallelism and recompile hints on SQL Server, Oracle, MySQL and SQLite, PostgreSQL's planner settings and pg_hint_plan, plan forcing with Query Store, plan guides, SQL plan baselines and SQL profiles, the risks of hints (stale choices as data changes, blocked improvements, upgrade surprises), and a policy for using them safely."
chapter: 15
section: 15.09
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 15.09 Optimizer Hints and Plan Guides

---

# Learning Objectives

After completing this section, you will be able to:

- Decide whether a hint is justified.
- Write index, join and join-order hints on each engine.
- Pin plans without changing SQL text (Query Store, plan guides, baselines).
- Explain the long-term risks of hints.
- Apply a safe policy for using and reviewing hints.

---

# Hints Are the Last Resort

```text
Before hinting, have you …
  □ refreshed statistics and added extended statistics for correlated columns?  (15.03)
  □ made predicates sargable and types consistent?                              (15.07)
  □ added or adjusted the index the good plan needs?                            (15.05)
  □ addressed parameter sniffing with the right fix?                            (15.08)
  □ simplified the query (fewer joins, steps in temp tables)?                   (15.02)
If yes, and the optimizer still chooses badly → a hint or forced plan is reasonable.
```

A hint freezes **today's** best decision. When data grows, distributions shift or the engine improves, the hinted plan can become the slow one—and nobody remembers why it is there.

---

# SQL Server

```sql
-- Query-level hints
SELECT … FROM Orders o JOIN Customers c ON …
OPTION (HASH JOIN);                          -- or LOOP JOIN, MERGE JOIN (applies to all joins)
OPTION (FORCE ORDER);                        -- join in the written order
OPTION (MAXDOP 1);                           -- no parallelism
OPTION (RECOMPILE);                          -- plan per execution
OPTION (OPTIMIZE FOR (@p = 'US'));           -- plan for a value (15.08)
OPTION (USE HINT ('DISABLE_OPTIMIZER_ROWGOAL'));   -- named behaviour switches

-- Table hints
SELECT … FROM Orders WITH (INDEX (ix_orders_customer_date)) WHERE …;
SELECT … FROM Orders WITH (FORCESEEK) WHERE …;

-- Join hint on one join
SELECT … FROM Customers c INNER HASH JOIN Orders o ON …;    -- also implies FORCE ORDER
```

---

# Oracle

```sql
SELECT /*+ INDEX(o ix_orders_customer_date) */ … FROM Orders o WHERE …;
SELECT /*+ FULL(o) */ … FROM Orders o WHERE …;
SELECT /*+ LEADING(c o) USE_NL(o) */ … FROM Customers c JOIN Orders o ON …;   -- order and algorithm
SELECT /*+ USE_HASH(o) */ …;
SELECT /*+ PARALLEL(o 8) */ …;
SELECT /*+ OPT_PARAM('optimizer_index_cost_adj' 50) */ …;
```

Oracle silently ignores hints with errors (a misspelled alias, a missing index)—check the plan (`DBMS_XPLAN … FORMAT => '+HINT_REPORT'` in 19c) to confirm the hint was used.

---

# MySQL

```sql
-- Index hints (classic syntax)
SELECT … FROM Orders USE INDEX (ix_orders_customer_date) WHERE …;
SELECT … FROM Orders FORCE INDEX (ix_orders_customer_date) WHERE …;
SELECT … FROM Orders IGNORE INDEX (ix_orders_orderdate) WHERE …;

-- Optimizer hints (8.0)
SELECT /*+ JOIN_ORDER(c, o) */ … FROM Customers c JOIN Orders o ON …;
SELECT /*+ INDEX(o ix_orders_customer_date) */ … FROM Orders o …;          -- 8.0.20+
SELECT /*+ NO_BNL(o) */ …;                                                   -- 8.0.20+: discourages hash join for o
SELECT /*+ MAX_EXECUTION_TIME(2000) */ …;                                    -- milliseconds
SELECT /*+ SET_VAR(optimizer_switch = 'index_merge=off') */ …;

SELECT STRAIGHT_JOIN … FROM Customers c JOIN Orders o ON …;                 -- written order
```

---

# PostgreSQL

PostgreSQL deliberately has no hint syntax. Options:

```sql
-- 1. Planner settings, scoped to a transaction (diagnosis, occasionally production)
BEGIN;
SET LOCAL enable_nestloop = off;           -- discourage (not forbid) nested loops
SET LOCAL enable_seqscan  = off;
SET LOCAL join_collapse_limit = 1;         -- plan joins in written order
SELECT …;
COMMIT;

-- 2. Statistics and cost settings per column / tablespace / function
ALTER TABLE Customers ALTER COLUMN Country SET STATISTICS 1000;
ALTER FUNCTION customer_tier(int) ROWS 1 COST 1000;

-- 3. The pg_hint_plan extension (hints in comments, plus a hint table)
/*+ IndexScan(o ix_orders_customer_date) NestLoop(c o) Leading(c o) */
SELECT …;

-- 4. Structure: MATERIALIZED CTEs (14.13) or OFFSET 0 in a subquery act as optimization fences
```

`enable_*` settings make an operator look very expensive rather than impossible; use them to test "would a hash join be faster?", then fix the underlying estimate.

---

# SQLite

```sql
SELECT … FROM Orders INDEXED BY ix_orders_customer_date WHERE …;   -- use this index (error if unusable)
SELECT … FROM Orders NOT INDEXED WHERE …;                          -- no index
SELECT … FROM Orders WHERE +CustomerID = 42;                       -- unary + stops index use on that term
SELECT … FROM Customers CROSS JOIN Orders ON …;                    -- CROSS JOIN fixes the join order
SELECT … WHERE likelihood(Status = 'Pending', 0.01);               -- selectivity hint
```

---

# Pinning Plans Without Changing SQL

When the SQL comes from an application you cannot modify, or you want the fix outside the code:

| Engine | Mechanism | What it does |
|--------|-----------|--------------|
| SQL Server | Query Store plan forcing (2016+) | Forces a previously captured plan for a query |
| SQL Server | Query Store hints (2022) | Attaches query hints (e.g. `RECOMPILE`, `MAXDOP`) to a query by ID |
| SQL Server | Plan guides | Attaches hints or a plan to matching SQL text |
| Oracle | SQL plan baselines (SPM) | Only accepted plans may be used; new plans must be verified first |
| Oracle | SQL profiles / SQL patches | Extra estimates or hints attached to a statement |
| PostgreSQL | `pg_hint_plan` hint table | Hints matched by query text |
| MySQL | Query rewrite plugin | Rewrites matching statements (e.g. to add hints) |

```sql
-- SQL Server: force the good plan found in Query Store
EXEC sp_query_store_force_plan @query_id = 1234, @plan_id = 5678;
EXEC sp_query_store_unforce_plan @query_id = 1234, @plan_id = 5678;
```

Forcing a captured plan is often safer than a hand-written hint: it is a complete, previously observed plan, it is visible in one catalog, and it can be removed without a deployment.

---

# The Risks

```text
1. DATA CHANGES      the hinted index or join order becomes wrong as volumes and distributions shift
2. BLOCKED PROGRESS  engine upgrades and new indexes cannot improve a hinted query
3. BREAKAGE          renamed or dropped indexes: errors (SQL Server INDEX hint, SQLite INDEXED BY)
                     or silent ignoring (Oracle)
4. OVER-SCOPING      OPTION (LOOP JOIN) affects every join in the query, not just the bad one
5. MEMORY LOSS       nobody remembers why the hint exists or how to test removing it
```

---

# A Safe Policy

```text
□ Hints only after the checklist above; record the reason and the evidence (plans, timings)
□ Prefer the narrowest hint (one table, one join) over global ones
□ Prefer plan forcing (Query Store, baselines) over hard-coded hints where available
□ Comment every hint with a ticket reference and a date
□ Re-test hinted queries after statistics changes, major data growth and upgrades
□ Keep an inventory of hints and forced plans; review it periodically
```

---

# Visual Representation

```text
   influence on the plan, from least to most invasive
   ───────────────────────────────────────────────────────────────────────────▶
   statistics · sargable SQL · indexes · parameter fixes · plan forcing · hints
   (optimizer still decides, with better information)       (you decide, permanently)
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← index hints (INDEX, FORCE INDEX, INDEXED BY) choose access paths
2. JOIN        ← join hints (HASH/LOOP/MERGE, USE_NL, USE_HASH) and order hints (LEADING, FORCE ORDER)
3. WHERE       ← FORCESEEK / likelihood() influence how predicates are applied
4. GROUP BY    ← HASH GROUP / ORDER GROUP (SQL Server) choose aggregation strategy
5. HAVING
6. WINDOW
7. SELECT
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP   ← row-goal hints (DISABLE_OPTIMIZER_ROWGOAL, FIRST_ROWS(n) in Oracle)
```

---

# How the DBMS Executes This

```text
With a hint, the optimizer restricts its search space to plans that satisfy it,
then costs the remaining alternatives as usual.
  INDEX(o ix)          → only access paths using ix are considered for o
  LEADING(c o)         → only join orders starting c, o
  OPTION (HASH JOIN)   → only hash joins, everywhere in the query
If no plan satisfies the hint: SQL Server errors ("could not produce a query plan"),
Oracle ignores the hint, MySQL USE INDEX falls back, FORCE INDEX makes a scan look very expensive.
```

---

# 🏗️ Architecture Insight

A growing number of hints in a codebase is a symptom: missing statistics maintenance, schema types that force conversions, or queries too complex to optimize. Treat hints as technical debt with an owner, and address the underlying cause when time allows.

---

# ⚡ Performance Tip

Use planner switches and hints as **diagnostic** tools: force the alternative plan once, measure it, and if it is much faster, find out why the optimizer did not choose it (usually an estimate). Then fix that, and remove the hint.

---

# 🌍 Production Consideration

During an incident, forcing a known-good plan (Query Store, baselines) is the fastest safe mitigation for a plan regression. It buys time to find the root cause without deploying code.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Index hints | ❌ | Extension | `USE/FORCE/IGNORE INDEX`, `INDEX()` | `WITH (INDEX(…))` | `/*+ INDEX */` | `INDEXED BY` |
| Join algorithm hints | ❌ | Extension / `enable_*` | `BNL` / `NO_BNL` (hash join, 8.0.20+) | `OPTION (HASH JOIN)`, join hints | `USE_NL`, `USE_HASH`, `USE_MERGE` | ❌ |
| Join order | ❌ | `join_collapse_limit = 1` | `STRAIGHT_JOIN`, `JOIN_ORDER` | `FORCE ORDER` | `LEADING`, `ORDERED` | `CROSS JOIN` |
| Plan forcing | ❌ | Extension | ❌ | Query Store, plan guides | Baselines, profiles | ❌ |
| Invalid hint | — | Ignored (extension) | Warning / ignored | Error | Silently ignored | Error (`INDEXED BY`) |

> **Portability Tip:** Hints are the least portable part of SQL. Keep them out of shared code; if an engine-specific hint is essential, isolate it where the engine-specific code lives.

---

# Common Mistakes

### Mistake 1

Hinting before fixing statistics, SQL shape or indexes.

---

### Mistake 2

Using query-wide join hints to fix one join.

---

### Mistake 3

Leaving undocumented hints that outlive their reason.

---

### Mistake 4

Assuming an Oracle hint was applied without checking the plan.

---

# Best Practices

✔ Work through the checklist before hinting.

✔ Prefer plan forcing to hard-coded hints.

✔ Keep hints narrow, documented and inventoried.

✔ Re-test hints after data growth and upgrades.

✔ Use hints to diagnose, then fix the cause.

---

# Interview Questions

## Basic

1. What is an optimizer hint?
2. Why are hints considered a last resort?
3. How do you force an index on MySQL?

## Intermediate

4. How do you influence plans in PostgreSQL without hints?
5. What is Query Store plan forcing?
6. What happens when a hinted index is dropped?

## Advanced

7. Compare SQL plan baselines with hard-coded hints.
8. How would you use hints to diagnose rather than fix a plan problem?

---

# Hands-on Exercises

## Exercise 1

Force a different join algorithm for a query and compare timings.

---

## Exercise 2

On SQL Server, force a plan with Query Store and then remove the forcing.

---

## Exercise 3

Build an inventory of hints in a codebase and record the reason for each.

---

# Related Topics

- **15.06 — Join Ordering and Join Algorithm Selection**
- **15.08 — Parameter Sniffing, Plan Caching and Prepared Statements**
- **15.15 — A Systematic Tuning Workflow**
- **14.13 — Materialization and Inlining (MATERIALIZED and NOT MATERIALIZED)**

---

# Summary

Hints override the optimizer's choice of index, join algorithm, join order, parallelism or compilation, using engine-specific syntax: `OPTION`/`WITH` on SQL Server, `/*+ */` comments on Oracle and MySQL, `INDEXED BY` and `CROSS JOIN` on SQLite, and planner settings or `pg_hint_plan` on PostgreSQL. Plan forcing (Query Store, plan guides, SQL plan baselines) pins complete plans without changing SQL. Because hints freeze today's decision against tomorrow's data and engines, use them last—after statistics, SQL, indexes and parameter handling—keep them narrow and documented, prefer forced plans, and use them as diagnostic tools that point to the real fix.
