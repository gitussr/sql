---
title: "08.06 - Grouping by Multiple Columns and Expressions"
description: "Grouping on several columns and on computed expressions: composite groups, why column order does not change groups, time bucketing by year, month, week and day, value banding with CASE, grouping on joined columns, and the cost of grouping on expressions."
chapter: 8
section: 8.06
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 35 min
lastUpdated: 2026-09-24
---

# 08.06 Grouping by Multiple Columns and Expressions

---

# Learning Objectives

After completing this section, you will be able to:

- Group by two or more columns and state the resulting grain.
- Explain why the order of grouping columns does not change the groups.
- Bucket timestamps into years, months, weeks, days and hours.
- Band numeric values into ranges with `CASE`.
- Group on columns that come from joined tables.
- Keep expression-based grouping correct and efficient.

---

# Grouping by Several Columns

With several grouping columns, a group is one **combination** of their values:

```sql
SELECT
    CustomerID,
    Status,
    COUNT(*)         AS Orders,
    SUM(TotalAmount) AS Amount
FROM Orders
GROUP BY CustomerID, Status;
```

```text
Orders                                   Result — one row per (CustomerID, Status)
┌─────┬──────┬───────────┬────────┐      ┌──────┬───────────┬────────┬────────┐
│ 101 │ 1    │ Shipped   │ 250.00 │      │ Cust │ Status    │ Orders │ Amount │
│ 102 │ 1    │ Pending   │  80.00 │      ├──────┼───────────┼────────┼────────┤
│ 103 │ 2    │ Shipped   │ 500.00 │ ──→  │ 1    │ Pending   │ 1      │  80.00 │
│ 104 │ 2    │ Shipped   │ 120.00 │      │ 1    │ Shipped   │ 1      │ 250.00 │
│ 105 │ 3    │ Cancelled │  60.00 │      │ 2    │ Shipped   │ 2      │ 620.00 │
└─────┴──────┴───────────┴────────┘      │ 3    │ Cancelled │ 1      │  60.00 │
                                         └──────┴───────────┴────────┴────────┘
```

The grain is now "one row per customer **per status**". Only combinations that actually occur appear: customer 3 has no `Shipped` row, not a row with a zero.

---

# Column Order Does Not Change the Groups

```sql
GROUP BY CustomerID, Status
GROUP BY Status, CustomerID
```

These produce exactly the same groups. The order of grouping columns affects only:

- which index can supply rows already in group order (Section 08.15);
- the incidental output order on engines that group by sorting—which you must not rely on anyway.

Put the intended presentation order in `ORDER BY`:

```sql
SELECT CustomerID, Status, COUNT(*) AS Orders
FROM Orders
GROUP BY CustomerID, Status
ORDER BY CustomerID, Status;
```

---

# How Many Groups?

The number of groups is at most the product of the distinct values of each column, and in practice far fewer:

```text
CustomerID: 50,000 distinct    Status: 3 distinct

Upper bound:  150,000 groups
Actual:       only combinations present in the data
```

Adding a grouping column can only split groups, never merge them. If the result suddenly has as many rows as the table, one of the grouping columns is probably unique (such as a timestamp with seconds).

---

# Grouping by Expressions

Any deterministic expression can be a grouping key. The most common is **time bucketing**.

```sql
SELECT
    EXTRACT(YEAR  FROM OrderDate) AS OrderYear,
    EXTRACT(MONTH FROM OrderDate) AS OrderMonth,
    COUNT(*)                      AS Orders,
    SUM(TotalAmount)              AS Revenue
FROM Orders
GROUP BY
    EXTRACT(YEAR  FROM OrderDate),
    EXTRACT(MONTH FROM OrderDate)
ORDER BY OrderYear, OrderMonth;
```

Always include the year when grouping by month; `GROUP BY EXTRACT(MONTH FROM OrderDate)` puts January 2025 and January 2026 in the same group.

## Truncating to a bucket

A single truncation expression keeps the year and is easier to sort:

| Engine | Month bucket |
|--------|-------------|
| PostgreSQL | `DATE_TRUNC('month', OrderDate)` |
| SQL Server 2022+ | `DATETRUNC(month, OrderDate)` |
| SQL Server (older) | `DATEFROMPARTS(YEAR(OrderDate), MONTH(OrderDate), 1)` |
| MySQL | `DATE_FORMAT(OrderDate, '%Y-%m-01')` |
| Oracle | `TRUNC(OrderDate, 'MM')` |
| SQLite | `strftime('%Y-%m-01', OrderDate)` |

```sql
-- PostgreSQL
SELECT
    DATE_TRUNC('month', OrderDate) AS MonthStart,
    SUM(TotalAmount)               AS Revenue
FROM Orders
GROUP BY DATE_TRUNC('month', OrderDate)
ORDER BY MonthStart;
```

## Time zones

Timestamps stored in UTC and grouped by day produce UTC days. A sale at 23:30 in New York lands on the next UTC day. Convert to the reporting time zone **before** truncating:

