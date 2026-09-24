---
title: "08.09 - WHERE vs HAVING"
description: "Choosing between WHERE and HAVING: row filters versus group filters, why the same condition can give different results in each, the cost of filtering late, conditions that can move between them, and combining both in one query."
chapter: 8
section: 8.09
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 30 min
lastUpdated: 2026-09-24
---

# 08.09 WHERE vs HAVING

---

# Learning Objectives

After completing this section, you will be able to:

- State the difference between `WHERE` and `HAVING` in one sentence.
- Decide, for any condition, which clause it belongs in.
- Show how moving a condition between the clauses changes the result.
- Explain why filtering in `HAVING` can be far slower.
- Use `WHERE` and `HAVING` together correctly.

---

# The One-Sentence Difference

**`WHERE` decides which rows enter the groups; `HAVING` decides which groups leave.**

| | `WHERE` | `HAVING` |
|---|---------|----------|
| Filters | Individual rows | Whole groups |
| Runs | Before `GROUP BY` | After `GROUP BY` |
| Can use aggregates | ❌ | ✅ |
| Can use ungrouped columns | ✅ | ❌ (only inside aggregates) |
| Affects what aggregates see | ✅ | ❌ |
| Needs `GROUP BY` | No | No (whole input is one group) |

---

# Same Words, Different Question

Moving a condition from one clause to the other usually changes **what** is being asked.

```sql
-- A: revenue from large orders, per customer
SELECT CustomerID, SUM(TotalAmount) AS Revenue
FROM Orders
WHERE TotalAmount > 100
GROUP BY CustomerID;

-- B: customers whose largest order exceeds 100, with ALL their revenue
SELECT CustomerID, SUM(TotalAmount) AS Revenue
FROM Orders
GROUP BY CustomerID
HAVING MAX(TotalAmount) > 100;
```

```text
Orders
Cust 1: 250.00, 80.00
Cust 2: 500.00, 120.00
Cust 3:  60.00

A (WHERE TotalAmount > 100)          B (HAVING MAX(TotalAmount) > 100)
┌──────┬─────────┐                   ┌──────┬─────────┐
│ 1    │ 250.00  │  ← 80 excluded    │ 1    │ 330.00  │  ← 80 included
│ 2    │ 620.00  │                   │ 2    │ 620.00  │
└──────┴─────────┘                   └──────┴─────────┘
Customer 3: no rows survive          Customer 3: group fails HAVING
```

Neither is wrong. `WHERE` changed what was summed; `HAVING` changed which summaries were kept. Decide which question you mean, then choose the clause.

---

# The Decision Rule

```text
Does the condition need an aggregate (COUNT, SUM, AVG, MIN, MAX …)?
│
├── Yes ──→ HAVING
│
└── No ───→ Should the condition change which rows are summed?
            │
            ├── Yes ──→ WHERE
            │
            └── It is on a grouping column only
                (same answer either way) ──→ WHERE (cheaper)
```

| Condition | Clause | Reason |
|-----------|--------|--------|
| `Status = 'Shipped'` | `WHERE` | Row-level; restricts what is summed |
| `OrderDate >= '2026-01-01'` | `WHERE` | Row-level |
| `COUNT(*) >= 3` | `HAVING` | Needs an aggregate |
| `SUM(TotalAmount) > 1000` | `HAVING` | Needs an aggregate |
| `CustomerID IN (1, 2, 3)` (grouping column) | `WHERE` | Same result, filters earlier |

---

# Conditions on Grouping Columns

A condition on a grouping column gives the same result in either clause, because every row of a group has the same value:

```sql
-- Same result
SELECT CustomerID, SUM(TotalAmount) FROM Orders
WHERE CustomerID IN (1, 2)
GROUP BY CustomerID;

SELECT CustomerID, SUM(TotalAmount) FROM Orders
GROUP BY CustomerID
HAVING CustomerID IN (1, 2);
```

`WHERE` is still the right place:

- it states that the condition is about rows, not summaries;
- it reads less data when the optimizer does not move the `HAVING` condition itself;
- it lets an index on `CustomerID` restrict the scan.

Most optimizers do push such `HAVING` predicates down (Section 08.08), but writing them in `WHERE` does not depend on it.

---

# The Cost of Filtering Late

