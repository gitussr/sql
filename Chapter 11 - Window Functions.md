---
title: "Chapter 11 - Window Functions"
description: "Master SQL window functions: the OVER clause, PARTITION BY and ORDER BY, ranking, aggregate windows, frames, running totals and moving averages, LAG and LEAD, value and distribution functions, top-N per group, named windows, gaps and islands, NULL behaviour, and how engines execute and index window queries."
chapter: 11
section: Introduction
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 25 min
lastUpdated: 2026-09-25
---

# Chapter 11 — Window Functions

> *"GROUP BY answers the question. A window answers it for every row."*

---

# Learning Objectives

By the end of this chapter, you will be able to:

- Explain how a window function differs from an aggregate with `GROUP BY`.
- Write the `OVER` clause with `PARTITION BY`, `ORDER BY` and a frame.
- Rank rows with `ROW_NUMBER`, `RANK`, `DENSE_RANK` and `NTILE`.
- Compute totals, averages and counts per partition alongside detail rows.
- Control exactly which rows a window sees with `ROWS`, `RANGE` and `GROUPS` frames.
- Build running totals, moving averages and period-over-period comparisons.
- Read neighbouring rows with `LAG`, `LEAD`, `FIRST_VALUE`, `LAST_VALUE` and `NTH_VALUE`.
- Compute percentiles and cumulative distributions.
- Solve top-N-per-group, deduplication and gaps-and-islands problems.
- Predict how `NULL`s and ties affect window results.
- Describe how engines sort, partition and stream window computations, and index for them.

---

# Introduction

Chapter 08 taught you to **summarise** rows: `GROUP BY` collapses many rows into one per group. Chapter 09 taught you to compare a row with a figure computed from **other rows**—through correlated subqueries and derived tables.

This chapter teaches the tool built for exactly that: the **window function**.

Many questions need both the detail row and a figure computed across related rows:

- Each order, with the customer's running total so far.
- Each employee, with their salary rank within the department.
- Each day's revenue, with the 7-day moving average.
- Each month, with the change from the previous month.
- Each customer's three most recent orders.

`GROUP BY` cannot answer these, because it throws away the detail rows. Correlated subqueries can, but they are verbose and often run once per row. A window function computes a value for every row from a **window** of related rows—without collapsing anything—usually in a single pass over sorted data.

---

# What is a Window Function?

A window function is a function evaluated for each row over a set of rows related to it, defined by an `OVER` clause.

```text
Orders
┌─────────┬────────────┬────────────┬─────────────┐     SUM(TotalAmount) OVER (PARTITION BY CustomerID)
│ OrderID │ CustomerID │ OrderDate  │ TotalAmount │     ┌──────────────┐
├─────────┼────────────┼────────────┼─────────────┤     │ CustomerTotal│
│ 101     │ 1          │ 2026-01-03 │ 250.00      │  →  │ 330.00       │
│ 102     │ 1          │ 2026-02-11 │  80.00      │  →  │ 330.00       │
│ 103     │ 2          │ 2026-01-04 │ 500.00      │  →  │ 620.00       │
│ 104     │ 2          │ 2026-03-19 │ 120.00      │  →  │ 620.00       │
│ 105     │ 3          │ 2026-02-01 │  60.00      │  →  │  60.00       │
└─────────┴────────────┴────────────┴─────────────┘     └──────────────┘

GROUP BY CustomerID  → 3 rows (details gone)
OVER (PARTITION BY CustomerID) → 5 rows (details kept, total added)
```

Two observations explain most window behaviour:

1. **The row count does not change.** Every input row produces exactly one output row. The window function adds a column; it never removes or merges rows.
2. **Windows are computed late.** Window functions run after `WHERE`, `GROUP BY` and `HAVING`, just before `ORDER BY`. That is why you cannot filter on them in `WHERE`—and why a derived table is needed to do so.

---

# Basic Syntax

```sql
function_name(arguments) OVER (
    [PARTITION BY partition_expressions]
    [ORDER BY sort_expressions]
    [frame_clause]
)
```

