---
title: "12.13 - User-Defined Scalar Functions"
description: "Writing your own scalar functions with CREATE FUNCTION on PostgreSQL, MySQL, SQL Server and Oracle, and application-defined functions in SQLite; determinism and volatility declarations, NULL handling, inlining, the per-row query anti-pattern, SQL Server scalar UDF inlining, Oracle context switches, using functions in indexes and computed columns, security definer risks, and alternatives."
chapter: 12
section: 12.13
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 35 min
lastUpdated: 2026-09-26
---

# 12.13 User-Defined Scalar Functions

---

# Learning Objectives

After completing this section, you will be able to:

- Create scalar functions on each major engine.
- Declare determinism and volatility correctly.
- Explain when a function is inlined and when it runs per row.
- Recognise the "query inside a scalar function" anti-pattern and rewrite it.
- Use deterministic functions in expression indexes and computed columns.
- Secure functions that run with elevated privileges.

---

# Why Write Your Own Functions?

A user-defined function (UDF) packages an expression or a small piece of logic under a name:

```sql
SELECT OrderID, dbo.PriceWithTax(TotalAmount, Country) AS Gross FROM Orders ...
```

Good reasons:

- **One definition of a business rule** (tax, rounding, normalisation) used by many queries.
- **Readability**: `NormalisePhone(Phone)` instead of five nested `REPLACE`s.
- **Indexable expressions**: a deterministic function can back an expression index or computed column.

Bad reasons:

- Hiding a query that runs for every row.
- Avoiding a join.
- Re-implementing a built-in function.

---

# Creating a Scalar Function

```sql
-- PostgreSQL 14+ (SQL-standard body)
CREATE FUNCTION price_with_tax(amount NUMERIC, rate NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
RETURN ROUND(amount * (1 + rate), 2);

-- PostgreSQL (any version)
CREATE FUNCTION normalise_phone(p TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT
AS $$ SELECT regexp_replace(p, '[^0-9]', '', 'g') $$;
```

```sql
-- SQL Server
CREATE FUNCTION dbo.PriceWithTax (@Amount DECIMAL(10,2), @Rate DECIMAL(5,4))
RETURNS DECIMAL(10,2)
WITH SCHEMABINDING
AS
BEGIN
    RETURN ROUND(@Amount * (1 + @Rate), 2);
END;
```

```sql
-- MySQL
CREATE FUNCTION price_with_tax(amount DECIMAL(10,2), rate DECIMAL(5,4))
RETURNS DECIMAL(10,2)
DETERMINISTIC NO SQL
RETURN ROUND(amount * (1 + rate), 2);
```

```sql
-- Oracle
CREATE OR REPLACE FUNCTION price_with_tax (p_amount NUMBER, p_rate NUMBER)
RETURN NUMBER
DETERMINISTIC
IS
BEGIN
    RETURN ROUND(p_amount * (1 + p_rate), 2);
END;
/
```

```python
# SQLite: no CREATE FUNCTION — the host application registers functions
import re, sqlite3
conn = sqlite3.connect("shop.db")
conn.create_function("normalise_phone", 1,
                     lambda p: None if p is None else re.sub(r"[^0-9]", "", p),
                     deterministic=True)
```

---

# Declaring Determinism and Volatility

The engine trusts what you declare:

| Engine | Declarations | Meaning |
|--------|--------------|---------|
| PostgreSQL | `IMMUTABLE` / `STABLE` / `VOLATILE` (default) | Same result forever / within one statement / may change every call |
| MySQL | `DETERMINISTIC` / `NOT DETERMINISTIC`; `NO SQL` / `READS SQL DATA` / `MODIFIES SQL DATA` | Required with binary logging unless `log_bin_trust_function_creators` is set |
| SQL Server | Inferred; `WITH SCHEMABINDING` lets it be marked deterministic | Check with `OBJECTPROPERTY(OBJECT_ID('dbo.f'), 'IsDeterministic')` |
| Oracle | `DETERMINISTIC` | Allows function-based indexes and caching |
| SQLite | `deterministic` flag when registering | Allows use in indexes and `CHECK` constraints |

Declare the **strongest true** category:

- A pure calculation on its arguments: `IMMUTABLE` / `DETERMINISTIC`.
- A function that reads tables or settings (time zone, language): `STABLE` in PostgreSQL, not deterministic elsewhere.
- Anything using the clock, random numbers or sequences: `VOLATILE` / not deterministic.

> Declaring a function `IMMUTABLE` or `DETERMINISTIC` when it is not—for example because it reads a tax-rate table—lets the engine cache or index stale results. Expression indexes built on it silently return wrong rows after the table changes.

---

# NULL Handling

```sql
-- PostgreSQL: STRICT (RETURNS NULL ON NULL INPUT) — the body is skipped for NULL arguments
CREATE FUNCTION initials(name TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT
AS $$ SELECT upper(left(name, 1)) $$;

-- SQL Server: RETURNS NULL ON NULL INPUT
CREATE FUNCTION dbo.Initials (@Name NVARCHAR(100)) RETURNS NVARCHAR(1)
WITH SCHEMABINDING, RETURNS NULL ON NULL INPUT
AS BEGIN RETURN UPPER(LEFT(@Name, 1)); END;
```

Decide explicitly what the function returns for `NULL`—usually `NULL`, matching built-in functions.

---

# Inlining: When a Function Is Free

Some engines replace a function call with its body before optimisation, so the function costs nothing extra:

```text
Query:    SELECT price_with_tax(TotalAmount, 0.18) FROM Orders WHERE …
Inlined:  SELECT ROUND(TotalAmount * (1 + 0.18), 2) FROM Orders WHERE …
          → constant folding, index matching and parallelism all work as usual
```

- **PostgreSQL** inlines simple `LANGUAGE sql` functions (a single `SELECT`/`RETURN`, not `SECURITY DEFINER`, volatility not stronger than the body). PL/pgSQL functions are never inlined.
- **SQL Server 2019+** inlines scalar UDFs that meet a list of requirements (no time-dependent built-ins such as `GETDATE()`, no table variables, no recursion, among others). Check `sys.sql_modules.is_inlineable`.
- **MySQL** and **Oracle** PL/SQL functions are not inlined; each call is a separate execution. Oracle 21c SQL Macros return an expression that is substituted into the query.

---

# The Per-Row Query Anti-Pattern

```sql
-- SQL Server: looks harmless
CREATE FUNCTION dbo.CustomerTotal (@CustomerID INT) RETURNS DECIMAL(12,2)
AS
BEGIN
    RETURN (SELECT SUM(TotalAmount) FROM dbo.Orders WHERE CustomerID = @CustomerID);
END;

SELECT CustomerID, CustomerName, dbo.CustomerTotal(CustomerID) AS Spent
FROM dbo.Customers;          -- runs the SUM query once per customer
```

Before inlining (and whenever inlining does not apply), this is a hidden correlated subquery executed row by row:

```text
1,000,000 customers → 1,000,000 separate queries
Execution plan shows: Compute Scalar (cost ≈ 0%)   ← the real work is invisible
SQL Server < 2019: the whole query is also forced to run serially (no parallelism)
```

Rewrite as a set-based query:

```sql
SELECT c.CustomerID, c.CustomerName, COALESCE(t.Spent, 0) AS Spent
FROM Customers AS c
LEFT JOIN (SELECT CustomerID, SUM(TotalAmount) AS Spent
           FROM Orders GROUP BY CustomerID) AS t
       ON t.CustomerID = c.CustomerID;
```

Or keep the reusable abstraction as an **inline table-valued function** (SQL Server) or a view, which the optimizer expands like a derived table:

```sql
CREATE FUNCTION dbo.CustomerTotalTVF (@CustomerID INT)
RETURNS TABLE
AS RETURN (SELECT SUM(TotalAmount) AS Spent FROM dbo.Orders WHERE CustomerID = @CustomerID);

SELECT c.CustomerID, c.CustomerName, t.Spent
FROM dbo.Customers AS c
CROSS APPLY dbo.CustomerTotalTVF(c.CustomerID) AS t;
```

---

# Oracle: Context Switches

Calling a PL/SQL function from SQL switches between the SQL and PL/SQL engines for each call. For cheap functions called millions of times, the switch dominates. Mitigations:

