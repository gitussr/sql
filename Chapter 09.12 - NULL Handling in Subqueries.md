---
title: "09.12 - NULL Handling in Subqueries"
description: "Three-valued logic applied to subqueries: NULL in IN and NOT IN lists, NULL outer values, empty scalar subqueries, ANY and ALL with NULLs, why EXISTS is two-valued, NOT IN versus NOT EXISTS versus LEFT JOIN IS NULL, and NULL-safe correlation."
chapter: 9
section: 9.12
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 30 min
lastUpdated: 2026-09-25
---

# 09.12 NULL Handling in Subqueries

---

# Learning Objectives

After completing this section, you will be able to:

- Evaluate `IN`, `NOT IN`, `ANY` and `ALL` step by step when `NULL`s are present.
- Predict the effect of a `NULL` on the outer side of a membership test.
- Handle empty scalar subqueries that yield `NULL`.
- Explain why `EXISTS` is never UNKNOWN.
- Choose among `NOT IN`, `NOT EXISTS` and `LEFT JOIN … IS NULL` for exclusions.
- Correlate on nullable columns without losing rows.

---

# The Rule Behind Everything

Section 06.08 established three-valued logic: a comparison with `NULL` is UNKNOWN, and `WHERE`/`HAVING` keep only TRUE. Every subquery behaviour in this section follows from one fact:

```text
x IN (a, b, c)       ≡   x = a  OR  x = b  OR  x = c
x NOT IN (a, b, c)   ≡   x <> a AND x <> b AND x <> c
x > ANY (a, b, c)    ≡   x > a  OR  x > b  OR  x > c
x > ALL (a, b, c)    ≡   x > a  AND x > b  AND x > c
```

```text
OR  with a TRUE  → TRUE        AND with a FALSE → FALSE
OR  otherwise with UNKNOWN → UNKNOWN
AND otherwise with UNKNOWN → UNKNOWN
```

---

# NULL Inside an IN List

```text
Subquery values: {1, 2, NULL}

x = 1   IN:  1=1 T                          → TRUE    ✅
x = 5   IN:  5=1 F, 5=2 F, 5=NULL U         → UNKNOWN ❌ (treated as not matching)
```

For `IN`, a `NULL` in the list is harmless in practice: rows that match are still TRUE, and rows that don't match are dropped either way (UNKNOWN instead of FALSE). The difference only becomes visible when the result is negated.

---

# NULL Inside a NOT IN List

```text
Subquery values: {1, 2, NULL}

x = 1   NOT IN:  1<>1 F                               → FALSE   ❌
x = 5   NOT IN:  5<>1 T, 5<>2 T, 5<>NULL U            → UNKNOWN ❌

Every row is FALSE or UNKNOWN → the query returns nothing.
```

This is the most important `NULL` rule in the chapter. One `NULL` in the subquery's result makes `NOT IN` return no rows at all.

```sql
-- Customers who never ordered: returns NOTHING once a guest order exists
SELECT c.CustomerName
FROM Customers AS c
WHERE c.CustomerID NOT IN (SELECT o.CustomerID FROM Orders AS o);
```

---

# NULL on the Outer Side

```text
x = NULL   IN     {1, 2}:   NULL=1 U, NULL=2 U       → UNKNOWN ❌
x = NULL   NOT IN {1, 2}:   NULL<>1 U, NULL<>2 U     → UNKNOWN ❌
x = NULL   NOT IN { }:      no comparisons           → TRUE    ✅
x = NULL   IN     { }:      no comparisons           → FALSE   ❌
```

An outer `NULL` is neither `IN` nor `NOT IN` a non-empty list. Rows with a `NULL` key therefore disappear from both "included" and "excluded" reports—a frequent cause of totals that do not add up.

```sql
-- These two counts do NOT add up to the total number of orders
SELECT COUNT(*) FROM Orders WHERE CustomerID IN     (SELECT CustomerID FROM Customers WHERE Country = 'India');
SELECT COUNT(*) FROM Orders WHERE CustomerID NOT IN (SELECT CustomerID FROM Customers WHERE Country = 'India');
-- Guest orders (CustomerID NULL) are in neither.
```

