---
title: "09.13 - Subqueries vs JOINs"
description: "When a subquery and a join express the same question and when they do not: semi-joins versus inner joins, duplicates and DISTINCT, returning columns, anti-joins, scalar lookups versus outer joins, readability, and how optimizers make the choice mostly about meaning rather than speed."
chapter: 9
section: 9.13
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 30 min
lastUpdated: 2026-09-25
---

# 09.13 Subqueries vs JOINs

---

# Learning Objectives

After completing this section, you will be able to:

- Tell when a subquery and a join return the same rows and when they do not.
- Explain why a join can duplicate outer rows and a semi-join cannot.
- Rewrite `IN`/`EXISTS` as joins and back without changing the result.
- Rewrite correlated scalar subqueries as outer joins to grouped derived tables.
- Choose between the forms by meaning first, readability second and plan third.

---

# The Core Difference

A **join** combines rows: each output row is a pairing of an outer row with a matching inner row. A **semi-join** (`IN`, `EXISTS`) filters rows: each outer row appears at most once, however many inner rows match.

```text
Customers         Orders                 INNER JOIN               EXISTS / IN
┌───┬──────┐      ┌─────┬──────┐         ┌──────┬─────┐          ┌──────┐
│ 1 │ Asha │      │ 101 │ 1    │         │ Asha │ 101 │          │ Asha │
│ 2 │ Ben  │      │ 102 │ 1    │         │ Asha │ 102 │          │ Ben  │
│ 3 │ Dina │      │ 103 │ 2    │         │ Ben  │ 103 │          └──────┘
└───┴──────┘      └─────┴──────┘         └──────┴─────┘
                                         3 rows (Asha twice)      2 rows
```

That single difference explains when the two forms are interchangeable.

---

# When They Are Equivalent

A join and a semi-join return the same rows when the inner side has **at most one match** per outer row—typically when joining to a primary key:

```sql
-- Orders from customers in India: each order has exactly one customer
SELECT o.OrderID
FROM Orders AS o
JOIN Customers AS c ON c.CustomerID = o.CustomerID
WHERE c.Country = 'India';

SELECT o.OrderID
FROM Orders AS o
WHERE o.CustomerID IN (SELECT c.CustomerID FROM Customers AS c WHERE c.Country = 'India');
```

Both return each order once. Optimizers know this too: when the inner side is unique, a semi-join and an inner join are the same operation.

---

# When They Differ: Duplicates

When the inner side has several matches (a 1:N relationship seen from the "1" side), the join repeats outer rows:

```sql
-- ❌ One row per order, not per customer
SELECT c.CustomerID, c.CustomerName
FROM Customers AS c
JOIN Orders AS o ON o.CustomerID = c.CustomerID;

-- ⚠️ Correct result, but hides the intent and does extra work
SELECT DISTINCT c.CustomerID, c.CustomerName
FROM Customers AS c
JOIN Orders AS o ON o.CustomerID = c.CustomerID;

-- ✅ States the question: customers for which an order exists
SELECT c.CustomerID, c.CustomerName
FROM Customers AS c
WHERE EXISTS (SELECT 1 FROM Orders AS o WHERE o.CustomerID = c.CustomerID);
```

`DISTINCT` after a join is also subtly different: it removes duplicates across **all** selected columns, so it would also merge two different customers with identical selected values if the key were not selected.

---

# When They Differ: Aggregates

Duplicates from a join corrupt aggregates (Section 08.11):

```sql
-- ❌ Credit limit summed once per order
SELECT SUM(c.CreditLimit)
FROM Customers AS c
JOIN Orders AS o ON o.CustomerID = c.CustomerID;

-- ✅ Credit limit of customers who have ordered
SELECT SUM(c.CreditLimit)
FROM Customers AS c
WHERE EXISTS (SELECT 1 FROM Orders AS o WHERE o.CustomerID = c.CustomerID);
```

Whenever the question is "filter by the existence of related rows", a semi-join keeps the grain intact.

---

# When You Need Inner Columns: Join

A subquery in `WHERE` cannot return columns to the outer query. If you need data from both tables, join (or use a scalar subquery / `LATERAL` for a single related row):

```sql
-- Needs OrderDate from Orders: join
SELECT c.CustomerName, o.OrderID, o.OrderDate
FROM Customers AS c
JOIN Orders AS o ON o.CustomerID = c.CustomerID;
```

---

# Anti-Join Forms

"Rows with no match" has three spellings (Section 09.12):

```sql
-- NOT EXISTS
SELECT p.ProductID FROM Products AS p
WHERE NOT EXISTS (SELECT 1 FROM OrderItems AS oi WHERE oi.ProductID = p.ProductID);

-- LEFT JOIN … IS NULL
SELECT p.ProductID
FROM Products AS p
LEFT JOIN OrderItems AS oi ON oi.ProductID = p.ProductID
WHERE oi.OrderItemID IS NULL;

-- NOT IN (only if OrderItems.ProductID is NOT NULL)
SELECT p.ProductID FROM Products AS p
WHERE p.ProductID NOT IN (SELECT oi.ProductID FROM OrderItems AS oi);
```

