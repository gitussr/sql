---
title: "16.14 - Comparing Plans and Detecting Plan Regressions"
description: "How to compare two execution plans for the same query: making comparisons fair, what to compare (shape, access paths, join order and algorithms, estimates, reads, memory, time), plan identity with plan hashes, why plans change (statistics, data growth, parameters, upgrades, configuration, index changes), detecting regressions with Query Store, AWR and pg_stat_statements, and safe responses including plan forcing."
chapter: 16
section: 16.14
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 25 min
lastUpdated: 2026-10-01
---

# 16.14 Comparing Plans and Detecting Plan Regressions

---

# Learning Objectives

After completing this section, you will be able to:

- Make a fair before/after comparison of two plans.
- Compare plans systematically, from shape to numbers.
- Identify plans by hash and track plan changes over time.
- Explain the common reasons a query's plan changes.
- Detect and respond to plan regressions in production.

---

# Making Comparisons Fair

Two plans are comparable only when everything except the change under test is the same:

```text
same     data volume and distribution          (same database or a faithful copy)
same     statistics                            (refresh both sides, or neither)
same     parameter values AND types            (including the slow ones)
same     settings                              (memory, parallelism, cost settings, SET options)
same     cache state, or compare reads          (warm vs cold changes time, not logical reads)
same     result                                 (row count and checksum: a faster wrong query is not a fix)
```

Logical reads (buffers) and CPU time are more stable than elapsed time; use them as the primary measures and confirm with elapsed time over several runs.

---

# What to Compare

```text
1. SHAPE        same operators in the same tree? (plan hash / visual diff)
2. ACCESS       scan ↔ seek, index chosen, lookups added or removed, index-only or not
3. JOINS        order changed? algorithm changed (nested loop ↔ hash ↔ merge)?
4. ESTIMATES    did estimates move closer to actuals?
5. WORK         rows read, logical reads, executions of inner sides
6. MEMORY       grants, spills, sorts added or removed
7. PARALLELISM  serial ↔ parallel, DOP
8. TIME         CPU and elapsed, several runs, representative parameters
```

```text
Before                                           After (index on (CustomerID, Status))
Index Scan ix_orders_customer_date               Index Scan ix_orders_customer_status
  Index Cond: customerid = 42                      Index Cond: customerid = 42 AND status = 'Pending'
  Filter: status = 'Pending'                       (no filter)
  Rows Removed by Filter: 499,880                  rows=120
  Buffers: shared hit=31,204 read=4,118            Buffers: shared hit=6
  Execution Time: 412 ms                           Execution Time: 0.09 ms
```

SSMS has *Compare Showplan* (right-click a plan) that highlights matching regions and property differences; PostgreSQL visualizers accept two plans; for text plans, a plain diff after removing numbers shows shape changes.

---

# Plan Identity

| Engine | Query identity | Plan identity |
|--------|----------------|---------------|
| SQL Server | `query_hash`, Query Store `query_id` | `query_plan_hash`, Query Store `plan_id` |
| Oracle | `SQL_ID` | Plan hash value |
| PostgreSQL | `queryid` (`pg_stat_statements`, `compute_query_id`) | No built-in plan hash (`auto_explain` logs plans; extensions such as `pg_store_plans` add one) |
| MySQL | Statement digest (Performance Schema) | No plan hash |

A query that shows **two or more plan hashes** with very different average durations is the classic signature of a plan regression or of parameter-sensitive plans.

---

# Why Plans Change

| Trigger | Example |
|---------|---------|
| Statistics refresh | New histogram moves a tipping point: seek → scan |
| Data growth or skew shift | A table crosses the size where a hash join becomes cheaper |
| Parameter values (sniffing) | Recompiled for an atypical value; cached plan bad for the rest |
| Plan cache eviction / restart / failover | Next compile sees different parameters |
| Index added, dropped or rebuilt | New access path—or a dropped one the plan depended on |
| Schema change | New column, constraint, data type change |
| Engine upgrade / compatibility level | New cardinality estimator or optimizer rules |
| Configuration | Memory, parallelism, cost settings changed |
| Concurrency / adaptive features | Memory grant or adaptive join decisions differ at run time |

