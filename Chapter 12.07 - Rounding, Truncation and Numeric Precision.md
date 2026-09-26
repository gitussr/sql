---
title: "12.07 - Rounding, Truncation and Numeric Precision"
description: "ROUND with positive and negative places, half-away-from-zero versus half-to-even, TRUNC, TRUNCATE and SQL Server's ROUND(x, d, 1), how CAST to integer rounds or truncates by engine, exact DECIMAL versus approximate FLOAT, precision and scale of results, rounding money and allocating remainders, and vendor differences."
chapter: 12
section: 12.07
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 30 min
lastUpdated: 2026-09-26
---

# 12.07 Rounding, Truncation and Numeric Precision

---

# Learning Objectives

After completing this section, you will be able to:

- Round to decimal places, tens and hundreds with `ROUND`.
- Explain half-away-from-zero and half-to-even rounding and which types use which.
- Truncate values with `TRUNC`, `TRUNCATE` or `ROUND(x, d, 1)`.
- Predict whether converting to an integer rounds or truncates on each engine.
- Choose between exact `DECIMAL` and approximate `FLOAT`.
- Round money correctly, including allocating remainders so totals still match.

---

# ROUND

```sql
ROUND(x)          -- to an integer
ROUND(x, d)       -- to d decimal places; negative d rounds left of the decimal point
```

```sql
SELECT
    ROUND(1234.5678, 2)    AS TwoPlaces,     -- 1234.57
    ROUND(1234.5678, 0)    AS Integer,       -- 1235
    ROUND(1234.5678, -2)   AS Hundreds,      -- 1200
    ROUND(-2.5, 0)         AS NegHalf;       -- -3 (DECIMAL: half away from zero)
```

Negative places work on PostgreSQL (`numeric`), MySQL, SQL Server and Oracle; SQLite treats them as 0.

`ROUND` keeps the input's type and scale on some engines: SQL Server returns `1234.5700` for `ROUND(CAST(1234.5678 AS DECIMAL(10,4)), 2)`—rounded, but still displayed with four decimals. Cast to `DECIMAL(10,2)` when the scale of the result matters.

---

# Half Away From Zero vs Half to Even

When a value is exactly halfway, there are two common rules:

| Value | Half away from zero | Half to even ("banker's") |
|-------|---------------------|---------------------------|
| 0.5 | 1 | 0 |
| 1.5 | 2 | 2 |
| 2.5 | 3 | 2 |
| -2.5 | -3 | -2 |

- **Exact types** (`DECIMAL`, `NUMERIC`, Oracle `NUMBER`) round **half away from zero** on PostgreSQL, MySQL, SQL Server and Oracle.
- **Approximate types** (`FLOAT`, `REAL`, `DOUBLE PRECISION`, Oracle `BINARY_DOUBLE`) usually round **half to even** on PostgreSQL, MySQL and Oracle—and may not be "exactly halfway" at all (next heading).

Half-to-even avoids an upward bias when many rounded values are summed; accounting and statistics sometimes require it. No major engine offers it for `DECIMAL` as a built-in option—apply it in the application or with an explicit expression when a regulation demands it.

---

# Why FLOAT Rounds "Wrongly"

`FLOAT` stores binary fractions. Most decimal fractions—0.1, 2.675—have no exact binary representation:

```sql
-- SQL Server / MySQL with FLOAT
SELECT ROUND(CAST(2.675 AS FLOAT), 2);        -- 2.67, not 2.68: stored as 2.67499999999999982236431605997495353221893310546875

-- PostgreSQL
SELECT 0.1::float8 + 0.2::float8 = 0.3::float8;   -- false
SELECT 0.1 + 0.2 = 0.3;                           -- true: untyped literals are numeric (exact)
```

For money, quantities and anything compared for equality, use `DECIMAL(p, s)`. Use `FLOAT` for measurements where tiny relative errors are acceptable—sensor readings, scientific data, machine-learning features.

---

# Truncation

Truncation drops digits without rounding (towards zero):

```sql
SELECT TRUNC(1234.5678, 2);          -- 1234.56   PostgreSQL, Oracle
SELECT TRUNCATE(1234.5678, 2);       -- 1234.56   MySQL
SELECT ROUND(1234.5678, 2, 1);       -- 1234.5600 SQL Server: third argument ≠ 0 means truncate
SELECT trunc(1234.5678);             -- 1234      SQLite 3.35+ (integer only)
```

