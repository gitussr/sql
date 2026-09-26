---
title: "12.06 - Numeric and Mathematical Functions"
description: "Arithmetic and mathematical functions: ABS and SIGN, integer division and MOD, POWER, SQRT, EXP and logarithms, CEILING and FLOOR, trigonometry, random numbers, bucketing with WIDTH_BUCKET, division by zero and overflow, bitwise operators, and vendor differences such as LOG meaning different things."
chapter: 12
section: 12.06
category: Data Query Language (DQL)
difficulty: Beginner → Intermediate
readingTime: 25 min
lastUpdated: 2026-09-26
---

# 12.06 Numeric and Mathematical Functions

---

# Learning Objectives

After completing this section, you will be able to:

- Use `ABS`, `SIGN`, `MOD`, `POWER`, `SQRT`, `EXP` and logarithms.
- Predict the result of integer division on each engine.
- Round up and down to integers with `CEILING` and `FLOOR`.
- Generate random numbers and understand their evaluation rules.
- Bucket numeric values into ranges.
- Prevent division-by-zero and overflow errors.

---

# Arithmetic Operators

```sql
SELECT
    oi.Quantity * oi.UnitPrice        AS LineTotal,
    o.TotalAmount - 10                AS Discounted,
    o.TotalAmount / 3                 AS Third,
    -o.TotalAmount                    AS Negated
FROM OrderItems AS oi
JOIN Orders     AS o ON o.OrderID = oi.OrderID;
```

The type of the result follows the types of the operands: `INT * DECIMAL(10,2)` is `DECIMAL`, `INT / INT` is (usually) `INT`.

---

# Integer Division

```sql
SELECT 7 / 2;
```

| Engine | `7 / 2` | Integer-division form | Decimal-division form |
|--------|---------|-----------------------|-----------------------|
| PostgreSQL | `3` | `7 / 2`, `DIV(7, 2)` | `7.0 / 2`, `7::numeric / 2` |
| MySQL | `3.5000` | `7 DIV 2` | `7 / 2` |
| SQL Server | `3` | `7 / 2` | `7.0 / 2`, `CAST(7 AS DECIMAL(10,2)) / 2` |
| Oracle | `3.5` | `TRUNC(7 / 2)` | `7 / 2` |
| SQLite | `3` | `7 / 2` | `7.0 / 2`, `7 * 1.0 / 2` |

The classic bug is a percentage computed from two integer counts:

```sql
-- SQL Server / PostgreSQL / SQLite: always 0 when Shipped < Total
SELECT ShippedCount / TotalCount * 100 AS PctShipped FROM Stats;

-- Correct: force decimal arithmetic before dividing
SELECT 100.0 * ShippedCount / TotalCount AS PctShipped FROM Stats;
```

Put the decimal literal **first** (`100.0 * a / b`): the multiplication happens before the division, so the division is already decimal.

---

# ABS, SIGN and MOD

```sql
SELECT
    ABS(-42.5)          AS AbsValue,     -- 42.5
    SIGN(-42.5)         AS SignValue,    -- -1  (0 for zero, 1 for positive)
    MOD(17, 5)          AS ModFn,        -- 2   PostgreSQL, MySQL, Oracle, SQLite 3.35+
    17 % 5              AS ModOp;        -- 2   PostgreSQL, MySQL, SQL Server, SQLite (not Oracle)
```

The sign of a modulo result follows the **dividend** on all five engines: `-7 % 3` is `-1`, not `2`. For a result that is always between `0` and `n - 1`:

```sql
((a % n) + n) % n          -- e.g. day-of-week arithmetic, circular buffers
```

Common uses of `MOD`: even/odd (`MOD(OrderID, 2) = 0`), round-robin assignment (`MOD(CustomerID, 4)` → one of four queues), and every-n-th row sampling.

---

# POWER, SQRT, EXP and Logarithms

```sql
SELECT
    POWER(1.05, 10)          AS Growth10Years,   -- 1.628894...
    SQRT(144)                AS Root,            -- 12
    EXP(1)                   AS E,               -- 2.718281...
    LN(100)                  AS NaturalLog;      -- 4.605... (not SQL Server)
```

Logarithm names are a trap:

| Function | PostgreSQL | MySQL | SQL Server | Oracle | SQLite (3.35+) |
|----------|------------|-------|------------|--------|----------------|
| Natural log | `LN(x)` | `LN(x)`, `LOG(x)` | **`LOG(x)`** | `LN(x)` | `ln(x)` |
| Base 10 | **`LOG(x)`**, `LOG10(x)` | `LOG10(x)` | `LOG10(x)` | `LOG(10, x)` | `log(x)`, `log10(x)` |
| Any base | `LOG(b, x)` | `LOG(b, x)` | `LOG(x, b)` | `LOG(b, x)` | `log(b, x)` |

`LOG(100)` is `2` on PostgreSQL and `4.605` on SQL Server and MySQL. SQL Server's two-argument `LOG` takes the base **second**.

Compound growth, a frequent business calculation:

```sql
-- Compound annual growth rate between two revenues over n years
SELECT POWER(EndRevenue / StartRevenue, 1.0 / Years) - 1 AS CAGR FROM Growth;
```

---

# CEILING and FLOOR

```sql
SELECT
    CEILING(4.1)   AS Up,       -- 5     (CEIL in PostgreSQL, MySQL, Oracle; SQL Server only CEILING)
    FLOOR(4.9)     AS Down,     -- 4
    CEILING(-4.1)  AS UpNeg,    -- -4    towards +infinity
    FLOOR(-4.1)    AS DownNeg;  -- -5    towards -infinity
```

Typical uses:

```sql
-- Number of pages needed for n items at 20 per page
SELECT CEILING(COUNT(*) / 20.0) AS Pages FROM Products;

-- Price bands of width 50: 0–49.99 → 0, 50–99.99 → 50, …
SELECT FLOOR(ListPrice / 50) * 50 AS PriceBand, COUNT(*)
FROM Products
GROUP BY FLOOR(ListPrice / 50) * 50;
```

`ROUND` and `TRUNC` are covered in Section 12.07.

---

# Bucketing with WIDTH_BUCKET

```sql
-- PostgreSQL, Oracle: 5 equal-width buckets between 0 and 500
SELECT WIDTH_BUCKET(ListPrice, 0, 500, 5) AS Bucket, COUNT(*)
FROM Products
GROUP BY WIDTH_BUCKET(ListPrice, 0, 500, 5)
ORDER BY Bucket;
```

Values below the range go to bucket `0` and values at or above the upper bound to bucket `n + 1`. Elsewhere, use `FLOOR((x - low) / width)` or a `CASE` expression.

---

# Trigonometry and Constants

```sql
SELECT PI(), SIN(PI() / 2), COS(0), DEGREES(PI()), RADIANS(180);
```

Available on PostgreSQL, MySQL, SQL Server and SQLite 3.35+ (Oracle has no `PI()`: use `ACOS(-1)`). `ATAN2(y, x)` is `ATN2` on SQL Server. Distance calculations (haversine) are the main business use—though spatial types (`geography`, PostGIS) are more accurate and indexable.

---

# Random Numbers

```sql
SELECT RANDOM();                         -- PostgreSQL: 0 ≤ x < 1; SQLite: random 64-bit integer
SELECT RAND();                           -- MySQL, SQL Server: 0 ≤ x < 1
SELECT DBMS_RANDOM.VALUE FROM dual;      -- Oracle
```

Per-row evaluation differs:

```sql
-- SQL Server: RAND() is evaluated ONCE per query — every row gets the same value
SELECT OrderID, RAND() FROM Orders;
-- Per-row random on SQL Server
SELECT OrderID, RAND(CHECKSUM(NEWID())) FROM Orders;
```

Picking random rows with `ORDER BY RANDOM() LIMIT 10` sorts the whole table. For samples of large tables, use `TABLESAMPLE` (PostgreSQL, SQL Server, Oracle `SAMPLE`) or a random key range.

Database random functions are **not** cryptographically secure. Use `gen_random_uuid()`, `NEWID()` or the application's secure generator for tokens.

---

# Division by Zero and Overflow

```sql
SELECT 10 / 0;
```

| Engine | Result |
|--------|--------|
| PostgreSQL | Error: division by zero |
| MySQL | `NULL` with a warning (an error in `INSERT`/`UPDATE` under strict mode) |
| SQL Server | Error 8134 (default settings) |
| Oracle | ORA-01476: divisor is equal to zero |
| SQLite | `NULL` |

The portable guard is `NULLIF`:

```sql
SELECT Revenue / NULLIF(Orders, 0) AS AvgOrderValue FROM Summary;   -- NULL instead of an error
```

Overflow happens when a result exceeds its type: `INT` values multiplied as `INT` can overflow even when the final answer fits in the destination column. Cast before the operation:

```sql
SELECT CAST(Quantity AS BIGINT) * UnitPriceCents FROM OrderItems;
```

---

# Bitwise Operators

```sql
-- Flags stored in one integer: 1 = gift wrap, 2 = express, 4 = insured
SELECT OrderID FROM Orders WHERE (Flags & 2) <> 0;     -- PostgreSQL, MySQL, SQL Server, SQLite
SELECT OrderID FROM Orders WHERE BITAND(Flags, 2) <> 0; -- Oracle
```

Bit flags save space but cannot use ordinary indexes and hide meaning; separate `BOOLEAN` columns are usually clearer.

---

# Visual Representation

