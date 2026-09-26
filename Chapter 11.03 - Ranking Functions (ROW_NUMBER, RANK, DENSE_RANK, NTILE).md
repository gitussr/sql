---
title: "11.03 - Ranking Functions (ROW_NUMBER, RANK, DENSE_RANK, NTILE)"
description: "Ranking rows with window functions: ROW_NUMBER, RANK and DENSE_RANK and how they treat ties, NTILE buckets and their uneven sizes, ranking within partitions, deterministic tiebreakers, ranking by expressions and aggregates, and choosing the right function for each business rule."
chapter: 11
section: 11.03
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 30 min
lastUpdated: 2026-09-25
---

# 11.03 Ranking Functions (ROW_NUMBER, RANK, DENSE_RANK, NTILE)

---

# Learning Objectives

After completing this section, you will be able to:

- Number rows with `ROW_NUMBER`.
- Rank rows with ties using `RANK` and `DENSE_RANK`.
- Explain exactly how each function treats ties.
- Split rows into buckets with `NTILE`, and predict bucket sizes.
- Rank within partitions and by aggregates.
- Choose the ranking function that matches a business rule.

---

# The Four Ranking Functions

All four require an `ORDER BY` in the window and ignore any frame.

```sql
SELECT
    EmployeeName,
    Salary,
    ROW_NUMBER() OVER (ORDER BY Salary DESC) AS RowNum,
    RANK()       OVER (ORDER BY Salary DESC) AS Rnk,
    DENSE_RANK() OVER (ORDER BY Salary DESC) AS DenseRnk,
    NTILE(3)     OVER (ORDER BY Salary DESC) AS Tercile
FROM Employees;
```

```text
┌──────────────┬────────┬────────┬─────┬──────────┬─────────┐
│ EmployeeName │ Salary │ RowNum │ Rnk │ DenseRnk │ Tercile │
├──────────────┼────────┼────────┼─────┼──────────┼─────────┤
│ Ava          │ 90 000 │ 1      │ 1   │ 1        │ 1       │
│ Mei          │ 70 000 │ 2      │ 2   │ 2        │ 1       │
│ Raj          │ 60 000 │ 3      │ 3   │ 3        │ 2       │
│ Lina         │ 60 000 │ 4      │ 3   │ 3        │ 2       │
│ Tom          │ 50 000 │ 5      │ 5   │ 4        │ 3       │
└──────────────┴────────┴────────┴─────┴──────────┴─────────┘
```

---

# ROW_NUMBER

Assigns 1, 2, 3 … in window order—**always unique** within a partition, even for ties.

```text
Salaries: 90, 70, 60, 60, 50
ROW_NUMBER: 1, 2, 3, 4, 5      (Raj or Lina gets 3 — arbitrarily, unless tie broken)
```

Use it when you need exactly one row per position: "the latest order", "the first 10 rows", deduplication. Because it is unique, the tie between Raj and Lina is decided arbitrarily unless you add a tiebreaker:

```sql
ROW_NUMBER() OVER (ORDER BY Salary DESC, EmployeeID)
```

---

# RANK

Tied rows get the same rank; the next rank **skips** as many positions as there were ties—"Olympic" ranking.

```text
Salaries: 90, 70, 60, 60, 50
RANK:      1,  2,  3,  3,  5      (no 4th place)
```

`RANK` = 1 + number of rows strictly ahead of this row. Use it for competition-style rankings, and for "top N including ties" when N counts rows ahead.

---

# DENSE_RANK

Tied rows get the same rank; the next rank is the **next integer**—no gaps.

```text
Salaries: 90, 70, 60, 60, 50
DENSE_RANK: 1, 2,  3,  3,  4
```

`DENSE_RANK` = 1 + number of distinct values strictly ahead. Use it for "the top 3 salary levels", "second-highest distinct price":

```sql
-- Second-highest distinct salary per department
SELECT DepartmentID, Salary
FROM (
    SELECT DepartmentID, Salary,
           DENSE_RANK() OVER (PARTITION BY DepartmentID ORDER BY Salary DESC) AS dr
    FROM Employees
    WHERE Salary IS NOT NULL
) AS t
WHERE t.dr = 2
GROUP BY DepartmentID, Salary;
```

---

# Comparing Them

| Salaries (desc) | 90 | 70 | 60 | 60 | 50 |
|-----------------|----|----|----|----|----|
| `ROW_NUMBER` | 1 | 2 | 3 | 4 | 5 |
| `RANK` | 1 | 2 | 3 | 3 | 5 |
| `DENSE_RANK` | 1 | 2 | 3 | 3 | 4 |

