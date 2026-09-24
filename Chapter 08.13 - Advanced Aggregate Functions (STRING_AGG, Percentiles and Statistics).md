---
title: "08.13 - Advanced Aggregate Functions (STRING_AGG, Percentiles and Statistics)"
description: "Aggregates beyond the core five: string aggregation with STRING_AGG, LISTAGG and GROUP_CONCAT, ordered-set aggregates for medians and percentiles, statistical aggregates, boolean and bitwise aggregates, array and JSON aggregation, and their portability."
chapter: 8
section: 8.13
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 35 min
lastUpdated: 2026-09-24
---

# 08.13 Advanced Aggregate Functions (STRING_AGG, Percentiles and Statistics)

---

# Learning Objectives

After completing this section, you will be able to:

- Concatenate a group's values into one string on each major engine.
- Control the order of values in a string aggregate.
- Compute medians and percentiles with ordered-set aggregates.
- Use variance and standard deviation aggregates correctly.
- Test "all" and "any" conditions across a group.
- Aggregate values into arrays and JSON documents.
- Recognise which of these functions are portable.

---

# Beyond the Core Five

`COUNT`, `SUM`, `AVG`, `MIN` and `MAX` answer most questions. The rest need aggregates that are newer, less portable, or both:

| Question | Aggregate family |
|----------|-----------------|
| "List each order's product names" | String aggregation |
| "What is the median order value?" | Ordered-set (percentile) |
| "How variable are delivery times?" | Statistical |
| "Did every item ship?" | Boolean |
| "Return each customer's orders as JSON" | Array / JSON |

---

# String Aggregation

Concatenates the values of a group into one string, with a separator.

```sql
-- PostgreSQL, SQL Server 2017+
SELECT
    oi.OrderID,
    STRING_AGG(p.ProductName, ', ') AS Products
FROM OrderItems AS oi
INNER JOIN Products AS p ON p.ProductID = oi.ProductID
GROUP BY oi.OrderID;
```

```text
OrderID │ Products
────────┼──────────────────────────────
101     │ Keyboard, Mouse, Monitor
102     │ Desk Lamp
```

The function name differs on every engine:

| Engine | Syntax |
|--------|--------|
| SQL standard (SQL:2016) | `LISTAGG(x, ', ') WITHIN GROUP (ORDER BY x)` |
| PostgreSQL | `STRING_AGG(x, ', ' ORDER BY x)` |
| SQL Server 2017+ | `STRING_AGG(x, ', ') WITHIN GROUP (ORDER BY x)` |
| Oracle | `LISTAGG(x, ', ') WITHIN GROUP (ORDER BY x)` |
| MySQL | `GROUP_CONCAT(x ORDER BY x SEPARATOR ', ')` |
| SQLite | `GROUP_CONCAT(x, ', ')`; `STRING_AGG(x, ', ')` and `ORDER BY` inside from 3.44 |

## Ordering the values

Without an explicit order, the sequence of values depends on the plan and may change between runs. Always specify it:

```sql
-- PostgreSQL
STRING_AGG(p.ProductName, ', ' ORDER BY p.ProductName)

-- SQL Server / Oracle
STRING_AGG(p.ProductName, ', ') WITHIN GROUP (ORDER BY p.ProductName)
LISTAGG(p.ProductName, ', ')    WITHIN GROUP (ORDER BY p.ProductName)
```

## Distinct values and length limits

- `STRING_AGG(DISTINCT x, ', ')` works in PostgreSQL; `GROUP_CONCAT(DISTINCT x)` in MySQL; `LISTAGG(DISTINCT x, ', ')` in Oracle 19c+. SQL Server has no `DISTINCT` form—de-duplicate in a derived table first.
- MySQL truncates `GROUP_CONCAT` output at `group_concat_max_len` (default 1,024 bytes) **with only a warning**.
- Oracle raises an error when `LISTAGG` exceeds the maximum `VARCHAR2` length unless `ON OVERFLOW TRUNCATE` is given.
- SQL Server returns `NVARCHAR(4000)` or `VARCHAR(8000)` for non-`MAX` inputs and errors past that; cast the input to `NVARCHAR(MAX)` for long lists.

