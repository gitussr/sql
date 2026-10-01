---
title: "16.13 - Parallel Plans and Exchange Operators"
description: "How to read parallel execution plans: workers and degree of parallelism, Gather and Gather Merge in PostgreSQL, Parallelism operators (Gather, Repartition and Distribute Streams) in SQL Server, PX operators and table queues in Oracle, partial and final aggregation, per-worker row counts and skew, why a plan is not parallel, and when parallelism helps or hurts."
chapter: 16
section: 16.13
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 20 min
lastUpdated: 2026-10-01
---

# 16.13 Parallel Plans and Exchange Operators

---

# Learning Objectives

After completing this section, you will be able to:

- Recognise parallel plans and their exchange operators on each engine.
- Interpret per-worker numbers and detect skew between workers.
- Read partial and final aggregation.
- Find out why a plan did not go parallel.
- Judge when parallelism helps and when it hurts.

---

# What a Parallel Plan Looks Like

A parallel plan splits work across several workers (threads or processes). **Exchange** operators move rows between them:

```text
           ┌──────── leader / coordinator ────────┐
           │            Gather (exchange)          │  ← merges worker output
           └───────▲───────────▲───────────▲───────┘
                   │           │           │
              worker 1    worker 2    worker 3       ← each runs the same sub-plan on part of the data
              Partial      Partial     Partial
              Aggregate    Aggregate   Aggregate
              Parallel     Parallel    Parallel
              Seq Scan     Seq Scan    Seq Scan
```

Everything **below** the exchange runs in parallel; everything **above** it runs in one process.

---

# PostgreSQL

```text
Finalize GroupAggregate  (actual rows=151 loops=1)
  Group Key: c.country
  -> Gather Merge  (actual rows=604 loops=1)
        Workers Planned: 3
        Workers Launched: 3
        -> Sort  (actual rows=151 loops=4)
              Sort Key: c.country
              -> Partial HashAggregate  (actual rows=151 loops=4)
                    Group Key: c.country
                    -> Parallel Hash Join  (actual rows=97,805 loops=4)
                          -> Parallel Seq Scan on orders o  (actual rows=2,500,000 loops=4)
                          -> Parallel Hash
                                -> Parallel Seq Scan on customers c  (actual rows=250,000 loops=4)
```

- `Gather` collects rows from workers in any order; `Gather Merge` preserves sort order.
- `Workers Planned` vs `Workers Launched`: fewer launched means the pool (`max_parallel_workers`, `max_worker_processes`) was exhausted.
- `loops=4` = 3 workers + the leader (which also participates by default). Per-loop rows × 4 = total: 2,500,000 × 4 = 10,000,000.
- `Partial` / `Finalize` aggregates: each worker aggregates its share; the leader combines them.
- `VERBOSE` adds per-worker lines (`Worker 0: actual time=… rows=…`) to spot uneven work.

---

# SQL Server

```text
SELECT ◀─ Stream Aggregate ◀─ Parallelism (Gather Streams) ◀─ Hash Match (Partial Aggregate)
                                                          ◀─ Hash Match (Inner Join)
                                                               ◀─ Parallelism (Repartition Streams)  ◀─ Clustered Index Scan (Customers)
                                                               ◀─ Parallelism (Repartition Streams)  ◀─ Clustered Index Scan (Orders)
```

| Exchange | What it does |
|----------|--------------|
| `Gather Streams` | Many threads → one (often near the root) |
| `Repartition Streams` | Many → many, redistributing rows by hash, range or round-robin so matching keys meet on the same thread |
| `Distribute Streams` | One → many |

Parallel operators show a yellow double-arrow badge. In the root node: `Degree of Parallelism`; in operator properties: actual rows **per thread**. Thread 0 is the coordinator and usually shows 0 rows for parallel operators.

```text
Actual Number of Rows (per thread)
  Thread 1: 9,812,004      ← one thread did almost all the work: skew
  Thread 2:    62,110
  Thread 3:    63,420
  Thread 4:    62,466
```

