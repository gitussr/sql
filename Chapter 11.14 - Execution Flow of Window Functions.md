---
title: "11.14 - Execution Flow of Window Functions"
description: "How engines execute window functions: the logical position of the window step, sorting by partition and order keys, the window operator's partition and frame processing, buffering versus streaming, multiple windows and sort sharing, spills, and how windows appear in PostgreSQL, SQL Server, MySQL, Oracle and SQLite plans."
chapter: 11
section: 11.14
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 35 min
lastUpdated: 2026-09-25
---

# 11.14 Execution Flow of Window Functions

---

# Learning Objectives

After completing this section, you will be able to:

- Place the window step precisely in logical query processing.
- Describe the sort–partition–frame pipeline of a window operator.
- Explain which window computations stream and which must buffer.
- Predict how many sorts a query with several windows needs.
- Recognise window operators and spills in execution plans.
- Explain optimizations such as sort reuse and early termination.

---

# Logical Position

```text
FROM / JOIN  →  WHERE  →  GROUP BY  →  HAVING  →  WINDOW  →  SELECT  →  DISTINCT  →  ORDER BY  →  LIMIT
                                                    ▲
                            all window functions of the query are evaluated here,
                            over the rows that survived HAVING
```

Consequences:

- `WHERE`/`HAVING` filters change every window's input.
- `DISTINCT` runs **after** windows, so `SELECT DISTINCT x, ROW_NUMBER() OVER (…)` removes nothing (every row number differs).
- `LIMIT` runs after windows: `SELECT …, COUNT(*) OVER () … LIMIT 10` returns the total count of all rows on each of the 10 rows—useful for pagination ("showing 10 of 4 832").

---

# The Pipeline

```text
Input rows
    │
    ▼
Sort by (PARTITION BY keys, ORDER BY keys)          ← or ordered index, or already sorted
    │
    ▼
Window operator
    ├─ detect partition boundaries (partition key changes)
    ├─ detect peer groups (order key changes)
    ├─ maintain frame: rows entering / leaving
    ├─ update accumulators (sum, count, row number, rank, lag buffer …)
    └─ emit each row with its window value(s)
    │
    ▼
Next window operator (if another definition) … → SELECT
```

---

# Streaming vs Buffering

| Computation | Needs | Behaviour |
|-------------|-------|-----------|
| `ROW_NUMBER`, `RANK`, `DENSE_RANK` | Previous row only | Streams |
| Running aggregate (`… ROWS UNBOUNDED PRECEDING AND CURRENT ROW`) | Accumulator | Streams |
| `LAG(x, n)` | Last *n* rows | Streams (small buffer) |
| `LEAD(x, n)` | Next *n* rows | Delays output by *n* rows |
| Sliding frame (`ROWS 6 PRECEDING`) | Frame rows | Streams (buffer = frame) |
| Whole-partition aggregate (`OVER (PARTITION BY p)`) | Entire partition | **Buffers the partition** |
| `NTILE`, `PERCENT_RANK`, `CUME_DIST` | Partition size | **Buffers the partition** |
| `LAST_VALUE` with `UNBOUNDED FOLLOWING` | End of partition | **Buffers the partition** |
| Default `RANGE` frame with ties | All peers | Buffers each peer group |

Buffered partitions are held in memory up to a limit, then spilled to temporary storage. `OVER ()` without partitions buffers the **entire result**.

---

# Multiple Windows

Each distinct `(PARTITION BY, ORDER BY)` combination needs its input sorted that way. The optimizer orders window operators to share sorts:

```sql
SELECT
    ROW_NUMBER() OVER (PARTITION BY CustomerID ORDER BY OrderDate)  AS a,   -- sort 1
    SUM(x)       OVER (PARTITION BY CustomerID)                     AS b,   -- satisfied by sort 1
    RANK()       OVER (ORDER BY TotalAmount DESC)                   AS c    -- sort 2
FROM Orders;
```

```text
WindowAgg (c)
  Sort (TotalAmount DESC)                  ← second sort
    WindowAgg (a, b)                       ← b only needs CustomerID grouping: prefix of sort 1
      Sort (CustomerID, OrderDate)         ← first sort
        Seq Scan on orders
```

A sort on `(p, o)` satisfies any window partitioned by `p` (with or without ordering by a prefix of `o`). Queries with many unrelated window definitions multiply sorts.

---

# Interaction with GROUP BY and ORDER BY

