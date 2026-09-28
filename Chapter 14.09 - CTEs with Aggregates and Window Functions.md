---
title: "14.09 - CTEs with Aggregates and Window Functions"
description: "Multi-step analysis with CTEs: aggregating then windowing, filtering on window function results, aggregating window results, percent of total and ranking over grouped data, comparing rows with group statistics, period-over-period change, median and percentile steps, funnel and cohort analysis, and how naming each step avoids repeating expressions and nesting derived tables."
chapter: 14
section: 14.09
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 14.09 CTEs with Aggregates and Window Functions

---

# Learning Objectives

After completing this section, you will be able to:

- Explain why aggregates and window functions often need separate query steps.
- Filter on the result of a window function using a CTE.
- Rank, share and compare aggregated data.
- Build period-over-period and funnel analyses as CTE pipelines.
- Avoid repeating complex expressions across clauses.

---

# Why Steps Are Needed

Recall the logical processing order (Chapter 04): `WHERE` → `GROUP BY` → `HAVING` → `WINDOW` → `SELECT` → `ORDER BY`. Three consequences force a second step:

```text
1. Window functions are computed after WHERE and HAVING
   → you cannot filter on ROW_NUMBER() in the same query's WHERE
2. Window functions cannot be nested inside aggregates (or vice versa, except over grouped results)
   → "average of a running total" needs two steps
3. SELECT aliases are not visible in WHERE, GROUP BY or HAVING on most engines
   → repeating a long expression, or naming it one step earlier
```

A CTE gives each step a name. (`QUALIFY`—Section 11.10—solves case 1 on some engines.)

---

# Filter on a Window Function

```sql
-- Top 3 products by revenue in each category
WITH ProductRevenue AS (
    SELECT p.CategoryID, p.ProductID, p.ProductName,
           SUM(oi.Quantity * oi.UnitPrice) AS Revenue
    FROM OrderItems AS oi
    JOIN Products   AS p ON p.ProductID = oi.ProductID
    GROUP BY p.CategoryID, p.ProductID, p.ProductName
),
Ranked AS (
    SELECT pr.*,
           DENSE_RANK() OVER (PARTITION BY CategoryID ORDER BY Revenue DESC) AS RevenueRank
    FROM ProductRevenue AS pr
)
SELECT CategoryID, ProductName, Revenue, RevenueRank
FROM Ranked
WHERE RevenueRank <= 3
ORDER BY CategoryID, RevenueRank;
```

```text
OrderItems ──▶ ProductRevenue ──▶ Ranked ──▶ WHERE RevenueRank <= 3
               (GROUP BY)         (window)   (filter on the window result)
```

---

# Aggregate, Then Window

Window functions can run over grouped rows in the same query (`SUM(SUM(x)) OVER ()`), but a separate step is clearer:

```sql
WITH CategoryRevenue AS (
    SELECT p.CategoryID, SUM(oi.Quantity * oi.UnitPrice) AS Revenue
    FROM OrderItems AS oi
    JOIN Products   AS p ON p.ProductID = oi.ProductID
    GROUP BY p.CategoryID
)
SELECT CategoryID, Revenue,
       ROUND(100.0 * Revenue / SUM(Revenue) OVER (), 1)   AS PctOfTotal,
       RANK() OVER (ORDER BY Revenue DESC)                AS RevenueRank,
       SUM(Revenue) OVER (ORDER BY Revenue DESC
                          ROWS UNBOUNDED PRECEDING)       AS CumulativeRevenue
FROM CategoryRevenue
ORDER BY RevenueRank;
```

Share of total, rank and a Pareto-style cumulative total, all over the aggregated categories.

---

# Window, Then Aggregate

The reverse order—aggregate the results of a window function—always needs two steps:

```sql
-- Average gap in days between consecutive orders, per customer
WITH Gaps AS (
    SELECT CustomerID,
           OrderDate - LAG(OrderDate) OVER (PARTITION BY CustomerID ORDER BY OrderDate) AS GapDays
    FROM Orders
)
SELECT CustomerID,
       COUNT(GapDays)          AS Repeats,
       AVG(GapDays)            AS AvgDaysBetweenOrders
FROM Gaps
GROUP BY CustomerID
HAVING COUNT(GapDays) >= 3;
```

`AVG(LAG(…) OVER (…))` in one query is an error: window functions cannot appear inside aggregates.

---

# Comparing Rows With Group Figures

