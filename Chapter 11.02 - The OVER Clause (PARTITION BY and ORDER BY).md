---
title: "11.02 - The OVER Clause (PARTITION BY and ORDER BY)"
description: "The OVER clause in depth: empty windows, PARTITION BY on columns and expressions, ORDER BY inside the window versus the query ORDER BY, the default frame and its consequences, deterministic ordering with tiebreakers, NULL ordering, and windows over grouped results."
chapter: 11
section: 11.02
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 30 min
lastUpdated: 2026-09-25
---

# 11.02 The OVER Clause (PARTITION BY and ORDER BY)

---

# Learning Objectives

After completing this section, you will be able to:

- Write `OVER ()`, `OVER (PARTITION BY …)`, `OVER (ORDER BY …)` and combinations.
- Partition by columns and by expressions.
- Explain the difference between a window `ORDER BY` and the query's `ORDER BY`.
- Predict the default frame and its effect on aggregates.
- Make window orderings deterministic.
- Use window functions over the results of `GROUP BY`.

---

# The Grammar

```sql
window_function OVER (
    [PARTITION BY expr [, ...]]
    [ORDER BY expr [ASC | DESC] [NULLS FIRST | NULLS LAST] [, ...]]
    [frame_clause]
)

-- or reference a named window (Section 11.11)
window_function OVER window_name
```

Each part is optional, but each changes the result.

---

# OVER ()

An empty `OVER` makes the whole result one window:

```sql
SELECT
    ProductName,
    ListPrice,
    AVG(ListPrice) OVER ()                     AS AvgPrice,
    ListPrice - AVG(ListPrice) OVER ()         AS DiffFromAvg,
    100.0 * ListPrice / SUM(ListPrice) OVER () AS PctOfTotalListPrice
FROM Products;
```

Every row sees every row. This replaces the uncorrelated scalar subquery `(SELECT AVG(ListPrice) FROM Products)`—with one difference: the window sees only rows that passed the query's `WHERE`, while a subquery sees whatever its own `FROM` and `WHERE` select.

---

# PARTITION BY

`PARTITION BY` splits rows into independent groups; each window function restarts in every partition.

```sql
SELECT
    OrderID,
    CustomerID,
    TotalAmount,
    COUNT(*)         OVER (PARTITION BY CustomerID)          AS OrdersOfCustomer,
    SUM(TotalAmount) OVER (PARTITION BY CustomerID, Status)  AS TotalByCustomerStatus
FROM Orders;
```

Partitioning by several columns works like grouping by several columns. Expressions are allowed too:

```sql
-- Revenue per calendar month, on every order row
SUM(TotalAmount) OVER (PARTITION BY EXTRACT(YEAR FROM OrderDate), EXTRACT(MONTH FROM OrderDate))
```

Different window functions in the same query can use different partitions—each is computed independently.

---

# ORDER BY Inside the Window

The window `ORDER BY` orders rows **within each partition** for the purpose of the function. It does not order the query's output.

```sql
SELECT OrderID, CustomerID, OrderDate,
       ROW_NUMBER() OVER (PARTITION BY CustomerID ORDER BY OrderDate, OrderID) AS Seq
FROM Orders
ORDER BY OrderID;          -- output order: by OrderID, regardless of the window order
```

```text
Window ORDER BY    → which row is "first", "previous", "running up to here"
Query  ORDER BY    → the order rows are returned in
```

Without a query `ORDER BY`, output order is undefined—even though rows often come out in window order because the engine sorted them.

---

# ORDER BY Changes Aggregate Results

For ranking and offset functions, `ORDER BY` is required. For **aggregate** window functions, adding `ORDER BY` changes the meaning:

```sql
SUM(TotalAmount) OVER (PARTITION BY CustomerID)                     -- customer total
SUM(TotalAmount) OVER (PARTITION BY CustomerID ORDER BY OrderDate)  -- running total
```

Why? Because of the **default frame**:

| Window has `ORDER BY`? | Default frame |
|------------------------|---------------|
| No | Whole partition |
| Yes | `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` |

"From the start of the partition up to the current row—including every row that ties with it." Section 11.05 explains frames; the practical rule is: when you add `ORDER BY` to an aggregate window, write the frame you mean.

---

# The Tie Trap in the Default Frame

```sql
SELECT OrderID, OrderDate, TotalAmount,
       SUM(TotalAmount) OVER (ORDER BY OrderDate) AS RunningTotal
FROM Orders;
```

