---
title: "07.06 - FULL OUTER JOIN"
description: "FULL OUTER JOIN explained: preserving unmatched rows from both sides, reconciliation and data-comparison patterns, COALESCE for merged keys, finding differences between two datasets, and emulating FULL OUTER JOIN on MySQL with UNION."
chapter: 7
section: 7.06
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 35 min
lastUpdated: 2026-09-22
---

# 07.06 FULL OUTER JOIN

---

# Learning Objectives

After completing this section, you will be able to:

- Write `FULL OUTER JOIN` and explain what it preserves.
- Read a result containing `NULL`s from either side.
- Use `COALESCE` to merge the two key columns.
- Apply full joins to reconciliation and data-comparison problems.
- Find rows present in only one of two datasets.
- Emulate a full outer join on databases that lack it.

---

# What is a FULL OUTER JOIN?

A full outer join returns **every row from both tables**: matched pairs, unmatched left rows (`NULL`-extended on the right), and unmatched right rows (`NULL`-extended on the left).

```sql
SELECT
    c.CustomerName,
    o.OrderID
FROM Customers AS c
FULL OUTER JOIN Orders AS o
    ON o.CustomerID = c.CustomerID;
```

```text
Customers                    Orders
┌────┬───────┐               ┌─────┬──────┐
│ 1  │ Ada   │               │ 101 │ 1    │
│ 2  │ Grace │               │ 103 │ 2    │
│ 3  │ Linus │ ← no orders   │ 104 │ NULL │ ← no customer
└────┴───────┘               └─────┴──────┘

FULL OUTER JOIN result
┌───────┬──────┐
│ Ada   │ 101  │   matched
│ Grace │ 103  │   matched
│ Linus │ NULL │   left only
│ NULL  │ 104  │   right only
└───────┴──────┘
```

`FULL JOIN` and `FULL OUTER JOIN` mean the same thing.

---

# The Three Row Categories

Every row of a full join belongs to exactly one category, and you can identify them with `IS NULL` tests on each side's key:

```sql
SELECT
    c.CustomerID,
    o.OrderID,
    CASE
        WHEN c.CustomerID IS NULL THEN 'right only'
        WHEN o.OrderID    IS NULL THEN 'left only'
        ELSE                           'matched'
    END AS row_category
FROM Customers AS c
FULL OUTER JOIN Orders AS o
    ON o.CustomerID = c.CustomerID;
```

```text
                 ┌──────────────┐
   left only  ───│ A only       │
                 ├──────────────┤
   matched    ───│ A ∩ B        │
                 ├──────────────┤
   right only ───│ B only       │
                 └──────────────┘
```

Both tests require `NOT NULL` columns—primary keys—for the same reason as in Section 07.04.

---

# Merging the Key Columns

After a full join, neither key column is complete on its own: each is `NULL` for the rows that came from the other side. `COALESCE` reassembles them:

```sql
SELECT
    COALESCE(c.CustomerID, o.CustomerID) AS customer_id,
    c.CustomerName,
    o.OrderID
FROM Customers AS c
FULL OUTER JOIN Orders AS o
    ON o.CustomerID = c.CustomerID;
```

```text
c.CustomerID │ o.CustomerID │ COALESCE
─────────────┼──────────────┼──────────
1            │ 1            │ 1
3            │ NULL         │ 3
NULL         │ 9            │ 9
```

`USING (CustomerID)` performs this merge automatically (Section 07.09), which is one of the few places where `USING` is clearly worth its portability cost.

---

# The Reconciliation Pattern

The strongest use of a full outer join is comparing two datasets that should be identical: a source and a target, last month and this month, the system of record and a downstream copy.

```sql
SELECT
    COALESCE(src.ProductID, tgt.ProductID) AS product_id,
    src.Price AS source_price,
    tgt.Price AS target_price,
    CASE
        WHEN tgt.ProductID IS NULL     THEN 'missing in target'
        WHEN src.ProductID IS NULL     THEN 'unexpected in target'
        WHEN src.Price <> tgt.Price    THEN 'price differs'
        ELSE                                'identical'
    END AS status
FROM SourceProducts AS src
FULL OUTER JOIN TargetProducts AS tgt
    ON tgt.ProductID = src.ProductID;
```

