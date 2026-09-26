---
title: "11.09 - Distribution Functions (PERCENT_RANK, CUME_DIST and Percentiles)"
description: "Relative position and distribution with windows: PERCENT_RANK and CUME_DIST formulas and tie behaviour, percentile bands, PERCENTILE_CONT and PERCENTILE_DISC as window functions or grouped aggregates, medians per group, outlier detection, and differences from NTILE."
chapter: 11
section: 11.09
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 30 min
lastUpdated: 2026-09-25
---

# 11.09 Distribution Functions (PERCENT_RANK, CUME_DIST and Percentiles)

---

# Learning Objectives

After completing this section, you will be able to:

- Compute a row's relative position with `PERCENT_RANK` and `CUME_DIST`.
- Explain their formulas and how ties affect them.
- Compute medians and other percentiles per group.
- Attach group percentiles to detail rows on engines that allow it.
- Detect outliers relative to a group's distribution.
- Choose between `NTILE`, `PERCENT_RANK`, `CUME_DIST` and percentile functions.

---

# PERCENT_RANK

`PERCENT_RANK` expresses a row's `RANK` as a fraction from 0 to 1:

```text
PERCENT_RANK = (RANK − 1) / (rows in partition − 1)        (0 if the partition has one row)
```

```sql
SELECT EmployeeName, Salary,
       RANK()         OVER (ORDER BY Salary) AS Rnk,
       PERCENT_RANK() OVER (ORDER BY Salary) AS PctRank
FROM Employees
WHERE Salary IS NOT NULL;
```

```text
┌──────────────┬────────┬─────┬─────────┐
│ EmployeeName │ Salary │ Rnk │ PctRank │
├──────────────┼────────┼─────┼─────────┤
│ Tom          │ 50 000 │ 1   │ 0.00    │
│ Raj          │ 60 000 │ 2   │ 0.25    │
│ Lina         │ 60 000 │ 2   │ 0.25    │
│ Mei          │ 70 000 │ 4   │ 0.75    │
│ Ava          │ 90 000 │ 5   │ 1.00    │
└──────────────┴────────┴─────┴─────────┘
```

Read as "the share of other rows ranked below this one". The lowest row is always 0 and the highest (untied) always 1.

---

# CUME_DIST

`CUME_DIST` is the cumulative distribution: the fraction of rows with a value **less than or equal to** the current row's.

```text
CUME_DIST = (rows with value ≤ current value) / (rows in partition)
```

```text
Salary    50 000   60 000   60 000   70 000   90 000
CUME_DIST  0.20     0.60     0.60     0.80     1.00
```

`CUME_DIST` is never 0 and always reaches 1. Ties share the higher value (both 60 000s count each other).

| | `PERCENT_RANK` | `CUME_DIST` |
|---|----------------|-------------|
| Range | 0 … 1 | (0 … 1] |
| Lowest row | 0 | 1 / n |
| Ties | Share the lower position | Share the higher position |
| Meaning | Share of rows strictly below | Share of rows at or below |

---

# Percentile Bands

```sql
-- Classify customers by revenue percentile
SELECT
    CustomerID,
    Revenue,
    CASE
        WHEN CUME_DIST() OVER (ORDER BY Revenue) > 0.90 THEN 'Top 10%'
        WHEN CUME_DIST() OVER (ORDER BY Revenue) > 0.50 THEN 'Upper half'
        ELSE 'Lower half'
    END AS Band
FROM (SELECT CustomerID, SUM(TotalAmount) AS Revenue
      FROM Orders GROUP BY CustomerID) AS r;
```

Unlike `NTILE(10)` (Section 11.03), which splits by row count and may split tied values, `CUME_DIST` treats tied revenues identically.

---

# PERCENTILE_CONT and PERCENTILE_DISC

The standard percentile functions are **ordered-set aggregates**:

```sql
PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY Salary)   -- interpolated median
PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY Salary)   -- an actual value from the data
```

```text
Salaries: 50, 60, 60, 70, 90 (thousands)
PERCENTILE_CONT(0.5) = 60           (middle value)
Salaries: 50, 60, 70, 90
PERCENTILE_CONT(0.5) = 65           (interpolated between 60 and 70)
PERCENTILE_DISC(0.5) = 60           (first value with CUME_DIST ≥ 0.5)
```

