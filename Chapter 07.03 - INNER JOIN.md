---
title: "07.03 - INNER JOIN"
description: "INNER JOIN in depth: matching pairs only, row multiplication and cardinality, duplicate control, inner joins on non-key columns, NULL exclusion, multi-column and non-equi conditions, and how the optimizer treats ON and WHERE identically for inner joins."
chapter: 7
section: 7.03
category: Data Query Language (DQL)
difficulty: Beginner → Intermediate
readingTime: 40 min
lastUpdated: 2026-09-22
---

# 07.03 INNER JOIN

---

# Learning Objectives

After completing this section, you will be able to:

- Write `INNER JOIN` correctly and read its result.
- Predict which rows an inner join drops.
- Explain why an inner join can return more rows than either table.
- Control duplicates produced by 1:N joins.
- Explain why `NULL` keys never match in an inner join.
- Write multi-column and non-equi inner joins.
- Explain why `ON` and `WHERE` are interchangeable for inner joins only.

---

# What is an INNER JOIN?

An inner join returns only the pairs of rows that satisfy the join condition. Rows with no match on the other side are dropped—from **both** sides.

```sql
SELECT
    c.CustomerName,
    o.OrderID,
    o.TotalAmount
FROM Customers AS c
INNER JOIN Orders AS o
    ON o.CustomerID = c.CustomerID;
```

```text
Customers                      Orders
┌────┬───────┐                 ┌─────┬────────────┐
│ 1  │ Ada   │                 │ 101 │ 1          │
│ 2  │ Grace │                 │ 102 │ 1          │
│ 3  │ Linus │  ← no orders    │ 103 │ 2          │
└────┴───────┘                 │ 104 │ 9          │ ← no such customer
                               └─────┴────────────┘

INNER JOIN result
┌───────┬─────┐
│ Ada   │ 101 │
│ Ada   │ 102 │
│ Grace │ 103 │
└───────┴─────┘

Dropped: Linus (no order), order 104 (no customer)
```

---

# The Default Join

`INNER` is optional. These are identical:

```sql
FROM Customers AS c INNER JOIN Orders AS o ON o.CustomerID = c.CustomerID
FROM Customers AS c       JOIN Orders AS o ON o.CustomerID = c.CustomerID
```

Writing `INNER` explicitly is recommended: in a query with mixed join types, the reader should not have to remember which default applies.

---

# Row Count Behaviour

An inner join does not "filter" in any simple sense. It can return fewer rows than either input, or many more.

| Situation | Result |
|-----------|--------|
| Every left row matches exactly one right row | Same as left |
| Some left rows have no match | Fewer |
| Left rows have several matches | More |
| Both sides have duplicates | Multiplied |

```text
Customers (3)  ⋈  Orders (5, one orphaned)  →  4 rows? 3? 5?

Ada   → 101, 102     → 2 rows
Grace → 103          → 1 row
Linus → —            → 0 rows
                       ───────
                       3 rows
```

The rule: **one output row per matching pair.**

---

# Duplicate Rows from 1:N Joins

A 1:N join repeats the "one" side once per match:

```sql
SELECT
    c.CustomerName,
    c.Country,
    o.OrderID
FROM Customers AS c
INNER JOIN Orders AS o
    ON o.CustomerID = c.CustomerID;
```

```text
CustomerName │ Country   │ OrderID
─────────────┼───────────┼────────
Ada          │ Australia │ 101
Ada          │ Australia │ 102     ← Ada repeated
Grace        │ Australia │ 103
```

That repetition is correct—each row describes one order—but it breaks naive aggregation:

```sql
-- ❌ Counts orders, not customers
SELECT COUNT(*) FROM Customers c JOIN Orders o ON o.CustomerID = c.CustomerID;

-- ✅ Counts distinct customers who have ordered
SELECT COUNT(DISTINCT c.CustomerID) FROM Customers c JOIN Orders o ON o.CustomerID = c.CustomerID;

-- ✅ Same answer without a join at all
SELECT COUNT(*) FROM Customers c
WHERE EXISTS (SELECT 1 FROM Orders o WHERE o.CustomerID = c.CustomerID);
```

Reach for `EXISTS` when you need only the left rows; reach for the join when you need the right table's columns.

---

# NULL Keys Never Match

An inner join uses ordinary SQL comparison, so `NULL = NULL` is UNKNOWN, not TRUE.

```text
Orders
┌─────┬────────────┐
│ 105 │ NULL       │   ← order with no customer recorded
└─────┴────────────┘

Customers
┌──────┬────────┐
│ NULL │ ???    │   ← would still not match
└──────┴────────┘
```

