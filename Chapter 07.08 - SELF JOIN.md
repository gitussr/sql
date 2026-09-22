---
title: "07.08 - SELF JOIN"
description: "Self joins explained: joining a table to itself with aliases, employee/manager hierarchies, finding duplicates, comparing rows within a table, pairwise combinations without duplicates, and where recursive CTEs take over from self joins."
chapter: 7
section: 7.08
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 35 min
lastUpdated: 2026-09-22
---

# 07.08 SELF JOIN

---

# Learning Objectives

After completing this section, you will be able to:

- Join a table to itself using aliases.
- Read employee/manager hierarchies with inner and outer self joins.
- Find duplicate rows with a self join.
- Compare rows within the same table.
- Produce pairwise combinations without mirror duplicates.
- Explain when a recursive CTE replaces a self join.

---

# What is a Self Join?

A self join is an ordinary join in which both sides are the same table. Nothing in SQL makes it special—except that aliases become mandatory, because every column name exists twice.

```sql
SELECT
    e.EmployeeName  AS employee,
    m.EmployeeName  AS manager
FROM Employees AS e
INNER JOIN Employees AS m
    ON m.EmployeeID = e.ManagerID;
```

```text
Employees
┌────┬─────────┬───────────┐
│ ID │ Name    │ ManagerID │
├────┼─────────┼───────────┤
│ 1  │ Ada     │ NULL      │   ← CEO
│ 2  │ Grace   │ 1         │
│ 3  │ Linus   │ 1         │
│ 4  │ Barbara │ 2         │
└────┴─────────┴───────────┘

Result (INNER JOIN)
┌──────────┬─────────┐
│ employee │ manager │
├──────────┼─────────┤
│ Grace    │ Ada     │
│ Linus    │ Ada     │
│ Barbara  │ Grace   │
└──────────┴─────────┘

Ada is missing — her ManagerID is NULL.
```

Think of it as two independent copies of the table:

```text
      e (employee role)              m (manager role)
   ┌────┬─────────┬───────┐       ┌────┬─────────┐
   │ 2  │ Grace   │ 1 ────┼──────►│ 1  │ Ada     │
   │ 4  │ Barbara │ 2 ────┼──────►│ 2  │ Grace   │
   └────┴─────────┴───────┘       └────┴─────────┘
```

---

# Including the Root: LEFT Self Join

To keep employees who have no manager, preserve the employee side:

```sql
SELECT
    e.EmployeeName                      AS employee,
    COALESCE(m.EmployeeName, '— none —') AS manager
FROM Employees AS e
LEFT JOIN Employees AS m
    ON m.EmployeeID = e.ManagerID;
```

```text
employee │ manager
─────────┼─────────
Ada      │ — none —
Grace    │ Ada
Linus    │ Ada
Barbara  │ Grace
```

This is the single most common self-join mistake: using an inner join for a hierarchy and silently losing the root, which is exactly the row a reader is most likely to notice missing.

---

# Multi-Level Hierarchies

Each additional level needs another self join:

```sql
SELECT
    e.EmployeeName  AS employee,
    m.EmployeeName  AS manager,
    mm.EmployeeName AS skip_level
FROM Employees AS e
LEFT JOIN Employees AS m  ON m.EmployeeID  = e.ManagerID
LEFT JOIN Employees AS mm ON mm.EmployeeID = m.ManagerID;
```

```text
Level 0   Barbara
Level 1     └─ Grace        (m)
Level 2         └─ Ada      (mm)
```

This works for a **fixed, known** depth. For arbitrary depth—an org chart, a category tree, a bill of materials—you need a recursive CTE:

```sql
WITH RECURSIVE OrgChart AS (
    SELECT EmployeeID, EmployeeName, ManagerID, 1 AS level
    FROM Employees
    WHERE ManagerID IS NULL

    UNION ALL

    SELECT e.EmployeeID, e.EmployeeName, e.ManagerID, o.level + 1
    FROM Employees AS e
    INNER JOIN OrgChart AS o
        ON o.EmployeeID = e.ManagerID
)
SELECT * FROM OrgChart;
```

