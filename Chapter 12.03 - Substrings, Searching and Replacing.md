---
title: "12.03 - Substrings, Searching and Replacing"
description: "Extracting and changing parts of strings: SUBSTRING and SUBSTR, LEFT and RIGHT, finding text with POSITION, STRPOS, CHARINDEX, INSTR and LOCATE, splitting on delimiters with SPLIT_PART and SUBSTRING_INDEX, REPLACE and TRANSLATE, masking values, and vendor differences in argument order and indexing."
chapter: 12
section: 12.03
category: Data Query Language (DQL)
difficulty: Beginner → Intermediate
readingTime: 30 min
lastUpdated: 2026-09-26
---

# 12.03 Substrings, Searching and Replacing

---

# Learning Objectives

After completing this section, you will be able to:

- Extract part of a string with `SUBSTRING`, `LEFT` and `RIGHT`.
- Find the position of text within a string on each engine.
- Split a delimited value into parts.
- Replace substrings with `REPLACE` and single characters with `TRANSLATE`.
- Mask sensitive values for display.
- Avoid off-by-one and argument-order mistakes between dialects.

---

# SUBSTRING

```sql
SUBSTRING(s FROM start [FOR length])   -- SQL standard
SUBSTRING(s, start [, length])          -- PostgreSQL, MySQL, SQL Server (length required on SQL Server)
SUBSTR(s, start [, length])             -- Oracle, SQLite, PostgreSQL, MySQL
```

Positions are **1-based**: the first character is position 1.

```sql
SELECT
    Email,
    SUBSTRING(Email FROM 1 FOR 4) AS First4,       -- 'asha'
    SUBSTRING(Email FROM 6)       AS From6th       -- 'example.com'
FROM Customers
WHERE CustomerID = 1;                              -- Email = 'asha@example.com'
```

Edge cases worth knowing:

| Call | Result | Notes |
|------|--------|-------|
| `SUBSTRING('abcdef' FROM 3 FOR 2)` | `'cd'` | |
| `SUBSTRING('abc' FROM 2 FOR 100)` | `'bc'` | Length beyond the end is fine |
| `SUBSTRING('abc' FROM 10)` | `''` | Start beyond the end gives an empty string (Oracle: `NULL`) |
| `SUBSTRING('abcdef' FROM 0 FOR 3)` | `'ab'` | PostgreSQL/SQL Server count position 0 as "before the start" |
| `SUBSTR('abcdef', -3)` | `'def'` | Oracle, MySQL, SQLite: negative start counts from the end; not PostgreSQL or SQL Server |

---

# LEFT and RIGHT

```sql
LEFT(s, n)     -- first n characters
RIGHT(s, n)    -- last n characters
```

```sql
SELECT
    LEFT(Phone, 3)          AS Prefix,
    RIGHT(Phone, 4)         AS Last4
FROM Customers;
```

Available in PostgreSQL, MySQL and SQL Server. Oracle and SQLite use `SUBSTR(s, 1, n)` and `SUBSTR(s, -n)`.

---

# Finding Text

"At which position does `@` appear?" has five spellings:

```sql
POSITION('@' IN Email)      -- standard; PostgreSQL, MySQL
STRPOS(Email, '@')          -- PostgreSQL
LOCATE('@', Email)          -- MySQL      (needle first)
CHARINDEX('@', Email)       -- SQL Server (needle first)
INSTR(Email, '@')           -- Oracle, MySQL, SQLite (haystack first)
```

All return the 1-based position of the **first** occurrence, or **0** if not found (and `NULL` if either argument is `NULL`).

Extra arguments:

```sql
CHARINDEX('.', Email, 6)          -- SQL Server: start searching at position 6
LOCATE('.', Email, 6)             -- MySQL: same
INSTR(Email, '.', 1, 2)           -- Oracle: 2nd occurrence, searching from position 1
INSTR(Email, '.', -1)             -- Oracle: search backwards from the end (last '.')
```

### Extracting the domain of an email

```sql
-- Standard / PostgreSQL / MySQL
SELECT SUBSTRING(Email FROM POSITION('@' IN Email) + 1) AS Domain FROM Customers;

-- SQL Server
SELECT SUBSTRING(Email, CHARINDEX('@', Email) + 1, LEN(Email)) AS Domain FROM Customers;

-- Oracle / SQLite
SELECT SUBSTR(Email, INSTR(Email, '@') + 1) AS Domain FROM Customers;
```

If `@` is missing, the position is 0, so these return the whole string—guard with `CASE WHEN POSITION('@' IN Email) > 0 …` when data may be dirty.

### Testing for containment

```sql
WHERE POSITION('@' IN Email) > 0      -- contains '@'
WHERE Email LIKE '%@%'                -- equivalent, and more readable (Section 06.07)
```

---

# Splitting Delimited Values

