---
title: "11.10 - Top-N per Group, Deduplication and QUALIFY"
description: "Filtering on window results: the derived-table pattern, top-N per group with and without ties, latest row per key, deleting duplicates while keeping one, pagination with ROW_NUMBER, the QUALIFY clause and its availability, and comparisons with LATERAL, correlated subqueries and GROUP BY."
chapter: 11
section: 11.10
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 35 min
lastUpdated: 2026-09-25
---

# 11.10 Top-N per Group, Deduplication and QUALIFY

---

# Learning Objectives

After completing this section, you will be able to:

- Filter on window function results with a derived table or CTE.
- Return the top N rows per group, with or without ties.
- Return the latest row per key.
- Find and delete duplicate rows while keeping one.
- Use `QUALIFY` on engines that support it.
- Choose between window, `LATERAL`, correlated subquery and `GROUP BY` solutions.

---

# The Filtering Pattern

Window functions are computed after `WHERE` and `HAVING` (Section 11.01), so they cannot be filtered there. Compute them in an inner query; filter in the outer one:

```sql
SELECT *
FROM (
    SELECT o.*,
           ROW_NUMBER() OVER (PARTITION BY o.CustomerID
                              ORDER BY o.OrderDate DESC, o.OrderID DESC) AS rn
    FROM Orders AS o
) AS t
WHERE t.rn = 1;
```

The same with a common table expression, which many find easier to read:

```sql
WITH Ranked AS (
    SELECT o.*,
           ROW_NUMBER() OVER (PARTITION BY o.CustomerID
                              ORDER BY o.OrderDate DESC, o.OrderID DESC) AS rn
    FROM Orders AS o
)
SELECT * FROM Ranked WHERE rn = 1;
```

The outer `SELECT *` also returns `rn`; list columns explicitly to leave it out.

---

# Latest Row per Key

"Latest status per order", "current address per customer", "most recent reading per sensor" are all the same pattern:

```sql
WITH Latest AS (
    SELECT h.*,
           ROW_NUMBER() OVER (PARTITION BY h.OrderID
                              ORDER BY h.ChangedAt DESC, h.HistoryID DESC) AS rn
    FROM OrderStatusHistory AS h
)
SELECT OrderID, Status, ChangedAt
FROM Latest
WHERE rn = 1;
```

The tiebreaker (`HistoryID`) makes the choice deterministic when two changes share a timestamp.

---

# Top N per Group

```sql
-- Three best-selling products per category
WITH ProductRevenue AS (
    SELECT p.CategoryID, p.ProductID, p.ProductName,
           SUM(oi.Quantity * oi.UnitPrice) AS Revenue
    FROM OrderItems AS oi
    JOIN Products AS p ON p.ProductID = oi.ProductID
    GROUP BY p.CategoryID, p.ProductID, p.ProductName
),
Ranked AS (
    SELECT pr.*,
           ROW_NUMBER() OVER (PARTITION BY CategoryID ORDER BY Revenue DESC, ProductID) AS rn,
           RANK()       OVER (PARTITION BY CategoryID ORDER BY Revenue DESC)            AS rnk,
           DENSE_RANK() OVER (PARTITION BY CategoryID ORDER BY Revenue DESC)            AS drnk
    FROM ProductRevenue AS pr
)
SELECT * FROM Ranked WHERE rn <= 3;       -- exactly 3 per category
-- WHERE rnk  <= 3  → 3 or more (ties at 3rd place included)
-- WHERE drnk <= 3  → all products with one of the top 3 revenue values
```

| Filter | Rows per category | Ties |
|--------|------------------|------|
| `ROW_NUMBER() <= 3` | Exactly 3 (or fewer if the category is small) | Broken by tiebreaker |
| `RANK() <= 3` | 3 or more | Included at the cut-off |
| `DENSE_RANK() <= 3` | Any number | Top 3 distinct values |

---

# Deduplication: Find Duplicates

```sql
-- Customers with the same e-mail: keep the lowest CustomerID, list the rest
WITH d AS (
    SELECT c.*,
           ROW_NUMBER() OVER (PARTITION BY LOWER(c.Email) ORDER BY c.CustomerID) AS rn
    FROM Customers AS c
    WHERE c.Email IS NOT NULL
)
SELECT * FROM d WHERE rn > 1;
```

`rn = 1` is the keeper; `rn > 1` are the duplicates. Choose the ordering to express which row survives: the oldest (`ORDER BY CreatedAt`), the most complete (`ORDER BY CASE WHEN Phone IS NULL THEN 1 ELSE 0 END`), or the most recently updated.

---

# Deduplication: Delete Duplicates

