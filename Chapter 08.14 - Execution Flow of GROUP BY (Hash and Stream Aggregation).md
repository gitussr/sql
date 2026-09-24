---
title: "08.14 - Execution Flow of GROUP BY (Hash and Stream Aggregation)"
description: "How engines execute grouped queries: hash aggregation, stream (sorted) aggregation, how the optimizer chooses between them, memory and spilling, parallel partial aggregation, DISTINCT aggregates, and reading aggregation operators in execution plans."
chapter: 8
section: 8.14
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 40 min
lastUpdated: 2026-09-24
---

# 08.14 Execution Flow of GROUP BY (Hash and Stream Aggregation)

---

# Learning Objectives

After completing this section, you will be able to:

- Describe hash aggregation and stream (sorted) aggregation step by step.
- Explain how the optimizer chooses between them.
- Explain what happens when a hash aggregate runs out of memory.
- Describe parallel two-phase aggregation.
- Explain why `DISTINCT` aggregates cost more.
- Identify aggregation operators in PostgreSQL, SQL Server, MySQL and Oracle plans.

---

# Two Ways to Find a Group

Every aggregation has the same job: for each incoming row, find the accumulator of its group and update it. Engines use one of two strategies to find that accumulator.

```text
HASH AGGREGATE                          STREAM (SORTED) AGGREGATE

rows in any order                       rows ordered by the group key
      │                                       │
      ▼                                       ▼
hash(key) → bucket → accumulator        same key as previous row?
      │                                   yes → update accumulator
      ▼                                   no  → emit previous group,
all rows read → emit every group                start a new one
                                              │
(unordered output)                      (output in key order)
```

---

# Hash Aggregation

```text
SELECT CustomerID, SUM(TotalAmount) FROM Orders GROUP BY CustomerID

Hash table (in memory)
┌────────────┬───────────────┐
│ CustomerID │ running SUM   │
├────────────┼───────────────┤
│ 1          │ 330.00        │ ← rows 101, 102 added
│ 2          │ 620.00        │ ← rows 103, 104 added
│ 3          │  60.00        │ ← row 105 added
└────────────┴───────────────┘
```

1. Read each row.
2. Hash its grouping key; find or create the entry.
3. Update the entry's accumulators.
4. When all input is read, emit one row per entry.

**Strengths:** needs no particular input order; one pass; fast when the groups fit in memory.

**Costs:** memory proportional to the number of **groups**; output is unordered; nothing can be emitted until all input has been read (a *blocking* operator).

---

# Stream (Sorted) Aggregation

```text
Input sorted by CustomerID

1  250.00  ┐
1   80.00  ┘→ key changes → emit (1, 330.00)
2  500.00  ┐
2  120.00  ┘→ key changes → emit (2, 620.00)
3   60.00  ─→ end of input → emit (3, 60.00)
```

1. Read rows in grouping-key order.
2. While the key stays the same, update one accumulator.
3. When the key changes, emit the finished group and start the next.

**Strengths:** constant memory—one group at a time; output already sorted by the key; emits groups as soon as they finish (*non-blocking*), so a `LIMIT` can stop early.

**Costs:** input **must** be ordered. If an index does not supply that order, the engine must sort first—and sorting is O(n log n) and may itself spill to disk.

---

# How the Optimizer Chooses

```text
Is input already ordered by the GROUP BY key?
(index on the key, or a previous merge join / sort)
│
├── Yes ──→ Stream aggregate (no sort needed, low memory)
│
└── No ───→ Estimated number of groups
            │
            ├── Small / fits in memory ──→ Hash aggregate
            │
            └── Very large ─────────────→ Sort + stream aggregate
                                          or hash aggregate with spilling
```

Other factors:

- A query `ORDER BY` on the grouping key favours the stream aggregate, which produces that order for free.
- A small `LIMIT` favours the stream aggregate, which can stop early.
- Poor estimates of the number of groups lead to the wrong choice—a hash table sized for 1,000 groups that meets 10 million.

---

# Memory and Spilling

A hash aggregate whose table outgrows its memory grant must **spill**: write part of its state or input to temporary disk files and process them in batches.

| Engine | Memory limit | Behaviour when exceeded |
|--------|-------------|-------------------------|
| PostgreSQL | `work_mem` × `hash_mem_multiplier` | Spills partitions to disk (13+); "Batches" and "Disk Usage" appear in `EXPLAIN ANALYZE` |
| SQL Server | Query memory grant | Spills to `tempdb`; "Hash Warning" / spill warning in the actual plan |
| MySQL | `tmp_table_size` / `max_heap_table_size` | Internal temporary table converts from memory to disk |
| Oracle | PGA (`pga_aggregate_target`) | Multi-pass to temporary tablespace |

