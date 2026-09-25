---
title: "09.05 - EXISTS and NOT EXISTS"
description: "EXISTS and NOT EXISTS in depth: two-valued results, what goes in the SELECT list, correlation, 'has at least one' and 'has none' patterns, relational division ('for all'), EXISTS versus COUNT, and how engines plan semi-joins and anti-joins."
chapter: 9
section: 9.05
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 30 min
lastUpdated: 2026-09-25
---

# 09.05 EXISTS and NOT EXISTS

---

# Learning Objectives

After completing this section, you will be able to:

- Explain why `EXISTS` is always TRUE or FALSE, never UNKNOWN.
- Write "has at least one" and "has none" filters with `EXISTS` and `NOT EXISTS`.
- Explain why the `SELECT` list of an `EXISTS` subquery does not matter.
- Combine several existence conditions.
- Express "for all" questions (relational division) with double `NOT EXISTS`.
- Choose `EXISTS` over `COUNT(*) > 0`.

---

# What is EXISTS?

`EXISTS (subquery)` is TRUE if the subquery returns at least one row, and FALSE if it returns none. It does not look at the values in those rows.

```sql
-- Customers with at least one order
SELECT c.CustomerID, c.CustomerName
FROM Customers AS c
WHERE EXISTS (
    SELECT 1
    FROM Orders AS o
    WHERE o.CustomerID = c.CustomerID
);
```

Section 06.10 introduced `EXISTS`, and Section 07.13 showed it as a semi-join. This section covers the patterns built on it.

---

# Two-Valued, Always

| Subquery returns | `EXISTS` | `NOT EXISTS` |
|------------------|----------|--------------|
| ≥ 1 row | TRUE | FALSE |
| 0 rows | FALSE | TRUE |

Rows containing `NULL` are still rows, so they count. That is why `NOT EXISTS` has no `NULL` trap: it asks "is there a matching row?", and a `NULL` in the inner table simply never matches the correlation predicate.

```text
Orders.CustomerID: {1, 1, 2, 2, 3, NULL}

Customer 4:  any row with CustomerID = 4?  no  → NOT EXISTS TRUE ✅ (Dina returned)
```

Compare with `NOT IN` in Section 09.04, which returns nothing for the same data.

---

# What Goes in the SELECT List

The engine only checks whether a row exists, so the `SELECT` list is ignored:

```sql
WHERE EXISTS (SELECT 1        FROM Orders o WHERE o.CustomerID = c.CustomerID)
WHERE EXISTS (SELECT *        FROM Orders o WHERE o.CustomerID = c.CustomerID)
WHERE EXISTS (SELECT NULL     FROM Orders o WHERE o.CustomerID = c.CustomerID)
WHERE EXISTS (SELECT 1/0      FROM Orders o WHERE o.CustomerID = c.CustomerID)  -- no error on most engines
```

All four are equivalent. `SELECT 1` is the common convention, because it states "I only care that a row exists". Choose one form and use it consistently.

---

# Correlation is the Point

An uncorrelated `EXISTS` is TRUE or FALSE for the whole query at once:

```sql
-- ❌ Returns ALL customers if any order exists anywhere
SELECT c.CustomerName
FROM Customers AS c
WHERE EXISTS (SELECT 1 FROM Orders AS o WHERE o.Status = 'Pending');
```

That is occasionally intended ("show the list only if there is pending work"), but usually a missing correlation predicate is a bug. An `EXISTS` subquery almost always contains a condition linking it to the outer row.

---

# "Has at Least One" Patterns

```sql
-- Customers with a cancelled order
SELECT c.CustomerName
FROM Customers AS c
WHERE EXISTS (
    SELECT 1 FROM Orders AS o
    WHERE o.CustomerID = c.CustomerID
      AND o.Status = 'Cancelled'
);

-- Orders containing at least one item priced above 100
SELECT o.OrderID
FROM Orders AS o
WHERE EXISTS (
    SELECT 1 FROM OrderItems AS oi
    WHERE oi.OrderID = o.OrderID
      AND oi.UnitPrice > 100
);

-- Managers: employees someone reports to
SELECT m.EmployeeName
FROM Employees AS m
WHERE EXISTS (SELECT 1 FROM Employees AS e WHERE e.ManagerID = m.EmployeeID);
```

---

# "Has None" Patterns

```sql
-- Products never ordered
SELECT p.ProductName
FROM Products AS p
WHERE NOT EXISTS (
    SELECT 1 FROM OrderItems AS oi WHERE oi.ProductID = p.ProductID
);

-- Customers with no order in the last 90 days (churn candidates)
SELECT c.CustomerName
FROM Customers AS c
WHERE NOT EXISTS (
    SELECT 1 FROM Orders AS o
    WHERE o.CustomerID = c.CustomerID
      AND o.OrderDate >= CURRENT_DATE - INTERVAL '90' DAY
);

-- Departments with no employees
SELECT d.DepartmentName
FROM Departments AS d
WHERE NOT EXISTS (SELECT 1 FROM Employees AS e WHERE e.DepartmentID = d.DepartmentID);
```

