---
title: "09.02 - Subquery Syntax and Placement"
description: "The grammar of subqueries: parentheses, aliases and scope, what a subquery may contain, row subqueries and row-value comparisons, ORDER BY and LIMIT inside subqueries, and the rules for each clause a subquery can appear in."
chapter: 9
section: 9.02
category: Data Query Language (DQL)
difficulty: Beginner → Intermediate
readingTime: 30 min
lastUpdated: 2026-09-25
---

# 09.02 Subquery Syntax and Placement

---

# Learning Objectives

After completing this section, you will be able to:

- Write a syntactically valid subquery in every clause that accepts one.
- Explain how name resolution and scope work between inner and outer queries.
- State what a subquery may and may not contain.
- Compare row values with row subqueries.
- Explain when `ORDER BY` inside a subquery means something and when it is ignored.

---

# The Basic Rules

```sql
( SELECT select_list
  FROM ...
  [WHERE ...]
  [GROUP BY ...]
  [HAVING ...]
  [ORDER BY ... FETCH FIRST n ROWS ONLY] )
```

1. A subquery is always enclosed in **parentheses**.
2. It is a complete `SELECT`: it may have its own `FROM`, `WHERE`, `GROUP BY`, `HAVING`, joins and nested subqueries.
3. Its result must have the **shape** the surrounding context expects (one value, one column, or a table).
4. A subquery in `FROM` must be given an **alias** on most engines.
5. It ends with no semicolon—the semicolon belongs to the outer statement.

---

# Scope and Name Resolution

Columns inside a subquery are resolved from the innermost scope outwards.

```sql
SELECT e.EmployeeName
FROM Employees AS e                                   -- outer scope: e
WHERE e.Salary > (
    SELECT AVG(e2.Salary)
    FROM Employees AS e2                              -- inner scope: e2
    WHERE e2.DepartmentID = e.DepartmentID            -- e is visible from inside
);
```

```text
Scope visibility

┌─ outer query ─────────────── sees: e ────────────────┐
│                                                      │
│   ┌─ subquery ─────────── sees: e2 and e ────────┐   │
│   │                                              │   │
│   └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘

The outer query can NOT see e2.
```

Rules that follow from this:

- The subquery can reference the outer query's tables (that makes it correlated).
- The outer query cannot reference tables or aliases defined inside the subquery—except the columns a derived table exposes.
- When the same table appears in both scopes, **different aliases are mandatory for clarity** and often for correctness.

---

# Where Each Shape Fits

| Position | Required shape | Example |
|----------|----------------|---------|
| `SELECT` list | Scalar | `(SELECT COUNT(*) FROM Orders o WHERE o.CustomerID = c.CustomerID) AS Orders` |
| `WHERE x op (…)` | Scalar | `WHERE ListPrice > (SELECT AVG(ListPrice) FROM Products)` |
| `WHERE x IN (…)` | One column | `WHERE CustomerID IN (SELECT CustomerID FROM Orders)` |
| `WHERE x op ANY/ALL (…)` | One column | `WHERE ListPrice > ALL (SELECT …)` |
| `WHERE EXISTS (…)` | Any | `WHERE EXISTS (SELECT 1 FROM …)` |
| `WHERE (a, b) IN (…)` | Several columns | `WHERE (OrderID, ProductID) IN (SELECT …)` |
| `FROM (…) AS t` | Table | `FROM (SELECT … GROUP BY …) AS t` |
| `HAVING agg op (…)` | Scalar | `HAVING AVG(Salary) > (SELECT AVG(Salary) FROM Employees)` |
| `ORDER BY (…)` | Scalar | `ORDER BY (SELECT MAX(OrderDate) FROM …)` |
| `INSERT … SELECT` | Table | `INSERT INTO Archive SELECT … FROM Orders WHERE …` |
| `UPDATE … SET col = (…)` | Scalar | `SET Total = (SELECT SUM(…) FROM …)` |

---

# Row Subqueries and Row-Value Comparisons

A subquery may return several columns when it is compared with a **row value constructor**:

```sql
-- The order line(s) with the latest order and highest price
SELECT *
FROM OrderItems
WHERE (OrderID, UnitPrice) = (
    SELECT OrderID, MAX(UnitPrice)
    FROM OrderItems
    WHERE OrderID = (SELECT MAX(OrderID) FROM OrderItems)
    GROUP BY OrderID
);

-- Multi-column membership
SELECT *
FROM OrderItems AS oi
WHERE (oi.OrderID, oi.ProductID) IN (
    SELECT r.OrderID, r.ProductID
    FROM Returns AS r
);
```

