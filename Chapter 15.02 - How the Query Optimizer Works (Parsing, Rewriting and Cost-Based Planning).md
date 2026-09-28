---
title: "15.02 - How the Query Optimizer Works (Parsing, Rewriting and Cost-Based Planning)"
description: "The stages a query passes through—parsing, binding, logical rewriting, plan enumeration, cardinality and cost estimation, plan selection and caching—how optimizers search the plan space with dynamic programming, heuristics and timeouts, logical versus physical operators, interesting orders, why the cheapest estimated plan is not always the fastest, and adaptive features that correct plans at run time."
chapter: 15
section: 15.02
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 15.02 How the Query Optimizer Works (Parsing, Rewriting and Cost-Based Planning)

---

# Learning Objectives

After completing this section, you will be able to:

- Name the stages a query passes through before it runs.
- Distinguish logical from physical operators.
- Explain how optimizers search the space of possible plans.
- Describe how a plan's cost is estimated.
- Explain why the cheapest estimated plan can be slow, and how adaptive features help.

---

# The Stages

```text
   SQL text
      │
      ▼
 1. PARSE        tokens → syntax tree                      errors: syntax
      │
      ▼
 2. BIND         resolve tables, columns, functions, types  errors: unknown column, permissions
      │          insert implicit conversions
      ▼
 3. REWRITE      logical transformations that always help or never hurt:
      │          inline views/CTEs, unnest subqueries, push predicates, fold constants,
      │          eliminate redundant joins, simplify expressions   (Section 15.04)
      ▼
 4. ENUMERATE    generate alternative physical plans:
      │          join orders × join algorithms × access paths × aggregation strategies
      ▼
 5. ESTIMATE     for each alternative: rows at every operator (statistics, Section 15.03)
      │          → cost (I/O, CPU, memory, network)
      ▼
 6. CHOOSE       cheapest plan within the search budget
      │
      ▼
 7. CACHE        store for reuse with the same SQL text / parameters (Section 15.08)
      │
      ▼
   EXECUTE
```

Stages 1–3 are the same on every run; stages 4–6 are where the optimizer earns its name.

---

# Logical vs Physical Operators

```text
LOGICAL (what)          PHYSICAL (how) — the optimizer picks one per logical operator
───────────────────     ───────────────────────────────────────────────────────────
Get table               Full/Seq Scan · Index Seek/Range Scan · Index-Only Scan · Bitmap Scan
Filter                  applied inside a scan · separate Filter operator
Join                    Nested Loop · Hash Join · Merge Join (+ semi/anti variants)
Aggregate               Hash Aggregate · Stream (sort-based) Aggregate
Sort                    Full Sort · Top-N Sort · none (index order)
Distinct                Hash · Sort + unique · eliminated (already unique)
Union                   Append/Concatenation (+ distinct step for UNION)
```

A plan is a tree of physical operators. The same logical query can be served by many trees.

---

# Searching the Plan Space

Join ordering dominates the search. The classic approach (System R) is **dynamic programming**:

```text
level 1: best way to access each table alone                A, B, C, D
level 2: best plan for each pair, built from level 1        AB, AC, BC, BD, …
level 3: best plan for each triple, built from level 2      ABC = best of (AB⋈C, AC⋈B, BC⋈A)
…
level n: the best plan for all tables
```

Each subset keeps only its cheapest plan—plus the cheapest plan for each **interesting order**: a plan that is more expensive but produces rows sorted by a join key, `GROUP BY` or `ORDER BY` column, which may make a later merge join, stream aggregate or sort unnecessary.

Dynamic programming is still exponential. Engines limit it:

| Engine | Strategy for large queries |
|--------|----------------------------|
| PostgreSQL | Exhaustive DP up to `join_collapse_limit`/`from_collapse_limit` (8); genetic optimizer (GEQO) from `geqo_threshold` (12) tables |
| SQL Server | Transformation-based (Cascades) search in stages; stops when the plan is cheap enough or the optimization budget is spent ("Reason for early termination: Good Enough Plan Found / Time Out") |
| Oracle | Permutation search with limits; transformations costed; adaptive plans |
| MySQL | Greedy search limited by `optimizer_search_depth`; `optimizer_prune_level` heuristics |
| SQLite | "N nearest neighbours" heuristic path search |

Practical consequence: queries joining many tables (15, 20, 30) may get plans that are far from optimal, and join order written in the SQL may start to matter. Breaking such queries into steps (temporary tables, Section 14.04) often helps.

---

# Estimating Cost

Cost is a model, not a measurement:

```text
cost(operator) = f(estimated input rows, row width, pages read, CPU per row, memory needed)

PostgreSQL knobs:  seq_page_cost = 1.0, random_page_cost = 4.0, cpu_tuple_cost = 0.01,
                   cpu_index_tuple_cost = 0.005, cpu_operator_cost = 0.0025
SQL Server:        internal cost units (historically "seconds on a reference machine")
Oracle:            I/O + CPU cost model with system statistics
```

```text
Seq Scan cost ≈ pages × seq_page_cost + rows × cpu_tuple_cost
Index Scan cost ≈ matching index pages × random_page_cost + matching rows × (lookup + CPU)
→ index wins when few rows match; scan wins when many do (Section 15.05)
```

The **row estimate** is the most important input. A cost model with perfect constants but a row estimate that is 1000× wrong will choose badly; a rough cost model with good estimates usually chooses well.

---

# Why the Cheapest Estimated Plan Can Be Slow

```text
estimated                        actual
Nested Loop (est 10 outer rows)  Nested Loop with 2,000,000 outer rows
  → 10 index lookups (cheap)       → 2,000,000 index lookups (very slow)
  a Hash Join would have cost more on paper — and far less in reality
```

Causes, all covered later in the chapter:

- stale or missing statistics (15.03);
- correlated predicates assumed independent (15.03);
- functions and type mismatches hiding columns from statistics (15.07);
- parameter values different from the ones the plan was built for (15.08);
- estimates compounding through many joins (15.06).

---

# Adaptive Features

Modern engines correct some mistakes during or after execution:

| Feature | Engine | What it does |
|---------|--------|--------------|
| Adaptive joins | SQL Server 2017+ (batch mode) | Chooses hash or nested loop at run time based on actual row count |
| Memory grant feedback | SQL Server 2017+/2019+ | Adjusts memory for the next execution after spills or over-grants |
| Parameter Sensitive Plan optimization | SQL Server 2022 | Caches several plans for different parameter ranges |
| Adaptive plans | Oracle 12c+ | Switches join method mid-execution; statistics feedback for later runs |
| Adaptive cursor sharing | Oracle 11g+ | Creates new child cursors when bind values need different plans |
| Custom vs generic plans | PostgreSQL | Plans prepared statements with actual values for the first executions (15.08) |
| Hash join fallback | MySQL 8.0.18+ | Hash join instead of block nested loop when no index exists |

They reduce, but do not remove, the need for good statistics and good SQL.

---

# Seeing the Optimizer's Work

```sql
-- PostgreSQL: estimated plan, then actual
EXPLAIN SELECT …;
EXPLAIN (ANALYZE, BUFFERS) SELECT …;

-- SQL Server: estimated / actual execution plan (SSMS), or
SET SHOWPLAN_XML ON;         -- estimated, does not run
SET STATISTICS XML ON;       -- actual, runs the query

-- MySQL
EXPLAIN FORMAT=TREE SELECT …;
EXPLAIN ANALYZE SELECT …;                          -- 8.0.18+
SET optimizer_trace = 'enabled=on'; SELECT …; SELECT * FROM information_schema.OPTIMIZER_TRACE;

-- Oracle
EXPLAIN PLAN FOR SELECT …;  SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY);
SELECT /*+ GATHER_PLAN_STATISTICS */ …;  SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(FORMAT => 'ALLSTATS LAST'));

-- SQLite
EXPLAIN QUERY PLAN SELECT …;
```

Chapter 16 covers reading these plans in depth.

---

# Visual Representation

```text
                          ┌──────────── statistics ────────────┐
                          ▼                                     │
  SQL → parse → bind → rewrite → enumerate ⇄ estimate cost → choose → cache → execute
                                    │                                        │
                          join orders × algorithms × access paths     actual rows (may differ)
                                    │                                        │
                          pruned by DP, heuristics, timeouts        adaptive features react
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← enumerated: every table's access path, every join order considered (within limits)
2. JOIN        ← enumerated: nested loop / hash / merge per join
3. WHERE       ← rewritten: pushed down, simplified, used for index seeks
4. GROUP BY    ← enumerated: hash vs stream; sometimes pushed below joins
5. HAVING      ← rewritten: non-aggregate conditions moved to WHERE
6. WINDOW      ← sorts shared where partition/order keys allow
7. SELECT      ← unused columns pruned (enables index-only scans)
8. DISTINCT    ← eliminated when keys prove uniqueness
9. ORDER BY    ← interesting orders from indexes or merge joins can remove the sort
10. LIMIT / FETCH / TOP   ← row goal: favours plans that return first rows quickly
```

---