Example:

```sql
SELECT
    o.OrderID,
    o.CustomerID,
    o.OrderDate,
    o.TotalAmount,
    SUM(o.TotalAmount) OVER (PARTITION BY o.CustomerID
                             ORDER BY o.OrderDate, o.OrderID)  AS RunningTotal,
    ROW_NUMBER()       OVER (PARTITION BY o.CustomerID
                             ORDER BY o.OrderDate DESC, o.OrderID DESC) AS RecencyRank
FROM Orders AS o;
```

Every order, with the customer's running total and the order's recency rank (1 = most recent).

---

# The Sample Schema

Every section of this chapter uses the Chapter 10 schema, plus a daily sales table for time-series examples.

```sql
CREATE TABLE Customers (
    CustomerID   INT PRIMARY KEY,
    CustomerName VARCHAR(100) NOT NULL,
    Email        VARCHAR(255),
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
    ListPrice   DECIMAL(10,2)
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

---

# The Window Function Toolkit

| Family | Functions | Section |
|--------|-----------|---------|
| Ranking | `ROW_NUMBER`, `RANK`, `DENSE_RANK`, `NTILE` | 11.03 |
| Aggregate windows | `SUM`, `AVG`, `COUNT`, `MIN`, `MAX` … `OVER (…)` | 11.04 |
| Frames | `ROWS`, `RANGE`, `GROUPS` `BETWEEN … AND …` | 11.05 |
| Running and moving calculations | Running totals, moving averages, shares | 11.06 |
| Offset | `LAG`, `LEAD` | 11.07 |
| Value | `FIRST_VALUE`, `LAST_VALUE`, `NTH_VALUE` | 11.08 |
| Distribution | `PERCENT_RANK`, `CUME_DIST`, `PERCENTILE_CONT` | 11.09 |

```text
                     every window function answers:
   ┌─────────────────┬─────────────────────────┬──────────────────────────┐
   │ WHICH rows?     │ IN WHAT ORDER?          │ HOW FAR around me?       │
   │ PARTITION BY    │ ORDER BY                │ frame: ROWS / RANGE /    │
   │                 │                         │        GROUPS            │
   └─────────────────┴─────────────────────────┴──────────────────────────┘
```

---

# 📍 Execution Order Reminder

Window functions are evaluated after grouping and before the final sort:

```text
1. FROM
2. JOIN
3. WHERE
4. GROUP BY
5. HAVING
6. WINDOW      ← Window functions are computed here, over the rows that survived
7. SELECT
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

> Because windows run after `WHERE`, a `WHERE` filter changes what every window sees. Because they run after `GROUP BY`, a window function can take an aggregate as its argument (`SUM(SUM(x)) OVER ()`). And because they run before `ORDER BY`, the final sort can use them.

---

# How the DBMS Executes This

```text
SQL Statement
        │
        ▼
Rows from FROM / JOIN / WHERE / GROUP BY / HAVING
        │
        ▼
Sort by (PARTITION BY keys, ORDER BY keys)        ← or read in that order from an index
        │
        ▼
Window operator walks the sorted rows:
  - detects partition boundaries
  - maintains the frame (add rows entering, remove rows leaving)
  - emits one value per row
        │
        ▼
SELECT list → DISTINCT → final ORDER BY → LIMIT
```

The sort is usually the dominant cost. Windows that share the same `PARTITION BY`/`ORDER BY` share one sort; Sections 11.14 and 11.15 show how to keep the number of sorts—and their size—down.

---

# Chapter Structure

