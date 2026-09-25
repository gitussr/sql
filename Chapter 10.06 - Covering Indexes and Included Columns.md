---
title: "10.06 - Covering Indexes and Included Columns"
description: "Covering indexes in depth: answering a query from the index alone, index-only scans, INCLUDE columns versus key columns, covering joins, aggregates and pagination, PostgreSQL's visibility map, the cost of wide indexes, and when covering is worth it."
chapter: 10
section: 10.06
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 30 min
lastUpdated: 2026-09-25
---

# 10.06 Covering Indexes and Included Columns

---

# Learning Objectives

After completing this section, you will be able to:

- Define a covering index and recognise an index-only access in a plan.
- Choose between key columns and `INCLUDE` columns.
- Cover queries on engines without `INCLUDE`.
- Explain why PostgreSQL index-only scans depend on the visibility map.
- Decide when covering is worth its extra size and write cost.

---

# What is a Covering Index?

An index **covers** a query when it contains every column the query references on that table—in `SELECT`, `WHERE`, `JOIN`, `GROUP BY` and `ORDER BY`. The engine can then answer from the index alone, with **no lookups** into the table.

```sql
SELECT OrderDate, TotalAmount
FROM Orders
WHERE CustomerID = 42;
```

```text
Index (CustomerID)                           Index (CustomerID, OrderDate, TotalAmount)
seek 42 → 500 locators                       seek 42 → 500 entries already holding
500 random lookups into Orders               OrderDate and TotalAmount
                                             → no table access at all
```

For 500 rows that is the difference between roughly 500 page reads and about 5.

---

# Key Columns vs Included Columns

A column can be added to an index in two ways:

```sql
-- As a key column: part of the sort order, stored at every level
CREATE INDEX IX_Orders_Cust_Date_Total ON Orders (CustomerID, OrderDate, TotalAmount);

-- As an included column: stored only in leaf entries, not sorted
CREATE INDEX IX_Orders_Cust_Date_Inc ON Orders (CustomerID, OrderDate) INCLUDE (TotalAmount);
```

| | Key column | `INCLUDE` column |
|---|------------|------------------|
| Stored in branch pages | ✅ | ❌ (leaf only) |
| Usable in seek predicates | ✅ | ❌ |
| Provides sort order | ✅ | ❌ |
| Counted toward key size / column limits | ✅ | ❌ (SQL Server: up to 1023 included columns) |
| Part of uniqueness in a `UNIQUE` index | ✅ | ❌ |
| Updating it moves the entry | ✅ | ❌ (updated in place) |

**Rule:** columns you filter, join, group or sort on go in the key; columns you only return go in `INCLUDE`.

`INCLUDE` is available on SQL Server (2005+) and PostgreSQL (11+). On MySQL, Oracle and SQLite, add returned columns as trailing key columns instead.

---

# A Unique Key with Extra Payload

`INCLUDE` lets a unique index carry extra columns without changing what is unique:

```sql
-- Unique on Email only, but covers "look up customer by e-mail"
CREATE UNIQUE INDEX UX_Customers_Email
ON Customers (Email) INCLUDE (CustomerID, CustomerName);
```

Adding `CustomerName` as a key column instead would make the uniqueness `(Email, CustomerName)`—a different, weaker constraint.

---

# Covering Joins

A covering index on the inner table of a nested loop join removes the lookup per outer row:

```sql
SELECT c.CustomerName, o.OrderDate, o.TotalAmount
FROM Customers AS c
JOIN Orders AS o ON o.CustomerID = c.CustomerID
WHERE c.Country = 'India';

CREATE INDEX IX_Orders_Cust_Cover ON Orders (CustomerID) INCLUDE (OrderDate, TotalAmount);
```

---

# Covering Aggregates

```sql
SELECT CustomerID, COUNT(*), SUM(TotalAmount)
FROM Orders
GROUP BY CustomerID;

CREATE INDEX IX_Orders_Cust_Total ON Orders (CustomerID) INCLUDE (TotalAmount);
```

The engine reads the (much smaller) index in `CustomerID` order and aggregates with a stream aggregate—no table access and no hash table (Section 08.15).

---

# Covering Pagination

