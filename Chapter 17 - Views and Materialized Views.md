---
title: "Chapter 17 - Views and Materialized Views"
description: "Learn SQL views and materialized views: creating and managing views, how engines expand them into queries, updatable views, WITH CHECK OPTION and INSTEAD OF triggers, views for security, dependencies and schema binding, layered view design, materialized views and their refresh strategies, indexed views and query rewrite, summary tables for reporting, execution flow, performance, common mistakes and a cheat sheet."
chapter: 17
section: Introduction
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 25 min
lastUpdated: 2026-10-09
---

# Chapter 17 — Views and Materialized Views

> *"A view is a query with a name. A materialized view is a query with a name and a memory—and every memory eventually goes stale."*

---

# Learning Objectives

By the end of this chapter, you will be able to:

- Create, replace, alter and drop views on every major engine.
- Explain how the optimizer expands a view into the query that uses it, and when it cannot.
- Write through views with `INSERT`, `UPDATE` and `DELETE`, and know which views are updatable.
- Protect view-based writes with `WITH CHECK OPTION` and `INSTEAD OF` triggers.
- Use views to expose only the rows and columns each role should see.
- Manage view dependencies, schema binding and schema changes safely.
- Design layered views without creating unreadable, slow view stacks.
- Create materialized views, choose a refresh strategy and keep them fresh enough.
- Use SQL Server indexed views and Oracle query rewrite.
- Build summary tables for reporting and decide between a view, a materialized view and a table.

---

# Introduction

Chapter 14 showed how a CTE names a query for the duration of one statement. A **view** names a query permanently: it is stored in the database catalog, has its own permissions, and can be used anywhere a table can. A **materialized view** goes one step further and stores the query's *result*, so reading it costs as much as reading a table—at the price of keeping that result up to date.

Views are one of the oldest abstractions in SQL and one of the most misunderstood. Used well, they give applications a stable interface while the tables underneath change, hide columns that most users must not see, and give every report the same definition of "active customer" or "net revenue". Used badly, they become ten-level stacks of views over views that nobody can read, that join tables the query never needed, and that the optimizer cannot simplify.

Materialized views solve a different problem: a query that is too expensive to run every time someone opens a dashboard. They trade **freshness** for **speed**, and the central design question is always the same: how stale may this result be, and what does it cost to refresh it?

---

# What is a View?

```text
CREATE VIEW                                        What the engine stores
CREATE VIEW ActiveCustomers AS                     catalog entry: ActiveCustomers
SELECT CustomerID, CustomerName, Country             definition: SELECT … FROM Customers WHERE …
FROM Customers                                       columns: CustomerID, CustomerName, Country
WHERE IsActive = 1;                                  permissions, dependencies
                                                   NO rows are stored
```

A **view** is a stored, named `SELECT` statement. When a query references it, the engine replaces the view name with its definition—much as if you had written the definition as a derived table—and optimizes the combined query. A view stores no data (except as noted below), so it is always exactly as current as its base tables.

A **materialized view** stores the result of its query as a physical table. Reading it is fast, it can be indexed, and it does not reflect changes to the base tables until it is **refreshed**—manually, on a schedule, on commit, or incrementally from change logs, depending on the engine.

| | View | Materialized view |
|---|------|-------------------|
| Stores | Definition only | Definition **and** result rows |
| Freshness | Always current | As of the last refresh |
| Read cost | Cost of the underlying query | Cost of reading the stored result |
| Write cost | None | Refresh cost, plus logging on base tables for incremental refresh |
| Indexes | Not directly (SQL Server indexed views are the exception) | Yes |

---

# Basic Syntax

```sql
-- view
CREATE VIEW ActiveCustomers AS
SELECT CustomerID, CustomerName, Country
FROM Customers
WHERE IsActive = 1;

SELECT CustomerName
FROM ActiveCustomers
WHERE Country = 'IN';

-- materialized view (PostgreSQL / Oracle)
CREATE MATERIALIZED VIEW DailySales AS
SELECT CAST(o.OrderDate AS DATE) AS SalesDate,
       COUNT(*)                  AS OrderCount,
       SUM(o.TotalAmount)        AS Revenue
FROM Orders o
GROUP BY CAST(o.OrderDate AS DATE);

REFRESH MATERIALIZED VIEW DailySales;   -- PostgreSQL
```