```sql
-- PostgreSQL: SPLIT_PART(s, delimiter, n)
SELECT SPLIT_PART('red|green|blue', '|', 2);              -- 'green'

-- MySQL: SUBSTRING_INDEX(s, delimiter, count)
SELECT SUBSTRING_INDEX('red|green|blue', '|', 2);          -- 'red|green'  (everything before the 2nd '|')
SELECT SUBSTRING_INDEX(SUBSTRING_INDEX('red|green|blue', '|', 2), '|', -1);  -- 'green'

-- SQL Server 2016+: STRING_SPLIT returns a table, not a scalar
SELECT value FROM STRING_SPLIT('red|green|blue', '|');
-- SQL Server 2022+: ordinal column for position
SELECT value FROM STRING_SPLIT('red|green|blue', '|', 1) WHERE ordinal = 2;

-- Oracle: REGEXP_SUBSTR (Section 12.05)
SELECT REGEXP_SUBSTR('red|green|blue', '[^|]+', 1, 2) FROM dual;   -- 'green'
```

> A column that needs splitting usually violates first normal form. Splitting is fine for importing and cleaning data; if queries split the same column every day, model the parts as rows in a child table.

---

# REPLACE

```sql
REPLACE(s, find, replacement)     -- replaces every occurrence
```

```sql
SELECT
    REPLACE(Phone, '-', '')                                   AS NoDashes,
    REPLACE(REPLACE(REPLACE(Phone, ' ', ''), '-', ''), '.', '') AS DigitsOnlyish
FROM Customers;
```

- Available everywhere with the same argument order.
- Case sensitivity follows the collation on SQL Server (case-insensitive by default) and MySQL; it is case-sensitive in PostgreSQL, Oracle and SQLite.
- `REPLACE(s, 'x', '')` deletes; Oracle also allows omitting the third argument.

---

# TRANSLATE

`TRANSLATE` maps characters one-for-one:

```sql
TRANSLATE(s, from_chars, to_chars)
```

```sql
-- Replace each of ( ) - . and space by a space, in one call
SELECT TRANSLATE(Phone, '()-.', '    ') FROM Customers;          -- PostgreSQL, Oracle, SQL Server 2017+

-- PostgreSQL / Oracle: characters without a partner are deleted
SELECT TRANSLATE('(555) 010-2030', '()- ', '');                   -- PostgreSQL: '5550102030'
```

- PostgreSQL deletes `from_chars` that have no counterpart in `to_chars`; Oracle does the same, but returns `NULL` if `to_chars` is empty (`''` is `NULL`), so the Oracle idiom is `TRANSLATE(s, 'x()- ', 'x')`.
- SQL Server requires both lists to have the same length.
- MySQL and SQLite have no `TRANSLATE`—use nested `REPLACE` or `REGEXP_REPLACE`.

---

# Masking Values

```sql
-- Card number: show only the last four digits
SELECT '**** **** **** ' || RIGHT(CardNumber, 4) AS Masked FROM Payments;

-- Email: first letter, then *** up to the @
SELECT SUBSTRING(Email FROM 1 FOR 1) || '***' || SUBSTRING(Email FROM POSITION('@' IN Email)) AS MaskedEmail
FROM Customers;                                                   -- 'a***@example.com'
```

Masking in queries is a display convenience, not a security control—the unmasked value still left the table. See the security note below.

---

# Visual Representation

```text
Email = 'asha@example.com'
position: 1234567890123456
          a s h a @ e x a m p l e . c o m
                  ▲
                  POSITION('@' IN Email) = 5

SUBSTRING(Email FROM 1 FOR 4)  → 'asha'        (before the @)
SUBSTRING(Email FROM 6)        → 'example.com' (after the @)
RIGHT(Email, 3)                → 'com'
REPLACE(Email, 'example', 'ex')→ 'asha@ex.com'
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN        ← joining on SUBSTRING(Code FROM 1 FOR 3) = Prefix prevents index use on Code
3. WHERE       ← WHERE LEFT(Code, 3) = 'ABC' is better written LIKE 'ABC%'
4. GROUP BY    ← GROUP BY the extracted part to aggregate by domain, prefix, …
5. HAVING
6. WINDOW
7. SELECT
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
WHERE LEFT(Code, 3) = 'ABC'      → Scan all rows, compute LEFT per row, compare
WHERE Code LIKE 'ABC%'           → Index range seek: 'ABC' ≤ Code < 'ABD'

WHERE SUBSTRING(Email FROM POSITION('@' IN Email) + 1) = 'example.com'
                                 → Scan; index an expression or store Domain separately
```

A prefix test written as `LIKE 'prefix%'` is sargable (Section 06.12). Any other substring test needs either an expression index or a trigram/full-text index.

---

# 🔬 Engine Deep Dive

PostgreSQL's `pg_trgm` extension indexes three-character fragments, so `WHERE Email LIKE '%example%'` and `POSITION(…) > 0`-style searches can use a GIN index instead of scanning. SQL Server and MySQL have full-text indexes for word searches but no general substring index; there, a persisted computed column holding the extracted part (domain, prefix) and an ordinary index on it is the usual answer.