```sql
-- PostgreSQL: daily revenue in New York local days
SELECT
    DATE_TRUNC('day', CreatedAt AT TIME ZONE 'America/New_York') AS LocalDay,
    SUM(Amount)
FROM Payments
GROUP BY DATE_TRUNC('day', CreatedAt AT TIME ZONE 'America/New_York');
```

---

# Banding Values with CASE

`CASE` turns a continuous value into named ranges:

```sql
SELECT
    CASE
        WHEN TotalAmount < 100 THEN 'Small'
        WHEN TotalAmount < 500 THEN 'Medium'
        ELSE                        'Large'
    END              AS SizeBand,
    COUNT(*)         AS Orders,
    SUM(TotalAmount) AS Amount
FROM Orders
GROUP BY
    CASE
        WHEN TotalAmount < 100 THEN 'Small'
        WHEN TotalAmount < 500 THEN 'Medium'
        ELSE                        'Large'
    END;
```

Repeating a long `CASE` in `GROUP BY` is tedious and error-prone—edit one copy and not the other, and the query fails or groups wrongly. Two portable ways to write it once:

```sql
-- Derived table
SELECT SizeBand, COUNT(*) AS Orders, SUM(TotalAmount) AS Amount
FROM (
    SELECT
        TotalAmount,
        CASE
            WHEN TotalAmount < 100 THEN 'Small'
            WHEN TotalAmount < 500 THEN 'Medium'
            ELSE                        'Large'
        END AS SizeBand
    FROM Orders
) AS banded
GROUP BY SizeBand;
```

```sql
-- Lookup table joined with a range condition (Section 07.03)
SELECT b.BandName, COUNT(*) AS Orders, SUM(o.TotalAmount) AS Amount
FROM Orders AS o
INNER JOIN AmountBands AS b
    ON o.TotalAmount >= b.MinAmount
   AND o.TotalAmount <  b.MaxAmount
GROUP BY b.BandName;
```

The lookup table has a further advantage: band boundaries become data that can change without editing SQL.

---

# Grouping on Joined Columns

Grouping columns can come from any table in the `FROM` clause:

```sql
SELECT
    c.Country,
    p.CategoryID,
    SUM(oi.Quantity * oi.UnitPrice) AS Revenue
FROM OrderItems AS oi
INNER JOIN Orders    AS o ON o.OrderID    = oi.OrderID
INNER JOIN Customers AS c ON c.CustomerID = o.CustomerID
INNER JOIN Products  AS p ON p.ProductID  = oi.ProductID
GROUP BY c.Country, p.CategoryID;
```

The grain is "one row per country per category". Before trusting the totals, confirm that each join is N:1 from `OrderItems` outward, so no row is multiplied. Section 08.11 covers the case where it is not.

---

# Grouping by Descriptive Columns

Grouping by a name instead of a key is a quiet correctness risk:

```sql
-- ❌ Two different customers named "Ada Lovelace" merge into one group
SELECT c.CustomerName, SUM(o.TotalAmount)
FROM Customers AS c
INNER JOIN Orders AS o ON o.CustomerID = c.CustomerID
GROUP BY c.CustomerName;

-- ✅ Group by the key; show the name
SELECT c.CustomerID, c.CustomerName, SUM(o.TotalAmount) AS Revenue
FROM Customers AS c
INNER JOIN Orders AS o ON o.CustomerID = c.CustomerID
GROUP BY c.CustomerID, c.CustomerName;
```

Adding `CustomerName` next to the key does not change the groups—a customer has one name—but it lets the name appear in `SELECT` on every engine.

---

# Visual Representation

```text
GROUP BY CustomerID                GROUP BY CustomerID, Status

┌──────────────────┐               ┌─────────┬───────────┐
│ Customer 1       │               │ Cust 1  │ Pending   │
│                  │     split →   ├─────────┼───────────┤
│                  │               │ Cust 1  │ Shipped   │
├──────────────────┤               ├─────────┼───────────┤
│ Customer 2       │     same  →   │ Cust 2  │ Shipped   │
├──────────────────┤               ├─────────┼───────────┤
│ Customer 3       │     same  →   │ Cust 3  │ Cancelled │
└──────────────────┘               └─────────┴───────────┘

   3 groups                           4 groups
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE
4. GROUP BY    ← grouping expressions are evaluated per row, then rows are grouped
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

A grouping expression such as `DATE_TRUNC('month', OrderDate)` is computed for every row in step 4. The `SELECT` list in step 6 must then repeat the same expression (or a function of it) to display the bucket.

---

# How the DBMS Executes This

```text
GROUP BY c.Country, DATE_TRUNC('month', o.OrderDate)

for each joined row:
    key = (Country, DATE_TRUNC('month', OrderDate))   ← computed per row
    probe hash table with key
    update accumulators

