---
title: "12.16 - Common Scalar Function Mistakes & Best Practices"
description: "A catalogue of scalar function mistakes with symptoms, causes and fixes: functions on indexed columns, byte versus character length, NULL in concatenation, integer division, LOG and ISNULL name clashes, CAST rounding versus truncation, FLOAT money, implicit conversion, unsafe conversion order, CASE WHEN NULL, GREATEST with NULLs, default collations, JSON text comparisons and per-row UDF queries, plus a review checklist."
chapter: 12
section: 12.16
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 35 min
lastUpdated: 2026-09-26
---

# 12.16 Common Scalar Function Mistakes & Best Practices

---

# Learning Objectives

After completing this section, you will be able to:

- Recognise the most common scalar function mistakes from their symptoms.
- Explain the cause of each mistake.
- Apply the standard fix for each.
- Review SQL for scalar function problems with a checklist.

---

# How Scalar Function Mistakes Show Up

| Symptom | Likely mistake |
|---------|----------------|
| Query scans a table that has an index on the filtered column | 1 function on an indexed column, or 8 implicit conversion |
| Valid non-English names rejected as "too long" | 2 byte length |
| Whole full name or address is `NULL` | 3 `NULL` in concatenation |
| Percentages are always 0 | 4 integer division |
| Log-scale values differ between engines | 5 `LOG` meaning |
| Replacement text cut to two characters, or `ISNULL` "needs one argument" | 6 `ISNULL` name clash |
| Amounts off by one unit after conversion | 7 `CAST` truncation |
| Totals off by a cent | 8 `FLOAT` money / 7 rounding |
| Conversion error on rows the `WHERE` should exclude | 9 unsafe conversion order |
| `'missing'` label never appears | 10 `CASE WHEN NULL` |
| Latest date is `NULL` on some engines | 11 `GREATEST` with `NULL`s |
| Login lookup fails after migration | 12 default collation |
| JSON number filter returns odd rows | 13 JSON compared as text |
| Query slow, plan shows a cheap Compute Scalar | 14 per-row UDF query |

---

# Mistake 1: Functions on Indexed Columns

```sql
-- ❌ Scans: the index on Email is sorted by Email, not LOWER(Email)
SELECT CustomerID FROM Customers WHERE LOWER(Email) = 'asha@example.com';

-- ✅ Store emails lower-case (enforced by a CHECK constraint) and compare plain values
SELECT CustomerID FROM Customers WHERE Email = LOWER('Asha@Example.com');

-- ✅ Or index the expression
CREATE INDEX ix_customers_email_lower ON Customers ((LOWER(Email)));
```

**Cause:** an index can seek only on its own key expression. **Fix:** rewrite, normalise on write, or index the expression (Section 12.15).

---

# Mistake 2: Byte Length Instead of Character Length

```sql
-- ❌ MySQL: LENGTH counts bytes — 'José Núñez' is 13, not 10
WHERE LENGTH(CustomerName) > 10

-- ✅
WHERE CHAR_LENGTH(CustomerName) > 10
```

**Cause:** `LENGTH` means bytes on MySQL (and `LEN` ignores trailing spaces on SQL Server). **Fix:** use the character-length function for user-facing limits (Section 12.02).

---

# Mistake 3: NULL in Concatenation

```sql
-- ❌ One NULL part makes the whole result NULL (and MySQL CONCAT does the same)
SELECT FirstName || ' ' || MiddleName || ' ' || LastName FROM People;

-- ✅ Skip NULL parts
SELECT CONCAT_WS(' ', FirstName, MiddleName, LastName) FROM People;
```

**Cause:** `NULL` in, `NULL` out. **Fix:** `CONCAT_WS`, or `COALESCE` each nullable part (Section 12.04).

---

# Mistake 4: Integer Division

```sql
-- ❌ PostgreSQL, SQL Server, SQLite: 0 whenever Shipped < Total
SELECT Shipped / Total * 100 AS Pct FROM Stats;

-- ✅
SELECT 100.0 * Shipped / NULLIF(Total, 0) AS Pct FROM Stats;
```

**Cause:** `INT / INT` is `INT` on several engines. **Fix:** start with a decimal literal and guard the divisor (Section 12.06).

---

# Mistake 5: LOG Means Different Things

```sql
-- ❌ 2 on PostgreSQL, 4.605 on SQL Server and MySQL
SELECT LOG(100);

-- ✅ Say what you mean
SELECT LN(100), LOG10(100);          -- SQL Server: LOG(100) for ln, LOG10(100)
```