SQL Server does not support row-value comparisons; the portable equivalent is `EXISTS` with one predicate per column:

```sql
SELECT *
FROM OrderItems AS oi
WHERE EXISTS (
    SELECT 1
    FROM Returns AS r
    WHERE r.OrderID   = oi.OrderID
      AND r.ProductID = oi.ProductID
);
```

---

# ORDER BY and Row Limits Inside a Subquery

A subquery returns a **set**. Ordering it means nothing to the outer query—unless the ordering decides *which* rows are returned.

```sql
-- ❌ Meaningless: IN does not care about order.
--    SQL Server rejects ORDER BY here without TOP/OFFSET; others ignore it.
WHERE CustomerID IN (SELECT CustomerID FROM Orders ORDER BY OrderDate)

-- ✅ Meaningful: ORDER BY picks the single row returned
WHERE ProductID = (
    SELECT ProductID
    FROM Products
    ORDER BY ListPrice DESC, ProductID
    FETCH FIRST 1 ROW ONLY
)
```

Also note:

- The order of a derived table is **not** preserved by the outer query. Only the outermost `ORDER BY` determines the order of the result.
- MySQL does not allow `LIMIT` inside a subquery used with `IN`, `ANY`, `ALL` or `SOME`; wrap it in a derived table instead.

---

# Aliases for Derived Tables

```sql
-- ❌ MySQL / SQL Server: "Every derived table must have its own alias"
SELECT * FROM (SELECT CustomerID, COUNT(*) AS n FROM Orders GROUP BY CustomerID);

-- ✅
SELECT t.CustomerID, t.n
FROM (SELECT CustomerID, COUNT(*) AS n FROM Orders GROUP BY CustomerID) AS t;
```

Every computed column in a derived table also needs a name (`AS n`), because the outer query can only refer to columns by name.

---

# What a Subquery Returns When Empty

| Context | Subquery returns no rows | Result |
|---------|--------------------------|--------|
| Scalar (`x = (…)`, `SELECT (…)`) | Empty | `NULL` |
| `x IN (…)` | Empty set | FALSE |
| `x NOT IN (…)` | Empty set | TRUE |
| `EXISTS (…)` | Empty | FALSE |
| `x > ALL (…)` | Empty set | TRUE |
| `x > ANY (…)` | Empty set | FALSE |
| `FROM (…) AS t` | Empty | Empty table (inner join removes all rows) |

The scalar case is the one that surprises people: an empty scalar subquery is not an error, it is `NULL`, and comparisons with `NULL` are UNKNOWN (Section 09.12).

---

# Formatting Subqueries

```sql
SELECT
    c.CustomerID,
    c.CustomerName
FROM Customers AS c
WHERE c.CustomerID IN (
    SELECT o.CustomerID
    FROM Orders AS o
    WHERE o.Status = 'Shipped'
)
ORDER BY c.CustomerName;
```

- Open the parenthesis at the end of the line that uses the subquery.
- Indent the subquery one level.
- Close the parenthesis on its own line, aligned with the clause that opened it.
- Use short, distinct aliases (`o`, `o2`, `e_mgr`) and qualify every column.

---

# Visual Representation

```text
SELECT … (scalar) …                    ← one value per outer row
FROM   (table) AS t                    ← a table with named columns
       JOIN LATERAL (table) AS x       ← a table per outer row
WHERE  x =  (scalar)                   ← one value
       x IN (column)                   ← a list
       x > ALL (column)                ← a list
       EXISTS (anything)               ← yes / no
       (a, b) IN (row set)             ← a list of rows
HAVING agg > (scalar)                  ← one value
ORDER BY (scalar)                      ← one value per outer row
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← derived tables must be resolvable here, so they cannot see later aliases
2. JOIN
3. WHERE
4. GROUP BY
5. HAVING
6. SELECT      ← SELECT aliases are not visible inside subqueries in WHERE or HAVING
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

A subquery in `WHERE` cannot refer to a `SELECT` alias of the outer query for the same reason `WHERE` itself cannot: the alias is defined later.

---

# How the DBMS Executes This

```text
Parser        → finds parenthesised query blocks
Binder        → resolves names scope by scope, marks outer references,
                checks each subquery's result shape against its context