Note where the date condition goes in the churn query: **inside** the subquery. Moving it to the outer query would change the question.

---

# Combining Existence Tests

```sql
-- Customers who have ordered, but never had an order cancelled
SELECT c.CustomerName
FROM Customers AS c
WHERE EXISTS (
          SELECT 1 FROM Orders AS o
          WHERE o.CustomerID = c.CustomerID)
  AND NOT EXISTS (
          SELECT 1 FROM Orders AS o
          WHERE o.CustomerID = c.CustomerID
            AND o.Status = 'Cancelled');
```

Each `EXISTS` is an independent semi-join or anti-join. Unlike joins, combining several of them never multiplies rows.

---

# "For All": Relational Division

"Customers who have bought **every** product in category 3" has no direct SQL operator. It is expressed as a double negative: *there is no product in category 3 that the customer has not bought.*

```sql
SELECT c.CustomerName
FROM Customers AS c
WHERE NOT EXISTS (
    SELECT 1
    FROM Products AS p
    WHERE p.CategoryID = 3
      AND NOT EXISTS (
          SELECT 1
          FROM Orders AS o
          JOIN OrderItems AS oi ON oi.OrderID = o.OrderID
          WHERE o.CustomerID = c.CustomerID
            AND oi.ProductID = p.ProductID
      )
);
```

```text
For customer c:
  for each product p in category 3:
      has c bought p?   ── no ──→ p is a "missing" product
  any missing product?  ── no ──→ keep c
```

The same question can be answered by counting:

```sql
SELECT o.CustomerID
FROM Orders AS o
JOIN OrderItems AS oi ON oi.OrderID = o.OrderID
JOIN Products  AS p  ON p.ProductID = oi.ProductID
WHERE p.CategoryID = 3
GROUP BY o.CustomerID
HAVING COUNT(DISTINCT oi.ProductID) = (SELECT COUNT(*) FROM Products WHERE CategoryID = 3);
```

The counting form is often faster; the `NOT EXISTS` form handles an empty category more naturally (every customer qualifies vacuously, which may or may not be what the business wants).

---

# EXISTS vs COUNT(*) > 0

```sql
-- ❌ Counts every matching row, then compares
WHERE (SELECT COUNT(*) FROM Orders o WHERE o.CustomerID = c.CustomerID) > 0

-- ✅ Stops at the first match
WHERE EXISTS (SELECT 1 FROM Orders o WHERE o.CustomerID = c.CustomerID)
```

Some optimizers rewrite the first form into the second, but not all do, and `EXISTS` states the intent. Use `COUNT` only when the number matters (`>= 3`).

---

# Visual Representation

```text
EXISTS (semi-join)                         NOT EXISTS (anti-join)

Customers   Orders                          Customers   Orders
┌───┐       ┌─────┐                         ┌───┐       ┌─────┐
│ 1 │ ────→ │ 1 … │ found → keep            │ 1 │ ────→ │ 1 … │ found → drop
│ 2 │ ────→ │ 2 … │ found → keep            │ 2 │ ────→ │ 2 … │ found → drop
│ 3 │ ────→ │ 3 … │ found → keep            │ 3 │ ────→ │ 3 … │ found → drop
│ 4 │ ──╳   │     │ none  → drop            │ 4 │ ──╳   │     │ none  → keep
└───┘       └─────┘                         └───┘       └─────┘
            (search stops at first match)
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← EXISTS / NOT EXISTS are evaluated here for each candidate row
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
WHERE NOT EXISTS (SELECT 1 FROM OrderItems oi WHERE oi.ProductID = p.ProductID)

↓ unnested

Products  ANTI JOIN  OrderItems  ON oi.ProductID = p.ProductID

↓ physical options

Hash Anti Join        build hash on OrderItems.ProductID, emit products with no hit
Merge Anti Join       both inputs ordered by ProductID
Nested Loop Anti      per product, seek OrderItems(ProductID); emit if not found
```

Every major engine unnests correlated `EXISTS` and `NOT EXISTS` with simple equality correlation into semi- and anti-joins. The main exceptions are subqueries that contain a row limit, or correlation inside an `OR` with other conditions.

---

# 🔬 Engine Deep Dive

A semi-join stops probing as soon as it finds one match; an anti-join discards the outer row as soon as it finds one. With a nested loop and an index on the correlation column, "does customer 1 have an order?" costs one index seek regardless of whether the customer has one order or ten thousand. That early exit is the concrete performance advantage of `EXISTS` over `COUNT(*) > 0` and over a join followed by `DISTINCT`.