```sql
-- Employees paid more than their department's average, with the difference
WITH DeptStats AS (
    SELECT DepartmentID, AVG(Salary) AS AvgSalary, COUNT(*) AS Headcount
    FROM Employees
    WHERE Salary IS NOT NULL
    GROUP BY DepartmentID
)
SELECT e.EmployeeName, e.DepartmentID, e.Salary, d.AvgSalary,
       e.Salary - d.AvgSalary AS AboveAverage
FROM Employees AS e
JOIN DeptStats AS d ON d.DepartmentID = e.DepartmentID
WHERE e.Salary > d.AvgSalary;
```

The same can be written with `AVG(Salary) OVER (PARTITION BY DepartmentID)` in one CTE step (Section 11.04); the join form is useful when the group statistics are reused or come from a different grain.

---

# Period-over-Period Change

```sql
WITH Monthly AS (
    SELECT DATE_TRUNC('month', OrderDate)::date AS Month,
           SUM(TotalAmount)                     AS Revenue
    FROM Orders
    WHERE OrderDate >= DATE '2025-01-01' AND OrderDate < DATE '2027-01-01'
    GROUP BY DATE_TRUNC('month', OrderDate)
),
WithPrior AS (
    SELECT Month, Revenue,
           LAG(Revenue, 1)  OVER (ORDER BY Month) AS PrevMonth,
           LAG(Revenue, 12) OVER (ORDER BY Month) AS SameMonthLastYear
    FROM Monthly
)
SELECT Month, Revenue,
       ROUND(100.0 * (Revenue - PrevMonth)         / NULLIF(PrevMonth, 0), 1)         AS MoMPct,
       ROUND(100.0 * (Revenue - SameMonthLastYear) / NULLIF(SameMonthLastYear, 0), 1) AS YoYPct
FROM WithPrior
WHERE Month >= DATE '2026-01-01'
ORDER BY Month;
```

Two details matter. The date filter in `Monthly` includes 2025 so `LAG(…, 12)` has data for 2026; the final `WHERE` then keeps 2026 only—filtering 2025 out earlier would make every year-over-year value `NULL`. And `LAG(…, 12)` assumes every month is present; fill gaps from a calendar first (Section 13.11) if some months can be empty.

---

# Funnel Analysis

```sql
WITH Visitors  AS (SELECT DISTINCT SessionID FROM Events WHERE EventType = 'view_product'),
     Carts     AS (SELECT DISTINCT SessionID FROM Events WHERE EventType = 'add_to_cart'),
     Checkouts AS (SELECT DISTINCT SessionID FROM Events WHERE EventType = 'checkout'),
     Purchases AS (SELECT DISTINCT SessionID FROM Events WHERE EventType = 'purchase'),
     Funnel AS (
        SELECT 1 AS Step, 'Viewed'    AS Stage, COUNT(*) AS Sessions FROM Visitors
        UNION ALL SELECT 2, 'Carted',     COUNT(*) FROM Carts
        UNION ALL SELECT 3, 'Checked out', COUNT(*) FROM Checkouts
        UNION ALL SELECT 4, 'Purchased',  COUNT(*) FROM Purchases
     )
SELECT Stage, Sessions,
       ROUND(100.0 * Sessions / FIRST_VALUE(Sessions) OVER (ORDER BY Step), 1) AS PctOfViewers,
       ROUND(100.0 * Sessions / LAG(Sessions) OVER (ORDER BY Step), 1)         AS PctOfPrevious
FROM Funnel
ORDER BY Step;
```

