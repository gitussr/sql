---
title: "07.07 - CROSS JOIN"
description: "CROSS JOIN and the Cartesian product: deliberate combinations, calendar and matrix generation, accidental cross joins and how to spot them, row-count explosion, CROSS JOIN with a filter versus INNER JOIN, and LATERAL / CROSS APPLY."
chapter: 7
section: 7.07
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 30 min
lastUpdated: 2026-09-22
---

# 07.07 CROSS JOIN

---

# Learning Objectives

After completing this section, you will be able to:

- Write a `CROSS JOIN` and predict its row count.
- Recognise deliberate uses: matrices, calendars, size grids, test data.
- Detect an accidental Cartesian product.
- Explain why `CROSS JOIN` plus `WHERE` equals an inner join.
- Estimate the cost of a cross join before running it.
- Describe how `LATERAL` and `CROSS APPLY` differ from a plain cross join.

---

# What is a CROSS JOIN?

A cross join pairs **every** row of the left table with **every** row of the right table. There is no `ON` clause, because nothing is being matched.

```sql
SELECT
    s.SizeName,
    col.ColourName
FROM Sizes AS s
CROSS JOIN Colours AS col;
```

```text
Sizes           Colours              Result (3 × 2 = 6 rows)
┌───────┐      ┌────────┐           ┌───────┬────────┐
│ S     │      │ Red    │           │ S     │ Red    │
│ M     │  ×   │ Blue   │     =     │ S     │ Blue   │
│ L     │      └────────┘           │ M     │ Red    │
└───────┘                           │ M     │ Blue   │
                                    │ L     │ Red    │
                                    │ L     │ Blue   │
                                    └───────┴────────┘
```

The row count is always `left_rows × right_rows`—the **Cartesian product**.

---

# Row Count Growth

| Left | Right | Result |
|------|-------|--------|
| 10 | 10 | 100 |
| 1,000 | 1,000 | 1,000,000 |
| 100,000 | 100,000 | 10,000,000,000 |
| 1,000,000 | 1,000,000 | 1,000,000,000,000 |

```text
Rows
  ▲
  │                                    ●  n × m grows
  │                            ●          quadratically
  │                    ●
  │            ●
  │     ●
  └────────────────────────────────────────▶ table size
```

A cross join between two tables of even modest size can exceed the storage of the machine running it. Always compute the product before executing.

---

# Deliberate Uses

## 1. Generating every combination

```sql
SELECT
    p.ProductName,
    s.SizeName,
    c.ColourName
FROM Products AS p
CROSS JOIN Sizes   AS s
CROSS JOIN Colours AS c;
```

A product catalogue variant matrix: every product in every size in every colour.

---

## 2. Filling gaps in a report

Reports usually need a row for every day and every category, even when no data exists for that combination.

```sql
SELECT
    d.CalendarDate,
    c.CategoryName,
    COALESCE(SUM(o.TotalAmount), 0) AS daily_total
FROM Calendar   AS d
CROSS JOIN Categories AS c
LEFT JOIN Orders AS o
    ON  o.OrderDate  = d.CalendarDate
    AND o.CategoryID = c.CategoryID
WHERE d.CalendarDate BETWEEN DATE '2026-09-01' AND DATE '2026-09-30'
GROUP BY d.CalendarDate, c.CategoryName;
```

```text
CROSS JOIN builds the complete grid (30 days × 8 categories = 240 rows)
LEFT JOIN  attaches the data that exists
COALESCE   turns the gaps into zeros
```

This is the standard "dense report" pattern: without the cross join, days with no sales would simply be missing rows, and a chart would show a gap rather than a zero.

---

## 3. Attaching a single value to every row

```sql
SELECT
    o.OrderID,
    o.TotalAmount,
    o.TotalAmount / t.GrandTotal * 100 AS percent_of_total
FROM Orders AS o
CROSS JOIN (
    SELECT SUM(TotalAmount) AS GrandTotal
    FROM Orders
) AS t;
```