| Section | Topic |
|---------|-------|
| 11.01 | Introduction to Window Functions |
| 11.02 | The OVER Clause (PARTITION BY and ORDER BY) |
| 11.03 | Ranking Functions (ROW_NUMBER, RANK, DENSE_RANK, NTILE) |
| 11.04 | Aggregate Window Functions |
| 11.05 | Window Frames (ROWS, RANGE and GROUPS) |
| 11.06 | Running Totals, Moving Averages and Shares |
| 11.07 | LAG and LEAD |
| 11.08 | FIRST_VALUE, LAST_VALUE and NTH_VALUE |
| 11.09 | Distribution Functions (PERCENT_RANK, CUME_DIST and Percentiles) |
| 11.10 | Top-N per Group, Deduplication and QUALIFY |
| 11.11 | Named Windows and the WINDOW Clause |
| 11.12 | Gaps and Islands |
| 11.13 | NULL Handling in Window Functions |
| 11.14 | Execution Flow of Window Functions |
| 11.15 | Window Function Performance and Index Strategy |
| 11.16 | Common Window Function Mistakes & Best Practices |
| 11.17 | Window Function Cheat Sheet & Visual Knowledge Map |

---

# Real-World Examples

## E-Commerce

```sql
SELECT t.CustomerID, t.OrderID, t.OrderDate
FROM (
    SELECT o.*, ROW_NUMBER() OVER (PARTITION BY o.CustomerID
                                   ORDER BY o.OrderDate DESC, o.OrderID DESC) AS rn
    FROM Orders AS o
) AS t
WHERE t.rn <= 3;
```

Each customer's three most recent orders.

---

## Banking

```sql
SELECT
    t.AccountID,
    t.PostedAt,
    t.Amount,
    SUM(t.Amount) OVER (PARTITION BY t.AccountID
                        ORDER BY t.PostedAt, t.TransactionID
                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS Balance
FROM Transactions AS t;
```

The balance after each transaction—a running total per account.

---

## Hospital

```sql
SELECT
    a.PatientID,
    a.AdmitDate,
    a.AdmitDate - LAG(a.DischargeDate) OVER (PARTITION BY a.PatientID
                                             ORDER BY a.AdmitDate) AS DaysSinceLastDischarge
FROM Admissions AS a;
```

Readmission gaps: days between a discharge and the next admission of the same patient.

---

## HRMS

```sql
SELECT
    e.DepartmentID,
    e.EmployeeName,
    e.Salary,
    DENSE_RANK() OVER (PARTITION BY e.DepartmentID ORDER BY e.Salary DESC) AS SalaryRank,
    AVG(e.Salary) OVER (PARTITION BY e.DepartmentID)                       AS DeptAvg
FROM Employees AS e;
```

Each employee's salary rank in the department and the department average, on one row.

---

## Social Media

```sql
SELECT
    d.SalesDate,
    d.Revenue,
    AVG(d.Revenue) OVER (ORDER BY d.SalesDate
                         ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS Revenue7DayAvg
FROM DailySales AS d;
```

A 7-day moving average—the smoothing line on every analytics dashboard.

---

# 🏗️ Architecture Insight

Window functions moved a large class of analytics from application code into SQL. Ranking, running balances, sessionisation and period comparisons used to be loops over result sets in Java, Python or spreadsheets; with windows they are declarative, set-based and executed next to the data. The architectural consequence is that reports and APIs can return exactly the rows they need—"top 3 per customer", "latest status per order"—instead of shipping whole tables to the application to post-process.

---

# ⚡ Performance Tip

A window query's cost is dominated by sorting its input by `PARTITION BY` and `ORDER BY`. Filter with `WHERE` first, give windows that can share an ordering the same `PARTITION BY`/`ORDER BY`, and provide an index in that order when the window is part of a hot query.

---

# 🔒 Security Note

Window functions compute over the rows the query can see—after row-level security and `WHERE` filters are applied. A rank or running total computed over a filtered set is therefore relative to that set; exposing "rank 3 of 12" can reveal how many rows exist even when the others are hidden. Consider this when windows appear in multi-tenant or permission-filtered reports.

---

# 🌍 Production Consideration

The most common window bugs are silent: a `ROW_NUMBER()` with a non-unique `ORDER BY` that picks a different "latest" row on each run, a `LAST_VALUE` that returns the current row because of the default frame, and a running total that jumps on tied dates because the default frame is `RANGE`. Always make window orderings unique and write frames explicitly.

