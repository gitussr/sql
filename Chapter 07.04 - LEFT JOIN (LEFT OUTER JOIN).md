---
title: "07.04 - LEFT JOIN (LEFT OUTER JOIN)"
description: "LEFT OUTER JOIN in depth: preserving every left row, NULL-extended right columns, the WHERE trap that turns a LEFT JOIN into an inner join, anti-joins with IS NULL, aggregates over optional rows, and filtering the optional side in the ON clause."
chapter: 7
section: 7.04
category: Data Query Language (DQL)
difficulty: Beginner → Advanced
readingTime: 40 min
lastUpdated: 2026-09-22
---

# 07.04 LEFT JOIN (LEFT OUTER JOIN)

---

# Learning Objectives

After completing this section, you will be able to:

- Write `LEFT JOIN` and explain what it preserves.
- Predict which columns become `NULL` and why.
- Recognise the `WHERE` trap that silently converts a left join to an inner join.
- Filter the optional side correctly, in `ON`.
- Write the `IS NULL` anti-join pattern.
- Aggregate safely over optional rows with `COUNT` and `COALESCE`.

---

# What is a LEFT JOIN?

A left outer join returns **every row from the left table**, matched with rows from the right table where the condition holds. Left rows with no match still appear—with `NULL` in every right-hand column.

```sql
SELECT
    c.CustomerName,
    o.OrderID,
    o.TotalAmount
FROM Customers AS c
LEFT JOIN Orders AS o
    ON o.CustomerID = c.CustomerID;
```

```text
Customers                      Orders
┌────┬───────┐                 ┌─────┬────┬────────┐
│ 1  │ Ada   │                 │ 101 │ 1  │ 250.00 │
│ 2  │ Grace │                 │ 102 │ 1  │  80.00 │
│ 3  │ Linus │                 │ 103 │ 2  │ 500.00 │
└────┴───────┘                 └─────┴────┴────────┘

LEFT JOIN result
┌───────┬──────┬────────┐
│ Ada   │ 101  │ 250.00 │
│ Ada   │ 102  │  80.00 │
│ Grace │ 103  │ 500.00 │
│ Linus │ NULL │ NULL   │   ← preserved, right side NULL-extended
└───────┴──────┴────────┘
```

`LEFT JOIN` and `LEFT OUTER JOIN` are the same thing; `OUTER` is optional.

---

# NULL Extension

When no right row matches, the engine manufactures one made entirely of `NULL`s. This is called **NULL extension**, and it applies to *every* column of the right table:

```text
Linus │ NULL (OrderID) │ NULL (OrderDate) │ NULL (TotalAmount)
```

Consequences worth internalising:

- Any expression over a right column becomes `NULL` (`o.TotalAmount * 1.1` → `NULL`).
- `COUNT(o.OrderID)` counts 0 for that row, while `COUNT(*)` counts 1.
- A `NULL`-extended row is indistinguishable from a matched row whose value genuinely *is* `NULL`—unless you test a `NOT NULL` column such as the right table's primary key.

---

# The WHERE Trap

This is the single most common outer-join bug in production SQL.

```sql
-- ❌ Looks like a LEFT JOIN, behaves like an INNER JOIN
SELECT
    c.CustomerName,
    o.OrderID
FROM Customers AS c
LEFT JOIN Orders AS o
    ON o.CustomerID = c.CustomerID
WHERE o.TotalAmount > 100;
```

Why it fails:

```text
Step 2 (JOIN)        Linus │ NULL │ NULL      ← preserved here

Step 3 (WHERE)       NULL > 100  →  UNKNOWN   ← not TRUE
                     Linus is removed
```

The `WHERE` clause runs *after* the join, and any comparison against a `NULL`-extended column yields UNKNOWN, which fails the filter. The left row is discarded, and the outer join has been undone.

The fix is to put the condition where it belongs—on the join:

```sql
-- ✅ Every customer kept; only their >100 orders shown
SELECT
    c.CustomerName,
    o.OrderID
FROM Customers AS c
LEFT JOIN Orders AS o
    ON  o.CustomerID = c.CustomerID
    AND o.TotalAmount > 100;
```

```text
ON  filters which right rows are eligible to match
WHERE filters the combined result, optional rows included
```

Section 07.11 formalises this rule for every outer-join case.

---

# When WHERE Is Correct

Filtering the **left** table in `WHERE` is fine—those rows are never `NULL`-extended:

```sql
SELECT
    c.CustomerName,
    o.OrderID
FROM Customers AS c
LEFT JOIN Orders AS o
    ON o.CustomerID = c.CustomerID
WHERE c.Country = 'Australia';     -- ✅ left table, safe
```

