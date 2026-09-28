---
title: "15.17 - Query Optimization Cheat Sheet & Visual Knowledge Map"
description: "A one-stop reference for Chapter 15: the optimizer pipeline, statistics and estimation rules, automatic rewrites and their limits, access path and join algorithm choices, optimizer-friendly SQL rules, parameter sniffing fixes, hints and plan forcing, pagination, aggregation and write patterns, concurrency rules, measurement tools and the tuning workflow on PostgreSQL, MySQL, SQL Server, Oracle and SQLite, plus a knowledge map linking optimization to every earlier chapter."
chapter: 15
section: 15.17
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 15.17 Query Optimization Cheat Sheet & Visual Knowledge Map

---

# Learning Objectives

After completing this section, you will be able to:

- Recall the optimizer pipeline and its inputs at a glance.
- Look up statistics, plan, hint and measurement commands on each engine.
- Apply the SQL, indexing, pagination, write and concurrency rules quickly.
- See how query optimization connects to the rest of the handbook.

---

# The Optimizer Pipeline

```text
parse → bind (types, implicit conversions) → rewrite (merge, unnest, push down, eliminate)
      → enumerate (join orders × algorithms × access paths) → estimate rows (statistics) → cost
      → choose (within search limits) → cache → execute (iterators; adaptive corrections)

inputs you control:  statistics · indexes · constraints (PK, FK, NOT NULL) · SQL shape · types · parameters
three causes of slow queries:  too much work · wrong plan · waiting
```

---

# Statistics and Estimates

```text
contents     row count · NDV · null fraction · most common values · histogram · correlation
equality     MCV frequency, else (1 − ΣMCV) / (NDV − #MCV); unknown parameter → 1 / NDV
AND / OR     multiplied as independent → correlated columns underestimated
join         |A| × |B| / max(NDV)  — errors multiply through joins
functions    no statistics → fixed guess
refresh      PostgreSQL ANALYZE · MySQL ANALYZE TABLE (+ UPDATE HISTOGRAM) · SQL Server UPDATE STATISTICS
             Oracle DBMS_STATS.GATHER_TABLE_STATS · SQLite ANALYZE / PRAGMA optimize
correlated   PostgreSQL CREATE STATISTICS · SQL Server multi-column stats · Oracle column groups
rule         find the FIRST operator where estimate ≠ actual (≥ 10×) and fix that estimate
```

---

# Rewrites: Automatic vs Yours

```text
AUTOMATIC                                  YOURS
constant folding, contradiction removal    sargable predicates (no functions on columns)
predicate pushdown, transitive predicates  matching types for parameters and literals
view / CTE merging                         NOT EXISTS instead of nullable NOT IN
EXISTS/IN → semi-join, NOT EXISTS → anti   keyset instead of OFFSET
outer → inner join when WHERE rejects NULL explicit column lists instead of SELECT *
join elimination (keys, trusted FKs)       set-based SQL instead of loops / N+1
DISTINCT / ORDER BY elimination            UNION instead of OR across columns (if needed)
OR expansion / bitmap OR (sometimes)       split huge queries into steps
```

---

# Access Paths and Joins

```text
ACCESS PATH                                  JOIN ALGORITHM
few rows match        → seek (+ lookups)     small outer, indexed inner  → nested loop
many rows match       → full scan            large, unsorted inputs      → hash join (memory; spills)
all columns in index  → index-only scan      both sorted on key          → merge join
medium, several idx   → bitmap / index union LIMIT with row goal         → nested loop / ordered scan
tipping point often ~0.5–5% of rows; covering indexes move it
index shape: (equality columns, range/order columns) INCLUDE (selected columns)
classic failure: nested loop over an underestimated outer input → fix the estimate
```

---

# Optimizer-Friendly SQL

| Instead of | Write |
|------------|-------|
| `YEAR(d) = 2026` | `d >= '2026-01-01' AND d < '2027-01-01'` |
| `col * 1.18 > x` | `col > x / 1.18` |
| `varchar_col = N'…'` / `= 123` | `varchar_col = '…'` |
| `SELECT *` | Column list |
| `NOT IN (SELECT nullable)` | `NOT EXISTS` |
| `UNION` (no overlap possible) | `UNION ALL` |
| `(@p IS NULL OR col = @p)` | Dynamic SQL with parameters / `OPTION (RECOMPILE)` |
| `IF (SELECT COUNT(*) …) > 0` | `IF EXISTS (…)` |
| `SELECT DISTINCT` after join fan-out | `EXISTS` / aggregate before join |
| Loop of single-row queries | One set-based query |

---

# Plan Caching and Sniffing

| Engine | Cache | Sniffing | Fixes |
|--------|-------|----------|-------|
| SQL Server | Global | ✅ | `RECOMPILE`, `OPTIMIZE FOR`, Query Store forcing, PSP (2022), separate paths |
| Oracle | Shared pool | Bind peeking | Adaptive cursor sharing, SQL plan baselines, profiles |
| PostgreSQL | Prepared statements, per session | Custom plans ×5, then generic | `plan_cache_mode = force_custom_plan` |
| MySQL | None | n/a | — (optimized every execution) |
| SQLite | Per prepared statement | Limited | Re-prepare |