**Cause:** vendor naming. **Fix:** use `LN` and `LOG10` explicitly.

---

# Mistake 6: ISNULL Name Clash and Truncation

```sql
-- ❌ SQL Server: result typed as VARCHAR(2) → 'UN'
DECLARE @Code VARCHAR(2) = NULL;
SELECT ISNULL(@Code, 'UNKNOWN');
-- ❌ MySQL: ISNULL takes one argument and returns 0/1

-- ✅ Everywhere
SELECT COALESCE(@Code, 'UNKNOWN');
```

**Cause:** vendor functions with the same name and different semantics. **Fix:** `COALESCE` (Section 12.09).

---

# Mistake 7: CAST Truncates on Some Engines

```sql
-- ❌ SQL Server and SQLite: 2; PostgreSQL, MySQL, Oracle: 3
SELECT CAST(2.9 AS INT);

-- ✅ State the rounding
SELECT CAST(ROUND(2.9, 0) AS INT);      -- 3 everywhere
SELECT CAST(FLOOR(2.9) AS INT);         -- 2 everywhere
```

**Cause:** implementation-defined conversion. **Fix:** round or floor explicitly (Section 12.07).

---

# Mistake 8: FLOAT Money and Implicit Conversion

```sql
-- ❌ FLOAT: ROUND(2.675, 2) = 2.67; SUMs drift by fractions of a cent
CREATE TABLE Payments (Amount FLOAT);

-- ✅
CREATE TABLE Payments (Amount DECIMAL(12,2));
```

```sql
-- ❌ VARCHAR column compared with a number: column converted per row, index lost
SELECT * FROM Customers WHERE Phone = 5550102030;

-- ✅ Compare with the column's type
SELECT * FROM Customers WHERE Phone = '5550102030';
```

**Cause:** binary floating point; data type precedence. **Fix:** `DECIMAL` for money, literals and parameters of the column's type (Sections 12.07, 12.08).

---

# Mistake 9: Unsafe Conversion Order

```sql
-- ❌ May fail: the CAST can be evaluated before (or without) the filter
SELECT CAST(RawQty AS INT) FROM Staging WHERE RawQty NOT LIKE '%[^0-9]%';

-- ✅
SELECT TRY_CAST(RawQty AS INT) FROM Staging;                                          -- SQL Server
SELECT CASE WHEN RawQty ~ '^[0-9]+$' THEN CAST(RawQty AS INT) END FROM Staging;      -- PostgreSQL
```

**Cause:** SQL does not guarantee evaluation order. **Fix:** `CASE` or safe conversion (Section 12.14).

---

# Mistake 10: CASE WHEN NULL

```sql
-- ❌ Never matches: NULL = NULL is unknown
CASE Phone WHEN NULL THEN 'missing' ELSE 'present' END

-- ✅
CASE WHEN Phone IS NULL THEN 'missing' ELSE 'present' END
```

**Cause:** simple `CASE` compares with `=`. **Fix:** searched `CASE` with `IS NULL` (Section 12.10).

---

# Mistake 11: GREATEST and LEAST With NULLs

```sql
-- ❌ MySQL, Oracle, SQLite: NULL if any argument is NULL; PostgreSQL, SQL Server: ignores NULLs
SELECT GREATEST(ShippedDate, InvoicedDate, PaidDate) FROM Orders;

-- ✅ Same result everywhere
SELECT GREATEST(COALESCE(ShippedDate, DATE '0001-01-01'),
                COALESCE(InvoicedDate, DATE '0001-01-01'),
                COALESCE(PaidDate, DATE '0001-01-01')) FROM Orders;
```

**Cause:** engines disagree. **Fix:** make `NULL` handling explicit.

---

# Mistake 12: Relying on the Default Collation

```sql
-- ❌ Works on SQL Server/MySQL (case-insensitive), fails on PostgreSQL/Oracle
SELECT * FROM Users WHERE UserName = 'Asha';

-- ✅ Explicit, portable, indexable
CREATE UNIQUE INDEX ux_users_name_lower ON Users ((LOWER(UserName)));
SELECT * FROM Users WHERE LOWER(UserName) = LOWER('Asha');
```

**Cause:** different default collations. **Fix:** decide case sensitivity per column and enforce it (Section 12.11).

---

# Mistake 13: Comparing JSON Values as Text

