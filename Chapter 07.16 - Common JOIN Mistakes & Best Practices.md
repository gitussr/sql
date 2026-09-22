---
title: "07.16 - Common JOIN Mistakes & Best Practices"
description: "The twelve most common JOIN mistakes with fixes: missing conditions, the outer-join WHERE trap, fan-out aggregates, NOT IN with NULLs, NATURAL JOIN, type mismatches, unindexed foreign keys, SELECT *, and a review checklist for multi-table queries."
chapter: 7
section: 7.16
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 40 min
lastUpdated: 2026-09-22
---

# 07.16 Common JOIN Mistakes & Best Practices

---

# Learning Objectives

After completing this section, you will be able to:

- Recognise the twelve most common join defects.
- Explain the mechanism behind each one.
- Apply the correct fix.
- Review a multi-table query systematically.
- Verify a join's correctness before shipping it.

---

# Mistake 1 — The Missing Join Condition

```sql
-- ❌ Cartesian product, no error
SELECT c.CustomerName, o.OrderID
FROM Customers c, Orders o;
```

```sql
-- ✅
SELECT c.CustomerName, o.OrderID
FROM Customers AS c
INNER JOIN Orders AS o ON o.CustomerID = c.CustomerID;
```

**Mechanism.** With no condition, every pair is emitted: `3,000 × 900,000 = 2.7 billion` rows.

**How to spot it.** A row count that is an exact multiple of a table's size; totals inflated by a round factor; a plan with a join and no predicate.

**Prevention.** Explicit `JOIN ... ON` makes it a syntax error.

---

# Mistake 2 — Filtering the Optional Side in WHERE

```sql
-- ❌ LEFT JOIN behaves as INNER JOIN
FROM Customers AS c
LEFT JOIN Orders AS o ON o.CustomerID = c.CustomerID
WHERE o.TotalAmount > 100;
```

```sql
-- ✅ Every customer kept
FROM Customers AS c
LEFT JOIN Orders AS o
    ON  o.CustomerID = c.CustomerID
    AND o.TotalAmount > 100;
```

**Mechanism.** `NULL > 100` is UNKNOWN, so `NULL`-extended rows fail the filter.

**How to spot it.** A `LEFT JOIN` whose optional table appears in `WHERE` without an `IS NULL` test.

---

# Mistake 3 — An Inner Join After an Outer Join

```sql
-- ❌ Preservation cancelled at the third join
FROM Customers  AS c
LEFT  JOIN Orders     AS o  ON o.CustomerID = c.CustomerID
INNER JOIN OrderItems AS oi ON oi.OrderID   = o.OrderID;
```

```sql
-- ✅
FROM Customers AS c
LEFT JOIN Orders     AS o  ON o.CustomerID = c.CustomerID
LEFT JOIN OrderItems AS oi ON oi.OrderID   = o.OrderID;
```

**Mechanism.** After the left join, `o.OrderID` is `NULL` for unmatched customers, and the inner join on `NULL` matches nothing.

---

# Mistake 4 — Fan-Out Across Two 1:N Branches

```sql
-- ❌ item_total × 2, paid_total × 3
FROM Orders AS o
JOIN OrderItems AS oi ON oi.OrderID = o.OrderID
JOIN Payments   AS p  ON p.OrderID  = o.OrderID
```

```sql
-- ✅ Aggregate each branch first
FROM Orders AS o
LEFT JOIN (SELECT OrderID, SUM(Quantity*UnitPrice) AS item_total
           FROM OrderItems GROUP BY OrderID) AS items ON items.OrderID = o.OrderID
LEFT JOIN (SELECT OrderID, SUM(Amount) AS paid_total
           FROM Payments GROUP BY OrderID) AS pays ON pays.OrderID = o.OrderID
```

**How to spot it.** Totals that are an exact small multiple of the true value; row counts that equal `items × payments`.

---

# Mistake 5 — NOT IN Against a Nullable Subquery

