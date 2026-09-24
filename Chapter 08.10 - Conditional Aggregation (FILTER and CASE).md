---
title: "08.10 - Conditional Aggregation (FILTER and CASE)"
description: "Computing several conditional totals in one pass: CASE inside aggregates, the standard FILTER clause, conditional counts, sums, averages and ratios, pivoting rows into columns, and the NULL and ELSE details that decide correctness."
chapter: 8
section: 8.10
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 35 min
lastUpdated: 2026-09-24
---

# 08.10 Conditional Aggregation (FILTER and CASE)

---

# Learning Objectives

After completing this section, you will be able to:

- Compute several conditional aggregates in a single query.
- Write conditional aggregates with `CASE` on every engine.
- Use the standard `FILTER (WHERE ...)` clause where it is supported.
- Choose correctly between `ELSE 0` and no `ELSE`.
- Compute ratios and percentages per group.
- Pivot rows into columns with conditional aggregation.

---

# The Problem

"Per customer, how many orders were shipped, pending and cancelled, and how much revenue did the shipped ones bring?"

Three separate grouped queries would read `Orders` three times and still need joining. `WHERE` cannot help: it can only keep one set of rows for the whole query.

Conditional aggregation computes every figure in **one pass**, by making each aggregate look only at the rows it cares about.

```sql
SELECT
    CustomerID,
    COUNT(*)                                                     AS AllOrders,
    COUNT(CASE WHEN Status = 'Shipped'   THEN 1 END)             AS Shipped,
    COUNT(CASE WHEN Status = 'Pending'   THEN 1 END)             AS Pending,
    COUNT(CASE WHEN Status = 'Cancelled' THEN 1 END)             AS Cancelled,
    SUM(CASE WHEN Status = 'Shipped' THEN TotalAmount ELSE 0 END) AS ShippedRevenue
FROM Orders
GROUP BY CustomerID;
```

```text
CustomerID │ AllOrders │ Shipped │ Pending │ Cancelled │ ShippedRevenue
───────────┼───────────┼─────────┼─────────┼───────────┼───────────────
1          │ 2         │ 1       │ 1       │ 0         │ 250.00
2          │ 2         │ 2       │ 0       │ 0         │ 620.00
3          │ 1         │ 0       │ 0       │ 1         │   0.00
```

---

# How CASE Inside an Aggregate Works

The `CASE` expression is evaluated **per row**, before the aggregate sees the value. Rows that do not match produce either `NULL` (no `ELSE`) or the `ELSE` value.

```text
Row      Status      CASE WHEN Status='Shipped' THEN TotalAmount END
101      Shipped     250.00
102      Pending     NULL          ← skipped by SUM, COUNT, AVG
103      Shipped     500.00
```

Because aggregates skip `NULL`, the aggregate effectively sees only the matching rows.

---

# ELSE 0 or No ELSE?

The choice matters for every aggregate except `SUM`, and even `SUM` differs on groups with no matching rows.

| Aggregate | `CASE ... END` (no `ELSE`) | `CASE ... ELSE 0 END` |
|-----------|---------------------------|----------------------|
| `COUNT` | Counts matching rows ✅ | Counts **all** rows ❌ |
| `SUM` | `NULL` if nothing matches | `0` if nothing matches |
| `AVG` | Average of matching rows ✅ | Average with zeros mixed in ❌ |
| `MIN` / `MAX` | Over matching rows ✅ | `0` competes as a value ❌ |

```sql
SELECT
    COUNT(CASE WHEN Status = 'Shipped' THEN 1 END)        AS ShippedCount,   -- ✅
    COUNT(CASE WHEN Status = 'Shipped' THEN 1 ELSE 0 END) AS WrongCount,     -- ❌ counts every row
    AVG(CASE WHEN Status = 'Shipped' THEN TotalAmount END) AS AvgShipped     -- ✅
FROM Orders;
```

Rules of thumb:

- `COUNT`, `AVG`, `MIN`, `MAX`: **no `ELSE`**.
- `SUM`: `ELSE 0` when a zero is wanted for groups with no matches; otherwise no `ELSE` and `COALESCE` outside.
- `SUM(CASE WHEN ... THEN 1 ELSE 0 END)` is a common, correct way to count—it just returns `0` rather than `NULL` on empty input.

---

# The FILTER Clause

SQL:2003 added a clause that states the intent directly:

```sql
SELECT
    CustomerID,
    COUNT(*)                                          AS AllOrders,
    COUNT(*)         FILTER (WHERE Status = 'Shipped')   AS Shipped,
    COUNT(*)         FILTER (WHERE Status = 'Pending')   AS Pending,
    SUM(TotalAmount) FILTER (WHERE Status = 'Shipped')   AS ShippedRevenue,
    AVG(TotalAmount) FILTER (WHERE OrderDate >= DATE '2026-07-01') AS AvgH2
FROM Orders
GROUP BY CustomerID;
```

