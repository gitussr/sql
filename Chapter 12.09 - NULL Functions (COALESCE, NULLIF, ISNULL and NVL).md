---
title: "12.09 - NULL Functions (COALESCE, NULLIF, ISNULL and NVL)"
description: "Functions that produce, replace and compare NULLs: COALESCE and its result type, NULLIF for sentinels and division by zero, SQL Server ISNULL and its truncation trap, MySQL ISNULL and IFNULL, Oracle NVL and NVL2, null-safe comparison with IS DISTINCT FROM and <=>, COALESCE with aggregates and outer joins, sargable rewrites, and vendor differences."
chapter: 12
section: 12.09
category: Data Query Language (DQL)
difficulty: Beginner → Intermediate
readingTime: 30 min
lastUpdated: 2026-09-26
---

# 12.09 NULL Functions (COALESCE, NULLIF, ISNULL and NVL)

---

# Learning Objectives

After completing this section, you will be able to:

- Replace `NULL`s with `COALESCE` and choose it over vendor functions.
- Turn values into `NULL` with `NULLIF` to handle sentinels and division by zero.
- Recognise the traps in `ISNULL`, `NVL`, `IFNULL` and `NVL2`.
- Compare values null-safely with `IS DISTINCT FROM` and its equivalents.
- Combine `NULL` functions with aggregates and outer joins correctly.
- Rewrite `NULL`-function predicates so they can use indexes.

---

# COALESCE

```sql
COALESCE(value1, value2, …, valueN)   -- the first argument that is not NULL
```

```sql
SELECT
    CustomerName,
    COALESCE(Phone, Email, 'no contact') AS PreferredContact
FROM Customers;
```

```text
┌──────────────┬────────────┬─────────────────────┬──────────────────────┐
│ CustomerName │ Phone      │ Email               │ PreferredContact     │
├──────────────┼────────────┼─────────────────────┼──────────────────────┤
│ Asha Rao     │ 555-0102   │ asha@example.com    │ 555-0102             │
│ Ben Cole     │ NULL       │ ben@example.com     │ ben@example.com      │
│ Chen Wei     │ NULL       │ NULL                │ no contact           │
└──────────────┴────────────┴─────────────────────┴──────────────────────┘
```

- Standard SQL, identical on every engine, any number of arguments.
- Evaluates arguments left to right and stops at the first non-`NULL` (short-circuit)—in principle; see the SQL Server note below.
- The **result type** is determined from all arguments by the engine's type rules: `COALESCE(IntCol, 'n/a')` fails on PostgreSQL and SQL Server because `'n/a'` cannot become an integer. Convert explicitly: `COALESCE(CAST(IntCol AS VARCHAR(20)), 'n/a')`.

SQL Server implements `COALESCE(a, b)` as `CASE WHEN a IS NOT NULL THEN a ELSE b END`. If `a` is a subquery or a non-deterministic expression, it is evaluated **twice**, and may return different values each time.

---

# NULLIF

```sql
NULLIF(a, b)     -- NULL if a = b, otherwise a
```

It is the inverse of `COALESCE`: it turns a value into `NULL`.

```sql
-- 1. Avoid division by zero
SELECT Revenue / NULLIF(OrderCount, 0) AS AvgOrderValue FROM MonthlySummary;

-- 2. Treat blanks as missing
SELECT COALESCE(NULLIF(TRIM(Phone), ''), 'not provided') AS Phone FROM Customers;

-- 3. Convert sentinel values from legacy systems to real NULLs
SELECT NULLIF(DiscountPct, -1)            AS DiscountPct,     -- -1 meant "unknown"
       NULLIF(BirthDate, DATE '1900-01-01') AS BirthDate
FROM LegacyCustomers;
```

`NULLIF` is standard and portable.

---

# Vendor NULL Functions

| Engine | Function | Meaning | Trap |
|--------|----------|---------|------|
| SQL Server | `ISNULL(a, b)` | `b` if `a` is `NULL` | Result has the **type of `a`**: `b` may be truncated |
| MySQL | `IFNULL(a, b)` | `b` if `a` is `NULL` | — |
| MySQL | `ISNULL(a)` | **1 if `a` is `NULL`, else 0** | Same name as SQL Server, different meaning |
| Oracle | `NVL(a, b)` | `b` if `a` is `NULL` | Always evaluates **both** arguments |
| Oracle | `NVL2(a, x, y)` | `x` if `a` is not `NULL`, else `y` | Easy to read backwards |
| SQLite | `IFNULL(a, b)` | `b` if `a` is `NULL` | — |

### The ISNULL truncation trap

```sql
-- SQL Server
DECLARE @Code VARCHAR(2) = NULL;
SELECT ISNULL(@Code, 'UNKNOWN');     -- 'UN'       (type of @Code: VARCHAR(2))
SELECT COALESCE(@Code, 'UNKNOWN');   -- 'UNKNOWN'  (type from all arguments)
```

