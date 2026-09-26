---
title: "12.01 - Introduction to Scalar Functions"
description: "What scalar functions are, how they differ from aggregate and window functions, where they can appear in a query, how they treat NULL, determinism, function families, and why they are the least portable part of SQL."
chapter: 12
section: 12.01
category: Data Query Language (DQL)
difficulty: Beginner
readingTime: 20 min
lastUpdated: 2026-09-26
---

# 12.01 Introduction to Scalar Functions

---

# Learning Objectives

After completing this section, you will be able to:

- Define a scalar function and tell it apart from aggregate and window functions.
- List the places in a statement where scalar functions may appear.
- Predict what a scalar function returns when an argument is `NULL`.
- Explain determinism and why it matters for indexes and computed columns.
- Name the main families of scalar functions.
- Recognise the portability problems scalar functions cause.

---

# Three Kinds of Function

SQL has three kinds of function, distinguished by how many rows they read and how many values they return:

| Kind | Reads | Returns | Example |
|------|-------|---------|---------|
| Scalar | One row | One value per row | `UPPER(CustomerName)` |
| Aggregate | A group of rows | One value per group | `SUM(TotalAmount)` |
| Window | A window of rows around each row | One value per row | `SUM(TotalAmount) OVER (PARTITION BY CustomerID)` |

```sql
SELECT
    o.CustomerID,
    o.OrderID,
    ROUND(o.TotalAmount, 0)                              AS Rounded,        -- scalar
    SUM(o.TotalAmount) OVER (PARTITION BY o.CustomerID)  AS CustomerTotal   -- window
FROM Orders AS o;

SELECT o.CustomerID, SUM(o.TotalAmount) AS CustomerTotal                   -- aggregate
FROM Orders AS o
GROUP BY o.CustomerID;
```

Some names belong to more than one kind: `MAX(a)` is an aggregate, but `GREATEST(a, b)` is the scalar "max of these arguments". SQLite even uses the same name for both: `max(x)` with one argument is an aggregate, `max(a, b)` with two is scalar.

---

# Where Scalar Functions Can Appear

Anywhere an expression is allowed:

```sql
SELECT UPPER(c.Country)                                   AS Country,        -- SELECT list
       COUNT(*)                                            AS Customers
FROM Customers AS c
JOIN Orders    AS o ON o.CustomerID = c.CustomerID                           -- (ON: see below)
WHERE LOWER(c.Email) LIKE '%@example.com'                                    -- WHERE
GROUP BY UPPER(c.Country)                                                    -- GROUP BY
HAVING SUM(ROUND(o.TotalAmount, 0)) > 1000                                   -- inside an aggregate
ORDER BY LENGTH(UPPER(c.Country)), UPPER(c.Country);                         -- ORDER BY
```

They also appear in `JOIN … ON` conditions, `CHECK` constraints, `DEFAULT` values, computed/generated columns, expression indexes, `UPDATE … SET` and `INSERT … VALUES`.

```sql
-- In DDL
ALTER TABLE Customers ADD CONSTRAINT ck_email_lower CHECK (Email = LOWER(Email));
CREATE INDEX ix_customers_name_upper ON Customers (UPPER(CustomerName));

-- In DML
UPDATE Customers SET Email = LOWER(TRIM(Email)) WHERE Email <> LOWER(TRIM(Email));
```

---

# NULL In, NULL Out

The default rule: if any argument is `NULL`, the result is `NULL`.

```sql
SELECT
    UPPER(NULL)            AS a,   -- NULL
    LENGTH(NULL)           AS b,   -- NULL
    ROUND(NULL, 2)         AS c,   -- NULL
    'Order ' || NULL       AS d,   -- NULL (standard concatenation)
    ABS(NULL)              AS e;   -- NULL
```

The exceptions are functions designed to deal with `NULL`:

| Function | With a `NULL` argument |
|----------|------------------------|
| `COALESCE(a, b, …)` | Returns the first non-`NULL` argument |
| `NULLIF(a, b)` | Returns `NULL` if `a = b`, else `a` |
| `CONCAT(a, b, …)` | Treats `NULL` as `''` in PostgreSQL, SQL Server, Oracle, SQLite—**but returns `NULL` in MySQL** |
| `ISNULL`, `NVL`, `IFNULL` | Vendor two-argument `COALESCE` |
| `CASE … WHEN x IS NULL …` | Whatever you write |

Section 12.09 covers them in depth.

---

# Deterministic and Non-Deterministic Functions