| Business rule | Function |
|---------------|----------|
| "Exactly one row per customer" | `ROW_NUMBER` (+ tiebreaker) |
| "Top 3 sellers, ties share a place, next place skipped" | `RANK` |
| "Top 3 price points" | `DENSE_RANK` |
| "Page 3 of 20 rows" | `ROW_NUMBER` (or `OFFSET`/keyset) |
| "All employees with the highest salary" | `RANK = 1` or `DENSE_RANK = 1` |

---

# NTILE

`NTILE(n)` divides the ordered partition into `n` buckets of as equal size as possible, numbered 1 to `n`.

```sql
-- Customer quartiles by revenue
SELECT CustomerID, Revenue,
       NTILE(4) OVER (ORDER BY Revenue DESC) AS Quartile
FROM (SELECT CustomerID, SUM(TotalAmount) AS Revenue
      FROM Orders GROUP BY CustomerID) AS r;
```

When rows do not divide evenly, the **first** buckets get one extra row:

```text
10 rows, NTILE(4) → bucket sizes 3, 3, 2, 2
 5 rows, NTILE(3) → bucket sizes 2, 2, 1
```

Two caveats:

- `NTILE` splits by **row count**, not by value: tied values can land in different buckets.
- With fewer rows than buckets, some buckets are empty (`NTILE(10)` over 4 rows produces buckets 1–4 only).

For value-based percentiles, use `PERCENT_RANK`, `CUME_DIST` or `PERCENTILE_CONT` (Section 11.09).

---

# Ranking Within Partitions

```sql
-- Rank products by revenue within each category
SELECT
    p.CategoryID,
    p.ProductName,
    SUM(oi.Quantity * oi.UnitPrice) AS Revenue,
    RANK() OVER (PARTITION BY p.CategoryID
                 ORDER BY SUM(oi.Quantity * oi.UnitPrice) DESC) AS RankInCategory
FROM OrderItems AS oi
JOIN Products AS p ON p.ProductID = oi.ProductID
GROUP BY p.CategoryID, p.ProductID, p.ProductName;
```

Ranking by an aggregate works because windows run after `GROUP BY` (Section 11.02).

---

# Ranking Without Window Functions

Before windows, ranks were computed with correlated subqueries:

```sql
SELECT e.EmployeeName, e.Salary,
       1 + (SELECT COUNT(*) FROM Employees e2 WHERE e2.Salary > e.Salary) AS Rnk
FROM Employees AS e;
```

That is exactly `RANK()`—but quadratic in cost (Section 09.07). Use the window function.

---

# Using Ranks

Ranks are usually filtered in an outer query:

```sql
-- Top 3 employees by salary in each department, ties included
SELECT *
FROM (
    SELECT e.*, RANK() OVER (PARTITION BY DepartmentID ORDER BY Salary DESC) AS rnk
    FROM Employees AS e
    WHERE e.Salary IS NOT NULL
) AS t
WHERE t.rnk <= 3;
```

With `RANK`, "top 3" may return more than three rows (ties at third place) or, with a tie at first place, include fewer distinct places. Section 11.10 covers top-N patterns in detail.

---

# Visual Representation

```text
Salary       90   70   60   60   50
             │    │    │    │    │
ROW_NUMBER   1    2    3    4    5     every row its own position
RANK         1    2    3    3    5     ties share, then skip
DENSE_RANK   1    2    3    3    4     ties share, no skip
NTILE(3)     1    1    2    2    3     equal-count buckets
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← rows removed here are not ranked
4. GROUP BY    ← ranking by aggregates is possible because groups exist
5. HAVING
6. WINDOW      ← ranks are assigned here
7. SELECT
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
RANK() OVER (PARTITION BY DepartmentID ORDER BY Salary DESC)

Sort (DepartmentID, Salary DESC)
Window operator, per row:
    new partition?          → row_number = 1, rank = 1, dense = 1
    same ORDER BY value
      as previous row?      → row_number += 1, rank unchanged, dense unchanged
    new ORDER BY value      → row_number += 1, rank = row_number, dense += 1
```

Ranking functions need only the current and previous row—constant memory beyond the sort.

---

# 🔬 Engine Deep Dive

