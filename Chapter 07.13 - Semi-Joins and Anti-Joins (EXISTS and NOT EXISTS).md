---
title: "07.13 - Semi-Joins and Anti-Joins (EXISTS and NOT EXISTS)"
description: "Semi-joins and anti-joins in SQL: EXISTS, NOT EXISTS, IN, NOT IN and the LEFT JOIN / IS NULL pattern compared for correctness, duplicates and performance, with the NULL pitfalls of NOT IN and guidance on which form to use."
chapter: 7
section: 7.13
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 35 min
lastUpdated: 2026-09-22
---

# 07.13 Semi-Joins and Anti-Joins (EXISTS and NOT EXISTS)

---

# Learning Objectives

After completing this section, you will be able to:

- Define a semi-join and an anti-join.
- Write both with `EXISTS` and `NOT EXISTS`.
- Compare `EXISTS`, `IN` and `LEFT JOIN`/`IS NULL` for correctness and speed.
- Explain why `NOT IN` is unsafe with nullable columns.
- Avoid duplicate rows that an ordinary join would introduce.
- Read a semi-join or anti-join in an execution plan.

---

# Semi-Join: "Has at Least One Match"

A semi-join returns rows from the left table that have **at least one** match on the right—**without** duplicating them and without returning any right-hand columns.

```sql
SELECT c.CustomerName
FROM Customers AS c
WHERE EXISTS (
    SELECT 1
    FROM Orders AS o
    WHERE o.CustomerID = c.CustomerID
);
```

```text
Ada    → 2 orders  → returned ONCE
Grace  → 1 order   → returned ONCE
Linus  → 0 orders  → not returned
```

Compare with an ordinary join:

```sql
SELECT c.CustomerName
FROM Customers AS c
INNER JOIN Orders AS o ON o.CustomerID = c.CustomerID;
-- Ada appears twice.
```

The join needs `DISTINCT` to match the semi-join's result—and `DISTINCT` costs a sort or hash over the whole intermediate result, which the semi-join avoids by construction.

---

# Anti-Join: "Has No Match"

```sql
SELECT c.CustomerName
FROM Customers AS c
WHERE NOT EXISTS (
    SELECT 1
    FROM Orders AS o
    WHERE o.CustomerID = c.CustomerID
);
```

```text
Linus  → no orders  → returned
Ada    → has orders → not returned
```

Anti-joins answer a large family of real questions:

- Customers who have never ordered.
- Products never sold.
- Employees with no assigned department.
- Invoices with no payment.
- Users who never logged in.

---

# Four Ways to Write a Semi-Join

```sql
-- 1. EXISTS  (recommended)
SELECT c.CustomerName
FROM Customers AS c
WHERE EXISTS (SELECT 1 FROM Orders AS o WHERE o.CustomerID = c.CustomerID);
```

```sql
-- 2. IN
SELECT c.CustomerName
FROM Customers AS c
WHERE c.CustomerID IN (SELECT o.CustomerID FROM Orders AS o);
```

```sql
-- 3. JOIN + DISTINCT
SELECT DISTINCT c.CustomerName
FROM Customers AS c
INNER JOIN Orders AS o ON o.CustomerID = c.CustomerID;
```

```sql
-- 4. JOIN to a pre-deduplicated subquery
SELECT c.CustomerName
FROM Customers AS c
INNER JOIN (SELECT DISTINCT CustomerID FROM Orders) AS o
    ON o.CustomerID = c.CustomerID;
```

| Form | Duplicates | Nullable-safe | Typical plan |
|------|-----------|---------------|--------------|
| `EXISTS` | none | ✅ | Semi-join |
| `IN` | none | ✅ | Semi-join |
| `JOIN` + `DISTINCT` | removed afterwards | ✅ | Join, then sort/hash |
| `JOIN` to distinct subquery | none | ✅ | Join |

On modern optimizers, forms 1 and 2 typically produce the same plan. Form 3 is the one to avoid: `DISTINCT` after a join is both slower and easier to get wrong, because it deduplicates *all* selected columns, not just the key.

---

# Four Ways to Write an Anti-Join

```sql
-- 1. NOT EXISTS  (recommended)
SELECT c.CustomerName
FROM Customers AS c
WHERE NOT EXISTS (SELECT 1 FROM Orders AS o WHERE o.CustomerID = c.CustomerID);
```

```sql
-- 2. LEFT JOIN + IS NULL
SELECT c.CustomerName
FROM Customers AS c
LEFT JOIN Orders AS o ON o.CustomerID = c.CustomerID
WHERE o.OrderID IS NULL;
```

```sql
-- 3. NOT IN  ⚠ unsafe with NULLs
SELECT c.CustomerName
FROM Customers AS c
WHERE c.CustomerID NOT IN (SELECT o.CustomerID FROM Orders AS o);
```

```sql
-- 4. EXCEPT / MINUS  (set operation, keys only)
SELECT CustomerID FROM Customers
EXCEPT
SELECT CustomerID FROM Orders;
```