Composite key hashing: all key parts combined into one hash
Composite key sorting: sort by part 1, then part 2 ...
```

The engine matches a `SELECT` expression to a grouping expression by comparing their parsed form, which is why `EXTRACT(YEAR FROM OrderDate)` in `GROUP BY` and `extract(year from OrderDate)` in `SELECT` still match, but `YEAR(OrderDate)` and `EXTRACT(YEAR FROM OrderDate)` may not.

---

# 🔬 Engine Deep Dive

An index on `OrderDate` cannot supply rows in `DATE_TRUNC('month', OrderDate)` order for a stream aggregate in every engine, even though month order follows date order—the optimizer must know that the function is order-preserving. PostgreSQL does not infer this; SQL Server and Oracle recognise a few such cases. An expression index, or a persisted computed column holding the month, makes the ordering explicit.

---

# 🏗️ Architecture Insight

Reporting systems usually replace ad-hoc date bucketing with a **calendar (date dimension) table**: one row per day with its year, quarter, month, ISO week, fiscal period and holiday flag. Grouping by columns of that table keeps fiscal calendars, week definitions and time zones consistent across every report, and makes "show empty days as zero" a simple outer join.

---

# ⚡ Performance Tip

Filter on the raw column and group on the expression. `WHERE OrderDate >= DATE '2026-01-01'` can use an index; `WHERE EXTRACT(YEAR FROM OrderDate) = 2026` cannot (Section 06.12). The grouping expression may be as complex as you like—it is computed once per surviving row.

---

# 🌍 Production Consideration

Week-based reports are a frequent source of disputes: ISO weeks start on Monday and week 1 contains the first Thursday of the year; US convention starts weeks on Sunday; `EXTRACT(WEEK ...)` and `DATEPART(week, ...)` follow different rules on different engines. Pin the week definition in a calendar table rather than in each query.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Multiple grouping columns | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Group by expression | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `EXTRACT(field FROM date)` | ✅ | ✅ | ✅ | ❌ (`DATEPART`) | ✅ | ❌ (`strftime`) |
| Truncate to month | ❌ | `DATE_TRUNC` | `DATE_FORMAT` | `DATETRUNC` (2022+) | `TRUNC` | `strftime` |
| Time zone conversion | `AT TIME ZONE` | ✅ | `CONVERT_TZ` | `AT TIME ZONE` (2016+) | ✅ | ❌ (UTC / local only) |

> **Portability Tip:** Date bucketing functions differ on every engine. Centralise them—in a view, a computed column, or a calendar table—so that reports do not each carry their own dialect.

---

# Common Mistakes

### Mistake 1

Grouping by month without the year.

---

### Mistake 2

Grouping UTC timestamps by day and presenting the result as local days.

---

### Mistake 3

Editing a `CASE` in `SELECT` but not its copy in `GROUP BY`.

---

### Mistake 4

Grouping by a name rather than a key, merging different entities.

---

### Mistake 5

Filtering with a function on the date column (`WHERE YEAR(OrderDate) = 2026`) instead of a range.

---

# Best Practices

✔ State the grain: "one row per X per Y".

✔ Group by keys and add descriptive columns alongside them.

✔ Truncate dates to a bucket that keeps the year.

✔ Convert to the reporting time zone before bucketing.

✔ Write long grouping expressions once, in a derived table or lookup table.

---

# Interview Questions

## Basic

1. What is a group when grouping by two columns?
2. Does `GROUP BY a, b` produce different groups from `GROUP BY b, a`?
3. How do you group orders by month?

## Intermediate

4. Why must a month bucket include the year?
5. How do you group numeric values into ranges?
6. Why is grouping by `CustomerName` risky?

## Advanced

7. Why can grouping UTC timestamps by day produce wrong daily totals?
8. Why might an index on `OrderDate` not help a stream aggregate grouped by month?
9. What advantages does a calendar table have over date functions in `GROUP BY`?

---

# Hands-on Exercises

## Exercise 1

Return order count and revenue per customer per status.

---

## Exercise 2

Return monthly revenue for 2026 using a truncation function for your engine, filtering with a date range.

---

## Exercise 3

Band orders into Small (< 100), Medium (< 500) and Large, writing the `CASE` only once.

---

## Exercise 4

Return revenue per country per product category.

---

# Related Topics

- **08.05 — GROUP BY Syntax and Semantics**
- **08.07 — The SELECT List Rule (Functional Dependency)**
- **08.11 — Aggregating Across JOINs (Fan-Out and Pre-Aggregation)**
- **08.12 — ROLLUP, CUBE and GROUPING SETS**
- **06.09 — Filtering with Expressions and Functions**
- **06.12 — SARGability and Index-Friendly Predicates**
- **13.xx — Date and Time Functions**

---

# Summary

Grouping by several columns creates one group per combination of their values that actually occurs, and the order in which the columns are listed does not change the groups. Any deterministic expression can be a grouping key—most often a time bucket, which must keep the year and be computed in the reporting time zone, or a `CASE` band, which is best written once in a derived or lookup table. Group by keys rather than descriptive names, keep filters on the raw column so they remain index-friendly, and confirm that the joins feeding a multi-table grouping do not multiply rows.
