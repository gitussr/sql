---
title: "Chapter 12 - Scalar Functions"
description: "Master SQL scalar functions: string length, case, trimming, substrings, searching and replacing, concatenation and formatting, regular expressions, numeric and rounding functions, type conversion, NULL functions, CASE and conditional expressions, collation and Unicode, JSON functions, user-defined functions, and how scalar functions affect execution plans and index use."
chapter: 12
section: Introduction
category: Data Query Language (DQL)
difficulty: Beginner → Advanced
readingTime: 25 min
lastUpdated: 2026-09-26
---

# Chapter 12 — Scalar Functions

> *"An aggregate speaks for many rows. A scalar function speaks for one."*

---

# Learning Objectives

By the end of this chapter, you will be able to:

- Explain what a scalar function is and how it differs from aggregate and window functions.
- Measure, change the case of, trim, pad and slice strings.
- Search for and replace text, with plain functions and with regular expressions.
- Concatenate values safely when some of them are `NULL`.
- Use numeric functions and choose the right rounding and truncation behaviour.
- Convert between types explicitly with `CAST`, `CONVERT` and safe-conversion functions.
- Replace, compare and produce `NULL`s with `COALESCE`, `NULLIF` and their vendor variants.
- Write `CASE` expressions and use `GREATEST`, `LEAST`, `IIF` and `DECODE`.
- Predict how collation affects comparisons, sorting and case-insensitive search.
- Read and build JSON values with SQL functions.
- Decide when a user-defined scalar function helps and when it hurts.
- Keep predicates that use functions index-friendly.

---

# Introduction

Chapter 08 introduced **aggregate functions**, which turn many rows into one value. Chapter 11 introduced **window functions**, which compute a value for each row from a window of related rows.

This chapter covers the third and most common family: **scalar functions**. A scalar function takes values from **one row** (or constants) and returns **one value**. You have been using them since Chapter 05—`UPPER(Name)`, `ROUND(Price, 2)`, `COALESCE(Phone, 'n/a')`—usually without thinking about them.

Scalar functions are where SQL dialects differ most. Every engine agrees on `SELECT`, `JOIN` and `GROUP BY`; far fewer agree on how to find a substring, how to concatenate, what `LENGTH` counts, or what `ROUND(2.5)` returns. They also have a hidden cost: a function wrapped around a column in `WHERE` can turn an index seek into a full scan.

This chapter teaches the functions, the dialect differences, and the performance rules together.

---

# What is a Scalar Function?

A scalar function maps the values of a single row to a single value.

```text
Customers                                  UPPER(CustomerName)   LENGTH(Email)
┌────────────┬──────────────┬─────────────────────┐   ┌──────────────┐   ┌────┐
│ CustomerID │ CustomerName │ Email               │   │              │   │    │
├────────────┼──────────────┼─────────────────────┤   ├──────────────┤   ├────┤
│ 1          │ Asha Rao     │ asha@example.com    │ → │ ASHA RAO     │   │ 16 │
│ 2          │ Ben Cole     │ NULL                │ → │ BEN COLE     │   │NULL│
│ 3          │ Chen Wei     │ chen.wei@example.io │ → │ CHEN WEI     │   │ 19 │
└────────────┴──────────────┴─────────────────────┘   └──────────────┘   └────┘

one row in  →  one value out  (row count never changes)
```

Three observations explain most scalar-function behaviour:

1. **One row at a time.** A scalar function never looks at other rows. That is what separates it from aggregates (`SUM`) and windows (`SUM(…) OVER (…)`).
2. **`NULL` in, `NULL` out.** Almost every scalar function returns `NULL` when an argument is `NULL`. The exceptions—`COALESCE`, `CONCAT` in most engines, `ISNULL`, `NVL`—exist precisely to handle `NULL`s.
3. **Usable anywhere an expression is.** Scalar functions appear in `SELECT`, `WHERE`, `JOIN … ON`, `GROUP BY`, `HAVING`, `ORDER BY`, inside aggregates and window functions, in `CHECK` constraints, computed columns and expression indexes.

---

# Basic Syntax

```sql
function_name(argument [, argument …])
```

Example:

```sql
SELECT
    c.CustomerID,
    UPPER(TRIM(c.CustomerName))                 AS NameUpper,
    LOWER(c.Email)                              AS EmailLower,
    COALESCE(c.Phone, 'not provided')           AS Phone,
    ROUND(o.TotalAmount * 1.18, 2)              AS TotalWithTax,
    CASE WHEN o.TotalAmount >= 500 THEN 'Large'
         ELSE 'Regular' END                     AS OrderSize
FROM Customers AS c
JOIN Orders    AS o ON o.CustomerID = c.CustomerID;
```