```sql
-- ❌ Returns nothing if any CustomerID is NULL
WHERE c.CustomerID NOT IN (SELECT o.CustomerID FROM Orders o);
```

```sql
-- ✅
WHERE NOT EXISTS (
    SELECT 1 FROM Orders AS o WHERE o.CustomerID = c.CustomerID
);
```

**Mechanism.** `x NOT IN (..., NULL)` evaluates to UNKNOWN for every row.

**How to spot it.** An exclusion query that returns zero rows "for no reason".

---

# Mistake 6 — JOIN + DISTINCT Instead of EXISTS

```sql
-- ❌ Builds every matching pair, then deduplicates
SELECT DISTINCT c.CustomerName
FROM Customers AS c
JOIN Orders AS o ON o.CustomerID = c.CustomerID;
```

```sql
-- ✅ Stops at the first match
SELECT c.CustomerName
FROM Customers AS c
WHERE EXISTS (SELECT 1 FROM Orders AS o WHERE o.CustomerID = c.CustomerID);
```

**Also.** `DISTINCT` deduplicates the whole select list, so adding a column later silently changes the result.

---

# Mistake 7 — NATURAL JOIN

```sql
-- ❌ Condition derived from column names, invisible and unstable
SELECT * FROM Customers NATURAL JOIN Orders;
```

```sql
-- ✅
SELECT c.CustomerID, c.CustomerName, o.OrderID
FROM Customers AS c
INNER JOIN Orders AS o ON o.CustomerID = c.CustomerID;
```

**Mechanism.** Adding a column present in both tables—`CreatedAt`, `Status`, `TenantID`—silently adds it to the join condition.

---

# Mistake 8 — Mismatched Data Types

```sql
-- ❌ Implicit conversion; the index on CustomerID becomes unusable
ON o.CustomerCode = c.CustomerID        -- VARCHAR = INT
```

```sql
-- ✅
ON o.CustomerID = c.CustomerID
```

**How to spot it.** `CONVERT_IMPLICIT` or a cast in the plan; a scan where a seek was expected.

---

# Mistake 9 — Functions on Join Columns

```sql
-- ❌ Not SARGable
ON UPPER(c.Email) = UPPER(o.Email)
```

```sql
-- ✅ Solve it in the schema
-- case-insensitive collation, generated column, or:
CREATE INDEX IX_Customers_Email_Lower ON Customers (LOWER(Email));
```

---

# Mistake 10 — Unindexed Foreign Keys

```sql
-- ❌ Constraint without an index: integrity, but scans
ALTER TABLE Orders ADD CONSTRAINT FK_Orders_Customers
    FOREIGN KEY (CustomerID) REFERENCES Customers(CustomerID);
```

```sql
-- ✅ Add the index too
CREATE INDEX IX_Orders_CustomerID ON Orders (CustomerID);
```

Only MySQL's InnoDB creates the index automatically.

---

# Mistake 11 — SELECT * in a Multi-Table Join

```sql
-- ❌ Duplicated keys, unnecessary I/O, breaks when a column is added
SELECT * FROM Customers c JOIN Orders o ON o.CustomerID = c.CustomerID;
```

```sql
-- ✅
SELECT c.CustomerName, o.OrderID, o.TotalAmount
FROM Customers AS c
INNER JOIN Orders AS o ON o.CustomerID = c.CustomerID;
```

Named columns also make covering indexes possible and keep hash tables small.

---

# Mistake 12 — Unqualified Columns

```sql
-- ❌ Ambiguous now, or ambiguous after the next schema change
SELECT CustomerID, OrderID, Status
FROM Customers c JOIN Orders o ON o.CustomerID = c.CustomerID;
```

```sql
-- ✅
SELECT c.CustomerID, o.OrderID, o.Status
FROM Customers AS c
INNER JOIN Orders AS o ON o.CustomerID = c.CustomerID;
```

An unqualified column that resolves today can become ambiguous—or, worse, silently resolve to the *other* table—when a column is added.

---

# Summary Table