```sql
-- ❌ Aggregates every customer in a 50-million-row table, then keeps one
SELECT CustomerID, SUM(TotalAmount)
FROM Orders
GROUP BY CustomerID
HAVING CustomerID = 42;

-- ✅ Reads only customer 42's rows through an index
SELECT CustomerID, SUM(TotalAmount)
FROM Orders
WHERE CustomerID = 42
GROUP BY CustomerID;
```

```text
                 rows read      groups built     groups returned
HAVING version   50,000,000     1,200,000        1
WHERE version           180             1        1
```

When an optimizer fails to push the predicate down—because it is hidden inside an expression, or the query is a view—the difference is several orders of magnitude.

---

# Using Both Together

Most real grouped queries use both clauses, each for its own job:

```sql
-- Customers who spent over 1,000 on shipped orders in 2026
SELECT
    o.CustomerID,
    COUNT(*)           AS ShippedOrders,
    SUM(o.TotalAmount) AS ShippedRevenue
FROM Orders AS o
WHERE o.Status = 'Shipped'                       -- which rows count
  AND o.OrderDate >= DATE '2026-01-01'
  AND o.OrderDate <  DATE '2027-01-01'
GROUP BY o.CustomerID
HAVING SUM(o.TotalAmount) > 1000                 -- which customers qualify
ORDER BY ShippedRevenue DESC;
```

Read it as two sentences: "consider shipped 2026 orders" (`WHERE`), "keep customers above 1,000" (`HAVING`).

---

# When You Need Both Views of the Data

Sometimes a group must qualify on **all** its rows, while the total reports only **some** of them. Conditional aggregation handles that in one pass:

```sql
-- Customers with at least 5 orders of any status,
-- reporting only their shipped revenue
SELECT
    CustomerID,
    SUM(CASE WHEN Status = 'Shipped' THEN TotalAmount ELSE 0 END) AS ShippedRevenue
FROM Orders
GROUP BY CustomerID
HAVING COUNT(*) >= 5;
```

Putting `Status = 'Shipped'` in `WHERE` here would change the `COUNT(*)` too—and customers with five orders of which three were cancelled would wrongly disappear. Section 08.10 develops this pattern.

---

# WHERE, HAVING and Outer Joins

Chapter 07's rule—conditions on the optional side of an outer join belong in `ON`—combines with this one:

```sql
SELECT
    c.CustomerID,
    COUNT(o.OrderID) AS Orders2026
FROM Customers AS c
LEFT JOIN Orders AS o
    ON  o.CustomerID = c.CustomerID
    AND o.OrderDate >= DATE '2026-01-01'   -- optional side: in ON
WHERE c.Country = 'Australia'              -- preserved side: in WHERE
GROUP BY c.CustomerID
HAVING COUNT(o.OrderID) < 2;               -- aggregate: in HAVING
```

Three clauses, three different jobs: `ON` shapes the join, `WHERE` filters rows, `HAVING` filters groups. Moving the date condition into `WHERE` would remove customers with no 2026 orders—exactly the ones this query looks for.

---

# Visual Representation

```text
           WHERE                         HAVING
             │                             │
             ▼                             ▼
rows ───[ row filter ]───→ GROUP BY ───[ group filter ]───→ result
             │                             │
   changes what is summed        changes which sums are shown
   can use indexes               runs after all aggregation
   no aggregates                 aggregates required (or grouping cols)
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← rows are filtered here, before any group exists
4. GROUP BY
5. HAVING      ← groups are filtered here, after every aggregate is known
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

Everything about the two clauses follows from their positions: `WHERE` cannot see aggregates because they do not exist yet, and `HAVING` cannot change what was summed because the summing is already done.

---

# How the DBMS Executes This

```text
Plan (top to bottom = last to first)

Sort (ShippedRevenue DESC)
  └─ Filter: SUM(TotalAmount) > 1000          ← HAVING
       └─ HashAggregate (CustomerID)
            └─ Index Scan on Orders
                 Index Cond: OrderDate range   ← WHERE (seek)
                 Filter: Status = 'Shipped'    ← WHERE (residual)
