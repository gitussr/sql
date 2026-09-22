---
title: "07.01 - Introduction to JOINs"
description: "Why normalized databases need joins: how a join matches rows across tables, the role of primary and foreign keys, join cardinality (1:1, 1:N, N:M), what a Cartesian product is, and how a join differs from a subquery or a UNION."
chapter: 7
section: 7.01
category: Data Query Language (DQL)
difficulty: Beginner
readingTime: 35 min
lastUpdated: 2026-09-22
---

# 07.01 Introduction to JOINs

---

# Learning Objectives

After completing this section, you will be able to:

- Explain why data is split across tables and why joins are needed.
- Describe how a join matches rows using keys.
- Read a join as "for each row on the left, find matching rows on the right".
- Identify the cardinality of a join: 1:1, 1:N or N:M.
- Recognise a Cartesian product and why it appears.
- Distinguish a join from a `UNION` and from a subquery.

---

# Why Joins Exist

Imagine storing orders in a single flat table:

```text
OrderID │ CustomerName │ Country   │ Email              │ Amount
────────┼──────────────┼───────────┼────────────────────┼────────
101     │ Ada Lovelace │ Australia │ ada@example.com    │ 250.00
102     │ Ada Lovelace │ Australia │ ada@example.com    │  80.00
103     │ Grace Hopper │ Australia │ grace@example.com  │ 500.00
```

Ada's name, country and email are repeated in every order she places. That causes three classic problems:

| Problem | Example |
|---------|---------|
| **Update anomaly** | Ada changes her email. Every one of her order rows must be updated, and any row missed now contradicts the others. |
| **Insertion anomaly** | A new customer who has not ordered yet has nowhere to live. |
| **Deletion anomaly** | Deleting Ada's only order deletes the only record that she exists. |

Splitting the data solves all three:

```text
Customers                                  Orders
┌────┬──────────────┬───────────┐          ┌─────┬────────────┬────────┐
│ ID │ Name         │ Country   │          │ ID  │ CustomerID │ Amount │
├────┼──────────────┼───────────┤          ├─────┼────────────┼────────┤
│ 1  │ Ada Lovelace │ Australia │          │ 101 │ 1          │ 250.00 │
│ 2  │ Grace Hopper │ Australia │          │ 102 │ 1          │  80.00 │
│ 3  │ Linus T.     │ Finland   │          │ 103 │ 2          │ 500.00 │
└────┴──────────────┴───────────┘          └─────┴────────────┴────────┘
```

Each fact is now stored exactly once. The cost is that answering "which customer placed order 101?" requires putting the two tables back together—a **join**.

---

# The Mental Model

Read every join the same way:

> **For each row on the left, find the rows on the right where the condition is true, and emit one output row per matching pair.**

```sql
SELECT
    c.CustomerName,
    o.OrderID
FROM Customers AS c
INNER JOIN Orders AS o
    ON o.CustomerID = c.CustomerID;
```

```text
Customer row: Ada (ID 1)
    → find Orders where CustomerID = 1
    → matches 101, 102
    → emit (Ada, 101), (Ada, 102)

Customer row: Grace (ID 2)
    → matches 103
    → emit (Grace, 103)

Customer row: Linus (ID 3)
    → no matches
    → emit nothing (INNER JOIN)
```

The physical engine rarely works exactly like this—it may hash or sort instead—but the *result* is always defined by this model.

---

# Keys Make Joins Possible

Joins are normally written across a **primary key / foreign key** pair.

```text
Customers.CustomerID   (PRIMARY KEY, unique)
        ▲
        │  referenced by
        │
Orders.CustomerID      (FOREIGN KEY, repeatable, possibly NULL)
```

```sql
SELECT
    c.CustomerName,
    o.OrderID
FROM Customers AS c
INNER JOIN Orders AS o
    ON o.CustomerID = c.CustomerID;
```

Nothing in SQL *requires* the join column to be a key—you may join on any expression—but key joins are the common case, because keys are unique, indexed and meaningful.

---

# Join Cardinality

Cardinality is the single most useful thing to know before writing a join: it predicts how many rows come out.

| Cardinality | Meaning | Row count effect |
|-------------|---------|------------------|
| **1:1** | At most one match on each side | Row count unchanged |
| **1:N** | One left row, many right rows | Row count grows |
| **N:1** | Many left rows share one right row | Row count unchanged |
| **N:M** | Many on both sides | Row count multiplies |

