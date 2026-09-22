---
title: "07.10 - Joining Multiple Tables"
description: "Joining three or more tables: chain and star shapes, how join order affects readability and plans, mixing inner and outer joins safely, row multiplication across two 1:N branches, the fan-out aggregate trap, and bridge tables for many-to-many relationships."
chapter: 7
section: 7.10
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 40 min
lastUpdated: 2026-09-22
---

# 07.10 Joining Multiple Tables

---

# Learning Objectives

After completing this section, you will be able to:

- Join three or more tables in a readable, correct order.
- Recognise chain, star and snowflake join shapes.
- Mix inner and outer joins without losing preserved rows.
- Predict row multiplication across two 1:N branches.
- Avoid the fan-out trap that double-counts aggregates.
- Traverse a many-to-many relationship through a junction table.

---

# Joins Chain Left to Right

Each `JOIN` combines the accumulated result so far with the next table:

```sql
SELECT
    c.CustomerName,
    o.OrderID,
    p.ProductName,
    oi.Quantity
FROM Customers AS c
INNER JOIN Orders     AS o  ON o.CustomerID = c.CustomerID
INNER JOIN OrderItems AS oi ON oi.OrderID   = o.OrderID
INNER JOIN Products   AS p  ON p.ProductID  = oi.ProductID;
```

```text
Customers
   ⋈ Orders           → customers with orders
      ⋈ OrderItems    → one row per order line
         ⋈ Products   → product details per line
```

The result's **grain** is one row per order item. Every customer- and order-level column is repeated once per line—a fact that matters enormously for aggregation.

---

# Join Shapes

## Chain (snowflake)

```text
Customers ── Orders ── OrderItems ── Products
```

Each table connects to the next. Typical of hierarchical drill-down.

## Star

```text
            Customers
                │
  Employees ── Orders ── ShippingMethods
                │
            Regions
```

One central fact table joined to several dimension tables. Typical of reporting and analytics.

## Branching (two 1:N children)

```text
            Orders
           ╱      ╲
   OrderItems    Payments
```

This is the shape that multiplies rows—see below.

---

# Join Order and the Optimizer

For inner joins, the written order does **not** determine execution order. These produce identical results and usually the same plan:

```sql
FROM Customers c
JOIN Orders     o  ON o.CustomerID = c.CustomerID
JOIN OrderItems oi ON oi.OrderID   = o.OrderID;
```

```sql
FROM OrderItems oi
JOIN Orders     o  ON o.OrderID    = oi.OrderID
JOIN Customers  c  ON c.CustomerID = o.CustomerID;
```

The optimizer evaluates candidate orders by estimated cost and picks one. What the written order *does* control is readability, so order tables the way a reader thinks about them—usually from the main entity outward.

With outer joins the order is **semantic**, not stylistic: `A LEFT JOIN B LEFT JOIN C` preserves `A`, and moving `C` earlier changes what is preserved.

---

# Mixing Inner and Outer Joins

The rule from Section 07.04 generalises: **an inner join after an outer join cancels the preservation.**

```sql
-- ❌ Customers with no orders disappear at the third join
FROM Customers  AS c
LEFT  JOIN Orders     AS o  ON o.CustomerID = c.CustomerID
INNER JOIN OrderItems AS oi ON oi.OrderID   = o.OrderID;
```

```text
After LEFT JOIN:     Linus │ NULL(OrderID)
INNER JOIN on NULL:  no match → Linus removed
```

Three correct alternatives:

```sql
-- ✅ 1. Keep the chain outer
FROM Customers AS c
LEFT JOIN Orders     AS o  ON o.CustomerID = c.CustomerID
LEFT JOIN OrderItems AS oi ON oi.OrderID   = o.OrderID;
```

```sql
-- ✅ 2. Group the inner join, then attach it
FROM Customers AS c
LEFT JOIN (
    Orders AS o
    INNER JOIN OrderItems AS oi ON oi.OrderID = o.OrderID
) ON o.CustomerID = c.CustomerID;
```

```sql
-- ✅ 3. Pre-aggregate in a subquery, then join once
FROM Customers AS c
LEFT JOIN (
    SELECT o.CustomerID, SUM(oi.Quantity) AS total_items
    FROM Orders AS o
    INNER JOIN OrderItems AS oi ON oi.OrderID = o.OrderID
    GROUP BY o.CustomerID
) AS agg ON agg.CustomerID = c.CustomerID;
```

