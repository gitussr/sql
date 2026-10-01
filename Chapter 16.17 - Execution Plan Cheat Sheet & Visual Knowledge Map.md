---
title: "16.17 - Execution Plan Cheat Sheet & Visual Knowledge Map"
description: "A one-stop reference for Chapter 16: commands for estimated and actual plans on PostgreSQL, MySQL, SQL Server, Oracle and SQLite, the reading rules, an operator translation table across engines, the numbers to compare and how to normalise them, red flags, join and aggregate signatures, parallel operators, regression detection and production capture, plus a knowledge map linking execution plans to every earlier chapter."
chapter: 16
section: 16.17
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 20 min
lastUpdated: 2026-10-01
---

# 16.17 Execution Plan Cheat Sheet & Visual Knowledge Map

---

# Learning Objectives

After completing this section, you will be able to:

- Recall the plan commands for every major engine at a glance.
- Translate operator names between engines.
- Apply the reading rules, normalisation and red-flag checks quickly.
- See how execution plans connect to the rest of the handbook.

---

# Getting Plans

| Engine | Estimated | Actual | Application's real plan |
|--------|-----------|--------|-------------------------|
| PostgreSQL | `EXPLAIN` | `EXPLAIN (ANALYZE, BUFFERS)` | `auto_explain` log |
| MySQL | `EXPLAIN [FORMAT=TREE\|JSON]` | `EXPLAIN ANALYZE` | `EXPLAIN FOR CONNECTION`, slow log + re-explain |
| SQL Server | `SET SHOWPLAN_XML ON`, Ctrl+L | `SET STATISTICS XML ON`, Ctrl+M | Query Store, plan cache DMVs, last actual plan |
| Oracle | `EXPLAIN PLAN FOR` + `DBMS_XPLAN.DISPLAY` | `GATHER_PLAN_STATISTICS` + `DISPLAY_CURSOR(…,'ALLSTATS LAST')` | `DISPLAY_CURSOR(sql_id)`, AWR, SQL Monitor |
| SQLite | `EXPLAIN QUERY PLAN` | `.scanstats on` | n/a |

```text
writes:   BEGIN; EXPLAIN ANALYZE <write>; ROLLBACK;      parameters: reproduce the real statement and types
```

---

# Reading Rules

```text
direction     leaves first; rows flow up; control (next()) flows down
SQL Server    root LEFT, leaves RIGHT; top input = outer / build
PostgreSQL    most indented = leaves; hash build under "Hash" (second child)
Oracle        Id 0 = root; indentation = depth; first child first; build = first child
MySQL table   one row per table in join order; TREE = iterators, leaves up
SQLite        one line per nested loop, outermost first
blocking      Sort, Hash build, Hash Aggregate, Materialize/Spool, Window over unsorted input
```

---

# The Numbers and How to Normalise Them

| Engine | Executions | Estimated rows | Actual rows | Time |
|--------|-----------|----------------|-------------|------|
| PostgreSQL | `loops` | Per loop | Per loop | Per loop, inclusive |
| MySQL ANALYZE | `loops` | Per loop | Per loop | Per loop, inclusive |
| SQL Server | Number of Executions | Per execution | All executions | Per operator (row mode inclusive) |
| Oracle | `Starts` | `E-Rows` per start | `A-Rows` total | `A-Time` inclusive |

```text
total rows = per-loop rows × loops         exclusive time = node time − children's time
compare estimates as RATIOS; investigate ≥ 10×; fix the LOWEST divergence first
cost / cost % = estimates (even in actual plans); compare logical reads and CPU, then elapsed
```

---

# Operator Translation Table

