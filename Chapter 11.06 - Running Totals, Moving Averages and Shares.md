---
title: "11.06 - Running Totals, Moving Averages and Shares"
description: "Cumulative and moving calculations with windows: running totals and balances, year-to-date and period-to-date resets, moving averages and sums, cumulative shares and Pareto analysis, running minimums and maximums, densifying time series with a calendar table, and correctness pitfalls."
chapter: 11
section: 11.06
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 30 min
lastUpdated: 2026-09-25
---

# 11.06 Running Totals, Moving Averages and Shares

---

# Learning Objectives

After completing this section, you will be able to:

- Compute running totals and balances that are correct with ties.
- Reset cumulative figures by year, month or any other period.
- Compute moving sums and averages over rows and over calendar time.
- Compute cumulative percentages and perform a Pareto (80/20) analysis.
- Track running minimums and maximums (records, drawdowns).
- Densify sparse time series with a calendar table before windowing.

---

# Running Totals

```sql
SELECT
    OrderID,
    OrderDate,
    TotalAmount,
    SUM(TotalAmount) OVER (ORDER BY OrderDate, OrderID
                           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS RunningTotal
FROM Orders
ORDER BY OrderDate, OrderID;
```

Three ingredients make it correct:

1. A **unique** window order (`OrderDate, OrderID`), so every row has a well-defined position.
2. An explicit **`ROWS`** frame, so tied dates do not share a value (Section 11.05).
3. A matching **query `ORDER BY`**, so the output is shown in the order the total accumulates.

---

# Running Balances per Account

```sql
SELECT
    t.AccountID,
    t.PostedAt,
    t.TransactionID,
    t.Amount,
    SUM(t.Amount) OVER (PARTITION BY t.AccountID
                        ORDER BY t.PostedAt, t.TransactionID
                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS Balance
FROM Transactions AS t
ORDER BY t.AccountID, t.PostedAt, t.TransactionID;
```

Adding `PARTITION BY` restarts the total for each account. If accounts have opening balances, add them: `a.OpeningBalance + SUM(…) OVER (…)`.

---

# Period-to-Date Totals

Resetting a running total each period is simply partitioning by the period:

```sql
-- Year-to-date and month-to-date revenue on each day
SELECT
    SalesDate,
    Revenue,
    SUM(Revenue) OVER (PARTITION BY EXTRACT(YEAR FROM SalesDate)
                       ORDER BY SalesDate
                       ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS YearToDate,
    SUM(Revenue) OVER (PARTITION BY EXTRACT(YEAR FROM SalesDate), EXTRACT(MONTH FROM SalesDate)
                       ORDER BY SalesDate
                       ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS MonthToDate
FROM DailySales
ORDER BY SalesDate;
```

(Fiscal years that do not start in January partition by a fiscal-year expression instead.)

---

# Moving Sums and Averages

```sql
SELECT
    SalesDate,
    Revenue,
    AVG(Revenue) OVER (ORDER BY SalesDate
                       ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)  AS MovingAvg7,
    SUM(Revenue) OVER (ORDER BY SalesDate
                       ROWS BETWEEN 29 PRECEDING AND CURRENT ROW) AS MovingSum30,
    COUNT(*)     OVER (ORDER BY SalesDate
                       ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)  AS DaysInWindow
FROM DailySales
ORDER BY SalesDate;
```

`DaysInWindow` shows how many rows the first averages are based on—fewer than 7 at the start. Show the average only when the window is full if partial averages would mislead:

```sql
CASE WHEN COUNT(*) OVER (ORDER BY SalesDate ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) = 7
     THEN AVG(Revenue) OVER (ORDER BY SalesDate ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
END AS MovingAvg7
```

---

# Densifying Time Series

Row-based moving windows assume one row per period. Sparse data—days without sales—break that assumption. Join to a **calendar table** (or a generated series) first:

```sql
-- PostgreSQL: generate every day, fill missing revenue with 0
SELECT
    d.Day,
    COALESCE(s.Revenue, 0) AS Revenue,
    AVG(COALESCE(s.Revenue, 0)) OVER (ORDER BY d.Day
                                      ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS MovingAvg7
FROM generate_series(DATE '2026-01-01', DATE '2026-12-31', INTERVAL '1 day') AS d(Day)
LEFT JOIN DailySales AS s ON s.SalesDate = d.Day
ORDER BY d.Day;
```

