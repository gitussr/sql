---
title: "10.14 - Index Maintenance (Fragmentation, Rebuilds and Monitoring)"
description: "Keeping indexes healthy: logical and internal fragmentation, bloat in MVCC engines, fill factor, rebuild versus reorganise, VACUUM and REINDEX, measuring fragmentation and bloat, finding unused, duplicate and missing indexes, and a practical maintenance routine."
chapter: 10
section: 10.14
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 35 min
lastUpdated: 2026-09-25
---

# 10.14 Index Maintenance (Fragmentation, Rebuilds and Monitoring)

---

# Learning Objectives

After completing this section, you will be able to:

- Distinguish logical fragmentation, low page density and MVCC bloat.
- Decide when a rebuild or reorganise is worth doing—and when it is not.
- Set a fill factor appropriate to an index's insert pattern.
- Measure fragmentation and bloat on each major engine.
- Find unused, duplicate and missing indexes from usage statistics.
- Run a sensible, low-risk index maintenance routine.

---

# What Goes Wrong Over Time

```text
Freshly built index                        After months of inserts, updates, deletes
┌────┐┌────┐┌────┐┌────┐                   ┌────┐     ┌──┐ ┌────┐   ┌─┐ ┌────┐
│████││████││████││████│                   │██░░│ …   │█░│ │███░│ … │░│ │█░░░│
└────┘└────┘└────┘└────┘                   └────┘     └──┘ └────┘   └─┘ └────┘
full pages, in physical order              half-empty pages, logical order ≠ physical order,
                                           dead entries (MVCC)
```

Three distinct problems:

| Problem | What it is | Effect |
|---------|-----------|--------|
| **Low page density** (internal fragmentation) | Pages partly empty after splits and deletes | More pages to read and cache for the same data |
| **Logical fragmentation** (external) | Leaf pages' physical order differs from key order | Range scans do random instead of sequential I/O |
| **Bloat** (MVCC engines) | Entries for dead row versions not yet removed | Larger index, slower scans, wasted cache |

---

# Does Fragmentation Matter?

Less than its reputation suggests:

- **Seeks** of a few rows are barely affected: they read a handful of pages whatever the layout.
- **Logical fragmentation** mattered on spinning disks, where random reads were ~100× slower than sequential ones. On SSDs and when data is cached, the penalty is small.
- **Low page density** still matters everywhere: half-empty pages mean twice the pages to read, cache, back up and replicate.

So measure **page density and size**, not just "fragmentation percent", and rebuild for the space and cache efficiency, not by habit.

---

# Fill Factor

Fill factor is the percentage of each leaf page filled when an index is built or rebuilt. Free space delays page splits for inserts into the middle of the index.

```sql
CREATE INDEX IX_Orders_CustomerID ON Orders (CustomerID) WITH (FILLFACTOR = 90);  -- PostgreSQL, SQL Server
ALTER INDEX IX_Orders_CustomerID ON dbo.Orders REBUILD WITH (FILLFACTOR = 85);    -- SQL Server
```

| Insert pattern | Fill factor |
|----------------|-------------|
| Increasing keys (identity, timestamps) | 100 (default in SQL Server; PostgreSQL B-tree default 90) |
| Random keys, frequent inserts in the middle | 70–90 |
| Read-only or static | 100 |

A lower fill factor makes the index larger immediately; use it only where splits are measured to be a problem.

---

# Rebuild vs Reorganise

```text
REBUILD                                     REORGANIZE (SQL Server) / compaction
────────────────────────────────────        ────────────────────────────────────
Builds a new index from scratch             Compacts and reorders leaf pages in place
Full, ordered pages; statistics refreshed   Incremental; can be stopped any time
Needs space for a second copy               Little extra space
Online on Enterprise editions / PG          Always online
Heavy log volume                            Log volume proportional to work
```

