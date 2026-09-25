---
title: "10.01 - Introduction to Indexes"
description: "What an index is, the book-index analogy and its limits, full scans versus index access, what indexes make fast and what they cannot help with, the read/write trade-off, and a first look at indexes in an execution plan."
chapter: 10
section: 10.01
category: Data Query Language (DQL)
difficulty: Beginner
readingTime: 25 min
lastUpdated: 2026-09-25
---

# 10.01 Introduction to Indexes

---

# Learning Objectives

After completing this section, you will be able to:

- Define an index and explain why it speeds up reads.
- Compare a full table scan with index access.
- List the kinds of operations an index can speed up.
- Recognise queries an index cannot help.
- Explain the read/write trade-off every index introduces.
- Spot index use in a simple execution plan.

---

# What is an Index?

An **index** is an auxiliary data structure, stored separately from the table, that keeps the values of one or more columns **in sorted order** together with a pointer to each row that holds them.

```sql
CREATE INDEX IX_Orders_CustomerID ON Orders (CustomerID);
```

After this statement, the database maintains a sorted list of every `CustomerID` in `Orders`, each entry pointing to its order row. Queries do not name the index; the optimizer decides when to use it.

---

# The Book Analogy

```text
Book                                   Database
────────────────────────────────       ────────────────────────────────────
Pages in chapter order                 Table rows in storage order
Index at the back, sorted by term      Index sorted by key value
"B-tree ........ 112, 240, 311"        CustomerID 42 → rows 102, 104, 877
Look up term, turn to pages            Seek in index, fetch rows
Reading the whole book                 Full table scan
```

The analogy holds in three useful ways:

- Finding one term is fast with the index, slow without it.
- If a term appears on half the pages, you are better off reading the book.
- Adding a page means updating the index too.

---

# Full Scan vs Index Access

```sql
SELECT OrderID, OrderDate, TotalAmount
FROM Orders
WHERE CustomerID = 42;
```

```text
Without an index                          With IX_Orders_CustomerID
──────────────────────────────────       ──────────────────────────────────────
Read every page of Orders                 Descend the index: ~3–4 page reads
5 000 000 rows examined                   Find the entries for 42 (e.g. 50)
~60 000 pages read                        Fetch 50 rows: ≤ 50 page reads
Time: seconds                             Time: milliseconds
```

The difference grows with the table: a full scan's cost is proportional to the table size; an index seek's cost is proportional to the depth of the index (which grows logarithmically) plus the number of matching rows.

---

# What an Index Makes Fast

| Operation | Example | Why the index helps |
|-----------|---------|---------------------|
| Equality lookup | `WHERE CustomerID = 42` | Jump to the value |
| Range | `WHERE OrderDate BETWEEN … AND …` | Jump to the start, read in order |
| Prefix match | `WHERE CustomerName LIKE 'Ra%'` | A prefix is a range |
| Sorting | `ORDER BY OrderDate` | Entries are already sorted |
| Top N | `ORDER BY OrderDate DESC FETCH FIRST 10` | Read 10 entries and stop |
| Min / Max | `SELECT MAX(OrderDate)` | First or last entry |
| Join | `JOIN Orders o ON o.CustomerID = c.CustomerID` | Seek per outer row |
| Grouping | `GROUP BY CustomerID` | Rows arrive grouped |
| Existence | `WHERE EXISTS (… o.CustomerID = c.CustomerID)` | Stop at first entry |
| Uniqueness | `UNIQUE (Email)` | Check one position before inserting |

---

# What an Index Cannot Help

```sql
-- Function on the column: the index is sorted by CustomerName, not UPPER(CustomerName)
WHERE UPPER(CustomerName) = 'RAVI'

-- Leading wildcard: 'avi' can be anywhere in the sorted list
WHERE CustomerName LIKE '%avi%'

-- Most of the table qualifies: reading everything is cheaper
WHERE Status <> 'Cancelled'           -- 97% of orders

-- Column not in any index
WHERE TotalAmount > 1000              -- with only an index on CustomerID

-- Tiny table
SELECT * FROM Countries WHERE Code = 'IN'   -- 250 rows: one or two pages anyway
```

