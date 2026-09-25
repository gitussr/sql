---
title: "09.07 - Correlated Subqueries"
description: "Correlated subqueries in depth: outer references, the per-row evaluation model, comparing rows with their own group, latest-row-per-group and running-total patterns, correlation in SELECT, WHERE and HAVING, accidental correlation, and the cost model."
chapter: 9
section: 9.07
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 35 min
lastUpdated: 2026-09-25
---

# 09.07 Correlated Subqueries

---

# Learning Objectives

After completing this section, you will be able to:

- Identify outer references and explain what makes a subquery correlated.
- Trace the per-row logical evaluation of a correlated subquery.
- Compare each row with a figure computed over its own group.
- Retrieve the latest row per group and compute running totals with correlated subqueries.
- Recognise accidental correlation caused by unqualified column names.
- Estimate the cost of a correlated subquery and know when to rewrite it.

---

# What is a Correlated Subquery?

A **correlated subquery** references at least one column from an enclosing query. That column—the **outer reference**—changes from one outer row to the next, so the subquery's result can change too.

```sql
-- Employees who earn more than the average of their own department
SELECT e.EmployeeName, e.DepartmentID, e.Salary
FROM Employees AS e
WHERE e.Salary > (
    SELECT AVG(e2.Salary)
    FROM Employees AS e2
    WHERE e2.DepartmentID = e.DepartmentID     -- outer reference: e.DepartmentID
);
```

---

# The Logical Evaluation Model

```text
Employees
┌────┬───────┬──────┬────────┐
│ ID │ Name  │ Dept │ Salary │
├────┼───────┼──────┼────────┤
│ 1  │ Ava   │ 10   │ 90 000 │
│ 2  │ Raj   │ 10   │ 60 000 │
│ 3  │ Mei   │ 20   │ 70 000 │
│ 4  │ Tom   │ 20   │ 50 000 │
│ 5  │ Lina  │ 20   │ 60 000 │
└────┴───────┴──────┴────────┘

Outer row Ava  (Dept 10): inner AVG over Dept 10 = 75 000 → 90 000 > 75 000 ✅
Outer row Raj  (Dept 10): inner AVG over Dept 10 = 75 000 → 60 000 > 75 000 ❌
Outer row Mei  (Dept 20): inner AVG over Dept 20 = 60 000 → 70 000 > 60 000 ✅
Outer row Tom  (Dept 20): inner AVG over Dept 20 = 60 000 → 50 000 > 60 000 ❌
Outer row Lina (Dept 20): inner AVG over Dept 20 = 60 000 → 60 000 > 60 000 ❌

Result: Ava, Mei
```

Logically, the subquery is re-evaluated for every outer row, with the outer reference replaced by that row's value. Physically, engines cache repeated values or rewrite the whole thing as a join (Section 09.14)—but the logical model is how you should reason about the result.

---

# Correlated vs Uncorrelated at a Glance

| | Uncorrelated | Correlated |
|---|--------------|------------|
| References outer columns | No | Yes |
| Can be run on its own | Yes | No |
| Logical evaluations | Once | Once per outer row |
| Typical use | Global figure, fixed set | Per-row or per-group figure |
| Typical rewrite | Constant / semi-join | Join to grouped derived table, semi-join, window function |

---

# Pattern 1: Compare a Row with Its Own Group

```sql
-- Orders larger than that customer's average order
SELECT o.OrderID, o.CustomerID, o.TotalAmount
FROM Orders AS o
WHERE o.TotalAmount > (
    SELECT AVG(o2.TotalAmount)
    FROM Orders AS o2
    WHERE o2.CustomerID = o.CustomerID
);
```

The same question as a join to a grouped derived table, which computes each customer's average once:

```sql
SELECT o.OrderID, o.CustomerID, o.TotalAmount
FROM Orders AS o
JOIN (
    SELECT CustomerID, AVG(TotalAmount) AS AvgAmount
    FROM Orders
    GROUP BY CustomerID
) AS a ON a.CustomerID = o.CustomerID
WHERE o.TotalAmount > a.AvgAmount;
```

---

# Pattern 2: Latest Row per Group

```sql
-- Each customer's most recent order
SELECT o.CustomerID, o.OrderID, o.OrderDate, o.TotalAmount
FROM Orders AS o
WHERE o.OrderDate = (
    SELECT MAX(o2.OrderDate)
    FROM Orders AS o2
    WHERE o2.CustomerID = o.CustomerID
);
```

If a customer has two orders on the latest date, both are returned. To return exactly one, break the tie explicitly:

```sql
WHERE o.OrderID = (
    SELECT o2.OrderID
    FROM Orders AS o2
    WHERE o2.CustomerID = o.CustomerID
    ORDER BY o2.OrderDate DESC, o2.OrderID DESC
    FETCH FIRST 1 ROW ONLY
);
```

This "greatest-N-per-group" problem also has `LATERAL` (Section 09.10) and window-function (`ROW_NUMBER`, Chapter 11) solutions.

---

# Pattern 3: Running Totals and Ranks