Option 3 is usually the best of the three: it states the grain explicitly and avoids fan-out entirely.

---

# The Fan-Out Trap

Joining one parent to **two** 1:N children multiplies their rows.

```text
Order 101
  OrderItems: 3 rows
  Payments:   2 rows

FROM Orders
JOIN OrderItems ON ...
JOIN Payments   ON ...

→ 3 × 2 = 6 rows
```

```text
item_1 × pay_1     item_1 × pay_2
item_2 × pay_1     item_2 × pay_2
item_3 × pay_1     item_3 × pay_2
```

Every item amount is now counted twice, and every payment amount three times:

```sql
-- ❌ Both sums are inflated
SELECT
    o.OrderID,
    SUM(oi.Quantity * oi.UnitPrice) AS item_total,   -- × 2
    SUM(p.Amount)                   AS paid_total    -- × 3
FROM Orders AS o
JOIN OrderItems AS oi ON oi.OrderID = o.OrderID
JOIN Payments   AS p  ON p.OrderID  = o.OrderID
GROUP BY o.OrderID;
```

The fix is to aggregate each branch **before** joining:

```sql
-- ✅ Each branch reduced to one row per order first
SELECT
    o.OrderID,
    items.item_total,
    pays.paid_total
FROM Orders AS o
LEFT JOIN (
    SELECT OrderID, SUM(Quantity * UnitPrice) AS item_total
    FROM OrderItems
    GROUP BY OrderID
) AS items ON items.OrderID = o.OrderID
LEFT JOIN (
    SELECT OrderID, SUM(Amount) AS paid_total
    FROM Payments
    GROUP BY OrderID
) AS pays ON pays.OrderID = o.OrderID;
```

A useful habit: after writing a multi-table join, say the grain out loud—"one row per order item"—and check that every aggregate is consistent with it.

---

# Many-to-Many via a Junction Table

A many-to-many relationship is two 1:N joins through a junction (bridge) table:

```text
Students ──< Enrolments >── Courses
```

```sql
SELECT
    s.StudentName,
    c.CourseName,
    e.Grade
FROM Students AS s
INNER JOIN Enrolments AS e ON e.StudentID = s.StudentID
INNER JOIN Courses    AS c ON c.CourseID  = e.CourseID;
```

The junction table is never optional in the middle of the chain: skipping it would leave no way to match students to courses. Its own columns—`Grade`, `EnrolledAt`—belong to the relationship rather than to either entity.

---

# Keeping Long Joins Readable

```sql
SELECT
    c.CustomerName,
    o.OrderID,
    o.OrderDate,
    p.ProductName,
    oi.Quantity,
    oi.UnitPrice
FROM Customers AS c
INNER JOIN Orders     AS o  ON o.CustomerID = c.CustomerID
INNER JOIN OrderItems AS oi ON oi.OrderID   = o.OrderID
INNER JOIN Products   AS p  ON p.ProductID  = oi.ProductID
LEFT  JOIN Discounts  AS d  ON d.ProductID  = p.ProductID
                           AND d.ValidFrom <= o.OrderDate
                           AND d.ValidTo    > o.OrderDate
WHERE o.OrderDate >= DATE '2026-01-01'
ORDER BY o.OrderDate DESC;
```

Conventions that scale:

- Start from the entity the result is about.
- One table per line; align the `ON` conditions.
- Inner joins first, outer joins last, where the semantics allow.
- Compound conditions indented under their join.
- Filters in `WHERE`, below every join.
- Break a query above roughly six tables into CTEs with meaningful names.

---

# Visual Representation

```text
Grain of the result after each join:

FROM Customers                    → one row per customer
  JOIN Orders                     → one row per order
    JOIN OrderItems               → one row per order line
      JOIN Products               → one row per order line (N:1, no change)
        LEFT JOIN Discounts       → one row per line per matching discount ⚠

Every 1:N join multiplies. Every N:1 join does not.
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN    ← all joins complete before anything else runs
3. WHERE
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

`GROUP BY` sees the fully multiplied result, which is precisely why fan-out corrupts aggregates rather than being corrected by them.

---

# How the DBMS Executes This

```text
Four tables → the optimizer considers many possible orders

↓

Cost each candidate using statistics:
    estimated rows after each join
    available indexes
    algorithm per join

↓

Pick the cheapest plan, for example:

    Orders (filtered by date)
        ⋈ index seek OrderItems
            ⋈ index seek Products
                ⋈ index seek Customers

