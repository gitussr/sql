---
title: "07.11 - ON vs WHERE (Join Conditions and Filters)"
description: "ON versus WHERE explained precisely: why they are interchangeable for inner joins and not for outer joins, the decision table, predicate pushdown, converting an outer join to an inner join deliberately, and the multi-tenant security implications."
chapter: 7
section: 7.11
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 35 min
lastUpdated: 2026-09-22
---

# 07.11 ON vs WHERE (Join Conditions and Filters)

---

# Learning Objectives

After completing this section, you will be able to:

- State precisely when `ON` and `WHERE` are interchangeable.
- Explain why a `WHERE` filter cancels an outer join.
- Choose the correct clause from a decision table.
- Convert an outer join to an inner join deliberately and visibly.
- Describe predicate pushdown and its limits with outer joins.
- Recognise the security consequences of placing a filter in the wrong clause.

---

# Two Different Jobs

```text
ON     — which pairs of rows MATCH
WHERE  — which rows of the combined result SURVIVE
```

They run at different stages:

```text
Step 2  JOIN   apply ON, preserve outer rows, NULL-extend
Step 3  WHERE  apply filters to the result of step 2
```

For inner joins nothing distinguishes them, because unmatched rows are discarded either way. For outer joins the order is everything: preservation happens in step 2, and a filter in step 3 can undo it.

---

# Inner Joins: Interchangeable

```sql
-- A: condition in ON
SELECT c.CustomerName, o.OrderID
FROM Customers AS c
INNER JOIN Orders AS o
    ON  o.CustomerID = c.CustomerID
    AND o.TotalAmount > 100;
```

```sql
-- B: condition in WHERE
SELECT c.CustomerName, o.OrderID
FROM Customers AS c
INNER JOIN Orders AS o
    ON o.CustomerID = c.CustomerID
WHERE o.TotalAmount > 100;
```

A and B always return the same rows, and optimizers routinely rewrite one into the other. The choice is a matter of convention:

> Relationships in `ON`. Restrictions in `WHERE`.

Following that convention has a practical payoff: if the join later becomes a `LEFT JOIN`, a condition already sitting in `ON` keeps doing the right thing, while one in `WHERE` silently cancels the change.

---

# Outer Joins: Not Interchangeable

```sql
-- A: condition in ON — customers preserved
SELECT c.CustomerName, o.OrderID
FROM Customers AS c
LEFT JOIN Orders AS o
    ON  o.CustomerID = c.CustomerID
    AND o.TotalAmount > 100;
```

```text
Ada   │ 101   (250.00)
Ada   │ NULL  (80.00 order did not qualify — but Ada stays)
Grace │ 103   (500.00)
Linus │ NULL  (no orders at all)
```

```sql
-- B: condition in WHERE — inner join in disguise
SELECT c.CustomerName, o.OrderID
FROM Customers AS c
LEFT JOIN Orders AS o
    ON o.CustomerID = c.CustomerID
WHERE o.TotalAmount > 100;
```

```text
Ada   │ 101
Grace │ 103

Linus removed:  NULL > 100 → UNKNOWN → filtered out
```

The mechanism in one line: **a `NULL`-extended row fails every comparison**, because comparing `NULL` with anything yields UNKNOWN, and `WHERE` keeps only TRUE (Section 06.08).

---

# The Decision Table

| The condition applies to | Join type | Put it in | Why |
|--------------------------|-----------|-----------|-----|
| The preserved (left) table | `LEFT JOIN` | `WHERE` | Those rows are never `NULL`-extended |
| The optional (right) table | `LEFT JOIN` | `ON` | Keeps the left rows, limits matches |
| Either table | `INNER JOIN` | `WHERE` (convention) | Identical result; keep `ON` for relationships |
| The relationship itself | Any | `ON` | It *is* the join |
| "No match exists" | `LEFT JOIN` | `WHERE key IS NULL` | The anti-join pattern |
| Deliberately converting to inner | `LEFT JOIN` | `WHERE` + a comment | Better: write `INNER JOIN` |

---

# Worked Examples

## "All customers, and their September orders"

```sql
SELECT
    c.CustomerName,
    o.OrderID
FROM Customers AS c
LEFT JOIN Orders AS o
    ON  o.CustomerID = c.CustomerID
    AND o.OrderDate >= DATE '2026-09-01'
    AND o.OrderDate <  DATE '2026-10-01';
```

