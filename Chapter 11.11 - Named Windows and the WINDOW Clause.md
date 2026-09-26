---
title: "11.11 - Named Windows and the WINDOW Clause"
description: "Reusing window definitions: the WINDOW clause, referencing a named window with OVER name, extending a named window with ORDER BY and frames, the refinement rules, clause placement, vendor support, and how shared definitions help readability and performance."
chapter: 11
section: 11.11
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 20 min
lastUpdated: 2026-09-25
---

# 11.11 Named Windows and the WINDOW Clause

---

# Learning Objectives

After completing this section, you will be able to:

- Define named windows with the `WINDOW` clause.
- Reference a named window with `OVER name`.
- Extend a named window with an `ORDER BY` or a frame.
- Apply the rules for what a derived window may add.
- Place the `WINDOW` clause correctly in a query.
- Use named windows to make shared sorts obvious.

---

# The Problem: Repeated Definitions

```sql
SELECT
    OrderID,
    ROW_NUMBER()     OVER (PARTITION BY CustomerID ORDER BY OrderDate, OrderID) AS Seq,
    LAG(OrderDate)   OVER (PARTITION BY CustomerID ORDER BY OrderDate, OrderID) AS PrevDate,
    LEAD(OrderDate)  OVER (PARTITION BY CustomerID ORDER BY OrderDate, OrderID) AS NextDate,
    SUM(TotalAmount) OVER (PARTITION BY CustomerID ORDER BY OrderDate, OrderID
                           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS RunningTotal
FROM Orders;
```

Four copies of the same definition: verbose, and easy to change in one place and not the others—producing subtly inconsistent results.

---

# The WINDOW Clause

```sql
SELECT
    OrderID,
    ROW_NUMBER()     OVER w AS Seq,
    LAG(OrderDate)   OVER w AS PrevDate,
    LEAD(OrderDate)  OVER w AS NextDate,
    SUM(TotalAmount) OVER (w ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS RunningTotal
FROM Orders
WINDOW w AS (PARTITION BY CustomerID ORDER BY OrderDate, OrderID);
```

- `WINDOW name AS (definition)` defines a named window.
- `OVER name` uses it as is.
- `OVER (name …)` uses it and **adds** to it (here, a frame).

---

# Clause Placement

```sql
SELECT …
FROM …
WHERE …
GROUP BY …
HAVING …
WINDOW w1 AS (…), w2 AS (…)
ORDER BY …
LIMIT / FETCH …;
```

The `WINDOW` clause comes after `HAVING` and before `ORDER BY`. Several windows are separated by commas, and a window may be defined in terms of another:

```sql
WINDOW
    byCustomer AS (PARTITION BY CustomerID),
    byCustomerDate AS (byCustomer ORDER BY OrderDate, OrderID)
```

---

# Refinement Rules

A window that references another window may add parts, but not replace them:

| Base window has | Referencing window may add |
|-----------------|---------------------------|
| `PARTITION BY` only | `ORDER BY`, frame |
| `PARTITION BY` + `ORDER BY` | frame only |
| A frame | nothing (a window with a frame cannot be referenced for extension) |

```sql
WINDOW w AS (PARTITION BY CustomerID ORDER BY OrderDate)

OVER (w ROWS UNBOUNDED PRECEDING)          -- ✅ adds a frame
OVER (w ORDER BY TotalAmount)              -- ❌ w already has ORDER BY
OVER (w PARTITION BY Status)               -- ❌ PARTITION BY cannot be added
```

Because a frame cannot be extended, define named windows **without** frames and add frames where they are used.

---

# A Fuller Example

```sql
SELECT
    e.DepartmentID,
    e.EmployeeName,
    e.Salary,
    AVG(e.Salary)          OVER dept           AS DeptAvg,
    COUNT(*)               OVER dept           AS DeptSize,
    RANK()                 OVER deptBySalary   AS SalaryRank,
    PERCENT_RANK()         OVER deptBySalary   AS SalaryPctRank,
    FIRST_VALUE(e.EmployeeName) OVER deptBySalary AS TopEarner,
    LAG(e.Salary) OVER deptBySalary - e.Salary AS GapToNextHigher
FROM Employees AS e
WHERE e.Salary IS NOT NULL
WINDOW
    dept         AS (PARTITION BY e.DepartmentID),
    deptBySalary AS (dept ORDER BY e.Salary DESC, e.EmployeeID)
ORDER BY e.DepartmentID, SalaryRank;
```

Two definitions, seven functions, one clear statement of which functions share what.

---

# Named Windows and Performance

Named windows do not change execution by themselves—the optimizer compares window definitions whether they are named or written inline. Their performance value is **visibility**: when every function uses one of two named windows, it is obvious that the query needs at most two sorts, and a reviewer can spot an accidental third definition.

