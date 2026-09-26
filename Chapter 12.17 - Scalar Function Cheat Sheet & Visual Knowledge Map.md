---
title: "12.17 - Scalar Function Cheat Sheet & Visual Knowledge Map"
description: "A one-stop reference for Chapter 12: string, pattern, numeric, rounding, conversion, NULL, conditional, collation and JSON functions with their spellings on PostgreSQL, MySQL, SQL Server, Oracle and SQLite; NULL rules; sargability rewrites; user-defined function rules; execution and indexing rules; and a knowledge map linking scalar functions to earlier and later chapters."
chapter: 12
section: 12.17
category: Data Query Language (DQL)
difficulty: Beginner → Advanced
readingTime: 25 min
lastUpdated: 2026-09-26
---

# 12.17 Scalar Function Cheat Sheet & Visual Knowledge Map

---

# Learning Objectives

After completing this section, you will be able to:

- Look up the spelling of common scalar functions on each major engine.
- Recall the `NULL`, rounding and conversion rules in one place.
- Apply the sargability rewrites and indexing rules quickly.
- See how scalar functions connect to the rest of the handbook.

---

# String Functions

| Task | Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|------|----------|------------|-------|------------|--------|--------|
| Characters | `CHAR_LENGTH(s)` | `LENGTH(s)` | `CHAR_LENGTH(s)` | `LEN(s)` | `LENGTH(s)` | `length(s)` |
| Bytes | `OCTET_LENGTH(s)` | `OCTET_LENGTH(s)` | `LENGTH(s)` | `DATALENGTH(s)` | `LENGTHB(s)` | `octet_length(s)` |
| Case | `UPPER`, `LOWER` | + `INITCAP` | ✅ | ✅ | + `INITCAP` | ASCII only |
| Trim | `TRIM(BOTH c FROM s)` | ✅ + `BTRIM` | ✅ (substring) | `TRIM` (2017+) | `TRIM` (1 char) | `trim(s, c)` |
| Pad | — | `LPAD`/`RPAD` | `LPAD`/`RPAD` | `RIGHT(REPLICATE(…)+s, n)` | `LPAD`/`RPAD` | `printf('%05d', n)` |
| Substring | `SUBSTRING(s FROM i FOR n)` | ✅ | ✅ | `SUBSTRING(s, i, n)` | `SUBSTR(s, i, n)` | `substr(s, i, n)` |
| Left/right | — | `LEFT`, `RIGHT` | `LEFT`, `RIGHT` | `LEFT`, `RIGHT` | `SUBSTR(s, -n)` | `substr(s, -n)` |
| Find | `POSITION(x IN s)` | + `STRPOS(s, x)` | `LOCATE(x, s)` | `CHARINDEX(x, s)` | `INSTR(s, x)` | `instr(s, x)` |
| Replace | — | `REPLACE` | `REPLACE` | `REPLACE` | `REPLACE` | `replace` |
| Char map | — | `TRANSLATE` | ❌ | `TRANSLATE` (2017+) | `TRANSLATE` | ❌ |
| Split part | — | `SPLIT_PART` | `SUBSTRING_INDEX` | `STRING_SPLIT` (table) | `REGEXP_SUBSTR` | ❌ |
| Concatenate | `\|\|` | `\|\|`, `CONCAT` | `CONCAT` | `+`, `CONCAT` | `\|\|` | `\|\|`, `concat` (3.44+) |
| With separator | — | `CONCAT_WS` | `CONCAT_WS` | `CONCAT_WS` (2017+) | ❌ | `concat_ws` (3.44+) |
| Format number | — | `TO_CHAR(n, 'FM9,999.00')` | `FORMAT(n, 2)` | `FORMAT(n, 'N2')` | `TO_CHAR` | `printf('%.2f', n)` |

Positions are 1-based; "not found" is 0.

---

# Pattern Functions

| Task | PostgreSQL | MySQL 8.0+ | SQL Server 2025+ | Oracle |
|------|------------|------------|------------------|--------|
| Test | `s ~ p`, `s ~* p`, `REGEXP_LIKE` (15+) | `REGEXP_LIKE`, `REGEXP` | `REGEXP_LIKE` | `REGEXP_LIKE` |
| Extract | `SUBSTRING(s FROM p)`, `REGEXP_SUBSTR` (15+) | `REGEXP_SUBSTR` | `REGEXP_SUBSTR` | `REGEXP_SUBSTR` |
| Replace | `REGEXP_REPLACE(s, p, r, 'g')` | `REGEXP_REPLACE` (all) | `REGEXP_REPLACE` (all) | `REGEXP_REPLACE` (all) |
| Count | `REGEXP_COUNT` (15+) | ❌ | `REGEXP_COUNT` | `REGEXP_COUNT` |

