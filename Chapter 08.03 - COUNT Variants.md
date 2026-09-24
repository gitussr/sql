---
title: "08.03 - COUNT Variants"
description: "COUNT(*), COUNT(column), COUNT(DISTINCT column) and COUNT(1) compared: what each counts, how they behave with NULL and outer joins, counting distinct combinations, conditional counts, approximate distinct counts, and existence checks."
chapter: 8
section: 8.03
category: Data Query Language (DQL)
difficulty: Beginner → Intermediate
readingTime: 30 min
lastUpdated: 2026-09-24
---

# 08.03 COUNT Variants

---

# Learning Objectives

After completing this section, you will be able to:

- State exactly what `COUNT(*)`, `COUNT(column)` and `COUNT(DISTINCT column)` count.
- Explain why `COUNT(1)` is identical to `COUNT(*)`.
- Choose the correct `COUNT` after a `LEFT JOIN`.
- Count distinct combinations of several columns portably.
- Count rows that satisfy a condition.
- Replace `COUNT(*) > 0` with `EXISTS` for existence checks.
- Know when an approximate distinct count is acceptable.

---

# Three Questions, Three Forms

| Form | Counts | `NULL`s |
|------|--------|---------|
| `COUNT(*)` | Rows | Counted—a row is a row |
| `COUNT(expr)` | Rows where `expr` is not `NULL` | Skipped |
| `COUNT(DISTINCT expr)` | Different non-`NULL` values of `expr` | Skipped |

```text
Orders
┌─────────┬────────────┐
│ OrderID │ CustomerID │
├─────────┼────────────┤
│ 101     │ 1          │
│ 102     │ 1          │
│ 103     │ 2          │
│ 104     │ NULL       │   ← guest checkout
│ 105     │ 3          │
└─────────┴────────────┘

COUNT(*)                    5    rows
COUNT(CustomerID)           4    rows with a customer
COUNT(DISTINCT CustomerID)  3    different customers: 1, 2, 3
```

Choosing the wrong form does not raise an error. It returns a different, plausible number.

---

# COUNT(*)

`COUNT(*)` counts rows. It does not look at any column, so no value—not even an all-`NULL` row—is skipped.

```sql
SELECT COUNT(*) AS OrderCount
FROM Orders
WHERE Status = 'Shipped';
```

Use it when the question is "how many rows / events / records".

---

# COUNT(column)

`COUNT(column)` counts rows where that column is not `NULL`.

```sql
SELECT
    COUNT(*)      AS Employees,
    COUNT(Salary) AS SalariedEmployees   -- contractors have NULL Salary
FROM Employees;
```

Use it when the question is "how many rows **have** a value". It is also the essential form after an outer join, below.

---

# COUNT(DISTINCT column)

`COUNT(DISTINCT column)` counts different non-`NULL` values.

```sql
SELECT
    COUNT(*)                   AS Orders,
    COUNT(DISTINCT CustomerID) AS PayingCustomers
FROM Orders
WHERE OrderDate >= DATE '2026-09-01';
```

Use it when the question is "how many **different** things". It is the correct way to count the "one" side after a 1:N join (Section 07.03).

---

# COUNT(1) Is COUNT(*)

`COUNT(1)` counts rows where the literal `1` is not `NULL`—which is every row. Every mainstream optimizer treats it identically to `COUNT(*)`; neither reads more columns than the other.

```sql
SELECT COUNT(*) FROM Orders;   -- ✅ states intent: count rows
SELECT COUNT(1) FROM Orders;   -- same plan, same result
```

The belief that `COUNT(1)` is faster dates from very old engines. Prefer `COUNT(*)`: it is the standard spelling and says what you mean.

---

# COUNT After a LEFT JOIN

This is where the choice matters most.

```sql
SELECT
    c.CustomerName,
    COUNT(*)          AS WrongCount,
    COUNT(o.OrderID)  AS OrderCount
FROM Customers AS c
LEFT JOIN Orders AS o
    ON o.CustomerID = c.CustomerID
GROUP BY c.CustomerID, c.CustomerName;
```

```text
LEFT JOIN result                     Grouped
┌───────┬─────────┐                  ┌───────┬────────────┬────────────┐
│ Ada   │ 101     │                  │ Name  │ WrongCount │ OrderCount │
│ Ada   │ 102     │         ──→      ├───────┼────────────┼────────────┤
│ Grace │ 103     │                  │ Ada   │ 2          │ 2          │
│ Linus │ NULL    │ ← no orders      │ Grace │ 1          │ 1          │
└───────┴─────────┘                  │ Linus │ 1  ❌       │ 0  ✅       │
                                     └───────┴────────────┴────────────┘
```

