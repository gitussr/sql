---
title: "16.08 - Table Access Operators (Scans, Seeks, Lookups and Bitmaps)"
description: "How table and index access appears in execution plans on every engine: full table scans, full index scans, index seeks and range scans, index-only scans, key and RID lookups, bitmap index and heap scans, partition pruning, and how to judge each one by rows read, rows returned, executions and pages touched."
chapter: 16
section: 16.08
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 25 min
lastUpdated: 2026-10-01
---

# 16.08 Table Access Operators (Scans, Seeks, Lookups and Bitmaps)

---

# Learning Objectives

After completing this section, you will be able to:

- Recognise every access operator on every major engine.
- Judge an access operator by rows read, rows returned, executions and pages.
- Spot lookups that should be removed with a covering index.
- Read bitmap scans and partition pruning in plans.
- Decide whether a scan in a plan is a problem or the right choice.

---

# The Access Operators Across Engines

| Concept | PostgreSQL | SQL Server | MySQL (`type` / TREE) | Oracle | SQLite |
|---------|------------|------------|-----------------------|--------|--------|
| Full table scan | `Seq Scan` | `Table Scan` (heap), `Clustered Index Scan` | `ALL` / `Table scan` | `TABLE ACCESS FULL` | `SCAN t` |
| Full index scan | `Index Scan` without `Index Cond` | `Index Scan` | `index` / `Index scan` | `INDEX FULL SCAN`, `INDEX FAST FULL SCAN` | `SCAN t USING INDEX` |
| Seek / range scan | `Index Scan` with `Index Cond` | `Index Seek` | `const`, `eq_ref`, `ref`, `range` | `INDEX UNIQUE SCAN`, `INDEX RANGE SCAN` | `SEARCH t USING INDEX` |
| Index-only (covering) | `Index Only Scan` | Seek/scan with no lookup | `Using index` | Index operation with no table access | `USING COVERING INDEX` |
| Row lookup | (built into `Index Scan`) | `Key Lookup`, `RID Lookup` | (implicit) | `TABLE ACCESS BY INDEX ROWID` | (implicit) |
| Bitmap | `Bitmap Index Scan` + `Bitmap Heap Scan` | — (rowstore) | `index_merge` | `BITMAP …` operations | — |

---

# Full Table Scans

```text
Seq Scan on orders  (cost=0.00..233334.00 rows=391220 width=48) (actual time=0.02..1,104 rows=391,220 loops=1)
  Filter: (orderdate >= '2026-09-01'::date)
  Rows Removed by Filter: 9,608,780
  Buffers: shared hit=4,112 read=129,222
```

Judge a scan by the **fraction** of rows it keeps:

```text
rows returned / rows read  = 391,220 / 10,000,000 ≈ 4%     → an index range scan is probably cheaper
rows returned / rows read  = 3,000,000 / 10,000,000 = 30%  → a scan is the right choice
small table (a few pages)                                   → a scan is always fine
```

A scan is a problem when it reads far more than it returns, sits on the inner side of a nested loop (`loops > 1`), or appears under a `LIMIT` that should stop early.

---

# Seeks and Range Scans

```text
Index Scan using ix_orders_customer_date on orders  (actual rows=120 loops=1)
  Index Cond: ((customerid = 42) AND (orderdate >= '2026-01-01'::date))
```

A seek navigates the B-tree to the first matching entry and reads forward while entries match. What to check:

- **Which predicates are in the seek** (`Index Cond`, Seek Predicates, `access()`, `key_len`, `(col=? AND col>?)`).
- **Which are residual** (`Filter`, Predicate, `filter()`, `Using where`)—rows read, then discarded.
- **Executions**: a seek executed 2 million times is not cheap, however fast each one is.

```text
-- Good: both columns navigate the index
Index Cond: ((customerid = 42) AND (orderdate >= '2026-01-01'))

-- Weaker: only the leading column navigates; the date is checked per row
Index Cond: (customerid = 42)
Filter: (date_part('year', orderdate) = 2026)
Rows Removed by Filter: 48,000
```

---

# Index-Only Scans (Covering)

```text
-- PostgreSQL
Index Only Scan using ix_orders_date_cov on orders  (actual rows=391,220 loops=1)
  Index Cond: (orderdate >= '2026-09-01'::date)
  Heap Fetches: 0
  Buffers: shared hit=1,640
```

Every needed column was in the index—1,640 pages instead of 130,000. In PostgreSQL, watch `Heap Fetches`: a high number means the visibility map is stale and the "index-only" scan visited the table anyway; `VACUUM` fixes it.

