---
title: "14.02 - CTE Syntax and Scope"
description: "The WITH clause in detail: CTE names and optional column lists, where a CTE can be referenced, statement scope, name resolution and shadowing of real tables, CTEs in views, INSERT … SELECT and subqueries, nested WITH clauses, the semicolon rule on SQL Server, ORDER BY and LIMIT inside a CTE, and vendor restrictions on where WITH may appear."
chapter: 14
section: 14.02
category: Data Query Language (DQL)
difficulty: Beginner
readingTime: 20 min
lastUpdated: 2026-09-28
---

# 14.02 CTE Syntax and Scope

---

# Learning Objectives

After completing this section, you will be able to:

- Write a CTE with and without a column list.
- Explain the scope of a CTE and where it can be referenced.
- Predict how CTE names interact with table names.
- Place `WITH` correctly in views, `INSERT … SELECT` and subqueries.
- Avoid the SQL Server semicolon trap and the `ORDER BY` inside a CTE trap.

---

# The WITH Clause

```sql
WITH cte_name [ (column1, column2, …) ] AS (
    SELECT …
)
SELECT … FROM cte_name;
```

```sql
WITH HighValueOrders AS (
    SELECT OrderID, CustomerID, TotalAmount
    FROM Orders
    WHERE TotalAmount >= 500
)
SELECT CustomerID, COUNT(*) AS BigOrders
FROM HighValueOrders
GROUP BY CustomerID;
```

- The CTE name follows identifier rules (Section 04.15).
- The parentheses around the query are required.
- The main statement follows immediately—there is no semicolon between the `WITH` clause and the `SELECT` it belongs to.

---

# Column Lists

Column names come from the CTE query's select list unless a column list overrides them:

```sql
-- Names from the query (aliases required for expressions)
WITH Totals AS (
    SELECT CustomerID, SUM(TotalAmount) AS Total FROM Orders GROUP BY CustomerID
)
SELECT * FROM Totals;

-- Names from a column list
WITH Totals (CustomerID, Total) AS (
    SELECT CustomerID, SUM(TotalAmount) FROM Orders GROUP BY CustomerID
)
SELECT * FROM Totals;
```

Every column must end up with a name, and names must be unique. An unaliased expression such as `SUM(TotalAmount)` without a column list is an error on SQL Server and gets a generated name elsewhere (`sum`, `SUM(TotalAmount)`)—always name it.

Column lists are **required** for recursive CTEs on Oracle and customary on the other engines, because they document the columns the anchor and recursive member must produce.

---

# Scope

A CTE is visible:

- in the main statement that follows the `WITH` clause,
- in every **later** CTE of the same `WITH` clause,
- in subqueries anywhere inside those.

It is **not** visible:

- in earlier CTEs of the same `WITH` clause (except to itself, when recursive),
- in any other statement, even the next one in the same batch or transaction.

```sql
WITH A AS (SELECT 1 AS x),
     B AS (SELECT x + 1 AS y FROM A)       -- ✅ B can use A
SELECT * FROM B;

SELECT * FROM A;                           -- ❌ error: relation "a" does not exist
```

```text
WITH A AS (…),  B AS (… A …),  C AS (… A … B …)   SELECT … A … B … C …;
     └─ visible to ─────────────────────────────────────────────────▶
                     └─ visible to ─────────────────────────────────▶
                                       └─ visible to ───────────────▶
     ────────────────────── one statement ──────────────────────────  ; ← scope ends
```

---

# Name Resolution and Shadowing

A CTE name **shadows** a real table of the same name within its statement:

```sql
WITH Orders AS (
    SELECT * FROM Orders WHERE Status = 'Shipped'   -- inner Orders: which one?
)
SELECT COUNT(*) FROM Orders;
```

On PostgreSQL and MySQL, a `WITH` without `RECURSIVE` cannot refer to itself, so the inner `Orders` is the **real table** and the query counts shipped orders. SQL Server and SQLite (where `RECURSIVE` is implicit or optional) treat the inner reference as a recursive self-reference and reject the query, and Oracle may do the same. Never give a CTE the name of an existing table.

---

# Where WITH Can Appear

