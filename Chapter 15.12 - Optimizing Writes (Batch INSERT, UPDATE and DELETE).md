---
title: "15.12 - Optimizing Writes (Batch INSERT, UPDATE and DELETE)"
description: "Making data modification fast and safe: the cost of indexes, constraints and triggers on writes, multi-row inserts and bulk loading (COPY, BULK INSERT, LOAD DATA, SQL*Loader), commit frequency and transaction size, batching large UPDATE and DELETE statements, set-based updates instead of row-by-row loops, upserts with MERGE and ON CONFLICT, avoiding no-op updates, minimal logging and index rebuilds around bulk loads, partition-based deletes, and write amplification in MVCC engines."
chapter: 15
section: 15.12
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 15.12 Optimizing Writes (Batch INSERT, UPDATE and DELETE)

---

# Learning Objectives

After completing this section, you will be able to:

- Explain what a single-row write actually costs.
- Load data quickly with multi-row inserts and bulk-load tools.
- Batch large updates and deletes to control locks and log growth.
- Replace row-by-row loops with set-based statements and upserts.
- Plan bulk loads around indexes, constraints and partitions.

---

# What a Write Costs

```text
INSERT one row into Orders:
  write the table row (heap / clustered index)
  + one entry in EACH secondary index (6 indexes → 6 more writes)
  + check constraints, foreign keys (a lookup in Customers per row)
  + fire triggers
  + write the transaction log / WAL / redo
  + (on commit) flush the log to durable storage
```

Every index speeds up some reads and slows down every write (Section 10.13). On write-heavy tables, unused indexes are pure cost.

---

# Multi-Row Inserts

```sql
-- ❌ One statement (and often one transaction and one round trip) per row
INSERT INTO OrderItems (OrderItemID, OrderID, ProductID, Quantity, UnitPrice) VALUES (1, 101, 5, 2, 9.99);
INSERT INTO OrderItems (OrderItemID, OrderID, ProductID, Quantity, UnitPrice) VALUES (2, 101, 7, 1, 19.99);
…

-- ✅ One statement, many rows
INSERT INTO OrderItems (OrderItemID, OrderID, ProductID, Quantity, UnitPrice) VALUES
    (1, 101, 5, 2, 9.99),
    (2, 101, 7, 1, 19.99),
    (3, 102, 5, 4, 9.99);
```

Batches of hundreds to a few thousand rows per statement typically give most of the gain. Engines limit statement size (SQL Server: 1,000 rows per `VALUES` list and 2,100 parameters per request; MySQL: `max_allowed_packet`), so very large loads use bulk tools.

---

# Commit Frequency

```text
autocommit, one row per transaction   → one durable log flush per row (slow: thousands/sec at best)
one huge transaction for 50M rows     → huge log, long locks, long rollback on failure, replication lag
batches of 1,000–50,000 rows          → few flushes, bounded log and locks, restartable
```

---

# Bulk Loading

| Engine | Bulk tool | Notes |
|--------|-----------|-------|
| PostgreSQL | `COPY … FROM` / `\copy` | Much faster than `INSERT`; binary format available |
| MySQL | `LOAD DATA [LOCAL] INFILE` | Much faster than `INSERT`; disable unique/foreign key checks only for trusted data |
| SQL Server | `BULK INSERT`, `bcp`, `SqlBulkCopy` | Minimal logging possible (simple/bulk-logged recovery, `TABLOCK`) |
| Oracle | SQL*Loader direct path, `INSERT /*+ APPEND */`, external tables | Direct-path writes above the high-water mark |
| SQLite | One transaction around many inserts; `PRAGMA journal_mode = WAL` | Thousands of times faster than autocommit inserts |

For large initial loads into empty tables:

```text
1. load into a table without secondary indexes (or drop/disable them)
2. build indexes afterwards (one sorted build is cheaper than millions of incremental inserts)
3. add or validate constraints
4. refresh statistics
```

For ongoing loads into big tables, load into a **staging table**, validate and transform there (Section 12.08), then insert set-based into the target—or switch in a whole partition.

---

# Batching Large UPDATE and DELETE

```sql
-- ❌ One statement touching 20 million rows: huge log, lock escalation, long blocking
DELETE FROM AuditLog WHERE CreatedAt < '2024-01-01';

-- ✅ Batches (SQL Server): repeat until no rows are affected
WHILE 1 = 1
BEGIN
    DELETE TOP (10000) FROM AuditLog WHERE CreatedAt < '2024-01-01';
    IF @@ROWCOUNT = 0 BREAK;
END;

-- PostgreSQL: batch by key ranges (or ctid) in a loop driven by the application or a procedure
DELETE FROM AuditLog
WHERE AuditID IN (SELECT AuditID FROM AuditLog WHERE CreatedAt < '2024-01-01' LIMIT 10000);

-- MySQL
DELETE FROM AuditLog WHERE CreatedAt < '2024-01-01' ORDER BY CreatedAt LIMIT 10000;
```

