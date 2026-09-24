---
title: "08.11 - Aggregating Across JOINs (Fan-Out and Pre-Aggregation)"
description: "Aggregating over joined tables without double counting: how 1:N joins multiply rows, the fan trap and chasm trap, why DISTINCT is not a fix, pre-aggregating each branch before joining, correlated subqueries, and verifying totals."
chapter: 8
section: 8.11
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 40 min
lastUpdated: 2026-09-24
---

# 08.11 Aggregating Across JOINs (Fan-Out and Pre-Aggregation)

---

# Learning Objectives

After completing this section, you will be able to:

- Predict when a join will inflate an aggregate.
- Recognise the fan trap and the chasm trap.
- Explain why `SUM(DISTINCT ...)` does not fix double counting.
- Pre-aggregate each 1:N branch before joining it.
- Choose between derived tables, CTEs and correlated subqueries for per-entity totals.
- Verify that a joined aggregate reconciles with its source.

---

# The Problem: Joins Multiply Rows

Section 07.10 showed that a 1:N join repeats the "one" side once per match. Any aggregate over a column of the "one" side is then computed over repeated values.

```sql
-- ❌ Order totals inflated by the number of items
SELECT
    o.CustomerID,
    SUM(o.TotalAmount) AS Revenue,
    SUM(oi.Quantity)   AS UnitsSold
FROM Orders AS o
INNER JOIN OrderItems AS oi ON oi.OrderID = o.OrderID
GROUP BY o.CustomerID;
```

```text
Orders                       OrderItems
┌─────┬──────┬────────┐      ┌─────┬─────┬─────┐
│ 101 │ 1    │ 250.00 │      │ 101 │ P1  │ 2   │
└─────┴──────┴────────┘      │ 101 │ P2  │ 1   │
                             │ 101 │ P3  │ 4   │
                             └─────┴─────┴─────┘

Joined rows
┌─────┬──────┬────────┬─────┬─────┐
│ 101 │ 1    │ 250.00 │ P1  │ 2   │
│ 101 │ 1    │ 250.00 │ P2  │ 1   │   ← 250.00 repeated three times
│ 101 │ 1    │ 250.00 │ P3  │ 4   │
└─────┴──────┴────────┴─────┴─────┘

SUM(TotalAmount) = 750.00   ❌  (true revenue: 250.00)
SUM(Quantity)    = 7        ✅
```

The rule: **an aggregate is correct only over columns of the table at the join's finest grain.** After joining `Orders` to `OrderItems`, the grain is one row per item, so item columns sum correctly and order columns do not.

---

# The Fan Trap

The **fan trap** is the case above: aggregating a measure from the "one" side of a 1:N join.

```text
     Orders (measure: TotalAmount)
        │ 1
        │
        │ N
     OrderItems
```

Fixes, in order of preference:

1. Aggregate the measure **before** joining (or without the join at all).
2. Use the measure at the correct grain—sum item-level amounts instead of the order-level total.

```sql
-- ✅ Revenue from item lines: one value per item, no repetition
SELECT
    o.CustomerID,
    SUM(oi.Quantity * oi.UnitPrice) AS Revenue,
    SUM(oi.Quantity)                AS UnitsSold
FROM Orders AS o
INNER JOIN OrderItems AS oi ON oi.OrderID = o.OrderID
GROUP BY o.CustomerID;
```

---

# The Chasm Trap

The **chasm trap** occurs when one table has two independent 1:N children, and both are joined at once:

```text
                Orders
              1 /    \ 1
               /      \
            N /        \ N
      OrderItems      Payments
```

```sql
-- ❌ Each item is paired with each payment
SELECT
    o.OrderID,
    SUM(oi.Quantity * oi.UnitPrice) AS ItemsTotal,
    SUM(p.Amount)                   AS PaidTotal
FROM Orders AS o
LEFT JOIN OrderItems AS oi ON oi.OrderID = o.OrderID
LEFT JOIN Payments   AS p  ON p.OrderID  = o.OrderID
GROUP BY o.OrderID;
```

```text
Order 101: 3 items, 2 payments

Joined rows = 3 × 2 = 6

ItemsTotal   each item counted 2 times   ❌
PaidTotal    each payment counted 3 times ❌
```

Both totals are wrong, and neither is wrong by a constant factor—each order is inflated by its own item and payment counts. This is why chasm-trap bugs survive testing on small data where most orders have one payment.

---

# Why DISTINCT Is Not the Fix

```sql
-- ❌ Looks fixed, is not
SELECT o.OrderID, SUM(DISTINCT p.Amount) AS PaidTotal
...
```

`DISTINCT` removes duplicate **values**, not duplicate **rows**. Two genuine payments of 50.00 on the same order are different facts with equal values; `SUM(DISTINCT ...)` counts them once and under-reports by 50.00.

`COUNT(DISTINCT p.PaymentID)` *is* safe—keys are unique by definition—but it only helps for counting, not for summing measures.

