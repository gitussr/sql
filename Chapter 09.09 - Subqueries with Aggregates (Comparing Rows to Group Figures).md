---
title: "09.09 - Subqueries with Aggregates (Comparing Rows to Group Figures)"
description: "Combining subqueries and aggregation: rows versus global figures, rows versus their own group, groups versus the overall figure in HAVING, top groups, shares and ratios, nested aggregation, and choosing between subqueries, derived tables and window functions."
chapter: 9
section: 9.09
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 30 min
lastUpdated: 2026-09-25
---

# 09.09 Subqueries with Aggregates (Comparing Rows to Group Figures)

---

# Learning Objectives

After completing this section, you will be able to:

- Compare each row with a global aggregate.
- Compare each row with an aggregate of its own group.
- Compare each group with an overall or another group's aggregate in `HAVING`.
- Find the top group or groups, ties included.
- Compute shares and ratios of a total.
- Choose between a subquery, a derived table and a window function for these questions.

---

# The Four Comparison Levels

Most analytical questions compare something at one grain with an aggregate at another.

| Compare | With | Example | Tool |
|---------|------|---------|------|
| Row | Global figure | Orders above the overall average | Uncorrelated scalar subquery in `WHERE` |
| Row | Its group's figure | Orders above their customer's average | Correlated subquery / derived table |
| Group | Global figure | Customers whose revenue exceeds the average customer's | Subquery in `HAVING` |
| Group | Best group | The customer(s) with the highest revenue | Subquery in `HAVING` with nested aggregate |

---

# Row vs Global Figure

```sql
-- Products priced above the average list price
SELECT p.ProductName, p.ListPrice
FROM Products AS p
WHERE p.ListPrice > (SELECT AVG(ListPrice) FROM Products);

-- Orders in the top 10% by value (PostgreSQL / Oracle percentile)
SELECT o.OrderID, o.TotalAmount
FROM Orders AS o
WHERE o.TotalAmount >= (
    SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY TotalAmount)
    FROM Orders
);
```

The subquery is uncorrelated and runs once.

---

# Row vs Its Own Group

```sql
-- Employees earning above their department's average
SELECT e.EmployeeName, e.DepartmentID, e.Salary
FROM Employees AS e
WHERE e.Salary > (
    SELECT AVG(e2.Salary)
    FROM Employees AS e2
    WHERE e2.DepartmentID = e.DepartmentID
);
```

Three equivalent shapes, which optimizers often turn into the same plan:

```sql
-- Derived table
SELECT e.EmployeeName, e.DepartmentID, e.Salary, d.AvgSalary
FROM Employees AS e
JOIN (SELECT DepartmentID, AVG(Salary) AS AvgSalary
      FROM Employees GROUP BY DepartmentID) AS d
  ON d.DepartmentID = e.DepartmentID
WHERE e.Salary > d.AvgSalary;

-- Window function (Chapter 11)
SELECT t.EmployeeName, t.DepartmentID, t.Salary, t.AvgSalary
FROM (
    SELECT e.*, AVG(e.Salary) OVER (PARTITION BY e.DepartmentID) AS AvgSalary
    FROM Employees AS e
) AS t
WHERE t.Salary > t.AvgSalary;
```

The derived-table and window forms can also **display** the group figure; the correlated form only filters with it.

---

# Group vs Global Figure (HAVING)

```sql
-- Departments whose average salary exceeds the company average
SELECT e.DepartmentID, AVG(e.Salary) AS AvgSalary
FROM Employees AS e
GROUP BY e.DepartmentID
HAVING AVG(e.Salary) > (SELECT AVG(Salary) FROM Employees);
```

Note the subtle point: "the company average" (average over all employees) is not "the average of the department averages". The two differ whenever departments have different sizes:

```sql
-- Average of department averages: each department weighs equally
HAVING AVG(e.Salary) > (
    SELECT AVG(d.AvgSalary)
    FROM (SELECT AVG(Salary) AS AvgSalary FROM Employees GROUP BY DepartmentID) AS d
);
```

Decide which one the question means—Section 08.16 lists averaging averages as a common mistake.

---

# Group vs Best Group

"Which customer has the highest revenue?"—ties included:

```sql
SELECT o.CustomerID, SUM(o.TotalAmount) AS Revenue
FROM Orders AS o
GROUP BY o.CustomerID
HAVING SUM(o.TotalAmount) = (
    SELECT MAX(t.Revenue)
    FROM (SELECT SUM(TotalAmount) AS Revenue
          FROM Orders
          GROUP BY CustomerID) AS t
);
```

```text
Inner derived table:   revenue per customer   {330, 620, 60}
MAX over it:           620
Outer HAVING:          keep groups with SUM = 620  → customer 2
```