Each batch should use an index to find its rows (here on `CreatedAt`); otherwise every batch scans the table. Walking a key range (`WHERE AuditID BETWEEN :from AND :to`) avoids re-scanning already-deleted areas.

For time-based retention, **drop or truncate partitions** instead (Section 13.15): removing a month is then a metadata operation.

---

# Set-Based Instead of Row-by-Row

```sql
-- ❌ Cursor / loop: one UPDATE per order
FOR each order IN (SELECT OrderID FROM Orders WHERE Status = 'Pending' AND CreatedAt < …) LOOP
    UPDATE Orders SET Status = 'Expired' WHERE OrderID = order.OrderID;
END LOOP;

-- ✅ One statement
UPDATE Orders SET Status = 'Expired'
WHERE Status = 'Pending' AND CreatedAt < NOW() - INTERVAL '7 days';

-- ✅ Update from another table in one statement (PostgreSQL syntax; see 14.10 for others)
UPDATE Customers AS c
SET LifetimeValue = t.Total
FROM (SELECT CustomerID, SUM(TotalAmount) AS Total FROM Orders GROUP BY CustomerID) AS t
WHERE t.CustomerID = c.CustomerID;
```

---

# Upserts

```sql
-- PostgreSQL / SQLite
INSERT INTO ProductStock (ProductID, Qty) VALUES (7, 5)
ON CONFLICT (ProductID) DO UPDATE SET Qty = ProductStock.Qty + EXCLUDED.Qty;

-- MySQL
INSERT INTO ProductStock (ProductID, Qty) VALUES (7, 5)
ON DUPLICATE KEY UPDATE Qty = Qty + VALUES(Qty);          -- 8.0.20+: alias syntax preferred

-- SQL Server / Oracle / PostgreSQL 15+
MERGE INTO ProductStock AS t
USING (SELECT 7 AS ProductID, 5 AS Qty) AS s ON t.ProductID = s.ProductID
WHEN MATCHED THEN UPDATE SET Qty = t.Qty + s.Qty
WHEN NOT MATCHED THEN INSERT (ProductID, Qty) VALUES (s.ProductID, s.Qty);
```

Upsert a whole batch from a staging table in one statement rather than row by row. On SQL Server, `MERGE` under concurrency needs `HOLDLOCK` (or serializable isolation) to avoid duplicate-key races.

---

# Avoid No-Op Updates

```sql
-- ❌ Rewrites every row, even unchanged ones: log, index maintenance, triggers, MVCC versions
UPDATE Customers SET Country = 'IN' WHERE City = 'Mumbai';

-- ✅ Only rows that actually change
UPDATE Customers SET Country = 'IN' WHERE City = 'Mumbai' AND Country IS DISTINCT FROM 'IN';
-- (MySQL: NOT (Country <=> 'IN'); SQL Server 2022+: IS DISTINCT FROM; older: Country <> 'IN' OR Country IS NULL)
```

In MVCC engines (PostgreSQL especially), every updated row creates a new row version, even if the value is the same.

---

# MVCC Write Amplification

- **PostgreSQL**: an `UPDATE` writes a new row version; old versions are removed by `VACUUM`. Updating indexed columns also writes new index entries; updating only non-indexed columns may use HOT (heap-only tuple) updates if the page has room (`fillfactor`). Mass updates bloat tables until vacuumed.
- **MySQL InnoDB / Oracle**: updates in place with undo records; long-running transactions keep undo alive.
- **SQL Server**: updates in place; with snapshot isolation, row versions go to tempdb.

For mass updates, it can be faster to create a new table with `CREATE TABLE … AS SELECT` (transformed data), build indexes, and swap it in.

---

# Visual Representation

```text
   per-row cost ▲
                │ ● autocommit single-row INSERT
                │
                │      ● multi-row INSERT, autocommit per statement
                │
                │            ● batched transactions
                │                   ● COPY / BULK INSERT / LOAD DATA
                │                          ● load without indexes, build afterwards
                └──────────────────────────────────────────────────────▶ rows per operation
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← UPDATE … FROM / DELETE … USING: source rows for the change
2. JOIN        ← join staging to target on indexed keys
3. WHERE       ← find target rows with an index; exclude no-op changes
4. GROUP BY    ← aggregate the source before updating the target
5. HAVING
6. WINDOW      ← ROW_NUMBER to pick one source row per target (avoid multiple matches)
7. SELECT      ← INSERT … SELECT: set-based load from staging
8. DISTINCT
9. ORDER BY    ← batch order (by key or date) for predictable progress
10. LIMIT / FETCH / TOP   ← batch size for large UPDATE/DELETE
```