`NOT EXISTS` states the intent and is `NULL`-safe; the `LEFT JOIN` form is equally correct and is sometimes planned differently on older engines (MySQL before 8.0.17 favoured it).

---

# Scalar Subquery vs Outer Join

```sql
-- Correlated scalar subqueries
SELECT
    c.CustomerID,
    (SELECT COUNT(*)          FROM Orders o WHERE o.CustomerID = c.CustomerID) AS OrderCount,
    (SELECT SUM(o.TotalAmount) FROM Orders o WHERE o.CustomerID = c.CustomerID) AS Revenue
FROM Customers AS c;

-- Outer join to a grouped derived table
SELECT
    c.CustomerID,
    COALESCE(s.OrderCount, 0) AS OrderCount,
    s.Revenue
FROM Customers AS c
LEFT JOIN (
    SELECT CustomerID, COUNT(*) AS OrderCount, SUM(TotalAmount) AS Revenue
    FROM Orders
    GROUP BY CustomerID
) AS s ON s.CustomerID = c.CustomerID;
```

Note the `COALESCE`: in the join form, a customer without orders gets `NULL` for `OrderCount`, while the scalar `COUNT(*)` returns `0`. This is the classic "count bug" that optimizers must handle when they decorrelate (Section 09.14). `Revenue` is `NULL` in both forms.

| | Scalar subqueries | Outer join to derived table |
|---|-------------------|------------------------------|
| Passes over `Orders` | One per subquery (unless decorrelated) | One |
| Customers without orders | Kept, `COUNT` = 0 | Kept, `COUNT` = `NULL` → needs `COALESCE` |
| Readability with 1–2 values | ✅ | More verbose |
| Readability with many values | Repetitive | ✅ |

---

# Readability as a Criterion

Optimizers rewrite freely between these forms, so the first criterion is: **which form states the question?**

| Question | Most direct form |
|----------|------------------|
| "Customers who have ordered" | `EXISTS` / `IN` |
| "Customers who have never ordered" | `NOT EXISTS` |
| "Customers with their orders" | `JOIN` |
| "Customers with their order count" | Scalar subquery or grouped derived table |
| "Customers with their latest order's details" | `LATERAL` / `APPLY` or `ROW_NUMBER()` |
| "Orders above their customer's average" | Correlated subquery or window function |

A reviewer should be able to read the question back from the SQL. `SELECT DISTINCT … JOIN` for a membership test fails that test; `EXISTS` passes it.

---

# When Performance Does Differ

Modern optimizers make most rewrites unnecessary, but the forms are not always planned identically:

- **Non-unnestable subqueries** (row limits, `OR` across correlated conditions, correlation through non-equality) run as per-row SubPlans; a join rewrite may be much faster.
- **`NOT IN` on nullable columns** cannot become a plain anti-join; `NOT EXISTS` can.
- **Older engines**—MySQL 5.5 and earlier executed `IN (subquery)` as a correlated `EXISTS` per outer row; a join was dramatically faster.
- **Repeated scalar subqueries** on one child table may each scan it; one grouped derived table scans once.

Measure with the execution plan (Section 09.15), not with rules of thumb.

---

# Visual Representation

```text
                          Inner side has ≤ 1 match per outer row?
                             yes                         no
                     ┌──────────────────────┬──────────────────────────────┐
Need inner columns?  │ JOIN                 │ JOIN (rows repeat: intended) │
  yes                │                      │ or LATERAL for one child     │
                     ├──────────────────────┼──────────────────────────────┤
  no                 │ JOIN ≡ IN ≡ EXISTS   │ IN / EXISTS                  │
                     │                      │ (JOIN would duplicate)       │
                     └──────────────────────┴──────────────────────────────┘
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← joins multiply or combine rows here
2. JOIN
3. WHERE       ← semi-joins and anti-joins only filter rows here
4. GROUP BY    ← duplicates from step 2 inflate aggregates here
5. HAVING
6. SELECT
7. DISTINCT    ← the late, expensive way to undo step 2's duplicates
8. ORDER BY
9. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Logical form               Typical physical plan
─────────────────────────  ────────────────────────────────────────────
JOIN                       Hash / Merge / Nested Loop Join
IN / EXISTS                Hash / Merge / Nested Loop SEMI Join
NOT EXISTS / LEFT … NULL   Hash / Merge / Nested Loop ANTI Join
Scalar subquery            SubPlan per row, or Left Join + Aggregate
SELECT DISTINCT … JOIN     Join + Hash Aggregate / Sort Unique
```

