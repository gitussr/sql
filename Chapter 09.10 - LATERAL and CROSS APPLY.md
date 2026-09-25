---
title: "09.10 - LATERAL and CROSS APPLY"
description: "Correlated derived tables: LATERAL joins and SQL Server's CROSS APPLY and OUTER APPLY, top-N per group, several columns from one correlated lookup, reusing computed expressions, unnesting arrays and table functions, and when LATERAL beats a window function."
chapter: 9
section: 9.10
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 30 min
lastUpdated: 2026-09-25
---

# 09.10 LATERAL and CROSS APPLY

---

# Learning Objectives

After completing this section, you will be able to:

- Explain what `LATERAL` adds to a derived table.
- Write `CROSS JOIN LATERAL` / `CROSS APPLY` and `LEFT JOIN LATERAL … ON TRUE` / `OUTER APPLY`.
- Return the top N rows per group.
- Return several columns from one correlated lookup.
- Reuse computed expressions without repeating them.
- Decide between `LATERAL`, a window function and a correlated scalar subquery.

---

# What is LATERAL?

A plain derived table cannot see the other tables in the same `FROM` clause (Section 09.08). A **lateral** derived table can: it is evaluated once for each row of the tables to its left, and may reference their columns.

```sql
-- Each customer's three largest orders
SELECT c.CustomerName, top3.OrderID, top3.TotalAmount
FROM Customers AS c
CROSS JOIN LATERAL (
    SELECT o.OrderID, o.TotalAmount
    FROM Orders AS o
    WHERE o.CustomerID = c.CustomerID          -- references c: needs LATERAL
    ORDER BY o.TotalAmount DESC, o.OrderID
    FETCH FIRST 3 ROWS ONLY
) AS top3;
```

A lateral derived table is a **correlated subquery that returns a table**—several rows and several columns—instead of one value.

---

# The Two Forms

| Behaviour | Standard / PostgreSQL / MySQL / Oracle | SQL Server (and Oracle 12c+) |
|-----------|----------------------------------------|------------------------------|
| Drop outer rows with no inner rows | `CROSS JOIN LATERAL (…) AS t` | `CROSS APPLY (…) AS t` |
| Keep outer rows, `NULL`-fill | `LEFT JOIN LATERAL (…) AS t ON TRUE` | `OUTER APPLY (…) AS t` |

```text
CROSS JOIN LATERAL / CROSS APPLY        LEFT JOIN LATERAL / OUTER APPLY
(like INNER JOIN)                       (like LEFT JOIN)

Customer 4 has no orders → dropped      Customer 4 → kept, OrderID NULL
```

```sql
-- SQL Server
SELECT c.CustomerName, top3.OrderID, top3.TotalAmount
FROM Customers AS c
OUTER APPLY (
    SELECT TOP (3) o.OrderID, o.TotalAmount
    FROM Orders AS o
    WHERE o.CustomerID = c.CustomerID
    ORDER BY o.TotalAmount DESC, o.OrderID
) AS top3;

-- PostgreSQL / MySQL 8.0.14+ / Oracle 12c+
SELECT c.CustomerName, top3.OrderID, top3.TotalAmount
FROM Customers AS c
LEFT JOIN LATERAL (
    SELECT o.OrderID, o.TotalAmount
    FROM Orders AS o
    WHERE o.CustomerID = c.CustomerID
    ORDER BY o.TotalAmount DESC, o.OrderID
    LIMIT 3
) AS top3 ON TRUE;
```

`ON TRUE` is required syntax for `LEFT JOIN LATERAL`: the correlation is inside the subquery, so there is nothing left to join on.

---

# Use 1: Top N per Group

"Top N per group" is the classic `LATERAL` problem. Compare the window-function solution:

```sql
SELECT t.CustomerID, t.OrderID, t.TotalAmount
FROM (
    SELECT o.CustomerID, o.OrderID, o.TotalAmount,
           ROW_NUMBER() OVER (PARTITION BY o.CustomerID
                              ORDER BY o.TotalAmount DESC, o.OrderID) AS rn
    FROM Orders AS o
) AS t
WHERE t.rn <= 3;
```

| | `LATERAL` / `APPLY` | `ROW_NUMBER()` in a derived table |
|---|---------------------|-----------------------------------|
| Reads | N rows per outer row via index | Every row of `Orders` |
| Best when | Few outer rows, many inner rows per group, index on (group, sort) | Most groups needed, or no suitable index |
| Includes groups with no rows | With `LEFT JOIN LATERAL` / `OUTER APPLY` | Needs an extra outer join |

With an index on `Orders(CustomerID, TotalAmount DESC)`, the lateral form reads exactly three index entries per customer. The window form sorts or scans every order.

---

# Use 2: Several Columns from One Lookup

A scalar subquery returns one value. Fetching three columns of the latest order would need three scalar subqueries—three lookups. `LATERAL` does it once:

