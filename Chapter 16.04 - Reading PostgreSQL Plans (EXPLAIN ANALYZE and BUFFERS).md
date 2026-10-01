---
title: "16.04 - Reading PostgreSQL Plans (EXPLAIN ANALYZE and BUFFERS)"
description: "A line-by-line guide to PostgreSQL execution plans: node lines, cost, rows and width, actual time, rows and loops, Index Cond versus Filter, Rows Removed by Filter, Heap Fetches, buffer counts (shared hit, read, dirtied, written, temp), sort and hash details, planning and execution time, JIT, triggers, VERBOSE output, and a complete worked example."
chapter: 16
section: 16.04
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 25 min
lastUpdated: 2026-10-01
---

# 16.04 Reading PostgreSQL Plans (EXPLAIN ANALYZE and BUFFERS)

---

# Learning Objectives

After completing this section, you will be able to:

- Read every part of a PostgreSQL node line.
- Interpret the detail lines below each node.
- Use buffer counts to measure how much data each node touched.
- Recognise sort, hash and memory details, including spills.
- Work through a complete `EXPLAIN (ANALYZE, BUFFERS)` output.

---

# Anatomy of a Node Line

```text
Index Scan using ix_orders_customer_date on orders o  (cost=0.56..412.10 rows=118 width=48) (actual time=0.031..0.402 rows=120 loops=1)
│          │                              │         │              │         │            │                             │          │
│          index used                     table     alias          estimated estimated    actual ms: first row..last   actual     executions
node type                                                          cost      rows/loop    row (per loop)               rows/loop
                                                                   startup..total; width = estimated bytes per row
```

| Part | Meaning |
|------|---------|
| `cost=0.56..412.10` | Startup cost .. total cost, in planner units (`seq_page_cost` = 1.0) |
| `rows=118` | Estimated rows **per loop** |
| `width=48` | Estimated average row width in bytes |
| `actual time=0.031..0.402` | Milliseconds to first row .. last row, **per loop**, inclusive of children |
| `rows=120` | Actual rows **per loop** (average, rounded—PostgreSQL 18 shows fractional values) |
| `loops=1` | How many times the node executed |

---

# Detail Lines

```text
Index Scan using ix_orders_customer_date on orders o  (…)
  Index Cond: ((customerid = 42) AND (orderdate >= '2026-01-01'::date))
  Filter: ((status)::text = 'Pending'::text)
  Rows Removed by Filter: 118
  Buffers: shared hit=124 read=3
```

| Line | Meaning |
|------|---------|
| `Index Cond` | Predicates used to navigate the index—only matching entries are read |
| `Filter` | Predicates checked on each row after it was read |
| `Rows Removed by Filter` | Rows read and discarded (per loop)—wasted work |
| `Recheck Cond` | Bitmap heap scan re-checking rows on lossy pages |
| `Rows Removed by Index Recheck` | Rows discarded by that recheck |
| `Heap Fetches` | Index-only scan visits to the table (visibility map not set) |
| `Hash Cond` / `Merge Cond` / `Join Filter` | Join predicates; `Join Filter` is applied after matching (like a Filter) |
| `Sort Key`, `Sort Method` | Sort columns; `quicksort`, `top-N heapsort`, `external merge` (spilled) |
| `Group Key` | Grouping columns for aggregates |
| `Output` | Columns produced (`VERBOSE` only) |

---

# Buffers

`BUFFERS` (default with `ANALYZE` from PostgreSQL 18) counts 8 kB pages per node, inclusive of children:

```text
Buffers: shared hit=820 read=4,120 dirtied=12 written=3, temp read=2,048 written=2,048
```

| Counter | Meaning |
|---------|---------|
| `shared hit` | Pages found in PostgreSQL's buffer cache |
| `shared read` | Pages requested from the OS (OS cache or disk) |
| `shared dirtied` | Pages this query modified (or hint bits set) |
| `shared written` | Dirty pages this query had to write out to make room |
| `local …` | Temporary tables of this session |
| `temp read/written` | Spill files for sorts, hashes and materialization |