---

# The Truth Table

| Outer `x` | Subquery set | `x IN s` | `x NOT IN s` | `EXISTS (… = x)` | `NOT EXISTS (… = x)` |
|-----------|--------------|----------|--------------|------------------|----------------------|
| 1 | {1, 2} | TRUE | FALSE | TRUE | FALSE |
| 5 | {1, 2} | FALSE | TRUE | FALSE | TRUE |
| 5 | {1, 2, NULL} | UNKNOWN | **UNKNOWN** | FALSE | **TRUE** |
| NULL | {1, 2} | UNKNOWN | UNKNOWN | FALSE | TRUE |
| NULL | { } | FALSE | TRUE | FALSE | TRUE |
| 5 | { } | FALSE | TRUE | FALSE | TRUE |

The `EXISTS` columns contain only TRUE and FALSE. That is the whole argument for `NOT EXISTS`.

---

# Why EXISTS Is Two-Valued

`EXISTS` does not compare values; it asks whether the subquery produced a row. The correlation predicate inside it (`o.CustomerID = c.CustomerID`) can be UNKNOWN, but UNKNOWN rows are simply filtered out by the subquery's own `WHERE`. What remains is a count of rows—zero or more—and "zero or more" is always TRUE or FALSE.

```text
NOT EXISTS (SELECT 1 FROM Orders o WHERE o.CustomerID = c.CustomerID)

Customer 4:   Orders rows with CustomerID = 4?
                1 = 4 F, 2 = 4 F, NULL = 4 U → no row qualifies
              EXISTS → FALSE,  NOT EXISTS → TRUE ✅
```

---

# Three Ways to Exclude

```sql
-- 1. NOT IN: wrong as soon as Orders.CustomerID contains NULL
SELECT c.CustomerID FROM Customers AS c
WHERE c.CustomerID NOT IN (SELECT o.CustomerID FROM Orders AS o);

-- 2. NOT EXISTS: correct
SELECT c.CustomerID FROM Customers AS c
WHERE NOT EXISTS (SELECT 1 FROM Orders AS o WHERE o.CustomerID = c.CustomerID);

-- 3. LEFT JOIN … IS NULL: correct (test a NOT NULL column of the right table)
SELECT c.CustomerID
FROM Customers AS c
LEFT JOIN Orders AS o ON o.CustomerID = c.CustomerID
WHERE o.OrderID IS NULL;
```

| | `NOT IN` | `NOT EXISTS` | `LEFT JOIN … IS NULL` |
|---|----------|--------------|-----------------------|
| Correct with `NULL`s in the inner column | ❌ | ✅ | ✅ |
| Correct when outer key is `NULL` | Excludes it | Includes it | Includes it |
| States intent | ✅ | ✅ | Indirect |
| Planned as anti-join | Only if provably `NULL`-free | ✅ | ✅ (usually) |

Note the second row: for an outer row whose own key is `NULL`, `NOT EXISTS` and the `LEFT JOIN` form return it (nothing matches `NULL`), while `NOT IN` does not. Decide which you want; usually rows with no key should be handled separately anyway.

---

# Making NOT IN Safe

If `NOT IN` must be used (for example, in generated SQL), remove `NULL`s explicitly:

```sql
WHERE c.CustomerID NOT IN (
    SELECT o.CustomerID
    FROM Orders AS o
    WHERE o.CustomerID IS NOT NULL
)
```

A `NOT NULL` constraint on the inner column is the durable fix: it also lets the optimizer plan `NOT IN` as a plain anti-join.

---

# Empty Scalar Subqueries

```sql
-- Products priced above the average of category 99 (which has no products)
SELECT p.ProductName
FROM Products AS p
WHERE p.ListPrice > (SELECT AVG(p2.ListPrice) FROM Products p2 WHERE p2.CategoryID = 99);
-- AVG over no rows = NULL → every comparison UNKNOWN → no rows
```

```sql
-- SELECT list: NULL propagates through arithmetic
SELECT c.CustomerName,
       (SELECT SUM(o.TotalAmount) FROM Orders o WHERE o.CustomerID = c.CustomerID) * 1.18 AS WithTax
FROM Customers AS c;   -- NULL for customers without orders
```