```sql
-- PostgreSQL, SQLite, Oracle, MySQL 8: delete by key from the ranked set
DELETE FROM Customers
WHERE CustomerID IN (
    SELECT CustomerID
    FROM (
        SELECT CustomerID,
               ROW_NUMBER() OVER (PARTITION BY LOWER(Email) ORDER BY CustomerID) AS rn
        FROM Customers
        WHERE Email IS NOT NULL
    ) AS d
    WHERE d.rn > 1
);

-- SQL Server: delete directly through a CTE
WITH d AS (
    SELECT ROW_NUMBER() OVER (PARTITION BY LOWER(Email) ORDER BY CustomerID) AS rn
    FROM Customers
    WHERE Email IS NOT NULL
)
DELETE FROM d WHERE rn > 1;
```

MySQL accepts the first form because the ranked subquery is a derived table and is materialised before the delete (Section 09.11). Before deleting, re-point child rows (orders of the duplicate customers) to the surviving `CustomerID`—or the foreign keys will block the delete.

---

# Pagination with ROW_NUMBER

```sql
WITH Numbered AS (
    SELECT o.OrderID, o.OrderDate, o.TotalAmount,
           ROW_NUMBER() OVER (ORDER BY o.OrderDate DESC, o.OrderID DESC) AS rn
    FROM Orders AS o
    WHERE o.Status = 'Shipped'
)
SELECT * FROM Numbered WHERE rn BETWEEN 41 AND 60;
```

This was the standard pagination technique on SQL Server before `OFFSET … FETCH` (2012). It has the same deep-page cost as `OFFSET`; keyset pagination (Section 10.11) is better for large page numbers.

---

# QUALIFY

Some engines provide `QUALIFY`, a clause that filters on window functions directly—like `HAVING` does for aggregates:

```sql
-- Snowflake, BigQuery, Teradata, DuckDB, Databricks
SELECT o.*
FROM Orders AS o
QUALIFY ROW_NUMBER() OVER (PARTITION BY o.CustomerID
                           ORDER BY o.OrderDate DESC, o.OrderID DESC) = 1;
```

```text
Logical order with QUALIFY
FROM → WHERE → GROUP BY → HAVING → WINDOW → QUALIFY → SELECT → ORDER BY → LIMIT
```

`QUALIFY` is **not** part of the SQL standard and is not supported by PostgreSQL, MySQL, SQL Server, Oracle or SQLite. On those engines, use the derived-table or CTE pattern—which works everywhere, including engines that do support `QUALIFY`.

---

# Comparing Solutions

The "latest order per customer" problem, four ways:

| Approach | Section | Strengths | Weaknesses |
|----------|---------|-----------|------------|
| `ROW_NUMBER` + filter | 11.10 | One pass; any N; portable | Reads every row |
| `LATERAL` / `APPLY` + `LIMIT` | 09.10 | Reads only N rows per group with an index | Per-group loop; engine-specific syntax |
| Correlated subquery `= MAX(…)` | 09.07 | Simple for N = 1 | Ties; per-row cost if not decorrelated |
| `GROUP BY` + join back | 08.11 | Portable, old engines | Two passes; ties |

Rules of thumb: with many small groups, the window form is usually fastest; with few large groups and a matching index, `LATERAL` wins (Section 11.15).

---

# Visual Representation

```text
Partition CustomerID = 2, ordered by OrderDate DESC

rn   OrderDate    Amount
1    2026-09-02   120    ← kept by rn = 1 / rn <= 3
2    2026-07-11    90    ← kept by rn <= 3
3    2026-05-30   210    ← kept by rn <= 3
4    2026-02-14    60
5    2026-01-04   500
          ▲
   inner query ranks; outer query filters
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← cannot see window results; filter the base rows here
4. GROUP BY
5. HAVING
6. WINDOW      ← ranks computed here (inner query)
7. SELECT
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

The outer query of the derived-table pattern then starts its own `FROM` (the ranked rows) and its `WHERE` filters on the rank.

---

# How the DBMS Executes This

```text
SELECT … FROM (… ROW_NUMBER() OVER (PARTITION BY c ORDER BY d DESC) AS rn …) t WHERE rn <= 3

Subquery Scan
  Filter: rn <= 3
  WindowAgg (Run Condition: row_number() <= 3)     ← PostgreSQL 15+: stop each partition early
    Incremental Sort / Sort (c, d DESC)            ← or Index Scan in (c, d DESC) order
      Seq Scan on orders

