---
title: "08.02 - Aggregate Functions (COUNT, SUM, AVG, MIN, MAX)"
description: "The five core aggregate functions in depth: what each accepts and returns, result data types, integer division in AVG, overflow in SUM, MIN and MAX on text and dates, DISTINCT inside aggregates, and nesting rules."
chapter: 8
section: 8.02
category: Data Query Language (DQL)
difficulty: Beginner → Intermediate
readingTime: 35 min
lastUpdated: 2026-09-24
---

# 08.02 Aggregate Functions (COUNT, SUM, AVG, MIN, MAX)

---

# Learning Objectives

After completing this section, you will be able to:

- Use `COUNT`, `SUM`, `AVG`, `MIN` and `MAX` and state what each returns.
- Predict the data type of each aggregate's result.
- Avoid integer truncation in `AVG`.
- Recognise and prevent overflow in `SUM`.
- Apply `MIN` and `MAX` to text and dates.
- Use `DISTINCT` inside an aggregate.
- Explain why aggregates cannot be nested directly.

---

# The Five Core Aggregates

| Function | Accepts | Returns | On empty input |
|----------|---------|---------|----------------|
| `COUNT(*)` | Rows | Number of rows | `0` |
| `COUNT(expr)` | Any type | Number of non-`NULL` values | `0` |
| `SUM(expr)` | Numeric | Total of non-`NULL` values | `NULL` |
| `AVG(expr)` | Numeric | Mean of non-`NULL` values | `NULL` |
| `MIN(expr)` | Any ordered type | Smallest non-`NULL` value | `NULL` |
| `MAX(expr)` | Any ordered type | Largest non-`NULL` value | `NULL` |

```sql
SELECT
    COUNT(*)         AS Orders,
    SUM(TotalAmount) AS Revenue,
    AVG(TotalAmount) AS AverageOrder,
    MIN(TotalAmount) AS SmallestOrder,
    MAX(TotalAmount) AS LargestOrder
FROM Orders;
```

```text
Orders.TotalAmount:  250.00, 80.00, 500.00, 120.00, 60.00

COUNT  5
SUM    1010.00
AVG    202.00
MIN    60.00
MAX    500.00
```

Only `COUNT` returns `0` on empty input. Every other aggregate returns `NULL`, because there is no total, mean, minimum or maximum of nothing. Section 08.04 covers `NULL` behaviour fully.

---

# COUNT

`COUNT` has three forms, each answering a different question:

```sql
SELECT
    COUNT(*)                   AS AllRows,
    COUNT(CustomerID)          AS RowsWithCustomer,
    COUNT(DISTINCT CustomerID) AS DistinctCustomers
FROM Orders;
```

They are different enough to deserve their own section: 08.03.

---

# SUM

`SUM` adds the non-`NULL` values of a numeric expression.

```sql
SELECT SUM(oi.Quantity * oi.UnitPrice) AS LineRevenue
FROM OrderItems AS oi;
```

The argument can be any numeric expression, evaluated per row before summing.

## Result type and overflow

The result type is usually wider than the input, but not always wide enough:

| Engine | `SUM(INT)` returns | Overflow behaviour |
|--------|-------------------|-------------------|
| PostgreSQL | `BIGINT` | Error beyond `BIGINT` |
| MySQL | `DECIMAL` | Effectively none for realistic data |
| SQL Server | `INT` | **Arithmetic overflow error** past ~2.1 billion |
| Oracle | `NUMBER` | Effectively none |
| SQLite | `INTEGER` (`TOTAL()` returns `REAL`) | Error on 64-bit overflow |

```sql
-- SQL Server: fails once the total exceeds 2,147,483,647
SELECT SUM(Quantity) FROM OrderItems;

-- ✅ Widen before summing
SELECT SUM(CAST(Quantity AS BIGINT)) FROM OrderItems;
```

