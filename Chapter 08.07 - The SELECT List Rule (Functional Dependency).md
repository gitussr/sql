---
title: "08.07 - The SELECT List Rule (Functional Dependency)"
description: "Why every non-aggregated SELECT column must be grouped, the functional dependency refinement that lets PostgreSQL and MySQL accept columns of a grouped primary key, ONLY_FULL_GROUP_BY, SQLite bare columns, ANY_VALUE, and portable ways to return extra columns."
chapter: 8
section: 8.07
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 35 min
lastUpdated: 2026-09-24
---

# 08.07 The SELECT List Rule (Functional Dependency)

---

# Learning Objectives

After completing this section, you will be able to:

- State the SELECT list rule for grouped queries and explain why it exists.
- Define functional dependency and recognise it in a schema.
- Predict which engines accept columns that depend on a grouped key.
- Explain MySQL's `ONLY_FULL_GROUP_BY` and SQLite's bare columns.
- Use `ANY_VALUE` deliberately.
- Return descriptive columns from a grouped query portably.

---

# The Rule

In a grouped query, every column reference in `SELECT`, `HAVING` and `ORDER BY` must be one of:

1. a grouping column (or expression);
2. inside an aggregate function;
3. **functionally dependent** on the grouping columns.

The first two are universal. The third is where engines differ.

```sql
-- ❌ Rejected: OrderDate has many values per customer
SELECT CustomerID, OrderDate, SUM(TotalAmount)
FROM Orders
GROUP BY CustomerID;
```

```text
PostgreSQL:  column "orders.orderdate" must appear in the GROUP BY clause
             or be used in an aggregate function
SQL Server:  Column 'Orders.OrderDate' is invalid in the select list because
             it is not contained in either an aggregate function or the
             GROUP BY clause.
```

---

# Why the Rule Exists

A grouped row stands for many input rows. A non-grouped column has, in general, many values across those rows, and the query does not say which one to return.

```text
Group: CustomerID = 1
┌─────────┬────────────┬────────┐
│ OrderID │ OrderDate  │ Amount │
├─────────┼────────────┼────────┤
│ 101     │ 2026-01-05 │ 250.00 │
│ 102     │ 2026-01-19 │  80.00 │
└─────────┴────────────┴────────┘

SUM(Amount)  = 330.00       ✅ one answer
OrderDate    = 2026-01-05?  ❌ or 2026-01-19?
```

An engine that answers anyway must pick one arbitrarily—and a query whose answer is arbitrary is a bug waiting for data that exposes it.

---

# Functional Dependency

Column `B` is **functionally dependent** on column `A` when each value of `A` determines exactly one value of `B`. The schema guarantees this when `A` is a primary key or a unique `NOT NULL` key.

```text
Customers.CustomerID  →  CustomerName, Country     (primary key)
Orders.OrderID        →  CustomerID, OrderDate      (primary key)
```

If a query groups by `Customers.CustomerID`, every other column of `Customers` has exactly one value per group, so selecting it is unambiguous:

```sql
-- Accepted by PostgreSQL 9.1+ and MySQL 5.7.5+
SELECT
    c.CustomerID,
    c.CustomerName,       -- depends on c.CustomerID (the PK)
    c.Country,            -- depends on c.CustomerID (the PK)
    COUNT(o.OrderID) AS Orders
FROM Customers AS c
LEFT JOIN Orders AS o ON o.CustomerID = c.CustomerID
GROUP BY c.CustomerID;
```

The SQL:1999 standard defines this refinement (optional feature T301). PostgreSQL recognises dependencies on a grouped **primary key**; MySQL recognises primary keys, unique `NOT NULL` keys and equalities in the `WHERE` or `ON` clause.

SQL Server and Oracle do not implement it. On those engines the same query needs every column listed:

```sql
-- ✅ Portable everywhere
SELECT
    c.CustomerID,
    c.CustomerName,
    c.Country,
    COUNT(o.OrderID) AS Orders
FROM Customers AS c
LEFT JOIN Orders AS o ON o.CustomerID = c.CustomerID
GROUP BY c.CustomerID, c.CustomerName, c.Country;
```

Adding dependent columns to `GROUP BY` never changes the groups—each customer still forms one group—so the portable form returns exactly the same result.

---

# MySQL and ONLY_FULL_GROUP_BY

Before version 5.7.5, MySQL accepted any column in a grouped `SELECT` and returned a value from an unspecified row of the group:

```sql
-- MySQL with ONLY_FULL_GROUP_BY disabled: runs, returns an arbitrary OrderDate
SELECT CustomerID, OrderDate, SUM(TotalAmount)
FROM Orders
GROUP BY CustomerID;
```

Since 5.7.5 the `ONLY_FULL_GROUP_BY` SQL mode is enabled by default and rejects this query unless `OrderDate` is functionally dependent on `CustomerID`. Legacy applications sometimes disable the mode to keep old queries running:

```sql
-- ⚠️ Hides real bugs; avoid
SET SESSION sql_mode = REPLACE(@@sql_mode, 'ONLY_FULL_GROUP_BY', '');
```

The right fix is to rewrite each query to say which value it wants.

---

# SQLite Bare Columns

SQLite accepts non-grouped columns ("bare columns") and returns a value from some row of the group. It adds one documented guarantee: when the query contains exactly one `MIN()` or `MAX()`, bare columns come from the row that holds that minimum or maximum.

```sql
-- SQLite: OrderID comes from the row with the latest OrderDate
SELECT CustomerID, OrderID, MAX(OrderDate)
FROM Orders
GROUP BY CustomerID;
```

Convenient, but not portable and not obvious to readers. The same question has a standard answer, below.

---

# ANY_VALUE

When you genuinely do not care which value is returned—because you know all values in the group are equal, or any one will do—say so explicitly:

```sql
SELECT
    o.CustomerID,
    ANY_VALUE(c.CustomerName) AS CustomerName,
    SUM(o.TotalAmount)        AS Revenue
FROM Orders AS o
INNER JOIN Customers AS c ON c.CustomerID = o.CustomerID
GROUP BY o.CustomerID;
```

`ANY_VALUE` is an aggregate that returns one non-`NULL` value from the group. It was added to the standard in SQL:2023 and is available in MySQL 5.7+, PostgreSQL 16+ and Oracle (19c RU and later). SQL Server and SQLite do not provide it; `MIN(...)` or `MAX(...)` serve the same purpose there, at the cost of a comparison per row.

`ANY_VALUE` documents a decision. A bare column hides one.

---

# Returning Detail from the Winning Row

"Each customer's latest order, with its ID and amount" is not a grouping question—the answer is a specific row, not a summary. Three portable patterns:

```sql
-- 1. Aggregate, then join back
SELECT o.CustomerID, o.OrderID, o.OrderDate, o.TotalAmount
FROM Orders AS o
INNER JOIN (
    SELECT CustomerID, MAX(OrderDate) AS LastDate
    FROM Orders
    GROUP BY CustomerID
) AS last ON last.CustomerID = o.CustomerID
         AND last.LastDate   = o.OrderDate;
```

```sql
-- 2. Window function (Chapter 11)
SELECT CustomerID, OrderID, OrderDate, TotalAmount
FROM (
    SELECT o.*,
           ROW_NUMBER() OVER (PARTITION BY CustomerID
                              ORDER BY OrderDate DESC, OrderID DESC) AS rn
    FROM Orders AS o
) AS ranked
WHERE rn = 1;
```

```sql
-- 3. Correlated NOT EXISTS (Section 07.13)
SELECT o.CustomerID, o.OrderID, o.OrderDate, o.TotalAmount
FROM Orders AS o
WHERE NOT EXISTS (
    SELECT 1 FROM Orders AS newer
    WHERE newer.CustomerID = o.CustomerID
      AND newer.OrderDate  > o.OrderDate
);
```

