---
title: "09.03 - Scalar Subqueries"
description: "Scalar subqueries in depth: the one-row-one-column contract, scalar subqueries in WHERE, SELECT, ORDER BY and expressions, empty results and NULL, guaranteeing a single row, and when a join or window function is the better tool."
chapter: 9
section: 9.03
category: Data Query Language (DQL)
difficulty: Beginner → Intermediate
readingTime: 30 min
lastUpdated: 2026-09-25
---

# 09.03 Scalar Subqueries

---

# Learning Objectives

After completing this section, you will be able to:

- State the contract of a scalar subquery: at most one row, exactly one column.
- Use scalar subqueries in `WHERE`, `SELECT`, `ORDER BY` and arithmetic expressions.
- Predict the result when a scalar subquery finds no rows or several rows.
- Guarantee a single row with a key, an aggregate or a row limit.
- Recognise when a join or a window function should replace a scalar subquery.

---

# What is a Scalar Subquery?

A **scalar subquery** returns a single value: one row with one column. It can be used anywhere an expression of that type can—a literal, a column, a function call.

```sql
SELECT (SELECT MAX(OrderDate) FROM Orders) AS LatestOrderDate;
```

```text
┌─────────────────┐
│ LatestOrderDate │
├─────────────────┤
│ 2026-09-24      │
└─────────────────┘
```

---

# The Contract

| Rows returned | Result |
|---------------|--------|
| 0 | `NULL` |
| 1 | That row's value |
| 2 or more | **Run-time error** |

```text
PostgreSQL:  ERROR: more than one row returned by a subquery used as an expression
SQL Server:  Subquery returned more than 1 value. This is not permitted when the
             subquery follows =, !=, <, <= , >, >= or when the subquery is used
             as an expression.
MySQL:       ERROR 1242: Subquery returns more than 1 row
Oracle:      ORA-01427: single-row subquery returns more than one row
SQLite:      (no error) silently uses the first row
```

The error is raised only when the data actually produces two rows. A query that passes every test can fail in production the day a duplicate appears—unless the subquery is written so that two rows are impossible.

---

# Guaranteeing One Row

There are three reliable ways:

```sql
-- 1. Filter on a unique key
(SELECT c.CustomerName FROM Customers AS c WHERE c.CustomerID = o.CustomerID)

-- 2. Aggregate (always exactly one row without GROUP BY)
(SELECT MAX(o.OrderDate) FROM Orders AS o WHERE o.CustomerID = c.CustomerID)

-- 3. Row limit with a deterministic order
(SELECT o.OrderID
 FROM Orders AS o
 WHERE o.CustomerID = c.CustomerID
 ORDER BY o.OrderDate DESC, o.OrderID DESC
 FETCH FIRST 1 ROW ONLY)
```

Option 1 relies on a constraint—if the key is only unique by convention, it is not a guarantee. Option 2 is the most robust. Option 3 needs a tiebreaker in `ORDER BY`, or the chosen row can change between executions.

---

# Scalar Subqueries in WHERE

```sql
-- Orders larger than the average order
SELECT o.OrderID, o.TotalAmount
FROM Orders AS o
WHERE o.TotalAmount > (SELECT AVG(TotalAmount) FROM Orders);

-- Orders placed on the most recent order date
SELECT o.OrderID
FROM Orders AS o
WHERE o.OrderDate = (SELECT MAX(OrderDate) FROM Orders);
```

Both subqueries are uncorrelated: evaluated once, then used as a constant.

---

# Scalar Subqueries in the SELECT List

```sql
SELECT
    c.CustomerID,
    c.CustomerName,
    (SELECT COUNT(*)
     FROM Orders AS o
     WHERE o.CustomerID = c.CustomerID)        AS OrderCount,
    (SELECT MAX(o.OrderDate)
     FROM Orders AS o
     WHERE o.CustomerID = c.CustomerID)        AS LastOrderDate
FROM Customers AS c;
```

```text
┌────────────┬──────────────┬────────────┬───────────────┐
│ CustomerID │ CustomerName │ OrderCount │ LastOrderDate │
├────────────┼──────────────┼────────────┼───────────────┤
│ 1          │ Asha         │ 2          │ 2026-08-14    │
│ 2          │ Ben          │ 2          │ 2026-09-02    │
│ 3          │ Chen         │ 1          │ 2026-03-30    │
│ 4          │ Dina         │ 0          │ NULL          │  ← no orders
└────────────┴──────────────┴────────────┴───────────────┘
```

Note the behaviour for Dina: `COUNT(*)` over no rows is `0`, `MAX` over no rows is `NULL`. Unlike an inner join, a scalar subquery in the `SELECT` list never removes the outer row; it behaves like a `LEFT JOIN` to a one-row result.