Anchor validation patterns with `^…$`. Only PostgreSQL trigram indexes accelerate regular expressions.

---

# Numeric and Rounding Functions

| Task | Portable form | Watch out |
|------|---------------|-----------|
| Absolute, sign | `ABS(x)`, `SIGN(x)` | — |
| Remainder | `MOD(a, n)` / `a % n` | SQL Server: `%` only; Oracle: `MOD` only; sign follows the dividend |
| Powers, roots | `POWER(x, y)`, `SQRT(x)`, `EXP(x)` | — |
| Logs | `LN(x)`, `LOG10(x)` | `LOG(x)`: base 10 on PostgreSQL/SQLite, natural on MySQL/SQL Server |
| Up / down | `CEILING(x)`, `FLOOR(x)` | Oracle: `CEIL` |
| Round | `ROUND(x, d)` | `DECIMAL`: half away from zero; `FLOAT`: often half to even |
| Truncate | `TRUNC(x, d)` | MySQL `TRUNCATE`; SQL Server `ROUND(x, d, 1)` |
| Decimal division | `1.0 * a / b` | `INT / INT` truncates on PostgreSQL, SQL Server, SQLite |
| Safe division | `a / NULLIF(b, 0)` | Division by zero errors on most engines |
| Random | `RANDOM()` / `RAND()` | SQL Server `RAND()` is once per query |

---

# Conversion

| Task | Form |
|------|------|
| Portable | `CAST(x AS type)` (MySQL: `SIGNED`, `CHAR`) |
| PostgreSQL shorthand | `x::type` |
| SQL Server with style | `CONVERT(type, x, style)` |
| Oracle with format | `TO_NUMBER(s, fmt)`, `TO_CHAR(x, fmt)` |
| Safe | SQL Server `TRY_CAST`; Oracle `CAST(x AS t DEFAULT NULL ON CONVERSION ERROR)`; PostgreSQL 16+ `pg_input_is_valid` |
| To integer | Write `ROUND`/`FLOOR` explicitly: `CAST` rounds on PostgreSQL/MySQL/Oracle, truncates on SQL Server/SQLite |

Rule: literals, parameters and join keys must have the **column's** type.

---

# NULL and Conditional Functions

```text
COALESCE(a, b, …)            first non-NULL                         portable
NULLIF(a, b)                 NULL if a = b                          portable
ISNULL(a, b)                 SQL Server; type of a (truncates)      avoid in shared code
IFNULL(a, b)                 MySQL, SQLite
NVL(a, b) / NVL2(a, x, y)    Oracle; NVL evaluates both arguments
ISNULL(a)                    MySQL: 1/0 test                        name clash!
a IS [NOT] DISTINCT FROM b   PostgreSQL, SQL Server 2022+, SQLite 3.39+; MySQL <=>; SQLite IS

CASE WHEN c THEN r … ELSE d END      searched; first true wins; no ELSE → NULL
CASE x WHEN v THEN r … END           simple; WHEN NULL never matches
IIF(c, a, b) / IF(c, a, b)           SQL Server, SQLite / MySQL
DECODE(x, v1, r1, …, d)              Oracle; NULL matches NULL
GREATEST / LEAST                     NULLs ignored: PostgreSQL, SQL Server 2022+
                                     NULL if any NULL: MySQL, Oracle, SQLite max()/min()
```

---

# Collation and JSON

```text
COLLATION
  Default case-insensitive: SQL Server, MySQL     case-sensitive: PostgreSQL, Oracle, SQLite
  Override per expression:  s COLLATE name        (usually defeats the column's index)
  Case-insensitive + index: store lower-case, or index LOWER(col), or CI column collation
  Unicode:                  MySQL utf8mb4 · SQL Server NVARCHAR + N'…' · normalise on input

JSON
  Scalar:     JSON_VALUE(doc, '$.a')   ·  doc ->> 'a' (PostgreSQL)  ·  doc ->> '$.a' (MySQL, SQLite)
  Fragment:   JSON_QUERY(doc, '$.a')   ·  doc -> 'a'
  Exists:     JSON_EXISTS · ? (jsonb) · JSON_CONTAINS_PATH (MySQL)
  Build:      JSON_OBJECT · JSON_ARRAYAGG · json_build_object · FOR JSON PATH
  To rows:    JSON_TABLE · jsonb_array_elements · OPENJSON · json_each
  Index:      expression / generated column on one path · GIN (PostgreSQL) · multi-valued (MySQL)
  Missing key → NULL (lax) · cast extracted numbers before comparing
```