---

# The Sample Schema

Every section uses the schema and assumed sizes of Chapters 15 and 16:

```text
Table          Rows (approx.)   Notes
Customers        1,000,000      CustomerID, CustomerName, Email, Country, IsActive, CreatedAt
Orders          10,000,000      OrderID, CustomerID, OrderDate, Status, TotalAmount, CreatedAt
OrderItems      40,000,000      OrderID, ProductID, Quantity, UnitPrice
Products           50,000       ProductID, ProductName, CategoryID, ListPrice
Categories          2,000       CategoryID, CategoryName
Employees          20,000       EmployeeID, EmployeeName, DepartmentID, ManagerID, Salary, HireDate
Events         500,000,000      append-only, partitioned by month
```

---

# The View Toolkit

| Topic | What it gives you | Section |
|-------|-------------------|---------|
| Creating and managing | `CREATE`, `OR REPLACE`, `ALTER`, `DROP`, options | 17.02 |
| Expansion | How views are merged into queries, and when they are not | 17.03 |
| Updatable views | Writing through views | 17.04 |
| Write rules | `WITH CHECK OPTION`, `INSTEAD OF` triggers | 17.05 |
| Security | Row- and column-level access through views | 17.06 |
| Dependencies | Schema binding, invalid views, safe changes | 17.07 |
| Layering | Nested views and how to keep them sane | 17.08 |
| Materialized views | Storing results, choosing a design | 17.09 |
| Refresh | Complete, incremental, concurrent, on commit | 17.10 |
| Indexed views and rewrite | SQL Server indexed views, Oracle query rewrite | 17.11 |
| Indexing | Indexes on materialized views | 17.12 |
| Summary tables | Pre-aggregation for reporting | 17.13 |

```text
                       every view design answers four questions:
   ┌────────────────────┬────────────────────┬────────────────────┬────────────────────┐
   │ WHAT DOES IT       │ WHO MAY SEE        │ HOW FRESH MUST     │ WHAT DOES IT COST  │
   │ HIDE OR NAME?      │ AND CHANGE IT?     │ IT BE?             │ TO READ AND KEEP?  │
   │ (interface,        │ (grants, row and   │ (live view vs      │ (expansion, joins, │
   │  business rules)   │  column filters)   │  refresh schedule) │  refresh, storage) │
   └────────────────────┴────────────────────┴────────────────────┴────────────────────┘
```

---

# 📍 Execution Order Reminder

A view does not add a step to the logical order; its definition is processed as part of the query that uses it:

```text
1. FROM        ← the view name is replaced by its definition (or read from storage if materialized)
2. JOIN        ← joins inside the view and joins to the view are optimized together
3. WHERE       ← outer predicates are pushed into the view's definition when it is safe
4. GROUP BY    ← a view with GROUP BY is evaluated as a unit unless the predicate is on grouping columns
5. HAVING      ← filters on the view's aggregates
6. WINDOW      ← window functions inside a view block most predicate pushdown
7. SELECT      ← unused view columns can be pruned, and unneeded joins eliminated
8. DISTINCT    ← DISTINCT inside a view also limits merging
9. ORDER BY    ← ORDER BY inside a view is not guaranteed to survive; order in the outer query
10. LIMIT / FETCH / TOP   ← a limit inside a view prevents merging; a limit outside it can stop early
```

> A materialized view is different: its definition ran at refresh time. At query time it is read like a table, and only the outer query's clauses apply.

---

# How the DBMS Executes This

```text
Query references a view
   │
   ▼
Parser looks up the name in the catalog → finds a view → checks permissions on the view
   │
   ▼
Rewriter replaces the view with its stored definition (a derived table)
   │   view merging: definition folded into the outer query block when safe
   │   otherwise:    definition kept as a separate block (subquery scan / temp table / VIEW operator)
   ▼
Optimizer plans the combined query: pushdown, join elimination, column pruning
   │
   ▼
Executor runs the plan; base tables are read with the permissions of the view owner or the caller

Query references a materialized view
   │
   ▼
Plan reads the stored rows like a table (with its indexes); no base-table access
Optionally (Oracle, SQL Server Enterprise): queries against BASE tables are rewritten to read the MV
```