```text
1:1   Users ──── UserProfiles        1 user  → 1 profile
1:N   Customers ──< Orders           1 customer → many orders
N:1   Orders >── Customers           many orders → 1 customer
N:M   Students >──< Courses          resolved through a junction table
```

A concrete 1:N example:

```text
3 customers
5 orders (Ada 2, Grace 3, Linus 0)

INNER JOIN result: 5 rows
```

The result has one row per **order**, not per customer. Summing a customer-level column across that result would count Ada's country twice—the root cause of a large family of reporting bugs (see Section 07.10).

---

# Anatomy of a Join

```sql
SELECT      c.CustomerName, o.TotalAmount   -- 4. columns to keep
FROM        Customers AS c                  -- 1. left source
INNER JOIN  Orders    AS o                  -- 2. right source
    ON      o.CustomerID = c.CustomerID     -- 3. join condition
WHERE       o.TotalAmount > 100;            -- 5. row filter
```

| Part | Purpose |
|------|---------|
| `FROM` | The first row source |
| `JOIN` | The table to combine with, and the join type |
| `ON` | The condition that decides which pairs match |
| `WHERE` | A filter applied to the combined result |
| `SELECT` | The columns of the final output |

---

# The Cartesian Product

If you omit the join condition, every left row is paired with every right row:

```sql
SELECT
    c.CustomerName,
    o.OrderID
FROM Customers AS c
CROSS JOIN Orders AS o;
```

```text
3 customers × 5 orders = 15 rows
```

```text
 Customers        Orders            Result
┌───┐            ┌───┐             Ada   × 101,102,103,104,105
│ 1 │            │101│             Grace × 101,102,103,104,105
│ 2 │     ×      │102│      =      Linus × 101,102,103,104,105
│ 3 │            │103│
└───┘            │104│
                 │105│
                 └───┘
```

This is a legitimate operation (Section 07.07) but an accident when unintended. The danger is that it produces **no error**: the query simply returns far more rows than expected, and any `SUM()` over it is inflated.

```text
10,000 customers × 50,000 orders = 500,000,000 rows
```

---

# Joins vs UNION

They combine data in different directions.

```text
JOIN — combines COLUMNS (sideways)

  A               B                A ⋈ B
┌───┬───┐     ┌───┬───┐        ┌───┬───┬───┬───┐
│a1 │a2 │  +  │b1 │b2 │   =    │a1 │a2 │b1 │b2 │
└───┴───┘     └───┴───┘        └───┴───┴───┴───┘


UNION — combines ROWS (downwards)

  A               B                A ∪ B
┌───┬───┐     ┌───┬───┐        ┌───┬───┐
│a1 │a2 │  +  │b1 │b2 │   =    │a1 │a2 │
└───┴───┘     └───┴───┘        │b1 │b2 │
                               └───┴───┘
```

Use a join when the tables hold **different kinds of facts about related things**. Use `UNION` when they hold **the same kind of fact** and you want them stacked.

---

# Joins vs Subqueries

Many questions can be written either way.

```sql
-- Join: needs columns from both tables
SELECT
    c.CustomerName,
    o.OrderID
FROM Customers AS c
INNER JOIN Orders AS o
    ON o.CustomerID = c.CustomerID;
```

```sql
-- Subquery: only needs to test existence
SELECT
    c.CustomerName
FROM Customers AS c
WHERE EXISTS (
    SELECT 1
    FROM Orders AS o
    WHERE o.CustomerID = c.CustomerID
);
```

| You need | Use |
|----------|-----|
| Columns from the other table | Join |
| Only "does a match exist?" | `EXISTS` (semi-join) |
| Only "does no match exist?" | `NOT EXISTS` (anti-join) |

The critical difference: the join returns **one row per matching order**, while `EXISTS` returns **one row per customer**. Section 07.13 covers this distinction in full.

---

# Visual Representation

```text
Question: "Show each customer with their orders."

       Customers                      Orders
    ┌──────────────┐              ┌──────────────┐
    │ CustomerID   │◄─────────────│ CustomerID   │
    │ CustomerName │   matched    │ OrderID      │
    │ Country      │      on      │ TotalAmount  │
    └──────────────┘              └──────────────┘
            │                             │
            └──────────────┬──────────────┘
                           ▼
              ┌──────────────────────────┐
              │ CustomerName │ OrderID   │
              │ Ada          │ 101       │
              │ Ada          │ 102       │
              │ Grace        │ 103       │
              └──────────────────────────┘
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN    ← Rows from both tables are matched here
3. WHERE
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

The join happens first. Everything else in the query operates on the combined result, which is why a join that produces duplicates affects counts, sums and even `DISTINCT` further down the pipeline.

---

# How the DBMS Executes This

```text
SELECT c.CustomerName, o.OrderID
FROM Customers c JOIN Orders o ON o.CustomerID = c.CustomerID