| Condition on | Put it in | Effect |
|--------------|-----------|--------|
| Left (preserved) table | `WHERE` | Restricts which left rows appear |
| Right (optional) table | `ON` | Restricts which right rows match |
| Right table, deliberately | `WHERE` | Converts to an inner join |
| Right table `IS NULL` | `WHERE` | Anti-join (below) |

---

# The Anti-Join Pattern

Testing a right-hand `NOT NULL` column for `NULL` after a left join returns exactly the unmatched left rows:

```sql
SELECT
    c.CustomerName
FROM Customers AS c
LEFT JOIN Orders AS o
    ON o.CustomerID = c.CustomerID
WHERE o.OrderID IS NULL;          -- only NULL-extended rows survive
```

```text
After the join:
  Ada   │ 101   ← matched
  Ada   │ 102   ← matched
  Grace │ 103   ← matched
  Linus │ NULL  ← NULL-extended

WHERE o.OrderID IS NULL keeps only Linus
```

Two requirements make this pattern safe:

1. Test a column that is `NOT NULL` in the right table—its primary key is ideal. Testing a nullable column also removes matched rows that happen to hold `NULL`.
2. Remember it is `IS NULL`, never `= NULL`.

Section 07.13 compares this form with `NOT EXISTS`, which is usually clearer and often faster.

---

# Counting and Aggregating Optional Rows

`COUNT(*)` counts the `NULL`-extended row; `COUNT(column)` does not:

```sql
SELECT
    c.CustomerName,
    COUNT(*)          AS wrong_count,
    COUNT(o.OrderID)  AS order_count,
    COALESCE(SUM(o.TotalAmount), 0) AS total_spent
FROM Customers AS c
LEFT JOIN Orders AS o
    ON o.CustomerID = c.CustomerID
GROUP BY c.CustomerID, c.CustomerName;
```

```text
CustomerName │ wrong_count │ order_count │ total_spent
─────────────┼─────────────┼─────────────┼────────────
Ada          │ 2           │ 2           │ 330.00
Grace        │ 1           │ 1           │ 500.00
Linus        │ 1  ← wrong  │ 0  ← right  │ 0.00
```

Rules for outer-join aggregates:

- `COUNT(*)` counts rows, including manufactured ones. Use `COUNT(right_key)`.
- `SUM` over no rows returns `NULL`, not `0`. Wrap it in `COALESCE` if the report needs a zero.
- `AVG` ignores `NULL`s, so it averages only matched rows—usually what you want, but state it deliberately.

---

# LEFT JOIN with Multiple Tables

Once a join is outer, everything downstream of it must stay outer, or the preservation is lost:

```sql
-- ❌ The inner join to Products discards customers with no order
SELECT c.CustomerName, p.ProductName
FROM Customers AS c
LEFT JOIN OrderItems AS oi ON oi.CustomerID = c.CustomerID
INNER JOIN Products  AS p  ON p.ProductID   = oi.ProductID;
```

```sql
-- ✅ Chain stays outer
SELECT c.CustomerName, p.ProductName
FROM Customers AS c
LEFT JOIN OrderItems AS oi ON oi.CustomerID = c.CustomerID
LEFT JOIN Products   AS p  ON p.ProductID   = oi.ProductID;
```

The reason is the same `NULL`-extension rule: after the first left join, `oi.ProductID` is `NULL` for unmatched customers, and an inner join on `NULL` matches nothing, so the row disappears.

---

# Visual Representation

```text
       Customers (left)              Orders (right)
      ┌───────────────┐             ┌───────────────┐
      │███████████████│             │               │
      │██████████┌────┼─────────────┼────┐          │
      │██████████│████████████████████   │          │
      │██████████└────┼─────────────┼────┘          │
      │███████████████│             │               │
      └───────────────┘             └───────────────┘
        all preserved                 only matches

  unmatched left rows → right columns filled with NULL
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN    ← LEFT JOIN preserves left rows and NULL-extends here
3. WHERE   ← a filter on right columns removes them again
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

Steps 2 and 3 in that order are the entire explanation of the `WHERE` trap: preservation happens first, filtering second.

---

# How the DBMS Executes This

```text
FROM Customers c LEFT JOIN Orders o ON o.CustomerID = c.CustomerID

↓

Customers is the preserved (outer) side — it must be read in full

↓

For each customer row:
    probe Orders for matching CustomerID

↓

Matches found?
    yes → emit one row per match
    no  → emit one row, right columns = NULL

↓