A one-row subquery crossed with a table multiplies nothing (`n × 1 = n`) and makes the aggregate available on every row.

---

## 4. Generating test data

```sql
SELECT
    ROW_NUMBER() OVER (ORDER BY a.n, b.n) AS id
FROM Numbers AS a
CROSS JOIN Numbers AS b;          -- 1,000 × 1,000 = 1,000,000 rows
```

---

# Accidental Cross Joins

Most cross joins in production SQL are unintentional. Three ways they appear:

```sql
-- 1. Comma join with a forgotten condition
SELECT * FROM Customers c, Orders o;
```

```sql
-- 2. A multi-table comma join missing one AND
SELECT *
FROM Customers c, Orders o, OrderItems oi
WHERE o.CustomerID = c.CustomerID;   -- oi is never constrained
```

```sql
-- 3. A join condition that is always true
SELECT *
FROM Customers AS c
INNER JOIN Orders AS o ON 1 = 1;
```

Symptoms:

- Row count is a suspiciously round multiple of a table size.
- `SUM()` results are inflated by an exact factor.
- The query is far slower than the table sizes suggest.
- The plan shows "Nested Loop" with no join predicate.

The diagnostic is simple: compare the actual row count with the largest table's row count. If it is far larger and no 1:N relationship explains it, look for a missing condition.

---

# CROSS JOIN + WHERE = INNER JOIN

These are exactly equivalent:

```sql
SELECT c.CustomerName, o.OrderID
FROM Customers AS c
CROSS JOIN Orders AS o
WHERE o.CustomerID = c.CustomerID;
```

```sql
SELECT c.CustomerName, o.OrderID
FROM Customers AS c
INNER JOIN Orders AS o
    ON o.CustomerID = c.CustomerID;
```

The optimizer recognises the pattern and never materialises the full product. The form still matters for people: the first hides the relationship in a filter, the second states it. Write the second.

---

# CROSS JOIN vs LATERAL / CROSS APPLY

A cross join's right side cannot reference the left side. `LATERAL` (ANSI, PostgreSQL, MySQL 8.0.14+, Oracle) and `CROSS APPLY` (SQL Server) lift that restriction:

```sql
-- ❌ Not allowed: the subquery cannot see c
SELECT c.CustomerName, recent.OrderID
FROM Customers AS c
CROSS JOIN (
    SELECT OrderID FROM Orders
    WHERE CustomerID = c.CustomerID          -- error
    ORDER BY OrderDate DESC FETCH FIRST 3 ROWS ONLY
) AS recent;
```

```sql
-- ✅ LATERAL: evaluated once per left row
SELECT c.CustomerName, recent.OrderID
FROM Customers AS c
CROSS JOIN LATERAL (
    SELECT OrderID FROM Orders AS o
    WHERE o.CustomerID = c.CustomerID
    ORDER BY o.OrderDate DESC
    FETCH FIRST 3 ROWS ONLY
) AS recent;
```

```text
CROSS JOIN          right side evaluated once, independent of the left
CROSS JOIN LATERAL  right side evaluated per left row, may reference it
```

`LATERAL` is the idiomatic way to write "top N per group" and is worth knowing as soon as cross joins are familiar.

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN    ← CROSS JOIN builds the Cartesian product here
3. WHERE
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

Logically the full product exists before `WHERE` runs. Physically, optimizers convert `CROSS JOIN` + equality filter into a real join—but only when the filter *is* a join condition. A cross join with no usable predicate really does build the product.

---

# How the DBMS Executes This

```text
FROM Sizes CROSS JOIN Colours

↓

No join predicate

↓

Nested loop with no index lookup:
    for each row of Sizes
        for each row of Colours
            emit the pair

↓

Rows produced = |Sizes| × |Colours|
```

Cost is proportional to the *output*, not the input. Two tables of 100,000 rows each are trivial to read and catastrophic to cross.

---

# 🏗️ Architecture Insight