```sql
SELECT o.OrderID, c.CustomerName
FROM Orders AS o
INNER JOIN Customers AS c
    ON c.CustomerID = o.CustomerID;
-- Order 105 never appears, whatever Customers contains.
```

Rows with a `NULL` join key are invisible to an inner join. If those rows matter, use an outer join (Section 07.04) or an explicit null-safe comparison (Section 07.12).

---

# Multi-Column Conditions

Composite keys need every column in the condition:

```sql
SELECT
    oi.OrderID,
    i.QuantityOnHand
FROM OrderItems AS oi
INNER JOIN Inventory AS i
    ON  i.ProductID   = oi.ProductID
    AND i.WarehouseID = oi.WarehouseID;
```

Omitting one column of a composite key is a classic silent bug: the join still runs, but each order item now matches the product in *every* warehouse, multiplying rows and inflating any quantity total.

---

# Non-Equi Inner Joins

The condition need not be equality:

```sql
SELECT
    o.OrderID,
    o.TotalAmount,
    b.BandName
FROM Orders AS o
INNER JOIN AmountBands AS b
    ON o.TotalAmount >= b.MinAmount
   AND o.TotalAmount <  b.MaxAmount;
```

```text
AmountBands
┌────────┬──────────┬──────────┐
│ Small  │      0   │    100   │
│ Medium │    100   │    500   │
│ Large  │    500   │ 1000000  │
└────────┴──────────┴──────────┘

Order 250.00  →  Medium
```

Note the half-open bounds (`>=` and `<`): they guarantee that no amount falls into two bands, exactly as in Section 06.05.

---

# Inner Joins on Non-Key Columns

Legal, occasionally useful, usually a warning sign:

```sql
SELECT
    e.EmployeeName,
    d.DepartmentName
FROM Employees AS e
INNER JOIN Departments AS d
    ON d.DepartmentName = e.DepartmentLabel;   -- text matching
```

Risks:

- Collation and case differences cause silent misses.
- Trailing spaces and accents break equality.
- Duplicates on either side multiply rows.
- No index is likely to exist on the text column.

Join on keys; if the schema has no key to join on, that is a schema problem, not a query problem.

---

# ON and WHERE are Interchangeable — Here Only

For an **inner** join, these two queries are guaranteed to return the same result:

```sql
SELECT c.CustomerName, o.OrderID
FROM Customers AS c
INNER JOIN Orders AS o
    ON o.CustomerID = c.CustomerID
   AND o.TotalAmount > 100;
```

```sql
SELECT c.CustomerName, o.OrderID
FROM Customers AS c
INNER JOIN Orders AS o
    ON o.CustomerID = c.CustomerID
WHERE o.TotalAmount > 100;
```

Because an inner join drops unmatched rows anyway, moving a predicate between `ON` and `WHERE` cannot change the outcome, and the optimizer freely rewrites one into the other.

For outer joins this is emphatically **not** true, which is the subject of Section 07.11. Even here, convention matters: keep relationship logic in `ON`, restrictions in `WHERE`, so that changing the join type later does not silently change results.

---

# Visual Representation

```text
        Customers                Orders
      ┌───────────┐           ┌───────────┐
      │           │           │           │
      │      ┌────┼───────────┼────┐      │
      │      │████████████████████ │      │
      │      │████ matching ██████ │      │
      │      │████   pairs  ██████ │      │
      │      └────┼───────────┼────┘      │
      │           │           │           │
      └───────────┘           └───────────┘
       dropped                  dropped
    (no orders)            (no such customer)

              INNER JOIN = the overlap only
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN    ← INNER JOIN matches rows here
3. WHERE
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

Rows dropped by the join are gone before `WHERE`, `GROUP BY` and `SELECT` ever see them—which is why an inner join changes aggregate results, not just the visible rows.

---

# How the DBMS Executes This

```text
SELECT c.CustomerName, o.OrderID
FROM Customers c INNER JOIN Orders o ON o.CustomerID = c.CustomerID
WHERE c.Country = 'Australia'

↓

Optimizer pushes the filter down:
    scan/seek Customers WHERE Country = 'Australia'

↓

Estimate: 120 customers survive

↓

Join algorithm:
    120 index seeks into Orders(CustomerID)   → Nested Loop
    or build a hash of 120 rows, scan Orders  → Hash Join

↓

