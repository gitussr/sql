---
title: "12.08 - Type Conversion (CAST, CONVERT and TRY_CAST)"
description: "Explicit conversion with CAST, the :: operator, CONVERT with styles, TO_CHAR and TO_NUMBER; safe conversion with TRY_CAST, TRY_CONVERT, Oracle's DEFAULT ON CONVERSION ERROR and PostgreSQL's pg_input_is_valid; implicit conversion rules and data type precedence, how implicit conversion breaks index use, lenient engines, default lengths, and validating before converting."
chapter: 12
section: 12.08
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 30 min
lastUpdated: 2026-09-26
---

# 12.08 Type Conversion (CAST, CONVERT and TRY_CAST)

---

# Learning Objectives

After completing this section, you will be able to:

- Convert values explicitly with `CAST` and vendor functions.
- Convert text to numbers without failing on bad data.
- Explain implicit conversion and data type precedence.
- Recognise when an implicit conversion prevents index use.
- Predict what lenient engines do with invalid input.
- Avoid default-length and evaluation-order traps.

---

# CAST

```sql
CAST(expression AS target_type)
```

```sql
SELECT
    CAST('42'          AS INT)            AS IntValue,
    CAST('19.99'       AS DECIMAL(10,2))  AS DecValue,
    CAST(OrderID       AS VARCHAR(10))    AS OrderText,
    CAST('2026-09-26'  AS DATE)           AS DateValue,
    CAST(TotalAmount   AS INT)            AS WholeAmount     -- rounds or truncates: see 12.07
FROM Orders;
```

`CAST` is the SQL standard and works on every engine, with vendor differences in the type names:

| Target | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|--------|------------|-------|------------|--------|--------|
| Integer | `INT` | `SIGNED` / `UNSIGNED` | `INT` | `INTEGER`, `NUMBER(10)` | `INTEGER` |
| Decimal | `DECIMAL(p,s)` | `DECIMAL(p,s)` | `DECIMAL(p,s)` | `NUMBER(p,s)` | `REAL` / `NUMERIC` |
| Text | `VARCHAR(n)`, `TEXT` | `CHAR(n)` | `VARCHAR(n)`, `NVARCHAR(n)` | `VARCHAR2(n)` | `TEXT` |

MySQL rejects `CAST(x AS INT)`; use `SIGNED`. MySQL also casts to `CHAR`, not `VARCHAR`.

---

# Vendor Conversion Syntax

```sql
-- PostgreSQL shorthand
SELECT '42'::int, TotalAmount::text, '2026-09-26'::date;

-- SQL Server: CONVERT(type, value [, style]) — style controls date and money formats
SELECT CONVERT(VARCHAR(10), OrderDate, 23);     -- '2026-09-26' (yyyy-mm-dd)
SELECT CONVERT(VARCHAR(8),  OrderDate, 112);    -- '20260926'
SELECT CONVERT(DATE, '26/09/2026', 103);        -- dd/mm/yyyy input

-- MySQL: CONVERT(value, type) — arguments in the opposite order to SQL Server
SELECT CONVERT('42', SIGNED);
SELECT CONVERT(CustomerName USING utf8mb4);     -- character set conversion

-- Oracle: TO_NUMBER, TO_CHAR, TO_DATE with format models
SELECT TO_NUMBER('1,234.50', '9G999D99'), TO_CHAR(OrderDate, 'YYYY-MM-DD') FROM Orders;
```

`CONVERT` takes its arguments in opposite orders on SQL Server and MySQL. When in doubt, use `CAST`.

---

# What Happens With Bad Input

```sql
SELECT CAST('12abc' AS INT);
SELECT CAST('abc'   AS INT);
```

| Engine | `'12abc'` | `'abc'` |
|--------|-----------|---------|
| PostgreSQL | Error | Error |
| MySQL (`AS SIGNED`) | `12` + warning | `0` + warning |
| SQL Server | Error | Error |
| Oracle | ORA-01722 | ORA-01722 |
| SQLite | `12` | `0` |

Strict engines stop the whole statement at the first bad row. Lenient engines (MySQL in `SELECT`, SQLite always) silently produce **wrong values**: a product code `'abc'` becomes quantity 0. Neither is what you want when loading messy data—you want bad values identified.

---

# Safe Conversion

```sql
-- SQL Server 2012+: NULL instead of an error
SELECT TRY_CAST(RawQuantity AS INT)                 AS Qty,
       TRY_CONVERT(DATE, RawDate, 103)              AS OrderDate
FROM StagingOrders;

-- Oracle 12.2+
SELECT CAST(RawQuantity AS NUMBER DEFAULT NULL ON CONVERSION ERROR)          AS Qty,
       TO_DATE(RawDate DEFAULT NULL ON CONVERSION ERROR, 'DD/MM/YYYY')      AS OrderDate,
       VALIDATE_CONVERSION(RawQuantity AS NUMBER)                            AS IsNumber   -- 1 or 0
FROM StagingOrders;

-- PostgreSQL 16+: test before converting
SELECT CASE WHEN pg_input_is_valid(RawQuantity, 'integer')
            THEN RawQuantity::int END                                        AS Qty
FROM StagingOrders;

-- PostgreSQL (any version): validate with a pattern first
-- (MySQL: REGEXP_LIKE(RawQuantity, '^-?[0-9]+$'); SQLite: RawQuantity NOT GLOB '*[^0-9]*')
SELECT CASE WHEN RawQuantity ~ '^\s*-?[0-9]+\s*$'
            THEN CAST(RawQuantity AS INT) END                                AS Qty
FROM StagingOrders;
```