---

# Scalar Subqueries in Expressions

A scalar subquery is an ordinary value and can be combined with anything:

```sql
-- Each product's price as a percentage of the most expensive product
SELECT
    p.ProductName,
    p.ListPrice,
    ROUND(100.0 * p.ListPrice / (SELECT MAX(ListPrice) FROM Products), 1) AS PctOfMax
FROM Products AS p;

-- Share of revenue per order
SELECT
    o.OrderID,
    o.TotalAmount / NULLIF((SELECT SUM(TotalAmount) FROM Orders), 0) AS RevenueShare
FROM Orders AS o;
```

`NULLIF(…, 0)` guards against division by zero when the table is empty.

---

# Scalar Subqueries in ORDER BY

```sql
-- Customers ordered by their most recent order, newest first
SELECT c.CustomerID, c.CustomerName
FROM Customers AS c
ORDER BY (
    SELECT MAX(o.OrderDate)
    FROM Orders AS o
    WHERE o.CustomerID = c.CustomerID
) DESC NULLS LAST;
```

It works, but the value is usually worth showing: moving the subquery into the `SELECT` list and ordering by its alias is clearer. (`NULLS LAST` is PostgreSQL/Oracle syntax.)

---

# Handling the Empty Case

An empty scalar subquery is `NULL`, and `NULL` propagates:

```sql
SELECT
    c.CustomerName,
    (SELECT SUM(o.TotalAmount)
     FROM Orders AS o
     WHERE o.CustomerID = c.CustomerID) AS Revenue          -- NULL for Dina
FROM Customers AS c;

-- If "no orders" should read as 0:
COALESCE((SELECT SUM(o.TotalAmount)
          FROM Orders AS o
          WHERE o.CustomerID = c.CustomerID), 0) AS Revenue
```

In `WHERE`, an empty scalar subquery makes the comparison UNKNOWN, so no rows match:

```sql
-- If Products is empty, AVG is NULL and nothing is returned
WHERE ListPrice > (SELECT AVG(ListPrice) FROM Products)
```

---

# Scalar Subquery vs Join vs Window Function

The same "order count per customer" three ways:

```sql
-- Scalar subquery: one lookup per customer
SELECT c.CustomerID,
       (SELECT COUNT(*) FROM Orders o WHERE o.CustomerID = c.CustomerID) AS OrderCount
FROM Customers AS c;

-- Join to a grouped derived table
SELECT c.CustomerID, COALESCE(s.OrderCount, 0) AS OrderCount
FROM Customers AS c
LEFT JOIN (SELECT CustomerID, COUNT(*) AS OrderCount
           FROM Orders GROUP BY CustomerID) AS s
       ON s.CustomerID = c.CustomerID;

-- Window function: detail rows plus a group figure
SELECT o.OrderID, o.CustomerID,
       COUNT(*) OVER (PARTITION BY o.CustomerID) AS CustomerOrderCount
FROM Orders AS o;
```

| Need | Best fit |
|------|----------|
| One or two looked-up values per row | Scalar subquery |
| Several aggregates from the same child table | Join to a grouped derived table (one pass) |
| Detail rows alongside their group's figure | Window function (Chapter 11) |

Five scalar subqueries against the same child table are five separate lookups; one grouped derived table computes all five aggregates in one pass.

---

# Visual Representation

```text
for each outer row ─────────────────────────────┐
                                                ▼
Customers row (CustomerID = 2) ──→ ( SELECT COUNT(*) FROM Orders
                                     WHERE CustomerID = 2 )  ──→ 2
                                                │
                                                ▼
                               output row: 2 | Ben | 2
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← scalar subqueries in conditions are evaluated here
4. GROUP BY
5. HAVING
6. SELECT      ← scalar subqueries in the SELECT list are evaluated here, per surviving row
7. DISTINCT
8. ORDER BY    ← or here, when used only for sorting
9. LIMIT / FETCH / TOP
```

Because `SELECT`-list subqueries run after `WHERE`, filtering first reduces how many times they are evaluated.

---

# How the DBMS Executes This

```text
Uncorrelated scalar subquery          Correlated scalar subquery
─────────────────────────────         ───────────────────────────────────
InitPlan (once) → $0                  Option A: SubPlan per outer row
Filter: TotalAmount > $0                        (often with a result cache
                                                keyed on the outer value)
                                      Option B: rewritten as LEFT JOIN
                                                to a grouped derived table
```

SQL Server and Oracle routinely rewrite correlated scalar aggregates into outer joins with aggregation. PostgreSQL executes them as a SubPlan per row, and since version 14 can place a *Memoize* cache in front of repeated parameterised lookups (for subqueries that have been turned into joins).