| Value | `ROUND(x, 0)` | `TRUNC(x)` | `FLOOR(x)` | `CEILING(x)` |
|-------|---------------|------------|------------|--------------|
| 2.7 | 3 | 2 | 2 | 3 |
| -2.7 | -3 | -2 | -3 | -2 |

`TRUNC` goes towards zero; `FLOOR` goes towards minus infinity. They differ only for negative numbers—which is exactly where refunds and adjustments live.

(Oracle and PostgreSQL also use `TRUNC` / `DATE_TRUNC` for dates—Chapter 13.)

---

# CAST to Integer: Round or Truncate?

```sql
SELECT CAST(2.9 AS INT), CAST(-2.9 AS INT);
```

| Engine | `CAST(2.9 AS INT)` | `CAST(-2.9 AS INT)` |
|--------|--------------------|---------------------|
| PostgreSQL | 3 (rounds) | -3 |
| MySQL (`AS SIGNED`) | 3 (rounds) | -3 |
| SQL Server | **2 (truncates)** | **-2** |
| Oracle (`AS INTEGER`) | 3 (rounds) | -3 |
| SQLite | **2 (truncates)** | **-2** |

Never rely on `CAST` to round. Write `CAST(ROUND(x, 0) AS INT)` or `CAST(FLOOR(x) AS INT)` to say what you mean.

---

# Precision and Scale of Results

`DECIMAL(p, s)` holds `p` digits in total, `s` of them after the decimal point. Arithmetic results get a new precision and scale:

```text
DECIMAL(10,2) + DECIMAL(10,2)  → DECIMAL(11,2)
DECIMAL(10,2) * DECIMAL(10,4)  → DECIMAL(21,6)        (p1 + p2 + 1, s1 + s2)
DECIMAL(38,10) * DECIMAL(38,10) → exceeds 38 digits: the engine must cut something
```

SQL Server caps precision at 38 and reduces the **scale** (down to a minimum of 6) to make room for the integer part. Multiplying or dividing two high-precision decimals can therefore silently lose decimals. Declare only the precision you need—`DECIMAL(19,4)` rather than `DECIMAL(38,18)`—and round intermediate results deliberately.

SQL Server's `MONEY` type has four fixed decimals; dividing `MONEY` by `MONEY` returns `MONEY` and can lose precision in ratios. Many teams use `DECIMAL(19,4)` instead.

---

# Rounding Money

Rules that avoid most money bugs:

1. **Store** exact values (`DECIMAL`) at the precision the business defines (often 2 or 4 places).
2. **Round once**, at a defined step (per line, or per invoice), and document which.
3. **Never** round, sum, then round again and expect it to match a total rounded once.

```text
Three lines of 10.005 each:
  round each, then sum:  10.01 + 10.01 + 10.01 = 30.03
  sum, then round:       30.015 → 30.02
```

### Allocating a total without losing cents

Splitting 100.00 across three accounts gives 33.33 × 3 = 99.99. Give the remaining cent to one row:

```sql
SELECT
    AccountID,
    ROUND(100.00 / COUNT(*) OVER (), 2)
    + CASE WHEN ROW_NUMBER() OVER (ORDER BY AccountID) = 1
           THEN 100.00 - ROUND(100.00 / COUNT(*) OVER (), 2) * COUNT(*) OVER ()
           ELSE 0 END AS Share
FROM Accounts;
-- 33.34, 33.33, 33.33 → total 100.00
```

(Window functions: Chapter 11.)

---

# Visual Representation

```text
                 -2.7        -2.5           2.5        2.7
ROUND (decimal)   -3          -3             3          3     half away from zero
ROUND (float)     -3          -2             2          3     half to even (typical)
TRUNC             -2          -2             2          2     towards zero
FLOOR             -3          -3             2          2     towards -∞
CEILING           -2          -2             3          3     towards +∞
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← WHERE ROUND(Price, 0) = 10 scans; use a range: Price >= 9.5 AND Price < 10.5
4. GROUP BY    ← grouping by a rounded value merges nearby values into one group
5. HAVING
6. WINDOW
7. SELECT      ← round for display here
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

Round as late as possible: aggregate exact values, then round the result.

---

# How the DBMS Executes This

```text
DECIMAL values: stored as base-10 (or base-10,000) digit groups
  ROUND / TRUNC → digit manipulation, exact
FLOAT values:   stored as IEEE-754 binary (sign, exponent, mantissa)
  ROUND        → scale, rint(), unscale — inherits binary representation error
