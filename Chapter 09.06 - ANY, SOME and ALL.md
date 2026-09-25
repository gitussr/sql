---
title: "09.06 - ANY, SOME and ALL"
description: "Quantified comparisons with subqueries: ANY and SOME, ALL, their equivalence to IN, NOT IN, MIN and MAX, behaviour on empty sets and NULLs, and why most teams prefer aggregates or EXISTS in practice."
chapter: 9
section: 9.06
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 25 min
lastUpdated: 2026-09-25
---

# 09.06 ANY, SOME and ALL

---

# Learning Objectives

After completing this section, you will be able to:

- Compare a value with every member of a subquery's result using `ALL`.
- Compare a value with at least one member using `ANY` or `SOME`.
- Translate `= ANY`, `<> ALL`, `> ALL` and `> ANY` into `IN`, `NOT IN`, `MAX` and `MIN`.
- Predict the result for empty sets and sets containing `NULL`.
- Decide when a quantified comparison is clearer than an aggregate.

---

# What Are Quantified Comparisons?

A comparison operator followed by `ANY`, `SOME` or `ALL` compares one value with a **set** of values returned by a subquery.

```sql
x  op  ANY (subquery)     -- TRUE if x op v is TRUE for at least one v
x  op  SOME (subquery)    -- identical to ANY
x  op  ALL (subquery)     -- TRUE if x op v is TRUE for every v
```

`op` is any of `=`, `<>`, `<`, `<=`, `>`, `>=`.

---

# ALL

```sql
-- Products more expensive than every product in category 2
SELECT p.ProductName, p.ListPrice
FROM Products AS p
WHERE p.ListPrice > ALL (
    SELECT p2.ListPrice
    FROM Products AS p2
    WHERE p2.CategoryID = 2
);
```

```text
Category 2 prices: {20, 45, 60}

ListPrice 75 > 20 ✅, > 45 ✅, > 60 ✅  → TRUE  (kept)
ListPrice 50 > 20 ✅, > 45 ✅, > 60 ❌  → FALSE (dropped)
```

---

# ANY / SOME

```sql
-- Products more expensive than at least one product in category 2
SELECT p.ProductName, p.ListPrice
FROM Products AS p
WHERE p.ListPrice > ANY (
    SELECT p2.ListPrice
    FROM Products AS p2
    WHERE p2.CategoryID = 2
);
```

```text
Category 2 prices: {20, 45, 60}

ListPrice 50 > 20 ✅                    → TRUE  (kept)
ListPrice 15 > 20 ❌, > 45 ❌, > 60 ❌  → FALSE (dropped)
```

`SOME` is a synonym kept for readability: "`> SOME`" can read more naturally in English than "`> ANY`", which people often misread as "greater than all".

---

# Equivalences

| Quantified form | Equivalent | Caveat |
|-----------------|-----------|--------|
| `x = ANY (s)` | `x IN (s)` | Identical |
| `x <> ALL (s)` | `x NOT IN (s)` | Identical—including the `NULL` trap |
| `x > ALL (s)` | `x > (SELECT MAX(v) FROM s)` | Differs on empty set and `NULL`s |
| `x > ANY (s)` | `x > (SELECT MIN(v) FROM s)` | Differs on empty set and `NULL`s |
| `x < ALL (s)` | `x < (SELECT MIN(v) FROM s)` | Differs on empty set and `NULL`s |
| `x < ANY (s)` | `x < (SELECT MAX(v) FROM s)` | Differs on empty set and `NULL`s |
| `x <> ANY (s)` | "s contains some value other than x" | Rarely what people mean |

`x <> ANY (s)` is a classic trap: it is TRUE whenever the set has at least two different values, because `x` differs from at least one of them. "Not in the list" is `<> ALL`.

---

# The Empty Set

```text
Subquery returns no rows

x > ALL ( ∅ )   →  TRUE    ("every member" of an empty set: vacuously true)
x > ANY ( ∅ )   →  FALSE   ("some member": there is none)

x > (SELECT MAX(v) FROM ∅)  →  x > NULL  →  UNKNOWN → row dropped
```