---

# 🔬 Engine Deep Dive

To enforce the single-row contract, the executor must read one row beyond the first to prove there is no second. Plans therefore show an *Assert* (SQL Server) or an equivalent check above a non-aggregated scalar subquery. With a unique index on the lookup column, the optimizer knows at most one row can match and removes the check.

---

# 🏗️ Architecture Insight

A scalar subquery is an **assertion about your data model**: "for this row there is at most one X." When that assertion is backed by a primary or unique key, the query is correct by construction. When it is not, the query encodes an assumption that the database is not enforcing—which is exactly the kind of assumption that breaks after a migration or a bulk import.

---

# ⚡ Performance Tip

Correlated scalar subqueries in the `SELECT` list need an index on the correlated column (`Orders(CustomerID)` above). Without one, each outer row triggers a scan of the child table. With one, each is a cheap index seek.

---

# 🔒 Security Note

A scalar subquery in the `SELECT` list can expose data from a table the outer query does not obviously touch. Review subqueries in views and reports as carefully as their `FROM` clauses when deciding who may see them.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Scalar subquery anywhere an expression is allowed | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Error on more than one row | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (first row used) |
| Empty result → `NULL` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Scalar subquery in `GROUP BY` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Row limit inside scalar subquery | `FETCH FIRST` | `LIMIT` / `FETCH` | `LIMIT` | `TOP` / `OFFSET … FETCH` | `FETCH FIRST` (12c+) | `LIMIT` |

> **Portability Tip:** SQLite's "first row wins" behaviour hides bugs that other engines report. Test scalar subqueries on your production engine, and back them with a key or aggregate so the question never arises.

---

# Common Mistakes

### Mistake 1

A scalar subquery with no uniqueness guarantee:

```sql
-- ❌ fails once a customer has two addresses
(SELECT a.City FROM Addresses AS a WHERE a.CustomerID = c.CustomerID)
```

---

### Mistake 2

Assuming an empty subquery returns `0`:

```sql
-- ❌ NULL for customers without orders
(SELECT SUM(TotalAmount) FROM Orders o WHERE o.CustomerID = c.CustomerID)
```

---

### Mistake 3

Writing several scalar subqueries against the same child table instead of one grouped derived table.

---

### Mistake 4

`FETCH FIRST 1 ROW` without a tiebreaker, so the chosen row is arbitrary.

---

# Best Practices

✔ Back every scalar subquery with a unique key, an aggregate, or an ordered row limit.

✔ Wrap nullable aggregates in `COALESCE` when "none" means zero.

✔ Index the correlated column of every scalar subquery on a large table.

✔ Replace repeated scalar subqueries on one table with a join to a grouped derived table.

✔ Filter in `WHERE` before computing `SELECT`-list subqueries.

---

# Interview Questions

## Basic

1. What is a scalar subquery?
2. What does a scalar subquery return when it finds no rows?
3. Where may a scalar subquery appear?

## Intermediate

4. What happens when a scalar subquery returns two rows?
5. Why does `(SELECT COUNT(*) …)` return `0` for a customer without orders, while `(SELECT SUM(…) …)` returns `NULL`?
6. How does a scalar subquery in the `SELECT` list differ from an inner join?

## Advanced

7. Why does a non-aggregated scalar subquery need an Assert operator in the plan?
8. When is a join to a grouped derived table better than several scalar subqueries?
9. Why is "more than one row" a run-time error, and how do you make it impossible?

---

# Hands-on Exercises

## Exercise 1

Return every order with its customer's name using a scalar subquery.

---

## Exercise 2

Return every customer with their revenue, showing `0` for customers without orders.

---

## Exercise 3

Return each product with its price as a percentage of the average list price.

---

## Exercise 4

Return each customer with the ID of their most recent order, breaking ties by the higher `OrderID`.

---

# Related Topics

- **09.02 — Subquery Syntax and Placement**
- **09.07 — Correlated Subqueries**
- **09.08 — Derived Tables (Subqueries in FROM)**
- **09.12 — NULL Handling in Subqueries**
- **08.04 — NULL Handling in Aggregates**
- **11.xx — Window Functions**

---

# Summary

A scalar subquery returns one value and may appear wherever an expression can. Its contract is strict: no rows yields `NULL`, one row yields its value, and two or more rows raise a run-time error on every engine except SQLite. Guarantee a single row with a unique key, an aggregate or an ordered row limit, and wrap nullable results in `COALESCE` when "none" should mean zero. In the `SELECT` list a scalar subquery keeps every outer row, like a `LEFT JOIN`; when several values come from the same child table, a join to a grouped derived table computes them in one pass.
