---
title: "10.13 - The Cost of Indexes (Writes, Storage and Locking)"
description: "What every index costs: extra work on INSERT, UPDATE and DELETE, write amplification and WAL/redo volume, page splits, storage and memory footprint, backup and replication overhead, lock contention and hot spots, bulk-load strategies, and how to budget indexes for write-heavy tables."
chapter: 10
section: 10.13
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 30 min
lastUpdated: 2026-09-25
---

# 10.13 The Cost of Indexes (Writes, Storage and Locking)

---

# Learning Objectives

After completing this section, you will be able to:

- Quantify the extra work each index adds to inserts, updates and deletes.
- Explain write amplification and its effect on logs, replication and backups.
- Estimate index storage and memory footprint.
- Recognise index-related lock contention and hot spots.
- Load large volumes of data efficiently despite indexes.
- Decide how many indexes a write-heavy table can afford.

---

# Every Write Pays for Every Index

```text
INSERT one row into Orders with a primary key and 5 secondary indexes

1 × table / clustered index write
5 × secondary index insert   (descend tree, maybe split a page)
6 × log (WAL / redo) records
6 × pages dirtied in the buffer cache, later written to disk
```

| Operation | Index work |
|-----------|-----------|
| `INSERT` | Insert an entry into **every** index |
| `DELETE` | Remove (or mark) an entry in **every** index |
| `UPDATE` of indexed column | Delete + insert in each index containing that column |
| `UPDATE` of non-indexed column | Usually none (PostgreSQL HOT, in-place updates elsewhere) |
| `UPDATE` of clustering key | Moves the row; updates **every** secondary index (clustered engines) |

Five secondary indexes can make inserts several times slower than on an unindexed table—often acceptable, but never free.

---

# Write Amplification

One logical change produces many physical writes:

```text
Logical:   1 row, ~120 bytes

Physical:  table page (8 KB) dirtied
           5 index leaf pages (8 KB each) dirtied, maybe split
           WAL/redo records for each change (+ full-page images after checkpoints)
           replicated to every replica, which repeats the same index work
           included in every backup and archive
```

On heavily written tables, secondary indexes often account for most of the log volume and I/O. That shows up as replication lag, larger backups and slower recovery—not just slower inserts.

---

# Page Splits and Random Inserts

Indexes on columns whose new values are **random** (UUIDv4, hashes, e-mail addresses, customer IDs in a busy order table) receive inserts everywhere:

```text
Increasing key (OrderID, CreatedAt)       Random key (UUIDv4, Email)
inserts land in the rightmost leaf         inserts land anywhere
leaf stays in cache                        the whole index must be cached
pages fill to ~100%                        pages split, average fill ~70%
```

Once an index with random inserts no longer fits in memory, each insert may require a disk read to fetch the leaf it belongs to—often the moment a system's insert throughput collapses.

---

# Storage and Memory Footprint

```text
Approximate B-tree size ≈ rows × (key bytes + locator bytes + per-entry overhead) / fill factor

Orders: 5 000 000 rows
  IX (CustomerID)                        ≈ 5 M × (4 + 6 + 8) / 0.9    ≈ 100 MB
  IX (CustomerID, OrderDate) INCLUDE(…)  ≈ 5 M × (4 + 4 + 8 + 6 + 8)  ≈ 170 MB
  IX (Email VARCHAR(255)) on Customers   depends on average length, not declared length
```

Indexes compete with tables for the buffer cache. A table with indexes totalling three times its own size needs far more memory to keep its working set cached.

```sql
-- PostgreSQL: index sizes
SELECT indexrelname, pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes WHERE relname = 'orders';

-- SQL Server
SELECT i.name, SUM(ps.used_page_count) * 8 / 1024 AS SizeMB
FROM sys.dm_db_partition_stats ps
JOIN sys.indexes i ON i.object_id = ps.object_id AND i.index_id = ps.index_id
WHERE ps.object_id = OBJECT_ID('dbo.Orders')
GROUP BY i.name;

-- MySQL
SELECT index_name, ROUND(stat_value * @@innodb_page_size / 1024 / 1024) AS SizeMB
FROM mysql.innodb_index_stats
WHERE table_name = 'Orders' AND stat_name = 'size';
```

---

# Locking and Contention

Indexes are shared structures; concurrent writers touch the same pages.

