---
title: "08.12 - ROLLUP, CUBE and GROUPING SETS"
description: "Multi-level aggregation in one query: GROUPING SETS, ROLLUP for hierarchical subtotals, CUBE for every combination, the GROUPING function to tell subtotal rows from NULL data, labelling and ordering totals, and vendor syntax differences."
chapter: 8
section: 8.12
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 40 min
lastUpdated: 2026-09-24
---

# 08.12 ROLLUP, CUBE and GROUPING SETS

---

# Learning Objectives

After completing this section, you will be able to:

- Produce several groupings in one query with `GROUPING SETS`.
- Add hierarchical subtotals and a grand total with `ROLLUP`.
- Produce every combination of subtotals with `CUBE`.
- Distinguish subtotal rows from real `NULL` values with `GROUPING()`.
- Label and order subtotal rows for presentation.
- Write the MySQL and SQLite equivalents.

---

# The Problem: Totals at Several Levels

A sales report often needs detail rows, subtotals and a grand total together:

```text
Country     Status      Revenue
─────────   ─────────   ───────
Australia   Pending        80
Australia   Shipped       870
Australia   (subtotal)    950
Canada      Shipped       400
Canada      (subtotal)    400
(total)                  1350
```

With plain `GROUP BY`, that is three queries—one per level—glued with `UNION ALL`, reading the table three times. Grouping extensions produce every level in one statement.

---

# GROUPING SETS

`GROUPING SETS` lists the groupings you want explicitly. Each set in the list is computed as if it were its own `GROUP BY`, and the results are combined.

```sql
SELECT
    c.Country,
    o.Status,
    SUM(o.TotalAmount) AS Revenue
FROM Orders AS o
INNER JOIN Customers AS c ON c.CustomerID = o.CustomerID
GROUP BY GROUPING SETS (
    (c.Country, o.Status),   -- detail
    (c.Country),             -- subtotal per country
    ()                       -- grand total
);
```

```text
Country     Status    Revenue
Australia   Pending      80
Australia   Shipped     870
Canada      Shipped     400
Australia   NULL        950      ← (Country) set: Status not grouped → NULL
Canada      NULL        400
NULL        NULL       1350      ← () set: nothing grouped
```

Columns that are not part of a row's grouping set appear as `NULL`. The empty set `()` is the grand total.

`GROUPING SETS` is equivalent to a `UNION ALL` of separate `GROUP BY` queries—but the engine can compute all of them from a single read of the data.

---

# ROLLUP

`ROLLUP` is shorthand for a **hierarchy** of grouping sets, removing columns from the right:

```sql
GROUP BY ROLLUP (a, b, c)

-- is the same as

GROUP BY GROUPING SETS (
    (a, b, c),
    (a, b),
    (a),
    ()
)
```

It fits natural hierarchies: year → quarter → month, country → region → city, category → product.

```sql
SELECT
    EXTRACT(YEAR FROM OrderDate)    AS OrderYear,
    EXTRACT(QUARTER FROM OrderDate) AS OrderQuarter,
    SUM(TotalAmount)                AS Revenue
FROM Orders
GROUP BY ROLLUP (
    EXTRACT(YEAR FROM OrderDate),
    EXTRACT(QUARTER FROM OrderDate)
);
```

```text
OrderYear   OrderQuarter   Revenue
2025        3              4,100
2025        4              5,200
2025        NULL           9,300     ← year subtotal
2026        1              6,000
2026        2              7,400
2026        NULL          13,400     ← year subtotal
NULL        NULL          22,700     ← grand total
```

The order of columns in `ROLLUP` matters—`ROLLUP (Quarter, Year)` would total each quarter number across years, which is rarely meaningful.

---

# CUBE

`CUBE` produces **every** combination of its columns—2ⁿ grouping sets for n columns:

```sql
GROUP BY CUBE (Country, Status)

-- is the same as

GROUP BY GROUPING SETS (
    (Country, Status),
    (Country),
    (Status),
    ()
)
```

```sql
SELECT
    c.Country,
    o.Status,
    COUNT(*) AS Orders
FROM Orders AS o
INNER JOIN Customers AS c ON c.CustomerID = o.CustomerID
GROUP BY CUBE (c.Country, o.Status);
```

Use `CUBE` for cross-tab style analysis where every margin is wanted—totals per country, per status, and overall. With four columns it yields 16 grouping sets; with ten, 1,024. Keep it to a few low-cardinality columns.

---

# Choosing Between Them

| Need | Use |
|------|-----|
| A hierarchy with subtotals at each level | `ROLLUP` |
| Every combination of margins | `CUBE` |
| A specific, hand-picked set of groupings | `GROUPING SETS` |
| Only a grand total row appended | `ROLLUP` on the last level, or `GROUPING SETS ((…), ())` |

They can be combined: `GROUP BY Country, ROLLUP (Year, Quarter)` produces a year/quarter rollup **within** each country (the plain column is part of every set).

---

# GROUPING(): Subtotal or Real NULL?

