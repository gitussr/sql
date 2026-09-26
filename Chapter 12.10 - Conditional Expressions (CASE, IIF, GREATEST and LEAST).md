---
title: "12.10 - Conditional Expressions (CASE, IIF, GREATEST and LEAST)"
description: "Conditional logic inside expressions: simple and searched CASE, ELSE and result types, CASE with NULL, evaluation order and short-circuit limits, CASE in SELECT, WHERE, ORDER BY, GROUP BY and UPDATE, IIF, IF and DECODE, CHOOSE, GREATEST and LEAST with their NULL differences, and index-friendly alternatives."
chapter: 12
section: 12.10
category: Data Query Language (DQL)
difficulty: Beginner → Intermediate
readingTime: 30 min
lastUpdated: 2026-09-26
---

# 12.10 Conditional Expressions (CASE, IIF, GREATEST and LEAST)

---

# Learning Objectives

After completing this section, you will be able to:

- Write simple and searched `CASE` expressions.
- Predict the result type and the `ELSE` behaviour of `CASE`.
- Explain why `CASE col WHEN NULL` never matches.
- Know when `CASE` short-circuits and when it does not.
- Use `CASE` for classification, custom sorting, bucketing and conditional updates.
- Use `IIF`, `IF`, `DECODE`, `CHOOSE`, `GREATEST` and `LEAST`, and their `NULL` differences.

---

# Searched CASE

```sql
CASE
    WHEN condition1 THEN result1
    WHEN condition2 THEN result2
    …
    [ELSE default_result]
END
```

```sql
SELECT
    OrderID,
    TotalAmount,
    CASE
        WHEN TotalAmount >= 1000 THEN 'Large'
        WHEN TotalAmount >=  100 THEN 'Medium'
        ELSE 'Small'
    END AS OrderSize
FROM Orders;
```

- Conditions are tested **in order**; the first true one wins. Order `WHEN`s from most to least specific.
- Without `ELSE`, unmatched rows get `NULL`.
- `CASE` is an **expression**, not a statement: it returns a value and can go anywhere a value can.

---

# Simple CASE

```sql
CASE expression
    WHEN value1 THEN result1
    WHEN value2 THEN result2
    [ELSE default_result]
END
```

```sql
SELECT OrderID,
       CASE Status
           WHEN 'P' THEN 'Pending'
           WHEN 'S' THEN 'Shipped'
           WHEN 'C' THEN 'Cancelled'
           ELSE 'Unknown (' || Status || ')'
       END AS StatusName
FROM Orders;
```

Simple `CASE` compares with `=`. Because `NULL = NULL` is unknown, **`WHEN NULL` never matches**:

```sql
CASE Phone WHEN NULL THEN 'missing' ELSE 'present' END     -- always 'present', even when Phone is NULL
CASE WHEN Phone IS NULL THEN 'missing' ELSE 'present' END  -- correct
```

---

# Result Types

All `THEN` and `ELSE` results must be convertible to one type; the engine picks it from all branches.

```sql
CASE WHEN Qty > 0 THEN Qty ELSE 'none' END      -- error on PostgreSQL/SQL Server: 'none' is not an integer
CASE WHEN Qty > 0 THEN CAST(Qty AS VARCHAR(10)) ELSE 'none' END   -- OK
```

MySQL and SQLite are lenient and return mixed types as text, which then sorts as text.

---

# Evaluation Order and Short-Circuiting

`CASE` evaluates `WHEN` conditions in order and normally does not evaluate the branches it does not choose, so it is the standard way to guard risky expressions:

```sql
CASE WHEN OrderCount = 0 THEN NULL ELSE Revenue / OrderCount END
```

But short-circuiting is not absolute:

- **Constant folding**: PostgreSQL may evaluate a constant sub-expression such as `1/0` while planning, even in a branch no row reaches.
- **Aggregates**: SQL Server computes aggregates in all branches before the `CASE` runs, so `CASE WHEN COUNT(*) = 0 THEN 0 ELSE MIN(1/Qty) END` can still divide by zero.
- **Predicates outside the `CASE`** have no guaranteed order (Section 12.08).

For division, `NULLIF` is simpler and always safe: `Revenue / NULLIF(OrderCount, 0)`.

---

# Where CASE Is Used

