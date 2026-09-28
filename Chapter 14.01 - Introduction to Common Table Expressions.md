---
title: "14.01 - Introduction to Common Table Expressions"
description: "What a common table expression is, the problems it solves compared with nested subqueries (inside-out reading, repeated subqueries, untestable steps), the difference between non-recursive and recursive CTEs, where CTEs fit among subqueries, views and temporary tables, and the three questions—what, how often, what stops it—that the rest of Chapter 14 builds on."
chapter: 14
section: 14.01
category: Data Query Language (DQL)
difficulty: Beginner
readingTime: 20 min
lastUpdated: 2026-09-28
---

# 14.01 Introduction to Common Table Expressions

---

# Learning Objectives

After completing this section, you will be able to:

- Describe what a common table expression is.
- Explain the problems of deeply nested subqueries that CTEs solve.
- Distinguish non-recursive from recursive CTEs.
- Place CTEs among subqueries, views and temporary tables.
- State the three questions to ask about every CTE.

---

# The Problem With Nesting

Consider a question with three steps: *which customers spent more than the average customer in 2026, and what share of total revenue did they bring?*

With nested subqueries (Chapter 09):

```sql
SELECT t.CustomerID, t.Total,
       t.Total / (SELECT SUM(TotalAmount) FROM Orders
                  WHERE OrderDate >= DATE '2026-01-01' AND OrderDate < DATE '2027-01-01') AS Share
FROM (
    SELECT CustomerID, SUM(TotalAmount) AS Total
    FROM Orders
    WHERE OrderDate >= DATE '2026-01-01' AND OrderDate < DATE '2027-01-01'
    GROUP BY CustomerID
) AS t
WHERE t.Total > (
    SELECT AVG(x.Total)
    FROM (
        SELECT CustomerID, SUM(TotalAmount) AS Total
        FROM Orders
        WHERE OrderDate >= DATE '2026-01-01' AND OrderDate < DATE '2027-01-01'
        GROUP BY CustomerID
    ) AS x
);
```

Three problems:

1. **Inside-out reading.** The first thing you read is the last thing computed.
2. **Repetition.** The per-customer totals are written twice; the date filter three times. A change must be made in every copy.
3. **No intermediate results.** You cannot easily look at "the per-customer totals" on their own while debugging.

---

# The Same Query as a CTE Pipeline

```sql
WITH Orders2026 AS (
    SELECT CustomerID, TotalAmount
    FROM Orders
    WHERE OrderDate >= DATE '2026-01-01' AND OrderDate < DATE '2027-01-01'
),
CustomerTotals AS (
    SELECT CustomerID, SUM(TotalAmount) AS Total
    FROM Orders2026
    GROUP BY CustomerID
),
Benchmarks AS (
    SELECT AVG(Total) AS AvgTotal, SUM(Total) AS GrandTotal
    FROM CustomerTotals
)
SELECT t.CustomerID, t.Total, t.Total / b.GrandTotal AS Share
FROM CustomerTotals AS t
CROSS JOIN Benchmarks AS b
WHERE t.Total > b.AvgTotal
ORDER BY t.Total DESC;
```

```text
Orders ──▶ Orders2026 ──▶ CustomerTotals ──┬──────────────────▶ final SELECT
            (filter)       (aggregate)      └──▶ Benchmarks ──┘
                                                (avg, total)
```

The query now reads top to bottom, each step is written once, and each step has a name that says what it holds. To debug, replace the final `SELECT` with `SELECT * FROM CustomerTotals`.

---

# Two Kinds of CTE

```text
NON-RECURSIVE                                RECURSIVE
WITH Name AS (query)                         WITH RECURSIVE Name AS (
                                                 anchor
                                                 UNION ALL
                                                 query referencing Name
                                             )
a named subquery                             repeats until no new rows
readability, reuse                           trees, graphs, sequences
14.02 – 14.04, 14.09, 14.10, 14.12           14.05 – 14.08, 14.11
```