A function is **deterministic** if the same arguments always give the same result.

| Deterministic | Non-deterministic |
|---------------|-------------------|
| `UPPER`, `ROUND`, `ABS`, `SUBSTRING`, `COALESCE` | `RANDOM()` / `RAND()`, `NEWID()`, `CURRENT_TIMESTAMP`, `NOW()` |

Determinism matters because the engine may only store or index a function's result if it will never change:

- Expression indexes and persisted computed columns require deterministic expressions.
- A deterministic function with constant arguments can be evaluated once (constant folding).
- A non-deterministic function in `WHERE` is evaluated per row (or once per statement, depending on the engine—`RAND()` in SQL Server is evaluated once per query, not per row).

Some functions are deterministic only under fixed settings. `UPPER` depends on collation; `TO_CHAR(x, 'Month')` depends on language settings. PostgreSQL marks these as `STABLE` rather than `IMMUTABLE` and refuses to index them directly.

---

# Families of Scalar Function

```text
Scalar functions
├── String        LENGTH  UPPER  LOWER  TRIM  SUBSTRING  POSITION  REPLACE  CONCAT   (12.02–12.04)
├── Pattern       LIKE (06.07)  REGEXP_LIKE  REGEXP_REPLACE  REGEXP_SUBSTR           (12.05)
├── Numeric       ABS  SIGN  MOD  POWER  SQRT  EXP  LN  CEILING  FLOOR              (12.06)
├── Rounding      ROUND  TRUNC                                                      (12.07)
├── Conversion    CAST  CONVERT  TRY_CAST  TO_CHAR  TO_NUMBER                        (12.08)
├── NULL          COALESCE  NULLIF  ISNULL  NVL  IFNULL                              (12.09)
├── Conditional   CASE  IIF  GREATEST  LEAST  DECODE  CHOOSE                         (12.10)
├── JSON          JSON_VALUE  JSON_QUERY  JSON_OBJECT  ->  ->>                       (12.12)
├── Date & time   CURRENT_DATE  EXTRACT  DATEADD  DATE_TRUNC                         (Chapter 13)
└── User-defined  CREATE FUNCTION …                                                  (12.13)
```

---

# Why Scalar Functions Are the Least Portable Part of SQL

The same task has different spellings, argument orders and edge-case behaviour:

```sql
-- "Where does '@' appear in Email?"
POSITION('@' IN Email)     -- Standard, PostgreSQL, MySQL
STRPOS(Email, '@')         -- PostgreSQL
LOCATE('@', Email)         -- MySQL
CHARINDEX('@', Email)      -- SQL Server
INSTR(Email, '@')          -- Oracle, MySQL, SQLite
```

Note that `INSTR` and `CHARINDEX` take their arguments in **opposite orders**. When code must run on several engines, prefer standard forms, isolate vendor functions in views, and test each engine.

---

# Visual Representation

```text
               ┌──────────── one row ─────────────┐
               │ CustomerName = '  asha rao '     │
               └────────────────┬─────────────────┘
                                │
                         TRIM(…)│  'asha rao'
                                ▼
                        UPPER(…)│  'ASHA RAO'
                                ▼
                        LENGTH(…)  8

Evaluated inside-out, once per row that reaches the expression.
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN        ← functions in ON evaluated per candidate pair
3. WHERE       ← functions in predicates evaluated per examined row
4. GROUP BY    ← grouping by a function groups by its result
5. HAVING
6. WINDOW
7. SELECT      ← functions in the SELECT list evaluated per output row
8. DISTINCT
9. ORDER BY    ← may sort by a function of columns or by a SELECT alias
10. LIMIT / FETCH / TOP
```

Because the `SELECT` list is evaluated after `WHERE`, an alias defined there (`UPPER(Country) AS C`) cannot be used in `WHERE`—repeat the expression or use a derived table.

---

# How the DBMS Executes This

```text
SELECT UPPER(CustomerName) FROM Customers WHERE LENGTH(Email) > 15

Scan Customers
  └─ Filter:   LENGTH(Email) > 15          evaluated for every scanned row
      └─ Project: UPPER(CustomerName)       evaluated only for rows that passed
```