Before window functions, running totals were written as correlated subqueries:

```sql
-- Running revenue by order date
SELECT
    o.OrderID,
    o.OrderDate,
    o.TotalAmount,
    (SELECT SUM(o2.TotalAmount)
     FROM Orders AS o2
     WHERE o2.OrderDate < o.OrderDate
        OR (o2.OrderDate = o.OrderDate AND o2.OrderID <= o.OrderID)) AS RunningTotal
FROM Orders AS o
ORDER BY o.OrderDate, o.OrderID;

-- Rank of each product by price (1 = most expensive)
SELECT
    p.ProductName,
    p.ListPrice,
    1 + (SELECT COUNT(*) FROM Products AS p2 WHERE p2.ListPrice > p.ListPrice) AS PriceRank
FROM Products AS p;
```

Both are correct, and both are **quadratic**: each outer row scans a growing share of the table. `SUM(…) OVER (ORDER BY …)` and `RANK() OVER (…)` compute the same results in one pass and should be preferred on any engine that supports them.

---

# Pattern 4: Correlated EXISTS

The most common correlated subquery by far:

```sql
SELECT c.CustomerName
FROM Customers AS c
WHERE EXISTS (
    SELECT 1 FROM Orders AS o
    WHERE o.CustomerID = c.CustomerID
      AND o.TotalAmount > 1000
);
```

Section 09.05 covers it in depth. It is also the correlated form optimizers handle best.

---

# Correlation in the SELECT List and HAVING

```sql
-- SELECT list: each department with its highest-paid employee's name
SELECT
    d.DepartmentName,
    (SELECT e.EmployeeName
     FROM Employees AS e
     WHERE e.DepartmentID = d.DepartmentID
     ORDER BY e.Salary DESC, e.EmployeeID
     FETCH FIRST 1 ROW ONLY) AS TopEarner
FROM Departments AS d;

-- HAVING: departments with more employees than open projects
SELECT e.DepartmentID, COUNT(*) AS Headcount
FROM Employees AS e
GROUP BY e.DepartmentID
HAVING COUNT(*) > (
    SELECT COUNT(*)
    FROM Projects AS p
    WHERE p.DepartmentID = e.DepartmentID
      AND p.Status = 'Open'
);
```

In `HAVING`, the subquery may reference only grouping columns (here `e.DepartmentID`) or aggregates of the outer query—the same rule as the `SELECT` list after `GROUP BY` (Section 08.07).

---

# Multi-Level Correlation

A subquery may reference any enclosing query, not only its immediate parent:

```sql
SELECT c.CustomerName
FROM Customers AS c
WHERE EXISTS (
    SELECT 1 FROM Orders AS o
    WHERE o.CustomerID = c.CustomerID
      AND EXISTS (
          SELECT 1 FROM OrderItems AS oi
          WHERE oi.OrderID = o.OrderID
            AND oi.UnitPrice > (SELECT AVG(p.ListPrice) FROM Products AS p
                                WHERE p.CategoryID = (SELECT p2.CategoryID FROM Products p2
                                                      WHERE p2.ProductID = oi.ProductID))
      )
);
```

Legal, but hard to read and to optimise. Beyond one level of correlation, restructure with derived tables.

---

# Accidental Correlation

```sql
-- Intended: customers who received a refund
SELECT c.CustomerName
FROM Customers AS c
WHERE c.CustomerID IN (SELECT CustomerID FROM Refunds);
```

If `Refunds` has **no** `CustomerID` column (say it has `OrderID` only), this query does not fail. The name `CustomerID` is not found in the inner scope, so it resolves to `c.CustomerID` in the outer scope:

```text
WHERE c.CustomerID IN (SELECT c.CustomerID FROM Refunds)
      → TRUE for every customer, as long as Refunds has at least one row
```

The fix is mechanical: **qualify every column in every subquery.** `SELECT r.CustomerID FROM Refunds AS r` fails immediately with "column does not exist".

---

# Visual Representation

```text
Outer query                          Correlated subquery
┌──────────────────┐                ┌──────────────────────────────┐
│ row 1 (Dept 10) ─┼── 10 ─────────→│ AVG(Salary) WHERE Dept = 10  │──→ 75 000
│ row 2 (Dept 10) ─┼── 10 ─────────→│   (same value: cacheable)    │──→ 75 000
│ row 3 (Dept 20) ─┼── 20 ─────────→│ AVG(Salary) WHERE Dept = 20  │──→ 60 000
│ …                │                └──────────────────────────────┘
└──────────────────┘
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← correlated subqueries here see each candidate row's columns
4. GROUP BY
5. HAVING      ← correlated subqueries here see grouping columns and aggregates
6. SELECT      ← correlated subqueries here see each surviving row
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Correlated subquery
        │
        ▼
Can it be decorrelated?
        │
   ┌────┴──────────────────────────────┬──────────────────────────────────┐
   ▼                                   ▼                                  ▼
EXISTS / IN               Scalar aggregate                        Anything else
→ semi / anti join        → LEFT JOIN to GROUP BY derived          (row limits, complex
                            table on the correlation column          correlation, OR …)
                                                                   → nested SubPlan per row,
                                                                     often with a cache
```

