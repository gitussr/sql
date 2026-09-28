---
title: "Chapter 14 - Common Table Expressions"
description: "Master SQL common table expressions: WITH clause syntax and scope, multiple and chained CTEs, CTEs versus subqueries and views, recursive CTEs for hierarchies, graphs and series, cycle detection with SEARCH and CYCLE, CTEs with aggregates and window functions, data-modifying CTEs, recursion limits, materialization and inlining, and how CTEs affect execution plans and index use."
chapter: 14
section: Introduction
category: Data Query Language (DQL)
difficulty: Beginner → Advanced
readingTime: 25 min
lastUpdated: 2026-09-28
---

# Chapter 14 — Common Table Expressions

> *"Name the steps, and the query explains itself."*

---

# Learning Objectives

By the end of this chapter, you will be able to:

- Write a common table expression (CTE) with the `WITH` clause and explain its scope.
- Break a complex query into a sequence of named, chained steps.
- Choose between a CTE, a derived table, a subquery, a view and a temporary table.
- Write recursive CTEs with an anchor member, a recursive member and a termination condition.
- Walk hierarchies such as org charts, category trees and bills of materials.
- Traverse graphs and detect cycles, with and without the standard `SEARCH` and `CYCLE` clauses.
- Generate sequences and series without a numbers table.
- Combine CTEs with aggregates and window functions for multi-step analysis.
- Use CTEs with `INSERT`, `UPDATE` and `DELETE`, where each engine allows it.
- Predict whether an engine inlines or materializes a CTE, and what that means for performance.

---

# Introduction

Chapter 09 showed how to nest one query inside another. Nesting works, but it reads inside-out: to understand the outer query you first have to find and understand the innermost one, and a subquery used twice has to be written twice.

A **common table expression** fixes both problems. It gives a subquery a **name**, defines it **before** the query that uses it, and lets later steps refer to it as often as they like:

```sql
WITH CustomerTotals AS (
    SELECT CustomerID, SUM(TotalAmount) AS Total
    FROM Orders
    GROUP BY CustomerID
)
SELECT c.CustomerName, t.Total
FROM CustomerTotals AS t
JOIN Customers AS c ON c.CustomerID = t.CustomerID
WHERE t.Total > (SELECT AVG(Total) FROM CustomerTotals);
```

CTEs also do something no plain subquery can: a **recursive** CTE refers to itself, which lets a single SQL statement walk a tree of any depth, follow a chain of references, or generate rows one after another.

This chapter covers both kinds, the differences between engines, and the performance questions—inlining versus materialization, recursion limits, and index use—that decide whether a CTE is fast.

---

# What is a Common Table Expression?

A CTE is a **named, temporary result set** that exists only for the duration of a single statement.

```text
WITH  step_1 AS ( … ),            ← defined first, named
      step_2 AS ( … step_1 … ),   ← can use earlier steps
      step_3 AS ( … step_2 … )
SELECT … FROM step_3 …;           ← the main query uses any of them

scope: this one statement only — gone when it finishes
```

Three properties explain most CTE behaviour:

1. **Named.** A CTE is referenced like a table, by name, as many times as needed.
2. **Statement-scoped.** Nothing is stored in the schema. Unlike a view, a CTE disappears after the statement; unlike a temporary table, it never exists between statements.
3. **Optionally recursive.** A recursive CTE combines a starting set (the *anchor*) with a query that references the CTE itself (the *recursive member*), repeating until no new rows appear.

---

# Basic Syntax

```sql
WITH cte_name [(column_list)] AS (
    query
)
[, another_cte AS ( query )]
SELECT … FROM cte_name …;

WITH RECURSIVE cte_name (column_list) AS (
    anchor_query
    UNION ALL
    recursive_query_referencing_cte_name
)
SELECT … FROM cte_name;
```

Example (recursive): the management chain above an employee.

```sql
WITH RECURSIVE Chain (EmployeeID, EmployeeName, ManagerID, Level) AS (
    SELECT EmployeeID, EmployeeName, ManagerID, 0
    FROM Employees
    WHERE EmployeeID = 42                          -- anchor: start here
    UNION ALL
    SELECT m.EmployeeID, m.EmployeeName, m.ManagerID, c.Level + 1
    FROM Employees AS m
    JOIN Chain     AS c ON m.EmployeeID = c.ManagerID   -- recursive: one level up
)
SELECT * FROM Chain ORDER BY Level;
```

SQL Server and Oracle write `WITH` without `RECURSIVE`; PostgreSQL and MySQL require it; SQLite accepts either.

---

# The Sample Schema

Every section of this chapter uses the Chapter 13 schema. `Employees.ManagerID` already makes employees a hierarchy; the chapter adds a category tree, a bill of materials and a route graph.