The rule of thumb: **known depth → self joins; unknown depth → recursion.**

---

# Finding Duplicates

A self join on the "should be unique" columns, with an inequality on the key, reveals duplicate rows:

```sql
SELECT
    a.CustomerID   AS id_1,
    b.CustomerID   AS id_2,
    a.Email
FROM Customers AS a
INNER JOIN Customers AS b
    ON  b.Email      = a.Email
    AND b.CustomerID > a.CustomerID;   -- each pair once, no self-pairing
```

Why `>` and not `<>`:

```text
<>  →  (1,2) and (2,1)   — every pair twice
>   →  (1,2) only        — every pair once
=   →  every row matches itself
```

The same idea keeps the *newest* row when de-duplicating:

```sql
DELETE FROM Customers AS a
WHERE EXISTS (
    SELECT 1
    FROM Customers AS b
    WHERE b.Email = a.Email
      AND b.CustomerID > a.CustomerID
);
```

Always run the `SELECT` form first and read the rows it returns, as Chapter 06 insists for every `DELETE`.

---

# Comparing Rows Within a Table

```sql
SELECT
    p1.ProductName AS product,
    p2.ProductName AS cheaper_alternative,
    p1.Price - p2.Price AS saving
FROM Products AS p1
INNER JOIN Products AS p2
    ON  p2.CategoryID = p1.CategoryID
    AND p2.Price      < p1.Price;
```

Every product paired with every cheaper product in the same category. Note the shape: an equality on the grouping column, an inequality on the compared column—the standard self-join comparison pattern.

---

# Consecutive Rows

Before window functions, comparing a row with the previous one was a self join:

```sql
SELECT
    curr.ReadingDate,
    curr.Value,
    prev.Value                AS previous_value,
    curr.Value - prev.Value   AS delta
FROM Readings AS curr
LEFT JOIN Readings AS prev
    ON prev.ReadingDate = curr.ReadingDate - 1;
```

This only works when the sequence has no gaps. With window functions it is both simpler and gap-proof:

```sql
SELECT
    ReadingDate,
    Value,
    LAG(Value) OVER (ORDER BY ReadingDate) AS previous_value
FROM Readings;
```

Self joins remain valuable for row comparison where no ordering column exists, but for "previous"/"next" questions, window functions are the better tool.

---

# Pairwise Combinations

```sql
-- Every pair of students who share a course, each pair once
SELECT
    a.StudentID AS student_a,
    b.StudentID AS student_b,
    a.CourseID
FROM Enrolments AS a
INNER JOIN Enrolments AS b
    ON  b.CourseID  = a.CourseID
    AND b.StudentID > a.StudentID;
```

```text
Students in course 7: 1, 2, 3

b.StudentID > a.StudentID  →  (1,2) (1,3) (2,3)      3 pairs
b.StudentID <> a.StudentID →  plus (2,1) (3,1) (3,2) 6 pairs
```

For *n* students the count is `n × (n − 1) / 2`—which grows quadratically, so pairwise self joins on large groups need careful filtering.

---

# Visual Representation

```text
            Employees
    ┌──────────────────────┐
    │  used twice, under   │
    │  two aliases         │
    └──────────────────────┘
           ╱          ╲
     alias e          alias m
   (the employee)   (the manager)
          │              │
          └──── ON ──────┘
        m.EmployeeID = e.ManagerID

    One physical table, two logical roles.
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN    ← the table is joined to itself here
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
FROM Employees e JOIN Employees m ON m.EmployeeID = e.ManagerID

↓

The table is opened twice — two independent scans or seeks

↓

e: scan Employees (every employee)

↓

m: index seek on EmployeeID (the primary key) per row

↓

Emit (employee, manager) pairs
```

There is no special "self join" operator. The optimizer sees two row sources that happen to share a table, and the second access usually benefits from the primary-key index, making self joins on keys cheap.

---

# 🔬 Engine Deep Dive

