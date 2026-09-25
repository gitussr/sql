---
title: "09.01 - Introduction to Subqueries"
description: "What a subquery is, why SQL needs one query inside another, the three result shapes (scalar, column, table), correlated versus uncorrelated subqueries, and a first map of where subqueries may appear."
chapter: 9
section: 9.01
category: Data Query Language (DQL)
difficulty: Beginner
readingTime: 25 min
lastUpdated: 2026-09-25
---

# 09.01 Introduction to Subqueries

---

# Learning Objectives

After completing this section, you will be able to:

- Define a subquery and identify the outer and inner query.
- Recognise questions that need a subquery.
- Classify a subquery by the shape of its result: scalar, column or table.
- Distinguish correlated from uncorrelated subqueries.
- Name the clauses in which a subquery may appear.

---

# What is a Subquery?

A **subquery** (also called an *inner query* or *nested query*) is a `SELECT` statement written in parentheses inside another SQL statement. The statement that contains it is the **outer query**.

```sql
SELECT ProductName, ListPrice
FROM Products
WHERE ListPrice > (SELECT AVG(ListPrice) FROM Products);
--                 └────────────── subquery ─────────────┘
```

"Which products cost more than the average?" needs a number—the average—that no row stores. The subquery computes it; the outer query uses it.

---

# Why Subqueries Exist

A single `SELECT` can filter rows only by what it can see *in that row*. Some conditions depend on other rows:

| Question | The hidden inner question |
|----------|---------------------------|
| Products above the average price | What is the average price? |
| Customers who have ordered | Which customer IDs appear in `Orders`? |
| Customers who have never ordered | Which customer IDs do **not** appear? |
| Each employee's manager's name | What is the name of employee *ManagerID*? |
| Departments above the company average salary | What is the company average salary? |

Each inner question is a query. Writing it as a subquery lets you answer both in one statement, with the database—not the application—passing the intermediate answer along.

---

# Walking Through an Example

```text
Products
┌───────────┬─────────────┬───────────┐
│ ProductID │ ProductName │ ListPrice │
├───────────┼─────────────┼───────────┤
│ 1         │ Keyboard    │  30.00    │
│ 2         │ Monitor     │ 180.00    │
│ 3         │ Mouse       │  15.00    │
│ 4         │ Headset     │  75.00    │
└───────────┴─────────────┴───────────┘

Inner:  SELECT AVG(ListPrice) FROM Products        →  75.00

Outer:  SELECT ProductName, ListPrice
        FROM Products
        WHERE ListPrice > 75.00                    →  Monitor 180.00
```

Note that Headset (75.00) is **not** returned: `>` is strict. Replacing the subquery with its value is exactly how to reason about an uncorrelated subquery.

---

# The Three Result Shapes

What a subquery returns decides where it can be used.

```text
Scalar subquery           Column subquery           Table subquery
(1 row × 1 column)        (N rows × 1 column)       (N rows × M columns)

┌────────┐                ┌────────────┐            ┌────┬──────┬───────┐
│ 75.00  │                │ CustomerID │            │ ID │ Name │ Total │
└────────┘                ├────────────┤            ├────┼──────┼───────┤
                          │ 1          │            │ …  │ …    │ …     │
                          │ 2          │            └────┴──────┴───────┘
                          │ 5          │
                          └────────────┘

Used as a value:          Used as a list:           Used as a table:
WHERE x > (…)             WHERE x IN (…)            FROM (…) AS t
SELECT (…) AS col         WHERE x > ALL (…)         JOIN LATERAL (…)
```

A fourth, rarer shape is the **row subquery**—one row, several columns—compared with a row value: `WHERE (a, b) = (SELECT x, y FROM …)`. Section 09.02 covers it.

---

# Correlated vs Uncorrelated

An **uncorrelated** subquery can run on its own. A **correlated** subquery references a column of the outer query and cannot.

