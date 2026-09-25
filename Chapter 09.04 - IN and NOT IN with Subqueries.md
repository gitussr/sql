---
title: "09.04 - IN and NOT IN with Subqueries"
description: "Membership tests with subqueries: IN as a semi-join, duplicates in the inner result, correlated IN, multi-column IN, NOT IN and its NULL trap, empty subqueries, and how IN compares with EXISTS and joins."
chapter: 9
section: 9.04
category: Data Query Language (DQL)
difficulty: Beginner → Intermediate
readingTime: 30 min
lastUpdated: 2026-09-25
---

# 09.04 IN and NOT IN with Subqueries

---

# Learning Objectives

After completing this section, you will be able to:

- Filter rows by membership in a subquery's result with `IN`.
- Explain why duplicates in the subquery never duplicate outer rows.
- Exclude rows with `NOT IN`, and explain why a single `NULL` breaks it.
- Write multi-column `IN` and its portable alternative.
- Choose between `IN`, `EXISTS` and a join for a membership test.

---

# What IN Does with a Subquery

`x IN (subquery)` is TRUE when `x` equals at least one value the subquery returns.

```sql
-- Customers who have placed at least one order
SELECT c.CustomerID, c.CustomerName
FROM Customers AS c
WHERE c.CustomerID IN (
    SELECT o.CustomerID
    FROM Orders AS o
);
```

```text
Subquery result                Customers                         Result
┌────────────┐                 ┌────┬───────┐
│ CustomerID │                 │ 1  │ Asha  │  1 ∈ {1,1,2,2,3}  ✅   Asha
├────────────┤                 │ 2  │ Ben   │  2 ∈ {…}          ✅   Ben
│ 1          │                 │ 3  │ Chen  │  3 ∈ {…}          ✅   Chen
│ 1          │                 │ 4  │ Dina  │  4 ∈ {…}          ❌
│ 2          │                 └────┴───────┘
│ 2          │
│ 3          │
└────────────┘
```

Section 06.06 introduced `IN` with a literal list. A subquery simply supplies the list from data.

---

# Duplicates Do Not Multiply Rows

Customer 1 appears twice in the subquery result, yet Asha is returned once. `IN` asks *whether* a match exists, not *how many*. This is the defining property of a **semi-join**, and the key difference from an inner join:

```sql
-- ❌ Returns Asha twice, Ben twice: one row per order
SELECT c.CustomerID, c.CustomerName
FROM Customers AS c
JOIN Orders AS o ON o.CustomerID = c.CustomerID;

-- ✅ Returns each qualifying customer once
SELECT c.CustomerID, c.CustomerName
FROM Customers AS c
WHERE c.CustomerID IN (SELECT o.CustomerID FROM Orders AS o);
```

Adding `DISTINCT` inside the subquery is therefore unnecessary: `IN (SELECT DISTINCT …)` returns the same rows, and optimizers typically ignore the `DISTINCT`.

---

# Filtering Inside the Subquery

The subquery can be as selective as needed:

```sql
-- Customers with a shipped order over 500 in 2026
SELECT c.CustomerName
FROM Customers AS c
WHERE c.CustomerID IN (
    SELECT o.CustomerID
    FROM Orders AS o
    WHERE o.Status = 'Shipped'
      AND o.TotalAmount > 500
      AND o.OrderDate >= DATE '2026-01-01'
);

-- Products ever ordered together with product 7
SELECT p.ProductName
FROM Products AS p
WHERE p.ProductID IN (
    SELECT oi.ProductID
    FROM OrderItems AS oi
    WHERE oi.OrderID IN (
        SELECT oi7.OrderID FROM OrderItems AS oi7 WHERE oi7.ProductID = 7
    )
)
  AND p.ProductID <> 7;
```

---

# Correlated IN

`IN` subqueries are usually uncorrelated, but they may reference the outer row:

```sql
-- Employees whose salary equals one of the salaries in their own department's top band
SELECT e.EmployeeName
FROM Employees AS e
WHERE e.Salary IN (
    SELECT e2.Salary
    FROM Employees AS e2
    WHERE e2.DepartmentID = e.DepartmentID
    ORDER BY e2.Salary DESC
    FETCH FIRST 3 ROWS ONLY
);
```

(MySQL does not allow a row limit inside an `IN` subquery; use a derived table or window function there.) In practice, a correlated `IN` is almost always clearer written as `EXISTS` (Section 09.05).

---

# Multi-Column IN

```sql
-- Order lines that have been returned
SELECT oi.*
FROM OrderItems AS oi
WHERE (oi.OrderID, oi.ProductID) IN (
    SELECT r.OrderID, r.ProductID
    FROM Returns AS r
);
```

Supported by PostgreSQL, MySQL, Oracle and SQLite. SQL Server does not support row values; use `EXISTS`:

```sql
SELECT oi.*
FROM OrderItems AS oi
WHERE EXISTS (
    SELECT 1 FROM Returns AS r
    WHERE r.OrderID = oi.OrderID AND r.ProductID = oi.ProductID
);
```