`FILTER` is supported by PostgreSQL (9.4+) and SQLite (3.30+). MySQL, SQL Server and Oracle do not support it; use `CASE` there.

Advantages over `CASE`:

- no `ELSE` question: non-matching rows are simply not fed to the aggregate;
- works with `COUNT(*)`, which has no argument to wrap in `CASE`;
- works with every aggregate, including `STRING_AGG` and ordered-set aggregates.

Semantics are identical: a `FILTER`ed `SUM` with no matching rows returns `NULL`, like a `CASE` with no `ELSE`.

---

# Ratios and Percentages

Conditional aggregates combine naturally into ratios:

```sql
SELECT
    CustomerID,
    COUNT(*) AS Orders,
    ROUND(
        100.0 * COUNT(CASE WHEN Status = 'Cancelled' THEN 1 END) / COUNT(*),
        1
    ) AS CancelRatePct
FROM Orders
GROUP BY CustomerID;
```

Two details:

- Multiply by `100.0`, not `100`, so integer division does not truncate the result to `0` (Section 08.02).
- `COUNT(*)` is never zero inside a group, so the division is safe here. In a whole-table aggregate or with a conditional denominator, guard it: `NULLIF(denominator, 0)`.

The `AVG` of a 1/0 flag gives the same proportion more compactly:

```sql
AVG(CASE WHEN Status = 'Cancelled' THEN 1.0 ELSE 0 END) AS CancelRate
```

Here `ELSE 0` is required—the zeros are part of the average.

---

# Pivoting Rows into Columns

Conditional aggregation turns values of one column into separate output columns—a **pivot**:

```sql
-- Revenue per customer, one column per quarter of 2026
SELECT
    CustomerID,
    SUM(CASE WHEN OrderDate <  DATE '2026-04-01'                                THEN TotalAmount ELSE 0 END) AS Q1,
    SUM(CASE WHEN OrderDate >= DATE '2026-04-01' AND OrderDate < DATE '2026-07-01' THEN TotalAmount ELSE 0 END) AS Q2,
    SUM(CASE WHEN OrderDate >= DATE '2026-07-01' AND OrderDate < DATE '2026-10-01' THEN TotalAmount ELSE 0 END) AS Q3,
    SUM(CASE WHEN OrderDate >= DATE '2026-10-01'                                THEN TotalAmount ELSE 0 END) AS Q4
FROM Orders
WHERE OrderDate >= DATE '2026-01-01'
  AND OrderDate <  DATE '2027-01-01'
GROUP BY CustomerID;
```

```text
Rows (long)                              Pivoted (wide)
CustomerID  Quarter  Revenue             CustomerID   Q1     Q2    Q3    Q4
1           Q1       330                 1            330    0     0     0
2           Q1       500          ──→    2            500    120   0     0
2           Q2       120
```

The output columns must be known when the query is written. A pivot over values that change—"one column per product"—needs dynamic SQL or, better, is done in the reporting tool. SQL Server and Oracle offer a `PIVOT` operator, which is shorthand for the same aggregation and has the same fixed-column limitation.

---

# Conditional Aggregation vs WHERE

| Need | Use |
|------|-----|
| One subset for the whole query | `WHERE` |
| Several subsets, side by side | Conditional aggregation |
| Qualify groups on all rows, report on some | Conditional aggregation + `HAVING` |

```sql
-- Customers with at least one cancellation, with their shipped revenue
SELECT
    CustomerID,
    SUM(CASE WHEN Status = 'Shipped' THEN TotalAmount ELSE 0 END) AS ShippedRevenue
FROM Orders
GROUP BY CustomerID
HAVING COUNT(CASE WHEN Status = 'Cancelled' THEN 1 END) > 0;
```

A `WHERE` clause can still narrow the input for all the conditional aggregates at once—for example to a date range—which keeps the query efficient.

---

# Visual Representation

```text
               one pass over the group's rows
           ┌───────────────────────────────────────┐
row ──────→│ COUNT(*)                     ▪ ▪ ▪ ▪ ▪ │
           │ COUNT … Shipped              ▪   ▪ ▪   │
           │ COUNT … Pending                ▪       │
           │ SUM   … Shipped revenue      $   $ $   │
           └───────────────────────────────────────┘
             each aggregate sees only its own rows
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← narrows the rows for every aggregate
4. GROUP BY    ← each conditional aggregate picks its own rows here
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

`WHERE` applies one filter to all aggregates; `CASE` and `FILTER` apply a different filter to each, during grouping.

---

# How the DBMS Executes This

```text
for each row:
    group = lookup(CustomerID)
    group.all_count += 1
    if Status = 'Shipped':   group.shipped_count += 1
                             group.shipped_sum   += TotalAmount
    if Status = 'Pending':   group.pending_count += 1
    ...