↓

Execute in that order
```

The number of possible orders grows factorially, so optimizers limit their search. Beyond roughly eight to twelve tables, most engines stop exploring exhaustively and rely on heuristics—one practical reason to split very large queries into CTEs or temporary tables.

---

# 🔬 Engine Deep Dive

Row-count estimates compound. If each of four joins is estimated with 20% error, the final estimate can be off by a factor of two or more, and a plan chosen for 1,000 rows may be executed against 100,000. This is why stale statistics hurt multi-table joins far more than single-table queries, and why comparing estimated with actual rows is the first diagnostic step for a slow join.

---

# 🏗️ Architecture Insight

Every join in a query is a claim about the schema's relationships. A query that joins six tables to answer one question is usually reading a well-normalized model correctly—but if the *same* six-table join appears in twenty places, that is a signal to publish it once, as a view or a materialized aggregate, rather than re-deriving it everywhere.

---

# ⚡ Performance Tip

Reduce before you multiply. Filtering and pre-aggregating a branch in a subquery gives the optimizer a much smaller input to join, and it removes fan-out at the same time. Two correct patterns usually beat one clever query.

---

# 🌍 Production Consideration

Fan-out is the most expensive silent bug in reporting: totals that are exactly 2× or 3× the correct value, discovered weeks later by someone reconciling against another system. Validating one known order's total against the source data—by hand, once—catches it immediately.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Tables per query | — | practical limit | 61 | 256 | practical limit | 64 |
| Parenthesised join groups | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Join order hints | ❌ | ❌ | `STRAIGHT_JOIN` | `FORCE ORDER` | `ORDERED` | ❌ |
| Optimizer search limit | — | `join_collapse_limit` | heuristic | heuristic | heuristic | heuristic |

> **Portability Tip:** MySQL's 61-table limit is the lowest among major databases and applies to views expanded inline as well, so a query joining several multi-table views can hit it unexpectedly.

---

# Common Mistakes

### Mistake 1

An inner join after an outer join, discarding the preserved rows.

---

### Mistake 2

Joining two 1:N children of the same parent and aggregating the result.

---

### Mistake 3

Aggregating without checking the result's grain.

---

### Mistake 4

Adding tables to a query "because the columns are needed" without checking the effect on row count.

---

# Best Practices

✔ Say the grain out loud after every join.

✔ Pre-aggregate 1:N branches before joining them together.

✔ Keep the chain outer once it has become outer.

✔ Start from the entity the result is about.

✔ Split queries beyond about six tables into named CTEs.

✔ Verify totals against a known value when a join is added.

---

# Interview Questions

## Basic

1. How do you join three tables?
2. Does the written order of inner joins affect the result?
3. What is a junction table?

## Intermediate

4. What happens when an inner join follows a left join?
5. What is fan-out, and when does it occur?
6. How do you aggregate two 1:N branches correctly?

## Advanced

7. Why does the written order matter for outer joins but not inner joins?
8. Why do estimation errors compound in multi-table joins?
9. Why do optimizers stop searching exhaustively beyond a certain number of tables?

---

# Hands-on Exercises

## Exercise 1

Join customers, orders, order items and products, and state the grain of the result.

---

## Exercise 2

List every customer with their order items, keeping customers who have never ordered.

---

## Exercise 3

Given orders with both items and payments, write a query returning the correct item total and paid total per order.

---

## Exercise 4

List students, their courses and grades through the enrolments junction table.

---

# Related Topics

- **07.03 — INNER JOIN**
- **07.04 — LEFT JOIN (LEFT OUTER JOIN)**
- **07.11 — ON vs WHERE (Join Conditions and Filters)**
- **07.15 — JOIN Performance and Index Strategy**
- **03.08.04 — Junction (Bridge) Tables**
- **08.xx — GROUP BY and HAVING**

---

# Summary

Multi-table joins chain left to right, each one combining the accumulated result with the next table, and the written order matters semantically for outer joins even though inner joins may be reordered freely by the optimizer. An inner join placed after an outer join cancels the preservation; keeping the chain outer, parenthesising the inner pair, or pre-aggregating in a subquery all fix it. The subtler hazard is fan-out: joining two 1:N children of the same parent multiplies their rows and silently inflates every aggregate, so each branch should be reduced to one row per parent before the branches meet. Naming the grain of the result after each join is the habit that prevents both problems.