Rewriter      → flattens derived tables, unnests IN / EXISTS
Optimizer     → chooses join order and algorithms for the flattened query
Executor      → runs whatever subqueries remain as separate plan nodes
```

Shape errors ("subquery has too many columns") are reported at bind time. "More than one row returned by a subquery used as an expression" is a **run-time** error, because the number of rows is only known when the query runs.

---

# 🔬 Engine Deep Dive

When a derived table is simple—no aggregation, no `DISTINCT`, no row limit—most engines **merge** it into the outer query (PostgreSQL calls this *pulling up* a subquery, MySQL *derived table merging*). The derived table disappears from the plan and its predicates join the outer `WHERE`. If it contains aggregation or a limit, it cannot be merged and is computed as a separate step, sometimes materialised into a temporary structure.

---

# 🏗️ Architecture Insight

Scope rules are what make subqueries composable. A derived table exposes only the columns in its `SELECT` list, like a function exposing only its return value; everything inside is private. That is the property that lets large reports be built from small, separately testable query blocks.

---

# ⚡ Performance Tip

An `ORDER BY` inside a subquery that has no row limit is wasted work at best. Remove it; put ordering only where it selects rows (`FETCH FIRST`) or in the outermost query.

---

# 🔒 Security Note

Parameters work inside subqueries exactly as in the outer query: `WHERE o.CustomerID = ?` inside a subquery is a bound value. Parameterise inner and outer values alike.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Row-value comparison with subquery | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ (3.15+) |
| Derived table alias | Required | Optional (16+) | Required | Required | Optional | Optional |
| `ORDER BY` in subquery without limit | Allowed | Ignored | Ignored | ❌ error | Allowed in `FROM` | Ignored |
| `LIMIT` in `IN` subquery | n/a | ✅ | ❌ | `TOP` ✅ | ✅ | ✅ |

> **Portability Tip:** Always alias derived tables, name every computed column, use `EXISTS` instead of row-value `IN`, and never rely on the order of a subquery's rows.

---

# Common Mistakes

### Mistake 1

A subquery that returns two columns where one is expected:

```sql
-- ❌ subquery must return only one column
WHERE CustomerID IN (SELECT CustomerID, OrderID FROM Orders)
```

---

### Mistake 2

Relying on `ORDER BY` inside a derived table to order the final result.

---

### Mistake 3

Leaving a computed column in a derived table without a name, so the outer query cannot reference it.

---

### Mistake 4

Reusing the outer alias inside the subquery, which hides the outer table and silently removes the correlation.

---

# Best Practices

✔ Alias every table in every scope, and use different aliases for the same table.

✔ Name every computed column in a derived table.

✔ Put `ORDER BY` in a subquery only together with a row limit.

✔ Use `EXISTS` for multi-column matching in portable code.

✔ Indent subqueries so their boundaries are visible.

---

# Interview Questions

## Basic

1. Why must a subquery be in parentheses?
2. Why does a derived table need an alias?
3. What does a scalar subquery return when it finds no rows?

## Intermediate

4. Can the outer query refer to a table alias defined inside a subquery?
5. What is a row-value comparison, and which engine does not support it?
6. When does `ORDER BY` inside a subquery affect the result?

## Advanced

7. Why is "more than one row returned" a run-time rather than a compile-time error?
8. What does it mean for an optimizer to merge a derived table?
9. What does `x > ALL (empty subquery)` return, and why?

---

# Hands-on Exercises

## Exercise 1

Rewrite `WHERE (OrderID, ProductID) IN (SELECT OrderID, ProductID FROM Returns)` so it runs on SQL Server.

---

## Exercise 2

Write a derived table that counts orders per customer, and join it to `Customers`.

---

## Exercise 3

Return the product with the highest list price using a scalar subquery with a row limit. Make the tie-breaking deterministic.

---

## Exercise 4

For each context in the "What a Subquery Returns When Empty" table, write a query that demonstrates the result.

---

# Related Topics

- **09.01 — Introduction to Subqueries**
- **09.03 — Scalar Subqueries**
- **09.08 — Derived Tables (Subqueries in FROM)**
- **09.12 — NULL Handling in Subqueries**
- **05.11 — FROM Clause (Deep Dive)**
- **04.17 — SQL Formatting and Style Guide**

---

# Summary

A subquery is a parenthesised, complete `SELECT` whose result must match the shape its position expects: a value in comparisons, the `SELECT` list and `ORDER BY`; a column after `IN`, `ANY` and `ALL`; a table in `FROM`; anything after `EXISTS`; and a set of rows for row-value comparisons. Names resolve from the innermost scope outwards, so a subquery can see the outer query but not the reverse. Derived tables need an alias and named columns, `ORDER BY` inside a subquery matters only with a row limit, and an empty scalar subquery yields `NULL` rather than an error.
