---
title: "15.14 - Measuring Query Performance (Timing, I/O and Wait Statistics)"
description: "How to measure query performance correctly: elapsed versus CPU time, logical and physical reads, buffer statistics, rows processed, wait statistics, cold versus warm cache, client fetch and network time, per-query measurement tools (EXPLAIN ANALYZE BUFFERS, SET STATISTICS IO/TIME, EXPLAIN ANALYZE, DBMS_XPLAN ALLSTATS), workload tools (pg_stat_statements, Query Store, Performance Schema, AWR/ASH, slow query logs), ranking queries by total cost, percentiles instead of averages, and benchmarking pitfalls."
chapter: 15
section: 15.14
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 15.14 Measuring Query Performance (Timing, I/O and Wait Statistics)

---

# Learning Objectives

After completing this section, you will be able to:

- Choose the right metric: elapsed time, CPU time, reads, rows or waits.
- Measure a single query accurately on each engine.
- Find the most expensive queries in a workload.
- Avoid common benchmarking mistakes (cache effects, averages, client time).

---

# The Metrics

| Metric | What it tells you | Why it matters |
|--------|-------------------|----------------|
| Elapsed (wall-clock) time | What the user experiences | Includes waiting, parallelism, network |
| CPU time | Work done by the server | Stable across cache states; the cost you pay under load |
| Logical reads (buffer gets, shared hits) | Pages touched in memory | The best measure of "how much work the plan does" |
| Physical reads | Pages read from disk | Depends on cache state; spikes on cold runs |
| Rows processed per operator | Where the work happens | Compare with estimates (15.03) |
| Waits | What the query waited for | Locks, I/O, memory, CPU scheduling, network |
| Executions | How often it runs | Multiplies every per-execution cost |

Logical reads are the most useful single number for comparing two plans: they are nearly independent of cache state and concurrency, and they correlate strongly with CPU.

---

# Measuring One Query

```sql
-- PostgreSQL: actual rows, timing and buffers per operator
EXPLAIN (ANALYZE, BUFFERS, TIMING) SELECT …;
--   Buffers: shared hit=820 read=12       (hit = in memory, read = from disk/OS cache)
--   Execution Time: 21.4 ms
-- \timing on   in psql for client-side elapsed time

-- SQL Server
SET STATISTICS IO, TIME ON;
SELECT …;
--   Table 'Orders'. Scan count 1, logical reads 820, physical reads 0, …
--   SQL Server Execution Times: CPU time = 16 ms, elapsed time = 21 ms.
-- plus the actual execution plan (per-operator rows, and in newer versions per-operator time and I/O)

-- MySQL 8.0.18+
EXPLAIN ANALYZE SELECT …;          -- actual time and rows per iterator
SHOW SESSION STATUS LIKE 'Handler_read%';   -- rows read by method (before/after comparison)

-- Oracle
SELECT /*+ GATHER_PLAN_STATISTICS */ …;
SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(FORMAT => 'ALLSTATS LAST'));
--   A-Rows, A-Time, Buffers, Reads per operation
-- SET AUTOTRACE TRACEONLY STATISTICS   in SQL*Plus: consistent gets, physical reads

-- SQLite
.timer on
.eqp on
```

`EXPLAIN ANALYZE` executes the query. For `INSERT`/`UPDATE`/`DELETE`, wrap it in a transaction and roll back.

---

# Cold vs Warm Cache

```text
run 1: 3,900 ms   physical reads 410,000   ← data read from disk
run 2:   380 ms   physical reads 0         ← same data now in memory
```

Neither number alone is "the" performance. Report both when it matters, compare plans by logical reads, and remember that production caches hold the **hot** data—a report touching years of cold history behaves like run 1 every time.

---

# Client Time Is Part of Elapsed Time

```text
server execution    40 ms
send 2,000,000 rows over the network + client materialization   9,000 ms
```

A query that returns huge result sets is slow for reasons the plan cannot show. Check rows returned and bytes sent; fetch what the user needs (pagination, aggregation in SQL). Tools that print results to a screen add their own rendering time—measure with results discarded when comparing server work.

---

# Wait Statistics

What a query (or the whole server) spends time waiting on:

| Engine | Where | Common waits |
|--------|-------|--------------|
| PostgreSQL | `pg_stat_activity.wait_event_type/wait_event` (sampled) | `Lock`, `LWLock`, `IO: DataFileRead`, `Client: ClientRead` |
| SQL Server | `sys.dm_os_wait_stats`, `sys.dm_exec_session_wait_stats`, Query Store wait stats (2017+) | `LCK_M_*`, `PAGEIOLATCH_*`, `CXPACKET`/`CXCONSUMER`, `RESOURCE_SEMAPHORE`, `ASYNC_NETWORK_IO` |
| Oracle | ASH / AWR, `V$SESSION_EVENT` | `db file sequential read`, `enq: TX - row lock contention`, `log file sync` |
| MySQL | Performance Schema `events_waits_*`, `sys.waits_*` | `wait/io/table/…`, `wait/lock/table/…`, row lock waits |

```text
ASYNC_NETWORK_IO high          → client fetching slowly (row-by-row processing, huge results)
PAGEIOLATCH / DataFileRead     → reading from disk (missing index, cold cache, too little memory)
LCK_M_* / row lock contention  → blocking (15.13)
RESOURCE_SEMAPHORE             → waiting for memory grants (big sorts/hashes, overestimates)
log file sync / WRITELOG       → commit latency (too many small transactions, slow log storage)
```

---

# Finding Expensive Queries in a Workload

```sql
-- PostgreSQL (pg_stat_statements extension)
SELECT query, calls, total_exec_time, mean_exec_time, rows, shared_blks_hit + shared_blks_read AS blocks
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;

-- SQL Server (Query Store, 2016+)
SELECT TOP (20) q.query_id, qt.query_sql_text,
       SUM(rs.count_executions)                          AS executions,
       SUM(rs.avg_duration * rs.count_executions) / 1000 AS total_ms,
       SUM(rs.avg_logical_io_reads * rs.count_executions) AS total_reads
FROM sys.query_store_query_text AS qt
JOIN sys.query_store_query      AS q  ON q.query_text_id = qt.query_text_id
JOIN sys.query_store_plan       AS p  ON p.query_id = q.query_id
JOIN sys.query_store_runtime_stats AS rs ON rs.plan_id = p.plan_id
GROUP BY q.query_id, qt.query_sql_text
ORDER BY total_ms DESC;

-- MySQL (sys schema over Performance Schema)
SELECT query, exec_count, total_latency, avg_latency, rows_examined_avg
FROM sys.statement_analysis
ORDER BY total_latency DESC
LIMIT 20;

-- Oracle
SELECT sql_id, executions, elapsed_time / 1e6 AS elapsed_s, buffer_gets, sql_text
FROM v$sqlstats
ORDER BY elapsed_time DESC
FETCH FIRST 20 ROWS ONLY;
```

Slow query logs complement them: PostgreSQL `log_min_duration_statement` and `auto_explain` (logs plans of slow queries), MySQL `slow_query_log` with `long_query_time` (summarized by tools such as `pt-query-digest`), SQL Server Extended Events.

Rank by **total** time (or total reads/CPU): a 2 ms query run 50 million times a day outweighs a 20-second nightly report.

---

# Averages Hide Problems

```text
mean 40 ms   but   p50 = 5 ms, p95 = 30 ms, p99 = 2,400 ms
```

A few very slow executions (sniffed plans, lock waits, cold data) disappear in averages. Track percentiles (p95, p99) and maximums from application metrics or Query Store/`pg_stat_statements` (min/max/stddev), and investigate the slow tail separately.

---

# Benchmarking Pitfalls

```text
□ testing on tiny or uniform data                  → use production-sized, production-skewed data
□ one run                                          → repeat; report distribution, warm and cold
□ literal values in a query window vs parameters   → test the way the application runs it (15.08)
□ measuring with results printed to screen         → discard results or measure server time
□ changing several things at once                  → one change per measurement
□ no concurrency                                   → include concurrent load for OLTP (15.13)
□ comparing elapsed time only                      → compare logical reads and CPU too
□ caches, plans or statistics differ between runs  → control them (or note them)
```

---

# Visual Representation

```text
   elapsed time ────────────────────────────────────────────────────────────────
   │ parse/compile │ CPU (work) │ I/O waits │ lock waits │ memory waits │ network/client │
                    └─ logical reads ─┘ └ physical ┘
   "too much work"    → CPU and logical reads high
   "wrong plan"       → reads far above what the result needs; estimates ≠ actuals
   "waiting"          → elapsed ≫ CPU; waits explain the gap
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← per-table logical/physical reads show which access path costs most
2. JOIN        ← loops/executions per operator reveal nested-loop explosions
3. WHERE       ← "Rows Removed by Filter" shows work thrown away
4. GROUP BY    ← memory and spill statistics
5. HAVING
6. WINDOW      ← sort memory and spills
7. SELECT
8. DISTINCT
9. ORDER BY    ← sort method: in memory, top-N, external
10. LIMIT / FETCH / TOP   ← rows returned to the client: network time
```