SQL Server and Oracle show covering access as a seek or range scan **with no lookup operator** above it; MySQL shows `Using index`; SQLite shows `COVERING INDEX`.

---

# Lookups

When the index does not contain every needed column, each matching entry is followed by a lookup of the full row:

```text
-- SQL Server
Nested Loops (Inner Join)
  ├─ Index Seek [ix_orders_orderdate]      Actual Rows 391,220
  └─ Key Lookup (Clustered) [PK_Orders]    Number of Executions 391,220
        Output List: CustomerID, TotalAmount, Status

-- Oracle
TABLE ACCESS BY INDEX ROWID BATCHED  ORDERS          Starts 1   A-Rows 391,220  Buffers 402,118
  INDEX RANGE SCAN                   IX_ORDERS_ORDERDATE
```

```text
how to judge a lookup:
  executions × (1 random page read)  vs  a full scan's sequential reads
  391,220 lookups ≈ 391,220 page visits  vs  ~130,000 pages for a full scan → the scan would be cheaper
  fix: add the Output List columns to the index (INCLUDE), or select fewer columns
```

The `Output List` (SQL Server) or `used_columns` (MySQL JSON) tells you exactly which columns caused the lookup.

---

# Bitmap Scans

```text
-- PostgreSQL: two indexes combined
Bitmap Heap Scan on orders  (actual rows=2,104 loops=1)
  Recheck Cond: ((customerid = 42) OR (employeeid = 17))
  Heap Blocks: exact=1,980
  -> BitmapOr
        -> Bitmap Index Scan on ix_orders_customer_date  (actual rows=120 loops=1)
              Index Cond: (customerid = 42)
        -> Bitmap Index Scan on ix_orders_employee      (actual rows=1,990 loops=1)
              Index Cond: (employeeid = 17)
```

- `Bitmap Index Scan` collects matching row locations into a bitmap.
- `BitmapAnd` / `BitmapOr` combine bitmaps from several indexes.
- `Bitmap Heap Scan` reads each table page once, in physical order.
- `Heap Blocks: lossy=…` means the bitmap exceeded `work_mem` and degraded to page granularity; `Rows Removed by Index Recheck` shows the extra filtering.

Oracle shows `BITMAP CONVERSION FROM ROWIDS`, `BITMAP AND` / `BITMAP OR`; MySQL shows `type = index_merge` with `Using union(…)` or `Using intersect(…)` in `Extra`.

---

# Partition Pruning

```text
-- PostgreSQL: only one monthly partition of Events is scanned
Append  (actual rows=1,204,118 loops=1)
  Subplans Removed: 82                                   ← pruned at execution time
  -> Seq Scan on events_2026_09  (actual rows=1,204,118 loops=1)
        Filter: (occurredat >= '2026-09-01 …')

-- Oracle
PARTITION RANGE SINGLE   Pstart 81   Pstop 81             ← one partition
PARTITION RANGE ALL      Pstart 1    Pstop 84             ← no pruning: check the predicate!

-- SQL Server: Actual Partition Count = 1, Partitions Accessed = 81
-- MySQL: partitions column = p202609
```

A partitioned table scanned in every partition usually means the predicate is not on the partition key or is non-sargable (Section 13.15).

---

# Visual Representation

```text
                         rows returned / rows read
                 low (≪1%)                        high (≥ several %)
              ┌─────────────────────────────┬──────────────────────────────┐
  executions  │ seek (+ lookup if needed)   │ scan / covering range scan   │
  = 1         │ ✔ expected                   │ ✔ expected                   │
              ├─────────────────────────────┼──────────────────────────────┤
  executions  │ seek on inner side of NL    │ SCAN on inner side of NL     │
  ≫ 1         │ ✔ if outer side is small     │ ✘ red flag: index or hash    │
              └─────────────────────────────┴──────────────────────────────┘
  lookups × executions ≫ table pages  → cover the query or let it scan
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← every table appears as one or more access operators at the leaves
2. JOIN        ← inner-side access operators run once per outer row (check executions)
3. WHERE       ← seek predicates vs residual filters on each access operator
4. GROUP BY    ← an ordered index scan can feed a stream aggregate
5. HAVING
6. WINDOW      ← an ordered index scan can avoid the window sort
7. SELECT      ← needed columns decide index-only access vs lookups
8. DISTINCT
9. ORDER BY    ← an ordered index scan can avoid the sort
10. LIMIT / FETCH / TOP   ← an ordered scan can stop after N rows
```