```text
SELECT CustomerID, SUM(TotalAmount), RANK() OVER (ORDER BY SUM(TotalAmount) DESC)
FROM Orders GROUP BY CustomerID
ORDER BY 3;

HashAggregate (GROUP BY)          → one row per customer
Sort (sum DESC)                   → for the window
WindowAgg (RANK)
(final ORDER BY satisfied by the window sort — no extra sort)
```

When the query's final `ORDER BY` matches the last window's ordering, engines skip the final sort. Aligning them is a cheap optimisation.

---

# Reading Plans

```text
PostgreSQL
  WindowAgg
    ->  Sort  (Sort Key: customerid, orderdate)   [Sort Method: external merge  Disk: 812MB ← spill]
          ->  Seq Scan on orders

  PostgreSQL 15+: "Run Condition: (row_number() OVER (?) <= 3)"   ← early stop
  PostgreSQL 13+: "Incremental Sort" when input is partially sorted

SQL Server
  Sequence Project (ROW_NUMBER / RANK)
    Segment (partition boundaries)
      Sort
  Window Spool + Stream Aggregate  (row mode aggregates; ROWS frames in memory,
                                    RANGE frames in an on-disk worktable)
  Window Aggregate                 (batch mode, 2016+ — much faster)

MySQL (EXPLAIN FORMAT=TREE)
  -> Window aggregate: row_number() OVER (PARTITION BY … ORDER BY …)
      -> Sort: orders.CustomerID, orders.OrderDate

Oracle
  WINDOW SORT                      (sort + window)
  WINDOW BUFFER                    (input already ordered)
  WINDOW SORT PUSHED RANK          (top-N per partition during sort)
  WINDOW NOSORT                    (ordered by index)

SQLite (EXPLAIN QUERY PLAN)
  CO-ROUTINE … / USE TEMP B-TREE FOR ORDER BY
```

---

# Spills

When a sort or a buffered partition exceeds its memory budget, the engine writes to temporary storage:

```text
PostgreSQL   work_mem per sort / per window buffer → "Sort Method: external merge", temp files
SQL Server   memory grant → "Sort Warnings / spill to tempdb"
MySQL        sort_buffer_size, temptable_max_ram → on-disk temp tables
Oracle       PGA → "direct path write temp"
```

Spills are the main reason window queries slow down non-linearly as data grows. Remedies: filter or pre-aggregate before windowing, reduce the columns carried through the sort (narrow rows sort faster), index to avoid the sort, or raise memory for the specific query.

---

# Worked Example

```sql
SELECT CustomerID, OrderID, TotalAmount,
       SUM(TotalAmount) OVER (PARTITION BY CustomerID) AS CustTotal,
       ROW_NUMBER()     OVER (PARTITION BY CustomerID ORDER BY OrderDate DESC, OrderID DESC) AS rn
FROM Orders
WHERE OrderDate >= DATE '2026-01-01';
```

```text
1. Scan Orders, filter OrderDate ≥ 2026-01-01           (index range scan if indexed)
2. Sort by (CustomerID, OrderDate DESC, OrderID DESC)   (one sort serves both windows)
3. Window operator:
     for each customer partition:
        buffer rows (CustTotal needs the whole partition)
        compute SUM
        emit rows in order with rn = 1, 2, 3 … and CustTotal
4. Project SELECT list
```

---

# Visual Representation

```text
         unsorted rows
              │
        ┌─────▼─────┐
        │   SORT    │  (p, o)
        └─────┬─────┘
              │  p1 p1 p1 │ p2 p2 │ p3 p3 p3 p3
        ┌─────▼──────────────────────────────┐
        │ WINDOW: partition │ peers │ frame  │ → value per row
        └─────┬──────────────────────────────┘
              ▼
          SELECT / ORDER BY / LIMIT
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE
4. GROUP BY
5. HAVING
6. WINDOW      ← sort(s) + window operator(s) run here
7. SELECT
8. DISTINCT    ← too late to reduce window input
9. ORDER BY    ← free if it matches the last window's sort
10. LIMIT / FETCH / TOP  ← too late to reduce window work (unless pushed into a run condition)
```

---

# How the DBMS Executes This

```text
Parse    : attach each window function to its (resolved) window definition
Optimize : group functions by definition; order groups to share sorts;
           consider index order, incremental sort, run conditions
Execute  : Sort → WindowAgg per group → Project
           buffer partitions only when a function needs the whole partition
```

---

# 🔬 Engine Deep Dive

SQL Server's row-mode window implementation uses a *Window Spool* that materialises frame rows; for `ROWS` frames it uses an in-memory spool, but for the default `RANGE` frame it uses an on-disk worktable, which can make the default frame many times slower. Batch mode's *Window Aggregate* operator (available with columnstore indexes since 2016 and on rowstore tables since 2019) processes frames without a spool and is dramatically faster—one more reason to write `ROWS` frames explicitly.

