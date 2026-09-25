---
title: "Chapter 10 - Indexes"
description: "Master SQL indexes: how B-trees work, creating and managing indexes, clustered and nonclustered storage, composite and covering indexes, unique, partial and expression indexes, other index types, seeks versus scans, statistics, write costs, maintenance and index design strategy."
chapter: 10
section: Introduction
category: Data Query Language (DQL)
difficulty: Beginner → Advanced
readingTime: 25 min
lastUpdated: 2026-09-25
---

# Chapter 10 — Indexes

> *"A table tells you what you know. An index tells you where to find it."*

---

# Learning Objectives

By the end of this chapter, you will be able to:

- Explain what an index is and why it makes some queries fast and others no faster.
- Describe how a B-tree index is organised and searched.
- Create, rename, disable and drop indexes on every major engine.
- Distinguish clustered from nonclustered (heap) storage.
- Design composite indexes with the right column order.
- Build covering indexes that answer queries without touching the table.
- Use unique, partial (filtered) and expression indexes.
- Choose between B-tree, hash, bitmap, GIN, GiST, BRIN and columnstore indexes.
- Read seeks, scans and lookups in an execution plan.
- Explain selectivity, statistics and why the optimizer sometimes ignores an index.
- Weigh the write, storage and maintenance cost of every index.
- Design a small, effective set of indexes for a real workload.

---

# Introduction

Chapters 05 to 09 taught you how to **ask** questions: which columns, which rows, which tables, which groups, which nested answers.

This chapter teaches you how to make the database **answer them quickly**.

Without an index, the only way to find the orders of customer 42 is to read every order and check each one. With an index on `Orders(CustomerID)`, the database jumps straight to customer 42's entries—a handful of page reads instead of millions.

Every earlier chapter ended with a ⚡ Performance Tip that said, in one form or another, *"index this column"*:

- Section 06.12: SARGable predicates let an index be used.
- Section 07.15: index the join columns of the inner table.
- Section 08.15: an index in grouping order lets aggregation stream.
- Section 09.15: index every correlation column.

This chapter explains what those indexes are, how they work, and how to choose them—including when **not** to create one, because every index makes writes slower and takes space.

---

# What is an Index?

An index is a separate, sorted data structure that maps values of one or more columns to the rows that contain them.

```text
Orders (table, stored in insertion order)             Index on Orders(CustomerID)
┌─────────┬────────────┬────────────┬────────┐        ┌────────────┬───────────────┐
│ OrderID │ CustomerID │ OrderDate  │ Total  │        │ CustomerID │ Row locator   │
├─────────┼────────────┼────────────┼────────┤        ├────────────┼───────────────┤
│ 101     │ 7          │ 2026-01-03 │ 250.00 │        │ 2          │ → row 103     │
│ 102     │ 42         │ 2026-01-04 │  80.00 │        │ 7          │ → row 101     │
│ 103     │ 2          │ 2026-01-04 │ 500.00 │        │ 7          │ → row 105     │
│ 104     │ 42         │ 2026-01-05 │ 120.00 │        │ 42         │ → row 102     │
│ 105     │ 7          │ 2026-01-06 │  60.00 │        │ 42         │ → row 104     │
└─────────┴────────────┴────────────┴────────┘        └────────────┴───────────────┘
                                                        sorted → can be searched
```

Two observations explain most index behaviour:

1. **An index is sorted.** Anything that benefits from sorted data—finding one value, a range of values, rows in order, the minimum or maximum—can use it.
2. **An index is a copy.** Every insert, update of an indexed column, and delete must also change the index. Reads get faster; writes get slower.

---

# Basic Syntax

```sql
CREATE [UNIQUE] INDEX index_name
ON table_name (column1 [ASC | DESC], column2, ...);

DROP INDEX index_name;               -- PostgreSQL, Oracle, SQLite
DROP INDEX index_name ON table_name; -- MySQL, SQL Server
```

Example:

```sql
CREATE INDEX IX_Orders_CustomerID_OrderDate
ON Orders (CustomerID, OrderDate);
```

This single index supports "orders of customer 42", "orders of customer 42 in September", and "customer 42's latest order".

---

# The Sample Schema

Every section of this chapter uses the Chapter 09 schema.

```sql
CREATE TABLE Customers (
    CustomerID   INT PRIMARY KEY,
    CustomerName VARCHAR(100) NOT NULL,
    Email        VARCHAR(255),
    Country      VARCHAR(50)
);

CREATE TABLE Orders (
    OrderID     INT PRIMARY KEY,
    CustomerID  INT REFERENCES Customers(CustomerID),
    OrderDate   DATE          NOT NULL,
    Status      VARCHAR(20)   NOT NULL,   -- 'Pending', 'Shipped', 'Cancelled'
    TotalAmount DECIMAL(10,2) NOT NULL
);

CREATE TABLE Products (
    ProductID   INT PRIMARY KEY,
    ProductName VARCHAR(100) NOT NULL,
    CategoryID  INT,
    ListPrice   DECIMAL(10,2)
);

CREATE TABLE OrderItems (
    OrderItemID INT PRIMARY KEY,
    OrderID     INT REFERENCES Orders(OrderID),
    ProductID   INT REFERENCES Products(ProductID),
    Quantity    INT           NOT NULL,
    UnitPrice   DECIMAL(10,2) NOT NULL
);

CREATE TABLE Employees (
    EmployeeID   INT PRIMARY KEY,
    EmployeeName VARCHAR(100) NOT NULL,
    ManagerID    INT REFERENCES Employees(EmployeeID),
    DepartmentID INT,
    Salary       DECIMAL(10,2),
    HireDate     DATE NOT NULL
);
```

