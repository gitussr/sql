---
title: "06.10 - EXISTS and Subqueries in WHERE (Introduction)"
description: "Introduce subqueries as filters in the SQL WHERE clause: scalar subqueries, IN subqueries, EXISTS and NOT EXISTS, correlated subqueries, semi-joins and anti-joins, and how to choose between EXISTS, IN, and JOIN."
chapter: 6
section: 6.10
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 55 min
lastUpdated: 2026-09-19
---

# 06.10 EXISTS and Subqueries in WHERE (Introduction)

---

# Learning Objectives

After completing this section, you will be able to:

- Use a subquery as part of a `WHERE` condition.
- Compare a column with a scalar subquery.
- Filter with `IN (subquery)`.
- Filter with `EXISTS` and `NOT EXISTS`.
- Explain correlated subqueries.
- Explain semi-joins and anti-joins.
- Choose between `EXISTS`, `IN`, and `JOIN`.

> **Note:** This section introduces subqueries only as filters. Subqueries in all their forms are covered in depth in a later chapter.

---

# What is a Subquery?

A **subquery** is a `SELECT` statement nested inside another statement.

```sql
SELECT
    ProductName,
    Price
FROM Products
WHERE Price > (
    SELECT AVG(Price)
    FROM Products
);
```

The inner query calculates the average price. The outer query returns products above it.

---

# Three Ways to Filter with a Subquery

| Form | Question it answers |
|------|---------------------|
| `column > (scalar subquery)` | How does this value compare with one computed value? |
| `column IN (subquery)` | Is this value in a computed list? |
| `EXISTS (subquery)` | Does at least one related row exist? |

---

# Scalar Subqueries

A **scalar subquery** returns exactly one row and one column.

```sql
SELECT
    EmployeeName,
    Salary
FROM Employees
WHERE Salary = (
    SELECT MAX(Salary)
    FROM Employees
);
```

Returns the highest-paid employee(s).

Rules:

- If the subquery returns **no rows**, its value is `NULL`, and the comparison is UNKNOWN.
- If it returns **more than one row**, the query fails with an error.

Scalar subqueries are how you use an aggregate result in `WHERE`—something `WHERE` cannot do directly.

---

# IN with a Subquery

```sql
SELECT
    CustomerName
FROM Customers
WHERE CustomerID IN (
    SELECT CustomerID
    FROM Orders
    WHERE TotalAmount > 5000
);
```

Returns customers who have at least one order above 5,000.

Each customer appears **once**, even if they have many qualifying orders.

---

# EXISTS

`EXISTS` returns TRUE if the subquery returns **at least one row**.

```sql
SELECT
    c.CustomerName
FROM Customers c
WHERE EXISTS (
    SELECT 1
    FROM Orders o
    WHERE o.CustomerID = c.CustomerID
      AND o.TotalAmount > 5000
);
```

This returns the same customers as the `IN` version.

Key properties:

- `EXISTS` never returns UNKNOWN—only TRUE or FALSE.
- The select list inside `EXISTS` is ignored; `SELECT 1`, `SELECT *`, and `SELECT NULL` are equivalent.
- The engine can stop searching as soon as one matching row is found.

---

# Correlated Subqueries

The subquery above refers to `c.CustomerID` from the **outer** query:

```sql
WHERE o.CustomerID = c.CustomerID
```

This makes it a **correlated subquery**: logically, it is evaluated once for each outer row.

```text
For each customer c:
    Does any order o exist with o.CustomerID = c.CustomerID
    and o.TotalAmount > 5000?
        yes → keep c
        no  → discard c
```

A **non-correlated** subquery (such as `SELECT AVG(Price) FROM Products`) does not reference the outer query and can be evaluated once.

---

# NOT EXISTS

`NOT EXISTS` returns TRUE when **no** matching row exists.

```sql
SELECT
    c.CustomerName
FROM Customers c
WHERE NOT EXISTS (
    SELECT 1
    FROM Orders o
    WHERE o.CustomerID = c.CustomerID
);
```

Returns customers who have never placed an order.

Because `EXISTS` never produces UNKNOWN, `NOT EXISTS` is **NULL-safe**—unlike `NOT IN` (Section 06.06).

---

# EXISTS vs NOT IN with NULLs

```sql
-- Can silently return no rows if Orders.CustomerID contains NULL
WHERE CustomerID NOT IN (SELECT CustomerID FROM Orders)
```