As grouped aggregates (Section 08.13):

```sql
-- PostgreSQL, Oracle: median salary per department
SELECT DepartmentID,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY Salary) AS MedianSalary
FROM Employees
GROUP BY DepartmentID;
```

---

# Percentiles as Window Functions

SQL Server and Oracle also allow percentile functions with `OVER (PARTITION BY …)`, attaching the group median to every row:

```sql
-- SQL Server (window form only); Oracle (both forms)
SELECT DISTINCT
    DepartmentID,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY Salary)
        OVER (PARTITION BY DepartmentID) AS MedianSalary
FROM Employees;
```

On SQL Server this is the **only** form—there is no grouped `PERCENTILE_CONT`—hence the `DISTINCT` idiom above for one row per department.

PostgreSQL has no window form; join detail rows to a grouped median:

```sql
SELECT e.*, m.MedianSalary
FROM Employees AS e
JOIN (SELECT DepartmentID,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY Salary) AS MedianSalary
      FROM Employees GROUP BY DepartmentID) AS m
  ON m.DepartmentID = e.DepartmentID;
```

MySQL and SQLite have no percentile functions; compute the median with `ROW_NUMBER` and `COUNT`:

```sql
SELECT DepartmentID, AVG(Salary) AS MedianSalary
FROM (
    SELECT DepartmentID, Salary,
           ROW_NUMBER() OVER (PARTITION BY DepartmentID ORDER BY Salary) AS rn,
           COUNT(*)     OVER (PARTITION BY DepartmentID)                 AS cnt
    FROM Employees
    WHERE Salary IS NOT NULL
) AS t
WHERE rn IN (FLOOR((cnt + 1) / 2.0), CEIL((cnt + 1) / 2.0))
GROUP BY DepartmentID;
```

---

# Outlier Detection

```sql
-- Orders more than 3 standard deviations above the customer's mean
SELECT *
FROM (
    SELECT o.*,
           AVG(TotalAmount)    OVER (PARTITION BY CustomerID) AS MeanAmt,
           STDDEV(TotalAmount) OVER (PARTITION BY CustomerID) AS SdAmt
    FROM Orders AS o
) AS t
WHERE t.SdAmt > 0
  AND t.TotalAmount > t.MeanAmt + 3 * t.SdAmt;
```

(`STDDEV` is `STDEV` on SQL Server; SQLite has no built-in standard deviation.) Percentile-based rules (`CUME_DIST() > 0.99`) are more robust for skewed data such as order values.

---

# Choosing a Distribution Tool

| Question | Tool |
|----------|------|
| Equal-count buckets (deciles for sampling) | `NTILE(10)` |
| "What share of rows are below me?" | `PERCENT_RANK` |
| "What share of rows are at or below me?" | `CUME_DIST` |
| The median / 90th percentile value | `PERCENTILE_CONT` / `PERCENTILE_DISC` |
| Outliers relative to a group | `AVG`/`STDDEV` windows or percentile thresholds |

---

# Visual Representation

```text
Sorted salaries:      50     60     60     70     90
RANK                   1      2      2      4      5
PERCENT_RANK         0.00   0.25   0.25   0.75   1.00      (rank−1)/(n−1)
CUME_DIST            0.20   0.60   0.60   0.80   1.00      (#≤ value)/n
NTILE(2)               1      1      1      2      2       row-count buckets
Median (CONT 0.5)                   60
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← exclude NULLs or irrelevant rows before measuring distribution
4. GROUP BY    ← grouped percentiles (WITHIN GROUP) computed here
5. HAVING
6. WINDOW      ← PERCENT_RANK, CUME_DIST and windowed percentiles computed here
7. SELECT
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
PERCENT_RANK / CUME_DIST OVER (PARTITION BY p ORDER BY v)
    need the partition size → buffer the partition (or count first), then emit

PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v)   (grouped)
    sort each group's values, pick / interpolate at position 0.5 × (n − 1)

Windowed PERCENTILE_CONT (SQL Server)
    sort by (p, v), buffer each partition, compute once, emit for every row
```

Percentiles require every value of the group—they cannot be computed incrementally like `SUM`. On large groups they are among the most expensive aggregates.

---

# 🔬 Engine Deep Dive

