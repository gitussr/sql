---
title: "11.07 - LAG and LEAD"
description: "Offset window functions: LAG and LEAD with offsets and defaults, period-over-period changes and growth rates, time between events, detecting changes of state, comparing with the same period last year, IGNORE NULLS, and replacing self-joins on 'previous row'."
chapter: 11
section: 11.07
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 30 min
lastUpdated: 2026-09-25
---

# 11.07 LAG and LEAD

---

# Learning Objectives

After completing this section, you will be able to:

- Read values from previous and following rows with `LAG` and `LEAD`.
- Use offsets and default values.
- Compute period-over-period differences and growth rates.
- Measure time between consecutive events.
- Detect changes of state between rows.
- Replace "previous row" self-joins with offset functions.

---

# What LAG and LEAD Do

```sql
LAG (expression [, offset [, default]]) OVER ([PARTITION BY …] ORDER BY …)
LEAD(expression [, offset [, default]]) OVER ([PARTITION BY …] ORDER BY …)
```

- `LAG` returns the value of `expression` from the row `offset` rows **before** the current row in window order (default offset 1).
- `LEAD` returns it from the row `offset` rows **after**.
- If that row does not exist (start or end of the partition), they return `default` (or `NULL` if none).

```sql
SELECT
    SalesDate,
    Revenue,
    LAG(Revenue)        OVER (ORDER BY SalesDate) AS PrevDay,
    LEAD(Revenue)       OVER (ORDER BY SalesDate) AS NextDay,
    LAG(Revenue, 7)     OVER (ORDER BY SalesDate) AS SameDayLastWeek,
    LAG(Revenue, 1, 0)  OVER (ORDER BY SalesDate) AS PrevDayOrZero
FROM DailySales;
```

```text
┌────────────┬─────────┬─────────┬─────────┐
│ SalesDate  │ Revenue │ PrevDay │ NextDay │
├────────────┼─────────┼─────────┼─────────┤
│ 2026-09-01 │ 100     │ NULL    │ 120     │
│ 2026-09-02 │ 120     │ 100     │  90     │
│ 2026-09-03 │  90     │ 120     │ 110     │
│ 2026-09-04 │ 110     │  90     │ NULL    │
└────────────┴─────────┴─────────┴─────────┘
```

`LAG` and `LEAD` require `ORDER BY` and ignore frames.

---

# Period-over-Period Change

```sql
SELECT
    Yr, Mon, Revenue,
    Revenue - LAG(Revenue) OVER (ORDER BY Yr, Mon)                          AS ChangeFromPrev,
    ROUND(100.0 * (Revenue - LAG(Revenue) OVER (ORDER BY Yr, Mon))
          / NULLIF(LAG(Revenue) OVER (ORDER BY Yr, Mon), 0), 1)            AS GrowthPct
FROM (
    SELECT EXTRACT(YEAR FROM OrderDate) AS Yr, EXTRACT(MONTH FROM OrderDate) AS Mon,
           SUM(TotalAmount) AS Revenue
    FROM Orders
    GROUP BY EXTRACT(YEAR FROM OrderDate), EXTRACT(MONTH FROM OrderDate)
) AS m
ORDER BY Yr, Mon;
```

`NULLIF(…, 0)` avoids division by zero; the first month has `NULL` growth, which is correct—there is nothing to compare with.

---

# Same Period Last Year

Two approaches:

```sql
-- 1. LAG by 12 rows — correct only if every month is present
LAG(Revenue, 12) OVER (ORDER BY Yr, Mon)

-- 2. Partition by month, order by year — robust to missing months
LAG(Revenue) OVER (PARTITION BY Mon ORDER BY Yr) AS SameMonthLastYear
```

Approach 2 compares each month with the same month of the previous year that has data. If a year may be missing entirely, check `LAG(Yr) OVER (PARTITION BY Mon ORDER BY Yr) = Yr - 1` before using the value—or densify with a calendar table (Section 11.06).

---

# Time Between Events

```sql
-- Days since the customer's previous order
SELECT
    CustomerID,
    OrderID,
    OrderDate,
    OrderDate - LAG(OrderDate) OVER (PARTITION BY CustomerID
                                     ORDER BY OrderDate, OrderID) AS DaysSincePrev
FROM Orders;
```

