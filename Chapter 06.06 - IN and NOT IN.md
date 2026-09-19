---
title: "06.06 - IN and NOT IN"
description: "Filter against lists with SQL IN and NOT IN: value lists, subqueries, equivalence to OR, the NOT IN NULL trap, NOT EXISTS as a safe alternative, large lists, parameters, and how databases execute IN predicates."
chapter: 6
section: 6.06
category: Data Query Language (DQL)
difficulty: Beginner → Advanced
readingTime: 50 min
lastUpdated: 2026-09-19
---

# 06.06 IN and NOT IN

---

# Learning Objectives

After completing this section, you will be able to:

- Filter against a list of values with `IN`.
- Exclude a list of values with `NOT IN`.
- Explain how `IN` relates to `OR`.
- Use `IN` with a subquery.
- Explain why `NOT IN` returns no rows when the list contains `NULL`.
- Use `NOT EXISTS` as a NULL-safe alternative.
- Handle large lists and parameterized lists correctly.

---

# What is IN?

`IN` tests whether a value matches any value in a list.

```sql
SELECT
    CustomerName,
    Country
FROM Customers
WHERE Country IN ('India', 'Nepal', 'Bhutan');
```

This returns customers from any of the three countries.

---

# IN is Shorthand for OR

```sql
WHERE Country IN ('India', 'Nepal', 'Bhutan')
```

is logically equivalent to:

```sql
WHERE Country = 'India'
   OR Country = 'Nepal'
   OR Country = 'Bhutan'
```

`IN` is shorter, easier to read, and avoids precedence mistakes when combined with other conditions:

```sql
WHERE Country IN ('India', 'Nepal')
  AND IsActive = 1
```

No parentheses are needed, because `IN` is a single predicate.

---

# Syntax

```sql
expression IN (value1, value2, ...)
```

```sql
expression NOT IN (value1, value2, ...)
```

```sql
expression IN (subquery)
```

The list can contain literals, parameters, or expressions of a compatible type.

---

# IN with Numbers

```sql
SELECT
    OrderID,
    Status
FROM Orders
WHERE StatusID IN (1, 3, 5);
```

---

# IN with Dates

```sql
SELECT
    HolidayName
FROM Holidays
WHERE HolidayDate IN (DATE '2026-01-26', DATE '2026-08-15', DATE '2026-10-02');
```

---

# NOT IN

```sql
SELECT
    ProductName,
    CategoryID
FROM Products
WHERE CategoryID NOT IN (4, 7);
```

Equivalent to:

```sql
WHERE CategoryID <> 4
  AND CategoryID <> 7
```

Note the change from `OR` to `AND`—an application of De Morgan's laws (Section 06.04).

---

# IN with a Subquery

The list can come from another query:

```sql
SELECT
    CustomerName
FROM Customers
WHERE CustomerID IN (
    SELECT CustomerID
    FROM Orders
    WHERE OrderDate >= DATE '2026-01-01'
);
```

Returns customers who have placed at least one order in 2026.

The subquery must return **exactly one column**. Subqueries are covered in detail in a later chapter; Section 06.10 introduces them as filters.

---

# The NOT IN NULL Trap

This is one of the most important rules in SQL filtering.

```sql
SELECT
    ProductName
FROM Products
WHERE CategoryID NOT IN (4, 7, NULL);
```

This returns **no rows at all**.

Why? `NOT IN` expands to:

```sql
WHERE CategoryID <> 4
  AND CategoryID <> 7
  AND CategoryID <> NULL
```

The last comparison is always UNKNOWN. With `AND`, the best possible result is UNKNOWN—never TRUE:

```text
TRUE AND TRUE AND UNKNOWN   →  UNKNOWN   →  row discarded
```

Every row is discarded.

---

# The Trap with Subqueries

Literal `NULL`s in a list are rare. The real danger is a subquery that *might* return `NULL`:

```sql
-- "Employees who are not managers"
SELECT
    EmployeeName
FROM Employees
WHERE EmployeeID NOT IN (
    SELECT ManagerID
    FROM Employees
);
```

The top-level CEO has `ManagerID = NULL`, so the subquery returns a `NULL`, and the query returns **nothing**.

No error. Just an empty result that looks plausible.