Because both sides read the same physical pages, self joins are unusually cache-friendly: the second access often finds its pages already in the buffer pool. This is why a self join on a moderately sized table frequently outperforms a join between two unrelated tables of the same combined size.

---

# 🏗️ Architecture Insight

A self join is the query-side expression of a self-referencing foreign key (Section 03.08.07). The schema declares that a row may point at another row of the same table; the self join reads that pointer. When queries repeatedly need many levels of it, that is a signal to consider a different tree representation—path enumeration, nested sets, or a closure table.

---

# ⚡ Performance Tip

Self joins on non-key columns—`Email`, `PhoneNumber`, free text—are the slow ones, because neither side has a useful index. If duplicate detection runs regularly, index the column you deduplicate on; it turns a quadratic scan into an index-driven match.

---

# 🌍 Production Consideration

De-duplication scripts built on self joins are routinely run against live tables. Wrap them in a transaction, run the `SELECT` form first, keep the deterministic tie-breaker (`MAX(id)` or newest timestamp) explicit, and record the affected-row count before committing.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Self join with aliases | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Recursive CTE | ✅ | ✅ | ✅ (8.0+) | ✅ | ✅ | ✅ |
| `WITH RECURSIVE` keyword | ✅ | required | required | not used | not used | required |
| Hierarchical query extension | ❌ | ❌ | ❌ | ❌ | `CONNECT BY` | ❌ |

> **Portability Tip:** SQL Server and Oracle write `WITH` without `RECURSIVE`; PostgreSQL, MySQL and SQLite require the keyword. Oracle additionally offers `CONNECT BY`, which is concise but proprietary.

---

# Common Mistakes

### Mistake 1

Using an inner self join for a hierarchy and losing the root row.

---

### Mistake 2

Omitting aliases, producing ambiguous-column errors or—worse—a condition that compares a column with itself.

---

### Mistake 3

Using `<>` instead of `>` in a pairwise self join, doubling every pair.

---

### Mistake 4

Chaining self joins for a tree of unknown depth instead of using a recursive CTE.

---

# Best Practices

✔ Alias both sides with role names (`e`/`m`, `curr`/`prev`, `a`/`b`).

✔ Use `LEFT JOIN` for hierarchies so the root survives.

✔ Use `>` (not `<>`) to get each pair once.

✔ Index the columns you self-join on when the query is routine.

✔ Switch to a recursive CTE when the depth is not fixed.

✔ Prefer window functions for previous/next comparisons.

---

# Interview Questions

## Basic

1. What is a self join?
2. Why are aliases mandatory?
3. How do you list each employee with their manager?

## Intermediate

4. Why does an inner self join lose the CEO?
5. How do you find duplicate rows with a self join?
6. Why use `>` rather than `<>` when pairing rows?

## Advanced

7. When does a recursive CTE replace a chain of self joins?
8. Why are self joins often cheaper than joins between two different tables?
9. How would you deduplicate a table keeping only the newest row per key?

---

# Hands-on Exercises

## Exercise 1

List every employee with their manager's name, including employees with no manager.

---

## Exercise 2

Show each employee, their manager and their manager's manager.

---

## Exercise 3

Find all customers sharing an email address, listing each pair once.

---

## Exercise 4

For each product, list the cheaper products in the same category and the saving.

---

# Related Topics

- **07.03 — INNER JOIN**
- **07.04 — LEFT JOIN (LEFT OUTER JOIN)**
- **07.10 — Joining Multiple Tables**
- **03.08.07 — Self-Referencing Relationships**
- **03.09.08 — Hierarchical (Tree) Pattern**

---

# Summary

A self join joins a table to itself, using aliases to give the same table two logical roles. It reads self-referencing relationships such as employee/manager, finds duplicates and compares rows within a table, and produces pairwise combinations when the key inequality `>` is used to emit each pair exactly once. Hierarchies need a `LEFT JOIN` so the root row survives, and a fixed chain of self joins only works to a known depth—beyond that, a recursive CTE is the correct tool, just as window functions are the better answer for previous/next row comparisons.