Never concatenate columns to fake a multi-column match (`OrderID || '-' || ProductID IN (…)`): it defeats indexes and can produce false matches.

---

# NOT IN

`x NOT IN (subquery)` is intended to mean "x equals none of the values".

```sql
-- Customers who have never ordered?
SELECT c.CustomerID, c.CustomerName
FROM Customers AS c
WHERE c.CustomerID NOT IN (
    SELECT o.CustomerID
    FROM Orders AS o
);
```

With no `NULL`s in `Orders.CustomerID`, this returns Dina. But in this chapter's schema, guest checkouts have `CustomerID = NULL`—and then the query returns **nothing at all**.

---

# The NOT IN NULL Trap

`x NOT IN (a, b, NULL)` expands to:

```text
x <> a  AND  x <> b  AND  x <> NULL
                          └── always UNKNOWN

TRUE AND TRUE AND UNKNOWN  →  UNKNOWN   → row discarded
```

```text
Subquery values: {1, 2, 3, NULL}

CustomerID 4:  4<>1 TRUE, 4<>2 TRUE, 4<>3 TRUE, 4<>NULL UNKNOWN  → UNKNOWN ❌
CustomerID 1:  1<>1 FALSE …                                        → FALSE   ❌

Result: empty
```

No row can ever be TRUE once a `NULL` is in the list. Section 09.12 covers the full three-valued logic; the practical rules are:

```sql
-- ✅ Preferred: NOT EXISTS ignores NULLs in the inner table
SELECT c.CustomerID, c.CustomerName
FROM Customers AS c
WHERE NOT EXISTS (
    SELECT 1 FROM Orders AS o WHERE o.CustomerID = c.CustomerID
);

-- ✅ Acceptable: filter NULLs out explicitly
WHERE c.CustomerID NOT IN (
    SELECT o.CustomerID FROM Orders AS o WHERE o.CustomerID IS NOT NULL
);
```

`NOT IN` is safe only when the inner column is declared `NOT NULL`—and stays safe only as long as it remains so.

---

# Empty Subqueries

| Expression | Subquery empty | Result |
|------------|----------------|--------|
| `x IN (…)` | ✅ | FALSE for every row → nothing returned |
| `x NOT IN (…)` | ✅ | TRUE for every row → everything returned (even when `x` is `NULL`) |

The second line is a subtle edge case: `NULL NOT IN (empty)` is TRUE, because there is no value to compare with.

---

# NULL on the Outer Side

If the outer value is `NULL`, `IN` is never TRUE:

```sql
-- Orders with CustomerID NULL are never returned by IN, whatever the list holds
SELECT o.OrderID
FROM Orders AS o
WHERE o.CustomerID IN (SELECT c.CustomerID FROM Customers AS c WHERE c.Country = 'India');
```

That is usually what you want. It also means `IN` and `NOT IN` are **not** complements: a guest order is neither `IN` nor `NOT IN` any non-empty list.

---

# IN vs EXISTS vs JOIN

| | `IN (subquery)` | `EXISTS (subquery)` | `JOIN` |
|---|-----------------|---------------------|--------|
| Outer rows duplicated by multiple matches | No | No | **Yes** |
| Can return inner columns | No | No | Yes |
| Multi-column match portable | No | Yes | Yes |
| Negated form safe with `NULL`s | **No** (`NOT IN`) | Yes (`NOT EXISTS`) | Yes (`LEFT JOIN … IS NULL`) |
| Usual plan | Semi-join | Semi-join | Join |

For positive membership, `IN` and `EXISTS` are interchangeable on modern optimizers; pick the more readable. For exclusion, prefer `NOT EXISTS`.

---

# Visual Representation

```text
IN  (semi-join)                          NOT IN with a NULL

Customers      Orders.CustomerID         Customers      {1, 2, 3, NULL}
┌───┐          ┌──────┐                  ┌───┐
│ 1 │ ───────→ │ 1  1 │  match → keep    │ 1 │  = 1           → FALSE ❌
│ 2 │ ───────→ │ 2  2 │  match → keep    │ 2 │  = 2           → FALSE ❌
│ 3 │ ───────→ │ 3    │  match → keep    │ 3 │  = 3           → FALSE ❌
│ 4 │ ───╳     │      │  none  → drop    │ 4 │  <> NULL ?     → UNKNOWN ❌
└───┘          └──────┘                  └───┘
                                         Result: empty
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← IN / NOT IN are evaluated here, row by row, against the subquery's set
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
WHERE c.CustomerID IN (SELECT o.CustomerID FROM Orders o)

↓ rewritten as

Customers  SEMI JOIN  Orders  ON o.CustomerID = c.CustomerID

↓ physical options

Hash Semi Join     (build hash of Orders.CustomerID, probe with Customers)
Merge Semi Join    (both sides sorted on CustomerID)
Nested Loop Semi   (for each customer, index seek on Orders(CustomerID), stop at first match)
Hash Aggregate + Join (deduplicate inner values, then inner join)
```