`CROSS JOIN` is the only join whose result is defined without reference to the data: it depends solely on the row counts. That makes it the right tool for generating structure—calendars, grids, variant matrices—and a wrong tool for retrieving facts. When a cross join appears in a query whose purpose is to *look something up*, it is a bug.

---

# ⚡ Performance Tip

Before running any cross join, multiply the row counts. If the product exceeds a few hundred thousand rows, apply a filter to one or both sides first—`CROSS JOIN` against a filtered subquery or CTE is normally the right shape, and lets the engine discard rows before pairing them.

---

# 🌍 Production Consideration

An accidental cross join is one of the few SQL bugs that can take a production database down: the query consumes CPU, fills temporary space and may block others while producing rows nobody wants. Statement timeouts and a per-query row limit in reporting tools are cheap protection.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `CROSS JOIN` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Comma join equivalent | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `CROSS JOIN` with `ON` | ❌ | ❌ | ✅ (treated as inner) | ❌ | ❌ | ❌ |
| `LATERAL` | ✅ | ✅ | ✅ (8.0.14+) | `CROSS APPLY` | ✅ (12c+) | ❌ |

> **Portability Tip:** MySQL treats `CROSS JOIN`, `JOIN` and `INNER JOIN` as synonyms and allows an `ON` clause on any of them. Code written against MySQL can therefore hide a cross join that other databases would reject outright.

---

# Common Mistakes

### Mistake 1

Forgetting a join condition in a comma join and calling the inflated total a data problem.

---

### Mistake 2

Crossing two large tables "to see what happens".

---

### Mistake 3

Writing `CROSS JOIN` + `WHERE` where `INNER JOIN` + `ON` states the intent.

---

### Mistake 4

Expecting the right side of a cross join to see the left side's columns. That needs `LATERAL` or `CROSS APPLY`.

---

# Best Practices

✔ Use `CROSS JOIN` deliberately and comment why.

✔ Multiply the row counts before executing.

✔ Filter the inputs before crossing them, not after.

✔ Use the calendar-grid pattern for dense reports.

✔ Use `LATERAL` / `CROSS APPLY` when the right side depends on the left.

✔ Treat an unexplained cross join in a plan as a defect.

---

# Interview Questions

## Basic

1. What does `CROSS JOIN` return?
2. How many rows does a cross join of 50 and 40 rows produce?
3. Does `CROSS JOIN` take an `ON` clause?

## Intermediate

4. Give a legitimate use for a cross join.
5. How is `CROSS JOIN` + `WHERE` related to `INNER JOIN`?
6. How would you detect an accidental Cartesian product?

## Advanced

7. Why is a cross join's cost proportional to its output rather than its input?
8. What does `LATERAL` allow that `CROSS JOIN` does not?
9. Why can generating a dense date/category grid not be done with an outer join alone?

---

# Hands-on Exercises

## Exercise 1

Generate every product/size/colour combination from three small tables.

---

## Exercise 2

Produce a report with one row per day in September 2026 and per category, showing `0` where no sales exist.

---

## Exercise 3

Show each order's share of the grand total using a one-row cross-joined subquery.

---

## Exercise 4

Given a query returning 3,000,000 rows from tables of 3,000 and 1,000 rows, identify the bug.

---

# Related Topics

- **07.01 — Introduction to JOINs**
- **07.03 — INNER JOIN**
- **07.10 — Joining Multiple Tables**
- **07.16 — Common JOIN Mistakes & Best Practices**
- **05.11 — FROM Clause (Deep Dive)**

---

# Summary

`CROSS JOIN` produces the Cartesian product: every left row paired with every right row, with no join condition and a row count equal to the product of the inputs. Used deliberately it generates structure—variant matrices, dense calendar grids, a single aggregate attached to every row, synthetic test data. Used accidentally, through a missing join condition or an always-true predicate, it silently inflates results and can exhaust a server. `CROSS JOIN` plus an equality filter is exactly an inner join and should be written as one, and when the right side must reference the left, the tool is `LATERAL` or `CROSS APPLY`.