Add a filter to see only the problems:

```sql
WHERE src.ProductID IS NULL
   OR tgt.ProductID IS NULL
   OR src.Price IS DISTINCT FROM tgt.Price;
```

`IS DISTINCT FROM` is the null-safe comparison from Section 06.08: it treats two `NULL`s as equal and a `NULL` against a value as different—exactly what reconciliation needs, since `src.Price <> tgt.Price` would miss every row where one side is `NULL`.

---

# Rows Present in Only One Side

A full join with both keys tested gives the symmetric difference—everything that does not match:

```sql
SELECT
    COALESCE(a.ID, b.ID) AS id,
    CASE WHEN a.ID IS NULL THEN 'only in B' ELSE 'only in A' END AS side
FROM TableA AS a
FULL OUTER JOIN TableB AS b
    ON b.ID = a.ID
WHERE a.ID IS NULL
   OR b.ID IS NULL;
```

```text
       A                 B
   ┌───────┐         ┌───────┐
   │███████│         │███████│
   │███┌───┼─────────┼───┐███│
   │███│   matched   │███│
   │███└───┼─────────┼───┘███│
   │███████│         │███████│
   └───────┘         └───────┘
    kept              kept
         (matched rows filtered out)
```

---

# Emulating FULL OUTER JOIN

MySQL has no `FULL OUTER JOIN`. The portable emulation is a `UNION` of a left join and a right join:

```sql
SELECT c.CustomerName, o.OrderID
FROM Customers AS c
LEFT JOIN Orders AS o ON o.CustomerID = c.CustomerID

UNION

SELECT c.CustomerName, o.OrderID
FROM Customers AS c
RIGHT JOIN Orders AS o ON o.CustomerID = c.CustomerID;
```

Points to get right:

- `UNION` (not `UNION ALL`) removes the matched rows that both halves produce. That deduplication costs a sort or hash.
- `UNION ALL` is faster but requires the second half to return *only* unmatched right rows:

```sql
SELECT c.CustomerName, o.OrderID
FROM Customers AS c
LEFT JOIN Orders AS o ON o.CustomerID = c.CustomerID

UNION ALL

SELECT c.CustomerName, o.OrderID
FROM Customers AS c
RIGHT JOIN Orders AS o ON o.CustomerID = c.CustomerID
WHERE c.CustomerID IS NULL;      -- right-only rows
```

- `UNION` also removes genuine duplicate rows from within either half, which may not be what you want. The `UNION ALL` form does not have that problem.

---

# Visual Representation

```text
       Customers                 Orders
      ┌───────────────┐        ┌───────────────┐
      │███████████████│        │███████████████│
      │██████████┌────┼────────┼───────┐███████│
      │██████████│████████████████████ │███████│
      │██████████└────┼────────┼───────┘███████│
      │███████████████│        │███████████████│
      └───────────────┘        └───────────────┘
       all preserved            all preserved

  unmatched rows on either side are NULL-extended on the other
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN    ← FULL OUTER JOIN preserves both sides here
3. WHERE   ← an unguarded filter here can drop either side's extras
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

A `WHERE` condition on either table undoes preservation on that side—the trap from Section 07.04, now available in both directions.

---

# How the DBMS Executes This

```text
FROM Customers c FULL OUTER JOIN Orders o ON o.CustomerID = c.CustomerID

↓

Hash join (the usual choice):
    build a hash table on one side
    probe with the other, marking matched build rows

↓

Emit matched pairs during the probe

↓

Emit unmatched probe rows with NULLs

↓