```sql
-- Uncorrelated: the same average for every product
SELECT p.ProductName
FROM Products AS p
WHERE p.ListPrice > (SELECT AVG(ListPrice) FROM Products);

-- Correlated: a different average for each product's category
SELECT p.ProductName
FROM Products AS p
WHERE p.ListPrice > (
    SELECT AVG(p2.ListPrice)
    FROM Products AS p2
    WHERE p2.CategoryID = p.CategoryID     -- p comes from the outer query
);
```

```text
Uncorrelated                         Correlated
inner runs once ──→ 75.00            for each outer row p:
outer compares every row with it         inner runs with p.CategoryID
                                         outer compares p with that result
```

This is the logical model. Section 09.14 shows how optimizers avoid literally re-running a correlated subquery for every row.

---

# Where Subqueries Can Appear

```sql
SELECT
    c.CustomerName,
    (SELECT COUNT(*) FROM Orders AS o
     WHERE o.CustomerID = c.CustomerID)       AS OrderCount     -- SELECT list
FROM (SELECT * FROM Customers
      WHERE Country = 'India') AS c                             -- FROM
WHERE EXISTS (SELECT 1 FROM Orders AS o
              WHERE o.CustomerID = c.CustomerID)                -- WHERE
ORDER BY (SELECT MAX(o.OrderDate) FROM Orders AS o
          WHERE o.CustomerID = c.CustomerID) DESC;              -- ORDER BY
```

| Clause | Allowed shapes | Section |
|--------|----------------|---------|
| `SELECT` list | Scalar | 09.03 |
| `FROM` / `JOIN` | Table (derived table, `LATERAL`) | 09.08, 09.10 |
| `WHERE` | Scalar, column (`IN`, `ANY`, `ALL`), `EXISTS` | 09.03–09.07 |
| `HAVING` | Scalar, column, `EXISTS` | 09.09 |
| `ORDER BY` | Scalar | 09.03 |
| `INSERT`, `UPDATE`, `DELETE` | All | 09.11 |

---

# Nesting

Subqueries can contain subqueries:

```sql
-- Customers who bought the most expensive product
SELECT c.CustomerName
FROM Customers AS c
WHERE c.CustomerID IN (
    SELECT o.CustomerID
    FROM Orders AS o
    WHERE o.OrderID IN (
        SELECT oi.OrderID
        FROM OrderItems AS oi
        WHERE oi.ProductID = (
            SELECT ProductID FROM Products
            ORDER BY ListPrice DESC
            FETCH FIRST 1 ROW ONLY
        )
    )
);
```

Read nested queries from the inside out: the innermost query finds one product, the next finds orders containing it, the next finds customers who placed those orders. Deep nesting is legal but hard to review; beyond two or three levels, derived tables (Section 09.08) or common table expressions read better.

---

# Visual Representation

```text
                 ┌─────────────────────────── outer query ───────────────────────────┐
                 │                                                                     │
 rows of         │   WHERE ListPrice >  ┌──────────── subquery ────────────┐           │
 Products ──────→│                      │ SELECT AVG(ListPrice)            │──→ 75.00  │──→ result
                 │                      │ FROM Products                    │           │
                 │                      └──────────────────────────────────┘           │
                 └─────────────────────────────────────────────────────────────────────┘
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← a subquery here produces a table
2. JOIN
3. WHERE       ← a subquery here produces a value, a list or TRUE/FALSE
4. GROUP BY
5. HAVING
6. SELECT      ← a subquery here produces one value per row
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

Each subquery runs its own full `FROM … ORDER BY` sequence; its result is then consumed at the step where it appears.

---

# How the DBMS Executes This

```text
SELECT ProductName FROM Products
WHERE ListPrice > (SELECT AVG(ListPrice) FROM Products)

↓

Plan
  Filter: ListPrice > $0
    Seq Scan on Products
  InitPlan $0 (runs once)
    Aggregate AVG(ListPrice)
      Seq Scan on Products