The cost of the fallback is roughly *outer rows × cost of one inner execution*. With an index on the correlation column, one inner execution is a seek; without one, it is a scan, and the query becomes quadratic.

---

# 🔬 Engine Deep Dive

Engines avoid recomputing a correlated subquery for a value they have already seen. Oracle's *scalar subquery caching* keeps a small hash table of recent outer values and their results; SQL Server's *lazy spool* replays the previous result when the next outer row has the same correlation value (a "rewind"). If 10 000 employees belong to 12 departments and arrive sorted by department, the per-department average is computed 12 times, not 10 000. That is why plans sometimes contain a sort on the correlation column that seems to serve no purpose.

---

# 🏗️ Architecture Insight

Correlated subqueries express "for each X, look up Y" directly, and they are often the clearest first draft of a query. Treat them as a specification: write the correlated form, check the result on known data, then compare its execution plan with a join or window-function rewrite. Keep whichever is both correct and fast; on modern engines that is frequently the original.

---

# ⚡ Performance Tip

Index the inner table on the correlation column, followed by the columns the subquery filters or aggregates: `Orders(CustomerID, OrderDate)` makes "latest order per customer" one index seek per customer.

---

# 🔒 Security Note

Accidental correlation is not only a correctness bug. An exclusion list (`WHERE UserID NOT IN (SELECT UserID FROM BlockedUsers)`) that silently binds to the outer table because of a typo in the inner column name can disable an access control without any error. Qualify columns in every security-relevant subquery.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Correlated subqueries in `WHERE`, `SELECT`, `HAVING` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Correlation more than one level deep | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Decorrelation of scalar aggregates | n/a | Limited | Opt-in (`subquery_to_derived`) | ✅ | ✅ | ❌ |
| Reuse of results for repeated outer values | n/a | Memoize (joins) | Limited | Lazy spool | Scalar subquery cache | ❌ |

> **Portability Tip:** Correlated subqueries are portable in syntax but not in performance. A query that SQL Server decorrelates automatically may run as a per-row loop on PostgreSQL or SQLite; check the plan on each target engine.

---

# Common Mistakes

### Mistake 1

Unqualified columns that silently bind to the outer query.

---

### Mistake 2

Using the same alias inside and outside, so the "correlation" compares a column with itself:

```sql
-- ❌ e.DepartmentID = e.DepartmentID is always TRUE (when not NULL)
WHERE e.Salary > (SELECT AVG(e.Salary) FROM Employees AS e
                  WHERE e.DepartmentID = e.DepartmentID)
```

---

### Mistake 3

Running totals and ranks with correlated subqueries on large tables where window functions are available.

---

### Mistake 4

No index on the correlation column.

---

# Best Practices

✔ Qualify every column with a distinct alias.

✔ Keep correlation to simple equality predicates on indexed columns.

✔ Use window functions for running totals, ranks and "latest per group" on large data.

✔ Check the execution plan for per-row SubPlans on large outer tables.

✔ Break ties explicitly in any correlated row-limit subquery.

---

# Interview Questions

## Basic

1. What is a correlated subquery?
2. What is an outer reference?
3. Give an example of a question that needs a correlated subquery.

## Intermediate

4. How do you find each customer's most recent order with a correlated subquery?
5. How can a missing column in a subquery make a query return the wrong rows without an error?
6. How would you rewrite "salary above department average" as a join?

## Advanced

7. Why is a correlated running-total query quadratic?
8. How do subquery result caches reduce the cost of correlated subqueries?
9. Which kinds of correlated subqueries can optimizers not decorrelate?

---

# Hands-on Exercises

## Exercise 1

Return products priced above the average price of their own category.

---

## Exercise 2

Return each customer's largest order, returning exactly one row per customer.

---

## Exercise 3

Return every employee with the number of employees in their department, using a correlated subquery in the `SELECT` list.

---

## Exercise 4

Write a subquery with an unqualified column that silently correlates, observe the result, then fix it by qualifying the column.

---

# Related Topics

- **09.03 — Scalar Subqueries**
- **09.05 — EXISTS and NOT EXISTS**
- **09.10 — LATERAL and CROSS APPLY**
- **09.14 — Execution Flow of Subqueries (Unnesting and Decorrelation)**
- **08.07 — The SELECT List Rule (Functional Dependency)**
- **11.xx — Window Functions**

---

# Summary

A correlated subquery references columns of an enclosing query, so logically it is evaluated once per outer row with that row's values substituted. It expresses per-row and per-group comparisons directly: above the group average, latest row per group, has at least one matching child. Engines rarely execute it literally—they decorrelate it into semi-joins or joins against grouped derived tables, or cache results per distinct outer value—but when they cannot, cost grows with outer rows times inner cost. Qualify every column to prevent accidental correlation, index the correlation column, and prefer window functions for running totals and ranks.