Every customer appears; only September orders attach.

---

## "Australian customers, and their orders"

```sql
SELECT
    c.CustomerName,
    o.OrderID
FROM Customers AS c
LEFT JOIN Orders AS o
    ON o.CustomerID = c.CustomerID
WHERE c.Country = 'Australia';
```

The filter is on the preserved table, so `WHERE` is correct.

---

## "Customers with no September orders"

```sql
SELECT
    c.CustomerName
FROM Customers AS c
LEFT JOIN Orders AS o
    ON  o.CustomerID = c.CustomerID
    AND o.OrderDate >= DATE '2026-09-01'
WHERE o.OrderID IS NULL;
```

The date condition must be in `ON`: in `WHERE` it would remove the very rows the `IS NULL` test needs to find.

---

## "Customers whose latest order exceeded 1000"

```sql
SELECT
    c.CustomerName,
    o.TotalAmount
FROM Customers AS c
INNER JOIN Orders AS o
    ON o.CustomerID = c.CustomerID
WHERE o.TotalAmount > 1000;
```

Here unmatched customers genuinely are not part of the answer, so an inner join states the intent directly. Writing `LEFT JOIN` with the same `WHERE` would be misleading, not wrong.

---

# Converting Deliberately

Sometimes you *want* the inner-join behaviour after starting from a left join. Say so explicitly:

```sql
-- ❌ Ambiguous: bug or intent?
FROM Customers AS c
LEFT JOIN Orders AS o ON o.CustomerID = c.CustomerID
WHERE o.TotalAmount > 100;
```

```sql
-- ✅ Intent is unambiguous
FROM Customers AS c
INNER JOIN Orders AS o
    ON o.CustomerID = c.CustomerID
WHERE o.TotalAmount > 100;
```

A reviewer should never have to guess which one you meant. If a `LEFT JOIN` has a `WHERE` condition on its optional side, the reviewer's default assumption—correctly—is that it is a bug.

---

# Predicate Pushdown and Its Limits

Optimizers move predicates as close to the data as possible:

```text
WHERE c.Country = 'Australia'

↓ pushed down

Read Customers WHERE Country = 'Australia'   ← filters before the join
```

For an inner join, predicates can be pushed to either side. For an outer join, only predicates on the **preserved** side can be pushed freely:

```text
LEFT JOIN

  filter on the preserved side  → may be pushed down
  filter on the optional side   → must stay in ON, or it changes meaning
```

This is not a limitation of any particular engine—it follows from the definition of the operation. It also explains why outer joins are harder to optimize: the engine has fewer legal rewrites available.

---

# Visual Representation

```text
                   Customers  LEFT JOIN  Orders

Step 2  JOIN with ON
        ┌─────────────────────────────────────┐
        │ Ada   │ 101  │ 250.00                │
        │ Ada   │ 102  │  80.00                │
        │ Grace │ 103  │ 500.00                │
        │ Linus │ NULL │ NULL     ← preserved  │
        └─────────────────────────────────────┘
                        │
Step 3  WHERE o.TotalAmount > 100
                        ▼
        ┌─────────────────────────────────────┐
        │ Ada   │ 101  │ 250.00                │
        │ Grace │ 103  │ 500.00                │
        └─────────────────────────────────────┘
          Linus and Ada's 80.00 order are gone
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN    ← ON: which pairs match; outer rows preserved here
3. WHERE   ← filters everything produced by step 2
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

Every surprising outer-join result in this chapter follows from those two steps being in that order.

---

# How the DBMS Executes This

```text
Parser separates predicates:
    ON    → join predicates
    WHERE → filter predicates

↓

Optimizer, inner join:
    predicates may move freely between the two

↓

Optimizer, outer join:
    join predicates stay on the join
    filter predicates on the optional side
    cannot be moved into the join (it would change the result)

↓

Executor:
    join predicate decides matching
    filter predicate applies afterwards
```

Some engines will *convert* an outer join to an inner join when a `WHERE` predicate on the optional side makes preservation impossible—a rewrite known as "outer join simplification". The result is correct; it simply confirms that the query was already an inner join in disguise.

---

# 🔒 Security Note

In multi-tenant systems, placing the tenant predicate in the `ON` clause of an outer join is an isolation failure:

```sql
-- ❌ Rows of other tenants survive, NULL-extended
FROM Accounts AS a
LEFT JOIN Documents AS d
    ON  d.AccountID = a.AccountID
    AND d.TenantID  = :tenant_id;