Pages × 8 kB = data touched. `shared hit=820 read=4,120` ≈ 39 MB. Buffers are stable across runs in a way time is not, so compare them before and after a change. With `track_io_timing = on`, an `I/O Timings: shared read=…` line shows time spent waiting for reads.

---

# Sort, Hash and Memory Details

```text
Sort  (actual time=…  rows=1,000,000 loops=1)
  Sort Key: orderdate DESC
  Sort Method: external merge  Disk: 61,240kB          ← spilled to disk: work_mem too small

Sort
  Sort Method: top-N heapsort  Memory: 27kB            ← ORDER BY … LIMIT: keeps only N rows

Hash
  Buckets: 131072 (originally 1024)  Batches: 8 (originally 1)  Memory Usage: 4,097kB
                    ▲ grew: estimate was too low          ▲ >1 batch = hash spilled to temp files

HashAggregate
  Group Key: customerid
  Batches: 5  Memory Usage: 8,241kB  Disk Usage: 98,304kB   ← aggregate spilled (PostgreSQL 13+)
```

Spills are governed by `work_mem` (multiplied by `hash_mem_multiplier` for hash operations, 2.0 by default from PostgreSQL 15). Section 16.12 covers spills as red flags.

---

# The Summary Lines

```text
Planning:
  Buffers: shared hit=24
Planning Time: 0.412 ms
JIT:
  Functions: 12
  Options: Inlining true, Optimization true, Expressions true, Deforming true
  Timing: Generation 1.8 ms, Inlining 41.2 ms, Optimization 210.6 ms, Emission 102.3 ms, Total 356.0 ms
Trigger fk_orderitems_order: time=812.4 calls=40,000
Execution Time: 1,402.7 ms
```

- **Planning Time**: optimizer time; high for very complex queries or many partitions.
- **JIT**: just-in-time compilation of expressions. Hundreds of milliseconds of JIT on a query that runs in 1 second is a common surprise; it triggers when estimated cost exceeds `jit_above_cost`. Inflated estimates can make JIT fire on small queries.
- **Trigger** lines: time spent in triggers and foreign-key checks—often the hidden cost of `DELETE` and `UPDATE`.
- **Execution Time**: total server time, excluding sending rows to the client and parsing.

---

# A Complete Worked Example

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT c.Country, COUNT(*) AS Orders, SUM(o.TotalAmount) AS Revenue
FROM Orders o
JOIN Customers c ON c.CustomerID = o.CustomerID
WHERE o.OrderDate >= DATE '2026-09-01'
  AND o.Status = 'Delivered'
GROUP BY c.Country
ORDER BY Revenue DESC;
```

```text
Sort  (cost=98412.4..98412.8 rows=152 width=44) (actual time=1,840.2..1,840.3 rows=151 loops=1)
  Sort Key: (sum(o.totalamount)) DESC
  Sort Method: quicksort  Memory: 36kB
  Buffers: shared hit=402,118 read=61,904
  -> HashAggregate  (cost=98408.1..98410.0 rows=152 width=44) (actual time=1,839.9..1,840.0 rows=151 loops=1)
        Group Key: c.country
        Batches: 1  Memory Usage: 64kB
        -> Nested Loop  (cost=0.99..96210.6 rows=146,500 width=12) (actual time=0.08..1,712.4 rows=391,220 loops=1)
              -> Index Scan using ix_orders_orderdate on orders o  (cost=0.56..21004.1 rows=146,500 width=12) (actual time=0.05..402.7 rows=391,220 loops=1)
                    Index Cond: (orderdate >= '2026-09-01'::date)
                    Filter: ((status)::text = 'Delivered'::text)
                    Rows Removed by Filter: 9,412
                    Buffers: shared hit=12,904 read=61,904
              -> Index Scan using customers_pkey on customers c  (cost=0.43..0.51 rows=1 width=11) (actual time=0.003..0.003 rows=1 loops=391,220)
                    Index Cond: (customerid = o.customerid)
                    Buffers: shared hit=389,214
