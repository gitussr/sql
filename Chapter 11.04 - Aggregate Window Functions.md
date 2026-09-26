---
title: "11.04 - Aggregate Window Functions"
description: "SUM, AVG, COUNT, MIN and MAX as window functions: partition totals on detail rows, comparisons with group averages and extremes, percent of total, counts per group, aggregates over grouped results, DISTINCT restrictions, and how ORDER BY turns a total into a running value."
chapter: 11
section: 11.04
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 30 min
lastUpdated: 2026-09-25
---

# 11.04 Aggregate Window Functions

---

# Learning Objectives

After completing this section, you will be able to:

- Use `SUM`, `AVG`, `COUNT`, `MIN` and `MAX` with `OVER`.
- Attach partition totals, averages and extremes to detail rows.
- Compute percent of total and differences from the group average.
- Explain how `ORDER BY` changes an aggregate window.
- Work around the lack of `COUNT(DISTINCT …) OVER`.
- Apply aggregate windows to grouped results.

---

# Aggregates as Window Functions

Any ordinary aggregate becomes a window function when followed by `OVER`:

```sql
SELECT
    o.OrderID,
    o.CustomerID,
    o.TotalAmount,
    SUM(o.TotalAmount) OVER (PARTITION BY o.CustomerID) AS CustomerTotal,
    AVG(o.TotalAmount) OVER (PARTITION BY o.CustomerID) AS CustomerAvg,
    COUNT(*)           OVER (PARTITION BY o.CustomerID) AS CustomerOrders,
    MIN(o.OrderDate)   OVER (PARTITION BY o.CustomerID) AS FirstOrderDate,
    MAX(o.TotalAmount) OVER (PARTITION BY o.CustomerID) AS LargestOrder
FROM Orders AS o;
```

Without `ORDER BY` in the window, each function sees the **whole partition**, so every row of a customer shows the same values.

`NULL` handling is the same as in `GROUP BY` (Section 08.04): `SUM`, `AVG`, `MIN`, `MAX` and `COUNT(col)` ignore `NULL`s; `COUNT(*)` counts rows.

---

# Comparing a Row with Its Group

```sql
-- Employees and how far their salary is from the department average
SELECT
    EmployeeName,
    DepartmentID,
    Salary,
    AVG(Salary) OVER (PARTITION BY DepartmentID)          AS DeptAvg,
    Salary - AVG(Salary) OVER (PARTITION BY DepartmentID) AS DiffFromAvg,
    CASE WHEN Salary = MAX(Salary) OVER (PARTITION BY DepartmentID)
         THEN 'Top earner' END                            AS Flag
FROM Employees;
```

This is the window version of "salary above department average" from Section 09.09—but it can also **display** the average, and it reads `Employees` once.

---

# Percent of Total

```sql
SELECT
    p.CategoryID,
    p.ProductID,
    SUM(oi.Quantity * oi.UnitPrice) AS Revenue,
    100.0 * SUM(oi.Quantity * oi.UnitPrice)
          / SUM(SUM(oi.Quantity * oi.UnitPrice)) OVER (PARTITION BY p.CategoryID) AS PctOfCategory,
    100.0 * SUM(oi.Quantity * oi.UnitPrice)
          / SUM(SUM(oi.Quantity * oi.UnitPrice)) OVER ()                         AS PctOfAll
FROM OrderItems AS oi
JOIN Products AS p ON p.ProductID = oi.ProductID
GROUP BY p.CategoryID, p.ProductID;
```

Two denominators, two windows, one pass. Multiply by `100.0` (not `100`) to avoid integer division, and guard against zero totals with `NULLIF` where they are possible.

---

# Counting per Group

```sql
-- Customers with more than 5 orders, keeping all their order rows
SELECT *
FROM (
    SELECT o.*, COUNT(*) OVER (PARTITION BY o.CustomerID) AS OrdersOfCustomer
    FROM Orders AS o
) AS t
WHERE t.OrdersOfCustomer > 5;
```

`GROUP BY … HAVING COUNT(*) > 5` would find the customers; the window keeps their order rows too.

---

# Duplicates Detection with Counts

```sql
-- All rows that share an e-mail with another customer
SELECT *
FROM (
    SELECT c.*, COUNT(*) OVER (PARTITION BY LOWER(c.Email)) AS SameEmail
    FROM Customers AS c
    WHERE c.Email IS NOT NULL
) AS t
WHERE t.SameEmail > 1
ORDER BY LOWER(t.Email), t.CustomerID;
```

Compared with `GROUP BY … HAVING COUNT(*) > 1` (Section 08.08), this returns the duplicate **rows** themselves, ready for review or cleanup.