Use `COALESCE` when "no rows" has a business meaning such as zero, and leave it `NULL` when "unknown" is the honest answer.

---

# ANY and ALL with NULLs

```text
Set {20, NULL}

x = 30   > ALL:  30>20 T, 30>NULL U   → UNKNOWN ❌
x = 10   > ALL:  10>20 F              → FALSE   ❌
x = 30   > ANY:  30>20 T              → TRUE    ✅
x = 10   > ANY:  10>20 F, 10>NULL U   → UNKNOWN ❌
```

`<> ALL` is `NOT IN` and inherits its trap; `ALL` in general can never be TRUE while the set contains a `NULL`.

---

# NULL-Safe Correlation

Correlating on a nullable column loses rows whose value is `NULL` on both sides, because `NULL = NULL` is UNKNOWN:

```sql
-- Products whose category also appears in the promotions table
-- Uncategorised products (CategoryID NULL) never match, even if Promotions has a NULL row
SELECT p.ProductName
FROM Products AS p
WHERE EXISTS (SELECT 1 FROM Promotions AS pr WHERE pr.CategoryID = p.CategoryID);
```

If `NULL` should match `NULL`, use a null-safe comparison:

```sql
WHERE pr.CategoryID IS NOT DISTINCT FROM p.CategoryID     -- standard; PostgreSQL, SQL Server 2022+, SQLite (IS)
WHERE pr.CategoryID <=> p.CategoryID                      -- MySQL
WHERE DECODE(pr.CategoryID, p.CategoryID, 1, 0) = 1       -- Oracle (before 23ai)
```

Null-safe comparisons can prevent index use on some engines; use them only when `NULL` genuinely means "the same unknown" in your data.

---

# Visual Representation

```text
                 inner set has NULL?
                 no                      yes
            ┌──────────────────┬───────────────────────┐
NOT IN      │ correct          │ returns NOTHING  ❌    │
NOT EXISTS  │ correct          │ correct          ✅    │
LEFT JOIN   │ correct          │ correct          ✅    │
  IS NULL   │                  │                       │
            └──────────────────┴───────────────────────┘
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← UNKNOWN from a subquery comparison drops the row here
4. GROUP BY
5. HAVING      ← and here, for group comparisons
6. SELECT      ← an empty scalar subquery here yields NULL in the output
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
NOT IN (subquery)
      │
      ▼
Both sides provably NOT NULL?  (constraints, IS NOT NULL filters)
      │
 ┌────┴──────────────────┐
 ▼                       ▼
Yes → ordinary          No → null-aware anti-join (Oracle, SQL Server),
      anti-join               hashed SubPlan (PostgreSQL), or
                              extra checks: "does the inner set contain a NULL?"
                              evaluated once, then per-row probe
```

A `NOT NULL` constraint is therefore not only a data-quality rule; it is information the optimizer uses to choose a faster plan.

---

# 🔬 Engine Deep Dive

A null-aware anti-join (Oracle's `HASH JOIN ANTI NA`, SQL Server's left anti semi join with extra `NULL` probes) builds the hash table on the subquery, and while building it records whether any `NULL` key was seen. If one was, the join can immediately return no rows; if not, it behaves as an ordinary anti-join except for outer rows whose own key is `NULL`, which are discarded. It is an elegant implementation of the truth table above.

---

# 🏗️ Architecture Insight

Every nullable foreign key creates a category of rows—guest orders, uncategorised products, unassigned tickets—that is invisible to `IN`, `NOT IN` and equality correlation. Decide at design time how those rows should appear in reports, and consider modelling them explicitly (a "Guest" customer row, an "Uncategorised" category) when they must be counted like everything else.

---

# ⚡ Performance Tip

Declare inner key columns `NOT NULL` wherever the data model allows. It makes `NOT IN` both correct and anti-join eligible, and removes the extra `NULL` checks from `IN` and quantified comparisons.

---

# 🔒 Security Note