A typical load finds the bad rows first:

```sql
SELECT *
FROM StagingOrders
WHERE RawQuantity IS NOT NULL
  AND TRY_CAST(RawQuantity AS INT) IS NULL;          -- SQL Server: rows that will not convert
```

> Avoid SQL Server's `ISNUMERIC`: it returns 1 for `'$'`, `','`, `'.'`, `'1e5'` and `'-'`, which then fail to convert to `INT`. Use `TRY_CAST(…) IS NOT NULL`.

---

# Implicit Conversion

When operands have different types, the engine converts one of them automatically:

```sql
SELECT * FROM Orders WHERE OrderID = '101';        -- string literal compared with INT column
SELECT * FROM Customers WHERE Phone = 5550102030;  -- number compared with VARCHAR column
```

Which side is converted decides whether an index can be used:

```text
OrderID (INT) = '101'          → the literal '101' is converted to INT once  ✅ index seek
Phone (VARCHAR) = 5550102030   → the COLUMN is converted to a number per row ❌ scan
```

- **SQL Server** converts the operand with lower **data type precedence** to the higher one. `INT` ranks above `VARCHAR`, so the `VARCHAR` column is converted—and the query fails with a conversion error if any row holds non-numeric text.
- **MySQL** compares a string with a number **as numbers**: `Phone = 5550102030` converts every `Phone`, cannot use the index, and even matches `'5550102030abc'`. `'abc' = 0` is true.
- **Oracle** converts the `VARCHAR2` column with `TO_NUMBER`, loses the index and raises ORA-01722 on bad rows.
- **PostgreSQL** refuses: `operator does not exist: character varying = bigint`. Annoying, but safe.

The fix is always the same: compare values of the **column's type**.

```sql
SELECT * FROM Customers WHERE Phone = '5550102030';
```

### The Unicode parameter trap (SQL Server)

`NVARCHAR` has higher precedence than `VARCHAR`. An application that sends every string parameter as `NVARCHAR` (the default in many drivers) forces `CONVERT_IMPLICIT` on `VARCHAR` columns:

```sql
-- Column Email is VARCHAR(255) and indexed
WHERE Email = @p      -- @p sent as NVARCHAR(4000): column converted, seek may degrade to a scan
```

Match parameter types to column types in the driver, or store text as `NVARCHAR` consistently.

---

# Default Lengths

```sql
-- SQL Server
DECLARE @s VARCHAR = 'Hello';          -- VARCHAR with no length in a declaration = VARCHAR(1): 'H'
SELECT CAST(LongText AS VARCHAR);      -- VARCHAR with no length in CAST/CONVERT = VARCHAR(30)
```

A missing length silently truncates. Always write the length: `VARCHAR(100)`, `NVARCHAR(MAX)`.

---

# Checking Types

```sql
SELECT pg_typeof(1.5), pg_typeof('x'::text);    -- PostgreSQL: numeric, text
SELECT typeof(1.5), typeof('1.5');              -- SQLite: real, text
SELECT SQL_VARIANT_PROPERTY(1.5, 'BaseType');   -- SQL Server: numeric
```

In SQLite, a column's declared type is only an "affinity": a `INTEGER` column can store `'abc'` unless a `STRICT` table (3.37+) or a `CHECK (typeof(col) = 'integer')` prevents it.

---

# Visual Representation

```text
            explicit                         implicit
   CAST('42' AS INT) → 42            OrderID = '101'
   you choose the direction          engine chooses by precedence
                                          │
                  ┌───────────────────────┴───────────────────────┐
         literal converted                              column converted
         once, index usable ✅                     per row, index lost ❌,
                                                   errors on bad rows
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN        ← joining INT to VARCHAR keys converts one side for every pair
3. WHERE       ← implicit conversion of a column here disables index seeks
4. GROUP BY
5. HAVING
6. WINDOW
7. SELECT      ← CAST for output formatting belongs here
8. DISTINCT
9. ORDER BY    ← ordering text that holds numbers sorts '10' before '9'
10. LIMIT / FETCH / TOP
```

The SQL standard does not fix the order in which predicates are evaluated. `WHERE TRY_CAST(x AS INT) IS NOT NULL AND CAST(x AS INT) > 5` is safe only because `TRY_CAST` never fails; `WHERE x NOT LIKE '%[^0-9]%' AND CAST(x AS INT) > 5` can still fail if the engine evaluates the `CAST` first. Put conversions inside `CASE` or use safe conversion functions.

