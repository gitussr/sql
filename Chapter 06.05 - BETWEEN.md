---
title: "06.05 - BETWEEN"
description: "Filter ranges with SQL BETWEEN: inclusive bounds, NOT BETWEEN, numeric, string, and date ranges, the date-time end-of-day trap, half-open ranges, BETWEEN SYMMETRIC, NULL behavior, and index range scans."
chapter: 6
section: 6.05
category: Data Query Language (DQL)
difficulty: Beginner → Advanced
readingTime: 40 min
lastUpdated: 2026-09-19
---

# 06.05 BETWEEN

---

# Learning Objectives

After completing this section, you will be able to:

- Filter ranges with `BETWEEN`.
- Explain that both bounds are inclusive.
- Use `NOT BETWEEN`.
- Apply `BETWEEN` to numbers, strings, and dates.
- Avoid the date-time end-of-day trap.
- Write half-open ranges.
- Understand how `BETWEEN` uses indexes.

---

# What is BETWEEN?

`BETWEEN` tests whether a value lies within a range.

```sql
SELECT
    ProductName,
    Price
FROM Products
WHERE Price BETWEEN 10 AND 50;
```

This returns products priced from 10 **up to and including** 50.

---

# BETWEEN is Inclusive

```sql
WHERE Price BETWEEN 10 AND 50
```

is exactly equivalent to:

```sql
WHERE Price >= 10
  AND Price <= 50
```

Both boundary values are included.

| Price | `BETWEEN 10 AND 50` |
|-------|---------------------|
| 9.99 | FALSE |
| 10 | TRUE |
| 35 | TRUE |
| 50 | TRUE |
| 50.01 | FALSE |

---

# Syntax

```sql
expression BETWEEN low AND high
```

```sql
expression NOT BETWEEN low AND high
```

The `AND` inside `BETWEEN` is part of the operator, not a logical `AND`.

```sql
WHERE Price BETWEEN 10 AND 50
  AND InStock = 1
```

Here the first `AND` belongs to `BETWEEN`; the second combines two predicates.

---

# Order of Bounds Matters

```sql
WHERE Price BETWEEN 50 AND 10
```

This is equivalent to `Price >= 50 AND Price <= 10`, which is never TRUE. The query returns **no rows**—and raises no error.

Always write the lower bound first.

PostgreSQL offers `BETWEEN SYMMETRIC`, which accepts bounds in either order:

```sql
WHERE Price BETWEEN SYMMETRIC 50 AND 10
```

`SYMMETRIC` is part of the SQL standard but is not widely implemented.

---

# NOT BETWEEN

```sql
SELECT
    EmployeeName,
    Salary
FROM Employees
WHERE Salary NOT BETWEEN 40000 AND 80000;
```

Equivalent to:

```sql
WHERE Salary < 40000
   OR Salary > 80000
```

The boundary values themselves are **excluded** by `NOT BETWEEN`.

---

# BETWEEN with Numbers

```sql
SELECT
    OrderID,
    TotalAmount
FROM Orders
WHERE TotalAmount BETWEEN 100 AND 500;
```

Straightforward and readable. For continuous values, remember that the upper bound is included: a price of exactly `500.00` qualifies.

---

# BETWEEN with Strings

```sql
SELECT
    CustomerName
FROM Customers
WHERE LastName BETWEEN 'A' AND 'C';
```

This is a common trap.

It returns `'A...'` and `'B...'` names and the single value `'C'`—but **not** `'Carter'`, because `'Carter' > 'C'` in string order.

```text
'A'  ≤  'Adams'   ≤  'C'    ✅
'A'  ≤  'Brown'   ≤  'C'    ✅
'A'  ≤  'C'       ≤  'C'    ✅
'A'  ≤  'Carter'  ≤  'C'    ❌  ('Carter' sorts after 'C')
```

To include every name starting with A, B, or C:

```sql
WHERE LastName >= 'A'
  AND LastName <  'D'
```

