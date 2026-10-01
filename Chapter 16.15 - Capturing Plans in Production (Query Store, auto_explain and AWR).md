---
title: "16.15 - Capturing Plans in Production (Query Store, auto_explain and AWR)"
description: "How to capture execution plans from production safely and continuously: PostgreSQL auto_explain and pg_stat_statements, SQL Server Query Store, plan cache DMVs and Extended Events, Oracle cursor cache, AWR and SQL Monitor, MySQL slow query log and Performance Schema, overhead and sampling, retention, privacy of captured plans, and an operational setup that answers 'what plan did that query use yesterday?'"
chapter: 16
section: 16.15
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 25 min
lastUpdated: 2026-10-01
---

# 16.15 Capturing Plans in Production (Query Store, auto_explain and AWR)

---

# Learning Objectives

After completing this section, you will be able to:

- Enable continuous plan capture on PostgreSQL, SQL Server, Oracle and MySQL.
- Retrieve the plan a query used at a given time.
- Balance capture detail against overhead.
- Protect sensitive data in captured plans.
- Design an operational plan-capture setup.

---

# Why Capture Plans Continuously

```text
incident at 02:10: "checkout was slow for 20 minutes"
  without capture:   by 09:00 the plan was evicted, statistics refreshed, nobody can reproduce it
  with capture:      the query's plan changed at 02:04 (new plan hash), estimates of 12 vs 480,000,
                     previous plan still recorded → force it, then investigate
```

Plans are evidence that disappears: caches evict them, restarts clear them, and reproducing the exact conditions later is often impossible.

---

# PostgreSQL: auto_explain and pg_stat_statements

```text
# postgresql.conf
shared_preload_libraries = 'pg_stat_statements,auto_explain'

auto_explain.log_min_duration = '500ms'    # log plans of statements slower than this
auto_explain.log_analyze = on              # include actual rows/time (adds instrumentation overhead)
auto_explain.log_buffers = on
auto_explain.log_timing = off              # keep row counts, skip per-node timing (lower overhead)
auto_explain.log_nested_statements = on    # plans inside functions
auto_explain.sample_rate = 0.1             # instrument 10% of statements (optional)
auto_explain.log_format = 'json'           # for tools

pg_stat_statements.track = all
compute_query_id = on                      # queryid appears in logs and pg_stat_activity
```

- `pg_stat_statements` gives workload totals per normalised query (calls, time, rows, buffers)—*which* queries matter.
- `auto_explain` writes the actual plan of slow executions to the server log—*how* they ran.
- `log_analyze = on` instruments every statement (not only slow ones), because it cannot know in advance which will be slow; combine with `sample_rate` and `log_timing = off` on busy systems.
- Managed services expose the same settings (RDS/Aurora parameter groups, Cloud SQL flags, Azure server parameters).

---

# SQL Server: Query Store

```sql
ALTER DATABASE Shop SET QUERY_STORE = ON (
    OPERATION_MODE = READ_WRITE,
    QUERY_CAPTURE_MODE = AUTO,              -- skip trivial, rarely run queries
    MAX_STORAGE_SIZE_MB = 2048,
    INTERVAL_LENGTH_MINUTES = 15,
    CLEANUP_POLICY = (STALE_QUERY_THRESHOLD_DAYS = 30),
    WAIT_STATS_CAPTURE_MODE = ON
);
```

Query Store records, per query: every plan it used (estimated plan XML), and runtime statistics per plan per interval (executions, duration, CPU, reads, memory, waits). It is on by default for new databases from SQL Server 2022.

```sql
-- What plan did query 4712 use yesterday between 02:00 and 03:00?
SELECT p.plan_id, rs.count_executions, rs.avg_duration / 1000.0 AS avg_ms,
       TRY_CAST(p.query_plan AS XML) AS plan_xml
FROM sys.query_store_plan p
JOIN sys.query_store_runtime_stats rs           ON rs.plan_id = p.plan_id
JOIN sys.query_store_runtime_stats_interval i   ON i.runtime_stats_interval_id = rs.runtime_stats_interval_id
WHERE p.query_id = 4712
  AND i.start_time >= '2026-09-30T02:00' AND i.end_time <= '2026-09-30T03:00';
```

Other SQL Server sources: the plan cache (`sys.dm_exec_query_stats` + `sys.dm_exec_query_plan`, lost on eviction or restart), last actual plans (`sys.dm_exec_query_plan_stats`, 2019+ with `LAST_QUERY_PLAN_STATS`), and Extended Events (`query_post_execution_showplan` is expensive; `query_post_execution_plan_profile` is the lightweight variant). Query Store plans are **estimated** plans plus aggregated runtime statistics, not per-execution actual plans.