This is the real difference between `ALL` and its `MAX` rewrite:

```sql
-- If category 99 does not exist:
WHERE p.ListPrice > ALL (SELECT ListPrice FROM Products WHERE CategoryID = 99)
-- → every product is returned

WHERE p.ListPrice > (SELECT MAX(ListPrice) FROM Products WHERE CategoryID = 99)
-- → no product is returned
```

Decide which answer the business question needs; neither is automatically correct.

---

# NULLs in the Set

```text
Set: {20, 45, NULL}

x = 50   > ALL:  50>20 T, 50>45 T, 50>NULL U   → UNKNOWN (dropped)
x = 50   > ANY:  50>20 T                         → TRUE    (kept)
x = 10   > ANY:  10>20 F, 10>45 F, 10>NULL U   → UNKNOWN (dropped)
```

- `ALL` can never be TRUE when the set contains a `NULL` (unless another member already makes it FALSE).
- `ANY` is TRUE if any non-null member satisfies the comparison; otherwise a `NULL` turns FALSE into UNKNOWN.

`MAX`/`MIN` ignore `NULL`s, so the aggregate rewrites behave differently here too. If the column is nullable, add `WHERE v IS NOT NULL` inside the subquery to make `ALL` behave like the aggregate.

---

# A Practical Example

```sql
-- Employees who earn more than every employee in department 10
SELECT e.EmployeeName, e.Salary
FROM Employees AS e
WHERE e.Salary > ALL (
    SELECT e2.Salary
    FROM Employees AS e2
    WHERE e2.DepartmentID = 10
      AND e2.Salary IS NOT NULL      -- contractors have NULL salary
);
```

Without the `IS NOT NULL` filter, a single contractor in department 10 would make the query return nobody.

---

# Correlated Quantified Comparisons

```sql
-- Orders that are the largest for their customer (ties included)
SELECT o.OrderID, o.CustomerID, o.TotalAmount
FROM Orders AS o
WHERE o.TotalAmount >= ALL (
    SELECT o2.TotalAmount
    FROM Orders AS o2
    WHERE o2.CustomerID = o.CustomerID
);
```

This works, but the aggregate form is easier to read and to optimise:

```sql
WHERE o.TotalAmount = (
    SELECT MAX(o2.TotalAmount) FROM Orders AS o2 WHERE o2.CustomerID = o.CustomerID
);
```

The set always contains the outer row itself, so the empty-set difference does not arise here.

---

# Visual Representation

```text
Set S = {20, 45, 60}                number line
                                    ──●──────●──────●──────────→
                                     20     45     60

x > ANY S   ⇔ x > 20     ─────────────○══════════════════════→
x > ALL S   ⇔ x > 60     ──────────────────────────────○═════→
x < ANY S   ⇔ x < 60     ══════════════════════════════○─────→
x < ALL S   ⇔ x < 20     ═════════════○──────────────────────→
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← ANY / SOME / ALL comparisons are evaluated here
4. GROUP BY
5. HAVING      ← or here, comparing an aggregate with a set
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
x = ANY (s)     → rewritten as IN → semi-join
x <> ALL (s)    → rewritten as NOT IN → null-aware anti-join / hashed SubPlan
x > ALL (s)     → often rewritten as:
                    x > MAX(s)  AND  no NULL in s,  OR  s is empty
                  (the extra conditions preserve the exact semantics)
x > ANY (s)     → x > MIN(s) with similar guards
```

Because the exact rewrite needs these guards, optimizers sometimes leave `> ALL` as a per-row subquery. The hand-written aggregate form, where its semantics are acceptable, is more predictable.

---

# 🔬 Engine Deep Dive

MySQL documents this transformation explicitly: for an uncorrelated `> ALL` subquery it computes `MAX` once and also tracks whether the subquery was empty or produced a `NULL`, so that the result keeps the standard semantics. It is a good illustration of why rewrites that look trivial on paper are subtle in practice.