```sql
-- Always correct
WHERE NOT EXISTS (
    SELECT 1
    FROM Orders o
    WHERE o.CustomerID = c.CustomerID
)
```

For "has no related rows", `NOT EXISTS` should be your default.

---

# EXISTS vs JOIN

A join can also find customers with large orders:

```sql
SELECT
    c.CustomerName
FROM Customers c
JOIN Orders o
    ON o.CustomerID = c.CustomerID
WHERE o.TotalAmount > 5000;
```

But a customer with three large orders appears **three times**.

| Approach | Duplicates outer rows? | Can return columns from the inner table? |
|----------|------------------------|------------------------------------------|
| `JOIN` | Yes, one per match | ✅ |
| `IN (subquery)` | No | ❌ |
| `EXISTS` | No | ❌ |

Adding `DISTINCT` to the join "fixes" the duplicates but does extra work and hides intent (Section 05.07). When you only need to know whether related rows exist, use `EXISTS` or `IN`.

---

# Semi-Joins and Anti-Joins

`EXISTS` and `IN (subquery)` express a **semi-join**:

> Return each outer row that has at least one match—once.

`NOT EXISTS` expresses an **anti-join**:

> Return each outer row that has no match.

```text
Customers            Orders
┌────┐               ┌────┐
│ 1  │───────────────│ 1  │
│ 2  │───────────────│ 2  │
│ 2  │ (duplicate    │ 2  │
│    │  if JOIN)     │    │
│ 3  │               │    │   ← 3 has no orders
└────┘               └────┘

Semi-join (EXISTS):      1, 2
Anti-join (NOT EXISTS):  3
Inner JOIN:              1, 2, 2
```

---

# Choosing Between EXISTS, IN, and JOIN

```text
Need columns from the related table?
        │
        ├── yes → JOIN
        │
        └── no
             │
             ├── "Has at least one match"   → EXISTS  (or IN)
             │
             └── "Has no match"             → NOT EXISTS
```

On modern optimizers, `EXISTS` and `IN (subquery)` usually produce the same plan. Choose the one that reads most naturally, and never use `NOT IN` with a nullable subquery column.

---

# Visual Representation

```text
Outer query                         Subquery
─────────────                       ───────────────────────────
FROM Customers c         ───►       FROM Orders o
                                    WHERE o.CustomerID = c.CustomerID
WHERE EXISTS ( ... )     ◄───       at least one row?  TRUE / FALSE
      │
      ▼
Keep customers where EXISTS is TRUE
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE   ← Subquery predicates (EXISTS, IN, scalar) evaluated here
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

Each subquery has its own complete logical execution order internally.

---

# How the DBMS Executes This

Although a correlated subquery is *defined* as running once per outer row, optimizers rarely execute it that way.

```text
WHERE EXISTS (SELECT 1 FROM Orders o WHERE o.CustomerID = c.CustomerID)

↓

Recognize a semi-join between Customers and Orders

↓

Choose a join algorithm:

├── Nested loop semi-join
│   For each customer, probe an index on Orders(CustomerID);
│   stop at the first match
│
├── Hash semi-join
│   Build a hash table of Orders.CustomerID;
│   probe it with each customer
│
└── Merge semi-join
    Walk both inputs in CustomerID order
```

---

# 🔬 Engine Deep Dive

This transformation is called **subquery unnesting** (or decorrelation):

```text
Developer writes

SELECT ... FROM Customers c
WHERE EXISTS (SELECT 1 FROM Orders o
              WHERE o.CustomerID = c.CustomerID)

        │

        ▼

Optimizer unnests the subquery

        │

        ▼

Customers  ⋉  Orders          (⋉ = semi-join)
   on c.CustomerID = o.CustomerID

        │

        ▼