---

# How the DBMS Executes This

```text
Seq / Table Scan:     read pages 1..N sequentially (multi-page reads), test each row
Index Seek:           root → branch → leaf page, then follow leaf pages while keys match
Index-Only Scan:      as seek, return columns from the leaf entries
Lookup:               for each leaf entry, read the row's page (clustered key or row ID)
Bitmap:               seek → set bits per row/page → read pages in physical order → recheck
```

---

# 🏗️ Architecture Insight

The access operators you see are limited by the indexes you built. When plans repeatedly show scans with huge `Rows Removed by Filter`, or seeks followed by millions of lookups, the fix belongs in the index design for the workload (Section 10.15), not in the query text.

---

# ⚡ Performance Tip

For every access operator, write down three numbers: rows read, rows returned, executions. If rows read ≫ rows returned, move predicates into the index key; if executions ≫ 1 with lookups, cover the query; if rows returned is a large fraction of the table, accept the scan.

---

# 🌍 Production Consideration

The same query can show a seek in development and a scan in production because the predicate matches 0.01% of a small table but 8% of a large, skewed one. A scan in production is not automatically a regression—check the fraction of rows before forcing an index.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Separate lookup operator | ❌ | ❌ (inside Index Scan) | ❌ | ✅ Key/RID Lookup | ✅ `TABLE ACCESS BY INDEX ROWID` | ❌ |
| Rows read vs returned | ❌ | `Rows Removed by Filter` | `filtered` (estimate) | `Actual Rows Read` | Child vs parent `A-Rows` | ❌ |
| Bitmap combining | ❌ | `BitmapAnd/Or` | `index_merge` | — | `BITMAP AND/OR` | — |
| Partition pruning shown | ❌ | `Subplans Removed` | `partitions` column | Partitions Accessed | `Pstart`/`Pstop` | n/a |

> **Portability Tip:** Every engine shows "how many rows were read" somewhere—directly or by comparing a child's output with its parent's. Find it before judging an access path.

---

# Common Mistakes

### Mistake 1

Treating every scan as a problem, including scans that return 30% of a table.

---

### Mistake 2

Celebrating "it uses the index" when the seek is followed by a million lookups.

---

### Mistake 3

Ignoring residual predicates on an index seek.

---

### Mistake 4

Missing that a partitioned table was scanned in every partition.

---

# Best Practices

✔ Judge access by rows read, rows returned and executions.

✔ Move residual predicates into index keys when they are selective.

✔ Cover hot queries to remove lookups.

✔ Check `Heap Fetches` on PostgreSQL index-only scans.

✔ Confirm partition pruning in plans for partitioned tables.

---

# Interview Questions

## Basic

1. What is the difference between a table scan and an index seek in a plan?
2. What is a Key Lookup?
3. What does `Index Only Scan` mean?

## Intermediate

4. How do you tell from a plan whether a predicate was used to navigate the index?
5. When is a full scan the right plan?
6. What does a `Bitmap Heap Scan` do?

## Advanced

7. A seek returns 400,000 rows followed by 400,000 lookups. What would you check, and what are the fixes?
8. How do you verify partition pruning in PostgreSQL, SQL Server and Oracle plans?

---

# Hands-on Exercises

## Exercise 1

For one query, record rows read, rows returned and executions for every access operator in its plan.

---

## Exercise 2

Turn a seek + lookup plan into an index-only plan with a covering index and compare pages read.

---

## Exercise 3

Write an `OR` across two indexed columns and find the bitmap or index-merge operator in the plan.

---

# Related Topics

- **10.08 — Index Seeks, Scans and Lookups**
- **10.06 — Covering Indexes and Included Columns**
- **15.05 — Choosing Access Paths (Scans, Seeks and Lookups)**
- **16.09 — Join Operators (Nested Loop, Hash and Merge)**
- **16.12 — Plan Warnings and Red Flags (Spills, Conversions and Residual Predicates)**

---

# Summary

Access operators are the leaves of every plan: full table scans, full index scans, seeks and range scans, index-only scans, lookups, bitmap scans and partition-pruned scans, each with a different name on each engine. Judge them by rows read against rows returned, by executions, and by pages touched. A scan that keeps a large fraction of a table is correct; a scan that keeps a tiny fraction, or runs on the inner side of a nested loop, is a red flag. Seeks should carry the selective predicates in their seek conditions, not in residual filters, and seeks followed by huge numbers of lookups call for a covering index.