---

# 🏗️ Architecture Insight

Quantified comparisons read well in specifications ("price above all competitor prices") but are uncommon in production code, largely because their empty-set and `NULL` behaviour surprises reviewers. When you use them, add a comment stating the intended behaviour for an empty set.

---

# ⚡ Performance Tip

`> ALL` and `< ALL` against an uncorrelated subquery on an indexed column can be answered by one index seek to the maximum or minimum. For correlated forms, an index on `(correlation column, compared column)` lets each probe read one index entry.

---

# 🔒 Security Note

Quantified comparisons have no special security implications. As with every subquery, the user needs `SELECT` on the tables it reads.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `ANY` / `SOME` / `ALL` with subquery | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `ANY` / `ALL` with a literal list | ❌ | Arrays: `= ANY(ARRAY[…])` | ❌ | ❌ | ✅ `> ALL (1, 2, 3)` | ❌ |
| Row limit inside the subquery | n/a | ✅ | ❌ | `TOP` ✅ | ✅ | n/a |

> **Portability Tip:** SQLite has no `ANY` or `ALL`. For portable code, write `IN`, `NOT EXISTS`, or a comparison with `MIN`/`MAX`, and handle the empty set explicitly.

---

# Common Mistakes

### Mistake 1

Reading `x <> ANY (s)` as "x is not in s". It means "s contains something other than x".

---

### Mistake 2

Forgetting that `> ALL` of an empty set is TRUE, so every row is returned.

---

### Mistake 3

Using `ALL` against a nullable column, which returns nothing once a `NULL` appears.

---

### Mistake 4

Replacing `> ALL` with `> MAX` without considering the empty set.

---

# Best Practices

✔ Prefer `IN` to `= ANY` and `NOT EXISTS` to `<> ALL`.

✔ Filter `NULL`s out of a set used with `ALL`.

✔ State the empty-set behaviour you want, and pick `ALL` or `MAX` accordingly.

✔ Use `SOME` instead of `ANY` where it reads more clearly.

---

# Interview Questions

## Basic

1. What is the difference between `ANY` and `ALL`?
2. Are `ANY` and `SOME` different?
3. What is `= ANY` equivalent to?

## Intermediate

4. Why is `x <> ANY (s)` not the same as `x NOT IN (s)`?
5. What does `x > ALL (empty)` return?
6. How does a `NULL` in the set affect `> ALL`?

## Advanced

7. Why is `x > ALL (s)` not exactly `x > (SELECT MAX(v) FROM s)`?
8. How would you emulate `> ALL` on SQLite with the same semantics?
9. When might an optimizer decline to rewrite `> ALL` into an aggregate?

---

# Hands-on Exercises

## Exercise 1

Return products cheaper than every product in category 1.

---

## Exercise 2

Return employees whose salary is at least as high as some salary in department 20.

---

## Exercise 3

Rewrite Exercise 1 using `MIN`, then find a data set on which the two queries return different results.

---

## Exercise 4

Return each customer's largest order (ties included) using `>= ALL`.

---

# Related Topics

- **09.04 — IN and NOT IN with Subqueries**
- **09.05 — EXISTS and NOT EXISTS**
- **09.12 — NULL Handling in Subqueries**
- **06.03 — Comparison Operators**
- **08.02 — Aggregate Functions (COUNT, SUM, AVG, MIN, MAX)**

---

# Summary

`ANY` (or `SOME`) makes a comparison TRUE if it holds for at least one value the subquery returns; `ALL` requires it to hold for every value. `= ANY` is `IN` and `<> ALL` is `NOT IN`, `NULL` trap included; `> ALL` and `> ANY` resemble comparisons with `MAX` and `MIN` but differ on empty sets—where `ALL` is vacuously TRUE and `ANY` is FALSE—and on `NULL`s, which make `ALL` UNKNOWN. SQLite lacks both keywords, so portable code usually prefers `IN`, `NOT EXISTS` or an explicit aggregate with the empty case handled deliberately.