`NOT IN` is harder: because of `NULL` semantics, it can be turned into an anti-join only when the optimizer can prove neither side contains `NULL`s. Otherwise engines use a "null-aware anti-join" (Oracle, SQL Server) or fall back to a per-row check (PostgreSQL's hashed SubPlan).

---

# 🔬 Engine Deep Dive

PostgreSQL does not convert `NOT IN (subquery)` into an anti-join at all. It evaluates it as a *hashed SubPlan*: the subquery result is loaded into an in-memory hash table and each outer row probes it. That is fast while the subquery fits in `work_mem`; beyond that it degrades to re-scanning the subquery for every outer row. `NOT EXISTS` is planned as a true anti-join and has no such cliff.

---

# 🏗️ Architecture Insight

`NOT IN` failing on a `NULL` is a symptom of a modelling question: what does a `NULL` foreign key mean? Here it means "guest checkout". Whenever a nullable foreign key is introduced, every `NOT IN` against that column becomes a latent bug. Reviewing exclusion queries is part of the migration that makes a column nullable.

---

# ⚡ Performance Tip

Index the inner column of an `IN` subquery (`Orders(CustomerID)`). It enables nested-loop semi-joins that stop at the first match per outer row, and merge semi-joins that need no sort.

---

# 🔒 Security Note

A subquery is the safe replacement for building `IN (1, 5, 9, …)` from application data. If a list really must come from the application, pass it as an array parameter (`= ANY(?)` in PostgreSQL), a table-valued parameter (SQL Server) or a temporary table—never by string concatenation.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `IN (subquery)` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `NOT IN` null semantics | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-column `IN` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ (3.15+) |
| Row limit inside `IN` subquery | n/a | ✅ | ❌ | `TOP` ✅ | ✅ | ✅ |
| `NOT IN` → anti-join rewrite | n/a | ❌ (hashed SubPlan) | ✅ (8.0.17+) | Null-aware | Null-aware | ❌ |

> **Portability Tip:** `IN (subquery)` for inclusion and `NOT EXISTS` for exclusion behave and perform well on every engine.

---

# Common Mistakes

### Mistake 1

`NOT IN` against a nullable column—returns no rows as soon as one `NULL` appears.

---

### Mistake 2

Using a join to test membership, then adding `DISTINCT` to remove the duplicates it created.

---

### Mistake 3

Returning more than one column from an `IN` subquery on a single outer column.

---

### Mistake 4

Expecting `IN` and `NOT IN` to partition the table. Rows whose outer value is `NULL` belong to neither.

---

# Best Practices

✔ Use `IN (subquery)` or `EXISTS` for "has at least one".

✔ Use `NOT EXISTS` for "has none".

✔ If you must use `NOT IN`, add `WHERE col IS NOT NULL` inside the subquery.

✔ Use `EXISTS` instead of multi-column `IN` in portable code.

✔ Index the inner column.

---

# Interview Questions

## Basic

1. What does `x IN (subquery)` return?
2. Why doesn't `IN` duplicate outer rows when the subquery has duplicates?
3. How do you find customers with no orders?

## Intermediate

4. Why does `NOT IN` return nothing when the subquery contains a `NULL`?
5. What does `x NOT IN (empty subquery)` return?
6. How do you write a multi-column membership test on SQL Server?

## Advanced

7. Why can't every optimizer turn `NOT IN` into an anti-join?
8. What is a null-aware anti-join?
9. Why are `IN` and `NOT IN` not complements?

---

# Hands-on Exercises

## Exercise 1

Return products that appear on at least one order placed in September 2026.

---

## Exercise 2

Return customers who have never placed an order, first with `NOT IN`, then with `NOT EXISTS`. Insert a guest order (`CustomerID NULL`) and compare the results.

---

## Exercise 3

Return employees who manage at least one other employee.

---

## Exercise 4

Return order lines that have been returned, in a form that runs on SQL Server.

---

# Related Topics

- **06.06 — IN and NOT IN**
- **09.05 — EXISTS and NOT EXISTS**
- **09.12 — NULL Handling in Subqueries**
- **09.13 — Subqueries vs JOINs**
- **07.13 — Semi-Joins and Anti-Joins (EXISTS and NOT EXISTS)**
- **06.08 — NULL Handling in WHERE (Three-Valued Logic)**

---

# Summary

`x IN (subquery)` keeps a row when `x` matches at least one value from the subquery; it is a semi-join, so duplicates in the subquery never duplicate outer rows. `NOT IN` is its dangerous twin: a single `NULL` among the subquery's values makes every comparison UNKNOWN and the query returns nothing, while an empty subquery makes it TRUE for every row. Use `IN` or `EXISTS` for inclusion, `NOT EXISTS` for exclusion, `EXISTS` for multi-column matches in portable code, and index the inner column so the semi-join can stop at the first match.