---

# Oracle: Cursor Cache, AWR and SQL Monitor

```sql
-- Current cursor cache
SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR('7h35uxf5uhmm1', NULL, 'ALLSTATS LAST +PEEKED_BINDS'));

-- Historical plans from AWR (Diagnostics Pack)
SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_WORKLOAD_REPOSITORY('7h35uxf5uhmm1'));

-- SQL Monitor report for a long-running execution (Tuning Pack)
SELECT DBMS_SQL_MONITOR.REPORT_SQL_MONITOR(sql_id => '7h35uxf5uhmm1', type => 'TEXT') FROM dual;
```

- The cursor cache (`V$SQL`, `V$SQL_PLAN`) holds current plans and statistics.
- AWR snapshots (hourly by default) keep top SQL, plan hash values and plans (`DBA_HIST_SQLSTAT`, `DBA_HIST_SQL_PLAN`) for the retention period.
- SQL Monitor automatically records statements that run longer than 5 seconds or in parallel, with per-operation actuals.
- ASH samples active sessions every second, including the `SQL_PLAN_LINE_ID` being executed—"which plan line was the time spent on?"
- AWR, ASH and SQL Monitor require the Diagnostics and Tuning Packs (Enterprise Edition licensing).

---

# MySQL: Slow Log and Performance Schema

```text
# my.cnf
slow_query_log = ON
long_query_time = 0.5
log_slow_extra = ON            # 8.0.14+: extra fields (rows examined, temp tables, sort info)
```

MySQL does not store plans automatically. Common practice:

- Use the slow log and `sys.statement_analysis` / `performance_schema.events_statements_summary_by_digest` to find expensive statements.
- Re-run `EXPLAIN` / `EXPLAIN ANALYZE` on captured statements (with their literal values), or `EXPLAIN FOR CONNECTION` while a statement is running.
- Tools (pt-query-digest, cloud performance insights) aggregate the slow log and attach `EXPLAIN` output.

---

# Overhead and Sampling

| Capture | Overhead | Notes |
|---------|----------|-------|
| Workload statistics (`pg_stat_statements`, Query Store runtime stats, AWR) | Low | Always on |
| Estimated plans per query (Query Store, AWR) | Low | Always on |
| Actual plans for slow statements (`auto_explain` with analyze) | Medium–high | Sample; disable per-node timing |
| Actual plans for every execution (XE `query_post_execution_showplan`, `statistics_level = ALL`) | High | Short, targeted sessions only |
| Live progress (Live Query Statistics, SQL Monitor) | Low–medium | For long-running statements |

Rule: capture **workload statistics and plan identities always**, **actual plans selectively**.

---

# Privacy and Retention

```text
• plans contain literals and sometimes parameter values (compiled values, peeked binds)
• logs with auto_explain plans may contain personal data → treat like the data itself
• restrict VIEW SERVER STATE / VIEW DATABASE STATE, SELECT on DBA_HIST_*, log access
• scrub literals before sharing plans in tickets or with vendors
• set retention: long enough to compare with "last week" and "before the release",
  short enough to respect data-protection rules and storage limits
```

---

# An Operational Setup

```text
always on      workload statistics per query (calls, time, CPU, reads)    pg_stat_statements / Query Store / AWR
always on      plan identity history (which plan, when)                   Query Store / AWR / auto_explain logs
thresholded    actual plans of slow statements                           auto_explain / SQL Monitor / last actual plan
alerting       per-query latency regression + plan change                 monitoring on the above
runbook        "how to get the plan for query X at time T"                per engine, tested before incidents
baselines      stored plans for critical queries                          in the repository, diffed in CI/releases
```

---

# Visual Representation

```text
   production executions
          │
          ├──▶ workload stats (always)      → which queries cost the most?
          ├──▶ plan identity (always)       → which plan did it use, and when did that change?
          ├──▶ actual plans (thresholded)   → how exactly did the slow runs execute?
          └──▶ live progress (on demand)    → what is the long query doing right now?
   PostgreSQL: pg_stat_statements · auto_explain     SQL Server: Query Store · DMVs · XE
   Oracle: V$SQL · AWR · ASH · SQL Monitor           MySQL: slow log · Performance Schema · EXPLAIN
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← captured plans show the access paths production actually used
2. JOIN        ← … the join order and algorithms chosen with production statistics
3. WHERE       ← … predicates with production parameter values (compiled vs runtime)
4. GROUP BY    ← … aggregation strategies and spills at production volume
5. HAVING
6. WINDOW
7. SELECT
8. DISTINCT
9. ORDER BY    ← … sorts and memory grants under production concurrency
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Query Store:   on compile → store plan (if new); on completion → add runtime stats to
               the current interval for (query, plan); flushed asynchronously to the database
auto_explain:  executor hooks → if instrumented and duration ≥ threshold → write EXPLAIN output to the log
AWR:           every snapshot interval → copy top SQL statistics and their plans from memory to DBA_HIST_*
```

