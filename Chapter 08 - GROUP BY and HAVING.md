---
title: "Chapter 08 - GROUP BY and HAVING"
description: "Master SQL aggregation: aggregate functions, COUNT variants, NULL in aggregates, GROUP BY semantics, the SELECT list rule, HAVING, conditional aggregation, aggregating across joins, ROLLUP/CUBE/GROUPING SETS, and how engines execute and index grouped queries."
chapter: 8
section: Introduction
category: Data Query Language (DQL)
difficulty: Beginner → Advanced
readingTime: 25 min
lastUpdated: 2026-09-24
---

# Chapter 08 — GROUP BY and HAVING

> *"Rows are the facts. Groups are the answers."*

---

# Learning Objectives

By the end of this chapter, you will be able to:

- Explain what aggregation does to rows and why it changes the grain of a result.
- Use `COUNT`, `SUM`, `AVG`, `MIN` and `MAX` correctly, including on empty input.
- Choose between `COUNT(*)`, `COUNT(column)` and `COUNT(DISTINCT column)`.
- Predict how `NULL` affects every aggregate.
- Write `GROUP BY` over one column, several columns and expressions.
- Apply the SELECT list rule and recognise functional dependency.
- Filter groups with `HAVING`, and decide between `WHERE` and `HAVING`.
- Compute several conditional totals in one pass with `FILTER` or `CASE`.
- Aggregate across joins without double counting.
- Produce subtotals and grand totals with `ROLLUP`, `CUBE` and `GROUPING SETS`.
- Describe hash and stream aggregation, and index grouped queries so they stay fast.

---

# Introduction

Chapter 05 taught you how to **choose columns**. Chapter 06 taught you how to **choose rows**. Chapter 07 taught you how to **combine tables**.

This chapter teaches you how to **summarise** them.

Almost every business question is a summary:

- How much revenue did we make each month?
- How many orders does each customer place?
- Which products sold fewer than ten units this quarter?
- What is the average salary per department, and which departments exceed the company average?

None of those answers is a row in any table. Each is computed by collapsing many rows into one: a **group**. `GROUP BY` defines the groups, aggregate functions compute one value per group, and `HAVING` decides which groups to keep.

Aggregation is also where correct-looking queries most often return wrong numbers. A join that multiplies rows inflates a `SUM`. A `COUNT(column)` quietly skips `NULL`s. An `AVG` over integers truncates on one engine and not on another. A filter placed in `HAVING` instead of `WHERE` works—but reads a hundred times more data. This chapter treats each of those as a first-class topic.

---

# What is Aggregation?

Aggregation takes a set of rows and returns a single value computed from them.

```text
Orders
┌─────────┬────────────┬─────────────┐
│ OrderID │ CustomerID │ TotalAmount │
├─────────┼────────────┼─────────────┤
│ 101     │ 1          │ 250.00      │
│ 102     │ 1          │  80.00      │
│ 103     │ 2          │ 500.00      │
│ 104     │ 2          │ 120.00      │
│ 105     │ 3          │  60.00      │
└─────────┴────────────┴─────────────┘

SELECT SUM(TotalAmount) FROM Orders;      →  1010.00   (one row)

GROUP BY CustomerID

┌────────────┬──────────────────┐
│ CustomerID │ SUM(TotalAmount) │
├────────────┼──────────────────┤
│ 1          │ 330.00           │
│ 2          │ 620.00           │
│ 3          │  60.00           │
└────────────┴──────────────────┘          (one row per customer)
```

Two observations explain most grouping behaviour:

1. **The grain changes.** Before `GROUP BY`, one row is one order. After it, one row is one customer. Every column in the result must make sense at the new grain.
2. **Detail is gone.** Once rows are collapsed, individual order IDs no longer exist in the result. Asking for `OrderID` next to `SUM(TotalAmount)` is asking a question that has no single answer.

---

# Basic Syntax

```sql
SELECT grouping_columns, aggregate_function(column)
FROM table_name
WHERE row_condition
GROUP BY grouping_columns
HAVING group_condition;
```