Scan the hash table for unmatched build rows, emit with NULLs
```

Full outer joins are almost always executed as hash or merge joins. A nested loop cannot easily report unmatched rows on the inner side without an extra pass, so engines avoid it here.

---

# 🔬 Engine Deep Dive

A full outer join requires both inputs to be fully materialised or sorted, because "this row never matched" can only be known after the other side has been exhausted. That is why full joins cannot stream results as early as inner joins, and why they are more sensitive to memory limits: a hash table that spills to disk costs far more than one that fits in memory.

---

# 🏗️ Architecture Insight

`FULL OUTER JOIN` is a *comparison* operator far more often than a query operator. Production systems use it to reconcile replicas, validate migrations, compare a computed result against a reference implementation, and diff a snapshot against the live table. In everyday application queries, needing a full join usually signals that the two tables are peers rather than parent and child.

---

# ⚡ Performance Tip

A full join is the most expensive outer join: neither side can be reduced by the other, and both must be scanned in full. When you only need one side's extras, a `LEFT JOIN` or a `NOT EXISTS` anti-join is dramatically cheaper.

---

# 🌍 Production Consideration

Data-migration sign-off is where full outer joins earn their keep. Running a full join between the old and new tables, keyed on the business key and filtered to rows that differ, produces an exact, reviewable list of every discrepancy—far more trustworthy than comparing row counts or checksums alone.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `FULL OUTER JOIN` | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ (3.39+) |
| `FULL JOIN` shorthand | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| `IS DISTINCT FROM` | ✅ | ✅ | ❌ (`<=>`) | ✅ (2022+) | ❌ | ✅ (3.39+) |
| Emulation required | — | no | `UNION` | no | no | before 3.39 |

> **Portability Tip:** On MySQL, use the `UNION ALL` emulation with an `IS NULL` guard on the second half, and replace `IS DISTINCT FROM` with `NOT (a <=> b)`.

---

# Common Mistakes

### Mistake 1

Selecting only one side's key column, so rows from the other side show a `NULL` identifier. Use `COALESCE`.

---

### Mistake 2

Filtering either table in `WHERE`, silently downgrading the full join to a left, right or inner join.

---

### Mistake 3

Comparing values with `<>` in a reconciliation query, missing every row where one side is `NULL`.

---

### Mistake 4

Emulating a full join with `UNION ALL` but forgetting the `IS NULL` guard, which duplicates every matched row.

---

# Best Practices

✔ Use `COALESCE` (or `USING`) to produce a complete key column.

✔ Categorise rows explicitly with `CASE` and `IS NULL` tests on both keys.

✔ Use `IS DISTINCT FROM` for null-safe value comparison.

✔ Keep filters in `ON`, or guard them with `IS NULL` alternatives in `WHERE`.

✔ Prefer a left join or anti-join when only one side's extras matter.

---

# Interview Questions

## Basic

1. What does a `FULL OUTER JOIN` return?
2. Which databases do not support it?
3. Why is `COALESCE` often needed on the key?

## Intermediate

4. How do you identify rows that exist on only one side?
5. How do you emulate a full outer join with `UNION`?
6. Why does a `WHERE` filter break a full outer join?

## Advanced

7. Why is `IS DISTINCT FROM` required in reconciliation queries?
8. Why can a full outer join not be executed as a simple nested loop?
9. Why must both inputs be fully consumed before results are complete?

---

# Hands-on Exercises

## Exercise 1

List every customer and every order, including customers with no orders and orders with no customer.

---

## Exercise 2

Label each row of that result as "matched", "left only" or "right only".

---

## Exercise 3

Reconcile two product tables, returning only rows that are missing on one side or whose price differs.

---

## Exercise 4

Rewrite exercise 1 for MySQL using `UNION ALL`.

---

# Related Topics

- **07.04 — LEFT JOIN (LEFT OUTER JOIN)**
- **07.05 — RIGHT JOIN (RIGHT OUTER JOIN)**
- **07.09 — NATURAL JOIN and USING**
- **07.12 — NULL Handling in JOINs**
- **06.08 — NULL Handling in WHERE (Three-Valued Logic)**
- **05.08 — NULL Handling in SELECT**

---

# Summary

`FULL OUTER JOIN` preserves unmatched rows from both tables, `NULL`-extending whichever side is missing, so its result splits cleanly into matched, left-only and right-only rows. Because each key column is incomplete on its own, `COALESCE` or `USING` is needed to produce a usable identifier, and value comparisons must be null-safe with `IS DISTINCT FROM`. Its natural home is reconciliation—comparing two datasets that should agree—rather than everyday application queries, and on MySQL it must be emulated with a `UNION` of a left join and a guarded right join.
