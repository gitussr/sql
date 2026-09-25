---
title: "10.11 - Indexing for JOIN, GROUP BY and ORDER BY"
description: "Indexes beyond WHERE: foreign-key indexes for nested loop joins, merge joins on ordered indexes, stream aggregation and DISTINCT from index order, removing sorts for ORDER BY and top-N, keyset pagination, MIN/MAX shortcuts, and combining filters with join and sort needs in one index."
chapter: 10
section: 10.11
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 35 min
lastUpdated: 2026-09-25
---

# 10.11 Indexing for JOIN, GROUP BY and ORDER BY

---

# Learning Objectives

After completing this section, you will be able to:

- Index join columns so nested loop joins seek instead of scan.
- Explain how ordered indexes enable merge joins and stream aggregation.
- Design indexes that remove sorts for `ORDER BY` and top-N queries.
- Implement keyset pagination backed by an index.
- Use index order for `MIN`, `MAX` and `DISTINCT`.
- Combine filter, join and sort requirements in one composite index.

---

# Indexes Serve More Than WHERE

```text
Clause        What the index provides                          Section
────────────  ───────────────────────────────────────────────  ───────
WHERE         a seek to matching rows                          10.05
JOIN          a seek per outer row / ordered input for merge   07.15
GROUP BY      rows arriving grouped → stream aggregate         08.15
ORDER BY      rows arriving sorted → no sort                   —
LIMIT/FETCH   stop after N rows because order is known         —
EXISTS / IN   probe and stop at the first match                09.15
MIN / MAX     first / last entry                               08.15
```

This section pulls these threads together.

---

# Indexing for Joins

For a nested loop join, the **inner** table is probed once per outer row. It needs an index whose leading column is the join column:

```sql
SELECT c.CustomerName, o.OrderID, o.OrderDate
FROM Customers AS c
JOIN Orders AS o ON o.CustomerID = c.CustomerID
WHERE c.Country = 'India';
```

```text
Without IX_Orders_CustomerID           With IX_Orders_CustomerID
Hash Join                              Nested Loop
  Seq Scan Orders (5 M rows)             Index Scan Customers (Country = 'India')  → 900 rows
  Hash: Customers (India)                Index Scan Orders (CustomerID = c.id)     → 900 seeks
```

Rules:

- Index every **foreign key** column that is used in joins—the referencing side (`Orders.CustomerID`, `OrderItems.OrderID`, `OrderItems.ProductID`). The referenced side is a primary key and already indexed.
- Put the join column **after** equality filters on the same table if both appear: for `JOIN … ON o.CustomerID = c.CustomerID WHERE o.Status = 'Pending'`, `(CustomerID, Status)` or `(Status, CustomerID)` both work as seeks per outer row; prefer the order that also serves other queries.
- Cover the inner table's selected columns if the join is hot (Section 10.06).

Hash joins do not need indexes on the join columns; they read each input once. Indexes still help them through the filters that shrink each input.

---

# Merge Joins from Index Order

A merge join needs both inputs sorted on the join key. Indexes on the join columns supply that order without sorting:

```sql
SELECT o.OrderID, SUM(oi.Quantity * oi.UnitPrice)
FROM Orders AS o
JOIN OrderItems AS oi ON oi.OrderID = o.OrderID
GROUP BY o.OrderID;
```

```text
Merge Join (o.OrderID = oi.OrderID)
  Index Scan on PK_Orders                    ← ordered by OrderID
  Index Scan on IX_OrderItems_OrderID        ← ordered by OrderID
→ then Stream Aggregate by OrderID (already ordered)
```

This is attractive for large joins where both sides are read in full and a hash table would spill to disk.

---

# Indexing for GROUP BY

An index whose leading columns are the grouping columns delivers rows already grouped, allowing a **stream aggregate** that uses almost no memory and returns first groups immediately:

```sql
SELECT CustomerID, COUNT(*), SUM(TotalAmount)
FROM Orders
GROUP BY CustomerID;

CREATE INDEX IX_Orders_Cust_Total ON Orders (CustomerID) INCLUDE (TotalAmount);
-- MySQL / Oracle / SQLite: (CustomerID, TotalAmount)
```

With a filter, put equality columns first, then the grouping columns:

```sql
SELECT CustomerID, SUM(TotalAmount)
FROM Orders
WHERE Status = 'Shipped'
GROUP BY CustomerID;

CREATE INDEX IX_Orders_Status_Cust ON Orders (Status, CustomerID) INCLUDE (TotalAmount);
```

A range filter before the grouping column breaks the order (as for `ORDER BY`): `WHERE OrderDate >= … GROUP BY CustomerID` cannot stream from `(OrderDate, CustomerID)`.

---

# DISTINCT and Loose Index Scans

`SELECT DISTINCT CustomerID FROM Orders` can be answered by reading an index on `CustomerID` in order and skipping duplicates. Some engines go further and **skip** from one distinct value to the next instead of reading every entry:

```text
Loose index scan (MySQL "Using index for group-by", Oracle skip scan, PostgreSQL 18 skip scan)

seek first CustomerID → 1
seek first key > 1    → 2
seek first key > 2    → 7
…                      one seek per distinct value, not one read per row
```

Very effective when there are few distinct values among many rows. Where the engine does not do it automatically, a recursive CTE can emulate it.

---

# MIN and MAX

```sql
SELECT MAX(OrderDate) FROM Orders;                           -- index on OrderDate: last entry
SELECT MAX(OrderDate) FROM Orders WHERE CustomerID = 42;     -- index (CustomerID, OrderDate)
```

Both are answered with one seek. `MIN`/`MAX` per group (`GROUP BY CustomerID`) can use the same index with a stream aggregate or a loose scan.

---

# Indexing for ORDER BY

An index in the requested order removes the sort. The rules:

1. All `ORDER BY` columns come from one table and one index.
2. Equality-filtered columns may precede them in the index.
3. The `ORDER BY` columns follow in the same order.
4. Directions match the index—or are all reversed (backward scan).

```sql
-- Index (Status, OrderDate DESC, OrderID DESC)
WHERE Status = 'Shipped' ORDER BY OrderDate DESC, OrderID DESC     -- ✅ no sort
WHERE Status = 'Shipped' ORDER BY OrderDate ASC,  OrderID ASC      -- ✅ backward scan
WHERE Status = 'Shipped' ORDER BY OrderDate DESC, OrderID ASC      -- ❌ mixed vs index
WHERE Status IN ('Shipped', 'Pending') ORDER BY OrderDate DESC     -- ❌ two runs → sort/merge
ORDER BY OrderDate DESC                                            -- ❌ Status not fixed
```

Removing a sort matters most when combined with a row limit.

---

# Top-N Queries

```sql
SELECT OrderID, OrderDate, TotalAmount
FROM Orders
WHERE CustomerID = 42
ORDER BY OrderDate DESC
FETCH FIRST 10 ROWS ONLY;
```

```text
Without a suitable index                With (CustomerID, OrderDate)
read all 5 000 orders of customer 42    seek to (42, max date)
sort them                               read 10 entries backwards
return 10                               stop
```

Plans show this as `Limit` over an `Index Scan Backward` (PostgreSQL), `Top` over an `Index Seek` with no Sort (SQL Server), or `COUNT STOPKEY` (Oracle).

---

# Keyset Pagination

`OFFSET` pagination reads and discards every skipped row:

```sql
-- Page 5 000: reads 100 000 entries to return 20
SELECT OrderID, OrderDate FROM Orders
ORDER BY OrderDate DESC, OrderID DESC
OFFSET 100000 ROWS FETCH NEXT 20 ROWS ONLY;
```

**Keyset** (seek) pagination remembers the last row returned and seeks past it:

```sql
-- Next page after (2026-08-14, 91822)
SELECT OrderID, OrderDate FROM Orders
WHERE (OrderDate, OrderID) < (DATE '2026-08-14', 91822)
ORDER BY OrderDate DESC, OrderID DESC
FETCH FIRST 20 ROWS ONLY;

-- Engines without row-value comparison (SQL Server):
WHERE OrderDate < '2026-08-14'
   OR (OrderDate = '2026-08-14' AND OrderID < 91822)
```

With an index on `(OrderDate DESC, OrderID DESC)`, every page costs the same—one seek plus 20 entries—whether it is page 2 or page 5 000. The unique tiebreaker (`OrderID`) is essential; without it, rows with equal dates can be skipped or repeated.

---

# One Index, Several Jobs

A single well-ordered index can serve filter, join, sort and covering at once:

```sql
-- "Customer's recent shipped orders" page
SELECT o.OrderID, o.OrderDate, o.TotalAmount
FROM Orders AS o
WHERE o.CustomerID = ? AND o.Status = 'Shipped'
ORDER BY o.OrderDate DESC
FETCH FIRST 20 ROWS ONLY;

CREATE INDEX IX_Orders_Cust_Status_Date
ON Orders (CustomerID, Status, OrderDate DESC) INCLUDE (TotalAmount);
```

```text
CustomerID, Status   → equality seek
OrderDate DESC       → order for ORDER BY + early stop for FETCH
INCLUDE TotalAmount  → covering, no lookups
(OrderID)            → clustering key on SQL Server / InnoDB, already present
```

The same index also serves the join `Customers → Orders` on `CustomerID`.

---

# Visual Representation

```text
Index (CustomerID, Status, OrderDate DESC) INCLUDE (TotalAmount)

┌──────────── CustomerID = 42 ─────────────────────────────┐
│ ┌── Status = 'Cancelled' ──┐ ┌── Status = 'Shipped' ────┐ │
│ │ 2026-09 … 2024-01        │ │ 2026-09-02 ◀── start     │ │
│ └──────────────────────────┘ │ 2026-08-30               │ │
│                              │ …  (20 entries) ── stop  │ │
│                              └──────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN        ← inner-side join column index → index nested loop; ordered indexes → merge join
3. WHERE       ← equality columns fix a slice of the index
4. GROUP BY    ← grouping columns next in the index → stream aggregate
5. HAVING
6. SELECT      ← INCLUDE columns → no lookups
7. DISTINCT    ← index order → dedupe without hashing (or loose scan)
8. ORDER BY    ← sort columns next in the index → no sort
9. LIMIT / FETCH / TOP  ← known order → stop after N entries
```

---

# How the DBMS Executes This

```text
SELECT … WHERE CustomerID = ? AND Status = 'Shipped' ORDER BY OrderDate DESC FETCH FIRST 20

With the index:                         Without it:
Limit (20)                              Limit (20)
  Index Only Scan                         Sort (OrderDate DESC)     ← top-N heapsort
    Index Cond: CustomerID = ?              Bitmap Heap Scan / Seq Scan
            AND Status = 'Shipped'            Filter: CustomerID = ? AND Status = …
    (rows=20, stops early)                (reads every matching row)
```

---

# 🔬 Engine Deep Dive

When no index supplies order, engines use a **top-N sort** for `ORDER BY … LIMIT N`: a bounded heap of N rows, so memory stays small, but every qualifying row must still be read. The index-ordered plan is different in kind: it reads only N entries. That is why adding the sort column to an index can turn a query that scales with the customer's history into one that takes constant time.

---

# 🏗️ Architecture Insight

API design and index design meet at pagination. Endpoints that expose `?page=5000` force `OFFSET` pagination whose cost grows with the page number; endpoints that expose an opaque cursor (`?after=2026-08-14_91822`) allow keyset pagination with constant cost. Choosing the cursor style early saves an index redesign later.

---

# ⚡ Performance Tip

For every list screen in an application, write down its filter, sort and page size, and make sure one index has the filter's equality columns followed by the sort columns. List screens are the most frequently executed queries in most OLTP systems.