Monetary columns should be `DECIMAL`, whose `SUM` keeps exact precision. `SUM` over `FLOAT` or `REAL` accumulates rounding error and can even return slightly different totals depending on the order rows are read.

---

# AVG

`AVG` returns the sum of the non-`NULL` values divided by their count.

```sql
SELECT AVG(TotalAmount) AS AverageOrder FROM Orders;
```

## Integer division

On some engines, `AVG` of an integer column is an integer:

```sql
-- Values: 1, 2, 2
SELECT AVG(Quantity) FROM OrderItems;
```

| Engine | Result |
|--------|--------|
| PostgreSQL | `1.6666666666666667` (`NUMERIC`) |
| MySQL | `1.6667` (`DECIMAL`) |
| SQL Server | **`1`** (`INT`, truncated) |
| Oracle | `1.66666666666666666666666666666666666667` |
| SQLite | `1.66666666666667` (`REAL`) |

```sql
-- ✅ Portable: force a decimal average
SELECT AVG(CAST(Quantity AS DECIMAL(10,4))) FROM OrderItems;

-- ✅ Also common
SELECT AVG(Quantity * 1.0) FROM OrderItems;
```

## AVG is not SUM / COUNT(*)

```sql
SELECT
    AVG(Salary)             AS AvgOfKnown,    -- ignores NULL salaries
    SUM(Salary) / COUNT(*)  AS AvgOverAll     -- treats NULL as if it were 0
FROM Employees;
```

These differ whenever `Salary` contains `NULL`. `AVG` is `SUM(x) / COUNT(x)`, not `SUM(x) / COUNT(*)`. Section 08.04 shows when each is correct.

---

# MIN and MAX

`MIN` and `MAX` work on any type that can be ordered—numbers, dates, timestamps and text.

```sql
SELECT
    MIN(OrderDate)    AS FirstOrder,
    MAX(OrderDate)    AS LatestOrder,
    MIN(CustomerName) AS AlphabeticallyFirst
FROM Orders AS o
INNER JOIN Customers AS c ON c.CustomerID = o.CustomerID;
```

Points to watch:

- **Text** is compared by the column's collation, so `MIN('apple', 'Banana')` depends on case sensitivity.
- **Numbers stored as text** compare as text: `MAX('9', '10')` is `'9'`.
- **Booleans** are not ordered in every engine; PostgreSQL offers `BOOL_AND` and `BOOL_OR` instead.

`MIN` and `MAX` return a value that actually exists in the data, which makes them the standard way to pick a representative value from a group:

```sql
SELECT
    CustomerID,
    MAX(OrderDate) AS LastOrderDate
FROM Orders
GROUP BY CustomerID;
```

---

# DISTINCT Inside an Aggregate

Any aggregate can take `DISTINCT`, which removes duplicate values **before** aggregating:

```sql
SELECT
    COUNT(DISTINCT CustomerID) AS Customers,
    SUM(DISTINCT TotalAmount)  AS SumOfDistinctAmounts
FROM Orders;
```

```text
TotalAmount: 100, 100, 250

SUM(TotalAmount)           →  450
SUM(DISTINCT TotalAmount)  →  350     ← the second 100 is discarded
```

`COUNT(DISTINCT ...)` is common and useful. `SUM(DISTINCT ...)` and `AVG(DISTINCT ...)` are almost always bugs: two different orders that happen to have the same amount are not duplicates. If duplicates come from a join, fix the join (Section 08.11), do not paper over it with `DISTINCT`.

`DISTINCT` has no effect on `MIN` and `MAX`, which the standard allows but which engines simply ignore.

---

# Aggregates on Expressions

The argument to an aggregate is evaluated per row first:

```sql
SELECT
    SUM(oi.Quantity * oi.UnitPrice)                   AS GrossRevenue,
    SUM(oi.Quantity * (oi.UnitPrice - p.ListPrice))   AS PriceVariance,
    AVG(CASE WHEN o.Status = 'Shipped' THEN 1.0 ELSE 0 END) AS ShippedRatio
FROM OrderItems AS oi
INNER JOIN Orders   AS o ON o.OrderID   = oi.OrderID
INNER JOIN Products AS p ON p.ProductID = oi.ProductID;
```

`AVG` of a 1/0 flag is a compact way to compute a proportion—a pattern expanded in Section 08.10.

Expressions can also wrap an aggregate:

```sql
SELECT
    ROUND(AVG(TotalAmount), 2)           AS AverageOrder,
    MAX(TotalAmount) - MIN(TotalAmount)  AS AmountRange,
    COALESCE(SUM(TotalAmount), 0)        AS RevenueOrZero
FROM Orders;
```

---

# Aggregates Cannot Be Nested

```sql
-- ❌ Error: aggregate function calls cannot be nested
SELECT MAX(COUNT(*)) FROM Orders GROUP BY CustomerID;
```

An aggregate collapses rows into groups; there are no longer rows for an outer aggregate to collapse. Aggregate in two stages instead:

```sql
SELECT MAX(OrderCount) AS MostOrdersByOneCustomer
FROM (
    SELECT CustomerID, COUNT(*) AS OrderCount
    FROM Orders
    GROUP BY CustomerID
) AS per_customer;
```

Oracle is the exception: it accepts one level of nesting (`MAX(COUNT(*))`) when a `GROUP BY` is present. Portable code uses the derived table.

---

# Visual Representation