Oracle:     WINDOW SORT PUSHED RANK
SQL Server: Sequence Project + Top/Filter; Segment Top in some plans
```

---

# 🔬 Engine Deep Dive

The filter `rn <= 3` is on the outer query, but optimizers push it into the window operator as a *run condition*: once a partition's `ROW_NUMBER` exceeds 3, the rest of that partition need not be emitted. Oracle goes further with `WINDOW SORT PUSHED RANK`, keeping only the top N rows per partition during the sort itself, which reduces sort memory from "all rows" to "N per partition".

---

# 🏗️ Architecture Insight

"Latest row per key" is how current state is derived from history tables. Designs that store only immutable history (status changes, price changes, address versions) and derive current state with `ROW_NUMBER` avoid update anomalies—at the cost of a ranking query, which is often materialised into a "current" view or table for hot paths.

---

# ⚡ Performance Tip

Index `(partition columns, order columns)` in the window's order—`OrderStatusHistory(OrderID, ChangedAt DESC, HistoryID DESC)`—so the ranking reads rows already sorted and needs no sort step.

---

# 🔒 Security Note

Deduplication deletes are destructive. Run the ranked `SELECT` first, review which rows would be removed, merge dependent data, and perform the delete in a transaction with a row-count check (Section 09.11).

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Derived table / CTE filter on window | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `QUALIFY` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `DELETE` through a CTE | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Top-N-per-group early stop | n/a | ✅ (15+) | ❌ | Partial | ✅ | ❌ |
| `FETCH FIRST … WITH TIES` | ✅ | ✅ (13+) | ❌ | `TOP … WITH TIES` | ✅ | ❌ |

> **Portability Tip:** The derived-table (or CTE) filter over `ROW_NUMBER`/`RANK` is the universal top-N-per-group and deduplication pattern. `QUALIFY` is shorter but belongs to cloud warehouses and DuckDB, not to the engines in this handbook.

---

# Common Mistakes

### Mistake 1

Filtering on a window function in `WHERE`.

---

### Mistake 2

`ROW_NUMBER` without a tiebreaker, so the "latest" row changes between runs.

---

### Mistake 3

Using `ROW_NUMBER` when ties should be included (or `RANK` when exactly N rows are required).

---

### Mistake 4

Deleting duplicates without first re-pointing child rows.

---

### Mistake 5

Putting a filter that belongs to the base rows (e.g. `Status = 'Shipped'`) in the outer query instead of the inner one, so it is applied after ranking.

---

# Best Practices

✔ Rank in an inner query or CTE; filter outside.

✔ Put base-row filters inside, before the ranking.

✔ Choose `ROW_NUMBER`, `RANK` or `DENSE_RANK` by the tie rule.

✔ Always add a unique tiebreaker to `ROW_NUMBER`.

✔ Preview, merge dependents and delete duplicates in a transaction.

---

# Interview Questions

## Basic

1. Why can't you write `WHERE ROW_NUMBER() OVER (…) = 1`?
2. How do you return the latest order per customer?
3. How do you find duplicate rows?

## Intermediate

4. How do you return the top 3 products per category, including ties?
5. How do you delete duplicates while keeping the oldest row?
6. What is `QUALIFY`, and which engines support it?

## Advanced

7. Where should a filter go—inside or outside the ranked subquery—and why does it matter?
8. When is `LATERAL` faster than `ROW_NUMBER` for top N per group?
9. How do optimizers avoid ranking entire partitions when only the top N are needed?

---

# Hands-on Exercises

## Exercise 1

Return each customer's two largest orders, exactly two per customer.

---

## Exercise 2

Return the current status of every order from `OrderStatusHistory`.

---

## Exercise 3

Find and delete duplicate customers by e-mail, keeping the one with the most orders.

---

## Exercise 4

Write top-3-per-category with `ROW_NUMBER` and with `LATERAL`/`APPLY`, and compare plans.

---

# Related Topics

- **11.03 — Ranking Functions (ROW_NUMBER, RANK, DENSE_RANK, NTILE)**
- **09.08 — Derived Tables (Subqueries in FROM)**
- **09.10 — LATERAL and CROSS APPLY**
- **09.11 — Subqueries in INSERT, UPDATE and DELETE**
- **10.11 — Indexing for JOIN, GROUP BY and ORDER BY**

---

# Summary

Because window functions are computed after `WHERE` and `HAVING`, filtering on them needs a derived table or CTE—or `QUALIFY` on the engines that have it. That one pattern solves latest-row-per-key, top N per group (`ROW_NUMBER` for exactly N, `RANK` with ties, `DENSE_RANK` for top values), deduplication (keep `rn = 1`, delete `rn > 1`) and numbered pagination. Put base-row filters inside the ranked query, make orderings unique, preview destructive deduplication, and compare with `LATERAL` when groups are few and large.