A `LEFT JOIN` keeps Linus as one row with a `NULL`-extended right side. `COUNT(*)` counts that row. `COUNT(o.OrderID)` counts only real matches, because the preserved row's `OrderID` is `NULL`.

**Rule:** after an outer join, count a non-nullable column of the optional table—its primary key is ideal.

---

# Counting Distinct Combinations

`COUNT(DISTINCT a, b)` is accepted by MySQL but not by PostgreSQL, SQL Server, Oracle or SQLite. The portable form counts the rows of a distinct derived table:

```sql
-- How many different (customer, product) pairs have been ordered?
SELECT COUNT(*) AS CustomerProductPairs
FROM (
    SELECT DISTINCT o.CustomerID, oi.ProductID
    FROM Orders AS o
    INNER JOIN OrderItems AS oi ON oi.OrderID = o.OrderID
) AS pairs;
```

PostgreSQL also accepts a row value: `COUNT(DISTINCT (o.CustomerID, oi.ProductID))`.

Avoid concatenating columns into one string (`COUNT(DISTINCT a || '-' || b)`): values containing the separator collide, and `NULL` in either column makes the whole string `NULL`.

---

# Conditional Counts

Count only rows that meet a condition, several at once:

```sql
SELECT
    COUNT(*)                                             AS AllOrders,
    COUNT(CASE WHEN Status = 'Shipped'   THEN 1 END)     AS Shipped,
    COUNT(CASE WHEN Status = 'Cancelled' THEN 1 END)     AS Cancelled
FROM Orders;
```

A `CASE` with no `ELSE` yields `NULL` for non-matching rows, and `COUNT(expr)` skips `NULL`—so only matching rows are counted. `SUM(CASE WHEN ... THEN 1 ELSE 0 END)` gives the same number (except on empty input, where it returns `NULL`). The standard `FILTER` clause states it most clearly:

```sql
SELECT COUNT(*) FILTER (WHERE Status = 'Shipped') AS Shipped
FROM Orders;          -- PostgreSQL, SQLite 3.30+
```

Section 08.10 covers conditional aggregation in full.

---

# Existence Checks: Don't Count

```sql
-- ❌ Counts every matching row just to compare with zero
IF (SELECT COUNT(*) FROM Orders WHERE CustomerID = 42) > 0 ...

-- ✅ Stops at the first match
IF EXISTS (SELECT 1 FROM Orders WHERE CustomerID = 42) ...
```

`COUNT(*)` must find every match to return a number; `EXISTS` can stop at the first one. On a customer with a million orders the difference is a million index entries. The same applies inside queries: use `EXISTS` (Section 07.13), not `(SELECT COUNT(*) ...) > 0`.

---

# Approximate Distinct Counts

Exact `COUNT(DISTINCT)` must remember every value it has seen. For dashboards over billions of rows, engines offer approximations with a small, bounded error using a fraction of the memory:

| Engine | Function |
|--------|----------|
| SQL Server 2019+ | `APPROX_COUNT_DISTINCT(col)` |
| Oracle 12c+ | `APPROX_COUNT_DISTINCT(col)` |
| PostgreSQL | Extensions such as `hll` (HyperLogLog) |
| MySQL, SQLite | None built in |

These typically land within about 2% of the true value. That is fine for "about 4.2 million visitors" and never acceptable for billing or compliance figures.

---

# Visual Representation

```text
rows            COUNT(*)   COUNT(x)   COUNT(DISTINCT x)
┌──────┐
│  A   │           ▪          ▪              ▪ A
│  A   │           ▪          ▪
│  B   │           ▪          ▪              ▪ B
│ NULL │           ▪          ·
│  C   │           ▪          ▪              ▪ C
└──────┘         ─────      ─────          ─────
                   5          4              3
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN        ← outer joins create the NULL-extended rows COUNT must handle
3. WHERE
4. GROUP BY    ← COUNT accumulates here, per group
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

`COUNT` sees rows exactly as the join produced them. Whether the preserved rows of an outer join count as "one" depends entirely on which form you wrote.

---

# How the DBMS Executes This

```text
COUNT(*)           increment per row                       O(1) memory per group
COUNT(x)           increment per row where x IS NOT NULL   O(1) memory per group
COUNT(DISTINCT x)  insert x into a set (hash or sort)      O(distinct values)

SELECT COUNT(*) FROM Orders
    → may read the smallest index instead of the table
      (every row appears once in every full index)