The classic slow pagination query sorts and fetches many wide rows. A covering index turns it into a short index read:

```sql
SELECT OrderID, OrderDate, TotalAmount
FROM Orders
WHERE Status = 'Shipped'
ORDER BY OrderDate DESC, OrderID DESC
FETCH FIRST 50 ROWS ONLY;

CREATE INDEX IX_Orders_Status_Date_ID
ON Orders (Status, OrderDate DESC, OrderID DESC) INCLUDE (TotalAmount);
```

Seek to `'Shipped'`, read 50 entries, done.

On clustered tables (SQL Server, InnoDB), the clustering key is already in every secondary index, so `OrderID` is covered for free if it is the primary key.

---

# Index-Only Scans in PostgreSQL

PostgreSQL stores row visibility (which transaction versions are live) only in the heap. An index entry alone cannot say whether its row is visible to the current transaction. An **Index Only Scan** therefore checks the **visibility map**: a bitmap of heap pages whose rows are all visible to everyone.

```text
Index Only Scan using ix_orders_cust_cover on orders
  Index Cond: (customerid = 42)
  Heap Fetches: 0          ← all pages marked all-visible: true index-only access
  Heap Fetches: 480        ← pages recently modified: heap visited anyway
```

`VACUUM` sets the visibility bits. On a heavily updated table that is not vacuumed often, "index-only" scans still visit the heap; tuning autovacuum for such tables restores the benefit.

---

# The Cost of Covering

A covering index duplicates data:

```text
Orders row: ~120 bytes
IX (CustomerID)                               ≈ 16 bytes/entry
IX (CustomerID) INCLUDE (OrderDate, Total)    ≈ 30 bytes/entry
IX (CustomerID) INCLUDE (every column)        ≈ 130 bytes/entry  → a second copy of the table
```

- Every `INSERT` and `DELETE` writes the wider entry.
- Every `UPDATE` of an included column must update the index.
- A wider index holds fewer entries per page, so its scans read more pages.

Cover the few queries that run thousands of times per minute or read many rows. Do not cover every query, and do not `INCLUDE` large text or JSON columns.

---

# SELECT * Defeats Covering

```sql
SELECT * FROM Orders WHERE CustomerID = 42;
```

No secondary index can cover `SELECT *` without being a full copy of the table. Selecting only the columns you need (Section 05.04) is what makes covering possible—and keeps it valid as columns are added to the table later.

---

# Visual Representation

```text
Not covering                                   Covering

┌───────────────┐   locator   ┌──────────┐     ┌──────────────────────────────┐
│ index         │ ──────────→ │  table   │     │ index (key + INCLUDE cols)   │
│ CustomerID    │  per row    │  row     │     │ CustomerID | OrderDate | Tot │ → result
└───────────────┘             └──────────┘     └──────────────────────────────┘
 seek + N lookups                                seek + N leaf entries
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← an index-only access replaces index + table access here
2. JOIN        ← covering the inner table removes a lookup per outer row
3. WHERE       ← key columns navigate; included columns can only be filtered on
4. GROUP BY
5. HAVING
6. SELECT      ← every selected column must be in the index for it to cover
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Engine        Covered access appears as
────────────  ──────────────────────────────────────────────
PostgreSQL    Index Only Scan  (check "Heap Fetches")
SQL Server    Index Seek / Index Scan with no Key Lookup / RID Lookup
MySQL         EXPLAIN Extra: "Using index"
Oracle        INDEX RANGE SCAN with no TABLE ACCESS BY INDEX ROWID
SQLite        "USING COVERING INDEX"
```

---

# 🔬 Engine Deep Dive

SQL Server's missing-index suggestions (in plans and `sys.dm_db_missing_index_details`) almost always propose covering indexes with long `INCLUDE` lists, one per query. Accepting them blindly produces many overlapping, wide indexes. Treat them as hints: merge suggestions with the same key columns, drop rarely used included columns, and compare with existing indexes before creating anything.

---

# 🏗️ Architecture Insight

A covering index is a **narrow, sorted projection** of a table—in effect, a materialised view with one very specific shape that the database keeps current automatically. Thinking of it that way clarifies when to build one: for a small number of high-frequency access patterns whose shape is stable.

---