| Engine | Rebuild | Lighter alternative |
|--------|---------|--------------------|
| PostgreSQL | `REINDEX [CONCURRENTLY]` (12+) | `VACUUM` removes dead entries; `pg_repack` for online rebuild of tables |
| SQL Server | `ALTER INDEX … REBUILD [WITH (ONLINE = ON, RESUMABLE = ON)]` | `ALTER INDEX … REORGANIZE` |
| MySQL | `ALTER TABLE … FORCE` / `OPTIMIZE TABLE` (online in InnoDB) | Automatic page merges |
| Oracle | `ALTER INDEX … REBUILD ONLINE` | `ALTER INDEX … COALESCE` / `SHRINK SPACE` |
| SQLite | `REINDEX` | `VACUUM` (whole database) |

---

# MVCC Bloat and VACUUM (PostgreSQL)

PostgreSQL keeps old row versions until no transaction can see them. Index entries pointing to dead versions remain until **VACUUM** removes them:

```text
UPDATE heavy table without enough vacuuming

index: [live][dead][dead][live][dead][dead][dead][live] …
       → scans skip dead entries but still read them
       → pages cannot be reused → index grows
```

- **Autovacuum** handles this for most tables; tune it (lower scale factors, higher cost limits) for large, frequently updated tables.
- **Long-running transactions** (and abandoned replication slots or prepared transactions) prevent VACUUM from removing anything newer than their snapshot—the most common cause of runaway bloat.
- Once bloated, an index shrinks only by `REINDEX` (or `pg_repack`); VACUUM makes space reusable but does not return it.

---

# Measuring Fragmentation and Bloat

```sql
-- SQL Server: fragmentation and page density
SELECT i.name, ps.avg_fragmentation_in_percent, ps.avg_page_space_used_in_percent, ps.page_count
FROM sys.dm_db_index_physical_stats(DB_ID(), OBJECT_ID('dbo.Orders'), NULL, NULL, 'SAMPLED') AS ps
JOIN sys.indexes AS i ON i.object_id = ps.object_id AND i.index_id = ps.index_id;

-- PostgreSQL: B-tree density with pgstattuple
CREATE EXTENSION IF NOT EXISTS pgstattuple;
SELECT avg_leaf_density, leaf_fragmentation FROM pgstatindex('ix_orders_customerid');

-- MySQL: free space and size
SELECT table_name, data_free / 1024 / 1024 AS FreeMB
FROM information_schema.tables WHERE table_name = 'Orders';

-- Oracle
ANALYZE INDEX IX_Orders_CustomerID VALIDATE STRUCTURE;
SELECT lf_rows, del_lf_rows, pct_used FROM index_stats;
```

A reasonable trigger: rebuild when page density falls below ~70% on a large index that is scanned, or when an index is several times larger than a fresh build would be.

---

# Finding Unused Indexes

Unused indexes cost writes and space for nothing. Usage statistics reveal them:

```sql
-- PostgreSQL: scans since statistics reset
SELECT relname AS table_name, indexrelname AS index_name, idx_scan,
       pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- SQL Server: reads vs writes since restart
SELECT OBJECT_NAME(s.object_id) AS table_name, i.name,
       s.user_seeks + s.user_scans + s.user_lookups AS reads, s.user_updates AS writes
FROM sys.dm_db_index_usage_stats AS s
JOIN sys.indexes AS i ON i.object_id = s.object_id AND i.index_id = s.index_id
WHERE s.database_id = DB_ID()
ORDER BY reads, writes DESC;

-- MySQL (sys schema)
SELECT * FROM sys.schema_unused_indexes;
```

Before dropping:

- Check that statistics cover a full business cycle (month-end, year-end jobs).
- Check replicas—PostgreSQL and SQL Server usage statistics are per server.
- Keep indexes that enforce constraints.
- Make it invisible or disabled first where possible (Section 10.03).

---

# Finding Duplicate and Overlapping Indexes