```sql
CREATE TABLE Employees (
    EmployeeID   INT PRIMARY KEY,
    EmployeeName VARCHAR(100) NOT NULL,
    ManagerID    INT REFERENCES Employees(EmployeeID),   -- NULL for the CEO
    DepartmentID INT,
    Salary       DECIMAL(10,2),
    HireDate     DATE NOT NULL
);

CREATE TABLE Categories (
    CategoryID       INT PRIMARY KEY,
    CategoryName     VARCHAR(100) NOT NULL,
    ParentCategoryID INT REFERENCES Categories(CategoryID)   -- NULL for top-level categories
);

CREATE TABLE Parts (
    PartID   INT PRIMARY KEY,
    PartName VARCHAR(100) NOT NULL,
    UnitCost DECIMAL(10,2) NOT NULL
);

CREATE TABLE BillOfMaterials (
    ParentPartID INT NOT NULL REFERENCES Parts(PartID),     -- assembly
    ChildPartID  INT NOT NULL REFERENCES Parts(PartID),     -- component
    Quantity     INT NOT NULL,
    PRIMARY KEY (ParentPartID, ChildPartID)
);

CREATE TABLE Routes (
    FromCity   VARCHAR(50) NOT NULL,
    ToCity     VARCHAR(50) NOT NULL,
    DistanceKm INT         NOT NULL,
    PRIMARY KEY (FromCity, ToCity)
);
```

`Customers`, `Orders`, `OrderItems`, `Products`, `DailySales`, `Holidays` and `Calendar` are unchanged from Chapter 13. `Products.CategoryID` references `Categories`.

---

# The CTE Toolkit

| Technique | What it does | Section |
|-----------|--------------|---------|
| Single CTE | Names one subquery | 14.02 |
| Chained CTEs | Builds a query as a pipeline of named steps | 14.03 |
| CTE vs alternatives | Subquery, derived table, view, temporary table | 14.04 |
| Recursive CTE | Anchor + recursive member until no new rows | 14.05 |
| Hierarchies | Trees: ancestors, descendants, levels, paths | 14.06 |
| Graphs | Paths between nodes, cycle detection, `SEARCH`, `CYCLE` | 14.07 |
| Series | Numbers, dates, string splitting | 14.08 |
| Multi-step analysis | CTEs with `GROUP BY` and window functions | 14.09 |
| Data-modifying CTEs | `WITH … INSERT / UPDATE / DELETE` | 14.10 |
| Recursion limits | `MAXRECURSION`, `cte_max_recursion_depth` | 14.11 |
| Patterns | Deduplication, top-N, running balances | 14.12 |
| Materialization | `MATERIALIZED`, `NOT MATERIALIZED`, inlining | 14.13 |

```text
                      every CTE answers:
   ┌──────────────────────┬──────────────────────────┬─────────────────────────────┐
   │ WHAT does this step  │ HOW OFTEN is it          │ IS it recursive, and what   │
   │ compute? (its name)  │ referenced? (inline or   │ stops it? (termination,     │
   │                      │  materialize)            │  cycles, limits)            │
   └──────────────────────┴──────────────────────────┴─────────────────────────────┘
```

---

# 📍 Execution Order Reminder

A CTE is evaluated as part of the `FROM` clause of whatever references it:

```text
1. FROM        ← CTEs are read here, like tables (inlined or materialized)
2. JOIN        ← CTEs join to tables and to each other
3. WHERE       ← outer filters may be pushed into an inlined CTE
4. GROUP BY
5. HAVING
6. WINDOW
7. SELECT
8. DISTINCT
9. ORDER BY    ← ORDER BY inside a CTE does not order the final result
10. LIMIT / FETCH / TOP
```

> Inside each CTE, the same order applies to the CTE's own query. The `WITH` clause itself is not a processing step: it only defines names that the steps above can read.

---

# How the DBMS Executes This

```text
SQL Statement with WITH
        │
        ▼
Parser: register CTE names; resolve references (CTE names shadow tables)
        │
        ▼
Optimizer, for each CTE:
  - non-recursive, referenced once      → usually INLINED (like a derived table)
  - referenced several times            → inlined per reference, or MATERIALIZED once
  - recursive                           → always evaluated iteratively into a work table
        │
        ▼
Executor: run the plan; recursive CTEs loop until an iteration produces no rows
```

Whether a CTE is inlined or materialized differs by engine and version—PostgreSQL before 12 always materialized, SQL Server never does—and it is the main reason the same CTE can be fast on one engine and slow on another.

---

# Chapter Structure

