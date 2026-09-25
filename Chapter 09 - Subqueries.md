---
title: "Chapter 09 - Subqueries"
description: "Master SQL subqueries: scalar, row and table subqueries, IN and EXISTS, ANY and ALL, correlated subqueries, derived tables, LATERAL and APPLY, subqueries in data modification, NULL traps, subqueries versus joins, and how optimizers unnest and index them."
chapter: 9
section: Introduction
category: Data Query Language (DQL)
difficulty: Beginner → Advanced
readingTime: 25 min
lastUpdated: 2026-09-25
---

# Chapter 09 — Subqueries

> *"Ask the small question first, then ask the big one with its answer."*

---

# Learning Objectives

By the end of this chapter, you will be able to:

- Explain what a subquery is and where one may appear in a statement.
- Tell scalar, row and table subqueries apart, and predict what each returns.
- Filter with `IN`, `NOT IN`, `EXISTS` and `NOT EXISTS`, and choose between them.
- Compare a value with a set using `ANY`, `SOME` and `ALL`.
- Write correlated subqueries and reason about how often they run.
- Use derived tables to pre-aggregate, rank and reshape data before joining it.
- Use `LATERAL` and `CROSS APPLY` for per-row "top N" and computed columns.
- Drive `INSERT`, `UPDATE` and `DELETE` from subqueries safely.
- Avoid the `NULL` traps of `NOT IN` and empty scalar subqueries.
- Decide between a subquery and a join, and describe how optimizers unnest subqueries.

---

# Introduction

Chapter 06 filtered rows with conditions on their own columns. Chapter 07 combined tables. Chapter 08 summarised them.

This chapter lets one query **use the answer of another**.

Many business questions contain a second question inside them:

- Which products cost more than the **average price**?
- Which customers have **never placed an order**?
- What was each customer's **most recent order**?
- Which departments pay above the **company average**?

The inner question—the average price, the set of customers with orders, the latest order date—is a query in its own right. A **subquery** is that inner query, written in parentheses inside the outer one. The database evaluates it and hands its result to the outer query as a value, a list, or a table.

Subqueries are also where readable SQL most often turns slow or wrong. A `NOT IN` over a column containing one `NULL` returns nothing. A scalar subquery that finds two rows raises a runtime error only when the data changes. A correlated subquery that runs once per outer row can turn a millisecond query into a minute-long one—unless the optimizer rewrites it into a join. This chapter treats each of those as a first-class topic.

---

# What is a Subquery?

A subquery is a complete `SELECT` statement nested inside another statement.

```text
Outer query
┌──────────────────────────────────────────────────────────────┐
│ SELECT ProductName, ListPrice                                │
│ FROM Products                                                │
│ WHERE ListPrice > ┌──────────────────────────────────────┐   │
│                   │ (SELECT AVG(ListPrice) FROM Products) │   │  → 42.50
│                   └──────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                     inner query (subquery)

Step 1: inner query   → 42.50
Step 2: outer query   → WHERE ListPrice > 42.50
```

Two observations explain most subquery behaviour:

1. **The shape of the result decides where it may go.** A subquery that returns one value can stand wherever a value can. A subquery that returns a column of values can follow `IN`, `ANY` or `ALL`. A subquery that returns a table can sit in `FROM`.
2. **A subquery may depend on the outer row.** An *uncorrelated* subquery is evaluated once. A *correlated* subquery references a column of the outer query, and is logically evaluated once per outer row.

---

# Basic Syntax

```sql
SELECT columns
FROM table_name
WHERE expression operator (SELECT column FROM other_table WHERE condition);
```

Example:

```sql
SELECT
    c.CustomerID,
    c.CustomerName
FROM Customers AS c
WHERE c.CustomerID IN (
    SELECT o.CustomerID
    FROM Orders AS o
    WHERE o.OrderDate >= DATE '2026-01-01'
);
```

Customers who placed at least one order in 2026.

---

# The Sample Schema

Every section of this chapter uses the Chapter 08 schema, plus a `Returns` table for returned order lines.