`NonParallelPlanReason` on the root explains a serial plan (e.g., `CouldNotGenerateValidParallelPlan`, `MaxDOPSetToOne`, `TSQLUserDefinedFunctionsNotParallelizable`). Waits `CXPACKET` / `CXCONSUMER` are threads waiting on each other—normal in small amounts, a sign of skew or over-parallelism in large amounts.

---

# Oracle

```text
| Id | Operation                 | Name     |    TQ  |IN-OUT| PQ Distrib |
|  0 | SELECT STATEMENT          |          |        |      |            |
|  1 |  PX COORDINATOR           |          |        |      |            |
|  2 |   PX SEND QC (RANDOM)     | :TQ10002 |  Q1,02 | P->S | QC (RAND)  |
|  3 |    HASH GROUP BY          |          |  Q1,02 | PCWP |            |
|  4 |     PX RECEIVE            |          |  Q1,02 | PCWP |            |
|  5 |      PX SEND HASH         | :TQ10001 |  Q1,01 | P->P | HASH       |
|  6 |       HASH JOIN           |          |  Q1,01 | PCWP |            |
|  7 |        PX BLOCK ITERATOR  |          |  Q1,01 | PCWC |            |
|  8 |         TABLE ACCESS FULL | ORDERS   |  Q1,01 | PCWP |            |
```

- `PX COORDINATOR` = the query coordinator (like Gather); `PX SEND` / `PX RECEIVE` = exchanges through table queues (`TQ`).
- `IN-OUT`: `P->P` parallel to parallel (redistribution), `P->S` parallel to serial, `PCWP` / `PCWC` parallel combined with parent / child (no exchange).
- `PQ Distrib`: how rows are redistributed (`HASH`, `BROADCAST`, `RANGE`, `QC (RAND)`).
- A `S->P` step means a serial step feeding parallel work—often a bottleneck.
- SQL Monitor shows per-server activity and skew for long parallel statements.

---

# MySQL and SQLite

MySQL 8.0.14+ can read a clustered index in parallel for `SELECT COUNT(*)` without a `WHERE` clause and for `CHECK TABLE` (`innodb_parallel_read_threads`); general queries run serially in plans. (HeatWave, a separate analytics engine, has its own parallel plans.) SQLite runs every query on one thread.

---

# Judging a Parallel Plan

```text
✔ big scans, hashes and aggregates in a reporting query → parallelism shortens elapsed time
✔ workers have similar row counts                        → work is balanced
✘ one worker has most of the rows                        → skew: elapsed time ≈ that one worker
✘ Workers Launched < Planned / DOP downgraded             → pool exhausted under concurrency
✘ small OLTP query running in parallel                    → overhead > benefit; threads wasted
✘ CPU time ≫ elapsed time × expected DOP                  → not unusual; parallel costs extra CPU in total
✘ big serial step (S->P, Gather far down, serial UDF)    → limits the speed-up (Amdahl's law)
```

Remember: parallelism reduces **elapsed** time by using **more** total CPU. On a busy OLTP server, that trade is often bad.

---

# Visual Representation

```text
                    serial zone (one process)
   ───────────────────────────────────────────────── Gather / Gather Streams / PX COORDINATOR
                    parallel zone (N workers)
   Partial Aggregate ×N
   Join ×N            ◀── Repartition / PX SEND HASH: rows with equal keys → same worker
   Parallel Scan ×N   ◀── pages or ranges handed out to workers
   check: rows per worker (skew) · workers launched · serial bottlenecks · total CPU
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← Parallel Seq Scan / parallel index scan / PX BLOCK ITERATOR
2. JOIN        ← parallel hash join; repartition or broadcast so keys meet
3. WHERE       ← filters applied inside each worker
4. GROUP BY    ← Partial aggregate per worker, Finalize above the gather
5. HAVING      ← after the final aggregate (serial zone)
6. WINDOW      ← often serial, or parallel per partition after redistribution
7. SELECT
8. DISTINCT    ← partial + final deduplication
9. ORDER BY    ← sorted per worker, merged (Gather Merge / order-preserving exchange)
10. LIMIT / FETCH / TOP   ← serial zone, above the gather
```

---

# How the DBMS Executes This