Functions nest: the output of `TRIM` is the input of `UPPER`. Evaluation is inside-out.

---

# The Sample Schema

Every section of this chapter uses the Chapter 11 schema, plus a phone number on customers and a JSON attributes column on products.

```sql
CREATE TABLE Customers (
    CustomerID   INT PRIMARY KEY,
    CustomerName VARCHAR(100) NOT NULL,
    Email        VARCHAR(255),
    Phone        VARCHAR(30),             -- free text as typed by the customer
    Country      VARCHAR(50)
);

CREATE TABLE Orders (
    OrderID     INT PRIMARY KEY,
    CustomerID  INT REFERENCES Customers(CustomerID),
    OrderDate   DATE          NOT NULL,
    Status      VARCHAR(20)   NOT NULL,
    TotalAmount DECIMAL(10,2) NOT NULL
);

CREATE TABLE Products (
    ProductID   INT PRIMARY KEY,
    ProductName VARCHAR(100) NOT NULL,
    CategoryID  INT,
    ListPrice   DECIMAL(10,2),
    Attributes  JSON                      -- e.g. {"color": "red", "sizes": ["S", "M"]}
);

CREATE TABLE OrderItems (
    OrderItemID INT PRIMARY KEY,
    OrderID     INT REFERENCES Orders(OrderID),
    ProductID   INT REFERENCES Products(ProductID),
    Quantity    INT           NOT NULL,
    UnitPrice   DECIMAL(10,2) NOT NULL
);

CREATE TABLE Employees (
    EmployeeID   INT PRIMARY KEY,
    EmployeeName VARCHAR(100) NOT NULL,
    ManagerID    INT REFERENCES Employees(EmployeeID),
    DepartmentID INT,
    Salary       DECIMAL(10,2),           -- NULL for contractors
    HireDate     DATE NOT NULL
);

CREATE TABLE DailySales (
    SalesDate DATE PRIMARY KEY,
    Revenue   DECIMAL(12,2) NOT NULL
);
```

(SQL Server stores JSON in `NVARCHAR(MAX)` before its native `json` type; SQLite stores it as `TEXT`. Section 12.12 covers the differences.)

---

# The Scalar Function Toolkit

| Family | Typical functions | Section |
|--------|-------------------|---------|
| String basics | `LENGTH`, `UPPER`, `LOWER`, `TRIM`, `LPAD` | 12.02 |
| Substrings and search | `SUBSTRING`, `POSITION`, `REPLACE`, `LEFT`, `RIGHT` | 12.03 |
| Concatenation and formatting | `\|\|`, `CONCAT`, `CONCAT_WS`, `FORMAT`, `TO_CHAR` | 12.04 |
| Regular expressions | `REGEXP_LIKE`, `REGEXP_REPLACE`, `REGEXP_SUBSTR` | 12.05 |
| Numeric | `ABS`, `MOD`, `POWER`, `SQRT`, `CEILING`, `FLOOR` | 12.06 |
| Rounding | `ROUND`, `TRUNC`, `TRUNCATE` | 12.07 |
| Conversion | `CAST`, `CONVERT`, `TRY_CAST` | 12.08 |
| `NULL` functions | `COALESCE`, `NULLIF`, `ISNULL`, `NVL`, `IFNULL` | 12.09 |
| Conditional | `CASE`, `IIF`, `GREATEST`, `LEAST`, `DECODE` | 12.10 |
| JSON | `JSON_VALUE`, `JSON_QUERY`, `->>`, `JSON_OBJECT` | 12.12 |
| User-defined | `CREATE FUNCTION …` | 12.13 |

Date and time functions are a family of their own and get Chapter 13.

```text
                   every scalar function call answers:
   ┌──────────────────────┬────────────────────────┬────────────────────────────┐
   │ WHAT TYPE goes in?   │ WHAT TYPE comes out?   │ WHAT happens with NULL?    │
   │ (implicit conversion │ (precision, length,    │ (NULL in → NULL out, or    │
   │  may happen here)    │  collation)            │  a replacement value)      │
   └──────────────────────┴────────────────────────┴────────────────────────────┘
```

---

# 📍 Execution Order Reminder

Scalar functions are evaluated wherever their expression appears:

```text
1. FROM
2. JOIN        ← functions in ON conditions are evaluated per candidate row pair
3. WHERE       ← functions in predicates are evaluated per row (and may block index seeks)
4. GROUP BY    ← functions in grouping expressions define the groups
5. HAVING
6. WINDOW
7. SELECT      ← functions in the SELECT list run on rows that survived filtering
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

> A function in the `SELECT` list runs only on rows that survive `WHERE`, `GROUP BY` and `HAVING`. A function on a column in `WHERE` runs on every row the engine has to examine—which is every row, unless an index can answer the predicate without it.

---

# How the DBMS Executes This

```text
SQL Statement
        │
        ▼
