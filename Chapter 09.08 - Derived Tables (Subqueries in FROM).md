---
title: "09.08 - Derived Tables (Subqueries in FROM)"
description: "Derived tables in depth: subqueries in FROM and JOIN, aliases and column names, pre-aggregation before joins, filtering on computed columns and window results, deduplication, merging versus materialisation, and derived tables versus views and common table expressions."
chapter: 9
section: 9.08
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 35 min
lastUpdated: 2026-09-25
---

# 09.08 Derived Tables (Subqueries in FROM)

---

# Learning Objectives

After completing this section, you will be able to:

- Write a subquery in `FROM` or `JOIN` and give it an alias and column names.
- Pre-aggregate a child table before joining it to its parent.
- Filter on a computed column or window-function result by wrapping it in a derived table.
- Deduplicate or reshape data before joining it.
- Explain when an optimizer merges a derived table and when it materialises one.
- Choose between a derived table, a view and a common table expression.

---

# What is a Derived Table?

A **derived table** (also *inline view*) is a subquery in the `FROM` clause. Its result is a temporary, unnamed table that exists only for the duration of the statement and is given a name by its alias.

```sql
SELECT t.CustomerID, t.OrderCount
FROM (
    SELECT CustomerID, COUNT(*) AS OrderCount
    FROM Orders
    GROUP BY CustomerID
) AS t
WHERE t.OrderCount >= 2;
```

```text
Derived table t
┌────────────┬────────────┐
│ CustomerID │ OrderCount │
├────────────┼────────────┤
│ 1          │ 2          │  ✅
│ 2          │ 2          │  ✅
│ 3          │ 1          │  ❌
└────────────┴────────────┘
```

The outer query treats `t` exactly like a table: it can filter, join, group and sort it.

---

# Syntax Rules

```sql
FROM (subquery) [AS] alias [(column_alias, ...)]
```

- The alias is required on MySQL and SQL Server, and good practice everywhere.
- Every column must have a name: either from the source column, or from `AS` in the subquery, or from a column alias list after the table alias.
- Column names must be unique within the derived table.

```sql
-- Column alias list form
SELECT t.cust, t.n
FROM (SELECT CustomerID, COUNT(*) FROM Orders GROUP BY CustomerID) AS t (cust, n);
```

(The column-list form is supported by PostgreSQL, SQL Server and MySQL 8.0.19+, but not by Oracle or SQLite; naming columns inside the subquery works everywhere.)

---

# Use 1: Pre-Aggregate Before Joining

Section 08.11 showed that joining a parent to two child tables and then summing multiplies rows. The fix is to aggregate each child in its own derived table first:

```sql
SELECT
    c.CustomerID,
    c.CustomerName,
    COALESCE(o.OrderCount, 0)  AS OrderCount,
    COALESCE(o.Revenue, 0)     AS Revenue,
    COALESCE(r.ReturnCount, 0) AS ReturnCount
FROM Customers AS c
LEFT JOIN (
    SELECT CustomerID, COUNT(*) AS OrderCount, SUM(TotalAmount) AS Revenue
    FROM Orders
    GROUP BY CustomerID
) AS o ON o.CustomerID = c.CustomerID
LEFT JOIN (
    SELECT CustomerID, COUNT(*) AS ReturnCount
    FROM Returns
    GROUP BY CustomerID
) AS r ON r.CustomerID = c.CustomerID;
```

```text
Customers (1 row per customer)
   │ LEFT JOIN
   ├── o: 1 row per customer (orders summarised)
   │ LEFT JOIN
   └── r: 1 row per customer (returns summarised)

Each join is 1:1 → no fan-out, totals are correct.
```

This is the single most important use of derived tables.

---

# Use 2: Filter on a Computed Column

`WHERE` cannot reference a `SELECT` alias of the same query. A derived table turns the computed column into a real column:

```sql
-- ❌ WHERE runs before SELECT: LineTotal does not exist yet
SELECT OrderItemID, Quantity * UnitPrice AS LineTotal
FROM OrderItems
WHERE LineTotal > 500;

-- ✅
SELECT t.OrderItemID, t.LineTotal
FROM (
    SELECT OrderItemID, Quantity * UnitPrice AS LineTotal
    FROM OrderItems
) AS t
WHERE t.LineTotal > 500;
```

For a simple expression, repeating it in `WHERE` is equally valid. The derived table earns its place when the expression is long or used several times.

---

# Use 3: Filter on a Window Function

Window functions are computed after `WHERE`, so their results can only be filtered from an outer query:

```sql
-- Each customer's latest order (exactly one per customer)
SELECT t.CustomerID, t.OrderID, t.OrderDate
FROM (
    SELECT
        o.CustomerID,
        o.OrderID,
        o.OrderDate,
        ROW_NUMBER() OVER (PARTITION BY o.CustomerID
                           ORDER BY o.OrderDate DESC, o.OrderID DESC) AS rn
    FROM Orders AS o
) AS t
WHERE t.rn = 1;
```