Example:

```sql
SELECT
    o.CustomerID,
    COUNT(*)           AS OrderCount,
    SUM(o.TotalAmount) AS Revenue
FROM Orders AS o
WHERE o.OrderDate >= DATE '2026-01-01'
GROUP BY o.CustomerID
HAVING SUM(o.TotalAmount) > 500;
```

Customers whose 2026 orders total more than 500, with their order count and revenue.

---

# The Sample Schema

Every section of this chapter uses the Chapter 07 schema, extended with the columns aggregation needs.

```sql
CREATE TABLE Customers (
    CustomerID   INT PRIMARY KEY,
    CustomerName VARCHAR(100) NOT NULL,
    Country      VARCHAR(50)
);

CREATE TABLE Orders (
    OrderID     INT PRIMARY KEY,
    CustomerID  INT REFERENCES Customers(CustomerID),
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

Departments ──1:N── Employees ── self-referencing (ManagerID → EmployeeID)
```

---

# The Aggregation Toolkit

| Tool | Purpose | Section |
|------|---------|---------|
| `COUNT`, `SUM`, `AVG`, `MIN`, `MAX` | One value from many rows | 08.02 |
| `COUNT(*)` / `COUNT(col)` / `COUNT(DISTINCT col)` | Rows, non-null values, distinct values | 08.03 |
| `GROUP BY` | Define the groups | 08.05, 08.06 |
| `HAVING` | Keep or discard whole groups | 08.08, 08.09 |
| `FILTER (WHERE …)` / `CASE` inside an aggregate | Several conditional totals in one pass | 08.10 |
| `ROLLUP`, `CUBE`, `GROUPING SETS` | Subtotals and grand totals | 08.12 |
| `STRING_AGG`, `PERCENTILE_CONT`, `STDDEV` | Lists, medians and statistics | 08.13 |

```text
      rows                    groups                   kept groups
┌──────────────┐        ┌──────────────┐          ┌──────────────┐
│ ▪ ▪ ▪ ▪ ▪ ▪  │  GROUP │ [▪▪▪] → 1 row │  HAVING  │ [▪▪▪] → 1 row │
│ ▪ ▪ ▪ ▪ ▪ ▪  │ ─────→ │ [▪▪]  → 1 row │ ───────→ │               │
│ ▪ ▪ ▪ ▪ ▪ ▪  │   BY   │ [▪▪▪▪]→ 1 row │          │ [▪▪▪▪]→ 1 row │
└──────────────┘        └──────────────┘          └──────────────┘
    WHERE filters           aggregates                HAVING filters
    these                   computed here             these
```

---

# 📍 Execution Order Reminder

Grouping happens **after** rows are combined and filtered, and **before** the `SELECT` list is evaluated:

```text
1. FROM
2. JOIN
3. WHERE
4. GROUP BY    ← Rows are collected into groups here
5. HAVING      ← Groups are filtered here
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

> Because `WHERE` runs before `GROUP BY`, it cannot reference an aggregate. Because `HAVING` runs before `SELECT`, standard SQL does not let it reference a `SELECT` alias. And because `ORDER BY` runs last, it can sort by an aggregate or by its alias.

---

# How the DBMS Executes This

```text
SQL Statement
        │
        ▼
Rows from FROM / JOIN / WHERE
        │
        ▼
Aggregation strategy chosen
(Hash Aggregate / Stream (Sorted) Aggregate)
        │
        ▼
One accumulator per group
(count, running sum, current min/max …)
        │
        ▼