---

# How the DBMS Executes This

```text
DELETE TOP (10000) FROM AuditLog WHERE CreatedAt < '2024-01-01'
  Index Seek on ix_auditlog_createdat (CreatedAt < '2024-01-01') → Top 10000
    → Clustered Index Delete → Index Delete on each nonclustered index
  log records for 10,000 rows × (1 + number of indexes); locks released at commit
```

---

# 🏗️ Architecture Insight

Design write paths for their volume: append-only event tables with few indexes and partitions for retention; staging tables for bulk ingestion; queues for bursts; and a clear separation between the tables that absorb writes and the rollups that serve reads.

---

# ⚡ Performance Tip

The quickest write optimization is often removing indexes nobody uses. Check index usage statistics (`pg_stat_user_indexes`, `sys.dm_db_index_usage_stats`, `sys.schema_unused_indexes` in MySQL) before adding more.

---

# 🔒 Security Note

Disabling constraints or foreign key checks to speed up loads can let invalid data in. Do it only for trusted sources, re-enable and **validate** afterwards (SQL Server: `WITH CHECK CHECK CONSTRAINT`; Oracle: `ENABLE VALIDATE`), and never leave checks disabled in normal operation.

---

# 🌍 Production Consideration

Large writes affect everyone: log volume can fill disks and delay replicas, locks block readers (on locking engines), and MVCC bloat slows later scans. Throttle batches, monitor replication lag and log usage, and schedule heavy maintenance off-peak.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Multi-row `VALUES` | ✅ | ✅ | ✅ | ✅ (≤ 1000 rows) | ✅ (23ai; older: `INSERT ALL`) | ✅ |
| Bulk load | ❌ | `COPY` | `LOAD DATA` | `BULK INSERT`, `bcp` | SQL*Loader, `APPEND` | Transactions |
| `MERGE` | ✅ | ✅ (15+) | ❌ | ✅ | ✅ | ❌ |
| `ON CONFLICT` / duplicate key | ❌ | ✅ | `ON DUPLICATE KEY UPDATE` | ❌ | ❌ | ✅ |
| `DELETE … LIMIT` | ❌ | ❌ (subquery) | ✅ | `DELETE TOP (n)` | `ROWNUM`/`FETCH` subquery | Compile option |

> **Portability Tip:** Set-based statements, multi-row inserts and batching by key range are portable. Bulk-load tools and upsert syntax are engine-specific.

---

# Common Mistakes

### Mistake 1

Inserting rows one at a time with autocommit.

---

### Mistake 2

Deleting or updating millions of rows in one transaction.

---

### Mistake 3

Row-by-row loops instead of set-based statements.

---

### Mistake 4

Updating rows whose values do not change.

---

### Mistake 5

Batch deletes without an index to find each batch.

---

# Best Practices

✔ Use multi-row inserts and bulk-load tools.

✔ Commit in moderate batches.

✔ Batch large updates and deletes by indexed key or date ranges.

✔ Use set-based updates and upserts from staging tables.

✔ Load before indexing, then index, validate and analyze.

---

# Interview Questions

## Basic

1. Why is inserting one row per transaction slow?
2. How do you bulk load data on your engine?
3. What is an upsert?

## Intermediate

4. Why batch a large `DELETE`?
5. How do indexes affect write performance?
6. What is a no-op update, and why avoid it?

## Advanced

7. How would you delete 500 million old rows from a live table?
8. What is write amplification in PostgreSQL, and how does HOT help?

---

# Hands-on Exercises

## Exercise 1

Insert 100,000 rows with single-row autocommit inserts, with multi-row inserts, and with a bulk-load tool; compare times.

---

## Exercise 2

Delete a year of audit rows in batches, monitoring log growth and blocking.

---

## Exercise 3

Rewrite a cursor-based update as one set-based statement.

---

# Related Topics

- **10.13 — The Cost of Indexes (Writes, Storage and Locking)**
- **14.10 — Data-Modifying CTEs (INSERT, UPDATE and DELETE)**
- **09.11 — Subqueries in INSERT, UPDATE and DELETE**
- **15.13 — Concurrency, Locking and Query Performance**
- **04.09 — Data Manipulation Language (DML) Deep Dive**

---

# Summary

Every row written also writes its indexes, checks constraints, fires triggers and logs the change, so write performance depends on doing that work in bulk: multi-row inserts, bulk-load tools, moderate commit batches, and building indexes after large loads. Large updates and deletes should run in indexed batches (or as partition drops) to bound log growth, locks and replication lag; row-by-row loops should become set-based statements and upserts from staging tables; and no-op updates should be filtered out, especially on MVCC engines where every update creates a new row version.
