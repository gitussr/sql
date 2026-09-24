---
title: "08.01 - Introduction to Aggregation and Grouping"
description: "Why aggregation exists, what a group is, how GROUP BY changes the grain of a result, whole-table versus grouped aggregation, the empty-input rule, and where grouping sits in the logical execution order."
chapter: 8
section: 8.01
category: Data Query Language (DQL)
difficulty: Beginner
readingTime: 30 min
lastUpdated: 2026-09-24
---

# 08.01 Introduction to Aggregation and Grouping

---

# Learning Objectives

After completing this section, you will be able to:

- Explain what an aggregate function does.
- Distinguish whole-table aggregation from grouped aggregation.
- Define the **grain** of a query result and say how `GROUP BY` changes it.
- Predict the result of an aggregate over an empty table, with and without `GROUP BY`.
- Explain why a grouped query cannot return individual row values.
- Place `GROUP BY` and `HAVING` in the logical execution order.

---

# Why Aggregation Exists

Tables store **facts**: one order, one payment, one login. Questions ask about **collections** of facts:

| Question | Fact table | Collection |
|----------|-----------|------------|
| How many orders today? | `Orders` | All of today's orders |
| Revenue per customer? | `Orders` | Each customer's orders |
| Average salary per department? | `Employees` | Each department's employees |
| Busiest hour of the day? | `Logins` | Logins in each hour |

No row in any of those tables contains the answer. The answer must be **computed** from many rows. That computation is aggregation.

---

# Whole-Table Aggregation

With no `GROUP BY`, an aggregate treats every row that survives `WHERE` as a single group and returns exactly one row.

```sql
SELECT
    COUNT(*)           AS OrderCount,
    SUM(TotalAmount)   AS Revenue,
    AVG(TotalAmount)   AS AverageOrder,
    MIN(OrderDate)     AS FirstOrder,
    MAX(OrderDate)     AS LastOrder
FROM Orders;
```

```text
Orders (5 rows)                         Result (1 row)
┌─────┬────────────┬────────┐           ┌────────────┬─────────┬──────────────┬────────────┬────────────┐
│ 101 │ 2026-01-05 │ 250.00 │           │ OrderCount │ Revenue │ AverageOrder │ FirstOrder │ LastOrder  │
│ 102 │ 2026-01-19 │  80.00 │  ──────→  ├────────────┼─────────┼──────────────┼────────────┼────────────┤
│ 103 │ 2026-02-02 │ 500.00 │           │ 5          │ 1010.00 │ 202.00       │ 2026-01-05 │ 2026-03-11 │
│ 104 │ 2026-02-20 │ 120.00 │           └────────────┴─────────┴──────────────┴────────────┴────────────┘
│ 105 │ 2026-03-11 │  60.00 │
└─────┴────────────┴────────┘
```

---

# Grouped Aggregation

`GROUP BY` partitions the rows into groups that share the same value of the grouping columns, then computes the aggregates once per group.

```sql
SELECT
    CustomerID,
    COUNT(*)         AS OrderCount,
    SUM(TotalAmount) AS Revenue
FROM Orders
GROUP BY CustomerID;
```

```text
Orders                               Groups                        Result
┌─────┬──────┬────────┐          ┌──────────────────────┐      ┌──────┬───────┬─────────┐
│ 101 │ 1    │ 250.00 │ ─┐       │ CustomerID = 1       │      │ Cust │ Count │ Revenue │
│ 102 │ 1    │  80.00 │ ─┴─────→ │   250.00, 80.00      │ ───→ │ 1    │ 2     │ 330.00  │
│ 103 │ 2    │ 500.00 │ ─┐       ├──────────────────────┤      │ 2    │ 2     │ 620.00  │
│ 104 │ 2    │ 120.00 │ ─┴─────→ │ CustomerID = 2       │ ───→ │ 3    │ 1     │  60.00  │
│ 105 │ 3    │  60.00 │ ───────→ │   500.00, 120.00     │      └──────┴───────┴─────────┘
└─────┴──────┴────────┘          ├──────────────────────┤
                                 │ CustomerID = 3       │ ───→
                                 │   60.00              │
                                 └──────────────────────┘
```

The rule: **one output row per distinct combination of the grouping columns.**

---

# The Grain of a Result

The **grain** is what one row of a result represents. Naming it is the single most useful habit in aggregate SQL.