Other engines use a permanent `Calendar` table or a recursive CTE. Decide whether a missing day means **zero** (no sales) or **unknown** (no data); the moving average differs.

The alternative is a value-based frame (`RANGE BETWEEN INTERVAL '6' DAY PRECEDING AND CURRENT ROW`, Section 11.05), which ignores missing days rather than counting them as zero.

---

# Cumulative Share and Pareto Analysis

"Which products make up 80% of revenue?"

```sql
SELECT *
FROM (
    SELECT
        ProductID,
        Revenue,
        SUM(Revenue) OVER (ORDER BY Revenue DESC, ProductID
                           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
          / SUM(Revenue) OVER ()                                  AS CumulativeShare
    FROM (
        SELECT ProductID, SUM(Quantity * UnitPrice) AS Revenue
        FROM OrderItems
        GROUP BY ProductID
    ) AS p
) AS t
WHERE t.CumulativeShare - t.Revenue / (SELECT SUM(Quantity * UnitPrice) FROM OrderItems) < 0.80
ORDER BY t.Revenue DESC;
```

The filter keeps products whose cumulative share **before** adding them is under 80%—that is, the products needed to reach 80%. A simpler variant keeps rows where `CumulativeShare <= 0.80` and adds the one that crosses the line separately.

---

# Running Minimum and Maximum

```sql
-- Record highs and drawdown from the running peak
SELECT
    SalesDate,
    Revenue,
    MAX(Revenue) OVER (ORDER BY SalesDate
                       ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS PeakSoFar,
    Revenue - MAX(Revenue) OVER (ORDER BY SalesDate
                                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS Drawdown,
    CASE WHEN Revenue > MAX(Revenue) OVER (ORDER BY SalesDate
                                           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
         THEN 'New record' END AS Flag
FROM DailySales
ORDER BY SalesDate;
```

The `1 PRECEDING` frame compares each day with the best day **before** it.

---

# Running Counts and Distinct-So-Far

```sql
-- Order number of each order in the customer's history
COUNT(*) OVER (PARTITION BY CustomerID ORDER BY OrderDate, OrderID
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)       -- same as ROW_NUMBER

-- Is this the customer's first order? (new-customer flag)
CASE WHEN ROW_NUMBER() OVER (PARTITION BY CustomerID ORDER BY OrderDate, OrderID) = 1
     THEN 1 ELSE 0 END AS IsFirstOrder

-- Cumulative number of new customers (in an outer query over the derived IsFirstOrder column)
SUM(IsFirstOrder) OVER (ORDER BY OrderDate, OrderID ROWS UNBOUNDED PRECEDING)
```

---

# Correctness Checklist

```text
□ Unique ORDER BY in the window (add the primary key)
□ Explicit ROWS frame (not the default RANGE)
□ PARTITION BY for every reset (account, year, month)
□ Query ORDER BY matching the accumulation order
□ Sparse time series densified or RANGE-interval framed
□ Partial windows at partition start handled
□ Integer division avoided in ratios (100.0 / CAST)
```

---

# Visual Representation

```text
Revenue per day      ▂ ▅ ▃ ▇ ▂ ▆ ▅ ▃ ▇ ▆
Running total        ▁ ▂ ▃ ▄ ▄ ▅ ▆ ▆ ▇ █        always rising (for positive values)
7-day moving avg       ─ ─ ▃ ▄ ▄ ▄ ▅ ▅ ▅         smoothed
Running max          ▂ ▅ ▅ ▇ ▇ ▇ ▇ ▇ ▇ ▇        steps up at records
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← calendar-table joins densify the data here
2. JOIN
3. WHERE       ← a WHERE on the date range also truncates running totals: they start inside the range
4. GROUP BY    ← aggregate to one row per period before windowing
5. HAVING
6. WINDOW      ← running and moving calculations here
7. SELECT
8. DISTINCT
9. ORDER BY    ← match the accumulation order
10. LIMIT / FETCH / TOP
```

Note the `WHERE` point: to show September with a running total that includes earlier months, compute the total in a derived table over all dates and filter to September **outside** it.

---

# How the DBMS Executes This

```text
SUM(x) OVER (PARTITION BY a ORDER BY d, id ROWS UNBOUNDED PRECEDING)

Sort (a, d, id)                    ← skipped if an index delivers this order
WindowAgg: running_sum per partition, reset at partition boundaries
Emit each row immediately (no buffering beyond the current row)
```

---