Patterns 1 and 3 return several rows per customer when two orders share the latest date; pattern 2 returns exactly one, broken by the tie-breaker in its `ORDER BY`. This "greatest-per-group" problem appears constantly in real systems.

---

# Aggregate First, Then Join for Descriptions

A clean way to avoid listing descriptive columns in `GROUP BY` at all is to aggregate the fact table on its key, then join to the dimension:

```sql
SELECT
    c.CustomerID,
    c.CustomerName,
    c.Country,
    COALESCE(t.Orders, 0)  AS Orders,
    COALESCE(t.Revenue, 0) AS Revenue
FROM Customers AS c
LEFT JOIN (
    SELECT CustomerID, COUNT(*) AS Orders, SUM(TotalAmount) AS Revenue
    FROM Orders
    GROUP BY CustomerID
) AS t ON t.CustomerID = c.CustomerID;
```

The aggregation groups by one narrow integer, and descriptive columns join afterwards at the grain of the summary. This form is portable, fast, and scales to any number of descriptive columns.

---

# Visual Representation

```text
GROUP BY c.CustomerID

c.CustomerID    ✅ grouped
c.CustomerName  ✅ depends on PK  (PostgreSQL, MySQL)   → list it for SQL Server / Oracle
c.Country       ✅ depends on PK  (PostgreSQL, MySQL)   → list it for SQL Server / Oracle
o.OrderDate     ❌ many per group → MIN / MAX / ANY_VALUE, or a window function
SUM(o.Amount)   ✅ aggregate
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE
4. GROUP BY    ← after this step, only group-level values exist
5. HAVING      ← subject to the same rule
6. SELECT      ← every column must be grouped, aggregated or dependent
7. DISTINCT
8. ORDER BY    ← subject to the same rule
9. LIMIT / FETCH / TOP
```

The rule applies to every clause evaluated after grouping, not only to `SELECT`. `ORDER BY OrderDate` in a query grouped by `CustomerID` fails for the same reason.

---

# How the DBMS Executes This

```text
Binder / semantic analysis

for each column reference after GROUP BY:
    in GROUP BY list?                 → OK
    inside aggregate?                 → OK
    table's PK fully in GROUP BY?     → OK (PostgreSQL, MySQL)
    else                              → error
                                        (or arbitrary value: SQLite,
                                         MySQL without ONLY_FULL_GROUP_BY)
```

The check happens before optimisation, purely from the query text and the schema's constraints. Dropping a primary key can therefore break queries that relied on functional dependency—PostgreSQL records that dependency and refuses to drop the key while a view uses it.

---

# 🔬 Engine Deep Dive

Functional dependency is also an optimisation. Since version 9.6, when a `GROUP BY` list contains a table's whole primary key, PostgreSQL drops that table's other columns from the grouping key internally: the portable `GROUP BY c.CustomerID, c.CustomerName, c.Country` is hashed on `CustomerID` alone. The groups are identical either way, so the engine is free to use the narrower key.

---

# 🏗️ Architecture Insight

The SELECT list rule is the relational model enforcing the grain. An engine that returns an arbitrary value is not being "flexible"—it is producing a result whose meaning changes with physical row order. Systems that migrated from permissive MySQL modes to strict ones routinely discover reports that had been quietly wrong for years.

---

# ⚡ Performance Tip

Grouping by a wide set of descriptive columns makes the hash key larger and the sort more expensive. Grouping by the key alone and joining descriptions afterwards—or relying on functional dependency where supported—keeps the aggregation narrow.

---

# 🌍 Production Consideration

