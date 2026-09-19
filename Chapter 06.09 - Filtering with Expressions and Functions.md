---
title: "06.09 - Filtering with Expressions and Functions"
description: "Filter rows using arithmetic expressions, string functions, date and time logic, CASE, and CAST in SQL WHERE clauses, and learn how to keep such filters correct, portable, and index-friendly."
chapter: 6
section: 6.09
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 55 min
lastUpdated: 2026-09-19
---

# 06.09 Filtering with Expressions and Functions

---

# Learning Objectives

After completing this section, you will be able to:

- Filter using arithmetic expressions.
- Filter using string functions.
- Filter by dates, months, years, and relative periods.
- Use `CASE` inside a predicate.
- Use `CAST` safely in filters.
- Rewrite function-based filters so indexes can be used.
- Choose portable date and string techniques.

---

# Expressions in WHERE

A predicate can compare any expressions, not only raw columns:

```sql
WHERE Price * Quantity > 1000
```

```sql
WHERE UPPER(Country) = 'INDIA'
```

```sql
WHERE EXTRACT(YEAR FROM OrderDate) = 2026
```

All three are valid. The question this section answers is **how** to write them so they stay correct and fast.

---

# Arithmetic Expressions

```sql
SELECT
    OrderID,
    UnitPrice,
    Quantity
FROM OrderLines
WHERE UnitPrice * Quantity >= 1000;
```

```sql
SELECT
    ProductName
FROM Products
WHERE (ListPrice - CostPrice) / ListPrice < 0.10;
```

The second query finds products with a margin below 10%.

Watch for:

- **Division by zero**: use `NULLIF(ListPrice, 0)` in the denominator.
- **Integer division**: in PostgreSQL, SQL Server, and SQLite, `5 / 2` is `2`. Cast to a decimal type when fractions matter.
- **NULL propagation**: any `NULL` operand makes the whole expression `NULL`, so the predicate becomes UNKNOWN.

---

# Moving Arithmetic Off the Column

These two predicates are mathematically equivalent:

```sql
WHERE Salary * 12 > 600000
```

```sql
WHERE Salary > 600000 / 12
```

The second keeps `Salary` bare, so an index on `Salary` can be used. Moving arithmetic to the constant side is one of the simplest and most effective filter optimizations.

---

# String Functions in Filters

```sql
WHERE LENGTH(ProductCode) = 8
```

```sql
WHERE TRIM(Email) <> Email
```

```sql
WHERE SUBSTRING(PostalCode, 1, 3) = '700'
```

Useful for data-quality checks and one-off analysis.

For frequent filters, prefer forms that leave the column untouched:

```sql
-- Instead of SUBSTRING(PostalCode, 1, 3) = '700'
WHERE PostalCode LIKE '700%'
```

---

# Case-Insensitive Filters

```sql
WHERE LOWER(Email) = LOWER(?)
```

This is portable, but `LOWER(Email)` on the column prevents a normal index seek. Better options:

- Use a case-insensitive collation on the column.
- Create an expression (function-based) index on `LOWER(Email)`.
- Store a normalized copy of the value (for example, a lower-cased email column).

---

# Filtering by Date

Date filtering is the most common kind of expression filter—and the most commonly written badly.

## By Exact Date (DATE column)

```sql
WHERE OrderDate = DATE '2026-03-15'
```

## By Year

Readable but not index-friendly:

```sql
WHERE EXTRACT(YEAR FROM OrderDate) = 2026
```

Index-friendly equivalent:

```sql
WHERE OrderDate >= DATE '2026-01-01'
  AND OrderDate <  DATE '2027-01-01'
```

## By Month

```sql
WHERE OrderDate >= DATE '2026-03-01'
  AND OrderDate <  DATE '2026-04-01'
```

## By Day on a Date-Time Column

```sql
WHERE CreatedAt >= TIMESTAMP '2026-03-15 00:00:00'
  AND CreatedAt <  TIMESTAMP '2026-03-16 00:00:00'
```

The half-open range pattern from Section 06.05 works for every period and every precision.

---

# Relative Dates

"The last 30 days" depends on the current date. Syntax varies:

```sql
-- PostgreSQL
WHERE CreatedAt >= CURRENT_TIMESTAMP - INTERVAL '30 days'
```

```sql
-- MySQL
WHERE CreatedAt >= NOW() - INTERVAL 30 DAY
```

```sql
-- SQL Server
WHERE CreatedAt >= DATEADD(DAY, -30, SYSDATETIME())
```

