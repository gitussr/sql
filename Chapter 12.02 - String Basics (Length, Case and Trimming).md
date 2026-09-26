---
title: "12.02 - String Basics (Length, Case and Trimming)"
description: "Core string functions: character and byte length, UPPER and LOWER, TRIM, LTRIM and RTRIM with custom characters, padding with LPAD and RPAD, REPEAT and REPLICATE, REVERSE, trailing spaces and CHAR padding, empty strings versus NULL, and vendor differences."
chapter: 12
section: 12.02
category: Data Query Language (DQL)
difficulty: Beginner
readingTime: 25 min
lastUpdated: 2026-09-26
---

# 12.02 String Basics (Length, Case and Trimming)

---

# Learning Objectives

After completing this section, you will be able to:

- Measure string length in characters and in bytes on each engine.
- Change case with `UPPER` and `LOWER` and know their limits.
- Remove spaces and other characters with `TRIM`, `LTRIM` and `RTRIM`.
- Pad values to a fixed width with `LPAD`, `RPAD` or their equivalents.
- Explain how trailing spaces and `CHAR` columns affect length and comparison.
- Distinguish empty strings from `NULL`, including Oracle's exception.

---

# Length: Characters or Bytes?

```sql
SELECT
    CustomerName,
    CHAR_LENGTH(CustomerName)   AS Chars,    -- standard: characters
    OCTET_LENGTH(CustomerName)  AS Bytes     -- standard: bytes
FROM Customers;
```

```text
┌──────────────┬───────┬───────┐
│ CustomerName │ Chars │ Bytes │     (UTF-8 storage)
├──────────────┼───────┼───────┤
│ Asha Rao     │ 8     │ 8     │
│ José Núñez   │ 10    │ 13    │     é, ú and ñ take 2 bytes each
│ 陈伟          │ 2     │ 6     │     each CJK character takes 3 bytes
└──────────────┴───────┴───────┘
```

The trap is that `LENGTH` means different things:

| Engine | Characters | Bytes |
|--------|------------|-------|
| PostgreSQL | `LENGTH`, `CHAR_LENGTH` | `OCTET_LENGTH` |
| MySQL | `CHAR_LENGTH` | **`LENGTH`**, `OCTET_LENGTH` |
| SQL Server | `LEN` (ignores trailing spaces) | `DATALENGTH` |
| Oracle | `LENGTH` | `LENGTHB` |
| SQLite | `LENGTH` (text) | `OCTET_LENGTH` (3.43+), `LENGTH(CAST(x AS BLOB))` |

On MySQL, `LENGTH('José')` is 5. Validating "name must be at most 50 characters" with `LENGTH` silently rejects valid non-English names.

---

# Trailing Spaces and LEN

SQL Server's `LEN` ignores trailing spaces; `DATALENGTH` does not:

```sql
-- SQL Server
SELECT LEN('abc   ')        AS LenResult,        -- 3
       DATALENGTH('abc   ') AS DataLengthResult; -- 6
```

Fixed-width `CHAR(n)` columns are padded with spaces to `n`. Most engines ignore trailing spaces when comparing `CHAR` values (and SQL Server ignores them for `VARCHAR` comparisons too), so `'abc' = 'abc   '` is often true. PostgreSQL strips trailing spaces when a `CHAR(n)` value is converted to text. Prefer `VARCHAR` unless the data really is fixed-width.

---

# UPPER and LOWER

```sql
SELECT UPPER(CustomerName) AS Upper,
       LOWER(Email)        AS Lower
FROM Customers;
```

- Both are standard and available everywhere.
- They are **locale-aware** in most engines, but map one character to one character: `UPPER('straße')` usually keeps the `ß` (`'STRAßE'`) instead of producing `'STRASSE'`, and Turkish dotted/dotless `i` needs a Turkish collation to round-trip.
- SQLite's built-in `upper`/`lower` change only ASCII letters unless the ICU extension is loaded.

Title case is not standard: PostgreSQL and Oracle have `INITCAP('asha rao')` → `'Asha Rao'`; MySQL, SQL Server and SQLite need an expression or a user-defined function.

```sql
-- Capitalise the first letter only (portable pattern)
UPPER(SUBSTRING(CustomerName FROM 1 FOR 1)) || LOWER(SUBSTRING(CustomerName FROM 2))
```

> Use `UPPER`/`LOWER` for display and normalisation, not for case-insensitive comparison on large tables—Section 12.11 shows collation-based and indexed alternatives.

---

# TRIM, LTRIM and RTRIM

```sql
TRIM(s)                               -- remove leading and trailing spaces
TRIM(LEADING  'x' FROM s)             -- standard: from the start
TRIM(TRAILING 'x' FROM s)             -- standard: from the end
TRIM(BOTH     'x' FROM s)             -- standard: both ends (default)
LTRIM(s)  /  RTRIM(s)                 -- common: left / right spaces
```