Groups finalised → HAVING → SELECT
```

Aggregation is a single pass over its input: each incoming row updates the accumulator of its group. Whether the engine finds that accumulator with a hash table or by reading rows already sorted on the grouping key is the main performance decision, covered in Sections 08.14 and 08.15.

---

# Chapter Structure

| Section | Topic |
|---------|-------|
| 08.01 | Introduction to Aggregation and Grouping |
| 08.02 | Aggregate Functions (COUNT, SUM, AVG, MIN, MAX) |
| 08.03 | COUNT Variants |
| 08.04 | NULL Handling in Aggregates |
| 08.05 | GROUP BY Syntax and Semantics |
| 08.06 | Grouping by Multiple Columns and Expressions |
| 08.07 | The SELECT List Rule (Functional Dependency) |
| 08.08 | HAVING |
| 08.09 | WHERE vs HAVING |
| 08.10 | Conditional Aggregation (FILTER and CASE) |
| 08.11 | Aggregating Across JOINs (Fan-Out and Pre-Aggregation) |
| 08.12 | ROLLUP, CUBE and GROUPING SETS |
| 08.13 | Advanced Aggregate Functions (STRING_AGG, Percentiles and Statistics) |
| 08.14 | Execution Flow of GROUP BY (Hash and Stream Aggregation) |
| 08.15 | GROUP BY Performance and Index Strategy |
| 08.16 | Common GROUP BY Mistakes & Best Practices |
| 08.17 | GROUP BY Cheat Sheet & Visual Knowledge Map |

---

# Real-World Examples

## E-Commerce

```sql
SELECT
    EXTRACT(YEAR FROM o.OrderDate)  AS OrderYear,
    EXTRACT(MONTH FROM o.OrderDate) AS OrderMonth,
    COUNT(*)                        AS Orders,
    SUM(o.TotalAmount)              AS Revenue
FROM Orders AS o
WHERE o.Status <> 'Cancelled'
GROUP BY EXTRACT(YEAR FROM o.OrderDate), EXTRACT(MONTH FROM o.OrderDate)
ORDER BY OrderYear, OrderMonth;
```

Monthly order count and revenue, excluding cancellations.

---

## Banking

```sql
SELECT
    t.AccountID,
    SUM(CASE WHEN t.Amount > 0 THEN t.Amount ELSE 0 END) AS Deposits,
    SUM(CASE WHEN t.Amount < 0 THEN -t.Amount ELSE 0 END) AS Withdrawals
FROM Transactions AS t
GROUP BY t.AccountID;
```

Deposits and withdrawals per account in a single pass—conditional aggregation.

---

## Hospital

```sql
SELECT
    a.WardID,
    COUNT(*)                     AS Admissions,
    AVG(a.DischargeDate - a.AdmitDate) AS AvgStayDays
FROM Admissions AS a
WHERE a.DischargeDate IS NOT NULL
GROUP BY a.WardID;
```

Admissions and average length of stay per ward (PostgreSQL date arithmetic; other engines use `DATEDIFF`).

---

## HRMS

```sql
SELECT
    e.DepartmentID,
    COUNT(*)      AS Headcount,
    AVG(e.Salary) AS AvgSalary
FROM Employees AS e
GROUP BY e.DepartmentID
HAVING COUNT(*) >= 5;
```

Average salary for departments with at least five people.

---

## Social Media

```sql
SELECT
    p.UserID,
    COUNT(*) AS PostsLast30Days