| Form | Nullable-safe | Notes |
|------|---------------|-------|
| `NOT EXISTS` | ✅ | Correct regardless of `NULL`s; usually the best plan |
| `LEFT JOIN` + `IS NULL` | ✅ if the tested column is `NOT NULL` | Materialises matches first |
| `NOT IN` | ❌ | Returns *nothing* if the subquery yields any `NULL` |
| `EXCEPT` | ✅ | Deduplicates; returns only the compared columns |

---

# Why NOT IN Breaks

```sql
WHERE c.CustomerID NOT IN (1, 2, NULL)
```

```text
≡ NOT (CustomerID = 1 OR CustomerID = 2 OR CustomerID = NULL)

For CustomerID = 3:
  NOT (FALSE OR FALSE OR UNKNOWN)
  NOT (UNKNOWN)
  UNKNOWN              → row filtered out
```

Every row is filtered out; the query returns an empty result with no error and no warning. `NOT EXISTS` has no such behaviour, because it asks whether a row exists rather than comparing values:

```text
NOT EXISTS (SELECT 1 FROM Orders WHERE Orders.CustomerID = c.CustomerID)

  Orders row with CustomerID = NULL
    → NULL = 3 → UNKNOWN → not a match → the subquery yields no row
    → NOT EXISTS is TRUE
```

If you must use `NOT IN`, guard the subquery:

```sql
WHERE c.CustomerID NOT IN (
    SELECT o.CustomerID FROM Orders AS o
    WHERE o.CustomerID IS NOT NULL
);
```

The guard is easy to forget and easy to lose in a later edit. Use `NOT EXISTS`.

---

# Multi-Column Correlation

`EXISTS` extends naturally to several columns; `IN` needs the less-portable row-value syntax:

```sql
-- ✅ Works everywhere
SELECT p.ProductID
FROM Products AS p
WHERE EXISTS (
    SELECT 1
    FROM Inventory AS i
    WHERE i.ProductID   = p.ProductID
      AND i.WarehouseID = p.PrimaryWarehouseID
);
```

```sql
-- Row constructor: PostgreSQL, MySQL, Oracle; not SQL Server
WHERE (p.ProductID, p.PrimaryWarehouseID) IN (
    SELECT i.ProductID, i.WarehouseID FROM Inventory AS i
);
```

---

# SELECT 1 vs SELECT *

Inside `EXISTS`, the select list is never evaluated:

```sql
WHERE EXISTS (SELECT 1     FROM Orders o WHERE o.CustomerID = c.CustomerID)
WHERE EXISTS (SELECT *     FROM Orders o WHERE o.CustomerID = c.CustomerID)
WHERE EXISTS (SELECT 1/0   FROM Orders o WHERE o.CustomerID = c.CustomerID)
```

All three are identical in plan and result—the third does not even raise a division error. `SELECT 1` is the conventional choice because it signals to the reader that the columns are irrelevant.

---

# Semi-Joins with Extra Conditions

The correlated subquery can carry its own filters:

```sql
-- Customers who ordered in September 2026
SELECT c.CustomerName
FROM Customers AS c
WHERE EXISTS (
    SELECT 1
    FROM Orders AS o
    WHERE o.CustomerID = c.CustomerID
      AND o.OrderDate >= DATE '2026-09-01'
      AND o.OrderDate <  DATE '2026-10-01'
);
```

```sql
-- Customers who did NOT order in September 2026
SELECT c.CustomerName
FROM Customers AS c
WHERE NOT EXISTS (
    SELECT 1
    FROM Orders AS o
    WHERE o.CustomerID = c.CustomerID
      AND o.OrderDate >= DATE '2026-09-01'
      AND o.OrderDate <  DATE '2026-10-01'
);
```

Note how much clearer this is than the equivalent `LEFT JOIN` version, where the date conditions must go into `ON` and the `IS NULL` test into `WHERE` (Section 07.11). That asymmetry is the main practical argument for `NOT EXISTS`.

---

# Visual Representation

```text
SEMI-JOIN                          ANTI-JOIN

   A          B                       A          B
┌─────┐    ┌─────┐                 ┌─────┐    ┌─────┐
│█████│    │     │                 │█████│    │     │
│██┌──┼────┼──┐  │                 │  ┌──┼────┼──┐  │
│██│  match  │  │                 │  │  match  │  │
│██└──┼────┼──┘  │                 │  └──┼────┼──┘  │
└─────┘    └─────┘                 └─────┘    └─────┘

A rows WITH a match,               A rows WITHOUT a match.
each returned once.                No B columns in either result.
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE   ← EXISTS and NOT EXISTS are evaluated here
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

Although they are written as subqueries in `WHERE`, optimizers convert `EXISTS` and `NOT EXISTS` into dedicated semi-join and anti-join operators—so the plan usually shows a join, not a subquery.

---

# How the DBMS Executes This

```text
WHERE EXISTS (SELECT 1 FROM Orders o WHERE o.CustomerID = c.CustomerID)

↓

Rewritten as a SEMI JOIN operator

↓

Hash semi-join:
    build a hash of distinct Orders.CustomerID
    probe with each customer
    stop probing on the FIRST match