(PostgreSQL date subtraction returns days; SQL Server uses `DATEDIFF(day, LAG(…) OVER (…), OrderDate)`, MySQL `DATEDIFF(OrderDate, LAG(…) OVER (…))`, Oracle date subtraction, SQLite `julianday(…) - julianday(…)`.)

Aggregating these gaps gives average reorder intervals; large gaps mark churn risk.

---

# Detecting Changes of State

```sql
-- Order status history: keep only rows where the status changed
SELECT *
FROM (
    SELECT h.OrderID, h.ChangedAt, h.Status,
           LAG(h.Status) OVER (PARTITION BY h.OrderID ORDER BY h.ChangedAt, h.HistoryID) AS PrevStatus
    FROM OrderStatusHistory AS h
) AS t
WHERE t.PrevStatus IS NULL OR t.Status <> t.PrevStatus;
```

The same pattern detects price changes, address changes and threshold crossings (`Value >= Limit AND LAG(Value) < Limit`). It is also the first step of gaps-and-islands analysis (Section 11.12).

---

# Using LEAD for "Valid Until"

`LEAD` turns a list of change events into validity intervals:

```sql
-- Price history → from/to periods
SELECT
    ProductID,
    ListPrice,
    ChangedAt                                                         AS ValidFrom,
    LEAD(ChangedAt) OVER (PARTITION BY ProductID ORDER BY ChangedAt) AS ValidTo   -- NULL = current
FROM ProductPriceHistory;
```

Joining orders to this result on `OrderDate >= ValidFrom AND (OrderDate < ValidTo OR ValidTo IS NULL)` finds the price in force at each order.

---

# Replacing Self-Joins

Before offset functions, "previous row" meant a self-join or correlated subquery:

```sql
-- Old: correlated subquery for the previous order date
SELECT o.OrderID, o.OrderDate,
       (SELECT MAX(o2.OrderDate) FROM Orders o2
        WHERE o2.CustomerID = o.CustomerID AND o2.OrderDate < o.OrderDate) AS PrevOrderDate
FROM Orders AS o;

-- New
SELECT OrderID, OrderDate,
       LAG(OrderDate) OVER (PARTITION BY CustomerID ORDER BY OrderDate, OrderID) AS PrevOrderDate
FROM Orders;
```

The window is shorter, handles same-day orders deterministically (with the tiebreaker), and runs in one pass.

---

# IGNORE NULLS

The standard lets `LAG`/`LEAD` skip `NULL` values—"the previous non-null reading":

```sql
-- Oracle, SQL Server 2022+
LAG(Reading) IGNORE NULLS OVER (PARTITION BY SensorID ORDER BY ReadAt)
```

PostgreSQL, MySQL and SQLite do not support `IGNORE NULLS`; Section 11.13 shows the portable workaround (carry-forward with a running count).

---

# Visual Representation

```text
ordered partition:   r1   r2   r3   r4   r5
                          ▲    ●    ▲
                          │         │
                     LAG(x) = r2.x   LEAD(x) = r4.x      (● current row r3)

LAG(x, 2) = r1.x      LEAD(x, 2) = r5.x      LAG at r1 → default / NULL
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← filtered-out rows are not "previous" to anything
4. GROUP BY    ← group to one row per period before comparing periods
5. HAVING
6. WINDOW      ← LAG / LEAD read neighbours here
7. SELECT
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

As with running totals, filtering in `WHERE` changes what the "previous row" is. To show September with August as the previous month, compute `LAG` over all months in a derived table and filter outside.

---

# How the DBMS Executes This

```text
LAG(x, 1) OVER (PARTITION BY p ORDER BY o)

Sort (p, o)
Window operator keeps a buffer of the last k rows of the partition (k = offset)
  per row: output buffer[k-th previous] or default; push current row