Because ranking functions are monotonic within a partition, optimizers can stop early when an outer query filters on them. PostgreSQL 15+ recognises `WHERE rn <= N` above a `ROW_NUMBER()`/`RANK()`/`DENSE_RANK()` in a subquery as a *run condition* and stops computing each partition once the limit is exceeded. SQL Server and Oracle have similar top-N-per-group optimisations (`WINDOW SORT PUSHED RANK` in Oracle plans).

---

# 🏗️ Architecture Insight

Choosing between `ROW_NUMBER`, `RANK` and `DENSE_RANK` is a **business decision** disguised as a technical one: what happens to ties? Leaderboards, commission tiers, "top products" reports and pagination all answer that differently. Make the tie rule explicit in the requirement, then pick the function.

---

# ⚡ Performance Tip

For "top N per group" over large tables with an index on `(partition columns, order columns)`, a `LATERAL`/`APPLY` query (Section 09.10) can read only N rows per group, while a ranking window reads every row. Compare both when groups are few and large.

---

# 🔒 Security Note

Ranks derived from salary or performance data are themselves sensitive: "rank 1 of 3 in department 40" narrows an individual's salary considerably. Apply the same access rules to derived ranks as to the underlying values.

---

# SQL Standard vs Vendor Differences

| Function | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `ROW_NUMBER` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `RANK` / `DENSE_RANK` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `NTILE` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ROW_NUMBER()` without `ORDER BY` | ❌ | ✅ (arbitrary) | ✅ | ❌ (needs `ORDER BY`; `(SELECT NULL)` trick) | ❌ (ORA-30485) | ✅ |
| Top-N-per-group early stop | n/a | ✅ (15+) | ❌ | ✅ | ✅ | ❌ |

> **Portability Tip:** All four ranking functions are portable. Always supply `ORDER BY` with a tiebreaker—it is required by SQL Server and makes results deterministic everywhere.

---

# Common Mistakes

### Mistake 1

Using `ROW_NUMBER` when ties should share a place.

---

### Mistake 2

Using `RANK` for "top 3 distinct values" (should be `DENSE_RANK`).

---

### Mistake 3

`ROW_NUMBER` without a tiebreaker, so the chosen row changes between runs.

---

### Mistake 4

Treating `NTILE` buckets as value-based percentiles.

---

### Mistake 5

Ranking a nullable column without deciding where `NULL`s go.

---

# Best Practices

✔ Decide the tie rule first, then choose `ROW_NUMBER`, `RANK` or `DENSE_RANK`.

✔ Add a unique tiebreaker to `ROW_NUMBER`.

✔ Use `NTILE` for equal-count buckets only.

✔ Exclude or explicitly order `NULL`s before ranking.

✔ Filter ranks in an outer query.

---

# Interview Questions

## Basic

1. What is the difference between `ROW_NUMBER`, `RANK` and `DENSE_RANK`?
2. What does `NTILE(4)` do?
3. How do you rank employees by salary within each department?

## Intermediate

4. Given salaries 100, 90, 90, 80, what do `RANK` and `DENSE_RANK` return?
5. How do you find the second-highest distinct salary per department?
6. Why can `ROW_NUMBER` be non-deterministic?

## Advanced

7. How does `NTILE` distribute rows when they do not divide evenly?
8. How can an optimizer stop early when filtering `ROW_NUMBER() <= N`?
9. When would you choose `LATERAL` over `ROW_NUMBER` for top N per group?

---

# Hands-on Exercises

## Exercise 1

Rank products by list price with all three ranking functions and compare the results on data with ties.

---

## Exercise 2

Split customers into revenue deciles with `NTILE(10)`.

---

## Exercise 3

Return the three highest distinct order totals per customer.

---

## Exercise 4

Rank categories by revenue for each year using `GROUP BY` and `RANK` together.

---

# Related Topics

- **11.02 — The OVER Clause (PARTITION BY and ORDER BY)**
- **11.09 — Distribution Functions (PERCENT_RANK, CUME_DIST and Percentiles)**
- **11.10 — Top-N per Group, Deduplication and QUALIFY**
- **09.07 — Correlated Subqueries**
- **09.10 — LATERAL and CROSS APPLY**

---

# Summary

`ROW_NUMBER` numbers rows uniquely, `RANK` gives ties the same rank and skips the following positions, `DENSE_RANK` gives ties the same rank without gaps, and `NTILE(n)` splits rows into `n` equal-count buckets with the first buckets one row larger when needed. All require a window `ORDER BY`, restart in each partition, and can rank by aggregates after `GROUP BY`. Choose the function by the business rule for ties, add a unique tiebreaker wherever exactly one row per position is required, and filter ranks in an outer query.
