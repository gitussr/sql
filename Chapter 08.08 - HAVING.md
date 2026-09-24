---
title: "08.08 - HAVING"
description: "HAVING in depth: filtering groups by aggregate conditions, combining conditions, HAVING without GROUP BY, aggregates in HAVING that are not selected, aliases in HAVING, comparing groups with an overall figure, and duplicate detection."
chapter: 8
section: 8.08
category: Data Query Language (DQL)
difficulty: Beginner → Intermediate
readingTime: 30 min
lastUpdated: 2026-09-24
---

# 08.08 HAVING

---

# Learning Objectives

After completing this section, you will be able to:

- Filter groups with `HAVING`.
- Combine several group conditions with `AND`, `OR` and `NOT`.
- Use aggregates in `HAVING` that do not appear in `SELECT`.
- Explain why standard SQL does not allow `SELECT` aliases in `HAVING`.
- Use `HAVING` without `GROUP BY`.
- Compare each group with an overall figure.
- Find duplicate values with `GROUP BY ... HAVING COUNT(*) > 1`.

---

# What is HAVING?

`HAVING` is a filter on groups. It runs after `GROUP BY` has built the groups and computed their aggregates, and keeps only the groups for which its condition is TRUE.

```sql
SELECT
    CustomerID,
    COUNT(*)         AS Orders,
    SUM(TotalAmount) AS Revenue
FROM Orders
GROUP BY CustomerID
HAVING SUM(TotalAmount) > 300;
```

```text
Groups after GROUP BY               HAVING SUM(TotalAmount) > 300
┌──────┬────────┬─────────┐
│ Cust │ Orders │ Revenue │
├──────┼────────┼─────────┤
│ 1    │ 2      │ 330.00  │  ✅ kept
│ 2    │ 2      │ 620.00  │  ✅ kept
│ 3    │ 1      │  60.00  │  ❌ discarded
└──────┴────────┴─────────┘
```

Like `WHERE`, `HAVING` keeps only TRUE; groups for which the condition is FALSE or UNKNOWN are discarded (Section 06.08).

---

# Syntax

```sql
SELECT   grouping_columns, aggregates
FROM     ...
WHERE    row_condition
GROUP BY grouping_columns
HAVING   group_condition
ORDER BY ...;
```

The group condition may reference:

- grouping columns;
- aggregate functions—whether or not they appear in `SELECT`;
- constants, parameters and subqueries.

It may **not** reference ungrouped columns outside an aggregate—the same rule as `SELECT` (Section 08.07).

---

# Aggregates Not in the SELECT List

`HAVING` can filter on any aggregate, not only those that are returned:

```sql
-- Customers with at least 3 orders, showing only their revenue
SELECT
    CustomerID,
    SUM(TotalAmount) AS Revenue
FROM Orders
GROUP BY CustomerID
HAVING COUNT(*) >= 3;
```

The engine computes `COUNT(*)` for every group, uses it to filter, and discards it.

---

# Combining Conditions

```sql
SELECT
    CustomerID,
    COUNT(*)         AS Orders,
    SUM(TotalAmount) AS Revenue
FROM Orders
GROUP BY CustomerID
HAVING COUNT(*) >= 2
   AND SUM(TotalAmount) BETWEEN 300 AND 1000
   AND MAX(OrderDate) >= DATE '2026-06-01';
```

"Repeat customers with mid-range revenue who ordered recently." All the Chapter 06 operators work in `HAVING`: comparison, `BETWEEN`, `IN`, `LIKE`, `IS NULL`, `AND`/`OR`/`NOT`—applied to group-level values.

Grouping columns can be tested too:

```sql
HAVING CustomerID <> 0 AND COUNT(*) > 5
```

—though a condition on a grouping column alone belongs in `WHERE`, as Section 08.09 explains.

---

# Aliases in HAVING

Standard SQL evaluates `HAVING` before `SELECT`, so a `SELECT` alias does not yet exist:

```sql
-- ❌ Standard SQL, PostgreSQL, SQL Server, Oracle: "Revenue" is unknown
SELECT CustomerID, SUM(TotalAmount) AS Revenue
FROM Orders
GROUP BY CustomerID
HAVING Revenue > 300;

-- ✅ Portable: repeat the aggregate
SELECT CustomerID, SUM(TotalAmount) AS Revenue
FROM Orders
GROUP BY CustomerID
HAVING SUM(TotalAmount) > 300;
```

MySQL and SQLite accept the alias as an extension. Repeating the aggregate does not compute it twice; the optimizer recognises identical expressions and evaluates them once.

---

# HAVING Without GROUP BY

With no `GROUP BY`, the whole filtered input is one group, and `HAVING` decides whether that single summary row is returned:

```sql
SELECT COUNT(*) AS PendingOrders
FROM Orders
WHERE Status = 'Pending'
HAVING COUNT(*) > 100;
```

```text
Pending orders = 42   →  no rows
Pending orders = 180  →  one row: 180
```

This form is rare in application queries but useful in monitoring and data-quality checks that should return a row only when a threshold is breached.

---

# Comparing Groups with an Overall Figure

A subquery in `HAVING` compares each group with a value computed over the whole table:

```sql
-- Departments whose average salary exceeds the company average
SELECT
    DepartmentID,
    AVG(Salary) AS AvgSalary
FROM Employees
GROUP BY DepartmentID
HAVING AVG(Salary) > (SELECT AVG(Salary) FROM Employees);
```

The subquery is uncorrelated, so it is evaluated once. Chapter 09 covers subqueries in depth; window functions (Chapter 11) offer another route to the same answer.

---

# Finding Duplicates

The single most common use of `HAVING` in practice:

```sql
-- Email addresses used by more than one customer
SELECT
    Email,
    COUNT(*) AS Customers
FROM Customers
GROUP BY Email
HAVING COUNT(*) > 1;
```

```sql
-- Duplicate order lines: same product twice on one order
SELECT
    OrderID,
    ProductID,
    COUNT(*) AS Lines
FROM OrderItems
GROUP BY OrderID, ProductID
HAVING COUNT(*) > 1;
```

Run checks like these before adding a unique constraint: the constraint cannot be created while duplicates exist, and the query tells you exactly which rows to resolve.

---

# HAVING and NULL

An aggregate that evaluates to `NULL` makes a comparison UNKNOWN, and the group is discarded:

```sql
SELECT DepartmentID, SUM(Salary) AS Payroll
FROM Employees
GROUP BY DepartmentID
HAVING SUM(Salary) < 100000;
-- A department made up entirely of contractors (all Salary NULL)
-- has SUM = NULL and is NOT returned.
```

If such groups belong in the answer, say so:

```sql
HAVING COALESCE(SUM(Salary), 0) < 100000
```

---

# Visual Representation

```text
rows ──WHERE──→ rows ──GROUP BY──→ groups ──HAVING──→ groups ──SELECT──→ result
                                   ┌─────┐            ┌─────┐
                                   │ G1  │ ✅ TRUE    │ G1  │
                                   │ G2  │ ✅ TRUE    │ G2  │
                                   │ G3  │ ❌ FALSE   └─────┘
                                   │ G4  │ ❌ UNKNOWN
                                   └─────┘
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE
4. GROUP BY
5. HAVING      ← You are here: whole groups are kept or discarded
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

`HAVING` sees groups and their aggregates, but not `SELECT` aliases—which is why the portable form repeats the aggregate expression.

---

# How the DBMS Executes This

```text
SELECT CustomerID, SUM(TotalAmount)
FROM Orders
GROUP BY CustomerID
HAVING COUNT(*) >= 3

↓

Aggregate node computes per group:
    SUM(TotalAmount), COUNT(*)      ← COUNT added because HAVING needs it

↓

Filter node on aggregate output:
    COUNT(*) >= 3

↓

