---
title: "11.01 - Introduction to Window Functions"
description: "What window functions are, how they differ from GROUP BY aggregates and correlated subqueries, the idea of a window per row, the three parts of the OVER clause, where window functions may appear, and a first tour of the function families."
chapter: 11
section: 11.01
category: Data Query Language (DQL)
difficulty: Beginner → Intermediate
readingTime: 25 min
lastUpdated: 2026-09-25
---

# 11.01 Introduction to Window Functions

---

# Learning Objectives

After completing this section, you will be able to:

- Define a window function and a window.
- Contrast window functions with `GROUP BY` aggregates.
- Contrast window functions with correlated subqueries.
- Name the three parts of an `OVER` clause.
- State where window functions may and may not appear in a query.
- Recognise the main families of window functions.

---

# What is a Window Function?

A **window function** returns one value for each row of a query, computed from a set of rows related to that row—its **window**. The window is described by the `OVER` clause.

```sql
SELECT
    EmployeeName,
    DepartmentID,
    Salary,
    AVG(Salary) OVER (PARTITION BY DepartmentID) AS DeptAvgSalary
FROM Employees;
```

```text
┌──────────────┬──────┬────────┬───────────────┐
│ EmployeeName │ Dept │ Salary │ DeptAvgSalary │
├──────────────┼──────┼────────┼───────────────┤
│ Ava          │ 10   │ 90 000 │ 75 000        │  ┐ window for dept 10
│ Raj          │ 10   │ 60 000 │ 75 000        │  ┘
│ Mei          │ 20   │ 70 000 │ 60 000        │  ┐
│ Tom          │ 20   │ 50 000 │ 60 000        │  │ window for dept 20
│ Lina         │ 20   │ 60 000 │ 60 000        │  ┘
└──────────────┴──────┴────────┴───────────────┘
```

Every employee keeps their row; each gains the average of their department.

---

# Window Functions vs GROUP BY

```sql
-- GROUP BY: one row per department
SELECT DepartmentID, AVG(Salary) AS DeptAvgSalary
FROM Employees
GROUP BY DepartmentID;

-- Window: one row per employee, department average attached
SELECT EmployeeName, DepartmentID, Salary,
       AVG(Salary) OVER (PARTITION BY DepartmentID) AS DeptAvgSalary
FROM Employees;
```

| | `GROUP BY` aggregate | Window function |
|---|----------------------|-----------------|
| Output rows | One per group | One per input row |
| Detail columns available | Only grouped columns | All columns |
| Group figure | Replaces the rows | Added to each row |
| Can rank, compare with neighbours | ❌ | ✅ |
| Evaluated | Step 4 (`GROUP BY`) | After `HAVING`, before `SELECT` output |

The same aggregate function (`AVG`, `SUM`, `COUNT` …) becomes a window function when it is followed by `OVER`.

---

# Window Functions vs Correlated Subqueries

The same result with a correlated subquery (Section 09.07):

```sql
SELECT e.EmployeeName, e.DepartmentID, e.Salary,
       (SELECT AVG(e2.Salary)
        FROM Employees AS e2
        WHERE e2.DepartmentID = e.DepartmentID) AS DeptAvgSalary
FROM Employees AS e;
```

The window version is shorter, reads the table once, and computes each department's average once from sorted data. The subquery version logically re-runs for each employee. For "detail row plus group figure" questions, windows are the natural tool.

---

# The Three Parts of OVER

```sql
function() OVER (
    PARTITION BY DepartmentID          -- 1. which rows belong together
    ORDER BY HireDate                  -- 2. in what order inside each partition
    ROWS BETWEEN 2 PRECEDING           -- 3. how far around the current row
             AND CURRENT ROW
)
```

```text
Partition (Dept 20), ordered by HireDate

 row 1 ─┐
 row 2  ├─ frame of row 3 (2 preceding + current)
 row 3 ◀┘ current row
 row 4
 row 5
```

- **`PARTITION BY`** splits rows into independent groups. Without it, the whole result is one partition.
- **`ORDER BY`** orders rows within each partition. Required for ranking and offset functions; for aggregates it turns a total into a running calculation.
- **Frame** chooses the subset of the ordered partition used for the current row. Section 11.05 covers frames in depth.

`OVER ()` with nothing inside means "all rows of the result, in no particular order".

---

# A First Tour