```sql
-- Before SELECT (all engines)
WITH t AS (…) SELECT … FROM t;

-- Inside a view (all engines)
CREATE VIEW TopCustomers AS
WITH Totals AS (SELECT CustomerID, SUM(TotalAmount) AS Total FROM Orders GROUP BY CustomerID)
SELECT * FROM Totals WHERE Total > 10000;

-- INSERT … SELECT: WITH after INSERT INTO (PostgreSQL, MySQL, Oracle, SQLite)
INSERT INTO CustomerSummary (CustomerID, Total)
WITH Totals AS (SELECT CustomerID, SUM(TotalAmount) AS Total
                FROM Orders GROUP BY CustomerID)
SELECT CustomerID, Total FROM Totals;

-- INSERT … SELECT: WITH before INSERT (PostgreSQL, SQL Server, SQLite)
WITH Totals AS (SELECT CustomerID, SUM(TotalAmount) AS Total
                FROM Orders GROUP BY CustomerID)
INSERT INTO CustomerSummary (CustomerID, Total)
SELECT CustomerID, Total FROM Totals;

-- In a subquery or derived table (PostgreSQL, MySQL, Oracle, SQLite; not SQL Server)
SELECT *
FROM (
    WITH t AS (SELECT CustomerID FROM Orders WHERE TotalAmount > 500)
    SELECT DISTINCT CustomerID FROM t
) AS x;
```

| Placement | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|-----------|------------|-------|------------|--------|--------|
| `WITH … SELECT` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `WITH … INSERT` | ✅ | ❌ | ✅ | ❌ | ✅ |
| `WITH … UPDATE/DELETE` | ✅ | ✅ | ✅ | ❌ | ✅ |
| `INSERT INTO t WITH … SELECT` | ✅ | ✅ | ❌ | ✅ | ✅ |
| `WITH` inside a subquery | ✅ | ✅ | ❌ | ✅ | ✅ |
| In a view | ✅ | ✅ | ✅ | ✅ | ✅ |

Section 14.10 covers CTEs with data modification.

---

# The Semicolon Rule (SQL Server)

`WITH` is also used by other T-SQL constructs (table hints, `WITH (NOLOCK)`, `WITH XMLNAMESPACES`). When a CTE follows another statement in a batch, the previous statement **must** end with a semicolon:

```sql
DECLARE @minTotal DECIMAL(10,2) = 500     -- ❌ no semicolon
WITH t AS (SELECT * FROM Orders WHERE TotalAmount > @minTotal)
SELECT * FROM t;
-- Msg 319: Incorrect syntax near the keyword 'with'. If this statement is a common table
-- expression … the previous statement must be terminated with a semicolon.
```

Many T-SQL developers write `;WITH` defensively. Ending every statement with a semicolon is the cleaner habit.

---

# ORDER BY and LIMIT Inside a CTE

```sql
WITH Recent AS (
    SELECT * FROM Orders ORDER BY OrderDate DESC      -- ordering here is NOT kept
)
SELECT * FROM Recent;                                  -- rows in any order
```

A CTE is a set; its internal order is not guaranteed to survive. Put `ORDER BY` in the outer query.

`ORDER BY` inside a CTE is meaningful only with a row limit—it decides **which** rows are kept:

```sql
WITH Latest10 AS (
    SELECT * FROM Orders ORDER BY OrderDate DESC LIMIT 10   -- SQL Server: TOP (10) … ORDER BY
)
SELECT * FROM Latest10 ORDER BY OrderDate;                  -- order the output here
```

SQL Server rejects `ORDER BY` in a CTE unless `TOP`, `OFFSET` or `FOR XML` is also present.

---

# Visual Representation

```text
   WITH  Name  (col1, col2)  AS  (  SELECT …  )  [, Name2 AS ( … ) ]   SELECT … FROM Name …
         ────  ────────────       ───────────                          ─────────────────────
         name  optional column    the CTE query                        main statement — the
               list (required     (parentheses required)               only place the CTE
               for recursive on                                        can be used
               Oracle)
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← the CTE name is resolved here; CTE names shadow tables
2. JOIN
3. WHERE
4. GROUP BY
5. HAVING
6. WINDOW
7. SELECT      ← CTE column names come from the column list or the CTE's select list
8. DISTINCT
9. ORDER BY    ← only the outermost ORDER BY is guaranteed
10. LIMIT / FETCH / TOP   ← inside a CTE, LIMIT with ORDER BY chooses rows, not output order
```