---

# Chapter Structure

| Section | Topic |
|---------|-------|
| 17.01 | Introduction to Views |
| 17.02 | Creating and Managing Views (CREATE, ALTER, DROP and OR REPLACE) |
| 17.03 | How Views Are Expanded (View Merging and Predicate Pushdown) |
| 17.04 | Updatable Views (INSERT, UPDATE and DELETE Through Views) |
| 17.05 | WITH CHECK OPTION and INSTEAD OF Triggers |
| 17.06 | Views for Security (Row-Level and Column-Level Access) |
| 17.07 | View Dependencies, Schema Binding and Schema Changes |
| 17.08 | Nested Views and Layered View Design |
| 17.09 | Materialized View Fundamentals |
| 17.10 | Refreshing Materialized Views (Complete, Incremental and Concurrent) |
| 17.11 | Indexed Views and Automatic Query Rewrite |
| 17.12 | Indexing Materialized Views |
| 17.13 | Summary Tables and Reporting Patterns |
| 17.14 | Execution Flow of Views and Materialized Views |
| 17.15 | View Performance and Index Strategy |
| 17.16 | Common View Mistakes & Best Practices |
| 17.17 | View Cheat Sheet & Visual Knowledge Map |

---

# Real-World Examples

## E-Commerce

```sql
CREATE VIEW OrderSummary AS
SELECT o.OrderID, o.OrderDate, o.Status, c.CustomerName, c.Country,
       SUM(oi.Quantity * oi.UnitPrice) AS ItemsTotal
FROM Orders o
JOIN Customers c   ON c.CustomerID = o.CustomerID
JOIN OrderItems oi ON oi.OrderID   = o.OrderID
GROUP BY o.OrderID, o.OrderDate, o.Status, c.CustomerName, c.Country;
```

One definition of an order total, used by the storefront, the support tool and the finance export. When the finance team later adds discounts, one view changes instead of forty queries.

---

## Banking

```sql
CREATE VIEW BranchAccounts AS
SELECT AccountID, AccountNo, Balance, BranchID
FROM Accounts
WHERE BranchID = CAST(current_setting('app.branch_id') AS INT);
```

Tellers query `BranchAccounts`, never `Accounts`; each session sees only its own branch's accounts (Section 17.06).

---

## Hospital

```sql
CREATE VIEW PatientDirectory AS
SELECT PatientID, FirstName, LastName, Ward, AdmittedAt
FROM Patients;          -- no diagnosis, no national ID, no insurance number
```

Reception staff get `SELECT` on the view and nothing on `Patients`. Column-level hiding by construction.

---

## HRMS

```sql
CREATE MATERIALIZED VIEW DepartmentHeadcount AS
SELECT DepartmentID, COUNT(*) AS Headcount, AVG(Salary) AS AvgSalary
FROM Employees
GROUP BY DepartmentID;
-- refreshed nightly; the HR dashboard reads 300 rows instead of aggregating 20,000
```

---

## Social Media

```sql
-- PostgreSQL: trending hashtags over the last hour, refreshed every minute without blocking readers
CREATE MATERIALIZED VIEW TrendingTags AS
SELECT Tag, COUNT(*) AS Mentions
FROM PostTags
WHERE CreatedAt >= now() - INTERVAL '1 hour'
GROUP BY Tag;

CREATE UNIQUE INDEX ux_trendingtags_tag ON TrendingTags (Tag);
REFRESH MATERIALIZED VIEW CONCURRENTLY TrendingTags;
```

Millions of reads per minute hit a few thousand pre-counted rows; the counts are at most a minute old—an acceptable trade for a trending list (Section 17.10).

---

# 🏗️ Architecture Insight

Views are the database's version of an interface. Applications that query views instead of tables can survive table splits, column renames and denormalization changes without a release, because the view keeps presenting the old shape. Treat view definitions like public APIs: version them, review them, and change them deliberately.

---

# ⚡ Performance Tip

A plain view is never faster than the query it contains—it *is* that query. Its performance depends on whether the optimizer can merge it into the outer query and push predicates into it (Section 17.03). When a view is slow, read the plan of the query that uses it, not the view in isolation.

