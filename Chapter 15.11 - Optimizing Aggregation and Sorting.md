---
title: "15.11 - Optimizing Aggregation and Sorting"
description: "Making GROUP BY, DISTINCT, ORDER BY and window sorts cheap: hash versus stream aggregation, avoiding sorts with index order, memory grants and spills to disk, reducing rows and width before sorting or grouping, pre-aggregation before joins, COUNT(DISTINCT) costs, approximate counts, covering indexes for aggregates, partial and incremental aggregation, rollup tables and materialized views, and columnstore and batch-mode processing for analytics."
chapter: 15
section: 15.11
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 15.11 Optimizing Aggregation and Sorting

---

# Learning Objectives

After completing this section, you will be able to:

- Predict whether the engine will hash or sort to aggregate.
- Avoid sorts by providing index order.
- Diagnose and prevent sort and hash spills.
- Shrink the input to aggregation and sorting.
- Choose rollup tables, materialized views or columnstore for analytic workloads.

---

# Hash vs Stream Aggregation

```text
STREAM AGGREGATE                              HASH AGGREGATE
input sorted by the GROUP BY columns          input in any order
(from an index or a sort)                     builds a hash table: one entry per group
one group in memory at a time                 memory ∝ number of groups
returns groups as it goes                     returns groups after reading everything
cheap if the order is free                    cheap if groups fit in memory
```

Section 08.14 introduced both. The optimizer picks stream aggregation when rows already arrive in group order (or the sort is cheap), hash aggregation when they don't and the groups fit in memory.

```sql
-- Stream aggregate with no sort: the index delivers CustomerID order
SELECT CustomerID, COUNT(*), SUM(TotalAmount)
FROM Orders
GROUP BY CustomerID;                        -- index ix_orders_customer_date (CustomerID, OrderDate)
```

---

# Avoid the Sort

Sorting is the most expensive common operator: O(n log n) CPU and memory proportional to the input. Remove sorts by giving the engine rows in the needed order:

| Needs order | Index that provides it |
|-------------|------------------------|
| `ORDER BY OrderDate DESC` | `(OrderDate)` read backwards |
| `WHERE CustomerID = ? ORDER BY OrderDate` | `(CustomerID, OrderDate)` |
| `GROUP BY CustomerID` (stream) | Any index leading with `CustomerID` |
| `ROW_NUMBER() OVER (PARTITION BY CustomerID ORDER BY OrderDate)` | `(CustomerID, OrderDate)` |
| Merge join on `CustomerID` | Indexes on both join columns |

One sort can also serve several needs: if `GROUP BY a, b` and `ORDER BY a, b` use the same columns, one sort (or one index order) covers both. Window functions with the same `PARTITION BY`/`ORDER BY` share a sort (Section 11.15).

---

# Memory, Grants and Spills

Sorts and hash aggregates need working memory. When the input is larger than the memory available, they **spill** to disk:

```text
PostgreSQL:  Sort Method: external merge  Disk: 812000kB           ← spilled
             HashAggregate … Batches: 5  Disk Usage: 402000kB      ← spilled (13+)
SQL Server:  Sort / Hash Match warning: "Operator used tempdb to spill data"
MySQL:       Created_tmp_disk_tables / Sort_merge_passes status counters grow
Oracle:      OMem / 1Mem / Used-Tmp columns in DBMS_XPLAN ALLSTATS
```

Spills turn memory operations into disk I/O—often 10× slower. Causes and fixes:

```text
underestimated rows → grant too small      fix the estimate (15.03); SQL Server memory grant feedback
too many columns carried                   select fewer / narrower columns before sorting
too many rows                              filter earlier; aggregate before sorting; LIMIT with top-N sort
per-operation memory too low               work_mem (PostgreSQL), sort_buffer_size (MySQL) — per session, with care
```

---

# Shrink the Input

```sql
-- ❌ Sorts wide rows: every column carried through the sort
SELECT * FROM Orders ORDER BY TotalAmount DESC FETCH FIRST 100 ROWS ONLY;

-- ✅ Top-N sort of narrow rows, then fetch details for 100 rows
SELECT o.*
FROM (SELECT OrderID FROM Orders ORDER BY TotalAmount DESC FETCH FIRST 100 ROWS ONLY) AS t
JOIN Orders AS o ON o.OrderID = t.OrderID
ORDER BY o.TotalAmount DESC;
```

- Filter before aggregating (`WHERE`, not `HAVING`, for non-aggregate conditions—Section 08.09).
- Aggregate before joining when the join multiplies rows (Section 08.11).
- Group by keys, then join to get names: `GROUP BY CustomerID` then join `Customers`, rather than `GROUP BY CustomerID, CustomerName, Email, Address…`.

