---
title: "06.01 - Introduction to WHERE"
description: "Understand the purpose of the SQL WHERE clause, how predicates filter rows, why WHERE runs before SELECT, and how filtering shapes correctness, performance, and security."
chapter: 6
section: 6.01
category: Data Query Language (DQL)
difficulty: Beginner → Intermediate
readingTime: 35 min
lastUpdated: 2026-09-19
---

# 06.01 Introduction to WHERE

---

# Learning Objectives

After completing this section, you will be able to:

- Explain what the `WHERE` clause does.
- Define a predicate.
- Describe how rows are kept or discarded.
- Explain why `WHERE` runs before `SELECT`.
- Distinguish filtering rows from choosing columns.
- Recognize where `WHERE` appears in `SELECT`, `UPDATE`, and `DELETE`.
- Understand why filtering matters for performance and security.

---

# Why This Section Matters

A table in a real system may contain millions or billions of rows.

Users almost never want all of them.

They want:

- *this* customer's orders,
- *today's* transactions,
- products *in stock*,
- employees *in one department*.

The `WHERE` clause turns a whole table into exactly the rows that answer a question.

---

# What is WHERE?

`WHERE` filters the rows produced by `FROM`.

```sql
SELECT
    EmployeeName,
    Department
FROM Employees
WHERE Department = 'IT';
```

Employees table:

| EmployeeName | Department |
|--------------|------------|
| Alice | HR |
| Bob | IT |
| Carol | IT |
| David | Sales |

Result:

| EmployeeName | Department |
|--------------|------------|
| Bob | IT |
| Carol | IT |

Only rows where `Department = 'IT'` is TRUE survive.

---

# What is a Predicate?

A **predicate** is a condition that can be evaluated for a row.

Examples:

```sql
Department = 'IT'
```

```sql
Salary > 50000
```

```sql
HireDate >= DATE '2025-01-01'
```

```sql
ManagerID IS NULL
```

For each row, a predicate evaluates to one of three values:

| Result | Meaning | Row kept? |
|--------|---------|-----------|
| TRUE | The condition holds | ✅ Yes |
| FALSE | The condition does not hold | ❌ No |
| UNKNOWN | The result cannot be determined (usually `NULL`) | ❌ No |

> **Remember:** `WHERE` keeps a row only when the predicate is **TRUE**. Both FALSE and UNKNOWN discard the row.

---

# Rows vs Columns

`SELECT` and `WHERE` work on different dimensions of a table.

```text
                Columns (chosen by SELECT)
               ┌───────────┬────────────┬────────┐
               │ Name      │ Department │ Salary │
  Rows         ├───────────┼────────────┼────────┤
  (chosen by   │ Alice     │ HR         │ 48000  │
   WHERE)      │ Bob       │ IT         │ 62000  │
               │ Carol     │ IT         │ 71000  │
               └───────────┴────────────┴────────┘
```

- `SELECT` performs **projection**: it chooses columns.
- `WHERE` performs **selection** (also called *restriction*): it chooses rows.

In relational algebra, `WHERE` corresponds to the selection operator **σ** (sigma).

---

# Row-by-Row Thinking

Logically, `WHERE` evaluates its predicate once for every row that comes out of `FROM`.

```text
Row 1: Alice, HR     → Department = 'IT' → FALSE   → discarded
Row 2: Bob, IT       → Department = 'IT' → TRUE    → kept
Row 3: Carol, IT     → Department = 'IT' → TRUE    → kept
Row 4: David, Sales  → Department = 'IT' → FALSE   → discarded
```

Physically, the engine may avoid reading most rows at all by using an index, but the **result** must always be the same as this row-by-row definition.

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE   ← Rows are filtered here
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

Two consequences follow directly:

1. `WHERE` cannot reference aliases created in `SELECT`.
2. `WHERE` cannot use aggregate functions such as `COUNT()` or `SUM()`, because groups do not exist yet.