```sql
SELECT c.CustomerName, lo.OrderID, lo.OrderDate, lo.TotalAmount
FROM Customers AS c
LEFT JOIN LATERAL (
    SELECT o.OrderID, o.OrderDate, o.TotalAmount
    FROM Orders AS o
    WHERE o.CustomerID = c.CustomerID
    ORDER BY o.OrderDate DESC, o.OrderID DESC
    FETCH FIRST 1 ROW ONLY
) AS lo ON TRUE;
```

---

# Use 3: Naming Computed Expressions

`LATERAL` (or `CROSS APPLY` with a `VALUES`/`SELECT` that has no `FROM`) lets you compute an expression once and use its name in later expressions, `WHERE` and `ORDER BY`:

```sql
-- PostgreSQL
SELECT oi.OrderItemID, calc.LineTotal, calc.LineTax
FROM OrderItems AS oi
CROSS JOIN LATERAL (SELECT oi.Quantity * oi.UnitPrice AS LineTotal) AS base
CROSS JOIN LATERAL (SELECT base.LineTotal,
                           ROUND(base.LineTotal * 0.18, 2) AS LineTax) AS calc
WHERE calc.LineTotal > 500;

-- SQL Server
SELECT oi.OrderItemID, base.LineTotal, tax.LineTax
FROM OrderItems AS oi
CROSS APPLY (SELECT oi.Quantity * oi.UnitPrice AS LineTotal) AS base
CROSS APPLY (SELECT ROUND(base.LineTotal * 0.18, 2) AS LineTax) AS tax
WHERE base.LineTotal > 500;
```

Each step can build on the previous one, which a single `SELECT` list cannot do.

---

# Use 4: Unnesting and Table Functions

`LATERAL` is also how a set-returning function receives values from a row:

```sql
-- PostgreSQL: one row per tag in an array column
SELECT p.PostID, t.Tag
FROM Posts AS p
CROSS JOIN LATERAL UNNEST(p.Tags) AS t(Tag);

-- SQL Server: split a delimited string
SELECT p.PostID, s.value AS Tag
FROM Posts AS p
CROSS APPLY STRING_SPLIT(p.TagList, ',') AS s;

-- PostgreSQL: expand a JSON array
SELECT o.OrderID, item->>'sku' AS Sku
FROM OrdersJson AS o
CROSS JOIN LATERAL jsonb_array_elements(o.Payload->'items') AS item;
```

PostgreSQL treats a function call in `FROM` as implicitly lateral, so the keyword is optional there for functions.

---

# LATERAL vs Correlated Scalar Subquery

| Need | Use |
|------|-----|
| One value per outer row | Correlated scalar subquery (simplest) |
| Several columns from the same matching row | `LATERAL` / `APPLY` |
| Several rows per outer row | `LATERAL` / `APPLY` |
| Filter or sort on the looked-up values | Either; `LATERAL` avoids repetition |

---

# Visual Representation

```text
Customers                     LATERAL subquery (runs per customer)
┌───────────┐                 ┌────────────────────────────────────┐
│ 1  Asha   │──── c = 1 ────→ │ top 3 orders of customer 1         │──→ 2 rows
│ 2  Ben    │──── c = 2 ────→ │ top 3 orders of customer 2         │──→ 2 rows
│ 3  Chen   │──── c = 3 ────→ │ top 3 orders of customer 3         │──→ 1 row
│ 4  Dina   │──── c = 4 ────→ │ (none)                             │──→ 0 rows
└───────────┘                 └────────────────────────────────────┘

CROSS JOIN LATERAL → 5 rows (Dina dropped)
LEFT JOIN LATERAL  → 6 rows (Dina with NULLs)
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← LATERAL subqueries run here, once per row of the tables to their left
2. JOIN
3. WHERE       ← can filter on columns the lateral subquery returns
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

Order matters in `FROM`: a lateral subquery can reference only tables listed **before** it.

---

# How the DBMS Executes This

```text
Customers CROSS JOIN LATERAL (… WHERE o.CustomerID = c.CustomerID … LIMIT 3)

Plan
  Nested Loop
    Seq Scan on Customers                          ← outer: each customer
    Limit (3)
      Index Scan Backward on Orders                ← inner: re-run per customer
        using IX_Orders_Customer_Total
        Index Cond: CustomerID = c.CustomerID
