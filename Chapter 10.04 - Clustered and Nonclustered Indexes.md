---
title: "10.04 - Clustered and Nonclustered Indexes"
description: "How tables are physically stored: heaps versus clustered indexes and index-organised tables, secondary (nonclustered) indexes and their row locators, key lookups, choosing a clustering key, and how SQL Server, InnoDB, PostgreSQL, Oracle and SQLite differ."
chapter: 10
section: 10.04
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 30 min
lastUpdated: 2026-09-25
---

# 10.04 Clustered and Nonclustered Indexes

---

# Learning Objectives

After completing this section, you will be able to:

- Distinguish a heap table from a clustered (index-organised) table.
- Explain what a nonclustered (secondary) index stores and how it reaches the row.
- Describe the cost of key lookups in each storage model.
- Choose a good clustering key.
- Explain how each major engine stores tables by default.

---

# Two Ways to Store a Table

```text
HEAP                                        CLUSTERED INDEX (index-organised table)
Rows stored wherever there is space         Rows stored IN the leaf pages of a B-tree,
                                            sorted by the clustering key

┌──────────────┐                                         root
│ page 1: 105, │                                           │
│   101, 110   │                                  ┌────────┴────────┐
├──────────────┤                                branch            branch
│ page 2: 102, │                                  │                 │
│   120, 103   │                      ┌───────────┴──┐       ┌──────┴───────┐
└──────────────┘                      │ 101 full row │ ⇄ … ⇄ │ 120 full row │   leaves =
                                      │ 102 full row │       │ …            │   the table
                                      └──────────────┘       └──────────────┘
```

- **Heap:** the table is an unordered collection of pages. All indexes are separate structures pointing into it.
- **Clustered index:** the table *is* a B-tree. Its leaf level holds the complete rows, in key order. There can be only one per table, because rows can only be stored in one order.

---

# Nonclustered (Secondary) Indexes

Every other index is **nonclustered**: a separate B-tree whose leaves hold the index key plus a **row locator**.

```text
Nonclustered index on Orders(CustomerID)

Leaf entry on a HEAP table:            Leaf entry on a CLUSTERED table:
(CustomerID, physical row address)     (CustomerID, clustering key = OrderID)
    42, (page 2, slot 3)                   42, 102
```

| Storage | Row locator in secondary index | Cost to reach the row |
|---------|--------------------------------|-----------------------|
| Heap | Physical address (page + slot) | One page read |
| Clustered | Clustering key value | A second B-tree search |

---

# Key Lookups

When a secondary index does not contain every column the query needs, the engine must go back to the table for each matching row:

```sql
SELECT OrderID, OrderDate, TotalAmount
FROM Orders
WHERE CustomerID = 42;
-- Index IX_Orders_CustomerID has only CustomerID (+ locator)
```

```text
Clustered table (SQL Server, InnoDB)

IX_Orders_CustomerID ── seek 42 ──→ (42, 102), (42, 104), (42, 877)
                                        │         │         │
                                        ▼         ▼         ▼
PK_Orders (clustered) ── seek 102 ── seek 104 ── seek 877 ──→ full rows

SQL Server plan: Index Seek + Key Lookup (Nested Loops)
PostgreSQL / Oracle heap: Index Scan (index + heap fetch) / TABLE ACCESS BY INDEX ROWID
```

Lookups are cheap for a few rows and expensive for many—each is a random read. Covering indexes (Section 10.06) remove them.

---

# Why a Clustering Key Matters

With a clustered table, the clustering key is copied into **every** secondary index entry.

```text
Clustering key: INT (4 bytes)              Clustering key: CHAR(36) GUID + DATE (39 bytes)

Secondary index on CustomerID:             Secondary index on CustomerID:
4 + 4 = 8 bytes per entry                  4 + 39 = 43 bytes per entry

5 indexes × 5 M rows ≈ 200 MB              5 indexes × 5 M rows ≈ 1 GB
```

A good clustering key is:

- **Narrow** — it is repeated in every secondary index.
- **Unique** — otherwise the engine adds a hidden uniquifier.
- **Static** — changing it moves the row and updates every secondary index.
- **Ever-increasing** — new rows append to the end instead of splitting pages in the middle.

An `INT`/`BIGINT` identity primary key satisfies all four, which is why it is the default choice. A time-ordered key (`OrderDate, OrderID`) can be better when most queries read recent ranges—a *range-friendly* clustering key.

---

# Range Queries on the Clustering Key