```sql
CREATE TABLE Customers (
    CustomerID   INT PRIMARY KEY,
    CustomerName VARCHAR(100) NOT NULL,
    Country      VARCHAR(50)
);

CREATE TABLE Orders (
    OrderID     INT PRIMARY KEY,
    CustomerID  INT REFERENCES Customers(CustomerID),   -- NULL for guest checkouts
    OrderDate   DATE          NOT NULL,
    Status      VARCHAR(20)   NOT NULL,   -- 'Pending', 'Shipped', 'Cancelled'
    TotalAmount DECIMAL(10,2) NOT NULL
);

CREATE TABLE Products (
    ProductID   INT PRIMARY KEY,
    ProductName VARCHAR(100) NOT NULL,
    CategoryID  INT,
    ListPrice   DECIMAL(10,2)
);

CREATE TABLE OrderItems (
    OrderItemID INT PRIMARY KEY,
    OrderID     INT REFERENCES Orders(OrderID),
    ProductID   INT REFERENCES Products(ProductID),
    Quantity    INT           NOT NULL,
    UnitPrice   DECIMAL(10,2) NOT NULL
);

CREATE TABLE Returns (
    ReturnID    INT PRIMARY KEY,
    OrderID     INT NOT NULL REFERENCES Orders(OrderID),
    ProductID   INT NOT NULL REFERENCES Products(ProductID),
    CustomerID  INT REFERENCES Customers(CustomerID),
    ReturnDate  DATE NOT NULL
);

CREATE TABLE Departments (
    DepartmentID   INT PRIMARY KEY,
    DepartmentName VARCHAR(100) NOT NULL
);

CREATE TABLE Employees (
    EmployeeID   INT PRIMARY KEY,
    EmployeeName VARCHAR(100) NOT NULL,
    ManagerID    INT REFERENCES Employees(EmployeeID),
    DepartmentID INT REFERENCES Departments(DepartmentID),
    Salary       DECIMAL(10,2),           -- NULL for contractors
    HireDate     DATE NOT NULL
);
```

```text
Customers ──1:N── Orders ──1:N── OrderItems ──N:1── Products
                    └──1:N── Returns (OrderID, ProductID) ──N:1── Products

Departments ──1:N── Employees ── self-referencing (ManagerID → EmployeeID)
```

> **Note:** `Orders.CustomerID` is nullable in this chapter: guest checkouts have no customer. That single `NULL` is enough to demonstrate the `NOT IN` trap in Section 09.12.

---

# The Subquery Toolkit

| Form | Returns | Typical use | Section |
|------|---------|-------------|---------|
| Scalar subquery | One value | Compare with, or display, a single figure | 09.03 |
| `IN` / `NOT IN` subquery | One column | Membership in a set | 09.04 |
| `EXISTS` / `NOT EXISTS` | TRUE / FALSE | "Has at least one" / "has none" | 09.05 |
| `ANY` / `SOME` / `ALL` | One column | Compare with every or some member | 09.06 |
| Correlated subquery | Depends on outer row | Per-row lookups and comparisons | 09.07 |
| Derived table | A table | Pre-aggregate, rank or reshape before joining | 09.08 |
| `LATERAL` / `CROSS APPLY` | A table per outer row | Top N per group, per-row computations | 09.10 |

```text
             what the subquery returns
   ┌──────────────┬──────────────────┬─────────────────────┐
   │  one value   │   one column     │   rows × columns    │
   │  (scalar)    │   (a list)       │   (a table)         │
   └──────┬───────┴────────┬─────────┴──────────┬──────────┘
          │                │                    │
   anywhere a value   IN, ANY, ALL,        FROM (derived table),
   can appear         EXISTS               LATERAL / APPLY
```

---

# 📍 Execution Order Reminder

A subquery has its own complete execution order. Where it sits in the outer query decides when its result is needed:

```text
1. FROM        ← derived tables and LATERAL subqueries are evaluated here
2. JOIN
3. WHERE       ← IN / EXISTS / ANY / ALL / scalar subqueries filter rows here
4. GROUP BY
5. HAVING      ← subqueries compare groups with other figures here
6. SELECT      ← scalar subqueries compute columns here
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

> This is the *logical* order. An optimizer is free to evaluate an uncorrelated subquery once up front, or to rewrite a subquery into a join—provided the result is the same.

---

# How the DBMS Executes This

```text
SQL Statement with subquery
        │
        ▼
Parse and bind (outer references resolved)
        │
        ▼
Rewrite: can the subquery be unnested?
        │
   ┌────┴─────────────────────────┐
   ▼                              ▼