```

The table is read once. Each conditional aggregate adds one comparison per row—negligible next to the cost of reading the row—so ten conditional totals cost barely more than one.

---

# 🔬 Engine Deep Dive

PostgreSQL implements `FILTER` by skipping the aggregate's transition function for non-matching rows, so `SUM(x) FILTER (WHERE ...)` does not even evaluate `x` on skipped rows. The `CASE` form evaluates the `CASE` on every row and passes `NULL` to the transition function, which then ignores it. The results are identical; `FILTER` is marginally cheaper and considerably clearer.

---

# 🏗️ Architecture Insight

Conditional aggregation is how a single fact table feeds a wide summary: one row per customer, one column per metric. Many dashboards are one query of this shape. Keeping the metric definitions—"shipped", "active", "churned"—in one place, such as a view, stops each report from inventing its own slightly different `CASE`.

---

# ⚡ Performance Tip

Replacing N separate grouped queries (or N correlated subqueries in `SELECT`) with one conditional aggregation typically cuts the work by nearly a factor of N: the table is read once instead of N times.

---

# 🌍 Production Consideration

Status values change: a new `'Refunded'` status appears, and every `CASE` that listed the existing values silently ignores it. Include a catch-all column—`COUNT(CASE WHEN Status NOT IN ('Shipped', 'Pending', 'Cancelled') THEN 1 END) AS OtherStatus`—in operational reports so that unexpected values are visible instead of vanishing.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `CASE` inside aggregates | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `FILTER (WHERE …)` | ✅ | ✅ (9.4+) | ❌ | ❌ | ❌ | ✅ (3.30+) |
| `PIVOT` operator | ❌ | ❌ (`crosstab` extension) | ❌ | ✅ | ✅ | ❌ |
| `IF(cond, a, b)` shorthand | ❌ | ❌ | ✅ | `IIF` | ❌ | `IIF` (3.32+) |

> **Portability Tip:** `CASE WHEN ... THEN ... END` inside an aggregate works everywhere and is the form to use in shared code. MySQL's `SUM(Status = 'Shipped')`—summing a boolean—also works on MySQL and SQLite but nowhere else.

---

# Common Mistakes

### Mistake 1

`COUNT(CASE WHEN ... THEN 1 ELSE 0 END)`, which counts every row.

---

### Mistake 2

`AVG(CASE WHEN ... THEN x ELSE 0 END)` when the intent was the average of matching rows.

---

### Mistake 3

Integer division in a percentage: `100 * shipped / total`.

---

### Mistake 4

Running one grouped query per status instead of one conditional aggregation.

---

### Mistake 5

Listing known status values with no catch-all, hiding new ones.

---

# Best Practices

✔ Use `FILTER` where supported; `CASE` with no `ELSE` elsewhere.

✔ Use `ELSE 0` only with `SUM` (to get zero) or with `AVG` of a 1/0 flag.

✔ Multiply by `100.0` and guard denominators with `NULLIF`.

✔ Keep a common `WHERE` for filters shared by all aggregates.

✔ Add an "other" column when grouping on a set of known values.

---

# Interview Questions

## Basic

1. What is conditional aggregation?
2. How do you count shipped orders and cancelled orders in the same query?
3. Which engines support `FILTER (WHERE ...)`?

## Intermediate

4. Why does `COUNT(CASE WHEN ... THEN 1 ELSE 0 END)` give the wrong answer?
5. How do you compute a cancellation rate per customer?
6. How do you pivot quarterly revenue into four columns?

## Advanced

7. Why can't `WHERE` replace conditional aggregation when several subsets are needed?
8. Why is `FILTER` marginally cheaper than `CASE` in PostgreSQL?
9. What are the limitations of a pivot written with conditional aggregation?

---

# Hands-on Exercises

## Exercise 1

For each customer, return the number of shipped, pending and cancelled orders.

---

## Exercise 2

Rewrite Exercise 1 with `FILTER`, if your engine supports it.

---

## Exercise 3

Return the cancellation rate per customer as a percentage with one decimal place.

---

## Exercise 4

Pivot 2026 revenue per customer into Q1–Q4 columns.

---

# Related Topics

- **08.02 — Aggregate Functions (COUNT, SUM, AVG, MIN, MAX)**
- **08.03 — COUNT Variants**
- **08.04 — NULL Handling in Aggregates**
- **08.09 — WHERE vs HAVING**
- **05.06 — Expressions & Calculated Columns**

---

# Summary

Conditional aggregation computes several subset totals in a single pass by making each aggregate see only its own rows—either with a `CASE` expression inside the aggregate, which works on every engine, or with the standard `FILTER (WHERE ...)` clause in PostgreSQL and SQLite. Omit `ELSE` for `COUNT`, `AVG`, `MIN` and `MAX`; use `ELSE 0` with `SUM` when a zero is wanted and with `AVG` of a 1/0 flag. The same technique yields ratios, percentages and fixed-column pivots, and it lets a group qualify on all its rows in `HAVING` while reporting only some of them.