Section 06.12 covered the first two (SARGability); Section 10.10 shows expression indexes that fix the first; Section 10.12 explains the third.

---

# The Trade-Off

```text
                READS                          WRITES
             ┌──────────┐                   ┌──────────┐
 no index    │   slow   │                   │   fast   │   INSERT: 1 structure
             └──────────┘                   └──────────┘
             ┌──────────┐                   ┌──────────┐
 5 indexes   │   fast   │                   │  slower  │   INSERT: 6 structures
             └──────────┘                   └──────────┘
```

Every index must be updated by every `INSERT` and `DELETE`, and by every `UPDATE` of an indexed column. Each index also uses disk and memory, must be backed up, and must be maintained. The goal is never "as many indexes as possible", but the smallest set that makes the important queries fast (Section 10.15).

---

# Indexes You Already Have

Most engines create indexes automatically for constraints:

```sql
CREATE TABLE Customers (
    CustomerID INT PRIMARY KEY,      -- index created automatically
    Email      VARCHAR(255) UNIQUE   -- index created automatically
);
```

| Constraint | Automatic index? |
|-----------|------------------|
| `PRIMARY KEY` | ✅ every engine |
| `UNIQUE` | ✅ every engine |
| `FOREIGN KEY` | ❌ except MySQL/InnoDB |

The last row is the most common cause of missing indexes: a foreign key constraint does **not** index the referencing column on PostgreSQL, SQL Server, Oracle or SQLite.

---

# Seeing an Index in a Plan

```sql
EXPLAIN
SELECT OrderID, OrderDate FROM Orders WHERE CustomerID = 42;
```

```text
PostgreSQL, before the index:
  Seq Scan on orders  (cost=0.00..105000.00 rows=50 width=12)
    Filter: (customerid = 42)

PostgreSQL, after CREATE INDEX IX_Orders_CustomerID:
  Index Scan using ix_orders_customerid on orders  (cost=0.43..58.21 rows=50 width=12)
    Index Cond: (customerid = 42)
```

`Filter` means rows were read and then tested; `Index Cond` means the condition was used to navigate the index. That distinction is the first thing to look for when a query is slow.

---

# Visual Representation

```text
                     Index on CustomerID
                        ┌──────────┐
                        │ root     │
                        └────┬─────┘
                ┌────────────┼────────────┐
           ┌────▼───┐   ┌────▼───┐   ┌────▼───┐
           │ 1–30k  │   │30k–60k │   │60k–100k│      branch pages
           └────┬───┘   └────────┘   └────────┘
       ┌────────┼────────┐
   ┌───▼──┐ ┌───▼──┐ ┌───▼──┐
   │ 1–40 │ │41–80 │ │ …    │                       leaf pages (sorted keys + row pointers)
   └──────┘ └──┬───┘ └──────┘
               │ 42 → rows 102, 104, 877 …
               ▼
         Orders table pages
```

Section 10.02 explains this structure in detail.

---

# 📍 Execution Order Reminder

```text
1. FROM        ← the optimizer picks an access path: full scan or index
2. JOIN
3. WHERE       ← index-compatible predicates decide which index entries are read
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY    ← an index in this order can remove the sort
9. LIMIT / FETCH / TOP
```

The logical order is unchanged by indexes; they only make steps 1, 3 and 8 cheaper.

---

# How the DBMS Executes This

```text
WHERE CustomerID = 42
        │
        ▼
Is there an index whose leading column is CustomerID?
        │
   ┌────┴────┐
   no        yes
   │         │
   ▼         ▼
Full scan   Estimate rows for CustomerID = 42 (statistics)
                 │
            ┌────┴────────────┐
            few               many
            │                 │
            ▼                 ▼
        Index seek       Full scan (cheaper than
        + row lookups    many random lookups)
```

---

# 🔬 Engine Deep Dive

Databases read and write data in fixed-size **pages** (8 KB in PostgreSQL and SQL Server, 16 KB in InnoDB, 4 KB by default in SQLite, typically 8 KB in Oracle). All index cost reasoning is in pages, not rows: a seek touches a few index pages plus one page per matching row that is not already in memory. That is why an index that returns 1% of rows can still be slower than a scan—1% of rows may be spread over most of the table's pages.