---

# 🔒 Security Note

Views are a classic access-control tool: grant `SELECT` on a view and nothing on its tables, and users see only what the view exposes. But a view does not, by itself, stop clever predicates from leaking hidden rows through error messages or side effects in some engines; use security barriers or row-level security where that matters (Section 17.06).

---

# 🌍 Production Consideration

Every materialized view is a copy of data with a freshness contract. Document how stale each one may be, monitor the time of its last successful refresh, and alert when a refresh fails or runs long. A dashboard silently showing yesterday's numbers is a production incident.

---

# 🚀 Enterprise Practice

Large teams keep view definitions in source control with migrations, name them by layer (`stg_`, `int_`, `rpt_` or schemas such as `reporting`), grant access to views rather than tables, and run dependency checks in CI so that a column dropped from a table cannot silently break a view used by finance.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `CREATE VIEW` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `CREATE OR REPLACE VIEW` | ❌ | ✅ (compatible columns only) | ✅ | `CREATE OR ALTER` (2016 SP1+) | ✅ | ❌ (drop and recreate) |
| Updatable views | ✅ | ✅ (simple views, 9.3+) | ✅ (MERGE algorithm) | ✅ (one base table per statement) | ✅ (key-preserved tables) | ❌ (`INSTEAD OF` triggers only) |
| `WITH CHECK OPTION` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Materialized views | ❌ | ✅ (manual refresh) | ❌ | Indexed views | ✅ (rich refresh options) | ❌ |
| Query rewrite to MVs | ❌ | ❌ | ❌ | ✅ (Enterprise; `NOEXPAND` elsewhere) | ✅ | ❌ |

> **Portability Tip:** Plain views are among the most portable features in SQL. Materialized views are not: PostgreSQL, Oracle and SQL Server each implement a different idea under a different name, and MySQL and SQLite need summary tables maintained by jobs or triggers (Section 17.13).

---

# Common Mistakes

- Expecting a view to make a query faster by itself.
- Using `SELECT *` in a view and being surprised when new table columns do not appear—or when dropped ones break it.
- Building views on views on views until no one can tell which tables a query reads.
- Putting `ORDER BY` in a view and relying on it.
- Granting access to a view while leaving the base tables readable.
- Creating a materialized view without a refresh schedule, monitoring or freshness contract.
- Refreshing a large materialized view completely when only a few rows changed.

---

# Best Practices

✔ Use views to name business rules and to give applications a stable interface.

✔ List columns explicitly in view definitions.

✔ Keep view layers shallow, and know which tables each view really needs.

✔ Read the plan of the queries that use a view, not just the view.

✔ Grant on views, not tables, when views are your access-control layer.

✔ Give every materialized view a refresh strategy, a freshness target and monitoring.

---

# 💡 Did You Know?

Views were part of IBM's System R research prototype in the 1970s, before SQL was standardized, and the problem of deciding which views can be updated was hard enough to become a research topic of its own. The "view update problem" is still why every engine has slightly different rules for writing through views (Section 17.04).

---

# Related Topics

- **14.04 — CTEs vs Subqueries, Derived Tables and Views**
- **09.08 — Derived Tables (Subqueries in FROM)**
- **15.04 — Automatic Query Rewrites (Pushdown, Unnesting and Elimination)**
- **10.06 — Covering Indexes and Included Columns**
- **08.12 — ROLLUP, CUBE and GROUPING SETS**
- **Chapter 16 — Reading Execution Plans**
- **18.xx — Stored Procedures and Triggers**

---

# Summary

A view is a stored, named query: it stores no rows, is always current, and is expanded into the queries that use it, where the optimizer can merge it, push predicates into it and eliminate what it does not need. Views name business rules, give applications a stable interface, restrict access to rows and columns, and can even accept writes. A materialized view stores its result, so it is as fast to read as a table but only as fresh as its last refresh. This chapter covers creating and managing views, how they are expanded, updatable views and their write rules, security, dependencies, layered design, materialized views and their refresh strategies, indexed views and query rewrite, summary tables, execution flow, performance, common mistakes and a cheat sheet.