---

# Sargability Rewrites

```text
Price * 1.18 > 118                  →  Price > 118 / 1.18
ROUND(Price, 0) = 100               →  Price >= 99.5 AND Price < 100.5
LEFT(Code, 3) = 'ABC'               →  Code LIKE 'ABC%'
COALESCE(Status, 'New') = 'New'     →  Status = 'New' OR Status IS NULL
CAST(Phone AS BIGINT) = 5550102030  →  Phone = '5550102030'
First || ' ' || Last = 'Asha Rao'   →  First = 'Asha' AND Last = 'Rao'
YEAR(OrderDate) = 2026              →  OrderDate >= '2026-01-01' AND OrderDate < '2027-01-01'
LOWER(Email) = 'x'                  →  normalise on write, or expression index on LOWER(Email)
```

---

# User-Defined Functions

```text
Keep them pure: arguments in, value out — no table access
Declare the strongest TRUE volatility: IMMUTABLE / DETERMINISTIC only if it never changes
Inlined (cheap):      PostgreSQL LANGUAGE sql · SQL Server 2019+ inlineable UDFs · Oracle SQL macros
Not inlined (opaque): PL/pgSQL · MySQL · Oracle PL/SQL (use PRAGMA UDF) · non-inlineable T-SQL
Data access per row → rewrite as JOIN, view or inline table-valued function
Definer rights       → fixed search_path, schema-qualified names, narrow EXECUTE grants
```

---

# Execution and Performance

```text
Bind      overloads chosen, implicit casts inserted (CONVERT_IMPLICIT)
Fold      constant expressions computed once at plan time
Place     index condition (bare column / matching expression) · filter · join · projection
Execute   per row at the operator; SELECT-list functions after filtering
Order     predicate evaluation order is NOT guaranteed → use CASE or TRY_ functions
Estimate  function predicates are guessed → expression index / extended statistics
Index     expression index · indexed generated/computed column · must be deterministic
Cost      expression indexes are recomputed on every write
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← table functions: JSON_TABLE, OPENJSON, STRING_SPLIT
2. JOIN        ← functions on join keys: no index nested loop without an expression index
3. WHERE       ← functions on columns: scan; on constants: folded, sargable
4. GROUP BY    ← grouping by an expression; collation decides equality
5. HAVING      ← COALESCE(SUM(x), 0)
6. WINDOW
7. SELECT      ← formatting, labels, CASE, JSON building
8. DISTINCT    ← collation decides duplicates
9. ORDER BY    ← CASE for custom order; formatted strings sort as text
10. LIMIT / FETCH / TOP   ← run expensive functions after this, in an outer query
```

---

# How the DBMS Executes This

```text
WHERE LOWER(Email) = LOWER(:x)
        │                 │
        │                 └─ constant side: evaluated once
        └─ column side ──┬─ index on LOWER(Email)?  yes → Index Seek
                         └─ no → Scan, evaluate LOWER per row, Filter
SELECT UPPER(Name) ...  → Projection: evaluated per output row
```

---

# Visual Knowledge Map