`ISNULL` does have two legitimate advantages on SQL Server: it evaluates its first argument only once, and a computed column defined with `ISNULL(…)` is known to be `NOT NULL` (useful for indexed views and `SELECT … INTO` column nullability).

### NVL evaluates both arguments

```sql
-- Oracle: the function runs for every row, even when Discount is not NULL
SELECT NVL(Discount, expensive_lookup(CustomerID)) FROM Orders;
-- COALESCE stops at the first non-NULL
SELECT COALESCE(Discount, expensive_lookup(CustomerID)) FROM Orders;
```

---

# Null-Safe Comparison

`a = b` is **unknown** (not true) when either side is `NULL`, so `NULL = NULL` does not match. To treat two `NULL`s as equal:

```sql
-- Standard: PostgreSQL, SQL Server 2022+, SQLite 3.39+
WHERE a IS NOT DISTINCT FROM b        -- true when equal or both NULL
WHERE a IS DISTINCT FROM b            -- true when different, treating NULL as a value

-- MySQL
WHERE a <=> b                         -- null-safe equal

-- SQLite
WHERE a IS b                          -- null-safe equal; a IS NOT b for "distinct"

-- Oracle (no IS DISTINCT FROM): DECODE treats two NULLs as a match
WHERE DECODE(a, b, 1, 0) = 1

-- Any engine
WHERE (a = b OR (a IS NULL AND b IS NULL))
```

The main use is change detection—"has this column changed?"—in `MERGE`, triggers and incremental loads:

```sql
UPDATE Target AS t
SET    Phone = s.Phone
FROM   Source AS s
WHERE  t.CustomerID = s.CustomerID
  AND  t.Phone IS DISTINCT FROM s.Phone;     -- updates NULL → value and value → NULL too
```

With plain `<>`, rows where one side is `NULL` would never be updated.

---

# COALESCE With Aggregates

```sql
-- SUM over no rows is NULL, not 0
SELECT c.CustomerID, COALESCE(SUM(o.TotalAmount), 0) AS Spent
FROM Customers AS c
LEFT JOIN Orders AS o ON o.CustomerID = c.CustomerID
GROUP BY c.CustomerID;
```

Where the `COALESCE` goes changes the answer:

```sql
AVG(Salary)                 -- average of known salaries (NULLs ignored)
AVG(COALESCE(Salary, 0))    -- contractors counted as earning 0: a lower average
COALESCE(AVG(Salary), 0)    -- 0 only when no salary is known at all
```

Choose deliberately; Section 08.04 covers `NULL`s in aggregates in depth.

---

# COALESCE and Outer Joins

```sql
-- Show a placeholder for customers without a country record
SELECT c.CustomerName,
       COALESCE(co.CountryName, 'Unknown') AS Country
FROM Customers AS c
LEFT JOIN Countries AS co ON co.CountryCode = c.Country;

-- FULL OUTER JOIN key from whichever side exists
SELECT COALESCE(a.ProductID, b.ProductID) AS ProductID, a.Qty2025, b.Qty2026
FROM Sales2025 AS a
FULL OUTER JOIN Sales2026 AS b ON b.ProductID = a.ProductID;
```

---

# Sargable Rewrites

`NULL` functions around a column in `WHERE` prevent index seeks:

```sql
-- Not sargable
WHERE COALESCE(Status, 'New') = 'New'
WHERE ISNULL(DiscountPct, 0) = 0

-- Sargable equivalents
WHERE (Status = 'New' OR Status IS NULL)
WHERE (DiscountPct = 0 OR DiscountPct IS NULL)
```

And for optional search parameters, the classic "catch-all" query:

```sql
WHERE Country = COALESCE(@Country, Country)      -- also drops rows where Country IS NULL!
```

This hides a bug (`NULL = NULL` is unknown, so customers with no country disappear even when `@Country` is `NULL`) and usually produces a poor, one-size-fits-all plan. Prefer `(@Country IS NULL OR Country = @Country)` with statement-level recompilation, or build the predicate dynamically with parameters.

---

# Visual Representation

```text
COALESCE(a, b, c)            NULLIF(a, b)
   a ── NULL? ──no──▶ a         a = b ? ──yes──▶ NULL
        │yes                           │no
   b ── NULL? ──no──▶ b                 ▼
        │yes                            a
   c ──────────────▶ c (may be NULL)

a IS NOT DISTINCT FROM b:
   (1, 1) → true    (1, 2) → false    (1, NULL) → false    (NULL, NULL) → true
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN        ← outer joins create the NULLs that COALESCE often replaces
3. WHERE       ← COALESCE on a column here blocks index seeks
4. GROUP BY    ← GROUP BY COALESCE(Country, 'Unknown') groups NULLs under a label
5. HAVING      ← COALESCE(SUM(x), 0) makes empty groups compare as 0
6. WINDOW
7. SELECT      ← display replacements belong here
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
COALESCE(a, b, c)  → rewritten as CASE WHEN a IS NOT NULL THEN a
                                        WHEN b IS NOT NULL THEN b
                                        ELSE c END
NULLIF(a, b)       → CASE WHEN a = b THEN NULL ELSE a END
Evaluation: per row, left to right, stopping at the first match
```