```sql
SELECT
    o.OrderID,
    o.CustomerID,
    o.OrderDate,
    o.TotalAmount,
    ROW_NUMBER() OVER (PARTITION BY o.CustomerID ORDER BY o.OrderDate, o.OrderID) AS OrderSeq,
    SUM(o.TotalAmount) OVER (PARTITION BY o.CustomerID)                           AS CustomerTotal,
    SUM(o.TotalAmount) OVER (PARTITION BY o.CustomerID ORDER BY o.OrderDate, o.OrderID
                             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)    AS RunningTotal,
    LAG(o.OrderDate)   OVER (PARTITION BY o.CustomerID ORDER BY o.OrderDate, o.OrderID) AS PrevOrderDate,
    o.TotalAmount / SUM(o.TotalAmount) OVER (PARTITION BY o.CustomerID)          AS ShareOfCustomer
FROM Orders AS o;
```

```text
┌─────┬──────┬────────────┬────────┬──────────┬──────────┬─────────┬────────────┬───────┐
│ Ord │ Cust │ OrderDate  │ Amount │ OrderSeq │ CustTot  │ Running │ PrevDate   │ Share │
├─────┼──────┼────────────┼────────┼──────────┼──────────┼─────────┼────────────┼───────┤
│ 101 │ 1    │ 2026-01-03 │ 250.00 │ 1        │ 330.00   │ 250.00  │ NULL       │ 0.76  │
│ 102 │ 1    │ 2026-02-11 │  80.00 │ 2        │ 330.00   │ 330.00  │ 2026-01-03 │ 0.24  │
│ 103 │ 2    │ 2026-01-04 │ 500.00 │ 1        │ 620.00   │ 500.00  │ NULL       │ 0.81  │
│ 104 │ 2    │ 2026-03-19 │ 120.00 │ 2        │ 620.00   │ 620.00  │ 2026-01-04 │ 0.19  │
│ 105 │ 3    │ 2026-02-01 │  60.00 │ 1        │  60.00   │  60.00  │ NULL       │ 1.00  │
└─────┴──────┴────────────┴────────┴──────────┴──────────┴─────────┴────────────┴───────┘
```

Five kinds of question, one query, no subqueries.

---

# Function Families

| Family | Examples | Needs `ORDER BY`? | Uses frame? |
|--------|----------|-------------------|-------------|
| Ranking | `ROW_NUMBER`, `RANK`, `DENSE_RANK`, `NTILE` | ✅ | ❌ |
| Aggregate | `SUM`, `AVG`, `COUNT`, `MIN`, `MAX` | Optional | ✅ |
| Offset | `LAG`, `LEAD` | ✅ | ❌ |
| Value | `FIRST_VALUE`, `LAST_VALUE`, `NTH_VALUE` | ✅ (in practice) | ✅ |
| Distribution | `PERCENT_RANK`, `CUME_DIST` | ✅ | ❌ |

---

# Where Window Functions Can Appear

| Clause | Allowed? | Why |
|--------|----------|-----|
| `SELECT` list | ✅ | Computed at this stage |
| `ORDER BY` | ✅ | Runs after windows |
| `WHERE` | ❌ | Runs before windows |
| `GROUP BY` | ❌ | Runs before windows |
| `HAVING` | ❌ | Runs before windows |
| Inside another window function's argument | ❌ | No nesting |
| Inside an aggregate's argument | ❌ | Aggregates run before windows |

To filter on a window result, compute it in a derived table and filter outside (Section 11.10):

```sql
SELECT *
FROM (
    SELECT o.*, ROW_NUMBER() OVER (PARTITION BY CustomerID ORDER BY OrderDate DESC, OrderID DESC) AS rn
    FROM Orders AS o
) AS t
WHERE t.rn = 1;
```

---

# Visual Representation

```text
GROUP BY                                 WINDOW
┌───────────┐                            ┌───────────┐
│ ▪ ▪ ▪     │ ──→ ▣  one row per group   │ ▪ ▪ ▪     │ ──→ ▪▣ ▪▣ ▪▣  each row + group value
│ ▪ ▪       │ ──→ ▣                      │ ▪ ▪       │ ──→ ▪▣ ▪▣
└───────────┘                            └───────────┘
rows collapse                            rows preserved
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← filters rows BEFORE windows see them
4. GROUP BY
5. HAVING
6. WINDOW      ← window functions are computed here
7. SELECT
8. DISTINCT
9. ORDER BY    ← may sort by window results
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
SELECT …, AVG(Salary) OVER (PARTITION BY DepartmentID) FROM Employees

PostgreSQL                              SQL Server
WindowAgg                               Nested Loops / Segment + Window Spool
  -> Sort (DepartmentID)                  Sort (DepartmentID)
       -> Seq Scan on employees             Clustered Index Scan

MySQL: "Using window function" in EXPLAIN FORMAT=JSON / TREE
Oracle: WINDOW SORT
SQLite: co-routine with sorter
```