Before upgrading MySQL from a pre-5.7 version, or enabling `ONLY_FULL_GROUP_BY`, run the application's queries against the new mode in a test environment. Every query that fails was returning an arbitrary value, and each needs a decision—`MIN`, `MAX`, `ANY_VALUE`, or a different query shape—not a blanket mode change.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Strict SELECT list rule | ✅ | ✅ | ✅ (5.7.5+ default) | ✅ | ✅ | ❌ |
| Functional dependency (T301) | Optional | ✅ (PK) | ✅ (PK, unique, equalities) | ❌ | ❌ | n/a |
| Bare columns return a value | ❌ | ❌ | Only if mode disabled | ❌ | ❌ | ✅ |
| `ANY_VALUE` | ✅ (SQL:2023) | ✅ (16+) | ✅ (5.7+) | ❌ | ✅ (19c RU+) | ❌ |

> **Portability Tip:** Listing every non-aggregated column in `GROUP BY` works on every engine and returns the same groups as relying on functional dependency. Use the shorter form only in code that targets PostgreSQL or MySQL exclusively.

---

# Common Mistakes

### Mistake 1

Disabling `ONLY_FULL_GROUP_BY` to make failing queries run.

---

### Mistake 2

Relying on SQLite bare columns in code that must be portable.

---

### Mistake 3

Using `GROUP BY` to find "the latest order per customer" and expecting the other columns to come from that order.

---

### Mistake 4

Assuming functional dependency on a column that is unique in practice but not declared unique.

---

# Best Practices

✔ List every non-aggregated column in `GROUP BY` for portable code.

✔ Use `ANY_VALUE` (or `MIN`/`MAX`) when any value is acceptable, and say so.

✔ Solve greatest-per-group with a window function or a join back, not a grouped bare column.

✔ Aggregate on the key, then join descriptive columns.

✔ Declare primary and unique keys—they make functional dependency provable.

---

# Interview Questions

## Basic

1. Which columns may appear in the `SELECT` list of a grouped query?
2. Why is `SELECT CustomerID, OrderDate ... GROUP BY CustomerID` rejected?
3. What does `ONLY_FULL_GROUP_BY` do?

## Intermediate

4. What is functional dependency?
5. Why does PostgreSQL accept `CustomerName` when grouping by `CustomerID`, while SQL Server does not?
6. What does `ANY_VALUE` return?

## Advanced

7. How would you return each customer's latest order with its amount?
8. What guarantee does SQLite give for bare columns with `MAX()`?
9. Why can dropping a primary key break a view that uses `GROUP BY`?

---

# Hands-on Exercises

## Exercise 1

Return each customer's ID, name, country and order count in a form that runs on SQL Server.

---

## Exercise 2

Rewrite Exercise 1 so that `Orders` is aggregated in a derived table and joined to `Customers` afterwards.

---

## Exercise 3

Return each customer's most recent order (ID, date and amount) using a window function.

---

## Exercise 4

Take a query that relies on MySQL's permissive mode and rewrite it three ways: with `MIN`, with `ANY_VALUE`, and with a join back.

---

# Related Topics

- **08.05 — GROUP BY Syntax and Semantics**
- **08.11 — Aggregating Across JOINs (Fan-Out and Pre-Aggregation)**
- **03.07.01 — Primary Key**
- **07.13 — Semi-Joins and Anti-Joins (EXISTS and NOT EXISTS)**
- **11.xx — Window Functions**

---

# Summary

After grouping, every column referenced in `SELECT`, `HAVING` or `ORDER BY` must be grouped, aggregated, or functionally dependent on the grouping columns, because otherwise the query asks for one value where many exist. PostgreSQL and MySQL recognise dependency on a grouped primary key; SQL Server and Oracle require every column to be listed, which returns the same groups and runs everywhere. Permissive behaviours—SQLite bare columns and MySQL without `ONLY_FULL_GROUP_BY`—return arbitrary values; `ANY_VALUE`, `MIN`/`MAX`, a join back or a window function each state explicitly which value the query wants.