---

# 🏗️ Architecture Insight

Frequent extraction is a modelling signal. If every query computes the email domain, store it in its own column (generated from `Email`) and index it. If every query splits a delimited list, it should be a child table. Functions are for occasional reshaping; structure is for repeated access.

---

# ⚡ Performance Tip

Rewrite prefix functions as `LIKE 'prefix%'` or a range predicate so an index on the column can seek. Replace `LEFT(Code, 3) = 'ABC'` with `Code LIKE 'ABC%'`.

---

# 🔒 Security Note

Masking with `RIGHT(CardNumber, 4)` in a query only hides data from the person reading that result. Anyone who can run a different query sees the full value. Use column permissions, views that expose only the masked form, or engine features such as SQL Server Dynamic Data Masking together with proper access control—and never store full card numbers you do not need.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `SUBSTRING(s FROM i FOR n)` | ✅ | ✅ | ✅ | ❌ (`SUBSTRING(s, i, n)`) | ❌ (`SUBSTR`) | ❌ (`substr(s, i, n)`; `substring` alias 3.34+) |
| `LEFT` / `RIGHT` | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Find position | `POSITION(x IN s)` | ✅ + `STRPOS` | ✅ + `LOCATE`, `INSTR` | `CHARINDEX` | `INSTR` | `instr` |
| Split part | ❌ | `SPLIT_PART` | `SUBSTRING_INDEX` | `STRING_SPLIT` (table) | `REGEXP_SUBSTR` | ❌ |
| `REPLACE` | ❌ (common) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `TRANSLATE` | ✅ (different meaning: character sets) | ✅ | ❌ | ✅ (2017+) | ✅ | ❌ |

> **Portability Tip:** `SUBSTR(s, i, n)` works on PostgreSQL, MySQL, Oracle and SQLite; SQL Server needs `SUBSTRING(s, i, n)`. For searching, there is no portable function name—wrap it in a view or use `LIKE`.

---

# Common Mistakes

### Mistake 1

Swapping arguments between `INSTR(haystack, needle)` and `CHARINDEX(needle, haystack)`.

---

### Mistake 2

Forgetting that "not found" returns 0, so `SUBSTRING(s FROM POSITION(…) + 1)` returns the whole string.

---

### Mistake 3

Using 0-based positions from application languages.

---

### Mistake 4

Using `LEFT(col, n) = 'x'` in `WHERE` instead of `LIKE 'x%'`.

---

### Mistake 5

Splitting a delimited column in every query instead of normalising it.

---

# Best Practices

✔ Remember positions are 1-based and "not found" is 0.

✔ Guard extractions with a `CASE` when the delimiter may be missing.

✔ Use `LIKE 'prefix%'` for prefix tests.

✔ Store frequently extracted parts in their own (generated) column.

✔ Normalise delimited lists into child tables.

---

# Interview Questions

## Basic

1. What does `SUBSTRING('database' FROM 5 FOR 4)` return?
2. How do you get the last four characters of a string?
3. What does `REPLACE` do?

## Intermediate

4. How do you extract the domain from an email on SQL Server and on PostgreSQL?
5. What do `POSITION`, `CHARINDEX` and `INSTR` return when the text is not found?
6. How does `TRANSLATE` differ from `REPLACE`?

## Advanced

7. Why is `LEFT(Code, 3) = 'ABC'` slower than `Code LIKE 'ABC%'`?
8. How would you make "search anywhere in `Email`" fast on PostgreSQL?
9. When is splitting a delimited column a modelling problem?

---

# Hands-on Exercises

## Exercise 1

Count customers per email domain.

---

## Exercise 2

Return phone numbers with `(`, `)`, `-`, `.` and spaces removed, on two engines.

---

## Exercise 3

Mask every email as first letter + `***` + `@domain`, handling emails without `@`.

---

## Exercise 4

Extract the second element of `'red|green|blue'` on PostgreSQL, MySQL and Oracle.

---

# Related Topics

- **12.02 — String Basics (Length, Case and Trimming)**
- **12.05 — Regular Expression Functions**
- **06.07 — LIKE and Pattern Matching**
- **06.12 — SARGability and Index-Friendly Predicates**
- **10.10 — Partial and Expression Indexes**

---

# Summary

`SUBSTRING` (or `SUBSTR`), `LEFT` and `RIGHT` extract parts of strings using 1-based positions. Finding text has a different name and argument order on almost every engine—`POSITION`, `STRPOS`, `LOCATE`, `CHARINDEX`, `INSTR`—and all return 0 when nothing is found. Splitting uses `SPLIT_PART`, `SUBSTRING_INDEX`, `STRING_SPLIT` or regular expressions. `REPLACE` changes substrings everywhere; `TRANSLATE` maps single characters where it exists. Substring functions on columns in `WHERE` usually scan, so prefer `LIKE 'prefix%'`, generated columns or specialised indexes, and treat repeated splitting as a sign the data needs a better structure.