```text
         values in the group
     ┌───┬───┬──────┬───┬───┐
     │ 5 │ 3 │ NULL │ 8 │ 3 │
     └───┴───┴──────┴───┴───┘

COUNT(*)          5      rows
COUNT(x)          4      non-NULL values
COUNT(DISTINCT x) 3      {5, 3, 8}
SUM(x)            19
AVG(x)            4.75   = 19 / 4
MIN(x)            3
MAX(x)            8
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE
4. GROUP BY    ← Aggregates are accumulated per group here
5. HAVING
6. SELECT      ← and their values are projected here
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

Aggregates are computed as rows are grouped, then read by `HAVING`, `SELECT` and `ORDER BY`. They cannot appear in `WHERE`, which runs before any group exists.

---

# How the DBMS Executes This

```text
Aggregate     Accumulator state           Finalise
─────────     ─────────────────           ────────
COUNT(*)      n                           n
COUNT(x)      n (skips NULL)              n
SUM(x)        total, seen_any             seen_any ? total : NULL
AVG(x)        total, n                    n > 0 ? total / n : NULL
MIN(x)        current_min                 current_min
MAX(x)        current_max                 current_max
COUNT(DISTINCT x)  set of seen values     size of set
```

Every aggregate except the `DISTINCT` forms uses a fixed amount of memory per group. `DISTINCT` aggregates must remember every value seen, which is why they are markedly more expensive on large groups.

---

# 🔬 Engine Deep Dive

Because `AVG`'s accumulator is a pair `(total, n)`, parallel plans compute partial pairs on each worker and combine them by adding totals and counts before a single division. `COUNT(DISTINCT x)` cannot be combined so simply—two workers' distinct counts cannot be added—so engines either redistribute rows by `x` so each value lands on one worker, or fall back to a single-threaded step.

---

# ⚡ Performance Tip

`MIN` and `MAX` on an indexed column without `GROUP BY` are answered by reading one end of the index: a single seek instead of a scan. `SELECT MAX(OrderDate) FROM Orders` is instant with an index on `OrderDate`, and a full scan without one.

---

# 🌍 Production Consideration

The SQL Server `INT` result type of `SUM` and `AVG` is a classic latent bug: a quantity total works for years, then overflows the day volume crosses about 2.1 billion. Cast to `BIGINT` or `DECIMAL` in any aggregate over a column that grows with business volume.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `COUNT`, `SUM`, `AVG`, `MIN`, `MAX` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `AVG(INT)` keeps fractions | Implementation-defined | ✅ | ✅ | ❌ | ✅ | ✅ |
| `SUM(INT)` result type | Implementation-defined | `BIGINT` | `DECIMAL` | `INT` | `NUMBER` | `INTEGER` |
| Nested aggregates `MAX(COUNT(*))` | ❌ | ❌ | ❌ | ❌ | ✅ (one level) | ❌ |
| `BOOL_AND` / `EVERY` | `EVERY` | ✅ both | ❌ (`BIT_AND`) | ❌ | ❌ | ❌ |

> **Portability Tip:** Cast integer arguments to `DECIMAL` inside `AVG` and to `BIGINT` inside `SUM` whenever the code must run on SQL Server. The cast costs almost nothing and removes both the truncation and the overflow difference.

---

# Common Mistakes

### Mistake 1

Averaging an integer column on SQL Server and reporting a truncated result.

---

### Mistake 2

Using `SUM(DISTINCT amount)` to "fix" duplicates from a join.

---

### Mistake 3

Computing an average as `SUM(x) / COUNT(*)` when `x` contains `NULL`.

---

### Mistake 4

Taking `MAX` of numbers stored as text:

```sql
-- ❌ '9' > '10' as text
SELECT MAX(VersionText) FROM Releases;
```

---

### Mistake 5

Nesting aggregates instead of aggregating in two stages.

---

# Best Practices

✔ Store money as `DECIMAL`, never `FLOAT`.

✔ Cast integers explicitly in `AVG` and large `SUM`s.

✔ Use `MIN`/`MAX` to choose a representative value deliberately.

✔ Reserve `DISTINCT` inside aggregates for `COUNT`.

✔ Wrap `SUM` in `COALESCE(..., 0)` when a missing total should read as zero.

---

# Interview Questions

## Basic

1. Name the five core aggregate functions.
2. Which aggregate returns `0` rather than `NULL` on empty input?
3. Can `MIN` and `MAX` be used on dates and text?

## Intermediate

4. Why might `AVG(Quantity)` return `1` instead of `1.67`?
5. What is the difference between `SUM(x)` and `SUM(DISTINCT x)`?
6. Why is `AVG(x)` not always equal to `SUM(x) / COUNT(*)`?

## Advanced

7. Why can't aggregates be nested, and how do you compute "the maximum of per-group counts"?
8. How does the accumulator for `AVG` enable parallel aggregation?
9. Why is `COUNT(DISTINCT x)` more expensive than `COUNT(x)`?

---

# Hands-on Exercises

## Exercise 1

Return the total, average, smallest and largest order amount for 2026.

---

## Exercise 2

Compute the average line quantity from `OrderItems` so that it keeps its fractional part on every engine.

---

## Exercise 3

Find the largest number of orders placed by any single customer, using a derived table.

---

## Exercise 4

Compute the share of orders with status `'Shipped'` using `AVG` over a `CASE` expression.

---

# Related Topics

- **08.01 — Introduction to Aggregation and Grouping**
- **08.03 — COUNT Variants**
- **08.04 — NULL Handling in Aggregates**
- **08.10 — Conditional Aggregation (FILTER and CASE)**
- **05.06 — Expressions & Calculated Columns**
- **05.07 — DISTINCT**

---

# Summary

`COUNT`, `SUM`, `AVG`, `MIN` and `MAX` each reduce a group to one value, skipping `NULL`s; only `COUNT` returns `0` on empty input, the rest return `NULL`. Their result types vary by engine, which is why `AVG` of integers truncates on SQL Server and `SUM` of integers can overflow there, and why explicit casts are the portable fix. `MIN` and `MAX` work on any ordered type and return real values from the data, `DISTINCT` inside an aggregate is sound for `COUNT` but suspicious elsewhere, and aggregates cannot be nested—compute per-group values in a derived table and aggregate those.