```text
┌─────┬────────────┬────────┬──────────────┐
│ Ord │ OrderDate  │ Amount │ RunningTotal │
├─────┼────────────┼────────┼──────────────┤
│ 101 │ 2026-01-03 │ 250.00 │ 250.00       │
│ 103 │ 2026-01-04 │ 500.00 │ 870.00       │  ← includes 106 (same date)
│ 106 │ 2026-01-04 │ 120.00 │ 870.00       │  ← same value: RANGE includes peers
│ 105 │ 2026-02-01 │  60.00 │ 930.00       │
└─────┴────────────┴────────┴──────────────┘
```

With `RANGE`, all rows with the same `OrderDate` are **peers** and get the same running total. For a strictly row-by-row running total, use `ROWS` and a unique ordering:

```sql
SUM(TotalAmount) OVER (ORDER BY OrderDate, OrderID
                       ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
```

---

# Deterministic Ordering

If the window `ORDER BY` has ties, functions that depend on position—`ROW_NUMBER`, `LAG`, `LEAD`, `FIRST_VALUE`, `ROWS` frames—may return different results on different executions.

```sql
-- ❌ Two orders on the same date: which is "latest" is arbitrary
ROW_NUMBER() OVER (PARTITION BY CustomerID ORDER BY OrderDate DESC)

-- ✅ Unique ordering
ROW_NUMBER() OVER (PARTITION BY CustomerID ORDER BY OrderDate DESC, OrderID DESC)
```

The tiebreaker must make `(partition, order)` unique—typically the primary key.

---

# NULLs in the Window ORDER BY

`NULL`s sort first or last depending on the engine (last for ascending in PostgreSQL and Oracle; first in MySQL, SQL Server and SQLite). Where supported, say which you want:

```sql
RANK() OVER (ORDER BY Salary DESC NULLS LAST)      -- PostgreSQL, Oracle, SQLite 3.30+
```

Elsewhere, sort by an expression first: `ORDER BY CASE WHEN Salary IS NULL THEN 1 ELSE 0 END, Salary DESC`. Section 11.13 covers `NULL` handling in depth.

---

# Windows over GROUP BY Results

Windows run after `GROUP BY`, so they can operate on groups, and their argument can be an aggregate:

```sql
-- Monthly revenue, each month's share of the year, and rank within the year
SELECT
    EXTRACT(YEAR FROM OrderDate)  AS Yr,
    EXTRACT(MONTH FROM OrderDate) AS Mon,
    SUM(TotalAmount)                                                         AS Revenue,
    SUM(TotalAmount) / SUM(SUM(TotalAmount)) OVER (PARTITION BY EXTRACT(YEAR FROM OrderDate)) AS ShareOfYear,
    RANK() OVER (PARTITION BY EXTRACT(YEAR FROM OrderDate) ORDER BY SUM(TotalAmount) DESC)  AS RankInYear
FROM Orders
GROUP BY EXTRACT(YEAR FROM OrderDate), EXTRACT(MONTH FROM OrderDate)
ORDER BY Yr, Mon;
```

`SUM(SUM(TotalAmount)) OVER (…)` reads as: the inner `SUM` is the `GROUP BY` aggregate per month; the outer `SUM … OVER` adds those monthly sums across the year. The window's `PARTITION BY` and `ORDER BY` may reference only grouping columns and aggregates, just like the `SELECT` list (Section 08.07).

---

# Visual Representation

```text
Orders sorted for OVER (PARTITION BY CustomerID ORDER BY OrderDate, OrderID)

┌── partition CustomerID = 1 ──┐┌── partition CustomerID = 2 ──┐┌── 3 ──┐
│ 101 (01-03) → 102 (02-11)     ││ 103 (01-04) → 104 (03-19)    ││ 105   │
└───────────────────────────────┘└──────────────────────────────┘└───────┘
  functions restart at every partition boundary
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE
4. GROUP BY    ← groups are formed before windows
5. HAVING
6. WINDOW      ← PARTITION BY / ORDER BY evaluated over the surviving (grouped) rows
7. SELECT
8. DISTINCT
9. ORDER BY    ← the query's ORDER BY: independent of the window's ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Two windows with compatible definitions share one sort:

  SUM(x)       OVER (PARTITION BY CustomerID)
  ROW_NUMBER() OVER (PARTITION BY CustomerID ORDER BY OrderDate)

  Sort (CustomerID, OrderDate)          ← satisfies both
    WindowAgg (ROW_NUMBER)
      WindowAgg (SUM)

Two incompatible windows need two sorts:

  … OVER (PARTITION BY CustomerID ORDER BY OrderDate)
  … OVER (PARTITION BY Status     ORDER BY TotalAmount)
```