```sql
-- ❌ '1000' < '310' as text; and -> returns JSON with quotes
WHERE Attributes ->> 'weightGrams' > '500'
WHERE Attributes -> 'color' = 'red'

-- ✅
WHERE CAST(Attributes ->> 'weightGrams' AS INT) > 500
WHERE Attributes ->> 'color' = 'red'
```

**Cause:** extracted JSON scalars are text; `->` returns JSON. **Fix:** use `->>`/`JSON_VALUE` and cast numbers (Section 12.12).

---

# Mistake 14: A Query Inside a Scalar UDF

```sql
-- ❌ One SUM query per customer, hidden from the plan
SELECT CustomerID, dbo.CustomerTotal(CustomerID) FROM Customers;

-- ✅ One set-based query
SELECT c.CustomerID, COALESCE(SUM(o.TotalAmount), 0)
FROM Customers AS c LEFT JOIN Orders AS o ON o.CustomerID = c.CustomerID
GROUP BY c.CustomerID;
```

**Cause:** non-inlined functions run per row and are opaque to the optimizer. **Fix:** joins, views or inline table-valued functions (Section 12.13).

---

# Review Checklist

```text
Predicates
[ ] No function or arithmetic on an indexed column in WHERE / ON (or a matching expression index exists)
[ ] Literals and parameters have the column's exact type (no implicit conversion on the column side)
[ ] Functions on the constant side only

NULLs
[ ] Every nullable argument has deliberate NULL handling (COALESCE, CONCAT_WS, CASE … IS NULL)
[ ] Divisions guarded with NULLIF(divisor, 0)
[ ] Change detection uses IS DISTINCT FROM (or equivalent)

Types and numbers
[ ] Money and exact quantities in DECIMAL
[ ] Explicit ROUND / TRUNC / FLOOR instead of CAST to integer
[ ] Decimal division forced where ratios are computed
[ ] String casts have explicit lengths

Portability
[ ] No ISNULL, LOG(x), LENGTH, CONCAT-with-NULL assumptions across engines
[ ] Collation-dependent comparisons reviewed and tested with mixed case

Functions
[ ] Conversions of untrusted text use TRY_CAST / CASE guards
[ ] UDFs are pure, correctly declared, and do not query tables per row
[ ] Expensive functions run after filtering and LIMIT
```

---

# Visual Representation

```text
Scalar function mistakes by category

Performance ──── 1 function on indexed column · 8 implicit conversion · 14 per-row UDF
NULL handling ── 3 concatenation · 10 CASE WHEN NULL · 11 GREATEST
Numbers ──────── 4 integer division · 5 LOG · 7 CAST truncation · 8 FLOAT money
Portability ──── 2 LENGTH · 6 ISNULL · 12 collation
Robustness ───── 9 conversion order · 13 JSON as text
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN        ← mistakes 1, 8: functions and conversions on join keys
3. WHERE       ← mistakes 1, 8, 9: non-sargable predicates, unsafe conversion
4. GROUP BY    ← mistake 12: collation decides which values group together
5. HAVING
6. WINDOW
7. SELECT      ← mistakes 3, 4, 7, 10, 11: wrong values in output columns
8. DISTINCT
9. ORDER BY    ← formatted strings sort as text
10. LIMIT / FETCH / TOP   ← mistake 14: UDFs evaluated before LIMIT
```

---

# How the DBMS Executes This

```text
Most scalar mistakes are silent:
  wrong value       → no error, wrong result            (2, 3, 4, 5, 7, 8, 10, 11, 13)
  wrong plan        → correct result, slow               (1, 8, 14)
  sometimes error   → depends on plan or data            (6, 9, 12)
```

Silent mistakes are found by tests with edge-case data and by plan reviews—not by waiting for errors.

---

# 🔬 Engine Deep Dive

Several engines warn about some of these mistakes: SQL Server plans flag `CONVERT_IMPLICIT` that "may affect SeekPlan", MySQL returns warnings for truncated conversions (`SHOW WARNINGS`), and PostgreSQL rejects mismatched comparisons outright. Enable strict modes (`sql_mode` with `STRICT_TRANS_TABLES` in MySQL), read warnings in development, and treat plan warnings as defects.

---

# 🏗️ Architecture Insight

Many scalar mistakes vanish with better data at rest: canonical forms stored on write, correct types for numbers and dates, `NULL` instead of sentinels, and a documented collation. Invest in the boundary—staging, validation, constraints—and the queries downstream need fewer functions and make fewer mistakes.