Alternatives:

```sql
-- ALL (not on SQLite)
HAVING SUM(o.TotalAmount) >= ALL (SELECT SUM(TotalAmount) FROM Orders GROUP BY CustomerID)

-- Row limit with ties (PostgreSQL 13+, Oracle, SQL Server TOP … WITH TIES)
SELECT o.CustomerID, SUM(o.TotalAmount) AS Revenue
FROM Orders AS o
GROUP BY o.CustomerID
ORDER BY Revenue DESC
FETCH FIRST 1 ROW WITH TIES;
```

`FETCH FIRST 1 ROW ONLY` without `WITH TIES` silently drops tied winners.

---

# Shares and Ratios

```sql
-- Each category's share of total revenue
SELECT
    p.CategoryID,
    SUM(oi.Quantity * oi.UnitPrice) AS Revenue,
    ROUND(100.0 * SUM(oi.Quantity * oi.UnitPrice)
          / (SELECT SUM(Quantity * UnitPrice) FROM OrderItems), 1) AS PctOfTotal
FROM OrderItems AS oi
JOIN Products AS p ON p.ProductID = oi.ProductID
GROUP BY p.CategoryID;
```

The scalar subquery computes the grand total once. The window-function version—`SUM(SUM(oi.Quantity * oi.UnitPrice)) OVER ()`—reads the data once instead of twice.

---

# Groups Compared with Other Groups

```sql
-- Customers who spent more in 2026 than in 2025
SELECT c.CustomerID, c.CustomerName
FROM Customers AS c
WHERE (SELECT COALESCE(SUM(o.TotalAmount), 0) FROM Orders AS o
       WHERE o.CustomerID = c.CustomerID
         AND o.OrderDate >= DATE '2026-01-01' AND o.OrderDate < DATE '2027-01-01')
    >
      (SELECT COALESCE(SUM(o.TotalAmount), 0) FROM Orders AS o
       WHERE o.CustomerID = c.CustomerID
         AND o.OrderDate >= DATE '2025-01-01' AND o.OrderDate < DATE '2026-01-01');
```

Clear, but it reads `Orders` twice per customer. Conditional aggregation (Section 08.10) does it in one pass:

```sql
SELECT o.CustomerID
FROM Orders AS o
WHERE o.OrderDate >= DATE '2025-01-01' AND o.OrderDate < DATE '2027-01-01'
GROUP BY o.CustomerID
HAVING SUM(CASE WHEN o.OrderDate >= DATE '2026-01-01' THEN o.TotalAmount ELSE 0 END)
     > SUM(CASE WHEN o.OrderDate <  DATE '2026-01-01' THEN o.TotalAmount ELSE 0 END);
```

Customers with no orders in either year are excluded by both—the first because `0 > 0` is FALSE, the second because they have no rows to group. But the two are not identical: the second groups guest orders too, so a `NULL` `CustomerID` group can appear in its result. Check edge cases like these whenever you rewrite a query.

---

# Nested Aggregation

Aggregates cannot be nested directly:

```sql
-- ❌ aggregate function calls cannot be nested (PostgreSQL, SQL Server, MySQL)
SELECT MAX(COUNT(*)) FROM Orders GROUP BY CustomerID;
```

Oracle accepts this one-level nesting as an extension; everywhere else, use a derived table:

```sql
SELECT MAX(t.OrderCount) AS MostOrdersByOneCustomer
FROM (SELECT COUNT(*) AS OrderCount FROM Orders GROUP BY CustomerID) AS t;
```

---

# Choosing the Tool

```text
Need the group figure DISPLAYED next to each row?
    yes → window function   (or join to a grouped derived table)
    no  ↓
Comparing a row with ONE global figure?
    yes → uncorrelated scalar subquery
    no  ↓
Comparing a row with its own group's figure?
    yes → correlated subquery, derived table or window function
    no  ↓
Comparing a GROUP with something?
    yes → subquery in HAVING (derived table inside for "best group")
```

---

# Visual Representation

```text
Row level           Group level            Global level
┌─────────┐         ┌────────────┐         ┌───────────┐
│ order   │──┐      │ customer   │──┐      │ all       │
│ order   │  ├────→ │ SUM, AVG   │  ├────→ │ AVG, MAX  │
│ order   │──┘      │ customer   │──┘      │ of groups │
└─────────┘         └────────────┘         └───────────┘
     ▲                    ▲                       │
     └── compare with ────┴─── compare with ──────┘
         (correlated)           (HAVING subquery)
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← row-versus-figure comparisons
4. GROUP BY
5. HAVING      ← group-versus-figure comparisons
6. SELECT      ← shares and ratios using a scalar total
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
HAVING SUM(TotalAmount) = (SELECT MAX(Revenue) FROM (… GROUP BY CustomerID) t)

Plan
  Filter: SUM(TotalAmount) = $0
    HashAggregate by CustomerID           ← outer grouping
      Scan Orders
  InitPlan $0
    Aggregate MAX
      HashAggregate by CustomerID         ← the same grouping, computed again
        Scan Orders
```