---

# Fix 1: Exclude NULLs in the Subquery

```sql
WHERE EmployeeID NOT IN (
    SELECT ManagerID
    FROM Employees
    WHERE ManagerID IS NOT NULL
)
```

---

# Fix 2: Use NOT EXISTS (Recommended)

```sql
SELECT
    e.EmployeeName
FROM Employees e
WHERE NOT EXISTS (
    SELECT 1
    FROM Employees r
    WHERE r.ManagerID = e.EmployeeID
);
```

`NOT EXISTS` only asks whether a matching row exists, so `NULL`s cannot poison the result. It is the standard, safe way to express "rows with no match". Section 06.10 introduces `EXISTS`.

---

# IN and NULL (Positive Case)

With `IN`, a `NULL` in the list is harmless for matching values:

```sql
WHERE CategoryID IN (4, 7, NULL)
```

```text
CategoryID = 4   → TRUE  OR ... → TRUE     ✅ kept
CategoryID = 9   → FALSE OR FALSE OR UNKNOWN → UNKNOWN  ❌ discarded
```

But `IN (NULL)` never matches a `NULL` value in the column—use `IS NULL` for that.

---

# Parameterized Lists

A single parameter cannot hold a list:

```sql
WHERE Country IN (?)   -- matches only ONE value
```

Common approaches:

```text
1. Generate one placeholder per value:   IN (?, ?, ?)
2. Pass an array (PostgreSQL):           = ANY($1)
3. Use a table-valued parameter
   (SQL Server) or a temporary table and join to it
```

Never build the list by concatenating user input into the SQL text.

---

# Large Lists

`IN` lists with thousands of values cause problems:

- Oracle limits a literal list to **1,000** expressions (`ORA-01795`).
- SQL Server limits a request to **2,100** parameters.
- Very long SQL text is slow to parse and pollutes the plan cache.

For large sets of values, load them into a temporary or staging table and join or use `EXISTS`:

```sql
SELECT
    o.OrderID
FROM Orders o
JOIN SelectedCustomers s
    ON s.CustomerID = o.CustomerID;
```

---

# Visual Representation

```text
IN ('India', 'Nepal', 'Bhutan')

Row value     Matches any?     Result

India         India ✓          TRUE      ✅
Brazil        none             FALSE     ❌
NULL          unknown          UNKNOWN   ❌


NOT IN (4, 7, NULL)

Row value     <> 4    <> 7    <> NULL    AND result

2             TRUE    TRUE    UNKNOWN    UNKNOWN   ❌
9             TRUE    TRUE    UNKNOWN    UNKNOWN   ❌
(every row is discarded)
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE   ← IN / NOT IN (including subqueries) evaluated here
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

For a short literal list:

```text
WHERE CountryCode IN ('IN', 'NP', 'BT')

↓

Index on CountryCode?

↓ yes

Three index seeks (one per value), results combined
```

For a long list or a subquery, the optimizer may instead:

```text
Build a hash table from the list or subquery

↓

Probe it for each row
(a hash semi-join)
```

`IN (subquery)` is typically executed as a **semi-join**: each outer row is returned at most once, no matter how many matches the subquery has.

---

# 🔬 Engine Deep Dive

```text
Developer writes

CustomerID IN (SELECT CustomerID FROM Orders)

        │

        ▼

Optimizer rewrites as a semi-join

        │

        ├── Nested loop semi-join
        │   (probe Orders index for each customer)
        │
        ├── Hash semi-join
        │   (hash Orders.CustomerID, probe with customers)
        │
        └── Merge semi-join
            (both inputs sorted on CustomerID)

        │

        ▼