- **Hot spot on the rightmost leaf:** many sessions inserting increasing keys contend for the last page (SQL Server's *last page insert contention*; mitigated by `OPTIMIZE_FOR_SEQUENTIAL_KEY` in 2019+, hash partitioning, or reverse-key indexes in Oracle).
- **Unique checks:** inserting a key that an uncommitted transaction also inserted makes the second session wait (Section 10.07).
- **Gap and next-key locks:** under `REPEATABLE READ` / `SERIALIZABLE`, InnoDB and SQL Server lock index ranges to prevent phantoms; more indexes mean more ranges locked by the same statement and more deadlock opportunities.
- **Missing indexes cause more locking, too:** an `UPDATE … WHERE CustomerID = 42` without an index scans and may lock far more rows than it changes.

So indexes both add contention (on writes) and reduce it (by narrowing what statements touch).

---

# Bulk Loading

For large loads into a table:

```text
Strategy                                         When
───────────────────────────────────────────────  ─────────────────────────────────
Drop / disable secondary indexes, load,          Initial loads, full reloads,
rebuild indexes afterwards                        nightly warehouse loads
Load into a staging table, then INSERT … SELECT  Incremental loads with transformation
Load in key order                                 Clustered tables (avoids splits)
Use the bulk path (COPY, BULK INSERT, LOAD DATA,  Always
SQL*Loader direct path)
Refresh statistics afterwards                     Always
```

```sql
-- SQL Server: disable nonclustered indexes during a load, then rebuild
ALTER INDEX IX_Orders_CustomerID ON dbo.Orders DISABLE;
-- … BULK INSERT …
ALTER INDEX IX_Orders_CustomerID ON dbo.Orders REBUILD;
```

Never disable the clustered index or the indexes enforcing constraints you rely on during the load.

---

# How Many Indexes?

There is no universal number, but useful guidance by workload:

| Table profile | Typical secondary index budget |
|---------------|-------------------------------|
| High-rate insert log / events | 0–2 |
| OLTP transactional tables (orders, payments) | 3–6 |
| Read-mostly reference / lookup tables | As many as queries need |
| Reporting replicas / warehouses | Many, or columnstore instead |

Every index on a write-heavy table should name the query it serves and be revisited if that query changes.

---

# Measuring the Cost

```sql
-- Compare insert throughput with and without an index (PostgreSQL example)
\timing on
INSERT INTO OrdersCopy SELECT * FROM Orders;           -- no secondary indexes
TRUNCATE OrdersCopy;
CREATE INDEX ON OrdersCopy (CustomerID);
CREATE INDEX ON OrdersCopy (Status, OrderDate);
CREATE INDEX ON OrdersCopy (OrderDate);
INSERT INTO OrdersCopy SELECT * FROM Orders;           -- three secondary indexes
```

Also compare WAL generated (`pg_current_wal_lsn()` before and after), transaction log growth, or `Handler_write` counters, depending on the engine.

---

# Visual Representation

```text
Read latency  ▲                                 Write latency ▲
              │ ●                                              │                      ●
              │   ●                                            │                 ●
              │     ●                                          │            ●
              │       ● ● ● ● ●                                │       ●
              │                                                │  ●
              └──────────────────→ indexes                     └──────────────────→ indexes
      reads improve, then plateau                       writes degrade steadily
```

---

# 📍 Execution Order Reminder

For writes, the relevant order is the statement's own:

```text
1. FROM        ← locate target rows (indexes help UPDATE/DELETE find them)
2. WHERE       ← narrow target rows; missing indexes mean scanning and over-locking
3. SET         ← compute new values
4. WRITE       ← table + every affected index + log records
5. CONSTRAINTS ← unique / foreign key checks via indexes
6. COMMIT      ← log flushed; replicas replay the same index work
```

---

# How the DBMS Executes This

```text
UPDATE Orders SET Status = 'Shipped' WHERE OrderID = 101

1. Seek PK to OrderID 101                          (index helps find the row)
2. Write new row version / update in place
3. For each index containing Status:
       delete old entry ('Pending', …)
       insert new entry ('Shipped', …)
4. Indexes without Status: untouched (PostgreSQL: only if HOT update possible)
5. Log records for every page changed
```

---

# 🔬 Engine Deep Dive

PostgreSQL's MVCC writes a new row version on every update. If no indexed column changes and the page has free space, a **HOT** (heap-only tuple) update avoids touching any index. Adding an index on a frequently updated column (say, `LastSeenAt`) disables HOT for those updates and can multiply write I/O on the table—one of the least obvious costs of an index. A lower table `fillfactor` leaves room on pages for HOT updates.

---

# 🏗️ Architecture Insight

Read-optimised and write-optimised index sets conflict. Mature systems often separate them: a lean OLTP primary with only the indexes transactions need, and read replicas, a reporting database or a columnstore with the indexes analytics need. The same data, physically designed twice.

---

# ⚡ Performance Tip

Before adding an index to a write-heavy table, check whether an existing index can be extended (add a column or `INCLUDE`) to serve the new query. One slightly wider index costs far less than one more index.

---

# 🔒 Security Note

Heavy index maintenance is a denial-of-service lever: a user able to create indexes, or to trigger mass updates of indexed columns, can degrade the whole database. Restrict index creation to migrations and administrators.

---

# SQL Standard vs Vendor Differences

| Feature | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|---------|-----------|-------|-----------|--------|--------|
| Updates skipping indexes | HOT (no indexed column changed) | In-place if no key change | In-place if no key change | In-place | In-place |
| Change buffering for secondary indexes | ❌ | Change buffer (off by default in 8.4) | ❌ | ❌ | ❌ |
| Last-page contention mitigation | n/a | n/a | `OPTIMIZE_FOR_SEQUENTIAL_KEY` | Reverse-key / hash-partitioned indexes | n/a |
| Disable index for load | Drop / recreate | Drop / recreate | `ALTER INDEX … DISABLE` | `UNUSABLE` + `REBUILD` | Drop / recreate |
| Bulk load path | `COPY` | `LOAD DATA` | `BULK INSERT` / `bcp` | SQL*Loader / direct path | `.import` / transactions |

> **Portability Tip:** The costs are universal; mitigations are engine-specific. Measure on your engine with realistic write rates before settling on an index set.

---

# Common Mistakes

### Mistake 1

Adding indexes to a write-heavy table without measuring insert and update cost.

---

### Mistake 2

Indexing a frequently updated column (and, on PostgreSQL, disabling HOT updates).

---

### Mistake 3

Loading millions of rows into a fully indexed table row by row.

---

### Mistake 4

Using random keys on large, insert-heavy indexes that no longer fit in memory.

---

### Mistake 5

Forgetting that replicas and backups pay for every index too.

---

# Best Practices

✔ Give every index on a write-heavy table a documented purpose.

✔ Extend existing indexes before adding new ones.

✔ Avoid indexing columns that change constantly unless queries need it.

✔ Load in bulk, with secondary indexes created or rebuilt afterwards.

✔ Measure write latency, log volume and index size when adding indexes.

---

# Interview Questions

## Basic

1. Why do indexes slow down inserts?
2. Which kinds of `UPDATE` require index maintenance?
3. Why are indexes often created after a bulk load?

## Intermediate

4. What is write amplification?
5. Why do random keys hurt insert performance as a table grows?
6. How can a missing index increase locking?

## Advanced

7. What is last-page insert contention and how is it mitigated?
8. How can a new index reduce PostgreSQL's HOT updates?
9. How would you decide the index budget for an events table receiving 10 000 inserts per second?

---

# Hands-on Exercises

## Exercise 1

Measure insert time for 1 million rows into `Orders` with 0, 2 and 5 secondary indexes.

---

## Exercise 2

Measure log (WAL / transaction log) volume for the same inserts.

---

## Exercise 3

List the indexes on a table with their sizes, and compare the total with the table size.

---

## Exercise 4

On PostgreSQL, update a non-indexed column 100 000 times and check `n_tup_hot_upd` in `pg_stat_user_tables`; then index the column and repeat.

---

# Related Topics

- **10.02 — How B-Tree Indexes Work**
- **10.04 — Clustered and Nonclustered Indexes**
- **10.14 — Index Maintenance (Fragmentation, Rebuilds and Monitoring)**
- **10.15 — Index Design Strategy**
- **04.12 — Transaction Control Language (TCL) Deep Dive**

---

# Summary

Every index is maintained on every insert and delete and on every update of its columns, multiplying page writes, log volume, replication traffic and backup size. Random keys add page splits and cache pressure; increasing keys add last-page contention; unique and range locks add waiting. Indexes also occupy disk and buffer memory in proportion to their width. Budget indexes by workload—few on write-heavy tables, more on read-mostly ones—extend existing indexes before adding new ones, avoid indexing constantly changing columns, bulk-load with indexes built afterwards, and measure the write-side cost alongside the read-side gain.
