---
title: "10.05 - Composite Indexes and Column Order"
description: "Multi-column indexes in depth: sort order of composite keys, the leftmost-prefix rule, equality-before-range column ordering, supporting ORDER BY, skip scans, composite versus several single-column indexes, and redundant prefixes."
chapter: 10
section: 10.05
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 35 min
lastUpdated: 2026-09-25
---

# 10.05 Composite Indexes and Column Order

---

# Learning Objectives

After completing this section, you will be able to:

- Explain how a composite index is sorted.
- Apply the leftmost-prefix rule to decide which queries an index supports.
- Order columns as equality first, then range or sort.
- Design one composite index that serves a filter and a sort.
- Explain skip scans and index merges, and why they are second best.
- Recognise redundant indexes that are prefixes of others.

---

# What is a Composite Index?

A **composite** (multi-column, concatenated) index has more than one key column. Entries are sorted by the first column, then by the second within equal first values, and so on—like a phone book sorted by surname, then first name.

```sql
CREATE INDEX IX_Orders_Customer_Date ON Orders (CustomerID, OrderDate);
```

```text
Leaf entries, in order
┌────────────┬────────────┐
│ CustomerID │ OrderDate  │
├────────────┼────────────┤
│ 41         │ 2026-08-30 │
│ 42         │ 2025-11-02 │  ┐
│ 42         │ 2026-02-14 │  │ all of customer 42, sorted by date
│ 42         │ 2026-09-02 │  ┘
│ 43         │ 2024-05-01 │
│ 43         │ 2026-01-20 │
└────────────┴────────────┘
```

Within customer 42, dates are sorted. Across the whole index, dates are **not** sorted.

---

# The Leftmost-Prefix Rule

An index on `(A, B, C)` can be *seeked* on any **leading prefix** of its columns:

| Predicate | Seek on index `(A, B, C)`? |
|-----------|----------------------------|
| `A = 1` | ✅ |
| `A = 1 AND B = 2` | ✅ |
| `A = 1 AND B = 2 AND C = 3` | ✅ |
| `A = 1 AND C = 3` | ✅ on `A`; `C` checked on the entries read |
| `B = 2` | ❌ (no leading column) |
| `B = 2 AND C = 3` | ❌ |
| `C = 3` | ❌ |

```text
Phone book sorted by (Surname, FirstName)

Surname = 'Rao'                       → jump to the R pages        ✅
Surname = 'Rao' AND FirstName = 'Anu' → jump straight to the entry ✅
FirstName = 'Anu'                     → Anus are on every page     ❌
```

Order in the `WHERE` clause does not matter—`B = 2 AND A = 1` uses the index just as well. Order in the **index definition** is what matters.

---

# Equality First, Then Range

Once a range condition is applied to a column, the columns after it are no longer sorted within the range, so they cannot narrow the seek.

```sql
WHERE CustomerID = 42 AND OrderDate >= DATE '2026-01-01'
```

```text
Index (CustomerID, OrderDate)            Index (OrderDate, CustomerID)
seek to (42, 2026-01-01)                 seek to 2026-01-01
read until CustomerID ≠ 42               read EVERY order since 2026-01-01,
→ reads only matching entries ✅          check CustomerID = 42 on each  ❌
```

**Rule:** columns compared with `=` (or `IN`) first, then at most one range column. Columns after the range column can still be useful for covering or filtering entries, but not for seeking.

```sql
-- Query
WHERE Status = 'Shipped' AND CustomerID = 42 AND OrderDate >= DATE '2026-01-01'

-- Good: two equality columns, then the range
CREATE INDEX IX_Orders_Cust_Status_Date ON Orders (CustomerID, Status, OrderDate);
```

---

# Which Equality Column First?

Among equality columns, order matters less than people think: `(CustomerID, Status)` and `(Status, CustomerID)` both seek directly to `(42, 'Shipped')`. Choose based on **which other queries** the index should also serve:

- If many queries filter on `CustomerID` alone, put it first—the index then also serves them.
- If many queries filter on `Status` alone, put `Status` first.

The old advice "most selective column first" is mostly a myth for equality predicates; reuse by other queries is the better guide.

---

# Supporting ORDER BY

A composite index returns rows sorted by its columns, so it can remove a sort:

```sql
SELECT OrderID, OrderDate, TotalAmount
FROM Orders
WHERE CustomerID = 42
ORDER BY OrderDate DESC
FETCH FIRST 10 ROWS ONLY;
```

With `(CustomerID, OrderDate)`: seek to customer 42, read the last 10 entries backwards, stop. No sort, no reading of older orders.

The rule: equality columns, then the `ORDER BY` columns in the same order (and consistent directions).