Each customer returned at most once
```

`NOT IN` becomes an **anti-join**. Because of `NULL` semantics, a `NOT IN` anti-join needs extra NULL checks that `NOT EXISTS` does not, which can also make `NOT IN` harder to optimize.

---

# 🏗️ Architecture Insight

`IN` with a subquery expresses a **semi-join**, and `NOT EXISTS` expresses an **anti-join**—two relational operations that are distinct from ordinary joins because they never duplicate outer rows. Recognizing these patterns helps you choose between `IN`, `EXISTS`, and `JOIN` based on meaning rather than habit.

---

# ⚡ Performance Tip

On modern optimizers, `IN (subquery)` and `EXISTS` usually produce the same plan. Prefer the form that expresses intent most clearly, and always prefer `NOT EXISTS` over `NOT IN` when the subquery column can be `NULL`.

---

# 🔒 Security Note

Dynamically built `IN` lists are a common injection point because developers concatenate comma-separated values into the SQL text. Generate one placeholder per value, or pass an array or table-valued parameter.

---

# 🌍 Production Consideration

`NOT IN` bugs often appear months after deployment, when a nullable column that previously had no `NULL`s receives its first one. Queries that worked for years suddenly return empty results. Code reviews should treat every `NOT IN (subquery)` as a potential defect.

---

# 🚀 Enterprise Practice

Many teams adopt a simple rule: use `IN` for short, fixed lists of literals; use `EXISTS` / `NOT EXISTS` for subqueries; and use a join to a staging table for large, user-supplied sets.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `IN (list)` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `IN (subquery)` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Row value `(a, b) IN (...)` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ (3.15+) |
| Array membership | `= ANY` (subquery) | `= ANY(array)` | ❌ | ❌ | ❌ | ❌ |
| Literal list limit | — | None fixed | `max_allowed_packet` | 2,100 parameters | 1,000 expressions | `SQLITE_MAX_VARIABLE_NUMBER` |

> **Portability Tip:** `IN` and `NOT IN` are fully standard. Row-value comparisons such as `(CustomerID, OrderDate) IN (...)` are not supported in SQL Server, and list-size limits vary, so large lists should be moved into a table.

---

# Common Mistakes

### Mistake 1

Using `NOT IN` with a subquery that can return `NULL`.

---

### Mistake 2

Expecting `IN (NULL)` to match `NULL` values.

---

### Mistake 3

Binding a whole comma-separated list to a single parameter.

---

### Mistake 4

Building huge literal `IN` lists instead of using a table.

---

### Mistake 5

Returning more than one column from an `IN` subquery.

---

# Best Practices

✔ Use `IN` instead of repeated `OR` on the same column.

✔ Use `NOT EXISTS` instead of `NOT IN` for subqueries.

✔ Add `WHERE column IS NOT NULL` if you must use `NOT IN` with a subquery.

✔ Generate one placeholder per list value.

✔ Move large value sets into a temporary table and join.

---

# Interview Questions

## Basic

1. What does `IN` do?
2. How is `IN` related to `OR`?
3. What is `NOT IN` equivalent to?

## Intermediate

4. Why does `NOT IN (1, 2, NULL)` return no rows?
5. How do you safely find rows that have no match in another table?
6. How do you pass a list of values as parameters?

## Advanced

7. What are semi-joins and anti-joins?
8. Why can `NOT IN` be harder to optimize than `NOT EXISTS`?
9. What limits exist on the size of `IN` lists in Oracle and SQL Server?

---

# Hands-on Exercises

## Exercise 1

Return orders whose status is `Pending`, `Processing`, or `On Hold`.

---

## Exercise 2

Return products that are not in categories 2, 5, or 9.

---

## Exercise 3

Return customers who have never placed an order, using `NOT EXISTS`.

---

## Exercise 4

Explain why this query returns no rows, and write two corrected versions:

```sql
SELECT DepartmentName
FROM Departments
WHERE DepartmentID NOT IN (
    SELECT DepartmentID
    FROM Employees
);
```

(Assume some employees have no department.)

---

# Related Topics

- **06.04 — Logical Operators (AND, OR, NOT)**
- **06.08 — NULL Handling in WHERE (Three-Valued Logic)**
- **06.10 — EXISTS and Subqueries in WHERE (Introduction)**
- **07.xx — JOINs**
- **09.xx — Subqueries**

---

# Summary

`IN` tests membership in a list and is a concise, precedence-safe alternative to repeated `OR`. With a subquery, it becomes a semi-join. `NOT IN` is its negation, but it hides a serious trap: if the list or subquery contains a `NULL`, every comparison becomes UNKNOWN and the query returns no rows. `NOT EXISTS` avoids the problem and expresses "no matching row" directly. For large or user-supplied sets, use one placeholder per value, arrays, or a staging table rather than long literal lists.