↓

Emit the customer row once
```

The "stop on first match" behaviour is the key advantage: for a customer with 10,000 orders, an `EXISTS` stops after one, while a join produces all 10,000 rows and then deduplicates them.

Anti-joins work the same way, inverted: emit the left row when the probe finds nothing.

---

# 🔬 Engine Deep Dive

Plans name these operators explicitly: PostgreSQL shows `Hash Semi Join` and `Hash Anti Join`; SQL Server shows `Left Semi Join` and `Left Anti Semi Join`; Oracle shows `HASH JOIN SEMI` and `HASH JOIN ANTI`. Seeing them confirms the optimizer recognised the pattern. Seeing a plain join followed by a sort or unique operator means it did not—usually because the query was written as `JOIN` + `DISTINCT`.

---

# ⚡ Performance Tip

`EXISTS` benefits enormously from an index on the correlated column of the inner table—here, `Orders(CustomerID)`. With it, each probe is a single index seek that stops at the first hit. Without it, every probe scans, and the query degrades to something close to a nested loop over the whole table.

---

# 🏗️ Architecture Insight

Semi- and anti-joins express *questions about existence*, which are common in business rules: eligible, overdue, unassigned, never contacted. Writing them as existence tests instead of joins keeps the result's grain equal to the left table's grain, so downstream aggregation stays correct by construction rather than by remembering to add `DISTINCT`.

---

# 🌍 Production Consideration

Exclusion lists—do-not-contact, unsubscribed, already-processed—are anti-joins, and they are exactly where `NOT IN` fails most expensively: a single `NULL` in the exclusion table makes the result empty, so the caller concludes there is nothing to exclude and processes everyone. Standardising on `NOT EXISTS` removes the failure mode entirely.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `EXISTS` / `NOT EXISTS` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Semi/anti-join optimization | — | ✅ | ✅ (8.0+) | ✅ | ✅ | partial |
| `EXCEPT` | ✅ | ✅ | ✅ (8.0.31+) | ✅ | `MINUS` | ✅ |
| Row constructors in `IN` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |

> **Portability Tip:** Oracle spells the set difference `MINUS`, not `EXCEPT`. `NOT EXISTS` behaves identically on every database and needs no dialect handling, which is another reason to prefer it.

---

# Common Mistakes

### Mistake 1

Using `NOT IN` against a nullable column and receiving an empty result.

---

### Mistake 2

Using `JOIN` + `DISTINCT` where `EXISTS` states the intent and performs better.

---

### Mistake 3

Writing an anti-join as `LEFT JOIN` + `IS NULL` but testing a nullable column.

---

### Mistake 4

Putting the anti-join's extra conditions in `WHERE` instead of inside the `NOT EXISTS` subquery.

---

# Best Practices

✔ Use `EXISTS` when you only need to know that a match exists.

✔ Use `NOT EXISTS` for every exclusion; never `NOT IN` on a nullable column.

✔ Write `SELECT 1` inside `EXISTS`.

✔ Index the correlated column of the inner table.

✔ Keep the subquery's own filters inside the subquery.

✔ Check the plan for a semi- or anti-join operator.

---

# Interview Questions

## Basic

1. What is a semi-join?
2. What is an anti-join?
3. Why does `EXISTS` not duplicate left rows?

## Intermediate

4. When does `NOT IN` return no rows at all, and why?
5. How do you write an anti-join with a `LEFT JOIN`?
6. Does `SELECT 1` versus `SELECT *` matter inside `EXISTS`?

## Advanced

7. Why can a semi-join stop at the first match?
8. What does a plan show when the optimizer recognises a semi-join?
9. Why is `NOT EXISTS` preferable to `NOT IN` even when a `NULL` guard is present?

---

# Hands-on Exercises

## Exercise 1

List customers who have placed at least one order, three ways, and compare the plans.

---

## Exercise 2

List products that have never been ordered.

---

## Exercise 3

List customers who ordered in 2025 but not in 2026.

---

## Exercise 4

Demonstrate the `NOT IN` failure by inserting a single `NULL` into the subquery's source table.

---

# Related Topics

- **07.03 — INNER JOIN**
- **07.04 — LEFT JOIN (LEFT OUTER JOIN)**
- **07.12 — NULL Handling in JOINs**
- **06.10 — EXISTS and Subqueries in WHERE (Introduction)**
- **06.06 — IN and NOT IN**
- **05.07 — DISTINCT**

---

# Summary

A semi-join returns left rows that have at least one match, each exactly once; an anti-join returns left rows that have none. `EXISTS` and `NOT EXISTS` express both directly, are safe with `NULL`s, keep the result's grain equal to the left table's, and let the engine stop at the first match. `IN` is an acceptable alternative for the positive case, but `NOT IN` is unsafe—a single `NULL` in the subquery makes the entire result empty—and `JOIN` + `DISTINCT` does more work to reach the same answer. Index the correlated column, keep the subquery's own conditions inside it, and confirm in the plan that the optimizer produced a semi- or anti-join operator.