---

# 🏗️ Architecture Insight

Window functions are sort-bound. Large analytical workloads therefore benefit from storing data pre-sorted by common partition keys (clustered indexes, sorted columnstore segments, partitioning by time), so that windows over "per customer, by date" or "per device, by time" read data in the order they need.

---

# ⚡ Performance Tip

Look at three things in a window plan: the number of `Sort` nodes (one per distinct window definition is the minimum), whether any sort or window buffer spilled, and whether a filter on a rank was pushed down as an early-stop condition.

---

# 🔒 Security Note

Temporary files written by spilled sorts contain the rows being sorted. Ensure temporary storage is encrypted and access-controlled like the data files themselves, especially for window queries over sensitive tables.

---

# SQL Standard vs Vendor Differences

| Feature | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|---------|-----------|-------|-----------|--------|--------|
| Plan operator | `WindowAgg` | `Window aggregate` | `Sequence Project` / `Window Spool` / `Window Aggregate` | `WINDOW SORT/BUFFER/NOSORT` | co-routine + temp B-tree |
| Sort sharing across windows | ✅ | ✅ | ✅ | ✅ | ✅ |
| Early stop for rank filters | ✅ (15+) | ❌ | Partial | ✅ (`PUSHED RANK`) | ❌ |
| Incremental / partial sort | ✅ (13+) | ❌ | ❌ | ❌ | ❌ |
| Batch-mode window processing | ❌ | ❌ | ✅ | ❌ | ❌ |

> **Portability Tip:** Sort sharing is universal: aligning window definitions helps on every engine. Early-stop and batch-mode optimisations are engine-specific bonuses.

---

# Common Mistakes

### Mistake 1

Using `SELECT DISTINCT` to reduce rows after adding window functions.

---

### Mistake 2

Many slightly different window definitions, each requiring its own sort.

---

### Mistake 3

`OVER ()` over a very large result, buffering everything.

---

### Mistake 4

Ignoring spill warnings in plans.

---

# Best Practices

✔ Filter and aggregate before windows.

✔ Share window definitions and align the final `ORDER BY` with the last window sort.

✔ Prefer streaming forms (running frames, reversed `FIRST_VALUE`) to buffering ones.

✔ Write `ROWS` frames explicitly, especially on SQL Server.

✔ Check plans for sorts, spills and early-stop conditions.

---

# Interview Questions

## Basic

1. At which step are window functions evaluated?
2. Why does a window query usually need a sort?
3. Why does `SELECT DISTINCT` not remove rows that differ only by `ROW_NUMBER`?

## Intermediate

4. Which window functions stream, and which must buffer a whole partition?
5. When can two window functions share a sort?
6. What does `COUNT(*) OVER ()` return in a query with `LIMIT 10`?

## Advanced

7. Why can the default `RANGE` frame be slow on SQL Server?
8. What is a run condition in PostgreSQL window plans?
9. How do sort spills affect window query scalability, and how do you prevent them?

---

# Hands-on Exercises

## Exercise 1

Explain the plan of a query with two window definitions; identify each sort and window operator.

---

## Exercise 2

Rewrite a query with three different window orderings so that it needs only two sorts.

---

## Exercise 3

Produce a spill in a window query by lowering the memory setting, then remove it by pre-aggregating.

---

## Exercise 4

Compare a `ROW_NUMBER() <= 3` filter's plan on PostgreSQL 14 and 15+ (or on Oracle) to see early stopping.

---

# Related Topics

- **11.02 — The OVER Clause (PARTITION BY and ORDER BY)**
- **11.11 — Named Windows and the WINDOW Clause**
- **11.15 — Window Function Performance and Index Strategy**
- **08.14 — Execution Flow of GROUP BY (Hash and Stream Aggregation)**
- **16.xx — Reading Execution Plans**

---

# Summary

Window functions are evaluated after `HAVING` and before `DISTINCT`, `ORDER BY` and `LIMIT`. Engines sort the input by each window's partition and order keys, then a window operator walks the sorted rows, detecting partitions and peers, maintaining frames and emitting one value per row. Ranking, offsets and running frames stream; whole-partition aggregates, distribution functions and unbounded-following frames buffer entire partitions and may spill. Windows with compatible definitions share a sort, rank filters can stop partitions early on some engines, and plan operators—`WindowAgg`, `Sequence Project`/`Window Spool`, `WINDOW SORT`—show exactly how the work was done.