Because a clustered table is stored in key order, a range on the clustering key reads contiguous pages with no lookups:

```sql
-- If Orders is clustered on OrderID
SELECT * FROM Orders WHERE OrderID BETWEEN 100000 AND 101000;
-- → one seek, then sequential leaf pages holding the complete rows
```

This is the main read advantage of clustering. The same query on a heap using a secondary index needs one random fetch per row, unless the heap happens to be physically ordered.

---

# Engine by Engine

| Engine | Default table storage | Clustering choice |
|--------|----------------------|-------------------|
| SQL Server | Clustered on the primary key (if one is declared), otherwise heap | Any index can be the clustered one: `CREATE CLUSTERED INDEX` |
| MySQL InnoDB | Always clustered on the primary key | PK; else the first `UNIQUE NOT NULL` index; else a hidden 6-byte row ID |
| PostgreSQL | Always heap | `CLUSTER` reorders once; not maintained afterwards |
| Oracle | Heap | `ORGANIZATION INDEX` creates an index-organised table (IOT) |
| SQLite | Clustered on the `rowid` (an `INTEGER PRIMARY KEY` is the rowid) | `WITHOUT ROWID` tables cluster on the declared primary key |

```sql
-- SQL Server: primary key nonclustered, cluster on date
CREATE TABLE Orders (
    OrderID    INT NOT NULL CONSTRAINT PK_Orders PRIMARY KEY NONCLUSTERED,
    OrderDate  DATE NOT NULL,
    ...
);
CREATE CLUSTERED INDEX CX_Orders_OrderDate ON Orders (OrderDate, OrderID);

-- Oracle: index-organised table
CREATE TABLE OrderStatusHistory (
    OrderID   INT,
    ChangedAt TIMESTAMP,
    Status    VARCHAR2(20),
    CONSTRAINT PK_OSH PRIMARY KEY (OrderID, ChangedAt)
) ORGANIZATION INDEX;

-- SQLite: cluster on a composite key
CREATE TABLE OrderStatusHistory (
    OrderID INT, ChangedAt TEXT, Status TEXT,
    PRIMARY KEY (OrderID, ChangedAt)
) WITHOUT ROWID;
```

---

# Heap vs Clustered: Trade-Offs

| | Heap | Clustered |
|---|------|-----------|
| Insert | Fast: any free space | Must go to the right place in key order |
| Range scan on key | Random fetches | Sequential, no lookups |
| Secondary index lookup | One page read | A second B-tree descent |
| Secondary index size | Small locator (6–10 bytes) | Clustering key width |
| Update moving the row | Locator may change (forwarding / HOT) | Only if clustering key changes |
| Full scan | Fast, sequential | Fast, may be less dense after splits |

Neither is universally better. OLTP tables with an identity key are usually clustered on it; append-only log or staging tables are sometimes better as heaps.

---

# Visual Representation

```text
SQL Server / InnoDB                            PostgreSQL / Oracle (heap)

IX_CustomerID ─→ OrderID ─→ PK clustered       IX_CustomerID ─→ (page, slot) ─→ heap row
    B-tree         key         B-tree              B-tree        address         page
  (secondary)                (the table)         (secondary)
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← clustered seek/scan, or secondary seek + lookups, happen here
2. JOIN
3. WHERE       ← predicates on the clustering key read rows directly in key order
4. GROUP BY
5. HAVING
6. SELECT      ← columns missing from a secondary index trigger lookups
7. DISTINCT
8. ORDER BY    ← ORDER BY the clustering key needs no sort
9. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
SELECT OrderDate, TotalAmount FROM Orders WHERE CustomerID = 42

SQL Server (clustered on OrderID)
  Nested Loops
    Index Seek  IX_Orders_CustomerID  (CustomerID = 42)   → 50 OrderIDs
    Key Lookup  PK_Orders            (per OrderID)        → 50 × clustered seek

PostgreSQL (heap)
  Index Scan using ix_orders_customerid   (or Bitmap Heap Scan for more rows)
    Index Cond: customerid = 42           → 50 TIDs → 50 heap page fetches
```

---

# 🔬 Engine Deep Dive

InnoDB's secondary-index lookups by primary key have a benefit heaps lack: when a row moves (for example, after a page split), secondary indexes do not need to change, because they store the key, not a physical address. PostgreSQL avoids most secondary-index updates differently: *heap-only tuple* (HOT) updates keep a new row version on the same page when no indexed column changed, so indexes keep pointing at the original slot.

