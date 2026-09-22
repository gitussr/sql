---
title: "07.12 - NULL Handling in JOINs"
description: "How NULL behaves in joins: NULL keys never matching, NULL extension by outer joins, telling a manufactured NULL from a stored one, null-safe join conditions with IS NOT DISTINCT FROM and COALESCE, and the NOT IN subquery trap."
chapter: 7
section: 7.12
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 35 min
lastUpdated: 2026-09-22
---

# 07.12 NULL Handling in JOINs

---

# Learning Objectives

After completing this section, you will be able to:

- Explain why rows with `NULL` join keys never match.
- Distinguish a `NULL` produced by outer-join extension from a stored `NULL`.
- Write null-safe join conditions when they are genuinely required.
- Aggregate outer-join results correctly.
- Avoid the `NOT IN` + `NULL` trap in join-shaped subqueries.
- Decide when a nullable foreign key should be redesigned instead.

---

# NULL Keys Never Match

A join condition is an ordinary predicate, and `NULL = NULL` is UNKNOWN, not TRUE.

```text
Orders                          Customers
┌─────┬────────────┐            ┌──────┬───────┐
│ 101 │ 1          │            │ 1    │ Ada   │
│ 105 │ NULL       │            │ NULL │ ???   │
└─────┴────────────┘            └──────┴───────┘

ON o.CustomerID = c.CustomerID

101 → matches Ada
105 → NULL = 1     → UNKNOWN → no match
105 → NULL = NULL  → UNKNOWN → no match
```

```sql
SELECT o.OrderID, c.CustomerName
FROM Orders AS o
INNER JOIN Customers AS c
    ON c.CustomerID = o.CustomerID;
-- Order 105 never appears.
```

This is consistent with everything in Section 06.08: `NULL` means "unknown", and two unknown values cannot be shown to be equal.

---

# Which Rows Disappear

| Join | Row with `NULL` key |
|------|---------------------|
| `INNER JOIN` | Dropped from both sides |
| `LEFT JOIN` | Kept if it is on the left; right columns `NULL` |
| `RIGHT JOIN` | Kept if it is on the right; left columns `NULL` |
| `FULL OUTER JOIN` | Always kept, extended on the other side |
| `CROSS JOIN` | Kept—there is no condition to fail |

An outer join is therefore the standard way to see rows whose foreign key is `NULL`:

```sql
SELECT
    o.OrderID,
    COALESCE(c.CustomerName, '— unassigned —') AS customer
FROM Orders AS o
LEFT JOIN Customers AS c
    ON c.CustomerID = o.CustomerID;
```

---

# Two Kinds of NULL in a Result

After an outer join, a `NULL` in a right-hand column has two possible origins:

```text
1. Stored NULL     the matched row really contains NULL
2. Manufactured    no row matched; the engine invented a NULL row
```

They are indistinguishable by value. To tell them apart, test a column that is `NOT NULL` in the right table—its primary key:

```sql
SELECT
    c.CustomerName,
    o.OrderID,
    CASE
        WHEN o.OrderID IS NULL THEN 'no order at all'
        WHEN o.ShippedAt IS NULL THEN 'order not yet shipped'
        ELSE 'shipped'
    END AS status
FROM Customers AS c
LEFT JOIN Orders AS o
    ON o.CustomerID = c.CustomerID;
```

```text
o.OrderID IS NULL       → no matching row existed
o.OrderID IS NOT NULL
  and o.ShippedAt NULL  → row exists, value is genuinely unknown
```

Forgetting this distinction is what makes anti-join patterns fail on nullable columns.

---

# Null-Safe Join Conditions

Occasionally two `NULL`s genuinely should match—typically when joining datasets in which `NULL` is used as a meaningful category, as in reconciliation work.

```sql
-- PostgreSQL, SQLite 3.39+, SQL Server 2022+
ON a.Code IS NOT DISTINCT FROM b.Code
```

```sql
-- MySQL: the null-safe equality operator
ON a.Code <=> b.Code
```

```sql
-- Portable: an explicit OR
ON  a.Code = b.Code
   OR (a.Code IS NULL AND b.Code IS NULL)
```

```sql
-- Portable but harmful to indexes
ON COALESCE(a.Code, '∅') = COALESCE(b.Code, '∅')
```

Costs to weigh:

| Form | Portability | Index use |
|------|-------------|-----------|
| `IS NOT DISTINCT FROM` | Partial | Usually kept |
| `<=>` | MySQL only | Kept |
| `OR (… IS NULL AND … IS NULL)` | Full | Often lost |
| `COALESCE(...)` on both sides | Full | Lost (not SARGable) |

`COALESCE` also requires a sentinel value that cannot occur in the data—a fragile assumption. Prefer a null-safe operator where the database offers one, and treat the need for null-safe joins as a hint that the data model is using `NULL` to mean something specific, which is usually better expressed as a real value.