# 🔬 Engine Deep Dive

Before window functions, running totals were written as self-joins or correlated subqueries (`SUM` over all earlier rows), with O(n²) cost, or with "quirky update" tricks relying on undocumented update order. Window running totals are O(n) after the sort, and when an index supplies the order, the whole calculation streams in a single pass.

---

# 🏗️ Architecture Insight

Stored running balances (a `Balance` column on each transaction) are a denormalisation of `SUM() OVER (…)`. They make reads trivial but require strict ordering of writes and are corrupted by back-dated corrections. Computing balances with a window—possibly materialised per day—keeps a single source of truth and makes corrections automatic.

---

# ⚡ Performance Tip

For dashboards, aggregate to the display grain first (one row per day or month) and window over that. A 7-day moving average over 365 daily rows costs nothing; over 10 million order rows it needs a large sort.

---

# 🔒 Security Note

Running balances and cumulative figures reveal the history behind them: consecutive balances disclose each transaction amount. Treat them with the same sensitivity as the underlying transactions.

---

# SQL Standard vs Vendor Differences

| Feature | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|---------|-----------|-------|-----------|--------|--------|
| Running totals with `ROWS` | ✅ | ✅ | ✅ (2012+) | ✅ | ✅ |
| Time-based `RANGE INTERVAL` frame | ✅ (11+) | ✅ | ❌ | ✅ | ❌ |
| Series generation | `generate_series` | Recursive CTE | `GENERATE_SERIES` (2022+) | `CONNECT BY` / recursive CTE | Recursive CTE / `generate_series` extension |
| Batch-mode window aggregate | ❌ | ❌ | ✅ (2016+ columnstore; 2019+ rowstore) | ❌ | ❌ |

> **Portability Tip:** A permanent `Calendar` table (one row per day with year, month, fiscal period and holiday flags) is the most portable way to densify time series—and it is useful far beyond window functions.

---

# Common Mistakes

### Mistake 1

Running totals with the default `RANGE` frame over tied dates.

---

### Mistake 2

Filtering the date range in the same query and expecting the running total to include earlier periods.

---

### Mistake 3

Row-based moving averages over sparse data.

---

### Mistake 4

Showing partial moving averages at the start as if they were full.

---

### Mistake 5

Computing moving averages over detail rows instead of per-period aggregates.

---

# Best Practices

✔ Unique order, explicit `ROWS` frame, matching output order.

✔ Partition by the reset period for period-to-date totals.

✔ Densify with a calendar table, or use `RANGE` intervals, for time windows.

✔ Aggregate to the reporting grain before windowing.

✔ Compute cumulative totals before filtering the displayed range.

---

# Interview Questions

## Basic

1. How do you compute a running total?
2. How do you reset a running total every year?
3. How do you compute a 7-day moving average?

## Intermediate

4. Why do you need a unique `ORDER BY` for a running total?
5. How do missing days affect a row-based moving average, and how do you fix it?
6. How do you find the products that make up 80% of revenue?

## Advanced

7. Why does filtering `WHERE OrderDate >= '2026-09-01'` change a running total, and how do you avoid it?
8. How would you flag days that set a new revenue record?
9. What are the trade-offs of storing running balances versus computing them?

---

# Hands-on Exercises

## Exercise 1

Compute a running balance per account from a transactions table with an opening balance.

---

## Exercise 2

Compute month-to-date and year-to-date revenue from `DailySales`.

---

## Exercise 3

Densify a sparse `DailySales` table for 2026 and compute a 7-day moving average treating missing days as zero.

---

## Exercise 4

Produce a Pareto table of customers by revenue with cumulative share.

---

# Related Topics

- **11.04 — Aggregate Window Functions**
- **11.05 — Window Frames (ROWS, RANGE and GROUPS)**
- **11.07 — LAG and LEAD**
- **11.15 — Window Function Performance and Index Strategy**
- **13.xx — Date and Time Functions**

---

# Summary

Running totals, balances and counts are aggregate windows with a unique ordering and an explicit `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` frame, partitioned by whatever should reset them—account, year or month. Moving sums and averages use bounded frames and need either one row per period (densified with a calendar table) or a value-based `RANGE` interval frame. Cumulative shares divide a running total by a whole-window total and support Pareto analysis, and running `MAX`/`MIN` reveal records and drawdowns. Aggregate to the reporting grain first, and compute cumulative figures before filtering the displayed range.