```sql
-- Classification in SELECT: shown above

-- Custom sort order in ORDER BY
SELECT OrderID, Status
FROM Orders
ORDER BY CASE Status WHEN 'Pending' THEN 1 WHEN 'Shipped' THEN 2 ELSE 3 END, OrderDate;

-- Bucketing in GROUP BY
SELECT CASE WHEN TotalAmount >= 1000 THEN 'Large'
            WHEN TotalAmount >= 100  THEN 'Medium'
            ELSE 'Small' END AS OrderSize,
       COUNT(*) AS Orders
FROM Orders
GROUP BY CASE WHEN TotalAmount >= 1000 THEN 'Large'
              WHEN TotalAmount >= 100  THEN 'Medium'
              ELSE 'Small' END;

-- Conditional aggregation (Section 08.10)
SELECT CustomerID,
       SUM(CASE WHEN Status = 'Shipped'   THEN TotalAmount ELSE 0 END) AS ShippedValue,
       COUNT(CASE WHEN Status = 'Cancelled' THEN 1 END)                 AS Cancelled
FROM Orders
GROUP BY CustomerID;

-- Different changes to different rows in one UPDATE
UPDATE Products
SET ListPrice = CASE CategoryID
                    WHEN 1 THEN ListPrice * 1.05
                    WHEN 2 THEN ListPrice * 1.10
                    ELSE ListPrice
                END;
```

---

# CASE in WHERE

`CASE` in `WHERE` works but usually hides a simpler Boolean expression and blocks index use:

```sql
-- Hard to read, not sargable
WHERE CASE WHEN @IncludeCancelled = 1 THEN 1
           WHEN Status <> 'Cancelled' THEN 1
           ELSE 0 END = 1

-- Equivalent Boolean logic
WHERE (@IncludeCancelled = 1 OR Status <> 'Cancelled')
```

Rewrite `CASE` predicates as `AND`/`OR` combinations whenever possible.

---

# Shorthand Functions

```sql
IIF(TotalAmount >= 1000, 'Large', 'Regular')     -- SQL Server 2012+, SQLite 3.32+
IF(TotalAmount >= 1000, 'Large', 'Regular')      -- MySQL
DECODE(Status, 'P', 'Pending', 'S', 'Shipped', 'Other')   -- Oracle: simple CASE
CHOOSE(2, 'Low', 'Medium', 'High')               -- SQL Server: 'Medium' (1-based index)
```

- All of these are rewritten to `CASE` internally.
- `DECODE` treats two `NULL`s as equal (unlike simple `CASE`), which makes `DECODE(a, b, …)` a null-safe comparison on Oracle.
- `CASE` is portable; the shorthands are not. Use `CASE` in shared code.

---

# GREATEST and LEAST

The largest or smallest of several **arguments** (not rows—that is `MAX`/`MIN`):

```sql
SELECT OrderID,
       GREATEST(ShippedDate, InvoicedDate, PaidDate) AS LastActivity,
       LEAST(ListPrice, SalePrice, MemberPrice)      AS BestPrice
FROM …;
```

Their `NULL` behaviour differs by engine:

| Engine | `GREATEST(1, NULL, 3)` |
|--------|------------------------|
| PostgreSQL | `3` (ignores `NULL`s) |
| SQL Server 2022+ | `3` (ignores `NULL`s) |
| MySQL | **`NULL`** |
| Oracle | **`NULL`** |
| SQLite (`max(1, NULL, 3)`) | **`NULL`** |

A portable "ignore `NULL`s" version wraps each argument:

```sql
GREATEST(COALESCE(ShippedDate, DATE '0001-01-01'),
         COALESCE(InvoicedDate, DATE '0001-01-01'),
         COALESCE(PaidDate,     DATE '0001-01-01'))
```

Before SQL Server 2022, use a `VALUES` table: `(SELECT MAX(v) FROM (VALUES (a), (b), (c)) AS t(v))`.

Clamping a value to a range:

```sql
LEAST(GREATEST(DiscountPct, 0), 50)       -- keep the discount between 0 and 50
```

---

# Visual Representation

```text
Searched CASE (first true WHEN wins)

TotalAmount = 250
   WHEN TotalAmount >= 1000 ── false
   WHEN TotalAmount >= 100  ── true ──▶ 'Medium'   (remaining WHENs not tested)
   ELSE 'Small'

Simple CASE Phone WHEN NULL …:   Phone = NULL → unknown → never true → ELSE
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← CASE here is usually better written as AND / OR
4. GROUP BY    ← GROUP BY CASE … creates buckets
5. HAVING      ← CASE inside aggregates: conditional aggregation
6. WINDOW
7. SELECT      ← classification and labels
8. DISTINCT
9. ORDER BY    ← CASE for custom sort orders
10. LIMIT / FETCH / TOP
```

Many engines let `GROUP BY` or `ORDER BY` refer to a `SELECT` alias (PostgreSQL, MySQL, SQLite for `GROUP BY`; all for `ORDER BY`), which avoids repeating a long `CASE`. SQL Server and Oracle require the full expression in `GROUP BY`—or a derived table.

---

# How the DBMS Executes This

```text
CASE WHEN c1 THEN r1 WHEN c2 THEN r2 ELSE r3 END
  per row: evaluate c1 → true?  evaluate r1, done
                        → false/unknown? evaluate c2 → …
IIF / IF / DECODE / COALESCE / NULLIF → rewritten into this form at parse time
GREATEST(a, b, c) → compare pairwise, apply the engine's NULL rule
```

---

# 🔬 Engine Deep Dive

