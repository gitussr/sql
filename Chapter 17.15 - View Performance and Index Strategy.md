---
title: "17.15 - View Performance and Index Strategy"
description: "Making queries on views and materialized views fast: indexing base tables for the combined view and outer predicates, keeping views mergeable and SARGable, declaring keys for join elimination, avoiding barriers, parameterized alternatives such as inline table-valued functions, choosing when to materialize, measuring view overhead, and a step-by-step tuning workflow for slow view-based queries."
chapter: 17
section: 17.15
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 25 min
lastUpdated: 2026-10-09
---

# 17.15 View Performance and Index Strategy

---

# Learning Objectives

After completing this section, you will be able to:

- Index base tables for the predicates that views and their callers combine.
- Write view definitions that stay SARGable and mergeable.
- Use keys and constraints to enable join elimination.
- Replace barrier views with parameterized alternatives.
- Decide when to materialize, and tune slow view-based queries systematically.

---

# Index for the Combined Predicate

A merged view's `WHERE` and the caller's `WHERE` become one predicate. Index for the combination:

```sql
CREATE VIEW PendingOrders AS
SELECT OrderID, CustomerID, OrderDate, TotalAmount
FROM Orders
WHERE Status = 'Pending';

-- typical callers
SELECT * FROM PendingOrders WHERE CustomerID = 42;
SELECT * FROM PendingOrders WHERE OrderDate < CURRENT_DATE - 7;
```

```sql
-- partial / filtered index that matches the view's predicate exactly
CREATE INDEX ix_orders_pending_customer ON Orders (CustomerID) WHERE Status = 'Pending';   -- PostgreSQL, SQLite, SQL Server (filtered)
CREATE INDEX ix_orders_status_customer  ON Orders (Status, CustomerID);                    -- MySQL, Oracle
```

With 1% of orders pending, the partial index is about a hundredth of the size of a full one and serves every caller of the view (Section 10.10).

---

# Keep View Definitions SARGable

Expressions on columns inside a view are applied to every row the caller filters:

```sql
-- ✘ the view hides a function on the column
CREATE VIEW OrdersByDay AS
SELECT OrderID, CAST(OrderDate AS DATE) AS OrderDay, TotalAmount
FROM Orders;

SELECT * FROM OrdersByDay WHERE OrderDay = DATE '2026-10-08';
-- predicate becomes CAST(OrderDate AS DATE) = '2026-10-08' → no plain index seek on OrderDate
-- (SQL Server can still seek for CAST to date; most engines cannot)
```

```sql
-- ✔ expose the raw column too, and filter on it
CREATE VIEW OrdersByDay AS
SELECT OrderID, OrderDate, CAST(OrderDate AS DATE) AS OrderDay, TotalAmount
FROM Orders;

SELECT * FROM OrdersByDay
WHERE OrderDate >= DATE '2026-10-08' AND OrderDate < DATE '2026-10-09';
```

Alternatively, create an expression index matching the view's expression (Section 10.10).

---

# Declare Keys So Joins Can Disappear

```sql
CREATE VIEW OrderWide AS
SELECT o.OrderID, o.OrderDate, o.TotalAmount,
       c.CustomerName, c.Country,
       e.EmployeeName AS SalesRep
FROM Orders o
LEFT JOIN Customers c ON c.CustomerID = o.CustomerID
LEFT JOIN Employees e ON e.EmployeeID = o.SalesRepID;

SELECT OrderID, TotalAmount FROM OrderWide WHERE OrderDate >= DATE '2026-10-01';
```

With primary keys on `Customers.CustomerID` and `Employees.EmployeeID`, both left joins are eliminated, and the query reads only `Orders`. Without the keys, both joins run for nothing. For `INNER JOIN`s, SQL Server and Oracle additionally need **trusted** foreign keys (`WITH CHECK` in SQL Server; validated or `RELY` in Oracle) and `NOT NULL` join columns.

```sql
-- SQL Server: an untrusted FK prevents elimination
SELECT name, is_not_trusted FROM sys.foreign_keys WHERE parent_object_id = OBJECT_ID('dbo.Orders');
ALTER TABLE dbo.Orders WITH CHECK CHECK CONSTRAINT fk_orders_customers;   -- re-validate
```

---

# Replace Barrier Views with Parameterized Logic

A view cannot take parameters, so a filter that cannot be pushed through a barrier is applied after the barrier:

```sql
CREATE VIEW LatestOrderPerCustomer AS
SELECT *
FROM (SELECT o.*, ROW_NUMBER() OVER (PARTITION BY CustomerID ORDER BY OrderDate DESC) AS rn
      FROM Orders o) x
WHERE rn = 1;

SELECT * FROM LatestOrderPerCustomer WHERE CustomerID = 42;              -- ✔ partition column: pushed
SELECT * FROM LatestOrderPerCustomer WHERE OrderDate >= DATE '2026-10-01'; -- ✘ ranks every customer first
```

Parameterized alternatives push the filter inside by construction:

```sql
-- SQL Server: inline table-valued function (expanded like a view, but with parameters)
CREATE FUNCTION dbo.LatestOrders(@Since DATE)
RETURNS TABLE AS RETURN
SELECT o.CustomerID, o.OrderID, o.OrderDate
FROM dbo.Orders o
WHERE o.OrderDate >= @Since
  AND NOT EXISTS (SELECT 1 FROM dbo.Orders o2
                  WHERE o2.CustomerID = o.CustomerID AND o2.OrderDate > o.OrderDate);

-- PostgreSQL: SQL function (inlined when it is a single SELECT and marked STABLE or IMMUTABLE)
CREATE FUNCTION latest_orders(since date) RETURNS TABLE (customerid int, orderid bigint, orderdate date)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT ON (CustomerID) CustomerID, OrderID, OrderDate
  FROM Orders WHERE OrderDate >= since
  ORDER BY CustomerID, OrderDate DESC
$$;
```

Note the two functions answer slightly different questions (latest order overall vs latest order since a date); decide which one the report needs before choosing the shape.

---

# When to Materialize

```text
measure the query on the view:
  ≤ target latency with realistic data and concurrency  → keep the view
  > target, and a better index or rewrite fixes it       → fix the base query (cheapest)
  > target, aggregation over large data, read often,
    staleness acceptable                                  → materialized view / summary table
  > target, must be current, write rate moderate          → SQL Server indexed view / ON COMMIT MV
```

Materialization is the last step, not the first: it adds refresh jobs, storage and staleness that a missing index does not.

---

# Measuring View Overhead

```sql
-- 1. the query on the view
EXPLAIN (ANALYZE, BUFFERS) SELECT … FROM OrderWide WHERE …;
-- 2. the same query written by hand against base tables, with only what it needs
EXPLAIN (ANALYZE, BUFFERS) SELECT … FROM Orders WHERE …;
```

If the buffers and times match, the view has no overhead. If the view version reads more, find the difference in the plan: a join not eliminated, a predicate not pushed, a view materialized, a table read twice.

---

# A Tuning Workflow for View-Based Queries

```text
1. CAPTURE   the actual plan of the slow outer query (Chapter 16)
2. LOCATE    which view blocks are merged, which are fences (Subquery Scan / VIEW / <derivedN>)
3. COUNT     base-table references; duplicates mean a stack problem (17.08)
4. PUSH      are the caller's filters reaching the base tables? if not, why (aggregate, window, limit)?
5. ELIMINATE are unneeded joins removed? if not, declare keys / trusted FKs, or use a narrower view
6. INDEX     index for the combined predicate; partial indexes for view filters
7. RESHAPE   barrier views → parameterized functions, or move filters inside
8. MATERIALIZE only if the remaining cost is inherent and staleness is acceptable
```

---

# Visual Representation

```text
slow query on a view
   │
   ├─ filter not pushed?        → filter on grouping/partition columns, or parameterized function
   ├─ join not eliminated?      → primary keys, trusted FKs, NOT NULL, narrower view
   ├─ table read twice?         → flatten the view stack
   ├─ non-SARGable expression?  → expose raw column, expression index
   ├─ missing index?            → index the combined predicate (partial index for view filter)
   └─ inherent heavy aggregate? → materialize (MV, indexed view, summary table)
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← indexes chosen for base tables after the view is expanded
2. JOIN        ← keys and trusted FKs let unneeded view joins disappear
3. WHERE       ← view predicate + caller predicate = one indexable predicate (when merged)
4. GROUP BY    ← grouped views: index the grouping columns for pushdown and stream aggregation
5. HAVING
6. WINDOW      ← windowed views: index (partition columns, order columns)
7. SELECT      ← covering indexes include the columns callers actually select
8. DISTINCT
9. ORDER BY    ← ordered index access survives merging
10. LIMIT / FETCH / TOP   ← a limit outside a barrier cannot stop the work inside it
```