```text
always parameterize · diagnose with compiled vs runtime values · covering index can make one plan good for all
```

---

# Hints and Plan Forcing

```text
SQL Server   OPTION (HASH JOIN | LOOP JOIN | FORCE ORDER | MAXDOP n | RECOMPILE)  WITH (INDEX(ix), FORCESEEK)
             Query Store: sp_query_store_force_plan · plan guides · Query Store hints (2022)
Oracle       /*+ INDEX(t ix) FULL(t) LEADING(a b) USE_NL(b) USE_HASH(b) PARALLEL(t n) */ · baselines · profiles
MySQL        USE / FORCE / IGNORE INDEX · STRAIGHT_JOIN · /*+ JOIN_ORDER() INDEX() BNL() MAX_EXECUTION_TIME(ms) */
PostgreSQL   SET LOCAL enable_nestloop/enable_seqscan = off · join_collapse_limit = 1 · pg_hint_plan (extension)
SQLite       INDEXED BY · NOT INDEXED · unary +col · CROSS JOIN order · likelihood()
policy       last resort · narrowest scope · documented · prefer plan forcing · re-test after changes
```

---

# Pagination, Aggregation and Writes

```text
TOP-N        index (filter cols, order cols, tiebreaker) → read N and stop; else top-N heapsort
PAGINATION   keyset: WHERE (d, id) < (:d, :id) ORDER BY d DESC, id DESC FETCH FIRST n
             SQL Server / Oracle: d < :d OR (d = :d AND id < :id) · fetch N + 1 instead of COUNT
AGGREGATION  index order → stream aggregate, no sort · filter, narrow, pre-aggregate · watch spills
             approximate distinct for dashboards · rollups / materialized views / columnstore
WRITES       multi-row INSERT · COPY / BULK INSERT / LOAD DATA · commit in batches
             batch UPDATE/DELETE by indexed ranges · partition drops for retention
             set-based upserts from staging · skip no-op updates · load, then index, then ANALYZE
```

---

# Concurrency

```text
working vs waiting: elapsed ≫ CPU → look at waits, not the plan
MVCC (PostgreSQL, Oracle, InnoDB, SQL Server RCSI): readers and writers don't block each other
short transactions · no user think-time inside · index rows you update · consistent access order
queues: FOR UPDATE SKIP LOCKED (SQL Server: UPDLOCK, READPAST) · retry deadlocks · no NOLOCK
SQL Server lock escalation ≈ 5,000 locks → batch large writes
```

---

# Measurement

| Need | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|------|------------|-------|------------|--------|--------|
| Actual plan | `EXPLAIN (ANALYZE, BUFFERS)` | `EXPLAIN ANALYZE` | Actual plan | `DBMS_XPLAN.DISPLAY_CURSOR('ALLSTATS LAST')` | `EXPLAIN QUERY PLAN` |
| Reads / time | `BUFFERS`, `\timing` | `Handler_read%` | `SET STATISTICS IO, TIME ON` | `AUTOTRACE`, `V$SQL` | `.timer on` |
| Top queries | `pg_stat_statements` | `sys.statement_analysis` | Query Store | `V$SQLSTATS`, AWR | App timing |
| Waits | `pg_stat_activity` | Performance Schema | `sys.dm_os_wait_stats` | ASH / AWR | — |
| Slow log | `log_min_duration_statement`, `auto_explain` | `slow_query_log` | Extended Events | SQL trace | — |

```text
compare plans by logical reads and CPU · rank by total cost · percentiles not averages
cold vs warm cache · client/network time · test as the application runs it
```

---

# The Tuning Workflow

```text
0 GOAL → 1 FIND (total cost) → 2 CAPTURE (plan, params, waits) → 3 CLASSIFY (work/plan/wait)
→ 4 LOCATE (first estimate error, costliest operator) → 5 FIX (least invasive first)
→ 6 VERIFY (same data/params/concurrency, identical results) → 7 DEPLOY (reversible) → 8 MONITOR

fix order: statistics → SQL rewrite → index → parameter handling → restructure → schema
           → configuration → hints / forced plans → hardware
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← access paths; partition pruning; join elimination
2. JOIN        ← join order from estimates; nested loop / hash / merge
3. WHERE       ← pushdown; sargable predicates become seeks; types must match
4. GROUP BY    ← stream (index order) or hash (memory); pre-aggregation
5. HAVING      ← non-aggregate conditions moved to WHERE
6. WINDOW      ← shared sorts; index order
7. SELECT      ← column pruning enables covering indexes
8. DISTINCT    ← eliminated by keys, or a sign of fan-out
9. ORDER BY    ← avoided by index order; top-N sort with LIMIT
10. LIMIT / FETCH / TOP   ← row goals; keyset instead of OFFSET
```

---

# How the DBMS Executes This

```text
Reading any plan for optimization, bottom-up:
  leaves:     scan or seek? rows removed by filter? implicit conversions?
  joins:      estimated vs actual rows on the outer input; inner executions; spills
  aggregates: hash or stream; memory; spills
  sorts:      needed? top-N? external?
  top:        rows returned; row goals; OFFSET discards
  totals:     logical reads, CPU vs elapsed, waits
```