```text
                              SCALAR FUNCTIONS (Chapter 12)
                     one row in → one value out · NULL in → NULL out
                                         │
   ┌────────────┬────────────┬───────────┼────────────┬─────────────┬──────────────┐
   ▼            ▼            ▼           ▼            ▼             ▼              ▼
 STRINGS     PATTERNS     NUMBERS    CONVERSION     NULL &       COLLATION        JSON
 12.02–12.04   12.05     12.06–12.07    12.08     CONDITIONAL      12.11          12.12
 length, case regex      arithmetic   CAST,       12.09–12.10    case, accent,   path, extract,
 trim, pad,   test,      MOD, LOG,    TRY_CAST,   COALESCE,      sort order,     build, shred,
 substring,   extract,   ROUND,       implicit    NULLIF, CASE,  Unicode         index
 concat       replace    TRUNC        conversion  GREATEST
   └────────────┴────────────┴───────────┬────────────┴─────────────┴──────────────┘
                                         ▼
                USER-DEFINED FUNCTIONS 12.13 ── pure · declared volatility · inlining
                                         ▼
                EXECUTION 12.14 ── bind · fold · place · per-row · order not guaranteed
                                         ▼
                PERFORMANCE 12.15 ── sargability · expression indexes · generated columns
                                         ▼
                MISTAKES 12.16 ── performance · NULLs · numbers · portability · robustness

Connections to other chapters
  05.06 Expressions & Calculated Columns ──→ 12.01 (functions inside expressions)
  05.08 NULL Handling in SELECT          ──→ 12.09
  06.07 LIKE and Pattern Matching        ──→ 12.03, 12.05
  06.09 Filtering with Expressions       ──→ 12.15
  06.12 SARGability                      ──→ 12.15
  08.04 NULL in aggregates               ──→ 12.09 (COALESCE around/inside aggregates)
  08.10 Conditional aggregation          ──→ 12.10 (CASE inside aggregates)
  09.10 LATERAL and CROSS APPLY          ──→ 12.12 (JSON_TABLE, OPENJSON), 12.13 (inline TVFs)
  10.10 Partial and expression indexes   ──→ 12.15
  11.xx Window functions                 ──→ 12.07 (allocating remainders)
  12.xx Scalar Functions                 ──→ 13.xx Date and Time Functions, 15.xx Query Optimization
```

---

# One-Page Summary

```text
CONCEPTS
  A scalar function maps one row's values to one value; row count never changes
  Almost every function returns NULL for a NULL argument — except the NULL functions
  Scalar functions are the least portable part of SQL: names, argument order, NULL and type rules differ

RULES
  CHAR_LENGTH for characters; CONCAT_WS for optional parts; COALESCE / NULLIF for NULLs
  1.0 * a / NULLIF(b, 0) for ratios; LN and LOG10, never bare LOG
  DECIMAL for money; ROUND once, allocate remainders; explicit ROUND/FLOOR before CAST to INT
  CAST explicitly; TRY_CAST or CASE for untrusted text; match the column's type
  Searched CASE with IS NULL; COALESCE arguments to GREATEST / LEAST
  Decide collation per column; normalise case and Unicode on write
  JSON: ->> / JSON_VALUE for scalars, cast numbers, index the exact expression
  UDFs: pure, correctly declared, no per-row queries
  Keep indexed columns bare; rewrite, normalise on write, or index the expression
```

---

# 🏗️ Architecture Insight

The chapter reduces to one idea: *transform once, at the right place*. Normalisation belongs at write time, formatting at presentation time, conversion at the system boundary, and business calculations in pure, shared functions. Queries that re-derive the same values with functions on every read are slower, less portable and more error-prone than queries over data that already has the right form.

---

# ⚡ Performance Tip

If you remember one performance rule from this chapter: a function on the column side of a predicate costs a scan; a function on the constant side costs nothing. Rewrite, normalise on write, or index the exact expression.

---

# 💡 Did You Know?

`COALESCE` comes from the verb "to coalesce"—to come together into one—and was chosen by the SQL-92 committee for a function that merges several possibly-missing values into one. Before it was standardised, every vendor had already shipped its own two-argument version, which is why `ISNULL`, `NVL` and `IFNULL` still exist alongside it.

---

# Related Topics

- **12.01 — Introduction to Scalar Functions**
- **12.09 — NULL Functions (COALESCE, NULLIF, ISNULL and NVL)**
- **12.15 — Scalar Function Performance and Index Strategy**
- **12.16 — Common Scalar Function Mistakes & Best Practices**
- **11.17 — Window Function Cheat Sheet & Visual Knowledge Map**
- **10.17 — Index Cheat Sheet & Visual Knowledge Map**
- **06.14 — WHERE Cheat Sheet & Visual Knowledge Map**
- **13.xx — Date and Time Functions**

---

# Summary

This section condenses Chapter 12 into a single reference: string, pattern, numeric, rounding, conversion, `NULL`, conditional, collation and JSON functions with their spellings across PostgreSQL, MySQL, SQL Server, Oracle and SQLite; the `NULL`, rounding and conversion rules that differ between engines; the sargability rewrites and expression-indexing options; rules for user-defined functions; and the execution model of binding, folding, placement and per-row evaluation. One idea carries the whole chapter—transform once, at the right place—and the knowledge map shows how scalar functions build on expressions, filtering, aggregation and indexing from earlier chapters.