```

An uncorrelated scalar subquery becomes an *InitPlan* (PostgreSQL), a *constant scan* (SQL Server) or a similar node: computed once, then used as a constant by the outer filter.

---

# 🔬 Engine Deep Dive

During binding, the engine resolves every column name in a subquery by searching scopes from the inside out: first the subquery's own `FROM`, then the enclosing query's `FROM`, and so on. A column found in an outer scope is an **outer reference**, and its presence is precisely what makes a subquery correlated. This is why an unqualified column that exists only in the outer table silently turns a subquery into a correlated one (Section 09.16).

---

# 🏗️ Architecture Insight

Subqueries let the database carry an intermediate result from one question to the next without a round trip. The alternative—run one query, fetch its result into the application, and build a second query from it—costs a network round trip, breaks transactional consistency between the two reads, and invites SQL built by string concatenation.

---

# ⚡ Performance Tip

Don't assume a subquery is slow or that a join is fast. Optimizers rewrite most subqueries into joins. Compare execution plans, not query shapes.

---

# 🔒 Security Note

Never build the inner query in application code from the outer query's results (for example, a comma-separated list of IDs pasted into `IN (…)`). A subquery keeps the whole operation inside one parameterised statement.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Subquery in `WHERE` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Subquery in `SELECT` list | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Subquery in `FROM` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Subquery in `ORDER BY` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Maximum nesting depth | Unspecified | No fixed limit | Implementation limit | 32 | 255 (in `WHERE`) | Expression-depth limit |

> **Portability Tip:** Nesting limits are rarely reached by hand-written SQL, but generated SQL (ORMs, report builders) can hit SQL Server's limit of 32 nested levels.

---

# Common Mistakes

### Mistake 1

Forgetting the parentheses:

```sql
-- ❌ syntax error
SELECT * FROM Products WHERE ListPrice > SELECT AVG(ListPrice) FROM Products;
```

---

### Mistake 2

Comparing with `=` against a subquery that returns several rows:

```sql
-- ❌ fails at run time if more than one customer is in India
SELECT * FROM Orders
WHERE CustomerID = (SELECT CustomerID FROM Customers WHERE Country = 'India');
```

Use `IN` for a list.

---

### Mistake 3

Nesting five levels deep where a join or a derived table would be clearer.

---

# Best Practices

✔ Write and test the inner query on its own first.

✔ Give tables inside and outside the subquery different aliases.

✔ Match the operator to the result shape: `=` for one value, `IN` for a list.

✔ Prefer a derived table or common table expression over deep nesting.

---

# Interview Questions

## Basic

1. What is a subquery?
2. What are the outer and inner queries?
3. Name three clauses in which a subquery may appear.

## Intermediate

4. What is the difference between a scalar and a column subquery?
5. What makes a subquery correlated?
6. Why does `WHERE x = (SELECT …)` sometimes fail at run time?

## Advanced

7. How does the engine decide whether a column in a subquery is an outer reference?
8. Why is running two separate queries from the application worse than one query with a subquery?
9. Is a correlated subquery necessarily executed once per outer row?

---

# Hands-on Exercises

## Exercise 1

Return products whose list price is below the average list price.

---

## Exercise 2

Return customers who placed at least one order with `Status = 'Cancelled'`.

---

## Exercise 3

Return employees who earn more than the average salary of their own department.

---

## Exercise 4

Classify each subquery you wrote above as scalar, column or table, and as correlated or uncorrelated.

---

# Related Topics

- **09.02 — Subquery Syntax and Placement**
- **09.03 — Scalar Subqueries**
- **09.07 — Correlated Subqueries**
- **06.10 — EXISTS and Subqueries in WHERE (Introduction)**
- **08.08 — HAVING**
- **04.19 — SQL Execution Order**

---

# Summary

A subquery is a `SELECT` in parentheses inside another statement; it answers an inner question whose result the outer query needs. Its result shape—one value, one column or a whole table—decides where it may appear, and whether it references the outer query decides whether it is correlated. Uncorrelated subqueries can be read by replacing them with their result; correlated subqueries are logically re-evaluated for each outer row, though optimizers usually find a cheaper plan. Test the inner query alone, alias every table, and match the operator to the shape of the result.