---

# Aggregates over Outer Joins

Manufactured `NULL`s change what aggregates mean:

```sql
SELECT
    c.CustomerName,
    COUNT(*)                        AS rows_returned,   -- includes the NULL row
    COUNT(o.OrderID)                AS order_count,     -- ignores NULLs
    COALESCE(SUM(o.TotalAmount), 0) AS total_spent,
    AVG(o.TotalAmount)              AS avg_order        -- NULL when no orders
FROM Customers AS c
LEFT JOIN Orders AS o
    ON o.CustomerID = c.CustomerID
GROUP BY c.CustomerID, c.CustomerName;
```

```text
CustomerName │ rows_returned │ order_count │ total_spent │ avg_order
─────────────┼───────────────┼─────────────┼─────────────┼──────────
Ada          │ 2             │ 2           │ 330.00      │ 165.00
Linus        │ 1  ← wrong    │ 0  ← right  │ 0.00        │ NULL
```

Rules:

- `COUNT(*)` counts manufactured rows; `COUNT(column)` does not.
- `SUM` over zero rows returns `NULL`; use `COALESCE(SUM(x), 0)` when a zero is wanted.
- `AVG` over zero rows returns `NULL`—usually correct, since "average of nothing" is not zero.
- `MIN`/`MAX` ignore `NULL`s entirely.

---

# The NOT IN Trap

The join-shaped subquery that most often goes wrong:

```sql
-- ❌ Returns NOTHING if any Orders.CustomerID is NULL
SELECT c.CustomerName
FROM Customers AS c
WHERE c.CustomerID NOT IN (
    SELECT o.CustomerID FROM Orders AS o
);
```

```text
c.CustomerID NOT IN (1, 2, NULL)

  ≡ NOT (c.CustomerID = 1 OR c.CustomerID = 2 OR c.CustomerID = NULL)
  ≡ NOT (FALSE OR FALSE OR UNKNOWN)
  ≡ NOT UNKNOWN
  ≡ UNKNOWN      → the row is filtered out
```

A single `NULL` in the subquery makes the whole result empty. Two safe forms:

```sql
-- ✅ NOT EXISTS is null-safe by construction
SELECT c.CustomerName
FROM Customers AS c
WHERE NOT EXISTS (
    SELECT 1 FROM Orders AS o
    WHERE o.CustomerID = c.CustomerID
);
```

```sql
-- ✅ LEFT JOIN + IS NULL
SELECT c.CustomerName
FROM Customers AS c
LEFT JOIN Orders AS o ON o.CustomerID = c.CustomerID
WHERE o.OrderID IS NULL;
```

Section 07.13 compares all three forms in detail.

---

# Nullable Foreign Keys: a Design Question

A `NULL` foreign key says "this relationship does not exist for this row". That is sometimes exactly right:

```text
Employees.ManagerID  NULL   →  the CEO has no manager      ✅ meaningful
Orders.CustomerID    NULL   →  an order with no customer?  ⚠ suspicious
Orders.ShippedBy     NULL   →  not yet shipped             ✅ meaningful
```

When `NULL` is used instead of a real value—"unknown", "not applicable", "pending"—a lookup row with an explicit meaning is usually better. It removes the null-safe join problem completely, keeps indexes usable, and makes the meaning visible in the data.

---

# Visual Representation

```text
                 LEFT JOIN result
    ┌───────────┬──────────┬───────────────────────────┐
    │ c.Name    │ o.OrderID│ o.ShippedAt               │
    ├───────────┼──────────┼───────────────────────────┤
    │ Ada       │ 101      │ 2026-09-02   matched      │
    │ Grace     │ 103      │ NULL         stored NULL  │
    │ Linus     │ NULL     │ NULL         manufactured │
    └───────────┴──────────┴───────────────────────────┘
                     ▲
        test the NOT NULL key column to tell them apart
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN    ← NULL keys fail to match; outer rows are NULL-extended
3. WHERE   ← NULL comparisons yield UNKNOWN and drop rows
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Hash join on a nullable column

↓

Build side: rows with NULL keys are hashed separately
            or skipped entirely — they can never match

↓

Probe side: a NULL probe key finds no bucket

↓

Outer join: unmatched rows emitted with NULLs at the end
```

Most engines optimise `NULL` keys away early precisely because they cannot match. This is also why a null-safe condition (`IS NOT DISTINCT FROM`) can be more expensive: the shortcut is no longer available.

---

# 🔬 Engine Deep Dive

In a merge join, `NULL`s sort together at one end of the ordering, so the engine can skip that entire block in one step. In a hash join, `NULL` keys are usually discarded before the hash table is built. Either way, `NULL` rows are cheap to eliminate—but only for ordinary equality. Null-safe predicates force the engine to treat `NULL` as an ordinary value, removing the shortcut.