---

# WHERE Cannot See SELECT Aliases

```sql
SELECT
    EmployeeName,
    Salary * 12 AS AnnualSalary
FROM Employees
WHERE AnnualSalary > 600000;   -- Error in most databases
```

At the time `WHERE` runs, `AnnualSalary` does not exist yet.

Repeat the expression instead:

```sql
SELECT
    EmployeeName,
    Salary * 12 AS AnnualSalary
FROM Employees
WHERE Salary * 12 > 600000;
```

This was introduced in Section 05.05 and is one of the most common beginner errors.

---

# WHERE Cannot Use Aggregates

```sql
SELECT
    Department
FROM Employees
WHERE COUNT(*) > 5;   -- Error
```

`WHERE` filters **individual rows** before grouping. Filtering **groups** is the job of `HAVING`:

```sql
SELECT
    Department,
    COUNT(*) AS EmployeeCount
FROM Employees
GROUP BY Department
HAVING COUNT(*) > 5;
```

| Clause | Filters | Runs |
|--------|---------|------|
| `WHERE` | Rows | Before `GROUP BY` |
| `HAVING` | Groups | After `GROUP BY` |

`HAVING` is covered fully in Chapter 08.

---

# WHERE in SELECT, UPDATE, and DELETE

The same filtering rules decide which rows are read, changed, or removed.

```sql
SELECT *
FROM Orders
WHERE Status = 'Pending';
```

```sql
UPDATE Orders
SET Status = 'Cancelled'
WHERE Status = 'Pending'
  AND CreatedAt < DATE '2026-01-01';
```

```sql
DELETE FROM Orders
WHERE Status = 'Cancelled';
```

A mistake in a `SELECT` filter returns the wrong rows. A mistake in an `UPDATE` or `DELETE` filter **changes the wrong data**.

---

# What Happens Without WHERE?

```sql
SELECT *
FROM Orders;
```

Every row is returned.

```sql
DELETE FROM Orders;
```

Every row is deleted.

Omitting `WHERE` is valid SQL, which is exactly why it is dangerous in data-modifying statements.

---

# How the DBMS Executes This

Query:

```sql
SELECT
    EmployeeName
FROM Employees
WHERE Department = 'IT';
```

Execution:

```text
FROM Employees

↓

Choose access path
(index on Department? table scan?)

↓

Evaluate Department = 'IT'

↓

Keep TRUE rows only

↓

Project EmployeeName

↓

Return result
```

If an index exists on `Department`, the engine can jump directly to the `IT` entries instead of reading every row.

---

# 🔬 Engine Deep Dive

Inside the engine, a `WHERE` predicate becomes one of two things:

```text
Developer writes

WHERE Department = 'IT'

        │

        ▼

Parser builds a predicate node

        │

        ▼

Optimizer classifies the predicate

        │

        ├── Access predicate
        │   Used to navigate an index
        │   (only matching entries are read)
        │
        └── Filter predicate
            Evaluated on rows after they are read
            (non-matching rows are discarded)

        │

        ▼

Execution plan
```

Access predicates reduce the amount of data read. Filter predicates reduce the amount of data returned. Good query design tries to turn as many filters as possible into access predicates.

---

# 🏗️ Architecture Insight

`WHERE` implements the relational **selection** operator. Because selection commutes with many other operators, optimizers are free to move filters around the plan—pushing them below joins, into views, or even into the storage engine—without changing the result. This freedom is one of the main reasons declarative SQL can be optimized so aggressively.

---

# ⚡ Performance Tip

Filtering early reduces work for every later step. A query that filters 10 million rows down to 100 before a join, sort, or aggregation is dramatically cheaper than one that filters afterwards. Selective predicates on indexed columns are the most effective optimization most queries will ever receive.

---

# 🔒 Security Note

Never build a `WHERE` clause by concatenating user input:

```text
// Dangerous: SQL text built in application code
"SELECT * FROM Users WHERE Username = '" + userInput + "'"
```

Use parameters instead:

```sql
SELECT *
FROM Users
WHERE Username = ?;
```

Parameterized predicates cannot be altered by malicious input.

---

# 🌍 Production Consideration

Applications often apply security filters in `WHERE`—for example, restricting rows to the current tenant or user. Forgetting such a predicate in a single query can expose another customer's data, which is why many systems enforce these filters centrally using views or row-level security.

---

# 🚀 Enterprise Practice

Before running any `UPDATE` or `DELETE`, experienced engineers run the same filter as a `SELECT COUNT(*)` to confirm the number of affected rows, then execute the change inside an explicit transaction so it can be rolled back if the count is wrong.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `WHERE` in `SELECT` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `WHERE` in `UPDATE` / `DELETE` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `SELECT` alias in `WHERE` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (non-standard) |
| Aggregate in `WHERE` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Safety guard for unfiltered `UPDATE`/`DELETE` | — | — | `sql_safe_updates` option | — | — | — |

> **Portability Tip:** SQLite accepts a `SELECT` alias in `WHERE` as an extension, but no other major database does. Repeat the expression or use a derived table/CTE for portable SQL.

---

# Common Mistakes

### Mistake 1

Referencing a `SELECT` alias in `WHERE`.

---

### Mistake 2

Using `COUNT()`, `SUM()`, or another aggregate in `WHERE` instead of `HAVING`.

---

### Mistake 3

Assuming a row is kept when the condition is "not false". Rows are kept only when the condition is **TRUE**.

---

### Mistake 4

Running `UPDATE` or `DELETE` without a `WHERE` clause.

---

# Best Practices

✔ Think of `WHERE` as choosing rows and `SELECT` as choosing columns.

✔ Filter as early as possible.

✔ Use parameters for every user-supplied value.

✔ Test data-modifying filters with a `SELECT` first.

✔ Use `HAVING`, not `WHERE`, to filter aggregated results.

---

# Interview Questions

## Basic

1. What does the `WHERE` clause do?
2. What is a predicate?
3. Which rows does `WHERE` keep?

## Intermediate

4. Why can't a `SELECT` alias be used in `WHERE`?
5. What is the difference between `WHERE` and `HAVING`?
6. What happens if you run `DELETE FROM Orders;`?

## Advanced

7. Explain the difference between an access predicate and a filter predicate.
8. Why can optimizers move `WHERE` predicates below joins?
9. How does parameterization protect a `WHERE` clause from SQL injection?

---

# Hands-on Exercises

## Exercise 1

Return all employees who work in the `Sales` department.

---

## Exercise 2

Return all products whose price is greater than 100.

---

## Exercise 3

Rewrite this query so that it runs correctly:

```sql
SELECT
    ProductName,
    Price * Quantity AS StockValue
FROM Products
WHERE StockValue > 10000;
```

---

## Exercise 4

Write the `SELECT` statement you would run before this `DELETE` to check how many rows it will remove:

```sql
DELETE FROM Sessions
WHERE ExpiresAt < CURRENT_TIMESTAMP;
```

---

# Related Topics

- **05.05 — Column Aliases**
- **05.12 — Execution Flow of SELECT**
- **06.02 — WHERE Syntax**
- **06.08 — NULL Handling in WHERE (Three-Valued Logic)**
- **08.xx — GROUP BY and HAVING**

---

# Summary

The `WHERE` clause filters the rows produced by `FROM`, keeping only those for which a predicate evaluates to TRUE—rows that evaluate to FALSE or UNKNOWN are discarded. Because it runs early in the logical execution order, it cannot see `SELECT` aliases or aggregate results, and it reduces the work done by every later step. The same clause decides which rows are read, updated, or deleted, which makes careful, parameterized, well-tested filters essential for correctness, performance, and security.