A non-recursive CTE never adds expressive power—every non-recursive CTE can be rewritten as a derived table. A recursive CTE does: without it (or vendor syntax such as Oracle's `CONNECT BY`), a query cannot follow a parent–child chain of unknown length.

---

# Recursion in One Picture

```sql
WITH RECURSIVE Countdown (n) AS (
    SELECT 3                               -- anchor
    UNION ALL
    SELECT n - 1 FROM Countdown WHERE n > 1   -- recursive member + termination
)
SELECT n FROM Countdown;                   -- 3, 2, 1
```

```text
iteration 0 (anchor):     {3}
iteration 1:  from {3} →  {2}
iteration 2:  from {2} →  {1}
iteration 3:  from {1} →  {}     n > 1 is false → no new rows → stop
result: 3, 2, 1  (the union of all iterations)
```

Each iteration sees only the rows produced by the **previous** iteration. Section 14.05 covers the mechanics.

---

# Where CTEs Fit

| Tool | Lifetime | Stored? | Reusable within a statement | Recursive |
|------|----------|---------|------------------------------|-----------|
| Subquery / derived table | One use | No | No (write it again) | No |
| CTE | One statement | No | Yes, by name | Yes |
| View | Permanent | Definition only | Across statements | Can contain a recursive CTE |
| Temporary table | Session / transaction | Yes, data | Across statements | No (but can be filled by one) |

Rule of thumb: use a CTE to structure **one** query; a view when the same logic is needed by **many** queries; a temporary table when an expensive intermediate result must be **computed once and reused** or indexed. Section 14.04 compares them in detail.

---

# Three Questions for Every CTE

```text
1. WHAT does it compute?          → give it a name that says so
2. HOW OFTEN is it referenced?    → once: inlined; several times: maybe recomputed or materialized
3. WHAT STOPS it? (if recursive)  → a termination condition, a depth limit, cycle detection
```

---

# Visual Representation

```text
   nested subqueries                         CTE pipeline
   ┌────────────────────────────┐            WITH A AS ( … ),
   │ SELECT …                   │                 B AS ( … A … ),
   │ FROM ( SELECT …            │                 C AS ( … B … )
   │        FROM ( SELECT … ) ) │            SELECT … FROM C;
   │ WHERE x > ( SELECT … )     │
   └────────────────────────────┘            read top → bottom
   read innermost → outermost                each step named, written once
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← CTEs are read here, by name, like tables
2. JOIN        ← CTEs can be joined to tables and to other CTEs
3. WHERE
4. GROUP BY
5. HAVING
6. WINDOW
7. SELECT
8. DISTINCT
9. ORDER BY    ← only the outermost ORDER BY orders the result
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
WITH CustomerTotals AS (…) SELECT … FROM CustomerTotals …
   parse: CustomerTotals is a CTE name, not a table
   plan:  referenced once → inline it, as if it were a derived table
          referenced twice → inline twice or materialize once (engine-dependent)
   run:   the plan contains no "CTE step" unless the CTE was materialized
```

---

# 🏗️ Architecture Insight

Treat a long CTE pipeline like a small program: each CTE is a function with a clear input and output. Code review becomes a review of each step's name and logic, and bugs can be isolated by querying intermediate steps directly.

---

# ⚡ Performance Tip

Rewriting nested subqueries as CTEs usually has no performance effect on engines that inline CTEs—the optimizer sees the same query. The exceptions (older PostgreSQL, CTEs referenced several times) are covered in Sections 14.13 and 14.15.

---

# 🌍 Production Consideration

CTEs arrived late in some engines: MySQL 8.0 (2018) and SQLite 3.8.3 (2014). Code that must run on MySQL 5.7 or older embedded SQLite builds cannot use `WITH`. Check the minimum engine version before adopting CTEs in shared code.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `WITH` (non-recursive) | ✅ | ✅ | ✅ (8.0+) | ✅ | ✅ | ✅ |
| Recursive | ✅ | ✅ | ✅ (8.0+) | ✅ | ✅ (11gR2+) | ✅ |
| `RECURSIVE` keyword | Required | Required | Required | ❌ | ❌ | Optional |
| Vendor hierarchy syntax | ❌ | ❌ | ❌ | `hierarchyid` type | `CONNECT BY` | ❌ |

> **Portability Tip:** Plain `WITH … SELECT` is portable to every current engine. Keep the `RECURSIVE` keyword difference in mind when sharing recursive queries between SQL Server/Oracle and the others.

---

# Common Mistakes

### Mistake 1

Thinking a CTE stores its result like a temporary table.

---

### Mistake 2

Giving CTEs meaningless names such as `t1`, `t2`, `cte`.

---

### Mistake 3

Writing a recursive CTE without a condition that eventually produces no rows.

---

# Best Practices

✔ Use CTEs to turn nested queries into named steps.

✔ Name each CTE after what it holds.

✔ Keep each CTE to one idea.

✔ Plan termination before writing a recursive CTE.

---

# Interview Questions

## Basic

1. What is a common table expression?
2. How long does a CTE exist?
3. What keyword introduces a CTE?

## Intermediate

4. What problems of nested subqueries do CTEs solve?
5. What can a recursive CTE do that a derived table cannot?
6. When would you use a view instead of a CTE?

## Advanced

7. Is a CTE computed once if it is referenced twice? Explain.
8. How does each iteration of a recursive CTE decide which rows it sees?

---

# Hands-on Exercises

## Exercise 1

Rewrite a query with two levels of nested derived tables as a CTE pipeline.

---

## Exercise 2

Write a recursive CTE that produces the numbers 1 to 10.

---

## Exercise 3

Take a CTE pipeline and query each intermediate CTE on its own to check its row count.

---

# Related Topics

- **Chapter 14 — Common Table Expressions**
- **14.02 — CTE Syntax and Scope**
- **14.05 — Recursive CTEs (Anchor, Recursive Member and Termination)**
- **09.01 — Introduction to Subqueries**
- **09.08 — Derived Tables (Subqueries in FROM)**

---

# Summary

A common table expression is a named, statement-scoped result set defined with `WITH` before the query that uses it. Non-recursive CTEs replace nested, repeated subqueries with a readable top-to-bottom pipeline of named steps that can be debugged individually; recursive CTEs add real expressive power by repeating a self-referencing query until no new rows appear. For every CTE, ask what it computes, how often it is referenced, and—if recursive—what stops it.