---

# 🔬 Engine Deep Dive

A window operator processes one partition at a time. For `OVER (PARTITION BY DepartmentID)` without `ORDER BY`, it buffers the rows of a partition, computes the aggregate once, then emits every buffered row with that value. With `ORDER BY` and a running frame, it can emit each row as soon as it arrives, updating a running accumulator—no buffering needed. This difference in buffering shows up in memory use and in how early the first rows are returned.

---

# 🏗️ Architecture Insight

A window function keeps the grain of the input (one row per order) while adding context from a coarser grain (per customer, per day, overall). This is exactly what reports and dashboards need—detail with context—and it removes a whole class of self-joins and derived tables that used to join detail to a grouped copy of itself.

---

# ⚡ Performance Tip

Replace "detail joined to its own `GROUP BY`" and correlated aggregate subqueries with window functions where the engine supports them: they read the table once instead of twice or once per row.

---

# 🔒 Security Note

A window over an unpartitioned set (`OVER ()`) computes over every row the query returns, so totals and shares reflect the filtered result, not the whole table. That is usually what you want; be explicit in reports about which population a share or rank refers to.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Aggregate `OVER (PARTITION BY)` | ✅ | ✅ | ✅ (8.0+) | ✅ (2005+) | ✅ | ✅ (3.25+) |
| Aggregate `OVER (ORDER BY)` running | ✅ | ✅ | ✅ | ✅ (2012+) | ✅ | ✅ |
| Ranking functions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `LAG` / `LEAD` | ✅ | ✅ | ✅ | ✅ (2012+) | ✅ | ✅ |
| Window in `WHERE` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

> **Portability Tip:** The core of this chapter runs on every current engine. MySQL 5.7 and SQL Server 2008 and earlier are the main versions still in use without full window support.

---

# Common Mistakes

### Mistake 1

Using a window function in `WHERE`:

```sql
-- ❌ window functions are not allowed in WHERE
SELECT * FROM Orders WHERE ROW_NUMBER() OVER (ORDER BY OrderDate) <= 10;
```

---

### Mistake 2

Expecting `GROUP BY` behaviour (fewer rows) from a window function.

---

### Mistake 3

Forgetting `PARTITION BY`, computing over all rows instead of per group.

---

### Mistake 4

Using `DISTINCT` to collapse rows after adding a window aggregate, instead of using `GROUP BY`.

---

# Best Practices

✔ Use `GROUP BY` when you want fewer rows; use windows when you want context on every row.

✔ Write `PARTITION BY` explicitly for every per-group figure.

✔ Filter on window results from a derived table.

✔ Prefer windows to correlated subqueries for per-row group figures.

---

# Interview Questions

## Basic

1. What is a window function?
2. How does `SUM(x) OVER (PARTITION BY g)` differ from `SUM(x) … GROUP BY g`?
3. What are the three parts of an `OVER` clause?

## Intermediate

4. Why can't a window function appear in `WHERE`?
5. What does `OVER ()` mean?
6. How would you return only the first row per group using a window function?

## Advanced

7. Why do window functions usually outperform correlated subqueries for per-row group figures?
8. How does a window operator process partitions?
9. Why can a window function take an aggregate as its argument?

---

# Hands-on Exercises

## Exercise 1

Return each order with the customer's total revenue and the order's share of it.

---

## Exercise 2

Return each employee with the number of employees in their department.

---

## Exercise 3

Number each customer's orders chronologically.

---

## Exercise 4

Rewrite a correlated subquery from Section 09.07 as a window function and compare the plans.

---

# Related Topics

- **11.02 — The OVER Clause (PARTITION BY and ORDER BY)**
- **11.03 — Ranking Functions (ROW_NUMBER, RANK, DENSE_RANK, NTILE)**
- **11.04 — Aggregate Window Functions**
- **08.05 — GROUP BY Syntax and Semantics**
- **09.07 — Correlated Subqueries**

---

# Summary

A window function adds to each row a value computed from a window of related rows, defined by `OVER` with optional `PARTITION BY`, `ORDER BY` and a frame. Unlike `GROUP BY`, it keeps every row; unlike a correlated subquery, it reads the data once. Ranking, aggregate, offset, value and distribution functions answer detail-with-context questions in a single query. Windows are computed after `HAVING` and before the final `ORDER BY`, so they may appear only in `SELECT` and `ORDER BY`, and filtering on them requires a derived table.
