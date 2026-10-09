---
title: "17.12 - Indexing Materialized Views"
description: "Designing indexes for materialized views and indexed views: indexing for the queries that read them, unique indexes required for concurrent refresh, covering and composite indexes on stored aggregates, the effect of indexes on refresh time, statistics on materialized views, partitioned materialized views, and index maintenance after refresh."
chapter: 17
section: 17.12
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 20 min
lastUpdated: 2026-10-09
---

# 17.12 Indexing Materialized Views

---

# Learning Objectives

After completing this section, you will be able to:

- Index a materialized view for the queries that read it.
- Provide the unique keys that refresh mechanisms require.
- Balance read performance against refresh cost.
- Keep statistics on materialized views current.
- Use partitioning to refresh and query large materialized views efficiently.

---

# Why Index a Materialized View?

A materialized view is a table. Without indexes, every read is a full scan of the stored result. That is fine for 300 rows of department headcounts; it is not fine for 1,000,000 rows of customer revenue read by a customer page that needs one row.

```sql
CREATE MATERIALIZED VIEW CustomerRevenue AS
SELECT c.CustomerID, c.Country, COUNT(o.OrderID) AS OrderCount, SUM(o.TotalAmount) AS Revenue
FROM Customers c
JOIN Orders o ON o.CustomerID = c.CustomerID
GROUP BY c.CustomerID, c.Country;

-- the queries that read it
SELECT * FROM CustomerRevenue WHERE CustomerID = 42;                                   -- customer page
SELECT * FROM CustomerRevenue WHERE Country = 'IN' ORDER BY Revenue DESC FETCH FIRST 20 ROWS ONLY;  -- leaderboard
```

```sql
CREATE UNIQUE INDEX ux_customerrevenue_customer ON CustomerRevenue (CustomerID);
CREATE INDEX ix_customerrevenue_country_rev    ON CustomerRevenue (Country, Revenue DESC);
```

The same principles as Chapter 10 apply—equality columns first, then range or order columns, cover what you can—with one advantage: the data changes only at refresh time, so read-optimized indexes are cheap to keep.

---

# Indexes the Refresh Needs

| Engine | Requirement | Purpose |
|--------|-------------|---------|
| PostgreSQL | `UNIQUE` index on plain columns, no `WHERE`, for `REFRESH … CONCURRENTLY` | Match old and new rows to compute the diff |
| SQL Server | `UNIQUE CLUSTERED` index on the view | It *is* the materialization; nonclustered indexes only after it |
| Oracle | Index on the MV's grouping columns (created automatically for many fast-refreshable aggregate MVs as `I_SNAP$_…`) | Locate groups to update during fast refresh |

```sql
-- PostgreSQL: without this, CONCURRENTLY fails
-- ERROR: cannot refresh materialized view "customerrevenue" concurrently
-- HINT: Create a unique index with no WHERE clause on one or more columns of the materialized view.
CREATE UNIQUE INDEX ux_customerrevenue_customer ON CustomerRevenue (CustomerID);
```

Choose the view's natural key—the `GROUP BY` columns of an aggregate, or the primary key of the driving table in a join.

---

# Covering Reads from the Stored Result

```sql
-- PostgreSQL 11+ / SQL Server: INCLUDE columns
CREATE INDEX ix_customerrevenue_country_rev
ON CustomerRevenue (Country, Revenue DESC) INCLUDE (OrderCount);
```

```text
Limit
  -> Index Only Scan using ix_customerrevenue_country_rev on customerrevenue
        Index Cond: (country = 'IN'::text)
        Heap Fetches: 0
```

Index-only scans on a PostgreSQL materialized view depend on its visibility map, which `VACUUM` maintains. After a plain refresh (new storage), run `VACUUM ANALYZE` on the view; after a concurrent refresh, autovacuum catches up eventually, but heap fetches may appear until it does.

---

# Indexes and Refresh Cost

```text
refresh type            effect of each extra index
complete (PG plain)     indexes rebuilt from scratch after the data load (sorted builds: efficient)
concurrent (PG)         each changed row updates every index (row by row: more expensive)
fast refresh (Oracle)   each changed group updates every index
SQL Server indexed view every base-table write updates every view index synchronously
```

Rule of thumb: on views refreshed completely, extra indexes cost little; on views maintained incrementally or synchronously, keep the index count as low as the read workload allows.

---

# Statistics

```sql
ANALYZE CustomerRevenue;                                                -- PostgreSQL (after refresh)
EXEC DBMS_STATS.GATHER_TABLE_STATS(USER, 'CUSTOMERREVENUEMV');          -- Oracle (or rely on the auto task)
UPDATE STATISTICS dbo.ProductSales;                                     -- SQL Server (needs NOEXPAND queries to be used)
```

A refresh can change the stored result dramatically (a new month of data, a new country). Plans for queries on the view are only as good as its statistics; add `ANALYZE` (or equivalent) to the refresh procedure.

---

# Partitioned Materialized Views

```sql
-- Oracle: partition the MV by time, refresh only changed partitions (Partition Change Tracking;
-- the base tables must be partitioned on a column the MV can map to its own partitions)
CREATE MATERIALIZED VIEW MonthlyProductSales
PARTITION BY RANGE (SalesMonth)
  (PARTITION p2025 VALUES LESS THAN (DATE '2026-01-01'),
   PARTITION p2026 VALUES LESS THAN (DATE '2027-01-01'))
REFRESH FAST ON DEMAND
ENABLE QUERY REWRITE
AS
SELECT TRUNC(o.OrderDate, 'MM') AS SalesMonth, oi.ProductID,
       COUNT(*) AS LineCount, SUM(oi.Quantity * oi.UnitPrice) AS Revenue
FROM Orders o JOIN OrderItems oi ON oi.OrderID = o.OrderID
GROUP BY TRUNC(o.OrderDate, 'MM'), oi.ProductID;
```