Type of ROUND(x, d): same type as x (scale may be kept, as in SQL Server)
```

---

# 🏗️ Architecture Insight

Rounding rules are business rules. Where tax, currency conversion or invoice totals are involved, define the rule (which step, which mode, how remainders are allocated) once—in a shared function, view or service—and use it everywhere. Divergent rounding between the database report and the application invoice is one of the most common reconciliation failures.

---

# ⚡ Performance Tip

`DECIMAL` arithmetic is slower than integer or float arithmetic, but rarely the bottleneck in a query. The costly mistake is a rounding function on a column in `WHERE` or `JOIN`—rewrite it as a range on the bare column.

---

# 🔒 Security Note

Rounding can be abused: "salami slicing" fraud moves fractions of a cent from many transactions into one account. Reconcile rounded totals against exact totals, keep the exact values, and audit where remainders go.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `ROUND(x, d)` | ❌ (common) | ✅ (`numeric`; `ROUND(float)` has no `d`) | ✅ | ✅ | ✅ | ✅ |
| Negative `d` | — | ✅ | ✅ | ✅ | ✅ | ❌ |
| Truncate | ❌ | `TRUNC(x, d)` | `TRUNCATE(x, d)` | `ROUND(x, d, 1)` | `TRUNC(x, d)` | `trunc(x)` (3.35+) |
| `CAST(2.9 AS INT)` | Implementation-defined | 3 | 3 | 2 | 3 | 2 |
| Max `DECIMAL` precision | Implementation-defined | 1000 (declared) | 65 | 38 | 38 | Stored as REAL/INTEGER/TEXT |

> **Portability Tip:** `ROUND(decimal_value, d)` with `d ≥ 0` behaves identically on the major engines. Truncation, negative places, float rounding and `CAST` to integer do not—write them explicitly.

---

# Common Mistakes

### Mistake 1

Storing money in `FLOAT` and getting 2.67 for 2.675.

---

### Mistake 2

Relying on `CAST(x AS INT)` to round (it truncates on SQL Server and SQLite).

---

### Mistake 3

Rounding every line and every subtotal, then wondering why the total is off by a cent.

---

### Mistake 4

Using `TRUNC` where `FLOOR` was meant for negative numbers.

---

### Mistake 5

Declaring `DECIMAL(38, 18)` everywhere and losing scale in multiplication on SQL Server.

---

# Best Practices

✔ Use `DECIMAL` for money and exact quantities.

✔ Round once, at a documented step, and allocate remainders explicitly.

✔ Write `ROUND`, `TRUNC`, `FLOOR` or `CEILING` explicitly instead of relying on `CAST`.

✔ Declare the precision you need, not the maximum.

✔ Filter with ranges, not rounded columns.

---

# Interview Questions

## Basic

1. What does `ROUND(1234.567, -2)` return?
2. What is the difference between `ROUND` and `TRUNC`?
3. Why should money not be stored as `FLOAT`?

## Intermediate

4. What does `CAST(2.9 AS INT)` return on SQL Server and on PostgreSQL?
5. How do `TRUNC` and `FLOOR` differ for negative numbers?
6. What is banker's rounding?

## Advanced

7. Why can `DECIMAL` multiplication lose scale on SQL Server?
8. How do you split a total across rows so the parts add up exactly?
9. Why is `ROUND(CAST(2.675 AS FLOAT), 2)` equal to 2.67?

---

# Hands-on Exercises

## Exercise 1

Show each product's price rounded to the nearest 10 and truncated to whole units.

---

## Exercise 2

Compare `SUM(ROUND(x, 2))` with `ROUND(SUM(x), 2)` on order items and explain any difference.

---

## Exercise 3

Split 1,000.00 of a discount across the items of an order proportionally, so the parts add up exactly.

---

## Exercise 4

Rewrite `WHERE ROUND(ListPrice, 0) = 100` as a sargable predicate.

---

# Related Topics

- **12.06 — Numeric and Mathematical Functions**
- **12.08 — Type Conversion (CAST, CONVERT and TRY_CAST)**
- **08.02 — Aggregate Functions (COUNT, SUM, AVG, MIN, MAX)**
- **11.06 — Running Totals, Moving Averages and Shares**

---

# Summary

`ROUND` rounds to a number of places (negative places round to tens and hundreds); exact types round half away from zero, while floating-point types usually round half to even and carry binary representation errors. Truncation is `TRUNC`, `TRUNCATE` or `ROUND(x, d, 1)` depending on the engine, and `CAST` to an integer rounds on some engines and truncates on others. `DECIMAL` results have their own precision and scale rules, which can silently drop decimals at high precision. For money: store exact values, round once at a defined step, and allocate remainders so totals reconcile.