| Query | Index `(CustomerID, OrderDate)` avoids the sort? |
|-------|-----------------------------------------------|
| `WHERE CustomerID = 42 ORDER BY OrderDate` | ✅ |
| `WHERE CustomerID = 42 ORDER BY OrderDate DESC` | ✅ (backward scan) |
| `ORDER BY CustomerID, OrderDate` | ✅ |
| `WHERE CustomerID IN (42, 43) ORDER BY OrderDate` | ❌ (two sorted runs; needs merge or sort) |
| `WHERE OrderDate > … ORDER BY CustomerID` | ✅ sort avoided, but range not seekable |
| `ORDER BY OrderDate` | ❌ |

---

# One Composite vs Several Single-Column Indexes

```sql
-- Two single-column indexes
CREATE INDEX IX_Orders_CustomerID ON Orders (CustomerID);
CREATE INDEX IX_Orders_Status     ON Orders (Status);

-- Query
WHERE CustomerID = 42 AND Status = 'Pending'
```

The engine can:

1. use one index and check the other condition on each fetched row; or
2. read both indexes and intersect the row locators (**index merge** in MySQL, **bitmap AND** in PostgreSQL, **index intersection** in SQL Server).

Either is slower than a single composite index `(CustomerID, Status)`, which seeks directly to the matching entries. Index merges are a fallback for ad-hoc combinations, not a design strategy.

---

# Skip Scan

Some engines can use an index even when the leading column is not constrained, by **skipping** through its distinct values:

```sql
-- Index (Status, OrderDate); query has no Status predicate
WHERE OrderDate = DATE '2026-09-01'
```

```text
Skip scan: for each distinct Status ('Cancelled', 'Pending', 'Shipped'):
               seek to (Status, 2026-09-01)
→ 3 seeks instead of a full scan
```

Oracle (9i+), MySQL (8.0.13+), PostgreSQL (18+) and SQLite (when `ANALYZE` statistics show few distinct leading values) support skip scans; SQL Server does not. A skip scan is efficient only when the leading column has few distinct values. It is a pleasant surprise, not something to design for.

---

# Redundant Indexes

An index is redundant if it is a **leading prefix** of another index with the same properties:

```sql
CREATE INDEX IX_Orders_CustomerID      ON Orders (CustomerID);            -- redundant
CREATE INDEX IX_Orders_Customer_Date   ON Orders (CustomerID, OrderDate); -- serves both
```

Every query that can seek `IX_Orders_CustomerID` can seek `IX_Orders_Customer_Date` instead, at almost the same cost. Dropping the shorter one saves space and write work. Exceptions:

- The shorter index is **unique** (it enforces a constraint).
- The shorter index is far narrower and is used for heavy scans.
- A foreign-key constraint relies on it (MySQL requires *some* index whose prefix is the FK column—the longer one also qualifies).

`(A, B)` and `(B, A)` are **not** redundant: they support different prefixes.

---

# How Many Columns?

Each additional key column makes the index wider (fewer entries per page, more I/O) and more expensive to maintain. A good composite index typically has two to four key columns. Extra columns needed only for covering belong in `INCLUDE` where available (Section 10.06).

---

# Visual Representation

```text
Index (A, B, C)

WHERE A = 1                 ├──────── A = 1 ────────┤
WHERE A = 1 AND B = 2           ├── B = 2 ──┤
WHERE A = 1 AND B = 2           ├── B = 2 ──┤
      AND C > 5                       ├C>5┤
WHERE A = 1 AND B > 2                ├── B > 2 … ──┤  (C not seekable inside)
WHERE B = 2                 ✗ entries with B = 2 are spread across every A
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← leading equality columns + one range column form the seek
4. GROUP BY    ← grouping on a leading prefix streams without a hash table
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY    ← columns after the equality prefix supply the order
9. LIMIT / FETCH / TOP  ← ordered index + limit reads only N entries
```

---

# How the DBMS Executes This

```text
WHERE CustomerID = 42 AND Status = 'Shipped' AND OrderDate >= '2026-01-01'
Index (CustomerID, Status, OrderDate)

Seek predicate:     CustomerID = 42 AND Status = 'Shipped' AND OrderDate >= '2026-01-01'
Start key:          (42, 'Shipped', 2026-01-01)
Stop condition:     key > (42, 'Shipped', +∞)
Residual predicate: none
```

Plans distinguish **seek predicates** (used to navigate) from **residual predicates** (checked on each entry read). SQL Server shows *Seek Predicates* vs *Predicate*; PostgreSQL shows *Index Cond* vs *Filter*; Oracle shows *access* vs *filter* predicates. A condition you expected to be a seek predicate showing up as a residual is a sign of wrong column order.