---

# Adding ORDER BY: Running Aggregates

```sql
SUM(TotalAmount) OVER (PARTITION BY CustomerID)                         -- total
SUM(TotalAmount) OVER (PARTITION BY CustomerID ORDER BY OrderDate, OrderID
                       ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) -- running total
MAX(TotalAmount) OVER (PARTITION BY CustomerID ORDER BY OrderDate, OrderID
                       ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) -- largest so far
COUNT(*)         OVER (PARTITION BY CustomerID ORDER BY OrderDate, OrderID
                       ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) -- order number
```

With `ORDER BY`, an aggregate window computes over a **frame**—by default from the partition start to the current row and its peers. Sections 11.05 and 11.06 cover frames and running calculations in depth.

---

# COUNT(DISTINCT) Over a Window

Most engines reject `DISTINCT` inside window aggregates:

```sql
-- ❌ PostgreSQL, SQL Server, MySQL, SQLite: DISTINCT is not implemented for window functions
COUNT(DISTINCT ProductID) OVER (PARTITION BY OrderID)
```

Oracle accepts it (without `ORDER BY` in the window). Portable alternatives:

```sql
-- 1. DENSE_RANK trick: distinct count = max dense rank ascending
MAX(dr) OVER (PARTITION BY OrderID)
-- where dr = DENSE_RANK() OVER (PARTITION BY OrderID ORDER BY ProductID)  (computed in a derived table)

-- 2. Sum of dense ranks ascending and descending minus one
DENSE_RANK() OVER (PARTITION BY OrderID ORDER BY ProductID ASC)
+ DENSE_RANK() OVER (PARTITION BY OrderID ORDER BY ProductID DESC) - 1

-- 3. Join to a GROUP BY that computes COUNT(DISTINCT …)
```

Option 2 counts `NULL` as a value if the column has `NULL`s; filter them out or adjust.

---

# Aggregate Windows over Grouped Data

```sql
-- Monthly revenue and year-to-date revenue
SELECT
    EXTRACT(YEAR FROM OrderDate)  AS Yr,
    EXTRACT(MONTH FROM OrderDate) AS Mon,
    SUM(TotalAmount) AS Revenue,
    SUM(SUM(TotalAmount)) OVER (PARTITION BY EXTRACT(YEAR FROM OrderDate)
                                ORDER BY EXTRACT(MONTH FROM OrderDate)
                                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS YearToDate
FROM Orders
GROUP BY EXTRACT(YEAR FROM OrderDate), EXTRACT(MONTH FROM OrderDate)
ORDER BY Yr, Mon;
```

Group first to the grain you want (month), then window over the groups. This is usually much cheaper than windowing over millions of detail rows and grouping afterwards.

---

# Window Aggregates vs GROUP BY + Join

```sql
-- Old style: join detail to its own aggregate
SELECT o.OrderID, o.TotalAmount, c.CustomerTotal
FROM Orders AS o
JOIN (SELECT CustomerID, SUM(TotalAmount) AS CustomerTotal
      FROM Orders GROUP BY CustomerID) AS c ON c.CustomerID = o.CustomerID;

-- Window
SELECT o.OrderID, o.TotalAmount,
       SUM(o.TotalAmount) OVER (PARTITION BY o.CustomerID) AS CustomerTotal
FROM Orders AS o;
```

One subtle difference: the join form drops orders whose `CustomerID` is `NULL` (a `NULL` key never joins), while the window puts all `NULL`-customer orders into one partition. Choose deliberately.

---

# Visual Representation

```text
Partition CustomerID = 2
┌─────┬────────┐        SUM OVER (PARTITION BY)   SUM OVER (… ORDER BY … ROWS …)
│ 103 │ 500.00 │   →    620.00                    500.00
│ 104 │ 120.00 │   →    620.00                    620.00
└─────┴────────┘
                        whole partition            start → current row
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE
4. GROUP BY    ← inner aggregates (SUM(x)) computed here
5. HAVING
6. WINDOW      ← window aggregates (SUM(SUM(x)) OVER …) computed here
7. SELECT
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
SUM(x) OVER (PARTITION BY g)            (no ORDER BY)

Sort by g
For each partition:
    buffer all rows, accumulate SUM
    emit every buffered row with the final SUM

SUM(x) OVER (PARTITION BY g ORDER BY d ROWS UNBOUNDED PRECEDING)

Sort by g, d
For each row: running_sum += x; emit row with running_sum   (no buffering)
```

---

# 🔬 Engine Deep Dive