```

`WHERE` predicates sit at the bottom of the plan, at the scan, where they can use indexes. `HAVING` sits above the aggregate. That physical placement is the performance difference.

---

# 🔬 Engine Deep Dive

Predicate pushdown moves `HAVING` conditions on grouping columns below the aggregate, and even below joins, into the scan. It cannot push conditions that reference an aggregate, conditions inside a view with `DISTINCT` or window functions in some engines, or conditions whose grouping column was transformed by a non-deterministic function. Writing the condition in `WHERE` yourself removes the dependency on the optimizer's rules.

---

# 🏗️ Architecture Insight

Views that aggregate data are a common place for late filtering. A view `CustomerRevenue` grouped by `CustomerID` is queried with `WHERE CustomerID = 42`; whether that filter reaches the base table depends on the optimizer's ability to push it through the view's `GROUP BY`. Most engines can for grouping columns, but it is worth checking the plan for any heavily used aggregate view.

---

# ⚡ Performance Tip

Every row eliminated in `WHERE` is a row that is never hashed, sorted or accumulated. In grouped queries over large tables, the single most effective optimisation is usually a selective, index-friendly `WHERE` clause.

---

# 🌍 Production Consideration

When a report total changes after someone "just moved a filter" from `HAVING` to `WHERE` (or back), that is not a performance tweak—it is a change of question. Treat such changes as logic changes in code review and reconcile the totals.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Aggregates in `WHERE` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Grouping-column predicate pushdown from `HAVING` | n/a | ✅ | ✅ | ✅ | ✅ | ✅ |
| `QUALIFY` (filter on window results) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

> **Portability Tip:** Some analytical engines (Snowflake, BigQuery, DuckDB, Teradata) add `QUALIFY`, a third filter that runs after window functions. None of the five engines in this handbook support it; use a derived table and `WHERE` instead.

---

# Common Mistakes

### Mistake 1

Putting a row condition in `HAVING`, forcing the engine to aggregate everything first.

---

### Mistake 2

Moving a condition from `HAVING` to `WHERE` (or back) without noticing that the question changed.

---

### Mistake 3

Filtering by status in `WHERE` when the group's qualification must count every status.

---

### Mistake 4

Putting an optional-side outer-join condition in `WHERE` in a grouped report.

---

# Best Practices

✔ Row conditions in `WHERE`, aggregate conditions in `HAVING`.

✔ Conditions on grouping columns in `WHERE`.

✔ Use conditional aggregation when qualification and reporting need different rows.

✔ Read the plan: `WHERE` should be at the scan, `HAVING` above the aggregate.

---

# Interview Questions

## Basic

1. What is the difference between `WHERE` and `HAVING`?
2. Can `WHERE` use `COUNT(*)`?
3. Can a query have both `WHERE` and `HAVING`?

## Intermediate

4. Why can `WHERE TotalAmount > 100` and `HAVING MAX(TotalAmount) > 100` return different totals?
5. Where should a condition on a grouping column go, and why?
6. How would you find customers with five or more orders, reporting only shipped revenue?

## Advanced

7. Why can a condition on a grouping column be slower in `HAVING`, even though the result is the same?
8. When can't an optimizer push a `HAVING` predicate below the aggregate?
9. In a grouped query with a `LEFT JOIN`, where do the optional-side condition, the preserved-side condition and the aggregate condition each belong?

---

# Hands-on Exercises

## Exercise 1

Return 2026 revenue per customer, keeping only customers above 1,000, using both clauses.

---

## Exercise 2

Write the two queries from "Same Words, Different Question" and explain the difference in their results.

---

## Exercise 3

Rewrite a `HAVING CustomerID = 42` query with `WHERE` and compare the execution plans.

---

## Exercise 4

List Australian customers with fewer than two orders in 2026, including those with none.

---

# Related Topics

- **08.08 — HAVING**
- **08.10 — Conditional Aggregation (FILTER and CASE)**
- **06.11 — Execution Flow of WHERE**
- **06.12 — SARGability and Index-Friendly Predicates**
- **07.11 — ON vs WHERE (Join Conditions and Filters)**

---

# Summary

`WHERE` filters rows before grouping and therefore changes what the aggregates see; `HAVING` filters groups after grouping and therefore changes only which results are shown. A condition that needs an aggregate must go in `HAVING`; a row condition must go in `WHERE`; a condition on a grouping column gives the same answer in either but belongs in `WHERE`, where it can use an index and reduce the work. When a group must qualify on all its rows but report only some of them, conditional aggregation expresses both in a single pass.