Optimizers can simplify `CASE` expressions with constant conditions—`CASE WHEN 1 = 1 THEN x ELSE y END` becomes `x`—and, in PostgreSQL, turn `CASE` in `WHERE` with a parameter into a simpler predicate at execution time when a custom plan is built. They cannot, however, derive an index range from `CASE WHEN col … END = 1`; that is why explicit Boolean predicates matter.

---

# 🏗️ Architecture Insight

Long `CASE` expressions that map codes to labels or thresholds to categories are reference data in disguise. When the same mapping appears in several queries, move it into a lookup table (`StatusCodes`, `PriceBands`) and join to it—the mapping becomes data that can change without code changes, and every query agrees.

---

# ⚡ Performance Tip

`CASE` itself is cheap. The costs come from what it hides: a non-sargable `WHERE`, a `GROUP BY` on a long expression the optimizer cannot match to an index, or an expensive function inside a branch evaluated for every row. Keep predicates Boolean and move repeated mappings into tables.

---

# 🔒 Security Note

Using `CASE` to hide columns ("`CASE WHEN @IsAdmin = 1 THEN Salary END`") protects nothing if the same user can query the table directly. Enforce access with permissions, views and row-level security; use `CASE` only for presentation.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `CASE` (simple and searched) | ✅ | ✅ | ✅ | ✅ (max 10 nesting levels) | ✅ | ✅ |
| `IIF` / `IF` | ❌ | ❌ | `IF` | `IIF` (2012+) | ❌ | `iif` (3.32+) |
| `DECODE` | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `CHOOSE` | ❌ | ❌ | `ELT` | ✅ (2012+) | ❌ | ❌ |
| `GREATEST` / `LEAST` | ✅ (SQL:2023) | ✅ (ignores `NULL`) | ✅ (`NULL` if any) | ✅ (2022+, ignores `NULL`) | ✅ (`NULL` if any) | `max()`/`min()` (`NULL` if any) |

> **Portability Tip:** `CASE` is identical everywhere—use it instead of `IIF`, `IF`, `DECODE` and `CHOOSE`. Wrap `GREATEST`/`LEAST` arguments in `COALESCE` when `NULL`s may appear.

---

# Common Mistakes

### Mistake 1

`CASE col WHEN NULL THEN …`, which never matches.

---

### Mistake 2

Ordering `WHEN`s from least to most specific, so later branches never win.

---

### Mistake 3

Mixing result types (`THEN 1 ELSE 'none'`).

---

### Mistake 4

Assuming `CASE` always prevents errors in unchosen branches.

---

### Mistake 5

Assuming `GREATEST` ignores `NULL`s on every engine.

---

# Best Practices

✔ Use searched `CASE` with `IS NULL` for `NULL` tests.

✔ Order `WHEN`s from most to least specific and always consider `ELSE`.

✔ Keep all branches the same type.

✔ Write Boolean predicates instead of `CASE` in `WHERE`.

✔ Move repeated mappings into lookup tables.

---

# Interview Questions

## Basic

1. What is the difference between simple and searched `CASE`?
2. What does `CASE` return when no `WHEN` matches and there is no `ELSE`?
3. What does `GREATEST` do?

## Intermediate

4. Why does `CASE col WHEN NULL` never match?
5. How do you sort orders with `'Pending'` first, then `'Shipped'`, then the rest?
6. How does `DECODE` treat `NULL`s?

## Advanced

7. When can a `CASE` branch be evaluated even though it is not chosen?
8. How does `GREATEST(1, NULL, 3)` differ between PostgreSQL and MySQL?
9. Why is `CASE` in `WHERE` often a performance problem?

---

# Hands-on Exercises

## Exercise 1

Classify orders as Small, Medium or Large and count each class.

---

## Exercise 2

Sort orders by status in a business-defined order, then by date.

---

## Exercise 3

Raise list prices by different percentages per category in a single `UPDATE`.

---

## Exercise 4

For each order, return the latest of three nullable dates portably.

---

# Related Topics

- **12.09 — NULL Functions (COALESCE, NULLIF, ISNULL and NVL)**
- **08.10 — Conditional Aggregation (FILTER and CASE)**
- **05.06 — Expressions & Calculated Columns**
- **06.08 — NULL Handling in WHERE (Three-Valued Logic)**

---

# Summary

`CASE` is SQL's conditional expression: searched `CASE` tests conditions in order and returns the first matching result, simple `CASE` compares one value with a list using `=` (so `WHEN NULL` never matches), and a missing `ELSE` yields `NULL`. All branches must share a type, and short-circuiting holds for ordinary rows but not for constant folding or aggregates. `CASE` classifies, sorts, buckets, drives conditional aggregation and multi-rule updates; `IIF`, `IF`, `DECODE` and `CHOOSE` are vendor shorthands for it. `GREATEST` and `LEAST` pick among arguments but disagree about `NULL`s, so wrap arguments in `COALESCE` for portable results.