```

A lateral join is almost always executed as a **nested loop** with the lateral subquery on the inner side, parameterised by the outer row. Its cost is *outer rows × cost of one inner execution*—cheap with the right index, expensive without one.

---

# 🔬 Engine Deep Dive

Optimizers can sometimes decorrelate a lateral subquery that contains only filtering and aggregation into an ordinary join with a grouped derived table. They cannot do so when it contains a row limit (`LIMIT`, `TOP`, `FETCH FIRST`), because "the first three rows per customer" has no equivalent join without window functions. That is why top-N-per-group lateral queries always show a nested loop, and why the supporting index is essential.

---

# 🏗️ Architecture Insight

`LATERAL` brings a "for each" loop into set-based SQL without giving up the optimizer. It is the natural shape for APIs that return "each parent with its latest N children" and for decomposing semi-structured data (arrays, JSON documents) into rows. When an application currently fetches parents and then issues one query per parent, a single lateral query usually replaces the whole loop—eliminating the N+1 query problem.

---

# ⚡ Performance Tip

Create the index that matches the lateral subquery exactly: equality columns first, then the `ORDER BY` columns in the same direction—`Orders(CustomerID, TotalAmount DESC, OrderID)` for "top orders per customer". Then each lateral execution reads only the rows it returns.

---

# 🔒 Security Note

Table-valued functions invoked through `LATERAL` or `APPLY` run with the privileges defined for the function (definer or invoker). Review functions used this way as carefully as views: a definer-rights function can expose rows the caller could not read directly.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `LATERAL` derived table | ✅ | ✅ (9.3+) | ✅ (8.0.14+) | ❌ | ✅ (12c+) | ❌ |
| `CROSS APPLY` / `OUTER APPLY` | ❌ | ❌ | ❌ | ✅ | ✅ (12c+) | ❌ |
| Implicitly lateral table functions | ✅ | ✅ | `JSON_TABLE` | via `APPLY` | `TABLE()` / `JSON_TABLE` | Table-valued functions (`json_each`) |
| `LEFT JOIN LATERAL … ON TRUE` | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |

> **Portability Tip:** There is no single spelling that runs everywhere. Use `LATERAL` on PostgreSQL, MySQL and Oracle, `APPLY` on SQL Server and Oracle, and a `ROW_NUMBER()` derived table where neither exists (SQLite).

---

# Common Mistakes

### Mistake 1

Using a plain derived table and wondering why the outer alias is not visible.

---

### Mistake 2

Using `CROSS JOIN LATERAL` / `CROSS APPLY` when parents without children must be kept.

---

### Mistake 3

Omitting `ON TRUE` after `LEFT JOIN LATERAL`.

---

### Mistake 4

A row limit with no deterministic `ORDER BY` inside the lateral subquery.

---

### Mistake 5

No index on the lateral subquery's correlation and sort columns, turning each execution into a scan.

---

# Best Practices

✔ Use `LATERAL`/`APPLY` for top N per group when an index supports it.

✔ Use `LEFT JOIN LATERAL … ON TRUE` / `OUTER APPLY` unless dropping empty parents is intended.

✔ Break ties in the lateral `ORDER BY`.

✔ Replace several scalar subqueries on the same row with one lateral subquery.

✔ Compare with the `ROW_NUMBER()` form when most groups are needed.

---

# Interview Questions

## Basic

1. What does `LATERAL` allow that a plain derived table does not?
2. What is SQL Server's equivalent of `LATERAL`?
3. What is the difference between `CROSS APPLY` and `OUTER APPLY`?

## Intermediate

4. How do you return each customer's three most recent orders?
5. Why does `LEFT JOIN LATERAL` need `ON TRUE`?
6. When is `LATERAL` better than a scalar subquery?

## Advanced

7. When is `LATERAL` faster than `ROW_NUMBER()` for top N per group, and when slower?
8. Why can't an optimizer turn a lateral subquery with `LIMIT` into a hash join?
9. How does `LATERAL` solve the N+1 query problem?

---

# Hands-on Exercises

## Exercise 1

Return each department with its two highest-paid employees, keeping departments with no employees.

---

## Exercise 2

Return each product with the date and quantity of its most recent sale.

---

## Exercise 3

Compute `LineTotal` and a discounted total once per order item with `LATERAL` or `APPLY`, and filter on the discounted total.

---

## Exercise 4

Write the top-3-orders-per-customer query both with `LATERAL`/`APPLY` and with `ROW_NUMBER()`, and compare their plans.

---

# Related Topics

- **09.07 — Correlated Subqueries**
- **09.08 — Derived Tables (Subqueries in FROM)**
- **09.15 — Subquery Performance and Index Strategy**
- **07.07 — CROSS JOIN**
- **07.14 — Execution Flow of JOINs (Join Algorithms)**
- **11.xx — Window Functions**

---

# Summary

`LATERAL` turns a derived table into a correlated one: evaluated once per row of the tables to its left, able to reference their columns, and able to return several rows and columns. `CROSS JOIN LATERAL` / `CROSS APPLY` drop outer rows with no result; `LEFT JOIN LATERAL … ON TRUE` / `OUTER APPLY` keep them. It is the natural tool for top N per group, multi-column lookups, stepwise computed expressions and unnesting arrays or JSON. It executes as a parameterised nested loop, so its speed depends on an index that matches the subquery's correlation and ordering; where most groups are needed or no such index exists, a `ROW_NUMBER()` derived table can be faster.