FROM Posts AS p
WHERE p.CreatedAt >= CURRENT_DATE - INTERVAL '30' DAY
GROUP BY p.UserID
ORDER BY PostsLast30Days DESC
FETCH FIRST 10 ROWS ONLY;
```

The ten most active posters of the last month.

---

# 🏗️ Architecture Insight

`GROUP BY` is where OLTP data becomes analytics. Transactional tables store one row per event; reports need one row per customer, day or product. When the same aggregation runs thousands of times a day, the architectural answer is rarely a faster `GROUP BY`—it is computing the summary once: a summary table maintained on write, a materialized view refreshed on a schedule, or a separate analytical store. Knowing the grain of every summary is what keeps those structures consistent with their source.

---

# ⚡ Performance Tip

Aggregation cost is driven by the rows that reach `GROUP BY` and the number of distinct groups. Filter with `WHERE` so fewer rows arrive, group by narrow key columns rather than wide text, and aggregate before joining to large dimension tables. An index whose leading columns match the `GROUP BY` lets the engine read rows already in group order and skip the hash table entirely.

---

# 🔒 Security Note

Aggregates leak information. A count of one is not anonymous: "average salary for the Legal department in Oslo" may be one person's salary. Reporting systems that expose aggregates to wide audiences typically enforce a minimum group size with `HAVING COUNT(*) >= k`, and must apply row-level permission filters in `WHERE`—before grouping—so that restricted rows never contribute to a total.

---

# 🌍 Production Consideration

The most damaging aggregation bugs are silent. Totals inflated by a fan-out join, counts that skip `NULL`s, and averages truncated by integer arithmetic all look plausible. Reconciling a report total against a single `SUM` over the source table—and checking row counts before and after every join that feeds an aggregate—catches them before a finance team does.

---

# 🚀 Enterprise Practice

Enterprise SQL standards commonly require every grouped query to list all non-aggregated `SELECT` columns in `GROUP BY` (no reliance on engine extensions), forbid `GROUP BY` ordinal positions, require an explicit alias on every aggregate, and require a comment stating the grain of the result. Together these make a report's meaning reviewable.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `GROUP BY` / `HAVING` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Functional dependency on PK | ✅ (optional feature) | ✅ | ✅ (5.7.5+) | ❌ | ❌ | n/a (bare columns allowed) |
| `FILTER (WHERE …)` | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ (3.30+) |
| `ROLLUP` | ✅ | ✅ | `WITH ROLLUP` | ✅ | ✅ | ❌ |
| `CUBE` / `GROUPING SETS` | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| String aggregation | `LISTAGG` | `STRING_AGG` | `GROUP_CONCAT` | `STRING_AGG` (2017+) | `LISTAGG` | `GROUP_CONCAT` |

> **Portability Tip:** Plain `GROUP BY` with every non-aggregated column listed, `HAVING` on aggregates, and `CASE` inside aggregates behave identically everywhere. `FILTER`, `CUBE`, `GROUPING SETS`, string aggregation and grouping by alias or ordinal position are the portability hazards.

---

# Common Mistakes

- Selecting a column that is neither grouped nor aggregated.
- Filtering rows in `HAVING` that belong in `WHERE`.
- Summing after a join that multiplies rows.
- Using `COUNT(column)` when you mean `COUNT(*)`, or the reverse.
- Forgetting that `SUM` over no rows is `NULL`, not `0`.
- Averaging integer columns on an engine that performs integer division.
- Relying on `GROUP BY` to sort the result.

---

# Best Practices

✔ State the grain of the result before writing the query.

✔ List every non-aggregated `SELECT` column in `GROUP BY`.

✔ Filter rows in `WHERE`; filter groups in `HAVING`.

✔ Aggregate each 1:N branch before joining it to another.

✔ Wrap totals that may be empty in `COALESCE(SUM(...), 0)`.

✔ Always write `ORDER BY` when the order of groups matters.

---

# 💡 Did You Know?

`GROUP BY` was present in SQL from its earliest days at IBM, but `HAVING` was added because the language had no other way to filter on an aggregate—subqueries in `FROM` were not generally available until SQL-92. Today `HAVING` could almost always be rewritten as `WHERE` over a derived table; it survives because it is shorter and it states intent clearly.

---

# Related Topics

- **Chapter 07 — JOINs**
- **05.07 — DISTINCT**
- **06.08 — NULL Handling in WHERE (Three-Valued Logic)**
- **07.10 — Joining Multiple Tables**
- **04.19 — SQL Execution Order**
- **09.xx — Subqueries**
- **10.xx — Indexes**
- **11.xx — Window Functions**

---

# Summary

Aggregation collapses many rows into one value; `GROUP BY` decides which rows collapse together, so it changes the grain of the result from one row per fact to one row per group. Aggregate functions compute one value per group, mostly ignoring `NULL`s, and `HAVING` filters the finished groups after `WHERE` has filtered the rows. Grouping runs after joins and `WHERE` and before `SELECT`, which explains the rules on aliases, the SELECT list rule, and why a join that multiplies rows silently corrupts every total built on top of it.