---

# 🏗️ Architecture Insight

Indexes are **redundant data** maintained automatically. Like any redundancy, they trade write cost and storage for read speed, and like any cache they must be kept consistent—which the database does for you inside every transaction. That guarantee is what makes indexes safe to add and remove without changing application code.

---

# ⚡ Performance Tip

Before creating an index, run the query with `EXPLAIN` (or the actual plan). If the plan already shows an index seek, the problem is elsewhere; if it shows a full scan with a selective `Filter`, an index is probably the fix.

---

# 🔒 Security Note

Creating an index normally requires ownership of the table or an `INDEX`/`ALTER` privilege. Grant it narrowly: an unexpected index on a busy table can degrade write performance for every user, and an index build can lock the table.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Indexes defined by the standard | ❌ | — | — | — | — | — |
| Auto index on `PRIMARY KEY` / `UNIQUE` | n/a | ✅ | ✅ | ✅ | ✅ | ✅ |
| Auto index on `FOREIGN KEY` | n/a | ❌ | ✅ | ❌ | ❌ | ❌ |
| Default page size | n/a | 8 KB | 16 KB | 8 KB | 8 KB (typical) | 4 KB |
| Plan command | n/a | `EXPLAIN` | `EXPLAIN` | `SET SHOWPLAN_*` / graphical | `EXPLAIN PLAN` | `EXPLAIN QUERY PLAN` |

> **Portability Tip:** Queries are portable across engines; index definitions mostly are too, as long as you stick to `CREATE [UNIQUE] INDEX name ON table (columns)`. Everything beyond that is vendor-specific.

---

# Common Mistakes

### Mistake 1

Assuming a foreign key constraint creates an index.

---

### Mistake 2

Expecting an index to help `WHERE UPPER(col) = …` or `LIKE '%text%'`.

---

### Mistake 3

Adding an index without checking the plan before and after.

---

### Mistake 4

Indexing tiny tables or columns where most rows share the same value.

---

# Best Practices

✔ Check the execution plan before and after adding an index.

✔ Index foreign keys used in joins.

✔ Keep predicates SARGable so indexes can be used.

✔ Remember that every index slows writes—justify each one.

---

# Interview Questions

## Basic

1. What is a database index?
2. Why does an index speed up `WHERE CustomerID = 42`?
3. Which constraints create indexes automatically?

## Intermediate

4. Why might the optimizer ignore an index on a column in the `WHERE` clause?
5. What is the cost of having many indexes on a table?
6. What is the difference between `Filter` and `Index Cond` in a PostgreSQL plan?

## Advanced

7. Why is index cost reasoned about in pages rather than rows?
8. Why can an index returning 1% of rows be slower than a full scan?
9. Why are indexes not part of the SQL standard?

---

# Hands-on Exercises

## Exercise 1

Run `EXPLAIN` on `SELECT * FROM Orders WHERE CustomerID = 42` before and after creating an index on `CustomerID`.

---

## Exercise 2

List the indexes that exist on each table of the sample schema immediately after `CREATE TABLE`, on your engine.

---

## Exercise 3

Write three queries on `Orders` that an index on `OrderDate` can speed up, and three that it cannot.

---

## Exercise 4

Time 10 000 inserts into `Orders` with no secondary indexes and with four secondary indexes.

---

# Related Topics

- **10.02 — How B-Tree Indexes Work**
- **10.08 — Index Seeks, Scans and Lookups**
- **10.13 — The Cost of Indexes (Writes, Storage and Locking)**
- **06.12 — SARGability and Index-Friendly Predicates**
- **05.12 — Execution Flow of SELECT**

---

# Summary

An index is a separately stored, sorted copy of one or more columns with pointers to the table's rows. It lets the database seek to a value, read a range, return rows in order, find minimum and maximum values and probe joins without reading the whole table—but it cannot help predicates that hide the column in a function, search with a leading wildcard, or select most of the table. Primary and unique keys are indexed automatically; foreign keys usually are not. Every index speeds some reads and slows every write, so indexes are chosen per query and verified in the execution plan.