| # | Mistake | Symptom | Fix |
|---|---------|---------|-----|
| 1 | Missing join condition | Huge result, inflated totals | Explicit `JOIN ... ON` |
| 2 | Filtering optional side in `WHERE` | Rows missing | Move the condition to `ON` |
| 3 | Inner join after outer join | Preserved rows lost | Keep the chain outer |
| 4 | Fan-out across branches | Totals multiplied | Pre-aggregate each branch |
| 5 | `NOT IN` with `NULL`s | Empty result | `NOT EXISTS` |
| 6 | `JOIN` + `DISTINCT` | Slow, fragile | `EXISTS` |
| 7 | `NATURAL JOIN` | Breaks on schema change | Explicit `ON` |
| 8 | Type mismatch | Scan instead of seek | Align the types |
| 9 | Function on join column | Index unused | Index the expression |
| 10 | Unindexed foreign key | Repeated scans | Create the index |
| 11 | `SELECT *` | Extra I/O, duplicate keys | Name the columns |
| 12 | Unqualified columns | Ambiguity, silent drift | Qualify everything |

---

# Best Practices

## Correctness

✔ Explicit `JOIN ... ON` always; never comma joins.

✔ Choose the join type from the question, not from habit.

✔ Conditions on the optional table go in `ON`.

✔ Keep the chain outer once it is outer.

✔ Name the grain after each join; pre-aggregate 1:N branches.

✔ `NOT EXISTS` for exclusion, `EXISTS` for existence.

## Readability

✔ Alias every table meaningfully; qualify every column.

✔ One table per line; filters in `WHERE`, below the joins.

✔ Spell out `INNER` and `OUTER`.

✔ Prefer `LEFT` over `RIGHT`; never mix directions.

✔ Split queries above about six tables into named CTEs.

## Performance

✔ Index every foreign key used in a join.

✔ Match data types and collations.

✔ Keep join columns bare.

✔ Filter and pre-aggregate before joining.

✔ Select only the columns you need.

✔ Read the plan; compare estimated with actual rows.

---

# Review Checklist

```text
Correctness
  □ Does every join have a condition?
  □ Is the join type right for the question?
  □ Are outer-join conditions in ON, not WHERE?
  □ Does an inner join follow an outer join?
  □ What is the grain of the result?
  □ Do two 1:N branches meet before aggregation?
  □ Is any NOT IN used against a nullable column?

Readability
  □ Explicit JOIN syntax?
  □ Every table aliased, every column qualified?
  □ Any NATURAL JOIN?
  □ Mixed LEFT and RIGHT joins?

Performance
  □ Are the join keys indexed?
  □ Do the data types match?
  □ Any function or cast on a join column?
  □ Is SELECT * used?
  □ Has the plan been checked?
```

---

# Verification Before Shipping

```sql
-- 1. Row count against the expected grain
SELECT COUNT(*) FROM (/* the query */) AS q;

-- 2. One known entity, checked by hand
SELECT * FROM (/* the query */) AS q WHERE q.OrderID = 101;

-- 3. Totals against the source
SELECT SUM(TotalAmount) FROM Orders WHERE OrderDate >= DATE '2026-09-01';

-- 4. Nothing lost by the joins
SELECT COUNT(*) FROM Customers;            -- vs distinct customers in the result
```

Any join whose result feeds a financial, regulatory or customer-facing number deserves all four checks.

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN    ← mistakes 1, 3, 4, 7, 8 happen here
3. WHERE   ← mistakes 2, 5 happen here
4. GROUP BY
5. HAVING
6. SELECT  ← mistakes 11, 12 surface here
7. DISTINCT ← mistake 6 hides here
8. ORDER BY
9. LIMIT / FETCH / TOP
```

Almost every defect in this section is a consequence of steps 2 and 3 running in that order.

---

# How the DBMS Executes This

```text
The engine never warns you about any of these.

Missing condition      → a valid Cartesian product
WHERE on optional side → a valid inner join
Fan-out                → valid duplicate rows
NOT IN with NULL       → a valid empty result