```text
leader starts N workers with a copy of the parallel sub-plan
workers claim chunks of the table (block ranges / pages) as they go
exchange operators move rows through shared-memory queues
  gather: N → 1; repartition: N → N by hash of a key; broadcast: copy a small input to all
leader combines partial results, runs the serial part, returns rows
```

---

# 🏗️ Architecture Insight

Parallelism is a capacity decision, not a query decision. Set server-wide limits that fit the workload (SQL Server MAXDOP and cost threshold for parallelism, PostgreSQL `max_parallel_workers_per_gather`, Oracle parallel degree policy), so reports can use several cores without letting every mid-sized OLTP query grab them.

---

# ⚡ Performance Tip

When a parallel query is slow, look at rows per worker before anything else. One worker holding most of the rows—from a skewed join key or a single huge partition—means the query is effectively serial plus overhead.

---

# 🌍 Production Consideration

A parallel plan that takes 2 seconds alone may take 20 seconds when ten copies run at once and the worker pool is exhausted (`Workers Launched` falls, or DOP is downgraded). Test parallel queries under realistic concurrency.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Parallel queries | ❌ | ✅ | Very limited | ✅ | ✅ | ❌ |
| Gather operator | ❌ | `Gather`, `Gather Merge` | — | `Gather Streams` | `PX COORDINATOR` | — |
| Redistribution | ❌ | Parallel Hash (shared) | — | `Repartition Streams` | `PX SEND HASH/BROADCAST` | — |
| Per-worker stats | ❌ | `VERBOSE` worker lines | — | Per-thread counters | SQL Monitor | — |
| Reason for serial plan | ❌ | ❌ | — | `NonParallelPlanReason` | Notes / SQL Monitor | — |

> **Portability Tip:** The shape is the same everywhere: a parallel zone below an exchange, a serial zone above it. Find the exchange, then check balance and bottlenecks.

---

# Common Mistakes

### Mistake 1

Reading per-loop rows in a PostgreSQL parallel node as totals.

---

### Mistake 2

Celebrating a parallel plan for a small OLTP query.

---

### Mistake 3

Ignoring skew between workers.

---

### Mistake 4

Testing parallel queries alone and deploying them under heavy concurrency.

---

# Best Practices

✔ Find the exchange operators and the serial zone above them.

✔ Check workers planned versus launched, or DOP.

✔ Check rows per worker for skew.

✔ Compare total CPU with elapsed time.

✔ Keep parallelism for large analytical work; tune thresholds for OLTP.

---

# Interview Questions

## Basic

1. What is a Gather operator?
2. What is the degree of parallelism?
3. What does `Partial HashAggregate` mean?

## Intermediate

4. What does `Repartition Streams` do in SQL Server?
5. How do you detect skew in a parallel plan?
6. Why might fewer workers launch than were planned?

## Advanced

7. Explain Oracle's `IN-OUT` values `P->P`, `P->S` and `S->P`.
8. Why can parallelism make a busy OLTP system slower overall?

---

# Hands-on Exercises

## Exercise 1

Get a parallel plan for a large aggregate and compute total rows from per-loop rows and loops.

---

## Exercise 2

Compare elapsed time and CPU time for the same query with parallelism enabled and disabled.

---

## Exercise 3

Find the reason for a serial plan on your engine (a setting, a function or a cost threshold).

---

# Related Topics

- **15.05 — Choosing Access Paths (Scans, Seeks and Lookups)**
- **15.11 — Optimizing Aggregation and Sorting**
- **16.03 — Plan Structure (Operators, Trees and Data Flow)**
- **16.10 — Sort, Aggregate and Set Operators**
- **16.14 — Comparing Plans and Detecting Plan Regressions**

---

# Summary

Parallel plans split work across workers below an exchange operator—`Gather`/`Gather Merge` in PostgreSQL, `Gather`/`Repartition`/`Distribute Streams` in SQL Server, `PX` operators and table queues in Oracle—and run the rest serially above it. Aggregates are often split into partial and final steps. Read per-worker numbers carefully (PostgreSQL reports per loop, including the leader), check that workers launched as planned and share work evenly, and look for serial bottlenecks. Parallelism shortens elapsed time for large analytical queries at the cost of more total CPU, which is why it helps reports and often hurts busy OLTP systems.
