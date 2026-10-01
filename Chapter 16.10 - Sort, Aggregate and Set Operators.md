---
title: "16.10 - Sort, Aggregate and Set Operators"
description: "How sorting, aggregation, deduplication, window computation, set operations, limits and materialization appear in execution plans: full, top-N and incremental sorts and their memory, hash versus stream aggregation, partial and finalize aggregates, unique and distinct operators, window operators, union, intersect and except operators, limit and top, spools and materialize nodes, and how to judge each one."
chapter: 16
section: 16.10
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 25 min
lastUpdated: 2026-10-01
---

# 16.10 Sort, Aggregate and Set Operators

---

# Learning Objectives

After completing this section, you will be able to:

- Recognise full, top-N and incremental sorts, and judge their memory use.
- Distinguish hash and stream (sorted) aggregation in plans.
- Read deduplication, window and set-operation operators.
- Interpret limit/top operators and early termination.
- Recognise spools and materialization, and when they help or hurt.

---

# Sorts

```text
-- PostgreSQL
Sort  (actual time=812.4..901.2 rows=391,220 loops=1)
  Sort Key: totalamount DESC
  Sort Method: quicksort  Memory: 38,512kB                ← in memory
Sort
  Sort Method: external merge  Disk: 61,240kB             ← spilled
Sort
  Sort Key: orderdate DESC
  Sort Method: top-N heapsort  Memory: 27kB               ← ORDER BY … LIMIT N
Incremental Sort
  Sort Key: customerid, orderdate
  Presorted Key: customerid                               ← input already sorted on a prefix
```

| Engine | Full sort | Top-N | Spill indicator |
|--------|-----------|-------|-----------------|
| PostgreSQL | `Sort` | `top-N heapsort` | `external merge  Disk:` |
| SQL Server | `Sort` | `Top N Sort` | Warning: spill level, `Worktable`/tempdb |
| MySQL | `Sort` / `Using filesort` | `Sort: …, limit input to N row(s)` | `Sort_merge_passes` status counter |
| Oracle | `SORT ORDER BY` | `SORT ORDER BY STOPKEY` | `Used-Tmp`, `1-Pass`/multi-pass |
| SQLite | `USE TEMP B-TREE FOR ORDER BY` | same | n/a |

Questions for every sort:

```text
1. Is it needed?           an index in ORDER BY order would remove it (Section 15.11)
2. How many rows?          sorting 50 million rows to show 20 is the classic waste
3. Top-N or full?          with LIMIT, a top-N sort keeps only N rows in memory
4. In memory?              spills turn a CPU cost into a disk cost
5. Why is it there?        ORDER BY, merge join, stream aggregate, window, DISTINCT
```

---

# Aggregation: Hash vs Stream

```text
-- Hash aggregation: unsorted input, a hash table of groups
HashAggregate  (actual rows=151 loops=1)
  Group Key: c.country
  Batches: 1  Memory Usage: 64kB

-- Stream (sorted / group) aggregation: input sorted by the group key
GroupAggregate  (actual rows=10,000 loops=1)
  Group Key: o.customerid
  -> Index Scan using ix_orders_customer_date on orders o
```

| Engine | Hash | Stream / sorted | Scalar (no `GROUP BY`) |
|--------|------|-----------------|------------------------|
| PostgreSQL | `HashAggregate` | `GroupAggregate` | `Aggregate` |
| SQL Server | `Hash Match (Aggregate)` | `Stream Aggregate` | `Stream Aggregate` |
| MySQL | `Aggregate using temporary table` | `Group aggregate` | `Aggregate` |
| Oracle | `HASH GROUP BY` | `SORT GROUP BY [NOSORT]` | `SORT AGGREGATE` |
| SQLite | — | `USE TEMP B-TREE FOR GROUP BY` or index order | — |

Check: groups produced versus rows consumed, memory and spills (PostgreSQL 13+ `Disk Usage`, SQL Server hash warnings), and whether a stream aggregate needed an extra `Sort` (Section 08.14).

**Partial and final aggregates**: parallel and some distributed plans aggregate in two steps—`Partial HashAggregate` per worker, then `Finalize` above a gather (Section 16.13); SQL Server shows local/global aggregation similarly. Aggregation can also appear **below** a join when the optimizer pre-aggregates (Section 15.04).

---

# Deduplication

```text
DISTINCT / UNION     PostgreSQL: Unique (sorted input) · HashAggregate
                     SQL Server: Sort (Distinct Sort) · Hash Match (Flow Distinct) · Stream Aggregate
                     MySQL: Using temporary · Temporary table with deduplication
                     Oracle: HASH UNIQUE · SORT UNIQUE
                     SQLite: USE TEMP B-TREE FOR DISTINCT
```

