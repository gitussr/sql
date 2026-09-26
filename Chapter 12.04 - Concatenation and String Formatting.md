---
title: "12.04 - Concatenation and String Formatting"
description: "Joining strings with the || operator, CONCAT and CONCAT_WS, NULL behaviour and implicit conversion in each engine, SQL Server's + operator, special characters, formatting numbers with TO_CHAR, FORMAT and printf, quoting identifiers and literals, and where formatting belongs."
chapter: 12
section: 12.04
category: Data Query Language (DQL)
difficulty: Beginner → Intermediate
readingTime: 25 min
lastUpdated: 2026-09-26
---

# 12.04 Concatenation and String Formatting

---

# Learning Objectives

After completing this section, you will be able to:

- Concatenate strings with `||`, `+`, `CONCAT` and `CONCAT_WS`.
- Predict how each engine treats `NULL` in concatenation.
- Concatenate numbers and dates safely with explicit conversion.
- Insert special characters such as newlines and quotes.
- Format numbers with thousands separators and fixed decimals.
- Quote identifiers and literals correctly when building dynamic SQL.

---

# Three Ways to Concatenate

```sql
FirstName || ' ' || LastName            -- SQL standard: PostgreSQL, Oracle, SQLite
FirstName + ' ' + LastName              -- SQL Server
CONCAT(FirstName, ' ', LastName)        -- PostgreSQL, MySQL, SQL Server 2012+, SQLite 3.44+; Oracle: 2 arguments only
```

MySQL treats `||` as logical `OR` unless `PIPES_AS_CONCAT` is in `sql_mode`, so `'a' || 'b'` returns `0`. Use `CONCAT` on MySQL.

---

# NULL in Concatenation

This is where engines disagree most:

```sql
SELECT 'Customer: ' || NULL;           -- ?
SELECT CONCAT('Customer: ', NULL);     -- ?
```

| Engine | `'a' \|\| NULL` | `CONCAT('a', NULL)` | `CONCAT_WS(',', 'a', NULL, 'b')` |
|--------|------------------|---------------------|-------------------------------|
| PostgreSQL | `NULL` | `'a'` | `'a,b'` |
| MySQL | (`OR`) | **`NULL`** | `'a,b'` |
| SQL Server | `'a' + NULL` → `NULL` | `'a'` | `'a,b'` (2017+) |
| Oracle | `'a'` | `'a'` | ❌ |
| SQLite | `NULL` | `'a'` (3.44+) | `'a,b'` (3.44+) |

Oracle treats `NULL` as an empty string in concatenation (because `''` is `NULL`). Everyone else follows "`NULL` in, `NULL` out" for the operator.

The portable way to build a full name when parts may be missing:

```sql
SELECT TRIM(COALESCE(FirstName, '') || ' ' || COALESCE(MiddleName, '') || ' ' || COALESCE(LastName, ''))
FROM People;
```

This still leaves a double space when the middle name is missing. `CONCAT_WS` (concatenate **with separator**) skips `NULL`s and avoids that:

```sql
SELECT CONCAT_WS(' ', FirstName, MiddleName, LastName) AS FullName FROM People;
-- 'Asha Rao' when MiddleName is NULL — no double space
```

`CONCAT_WS` does **not** skip empty strings—normalise `''` to `NULL` with `NULLIF(MiddleName, '')` if the data contains them.

---

# Concatenating Numbers and Dates

```sql
SELECT 'Order ' || OrderID FROM Orders;                           -- PostgreSQL, Oracle, SQLite: works
SELECT 'Order ' + OrderID FROM Orders;                            -- SQL Server: ERROR (converting 'Order ' to int)
SELECT 'Order ' + CAST(OrderID AS VARCHAR(10)) FROM Orders;       -- SQL Server: works
SELECT CONCAT('Order ', OrderID) FROM Orders;                     -- converts automatically wherever CONCAT exists
```

SQL Server's `+` is both addition and concatenation; with a number on either side, it tries to convert the string to a number. `CONCAT` converts every argument to a string first.

Dates concatenated implicitly take the session's default format, which varies by server, language and client. Convert them explicitly:

```sql
-- PostgreSQL / Oracle
SELECT 'Placed on ' || TO_CHAR(OrderDate, 'YYYY-MM-DD') FROM Orders;
-- SQL Server
SELECT CONCAT('Placed on ', CONVERT(CHAR(10), OrderDate, 23)) FROM Orders;     -- style 23 = yyyy-mm-dd
-- MySQL
SELECT CONCAT('Placed on ', DATE_FORMAT(OrderDate, '%Y-%m-%d')) FROM Orders;
```

(Chapter 13 covers date formatting in full.)

---

# Special Characters