The grouping is computed twice, because the subquery and the outer query are separate blocks. A common table expression referenced twice may let the engine compute it once (materialised CTE); a window function (`RANK() OVER (ORDER BY SUM(TotalAmount) DESC)`) reads the table once.

---

# 🔬 Engine Deep Dive

When an outer `WHERE` compares a row with a correlated `AVG` over its own group, SQL Server and Oracle typically rewrite the subquery into a join with a grouped derived table, and may even use a single scan with a *segment* or *window* operator—effectively the window-function plan. PostgreSQL executes the correlated form as a SubPlan per outer row unless you write the derived-table or window form yourself.

---

# 🏗️ Architecture Insight

"Compared with what?" is the core question of every analytical report, and the answer always names two grains: the thing being judged and the population it is judged against. Writing both grains explicitly—one query block per grain—keeps reports honest about whether "average" means per order, per customer or per customer weighted by orders.

---

# ⚡ Performance Tip

If the same aggregate is computed in the outer query and again in a subquery, look for a window-function formulation. It replaces two passes over the data with one, which matters on large fact tables.

---

# 🔒 Security Note

Comparisons with group figures can reveal individual values in small groups ("the only employee in department 40 earns above the department average" reveals nothing; "…above the company average" reveals a range). Apply minimum group sizes in `HAVING` for published reports, as Section 08.08 describes.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Subquery in `HAVING` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Nested aggregates `MAX(COUNT(*))` | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `FETCH FIRST … WITH TIES` | ✅ | ✅ (13+) | ❌ | `TOP … WITH TIES` | ✅ (12c+) | ❌ |
| Window aggregate over a group aggregate | ✅ | ✅ | ✅ (8.0+) | ✅ | ✅ | ✅ (3.25+) |

> **Portability Tip:** A derived table inside the `HAVING` subquery (`MAX` over grouped sums) finds the top group with ties on every engine.

---

# Common Mistakes

### Mistake 1

Confusing the overall average with the average of group averages.

---

### Mistake 2

Finding "the top customer" with `FETCH FIRST 1 ROW ONLY` and silently dropping ties.

---

### Mistake 3

Nesting aggregates directly (`MAX(COUNT(*))`), which only Oracle accepts.

---

### Mistake 4

Using two correlated subqueries against the same table where conditional aggregation reads it once.

---

# Best Practices

✔ Name both grains in every comparison: the row or group, and the population.

✔ Use a derived table for aggregates of aggregates.

✔ Include ties deliberately—`= MAX(…)`, `>= ALL` or `WITH TIES`.

✔ Prefer window functions when the group figure should appear in the output.

✔ Guard divisions by a total with `NULLIF(…, 0)`.

---

# Interview Questions

## Basic

1. How do you return products priced above the average?
2. How do you return employees paid above their department's average?
3. Why can't you write `MAX(COUNT(*))`?

## Intermediate

4. How do you find the customer with the highest revenue, including ties?
5. What is the difference between the company average salary and the average of department averages?
6. How do you compute each category's share of total revenue?

## Advanced

7. Why does the "best group" query compute the grouping twice, and how can you avoid it?
8. When is a window function better than a correlated subquery for these comparisons?
9. What edge cases can differ between a correlated-subquery comparison and its conditional-aggregation rewrite?

---

# Hands-on Exercises

## Exercise 1

Return orders whose total exceeds the average order total of their customer.

---

## Exercise 2

Return categories whose total revenue exceeds the average category revenue.

---

## Exercise 3

Return the department(s) with the largest headcount, including ties.

---

## Exercise 4

Return each product with its share of its category's revenue.

---

# Related Topics

- **08.08 — HAVING**
- **08.10 — Conditional Aggregation (FILTER and CASE)**
- **09.03 — Scalar Subqueries**
- **09.07 — Correlated Subqueries**
- **09.08 — Derived Tables (Subqueries in FROM)**
- **11.xx — Window Functions**

---

# Summary

Analytical questions compare something at one grain with an aggregate at another. Rows compared with a global figure need an uncorrelated scalar subquery; rows compared with their own group need a correlated subquery, a grouped derived table or a window function; groups compared with a population need a subquery in `HAVING`, with a derived table inside when the population is itself a set of groups. Be explicit about which average you mean, include ties on purpose, avoid direct nesting of aggregates, and prefer window functions when the figure must be displayed or when the same aggregate would otherwise be computed twice.
