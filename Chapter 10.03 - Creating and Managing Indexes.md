---
title: "10.03 - Creating and Managing Indexes"
description: "Index DDL on every major engine: CREATE INDEX options, naming conventions, listing indexes, renaming, disabling and invisible indexes, dropping, online and concurrent builds, and the operational side of changing indexes on live tables."
chapter: 10
section: 10.03
category: Data Query Language (DQL)
difficulty: Beginner → Intermediate
readingTime: 30 min
lastUpdated: 2026-09-25
---

# 10.03 Creating and Managing Indexes

---

# Learning Objectives

After completing this section, you will be able to:

- Create indexes with the portable core syntax and common options.
- Name indexes consistently.
- List the indexes on a table on each major engine.
- Rename, disable or hide, rebuild and drop indexes.
- Build indexes online without blocking writes.
- Plan index changes on large production tables.

---

# CREATE INDEX

```sql
CREATE [UNIQUE] INDEX index_name
ON table_name (column [ASC | DESC] [, ...]);
```

```sql
CREATE INDEX IX_Orders_CustomerID ON Orders (CustomerID);

CREATE INDEX IX_Orders_Status_OrderDate ON Orders (Status, OrderDate DESC);

CREATE UNIQUE INDEX UX_Customers_Email ON Customers (Email);
```

Engine-specific options extend this core:

```sql
-- PostgreSQL: method, included columns, partial, concurrent build
CREATE INDEX CONCURRENTLY IX_Orders_Pending
ON Orders USING btree (CustomerID) INCLUDE (TotalAmount)
WHERE Status = 'Pending';

-- SQL Server: nonclustered, included columns, filter, online, fill factor
CREATE NONCLUSTERED INDEX IX_Orders_Pending
ON dbo.Orders (CustomerID) INCLUDE (TotalAmount)
WHERE Status = 'Pending'
WITH (ONLINE = ON, FILLFACTOR = 90);

-- MySQL: algorithm and lock clauses for online DDL
CREATE INDEX IX_Orders_CustomerID ON Orders (CustomerID) ALGORITHM = INPLACE LOCK = NONE;

-- Oracle: tablespace, online build
CREATE INDEX IX_Orders_CustomerID ON Orders (CustomerID) TABLESPACE idx_ts ONLINE;
```

---

# Indexes Created by Constraints

```sql
ALTER TABLE Customers ADD CONSTRAINT UQ_Customers_Email UNIQUE (Email);
ALTER TABLE Orders    ADD CONSTRAINT PK_Orders PRIMARY KEY (OrderID);
```

Each creates a unique index behind the scenes, usually named after the constraint. Such indexes are managed through the constraint: to drop them, drop the constraint.

---

# Naming Conventions

| Prefix | Meaning | Example |
|--------|---------|---------|
| `PK_` | Primary key | `PK_Orders` |
| `UX_` / `UQ_` | Unique index / constraint | `UX_Customers_Email` |
| `IX_` | Non-unique index | `IX_Orders_CustomerID_OrderDate` |
| `FX_` / `IX_…_Expr` | Expression index | `IX_Customers_LowerEmail` |
| `FK_` | Foreign key (constraint, not index) | `FK_Orders_Customers` |

Listing the key columns in the name makes duplicates and overlaps visible at a glance. Keep names under the engine's identifier limit (63 bytes in PostgreSQL, 64 characters in MySQL, 128 in SQL Server and Oracle 12.2+).

In PostgreSQL and SQLite, index names must be unique within the schema; in MySQL and SQL Server, within the table.

---

# Listing Indexes

```sql
-- PostgreSQL
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'orders';

-- MySQL
SHOW INDEX FROM Orders;

-- SQL Server
SELECT i.name, i.type_desc, i.is_unique
FROM sys.indexes AS i
WHERE i.object_id = OBJECT_ID('dbo.Orders');

-- Oracle
SELECT index_name, column_name, column_position
FROM user_ind_columns WHERE table_name = 'ORDERS'
ORDER BY index_name, column_position;

-- SQLite
PRAGMA index_list('Orders');
PRAGMA index_info('IX_Orders_CustomerID');
```

---

# Renaming

```sql
ALTER INDEX IX_Orders_Cust RENAME TO IX_Orders_CustomerID;       -- PostgreSQL, Oracle
ALTER TABLE Orders RENAME INDEX IX_Orders_Cust TO IX_Orders_CustomerID;  -- MySQL
EXEC sp_rename 'dbo.Orders.IX_Orders_Cust', 'IX_Orders_CustomerID', 'INDEX';  -- SQL Server
-- SQLite: drop and recreate
```

---

# Disabling and Invisible Indexes

Before dropping an index you suspect is unused, you can make the optimizer ignore it while it is still maintained—so it can be restored instantly if something slows down.