```text
x = -4.5

ABS(x)     →  4.5
SIGN(x)    → -1
CEILING(x) → -4     ─────●──────┼──────  ceiling goes right (towards +∞)
FLOOR(x)   → -5     ──●─────────┼──────  floor goes left   (towards -∞)
                     -5   -4.5 -4    0
MOD(-7, 3) → -1     sign follows the dividend
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← a zero divisor in a filtered-out row may still be evaluated in some plans
4. GROUP BY    ← GROUP BY FLOOR(Price / 50) creates bands
5. HAVING
6. WINDOW
7. SELECT
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

Do not rely on `WHERE Orders > 0` to protect `Revenue / Orders` in the same query's `SELECT`: the SQL standard does not guarantee evaluation order, and some plans compute expressions early. `NULLIF` protects every row.

---

# How the DBMS Executes This

```text
Numeric functions are CPU-only:
  INT / BIGINT arithmetic       → native machine instructions
  FLOAT arithmetic              → native floating-point instructions
  DECIMAL / NUMERIC arithmetic  → software, digit by digit (slower, exact)
Constant sub-expressions are folded once at planning time:
  WHERE Price > 100 * 1.18      → WHERE Price > 118.00
```

---

# 🏗️ Architecture Insight

Store money as `DECIMAL` (or as integer cents) and reserve `FLOAT`/`DOUBLE` for measurements and science. Choose the type where the calculation happens, not only where the result is stored—an `INT / INT` in a view can throw away precision long before the value reaches a `DECIMAL` column.

---

# ⚡ Performance Tip

Arithmetic on a column in `WHERE` blocks index seeks: `WHERE Price * 1.18 > 118` scans. Move the arithmetic to the constant side: `WHERE Price > 118 / 1.18`. The optimizer rarely does this rewrite for you.

---

# 🔒 Security Note

Never use `RANDOM()`, `RAND()` or `DBMS_RANDOM` for passwords, tokens or anything an attacker must not predict. They are designed for sampling, not secrecy.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `INT / INT` | Implementation-defined | Integer | Decimal | Integer | Decimal | Integer |
| `MOD` / `%` | `MOD` | Both | Both | `%` | `MOD` | `%` (+ `mod` 3.35+) |
| `CEIL` / `CEILING` | `CEIL`, `CEILING` | Both | Both | `CEILING` | `CEIL` | Both (3.35+) |
| `LOG(x)` | `LOG(b, x)`, `LN`, `LOG10` | Base 10 | Natural | Natural | Needs base | Base 10 (3.35+) |
| `WIDTH_BUCKET` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Division by zero | Error | Error | `NULL` / error | Error | Error | `NULL` |

> **Portability Tip:** `ABS`, `SIGN`, `FLOOR`, `POWER`, `SQRT` and `EXP` are portable. Always write `LN` for natural logarithms and `LOG10` for base 10 (`LOG(10, x)` on Oracle), and force decimal division with `1.0 *`.

---

# Common Mistakes

### Mistake 1

Integer division turning ratios and percentages into 0.

---

### Mistake 2

`LOG(x)` meaning base 10 on one engine and natural on another.

---

### Mistake 3

Dividing without `NULLIF(divisor, 0)`.

---

### Mistake 4

Expecting `RAND()` to differ per row on SQL Server.

---

### Mistake 5

Arithmetic on an indexed column in `WHERE`.

---

# Best Practices

✔ Write `100.0 * a / b` for percentages.

✔ Guard every division with `NULLIF`.

✔ Use `LN` and `LOG10` explicitly.

✔ Cast to a wider type before multiplying large integers.

✔ Keep arithmetic on the constant side of predicates.

---

# Interview Questions

## Basic

1. What does `7 / 2` return on SQL Server and on MySQL?
2. What is the difference between `CEILING` and `FLOOR`?
3. How do you compute a remainder?

## Intermediate

4. How do you avoid division-by-zero errors portably?
5. Why does `ShippedCount / TotalCount * 100` return 0?
6. What does `-7 % 3` return?

## Advanced

7. Why is `RAND()` the same for every row on SQL Server, and how do you fix it?
8. Why can `WHERE Divisor <> 0` fail to prevent a division-by-zero error?
9. How do you bucket prices into equal-width bands on an engine without `WIDTH_BUCKET`?

---

# Hands-on Exercises

## Exercise 1

Compute the percentage of orders with status `'Shipped'`, with two decimal places.

---

## Exercise 2

Group products into price bands of 50 and count each band.

---

## Exercise 3

Compute the average order value per customer without risking division by zero.

---

## Exercise 4

Assign each customer to one of four support queues deterministically.

---

# Related Topics

- **12.07 — Rounding, Truncation and Numeric Precision**
- **12.09 — NULL Functions (COALESCE, NULLIF, ISNULL and NVL)**
- **05.06 — Expressions & Calculated Columns**
- **06.12 — SARGability and Index-Friendly Predicates**

---

# Summary

SQL's numeric functions—`ABS`, `SIGN`, `MOD`, `POWER`, `SQRT`, `EXP`, `LN`, `CEILING`, `FLOOR`, trigonometry and random numbers—are mostly portable, with notable exceptions: `INT / INT` truncates on PostgreSQL, SQL Server and SQLite; `LOG(x)` means base 10 on some engines and natural on others; and SQL Server's `RAND()` is evaluated once per query. Division by zero errors or returns `NULL` depending on the engine, so guard divisors with `NULLIF`, cast before operations that could overflow, and keep arithmetic off indexed columns in predicates.