Project: CustomerID, SUM(TotalAmount)
```

In an execution plan, `HAVING` appears as a filter directly above the aggregate. It cannot reduce the rows the aggregate reads—only the groups it emits.

---

# 🔬 Engine Deep Dive

When a `HAVING` condition references only grouping columns, optimizers move it below the aggregate and apply it as a row filter—exactly as if it had been written in `WHERE`. `HAVING CustomerID = 42` and `WHERE CustomerID = 42` usually produce the same plan. Conditions on aggregates can never be moved this way, because the aggregate value does not exist until every row of the group has been read.

---

# 🏗️ Architecture Insight

`GROUP BY ... HAVING COUNT(*) > 1` is the relational definition of a uniqueness violation. Data-quality frameworks and migration scripts are full of it: every unique constraint you intend to add has a corresponding duplicate-finding query you should run first.

---

# ⚡ Performance Tip

`HAVING` filters after all the aggregation work is done. A condition that could be decided per row—on a grouping column or on a raw column—belongs in `WHERE`, where it reduces the rows that are read, grouped and aggregated.

---

# 🔒 Security Note

`HAVING COUNT(*) >= k` is a simple way to enforce a minimum group size in aggregate reports, so that no published group is small enough to identify an individual. It is not a complete privacy control—differences between overlapping groups can still reveal individuals—but it is a common baseline requirement.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `HAVING` with aggregates | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `HAVING` without `GROUP BY` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (3.39+) |
| `SELECT` alias in `HAVING` | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Subquery in `HAVING` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

> **Portability Tip:** Repeat the aggregate expression in `HAVING` instead of using its alias. It runs everywhere, and optimizers compute the shared expression once.

---

# Common Mistakes

### Mistake 1

Using an aggregate in `WHERE`:

```sql
-- ❌ aggregate functions are not allowed in WHERE
SELECT CustomerID FROM Orders WHERE SUM(TotalAmount) > 300 GROUP BY CustomerID;
```

---

### Mistake 2

Using a `SELECT` alias in `HAVING` in code that must be portable.

---

### Mistake 3

Filtering rows in `HAVING` instead of `WHERE`.

---

### Mistake 4

Forgetting that a `NULL` aggregate discards its group.

---

# Best Practices

✔ Put aggregate conditions in `HAVING` and row conditions in `WHERE`.

✔ Repeat the aggregate expression rather than its alias.

✔ Use `GROUP BY ... HAVING COUNT(*) > 1` to find duplicates before adding constraints.

✔ Wrap nullable aggregates in `COALESCE` when empty groups should pass the filter.

---

# Interview Questions

## Basic

1. What does `HAVING` filter?
2. Can `HAVING` use an aggregate that is not in `SELECT`?
3. How do you find duplicate email addresses?

## Intermediate

4. Why can't `WHERE` contain `SUM(TotalAmount) > 300`?
5. Why is `HAVING Revenue > 300` rejected by PostgreSQL but accepted by MySQL?
6. What does `HAVING` do in a query with no `GROUP BY`?

## Advanced

7. When will an optimizer move a `HAVING` condition below the aggregate?
8. How do you return departments whose average salary exceeds the company average?
9. Why does a group whose `SUM` is `NULL` never satisfy `HAVING SUM(x) < 100`?

---

# Hands-on Exercises

## Exercise 1

Return customers who have placed at least three orders, with their total revenue.

---

## Exercise 2

Find order lines where the same product appears more than once on the same order.

---

## Exercise 3

Return departments whose average salary is above the company-wide average.

---

## Exercise 4

Write a check that returns a row only when more than 100 orders are pending.

---

# Related Topics

- **08.05 — GROUP BY Syntax and Semantics**
- **08.09 — WHERE vs HAVING**
- **08.04 — NULL Handling in Aggregates**
- **06.01 — Introduction to WHERE**
- **06.08 — NULL Handling in WHERE (Three-Valued Logic)**
- **09.xx — Subqueries**

---

# Summary

`HAVING` filters groups after `GROUP BY` has formed them and computed their aggregates, keeping only groups for which its condition is TRUE. It may use grouping columns and any aggregate—selected or not—but in standard SQL not `SELECT` aliases, which are defined later. Without `GROUP BY`, it decides whether the single summary row is returned. Its most common uses are thresholds on aggregates, comparisons with an overall figure, and finding duplicates; conditions that can be decided per row belong in `WHERE` instead.