String aggregation is for **display**. If code will split the string apart again, return an array, JSON, or plain rows instead.

---

# Medians and Percentiles

The median is the middle value of a sorted group. SQL expresses it with **ordered-set aggregates**, whose input order is given by `WITHIN GROUP`:

```sql
-- PostgreSQL, Oracle
SELECT
    CustomerID,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY TotalAmount) AS MedianOrder,
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY TotalAmount) AS P90Order
FROM Orders
GROUP BY CustomerID;
```

| Function | Returns |
|----------|---------|
| `PERCENTILE_CONT(p)` | An interpolated value—may not exist in the data |
| `PERCENTILE_DISC(p)` | The first actual value at or above the percentile |
| `MODE()` (PostgreSQL) | The most frequent value |
| `MEDIAN(x)` (Oracle) | Shorthand for `PERCENTILE_CONT(0.5)` |

```text
Values: 10, 20, 30, 40

PERCENTILE_CONT(0.5)  →  25     (interpolated between 20 and 30)
PERCENTILE_DISC(0.5)  →  20     (an actual value)
```

Engine support differs sharply:

- **SQL Server** offers `PERCENTILE_CONT` and `PERCENTILE_DISC` only as **window functions** (`... OVER (PARTITION BY ...)`), not as grouped aggregates. Combine with `DISTINCT` or a derived table to get one row per group.
- **MySQL** has no percentile functions; compute with window functions (`ROW_NUMBER` and `COUNT` over a partition).
- **SQLite** provides `median`, `percentile`, `percentile_cont` and `percentile_disc` through its percentile extension, which recent builds include.

## Why the median matters

```text
Order values: 20, 25, 30, 35, 5000

AVG     = 1022      ← dominated by one outlier
MEDIAN  = 30        ← the typical order
```

For skewed data—salaries, response times, order values—the median and high percentiles (P95, P99) describe reality far better than the mean. Latency service-level objectives are almost always stated as percentiles.

---

# Statistical Aggregates

| Function | Meaning |
|----------|---------|
| `STDDEV_SAMP(x)` / `VAR_SAMP(x)` | Sample standard deviation / variance (divides by n − 1) |
| `STDDEV_POP(x)` / `VAR_POP(x)` | Population standard deviation / variance (divides by n) |
| `CORR(y, x)` | Correlation coefficient |
| `COVAR_SAMP(y, x)`, `COVAR_POP(y, x)` | Covariance |
| `REGR_SLOPE(y, x)`, `REGR_INTERCEPT(y, x)` | Linear regression |

```sql
SELECT
    DepartmentID,
    AVG(Salary)         AS AvgSalary,
    STDDEV_SAMP(Salary) AS SalarySpread
FROM Employees
GROUP BY DepartmentID;
```

Engine names vary: SQL Server uses `STDEV` / `STDEVP` / `VAR` / `VARP`; MySQL and PostgreSQL accept `STDDEV` as an alias—meaning **population** in MySQL and **sample** in PostgreSQL. Use the explicit `_SAMP` / `_POP` names wherever they exist. `CORR` and the `REGR_` family are available in PostgreSQL and Oracle only. SQLite has no statistical aggregates built in.

A standard deviation of a single value is `NULL` for the sample version (n − 1 = 0) and `0` for the population version.

---

# Boolean and Bitwise Aggregates

"Did **every** item in the order ship?" and "Did **any** payment fail?"

```sql
-- PostgreSQL
SELECT
    OrderID,
    BOOL_AND(Shipped) AS AllShipped,
    BOOL_OR(Failed)   AS AnyFailed
FROM OrderLines
GROUP BY OrderID;
```

Portable equivalents with `MIN` and `MAX` over a 1/0 flag:

```sql
SELECT
    OrderID,
    MIN(CASE WHEN Shipped THEN 1 ELSE 0 END) AS AllShipped,   -- 1 only if every row is 1
    MAX(CASE WHEN Failed  THEN 1 ELSE 0 END) AS AnyFailed     -- 1 if any row is 1
FROM OrderLines
GROUP BY OrderID;
```

The standard names are `EVERY` and `ANY`/`SOME`; PostgreSQL implements `EVERY` as a synonym for `BOOL_AND`. Bitwise aggregates (`BIT_AND`, `BIT_OR`, `BIT_XOR`) combine permission masks or flag sets in MySQL and PostgreSQL.

---

# Array and JSON Aggregation

Aggregating into a structured value keeps each element intact—no separators to escape:

```sql
-- PostgreSQL
SELECT
    o.CustomerID,
    ARRAY_AGG(o.OrderID ORDER BY o.OrderDate) AS OrderIDs,
    JSON_AGG(
        JSON_BUILD_OBJECT('id', o.OrderID, 'total', o.TotalAmount)
        ORDER BY o.OrderDate
    ) AS OrdersJson
FROM Orders AS o
GROUP BY o.CustomerID;
```

| Engine | Array | JSON array |
|--------|-------|-----------|
| PostgreSQL | `ARRAY_AGG` | `JSON_AGG`, `JSONB_AGG` |
| MySQL | — | `JSON_ARRAYAGG` |
| SQL Server | — | `FOR JSON` clause; `JSON_ARRAYAGG` (2025) |
| Oracle | — | `JSON_ARRAYAGG` |
| SQLite | — | `json_group_array` |

These are how APIs return a parent with its children in one query—one row per customer with an embedded list of orders—avoiding both N+1 queries and the row repetition of a flat join.

---

# Visual Representation

```text
group values:  20   25   30   35   5000

STRING_AGG     "20, 25, 30, 35, 5000"
ARRAY_AGG      {20,25,30,35,5000}
AVG            1022
PERCENTILE     ▁▁▁▁│▁▁▁▁  50% → 30      90% → 3014 (interpolated)
STDDEV_SAMP    2223.8
BOOL_AND(v>10) true
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE
4. GROUP BY    ← ordered-set and string aggregates sort each group here
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY    ← orders the groups, NOT the values inside STRING_AGG
9. LIMIT / FETCH / TOP
```

The query's `ORDER BY` sorts output rows. The order of values **inside** a string, array or percentile is set only by the aggregate's own `ORDER BY` / `WITHIN GROUP`.

---

# How the DBMS Executes This

```text
Core aggregates        constant state per group     (count, sum …)
STRING_AGG / ARRAY_AGG growing buffer per group     (every value kept)
PERCENTILE_*           all values per group, sorted at finalise
STDDEV / VAR           running n, mean, M2          (Welford's method)
```

Ordered-set and list aggregates keep **every value** of each group in memory until the group finishes, then sort it. Over many large groups, that memory is the dominant cost—very different from `SUM`, which keeps one number.

---

# 🔬 Engine Deep Dive

Statistical aggregates are computed with numerically stable streaming algorithms such as Welford's method, which updates the count, mean and sum of squared deviations per row. The naive formula—sum of squares minus square of sums—suffers catastrophic cancellation on large values with small spread, returning negative variances. This is why you should use the built-in `VAR_SAMP` rather than rebuilding it from `SUM(x*x)` and `SUM(x)`.

---

# 🏗️ Architecture Insight

Exact percentiles over billions of rows are expensive because every value must be sorted. Observability and analytics systems use mergeable sketches—t-digest, HDR histograms, KLL—that estimate percentiles in fixed memory and combine across partitions. Oracle's `APPROX_PERCENTILE` and PostgreSQL extensions such as `tdigest` bring the same idea into SQL.

---

# ⚡ Performance Tip

When only a single group's median is needed and the column is indexed, an ordered read that skips to the middle row (`ORDER BY x OFFSET n/2 FETCH FIRST 1 ROW ONLY`) can be cheaper than a percentile aggregate, which reads and sorts every value.

---

# 🌍 Production Consideration