---

# 🏗️ Architecture Insight

Plan capture belongs in the platform, not in individual incidents. Bake it into database provisioning (parameter groups, templates, infrastructure as code), size its storage, and verify it in disaster-recovery tests—after a failover is exactly when you will need yesterday's plans.

---

# ⚡ Performance Tip

On busy PostgreSQL systems, start `auto_explain` with `log_analyze = on`, `log_timing = off`, `log_buffers = on` and a `sample_rate` well below 1. You keep actual rows and buffers—the most useful evidence—at a fraction of the overhead.

---

# 🌍 Production Consideration

Query Store can switch itself to `READ_ONLY` when it reaches its size limit, silently stopping capture. Monitor its state (`actual_state_desc` in `sys.database_query_store_options`) and size it for your workload.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Workload statistics | ❌ | `pg_stat_statements` | Performance Schema, `sys` | Query Store, DMVs | `V$SQLSTATS`, AWR | ❌ |
| Persisted plan history | ❌ | Logs (`auto_explain`) | ❌ | Query Store | AWR | ❌ |
| Actual plans of slow statements | ❌ | `auto_explain` | ❌ (re-run EXPLAIN) | Last actual plan, XE | SQL Monitor | ❌ |
| Live progress | ❌ | Limited | ❌ | Live Query Statistics | SQL Monitor | ❌ |
| Extra licensing | ❌ | ❌ | ❌ | ❌ | Diagnostics / Tuning Packs | ❌ |

> **Portability Tip:** Whatever the engine, aim for the same three layers: workload statistics always, plan history always, actual plans for slow statements on a threshold.

---

# Common Mistakes

### Mistake 1

Relying on the plan cache, which loses plans on eviction, restart and failover.

---

### Mistake 2

Enabling per-execution actual plan capture on a busy production server.

---

### Mistake 3

Letting Query Store fill up and switch to read-only unnoticed.

---

### Mistake 4

Sharing captured plans without scrubbing literals and parameter values.

---

# Best Practices

✔ Keep workload statistics and plan history always on.

✔ Capture actual plans for slow statements with thresholds and sampling.

✔ Write a tested runbook for retrieving the plan of a query at a given time.

✔ Restrict and retain captured plans like the data they describe.

✔ Monitor the capture mechanisms themselves.

---

# Interview Questions

## Basic

1. What does `auto_explain` do?
2. What does Query Store store?
3. What is AWR?

## Intermediate

4. Why does `auto_explain.log_analyze` add overhead to statements that are not slow?
5. How would you find the plan a SQL Server query used yesterday at 2 a.m.?
6. Why is the plan cache not enough for incident analysis?

## Advanced

7. Design a plan-capture setup for a busy PostgreSQL OLTP system, including overhead controls.
8. What privacy risks do captured plans create, and how do you manage them?

---

# Hands-on Exercises

## Exercise 1

Enable `auto_explain` (or Query Store) on a test database, run a slow query, and retrieve its plan from the log or store.

---

## Exercise 2

Write a query that lists, for one query, every plan used in the last week with its average duration.

---

## Exercise 3

Write a one-page runbook for your engine: "how to get the actual plan of a slow production query".

---

# Related Topics

- **15.14 — Measuring Query Performance (Timing, I/O and Wait Statistics)**
- **15.15 — A Systematic Tuning Workflow**
- **16.02 — Getting a Plan (EXPLAIN, Estimated and Actual Plans)**
- **16.14 — Comparing Plans and Detecting Plan Regressions**
- **04.11 — Data Control Language (DCL) Deep Dive**

---

# Summary

Production plans are evidence that disappears unless captured. PostgreSQL combines `pg_stat_statements` for workload statistics with `auto_explain` for actual plans of slow statements; SQL Server's Query Store keeps plans and runtime statistics per interval, complemented by the plan cache, last actual plans and Extended Events; Oracle offers the cursor cache, AWR plan history, ASH and SQL Monitor; MySQL relies on the slow log, Performance Schema and re-running `EXPLAIN`. Capture workload statistics and plan history always and actual plans selectively, control overhead with thresholds and sampling, protect and retain captured plans like the data they contain, and keep a tested runbook for retrieving any query's plan at any time.