A subtotal row shows `NULL` in the rolled-up column. But the data itself may contain `NULL`—customers with no country, for example. The two look identical:

```text
Country   Revenue
NULL      75         ← customers whose Country is NULL?
NULL      1350       ← or the grand total?
```

`GROUPING(column)` returns `1` when the column is aggregated away in that row (a subtotal) and `0` when it is a real grouping value:

```sql
SELECT
    c.Country,
    GROUPING(c.Country) AS IsCountryTotal,
    SUM(o.TotalAmount)  AS Revenue
FROM Orders AS o
INNER JOIN Customers AS c ON c.CustomerID = o.CustomerID
GROUP BY ROLLUP (c.Country);
```

```text
Country     IsCountryTotal   Revenue
Australia   0                950
Canada      0                400
NULL        0                 75      ← real NULL country
NULL        1               1425      ← grand total
```

---

# Labelling Subtotal Rows

Use `GROUPING()` to turn subtotal `NULL`s into labels without touching real `NULL`s:

```sql
SELECT
    CASE
        WHEN GROUPING(c.Country) = 1 THEN 'All countries'
        ELSE COALESCE(c.Country, '(Unknown)')
    END AS Country,
    CASE
        WHEN GROUPING(o.Status) = 1 THEN 'All statuses'
        ELSE o.Status
    END AS Status,
    SUM(o.TotalAmount) AS Revenue
FROM Orders AS o
INNER JOIN Customers AS c ON c.CustomerID = o.CustomerID
GROUP BY ROLLUP (c.Country, o.Status)
ORDER BY
    GROUPING(c.Country), c.Country,
    GROUPING(o.Status),  o.Status;
```

Ordering by `GROUPING()` first places each subtotal after its detail rows and the grand total last. Without an explicit `ORDER BY`, subtotal rows may appear anywhere.

SQL Server and Oracle also provide `GROUPING_ID(a, b, …)`, which returns all the flags as one bit-mask integer—useful to filter to a particular level. PostgreSQL's `GROUPING(a, b)` accepts several columns and returns the same bit-mask.

---

# Filtering Levels with HAVING

`HAVING` applies to every row, including subtotals. Use `GROUPING()` to target a level:

```sql
-- Only country subtotals above 500, plus the grand total
SELECT c.Country, SUM(o.TotalAmount) AS Revenue
FROM Orders AS o
INNER JOIN Customers AS c ON c.CustomerID = o.CustomerID
GROUP BY ROLLUP (c.Country)
HAVING GROUPING(c.Country) = 1
    OR SUM(o.TotalAmount) > 500;
```

---

# MySQL and SQLite

MySQL supports only `ROLLUP`, with its own syntax, and `GROUPING()` from 8.0:

```sql
-- MySQL
SELECT Country, Status, SUM(TotalAmount) AS Revenue
FROM ...
GROUP BY Country, Status WITH ROLLUP;
```

MySQL has no `CUBE` or `GROUPING SETS`, and SQLite has none of the three. On those engines, write the grouping sets out with `UNION ALL`:

```sql
SELECT Country, Status, SUM(TotalAmount) AS Revenue, 0 AS Level
FROM v_orders GROUP BY Country, Status
UNION ALL
SELECT Country, NULL, SUM(TotalAmount), 1
FROM v_orders GROUP BY Country
UNION ALL
SELECT NULL, NULL, SUM(TotalAmount), 2
FROM v_orders
ORDER BY Level, Country, Status;
```

The explicit `Level` column plays the role of `GROUPING()`. The cost is one pass over the data per branch.

---

# Visual Representation

```text
ROLLUP (Year, Quarter)                     CUBE (Country, Status)

(Year, Quarter)  ████████ detail           (Country, Status) ████ detail
(Year)           ████     year totals      (Country)         ███  country margins
()               █        grand total      (Status)          ███  status margins
                                           ()                █    grand total

  n + 1 levels                                2ⁿ levels
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE
4. GROUP BY    ← every grouping set is computed here
5. HAVING      ← applies to detail and subtotal rows alike
6. SELECT      ← GROUPING() tells them apart
7. DISTINCT
8. ORDER BY    ← order by GROUPING() to place subtotals
9. LIMIT / FETCH / TOP
```

`WHERE` filters rows before any subtotal is computed, so subtotals always equal the sum of their filtered details.

---

# How the DBMS Executes This

```text
GROUP BY ROLLUP (Year, Quarter)

Sorted input by (Year, Quarter)
    one pass maintains accumulators for all levels:
        (Year, Quarter) → emit when Quarter changes
        (Year)          → emit when Year changes
        ()              → emit at end

GROUPING SETS / CUBE
    PostgreSQL: MixedAggregate — several hash tables, or several sorts
    SQL Server / Oracle: shared scan, spool, or combined sorts
```

`ROLLUP` fits a single sorted pass because its sets nest. `CUBE` and arbitrary `GROUPING SETS` need either several hash tables at once or several sort orders—still usually cheaper than re-reading the table per set.

---

# 🔬 Engine Deep Dive