Because exact percentiles need all values, analytical engines offer approximate versions: `APPROX_PERCENTILE_CONT` (SQL Server 2022, Azure), `APPROX_PERCENTILE` (Oracle 12.2+), and extensions such as t-digest for PostgreSQL. They use bounded-memory sketches with small, known error—often the right choice for dashboards over billions of rows.

---

# 🏗️ Architecture Insight

Averages hide distribution; percentiles expose it. Service-level objectives (p95, p99 latency), income and price statistics, and fairness analyses all depend on percentiles rather than means. Designing reports around medians and percentiles—computed in SQL at the right grain—avoids conclusions distorted by a few extreme values.

---

# ⚡ Performance Tip

Compute percentiles over pre-aggregated or filtered data where possible, and consider approximate percentile functions for large dashboards. Exact medians over hundreds of millions of rows require sorting them all.

---

# 🔒 Security Note

Percentile outputs over small groups reveal individual values (the median of three salaries is one person's salary). Apply minimum group sizes to percentile reports, as with other aggregates.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `PERCENT_RANK` / `CUME_DIST` | ✅ | ✅ | ✅ | ✅ (2012+) | ✅ | ✅ |
| `PERCENTILE_CONT/DISC` grouped | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| `PERCENTILE_CONT/DISC OVER (PARTITION BY)` | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| `MEDIAN` function | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Approximate percentiles | ❌ | Extensions | ❌ | ✅ (2022+) | ✅ (12.2+) | ❌ |

> **Portability Tip:** `PERCENT_RANK` and `CUME_DIST` are portable. For medians, the `ROW_NUMBER` + `COUNT` pattern runs everywhere; use native percentile functions where available.

---

# Common Mistakes

### Mistake 1

Confusing `PERCENT_RANK` (strictly below) with `CUME_DIST` (at or below).

---

### Mistake 2

Using `NTILE` for value-based percentile bands, splitting tied values.

---

### Mistake 3

Expecting `PERCENTILE_CONT` to exist as a grouped aggregate on SQL Server, or as a window on PostgreSQL.

---

### Mistake 4

Including `NULL`s in the ordering and treating them as low or high values.

---

# Best Practices

✔ Use `CUME_DIST` for "top x%" bands and `PERCENT_RANK` for relative standing.

✔ Use `PERCENTILE_CONT` for interpolated medians, `PERCENTILE_DISC` for actual values.

✔ Filter `NULL`s before distribution calculations.

✔ Prefer percentiles over means for skewed data.

✔ Consider approximate percentiles for very large data sets.

---

# Interview Questions

## Basic

1. What does `PERCENT_RANK` return?
2. What does `CUME_DIST` return?
3. How do you compute a median in SQL?

## Intermediate

4. How do `PERCENT_RANK` and `CUME_DIST` treat ties differently?
5. What is the difference between `PERCENTILE_CONT` and `PERCENTILE_DISC`?
6. Why is `CUME_DIST` better than `NTILE` for top-10% bands?

## Advanced

7. How do you compute a median per group on MySQL?
8. Why can't percentiles be computed incrementally?
9. When would you use approximate percentile functions?

---

# Hands-on Exercises

## Exercise 1

Compute `PERCENT_RANK` and `CUME_DIST` of products by list price within each category.

---

## Exercise 2

Compute the median order amount per customer on your engine.

---

## Exercise 3

Label the top 10% of customers by revenue.

---

## Exercise 4

Find orders above each customer's 95th-percentile order amount.

---

# Related Topics

- **08.13 — Advanced Aggregate Functions (STRING_AGG, Percentiles and Statistics)**
- **11.03 — Ranking Functions (ROW_NUMBER, RANK, DENSE_RANK, NTILE)**
- **11.04 — Aggregate Window Functions**
- **11.13 — NULL Handling in Window Functions**

---

# Summary

`PERCENT_RANK` places each row between 0 and 1 by the share of rows strictly below it, and `CUME_DIST` by the share at or below it, with ties sharing a value in both. `PERCENTILE_CONT` and `PERCENTILE_DISC` return interpolated or actual percentile values—as grouped aggregates on PostgreSQL and Oracle, as window functions on SQL Server and Oracle—while MySQL and SQLite need a `ROW_NUMBER` + `COUNT` median. Distribution functions support percentile bands and outlier detection, need whole partitions in memory, and are more informative than averages for skewed data.