---

# 🏗️ Architecture Insight

`EXISTS` and `NOT EXISTS` are how SQL expresses business rules phrased with "any", "none" and "every". Eligibility checks, integrity audits ("orders with no items"), and access rules ("users with no active role") all read directly as existence tests. When a requirement contains "every", reach for the double `NOT EXISTS` pattern first and optimise afterwards.

---

# ⚡ Performance Tip

Index the correlation columns of the inner table: `Orders(CustomerID)`, `OrderItems(ProductID)`. For `EXISTS` with extra conditions, a composite index that starts with the correlation column (`Orders(CustomerID, Status)`) lets the probe answer from the index alone.

---

# 🔒 Security Note

Data-access rules are often written as `EXISTS` checks (`WHERE EXISTS (SELECT 1 FROM UserProjects up WHERE up.ProjectID = t.ProjectID AND up.UserID = :current_user)`). Row-level security policies in PostgreSQL and SQL Server compile to exactly this shape, so the same indexing advice applies to them.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `EXISTS` / `NOT EXISTS` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Semi-join unnesting | n/a | ✅ | ✅ (5.6+) | ✅ | ✅ | Partial |
| Anti-join unnesting | n/a | ✅ | ✅ (8.0.17+) | ✅ | ✅ | Partial |
| `SELECT` list ignored | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

> **Portability Tip:** `EXISTS` and `NOT EXISTS` with `SELECT 1` and equality correlation are the most portable and most consistently optimised subquery forms in SQL.

---

# Common Mistakes

### Mistake 1

Forgetting the correlation predicate, so `EXISTS` is TRUE for every outer row.

---

### Mistake 2

Putting a condition that belongs inside the subquery in the outer `WHERE`:

```sql
-- ❌ Meant: customers with no order in 2026.
--    Actually: customers with no orders at all (the outer query cannot see o)
WHERE NOT EXISTS (SELECT 1 FROM Orders o WHERE o.CustomerID = c.CustomerID)

-- ✅ The condition on the inner rows belongs inside the subquery
WHERE NOT EXISTS (SELECT 1 FROM Orders o
                  WHERE o.CustomerID = c.CustomerID
                    AND o.OrderDate >= DATE '2026-01-01')
```

---

### Mistake 3

Using `COUNT(*) > 0` instead of `EXISTS`.

---

### Mistake 4

Using `NOT IN` where `NOT EXISTS` is safe.

---

# Best Practices

✔ Write `SELECT 1` in `EXISTS` subqueries.

✔ Always include a correlation predicate, and qualify its columns.

✔ Use `NOT EXISTS` for every "has none" question.

✔ Use double `NOT EXISTS` for "for all" questions, and decide what an empty set should mean.

✔ Index the inner table's correlation column.

---

# Interview Questions

## Basic

1. What does `EXISTS` return?
2. Does the `SELECT` list of an `EXISTS` subquery matter?
3. How do you find products that have never been ordered?

## Intermediate

4. Why is `NOT EXISTS` safe with `NULL`s when `NOT IN` is not?
5. Why is `EXISTS` usually better than `COUNT(*) > 0`?
6. What happens if an `EXISTS` subquery has no correlation predicate?

## Advanced

7. How do you find customers who bought every product in a category?
8. What is the difference between a semi-join and an anti-join in a plan?
9. What prevents an optimizer from unnesting an `EXISTS` subquery?

---

# Hands-on Exercises

## Exercise 1

Return orders that contain no order items (an integrity check).

---

## Exercise 2

Return customers who ordered in 2025 but not in 2026.

---

## Exercise 3

Return employees who are neither managers nor managed by anyone.

---

## Exercise 4

Return customers who have bought every product in category 3, first with double `NOT EXISTS`, then with `GROUP BY … HAVING COUNT(DISTINCT …)`.

---

# Related Topics

- **06.10 — EXISTS and Subqueries in WHERE (Introduction)**
- **07.13 — Semi-Joins and Anti-Joins (EXISTS and NOT EXISTS)**
- **09.04 — IN and NOT IN with Subqueries**
- **09.07 — Correlated Subqueries**
- **09.12 — NULL Handling in Subqueries**
- **09.13 — Subqueries vs JOINs**

---

# Summary

`EXISTS` is TRUE when its subquery returns any row and FALSE otherwise; it never yields UNKNOWN, which is why `NOT EXISTS` is the `NULL`-safe way to express "has none". The subquery's `SELECT` list is ignored, and its correlation predicate is what ties the test to each outer row. Existence tests combine freely without multiplying rows, express "for all" through double negation, stop at the first match, and are unnested by every major engine into semi-joins and anti-joins—provided the inner correlation column is indexed.