Silent truncation of MySQL's `GROUP_CONCAT` at 1,024 bytes is a classic production defect: lists look fine in testing and are cut off mid-value for large customers. Raise `group_concat_max_len` for the session, or avoid building long strings in SQL at all.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| String aggregation | `LISTAGG` | `STRING_AGG` | `GROUP_CONCAT` | `STRING_AGG` (2017+) | `LISTAGG` | `GROUP_CONCAT`, `STRING_AGG` (3.44+) |
| `PERCENTILE_CONT` as aggregate | ✅ | ✅ | ❌ | ❌ (window only) | ✅ | Extension |
| `STDDEV_SAMP` / `VAR_SAMP` | ✅ | ✅ | ✅ | `STDEV` / `VAR` | ✅ | ❌ |
| `EVERY` / `BOOL_AND` | `EVERY` | ✅ | ❌ | ❌ | ❌ | ❌ |
| JSON array aggregation | `JSON_ARRAYAGG` | `JSON_AGG` | ✅ | `FOR JSON` | ✅ | `json_group_array` |

> **Portability Tip:** Only the core five aggregates and `STDDEV_SAMP`-style names are close to portable. Isolate string, percentile and JSON aggregation behind a view or a dialect-specific query layer rather than scattering engine-specific syntax through an application.

---

# Common Mistakes

### Mistake 1

String-aggregating without an `ORDER BY`, producing lists in varying order.

---

### Mistake 2

Relying on MySQL `GROUP_CONCAT` for long lists without raising `group_concat_max_len`.

---

### Mistake 3

Reporting the mean of heavily skewed data instead of the median or percentiles.

---

### Mistake 4

Using `STDDEV` and assuming sample or population semantics without checking the engine.

---

### Mistake 5

Parsing a concatenated string in application code instead of aggregating to an array or JSON.

---

# Best Practices

✔ Always specify the order inside string and array aggregates.

✔ Use `PERCENTILE_CONT` / `PERCENTILE_DISC` for medians and SLO percentiles.

✔ Use explicit `_SAMP` / `_POP` statistical functions.

✔ Aggregate to JSON or arrays for machine consumers, strings for humans.

✔ Keep engine-specific aggregates behind views.

---

# Interview Questions

## Basic

1. How do you list all product names of an order in one column?
2. What is the median, and why can it be more useful than the average?
3. What is the difference between `STDDEV_SAMP` and `STDDEV_POP`?

## Intermediate

4. How do you control the order of values in `STRING_AGG`?
5. What is the difference between `PERCENTILE_CONT` and `PERCENTILE_DISC`?
6. How do you test whether every row in a group satisfies a condition, portably?

## Advanced

7. Why do percentile aggregates need more memory than `SUM`?
8. How do you compute a per-group median on SQL Server?
9. Why should variance not be computed from `SUM(x*x)` and `SUM(x)`?

---

# Hands-on Exercises

## Exercise 1

For each order, list its product names alphabetically in one column, using your engine's syntax.

---

## Exercise 2

Return the median and 90th-percentile order value per customer.

---

## Exercise 3

Return the average and sample standard deviation of salary per department.

---

## Exercise 4

For each customer, return a JSON array of their orders ordered by date.

---

# Related Topics

- **08.02 — Aggregate Functions (COUNT, SUM, AVG, MIN, MAX)**
- **08.10 — Conditional Aggregation (FILTER and CASE)**
- **08.14 — Execution Flow of GROUP BY (Hash and Stream Aggregation)**
- **11.xx — Window Functions**
- **12.xx — String Functions**

---

# Summary

Beyond the core five, SQL offers string aggregation (`STRING_AGG`, `LISTAGG`, `GROUP_CONCAT`), ordered-set aggregates for medians and percentiles, statistical aggregates, boolean aggregates and array/JSON aggregation—each with markedly different names and support across engines. List and percentile aggregates must keep every value of a group and need an explicit internal order, which the query's `ORDER BY` does not provide. Use medians and percentiles for skewed data, explicit sample or population statistics, structured aggregation for machine consumers, and isolate the non-portable syntax behind views.
