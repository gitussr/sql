---
title: "07.05 - RIGHT JOIN (RIGHT OUTER JOIN)"
description: "RIGHT OUTER JOIN explained: the mirror image of LEFT JOIN, converting between the two, why teams standardise on LEFT, where RIGHT JOIN is genuinely useful, and the readability hazard of mixing directions in multi-table queries."
chapter: 7
section: 7.05
category: Data Query Language (DQL)
difficulty: Beginner → Intermediate
readingTime: 30 min
lastUpdated: 2026-09-22
---

# 07.05 RIGHT JOIN (RIGHT OUTER JOIN)

---

# Learning Objectives

After completing this section, you will be able to:

- Write `RIGHT JOIN` and explain what it preserves.
- Convert any right join into an equivalent left join.
- Explain why most style guides standardise on `LEFT JOIN`.
- Identify the cases where a right join genuinely reads better.
- Avoid the confusion created by mixing directions in one query.

---

# What is a RIGHT JOIN?

A right outer join returns **every row from the right table**, matched with left rows where the condition holds. Right rows with no match are `NULL`-extended on the left.

```sql
SELECT
    c.CustomerName,
    o.OrderID
FROM Customers AS c
RIGHT JOIN Orders AS o
    ON o.CustomerID = c.CustomerID;
```

```text
Customers                    Orders
┌────┬───────┐               ┌─────┬──────┐
│ 1  │ Ada   │               │ 101 │ 1    │
│ 2  │ Grace │               │ 102 │ 1    │
│ 3  │ Linus │               │ 103 │ 2    │
└────┴───────┘               │ 104 │ NULL │  ← no customer
                             └─────┴──────┘

RIGHT JOIN result
┌───────┬─────┐
│ Ada   │ 101 │
│ Ada   │ 102 │
│ Grace │ 103 │
│ NULL  │ 104 │   ← order preserved, customer columns NULL
└───────┴─────┘

Linus is dropped: he is on the non-preserved side.
```

`RIGHT JOIN` and `RIGHT OUTER JOIN` are identical; `OUTER` is optional.

---

# The Mirror Rule

Every right join has an exactly equivalent left join, obtained by swapping the tables:

```sql
-- These return the same rows
FROM Customers AS c RIGHT JOIN Orders AS o ON o.CustomerID = c.CustomerID
FROM Orders    AS o LEFT  JOIN Customers AS c ON o.CustomerID = c.CustomerID
```

```text
A RIGHT JOIN B   ≡   B LEFT JOIN A
```

The join condition does not change—only the order of the tables and the direction keyword. Column order in the select list is yours to control independently.

---

# Why Teams Prefer LEFT JOIN

Right joins are not worse in any technical sense: the optimizer treats `A RIGHT JOIN B` exactly as it treats `B LEFT JOIN A`. The objection is human.

| Concern | Explanation |
|---------|-------------|
| Reading order | `FROM` introduces the main table; a right join says "actually, the *next* table is the important one" |
| Multi-table queries | In a five-table chain, the preserved side of a right join is buried in the middle |
| Mixed directions | A query with both `LEFT` and `RIGHT` joins requires re-deriving preservation for each step |
| Convention | Most code, most tutorials and most reviewers expect `LEFT` |

```sql
-- ❌ What is preserved here? It takes real effort to say.
FROM A
LEFT  JOIN B ON ...
RIGHT JOIN C ON ...
LEFT  JOIN D ON ...
```

```sql
-- ✅ Start from the table you want to preserve
FROM C
LEFT JOIN A ON ...
LEFT JOIN B ON ...
LEFT JOIN D ON ...
```

The practical rule: **choose the driving table so that every outer join can be written `LEFT`.**

---

# Where RIGHT JOIN Reads Better

Two legitimate cases:

**1. Adding an optional lookup to an existing query.** When a long query already starts from a table and you need to preserve a newly added dimension table, a right join can be a smaller, safer edit than restructuring the `FROM` clause.

```sql
SELECT
    d.DepartmentName,
    e.EmployeeName
FROM Employees AS e
RIGHT JOIN Departments AS d
    ON d.DepartmentID = e.DepartmentID;   -- every department, staffed or not
```

**2. Generated SQL.** ORMs and query builders append joins to a fixed `FROM` clause and sometimes emit right joins because they cannot rewrite the query root.

Both are pragmatic, not stylistic. When you control the whole statement, write it as a left join.

---

# Finding Orphans with a RIGHT JOIN

The anti-join pattern mirrors the left-join version:

```sql
SELECT
    o.OrderID
FROM Customers AS c
RIGHT JOIN Orders AS o
    ON o.CustomerID = c.CustomerID
WHERE c.CustomerID IS NULL;      -- orders with no matching customer
```

The same warning applies as in Section 07.04: the tested column must be `NOT NULL` in its own table—here, `Customers.CustomerID`, a primary key.

This query finds **orphaned rows**: orders whose customer no longer exists. In a database with an enforced foreign key, the result should always be empty; if it is not, referential integrity is not actually enforced.

---

# The Same WHERE Trap

Preservation is undone by a filter on the non-preserved side, exactly as with `LEFT JOIN`:

```sql
-- ❌ Behaves like an inner join
FROM Customers AS c
RIGHT JOIN Orders AS o ON o.CustomerID = c.CustomerID
WHERE c.Country = 'Australia';
```