Parser: resolve function names and argument types
        │   (pick an overload, insert implicit conversions)
        ▼
Optimizer:
  - fold constants          ROUND(3.14159, 2) → 3.14 once, not per row
  - match expressions to expression indexes / computed columns
  - decide where each expression is computed (scan, filter, projection)
        │
        ▼
Executor: evaluate the function once per row that reaches that operator
```

Built-in scalar functions are cheap—nanoseconds to microseconds per call. The expensive cases are the ones this chapter keeps returning to: a function that prevents an index seek, an implicit conversion on a column, and a user-defined function that runs a query per row.

---

# Chapter Structure

| Section | Topic |
|---------|-------|
| 12.01 | Introduction to Scalar Functions |
| 12.02 | String Basics (Length, Case and Trimming) |
| 12.03 | Substrings, Searching and Replacing |
| 12.04 | Concatenation and String Formatting |
| 12.05 | Regular Expression Functions |
| 12.06 | Numeric and Mathematical Functions |
| 12.07 | Rounding, Truncation and Numeric Precision |
| 12.08 | Type Conversion (CAST, CONVERT and TRY_CAST) |
| 12.09 | NULL Functions (COALESCE, NULLIF, ISNULL and NVL) |
| 12.10 | Conditional Expressions (CASE, IIF, GREATEST and LEAST) |
| 12.11 | Collation, Case Sensitivity and Unicode |
| 12.12 | JSON Functions |
| 12.13 | User-Defined Scalar Functions |
| 12.14 | Execution Flow of Scalar Functions |
| 12.15 | Scalar Function Performance and Index Strategy |
| 12.16 | Common Scalar Function Mistakes & Best Practices |
| 12.17 | Scalar Function Cheat Sheet & Visual Knowledge Map |

---

# Real-World Examples

## E-Commerce

```sql
SELECT
    p.ProductID,
    UPPER(LEFT(p.ProductName, 1)) || LOWER(SUBSTRING(p.ProductName FROM 2)) AS DisplayName,
    ROUND(p.ListPrice * 0.9, 2)                                             AS SalePrice
FROM Products AS p;
```

Normalised product names and a 10% sale price rounded to cents.

---

## Banking

```sql
SELECT
    a.AccountID,
    '****' || RIGHT(a.AccountNumber, 4) AS MaskedAccount
FROM Accounts AS a;
```

Masking an account number so statements show only the last four digits.

---

## Hospital

```sql
SELECT
    p.PatientID,
    COALESCE(p.PreferredName, p.FirstName) || ' ' || p.LastName AS DisplayName,
    CASE WHEN p.BloodType IS NULL THEN 'Unknown' ELSE p.BloodType END AS BloodType
FROM Patients AS p;
```

Falling back to the legal first name when no preferred name is recorded.

---

## HRMS

```sql
SELECT
    e.EmployeeID,
    LOWER(REPLACE(TRIM(e.EmployeeName), ' ', '.')) || '@corp.example' AS SuggestedEmail
FROM Employees AS e;
```

Generating a login suggestion: trimmed, lower-cased, spaces replaced by dots.

---

## Social Media

```sql
SELECT
    po.PostID,
    CASE WHEN CHAR_LENGTH(po.Body) > 140
         THEN SUBSTRING(po.Body FROM 1 FOR 137) || '...'
         ELSE po.Body END AS Preview