This is the most common "greatest-N-per-group" solution in modern SQL. Chapter 11 covers `ROW_NUMBER`; the derived table is what makes it filterable.

---

# Use 4: Deduplicate Before Joining

```sql
-- Customers joined to the distinct set of categories they have bought
SELECT c.CustomerName, cat.CategoryID
FROM Customers AS c
JOIN (
    SELECT DISTINCT o.CustomerID, p.CategoryID
    FROM Orders AS o
    JOIN OrderItems AS oi ON oi.OrderID = o.OrderID
    JOIN Products  AS p  ON p.ProductID = oi.ProductID
) AS cat ON cat.CustomerID = c.CustomerID;
```

Deduplicating in the derived table fixes the grain to "one row per customer and category" before the join.

---

# Use 5: Aggregate an Aggregate

Aggregates cannot be nested directly (`AVG(COUNT(*))` is an error on most engines). A derived table computes the inner level first:

```sql
-- Average number of orders per customer (customers with orders)
SELECT AVG(t.OrderCount * 1.0) AS AvgOrdersPerCustomer
FROM (
    SELECT CustomerID, COUNT(*) AS OrderCount
    FROM Orders
    WHERE CustomerID IS NOT NULL
    GROUP BY CustomerID
) AS t;
```

---

# Joining Derived Tables to Each Other

```sql
-- Monthly revenue compared with the same month last year
SELECT cur.Yr, cur.Mon, cur.Revenue, prev.Revenue AS RevenueLastYear
FROM (
    SELECT EXTRACT(YEAR FROM OrderDate) AS Yr, EXTRACT(MONTH FROM OrderDate) AS Mon,
           SUM(TotalAmount) AS Revenue
    FROM Orders GROUP BY EXTRACT(YEAR FROM OrderDate), EXTRACT(MONTH FROM OrderDate)
) AS cur
LEFT JOIN (
    SELECT EXTRACT(YEAR FROM OrderDate) AS Yr, EXTRACT(MONTH FROM OrderDate) AS Mon,
           SUM(TotalAmount) AS Revenue
    FROM Orders GROUP BY EXTRACT(YEAR FROM OrderDate), EXTRACT(MONTH FROM OrderDate)
) AS prev ON prev.Yr = cur.Yr - 1 AND prev.Mon = cur.Mon;
```

The duplication is a readability problem: a common table expression (`WITH monthly AS (…)`) defines the block once and references it twice. Window functions (`LAG`) avoid the self-join altogether.

---

# Derived Tables Cannot See Their Siblings

A plain derived table cannot reference another table in the same `FROM` clause:

```sql
-- ❌ c is not visible inside the derived table
SELECT c.CustomerName, t.LastOrder
FROM Customers AS c
JOIN (
    SELECT MAX(o.OrderDate) AS LastOrder
    FROM Orders AS o
    WHERE o.CustomerID = c.CustomerID
) AS t ON TRUE;
```

That is exactly what `LATERAL` (Section 09.10) adds. Without it, correlate through the join condition: group the derived table by `CustomerID` and join on it.

---

# Derived Table vs View vs CTE

| | Derived table | View | Common table expression (`WITH`) |
|---|---------------|------|----------------------------------|
| Defined | Inline in `FROM` | Once, in the schema | At the top of one statement |
| Reusable | No | Across statements | Within the statement |
| Referenced twice | Must be repeated | ✅ | ✅ |
| Recursive | No | No (unless built on a recursive CTE) | ✅ (`WITH RECURSIVE`) |
| Permissions | Caller's | Can be granted separately | Caller's |
| Optimized as | Merged or materialised | Merged (usually) | Merged or materialised |

Derived tables are best for a single, local intermediate step. When the same block is needed twice, or the query has more than two levels of nesting, move it into a CTE.

---

# Visual Representation

```text
FROM Customers AS c
LEFT JOIN ( ┌──────────────────────────────────┐ ) AS o
            │ SELECT CustomerID, COUNT(*), SUM │
            │ FROM Orders GROUP BY CustomerID  │   ← computed first,
            └──────────────────────────────────┘     one row per customer
                             │
                             ▼
            ┌──────────────────────────────────┐
            │ o: CustomerID | OrderCount | Rev │   ← behaves like a table
            └──────────────────────────────────┘
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← derived tables are built here, each with its own full execution order
2. JOIN        ← and joined here
3. WHERE       ← the outer WHERE can filter on the derived table's computed columns
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

A derived table is the standard way to "move a step earlier": anything computed in its `SELECT`, including aggregates and window functions, becomes an ordinary column available to the outer `WHERE`.

---

# How the DBMS Executes This

```text
Derived table
      │
      ▼
Simple? (no GROUP BY, DISTINCT, LIMIT, window functions, set operations)
      │
 ┌────┴───────────────────────────┐
 ▼                                ▼