| Section | Topic |
|---------|-------|
| 14.01 | Introduction to Common Table Expressions |
| 14.02 | CTE Syntax and Scope |
| 14.03 | Multiple and Chained CTEs |
| 14.04 | CTEs vs Subqueries, Derived Tables and Views |
| 14.05 | Recursive CTEs (Anchor, Recursive Member and Termination) |
| 14.06 | Hierarchies with Recursive CTEs (Trees, Paths and Levels) |
| 14.07 | Graph Traversal and Cycle Detection (SEARCH and CYCLE) |
| 14.08 | Generating Series and Sequences with Recursive CTEs |
| 14.09 | CTEs with Aggregates and Window Functions |
| 14.10 | Data-Modifying CTEs (INSERT, UPDATE and DELETE) |
| 14.11 | Recursion Limits and Safety |
| 14.12 | Common CTE Patterns (Deduplication, Top-N and Running Balances) |
| 14.13 | Materialization and Inlining (MATERIALIZED and NOT MATERIALIZED) |
| 14.14 | Execution Flow of CTEs |
| 14.15 | CTE Performance and Index Strategy |
| 14.16 | Common CTE Mistakes & Best Practices |
| 14.17 | CTE Cheat Sheet & Visual Knowledge Map |

---

# Real-World Examples

## E-Commerce

```sql
WITH RECURSIVE Subtree AS (
    SELECT CategoryID FROM Categories WHERE CategoryName = 'Electronics'
    UNION ALL
    SELECT c.CategoryID
    FROM Categories AS c
    JOIN Subtree    AS s ON c.ParentCategoryID = s.CategoryID
)
SELECT p.ProductID, p.ProductName
FROM Products AS p
WHERE p.CategoryID IN (SELECT CategoryID FROM Subtree);
```

Every product in "Electronics" or any of its subcategories, at any depth.

---

## Banking

```sql
WITH Monthly AS (
    SELECT AccountID, DATE_TRUNC('month', PostedAt)::date AS Month, SUM(Amount) AS Net
    FROM Transactions
    GROUP BY AccountID, DATE_TRUNC('month', PostedAt)
)
SELECT AccountID, Month, Net,
       SUM(Net) OVER (PARTITION BY AccountID ORDER BY Month) AS RunningBalance
FROM Monthly;
```

Aggregate first, then run a window function over the aggregated rows—two steps, each named.

---

## Hospital

```sql
WITH LatestVitals AS (
    SELECT v.*, ROW_NUMBER() OVER (PARTITION BY PatientID ORDER BY RecordedAt DESC) AS rn
    FROM Vitals AS v
)
SELECT PatientID, RecordedAt, HeartRate, BloodPressure
FROM LatestVitals
WHERE rn = 1;
```

The most recent vital signs per patient.

---

## HRMS

```sql
WITH RECURSIVE Reports AS (
    SELECT EmployeeID, EmployeeName, 1 AS Depth
    FROM Employees WHERE ManagerID = 7
    UNION ALL
    SELECT e.EmployeeID, e.EmployeeName, r.Depth + 1
    FROM Employees AS e
    JOIN Reports   AS r ON e.ManagerID = r.EmployeeID
)
SELECT COUNT(*) AS Headcount, MAX(Depth) AS Layers FROM Reports;
```

Total headcount and number of management layers under manager 7.

---

## Manufacturing

```sql
WITH RECURSIVE Explosion (PartID, Quantity) AS (
    SELECT ChildPartID, Quantity FROM BillOfMaterials WHERE ParentPartID = 100
    UNION ALL
    SELECT b.ChildPartID, e.Quantity * b.Quantity
    FROM BillOfMaterials AS b
    JOIN Explosion       AS e ON b.ParentPartID = e.PartID
)
SELECT p.PartName, SUM(e.Quantity) AS TotalNeeded
FROM Explosion AS e JOIN Parts AS p ON p.PartID = e.PartID
GROUP BY p.PartName;
```

A bill-of-materials explosion: how many of each component one unit of assembly 100 needs.

---

# 🏗️ Architecture Insight

CTEs are the SQL equivalent of naming intermediate variables in a program. They do not add capability to non-recursive queries—anything a non-recursive CTE does, a derived table can do—but they change how queries are written, reviewed and maintained. Long reporting queries written as a pipeline of well-named CTEs can be read top to bottom, tested step by step (select from any intermediate CTE), and changed one step at a time.

---

# ⚡ Performance Tip

A CTE is not a cache. On most engines a non-recursive CTE referenced once is inlined and optimized exactly like the equivalent subquery; on SQL Server a CTE referenced three times is computed three times. If an expensive intermediate result is reused, check the plan—and materialize it explicitly (a `MATERIALIZED` hint or a temporary table) when the engine does not.

---