```sql
SELECT
    TRIM('   Asha  ')                  AS a,   -- 'Asha'
    TRIM(LEADING '0' FROM '000123')    AS b,   -- '123'
    TRIM(BOTH '-' FROM '--SKU-42--')   AS c,   -- 'SKU-42'
    RTRIM('Phone:   ')                 AS d;   -- 'Phone:'
```

Differences:

| Engine | `TRIM(s)` | Custom characters |
|--------|-----------|-------------------|
| PostgreSQL | ✅ | `TRIM(BOTH 'xy' FROM s)` removes any of the set; `BTRIM`, `LTRIM(s, 'xy')` |
| MySQL | ✅ | Removes a whole **substring**, not a set: `TRIM(BOTH 'xy' FROM 'xyxyAxy')` → `'A'` |
| SQL Server | ✅ (2017+) | `TRIM('xy' FROM s)` (2017+), `LEADING`/`TRAILING` and `LTRIM(s, chars)` (2022+) |
| Oracle | ✅ | `TRIM` accepts one character; `LTRIM(s, 'xy')` / `RTRIM(s, 'xy')` accept a set |
| SQLite | ✅ | `trim(s, 'xy')`, `ltrim`, `rtrim` accept a set |

`TRIM` removes only spaces by default—not tabs, newlines or non-breaking spaces (U+00A0). Data pasted from web forms often contains them:

```sql
-- PostgreSQL: remove spaces, tabs, CR and LF
TRIM(BOTH E' \t\r\n' FROM Phone)
-- Everywhere: replace specific characters first, then trim
TRIM(REPLACE(REPLACE(Phone, CHAR(9), ' '), CHAR(13), ' '))   -- SQL Server / MySQL use CHAR(n); PostgreSQL / Oracle use CHR(n)
```

---

# Padding

```sql
-- PostgreSQL, MySQL, Oracle
SELECT LPAD(CAST(OrderID AS VARCHAR(10)), 8, '0') AS OrderCode,   -- '00000101'
       RPAD(Status, 12, '.')                      AS Dotted        -- 'Shipped.....'
FROM Orders;
```

`LPAD(s, n, fill)` pads on the left to length `n`; if `s` is longer than `n`, it is **truncated** to `n` characters—so `LPAD('123456', 4, '0')` returns `'1234'`.

SQL Server and SQLite have no `LPAD`:

```sql
-- SQL Server
SELECT RIGHT(REPLICATE('0', 8) + CAST(OrderID AS VARCHAR(10)), 8) AS OrderCode FROM Orders;
-- SQL Server 2012+ alternative (slower): FORMAT(OrderID, 'D8')

-- SQLite
SELECT printf('%08d', OrderID) AS OrderCode FROM Orders;
```

---

# REPEAT, REPLICATE and REVERSE

```sql
REPEAT('ab', 3)       -- 'ababab'   PostgreSQL, MySQL
REPLICATE('ab', 3)    -- 'ababab'   SQL Server
RPAD('ab', 6, 'ab')   -- 'ababab'   Oracle (no REPEAT; RPAD('', …) fails because '' is NULL)

REVERSE('abc')        -- 'cba'      PostgreSQL, MySQL, SQL Server (Oracle: undocumented; SQLite: none)
```

These are mainly used for building masks, separators and test data.

---

# Empty String vs NULL

```sql
SELECT
    CASE WHEN '' IS NULL THEN 'NULL' ELSE 'empty string' END AS What;
```

- PostgreSQL, MySQL, SQL Server, SQLite: `'empty string'`.
- **Oracle: `'NULL'`**. Oracle treats a zero-length `VARCHAR2` as `NULL`, so `LENGTH('')` is `NULL`, not 0, and `TRIM('   ')` returns `NULL`.

Portable code should treat both as "no value" where that is the meaning:

```sql
WHERE NULLIF(TRIM(Phone), '') IS NULL      -- missing, empty or blank phone, on any engine
```

---

# Visual Representation