Planning Time: 0.61 ms
Execution Time: 1,840.9 ms
```

Reading it:

1. **Leaves.** The orders index scan returned 391,220 rows but was **estimated at 146,500**—a 2.7× underestimate (the recent month is busier than the statistics knew). It read 61,904 pages from outside the cache: the main I/O cost.
2. **Inner side.** The customer primary-key lookup ran **391,220 times** (`loops`), each touching ~1 page: 389,214 buffer hits. Per loop 0.003 ms, total ≈ 1.2 s.
3. **Join.** A nested loop chosen for ~146k outer rows; with 391k it is the largest cost. A hash join on `Customers` (1M rows) might be cheaper—or might not; the plan with the better estimate would tell.
4. **Aggregate and sort.** Tiny: 151 groups, 64 kB, 36 kB. Not the problem.
5. **Fixes to try**: refresh statistics on `Orders` (`ANALYZE Orders`) so the recent date range is estimated well, then compare; a covering index `(OrderDate) INCLUDE (Status, CustomerID, TotalAmount)` would turn the orders scan into an index-only scan.

---

# VERBOSE and Other Useful Variants

```text
EXPLAIN (ANALYZE, VERBOSE)
  -> Seq Scan on public.orders o
        Output: o.orderid, o.customerid, o.totalamount     ← columns carried upward
Worker 0:  actual time=… rows=… loops=1                    ← per-worker stats in parallel plans
```

```sql
-- Estimates and costs only, with the settings that shaped them
EXPLAIN (SETTINGS) SELECT …;
-- Settings: work_mem = '256MB', random_page_cost = '1.1'
```

---

# Visual Representation

```text
NODE  (cost=startup..total rows=est width=bytes) (actual time=first..last rows=act loops=n)
  Index Cond / Hash Cond / Merge Cond  → navigation (cheap)
  Filter / Join Filter                 → discard after reading (check "Rows Removed by …")
  Buffers: shared hit/read …, temp …   → data touched; temp = spill
  Sort Method / Batches / Memory       → memory use; "external" or Batches > 1 = spill
  -> CHILD 1  (runs first: outer / probe side)
  -> CHILD 2  (inner side; or "Hash" = build side of a hash join)
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← Seq Scan / Index Scan / Index Only Scan / Bitmap Heap Scan leaves
2. JOIN        ← Nested Loop / Hash Join / Merge Join
3. WHERE       ← Index Cond (navigates) or Filter (discards); Rows Removed by Filter
4. GROUP BY    ← HashAggregate / GroupAggregate (Group Key)
5. HAVING      ← Filter line on the aggregate node
6. WINDOW      ← WindowAgg above Sort or Incremental Sort
7. SELECT      ← Output lines (VERBOSE); Result for computed values
8. DISTINCT    ← Unique / HashAggregate
9. ORDER BY    ← Sort (Sort Method) / Incremental Sort, or index order
10. LIMIT / FETCH / TOP   ← Limit node at the top
```

---

# How the DBMS Executes This

```text
EXPLAIN (ANALYZE, BUFFERS) …
  planner builds the plan tree (Planning Time, Planning Buffers)
  executor runs it with instrumentation on every node:
     per node: start time, stop time, tuples, loops, buffer usage counters
  result rows are produced and discarded (not sent to the client)
  output: each node's counters averaged per loop; Execution Time = total wall time