| Query | Grain |
|-------|-------|
| `SELECT * FROM Orders` | One row per order |
| `SELECT ... FROM Orders GROUP BY CustomerID` | One row per customer (who has orders) |
| `SELECT ... FROM Orders GROUP BY CustomerID, Status` | One row per customer **and** status |
| `SELECT COUNT(*) FROM Orders` | One row for the whole table |

Once you know the grain, every column in the `SELECT` list must be a property of that grain:

```text
Grain: one row per customer

CustomerID          ✅ identifies the group
SUM(TotalAmount)    ✅ one value per group
COUNT(*)            ✅ one value per group
OrderID             ❌ a customer has many orders — which one?
OrderDate           ❌ same problem
```

That is the SELECT list rule, covered in depth in Section 08.07.

---

# Detail Disappears

A grouped result has no individual rows left in it. This query is rejected by standard SQL:

```sql
-- ❌ OrderID is neither grouped nor aggregated
SELECT CustomerID, OrderID, SUM(TotalAmount)
FROM Orders
GROUP BY CustomerID;
```

If you need a representative detail value, you must say which one:

```sql
SELECT
    CustomerID,
    MIN(OrderID)     AS FirstOrderID,
    MAX(OrderDate)   AS LatestOrderDate,
    SUM(TotalAmount) AS Revenue
FROM Orders
GROUP BY CustomerID;
```

If you need **every** detail row plus a group total next to it, you do not want `GROUP BY` at all—you want a window function (Chapter 11), which aggregates without collapsing rows.

---

# The Empty-Input Rule

Aggregation over no rows behaves differently with and without `GROUP BY`. This surprises almost everyone once.

```sql
-- No rows match
SELECT COUNT(*), SUM(TotalAmount)
FROM Orders
WHERE OrderDate > DATE '2099-01-01';
```

```text
┌──────────┬──────────────────┐
│ COUNT(*) │ SUM(TotalAmount) │
├──────────┼──────────────────┤
│ 0        │ NULL             │     ← exactly one row
└──────────┴──────────────────┘
```

```sql
-- Same filter, with GROUP BY
SELECT CustomerID, COUNT(*), SUM(TotalAmount)
FROM Orders
WHERE OrderDate > DATE '2099-01-01'
GROUP BY CustomerID;
```

```text
(no rows)                               ← zero groups, zero rows
```

| Query shape | Input rows | Output rows |
|-------------|-----------|-------------|
| Aggregate, no `GROUP BY` | 0 | **1** (`COUNT` = 0, others `NULL`) |
| Aggregate, with `GROUP BY` | 0 | **0** |

Application code that reads "the first row" of a whole-table aggregate can rely on it existing. Code reading a grouped result cannot.

---

# Groups Only Exist for Data That Exists

`GROUP BY CustomerID` over `Orders` produces a row for every customer **who has orders**. Customers with none are not "a group with zero"—they are absent.

```text
Customers: Ada, Grace, Linus
Orders:    Ada ×2, Grace ×2

GROUP BY CustomerID over Orders  →  Ada 2, Grace 2        (Linus missing)
```

To report zeros, start from the table that defines the full set and outer-join the facts:

```sql
SELECT
    c.CustomerID,
    c.CustomerName,
    COUNT(o.OrderID) AS OrderCount     -- counts matches only, so 0 for Linus
FROM Customers AS c
LEFT JOIN Orders AS o
    ON o.CustomerID = c.CustomerID
GROUP BY c.CustomerID, c.CustomerName;
```

`COUNT(o.OrderID)` rather than `COUNT(*)` is essential here; Section 08.03 explains why.

---

# Visual Representation

```text
             WHERE                GROUP BY               HAVING
rows ─────────────────→ rows ─────────────────→ groups ─────────────→ groups
      filter each row          collapse rows           filter each group
                               into groups,
                               compute aggregates

        grain: fact                                 grain: group
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE
4. GROUP BY    ← Rows collapse into groups here
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

Everything before step 4 works on individual rows. Everything from step 4 onwards works on groups—which is why `SELECT` may only mention grouping columns and aggregates.

---

# How the DBMS Executes This

```text
SELECT CustomerID, SUM(TotalAmount)
FROM Orders
GROUP BY CustomerID

↓

Read Orders row by row

↓

For each row:
    find (or create) the accumulator for its CustomerID
    add TotalAmount to that accumulator's running sum

↓