Many plan changes are improvements. A **regression** is a plan change that makes the query meaningfully slower for the workload.

---

# Detecting Regressions

```sql
-- SQL Server Query Store: queries with more than one plan and a big duration gap
SELECT q.query_id, p.plan_id, rs.count_executions,
       rs.avg_duration / 1000.0 AS avg_ms, rs.avg_logical_io_reads,
       p.last_execution_time
FROM sys.query_store_query q
JOIN sys.query_store_plan p          ON p.query_id = q.query_id
JOIN sys.query_store_runtime_stats rs ON rs.plan_id = p.plan_id
WHERE q.query_id IN (SELECT query_id FROM sys.query_store_plan GROUP BY query_id HAVING COUNT(*) > 1)
ORDER BY q.query_id, avg_ms DESC;
```

```sql
-- Oracle AWR: plan hash history for one SQL_ID
SELECT snap_id, plan_hash_value, executions_delta,
       ROUND(elapsed_time_delta / NULLIF(executions_delta, 0) / 1000) AS avg_ms
FROM DBA_HIST_SQLSTAT
WHERE sql_id = '7h35uxf5uhmm1'
ORDER BY snap_id;
```

```sql
-- PostgreSQL: mean time per query over time requires snapshots of pg_stat_statements;
-- plans themselves come from auto_explain logs (Section 16.15)
SELECT queryid, calls, mean_exec_time, stddev_exec_time, shared_blks_hit + shared_blks_read AS blocks
FROM pg_stat_statements
ORDER BY mean_exec_time * calls DESC
LIMIT 20;
```

Also: SSMS "Regressed Queries" and "Queries With Forced Plans" reports, SQL Server automatic tuning (`FORCE_LAST_GOOD_PLAN`), Oracle SQL Plan Management evolve reports, and monitoring alerts on per-query p95 latency.

---

# Responding to a Regression

```text
1. CONFIRM   same query, new plan hash, worse duration/reads for typical parameters
2. COMPARE   old plan vs new plan: which operator changed, which estimate moved?
3. STABILISE (short term) force the last good plan:
               SQL Server  sp_query_store_force_plan @query_id, @plan_id
               Oracle      SQL plan baseline (DBMS_SPM) loaded from the cursor cache or AWR
4. FIX       (long term) the cause: statistics, skew handling, index, SQL shape, parameters
5. UNFORCE   once the optimizer finds the good plan on its own, remove the forcing
```

Forced plans are a tourniquet, not a cure: they can fail when the schema changes (an index they need is dropped), and they hide the next data shift. Track every forced plan with an owner and a reason (Section 15.09).

---

# Regression Testing Before Release

```text
• capture plans for critical queries in a baseline (plan XML / JSON stored with the code)
• after schema, index, statistics or upgrade changes, regenerate plans on production-like data
• diff the shapes; for every change, compare reads and CPU with representative parameters
• SQL Server: upgrade with Query Store on, under the OLD compatibility level, then raise it
  and use Query Store to find regressions (the "Query Tuning Assistant" workflow)
• Oracle: SQL Performance Analyzer compares workloads before and after a change
```

---

# Visual Representation

```text
  duration ▲                 plan B (hash 0x7F…)  ← regression
           │          ┌──────────────────────────
           │          │
           │──────────┘
           │ plan A (hash 0x2C…)
           └─────────────────┬─────────────────────────▶ time
                             stats refresh / failover / new index / upgrade
   respond:  confirm → compare A vs B → force A (temporary) → fix cause → unforce
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← compare access paths: scan ↔ seek, lookups, pruning
2. JOIN        ← compare join order and algorithms
3. WHERE       ← compare where predicates are applied (seek vs residual)
4. GROUP BY    ← compare hash vs stream aggregation, spills
5. HAVING
6. WINDOW      ← compare sorts feeding window operators
7. SELECT      ← compare covering vs lookups
8. DISTINCT
9. ORDER BY    ← compare sorts added or removed
10. LIMIT / FETCH / TOP   ← compare early termination and rows read below the limit
```

---

# How the DBMS Executes This