```sql
-- MySQL 8.0+
ALTER TABLE Orders ALTER INDEX IX_Orders_Status INVISIBLE;
ALTER TABLE Orders ALTER INDEX IX_Orders_Status VISIBLE;

-- Oracle 11g+
ALTER INDEX IX_Orders_Status INVISIBLE;
ALTER INDEX IX_Orders_Status VISIBLE;

-- SQL Server: DISABLE drops the index data; REBUILD re-creates it
ALTER INDEX IX_Orders_Status ON dbo.Orders DISABLE;
ALTER INDEX IX_Orders_Status ON dbo.Orders REBUILD;
```

PostgreSQL has no invisible indexes in core; the usual approach is to test in a transaction (`BEGIN; DROP INDEX …; EXPLAIN …; ROLLBACK;`) or use the `hypopg` extension for hypothetical indexes.

Note that disabling a **clustered** index in SQL Server makes the whole table inaccessible.

---

# Rebuilding

```sql
REINDEX INDEX CONCURRENTLY IX_Orders_CustomerID;            -- PostgreSQL 12+
ALTER INDEX IX_Orders_CustomerID ON dbo.Orders REBUILD WITH (ONLINE = ON);  -- SQL Server
ALTER INDEX IX_Orders_CustomerID REBUILD ONLINE;            -- Oracle
OPTIMIZE TABLE Orders;                                      -- MySQL (rebuilds table and indexes)
REINDEX IX_Orders_CustomerID;                               -- SQLite
```

When and why to rebuild is covered in Section 10.14.

---

# Dropping

```sql
DROP INDEX IX_Orders_Status;                          -- PostgreSQL, Oracle, SQLite
DROP INDEX CONCURRENTLY IX_Orders_Status;             -- PostgreSQL, no blocking
DROP INDEX IX_Orders_Status ON Orders;                -- MySQL, SQL Server
DROP INDEX IF EXISTS IX_Orders_Status;                -- PostgreSQL, SQLite (MySQL/SQL Server add ON table)
```

Dropping an index is fast, but a query plan that depended on it can become dramatically slower the moment it is gone—hence invisible indexes and careful usage checks first (Section 10.14).

---

# Online Index Builds

A plain `CREATE INDEX` must read the whole table and, on most engines, blocks writes while it runs.

```text
Plain build                         Online / concurrent build
────────────────────────────        ──────────────────────────────────────
Lock: writes blocked                Writes continue
Time: fastest                       Time: slower (extra passes)
Failure: nothing left behind        Failure: may leave an INVALID index (PostgreSQL)
Use: empty tables, maintenance      Use: production tables
     windows
```

| Engine | Online option | Notes |
|--------|---------------|-------|
| PostgreSQL | `CREATE INDEX CONCURRENTLY` | Two table scans; cannot run inside a transaction block; check for `INVALID` indexes after failure |
| MySQL | `ALGORITHM=INPLACE, LOCK=NONE` | Default for secondary indexes in 5.6+; brief metadata locks at start and end |
| SQL Server | `WITH (ONLINE = ON)` | Enterprise edition (and Azure SQL); `RESUMABLE = ON` in 2017+ |
| Oracle | `ONLINE` | Enterprise edition |
| SQLite | — | Database-level write lock for the duration |

Even online builds take short exclusive locks at the start or end; on a table with long-running transactions they can wait—and make everyone queue behind them. Set a lock timeout.

---

# A Production Checklist

```text
1. Identify the query the index serves; capture its current plan and timing.
2. Check for existing indexes that already cover it (or could be extended).
3. Estimate index size and build time on a copy of production data.
4. Build online, with a lock timeout, outside peak hours.
5. Verify the plan uses the index and timing improved.
6. Watch write latency and index usage over the following days.
7. Record the index and its purpose in the schema documentation / migration.
```

---

# Visual Representation

```text
       create                    use                     retire
   ┌────────────┐          ┌─────────────┐         ┌──────────────┐
   │ CREATE     │ ───────→ │ monitor     │ ──────→ │ INVISIBLE /  │ ──→ DROP
   │ (online)   │          │ usage stats │         │ disable      │
   └────────────┘          └──────┬──────┘         └──────────────┘
                                  │
                                  ▼
                           REBUILD / REINDEX (when needed)
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← only indexes that exist and are visible/valid are candidate access paths
2. JOIN
3. WHERE
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

Index DDL never changes query results—only which access paths the optimizer can choose at step 1.

---

# How the DBMS Executes This

```text
CREATE INDEX IX_Orders_CustomerID ON Orders (CustomerID)