```sql
-- 12c+: compile the function for SQL calls
CREATE OR REPLACE FUNCTION price_with_tax (p_amount NUMBER, p_rate NUMBER) RETURN NUMBER
IS
    PRAGMA UDF;
BEGIN
    RETURN ROUND(p_amount * (1 + p_rate), 2);
END;
/

-- 12c+: declare the function inside the query
WITH FUNCTION price_with_tax (p_amount NUMBER, p_rate NUMBER) RETURN NUMBER IS
BEGIN RETURN ROUND(p_amount * (1 + p_rate), 2); END;
SELECT OrderID, price_with_tax(TotalAmount, 0.18) FROM Orders
/
```

Wrapping the call in a scalar subquery (`(SELECT f(x) FROM dual)`) also enables Oracle's scalar subquery caching when the same argument values repeat.

---

# Functions in Indexes and Computed Columns

A deterministic function can make a derived value indexable:

```sql
-- PostgreSQL: expression index (function must be IMMUTABLE)
CREATE INDEX ix_customers_phone_norm ON Customers (normalise_phone(Phone));
SELECT * FROM Customers WHERE normalise_phone(Phone) = '5550102030';   -- uses the index

-- SQL Server: persisted computed column + index (function must be deterministic and schemabound)
ALTER TABLE dbo.Customers ADD PhoneNorm AS dbo.NormalisePhone(Phone) PERSISTED;
CREATE INDEX ix_customers_phonenorm ON dbo.Customers (PhoneNorm);

-- Oracle: function-based index (function must be DETERMINISTIC)
CREATE INDEX ix_customers_phone_norm ON Customers (normalise_phone(Phone));
```

MySQL functional indexes and generated columns cannot call stored functions; express the logic with built-ins (`REGEXP_REPLACE`) instead.

Changing the function's definition later makes existing index entries wrong; rebuild dependent indexes (PostgreSQL does not do this automatically).

---

# Visual Representation

```text
Inlined function                         Non-inlined function with a query
─────────────────                        ───────────────────────────────────
Scan Orders                              Scan Customers (1,000,000 rows)
  └─ Compute: ROUND(Total * 1.18, 2)       └─ per row: call CustomerTotal(id)
     (one operator, set-based)                  └─ Seek Orders, SUM   × 1,000,000
                                            (hidden, serial, row by row)
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← a UDF on a column here is evaluated per examined row
4. GROUP BY
5. HAVING
6. WINDOW
7. SELECT      ← a UDF in the SELECT list runs once per output row
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP   ← a UDF may run before LIMIT reduces the rows
```

A UDF in the `SELECT` list of a query with `ORDER BY … LIMIT 10` may run for every row before the top 10 are chosen, unless the engine can defer the projection. Compute expensive values in an outer query over the limited result.

---

# How the DBMS Executes This

```text
Parse: resolve function name and overload
Optimize:
  inlinable? → substitute the body into the query, optimise as one statement
  otherwise  → treat as an opaque call with a guessed cost (often "cheap")
Execute:
  opaque call → per row: set up a frame, bind arguments, run the body
                (PL/pgSQL, T-SQL, PL/SQL interpreters), return a value
```

Because the optimizer cannot see inside opaque functions, it misjudges their cost and the selectivity of predicates that use them. PostgreSQL lets you declare `COST` and, for set-returning functions, `ROWS`.

---

# 🏗️ Architecture Insight

Functions are a good home for **calculations** and a poor home for **data access**. Keep scalar functions pure—arguments in, value out—and express data access as joins, views or inline table functions that the optimizer can see through. A codebase where business rules live in pure functions and data access lives in set-based SQL gets both reuse and performance.

---

# ⚡ Performance Tip

Measure a UDF by comparing the query with the function against the same query with the body pasted inline. If the difference is large, the function is not being inlined; rewrite it as `LANGUAGE sql` (PostgreSQL), make it inlineable (SQL Server 2019+), use `PRAGMA UDF` (Oracle), or replace it with a view or inline table-valued function.

---

# 🔒 Security Note