Because `COALESCE` and `NULLIF` are `CASE` in disguise, everything in Section 12.10 about `CASE` evaluation applies to them.

---

# 🏗️ Architecture Insight

Decide what `NULL` means in each column—unknown, not applicable, not yet provided—and document it. Replacing `NULL` with `0` or `'N/A'` in storage destroys that information and breaks aggregates; replace it in the presentation layer instead. Sentinel values from legacy systems (`-1`, `'1900-01-01'`, `'N/A'`) should become real `NULL`s at the boundary, with `NULLIF`.

---

# ⚡ Performance Tip

Rewrite `COALESCE(col, x) = x` as `(col = x OR col IS NULL)` so an index on `col` can be used. On Oracle, prefer `COALESCE` to `NVL` when the second argument is expensive.

---

# 🔒 Security Note

Catch-all predicates such as `WHERE OwnerID = COALESCE(@OwnerID, OwnerID)` can turn a missing parameter into "all rows". If a bug or a malicious request omits `@OwnerID`, the query returns every owner's data. Require security-relevant parameters explicitly and never default them to "everything".

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `COALESCE` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `NULLIF` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Two-argument replacement | ❌ | ❌ | `IFNULL` | `ISNULL` | `NVL` | `IFNULL` |
| `NVL2` | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Null-safe equality | `IS NOT DISTINCT FROM` | ✅ | `<=>` | ✅ (2022+) | `DECODE` idiom | `IS`, ✅ (3.39+) |

> **Portability Tip:** Use `COALESCE`, `NULLIF` and `CASE` in shared code. They are standard, identical everywhere, and avoid the `ISNULL` name clash between SQL Server and MySQL.

---

# Common Mistakes

### Mistake 1

Using SQL Server `ISNULL` with a replacement longer than the first argument's type.

---

### Mistake 2

Porting `ISNULL(a, b)` to MySQL, where `ISNULL` takes one argument and returns 0 or 1.

---

### Mistake 3

Comparing with `<>` for change detection and missing changes to or from `NULL`.

---

### Mistake 4

`AVG(COALESCE(x, 0))` when "average of known values" was meant.

---

### Mistake 5

`WHERE col = COALESCE(@p, col)` dropping rows where `col` is `NULL`.

---

# Best Practices

✔ Prefer `COALESCE` over vendor two-argument functions.

✔ Guard divisions with `NULLIF(divisor, 0)`.

✔ Convert blanks and sentinels to `NULL` with `NULLIF` at load time.

✔ Use `IS DISTINCT FROM` (or the engine's equivalent) for change detection.

✔ Replace `NULL`s for display, not in storage.

---

# Interview Questions

## Basic

1. What does `COALESCE` return?
2. What does `NULLIF(5, 5)` return?
3. Why does `NULL = NULL` not return true?

## Intermediate

4. What is the difference between `COALESCE` and SQL Server's `ISNULL`?
5. What does `ISNULL(x)` do in MySQL?
6. How do you avoid division by zero with `NULLIF`?

## Advanced

7. Why can `COALESCE((SELECT …), 0)` run the subquery twice on SQL Server?
8. How do you write a null-safe comparison on PostgreSQL, MySQL and Oracle?
9. What is wrong with `WHERE Country = COALESCE(@Country, Country)`?

---

# Hands-on Exercises

## Exercise 1

List customers with their phone, falling back to email, falling back to `'no contact'`.

---

## Exercise 2

Show total spend per customer, including customers with no orders as 0.

---

## Exercise 3

Write an `UPDATE` that copies phone numbers from a staging table only where they changed, including changes to or from `NULL`.

---

## Exercise 4

Clean a legacy table where `-1` and `''` mean "unknown", converting both to `NULL`.

---

# Related Topics

- **12.10 — Conditional Expressions (CASE, IIF, GREATEST and LEAST)**
- **05.08 — NULL Handling in SELECT**
- **06.08 — NULL Handling in WHERE (Three-Valued Logic)**
- **07.12 — NULL Handling in JOINs**
- **08.04 — NULL Handling in Aggregates**

---

# Summary

`COALESCE` returns its first non-`NULL` argument and `NULLIF` returns `NULL` when two values are equal; both are standard, portable and implemented as `CASE`. Vendor functions add traps: SQL Server's `ISNULL` takes the first argument's type and can truncate, MySQL's `ISNULL` is a one-argument test, and Oracle's `NVL` always evaluates both arguments. Null-safe comparison uses `IS [NOT] DISTINCT FROM`, `<=>`, `IS` or a `DECODE` idiom and is essential for change detection. Place `COALESCE` deliberately around or inside aggregates, and rewrite `NULL`-function predicates into `OR … IS NULL` form to keep them sargable.