---

# 🏗️ Architecture Insight

`NULL` in a foreign key is a modelling decision with query-time consequences: every join over that column now has two behaviours to specify, one for rows that match and one for rows that cannot. If most queries over a nullable key end up using outer joins and `COALESCE`, the model is asking each query to re-state something the schema should have settled.

---

# ⚡ Performance Tip

Filtered (partial) indexes suit nullable join keys well: `CREATE INDEX ... WHERE CustomerID IS NOT NULL` indexes only the rows that can ever match, which is smaller and faster to maintain. Support varies—PostgreSQL, SQL Server and SQLite offer it; MySQL and Oracle have their own approaches.

---

# 🌍 Production Consideration

A `NOT IN` subquery that silently returns zero rows is one of the hardest bugs to notice, because an empty result looks like "nothing to do". Exclusion logic in production—unsubscribes, exclusion lists, reconciliation—should use `NOT EXISTS`, whose behaviour does not depend on whether a `NULL` happens to be present today.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `NULL` keys never match | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `IS NOT DISTINCT FROM` | ✅ | ✅ | ❌ | ✅ (2022+) | ❌ | ✅ (3.39+) |
| `<=>` null-safe equality | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Filtered / partial index | ✅ | ✅ | ❌ | ✅ | ❌ (function-based) | ✅ |
| `NULL`s sort | Implementation-defined | last (ASC) | first | first | last | first |

> **Portability Tip:** `NULL` ordering differs between databases, which affects merge joins and `ORDER BY` alike. `ORDER BY col NULLS FIRST/LAST` is supported by PostgreSQL, Oracle and SQLite, but not by MySQL or SQL Server.

---

# Common Mistakes

### Mistake 1

Expecting rows with a `NULL` foreign key to appear in an inner join.

---

### Mistake 2

Testing a nullable column for the anti-join pattern instead of the primary key.

---

### Mistake 3

Using `NOT IN` against a subquery that can return `NULL`.

---

### Mistake 4

Using `COUNT(*)` after an outer join and reporting 1 for rows with no matches.

---

# Best Practices

✔ Use an outer join to see rows with `NULL` join keys.

✔ Test the right table's primary key to identify unmatched rows.

✔ Prefer `NOT EXISTS` to `NOT IN` for exclusion.

✔ Use `COUNT(right_key)` and `COALESCE(SUM(...), 0)` after outer joins.

✔ Use a real lookup value instead of `NULL` when `NULL` would mean a category.

✔ Reach for null-safe operators only when two `NULL`s genuinely must match.

---

# Interview Questions

## Basic

1. Why does a row with a `NULL` join key not match?
2. Which join types keep such rows?
3. What is `NULL` extension?

## Intermediate

4. How do you tell a manufactured `NULL` from a stored one?
5. Why is `COUNT(*)` misleading after a left join?
6. Why can `NOT IN` return no rows at all?

## Advanced

7. What does `IS NOT DISTINCT FROM` do, and what does it cost?
8. Why do engines discard `NULL` keys before building a hash table?
9. When should a nullable foreign key be replaced by an explicit lookup value?

---

# Hands-on Exercises

## Exercise 1

List all orders with their customer name, showing "— unassigned —" for orders whose `CustomerID` is `NULL`.

---

## Exercise 2

Write a query that distinguishes "no order", "order not shipped" and "shipped".

---

## Exercise 3

Rewrite a `NOT IN` exclusion query using `NOT EXISTS` and explain the difference.

---

## Exercise 4

Write a null-safe join condition three ways and comment on portability and index use.

---

# Related Topics

- **07.04 — LEFT JOIN (LEFT OUTER JOIN)**
- **07.11 — ON vs WHERE (Join Conditions and Filters)**
- **07.13 — Semi-Joins and Anti-Joins (EXISTS and NOT EXISTS)**
- **06.08 — NULL Handling in WHERE (Three-Valued Logic)**
- **06.06 — IN and NOT IN**
- **05.08 — NULL Handling in SELECT**

---

# Summary

`NULL` join keys never match, because equality with `NULL` yields UNKNOWN—so inner joins drop those rows and outer joins are the way to see them. Outer joins then introduce a second kind of `NULL`: manufactured values in columns of rows that never matched, distinguishable from stored `NULL`s only by testing a `NOT NULL` column such as the right table's primary key. That distinction drives correct anti-join patterns and correct aggregates (`COUNT(key)`, not `COUNT(*)`; `COALESCE(SUM(x), 0)`). Null-safe conditions exist for the rare case where two `NULL`s must match, at a cost in portability and index use, and `NOT IN` against a nullable subquery should be replaced by `NOT EXISTS` in all production code.