```

The join preserves every account row regardless of tenant. Tenant predicates belong in `WHERE`, on every table, or—better—in row-level security policies enforced by the database rather than by each query.

---

# 🏗️ Architecture Insight

`ON` describes the *shape* of the data model; `WHERE` describes the *question* being asked. Keeping them separate means the join clauses of a query read like the schema and the `WHERE` clause reads like the requirement—which is exactly what makes a long query reviewable by someone who did not write it.

---

# ⚡ Performance Tip

Moving a condition from `WHERE` to `ON` on an inner join changes nothing about performance—the optimizer normalises both. Moving it on an *outer* join changes the result, which is a correctness question, not a tuning one. Never move predicates between clauses to make a query faster.

---

# 🌍 Production Consideration

When a report "loses rows" after a seemingly unrelated change, the usual cause is a new filter added to a `WHERE` clause that sits below an outer join. Adding conditions to a query with outer joins should always prompt the question: which table does this apply to, and is that table preserved?

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `ON` accepts any predicate | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Outer join simplification | — | ✅ | ✅ | ✅ | ✅ | ✅ |
| Predicate pushdown through outer joins | — | ✅ (preserved side) | ✅ | ✅ | ✅ | ✅ |
| Legacy `(+)` with `OR` | — | — | — | — | ❌ restricted | — |

> **Portability Tip:** Every major database follows the same `ON`/`WHERE` semantics here—this is one of the most reliably portable areas of SQL. Only Oracle's legacy `(+)` operator deviates, and it cannot express `ON` conditions combined with `OR` at all.

---

# Common Mistakes

### Mistake 1

Filtering the optional table in `WHERE` and wondering where the rows went.

---

### Mistake 2

Writing `LEFT JOIN` with a `WHERE` filter on the right table when an inner join was intended, leaving the reader to guess.

---

### Mistake 3

Putting the date condition of an anti-join in `WHERE`, so `IS NULL` finds nothing.

---

### Mistake 4

Placing a tenant or permission predicate in the `ON` clause of an outer join.

---

# Best Practices

✔ Relationships in `ON`, restrictions in `WHERE`.

✔ For outer joins, put conditions on the optional table in `ON`.

✔ Write `INNER JOIN` when you mean an inner join.

✔ Keep security predicates in `WHERE`, on every table.

✔ When adding a condition, name the table it applies to and check whether that table is preserved.

---

# Interview Questions

## Basic

1. What is the difference between `ON` and `WHERE`?
2. When are they interchangeable?
3. What happens if you filter the right table of a left join in `WHERE`?

## Intermediate

4. How do you keep all customers while showing only their September orders?
5. Why must the extra condition of an anti-join be in `ON`?
6. How do you convert a left join to an inner join deliberately?

## Advanced

7. Why can filters on the optional side of an outer join not be pushed down?
8. What is outer join simplification?
9. Why is a tenant predicate in an outer join's `ON` clause a security bug?

---

# Hands-on Exercises

## Exercise 1

Write "all customers with their orders over 100, keeping every customer".

---

## Exercise 2

Write "Australian customers with all their orders" and explain the clause choice.

---

## Exercise 3

Find customers with no orders in September 2026.

---

## Exercise 4

Take a `LEFT JOIN` whose right table is filtered in `WHERE` and rewrite it two ways: preserving the left rows, and as an explicit inner join.

---

# Related Topics

- **07.03 — INNER JOIN**
- **07.04 — LEFT JOIN (LEFT OUTER JOIN)**
- **07.12 — NULL Handling in JOINs**
- **07.13 — Semi-Joins and Anti-Joins (EXISTS and NOT EXISTS)**
- **06.08 — NULL Handling in WHERE (Three-Valued Logic)**
- **06.11 — Execution Flow of WHERE**

---

# Summary

`ON` decides which row pairs match; `WHERE` decides which rows of the combined result survive. For inner joins the two are interchangeable, because unmatched rows are discarded either way, and optimizers rewrite freely between them. For outer joins they are not: preservation happens at the join step, and a `WHERE` condition on the optional side evaluates to UNKNOWN for `NULL`-extended rows, silently converting the query into an inner join. Keep relationships in `ON` and restrictions in `WHERE`, put conditions on the optional table in `ON`, write `INNER JOIN` when that is what you mean, and never place a tenant or permission predicate in an outer join's `ON` clause.