Emit one row per accumulator
```

Aggregation needs only one pass over the data and keeps one small accumulator per group—not the group's rows. That is why summing a billion rows into a hundred groups needs very little memory.

---

# 🔬 Engine Deep Dive

Engines split every aggregate into an **accumulate** step and a **finalise** step. `SUM` accumulates a running total and finalises by returning it; `AVG` accumulates a sum and a count and finalises by dividing. This split is what makes parallel aggregation possible: each worker accumulates partial states for its share of the rows, and a final step combines them—sum the sums, sum the counts, then divide.

---

# 🏗️ Architecture Insight

Every summary table, dashboard tile and KPI is a grouped query with a declared grain. When two reports disagree, the cause is almost always a grain mismatch: one counts orders per customer, the other counts customers per order date. Documenting the grain alongside every summary is cheap and prevents weeks of reconciliation.

---

# ⚡ Performance Tip

The number of **groups**, not rows, determines the memory an aggregation needs. Grouping ten million rows by country is cheap; grouping them by `OrderID` builds ten million accumulators to produce a result no smaller than the input. If a `GROUP BY` returns nearly as many rows as it reads, check whether you needed a grouped query at all.

---

# 🌍 Production Consideration

Dashboards that "go blank" on a quiet day often read a grouped query that returned zero rows. If a screen must always show a value, either use a whole-table aggregate (which always returns one row) or drive the query from a calendar or dimension table with an outer join so that empty periods appear as zeros.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Whole-table aggregate returns 1 row on empty input | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `GROUP BY` on empty input returns 0 rows | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ungrouped column in `SELECT` rejected | ✅ | ✅ | ✅ (`ONLY_FULL_GROUP_BY`) | ✅ | ✅ | ❌ (arbitrary value) |
| `GROUP BY` implies sorted output | ❌ | ❌ | ❌ (8.0+) | ❌ | ❌ | ❌ |

> **Portability Tip:** MySQL before 8.0 sorted grouped results implicitly and before 5.7.5 accepted ungrouped columns by default. Code written against those versions may silently depend on both behaviours; always add `ORDER BY` and list every non-aggregated column.

---

# Common Mistakes

### Mistake 1

Selecting a detail column (`OrderID`) in a query grouped at a coarser grain.

---

### Mistake 2

Expecting a `GROUP BY` query to return a zero-count row for categories that have no data.

---

### Mistake 3

Assuming a grouped query always returns at least one row.

---

### Mistake 4

Using `GROUP BY` where a window function is needed—to show detail rows **and** their group total.

---

# Best Practices

✔ Write the intended grain as a comment above every grouped query.

✔ Drive "include zeros" reports from the dimension table with a `LEFT JOIN`.

✔ Treat whole-table and grouped aggregates as having different empty-input behaviour.

✔ Use `MIN`/`MAX` to pick a representative value deliberately, never an ungrouped column.

---

# Interview Questions

## Basic

1. What does an aggregate function do?
2. What does `GROUP BY` do to the number of rows?
3. What does `SELECT COUNT(*) FROM T` return when `T` is empty?

## Intermediate

4. What is the grain of a query, and why does it matter for aggregation?
5. Why can't you select `OrderID` in a query grouped by `CustomerID`?
6. How do you include customers with no orders in a per-customer count?

## Advanced

7. Why does a whole-table aggregate return one row on empty input while a grouped one returns none?
8. How does splitting aggregates into accumulate and finalise steps enable parallel execution?
9. When should you use a window function instead of `GROUP BY`?

---

# Hands-on Exercises

## Exercise 1

Return the number of orders, total revenue and average order value for the whole `Orders` table.

---

## Exercise 2

Return the same three figures per customer, and state the grain of the result.

---

## Exercise 3

Run a whole-table aggregate and the same query with `GROUP BY` on a filter that matches nothing. Record the number of rows each returns.

---

## Exercise 4

List every customer with their order count, including customers who have never ordered.

---

# Related Topics

- **08.02 — Aggregate Functions (COUNT, SUM, AVG, MIN, MAX)**
- **08.05 — GROUP BY Syntax and Semantics**
- **08.07 — The SELECT List Rule (Functional Dependency)**
- **07.04 — LEFT JOIN (LEFT OUTER JOIN)**
- **05.07 — DISTINCT**
- **11.xx — Window Functions**

---

# Summary

Aggregation computes one value from many rows. Without `GROUP BY`, all surviving rows form a single group and the query returns exactly one row—even when no rows survive. With `GROUP BY`, rows sharing the same grouping values collapse into one output row each, and groups exist only for data that exists. Grouping changes the grain of the result, so detail values vanish and every selected column must be a grouping column or an aggregate; naming the grain before writing the query is the habit that prevents most aggregation errors.