(This simple funnel counts sessions at each stage independently; a strict funnel would require each stage's sessions to have completed the earlier stages, e.g. with `EXISTS` against the previous CTE.)

---

# Naming Instead of Repeating

```sql
-- ❌ The margin expression is repeated three times
SELECT ProductID,
       (ListPrice - Cost) / NULLIF(ListPrice, 0) AS Margin
FROM Products
WHERE (ListPrice - Cost) / NULLIF(ListPrice, 0) > 0.3
ORDER BY (ListPrice - Cost) / NULLIF(ListPrice, 0) DESC;

-- ✅ Compute once, name it, use it
WITH Margins AS (
    SELECT ProductID, (ListPrice - Cost) / NULLIF(ListPrice, 0) AS Margin
    FROM Products
)
SELECT ProductID, Margin
FROM Margins
WHERE Margin > 0.3
ORDER BY Margin DESC;
```

The optimizer evaluates the expression the same way; the benefit is that a change is made in one place.

---

# Visual Representation

```text
   detail rows ──GROUP BY──▶ one row per group ──window──▶ ranks, shares, LAG ──WHERE──▶ top-N
       (step 1: aggregate)          (step 2: window over groups)      (step 3: filter)

   detail rows ──window──▶ per-row LAG gaps ──GROUP BY──▶ average gap per customer
       (step 1: window)                         (step 2: aggregate)
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← read the previous step's CTE
2. JOIN
3. WHERE       ← can filter on columns computed by window functions in an earlier CTE
4. GROUP BY    ← can aggregate window results computed in an earlier CTE
5. HAVING
6. WINDOW      ← window functions over this step's rows (possibly already aggregated)
7. SELECT
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
ProductRevenue (inlined) → Hash Aggregate
Ranked (inlined)         → Sort by (CategoryID, Revenue DESC) → WindowAgg
final WHERE              → Filter RevenueRank <= 3  (engines may stop early per partition)
Each CTE step becomes an operator layer; no data is stored between steps unless materialized
```

---

# 🏗️ Architecture Insight

Analytical SQL is naturally a pipeline of grain changes: detail → aggregate → window → filter → aggregate again. Naming each grain (`ProductRevenue`, `Monthly`, `WithPrior`) makes the pipeline self-documenting and makes grain mistakes—joining at the wrong level—easy to spot.

---

# ⚡ Performance Tip

Aggregate as early as possible: a window function over 50 category rows is far cheaper than over 5 million order-item rows. Push the `GROUP BY` step before the window step whenever the question allows it.

---

# 🌍 Production Consideration

Period-over-period queries silently break when a period is missing: `LAG(Revenue, 12)` then compares with the wrong month. Drive such queries from a calendar or generated series, and test with deliberately missing months.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| CTE + window functions | ✅ | ✅ | ✅ (8.0+) | ✅ | ✅ | ✅ (3.25+) |
| `QUALIFY` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Window over aggregate in one query | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Aggregate over window in one query | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Select aliases in `WHERE` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (non-standard) |

> **Portability Tip:** Filtering or aggregating window results through a CTE works everywhere; `QUALIFY` is limited to engines such as Snowflake, BigQuery, Teradata and DuckDB.

---

# Common Mistakes

### Mistake 1

Filtering on a window function in the same query's `WHERE`.

---

### Mistake 2

Nesting a window function inside an aggregate.

---

### Mistake 3

Filtering out the prior period before computing `LAG`, so every comparison is `NULL`.

---

### Mistake 4

Running window functions over detail rows when aggregated rows would do.

---

# Best Practices

✔ Give each grain change its own CTE.

✔ Filter and aggregate window results in a later step.

✔ Keep enough history for `LAG` and filter to the reporting period last.

✔ Aggregate before windowing when possible.

✔ Name repeated expressions once.

---

# Interview Questions

## Basic

1. Why can't you filter on `ROW_NUMBER()` in `WHERE`?
2. How do you get the top 3 products per category?
3. How do you compute percent of total over grouped data?

## Intermediate

4. How do you compute the average gap between a customer's orders?
5. How do you compute month-over-month and year-over-year change?
6. Why might a year-over-year column be all `NULL`?

## Advanced

7. Describe a strict funnel and how you would write it with CTEs.
8. When would you join to a group-statistics CTE instead of using a window function?

---

# Hands-on Exercises

## Exercise 1

Find the top two customers by revenue in each country.

---

## Exercise 2

Compute monthly revenue with month-over-month and year-over-year percentages for 2026.

---

## Exercise 3

Build a strict four-step purchase funnel with conversion rates.

---

# Related Topics

- **14.03 — Multiple and Chained CTEs**
- **14.12 — Common CTE Patterns (Deduplication, Top-N and Running Balances)**
- **11.03 — Ranking Functions (ROW_NUMBER, RANK, DENSE_RANK, NTILE)**
- **11.07 — LAG and LEAD**
- **11.10 — Top-N per Group, Deduplication and QUALIFY**
- **08.09 — WHERE vs HAVING**

---

# Summary

Aggregates and window functions are computed at different points in query processing, so many analyses need several steps: aggregate then window (shares, ranks, cumulative totals over groups), window then filter (top-N per group), or window then aggregate (average gaps). CTEs name each step, making grain changes explicit and avoiding repeated expressions and nested derived tables. Keep enough history for `LAG`-based comparisons, fill missing periods, and aggregate as early as the question allows.