---

# The Fix: Pre-Aggregate Each Branch

Aggregate each child to the parent's grain first, then join the one-row-per-parent results:

```sql
SELECT
    o.OrderID,
    COALESCE(i.ItemsTotal, 0) AS ItemsTotal,
    COALESCE(p.PaidTotal, 0)  AS PaidTotal
FROM Orders AS o
LEFT JOIN (
    SELECT OrderID, SUM(Quantity * UnitPrice) AS ItemsTotal
    FROM OrderItems
    GROUP BY OrderID
) AS i ON i.OrderID = o.OrderID
LEFT JOIN (
    SELECT OrderID, SUM(Amount) AS PaidTotal
    FROM Payments
    GROUP BY OrderID
) AS p ON p.OrderID = o.OrderID;
```

```text
Orders (1 per order)
   ⋈ items summary    (1 per order)  → still 1 per order
   ⋈ payments summary (1 per order)  → still 1 per order
```

Every join is now 1:1, so nothing is multiplied. The same shape reads well as common table expressions:

```sql
WITH items AS (
    SELECT OrderID, SUM(Quantity * UnitPrice) AS ItemsTotal
    FROM OrderItems
    GROUP BY OrderID
),
pays AS (
    SELECT OrderID, SUM(Amount) AS PaidTotal
    FROM Payments
    GROUP BY OrderID
)
SELECT
    o.OrderID,
    COALESCE(items.ItemsTotal, 0) AS ItemsTotal,
    COALESCE(pays.PaidTotal, 0)   AS PaidTotal,
    COALESCE(items.ItemsTotal, 0) - COALESCE(pays.PaidTotal, 0) AS Outstanding
FROM Orders AS o
LEFT JOIN items ON items.OrderID = o.OrderID
LEFT JOIN pays  ON pays.OrderID  = o.OrderID;
```

---

# Correlated Subqueries in SELECT

For a handful of parent rows, a scalar subquery per total is also correct:

```sql
SELECT
    o.OrderID,
    (SELECT COALESCE(SUM(oi.Quantity * oi.UnitPrice), 0)
       FROM OrderItems AS oi WHERE oi.OrderID = o.OrderID) AS ItemsTotal,
    (SELECT COALESCE(SUM(p.Amount), 0)
       FROM Payments AS p WHERE p.OrderID = o.OrderID)     AS PaidTotal
FROM Orders AS o
WHERE o.OrderID = 101;
```

Each subquery sees only its own table, so no fan-out is possible. Over many parent rows, engines may execute it once per row; the pre-aggregated join is usually faster for bulk reports. `LATERAL` / `CROSS APPLY` offer a third form that is covered with subqueries in Chapter 09.

---

# Rolling Up Through Several Levels

Aggregate from the finest grain upwards, one level at a time:

```sql
-- Revenue per customer from item lines, with order count
SELECT
    o.CustomerID,
    COUNT(*)            AS Orders,          -- one row per order here
    SUM(t.OrderRevenue) AS Revenue
FROM Orders AS o
INNER JOIN (
    SELECT OrderID, SUM(Quantity * UnitPrice) AS OrderRevenue
    FROM OrderItems
    GROUP BY OrderID
) AS t ON t.OrderID = o.OrderID
GROUP BY o.CustomerID;
```

Because the derived table is at the order grain, `COUNT(*)` counts orders—not items—and the order-level join does not multiply anything.

---

# Verifying Joined Aggregates

Two checks catch almost every fan-out bug:

```sql
-- 1. Row count: did the join change the grain?
SELECT COUNT(*) FROM Orders;                                      -- 10,000
SELECT COUNT(*) FROM Orders o JOIN OrderItems oi ON oi.OrderID = o.OrderID;  -- 31,420 ← grain changed

-- 2. Reconciliation: does the report total match the source total?
SELECT SUM(TotalAmount) FROM Orders WHERE OrderDate >= DATE '2026-01-01';
-- compare with SUM(Revenue) over the report's output
```

If the report total exceeds the source total, a join has multiplied rows. If it is lower, an inner join has dropped rows or a filter has moved.

---

# Visual Representation

```text
❌ join, then aggregate                     ✅ aggregate, then join

Orders ─┬─ Items (N)                        Items ──GROUP BY OrderID──┐
        └─ Payments (N)                                               ├─⋈─ Orders
                 │                          Payments ─GROUP BY OrderID┘
           N × N rows per order                     1 : 1 : 1 per order
                 │                                        │
           GROUP BY OrderID                          no GROUP BY needed
           (totals inflated)                         (totals exact)
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN        ← rows are multiplied here …
3. WHERE
4. GROUP BY    ← … and aggregated here, too late to undo it
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

Grouping always sees the fully joined, fully multiplied rows. Pre-aggregation moves a `GROUP BY` **inside** the `FROM` clause, so it runs before the join that would multiply.

---

# How the DBMS Executes This

```text
Pre-aggregated plan