A dedup operator directly above a join that multiplies rows is a classic sign of fan-out being "fixed" late (Section 08.11): compare its input rows with its output rows.

---

# Window Operators

```text
-- PostgreSQL
WindowAgg  (actual rows=10,000,000 loops=1)
  -> Sort  (Sort Key: customerid, orderdate)
        Sort Method: external merge  Disk: 812,400kB
-- SQL Server: Segment → Sequence Project (ROW_NUMBER, RANK) · Window Spool + Stream Aggregate (frames)
--             Window Aggregate (batch mode)
-- Oracle:     WINDOW SORT · WINDOW SORT PUSHED RANK (top-N per group) · WINDOW BUFFER (already sorted)
-- MySQL:      Window aggregate / Window multi-pass aggregate
```

The cost of a window function is usually the **sort** under it. An index on `(PARTITION BY columns, ORDER BY columns)` removes it (Section 11.15). Oracle's `WINDOW SORT PUSHED RANK` and PostgreSQL 15+'s `Run Condition` show the engine stopping early for `ROW_NUMBER() <= N` filters.

---

# Set Operations

```text
UNION ALL     Append (PostgreSQL) · Concatenation (SQL Server) · UNION-ALL (Oracle) · COMPOUND QUERY (SQLite)
UNION         the above + a dedup operator (Unique / HashAggregate / Hash Match / SORT UNIQUE)
INTERSECT     HashSetOp Intersect (PostgreSQL) · semi join (SQL Server) · INTERSECTION (Oracle)
EXCEPT        HashSetOp Except · anti semi join · MINUS
```

`UNION` where `UNION ALL` would do adds a sort or hash over the whole combined result—visible in the plan as an extra dedup operator above the append.

---

# Limit and Top

```text
Limit  (actual rows=20 loops=1)
  -> Index Scan Backward using ix_orders_createdat on orders  (actual rows=20 loops=1)   ← stopped after 20

Limit  (actual rows=20 loops=1)
  -> Sort  (actual rows=20 loops=1)   Sort Method: top-N heapsort
        -> Seq Scan on orders  (actual rows=10,000,000 loops=1)                           ← read everything

Limit  (actual rows=20 loops=1)
  -> Index Scan using ix_orders_createdat on orders  (actual rows=20 loops=1)
        Filter: (status = 'Pending')
        Rows Removed by Filter: 4,812,330                                                  ← row-goal misestimate
```

The third plan expected pending orders to be evenly spread and to find 20 quickly; they were rare among recent rows, so it scanned 4.8 million entries. Look for `OFFSET` too: `Limit` with large input rows means the engine produced and discarded every skipped row (Section 15.10).

SQL Server shows `Top`; Oracle `COUNT STOPKEY` / `SORT ORDER BY STOPKEY`; MySQL `Limit: N row(s)`.

---

# Spools and Materialization

```text
PostgreSQL   Materialize (re-scan a stored input) · CTE Scan (materialized CTE) · Memoize (cache inner results, 14+)
SQL Server   Table Spool / Index Spool (Lazy or Eager) · Row Count Spool
Oracle       TEMP TABLE TRANSFORMATION · LOAD AS SELECT (SYS_TEMP_…) · VIEW
MySQL        Materialize · Materialize CTE
SQLite       MATERIALIZE · CO-ROUTINE
```

A spool stores intermediate rows so they can be reused. Helpful when it avoids recomputing an expensive input; harmful when it materializes millions of rows that are read once. An **Eager Index Spool** in SQL Server—an index built in tempdb on every execution—is almost always a missing permanent index. PostgreSQL's `Memoize` shows `Hits`, `Misses` and `Evictions`: a low hit ratio means caching is not paying off.

---

# Visual Representation

```text
               ┌─ Limit / Top / STOPKEY ─────────── stops the plan early (if nothing blocks below)
               │
               ├─ Sort ── full / top-N / incremental ── memory or spill
   root ◀──────┤
               ├─ Aggregate ── hash (memory, any order) │ stream (sorted input, little memory)
               │
               ├─ Dedup ── Unique / HashAggregate / Distinct Sort / HASH UNIQUE
               │
               ├─ Window ── usually above a Sort on (PARTITION BY, ORDER BY)
               │
               └─ Set ops ── Append/Concatenation (+ dedup for UNION) · SetOp / semi / anti joins
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE
4. GROUP BY    ← HashAggregate / GroupAggregate / Stream Aggregate / HASH GROUP BY
5. HAVING      ← Filter on the aggregate output
6. WINDOW      ← WindowAgg / Sequence Project / WINDOW SORT
7. SELECT
8. DISTINCT    ← Unique / Hash dedup / Distinct Sort
9. ORDER BY    ← Sort / Top-N Sort / Incremental Sort, or index order
10. LIMIT / FETCH / TOP   ← Limit / Top / COUNT STOPKEY
```