With Partition Change Tracking (PCT), Oracle knows which base partitions changed and recomputes only the matching MV partitions. PostgreSQL materialized views cannot be partitioned; use a partitioned **summary table** and refresh partitions individually (Section 17.13).

---

# Visual Representation

```text
MATERIALIZED VIEW CustomerRevenue (1,000,000 rows)
  ├── UNIQUE (CustomerID)                 ← refresh key (CONCURRENTLY) + point lookups
  ├── (Country, Revenue DESC) INCLUDE (…)  ← leaderboard: seek + ordered + covered
  └── statistics                          ← refreshed with the data (ANALYZE in the refresh job)

cost of each index:   complete refresh: low   ·   incremental / synchronous: per changed row
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← stored rows, accessed through the MV's indexes
2. JOIN        ← joins from the MV to other tables use its indexes like any table
3. WHERE       ← equality columns of the MV index first
4. GROUP BY    ← already done; a further roll-up may use index order
5. HAVING
6. WINDOW
7. SELECT      ← INCLUDE columns make reads covering
8. DISTINCT
9. ORDER BY    ← a DESC key in the index removes the sort
10. LIMIT / FETCH / TOP   ← ordered index + limit = read only N entries
```

---

# How the DBMS Executes This

```text
PG plain refresh:        new heap filled → each index rebuilt by sorting → old storage dropped
PG concurrent refresh:   diff via unique index → per-row INSERT/UPDATE/DELETE → every index maintained
Oracle fast/PCT:         affected groups or partitions recomputed → indexes on them maintained
SQL Server:              base write → view clustered index row updated → nonclustered view indexes updated
Read:                    ordinary index access paths and statistics on the stored rows
```

---

# 🏗️ Architecture Insight

Materialized views move the expensive part of a query to refresh time; their indexes move the remaining part—finding the right stored rows—to almost nothing. Together they turn a multi-second aggregate into a sub-millisecond seek, which is often the difference between a dashboard that needs caching and one that does not.

---

# ⚡ Performance Tip

Design materialized-view indexes from the **read queries' plans**, not from the view definition. The view's `GROUP BY` key is needed for refresh; the read indexes come from how the application filters and sorts the stored rows.

---

# 🌍 Production Consideration

Index creation on a large materialized view takes time and locks. Create the indexes once, right after the view is created, and let refreshes maintain them; do not drop and recreate indexes in every refresh job unless measurements prove it faster.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Indexes on MVs | ❌ | ✅ | n/a (summary tables) | ✅ (clustered first) | ✅ | n/a |
| Required unique index | ❌ | For `CONCURRENTLY` | n/a | Unique clustered | Created for fast refresh | n/a |
| `INCLUDE` columns | ❌ | ✅ (11+) | n/a | ✅ | ❌ (composite instead) | n/a |
| Partitioned MVs | ❌ | ❌ (partitioned tables instead) | n/a | Aligned with base partitions | ✅ (+ PCT refresh) | n/a |
| Statistics | ❌ | `ANALYZE` | n/a | Needs `NOEXPAND` usage | `DBMS_STATS` | n/a |

> **Portability Tip:** Indexing rules for materialized views are the same as for tables (Chapter 10). The differences are the extra keys each engine's refresh needs.

---

# Common Mistakes

### Mistake 1

Leaving a large materialized view without indexes and scanning it for single-row lookups.

---

### Mistake 2

Forgetting the unique index that `REFRESH … CONCURRENTLY` requires.

---

### Mistake 3

Adding many indexes to an incrementally or synchronously maintained view.

---

### Mistake 4

Not refreshing statistics after a refresh changes the data distribution.

---

# Best Practices

✔ Create a unique index on the view's natural key.

✔ Add read indexes from the plans of the queries that use the view.

✔ Keep index counts low on incrementally maintained views.

✔ Run `ANALYZE`/statistics collection as part of the refresh job.

✔ Partition very large materialized results by time.

---

# Interview Questions

## Basic

1. Why would you index a materialized view?
2. Which index does PostgreSQL require for concurrent refresh?
3. Which index must every SQL Server indexed view have?

## Intermediate

4. How do extra indexes affect complete versus incremental refresh?
5. Why might index-only scans on a PostgreSQL MV still visit the heap after a refresh?
6. Why should a refresh job also update statistics?

## Advanced

7. Design indexes for a materialized view used by a point-lookup page and a top-N leaderboard.
8. Explain Partition Change Tracking and its benefit for refresh time.

---

# Hands-on Exercises

## Exercise 1

Create `CustomerRevenue` without indexes, time a lookup by `CustomerID`, then add the unique index and compare.

---

## Exercise 2

Build a covering index for the country leaderboard and confirm an index-only scan.

---

## Exercise 3

Measure concurrent refresh time with one index and with four indexes.

---

# Related Topics

- **17.10 — Refreshing Materialized Views (Complete, Incremental and Concurrent)**
- **17.11 — Indexed Views and Automatic Query Rewrite**
- **10.05 — Composite Indexes and Column Order**
- **10.06 — Covering Indexes and Included Columns**
- **10.12 — Selectivity, Cardinality and Statistics**

---

# Summary

A materialized view is a table, so it needs indexes for the queries that read it: a unique index on its natural key (required for PostgreSQL concurrent refresh and SQL Server indexed views) plus read indexes designed from the read queries' plans. Indexes are cheap on completely refreshed views and costly on incrementally or synchronously maintained ones. Refresh jobs should update statistics, and very large materialized results benefit from partitioning, which Oracle combines with partition-level refresh.