| Concept | PostgreSQL | SQL Server | MySQL | Oracle | SQLite |
|---------|------------|------------|-------|--------|--------|
| Full scan | Seq Scan | Table Scan / Clustered Index Scan | ALL / Table scan | TABLE ACCESS FULL | SCAN |
| Seek / range | Index Scan + Index Cond | Index Seek | const/eq_ref/ref/range | INDEX UNIQUE/RANGE SCAN | SEARCH … USING INDEX |
| Covering | Index Only Scan | seek, no lookup | Using index | index op, no table access | COVERING INDEX |
| Lookup | (in Index Scan) | Key / RID Lookup | (implicit) | TABLE ACCESS BY INDEX ROWID | (implicit) |
| Bitmap | Bitmap Index/Heap Scan | — | index_merge | BITMAP … | — |
| Nested loop | Nested Loop | Nested Loops | Nested loop … join | NESTED LOOPS | (all joins) |
| Hash join | Hash Join + Hash | Hash Match (Inner Join) | Inner hash join + Hash | HASH JOIN | — |
| Merge join | Merge Join | Merge Join | — | MERGE JOIN | — |
| Sort | Sort | Sort | Sort / Using filesort | SORT ORDER BY | USE TEMP B-TREE FOR ORDER BY |
| Top-N | top-N heapsort | Top N Sort | limit input to N | SORT ORDER BY STOPKEY | — |
| Hash aggregate | HashAggregate | Hash Match (Aggregate) | Aggregate using temporary table | HASH GROUP BY | — |
| Sorted aggregate | GroupAggregate | Stream Aggregate | Group aggregate | SORT GROUP BY | USE TEMP B-TREE FOR GROUP BY |
| Window | WindowAgg | Sequence Project / Window Spool / Window Aggregate | Window aggregate | WINDOW SORT / BUFFER | CO-ROUTINE |
| Limit | Limit | Top | Limit | COUNT STOPKEY | (loop stops) |
| Union all | Append | Concatenation | Append | UNION-ALL | COMPOUND QUERY |
| Materialize | Materialize / CTE Scan / Memoize | Table/Index Spool | Materialize | TEMP TABLE TRANSFORMATION / VIEW | MATERIALIZE |
| Parallel exchange | Gather / Gather Merge | Parallelism (Gather/Repartition/Distribute) | — | PX COORDINATOR / SEND / RECEIVE | — |

---

# Predicates: Navigate vs Discard

```text
navigate (cheap)     Index Cond · Seek Predicates · access() · key_len / used_key_parts · (col=?)
discard (after read) Filter · Predicate · filter() · Using where / attached_condition
evidence of waste    Rows Removed by Filter · Actual Rows Read ≫ Actual Rows · child A-Rows ≫ parent
```

---

# Red Flags

```text
spills                 external merge · Batches > 1 · Disk Usage · temp buffers · spill warning · Used-Tmp
conversions            CONVERT_IMPLICIT … SeekPlan · ::text on a column · INTERNAL_FUNCTION · TO_NUMBER(col)
residual predicates    rows read ≫ rows returned on a seek or scan
lookups × N            Key Lookup / TABLE ACCESS BY INDEX ROWID with huge executions
inner scans            scan with loops ≫ 1 under a nested loop
no join predicate      warning · MERGE JOIN CARTESIAN · nested loop with no condition
grants                 ExcessiveGrant · GrantWaitTime · OMem ≫ Used-Mem
misestimates           ≥ 10× est vs actual (find the lowest)
opaque functions       scalar UDF in Compute Scalar · SubPlan loops = N · TVF fixed estimates
eager spools           Index Spool (Eager Spool) = missing permanent index
big sorts              millions sorted to return a few
no pruning             all partitions · PARTITION RANGE ALL · no Subplans Removed
```

---

# Join and Aggregate Signatures

```text
NESTED LOOP   good: small outer, inner = seek             bad: outer ≫ estimate, inner = scan
HASH JOIN     good: smaller input builds, 1 batch         bad: spills, build ≫ estimate, huge probe for few rows
MERGE JOIN    good: both inputs index-ordered             bad: big sorts feeding it, many-to-many worktables
HASH AGG      any order, memory per group                 watch: spills, groups ≫ estimate
STREAM AGG    sorted input, little memory                 watch: an extra Sort to provide the order
LIMIT/TOP     good: above streaming ordered access         bad: above a blocking sort or a row-goal scan
```

---

# Estimates: Causes and Signatures