---

# 🏗️ Architecture Insight

The clustering key is one of the hardest physical decisions to change later: on InnoDB and SQL Server it shapes every secondary index. Choose it when the table is designed, based on how rows are inserted and read—not by accepting whatever column happens to be the primary key.

---

# ⚡ Performance Tip

On InnoDB and SQL Server, avoid wide or random primary keys on large tables. If a natural key is wide, add a narrow surrogate key as the clustered primary key and enforce the natural key with a unique nonclustered index.

---

# 🔒 Security Note

Physical storage order can leak information through timing (for example, rows inserted close together sit on the same pages), but this is rarely exploitable in practice. The more practical concern is that clustering on a sensitive column—say, national ID number—spreads that value into every secondary index.

---

# SQL Standard vs Vendor Differences

| Feature | PostgreSQL | MySQL (InnoDB) | SQL Server | Oracle | SQLite |
|---------|-----------|-------|-----------|--------|--------|
| Default storage | Heap | Clustered on PK | Clustered on PK | Heap | Clustered on rowid |
| Maintained clustered storage | ❌ | ✅ | ✅ | IOT | ✅ |
| Choose clustering key ≠ PK | ❌ | ❌ | ✅ | ❌ (IOT uses PK) | ❌ (`WITHOUT ROWID` uses PK) |
| Secondary index locator | TID (page, item) | Primary key | RID or clustering key | ROWID (logical rowid in IOT) | rowid or PK |
| One-time physical reorder | `CLUSTER` | n/a | n/a | `ALTER TABLE … MOVE` | `VACUUM` |

> **Portability Tip:** "Clustered index" is SQL Server vocabulary. On InnoDB the primary key *is* the clustered index; on Oracle the concept is an index-organised table; on PostgreSQL it does not exist as a maintained property.

---

# Common Mistakes

### Mistake 1

Believing a table can have several clustered indexes.

---

### Mistake 2

Using a random UUID as the clustered primary key of a very large InnoDB or SQL Server table.

---

### Mistake 3

Expecting PostgreSQL's `CLUSTER` to keep the table ordered after future inserts.

---

### Mistake 4

Ignoring key lookups in plans—they are often the most expensive part of an index-based query.

---

# Best Practices

✔ Cluster on a narrow, unique, static, increasing key.

✔ Consider clustering on a range key when most reads are ranges by time.

✔ Enforce wide natural keys with unique nonclustered indexes.

✔ Watch for Key Lookup / heap fetch counts in plans and cover hot queries.

---

# Interview Questions

## Basic

1. What is a clustered index?
2. How many clustered indexes can a table have?
3. What is a heap?

## Intermediate

4. What does a nonclustered index store as the row locator on SQL Server and InnoDB?
5. What is a key lookup?
6. What makes a good clustering key?

## Advanced

7. Why does a wide clustering key make every secondary index larger?
8. How does PostgreSQL avoid updating indexes when a row is updated?
9. When might a heap be a better choice than a clustered table?

---

# Hands-on Exercises

## Exercise 1

On SQL Server or InnoDB, compare the size of a secondary index when the primary key is `INT` and when it is `CHAR(36)`.

---

## Exercise 2

Show the plan of `SELECT * FROM Orders WHERE CustomerID = 42` and identify the lookup operator.

---

## Exercise 3

On SQL Server, make `OrderID` a nonclustered primary key and cluster `Orders` on `(OrderDate, OrderID)`. Compare plans for a date-range query.

---

## Exercise 4

On SQLite, create the same table as a rowid table and as `WITHOUT ROWID`, and compare `EXPLAIN QUERY PLAN` for a primary-key range.

---

# Related Topics

- **10.02 — How B-Tree Indexes Work**
- **10.06 — Covering Indexes and Included Columns**
- **10.08 — Index Seeks, Scans and Lookups**
- **10.15 — Index Design Strategy**
- **03.07.07 — Surrogate Key**

---

# Summary

A table is stored either as a heap—unordered pages with every index separate—or as a clustered index, where the table itself is a B-tree ordered by the clustering key and there can be only one. Secondary (nonclustered) indexes store their key plus a row locator: a physical address on heaps, the clustering key on clustered tables, so reaching the row is a page read or a second B-tree search. SQL Server and InnoDB cluster by primary key by default, SQLite by rowid, while PostgreSQL and Oracle use heaps unless an index-organised table is requested. Choose a narrow, unique, static and increasing clustering key, and cover hot queries to avoid lookups.