For whole-partition aggregates, engines must buffer the entire partition before emitting its first row, because the total is not known until the last row is read. Very large partitions (for example, `OVER ()` over 100 million rows) are buffered to disk—PostgreSQL uses a tuplestore that spills to temporary files, SQL Server a worktable ("window spool"). Running aggregates avoid this buffering, which is one reason they can be cheaper than whole-partition totals.

---

# 🏗️ Architecture Insight

Aggregate windows let one query return data at two grains at once: detail rows and group context. That is the shape most UI tables need ("orders, with customer lifetime value"), and returning it from the database avoids a second query and client-side joining.

---

# ⚡ Performance Tip

Aggregate before windowing whenever the result grain allows it. A window over 12 monthly rows is trivial; the same window over 5 million order rows needs a large sort and buffer.

---

# 🔒 Security Note

Percent-of-total and group averages over small partitions can reveal individual values—a department of two employees with its average salary shown on each row. Apply minimum-group-size rules to reports that expose window aggregates, as with `GROUP BY` (Section 08.08).

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `SUM/AVG/COUNT/MIN/MAX OVER` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `COUNT(DISTINCT x) OVER` | ✅ | ❌ | ❌ | ❌ | ✅ (no `ORDER BY`) | ❌ |
| `STRING_AGG`/`LISTAGG` as window | ✅ | ✅ (`string_agg`) | ❌ (`GROUP_CONCAT` is not a window function) | ❌ | ✅ (`LISTAGG`) | ✅ (`group_concat`) |
| `FILTER (WHERE …)` on window aggregate | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| `AVG(int)` result type | numeric | numeric | decimal | **int** | number | real |

> **Portability Tip:** `CASE` inside the aggregate (`SUM(CASE WHEN … THEN x END) OVER (…)`) is the portable replacement for `FILTER`, and the `DENSE_RANK` trick replaces `COUNT(DISTINCT) OVER`.

---

# Common Mistakes

### Mistake 1

Adding `ORDER BY` to an aggregate window and getting running values instead of totals.

---

### Mistake 2

Integer division in percent-of-total calculations.

---

### Mistake 3

Using `COUNT(DISTINCT …) OVER` on engines that do not support it.

---

### Mistake 4

Windowing over detail rows and then using `DISTINCT` to reduce them, instead of grouping first.

---

### Mistake 5

Averaging integers on SQL Server and getting a truncated result.

---

# Best Practices

✔ Omit `ORDER BY` for partition totals; write an explicit frame when you add it.

✔ Multiply by `100.0` and use `NULLIF` for ratios.

✔ Group to the target grain first, then window.

✔ Use `CASE` inside window aggregates for conditional totals.

✔ Decide how `NULL` partition keys should behave.

---

# Interview Questions

## Basic

1. How do you show each order with its customer's total revenue?
2. What is the difference between `SUM(x) OVER (PARTITION BY g)` and `SUM(x) … GROUP BY g`?
3. How do you compute each row's percent of the total?

## Intermediate

4. How does adding `ORDER BY` change an aggregate window?
5. How do you return all rows of customers with more than five orders?
6. How can you emulate `COUNT(DISTINCT x) OVER (PARTITION BY g)`?

## Advanced

7. What does `SUM(SUM(x)) OVER ()` compute in a grouped query?
8. Why do whole-partition aggregates need buffering while running aggregates do not?
9. How does a window aggregate differ from a join to a grouped derived table for `NULL` keys?

---

# Hands-on Exercises

## Exercise 1

Return each product with its category's average price and the product's percentage above or below it.

---

## Exercise 2

Return every duplicate e-mail row with the number of customers sharing it.

---

## Exercise 3

Return monthly revenue with year-to-date and share-of-year columns.

---

## Exercise 4

Count distinct products per order on every order line without `COUNT(DISTINCT) OVER`.

---

# Related Topics

- **08.02 — Aggregate Functions (COUNT, SUM, AVG, MIN, MAX)**
- **08.04 — NULL Handling in Aggregates**
- **09.09 — Subqueries with Aggregates (Comparing Rows to Group Figures)**
- **11.05 — Window Frames (ROWS, RANGE and GROUPS)**
- **11.06 — Running Totals, Moving Averages and Shares**

---

# Summary

`SUM`, `AVG`, `COUNT`, `MIN` and `MAX` followed by `OVER` compute partition-level figures on every detail row, with the same `NULL` rules as in `GROUP BY`. Without a window `ORDER BY` they cover the whole partition; with one they cover a frame and become running values. They answer percent-of-total, comparison-with-average, per-group counts and duplicate listings in a single pass, and they can take `GROUP BY` aggregates as arguments to compute year-to-date and share-of-total figures. Most engines lack `COUNT(DISTINCT) OVER`, for which dense-rank or join workarounds exist.