Every mistake here produces correct SQL with the wrong meaning,
which is why review and verification, not error messages,
are what catch them.
```

---

# 🏗️ Architecture Insight

Most join defects are failures to state intent: the join type, the grain, and which side is optional. Queries that name their grain in a comment or CTE name (`orders_per_customer`, `items_per_order`) are dramatically easier to review, because a reader can check each step against a stated claim instead of re-deriving it.

---

# ⚡ Performance Tip

Two of the twelve mistakes—unindexed foreign keys and type mismatches—account for a large share of real-world slow joins. Both are schema problems, both are cheap to find with a single catalogue query, and both are fixed once rather than in every query.

---

# 🔒 Security Note

A join defect can be a disclosure. An outer join whose tenant predicate sits in `ON`, or a filter that a Cartesian product renders meaningless, can return rows the caller is not entitled to. Security predicates belong in `WHERE`, on every table—or, better, in database-enforced row-level security.

---

# 🌍 Production Consideration

Add a regression test for every join bug you fix. The fix is usually a one-line move from `WHERE` to `ON`, which the next refactor can undo just as easily; a test that asserts "customers with no orders still appear" keeps it fixed.

---

# SQL Standard vs Vendor Differences

| Behaviour | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|-----------|------------|--------|------------|---------|---------|
| `JOIN` without `ON` | error | allowed | error | error | allowed |
| `NATURAL JOIN` | ✅ | ✅ | ❌ | ✅ | ✅ |
| Foreign key auto-indexed | ❌ | ✅ | ❌ | ❌ | ❌ |
| `NOT IN` with `NULL` | empty | empty | empty | empty | empty |
| Implicit conversion warnings | in plan | ❌ | in plan | in plan | ❌ |

> **Portability Tip:** The `NOT IN` + `NULL` behaviour is identical everywhere—it follows from three-valued logic, not from any vendor's choice. No database will warn you about it.

---

# Interview Questions

## Basic

1. What happens when a join condition is missing?
2. Why can a `LEFT JOIN` behave like an `INNER JOIN`?
3. Why is `SELECT *` discouraged in joins?

## Intermediate

4. What is fan-out and how do you prevent it?
5. Why is `NOT EXISTS` safer than `NOT IN`?
6. Why is `NATURAL JOIN` discouraged?

## Advanced

7. Why does an inner join after an outer join cancel preservation?
8. How would you verify a multi-table aggregate before shipping it?
9. Which two schema-level mistakes cause most slow joins?

---

# Hands-on Exercises

## Exercise 1

Find the bug: a `LEFT JOIN` query missing customers, with the optional table filtered in `WHERE`.

---

## Exercise 2

Given an orders/items/payments query returning inflated totals, rewrite it correctly.

---

## Exercise 3

Rewrite a `NOT IN` exclusion as `NOT EXISTS` and demonstrate the difference with a `NULL` present.

---

## Exercise 4

Review a four-table query against the checklist and list every issue you find.

---

# Related Topics

- **07.04 — LEFT JOIN (LEFT OUTER JOIN)**
- **07.10 — Joining Multiple Tables**
- **07.11 — ON vs WHERE (Join Conditions and Filters)**
- **07.13 — Semi-Joins and Anti-Joins (EXISTS and NOT EXISTS)**
- **07.15 — JOIN Performance and Index Strategy**
- **06.13 — Common WHERE Mistakes & Best Practices**

---

# Summary

Join defects are rarely syntax errors: a missing condition, a filter in the wrong clause, an inner join after an outer one, fan-out across two 1:N branches, or a `NOT IN` against a nullable subquery all produce valid SQL with the wrong meaning. The twelve mistakes in this section cover almost every join bug seen in practice, and each has a mechanical fix—move the condition to `ON`, keep the chain outer, pre-aggregate the branches, use `NOT EXISTS`, align types, index foreign keys, name columns and qualify them. Because the engine never warns, correctness comes from stating intent clearly, reviewing against a checklist, and verifying the result against a known value before shipping.