```text
'  José Núñez  '
   │
   ├─ TRIM ───────────────▶ 'José Núñez'
   ├─ CHAR_LENGTH(TRIM) ──▶ 10 characters
   ├─ OCTET_LENGTH(TRIM) ─▶ 13 bytes (UTF-8)
   ├─ UPPER(TRIM) ────────▶ 'JOSÉ NÚÑEZ'
   └─ LPAD(TRIM, 14, '*') ▶ '****José Núñez'
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← TRIM/UPPER on a column here is evaluated for every examined row
4. GROUP BY    ← GROUP BY UPPER(TRIM(Country)) merges 'uk', 'UK ' and ' Uk'
5. HAVING
6. WINDOW
7. SELECT      ← display formatting belongs here
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

Grouping by a normalised expression is a quick fix for dirty data; normalising on write is the lasting one.

---

# How the DBMS Executes This

```text
CHAR_LENGTH on UTF-8 text:  walk the bytes, count lead bytes   → O(length)
OCTET_LENGTH:               read the stored length header      → O(1)
UPPER / LOWER:              per-character mapping via collation or ICU tables
TRIM:                       scan from each end, return a slice (often without copying)
```

Character length on variable-width encodings is linear in the string length; byte length is constant time. For very long text, prefer byte-length checks when bytes are what matter (storage limits, protocol limits).

---

# 🏗️ Architecture Insight

Decide where normalisation happens and enforce it. A `CHECK (Email = LOWER(TRIM(Email)))` or a trigger that cleans values on insert keeps every downstream query and index simple. Leaving normalisation to readers means every report re-implements it slightly differently.

---

# ⚡ Performance Tip

`WHERE TRIM(Code) = 'A1'` cannot use a plain index on `Code`. Clean the data once (`UPDATE … SET Code = TRIM(Code)`) and add a constraint, or index the expression.

---

# 🔒 Security Note

Length limits enforced in the database must match the ones in the application. If the application checks 50 **characters** and the database column holds 50 **bytes** (SQL Server `VARCHAR(n)` and Oracle `VARCHAR2(n)` with default byte semantics count bytes; MySQL and PostgreSQL count characters), multi-byte input can be truncated or rejected unexpectedly—a source of data corruption and of inconsistent validation that attackers can probe.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Character length | `CHAR_LENGTH` | ✅ + `LENGTH` | ✅ | `LEN` | `LENGTH` | `LENGTH` |
| Byte length | `OCTET_LENGTH` | ✅ | ✅ + `LENGTH` | `DATALENGTH` | `LENGTHB` | ✅ (3.43+) |
| `TRIM(… FROM …)` | ✅ | ✅ | ✅ | ✅ (2017+, `LEADING`/`TRAILING` 2022+) | ✅ (one character) | `trim(s, chars)` |
| `LPAD` / `RPAD` | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ |
| `INITCAP` | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ |
| `''` is `NULL` | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |

> **Portability Tip:** `UPPER`, `LOWER`, `TRIM(s)`, `LTRIM(s)` and `RTRIM(s)` are safe everywhere. Always check which length function counts characters on your engine.

---

# Common Mistakes

### Mistake 1

Using MySQL `LENGTH` (bytes) to validate a character limit.

---

### Mistake 2

Expecting `TRIM` to remove tabs, newlines or non-breaking spaces.

---

### Mistake 3

Assuming `LPAD` never shortens its input.

---

### Mistake 4

Testing `Col = ''` on Oracle, where it is never true.

---

### Mistake 5

Comparing case-insensitively with `UPPER(col) = UPPER(@x)` on a large indexed table.

---

# Best Practices

✔ Use the character-length function for user-facing limits and the byte-length one for storage limits.

✔ Normalise whitespace and case on write.

✔ Treat `NULLIF(TRIM(x), '')` as the portable "blank" test.

✔ Prefer `VARCHAR` over `CHAR` unless values are truly fixed-width.

✔ Use collations, not `UPPER`/`LOWER`, for case-insensitive search at scale.

---

# Interview Questions

## Basic

1. What does `TRIM` do?
2. What is the difference between `CHAR_LENGTH` and `OCTET_LENGTH`?
3. What does `UPPER(NULL)` return?

## Intermediate

4. Why can `LENGTH('José')` return 5?
5. How do you left-pad a number with zeros on SQL Server?
6. How does Oracle treat empty strings?

## Advanced

7. Why does `LEN('abc  ')` return 3 on SQL Server?
8. How does MySQL's `TRIM(BOTH 'xy' FROM s)` differ from PostgreSQL's?
9. Why are `UPPER`/`LOWER` locale-dependent, and what does that mean for indexing?

---

# Hands-on Exercises

## Exercise 1

List customers whose name is longer than 20 characters, correctly for multi-byte names.

---

## Exercise 2

Produce 8-digit zero-padded order codes on PostgreSQL and on SQL Server.

---

## Exercise 3

Find customers whose phone is missing, empty or only spaces, portably.

---

## Exercise 4

Write an `UPDATE` that trims and lower-cases every email that needs it, touching no other rows.

---

# Related Topics

- **12.03 — Substrings, Searching and Replacing**
- **12.04 — Concatenation and String Formatting**
- **12.11 — Collation, Case Sensitivity and Unicode**
- **05.08 — NULL Handling in SELECT**
- **06.09 — Filtering with Expressions and Functions**

---

# Summary

String basics are measuring, changing case, trimming and padding. Length is the biggest trap: some engines count characters and others bytes under the same name, and SQL Server's `LEN` ignores trailing spaces. `UPPER` and `LOWER` are locale-aware and best used for display and normalisation. `TRIM` removes spaces by default, with custom-character forms that differ by engine, and `LPAD` truncates long input. Oracle treats empty strings as `NULL`, so `NULLIF(TRIM(x), '') IS NULL` is the portable blank test. Normalising text on write keeps queries and indexes simple.