---

# 🔬 Engine Deep Dive

An `IN` list on a leading column is executed as several seeks—one per value—so `WHERE CustomerID IN (42, 43) AND OrderDate >= …` still seeks well on `(CustomerID, OrderDate)`. But the output is two sorted runs, not one, so `ORDER BY OrderDate` still requires a sort (or a merge of the runs). PostgreSQL 17 improved this case by processing `= ANY(array)` in a single index scan pass.

---

# 🏗️ Architecture Insight

Composite index design is **query-driven**: list the important queries, write down each one's equality columns, range column and sort columns, then find the smallest set of column orders that serves them. Often three or four well-ordered composite indexes serve dozens of queries, where a dozen single-column indexes serve none of them well.

---

# ⚡ Performance Tip

For "latest N rows of X" queries—the most common pagination pattern—the index `(X, SortColumn)` turns the query into a seek plus N entries, regardless of how much history X has.

---

# 🔒 Security Note

Composite indexes have no special security properties. As with any index, they copy the values of their columns; avoid including sensitive columns that no query filters on.

---

# SQL Standard vs Vendor Differences

| Feature | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|---------|-----------|-------|-----------|--------|--------|
| Max key columns | 32 | 16 | 32 (2016+) | 32 | Column limit (2000 default) |
| Mixed ASC/DESC keys | ✅ | ✅ (8.0+) | ✅ | ✅ | ✅ |
| Skip scan | ✅ (18+) | ✅ (8.0.13+) | ❌ | ✅ | ✅ (needs `ANALYZE` statistics) |
| Index merge / intersection | Bitmap AND/OR | Index merge | Index intersection | Bitmap conversion | Limited (OR only) |

> **Portability Tip:** Design composite indexes by the leftmost-prefix rule and equality-before-range; that works identically on every engine. Skip scans and index merges vary and should not be relied on.

---

# Common Mistakes

### Mistake 1

Putting a range column before equality columns.

---

### Mistake 2

Creating one index per column and expecting the engine to combine them efficiently.

---

### Mistake 3

Expecting `(A, B)` to serve `WHERE B = …`.

---

### Mistake 4

Keeping `(A)` next to `(A, B)` without a reason.

---

### Mistake 5

Ignoring the `ORDER BY` when designing the index, leaving a sort in every execution.

---

# Best Practices

✔ Equality columns first, then one range or the sort columns.

✔ Order equality columns so the index serves the most other queries.

✔ Match `ORDER BY` column order and directions after the equality prefix.

✔ Prefer one composite index over several single-column indexes.

✔ Drop indexes that are leading prefixes of others, unless unique or needed.

---

# Interview Questions

## Basic

1. What is a composite index?
2. What is the leftmost-prefix rule?
3. Can an index on `(A, B)` be used for `WHERE B = 5`?

## Intermediate

4. Why should equality columns come before range columns?
5. How can one composite index remove both a filter and a sort?
6. Why is `(A)` usually redundant when `(A, B)` exists?

## Advanced

7. What is a skip scan and when is it efficient?
8. How do seek predicates and residual predicates appear in plans?
9. Why does `WHERE A IN (1, 2) ORDER BY B` still need a sort with index `(A, B)`?

---

# Hands-on Exercises

## Exercise 1

Design one index for `WHERE CustomerID = ? AND Status = ? ORDER BY OrderDate DESC FETCH FIRST 20 ROWS ONLY`.

---

## Exercise 2

For the index `(Status, OrderDate)`, list which of ten queries you write can seek it, and which cannot.

---

## Exercise 3

Compare plans for `WHERE CustomerID = 42 AND Status = 'Pending'` with two single-column indexes and with one composite index.

---

## Exercise 4

Find redundant indexes in a schema by comparing column lists with a catalog query.

---

# Related Topics

- **10.02 — How B-Tree Indexes Work**
- **10.06 — Covering Indexes and Included Columns**
- **10.11 — Indexing for JOIN, GROUP BY and ORDER BY**
- **10.15 — Index Design Strategy**
- **06.12 — SARGability and Index-Friendly Predicates**

---

# Summary

A composite index is sorted by its first column, then the second within it, and so on, so it can be seeked only on a leading prefix of its columns. Put equality columns first, then a single range column or the `ORDER BY` columns, so that one index narrows the seek and delivers rows in the required order—ideal for "latest N" queries. Among equality columns, order by reuse across queries rather than by selectivity. One well-ordered composite index beats several single-column indexes combined by index merges or skip scans, and an index that is a leading prefix of another is usually redundant.