---

# 🔬 Engine Deep Dive

The SQL standard specifies that window `ORDER BY` defines a logical ordering only for the window; it makes no promise about output order. PostgreSQL, for example, may return rows in window order by coincidence and in a different order after an engine upgrade or a plan change. Tests that rely on "it happened to come back sorted" are a frequent source of flaky behaviour.

---

# 🏗️ Architecture Insight

`PARTITION BY` is `GROUP BY` without the collapse. Thinking of a window as "the group this row belongs to, kept alongside the row" makes most window queries straightforward to design: decide the group (partition), decide what "before" and "after" mean (order), decide how much of the group matters (frame).

---

# ⚡ Performance Tip

Order and partition several window functions in the same query identically where the question allows it. The engine then sorts once instead of once per distinct window definition.

---

# 🔒 Security Note

No special security considerations apply to the `OVER` clause itself. As with every query, windows see only the rows the user is permitted to read.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `OVER ()` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Expressions in `PARTITION BY` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `NULLS FIRST/LAST` in window `ORDER BY` | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ (3.30+) |
| Default frame with `ORDER BY` | `RANGE … CURRENT ROW` | same | same | same | same | same |
| Aggregate argument in window (`SUM(SUM(x)) OVER`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Constant/ordinal in window `ORDER BY` | n/a | Expression | Expression | ❌ constants | Expression | Expression |

> **Portability Tip:** The default frame is the same everywhere—which means the tie trap is too. Always write the frame explicitly when an aggregate window has `ORDER BY`.

---

# Common Mistakes

### Mistake 1

Assuming the window `ORDER BY` sorts the output.

---

### Mistake 2

Adding `ORDER BY` to `SUM() OVER (PARTITION BY …)` and getting running totals instead of partition totals.

---

### Mistake 3

Using `RANGE` (the default) for a running total over a non-unique order key.

---

### Mistake 4

Ordering by a non-unique key in `ROW_NUMBER` and getting non-deterministic results.

---

# Best Practices

✔ Always give the query its own `ORDER BY`.

✔ Write the frame explicitly for aggregate windows with `ORDER BY`.

✔ Add a unique tiebreaker to every position-dependent window.

✔ State `NULLS FIRST/LAST` where supported.

✔ Reuse identical window definitions to share sorts.

---

# Interview Questions

## Basic

1. What does `PARTITION BY` do?
2. What is the difference between the window `ORDER BY` and the query `ORDER BY`?
3. What does `OVER ()` compute over?

## Intermediate

4. Why does `SUM(x) OVER (ORDER BY d)` produce a running total?
5. Why can two rows with the same date get the same running total?
6. How do you make `ROW_NUMBER()` deterministic?

## Advanced

7. What does `SUM(SUM(x)) OVER (PARTITION BY y)` mean?
8. When can several window functions share one sort?
9. Why might tests that rely on window order without a query `ORDER BY` become flaky?

---

# Hands-on Exercises

## Exercise 1

Return every product with the average list price of its category and the difference from it.

---

## Exercise 2

Show a running total by `OrderDate` with `RANGE` and with `ROWS`; find the rows where they differ.

---

## Exercise 3

Return monthly revenue with each month's share of its year.

---

## Exercise 4

Rank customers by total revenue within each country, using `GROUP BY` and a window together.

---

# Related Topics

- **11.01 — Introduction to Window Functions**
- **11.05 — Window Frames (ROWS, RANGE and GROUPS)**
- **11.11 — Named Windows and the WINDOW Clause**
- **11.13 — NULL Handling in Window Functions**
- **08.07 — The SELECT List Rule (Functional Dependency)**

---

# Summary

The `OVER` clause defines a window with `PARTITION BY` (which rows form independent groups), `ORDER BY` (the order within each partition) and an optional frame. `OVER ()` treats the whole result as one window. The window `ORDER BY` affects the function, not the output order, and on aggregate windows it activates the default `RANGE … CURRENT ROW` frame, turning totals into running totals that treat tied rows as peers. Make position-dependent orderings unique, write frames explicitly, and remember that windows over `GROUP BY` results can take aggregates as arguments.
