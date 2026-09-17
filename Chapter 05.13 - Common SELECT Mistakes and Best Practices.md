---
title: "05.13 - Common SELECT Mistakes & Best Practices"
description: "Avoid common SQL SELECT mistakes and learn enterprise-grade best practices for writing readable, maintainable, portable, secure, and high-performance queries."
chapter: 5
section: 5.13
category: Data Query Language (DQL)
difficulty: Beginner → Advanced
readingTime: 60 min
lastUpdated: 2026-08-04
---

# 05.13 Common SELECT Mistakes & Best Practices

---

# Learning Objectives

After completing this chapter, you will be able to:

- Recognize common mistakes made in `SELECT` statements.
- Write readable and maintainable SQL.
- Avoid portability problems across database systems.
- Improve query performance through better design.
- Apply enterprise coding standards during SQL development.
- Perform basic SQL code reviews using a structured checklist.

---

# Why This Chapter Matters

Most SQL errors are **not syntax errors**.

The database engine detects syntax problems immediately.

The more difficult issues are:

- Returning incorrect data.
- Writing inefficient queries.
- Using non-portable SQL.
- Producing unreadable code.
- Creating maintenance problems.

Enterprise SQL development is about avoiding these mistakes before they reach production.

---

# Mistake 1 — Using `SELECT *`

```sql
SELECT *
FROM Employees;
```

### Problems

- Retrieves unnecessary columns.
- Increases network traffic.
- Prevents covering-index optimizations.
- Couples application code to schema changes.

### Better

```sql
SELECT
    EmployeeID,
    EmployeeName,
    Department
FROM Employees;
```

---

# ⚡ Performance Tip

Selecting only the required columns reduces I/O, memory usage, and network bandwidth. It may also enable index-only scans when all requested columns exist in an index.

---

# Mistake 2 — Ignoring NULL Values

Incorrect:

```sql
SELECT
    Salary + Bonus
FROM Employees;
```

If `Bonus` is `NULL`, the result is also `NULL`.

Better:

```sql
SELECT
    Salary + COALESCE(Bonus, 0) AS TotalCompensation
FROM Employees;
```

---

# Mistake 3 — Confusing NULL with Zero

Incorrect assumption:

```text
NULL = 0
```

Reality:

```text
NULL = Unknown
```

Treat missing data according to business rules, not assumptions.

---

# Mistake 4 — Misusing DISTINCT

Incorrect:

```sql
SELECT DISTINCT
    *
FROM Orders;
```

`DISTINCT` should not be used to hide duplicate rows caused by poor joins or incorrect query design.

Investigate the underlying cause instead.

---

# 🏗️ Architecture Insight

`DISTINCT` is a duplicate-elimination operator. Depending on the optimizer, it may require sorting or hashing, both of which consume CPU and memory.

---

# Mistake 5 — Poor Alias Names

Poor:

```sql
SELECT
    EmployeeName AS X
FROM Employees;
```

Better:

```sql
SELECT
    EmployeeName AS EmployeeName
FROM Employees;
```

Or, for calculated values:

```sql
SELECT
    Salary * 12 AS AnnualSalary
FROM Employees;
```

Aliases should communicate meaning.

---

# Mistake 6 — Inconsistent Formatting

Difficult to read:

```sql
SELECT EmployeeID,EmployeeName,Department FROM Employees;
```

Preferred:

```sql
SELECT
    EmployeeID,
    EmployeeName,
    Department
FROM Employees;
```

Consistent formatting improves reviews and reduces mistakes.

---

# Mistake 7 — Ignoring Logical Execution Order

Developers often read SQL top to bottom.

Logical execution begins with:

```text
FROM
↓
JOIN
↓
WHERE
↓
GROUP BY
↓
HAVING
↓
SELECT
↓
DISTINCT
↓
ORDER BY
```

Understanding this order prevents many conceptual errors.

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

Keep this sequence in mind whenever you design or debug a query.

---

# Mistake 8 — Forgetting Table Aliases

Poor:

```sql
SELECT
    CustomerID
FROM Customers
JOIN Orders
    ON CustomerID = CustomerID;
```

Ambiguous.

Better:

```sql
SELECT
    c.CustomerID
FROM Customers AS c
JOIN Orders AS o
    ON c.CustomerID = o.CustomerID;
```

Aliases improve clarity and eliminate ambiguity.

---

# Mistake 9 — Relying on Vendor-Specific Features

Examples:

- `NVL()` (Oracle)
- `ISNULL()` (SQL Server)
- `IFNULL()` (MySQL)

Prefer portable alternatives:

```sql
COALESCE()
```

when portability is important.

---

# 🌍 Production Consideration

Applications intended to support multiple database systems should minimize vendor-specific SQL unless encapsulated behind database-specific layers.

---

# Mistake 10 — Assuming the Optimizer Executes SQL Exactly as Written

SQL is declarative.

Developers specify **what** data is needed.

The optimizer decides **how** to retrieve it.

Equivalent SQL statements may produce different execution plans while returning the same results.

---

# Mistake 11 — Using SQL for Row-by-Row Thinking

Poor mental model:

```text
Read row

↓

Process row

↓

Read next row
```

SQL is fundamentally **set-based**.

Think in terms of collections rather than individual records.

---

# 🚀 Enterprise Practice

When reviewing SQL, experienced engineers ask:

- Is this query set-based?
- Can the optimizer use indexes efficiently?
- Does it retrieve only the required data?
- Is it easy to understand six months from now?

---

# Mistake 12 — Ignoring Execution Plans

A query that appears simple may perform poorly.

Always examine execution plans for:

- Large table scans.
- Unexpected sorts.
- Expensive joins.
- Incorrect cardinality estimates.
- Missing indexes.

Performance tuning begins with understanding the execution plan.

---

# Mistake 13 — Overlooking Readability

SQL is read more often than it is written.

Prefer:

- Meaningful aliases.
- Consistent indentation.
- Logical grouping.
- One column per line.
- Clear comments when necessary.

Readable SQL is easier to maintain and optimize.

---

# Mistake 14 — Mixing Business Logic with Presentation Logic

Instead of embedding display formatting directly into every query, return clean data whenever possible and let the application handle presentation.

Example:

Avoid:

```sql
SELECT
    '$' || Salary
FROM Employees;
```

Prefer returning the numeric value and formatting it in the application layer unless reporting requirements dictate otherwise.

---

# Mistake 15 — Assuming Small Queries Stay Small

A query tested on:

```
100 rows
```

may behave very differently on:

```
100 million rows
```

Design for scalability from the beginning.

---

# 🔒 Security Note

Never assume that selecting fewer columns eliminates the need for authorization. Access control applies at multiple levels, including schemas, tables, views, columns, and, in some systems, individual rows.

---

# SQL Code Review Checklist

Before approving a query, ask:

| Question | Yes/No |
|-----------|--------|
| Are only required columns selected? | □ |
| Are aliases meaningful? | □ |
| Are NULL values handled correctly? | □ |
| Is `DISTINCT` actually necessary? | □ |
| Is the query readable? | □ |
| Is formatting consistent? | □ |
| Can indexes be used efficiently? | □ |
| Is vendor-specific syntax intentional? | □ |
| Have execution plans been reviewed? | □ |
| Will the query scale to production volumes? | □ |

---

# SQL Standard vs Vendor Differences

| Topic | ANSI SQL | Vendor Notes |
|--------|-----------|--------------|
| `SELECT *` | ✅ | Supported everywhere |
| `COALESCE()` | ✅ | Portable |
| `NVL()` | ❌ | Oracle |
| `ISNULL()` | ❌ | SQL Server |
| `IFNULL()` | ❌ | MySQL |
| `SELECT` without `FROM` | Supported concept | Oracle historically used `DUAL` |

> **Portability Tip:** Favor ANSI SQL features whenever possible. Reserve vendor-specific extensions for situations where portability is not a requirement.

---

# How Professionals Review a SELECT Statement

Experienced engineers mentally walk through a query using this sequence:

```text
Business Requirement
        │
        ▼
Correct Row Source?
        │
        ▼
Correct Filtering?
        │
        ▼
Correct Projection?
        │
        ▼
Correct NULL Handling?
        │
        ▼
Portable Syntax?
        │
        ▼
Readable Formatting?
        │
        ▼
Efficient Execution Plan?
        │
        ▼
Production Ready
```

This review process catches many issues before they become defects.

---

# Best Practices

✔ Select only the columns you need.

✔ Use descriptive aliases.

✔ Treat `NULL` explicitly.

✔ Prefer ANSI-standard SQL when portability matters.

✔ Write consistently formatted queries.

✔ Think in sets, not rows.

✔ Understand logical execution order.

✔ Review execution plans for important queries.

✔ Keep business logic and presentation logic appropriately separated.

✔ Optimize for maintainability as well as performance.

---

# Interview Questions

## Basic

1. Why is `SELECT *` discouraged in production systems?
2. What is the purpose of table aliases?
3. Why is `COALESCE()` generally preferred over vendor-specific NULL functions?

### Intermediate

4. Why should `DISTINCT` not be used to hide poor joins?
5. Explain the difference between declarative SQL and procedural thinking.
6. Why is logical execution order important?

### Advanced

7. How does readability affect long-term maintainability?
8. Why can two logically equivalent queries have different execution plans?
9. Describe the checklist you would use when reviewing a colleague's SQL query.

---

# Hands-on Exercises

## Exercise 1

Rewrite a `SELECT *` query to return only the required columns.

---

## Exercise 2

Improve the formatting and aliases of a poorly formatted query.

---

## Exercise 3

Replace vendor-specific NULL handling with `COALESCE()`.

---

## Exercise 4

Perform a code review on one of your existing SQL queries using the checklist from this chapter and identify at least three possible improvements.

---

# Related Topics

- **Chapter 04 — SQL Fundamentals**
- **05.03 — SELECT ***
- **05.05 — Column Aliases**
- **05.07 — DISTINCT**
- **05.08 — NULL Handling in SELECT**
- **05.11 — FROM Clause (Deep Dive)**
- **05.12 — Execution Flow of SELECT**
- **Chapter 06 — WHERE Clause**

---

# Summary

Writing effective `SELECT` statements requires more than knowing the syntax. Professional SQL emphasizes correctness, readability, maintainability, portability, security, and performance. By avoiding common mistakes—such as overusing `SELECT *`, mishandling `NULL`, relying on vendor-specific features, or ignoring execution plans—you produce queries that are easier to review, easier to maintain, and more likely to perform well in production. Treat every `SELECT` statement as production code, and evaluate it with the same discipline applied to any other software component.