> **Scale:** Index behaviour only becomes visible with data. Examples assume about 100 000 customers, 5 million orders and 20 million order items—small by production standards, large enough that a full scan is noticeably slower than an index seek.

---

# The Index Toolkit

| Tool | Purpose | Section |
|------|---------|---------|
| B-tree index | Equality, ranges, sorting, min/max | 10.02 |
| `CREATE` / `DROP` / `ALTER INDEX` | Managing indexes | 10.03 |
| Clustered index / index-organised table | Store the table itself in key order | 10.04 |
| Composite index | Several columns, order matters | 10.05 |
| Covering index / `INCLUDE` | Answer a query from the index alone | 10.06 |
| Unique index | Enforce uniqueness | 10.07 |
| Partial / filtered index | Index only some rows | 10.10 |
| Expression / function-based index | Index a computed value | 10.10 |
| Hash, bitmap, GIN, GiST, BRIN, columnstore | Specialised workloads | 10.09 |

```text
                 what does the index make fast?
   ┌──────────────┬──────────────┬───────────────┬─────────────────┐
   │ find a value │ find a range │ return sorted │ avoid the table │
   │ (seek)       │ (range scan) │ (ordered scan)│ (covering)      │
   └──────────────┴──────────────┴───────────────┴─────────────────┘
        B-tree       B-tree          B-tree         B-tree + INCLUDE
        hash         BRIN (coarse)
```

---

# 📍 Execution Order Reminder

Indexes do not change what a query means—only how its steps are carried out. They matter most at these points:

```text
1. FROM        ← an index can replace a full table scan with a seek or range scan
2. JOIN        ← an index on the inner join column enables index nested loops
3. WHERE       ← SARGable predicates become index seek conditions here
4. GROUP BY    ← an index in grouping order enables stream aggregation
5. HAVING
6. SELECT      ← a covering index supplies every selected column
7. DISTINCT
8. ORDER BY    ← an index in the requested order removes the sort
9. LIMIT / FETCH / TOP  ← with an ordered index, the engine can stop after N rows
```

---

# How the DBMS Executes This

```text
SQL Statement
        │
        ▼
Optimizer enumerates access paths for each table
        │
   ┌────┼──────────────────┬──────────────────────┐
   ▼    ▼                  ▼                      ▼
Full   Index seek /       Index-only scan       Bitmap / multiple
scan   range scan +       (covering index)      index combination
       row lookups
        │
        ▼
Cost estimate from statistics (rows, pages, selectivity)
        │
        ▼
Cheapest path chosen → execution
```

An index is an *option* the optimizer may take. Whether it does depends on how many rows the predicate selects, whether the index covers the query, and what the statistics say—Sections 10.08 and 10.12.

---

# Chapter Structure

| Section | Topic |
|---------|-------|
| 10.01 | Introduction to Indexes |
| 10.02 | How B-Tree Indexes Work |
| 10.03 | Creating and Managing Indexes |
| 10.04 | Clustered and Nonclustered Indexes |
| 10.05 | Composite Indexes and Column Order |
| 10.06 | Covering Indexes and Included Columns |
| 10.07 | Unique Indexes and Constraints |
| 10.08 | Index Seeks, Scans and Lookups |
| 10.09 | Index Types (Hash, Bitmap, GIN, GiST, BRIN and Columnstore) |
| 10.10 | Partial and Expression Indexes |
| 10.11 | Indexing for JOIN, GROUP BY and ORDER BY |
| 10.12 | Selectivity, Cardinality and Statistics |
| 10.13 | The Cost of Indexes (Writes, Storage and Locking) |
| 10.14 | Index Maintenance (Fragmentation, Rebuilds and Monitoring) |
| 10.15 | Index Design Strategy |
| 10.16 | Common Index Mistakes & Best Practices |
| 10.17 | Index Cheat Sheet & Visual Knowledge Map |

---

# Real-World Examples

## E-Commerce

```sql
CREATE INDEX IX_Orders_Customer_Date ON Orders (CustomerID, OrderDate DESC);

SELECT OrderID, OrderDate, TotalAmount
FROM Orders
WHERE CustomerID = 42
ORDER BY OrderDate DESC
FETCH FIRST 20 ROWS ONLY;
```

"My orders" page: one seek, twenty index entries, no sort.

---

## Banking

```sql
CREATE UNIQUE INDEX UX_Accounts_IBAN ON Accounts (IBAN);
```

Enforces that no two accounts share an IBAN and makes lookups by IBAN instant.