```

For an unfiltered `COUNT(*)`, engines scan the narrowest structure that contains one entry per row—often a small secondary index—rather than the table itself.

---

# 🔬 Engine Deep Dive

PostgreSQL has no stored row count: MVCC means different transactions legitimately see different numbers of rows, so `SELECT COUNT(*) FROM big_table` must visit every row (an index-only scan helps when the visibility map is current). MySQL's MyISAM engine kept an exact count and answered instantly; InnoDB, like PostgreSQL, must count. For a fast estimate, catalog statistics (`pg_class.reltuples`, `information_schema.TABLES.TABLE_ROWS`) are available but approximate.

---

# 🏗️ Architecture Insight

When an application displays "12,481 results" above every page of a search, it is running an exact `COUNT(*)` over the full result for every request. At scale that count is often more expensive than fetching the page itself. Mature systems either show an estimate ("about 12,000"), cap the count ("10,000+"), or drop it in favour of "next page" navigation.

---

# ⚡ Performance Tip

`COUNT(DISTINCT x)` on a large table is dominated by the cost of de-duplicating `x`. An index on `x` lets the engine read values already in order and count changes between consecutive entries, avoiding a large hash set. When several distinct counts are needed over different columns, each builds its own set—consider whether all of them are necessary.

---

# 🌍 Production Consideration

`COUNT(*)` after a `LEFT JOIN` is one of the most common reporting defects in production: every entity with no activity shows a count of one instead of zero. Code review checklists for reports should include "which column does each `COUNT` count, and can it be `NULL`?"

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `COUNT(*)`, `COUNT(x)`, `COUNT(DISTINCT x)` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `COUNT(DISTINCT a, b)` | ❌ | ❌ (use row value) | ✅ | ❌ | ❌ | ❌ |
| `COUNT(*) FILTER (WHERE …)` | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ (3.30+) |
| `COUNT_BIG` (returns `BIGINT`) | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Approximate distinct count | ❌ | Extension | ❌ | ✅ (2019+) | ✅ (12c+) | ❌ |

> **Portability Tip:** SQL Server's `COUNT` returns `INT` and fails above about 2.1 billion rows; `COUNT_BIG` returns `BIGINT`. For the other engines, `COUNT` already returns a 64-bit or arbitrary-precision number.

---

# Common Mistakes

### Mistake 1

`COUNT(*)` after a `LEFT JOIN`, reporting 1 for entities with no matches.

---

### Mistake 2

`COUNT(column)` on a nullable column when the intent was to count rows.

---

### Mistake 3

`COUNT(*)` after a 1:N join when the intent was to count the "one" side.

---

### Mistake 4

Counting distinct combinations by concatenating strings.

---

### Mistake 5

`SELECT COUNT(*) ... > 0` to test existence.

---

# Best Practices

✔ Write `COUNT(*)` to count rows; do not use `COUNT(1)` for speed.

✔ After an outer join, count the optional table's primary key.

✔ Use `COUNT(DISTINCT key)` to count entities after a 1:N join.

✔ Use `EXISTS` for "is there at least one".

✔ Reserve approximate distinct counts for figures that are explicitly estimates.

---

# Interview Questions

## Basic

1. What is the difference between `COUNT(*)` and `COUNT(column)`?
2. Does `COUNT(DISTINCT x)` count `NULL`?
3. Is `COUNT(1)` faster than `COUNT(*)`?

## Intermediate

4. Why does `COUNT(*)` return 1 for a customer with no orders after a `LEFT JOIN`?
5. How do you count distinct pairs of columns portably?
6. How do you count shipped and cancelled orders in one query?

## Advanced

7. Why can't PostgreSQL return `COUNT(*)` of a large table instantly?
8. Why is `EXISTS` preferable to `COUNT(*) > 0`?
9. When is an approximate distinct count acceptable?

---

# Hands-on Exercises

## Exercise 1

Return the total number of employees and the number with a recorded salary.

---

## Exercise 2

List every customer with their order count, making sure customers with no orders show 0.

---

## Exercise 3

Count the distinct (customer, product) pairs that have been ordered, without using `COUNT(DISTINCT a, b)`.

---

## Exercise 4

In one query, count orders by each of the three statuses.

---

# Related Topics

- **08.02 — Aggregate Functions (COUNT, SUM, AVG, MIN, MAX)**
- **08.04 — NULL Handling in Aggregates**
- **08.10 — Conditional Aggregation (FILTER and CASE)**
- **07.04 — LEFT JOIN (LEFT OUTER JOIN)**
- **07.13 — Semi-Joins and Anti-Joins (EXISTS and NOT EXISTS)**
- **05.07 — DISTINCT**

---

# Summary

`COUNT(*)` counts rows, `COUNT(expr)` counts rows where the expression is not `NULL`, and `COUNT(DISTINCT expr)` counts different non-`NULL` values; `COUNT(1)` is simply `COUNT(*)`. The difference matters most after joins: an outer join's preserved rows are counted by `COUNT(*)` but not by a count of the optional table's key, and a 1:N join multiplies rows so the "one" side must be counted with `DISTINCT`. Count combinations through a distinct derived table, use `EXISTS` rather than counting to test existence, and use approximate counts only where an estimate is explicitly acceptable.