```text
stale statistics     recent ranges estimated ~1 row            → ANALYZE / UPDATE STATISTICS / DBMS_STATS
skew                 good for some values, bad for others      → histograms, sniffing handling
correlation          each predicate fine, together far too low → multi-column / extended statistics
functions            fixed-guess selectivity                    → sargable rewrite, expression stats/index
sniffing             compiled ≠ runtime value                   → Section 15.08
row goals            Limit output right, rows read enormous     → index for filter + order
opaque objects       table variables, TVFs fixed at 1/100 rows  → temp tables, inlining, recompilation
```

---

# Parallel Plans

```text
zone below the exchange = parallel; above = serial
PostgreSQL   Gather / Gather Merge · Workers Planned vs Launched · loops = workers + leader · Partial/Finalize
SQL Server   Gather / Repartition / Distribute Streams · DOP · rows per thread · NonParallelPlanReason
Oracle       PX COORDINATOR · PX SEND/RECEIVE · IN-OUT (P->P, P->S, S->P) · PQ Distrib
check        balance across workers · serial bottlenecks · total CPU vs elapsed · concurrency
```

---

# Comparing Plans and Regressions

```text
fair         same data, statistics, parameters (values + types), settings, results
compare      shape → access → joins → estimates → work → memory → parallelism → time
identity     SQL Server query_plan_hash / plan_id · Oracle plan hash value · PG queryid (+ logged plans)
detect       Query Store regressed queries · AWR plan history · pg_stat_statements + auto_explain
respond      confirm → compare → force last good plan (temporary) → fix cause → unforce
```

---

# Production Capture

| Layer | PostgreSQL | SQL Server | Oracle | MySQL |
|-------|------------|------------|--------|-------|
| Workload stats (always) | `pg_stat_statements` | Query Store runtime stats | `V$SQLSTATS`, AWR | Performance Schema, `sys` |
| Plan history (always) | `auto_explain` logs | Query Store plans | AWR `DBA_HIST_SQL_PLAN` | — |
| Actual plans (threshold) | `auto_explain.log_analyze` + sampling | Last actual plan, XE | SQL Monitor | Re-run `EXPLAIN ANALYZE` |

---

# 📍 Execution Order Reminder

```text
1. FROM        ← leaves: scans, seeks, lookups, bitmaps, partition pruning
2. JOIN        ← nested loop / hash / merge; deepest join first
3. WHERE       ← navigate (seek conditions) vs discard (filters)
4. GROUP BY    ← hash or stream aggregation; partial/final in parallel plans
5. HAVING      ← filter on aggregate output
6. WINDOW      ← window operator above a sort (or index order)
7. SELECT      ← output lists; covering vs lookups
8. DISTINCT    ← unique / hash / distinct sort
9. ORDER BY    ← sort, top-N sort, incremental sort, or index order
10. LIMIT / FETCH / TOP   ← limit / top / stopkey at the root
```

---

# How the DBMS Executes This

```text
Reading any actual plan in five minutes:
  1. totals:      execution time, CPU vs elapsed, planning/JIT, grant, waits, warnings
  2. leaves:      access type, rows read vs returned, executions, buffers
  3. estimates:   walk up from the leaves; first ≥ 10× divergence = likely cause
  4. operators:   joins (sides, executions, spills), sorts/aggregates (rows, memory), limit (what's below)
  5. diagnosis:   "operator X does Y, caused by Z" → fix from Chapter 15 → compare plans
```

---

# Visual Knowledge Map