---

# How the DBMS Executes This

```text
Sort:              read all input → sort in memory (quicksort / heap for top-N)
                   → if over the memory limit: sorted runs to temp → merge passes
Hash aggregate:    read input → hash table keyed by group → spill partitions if too big
Stream aggregate:  read sorted input → emit a group whenever the key changes
Window:            read input sorted by (partition, order) → compute per row with a frame buffer
Limit:             return N rows → stop pulling → children are closed early
```

---

# 🏗️ Architecture Insight

Dashboards that sort and aggregate millions of rows on every page load show the same operators in every plan: big sorts, big hash aggregates, spills. The durable fix is architectural—pre-aggregated tables, materialized views, columnstore indexes—rather than more memory per query.

---

# ⚡ Performance Tip

For any sort, compare its input rows with the rows the query returns. Sorting 10 million rows to return 20 almost always has a better plan: an index in sort order with an early stop, or filtering before sorting.

---

# 🌍 Production Consideration

Sort and hash memory is granted per operator per query. Raising memory settings globally to stop one report spilling can exhaust memory under concurrency. Prefer raising it for the session or query that needs it (`SET LOCAL work_mem`, resource classes, query hints for grants) and fixing the estimate that sized the grant.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Top-N sort shown | ❌ | `top-N heapsort` | `limit input to N` | `Top N Sort` | `SORT ORDER BY STOPKEY` | ❌ |
| Incremental sort | ❌ | ✅ (13+) | ❌ | ❌ | ❌ | ❌ |
| Aggregate spill shown | ❌ | ✅ (13+) | ❌ | Warning | `Used-Tmp` | ❌ |
| Inner-result caching | ❌ | `Memoize` (14+) | ❌ | Spools | Result cache (scalar subqueries) | ❌ |
| Early window filtering | ❌ | `Run Condition` (15+) | ❌ | Top + Segment | `WINDOW SORT PUSHED RANK` | ❌ |

> **Portability Tip:** Sorts, hash vs stream aggregation and top-N stopping are universal; the names and the visibility of memory and spills vary. Learn your engine's spill indicator first.

---

# Common Mistakes

### Mistake 1

Ignoring a sort that processes millions of rows because the final result is small.

---

### Mistake 2

Missing an `external merge` or spill warning on a sort or hash aggregate.

---

### Mistake 3

Using `UNION` and paying for a dedup operator that `UNION ALL` would avoid.

---

### Mistake 4

Assuming `LIMIT` made the query cheap without checking the rows read below it.

---

# Best Practices

✔ Ask why every sort exists, and remove it with index order where possible.

✔ Check memory and spills on sorts, hash aggregates and windows.

✔ Compare input rows with output rows for dedup operators.

✔ Check rows read beneath every `Limit` / `Top`.

✔ Treat eager spools as missing permanent indexes.

---

# Interview Questions

## Basic

1. What is a top-N sort?
2. What is the difference between hash and stream aggregation?
3. Which operator implements `UNION ALL`?

## Intermediate

4. How do you recognise a sort spill in PostgreSQL and SQL Server?
5. Why is a window function's cost usually a sort?
6. What does an Eager Index Spool in SQL Server usually indicate?

## Advanced

7. A `Limit` above an ordered index scan reads 4.8 million rows. Explain the cause and fixes.
8. When does an incremental sort help, and what must the input provide?

---

# Hands-on Exercises

## Exercise 1

Compare plans for `ORDER BY CreatedAt DESC LIMIT 20` with and without an index on `CreatedAt`.

---

## Exercise 2

Force a hash aggregate to spill, then fix it by raising memory for the session only.

---

## Exercise 3

Compare the plans for `UNION` and `UNION ALL` of two large queries.

---

# Related Topics

- **08.14 — Execution Flow of GROUP BY (Hash and Stream Aggregation)**
- **11.14 — Execution Flow of Window Functions**
- **15.10 — Pagination and Top-N Query Optimization**
- **15.11 — Optimizing Aggregation and Sorting**
- **16.12 — Plan Warnings and Red Flags (Spills, Conversions and Residual Predicates)**

---

# Summary

Sort, aggregate and set operators reshape rows above the joins. Sorts may be full, top-N or incremental, and spill to disk when memory runs out; aggregation is hashed (any input order, memory per group) or streamed (sorted input, little memory); deduplication, window and set operators usually rest on one of the two. `Limit` and `Top` stop a plan early only when nothing below them blocks, and rows read beneath them reveal row-goal misestimates and `OFFSET` waste. Spools and materialization reuse intermediate results—useful when they save recomputation, harmful when they hide a missing index. For each operator, compare input rows with output rows, and check memory and spills.