```sql
-- ✅ Narrow grouping key, details joined afterwards
WITH Totals AS (
    SELECT CustomerID, SUM(TotalAmount) AS Total
    FROM Orders
    WHERE OrderDate >= DATE '2026-01-01'
    GROUP BY CustomerID
)
SELECT c.CustomerName, c.Email, t.Total
FROM Totals AS t JOIN Customers AS c ON c.CustomerID = t.CustomerID;
```

---

# COUNT(DISTINCT) and DISTINCT

`COUNT(DISTINCT x)` must remember every distinct value—memory and sorting proportional to distinct values, and several distinct aggregates in one query multiply the work.

```text
fixes:
  covering index on x                     stream distinct over index order
  pre-aggregate: GROUP BY x first         then count groups
  approximate                             SQL Server APPROX_COUNT_DISTINCT (2019+), Oracle APPROX_COUNT_DISTINCT,
                                          PostgreSQL extensions (HyperLogLog)
  DISTINCT hiding fan-out                 fix the join (EXISTS) instead of deduplicating
```

Approximate distinct counts (typically within a few percent) use a tiny fraction of the memory—ideal for dashboards.

---

# Aggregates Served by Indexes

```sql
SELECT MAX(OrderDate) FROM Orders;                         -- reads one entry at the end of the OrderDate index
SELECT MIN(OrderDate) FROM Orders WHERE CustomerID = :c;   -- one seek on (CustomerID, OrderDate)
SELECT COUNT(*) FROM Orders WHERE CustomerID = :c;         -- index-only range count
```

`MIN`/`MAX` on a leading (or equality-prefixed) index column are answered from one end of the index. `COUNT(*)` over a whole table still reads the whole (smallest) index on most engines—MVCC engines (PostgreSQL, MySQL InnoDB, Oracle) keep no exact row counter, because the count depends on each transaction's snapshot.

---

# Precompute: Rollups and Materialized Views

When the same aggregation over large data is requested often, compute it once:

```sql
-- Rollup table maintained incrementally (e.g. nightly for yesterday)
INSERT INTO DailyRevenue (SalesDate, Orders, Revenue)
SELECT OrderDate, COUNT(*), SUM(TotalAmount)
FROM Orders
WHERE OrderDate >= :yesterday AND OrderDate < :today
GROUP BY OrderDate;

-- PostgreSQL materialized view (full refresh; CONCURRENTLY avoids blocking readers)
CREATE MATERIALIZED VIEW MonthlyRevenue AS
SELECT DATE_TRUNC('month', OrderDate)::date AS Month, SUM(TotalAmount) AS Revenue
FROM Orders GROUP BY 1;
CREATE UNIQUE INDEX ON MonthlyRevenue (Month);
REFRESH MATERIALIZED VIEW CONCURRENTLY MonthlyRevenue;

-- SQL Server indexed view: maintained automatically on every write (with restrictions)
-- Oracle materialized views: fast (incremental) refresh with materialized view logs
```

Trade-off: faster reads for extra write or refresh cost and some staleness.

---

# Columnstore and Batch Processing

Analytical queries that aggregate millions of rows benefit from **columnar** storage: only the needed columns are read, compressed heavily, and processed in batches of rows at a time.

| Engine | Option |
|--------|--------|
| SQL Server | Columnstore indexes (clustered or nonclustered), batch mode (also on rowstore in 2019+) |
| Oracle | Database In-Memory column store (option) |
| PostgreSQL | Extensions (e.g. Citus columnar); parallel aggregation built in |
| MySQL | HeatWave (managed service); otherwise row store only |

For heavy reporting on an OLTP database, a columnstore index or a separate analytic store often beats any amount of row-store tuning.

---

# Visual Representation

```text
   rows ──filter──▶ fewer rows ──narrow──▶ fewer bytes ──aggregate early──▶ fewer groups ──▶ sort/hash in memory
                                                                                         └─ else spill to disk (slow)
   index order available?  yes → stream aggregate / no sort
                           no  → hash aggregate or sort (needs memory)
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN        ← aggregate before joins that multiply rows
3. WHERE       ← filter before grouping (not in HAVING)
4. GROUP BY    ← stream (index order) or hash (memory); narrow grouping keys
5. HAVING      ← only aggregate conditions
6. WINDOW      ← shares sorts with ORDER BY when keys match
7. SELECT      ← join descriptive columns after aggregating
8. DISTINCT    ← often a sign of fan-out; costs a sort or hash
9. ORDER BY    ← avoided by index order; top-N sort with LIMIT
10. LIMIT / FETCH / TOP   ← turns a full sort into a top-N heap
```