# 🔒 Security Note

A recursive CTE over user-controlled data can loop far longer than expected if the data contains a cycle—an employee who is their own manager's manager, a category that is its own ancestor. Protect recursive queries with a depth limit or cycle detection, and constrain hierarchical data (foreign keys, triggers or application checks) so cycles cannot be created in the first place.

---

# 🌍 Production Consideration

CTE behaviour differs sharply between engines and versions: materialization rules, whether `RECURSIVE` is required, default recursion limits, whether a CTE can precede `UPDATE` or `DELETE`, and how column types in recursive CTEs are inferred. A CTE-heavy query moved from PostgreSQL to SQL Server (or from PostgreSQL 11 to 12) can change performance by orders of magnitude. Test CTE-heavy queries on the exact engine and version in production.

---

# 🚀 Enterprise Practice

Enterprise SQL style guides commonly prefer CTEs over nested derived tables for any query with more than one intermediate step, require descriptive CTE names (`ActiveCustomers`, not `t1`), require explicit depth limits or cycle checks on every recursive CTE, and ban reusing an expensive CTE several times on engines that recompute it, in favour of temporary tables.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Non-recursive CTE | ✅ (SQL:1999) | ✅ (8.4+) | ✅ (8.0+) | ✅ (2005+) | ✅ (9iR2+) | ✅ (3.8.3+) |
| Recursive CTE | ✅ | ✅ | ✅ (8.0+) | ✅ | ✅ (11gR2+) | ✅ |
| `RECURSIVE` keyword | Required | Required | Required | Not allowed | Not allowed | Optional |
| `SEARCH` / `CYCLE` | ✅ | ✅ (14+) | ❌ | ❌ | ✅ | ❌ |
| Materialization hint | ❌ | `MATERIALIZED` (12+) | ❌ (optimizer hints) | ❌ | `/*+ MATERIALIZE */` | `MATERIALIZED` (3.35+) |
| Default recursion limit | ❌ | None | 1000 | 100 | None (cycle error) | None |
| Data-modifying CTE | ❌ | ✅ | ❌ | Update through CTE | ❌ | ❌ |

> **Portability Tip:** A non-recursive `WITH` clause followed by `SELECT` is portable to every current engine. Recursive CTEs are portable too, apart from the `RECURSIVE` keyword—which SQL Server and Oracle reject and PostgreSQL and MySQL require.

---

# Common Mistakes

- Assuming a CTE is computed once and cached.
- Writing a recursive CTE with no termination condition or cycle protection.
- Using `ORDER BY` inside a CTE and expecting the final result to be ordered.
- Forgetting the semicolon before `WITH` on SQL Server.
- Letting a recursive path string be truncated because its type comes from the anchor.
- Referencing a CTE from a different statement.
- Writing a CTE chain so long that the optimizer's estimates become unreliable.

---

# Best Practices

✔ Name CTEs after what they contain.

✔ Build complex queries as a pipeline of small CTEs, one idea per step.

✔ Give every recursive CTE a termination condition, and a depth limit or cycle check.

✔ Cast recursive columns (paths, levels) to explicit types in the anchor.

✔ Check the plan when a CTE is referenced more than once.

✔ Put the final `ORDER BY` in the outer query.

---

# 💡 Did You Know?

Oracle called CTEs "subquery factoring" when it introduced the `WITH` clause in Oracle 9i Release 2 (2002), and it walked hierarchies with its own `CONNECT BY` syntax for decades before supporting standard recursive CTEs in 11g Release 2 (2009). `CONNECT BY` is still widely used in Oracle code, and it still has features—such as `SYS_CONNECT_BY_PATH` and `CONNECT_BY_ISLEAF`—that recursive CTEs have to emulate.

---

# Related Topics

- **Chapter 09 — Subqueries**
- **09.08 — Derived Tables (Subqueries in FROM)**
- **09.13 — Subqueries vs JOINs**
- **07.08 — SELF JOIN**
- **03.09.08 — Hierarchical (Tree) Pattern**
- **11.10 — Top-N per Group, Deduplication and QUALIFY**
- **13.11 — Generating Date Series and Calendar Tables**
- **15.xx — Query Optimization**

---

# Summary

A common table expression names a subquery with the `WITH` clause, defines it before the query that uses it, and can be referenced any number of times within one statement. Non-recursive CTEs turn nested queries into readable pipelines of named steps; recursive CTEs combine an anchor with a self-referencing member to walk hierarchies and graphs and to generate sequences. CTEs are statement-scoped, not cached: engines inline or materialize them by different rules, recursion needs explicit termination and cycle protection, and syntax details such as the `RECURSIVE` keyword and data-modifying CTEs differ by engine.