```sql
-- PostgreSQL: indexes with identical definitions on the same table
SELECT indrelid::regclass AS table_name, array_agg(indexrelid::regclass) AS indexes
FROM pg_index
GROUP BY indrelid, indkey, indclass, indexprs::text, indpred::text
HAVING COUNT(*) > 1;
```

Also look for leading-prefix redundancy—`(A)` next to `(A, B)`—as in Section 10.05. MySQL's `sys.schema_redundant_indexes` view reports both kinds.

---

# Finding Missing Indexes

```sql
-- SQL Server: optimizer's missing-index suggestions
SELECT d.statement, d.equality_columns, d.inequality_columns, d.included_columns,
       s.user_seeks, s.avg_user_impact
FROM sys.dm_db_missing_index_details d
JOIN sys.dm_db_missing_index_groups g ON g.index_handle = d.index_handle
JOIN sys.dm_db_missing_index_group_stats s ON s.group_handle = g.index_group_handle
ORDER BY s.user_seeks * s.avg_user_impact DESC;

-- PostgreSQL: tables read mostly by sequential scans
SELECT relname, seq_scan, seq_tup_read, idx_scan
FROM pg_stat_user_tables
ORDER BY seq_tup_read DESC
LIMIT 20;
```

Combine these with the slowest and most frequent queries (`pg_stat_statements`, Query Store, Performance Schema, AWR) to decide which indexes to add—Section 10.15.

---

# A Practical Routine

```text
Continuous    autovacuum / auto-stats enabled and tuned
              monitoring of slow queries and plan regressions
Weekly        statistics freshness check on large, changing tables
Monthly       unused / duplicate index review (with a full cycle of usage data)
              bloat and density check on the largest indexes
As needed     rebuild indexes with low density or heavy bloat, online
After loads   refresh statistics; rebuild indexes disabled for the load
```

Avoid the "rebuild everything nightly" job: it generates huge log volume, invalidates caches, blocks on busy tables, and mostly fixes problems that do not affect performance.

---

# Visual Representation

```text
Index health dashboard

Index                          Size    Density  Reads/day  Writes/day  Action
IX_Orders_CustomerID           110 MB  88 %     1.2 M      40 k        ✅ keep
IX_Orders_Status               140 MB  61 %     0          40 k        🗑 drop candidate
IX_Orders_Customer_Date        160 MB  90 %     900 k      40 k        ✅ keep
IX_Customers_Email             60 MB   48 %     300 k      2 k         🔧 rebuild
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← bloated or low-density indexes make scans here read more pages
2. JOIN
3. WHERE       ← seeks are barely affected by fragmentation
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY    ← ordered range scans suffer most from logical fragmentation
9. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
REINDEX INDEX CONCURRENTLY ix_orders_customerid        (PostgreSQL 12+)

1. Create a new, invalid index with the same definition
2. Build it concurrently (like CREATE INDEX CONCURRENTLY)
3. Catch up with changes made during the build
4. Swap names: new index becomes ix_orders_customerid
5. Mark old index invalid, wait for readers, drop it

Space needed: old index + new index during the operation
```

---

# 🔬 Engine Deep Dive

B-tree implementations reduce the need for manual maintenance. PostgreSQL 13+ **deduplicates** entries and 14+ performs **bottom-up index deletion**, removing dead duplicates before splitting a page; InnoDB **merges** pages whose fill drops below a threshold (`MERGE_THRESHOLD`, default 50%); SQL Server's ghost cleanup removes deleted records in the background. These features are why fixed "rebuild at 30% fragmentation" rules from the 2000s no longer fit modern systems.

---

# 🏗️ Architecture Insight

Index maintenance is operations work that design can reduce: increasing keys avoid mid-index splits, partial indexes keep hot indexes small, partitioning lets old partitions be rebuilt or archived independently, and short transactions keep MVCC cleanup effective. A schema designed with these in mind needs little routine maintenance.

---

# ⚡ Performance Tip

On PostgreSQL, the single most common "index problem" in production is bloat caused by a long-running or idle-in-transaction session blocking VACUUM. Monitor `pg_stat_activity` for old `xact_start` values before reaching for `REINDEX`.