Deny-lists written with `NOT IN` fail open or closed depending on the data: `WHERE UserID NOT IN (SELECT UserID FROM Suspended)` returns **nobody** once `Suspended` contains a `NULL`—a denial of service for every user. `NOT EXISTS` avoids this class of bug.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `NOT IN` with `NULL` → UNKNOWN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Empty scalar subquery → `NULL` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `IS NOT DISTINCT FROM` | ✅ | ✅ | `<=>` | ✅ (2022+) | ✅ (23ai+) | `IS` |
| `NOT IN` planned as anti-join | n/a | ❌ (hashed SubPlan) | ✅ (8.0.17+) | Null-aware | Null-aware (`ANTI NA`) | ❌ |
| `ANSI_NULLS OFF` changes `= NULL` | n/a | n/a | n/a | Deprecated setting | n/a | n/a |

> **Portability Tip:** `NULL` semantics in subqueries are consistent across engines—which means the `NOT IN` trap exists everywhere. Only SQL Server's deprecated `SET ANSI_NULLS OFF` alters `= NULL`; never depend on it.

---

# Common Mistakes

### Mistake 1

`NOT IN` against a nullable column.

---

### Mistake 2

Expecting `IN` and `NOT IN` counts to add up to the total when the outer key is nullable.

---

### Mistake 3

Treating an empty scalar subquery as `0`.

---

### Mistake 4

`ALL` against a set that may contain `NULL`.

---

### Mistake 5

`LEFT JOIN … IS NULL` testing a nullable column of the right table, which also matches rows that joined but had `NULL` there.

---

# Best Practices

✔ Use `NOT EXISTS` for every exclusion.

✔ Declare key columns `NOT NULL` wherever possible.

✔ Add `IS NOT NULL` inside any `NOT IN` or `ALL` subquery over a nullable column.

✔ Handle rows with `NULL` keys explicitly in reports.

✔ `COALESCE` empty scalar subqueries only when "none" really means a value.

---

# Interview Questions

## Basic

1. What does `NOT IN` return if the subquery contains a `NULL`?
2. What does a scalar subquery return when it finds no rows?
3. Why is `NOT EXISTS` safe with `NULL`s?

## Intermediate

4. Is a row with `CustomerID NULL` returned by `IN`, by `NOT IN`, or by neither?
5. What does `x NOT IN (empty set)` return when `x` is `NULL`?
6. Why is `x > ALL (…)` never TRUE when the set contains `NULL`?

## Advanced

7. How does a null-aware anti-join work?
8. How does a `NOT NULL` constraint change the plan for `NOT IN`?
9. How do you correlate on a nullable column so that `NULL` matches `NULL`?

---

# Hands-on Exercises

## Exercise 1

Insert a guest order with `CustomerID NULL`. Run "customers without orders" with `NOT IN`, `NOT EXISTS` and `LEFT JOIN … IS NULL`, and explain the three results.

---

## Exercise 2

Count orders whose customer is in India, not in India, and neither. Verify the three counts add up.

---

## Exercise 3

Return employees earning more than every salaried employee in department 10, ignoring contractors.

---

## Exercise 4

Match products to promotions by category so that uncategorised products match an uncategorised promotion.

---

# Related Topics

- **06.08 — NULL Handling in WHERE (Three-Valued Logic)**
- **07.12 — NULL Handling in JOINs**
- **08.04 — NULL Handling in Aggregates**
- **09.04 — IN and NOT IN with Subqueries**
- **09.05 — EXISTS and NOT EXISTS**
- **09.06 — ANY, SOME and ALL**

---

# Summary

Subquery comparisons expand into chains of `=`/`<>` joined by `OR` or `AND`, so three-valued logic decides every edge case: a `NULL` in an `IN` list is harmless, but a `NULL` in a `NOT IN` list makes every row UNKNOWN and the query returns nothing; an outer `NULL` is neither `IN` nor `NOT IN` a non-empty set; `ALL` cannot be TRUE over a set containing `NULL`; and an empty scalar subquery yields `NULL`. `EXISTS` counts rows instead of comparing values, so it is always TRUE or FALSE—which makes `NOT EXISTS` (or `LEFT JOIN … IS NULL` on a non-null column) the correct way to exclude. `NOT NULL` constraints make the whole problem disappear and give the optimizer a faster plan.