```sql
-- A single quote inside a literal is doubled
SELECT 'O''Brien';                                    -- O'Brien

-- Newline and tab
SELECT 'Line 1' || CHR(10) || 'Line 2';               -- PostgreSQL, Oracle (CHR)
SELECT 'Line 1' + CHAR(10) + 'Line 2';                -- SQL Server (CHAR)
SELECT CONCAT('Line 1', CHAR(10), 'Line 2');          -- MySQL (CHAR)
SELECT 'Line 1' || char(10) || 'Line 2';              -- SQLite (char)
SELECT E'Line 1\nLine 2';                             -- PostgreSQL escape string
```

`CHAR(n)` returns the character with code `n`; `ASCII(c)` (or `UNICODE(c)` on SQL Server and SQLite) goes the other way.

---

# Formatting Numbers

Formatting turns a number into display text: thousands separators, fixed decimals, currency symbols.

```sql
-- PostgreSQL / Oracle: TO_CHAR with a picture format
SELECT TO_CHAR(1234567.5, 'FM9,999,999.00');          -- '1,234,567.50'

-- MySQL: FORMAT(number, decimals [, locale])
SELECT FORMAT(1234567.5, 2);                           -- '1,234,567.50'
SELECT FORMAT(1234567.5, 2, 'de_DE');                  -- '1.234.567,50'

-- SQL Server 2012+: FORMAT(value, .NET format [, culture])
SELECT FORMAT(1234567.5, 'N2');                        -- '1,234,567.50'
SELECT FORMAT(1234567.5, 'C', 'en-IN');                -- '₹12,34,567.50'

-- SQLite: printf / format (3.38+)
SELECT printf('%.2f', 1234567.5);                      -- '1234567.50'
```

The result is **text**: it no longer sorts or sums as a number. Format in the final `SELECT` only—never in a derived table whose result is used for calculations or ordering.

> SQL Server's `FORMAT` calls the .NET runtime per row and is dramatically slower than `CONVERT` or `CAST`. Avoid it on large result sets.

---

# Formatting Belongs in the Presentation Layer

```text
Database                         Application / report
┌───────────────────────┐        ┌──────────────────────────────────┐
│ 1234567.50 (DECIMAL)  │ ─────▶ │ '1,234,567.50' (en-US)           │
│                       │        │ '1.234.567,50' (de-DE)           │
│                       │        │ '₹12,34,567.50' (en-IN)          │
└───────────────────────┘        └──────────────────────────────────┘
      store & return numbers        format per user locale
```

Return numbers and dates as typed values and format them where the user's locale is known. Use SQL formatting for exports, emails generated in the database and ad-hoc reports.

---

# Quoting Identifiers and Literals

When building dynamic SQL (for example in a stored procedure), use the engine's quoting functions, never plain concatenation:

```sql
-- PostgreSQL
SELECT format('SELECT * FROM %I WHERE Status = %L', TableName, StatusValue);
SELECT quote_ident(TableName), quote_literal(StatusValue);

-- SQL Server
SELECT 'SELECT * FROM ' + QUOTENAME(@TableName);        -- [Orders]
-- …and pass values as parameters with sp_executesql
```

---

# Visual Representation

```text
FirstName = 'Asha'   MiddleName = NULL   LastName = 'Rao'

'Asha' || ' ' || NULL || ' ' || 'Rao'      → NULL            (standard operator)
CONCAT('Asha', ' ', NULL, ' ', 'Rao')      → 'Asha  Rao'     (NULL as '', double space)
CONCAT_WS(' ', 'Asha', NULL, 'Rao')        → 'Asha Rao'      (NULL skipped)
MySQL CONCAT('Asha', ' ', NULL, ' ', 'Rao')→ NULL            (MySQL exception)
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN        ← joining on concatenated keys (a || '-' || b = Code) prevents index use
3. WHERE
4. GROUP BY
5. HAVING
6. WINDOW
7. SELECT      ← concatenation and formatting for display happen here
8. DISTINCT
9. ORDER BY    ← ordering by a formatted string sorts as text ('10' < '9')
10. LIMIT / FETCH / TOP
```

Sort by the underlying value, not the formatted string: `ORDER BY TotalAmount`, not `ORDER BY FormattedTotal`.

---

# How the DBMS Executes This

```text
CONCAT(a, b, c)
  1. convert each non-NULL argument to text (type → string conversion)
  2. compute total length, allocate once
  3. copy the parts
Result type: VARCHAR/TEXT; SQL Server: NVARCHAR if any argument is NVARCHAR,
             and (MAX) only if an argument is (MAX)
```

On SQL Server, concatenating non-`MAX` strings silently truncates at 8,000 bytes (4,000 `NVARCHAR` characters). Cast one argument to `VARCHAR(MAX)` when building long strings.