Yes → semi-join / anti-join /   No → evaluate subquery
      join with derived table        once (uncorrelated) or
                                     per outer row (correlated,
                                     often cached)
   │                              │
   └────────────┬─────────────────┘
                ▼
        Optimized plan → execution
```

Most modern optimizers turn `IN` and `EXISTS` subqueries into semi-joins, `NOT EXISTS` into anti-joins, and many correlated scalar subqueries into joins against a grouped derived table. Sections 09.14 and 09.15 show when that works and when it does not.

---

# Chapter Structure

| Section | Topic |
|---------|-------|
| 09.01 | Introduction to Subqueries |
| 09.02 | Subquery Syntax and Placement |
| 09.03 | Scalar Subqueries |
| 09.04 | IN and NOT IN with Subqueries |
| 09.05 | EXISTS and NOT EXISTS |
| 09.06 | ANY, SOME and ALL |
| 09.07 | Correlated Subqueries |
| 09.08 | Derived Tables (Subqueries in FROM) |
| 09.09 | Subqueries with Aggregates (Comparing Rows to Group Figures) |
| 09.10 | LATERAL and CROSS APPLY |
| 09.11 | Subqueries in INSERT, UPDATE and DELETE |
| 09.12 | NULL Handling in Subqueries |
| 09.13 | Subqueries vs JOINs |
| 09.14 | Execution Flow of Subqueries (Unnesting and Decorrelation) |
| 09.15 | Subquery Performance and Index Strategy |
| 09.16 | Common Subquery Mistakes & Best Practices |
| 09.17 | Subquery Cheat Sheet & Visual Knowledge Map |

---

# Real-World Examples

## E-Commerce

```sql
SELECT p.ProductID, p.ProductName
FROM Products AS p
WHERE NOT EXISTS (
    SELECT 1
    FROM OrderItems AS oi
    WHERE oi.ProductID = p.ProductID
);
```

Products that have never been sold—an anti-join written as `NOT EXISTS`.

---

## Banking

```sql
SELECT a.AccountID, a.Balance
FROM Accounts AS a
WHERE a.Balance > (
    SELECT AVG(a2.Balance)
    FROM Accounts AS a2
    WHERE a2.BranchID = a.BranchID
);
```

Accounts holding more than the average balance of their own branch—a correlated scalar subquery.

---

## Hospital

```sql
SELECT p.PatientID, p.PatientName
FROM Patients AS p
WHERE p.PatientID IN (
    SELECT a.PatientID
    FROM Admissions AS a
    WHERE a.AdmitDate >= CURRENT_DATE - INTERVAL '30' DAY
);
```

Patients admitted in the last thirty days.

---

## HRMS

```sql
SELECT d.DepartmentName, s.Headcount, s.Payroll
FROM Departments AS d
JOIN (
    SELECT DepartmentID, COUNT(*) AS Headcount, SUM(Salary) AS Payroll
    FROM Employees
    GROUP BY DepartmentID
) AS s ON s.DepartmentID = d.DepartmentID;
```

Headcount and payroll per department, aggregated in a derived table before the join.

---

## Social Media

```sql
SELECT u.UserID, latest.PostID, latest.CreatedAt
FROM Users AS u
CROSS JOIN LATERAL (
    SELECT p.PostID, p.CreatedAt
    FROM Posts AS p
    WHERE p.UserID = u.UserID
    ORDER BY p.CreatedAt DESC
    FETCH FIRST 3 ROWS ONLY
) AS latest;
```

Each user's three latest posts (PostgreSQL / Oracle `LATERAL`; SQL Server writes `CROSS APPLY`).

---

# 🏗️ Architecture Insight

A subquery is a **named step of reasoning** embedded in one statement. That makes it a design tool, not only a syntax feature: a derived table fixes the grain of an intermediate result, a semi-join states "at least one" without duplicating rows, and a scalar subquery states "exactly one" as a checked assumption. Complex reports are easiest to review when each step is a subquery (or a common table expression) whose output grain is obvious.

---

# ⚡ Performance Tip

Write the subquery that states the question most clearly, then read the execution plan. Modern optimizers unnest most `IN` and `EXISTS` subqueries into joins, so the readable form usually costs nothing. The cases to watch are correlated subqueries the optimizer cannot decorrelate—they appear in the plan as a subquery node executed once per outer row—and they are fixed with a supporting index or a rewrite into a grouped derived table.

---

# 🔒 Security Note

Subqueries do not bypass permissions: the user needs `SELECT` on every table a subquery reads, and row-level security policies apply inside subqueries exactly as they do in the outer query. They are, however, a common vehicle for SQL injection (`... WHERE id = 1 AND EXISTS (SELECT ...)` probes a database one bit at a time), which is one more reason every value from outside the application must be a bound parameter.

---

# 🌍 Production Consideration

The most dangerous subquery bugs depend on data, not code. A `NOT IN` works until the first `NULL` appears in the inner column; a scalar subquery works until a second matching row appears and the query fails with "more than one row returned". Defensive forms—`NOT EXISTS` instead of `NOT IN`, and scalar subqueries backed by a unique key or an explicit `MAX`/`FETCH FIRST 1`—prevent both.

---

# 🚀 Enterprise Practice

Enterprise SQL standards commonly require `NOT EXISTS` rather than `NOT IN` for exclusions, qualified column names (with table aliases) inside every subquery, `EXISTS` for "at least one" checks instead of `COUNT(*) > 0`, and a maximum nesting depth—beyond which a derived table or common table expression must be used and named.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Scalar / `IN` / `EXISTS` subqueries | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ANY` / `SOME` / `ALL` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Row-value subquery `(a, b) IN (SELECT …)` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ (3.15+) |
| Derived table alias required | ✅ | Optional (16+) | ✅ | ✅ | Optional | Optional |
| `LATERAL` | ✅ | ✅ | ✅ (8.0.14+) | `CROSS / OUTER APPLY` | ✅ (12c+) | ❌ |
| `LIMIT` inside `IN` subquery | n/a | ✅ | ❌ | `TOP` ✅ | ✅ | ✅ |