# How the DBMS Executes This

```text
Executed plans use the iterator (Volcano) model: each operator asks its child for the next row.
  Limit 10
    └─ Nested Loop          ← asks outer for a row, probes inner, returns matches upward
         ├─ Index Scan A
         └─ Index Scan B
With a LIMIT, execution stops after 10 rows reach the top — which is why "row goals"
make the optimizer prefer nested loops and ordered index scans for top-N queries.
Blocking operators (Sort, Hash build, Hash Aggregate) must consume all input first.
```

---

# 🏗️ Architecture Insight

Declared constraints are optimizer information: a primary key tells it a join produces at most one match, a foreign key (trusted/validated) lets it remove a join whose columns are unused, `NOT NULL` simplifies `NOT IN` and outer joins, and `CHECK` constraints can prune partitions or contradict predicates. Leaving constraints out "for speed" often costs speed.

---

# ⚡ Performance Tip

When a query joins many tables and its plan is poor, compare the number of tables with the engine's search limits (PostgreSQL's 8/12, MySQL's search depth). Splitting the query into a selective first step stored in a temporary table often yields a better plan than any hint.

---

# 🌍 Production Consideration

Engine upgrades change the optimizer—new transformations, new cost models, new cardinality estimators (SQL Server 2014's, controlled by database compatibility level). Test critical queries on the new version before upgrading, and know how to fall back (compatibility levels, `optimizer_features_enable` in Oracle, Query Store plan forcing).

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Plan display | ❌ | `EXPLAIN` | `EXPLAIN`, `FORMAT=TREE` | Showplan | `DBMS_XPLAN` | `EXPLAIN QUERY PLAN` |
| Actual row counts | ❌ | `EXPLAIN ANALYZE` | `EXPLAIN ANALYZE` | Actual plan | `ALLSTATS LAST` | ❌ (use timing) |
| Optimizer trace | ❌ | ❌ (debug builds) | `optimizer_trace` | Trace flags (undocumented) | 10053 trace | ❌ |
| Adaptive execution | ❌ | Limited | Limited | ✅ | ✅ | ❌ |
| Search limit knobs | ❌ | `join_collapse_limit`, `geqo_threshold` | `optimizer_search_depth` | ❌ | Hidden parameters | ❌ |

> **Portability Tip:** The optimizer pipeline is universal; the visibility into it is not. Learn your engine's plan tools before you need them in an incident.

---

# Common Mistakes

### Mistake 1

Believing the optimizer runs the query in the written order.

---

### Mistake 2

Trusting estimated plans without checking actual row counts.

---

### Mistake 3

Tuning cost constants before fixing row estimates.

---

### Mistake 4

Writing 20-table queries and expecting an optimal plan.

---

# Best Practices

✔ Compare estimated and actual rows at every operator.

✔ Declare keys and constraints the optimizer can use.

✔ Split very large queries into selective steps.

✔ Re-test critical queries after engine upgrades.

---

# Interview Questions

## Basic

1. What are the main stages of query processing?
2. What is the difference between a logical and a physical operator?
3. What is a cost-based optimizer?

## Intermediate

4. How does dynamic programming help choose a join order?
5. What is an interesting order?
6. Why is the row estimate more important than the cost constants?

## Advanced

7. Why can a plan with the lowest estimated cost be slow?
8. Describe two adaptive optimizer features and the problem each solves.

---

# Hands-on Exercises

## Exercise 1

Show the estimated and actual plan for a three-table join on your engine.

---

## Exercise 2

Find an operator whose estimated and actual row counts differ by more than 10×.

---

## Exercise 3

On MySQL, enable the optimizer trace and find the join orders it considered.

---

# Related Topics

- **15.01 — Introduction to Query Optimization**
- **15.03 — Statistics, Cardinality Estimation and the Cost Model**
- **15.04 — Automatic Query Rewrites (Pushdown, Unnesting and Elimination)**
- **04.03 — How SQL Works Internally (SQL Query Processing Pipeline)**
- **16.xx — Reading Execution Plans**

---

# Summary

A query is parsed, bound, logically rewritten, and then optimized: the engine enumerates physical alternatives (access paths, join orders and algorithms, aggregation strategies), estimates rows and cost for each, and caches the cheapest plan within its search budget. Dynamic programming with interesting orders is the classic search method; heuristics and timeouts limit it for large queries. Cost depends mostly on row estimates, so bad estimates produce bad plans; adaptive features in SQL Server, Oracle and others correct some mistakes at run time. Plan display tools show what the optimizer decided—and comparing estimated with actual rows shows where it went wrong.