```text
                             READING EXECUTION PLANS (Chapter 16)
              get the actual plan → read it leaves-up → find the cause → compare after the fix
                                              │
   ┌───────────────┬────────────────┬─────────┴───────┬─────────────────┬──────────────────┐
   ▼               ▼                ▼                 ▼                 ▼                  ▼
 GETTING        STRUCTURE        ENGINE DIALECTS   OPERATORS         DIAGNOSIS          OPERATIONS
 16.02          16.03            16.04–16.07       16.08–16.10       16.11, 16.12       16.13–16.15
 estimated vs   iterators,       PostgreSQL,       access, joins,    estimates vs       parallel plans,
 actual, cache, blocking ops,    SQL Server,       sorts, aggregates,actuals, red       comparisons,
 parameters     loops, timing    MySQL, Oracle,    set ops, limits,  flags, warnings    regressions,
                                 SQLite            spools                               production capture
   └───────────────┴────────────────┴─────────┬───────┴─────────────────┴──────────────────┘
                                              ▼
              MISTAKES 16.16 ── capture · structure · arithmetic · operators · estimates · acting · operating

Connections to other chapters
  05.12 Execution Flow of SELECT           ──→ 16.03 (logical order vs physical tree)
  06.12 SARGability                        ──→ 16.08, 16.12 (seek conditions vs filters)
  07.14 Join algorithms                    ──→ 16.09
  08.14 Hash and stream aggregation        ──→ 16.10
  09.14 Unnesting and decorrelation        ──→ 16.09 (semi and anti joins)
  10.08 Seeks, scans and lookups           ──→ 16.08
  10.12 Selectivity and statistics         ──→ 16.11
  11.14 Window function execution          ──→ 16.10
  12.08 Type conversion                    ──→ 16.12 (implicit conversions)
  14.13 CTE materialization                ──→ 16.10 (spools and materialize)
  15.xx Query Optimization                 ──→ every section: plans are the evidence, Chapter 15 the fixes
  16.xx Reading Execution Plans            ──→ 17.xx Views and Materialized Views
```

---

# One-Page Summary

```text
CONCEPTS
  A plan is a tree of iterators; rows flow from the leaves to the root; estimated plans show
  beliefs, actual plans add facts; cost ranks alternatives but is not time

RULES
  Get the ACTUAL plan of the statement the application runs (parameters, types, settings)
  Read leaves-up; know each engine's layout, build side and per-loop/total conventions
  Normalise: × loops, ÷ executions, subtract children; compare estimates as ratios
  Find the lowest ≥ 10× misestimate; fix estimates before forcing plans
  Judge access by rows read vs returned and executions; seek conditions vs filters
  Check spills, conversions, residual predicates, lookups, inner scans, grants, pruning
  Compare plans fairly; track plan identity; capture plans in production continuously
```

---

# 🏗️ Architecture Insight

The chapter reduces to one idea: *the plan is evidence—read it before you act*. Every fix in Chapter 15 starts with something seen in a plan: a scan that reads too much, an estimate that is wrong, a conversion that blocks a seek, a spill, a regression. Teams that read plans fluently fix the cause the first time.

---

# ⚡ Performance Tip

If you remember one habit from this chapter: for every operator, compare **estimated rows, actual rows and rows read**. Those three numbers explain more slow queries than any other part of a plan.

---

# 💡 Did You Know?

The "Volcano" iterator model behind almost every plan you read—`open()`, `next()`, `close()` on each operator, with rows pulled from the root—comes from Goetz Graefe's Volcano query evaluation system, described in the early 1990s. It was also Volcano that introduced the "exchange" operator for parallelism, the same idea you see today as `Gather`, `Repartition Streams` and `PX SEND`.

---

# Related Topics

- **16.01 — Introduction to Execution Plans**
- **16.11 — Estimates vs Actuals (Finding Cardinality Misestimates)**
- **16.16 — Common Execution Plan Mistakes & Best Practices**
- **15.17 — Query Optimization Cheat Sheet & Visual Knowledge Map**
- **10.17 — Index Cheat Sheet & Visual Knowledge Map**
- **17.xx — Views and Materialized Views**

---

# Summary

This section condenses Chapter 16 into a single reference: commands for estimated, actual and application plans on each engine; the reading rules and layout conventions; how to normalise rows, executions and time; an operator translation table across PostgreSQL, SQL Server, MySQL, Oracle and SQLite; predicates that navigate versus discard; the red flags; join, aggregate and limit signatures; estimate-error causes and signatures; parallel operators; plan comparison and regression detection; and production capture. One idea carries the chapter—the plan is evidence, so read it before you act—and the knowledge map shows how plan reading connects every earlier chapter to the optimization fixes of Chapter 15.