Hash Left Join (o.OrderID = pays.OrderID)
  ├─ Hash Left Join (o.OrderID = items.OrderID)
  │    ├─ Seq Scan Orders
  │    └─ HashAggregate (OrderID)  ← items summary
  │         └─ Seq Scan OrderItems
  └─ HashAggregate (OrderID)       ← payments summary
       └─ Seq Scan Payments
```

Each child table is read once and reduced to one row per order before joining. The intermediate results are no larger than `Orders`, which usually makes the pre-aggregated query faster as well as correct.

---

# 🔬 Engine Deep Dive

Optimizers can sometimes perform **eager aggregation**—pushing a `GROUP BY` below a join automatically—when they can prove it does not change the result. Oracle's group-by placement and SQL Server's local (partial) aggregation are examples. They will never do it when the rewrite would change the answer, which means they cannot rescue a query whose logic is already wrong. Writing the pre-aggregation yourself is both the correctness fix and a plan the optimizer does not need to discover.

---

# 🏗️ Architecture Insight

Business-intelligence tools model this problem explicitly: each fact table is aggregated to a shared dimension before facts are combined—"drill across" rather than joining facts directly. The same principle applies in hand-written SQL: **never join two fact tables to each other at their own grain; aggregate each to a common grain first.**

---

# ⚡ Performance Tip

Pre-aggregating a large child table before joining reduces the rows the join processes from the child's size to the parent's. When a report needs only a few parents, filter the derived table as well—`WHERE OrderID IN (...)` inside it—or use a correlated subquery or `LATERAL` join, so the engine does not summarise the whole child table.

---

# 🌍 Production Consideration

Fan-out bugs typically appear after a schema change, not when the query is written: a lookup that used to be 1:1 gains a second row (a customer with two addresses, a product in two categories), and every total that joined through it doubles for the affected rows. Unique constraints on the "one" side of every join used in reporting are the cheapest protection.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Derived tables with `GROUP BY` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `WITH` (CTE) | ✅ | ✅ | ✅ (8.0+) | ✅ | ✅ | ✅ (3.8.3+) |
| Scalar subquery in `SELECT` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `LATERAL` / `APPLY` | ✅ (`LATERAL`) | ✅ | ✅ (8.0.14+) | ✅ (`APPLY`) | ✅ | ❌ |

> **Portability Tip:** Derived tables with `GROUP BY`, joined back to the parent, work on every engine and every version. CTEs are equivalent and more readable where available.

---

# Common Mistakes

### Mistake 1

Summing an order-level amount after joining to order items.

---

### Mistake 2

Joining two independent child tables and aggregating both.

---

### Mistake 3

"Fixing" inflated totals with `SUM(DISTINCT ...)`.

---

### Mistake 4

Counting parents with `COUNT(*)` after a join to children.

---

### Mistake 5

Never reconciling the report total against the source table.

---

# Best Practices

✔ Name the grain after every join.

✔ Aggregate each 1:N branch to the parent's grain before joining.

✔ Sum measures only from the table at the finest grain of the query.

✔ Use `COUNT(DISTINCT key)` to count parents after a join.

✔ Reconcile totals and row counts whenever a join is added to a report.

---

# Interview Questions

## Basic

1. Why can joining `Orders` to `OrderItems` inflate `SUM(Orders.TotalAmount)`?
2. What is the grain of `Orders` joined to `OrderItems`?
3. Which columns can be summed safely after that join?

## Intermediate

4. What is the fan trap?
5. What is the chasm trap, and why are both totals wrong?
6. Why doesn't `SUM(DISTINCT ...)` fix double counting?

## Advanced

7. How do you compute items total and paid total per order in one query?
8. When is a correlated subquery preferable to a pre-aggregated join?
9. What schema change most often introduces fan-out into existing reports?

---

# Hands-on Exercises

## Exercise 1

Write a query that inflates revenue by joining `Orders` to `OrderItems`, then fix it two ways.

---

## Exercise 2

For each order, return its items total, paid total and outstanding balance using pre-aggregated CTEs.

---

## Exercise 3

Return revenue and order count per customer, computing revenue from item lines.

---

## Exercise 4

Write the two reconciliation queries for your report from Exercise 3.

---

# Related Topics

- **07.10 — Joining Multiple Tables**
- **07.16 — Common JOIN Mistakes & Best Practices**
- **08.03 — COUNT Variants**
- **08.07 — The SELECT List Rule (Functional Dependency)**
- **09.xx — Subqueries**

---

# Summary

A 1:N join repeats the parent's rows once per child, so any aggregate over a parent column is inflated (the fan trap), and joining two independent children multiplies both (the chasm trap). `SUM(DISTINCT ...)` hides the symptom while introducing a new error. The reliable fix is to aggregate each child to the parent's grain before joining—in a derived table, a CTE or a scalar subquery—so every join is 1:1. Naming the grain after each join, summing only at the finest grain, and reconciling report totals against the source catch the remaining cases.