---

# 🔒 Security Note

Maintenance jobs usually run with elevated privileges. Keep them in version-controlled scripts, avoid dynamic SQL built from catalog names without quoting (`quote_ident`, `QUOTENAME`), and log what each run changed.

---

# SQL Standard vs Vendor Differences

| Feature | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|---------|-----------|-------|-----------|--------|--------|
| Online rebuild | `REINDEX CONCURRENTLY` (12+) | Online `ALTER TABLE … FORCE` | `REBUILD WITH (ONLINE = ON)` (EE) | `REBUILD ONLINE` (EE) | ❌ |
| Lightweight defragment | `VACUUM` | Page merging | `REORGANIZE` | `COALESCE` / `SHRINK SPACE` | `VACUUM` |
| Physical stats | `pgstatindex` | `information_schema`, `innodb_index_stats` | `dm_db_index_physical_stats` | `INDEX_STATS` | `dbstat` virtual table |
| Usage stats | `pg_stat_user_indexes` | `sys.schema_unused_indexes` | `dm_db_index_usage_stats` | Index monitoring / `DBA_INDEX_USAGE` | ❌ |
| Missing-index hints | ❌ (extensions) | ❌ | `dm_db_missing_index_*` | SQL Tuning Advisor | ❌ |

> **Portability Tip:** The maintenance concepts are shared; tooling is entirely engine-specific. Keep a small, tested script per engine rather than a generic "maintenance plan".

---

# Common Mistakes

### Mistake 1

Rebuilding every index every night regardless of need.

---

### Mistake 2

Chasing "fragmentation percent" on small indexes that fit in memory.

---

### Mistake 3

Dropping an "unused" index based on a week of statistics, before month-end jobs run.

---

### Mistake 4

Ignoring long-running transactions that block VACUUM and cause bloat.

---

### Mistake 5

Applying missing-index suggestions without consolidating them.

---

# Best Practices

✔ Measure density and size, not only fragmentation percent.

✔ Rebuild selectively and online.

✔ Review unused and duplicate indexes regularly, over a full business cycle.

✔ Tune autovacuum / auto-statistics for large, busy tables.

✔ Use fill factors below 100 only where splits are measured.

---

# Interview Questions

## Basic

1. What is index fragmentation?
2. What is the difference between rebuilding and reorganising an index?
3. How do you find indexes that are never used?

## Intermediate

4. What is fill factor, and when would you lower it?
5. Why does fragmentation matter less on SSDs?
6. What is index bloat in PostgreSQL, and what causes it?

## Advanced

7. Why can a long-running transaction make indexes grow?
8. What must you check before dropping an index with zero recorded reads?
9. How do modern B-tree features reduce the need for rebuilds?

---

# Hands-on Exercises

## Exercise 1

Measure the density of an index, delete 50% of the table's rows randomly, measure again, then rebuild and measure a third time.

---

## Exercise 2

List all indexes with zero scans on your database, with their sizes.

---

## Exercise 3

Find duplicate and leading-prefix-redundant indexes in a schema.

---

## Exercise 4

On PostgreSQL, open a transaction and leave it idle while updating a table in another session; observe VACUUM's inability to clean up.

---

# Related Topics

- **10.02 — How B-Tree Indexes Work**
- **10.03 — Creating and Managing Indexes**
- **10.13 — The Cost of Indexes (Writes, Storage and Locking)**
- **10.15 — Index Design Strategy**

---

# Summary

Indexes degrade through low page density, logical fragmentation and, in MVCC engines, bloat from dead entries. On modern storage, density and size matter more than physical order, so rebuild selectively—online, based on measurements—rather than on a nightly schedule. Fill factors below 100 help only indexes with mid-range inserts. Keep VACUUM and statistics current, watch for long-running transactions, and review usage statistics over a full business cycle to drop unused and duplicate indexes and to find the missing ones worth adding.
