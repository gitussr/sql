---
title: "Chapter 06 - WHERE Clause"
description: "Master the SQL WHERE clause: filtering rows with comparison, logical, range, list and pattern predicates, handling NULL with three-valued logic, writing index-friendly (SARGable) conditions, and understanding how database engines evaluate predicates."
chapter: 6
section: Introduction
category: Data Query Language (DQL)
difficulty: Beginner → Advanced
readingTime: 20 min
lastUpdated: 2026-09-19
---

# Chapter 06 — WHERE Clause

> *"SELECT decides which columns you see. WHERE decides which rows exist in your answer."*

---

# Learning Objectives

By the end of this chapter, you will be able to:

- Understand the purpose of the `WHERE` clause.
- Filter rows using comparison operators.
- Combine conditions with `AND`, `OR`, and `NOT`.
- Use `BETWEEN`, `IN`, and `LIKE` correctly.
- Handle `NULL` values using three-valued logic.
- Filter using expressions, dates, and functions.
- Introduce `EXISTS` and subqueries as filters.
- Explain where `WHERE` sits in the logical execution order.
- Write SARGable, index-friendly predicates.
- Avoid the most common and most expensive filtering mistakes.

---

# Introduction

Chapter 05 taught you how to **choose columns**.

This chapter teaches you how to **choose rows**.

Almost every real query filters:

- orders placed today,
- customers in a specific country,
- products below a price,
- invoices that are overdue,
- employees without a manager,
- log entries containing an error code.

Without `WHERE`, a query returns every row in its source. With `WHERE`, it returns only the rows that satisfy a condition.

`WHERE` is also where many of SQL's most important ideas meet:

- Boolean logic
- `NULL` and three-valued logic
- Operator precedence
- Indexes and selectivity
- Query optimization
- Security (SQL injection almost always targets a filter)

---

# What is the WHERE Clause?

The `WHERE` clause filters the rows produced by the `FROM` clause.

Each row is tested against a **predicate**—a condition that evaluates to:

```text
TRUE
FALSE
UNKNOWN
```

Only rows for which the predicate is **TRUE** are kept.

At its simplest, `WHERE` answers one question:

> **"Which rows do you want?"**

---

# Basic Syntax

```sql
SELECT column_list
FROM table_name
WHERE condition;
```

Example:

```sql
SELECT
    CustomerName,
    Country
FROM Customers
WHERE Country = 'Australia';
```

---

# Visual Representation

```text
FROM Customers
(all rows)

        │

        ▼

WHERE Country = 'Australia'
(test every row)

        │

        ▼

Rows where the condition is TRUE

        │

        ▼

SELECT CustomerName, Country
```

---

# 📍 Execution Order Reminder

Although `WHERE` is **written** after `SELECT` and `FROM`:

```text
SELECT
FROM
WHERE
```

The database logically processes it much earlier:

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

> Because `WHERE` runs before `SELECT`, it cannot see column aliases, and because it runs before `GROUP BY`, it cannot use aggregate functions such as `SUM()` or `COUNT()`.

---

# What Can WHERE Filter With?

A `WHERE` condition can use:

- Comparison operators (`=`, `<>`, `<`, `>`, `<=`, `>=`)
- Logical operators (`AND`, `OR`, `NOT`)
- Ranges (`BETWEEN`)
- Lists (`IN`)
- Patterns (`LIKE`)
- `NULL` tests (`IS NULL`, `IS NOT NULL`)
- Expressions and functions
- Subqueries (`EXISTS`, `IN (subquery)`)

---

# WHERE is Not Only for SELECT

The same clause controls which rows are changed or removed:

```sql
UPDATE Products
SET Price = Price * 1.10
WHERE CategoryID = 3;
```

```sql
DELETE FROM Sessions
WHERE ExpiresAt < CURRENT_TIMESTAMP;
```

An `UPDATE` or `DELETE` without `WHERE` affects **every row in the table**. The filtering rules in this chapter apply equally to reading and modifying data.

---

# How the DBMS Executes This

A filter is not simply "checked after reading the table."

```text
SQL Statement
        │
        ▼
Parser
        │
        ▼
Predicate Analysis
        │
        ▼
Optimizer estimates selectivity
        │
        ▼
Choose access path
(Table Scan / Index Seek / Index Scan)
        │
        ▼
Filter operator evaluates remaining predicates
        │
        ▼
Qualifying rows flow to the next operator
```

The optimizer tries to apply filters **as early as possible**, ideally using an index so that non-matching rows are never read at all. Section 06.11 explores this pipeline in detail.

---

# Chapter Structure

| Section | Topic |
|---------|-------|
| 06.01 | Introduction to WHERE |
| 06.02 | WHERE Syntax |
| 06.03 | Comparison Operators |
| 06.04 | Logical Operators (AND, OR, NOT) |
| 06.05 | BETWEEN |
| 06.06 | IN and NOT IN |
| 06.07 | LIKE and Pattern Matching |
| 06.08 | NULL Handling in WHERE (Three-Valued Logic) |
| 06.09 | Filtering with Expressions and Functions |
| 06.10 | EXISTS and Subqueries in WHERE (Introduction) |
| 06.11 | Execution Flow of WHERE |
| 06.12 | SARGability and Index-Friendly Predicates |
| 06.13 | Common WHERE Mistakes & Best Practices |
| 06.14 | WHERE Cheat Sheet & Visual Knowledge Map |