# ⚡ Performance Tip

When a plan shows an index seek followed by thousands of Key Lookups or heap fetches, adding the looked-up columns to that index (as `INCLUDE` where possible) is usually the single most effective fix.

---

# 🔒 Security Note

Included columns are full copies. If a column is sensitive and protected by column-level permissions or masking, including it in an index does not bypass those permissions for queries—but it does place the raw values in additional structures that appear in backups and storage-level dumps.

---

# SQL Standard vs Vendor Differences

| Feature | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|---------|-----------|-------|-----------|--------|--------|
| `INCLUDE` clause | ✅ (11+, B-tree; GiST 12+; SP-GiST 14+) | ❌ | ✅ | ❌ | ❌ |
| Covering via trailing key columns | ✅ | ✅ | ✅ | ✅ | ✅ |
| Clustering key implicitly covered | n/a (heap) | ✅ (PK) | ✅ | n/a (heap) | ✅ (rowid) |
| Index-only depends on visibility | ✅ (visibility map) | ❌ | ❌ | ❌ | ❌ |
| Plan marker | `Index Only Scan` | `Using index` | No lookup operator | No `TABLE ACCESS` | `COVERING INDEX` |

> **Portability Tip:** Trailing key columns cover queries on every engine; `INCLUDE` is an optimisation on PostgreSQL and SQL Server that keeps branch pages smaller.

---

# Common Mistakes

### Mistake 1

Putting included-only columns in the key, making the index wider at every level and changing uniqueness.

---

### Mistake 2

Putting a filter column in `INCLUDE`, where it cannot be used to seek.

---

### Mistake 3

Creating a covering index for every query, doubling the storage of hot tables.

---

### Mistake 4

Using `SELECT *` and wondering why no index covers the query.

---

### Mistake 5

Expecting PostgreSQL index-only scans on a table that is rarely vacuumed.

---

# Best Practices

✔ Cover only the hottest or most row-intensive queries.

✔ Key columns for filtering, joining, grouping and sorting; `INCLUDE` for returned columns.

✔ Keep included columns small; never include large text or JSON.

✔ Select only needed columns so covering stays possible.

✔ Check for Key Lookups / heap fetches in plans.

---

# Interview Questions

## Basic

1. What is a covering index?
2. What is a key lookup, and how does a covering index remove it?
3. What does `INCLUDE` do?

## Intermediate

4. When should a column be a key column rather than an included column?
5. How do you cover a query on MySQL, which has no `INCLUDE`?
6. Why can't any index cover `SELECT *`?

## Advanced

7. Why does a PostgreSQL index-only scan sometimes still visit the heap?
8. How does `INCLUDE` on a unique index differ from adding the column to the key?
9. Why should missing-index suggestions not be applied blindly?

---

# Hands-on Exercises

## Exercise 1

Create a covering index for `SELECT OrderDate, TotalAmount FROM Orders WHERE CustomerID = ? ORDER BY OrderDate DESC`, and confirm the plan has no lookups.

---

## Exercise 2

On PostgreSQL, run the same query before and after `VACUUM Orders`, and compare *Heap Fetches*.

---

## Exercise 3

Measure the size of an index with and without two included columns.

---

## Exercise 4

Cover `SELECT CustomerID, SUM(TotalAmount) FROM Orders GROUP BY CustomerID` and compare the plan with and without the index.

---

# Related Topics

- **10.04 — Clustered and Nonclustered Indexes**
- **10.05 — Composite Indexes and Column Order**
- **10.08 — Index Seeks, Scans and Lookups**
- **05.04 — Selecting Specific Columns**
- **08.15 — GROUP BY Performance and Index Strategy**

---

# Summary

A covering index contains every column a query needs from a table, so the engine answers from the index alone and skips the per-row lookups that dominate index-based plans. Filter, join, group and sort columns belong in the key; columns that are only returned belong in `INCLUDE` on PostgreSQL and SQL Server, or as trailing key columns elsewhere. Covering indexes speed up joins, aggregates and pagination dramatically but duplicate data and add write cost, and `SELECT *` defeats them. Use them for a few hot, stable queries, keep them narrow, and on PostgreSQL keep tables vacuumed so index-only scans stay index-only.