The semi-join and join use the same algorithms; the semi-join simply emits the outer row at the first match and never emits it twice.

---

# 🔬 Engine Deep Dive

When the inner side of an `IN` is not unique, an optimizer has two options: a true semi-join, or deduplicate the inner side first (hash aggregate on `Orders.CustomerID`) and then perform an ordinary inner join. The second is useful when the deduplicated inner side is small and should drive the join. MySQL calls these strategies *FirstMatch*, *LooseScan*, *Materialization* and *DuplicateWeedout*; SQL Server and Oracle choose between them silently.

---

# 🏗️ Architecture Insight

Join-versus-subquery debates are really debates about **grain**. A join produces a result at the grain of the pairing; a semi-join keeps the grain of the outer table. Choose the form whose output grain matches the question, and most "which is better" arguments disappear.

---

# ⚡ Performance Tip

Never add `DISTINCT` to fix duplicates introduced by a join used for filtering. Replace the join with `EXISTS`; it avoids producing the duplicates in the first place and saves a sort or hash aggregate.

---

# 🔒 Security Note

Both forms need `SELECT` on all tables involved. Row-level security policies apply identically to joined tables and subqueried tables.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Semi-join for `IN`/`EXISTS` | n/a | ✅ | ✅ (5.6+) | ✅ | ✅ | Partial |
| Anti-join for `NOT EXISTS` | n/a | ✅ | ✅ (8.0.17+) | ✅ | ✅ | Partial |
| Scalar subquery decorrelation | n/a | Limited | Opt-in | ✅ | ✅ | ❌ |
| Explicit `SEMI JOIN` syntax | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

> **Portability Tip:** No mainstream engine exposes `SEMI JOIN` as syntax; `EXISTS` and `IN` are the portable way to request one.

---

# Common Mistakes

### Mistake 1

Filtering with a join and then removing duplicates with `DISTINCT`.

---

### Mistake 2

Summing a parent column after a join to a child table.

---

### Mistake 3

Rewriting scalar `COUNT(*)` subqueries as a `LEFT JOIN` to a grouped derived table without `COALESCE`, turning `0` into `NULL`.

---

### Mistake 4

Assuming a subquery is always slower than a join (or the reverse) without reading the plan.

---

# Best Practices

✔ Use `EXISTS`/`IN` to filter by related rows; use a join to return their columns.

✔ Use `NOT EXISTS` to exclude.

✔ When rewriting, check duplicates, `NULL`s and zero counts on test data.

✔ Pick the form whose output grain matches the question.

✔ Compare execution plans before rewriting for speed.

---

# Interview Questions

## Basic

1. What is the difference between a join and a semi-join?
2. Why can an inner join return a customer twice?
3. When do you need a join rather than a subquery?

## Intermediate

4. When are `JOIN` and `IN` guaranteed to return the same rows?
5. Why is `SELECT DISTINCT … JOIN` a poor substitute for `EXISTS`?
6. How do you rewrite a correlated `COUNT(*)` subquery as a join without changing results?

## Advanced

7. What is the "count bug" in subquery decorrelation?
8. What strategies can an optimizer use to execute a semi-join on a non-unique inner side?
9. In which situations can a subquery and its join rewrite still have very different performance?

---

# Hands-on Exercises

## Exercise 1

Write "customers who ordered in 2026" as a join with `DISTINCT` and as `EXISTS`. Compare the plans.

---

## Exercise 2

Write "products never sold" three ways and verify all return the same rows.

---

## Exercise 3

Rewrite a query with three correlated scalar subqueries on `Orders` into one `LEFT JOIN` to a grouped derived table, preserving zero counts.

---

## Exercise 4

Construct data on which `SELECT SUM(c.CreditLimit) FROM Customers c JOIN Orders o …` and the `EXISTS` version differ.

---

# Related Topics

- **07.13 — Semi-Joins and Anti-Joins (EXISTS and NOT EXISTS)**
- **08.11 — Aggregating Across JOINs (Fan-Out and Pre-Aggregation)**
- **09.04 — IN and NOT IN with Subqueries**
- **09.05 — EXISTS and NOT EXISTS**
- **09.14 — Execution Flow of Subqueries (Unnesting and Decorrelation)**
- **05.07 — DISTINCT**

---

# Summary

A join pairs rows and repeats an outer row for every match; a semi-join (`IN`, `EXISTS`) filters and returns each outer row at most once. The two are interchangeable only when the inner side matches at most one row, as with a join to a primary key. Use `EXISTS`/`IN` to filter by related rows, `NOT EXISTS` to exclude, joins to return related columns, and grouped derived tables or scalar subqueries for per-row figures—remembering that a `LEFT JOIN` rewrite turns zero counts into `NULL`. Optimizers plan the equivalent forms alike, so choose by the grain of the question, then confirm with the execution plan.