---

# How the DBMS Executes This

```text
Parse:   WITH clause → a list of (name, column list, query) definitions
Resolve: each table reference → search CTE names first (innermost WITH outward), then the schema
Rewrite: non-recursive CTE referenced once → substituted as a derived table
Plan:    the substituted query is optimized as a whole
```

---

# 🏗️ Architecture Insight

A view containing a `WITH` clause gives you a reusable, named pipeline stored in the schema. It is often the best of both worlds: the readability of CTEs inside, a single stable interface outside.

---

# ⚡ Performance Tip

A `LIMIT` inside a CTE can make an otherwise expensive query cheap (the engine stops early), but it also blocks pushing outer filters into the CTE, because filtering before or after the limit gives different rows. Put limits where they are meant, and check the plan.

---

# 🌍 Production Consideration

Some tools and ORMs prepend statements, wrap queries in subqueries, or split batches in ways that break CTEs—for example, wrapping a query that starts with `WITH` inside `SELECT COUNT(*) FROM (…)` fails on SQL Server. Test CTE queries through the actual data-access layer.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Column list | Optional | Optional | Optional | Optional | Required if recursive | Optional |
| `WITH` in subquery | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `ORDER BY` in CTE | ✅ | ✅ | ✅ | Only with `TOP`/`OFFSET` | ✅ | ✅ |
| Previous statement needs `;` | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Unused CTE allowed | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

> **Portability Tip:** Put `WITH` at the start of a `SELECT`, alias every expression column, and put `ORDER BY` in the outer query. That form runs everywhere.

---

# Common Mistakes

### Mistake 1

Referencing a CTE from the next statement.

---

### Mistake 2

Naming a CTE after an existing table.

---

### Mistake 3

Leaving expression columns unnamed.

---

### Mistake 4

Forgetting the semicolon before `WITH` on SQL Server.

---

### Mistake 5

Expecting `ORDER BY` inside a CTE to order the final result.

---

# Best Practices

✔ Alias every computed column, or use a column list.

✔ Use unique, descriptive CTE names that do not collide with tables.

✔ Terminate every statement with a semicolon.

✔ Order results in the outermost query.

✔ Wrap reusable pipelines in views.

---

# Interview Questions

## Basic

1. What is the syntax of a CTE?
2. Can a CTE be used in the next statement?
3. What is a CTE column list?

## Intermediate

4. Can a later CTE reference an earlier one? Can an earlier one reference a later one?
5. Why does SQL Server sometimes report a syntax error near `WITH`?
6. Is the order of rows in a CTE preserved?

## Advanced

7. What happens when a CTE has the same name as a table?
8. Where can `WITH` appear in an `INSERT` statement on different engines?

---

# Hands-on Exercises

## Exercise 1

Write a CTE with a column list that returns customer ID and order count.

---

## Exercise 2

Create a view whose definition uses two CTEs.

---

## Exercise 3

Write the latest ten orders with a CTE, and output them oldest first.

---

# Related Topics

- **14.01 — Introduction to Common Table Expressions**
- **14.03 — Multiple and Chained CTEs**
- **14.10 — Data-Modifying CTEs (INSERT, UPDATE and DELETE)**
- **04.15 — SQL Identifiers**
- **09.02 — Subquery Syntax and Placement**

---

# Summary

A CTE is written `WITH name [(columns)] AS (query)` immediately before the statement that uses it. It is visible to that statement, to later CTEs in the same `WITH` clause and to subqueries within them—never to other statements. CTE names shadow tables, so never reuse a table name. `WITH` can appear in views, before or inside `INSERT` depending on the engine, and inside subqueries except on SQL Server, where the previous statement must end with a semicolon. Only the outermost `ORDER BY` orders the result; inside a CTE it matters only together with a row limit.