```

---

# 🏗️ Architecture Insight

Configure PostgreSQL so plans tell you more: `track_io_timing = on` (I/O wait per node), `pg_stat_statements` for workload totals, and `auto_explain` for slow statements in production (Section 16.15). The overhead of `track_io_timing` is low on modern systems; check with `pg_test_timing`.

---

# ⚡ Performance Tip

Sum `shared hit + read` at the leaves and compare with the rows returned. Hundreds of thousands of buffers to return a few hundred rows means the access path is wrong—look for big `Rows Removed by Filter` or huge `loops` on lookups.

---

# 🌍 Production Consideration

`shared read` counts pages PostgreSQL asked the operating system for; many of them may be served from the OS page cache rather than disk. Use `I/O Timings` (with `track_io_timing`) to see how long those reads actually took before blaming the storage.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Per-node buffer counts | ❌ | `BUFFERS` | ❌ (session status counters) | `STATISTICS IO` per table, actual I/O per operator | `Buffers` column | ❌ |
| Rows removed by filter | ❌ | ✅ | ❌ (`filtered` estimate) | Actual rows read vs returned (2016 SP1+) | Compare `A-Rows` of child and parent | ❌ |
| Spill details | ❌ | `Sort Method`, `Batches`, `Disk Usage` | Partial (`EXPLAIN ANALYZE` hints) | Spill warnings | `Used-Tmp`, `1-Pass`/`Multi-Pass` | ❌ |
| JIT details | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |

> **Portability Tip:** PostgreSQL plans are the most explicit about filters, buffers and memory. Once you know what to look for there, look for the same facts in other engines' operator properties.

---

# Common Mistakes

### Mistake 1

Ignoring `Rows Removed by Filter` on a scan that "uses an index".

---

### Mistake 2

Reading `rows=4` on a node with `loops=500,000` as four rows.

---

### Mistake 3

Running `EXPLAIN ANALYZE` without `BUFFERS` before PostgreSQL 18.

---

### Mistake 4

Missing a large JIT or trigger time in the summary lines.

---

# Best Practices

✔ Use `EXPLAIN (ANALYZE, BUFFERS)` as the default.

✔ Compare `rows` estimated and actual on every node.

✔ Check `Index Cond` versus `Filter` on every scan.

✔ Look for `external merge`, `Batches > 1`, `Disk Usage` and `temp` buffers.

✔ Read the summary: planning time, JIT, triggers, execution time.

---

# Interview Questions

## Basic

1. What do the two numbers in `cost=0.56..412.10` mean?
2. What is the difference between `Index Cond` and `Filter`?
3. What does `shared hit` versus `shared read` mean?

## Intermediate

4. How do you compute the total rows of a node with `loops=1000`?
5. What does `Sort Method: external merge  Disk: 61240kB` tell you?
6. What does `Heap Fetches` mean on an index-only scan?

## Advanced

7. A query spends 350 ms in JIT and 200 ms executing. Why, and what would you change?
8. Walk through how you would decide between fixing statistics and adding an index from a single `EXPLAIN (ANALYZE, BUFFERS)` output.

---

# Hands-on Exercises

## Exercise 1

Run `EXPLAIN (ANALYZE, BUFFERS)` on a query with a filter on a non-indexed column and find `Rows Removed by Filter`.

---

## Exercise 2

Make a sort spill by lowering `work_mem` for the session, then raise it and compare `Sort Method`.

---

## Exercise 3

Paste a plan into a visualizer and compare its "slowest node" with your own exclusive-time calculation.

---

# Related Topics

- **16.02 — Getting a Plan (EXPLAIN, Estimated and Actual Plans)**
- **16.03 — Plan Structure (Operators, Trees and Data Flow)**
- **16.11 — Estimates vs Actuals (Finding Cardinality Misestimates)**
- **16.12 — Plan Warnings and Red Flags (Spills, Conversions and Residual Predicates)**
- **15.14 — Measuring Query Performance (Timing, I/O and Wait Statistics)**

---

# Summary

A PostgreSQL node line shows the operator, the object it reads, estimated startup and total cost, estimated rows and width, and—with `ANALYZE`—actual first-row and last-row time, rows and loops, all per loop and inclusive of children. Detail lines separate index conditions from filters, count rows removed, show join conditions, sort methods, hash batches and memory, and `BUFFERS` measures the pages each node touched, including temporary spill files. The summary adds planning time, JIT, trigger time and total execution time. Reading estimated against actual rows, filters against index conditions, and buffers against rows returned turns a PostgreSQL plan into a precise diagnosis.