---

# 🚀 Enterprise Practice

Enterprise SQL standards commonly require a unique tiebreaker in every window `ORDER BY` used for ranking or row selection, explicit frame clauses for every aggregate window with `ORDER BY`, named windows (`WINDOW w AS (…)`) when several functions share a definition, and a derived table (or `QUALIFY` where available) for filtering on window results—never a second query in the application.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Window functions | ✅ (SQL:2003) | ✅ (8.4+) | ✅ (8.0+) | ✅ (2005+, frames 2012+) | ✅ (8i+) | ✅ (3.25+) |
| `ROWS` / `RANGE` frames | ✅ | ✅ | ✅ | ✅ (`RANGE` offsets ❌) | ✅ | ✅ |
| `GROUPS` frame, `EXCLUDE` | ✅ | ✅ (11+) | ❌ | ❌ | ✅ (21c+) | ✅ (3.28+) |
| Named `WINDOW` clause | ✅ | ✅ | ✅ | ✅ (2022+) | ✅ (21c+) | ✅ |
| `IGNORE NULLS` | ✅ | ❌ | ❌ | ✅ (2022+) | ✅ | ❌ |
| `QUALIFY` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

> **Portability Tip:** Ranking functions, aggregate windows with explicit `ROWS` frames, `LAG`/`LEAD` and `FIRST_VALUE` behave the same everywhere. `RANGE` with offsets, `GROUPS`, `EXCLUDE`, `IGNORE NULLS`, `NTH_VALUE` and `QUALIFY` are the portability hazards.

---

# Common Mistakes

- Filtering on a window function in `WHERE`.
- Using `ROW_NUMBER()` with an `ORDER BY` that has ties.
- Relying on the default frame, which is `RANGE … CURRENT ROW` when `ORDER BY` is present.
- Expecting `LAST_VALUE` to return the last row of the partition.
- Confusing `RANK`, `DENSE_RANK` and `ROW_NUMBER`.
- Forgetting `PARTITION BY`, so a "per customer" figure is computed over all customers.
- Adding `ORDER BY` to an aggregate window and silently turning a total into a running total.

---

# Best Practices

✔ Make every ranking `ORDER BY` unique with a tiebreaker.

✔ Write the frame explicitly for every aggregate window that has `ORDER BY`.

✔ Filter window results from a derived table (or `QUALIFY`).

✔ Share `PARTITION BY`/`ORDER BY` definitions with a named `WINDOW`.

✔ Filter rows in `WHERE` before windows compute.

✔ Index `(partition columns, order columns)` for hot window queries.

---

# 💡 Did You Know?

Window functions entered the SQL standard through the OLAP amendment to SQL:1999, published in 2000, and became part of the core in SQL:2003. Oracle shipped them first, as "analytic functions" in Oracle 8i in 1999. MySQL, one of the last major holdouts, added them only in version 8.0 in 2018.

---

# Related Topics

- **Chapter 10 — Indexes**
- **08.01 — Introduction to Aggregation and Grouping**
- **08.17 — GROUP BY Cheat Sheet & Visual Knowledge Map**
- **09.07 — Correlated Subqueries**
- **09.08 — Derived Tables (Subqueries in FROM)**
- **04.19 — SQL Execution Order**
- **15.xx — Query Optimization**

---

# Summary

A window function computes a value for each row from a window of related rows, defined by `OVER (PARTITION BY … ORDER BY … frame)`, without collapsing rows the way `GROUP BY` does. Ranking, aggregate, offset, value and distribution functions cover rankings, running totals, moving averages, period comparisons and percentiles. Windows are computed after `WHERE`, `GROUP BY` and `HAVING`, so filtering on them needs a derived table, and they cost mainly a sort by their partition and order keys. The chapter's recurring themes are unique orderings, explicit frames, and choosing windows over correlated subqueries when detail rows and group figures are needed together.