Emit matched pairs
```

Filter pushdown is why an inner join with a selective `WHERE` is often far cheaper than its table sizes suggest: the engine filters first and joins the survivors.

---

# 🔬 Engine Deep Dive

For an inner join the optimizer may reorder the tables freely: `A ⋈ B` and `B ⋈ A` produce the same rows, so it chooses whichever order reads fewer rows. Outer joins do not have this freedom—`A LEFT JOIN B` is not `B LEFT JOIN A`—which is one reason outer joins constrain the plan space and can be harder to optimize.

---

# 🏗️ Architecture Insight

An inner join encodes an assumption: "rows without a counterpart are not part of the answer." That assumption is often correct and occasionally catastrophic—an inner join between `Orders` and `Payments` silently hides unpaid orders, which is exactly the set a finance report needs. Choose the join type from the question, not from habit.

---

# ⚡ Performance Tip

Inner joins are the easiest join for an optimizer: predicates can move, tables can be reordered, and any of the three algorithms applies. Keep that freedom by joining on plain indexed columns with matching data types—no functions, no casts, no string concatenation in the `ON` clause.

---

# 🌍 Production Consideration

The most common production incident caused by an inner join is *missing* data: a report that quietly excludes rows whose foreign key is `NULL` or whose lookup row was deleted. Reconciling a joined row count against the source table's count catches it immediately.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `INNER JOIN` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `INNER` optional | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `JOIN` without `ON` | ❌ error | ❌ | ✅ (acts as `CROSS JOIN`) | ❌ | ❌ | ✅ |
| Join hints | ❌ | ❌ (config only) | ✅ | ✅ | ✅ | ❌ |

> **Portability Tip:** MySQL and SQLite accept `JOIN` with no `ON` clause and silently treat it as a cross join. On PostgreSQL, SQL Server and Oracle the same statement is a syntax error. Always write the condition.

---

# Common Mistakes

### Mistake 1

Using an inner join when unmatched rows are part of the question ("all customers, with their order count").

---

### Mistake 2

Counting rows after a 1:N inner join and reporting it as a count of the "one" side.

---

### Mistake 3

Omitting one column of a composite key, multiplying rows:

```sql
-- ❌ matches every warehouse
ON i.ProductID = oi.ProductID
```

---

### Mistake 4

Expecting rows whose join key is `NULL` to appear.

---

# Best Practices

✔ Write `INNER JOIN` explicitly.

✔ Confirm the cardinality before trusting a row count.

✔ Use `COUNT(DISTINCT ...)` or `EXISTS` when duplicates would distort the answer.

✔ Include every column of a composite key in the condition.

✔ Keep relationship logic in `ON` even where `WHERE` would work.

---

# Interview Questions

## Basic

1. What does an `INNER JOIN` return?
2. Is `INNER` required?
3. Which rows does an inner join drop?

## Intermediate

4. How can an inner join return more rows than either table?
5. Why do `NULL` join keys never match?
6. How do you count customers, not orders, after joining them?

## Advanced

7. Why are `ON` and `WHERE` interchangeable for inner joins but not outer joins?
8. Why can an optimizer reorder inner joins but not outer joins?
9. What goes wrong when one column of a composite key is omitted from the condition?

---

# Hands-on Exercises

## Exercise 1

List every order with its customer's name and country.

---

## Exercise 2

Count how many distinct customers have placed at least one order, using a join, then using `EXISTS`.

---

## Exercise 3

Join `OrderItems` to `Inventory` on a composite key of product and warehouse.

---

## Exercise 4

Explain why an order whose `CustomerID` is `NULL` does not appear in an inner join, and give two ways to include it.

---

# Related Topics

- **07.02 — JOIN Syntax**
- **07.04 — LEFT JOIN (LEFT OUTER JOIN)**
- **07.11 — ON vs WHERE (Join Conditions and Filters)**
- **07.12 — NULL Handling in JOINs**
- **07.13 — Semi-Joins and Anti-Joins (EXISTS and NOT EXISTS)**
- **06.08 — NULL Handling in WHERE (Three-Valued Logic)**

---

# Summary

`INNER JOIN` keeps only the row pairs that satisfy the join condition, dropping unmatched rows on both sides and any row whose join key is `NULL`. It emits one row per matching pair, so a 1:N relationship repeats the "one" side and a missing composite-key column multiplies rows silently. Because unmatched rows are discarded anyway, predicates may sit in either `ON` or `WHERE` without changing an inner join's result—a freedom that disappears the moment the join becomes outer, and a good reason to keep relationship logic in `ON` regardless.