---

# ⚡ Performance Tip

The performance mistakes (1, 8 and 14) account for most scalar-function slowdowns in production. Search your slowest queries' plans for filters on functions, implicit conversions and UDF calls before tuning anything else.

---

# 🔒 Security Note

Lenient comparisons (Mistake 8 on MySQL), catch-all `COALESCE` predicates and default collations all affect which rows match a security-relevant filter. Review access-control predicates with the same checklist: exact types, explicit `NULL` handling and explicit case rules.

---

# SQL Standard vs Vendor Differences

| Mistake | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|---------|------------|-------|------------|--------|--------|
| 2 `LENGTH` = bytes | ❌ | ✅ | `LEN` trims | ❌ | ❌ |
| 3 `CONCAT` with `NULL` → `NULL` | ❌ | ✅ | ❌ | ❌ | ❌ |
| 4 `INT / INT` truncates | ✅ | ❌ | ✅ | ❌ | ✅ |
| 5 `LOG(x)` natural | ❌ (base 10) | ✅ | ✅ | Needs base | ❌ (base 10) |
| 7 `CAST(2.9 AS INT)` truncates | ❌ | ❌ | ✅ | ❌ | ✅ |
| 11 `GREATEST` → `NULL` on any `NULL` | ❌ | ✅ | ❌ | ✅ | ✅ |
| 12 Default case-insensitive | ❌ | ✅ | ✅ | ❌ | ❌ |

> **Portability Tip:** Every ✅ in this table is a place where "it worked on my database" fails on another. Shared code should use the explicit forms from the fixes above.

---

# Common Mistakes

### Mistake 1

Fixing a symptom (adding an index) when the query should be rewritten.

---

### Mistake 2

Testing functions only with clean ASCII, non-`NULL`, positive data.

---

### Mistake 3

Ignoring engine warnings and plan warnings during development.

---

# Best Practices

✔ Keep indexed columns bare in predicates.

✔ Make `NULL` handling, rounding and conversion explicit.

✔ Prefer standard functions (`COALESCE`, `CHAR_LENGTH`, `LN`, `LOG10`, `CASE`) in shared code.

✔ Store canonical, correctly typed data.

✔ Test with `NULL`s, empty strings, negative numbers, non-ASCII text and mixed case.

✔ Review plans for filters on functions, implicit conversions and UDF calls.

---

# Interview Questions

## Basic

1. Why does `LOWER(Email) = …` often scan?
2. What is wrong with `FirstName || ' ' || MiddleName`?
3. Why can `Shipped / Total * 100` return 0?

## Intermediate

4. What goes wrong with `ISNULL` when porting between SQL Server and MySQL?
5. Why is `CAST(2.9 AS INT)` risky?
6. Why does `CASE Phone WHEN NULL` never match?

## Advanced

7. Why can a conversion fail on rows excluded by `WHERE`?
8. Which scalar mistakes are silent, and how do you catch them?
9. How do you find a per-row UDF query in an execution plan?

---

# Hands-on Exercises

## Exercise 1

Apply the review checklist to three queries from a real project and list the findings.

---

## Exercise 2

Write test data that exposes Mistakes 2, 3, 4 and 11, and show the wrong and corrected results.

---

## Exercise 3

Find a non-sargable predicate in a slow query, rewrite it, and compare plans.

---

## Exercise 4

Port a SQL Server query that uses `ISNULL`, `LEN`, `+` concatenation and `CHARINDEX` to PostgreSQL.

---

# Related Topics

- **12.15 — Scalar Function Performance and Index Strategy**
- **12.17 — Scalar Function Cheat Sheet & Visual Knowledge Map**
- **06.13 — Common WHERE Mistakes & Best Practices**
- **05.13 — Common SELECT Mistakes & Best Practices**
- **11.16 — Common Window Function Mistakes & Best Practices**

---

# Summary

Scalar function mistakes fall into five groups: performance (functions and implicit conversions on indexed columns, per-row UDF queries), `NULL` handling (concatenation, `CASE WHEN NULL`, `GREATEST`), numbers (integer division, `LOG`, `CAST` truncation, `FLOAT` money), portability (`LENGTH`, `ISNULL`, collation) and robustness (conversion order, JSON as text). Most are silent—wrong values or slow plans rather than errors—so they are caught by edge-case tests, engine warnings and plan reviews. The fixes share one principle: be explicit about types, `NULL`s, rounding and case, and keep indexed columns bare.