Pass to WHERE
```

Because the left side must be read in full, an optimizer has less freedom here than with an inner join: it cannot drop the preserved table even if the query selects nothing from it, and it cannot reorder the two sides.

---

# 🔬 Engine Deep Dive

Most engines implement outer joins as an inner join plus a "no match was found" flag per outer row. In a hash join, the build side is probed and unmatched rows are emitted at the end; in a nested loop, a per-row boolean records whether any match was produced. This is why an outer join costs slightly more than the equivalent inner join even when every row matches—the bookkeeping happens regardless.

---

# 🏗️ Architecture Insight

`LEFT JOIN` encodes optionality: "this relationship may be absent, and its absence is part of the answer." That matches how most business data actually behaves—customers without orders, employees without managers, products without reviews. When a schema uses a nullable foreign key, a left join is usually the honest way to read it.

---

# ⚡ Performance Tip

A left join to a table you never select from, and never filter on, is pure cost—and a surprisingly common leftover after refactoring. Some optimizers can eliminate such a join when a unique constraint proves it cannot duplicate rows; most cannot. Delete it yourself.

---

# 🌍 Production Consideration

"The dashboard is missing customers" is nearly always this bug: a left join whose optional side is filtered in `WHERE`. Reviewing every outer join for conditions on its optional side—and moving them into `ON`—is one of the fastest wins available in a report codebase.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `LEFT [OUTER] JOIN` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `OUTER` optional | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Conditions in `ON` for outer joins | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Legacy syntax | — | — | — | `*=` (removed in 2012) | `(+)` | — |

> **Portability Tip:** Oracle's `WHERE o.CustomerID(+) = c.CustomerID` is a left join written the old way. It cannot express everything ANSI outer joins can, cannot be combined with `OR`, and is not supported anywhere else. Rewrite it as `LEFT JOIN`.

---

# Common Mistakes

### Mistake 1

Filtering the optional table in `WHERE`, turning the left join into an inner join.

---

### Mistake 2

Using `COUNT(*)` after a left join and reporting 1 for rows that have no matches.

---

### Mistake 3

Testing a nullable column for the anti-join pattern instead of the right table's primary key.

---

### Mistake 4

Following a left join with an inner join, which discards the rows the left join preserved.

---

# Best Practices

✔ Put conditions on the optional table in `ON`, not `WHERE`.

✔ Use `COUNT(right_key)`, not `COUNT(*)`, after an outer join.

✔ Wrap outward-facing `SUM()` in `COALESCE(..., 0)`.

✔ Use the right table's primary key for `IS NULL` anti-joins.

✔ Keep every join after an outer join outer as well.

✔ Remove outer joins whose columns are never used.

---

# Interview Questions

## Basic

1. What does a `LEFT JOIN` return?
2. Is `OUTER` required in `LEFT OUTER JOIN`?
3. What value do right-hand columns take when no match exists?

## Intermediate

4. Why does a `WHERE` condition on the right table turn a left join into an inner join?
5. How do you write the same condition so that the left join is preserved?
6. Why is `COUNT(*)` wrong after a left join?

## Advanced

7. How do you find left rows with no match, and why must the tested column be `NOT NULL`?
8. Why can an optimizer not reorder the two sides of a left join?
9. What happens when an inner join follows a left join in the same query?

---

# Hands-on Exercises

## Exercise 1

List every customer with their orders, including customers who have never ordered.

---

## Exercise 2

List every customer with only their orders above 100, keeping all customers.

---

## Exercise 3

Find customers who have never placed an order, using the `IS NULL` pattern.

---

## Exercise 4

Produce order count and total spend per customer, showing `0` for customers with no orders.

---

# Related Topics

- **07.03 — INNER JOIN**
- **07.05 — RIGHT JOIN (RIGHT OUTER JOIN)**
- **07.11 — ON vs WHERE (Join Conditions and Filters)**
- **07.12 — NULL Handling in JOINs**
- **07.13 — Semi-Joins and Anti-Joins (EXISTS and NOT EXISTS)**
- **06.08 — NULL Handling in WHERE (Three-Valued Logic)**

---

# Summary

`LEFT JOIN` preserves every row of the left table and fills the right table's columns with `NULL` when no match exists. That `NULL` extension explains everything else about it: a `WHERE` condition on the optional side evaluates to UNKNOWN for preserved rows and silently converts the query into an inner join, `COUNT(*)` over-counts, `SUM` returns `NULL` instead of zero, and a following inner join undoes the preservation. Put conditions on the optional table in `ON`, filter the preserved table in `WHERE`, and use the right table's primary key when testing `IS NULL` to find rows with no match.