---

# How the DBMS Executes This

```text
Parse & bind:
  determine operand types → look up a comparison operator for (type1, type2)
  none exists → insert a conversion on one side (SQL Server: CONVERT_IMPLICIT, visible in the plan)
Optimize:
  conversion on the constant side → folded once, index seek possible
  conversion on the column side   → predicate is not sargable → scan + filter
Execute:
  per-row conversion; strict engines raise an error on the first bad value
```

Look for `CONVERT_IMPLICIT` in SQL Server plans and warnings such as "Type conversion in expression may affect CardinalityEstimate / SeekPlan".

---

# 🏗️ Architecture Insight

Conversion problems are usually modelling problems: numbers stored in text columns, dates stored as strings, keys with different types in related tables. Fix the types at the boundary—staging tables with `TRY_CAST` validation, then typed production tables—so the rest of the system never converts.

---

# ⚡ Performance Tip

Make join keys and parameters exactly the column's type. A mismatched parameter type is one of the most common reasons a well-indexed query scans.

---

# 🔒 Security Note

Lenient conversion can bypass checks: in MySQL, `WHERE ResetToken = 0` compared with a string column can match tokens that do not start with a digit. Always compare values of the correct type, and use strict SQL modes.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `CAST` | ✅ | ✅ + `::` | ✅ (`SIGNED`, `CHAR`) | ✅ | ✅ | ✅ |
| `CONVERT` | Character sets | ❌ | `CONVERT(x, type)` | `CONVERT(type, x, style)` | Character sets | ❌ |
| Safe conversion | ❌ | `pg_input_is_valid` (16+) | ❌ | `TRY_CAST`, `TRY_CONVERT` | `DEFAULT … ON CONVERSION ERROR` | Never fails |
| Bad input | Error | Error | Warning + partial value | Error | Error | Partial value |
| String vs number comparison | Error | Error | Numeric compare | Precedence | Column → number | Affinity rules |

> **Portability Tip:** `CAST` with standard type names is portable (except `INT` on MySQL). Safe conversion is not—isolate it in staging code for each engine.

---

# Common Mistakes

### Mistake 1

Comparing a `VARCHAR` column with a number and losing the index.

---

### Mistake 2

Using `ISNUMERIC` to guard a `CAST` to `INT`.

---

### Mistake 3

`VARCHAR` without a length on SQL Server.

---

### Mistake 4

Trusting MySQL or SQLite conversions that silently return 0 or a partial number.

---

### Mistake 5

Relying on predicate order to protect a `CAST`.

---

# Best Practices

✔ Convert explicitly with `CAST`.

✔ Use safe conversion (or validation) when loading external data.

✔ Match literal, parameter and join key types to column types.

✔ Always specify string lengths in casts.

✔ Fix types at the boundary; keep production tables strongly typed.

---

# Interview Questions

## Basic

1. What does `CAST` do?
2. How do you convert a string to a date on SQL Server with a specific format?
3. What is implicit conversion?

## Intermediate

4. What does `TRY_CAST` return for invalid input?
5. Why can `WHERE Phone = 5550102030` be slow?
6. What does `CAST('12abc' AS SIGNED)` return on MySQL?

## Advanced

7. Explain SQL Server data type precedence and its effect on index use.
8. Why can an `NVARCHAR` parameter cause a scan on a `VARCHAR` column?
9. Why is predicate order not a safe guard for conversions?

---

# Hands-on Exercises

## Exercise 1

From a staging table, list rows whose quantity text will not convert to an integer.

---

## Exercise 2

Load valid rows into a typed table, converting `'dd/mm/yyyy'` dates, on SQL Server or Oracle.

---

## Exercise 3

Find a query in your codebase that compares a text column with a number and fix it.

---

## Exercise 4

Show the difference between `CAST(x AS VARCHAR)` and `CAST(x AS VARCHAR(100))` for a 50-character value on SQL Server.

---

# Related Topics

- **12.07 — Rounding, Truncation and Numeric Precision**
- **12.15 — Scalar Function Performance and Index Strategy**
- **06.12 — SARGability and Index-Friendly Predicates**
- **10.08 — Index Seeks, Scans and Lookups**
- **13.xx — Date and Time Functions**

---

# Summary

`CAST` is the standard, portable way to convert types; `::`, `CONVERT`, `TO_NUMBER` and `TO_CHAR` are vendor forms, and `CONVERT` means different things on SQL Server and MySQL. Invalid input raises an error on strict engines and becomes a wrong value on lenient ones, so load external data with safe conversion—`TRY_CAST`, Oracle's `DEFAULT … ON CONVERSION ERROR`, PostgreSQL's `pg_input_is_valid`—or validate first. Implicit conversion follows type precedence and, when it converts a column instead of a constant, disables index seeks and can fail on bad rows. Match literal, parameter and key types to the column, always give string lengths, and fix types at the system boundary.