Spilling keeps the query correct but can make it many times slower. The usual causes are an underestimated group count, a very high-cardinality grouping key, or wide grouping columns.

---

# Parallel Two-Phase Aggregation

Large aggregations run in parallel by splitting the work:

```text
                  ┌─ worker 1: partial agg ──┐
Orders (scan) ────┼─ worker 2: partial agg ──┼──→ Gather ──→ Final agg ──→ result
                  └─ worker 3: partial agg ──┘
                     (SUM, COUNT per group      (combine partial
                      for its share of rows)     states per group)
```

1. **Partial** aggregation: each worker aggregates its share of rows into its own groups.
2. **Final** aggregation: partial states for the same group are combined—sums added, counts added, `AVG` computed from combined sum and count.

This works for any aggregate whose state can be combined. `COUNT(DISTINCT)`, ordered-set aggregates and string aggregation are harder; engines either redistribute rows by key, or run that part serially.

---

# DISTINCT Aggregates

```sql
SELECT CustomerID, COUNT(DISTINCT ProductID)
FROM Orders o JOIN OrderItems oi ON oi.OrderID = o.OrderID
GROUP BY CustomerID;
```

`COUNT(DISTINCT ProductID)` needs a set of seen values per group, not a counter. Engines typically rewrite it into two aggregation steps:

```text
Step 1: GROUP BY CustomerID, ProductID     (de-duplicate the pairs)
Step 2: GROUP BY CustomerID, COUNT(*)      (count the pairs per customer)
```

Several `DISTINCT` aggregates over different columns in the same query each need their own de-duplication, which is why queries with three or four `COUNT(DISTINCT ...)` columns are often dramatically slower than their plain counterparts.

---

# Reading the Plan

The same query in four engines' plan vocabulary:

| Engine | Hash aggregate | Stream aggregate |
|--------|---------------|------------------|
| PostgreSQL | `HashAggregate` | `GroupAggregate` (after `Sort` or index scan) |
| SQL Server | `Hash Match (Aggregate)` | `Stream Aggregate` |
| MySQL | "Using temporary" (temporary table) | "Using index for group-by" / loose index scan |
| Oracle | `HASH GROUP BY` | `SORT GROUP BY` / `SORT GROUP BY NOSORT` |

```text
PostgreSQL: EXPLAIN ANALYZE

HashAggregate  (rows=48213) (actual rows=48200)
  Group Key: customerid
  Batches: 1  Memory Usage: 6161kB           ← fits in memory, no spill
  ->  Seq Scan on orders  (actual rows=1000000)
```

```text
PostgreSQL: with an index on (customerid)

GroupAggregate  (actual rows=48200)
  Group Key: customerid
  ->  Index Scan using ix_orders_customer on orders
```

Key things to check:

- **Estimated vs actual groups**—a large mismatch explains a poor strategy choice.
- **Batches / spills**—any value above 1 means disk was used.
- **An explicit `Sort` below a stream aggregate**—if large, an index could remove it.

---

# Visual Representation

```text
               memory                order needed    output order    blocking?
HASH           ∝ number of groups    no              none            yes
STREAM         one group             yes             by key          no
SORT + STREAM  ∝ input (the sort)    produced        by key          yes (sort)
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE
4. GROUP BY    ← hash or stream aggregation runs here
5. HAVING      ← a filter directly above the aggregate operator
6. SELECT
7. DISTINCT
8. ORDER BY    ← free if a stream aggregate already produced key order
9. LIMIT / FETCH / TOP
```

The logical order does not change with the physical strategy; the physical strategy only decides how cheaply each step is done.

---

# How the DBMS Executes This

```text
SELECT CustomerID, SUM(TotalAmount) AS Revenue
FROM Orders
WHERE OrderDate >= DATE '2026-01-01'
GROUP BY CustomerID
ORDER BY CustomerID
FETCH FIRST 20 ROWS ONLY

Plan A (index on (CustomerID, OrderDate, TotalAmount)):
    Index scan in CustomerID order, filter OrderDate
    → Stream aggregate
    → stop after 20 groups                 ✅ reads a small fraction

Plan B (no useful index):
    Seq scan + filter
    → Hash aggregate over all customers
    → Sort 48,000 groups → take 20          reads everything
```

The same query can differ by orders of magnitude depending on whether an index lets the engine choose a stream aggregate.

---

# 🔬 Engine Deep Dive

MySQL's **loose index scan** ("Using index for group-by") is a special stream aggregate: for queries such as `SELECT CustomerID, MIN(OrderDate) FROM Orders GROUP BY CustomerID` with an index on `(CustomerID, OrderDate)`, it jumps from one `CustomerID` to the next in the index, reading only the first entry of each group rather than every row. PostgreSQL has no built-in equivalent; the same effect needs a recursive CTE ("skip scan" emulation), although PostgreSQL 18 added skip scan for B-tree lookups.