Yes → MERGE                      No → MATERIALISE or PIPELINE
  subquery dissolved into the      subquery executed as its own sub-plan;
  outer query; outer predicates    outer predicates on grouping columns
  applied directly to base         may still be PUSHED DOWN into it
  tables                           (e.g. WHERE t.CustomerID = 5 applied
                                   before the GROUP BY)
```

---

# 🔬 Engine Deep Dive

**Predicate pushdown** is what keeps derived tables cheap. In the pre-aggregation example, adding `WHERE c.Country = 'India'` to the outer query does not by itself restrict the `Orders` derived table—it still groups every customer. Some optimizers push join-derived filters into the derived table (SQL Server, Oracle via join predicate pushdown); others group everything and join afterwards. If the outer query is highly selective, `LATERAL` or a correlated subquery can be faster than a derived table, because it aggregates only the rows it needs.

---

# 🏗️ Architecture Insight

Every derived table should have a clear **grain**: "one row per customer", "one row per customer and month". Naming the alias after that grain (`orders_per_customer`, `monthly_revenue`) documents the query and makes join cardinalities checkable at a glance. Most fan-out bugs are derived tables whose grain was never stated.

---

# ⚡ Performance Tip

Filter inside the derived table, not only outside it. A date range or status filter placed inside the subquery reduces the rows it groups; placed outside, it relies on the optimizer to push it down—which is only possible for predicates on columns that pass through unchanged.

---

# 🔒 Security Note

Derived tables are evaluated with the caller's permissions. Unlike a view, a derived table cannot be used to grant access to a subset of a table; use views, row-level security or stored routines for that.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Derived tables | ✅ | ✅ | ✅ | ✅ | ✅ (inline views) | ✅ |
| Alias required | ✅ | Optional (16+) | ✅ | ✅ | Optional | Optional |
| `AS` before alias | Optional | Optional | Optional | Optional | ❌ not allowed | Optional |
| Column alias list `AS t (a, b)` | ✅ | ✅ | ✅ (8.0.19+) | ✅ | ❌ | ❌ |
| Derived table merging | n/a | ✅ | ✅ (5.7+) | ✅ | ✅ | ✅ |

> **Portability Tip:** Oracle rejects `AS` before a table alias. Omitting `AS` for table aliases (`FROM (…) t`) is the one spelling every engine accepts; name columns inside the subquery rather than with a column alias list.

---

# Common Mistakes

### Mistake 1

Omitting the alias:

```sql
-- ❌ MySQL / SQL Server
SELECT * FROM (SELECT CustomerID FROM Orders);
```

---

### Mistake 2

Leaving an aggregate unnamed, then being unable to reference it.

---

### Mistake 3

Joining two 1:N children to a parent and aggregating afterwards instead of aggregating each child in its own derived table.

---

### Mistake 4

Trying to reference a sibling table from inside a derived table without `LATERAL`.

---

### Mistake 5

Expecting an `ORDER BY` inside a derived table to order the final result.

---

# Best Practices

✔ Alias every derived table after its grain.

✔ Name every computed column inside the subquery.

✔ Pre-aggregate each 1:N child before joining it.

✔ Filter as early as possible—inside the derived table.

✔ Move repeated or deeply nested derived tables into CTEs.

---

# Interview Questions

## Basic

1. What is a derived table?
2. Why does a derived table need an alias?
3. How do you filter on a column alias computed in `SELECT`?

## Intermediate

4. How does pre-aggregating in a derived table prevent double counting?
5. How do you filter on the result of `ROW_NUMBER()`?
6. Why can't a derived table reference another table in the same `FROM`?

## Advanced

7. When does an optimizer merge a derived table, and when must it materialise it?
8. What is predicate pushdown into a derived table?
9. When would you choose a CTE or a view over a derived table?

---

# Hands-on Exercises

## Exercise 1

Return each department with its headcount and total payroll, including departments with no employees.

---

## Exercise 2

Return the second most recent order of every customer.

---

## Exercise 3

Return the average, minimum and maximum number of items per order.

---

## Exercise 4

Return customers with their order count and returned-item count, without double counting.

---

# Related Topics

- **08.11 — Aggregating Across JOINs (Fan-Out and Pre-Aggregation)**
- **09.02 — Subquery Syntax and Placement**
- **09.10 — LATERAL and CROSS APPLY**
- **09.13 — Subqueries vs JOINs**
- **05.11 — FROM Clause (Deep Dive)**
- **11.xx — Window Functions**

---

# Summary

A derived table is a subquery in `FROM` whose result, named by its alias, behaves like a table for the rest of the statement. It is the standard way to fix the grain of an intermediate result: pre-aggregating children before joining, deduplicating, aggregating an aggregate, and turning computed columns and window-function results into columns the outer `WHERE` can filter. Simple derived tables are merged into the outer query; those with grouping, limits or window functions are computed as separate steps, with outer filters pushed down where possible. Alias every derived table after its grain, name its columns, and move repeated blocks into common table expressions.