Aggregates such as `SUM`, `COUNT`, `MIN` and `MAX` can compute a higher level from the results of the level below (the country subtotal is the sum of that country's detail sums). `COUNT(DISTINCT x)` and median-style aggregates cannot—distinct counts do not add up—so engines must compute those levels from the underlying rows, which is markedly more expensive for large `CUBE`s.

---

# 🏗️ Architecture Insight

`CUBE` is the relational origin of the OLAP cube: pre-computing every combination of dimension totals so that any slice can be read instantly. Modern analytical engines compute these on demand, but the concept remains: when a dashboard slices the same measures by the same few dimensions all day, materializing a `GROUPING SETS` result on a schedule is often the right design.

---

# ⚡ Performance Tip

One `ROLLUP` over a table beats a `UNION ALL` of several `GROUP BY` queries: the data is read once. Filter as much as possible in `WHERE` first, and keep `CUBE` to a small number of low-cardinality columns—its result size grows with the product of their distinct values.

---

# 🌍 Production Consideration

Subtotal rows reaching an application or export that expects only detail rows cause double counting downstream—someone sums the column in a spreadsheet and gets twice the real total. Always mark subtotal rows explicitly (a level column or label), and give consumers a way to exclude them.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `ROLLUP (…)` | ✅ | ✅ (9.5+) | `WITH ROLLUP` | ✅ | ✅ | ❌ |
| `CUBE (…)` | ✅ | ✅ (9.5+) | ❌ | ✅ | ✅ | ❌ |
| `GROUPING SETS (…)` | ✅ | ✅ (9.5+) | ❌ | ✅ | ✅ | ❌ |
| `GROUPING(col)` | ✅ | ✅ (multi-column) | ✅ (8.0+) | ✅ | ✅ | ❌ |
| `GROUPING_ID(…)` | ❌ | ❌ (use `GROUPING(a, b)`) | ❌ | ✅ | ✅ | ❌ |

> **Portability Tip:** `UNION ALL` of plain `GROUP BY` queries with an explicit level column works everywhere. Use the grouping extensions when every target engine supports them; on MySQL, restrict yourself to `WITH ROLLUP`.

---

# Common Mistakes

### Mistake 1

Treating every `NULL` in a rollup result as a subtotal, confusing it with real `NULL` data.

---

### Mistake 2

Omitting `ORDER BY` and expecting subtotals to follow their details.

---

### Mistake 3

Listing `ROLLUP` columns in the wrong hierarchical order.

---

### Mistake 4

Using `CUBE` on many or high-cardinality columns.

---

### Mistake 5

Exporting subtotal rows unmarked, so consumers sum them again.

---

# Best Practices

✔ Use `ROLLUP` for hierarchies, `CUBE` for margins, `GROUPING SETS` for anything specific.

✔ Label subtotal rows with `GROUPING()`, not `COALESCE`.

✔ Order by `GROUPING()` to place subtotals and the grand total.

✔ Filter in `WHERE` before computing multiple levels.

✔ Provide an explicit level column to downstream consumers.

---

# Interview Questions

## Basic

1. What does `ROLLUP (a, b)` produce?
2. What does the empty grouping set `()` represent?
3. Which engines support `CUBE`?

## Intermediate

4. How is `GROUPING SETS` related to `UNION ALL`?
5. How many grouping sets does `CUBE (a, b, c)` produce?
6. How do you tell a subtotal row from a row whose grouping column is `NULL`?

## Advanced

7. Why can `ROLLUP` be computed in a single sorted pass while `CUBE` generally cannot?
8. Why is `COUNT(DISTINCT x)` expensive under `CUBE`?
9. How do you write a rollup with subtotals on SQLite?

---

# Hands-on Exercises

## Exercise 1

Return revenue per year and quarter, with year subtotals and a grand total, using `ROLLUP`.

---

## Exercise 2

Return order counts by country and status with every margin, using `CUBE`.

---

## Exercise 3

Label subtotal rows as `All countries` / `All statuses`, keeping real `NULL` countries as `(Unknown)`.

---

## Exercise 4

Rewrite Exercise 1 with `UNION ALL` for an engine without `ROLLUP`.

---

# Related Topics

- **08.06 — Grouping by Multiple Columns and Expressions**
- **08.04 — NULL Handling in Aggregates**
- **08.08 — HAVING**
- **08.14 — Execution Flow of GROUP BY (Hash and Stream Aggregation)**
- **11.xx — Window Functions**

---

# Summary

`GROUPING SETS` computes several groupings in one query, as if their separate `GROUP BY` results were combined with `UNION ALL`; `ROLLUP` is shorthand for a hierarchy of sets ending in the grand total, and `CUBE` for every combination of its columns. Columns not grouped in a row appear as `NULL`, so `GROUPING()` is needed to distinguish subtotals from real `NULL` data, to label them and to order them. PostgreSQL, SQL Server and Oracle support all three; MySQL supports only `WITH ROLLUP`, and SQLite none, where a `UNION ALL` with an explicit level column is the portable equivalent.