---

# 🏗️ Architecture Insight

Columnar analytical engines aggregate very differently: they read only the referenced columns, process values in vectors of thousands at a time, and often aggregate directly on compressed or dictionary-encoded data. A `GROUP BY` that takes minutes on a row store can take milliseconds on a column store—which is why heavy aggregation workloads move to analytical databases rather than being tuned indefinitely on OLTP systems.

---

# ⚡ Performance Tip

Look at the estimated versus actual number of groups first. When estimates are wrong, refresh statistics (`ANALYZE`, `UPDATE STATISTICS`); for correlated grouping columns, PostgreSQL's extended statistics (`CREATE STATISTICS ... (ndistinct)`) give the optimizer accurate multi-column group counts.

---

# 🌍 Production Consideration

A grouped report that is fast for months and suddenly slow has often crossed a memory threshold: the hash table no longer fits, the aggregate spills, and runtime jumps by 10×. Monitoring spill warnings—PostgreSQL's temp file logging (`log_temp_files`), SQL Server's spill events—catches this before users do.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Hash aggregation | n/a (physical) | ✅ | ✅ (temp table) | ✅ | ✅ | ❌ (sort-based) |
| Stream aggregation from index | n/a | ✅ | ✅ | ✅ | ✅ | ✅ |
| Hash aggregate spills to disk | n/a | ✅ (13+) | ✅ | ✅ | ✅ | n/a |
| Parallel aggregation | n/a | ✅ | ❌ (limited) | ✅ | ✅ | ❌ |
| Loose index scan for `GROUP BY` | n/a | ❌ | ✅ | ❌ | ❌ | ❌ |

> **Portability Tip:** Physical strategies are not part of the SQL standard and never change results—only speed. Code should never depend on the output order an aggregation strategy happens to produce.

---

# Common Mistakes

### Mistake 1

Relying on grouped output being sorted because the plan happened to use a stream aggregate.

---

### Mistake 2

Ignoring spill warnings in execution plans.

---

### Mistake 3

Adding many `COUNT(DISTINCT ...)` columns to one query without considering their cost.

---

### Mistake 4

Tuning a slow aggregation without first comparing estimated and actual group counts.

---

# Best Practices

✔ Read the aggregate operator and its group estimate in every slow grouped query.

✔ Provide an index in grouping-key order when a stream aggregate would help.

✔ Keep grouping keys narrow to shrink hash tables.

✔ Keep statistics current, including multi-column statistics where supported.

✔ Watch for spills in monitoring, not just in ad-hoc plans.

---

# Interview Questions

## Basic

1. What are the two main physical strategies for `GROUP BY`?
2. Which strategy requires ordered input?
3. Which strategy produces sorted output?

## Intermediate

4. What determines the memory used by a hash aggregate?
5. What happens when a hash aggregate runs out of memory?
6. How does parallel two-phase aggregation work?

## Advanced

7. Why can a stream aggregate make `ORDER BY ... LIMIT 20` dramatically cheaper?
8. How do engines typically execute `COUNT(DISTINCT x)` per group?
9. What is a loose index scan, and how can you emulate it on an engine that lacks it?

---

# Hands-on Exercises

## Exercise 1

Run `EXPLAIN` on a query grouped by `CustomerID` with and without an index on `CustomerID`, and name the aggregate operator in each plan.

---

## Exercise 2

In PostgreSQL, lower `work_mem` and run `EXPLAIN ANALYZE` on a high-cardinality `GROUP BY`. Record the batches and disk usage.

---

## Exercise 3

Compare the plans of a query with one `COUNT(DISTINCT ...)` and with three.

---

## Exercise 4

Write a grouped query with `ORDER BY` and `FETCH FIRST 20 ROWS ONLY` that can stop early, and confirm it in the plan.

---

# Related Topics

- **08.05 — GROUP BY Syntax and Semantics**
- **08.15 — GROUP BY Performance and Index Strategy**
- **07.14 — Execution Flow of JOINs (Join Algorithms)**
- **06.11 — Execution Flow of WHERE**
- **16.xx — Reading Execution Plans**

---

# Summary

Engines execute `GROUP BY` either with a hash aggregate—one pass, any input order, memory proportional to the number of groups, unordered and blocking output—or with a stream aggregate over input sorted by the grouping key, which uses constant memory, emits groups in key order and can stop early. The optimizer chooses from input order, estimated group count and memory; wrong estimates lead to spills or unnecessary sorts. Large aggregations run as parallel partial-then-final phases, `DISTINCT` aggregates need extra de-duplication steps, and reading the aggregate operator, its group estimate and any spill is the first step in diagnosing a slow grouped query.