```sql
-- Oracle
WHERE CreatedAt >= SYSTIMESTAMP - INTERVAL '30' DAY
```

```sql
-- SQLite
WHERE CreatedAt >= datetime('now', '-30 days')
```

In every case, the calculation happens on the **constant side**, so the column stays bare and indexable.

---

# Time Zones

A filter such as "orders placed today" depends on whose "today":

```text
2026-03-15 23:30 in New York
= 2026-03-16 03:30 UTC
= 2026-03-16 09:00 in Kolkata
```

Common practice:

- Store timestamps in UTC (or with a time zone).
- Convert the user's local period boundaries to UTC **in the application or on the constant side**.
- Filter the stored column with a half-open UTC range.

---

# CASE in a Predicate

`CASE` lets a predicate depend on other values in the row:

```sql
SELECT
    OrderID,
    CustomerType,
    TotalAmount
FROM Orders
WHERE TotalAmount >
    CASE CustomerType
        WHEN 'Wholesale' THEN 10000
        WHEN 'Retail'    THEN 500
        ELSE 1000
    END;
```

`CASE` is also the reliable way to guard an expression that might fail, because its branches are evaluated in order in most databases:

```sql
WHERE CASE WHEN Quantity = 0 THEN 0 ELSE Total / Quantity END > 10
```

Often the same logic reads more clearly with `AND` / `OR`:

```sql
WHERE (CustomerType = 'Wholesale' AND TotalAmount > 10000)
   OR (CustomerType = 'Retail'    AND TotalAmount > 500)
   OR (CustomerType NOT IN ('Wholesale', 'Retail') AND TotalAmount > 1000)
```