Cost-based choice of nested loop / hash / merge
```

Once unnested, the subquery is optimized like any other join: indexes, statistics, and join order all apply. An index on the correlated column—here `Orders(CustomerID)`—is usually the single most important factor.

---

# 🏗️ Architecture Insight

`EXISTS` expresses a question about **relationships** rather than values: "does this customer have orders?" In a well-designed schema, those relationships follow foreign keys. Indexing foreign-key columns makes `EXISTS`, `NOT EXISTS`, joins, and cascading actions efficient at the same time.

---

# ⚡ Performance Tip

Index the columns used to correlate subqueries, typically foreign keys. For `EXISTS` with additional conditions (such as `TotalAmount > 5000`), a composite index on `(CustomerID, TotalAmount)` can answer the subquery entirely from the index.

---

# 🔒 Security Note

Subqueries run with the same permissions as the outer query. A filter such as `WHERE EXISTS (SELECT 1 FROM Payroll ...)` requires read access to `Payroll`, and its results can reveal information about that table even when no `Payroll` columns are returned. Treat existence checks against sensitive tables as data access.

---

# 🌍 Production Consideration

`NOT IN (subquery)` failures are common in long-lived systems: a query works for years, then a nullable foreign key receives its first `NULL` and the query suddenly returns nothing. Replacing `NOT IN` with `NOT EXISTS` is a standard preventive refactoring.

---

# 🚀 Enterprise Practice

Many teams standardize on `EXISTS` / `NOT EXISTS` for all relationship checks, reserve `IN` for literal lists, and use joins only when columns from the related table are needed. This makes intent visible at a glance during code review.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Scalar subquery in `WHERE` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `IN (subquery)` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `EXISTS` / `NOT EXISTS` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Correlated subqueries | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ANY` / `SOME` / `ALL` with subquery | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Semi-join optimization | Implementation-defined | ✅ | ✅ (5.6+) | ✅ | ✅ | Limited |

> **Portability Tip:** `EXISTS`, `NOT EXISTS`, and `IN (subquery)` are portable across all major databases. Quantified comparisons such as `> ALL (subquery)` are standard but unsupported in SQLite.

---

# Common Mistakes

### Mistake 1

Using `NOT IN` with a subquery that can return `NULL`.

---

### Mistake 2

Using a scalar subquery that can return more than one row.

---

### Mistake 3

Using `JOIN` plus `DISTINCT` when `EXISTS` expresses the intent.

---

### Mistake 4

Forgetting the correlation condition inside `EXISTS`, so the subquery is TRUE for every outer row:

```sql
WHERE EXISTS (SELECT 1 FROM Orders)   -- TRUE whenever Orders has any row
```

---

# Best Practices

✔ Use `EXISTS` for "has at least one related row".

✔ Use `NOT EXISTS` for "has no related rows".

✔ Use scalar subqueries only when exactly one value is guaranteed.

✔ Index correlated (usually foreign-key) columns.

✔ Use `JOIN` when you need columns from the related table.

---

# Interview Questions

## Basic

1. What is a subquery?
2. What does `EXISTS` return?
3. What is the difference between `IN (subquery)` and `EXISTS`?

## Intermediate

4. What is a correlated subquery?
5. Why is `NOT EXISTS` safer than `NOT IN`?
6. Why can a `JOIN` return duplicate outer rows when `EXISTS` does not?

## Advanced

7. What are semi-joins and anti-joins?
8. What is subquery unnesting?
9. Which index best supports `WHERE EXISTS (SELECT 1 FROM Orders o WHERE o.CustomerID = c.CustomerID AND o.Status = 'Open')`?

---

# Hands-on Exercises

## Exercise 1

Return products priced above the average product price.

---

## Exercise 2

Return departments that have at least one employee, using `EXISTS`.

---

## Exercise 3

Return products that have never been ordered, using `NOT EXISTS`.

---

## Exercise 4

Rewrite without `DISTINCT` so that each customer appears once:

```sql
SELECT DISTINCT c.CustomerName
FROM Customers c
JOIN Orders o
    ON o.CustomerID = c.CustomerID
WHERE o.OrderDate >= DATE '2026-01-01';
```

---

# Related Topics

- **05.07 — DISTINCT**
- **06.06 — IN and NOT IN**
- **06.08 — NULL Handling in WHERE (Three-Valued Logic)**
- **07.xx — JOINs**
- **09.xx — Subqueries**
- **15.xx — Query Optimization**

---

# Summary

Subqueries let a `WHERE` clause filter using computed values and relationships. Scalar subqueries compare against a single value, `IN (subquery)` tests membership in a computed list, and `EXISTS` asks whether at least one related row exists. `EXISTS` and `IN` express semi-joins that never duplicate outer rows, while `NOT EXISTS` expresses a NULL-safe anti-join. Optimizers unnest these subqueries into efficient join operations, so indexing the correlated columns—usually foreign keys—is the key to good performance.