```text
each compilation produces a plan → hashed into a plan identity
plan stores (Query Store, AWR, auto_explain logs) record:
   plan identity + runtime statistics (executions, duration, CPU, reads) per interval
regression detection = same query identity, new plan identity, worse runtime statistics
```

---

# 🏗️ Architecture Insight

Plan stability is a design goal for critical paths. Queries whose best plan depends heavily on parameter values (very skewed data) deserve explicit handling—separate code paths, recompilation, or plan variants—rather than hoping the cached plan suits everyone (Section 15.08).

---

# ⚡ Performance Tip

When comparing two plans, compare logical reads first. A plan that reads 10× fewer pages is almost always faster under load, even if a single warm run shows similar times.

---

# 🌍 Production Consideration

Many regressions happen at predictable moments: after a statistics job, a failover, an index maintenance window, a deployment or an engine upgrade. Watch query latency closely after each of these, and keep plan capture enabled so you can see what the previous plan was.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Plan history | ❌ | `auto_explain` logs, extensions | ❌ | Query Store | AWR (`DBA_HIST_SQL_PLAN`) | ❌ |
| Plan identity | ❌ | Extensions | ❌ | `query_plan_hash` | Plan hash value | ❌ |
| Force a known plan | ❌ | ❌ (`pg_hint_plan`) | ❌ (hints) | Query Store forcing | SQL plan baselines | ❌ |
| Automatic regression correction | ❌ | ❌ | ❌ | `FORCE_LAST_GOOD_PLAN` | SPM evolve, adaptive features | ❌ |
| Visual plan compare | ❌ | Third-party | ❌ | SSMS Compare Showplan | SQL Developer, OEM | ❌ |

> **Portability Tip:** Without a built-in plan store, keep your own: log plans of slow statements (`auto_explain`, slow logs with `EXPLAIN`) and store baseline plans for critical queries alongside the code.

---

# Common Mistakes

### Mistake 1

Comparing a cold-cache "before" with a warm-cache "after".

---

### Mistake 2

Comparing plans compiled for different parameter values.

---

### Mistake 3

Forcing a plan and never investigating why it regressed.

---

### Mistake 4

Assuming every plan change is a regression.

---

# Best Practices

✔ Hold data, statistics, parameters and settings constant when comparing.

✔ Compare shape, access, joins, estimates, reads, memory, then time.

✔ Track plan identities per query over time.

✔ Force a last good plan only as a temporary measure, with an owner.

✔ Regression-test plans before upgrades and schema changes.

---

# Interview Questions

## Basic

1. What is a plan regression?
2. What is a plan hash?
3. Name three reasons a query's plan can change.

## Intermediate

4. How do you compare two plans fairly?
5. How do you find queries with multiple plans in Query Store or AWR?
6. Why are logical reads better than elapsed time for comparing plans?

## Advanced

7. Describe a full response to a regression detected after a statistics refresh.
8. How would you regression-test plans before an engine upgrade?

---

# Hands-on Exercises

## Exercise 1

Capture a plan, add an index, capture again, and write a structured comparison using the eight-step list.

---

## Exercise 2

Find a query with more than one plan in your engine's plan store and compare their runtime statistics.

---

## Exercise 3

Force a plan (Query Store or a baseline), confirm it is used, then remove the forcing.

---

# Related Topics

- **15.08 — Parameter Sniffing, Plan Caching and Prepared Statements**
- **15.09 — Optimizer Hints and Plan Guides**
- **15.15 — A Systematic Tuning Workflow**
- **16.11 — Estimates vs Actuals (Finding Cardinality Misestimates)**
- **16.15 — Capturing Plans in Production (Query Store, auto_explain and AWR)**

---

# Summary

Comparing plans is how you prove a fix and catch a regression. Fair comparisons hold data, statistics, parameters, settings and results constant, and rely on logical reads and CPU before elapsed time. Compare plans from shape to numbers: access paths, join order and algorithms, estimates, work, memory, parallelism and time. Plan hashes identify plan shapes, so a query with several plan hashes and diverging durations signals a regression. Plans change after statistics refreshes, data growth, parameter sniffing, cache evictions, index and schema changes, upgrades and configuration changes. Detect regressions with Query Store, AWR or your own plan logs, stabilise with a forced plan when needed, then fix the cause and remove the forcing.