(Remember that the last line excludes rows where `CustomerType` is `NULL`, unlike the `CASE` version's `ELSE` branch.)

---

# CAST in Filters

Converting the **constant** is safe and usually free:

```sql
WHERE OrderDate >= CAST('2026-01-01' AS DATE)
```

Converting the **column** is expensive and risky:

```sql
WHERE CAST(OrderNumber AS INTEGER) > 5000
```

- It runs on every row.
- It prevents index seeks.
- It fails with an error if any row contains a non-numeric value (in databases without "try" conversions).

If a column is always compared as a number, it should be stored as a number.

---

# Implicit Conversion

Conversions are not always visible:

```sql
-- CustomerCode is VARCHAR
WHERE CustomerCode = 12345
```

Many databases convert `CustomerCode` to a number for every row. In SQL Server, a similar problem occurs when an `NVARCHAR` parameter is compared with a `VARCHAR` column: the column side may be converted, and an index seek becomes a scan.

Keep parameter types identical to column types.

---

# Visual Representation

```text
Function on the COLUMN side                 Function on the CONSTANT side

WHERE EXTRACT(YEAR FROM OrderDate) = 2026   WHERE OrderDate >= DATE '2026-01-01'
                                              AND OrderDate <  DATE '2027-01-01'

Every row:                                   Once:
  compute EXTRACT(...)                         compute the two boundaries
  compare with 2026
                                             Then:
→ full scan                                    index range scan
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE   ← Expressions and functions evaluated here, row by row
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

An expression in `WHERE` cannot reuse a calculated column from `SELECT`; the expression must be repeated or moved into a derived table or CTE.

---

# How the DBMS Executes This

```text
WHERE OrderDate >= CURRENT_DATE - INTERVAL '30 days'

↓

Constant folding:
CURRENT_DATE - INTERVAL '30 days' → 2026-08-20 (computed once)

↓

Predicate becomes: OrderDate >= DATE '2026-08-20'

↓

Index range scan on OrderDate
```

```text
WHERE EXTRACT(YEAR FROM OrderDate) = 2026

↓

Expression depends on each row's OrderDate

↓

Cannot navigate an ordinary index on OrderDate

↓

Evaluate the expression for every row (scan)
```

---

# 🔬 Engine Deep Dive

Optimizers perform **constant folding**: any part of an expression that does not depend on the row is computed once, before execution.

```text
WHERE Salary > 600000 / 12

               600000 / 12
                   │
            folded to 50000
                   │
WHERE Salary > 50000   ← index-friendly
```

Some optimizers can also rewrite simple column-side expressions (for example, turning a date truncation into a range), but this varies by database and version. Writing the index-friendly form yourself makes performance predictable.

---

# 🏗️ Architecture Insight

When many queries filter on the same computed value—`LOWER(Email)`, `YEAR(OrderDate)`, `Price * Quantity`—the value belongs in the design: a generated/computed column, an expression index, or a stored normalized value. Pushing repeated computation into the schema turns an expensive filter into a simple indexed comparison.

---

# ⚡ Performance Tip

Keep functions, arithmetic, and conversions on the constant side of comparisons. When a function on the column is truly required, create an index on exactly that expression and verify in the execution plan that it is used.

---

# 🔒 Security Note

Functions that build SQL dynamically inside the database (for example, `EXECUTE` in stored procedures) reintroduce injection risks even when the application uses parameters. Parameterize dynamic SQL inside the database as carefully as in the application.

---

# 🌍 Production Consideration

Date filters that work in testing often fail in production because of time zones, daylight-saving transitions, and fractional seconds. Standardize on UTC storage and half-open ranges, and test reports around month ends and time-zone boundaries.

---

# 🚀 Enterprise Practice

Enterprise codebases provide shared helpers or views for common periods—"current fiscal month", "trailing 30 days"—so that every report calculates boundaries identically and filters the raw column with an index-friendly range.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Current timestamp | `CURRENT_TIMESTAMP` | ✅ | ✅ | ✅ | ✅ | ✅ |
| Extract part | `EXTRACT(YEAR FROM d)` | ✅ | ✅ | `YEAR(d)`, `DATEPART` | ✅ | `strftime('%Y', d)` |
| Interval arithmetic | `d - INTERVAL '30' DAY` | ✅ | `INTERVAL 30 DAY` | `DATEADD` | ✅ | `datetime(d, '-30 days')` |
| Expression / function index | — | ✅ | ✅ (8.0.13+) | Via computed columns | ✅ | ✅ |
| Safe conversion | — | ❌ | ❌ | `TRY_CAST` | `CAST ... DEFAULT ... ON CONVERSION ERROR` | Lenient by design |

> **Portability Tip:** Date arithmetic is one of the least portable areas of SQL. Keep period calculations on the constant side (or in the application), and filter columns with standard comparison operators so the predicate itself stays portable.

---

# Common Mistakes

### Mistake 1

Filtering by `YEAR(OrderDate) = 2026` instead of a date range.

---

### Mistake 2

Casting the column instead of the constant.

---

### Mistake 3

Comparing a text column with a number and triggering implicit conversion.

---

### Mistake 4

Ignoring integer division in ratio filters.

---

### Mistake 5

Ignoring time zones when filtering "today" or "this month".

---

# Best Practices

✔ Keep the filtered column bare; transform the constant.

✔ Use half-open ranges for dates and times.

✔ Store values in the type they are compared as.

✔ Use `NULLIF` to avoid division by zero.

✔ Use expression indexes or computed columns for unavoidable column-side functions.

✔ Store timestamps in UTC and convert boundaries, not columns.

---

# Interview Questions

## Basic

1. Can a `WHERE` clause contain arithmetic expressions?
2. How do you filter rows from a specific year without using `YEAR()`?
3. Why is `5 / 2` equal to `2` in some databases?

## Intermediate

4. Why is `WHERE Salary * 12 > 600000` slower than `WHERE Salary > 50000` on an indexed column?
5. What is implicit conversion, and why is it dangerous?
6. How do you filter "the last 30 days" in your preferred database?

## Advanced

7. What is constant folding?
8. When would you create an expression index or computed column?
9. How do time zones affect date-range filters?

---

# Hands-on Exercises

## Exercise 1

Return order lines whose total (`UnitPrice * Quantity`) exceeds 2,000.

---

## Exercise 2

Rewrite for index use:

```sql
WHERE EXTRACT(MONTH FROM HireDate) = 6
  AND EXTRACT(YEAR FROM HireDate) = 2025
```

---

## Exercise 3

Return customers whose email contains leading or trailing spaces.

---

## Exercise 4

Return products whose profit margin (`(ListPrice - CostPrice) / ListPrice`) is below 15%, safely handling a `ListPrice` of zero.

---

# Related Topics

- **05.06 — Expressions & Calculated Columns**
- **06.05 — BETWEEN**
- **06.07 — LIKE and Pattern Matching**
- **06.12 — SARGability and Index-Friendly Predicates**
- **12.xx — String Functions**
- **13.xx — Date and Time Functions**

---

# Summary

`WHERE` clauses can filter on any expression—arithmetic, string functions, date logic, `CASE`, and conversions. The key to writing them well is placement: calculations on the constant side are computed once and keep the column indexable, while functions and conversions on the column run for every row and usually force a scan. Half-open date ranges, matching data types, UTC storage, and expression indexes for unavoidable computations produce filters that are correct across time zones, portable across databases, and fast at scale.