---

# Where WINDOW Is Not Available

On engines without the `WINDOW` clause (SQL Server before 2022, Oracle before 21c), alternatives are:

- Repeat the definition (and keep copies identical).
- Compute window columns in a CTE once and reference them.
- Generate the SQL from a query builder that defines the window once.

---

# Visual Representation

```text
WINDOW dept         AS (PARTITION BY DepartmentID)
       deptBySalary AS (dept ORDER BY Salary DESC, EmployeeID)
                           │
       ┌───────────────────┼─────────────────────────┐
       ▼                   ▼                         ▼
AVG … OVER dept     RANK() OVER deptBySalary   SUM … OVER (deptBySalary ROWS …)
COUNT … OVER dept   LAG …  OVER deptBySalary
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE
4. GROUP BY
5. HAVING
6. WINDOW      ← the WINDOW clause is written here, and window functions are computed here
7. SELECT
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

Conveniently, the clause's written position matches its logical position.

---

# How the DBMS Executes This

```text
Parser    : resolve OVER name / OVER (name …) into full window definitions
Optimizer : group functions by identical (PARTITION BY, ORDER BY)
            order the groups to minimise re-sorting
Executor  : one sort + window pass per distinct definition group
```

---

# 🔬 Engine Deep Dive

PostgreSQL merges window functions with identical definitions into a single `WindowAgg` node and, since version 13, orders multiple `WindowAgg` nodes so that a sort for one can satisfy a prefix needed by the next (for example `PARTITION BY a` before `PARTITION BY a ORDER BY b`). Named windows make it easier to write definitions that line up this way.

---

# 🏗️ Architecture Insight

A named window is a small piece of query-level abstraction—like naming a derived table. In analytical SQL with many window columns, it plays the role that functions play in application code: define once, reuse consistently, change in one place.

---

# ⚡ Performance Tip

Aim for one or two distinct window definitions per query. If a report needs five different partitionings, consider computing some columns in separate CTEs over pre-aggregated data rather than sorting the detail rows five times.

---

# 🔒 Security Note

The `WINDOW` clause has no security implications of its own.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `WINDOW` clause | ✅ | ✅ | ✅ (8.0+) | ✅ (2022+) | ✅ (21c+) | ✅ (3.28+) |
| `OVER (name frame)` refinement | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Window defined from another window | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

> **Portability Tip:** Named windows are safe on current versions of every engine in this handbook; code that must run on SQL Server 2019 or Oracle 19c must repeat definitions instead.

---

# Common Mistakes

### Mistake 1

Defining a frame in the named window, then trying to extend it.

---

### Mistake 2

Trying to add `PARTITION BY` or a second `ORDER BY` in `OVER (name …)`.

---

### Mistake 3

Placing `WINDOW` after `ORDER BY`.

---

### Mistake 4

Copy-pasting almost-identical inline definitions that differ by one column, causing extra sorts and inconsistent results.

---

# Best Practices

✔ Name every window used by more than one function.

✔ Keep frames out of named windows; add them at the point of use.

✔ Build ordered windows from partition-only windows.

✔ Keep the number of distinct window definitions small.

---

# Interview Questions

## Basic

1. What does the `WINDOW` clause do?
2. Where is it placed in a query?
3. How do you reference a named window?

## Intermediate

4. How do you add a frame to a named window?
5. Why can't you add `PARTITION BY` to a referenced window?
6. Which engines support the `WINDOW` clause?

## Advanced

7. Do named windows make queries faster?
8. How does an engine decide how many sorts a query with several windows needs?
9. How would you share window definitions on SQL Server 2019?

---

# Hands-on Exercises

## Exercise 1

Rewrite a query with four identical inline `OVER` clauses using one named window.

---

## Exercise 2

Define a partition-only window and an ordered window derived from it, and use both.

---

## Exercise 3

Try to extend a named window that already has a frame and read the error message.

---

## Exercise 4

Compare the plan of a query with two distinct window definitions and one with a single shared definition.

---

# Related Topics

- **11.02 — The OVER Clause (PARTITION BY and ORDER BY)**
- **11.05 — Window Frames (ROWS, RANGE and GROUPS)**
- **11.14 — Execution Flow of Window Functions**
- **11.15 — Window Function Performance and Index Strategy**

---

# Summary

The `WINDOW` clause, written between `HAVING` and `ORDER BY`, names window definitions so that functions can reference them with `OVER name` or refine them with `OVER (name …)`. A referencing window may add an `ORDER BY` to a partition-only window, or a frame to an ordered one, but never replace parts or extend a window that already has a frame. Named windows do not change execution, but they keep definitions consistent and make the number of required sorts visible. They are available on PostgreSQL, MySQL 8, SQLite, SQL Server 2022 and Oracle 21c.