↓

Optimizer inspects both tables:
  Customers: 3 rows
  Orders:    5 rows, index on CustomerID

↓

Chooses the smaller table as the driving side

↓

For each Customers row:
  seek Orders index on CustomerID

↓

Emit matched pairs
```

With an index on `Orders.CustomerID`, this is a nested loop join with index seeks—fast and memory-light. Without one, the engine must scan `Orders` repeatedly or build a hash table. Section 07.14 covers the algorithms.

---

# 🏗️ Architecture Insight

A schema is a set of promises about cardinality, and joins are where those promises are cashed in. A foreign key with a unique constraint guarantees a 1:1 join; without the unique constraint the same query may silently return duplicates. This is why constraints are not bureaucracy: they are the only mechanism that makes a join's row count predictable.

---

# ⚡ Performance Tip

The single highest-impact index in most applications is the one on the foreign-key column used in joins. Primary keys are indexed automatically; foreign keys usually are not. An unindexed `Orders.CustomerID` turns a millisecond lookup into a full table scan repeated once per customer.

---

# 💡 Did You Know?

"Cartesian product" is named after René Descartes, whose coordinate system pairs every x value with every y value. A join without a condition is exactly that pairing—which is why `CROSS JOIN` and the comma join produce the same thing.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `JOIN ... ON` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Comma join (`FROM a, b`) | ✅ (legacy) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Foreign key auto-indexed | ❌ | ❌ | ✅ (InnoDB) | ❌ | ❌ | ❌ |
| Join limit per query | — | practical | 61 tables | 256 tables | practical | 64 tables |

> **Portability Tip:** Only MySQL's InnoDB creates an index for a foreign key automatically. On every other database, adding a foreign key without an index gives you integrity without join performance.

---

# Common Mistakes

### Mistake 1

Assuming a join returns one row per left row. It returns one row per **matching pair**.

---

### Mistake 2

Forgetting the join condition, producing a Cartesian product that returns wrong totals rather than an error.

---

### Mistake 3

Using a join where `EXISTS` is meant, which duplicates left rows when the right side has several matches.

---

### Mistake 4

Joining on a descriptive column (`CustomerName`) instead of a key, so that renames and duplicates break the relationship.

---

# Best Practices

✔ Know the cardinality before writing the join.

✔ Join on keys, not on names or descriptions.

✔ Index every foreign key that participates in a join.

✔ Alias every table and qualify every column.

✔ Check the row count after adding a join to an existing query.

---

# Interview Questions

## Basic

1. What is a join, and why do relational databases need them?
2. What is the difference between a join and a `UNION`?
3. What is a Cartesian product?

## Intermediate

4. What determines how many rows a join returns?
5. When would you use `EXISTS` instead of a join?
6. Why should joins use keys rather than descriptive columns?

## Advanced

7. Why does a missing unique constraint make a join's row count unpredictable?
8. Why is an index on a foreign key important even when the constraint already enforces integrity?
9. How does join cardinality affect aggregate results downstream?

---

# Hands-on Exercises

## Exercise 1

List every order with the name of the customer who placed it.

---

## Exercise 2

Given 4 customers and 9 orders (one customer has none), predict the number of rows an inner join returns.

---

## Exercise 3

Write the same "customers who have ordered" question twice: once as a join with `DISTINCT`, once with `EXISTS`.

---

## Exercise 4

Explain what happens, and why no error is raised, when the `ON` clause is omitted from a two-table query.

---

# Related Topics

- **07.02 — JOIN Syntax**
- **07.03 — INNER JOIN**
- **07.07 — CROSS JOIN**
- **07.13 — Semi-Joins and Anti-Joins (EXISTS and NOT EXISTS)**
- **03.08 — Relationships in Databases**
- **05.11 — FROM Clause (Deep Dive)**

---

# Summary

Joins exist because normalized databases store each fact once, in separate tables. A join re-assembles those facts by matching rows through a condition—normally a primary key / foreign key pair—and emitting one row per matching pair. Its cardinality (1:1, 1:N, N:M) predicts the row count, and forgetting the condition entirely yields a Cartesian product that multiplies rows without raising an error. Joins combine columns sideways, `UNION` stacks rows downwards, and `EXISTS` answers existence questions without duplicating rows.