1. Take a lock on Orders (mode depends on online option)
2. Scan the table, extract (CustomerID, row locator) for every row
3. Sort the extracted entries (in memory or with temporary files)
4. Build leaf pages bottom-up, then branch pages and root
5. (Online) apply changes made to the table during the build
6. Record the index in the catalog; invalidate cached plans for Orders
```

Building bottom-up from sorted data is much faster than inserting rows one at a time, and produces full, well-ordered pages.

---

# 🔬 Engine Deep Dive

PostgreSQL's `CREATE INDEX CONCURRENTLY` registers the index as not yet valid, waits for existing transactions that could modify the table, scans the table once to build the index, waits again, then scans to add rows changed meanwhile, and finally marks the index valid. If any step fails, the index remains with `indisvalid = false`: it is maintained on writes but never used for reads, and must be dropped and retried.

---

# 🏗️ Architecture Insight

Treat index DDL as schema migrations: versioned, reviewed and deployed like code. An index created by hand in production and never recorded will be missing in the next environment, and nobody will remember which query needed it.

---

# ⚡ Performance Tip

When loading a large amount of data into a new or empty table, create secondary indexes **after** the load. Building an index once from sorted data is far cheaper than updating it for every inserted row.

---

# 🔒 Security Note

On PostgreSQL, only the table owner (or a superuser) can create indexes; on SQL Server, `ALTER` on the table is required; on MySQL, the `INDEX` privilege; on Oracle, table ownership or `CREATE ANY INDEX`. `CREATE ANY INDEX` is powerful—indexes can be created on other schemas' tables—and should be granted rarely.

---

# SQL Standard vs Vendor Differences

| Feature | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|---------|-----------|-------|-----------|--------|--------|
| `CREATE INDEX … ON t (cols)` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `DROP INDEX` syntax | `DROP INDEX name` | `DROP INDEX name ON t` | `DROP INDEX name ON t` | `DROP INDEX name` | `DROP INDEX name` |
| `IF [NOT] EXISTS` | ✅ | ❌ on `CREATE INDEX` | ✅ `DROP … IF EXISTS` (2016+) | ✅ (23ai+) | ✅ |
| Invisible index | ❌ (extension) | ✅ (8.0+) | Disable only | ✅ (11g+) | ❌ |
| Online build | `CONCURRENTLY` | Online DDL | `ONLINE = ON` | `ONLINE` | ❌ |
| Rebuild | `REINDEX` | `OPTIMIZE` / `ALTER TABLE … FORCE` | `ALTER INDEX … REBUILD` | `ALTER INDEX … REBUILD` | `REINDEX` |

> **Portability Tip:** Keep index DDL in engine-specific migration files. The `CREATE INDEX` core is portable; online options, `INCLUDE`, filters and storage clauses are not.

---

# Common Mistakes

### Mistake 1

Creating a large index without the online option during business hours.

---

### Mistake 2

Leaving an `INVALID` index behind after a failed `CREATE INDEX CONCURRENTLY`.

---

### Mistake 3

Dropping an index without first checking whether any query depends on it.

---

### Mistake 4

Creating indexes by hand in production without a migration.

---

### Mistake 5

Loading data into a table with many indexes instead of creating the indexes afterwards.

---

# Best Practices

✔ Use a naming convention that lists the key columns.

✔ Build and drop indexes online in production, with a lock timeout.

✔ Hide or disable an index before dropping it, where the engine allows.

✔ Keep index DDL in versioned migrations.

✔ Create secondary indexes after bulk loads.

---

# Interview Questions

## Basic

1. How do you create an index on two columns?
2. How do you list the indexes of a table on your engine?
3. How do you drop an index on MySQL and on PostgreSQL?

## Intermediate

4. What is an invisible index and why is it useful?
5. What does `CREATE INDEX CONCURRENTLY` do differently?
6. Why should indexes be created after a bulk load?

## Advanced

7. What can go wrong with an online index build on a table with long-running transactions?
8. What happens if a concurrent index build fails in PostgreSQL?
9. How is building an index from sorted data different from inserting rows into it?

---

# Hands-on Exercises

## Exercise 1

Create `IX_Orders_Status_OrderDate` and list it with your engine's catalog query.

---

## Exercise 2

Make the index invisible (or disable it), confirm with `EXPLAIN` that a query no longer uses it, and restore it.

---

## Exercise 3

Build the same index on a 5-million-row table with and without the online option while another session inserts rows. Observe blocking.

---

## Exercise 4

Write a migration that creates an index online and a matching rollback that drops it.

---

# Related Topics

- **10.01 — Introduction to Indexes**
- **10.07 — Unique Indexes and Constraints**
- **10.14 — Index Maintenance (Fragmentation, Rebuilds and Monitoring)**
- **04.08 — Data Definition Language (DDL) Deep Dive**
- **04.16 — SQL Naming Conventions and Coding Standards**

---

# Summary

`CREATE [UNIQUE] INDEX name ON table (columns)` is the portable core; methods, included columns, filters, fill factors and online options are engine-specific. Primary key and unique constraints create their own indexes. Name indexes after their table and key columns, list them through each engine's catalog, and rename, hide or disable them with vendor syntax. On production tables, build and drop indexes online with a lock timeout, verify the plan before and after, create secondary indexes after bulk loads, and keep every index change in a versioned migration.