---

# How the DBMS Executes This

```text
Measuring one query, in order:
  1. actual plan with rows per operator      → where is the work? estimate errors?
  2. logical reads per table                 → how much work in total?
  3. CPU vs elapsed                           → working or waiting?
  4. waits for this session                   → what was it waiting on?
  5. rows/bytes returned                      → client/network cost?
```

---

# 🏗️ Architecture Insight

Build measurement in from the start: enable `pg_stat_statements`, Query Store or Performance Schema in every environment, log slow queries with plans, tag queries with application context (`application_name`, SQL comments with the endpoint name), and track p95/p99 latency per endpoint. Tuning without this data is guesswork.

---

# ⚡ Performance Tip

When comparing two versions of a query, compare **logical reads** first. A rewrite that cuts reads from 400,000 to 800 is better even if a single warm-cache run shows similar times.

---

# 🔒 Security Note

Query statistics stores and slow logs contain SQL text and, depending on settings, parameter values or literals. Limit access, set retention, and avoid logging parameter values for queries that handle sensitive data.

---

# 🌍 Production Consideration

Measurement has overhead. `EXPLAIN ANALYZE` with per-row timing, Performance Schema instrumentation and verbose Extended Events cost CPU. Keep always-on tools at their default, low-overhead levels and enable detailed tracing briefly, for specific sessions or queries.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Per-query actuals | ❌ | `EXPLAIN (ANALYZE, BUFFERS)` | `EXPLAIN ANALYZE` | Actual plan, `STATISTICS IO/TIME` | `ALLSTATS LAST` | `.timer`, `.eqp` |
| Workload statistics | ❌ | `pg_stat_statements` | Performance Schema, sys | Query Store, DMVs | `V$SQLSTATS`, AWR (licensed) | ❌ |
| Wait statistics | ❌ | `pg_stat_activity` (sampled) | Performance Schema | `dm_os_wait_stats` | ASH/AWR, `V$SESSION_EVENT` | ❌ |
| Slow query log | ❌ | `log_min_duration_statement`, `auto_explain` | `slow_query_log` | Extended Events | SQL trace, AWR | ❌ |

> **Portability Tip:** The metrics are universal—elapsed, CPU, logical and physical reads, rows, waits, executions. The views and commands that expose them are engine-specific.

---

# Common Mistakes

### Mistake 1

Comparing single warm-cache runs.

---

### Mistake 2

Ranking queries by average duration instead of total cost.

---

### Mistake 3

Ignoring client and network time in elapsed time.

---

### Mistake 4

Looking at averages and missing the p99 tail.

---

### Mistake 5

Running `EXPLAIN ANALYZE` on a write without a rollback.

---

# Best Practices

✔ Compare plans by logical reads and CPU, not just elapsed time.

✔ Rank workload queries by total time or total reads.

✔ Check waits when elapsed time far exceeds CPU.

✔ Track percentiles, not averages.

✔ Keep workload statistics enabled everywhere.

---

# Interview Questions

## Basic

1. What is the difference between elapsed time and CPU time?
2. What are logical reads?
3. How do you see the actual row counts of a plan on your engine?

## Intermediate

4. Why compare plans by logical reads?
5. How do you find the most expensive queries on a server?
6. What does a high `ASYNC_NETWORK_IO` wait indicate?

## Advanced

7. Why can a query's average duration look fine while users complain?
8. List five benchmarking mistakes and how to avoid them.

---

# Hands-on Exercises

## Exercise 1

Measure one query cold and warm, recording elapsed time, CPU and logical/physical reads.

---

## Exercise 2

List the top 10 queries by total time on your engine's workload view.

---

## Exercise 3

Find a query whose elapsed time is much larger than its CPU time and identify the wait.

---

# Related Topics

- **15.13 — Concurrency, Locking and Query Performance**
- **15.15 — A Systematic Tuning Workflow**
- **15.08 — Parameter Sniffing, Plan Caching and Prepared Statements**
- **16.xx — Reading Execution Plans**

---

# Summary

Measure the right things: elapsed time for user experience, CPU time and logical reads for the work a plan does, physical reads for cache effects, per-operator rows for where the work happens, waits for time spent not working, and executions to turn per-call costs into totals. Each engine exposes these through per-query tools (`EXPLAIN ANALYZE`, `SET STATISTICS IO/TIME`, `DBMS_XPLAN`) and workload stores (`pg_stat_statements`, Query Store, Performance Schema, AWR). Rank queries by total cost, watch percentiles rather than averages, separate server time from client time, and benchmark with realistic data, parameters, cache states and concurrency.