The engine compiles each expression into a small evaluation tree (or native code, with JIT compilation in PostgreSQL and in SQL Server's in-memory tables) and runs it per row at the operator that needs it.

---

# 🔬 Engine Deep Dive

Engines resolve a function call by name **and argument types**. PostgreSQL may have several `ROUND` overloads (`round(numeric, int)`, `round(double precision)`) and picks one by the argument types—so `ROUND(3.14159::float8, 2)` fails, because there is no two-argument float version. SQL Server and MySQL instead convert arguments to the one signature they support. Knowing which type each function expects explains many "function does not exist" and precision surprises.

---

# 🏗️ Architecture Insight

Treat scalar functions as a data-quality tool at write time, not only as a display tool at read time. A `CHECK (Email = LOWER(TRIM(Email)))` constraint, or normalisation in the insert path, removes the need for `LOWER(TRIM(…))` in hundreds of queries—and keeps plain indexes usable.

---

# ⚡ Performance Tip

Built-in scalar functions in the `SELECT` list are almost free. The same functions on a column in `WHERE`, `JOIN … ON` or `GROUP BY` can decide whether the engine can use an index. Section 12.15 covers the rules.

---

# 🔒 Security Note

Functions do not sanitise input. `UPPER`, `TRIM` or `REPLACE` applied to user input before concatenating it into SQL text does not prevent injection. Use parameters.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Standard string forms (`SUBSTRING … FROM`, `POSITION … IN`, `TRIM … FROM`) | ✅ | ✅ | ✅ | Partial | ❌ | ❌ |
| Scalar `GREATEST` / `LEAST` | ✅ (SQL:2023) | ✅ | ✅ | ✅ (2022+) | ✅ | `max()` / `min()` |
| Function overloading by argument type | ✅ | ✅ | ❌ | ❌ | ✅ (packages) | ❌ |
| Deterministic flag for user functions | ✅ | `IMMUTABLE` / `STABLE` / `VOLATILE` | `DETERMINISTIC` | Inferred (`SCHEMABINDING`) | `DETERMINISTIC` | C API flag |

> **Portability Tip:** Keep a short list of the functions your team may use in shared SQL, with the spelling for each supported engine. Most portability bugs come from one developer's favourite vendor function.

---

# Common Mistakes

### Mistake 1

Assuming a function behaves the same on every engine because the name is the same (`LENGTH`, `ISNULL`, `CONCAT`).

---

### Mistake 2

Forgetting that `NULL` in almost always means `NULL` out.

---

### Mistake 3

Using a `SELECT` alias in `WHERE` instead of repeating the expression.

---

### Mistake 4

Indexing or persisting a non-deterministic expression.

---

# Best Practices

✔ Know whether you need a scalar, aggregate or window function before you write it.

✔ Decide `NULL` behaviour explicitly with `COALESCE` or `CASE`.

✔ Prefer standard function forms in shared code.

✔ Normalise data on write; keep read-time functions for presentation.

---

# Interview Questions

## Basic

1. What is a scalar function?
2. How does a scalar function differ from an aggregate function?
3. What does `UPPER(NULL)` return?

## Intermediate

4. Where in a SQL statement can scalar functions appear?
5. What is a deterministic function? Give two non-deterministic examples.
6. Why can't a `SELECT` alias be used in `WHERE`?

## Advanced

7. Why do expression indexes require deterministic functions?
8. How does function overloading affect `ROUND` on PostgreSQL?
9. Why are scalar functions the least portable part of SQL?

---

# Hands-on Exercises

## Exercise 1

List every customer with their name in upper case and the length of their email.

---

## Exercise 2

Classify each function you used in the last query you wrote as scalar, aggregate or window.

---

## Exercise 3

Write the "position of `@` in `Email`" expression for PostgreSQL, SQL Server and Oracle.

---

## Exercise 4

Add a `CHECK` constraint that keeps `Email` trimmed and lower-case.

---

# Related Topics

- **12.09 — NULL Functions (COALESCE, NULLIF, ISNULL and NVL)**
- **12.14 — Execution Flow of Scalar Functions**
- **05.06 — Expressions & Calculated Columns**
- **08.02 — Aggregate Functions (COUNT, SUM, AVG, MIN, MAX)**
- **11.01 — Introduction to Window Functions**

---

# Summary

A scalar function computes one value from the values of one row. It differs from aggregates, which collapse groups, and from window functions, which read a window of rows. Scalar functions can appear anywhere an expression can—including constraints, computed columns and indexes—and almost all of them return `NULL` when an argument is `NULL`. Deterministic functions can be folded, stored and indexed; non-deterministic ones cannot. Function names, argument orders and edge cases vary more between engines than any other part of SQL, so shared code should favour standard forms and explicit `NULL` handling.