---

# How the DBMS Executes This

```text
GroupAggregate                         ← stream: no sort, rows arrive in CustomerID order
  -> Index Only Scan using ix_orders_customer_date on orders
versus
HashAggregate  (Batches: 1  Memory Usage: 180MB)
  -> Seq Scan on orders
versus
Sort (external merge  Disk: 812MB) -> GroupAggregate   ← spilled sort: fix estimate/width/memory
```

---

# 🏗️ Architecture Insight

Separate transactional and analytical workloads when aggregation load grows: read replicas for reports, rollup tables for dashboards, columnstore or a warehouse for ad-hoc analytics. Heavy aggregations competing with OLTP queries for memory and I/O slow both.

---

# ⚡ Performance Tip

When a report sorts or groups millions of rows, check the plan for spills first. A spill that disappears after selecting fewer columns or filtering earlier is the cheapest fix available.

---

# 🌍 Production Consideration

Per-operation memory settings multiply: `work_mem = 256MB` means 256 MB **per sort or hash, per query, per session**. A query with four sorts on 50 concurrent sessions could request 50 GB. Raise such settings per session for known heavy reports, not globally.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Hash aggregate | Implementation | ✅ | ✅ (temp tables) | ✅ | ✅ | ❌ (sorting / temp b-tree) |
| Stream aggregate | Implementation | ✅ | ✅ (loose index scan too) | ✅ | ✅ | ✅ |
| Spill visibility | ❌ | `EXPLAIN ANALYZE` | Status counters | Plan warnings | `ALLSTATS` | ❌ |
| Approximate distinct | ❌ | Extensions | ❌ | `APPROX_COUNT_DISTINCT` | `APPROX_COUNT_DISTINCT` | ❌ |
| Materialized views | ❌ | ✅ (manual refresh) | ❌ | Indexed views | ✅ (fast refresh) | ❌ |
| Columnar | ❌ | Extensions | HeatWave | Columnstore | In-Memory option | ❌ |

> **Portability Tip:** Filtering early, aggregating narrow keys and matching indexes to `GROUP BY`/`ORDER BY` help everywhere. Precomputation and columnar features are engine-specific.

---

# Common Mistakes

### Mistake 1

Sorting or grouping wide rows with `SELECT *`.

---

### Mistake 2

Filtering in `HAVING` what belongs in `WHERE`.

---

### Mistake 3

Grouping by many descriptive columns instead of a key.

---

### Mistake 4

Ignoring spill warnings.

---

### Mistake 5

Raising memory settings globally to fix one query.

---

# Best Practices

✔ Provide index order for frequent `ORDER BY`, `GROUP BY` and window partitions.

✔ Filter, narrow and pre-aggregate before sorting and grouping.

✔ Watch for spills and fix the estimate or input size.

✔ Use approximate distinct counts for dashboards.

✔ Precompute recurring heavy aggregations.

---

# Interview Questions

## Basic

1. What is the difference between hash and stream aggregation?
2. How can an index remove a sort?
3. What is a sort spill?

## Intermediate

4. Why is `COUNT(DISTINCT)` expensive?
5. Why does `SELECT MAX(OrderDate)` read only one index entry?
6. How do you shrink the input to a large sort?

## Advanced

7. Why doesn't PostgreSQL keep an exact `COUNT(*)` for tables?
8. When would you choose a materialized view over a rollup table, or columnstore over both?

---

# Hands-on Exercises

## Exercise 1

Find a `GROUP BY` that uses a hash aggregate and add an index that allows a stream aggregate without a sort.

---

## Exercise 2

Produce a sort spill, then remove it by narrowing the selected columns.

---

## Exercise 3

Build a daily rollup table and compare a monthly report against it and against raw orders.

---

# Related Topics

- **08.14 — Execution Flow of GROUP BY (Hash and Stream Aggregation)**
- **08.15 — GROUP BY Performance and Index Strategy**
- **11.15 — Window Function Performance and Index Strategy**
- **15.10 — Pagination and Top-N Query Optimization**
- **15.12 — Optimizing Writes (Batch INSERT, UPDATE and DELETE)**

---

# Summary

Aggregation and sorting are cheap when rows arrive in the needed order—stream aggregation and index-ordered reads need no sort—and expensive when large, wide inputs must be hashed or sorted, especially when underestimated memory grants cause spills to disk. Shrink the input (filter first, narrow columns, group by keys, aggregate before joins), let indexes provide order, watch for spills, use approximate distinct counts where exactness is unnecessary, and precompute recurring heavy aggregations with rollup tables, materialized views or columnar storage.