String ranges also depend on collation (case, accents), as described in Section 06.03.

---

# BETWEEN with Dates

For a `DATE` column (no time part), `BETWEEN` works well:

```sql
SELECT
    OrderID,
    OrderDate
FROM Orders
WHERE OrderDate BETWEEN DATE '2026-01-01' AND DATE '2026-01-31';
```

All of January is included, because each value is a whole day.

---

# The Date-Time Trap

If the column stores **date and time** (`TIMESTAMP`, `DATETIME`, `DATETIME2`):

```sql
WHERE CreatedAt BETWEEN '2026-01-01' AND '2026-01-31'
```

The upper bound is interpreted as `2026-01-31 00:00:00`.

```text
2026-01-31 00:00:00   ✅ included
2026-01-31 09:15:00   ❌ excluded
2026-01-31 23:59:59   ❌ excluded
```

Almost the entire last day is missing.

A common "fix" is equally fragile:

```sql
WHERE CreatedAt BETWEEN '2026-01-01' AND '2026-01-31 23:59:59'
```

This misses `23:59:59.5` and depends on the column's fractional-second precision.

---

# Half-Open Ranges

The robust pattern is a **half-open range**: inclusive start, exclusive end.

```sql
SELECT
    OrderID,
    CreatedAt
FROM Orders
WHERE CreatedAt >= TIMESTAMP '2026-01-01 00:00:00'
  AND CreatedAt <  TIMESTAMP '2026-02-01 00:00:00';
```

```text
[ 2026-01-01 00:00:00 , 2026-02-01 00:00:00 )
  included               excluded
```

Advantages:

- Works for any time precision.
- Adjacent ranges never overlap and never leave gaps.
- Uses indexes exactly as well as `BETWEEN`.

---

# BETWEEN and NULL

If the tested value or either bound is `NULL`, the result is UNKNOWN (or FALSE, if the other half already fails):

```sql
WHERE Discount BETWEEN 5 AND 20
```

Rows where `Discount` is `NULL` are not returned.

```sql
WHERE Price BETWEEN 10 AND ?
```

If the parameter is `NULL`, **no rows** are returned. Validate optional range parameters in the application or handle them explicitly.

---

# Visual Representation

```text
Number line:

          10                          50
───────────●──────────────────────────●───────────
           │◄──── BETWEEN 10 AND 50 ──►│
           inclusive                 inclusive


Half-open date range:

   2026-01-01                    2026-02-01
───────────●──────────────────────────○───────────
           │◄──── >= start AND < end ─►│
           inclusive                 exclusive
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE   ← BETWEEN is evaluated here
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
WHERE Price BETWEEN 10 AND 50

↓

Rewritten as Price >= 10 AND Price <= 50

↓

Index on Price available?

↓ yes

Index range scan:
seek to 10, read forward until the first key > 50

↓

Return matching rows
```

`BETWEEN` has no performance advantage or disadvantage compared with the equivalent `>=` / `<=` pair; it is purely a readability feature.

---

# 🔬 Engine Deep Dive

In a B-tree, a range predicate becomes a **start key** and a **stop key**:

```text
B-tree leaf level (sorted Price values)

 5 │ 8 │ 10 │ 12 │ 19 │ 35 │ 50 │ 51 │ 70
         ▲                        ▲
     start key               stop after key
     (seek here)             > 50 is reached
```

The engine reads only the entries between the two keys. The number of rows read is proportional to the size of the range, not the size of the table.

---

# 🏗️ Architecture Insight

Range predicates are the reason index **column order** matters. An index on `(CustomerID, OrderDate)` can serve `WHERE CustomerID = 7 AND OrderDate BETWEEN ...` with one tight range scan, while an index on `(OrderDate, CustomerID)` must scan the whole date range and filter customers afterwards.

---

# ⚡ Performance Tip

Wide ranges read many rows. If a range covers a large fraction of the table, the optimizer may choose a full scan instead of an index, which is often the correct decision. Check the execution plan and the estimated row count before adding indexes for range filters.