---

# Visual Knowledge Map

```text
                              QUERY OPTIMIZATION (Chapter 15)
              good inputs (statistics, indexes, SQL) → good plans → measured results
                                            │
   ┌───────────────┬────────────────┬───────┴────────┬─────────────────┬─────────────────┐
   ▼               ▼                ▼                ▼                 ▼                 ▼
 OPTIMIZER      ESTIMATES        REWRITES        PLAN CHOICES      YOUR SQL         PLAN CACHE
 15.02          15.03            15.04           15.05, 15.06      15.07            15.08, 15.09
 parse, cost,   statistics,      pushdown,       scans, seeks,     sargable, types, sniffing, custom
 search limits  correlation,     unnesting,      lookups, NL/hash/ columns, sets,   plans, hints,
                skew, joins      elimination     merge, order      no catch-alls    forcing
   └───────────────┴────────────────┴───────┬────────┴─────────────────┴─────────────────┘
                                            ▼
         WORKLOAD PATTERNS 15.10–15.12 ── pagination · top-N · aggregation · sorting · writes
                                            ▼
         CONCURRENCY 15.13 ── MVCC · locks · long transactions · SKIP LOCKED · deadlocks
                                            ▼
         MEASUREMENT 15.14 ── elapsed · CPU · reads · waits · workload statistics
                                            ▼
         WORKFLOW 15.15 ── goal · find · capture · classify · locate · fix · verify · monitor
                                            ▼
         MISTAKES 15.16 ── process · statistics · SQL · indexes · caching · paging · writes · config

Connections to other chapters
  04.19 SQL Execution Order                ──→ 15.02 (logical order vs physical plan)
  06.12 SARGability                        ──→ 15.07
  07.14 Join algorithms                    ──→ 15.06
  08.14 Hash and stream aggregation        ──→ 15.11
  09.14 Unnesting and decorrelation        ──→ 15.04
  10.xx Indexes (seeks, covering, stats)   ──→ 15.03, 15.05
  11.15 Window function performance        ──→ 15.11
  12.15 Scalar functions and sargability   ──→ 15.07
  13.15 Date predicates, partitioning      ──→ 15.07, 15.12
  14.13 CTE materialization                ──→ 15.04
  15.xx Query Optimization                 ──→ 16.xx Reading Execution Plans
```

---

# One-Page Summary

```text
CONCEPTS
  The optimizer picks a plan from estimates; estimates come from statistics; SQL shape decides
  what it can see; the plan cache decides how long a plan lives; waits are outside the plan

RULES
  Measure first; rank by total cost; set a goal
  Fresh statistics; extended stats for correlated columns; fix the first estimate error
  Bare columns, matching types, explicit columns, NOT EXISTS, UNION ALL, set-based SQL
  Index (equality, range/order) INCLUDE (select); index FKs; drop unused indexes
  Parameterize; handle skew deliberately; hints and forced plans last, documented
  Keyset pagination; index order for sorts and groups; watch spills; precompute heavy aggregates
  Batch writes; short transactions; snapshot reads; SKIP LOCKED queues
  Verify with realistic data, parameters and concurrency; change one thing at a time
```

---

# 🏗️ Architecture Insight

The chapter reduces to one idea: *give the optimizer the truth, then check its work*. The truth is fresh statistics, declared constraints, matching types, sargable predicates and indexes shaped by real queries. Checking its work means measuring actual plans, reads and waits—and changing one thing at a time until the goal is met.

---

# ⚡ Performance Tip

If you remember one rule from this chapter: before changing anything, compare the estimated and actual row counts in the actual plan. The first place they diverge is almost always where the problem starts.

---

# 💡 Did You Know?

PostgreSQL's genetic query optimizer (GEQO), used for queries with many tables, applies a genetic algorithm—treating join orders like chromosomes that are combined and mutated over generations—because exhaustive search becomes impractical as the number of tables grows. It was added in the 1990s and is still controlled by the `geqo_threshold` setting (12 by default).

---

# Related Topics

- **15.01 — Introduction to Query Optimization**
- **15.15 — A Systematic Tuning Workflow**
- **15.16 — Common Query Optimization Mistakes & Best Practices**
- **14.17 — CTE Cheat Sheet & Visual Knowledge Map**
- **10.17 — Index Cheat Sheet & Visual Knowledge Map**
- **06.14 — WHERE Cheat Sheet & Visual Knowledge Map**
- **16.xx — Reading Execution Plans**

---

# Summary

This section condenses Chapter 15 into a single reference: the optimizer pipeline and its inputs; statistics and estimation rules; automatic rewrites and the ones you must do; access path and join algorithm choices; optimizer-friendly SQL; plan caching, parameter sniffing, hints and plan forcing on each engine; patterns for pagination, aggregation and writes; concurrency rules; measurement tools; and the tuning workflow. One idea carries the whole chapter—give the optimizer the truth, then check its work—and the knowledge map shows how optimization draws on every earlier chapter and leads into reading execution plans.