LEAD(x, 1): buffer one row ahead; emit the previous row when the next arrives
```

Offsets are constant work per row; a large offset (`LAG(x, 365)`) needs a larger buffer.

---

# 🔬 Engine Deep Dive

Several `LAG`/`LEAD` calls with the same `PARTITION BY` and `ORDER BY` share one sort and one window pass. Mixing `LAG(x) OVER (ORDER BY a)` with `LAG(y) OVER (ORDER BY b)` needs two sorts. A named window (Section 11.11) makes it obvious when definitions are shared.

---

# 🏗️ Architecture Insight

`LAG` and `LEAD` turn event logs into state and durations: status changes into time-in-status, price changes into validity intervals, logins into session gaps. That lets systems store only immutable events (an append-only history table) and derive intervals at query time—simpler writes, and history that cannot drift out of sync.

---

# ⚡ Performance Tip

When comparing periods, aggregate to one row per period first and apply `LAG` to the small result. Applying `LAG` to millions of detail rows and aggregating afterwards does far more sorting.

---

# 🔒 Security Note

Offset functions can expose data from rows adjacent to the ones a user is meant to focus on. If a report filters to "my team" in an outer query but computes `LAG` over all employees in an inner one, each row may carry a neighbour's value. Apply access filters before computing windows.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `LAG` / `LEAD` | ✅ | ✅ | ✅ (8.0+) | ✅ (2012+) | ✅ | ✅ (3.25+) |
| Offset and default arguments | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `IGNORE NULLS` | ✅ | ❌ | ❌ | ✅ (2022+) | ✅ | ❌ |
| Default of different type than expression | Must be compatible | Must match | Coerced | Coerced | Coerced | Loose |

> **Portability Tip:** `LAG(x, n, default)` with `PARTITION BY` and a unique `ORDER BY` is fully portable. Avoid `IGNORE NULLS` in code that must run on PostgreSQL, MySQL or SQLite.

---

# Common Mistakes

### Mistake 1

Non-unique `ORDER BY`, so "previous" is arbitrary for tied rows.

---

### Mistake 2

`LAG(x, 12)` for "same month last year" when months can be missing.

---

### Mistake 3

Filtering in `WHERE` and losing the previous period needed for the first displayed row.

---

### Mistake 4

Division by a `LAG` value of zero or `NULL` without `NULLIF`.

---

### Mistake 5

Forgetting `PARTITION BY`, so the first order of one customer is compared with the last order of another.

---

# Best Practices

✔ Partition by the entity and order uniquely.

✔ Aggregate to the period grain before comparing periods.

✔ Use `PARTITION BY period-of-year ORDER BY year` for year-over-year.

✔ Guard ratios with `NULLIF`.

✔ Compute `LAG`/`LEAD` before filtering the displayed range.

---

# Interview Questions

## Basic

1. What do `LAG` and `LEAD` return?
2. What happens at the first row of a partition?
3. How do you compute month-over-month change?

## Intermediate

4. How do you compute days between a customer's consecutive orders?
5. How do you keep only rows where a status changed?
6. Why is `LAG(x, 12)` risky for year-over-year comparison?

## Advanced

7. How do you build validity intervals from a change log?
8. What does `IGNORE NULLS` do and which engines support it?
9. Why can filtering in `WHERE` change `LAG` results?

---

# Hands-on Exercises

## Exercise 1

Compute daily revenue change and growth percentage from `DailySales`.

---

## Exercise 2

Compute the average number of days between orders per customer.

---

## Exercise 3

Build a price validity table from `ProductPriceHistory` and join orders to it.

---

## Exercise 4

Compute year-over-year monthly growth robust to missing months.

---

# Related Topics

- **11.06 — Running Totals, Moving Averages and Shares**
- **11.08 — FIRST_VALUE, LAST_VALUE and NTH_VALUE**
- **11.12 — Gaps and Islands**
- **11.13 — NULL Handling in Window Functions**
- **07.08 — SELF JOIN**

---

# Summary

`LAG` and `LEAD` return a value from a row a fixed number of positions before or after the current row in window order, with a default (or `NULL`) where no such row exists. They compute period-over-period changes and growth rates, times between events, state changes and validity intervals, replacing self-joins and correlated subqueries with single-pass window computations. They require a unique `ORDER BY` and usually a `PARTITION BY` per entity, ignore frames, and see only rows that survived `WHERE`—so compute them before filtering the displayed range and aggregate to the period grain first.