---

# 🔒 Security Note

Range parameters supplied by users should be validated for order and size. An inverted range returns nothing; an unbounded range (for example, "all time") can trigger expensive scans. Enforce maximum ranges for public-facing reports.

---

# 🌍 Production Consideration

Reporting bugs caused by date-time `BETWEEN` are extremely common: daily or monthly totals that silently omit most of the last day. Standardizing on half-open ranges in reporting queries eliminates this entire class of defect.

---

# 🚀 Enterprise Practice

Many coding standards forbid `BETWEEN` on date-time columns and require half-open ranges (`>= start AND < end`). The same convention is used for partition boundaries, retention jobs, and incremental data loads, so that consecutive periods never overlap.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `BETWEEN` / `NOT BETWEEN` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Inclusive bounds | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `BETWEEN SYMMETRIC` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Date-time with time part | Type-defined | `TIMESTAMP` | `DATETIME` / `TIMESTAMP` | `DATETIME2` / `DATETIME` | `DATE` includes time! | Text / number |

> **Portability Tip:** Oracle's `DATE` type always stores a time component. `WHERE OrderDate BETWEEN DATE '2026-01-01' AND DATE '2026-01-31'` in Oracle misses most of 31 January if times are stored. Half-open ranges avoid this on every database.

---

# Common Mistakes

### Mistake 1

Using `BETWEEN` on date-time columns and losing most of the last day.

---

### Mistake 2

Writing the bounds in the wrong order.

---

### Mistake 3

Using `BETWEEN 'A' AND 'C'` to mean "names starting with A to C".

---

### Mistake 4

Forgetting that both bounds are inclusive, causing overlapping ranges:

```sql
-- Row at exactly 100 appears in both bands
WHERE Amount BETWEEN 0 AND 100
WHERE Amount BETWEEN 100 AND 200
```

---

# Best Practices

✔ Use `BETWEEN` for readable inclusive ranges of whole values.

✔ Use half-open ranges for date-time values.

✔ Always put the lower bound first.

✔ Use `>=` and `<` to build non-overlapping bands.

✔ Handle `NULL` range parameters explicitly.

---

# Interview Questions

## Basic

1. Is `BETWEEN` inclusive or exclusive?
2. What is `BETWEEN` equivalent to using comparison operators?
3. What does `NOT BETWEEN` return for the boundary values?

## Intermediate

4. Why does `BETWEEN '2026-01-01' AND '2026-01-31'` miss data on date-time columns?
5. What is a half-open range?
6. What happens if the bounds are reversed?

## Advanced

7. How does a B-tree index execute a range predicate?
8. Why does index column order matter for range predicates?
9. Why is Oracle's `DATE` type a special risk for `BETWEEN`?

---

# Hands-on Exercises

## Exercise 1

Return employees aged between 25 and 35, inclusive.

---

## Exercise 2

Return all orders created during March 2026 from a `CreatedAt TIMESTAMP` column.

---

## Exercise 3

Return products whose price is outside the range 20 to 200.

---

## Exercise 4

Split `Amount` values into three non-overlapping bands: below 100, 100 up to (but not including) 500, and 500 or more.

---

# Related Topics

- **06.03 — Comparison Operators**
- **06.08 — NULL Handling in WHERE (Three-Valued Logic)**
- **06.09 — Filtering with Expressions and Functions**
- **06.12 — SARGability and Index-Friendly Predicates**
- **10.xx — Indexes**

---

# Summary

`BETWEEN` tests whether a value lies within an inclusive range and is equivalent to a pair of `>=` and `<=` comparisons. It is readable for whole values such as integers and dates, but it is a frequent source of bugs with date-time columns and string prefixes. Half-open ranges—inclusive start, exclusive end—are the robust alternative, working for any precision and producing non-overlapping periods. On indexed columns, both forms become efficient range scans.