---

# 🏗️ Architecture Insight

Concatenated keys (`CountryCode || '-' || AccountNo`) look convenient but hide structure from the optimizer and from constraints. Keep the parts as separate columns with a composite key, and concatenate only for display. If an external system needs the combined form, expose it as a generated column.

---

# ⚡ Performance Tip

Avoid `FORMAT` on SQL Server for large outputs; use `CONVERT` styles or format in the client. Anywhere, avoid joining or filtering on concatenated expressions—compare the parts instead.

---

# 🔒 Security Note

Concatenating user input into SQL text is SQL injection, whatever functions you wrap around it. Quote identifiers with `QUOTENAME`/`quote_ident`/`format('%I')`, validate them against a list of allowed names, and pass values as parameters.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `\|\|` concatenation | ✅ | ✅ | ❌ (logical `OR`) | ❌ (`+`) | ✅ (`NULL` as `''`) | ✅ |
| `CONCAT` | ❌ | ✅ | ✅ (`NULL` → `NULL`) | ✅ (2012+) | 2 args | ✅ (3.44+) |
| `CONCAT_WS` | ❌ | ✅ | ✅ | ✅ (2017+) | ❌ | ✅ (3.44+) |
| Number formatting | ❌ | `TO_CHAR` | `FORMAT` | `FORMAT`, `CONVERT` | `TO_CHAR` | `printf` |
| Identifier quoting function | ❌ | `quote_ident`, `format('%I')` | ❌ | `QUOTENAME` | `DBMS_ASSERT` | ❌ |

> **Portability Tip:** `CONCAT` with two or more non-`NULL` arguments is the most portable form (PostgreSQL, MySQL, SQL Server, SQLite 3.44+, and Oracle with two arguments). Wrap nullable arguments in `COALESCE` so MySQL agrees with the rest.

---

# Common Mistakes

### Mistake 1

Using `||` on MySQL and getting `0` or `1`.

---

### Mistake 2

Concatenating a nullable column and losing the whole value.

---

### Mistake 3

`'Order ' + OrderID` on SQL Server.

---

### Mistake 4

Concatenating dates without an explicit format.

---

### Mistake 5

Sorting or calculating on formatted strings.

---

# Best Practices

✔ Use `CONCAT_WS` for lists of optional parts.

✔ Wrap nullable arguments in `COALESCE` when using `||` or MySQL `CONCAT`.

✔ Convert numbers and dates explicitly before concatenating.

✔ Format in the presentation layer; return typed values from queries.

✔ Quote identifiers with the engine's function and parameterise values.

---

# Interview Questions

## Basic

1. How do you concatenate strings in standard SQL?
2. What does `'a' || NULL` return?
3. What does `CONCAT_WS` do?

## Intermediate

4. How does MySQL's `CONCAT` treat `NULL`?
5. Why does `'Order ' + OrderID` fail on SQL Server?
6. How do you format 1234567.5 as `'1,234,567.50'` on PostgreSQL?

## Advanced

7. Why can concatenation silently truncate on SQL Server?
8. Why should formatting happen in the presentation layer?
9. How do you build dynamic SQL safely with a table name from input?

---

# Hands-on Exercises

## Exercise 1

Build `'Asha Rao <asha@example.com>'` for every customer, omitting the email part when it is `NULL`.

---

## Exercise 2

Build a full name from first, middle and last names with single spaces only.

---

## Exercise 3

Return order totals formatted with thousands separators and two decimals on two engines.

---

## Exercise 4

Write a PostgreSQL `format()` call that builds `SELECT COUNT(*) FROM <table>` safely.

---

# Related Topics

- **12.02 — String Basics (Length, Case and Trimming)**
- **12.08 — Type Conversion (CAST, CONVERT and TRY_CAST)**
- **12.09 — NULL Functions (COALESCE, NULLIF, ISNULL and NVL)**
- **08.13 — Advanced Aggregate Functions (STRING_AGG, Percentiles and Statistics)**
- **13.xx — Date and Time Functions**

---

# Summary

Strings are concatenated with `||` in standard SQL, `+` in SQL Server and `CONCAT` almost everywhere. `NULL` handling differs sharply: the standard operator returns `NULL`, `CONCAT` usually treats `NULL` as empty—except on MySQL—and `CONCAT_WS` skips `NULL`s and adds separators. Convert numbers and dates explicitly before concatenating, especially on SQL Server. Number formatting functions (`TO_CHAR`, `FORMAT`, `printf`) produce text for display and belong in the final projection or, better, the presentation layer. Dynamic SQL must use quoting functions and parameters, never raw concatenation of input.