Functions declared `SECURITY DEFINER` (PostgreSQL) or `SQL SECURITY DEFINER` (MySQL), or owned by privileged users with ownership chaining (SQL Server), run with their owner's rights. A caller who can influence object resolution—for example by creating a table or function earlier in the `search_path`—can hijack them. Set a fixed `search_path` on PostgreSQL definer functions (`SET search_path = pg_catalog, app`), schema-qualify every object, and grant `EXECUTE` narrowly.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `CREATE FUNCTION` | ✅ (SQL/PSM) | ✅ (SQL, PL/pgSQL, others) | ✅ | ✅ (T-SQL, CLR) | ✅ (PL/SQL, Java) | ❌ (host API) |
| Determinism declaration | `DETERMINISTIC` | `IMMUTABLE`/`STABLE`/`VOLATILE` | `DETERMINISTIC` | Inferred | `DETERMINISTIC` | Flag |
| Inlining | — | Simple SQL functions | ❌ | 2019+ (with conditions) | SQL Macros (21c+) | ❌ |
| In expression indexes | — | `IMMUTABLE` only | ❌ (stored functions) | Via computed columns | `DETERMINISTIC` only | Deterministic only |
| `RETURNS NULL ON NULL INPUT` | ✅ | ✅ (`STRICT`) | ❌ | ✅ | ❌ | ❌ |

> **Portability Tip:** Function bodies are never portable across engines. Keep them small and pure so that rewriting them for another engine is mechanical, and keep business logic that must be shared across platforms in one place—either the database or the application, not both.

---

# Common Mistakes

### Mistake 1

A scalar function that runs a query, called for every row.

---

### Mistake 2

Declaring a function `IMMUTABLE` or `DETERMINISTIC` when it reads tables or settings.

---

### Mistake 3

Assuming the execution plan's cost includes the work inside the function.

---

### Mistake 4

Re-implementing built-in functions in procedural code.

---

### Mistake 5

`SECURITY DEFINER` functions without a fixed `search_path`.

---

# Best Practices

✔ Keep scalar functions pure: arguments in, value out.

✔ Declare the strongest volatility that is true.

✔ Prefer `LANGUAGE sql` (PostgreSQL) and inlineable T-SQL.

✔ Replace data-accessing scalar functions with joins, views or inline table-valued functions.

✔ Use deterministic functions to back expression indexes and computed columns.

---

# Interview Questions

## Basic

1. What is a user-defined scalar function?
2. Give two good reasons to write one.
3. How do you add a function to SQLite?

## Intermediate

4. What do `IMMUTABLE`, `STABLE` and `VOLATILE` mean in PostgreSQL?
5. Why must a function be deterministic to be used in an index?
6. What is function inlining?

## Advanced

7. Why can a scalar UDF make a SQL Server query 100 times slower, and what changed in 2019?
8. How would you rewrite a scalar function that sums a customer's orders?
9. What are the risks of `SECURITY DEFINER` functions?

---

# Hands-on Exercises

## Exercise 1

Write a function that normalises phone numbers to digits only, on one engine, and declare it correctly.

---

## Exercise 2

Create an expression index (or computed column index) using that function and verify it is used.

---

## Exercise 3

Write a scalar function that returns a customer's order count, measure a query that uses it, then rewrite it set-based and compare.

---

## Exercise 4

Check whether a SQL Server scalar function is inlineable and explain why or why not.

---

# Related Topics

- **12.14 — Execution Flow of Scalar Functions**
- **12.15 — Scalar Function Performance and Index Strategy**
- **09.07 — Correlated Subqueries**
- **09.10 — LATERAL and CROSS APPLY**
- **10.10 — Partial and Expression Indexes**

---

# Summary

User-defined scalar functions name a calculation so it can be reused, and deterministic ones can back expression indexes and computed columns. Every engine except SQLite supports `CREATE FUNCTION`, with different languages and declarations; the declared determinism or volatility must be true, or cached and indexed results go stale. Simple SQL functions are inlined by PostgreSQL and, with conditions, SQL Server 2019+; otherwise each call runs separately and is invisible to the optimizer. The dominant anti-pattern is a scalar function that queries a table per row—rewrite it as a join, view or inline table-valued function—and definer-rights functions need fixed search paths and narrow grants.