FROM Posts AS po;
```

A feed preview truncated to 140 characters with an ellipsis.

---

# 🏗️ Architecture Insight

Scalar functions sit on the boundary between the database and the application. Formatting (currency symbols, date layouts, capitalisation) usually belongs in the presentation layer, where locale and user preferences are known. Normalisation (trimming, lower-casing emails, stripping phone punctuation) belongs as close to the write as possible—ideally once, on insert—so that every read and every index sees clean values. Deciding which side owns each transformation keeps queries simple and indexes usable.

---

# ⚡ Performance Tip

Never wrap an indexed column in a function in `WHERE` unless an expression index matches it. `WHERE LOWER(Email) = 'asha@example.com'` scans the table; an index on `LOWER(Email)`—or storing emails lower-cased—turns it back into a seek.

---

# 🔒 Security Note

String functions are not an escaping mechanism. Building SQL text with `REPLACE(input, '''', '''''')` or `CONCAT` and then executing it is still SQL injection waiting to happen. Pass user input as parameters and keep dynamic SQL to identifiers you validate against a known list.

---

# 🌍 Production Consideration

Most scalar-function bugs are silent: `LENGTH` counting bytes instead of characters, `CONCAT` returning `NULL` on MySQL when one argument is `NULL`, `ISNULL` truncating its replacement on SQL Server, `ROUND` behaving differently for `FLOAT` and `DECIMAL`, and an implicit conversion that ignores an index. Test functions against `NULL`s, empty strings, non-ASCII text and boundary numbers before shipping.

---

# 🚀 Enterprise Practice

Enterprise SQL standards commonly require explicit `CAST` instead of implicit conversion, `COALESCE` instead of vendor `NULL` functions in shared code, expression indexes or computed columns for every function-based predicate on a hot path, a documented collation per database, and a review of every user-defined scalar function for per-row queries.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Concatenation operator | `\|\|` | `\|\|` | `CONCAT()` (`\|\|` is OR by default) | `+` | `\|\|` | `\|\|` |
| Character length | `CHAR_LENGTH` | `LENGTH`, `CHAR_LENGTH` | `CHAR_LENGTH` (`LENGTH` = bytes) | `LEN` | `LENGTH` | `LENGTH` |
| Substring | `SUBSTRING(s FROM i FOR n)` | ✅ both forms | ✅ both forms | `SUBSTRING(s, i, n)` | `SUBSTR` | `SUBSTR` |
| Safe conversion | ❌ | ❌ | ❌ | `TRY_CAST` (2012+) | `DEFAULT … ON CONVERSION ERROR` (12.2+) | ❌ (loose typing) |
| `NULL` replacement | `COALESCE` | ✅ | ✅ + `IFNULL` | ✅ + `ISNULL` | ✅ + `NVL` | ✅ + `IFNULL` |
| Regular expressions | `LIKE_REGEX` etc. | ✅ | ✅ (8.0+) | ✅ (2025+) | ✅ | Operator only (needs extension) |
| JSON functions | ✅ (SQL:2016) | ✅ | ✅ | ✅ (2016+) | ✅ | ✅ (JSON1) |

> **Portability Tip:** `UPPER`, `LOWER`, `TRIM`, `REPLACE`, `ABS`, `ROUND`, `FLOOR`, `CAST`, `COALESCE`, `NULLIF` and `CASE` behave (almost) the same everywhere. Concatenation, length, substring search, formatting, safe conversion and regular expressions are the portability hazards.

---

# Common Mistakes

- Wrapping an indexed column in a function in `WHERE`.
- Using `LENGTH` where the engine counts bytes, not characters.
- Concatenating a `NULL` and losing the whole string.
- Relying on implicit conversion between strings, numbers and dates.
- Using `FLOAT` for money and being surprised by `ROUND`.
- Using vendor `NULL` functions with different semantics under the same name (`ISNULL` in SQL Server vs MySQL).
- Writing a user-defined scalar function that queries a table, and calling it for every row.

---

# Best Practices

✔ Keep indexed columns bare in predicates; move functions to the constant side.

✔ Use `COALESCE` and `NULLIF` for portable `NULL` handling.

✔ Convert explicitly with `CAST` and validate before converting.

✔ Use `DECIMAL` for money and round once, at a defined point.

✔ Normalise text on write (trim, case, punctuation) so reads stay simple.

✔ Create an expression index when a function-based predicate is unavoidable.

---

# 💡 Did You Know?

The SQL standard's string function names are older than most databases that use them: `SUBSTRING … FROM … FOR`, `POSITION … IN`, `TRIM … FROM` and `CHAR_LENGTH` all appear in SQL-92. Vendors had already shipped their own names (`SUBSTR`, `INSTR`, `CHARINDEX`, `LEN`) by then, which is why the same operation still has four spellings today.

---

# Related Topics

- **Chapter 11 — Window Functions**
- **05.06 — Expressions & Calculated Columns**
- **05.08 — NULL Handling in SELECT**
- **06.09 — Filtering with Expressions and Functions**
- **06.12 — SARGability and Index-Friendly Predicates**
- **10.10 — Partial and Expression Indexes**
- **13.xx — Date and Time Functions**

---

# Summary

A scalar function takes the values of one row and returns one value, without changing the row count. SQL's scalar functions cover strings, numbers, conversions, `NULL` handling, conditional logic, collation-aware comparison and JSON, and they can be used anywhere an expression is allowed. They are also the least portable part of SQL: names, argument orders, `NULL` behaviour and what "length" means differ by engine. The chapter's recurring themes are explicit types, deliberate `NULL` handling, and keeping functions off indexed columns in predicates—or backing them with expression indexes.