---

# How the DBMS Executes This

```text
expand view → merge/pushdown → join elimination (needs uniqueness / trusted FK proofs)
→ predicate analysis per base table (SARGable? matches a partial index predicate?)
→ access path costing with statistics → join ordering → execution
materialized alternative: same steps against the MV's stored rows and indexes
```

---

# 🏗️ Architecture Insight

Good view performance is mostly good **schema** hygiene: declared keys, trusted foreign keys, `NOT NULL` where true, consistent data types. Those are the facts the optimizer needs to merge views, eliminate joins and push predicates. Views over a schema without constraints are views the optimizer cannot simplify.

---

# ⚡ Performance Tip

Provide narrow views for hot paths. One wide "everything" view is convenient, but on engines without inner-join elimination a hot query that needs two columns still pays for every join; a narrow view for the hot path costs a few lines of SQL.

---

# 🌍 Production Consideration

When a view becomes slow after a release, check whether the release changed its definition in a way that adds a barrier—a `DISTINCT` to "fix duplicates", a window function, a `TOP`—before looking at data growth.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Partial / filtered indexes | ❌ | ✅ | ❌ | ✅ (filtered) | Function-based workaround | ✅ |
| Left-join elimination | Implementation | ✅ | Limited | ✅ | ✅ | ✅ |
| Inner-join elimination via FK | Implementation | ❌ | ❌ | ✅ (trusted FK) | ✅ (validated/`RELY` FK) | ❌ |
| Parameterized view alternative | ❌ | Inlined SQL functions | Stored procedures | Inline TVFs | Pipelined/SQL macros (21c+) | ❌ |

> **Portability Tip:** Mergeable views, SARGable definitions and indexes on combined predicates help on every engine. Join elimination and parameterized alternatives depend on the engine.

---

# Common Mistakes

### Mistake 1

Indexing for the caller's predicate and ignoring the view's own filter.

---

### Mistake 2

Hiding a function on a column inside a view and filtering on its output.

---

### Mistake 3

Leaving foreign keys untrusted and paying for joins that could be eliminated.

---

### Mistake 4

Materializing a view before checking whether an index or rewrite would fix it.

---

# Best Practices

✔ Index for the combined view and caller predicates; use partial indexes for view filters.

✔ Expose raw columns for filtering; keep definitions SARGable.

✔ Declare primary keys and trusted foreign keys.

✔ Use parameterized functions instead of filtering behind barriers.

✔ Compare view and hand-written plans to measure overhead.

---

# Interview Questions

## Basic

1. Is a query on a view slower than the same query on base tables?
2. Why is a partial index a good match for a filtered view?
3. Why should views expose raw columns for filtering?

## Intermediate

4. What does the optimizer need to eliminate an unused `INNER JOIN` in a view?
5. Why does a filter on a non-partition column not reach the base table in a ranked view?
6. What is an inline table-valued function, and why can it replace a view?

## Advanced

7. Walk through tuning a slow dashboard query built on a three-level view stack.
8. When is materializing the right fix, and what evidence do you need first?

---

# Hands-on Exercises

## Exercise 1

Create `PendingOrders` and a partial (or filtered) index on `CustomerID`; compare plans before and after.

---

## Exercise 2

Create `OrderWide`, query two `Orders` columns, and check which joins are eliminated on your engine.

---

## Exercise 3

Replace `LatestOrderPerCustomer` filtered by date with a parameterized function and compare plans.

---

# Related Topics

- **17.03 — How Views Are Expanded (View Merging and Predicate Pushdown)**
- **10.10 — Partial and Expression Indexes**
- **06.12 — SARGability and Index-Friendly Predicates**
- **15.07 — Writing Optimizer-Friendly SQL**
- **16.11 — Estimates vs Actuals (Finding Cardinality Misestimates)**

---

# Summary

A view's performance is the performance of its expanded query. Index base tables for the combined view and caller predicates—partial indexes match filtered views well—keep view definitions SARGable by exposing raw columns, and declare primary keys and trusted foreign keys so unused joins can be eliminated. Replace filters that cannot pass a barrier with parameterized functions, measure overhead by comparing with hand-written queries, and tune view-based queries systematically from the actual plan. Materialize only when the remaining cost is inherent and staleness is acceptable.