> **Portability Tip:** Scalar subqueries, `IN`, `EXISTS`, `NOT EXISTS` and aliased derived tables behave the same everywhere. `ANY`/`ALL`, row-value comparisons, `LATERAL`/`APPLY` and row limits inside subqueries are the portability hazards.

---

# Common Mistakes

- Using `NOT IN` against a column that can contain `NULL`.
- Writing a scalar subquery that can return more than one row.
- Forgetting that a scalar subquery with no rows returns `NULL`.
- Referencing an unqualified column that silently binds to the outer query.
- Using `COUNT(*) > 0` in a subquery where `EXISTS` states the intent.
- Omitting the alias on a derived table.
- Assuming a correlated subquery always runs once per row—or never does.

---

# Best Practices

✔ Qualify every column inside a subquery with a table alias.

✔ Use `NOT EXISTS` for exclusions.

✔ Back every scalar subquery with a unique key or an aggregate.

✔ Use `EXISTS` for "at least one", not `COUNT(*) > 0`.

✔ Name derived tables after what one of their rows represents.

✔ Read the execution plan of any correlated subquery over a large table.

---

# 💡 Did You Know?

The "S" in the original IBM language SEQUEL stood for *Structured*, and nesting was the structure: early SEQUEL expressed what we now write as joins by nesting query blocks with `IN`. Joins in `FROM` came later. That is why every major optimizer still contains a large rewrite component whose job is to turn nested query blocks back into joins.

---

# Related Topics

- **Chapter 08 — GROUP BY and HAVING**
- **06.10 — EXISTS and Subqueries in WHERE (Introduction)**
- **06.06 — IN and NOT IN**
- **07.13 — Semi-Joins and Anti-Joins (EXISTS and NOT EXISTS)**
- **06.08 — NULL Handling in WHERE (Three-Valued Logic)**
- **04.19 — SQL Execution Order**
- **10.xx — Indexes**
- **11.xx — Window Functions**

---

# Summary

A subquery is a complete query nested inside another, whose result the outer query uses as a value, a list or a table. Its shape decides where it may appear: scalar subqueries wherever a value fits, single-column subqueries after `IN`, `ANY` and `ALL`, `EXISTS` for a yes/no test, and table subqueries in `FROM` or behind `LATERAL`. Uncorrelated subqueries are logically evaluated once; correlated subqueries once per outer row, though optimizers routinely unnest both into joins. The chapter's recurring themes are the `NULL` trap of `NOT IN`, the single-row contract of scalar subqueries, and knowing when a subquery and a join express the same question.