```sql
-- ✅ Every order kept; customer shown only when Australian
FROM Customers AS c
RIGHT JOIN Orders AS o
    ON  o.CustomerID = c.CustomerID
    AND c.Country = 'Australia';
```

With a right join, the trap is easier to fall into, because the "optional" side is the one written **first**—the opposite of the mental habit built by left joins.

---

# Visual Representation

```text
       Customers (left)             Orders (right)
      ┌───────────────┐            ┌───────────────┐
      │               │            │███████████████│
      │          ┌────┼────────────┼───────┐███████│
      │          │█████████████████████████│███████│
      │          └────┼────────────┼───────┘███████│
      │               │            │███████████████│
      └───────────────┘            └───────────────┘
        only matches                 all preserved

  unmatched right rows → left columns filled with NULL
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN    ← RIGHT JOIN preserves right rows and NULL-extends the left
3. WHERE
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
FROM Customers c RIGHT JOIN Orders o ON o.CustomerID = c.CustomerID

↓

Optimizer normalises: RIGHT JOIN → LEFT JOIN with the inputs swapped

↓

Orders becomes the preserved (outer) side

↓

For each Orders row:
    probe Customers on CustomerID

↓

No match → emit the order with NULL customer columns
```

Most engines rewrite right joins into left joins during normalization, which is why the execution plan for a right join often shows the tables in the opposite order from the text of the query.

---

# 🏗️ Architecture Insight

Join direction is a statement about which entity the result is *about*. A result set whose grain is "one row per order" should start from `Orders`; a result whose grain is "one row per customer" should start from `Customers`. Choosing the driving table by grain makes the join direction fall out automatically—and it is almost always `LEFT`.

---

# ⚡ Performance Tip

There is no performance difference between `A RIGHT JOIN B` and `B LEFT JOIN A`. If a right join appears slow, the cause is the usual one—missing indexes on the join key, or a filter that prevents the optimizer from reducing the preserved side—not the direction keyword.

---

# 🚀 Enterprise Practice

Many SQL style guides ban `RIGHT JOIN` outright and require the query to be restructured so that all outer joins read `LEFT`. The rationale is reviewability: a reviewer scanning a long query should be able to see the preserved table on the first `FROM` line, not deduce it from a keyword six lines down.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `RIGHT [OUTER] JOIN` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (3.39+) |
| Rewritten to `LEFT` internally | — | ✅ | ✅ | ✅ | ✅ | ✅ |
| Legacy operator | — | — | — | `=*` (removed) | `(+)` on the left side | — |

> **Portability Tip:** SQLite only gained `RIGHT JOIN` in version 3.39 (2022). Writing the equivalent `LEFT JOIN` works on every version of every database.

---

# Common Mistakes

### Mistake 1

Mixing `LEFT` and `RIGHT` joins in one query, making preservation impossible to read at a glance.

---

### Mistake 2

Filtering the left table in `WHERE` after a right join, silently converting it to an inner join.

---

### Mistake 3

Assuming `A RIGHT JOIN B` and `A LEFT JOIN B` differ only in column order. They preserve opposite sides.

---

### Mistake 4

Using the `IS NULL` orphan check on a nullable column instead of the primary key.

---

# Best Practices

✔ Prefer `LEFT JOIN`; restructure the `FROM` clause instead of reversing direction.

✔ Never mix `LEFT` and `RIGHT` in one query.

✔ Choose the driving table from the result's grain.

✔ Put conditions on the non-preserved side in `ON`.

✔ Use the orphan check to verify referential integrity, not as routine query logic.

---

# Interview Questions

## Basic

1. What does a `RIGHT JOIN` preserve?
2. How do you rewrite a right join as a left join?
3. Is there any performance difference between the two?

## Intermediate

4. Why do most style guides prefer `LEFT JOIN`?
5. What happens if you filter the left table in `WHERE` after a right join?
6. How would you find orders whose customer no longer exists?

## Advanced

7. Why does the execution plan for a right join often list the tables in reverse order?
8. When does a right join genuinely improve readability?
9. Why is mixing join directions in one query considered a defect risk?

---

# Hands-on Exercises

## Exercise 1

Write a query that lists every order with its customer's name, including orders with no matching customer.

---

## Exercise 2

Rewrite that query using `LEFT JOIN`.

---

## Exercise 3

Find every department that currently has no employees, using a right join.

---

## Exercise 4

Take a query that mixes `LEFT` and `RIGHT` joins and restructure it to use only `LEFT`.

---

# Related Topics

- **07.04 — LEFT JOIN (LEFT OUTER JOIN)**
- **07.06 — FULL OUTER JOIN**
- **07.11 — ON vs WHERE (Join Conditions and Filters)**
- **07.12 — NULL Handling in JOINs**
- **03.08 — Relationships in Databases**

---

# Summary

`RIGHT JOIN` preserves every row of the right table and `NULL`-extends the left, making it the exact mirror of `LEFT JOIN`: `A RIGHT JOIN B` always equals `B LEFT JOIN A`. Engines normalise it into a left join internally, so the choice is about readability rather than speed—and readability strongly favours starting from the table you want to preserve and writing `LEFT` throughout. Right joins remain useful for appending an optional table to an existing query and in generated SQL, and they carry the same `WHERE` trap as left joins, only on the opposite side.