---

# 🔒 Security Note

Keyset cursors expose sort-key values (dates, IDs) to clients. Encode or sign them if those values are sensitive or if clients must not craft cursors that jump into data they should not page through; always re-apply authorisation filters on each page request.

---

# SQL Standard vs Vendor Differences

| Feature | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|---------|-----------|-------|-----------|--------|--------|
| Backward index scan | ✅ | ✅ (8.0+) | ✅ | ✅ | ✅ |
| Row-value comparison for keyset | ✅ | ✅ | ❌ | ✅ | ✅ |
| Loose index scan for `DISTINCT`/`GROUP BY` | ✅ (18+ skip scan) | ✅ | ❌ | Skip scan | Skip scan (with `ANALYZE`) |
| Top-N stop key in plan | `Limit` | `LIMIT` | `Top` | `COUNT STOPKEY` | `LIMIT` |
| Incremental sort (partial order from index) | ✅ (13+) | ❌ | ❌ | ❌ | ❌ |

> **Portability Tip:** Keyset pagination with an explicit `OR` expansion runs on every engine; the row-value form is shorter where supported.

---

# Common Mistakes

### Mistake 1

Leaving foreign key columns unindexed, so every join to the child table scans it.

---

### Mistake 2

Designing the index for the filter and forgetting the `ORDER BY`, leaving a sort of every matching row.

---

### Mistake 3

Deep `OFFSET` pagination on large tables.

---

### Mistake 4

Keyset pagination without a unique tiebreaker.

---

### Mistake 5

Mixed sort directions that do not match any index.

---

# Best Practices

✔ Index foreign key columns used in joins.

✔ Equality columns, then grouping or sort columns, then `INCLUDE` for returned columns.

✔ Use keyset pagination for deep or infinite lists.

✔ Give every sorted list a unique tiebreaker column.

✔ Check plans for `Sort` operators under `Limit`/`Top`.

---

# Interview Questions

## Basic

1. Which column should be indexed to speed up `Orders JOIN Customers`?
2. How can an index remove a sort?
3. Why is `MAX(OrderDate)` fast with an index on `OrderDate`?

## Intermediate

4. How does an index enable stream aggregation?
5. What is keyset pagination and why is it faster than `OFFSET`?
6. Why does `WHERE Status IN ('A','B') ORDER BY OrderDate` still sort with `(Status, OrderDate)`?

## Advanced

7. When would an optimizer choose a merge join over index nested loops?
8. What is a loose index scan?
9. How can one index serve a filter, a join, a sort and a projection at once?

---

# Hands-on Exercises

## Exercise 1

Create the index that removes the sort from "latest 20 orders of a customer" and verify the plan reads only 20 entries.

---

## Exercise 2

Implement keyset pagination for orders sorted by date and ID, and compare page 1 and page 5 000 timings with `OFFSET`.

---

## Exercise 3

Find all unindexed foreign key columns in the sample schema with a catalog query.

---

## Exercise 4

Make `SELECT CustomerID, SUM(TotalAmount) FROM Orders WHERE Status = 'Shipped' GROUP BY CustomerID` use a stream aggregate.

---

# Related Topics

- **07.15 — JOIN Performance and Index Strategy**
- **08.15 — GROUP BY Performance and Index Strategy**
- **09.15 — Subquery Performance and Index Strategy**
- **10.05 — Composite Indexes and Column Order**
- **10.06 — Covering Indexes and Included Columns**

---

# Summary

Indexes accelerate far more than `WHERE`. An index on the inner join column turns joins into cheap per-row seeks, ordered indexes feed merge joins and stream aggregation, and index order serves `DISTINCT`, `MIN`/`MAX` and `ORDER BY` without sorting. Combined with a row limit, an index in sort order reads only N entries, which is what makes top-N lists and keyset pagination run in constant time. The design pattern is consistent: equality columns first, then grouping or sort columns in matching direction, then included columns for coverage—often letting one index serve a query's filter, join, sort and projection together.