---

## Hospital

```sql
-- PostgreSQL / SQLite partial index: only patients currently admitted
CREATE INDEX IX_Admissions_Current ON Admissions (WardID)
WHERE DischargeDate IS NULL;
```

A small index over the few thousand current admissions instead of decades of history.

---

## HRMS

```sql
CREATE INDEX IX_Employees_Manager ON Employees (ManagerID);
```

Supports "direct reports of manager X" and the self-join in every org-chart query.

---

## Social Media

```sql
-- PostgreSQL: full-text search over posts
CREATE INDEX IX_Posts_Search ON Posts USING GIN (to_tsvector('english', Body));
```

A B-tree cannot answer "posts containing the word *index*"; an inverted (GIN) index can.

---

# 🏗️ Architecture Insight

Indexes are the main physical-design decision in a relational database. The logical design (tables, keys, relationships) says what the data means; the index design says which questions will be cheap. Because indexes can be added and dropped without changing a single query, they are also the main tuning lever in production—but each one is a permanent tax on every write to its table.

---

# ⚡ Performance Tip

Most slow queries in OLTP systems are fixed by one of three indexes: an index on a foreign key used in joins, a composite index matching an equality filter plus a sort, or a covering index for a hot query. Look for those before anything more exotic.

---

# 🔒 Security Note

Indexes store copies of column values. An index on `Customers(Email)` is a sorted list of every e-mail address; it is protected by the same permissions as the table, but it is included in backups, replicated, and may persist in data files after rows are deleted until the index is rebuilt. Encrypted or masked columns usually cannot be indexed usefully—decide early which sensitive columns must be searchable.

---

# 🌍 Production Consideration

Creating an index on a large, busy table can block writes for minutes or hours. Every major engine has an online variant (`CREATE INDEX CONCURRENTLY`, `ONLINE = ON`, `ALGORITHM=INPLACE, LOCK=NONE`, `ONLINE`); use it in production, and schedule index changes like any other deployment.

---

# 🚀 Enterprise Practice

Enterprise standards commonly require a naming convention (`IX_Table_Columns`, `UX_` for unique), an index on every foreign key, a documented justification (the query it serves) for every other index, a periodic review of unused indexes, and a limit on the number of indexes per write-heavy table.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL (InnoDB) | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `CREATE INDEX` | ❌ (not in the standard) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Table clustered by primary key | n/a | ❌ (heap) | ✅ always | ✅ default | Optional (IOT) | ✅ (rowid / `WITHOUT ROWID`) |
| `INCLUDE` columns | n/a | ✅ (11+) | ❌ | ✅ | ❌ | ❌ |
| Partial / filtered index | n/a | ✅ | ❌ | ✅ | ❌ (workaround) | ✅ |
| Expression index | n/a | ✅ | ✅ (8.0.13+) | Via computed column | ✅ | ✅ |
| Online index build | n/a | `CONCURRENTLY` | Online DDL | `ONLINE = ON` (Enterprise) | `ONLINE` (Enterprise) | ❌ |

> **Portability Tip:** Indexes are not part of the SQL standard at all—the standard deals only with logical constraints. `CREATE INDEX name ON table (columns)` is the common subset every engine accepts; everything else is vendor syntax.

---

# Common Mistakes

- Indexing every column "just in case".
- Creating single-column indexes where one composite index is needed.
- Writing non-SARGable predicates that cannot use an existing index.
- Forgetting to index foreign keys.
- Creating duplicate or overlapping indexes.
- Building a large index without the online option on a busy table.
- Never checking whether an index is actually used.

---

# Best Practices

✔ Index for queries, not for columns: name the query each index serves.

✔ Index foreign keys used in joins and correlated subqueries.

✔ Put equality columns first in composite indexes, then range or sort columns.

✔ Cover the hottest queries; keep the rest lean.

✔ Review usage statistics and drop indexes nobody uses.

✔ Create and rebuild indexes online in production.

---

# 💡 Did You Know?

The B-tree was invented by Rudolf Bayer and Edward McCreight at Boeing Research Labs and published in 1972. Neither author ever settled what the "B" stands for—Boeing, balanced, broad and Bayer have all been suggested. Half a century later it is still the default index structure in every major relational database.

---

# Related Topics

- **Chapter 09 — Subqueries**
- **06.12 — SARGability and Index-Friendly Predicates**
- **07.15 — JOIN Performance and Index Strategy**
- **08.15 — GROUP BY Performance and Index Strategy**
- **09.15 — Subquery Performance and Index Strategy**
- **11.xx — Window Functions**
- **16.xx — Reading Execution Plans**

---

# Summary

An index is a sorted copy of one or more columns that points back to the table's rows, letting the database find values, ranges and ordered rows without reading everything. B-trees are the default and serve equality, ranges, sorting and min/max; other structures serve text search, arrays, spatial data and analytics. Composite column order, covering columns, uniqueness, partial and expression indexes shape what an index can answer, and statistics decide whether the optimizer uses it. Every index speeds some reads and slows every write, so good index design is a small set of indexes, each justified by the queries it serves.