---

# Real-World Examples

## E-Commerce

```sql
SELECT
    ProductName,
    Price
FROM Products
WHERE Price < 50
  AND InStock = 1;
```

Shows affordable products that can be shipped today.

---

## Banking

```sql
SELECT
    AccountNumber,
    Balance
FROM Accounts
WHERE Balance < 0;
```

Finds overdrawn accounts.

---

## Hospital

```sql
SELECT
    PatientName,
    AdmissionDate
FROM Admissions
WHERE DischargeDate IS NULL;
```

Lists patients who are still admitted.

---

## HRMS

```sql
SELECT
    EmployeeName,
    Department
FROM Employees
WHERE Department IN ('HR', 'Finance');
```

Lists employees in selected departments.

---

## Social Media

```sql
SELECT
    Username
FROM Users
WHERE Username LIKE 'data%';
```

Finds usernames beginning with "data".

---

# 🏗️ Architecture Insight

`WHERE` is where the logical request meets the physical storage layer. A predicate is not only a condition—it is information the optimizer uses to decide whether to scan a table, seek an index, or push filtering down into the storage engine. The shape of your predicate often matters more than the size of your table.

---

# ⚡ Performance Tip

The fastest row to process is the one the engine never reads. Selective, index-friendly predicates allow the database to skip most of a table. Wrapping an indexed column in a function or comparing it to a value of a different data type can silently disable that optimization, as Section 06.12 explains.

---

# 🔒 Security Note

Most SQL injection attacks target `WHERE` clauses built by concatenating user input into SQL text. Always pass filter values as **parameters** (bind variables) rather than string concatenation. Parameterization separates code from data, so user input can never change the logic of the predicate.

---

# 🌍 Production Consideration

In production, most performance incidents on read queries trace back to filtering: a missing index, a non-SARGable predicate, an implicit data-type conversion, or a filter that returns far more rows than expected. Reviewing `WHERE` clauses and their execution plans is one of the highest-value activities in database operations.

---

# 🚀 Enterprise Practice

Enterprise teams treat `UPDATE` and `DELETE` statements with extra care: they run the equivalent `SELECT ... WHERE ...` first to confirm which rows will be affected, execute changes inside a transaction, and verify the affected-row count before committing.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Basic `WHERE` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `BETWEEN`, `IN`, `LIKE` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Case-insensitive `LIKE` by default | Collation-dependent | ❌ (`ILIKE` extension) | ✅ with default collations | Collation-dependent | ❌ | ✅ for ASCII |
| `IS DISTINCT FROM` | ✅ | ✅ | ❌ (`<=>` instead) | ✅ (2022+) | ❌ | ✅ (3.39+; also `IS NOT`) |

> **Portability Tip:** The core of `WHERE` is fully standardized. Differences appear in string comparison (case sensitivity and collations), NULL-safe comparison, and regular-expression support.

---

# Common Mistakes

- Using `= NULL` instead of `IS NULL`.
- Referencing a `SELECT` alias in `WHERE`.
- Using an aggregate function in `WHERE` instead of `HAVING`.
- Forgetting parentheses when mixing `AND` and `OR`.
- Writing `NOT IN` against a list or subquery that can contain `NULL`.
- Running `UPDATE` or `DELETE` without a `WHERE` clause.

---

# Best Practices

✔ Filter as early and as precisely as possible.

✔ Use parameters, never string concatenation, for filter values.

✔ Use parentheses whenever `AND` and `OR` appear together.

✔ Keep indexed columns "bare" on one side of the comparison.

✔ Compare values of matching data types.

✔ Always test an `UPDATE` or `DELETE` filter with a `SELECT` first.

---

# 💡 Did You Know?

The word *predicate* comes from logic: a statement about a subject that is either true or false. SQL extends this with a third outcome—**UNKNOWN**—which is why `NULL` behaves so differently from ordinary values in filters.

---

# Related Topics

- **05.01 — Introduction to SELECT**
- **05.08 — NULL Handling in SELECT**
- **05.12 — Execution Flow of SELECT**
- **04.06 — SQL Operators and Expressions**
- **04.19 — SQL Execution Order**
- **07.xx — JOINs**
- **08.xx — GROUP BY and HAVING**

---

# Summary

The `WHERE` clause filters the rows produced by `FROM`, keeping only those for which a predicate evaluates to TRUE. It supports comparison, logical, range, list, pattern, and `NULL` predicates, and it controls not only which rows are read but also which rows are updated or deleted. Because `WHERE` runs early in the logical execution order, it shapes everything that follows—and because the optimizer uses its predicates to choose access paths, well-written filters are one of the most important factors in query performance, correctness, and security.
