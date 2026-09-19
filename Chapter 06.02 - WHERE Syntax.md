---
title: "06.02 - WHERE Syntax"
description: "Learn the complete syntax of the SQL WHERE clause: where it appears, how predicates are formed, literals and data types, quoting rules, combining conditions, and how WHERE fits into SELECT, UPDATE, and DELETE."
chapter: 6
section: 6.02
category: Data Query Language (DQL)
difficulty: Beginner → Intermediate
readingTime: 40 min
lastUpdated: 2026-09-19
---

# 06.02 WHERE Syntax

---

# Learning Objectives

After completing this section, you will be able to:

- Write the `WHERE` clause in the correct position.
- Form predicates from operands and operators.
- Use numeric, string, date, and Boolean literals correctly.
- Quote strings and identifiers properly.
- Combine multiple conditions.
- Use `WHERE` in `SELECT`, `UPDATE`, and `DELETE`.
- Format filters for readability.

---

# Position of WHERE

`WHERE` appears immediately after `FROM` (and any `JOIN`s), and before `GROUP BY`.

```sql
SELECT      column_list
FROM        table_name
WHERE       condition
GROUP BY    grouping_columns
HAVING      group_condition
ORDER BY    sort_columns;
```

Only one `WHERE` clause is allowed per query block. Multiple conditions are combined inside it using `AND` and `OR`.

---

# General Form

```sql
SELECT column_list
FROM table_name
WHERE <search_condition>;
```

The SQL standard calls the condition a **search condition**: one or more predicates combined with logical operators.

```text
search_condition
        │
        ├── predicate
        │
        ├── predicate AND predicate
        │
        ├── predicate OR predicate
        │
        └── NOT predicate
```

---

# Anatomy of a Predicate

```sql
WHERE Salary > 50000
```

```text
Salary        >          50000
  │           │            │
operand    operator     operand
(column)  (comparison) (literal)
```

Both sides can be columns, literals, expressions, or parameters:

```sql
WHERE ShippedDate > OrderDate
```

```sql
WHERE Price * Quantity >= 1000
```

```sql
WHERE CustomerID = ?
```

---

# Literals

## Numeric Literals

```sql
WHERE Quantity > 10
WHERE Price <= 19.99
```

Numbers are written without quotes.

---

## String Literals

```sql
WHERE Country = 'India'
```

Strings use **single quotes** in standard SQL.

To include a single quote inside a string, double it:

```sql
WHERE LastName = 'O''Brien'
```

---

## Date and Time Literals

The SQL standard defines typed literals:

```sql
WHERE OrderDate = DATE '2026-03-15'
```

```sql
WHERE CreatedAt >= TIMESTAMP '2026-03-15 09:00:00'
```

Many databases also accept an ISO-8601 string and convert it:

```sql
WHERE OrderDate = '2026-03-15'
```

> **Portability Tip:** Always use the unambiguous ISO format `YYYY-MM-DD`. Formats such as `03/04/2026` are interpreted differently depending on server settings and locale.

---

## Boolean Literals

```sql
WHERE IsActive = TRUE
```

Support varies:

- PostgreSQL has a native `BOOLEAN` type.
- MySQL treats `TRUE`/`FALSE` as `1`/`0`.
- SQL Server has no Boolean column type; use `BIT` with `1`/`0`.
- Oracle added a `BOOLEAN` type in 23ai; earlier versions use `NUMBER(1)` or `CHAR(1)`.

---

# Single Quotes vs Double Quotes

This is one of the most common syntax errors.

| Quote | Meaning (SQL standard) | Example |
|-------|------------------------|---------|
| `'...'` | String literal (a value) | `'India'` |
| `"..."` | Delimited identifier (a name) | `"Order Date"` |

```sql
WHERE Country = 'India'    -- compares with the text India
```

```sql
WHERE Country = "India"    -- looks for a COLUMN named India
```

MySQL treats double quotes as strings by default (unless `ANSI_QUOTES` mode is enabled), which hides this mistake until the query is moved to another database.

---

# Combining Conditions

```sql
SELECT
    ProductName,
    Price
FROM Products
WHERE CategoryID = 3
  AND Price < 100
  AND InStock = 1;
```

```sql
SELECT
    CustomerName
FROM Customers
WHERE Country = 'India'
   OR Country = 'Nepal';
```

When `AND` and `OR` appear together, use parentheses:

```sql
WHERE (Country = 'India' OR Country = 'Nepal')
  AND IsActive = 1
```

Section 06.04 explains why.

---

# Parameters

Applications should supply values as parameters rather than literals.

Placeholder styles differ by driver:

```text
?             JDBC, ODBC, SQLite, MySQL drivers
$1, $2        PostgreSQL
@CustomerID   SQL Server (T-SQL)
:customer_id  Oracle, many ORMs
```

Example:

```sql
SELECT
    OrderID,
    OrderDate
FROM Orders
WHERE CustomerID = ?;
```

Parameters prevent SQL injection and allow the database to reuse execution plans.

---

# WHERE in UPDATE and DELETE

```sql
UPDATE Employees
SET Salary = Salary * 1.05
WHERE Department = 'IT';
```

```sql
DELETE FROM AuditLog
WHERE LoggedAt < DATE '2025-01-01';
```

The syntax of the condition is identical in `SELECT`, `UPDATE`, and `DELETE`.

---

# Formatting for Readability

Place each condition on its own line and align logical operators:

```sql
SELECT
    OrderID,
    CustomerID,
    TotalAmount
FROM Orders
WHERE Status = 'Shipped'
  AND OrderDate >= DATE '2026-01-01'
  AND TotalAmount > 500;
```

This style (from Section 04.17) makes it easy to comment out, review, or add individual conditions.

---

# Visual Representation

```text
WHERE clause
    │
    ▼
Search condition
    │
    ├── Predicate 1:  Status = 'Shipped'
    ├── AND
    ├── Predicate 2:  OrderDate >= DATE '2026-01-01'
    ├── AND
    └── Predicate 3:  TotalAmount > 500
    │
    ▼
TRUE only if all three are TRUE
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE   ← The search condition is evaluated here
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

Syntax order and execution order differ: `WHERE` is written after `SELECT` but evaluated before it.

---

# How the DBMS Executes This

```text
SQL text

↓

Lexer splits tokens
(WHERE, Status, =, 'Shipped', AND, ...)

↓

Parser builds an expression tree

↓

Semantic analysis
(columns exist? types compatible?)

↓

Optimizer simplifies and reorders predicates

↓

Execution
```

Type checking during semantic analysis is where errors such as comparing a date to an invalid string are detected—or where implicit conversions are silently added.

---

# 🔬 Engine Deep Dive

The parser turns a search condition into a tree:

```text
WHERE Status = 'Shipped' AND TotalAmount > 500

                AND
              /     \
            =         >
          /   \     /    \
     Status 'Shipped' TotalAmount 500
```

The optimizer then:

- normalizes the tree (for example, removing redundant conditions),
- estimates the selectivity of each branch,
- decides which predicates can use indexes,
- chooses an evaluation order for the rest.

Written order does not dictate evaluation order.

---

# 🏗️ Architecture Insight

A `WHERE` clause is data, not instructions. Because the engine receives a tree of predicates rather than a sequence of steps, it can rewrite, reorder, and combine them freely. This is what allows the same SQL text to run efficiently on a table of 100 rows and a table of 100 million rows.

---

# ⚡ Performance Tip

Match literal types to column types. Comparing a `VARCHAR` column to a number, or a `DATE` column to a string in an unusual format, can force a conversion on every row and prevent index use.

---

# 🔒 Security Note

String literals built from user input are the classic SQL injection vector. Even "escaping" quotes manually is error-prone. Use parameters for every externally supplied value.

---

# 🌍 Production Consideration

Parameterized queries also improve plan caching: the database can reuse one execution plan for `WHERE CustomerID = ?` instead of compiling a new plan for every distinct customer value. On busy systems, this reduces CPU usage significantly.

---

# 🚀 Enterprise Practice

Coding standards typically require one predicate per line, explicit parentheses around every `OR` group, ISO date literals, and parameters for all application values. These rules make filters easy to review and nearly impossible to misread.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| String literal | `'...'` | `'...'` | `'...'` or `"..."` (default mode) | `'...'` | `'...'` | `'...'` |
| Delimited identifier | `"..."` | `"..."` | `` `...` `` | `[...]` or `"..."` | `"..."` | `"..."`, `` `...` ``, `[...]` |
| `DATE '...'` literal | ✅ | ✅ | ✅ | ❌ (use `'YYYY-MM-DD'` or `CAST`) | ✅ | ❌ (dates are text/numbers) |
| Native `BOOLEAN` | ✅ | ✅ | Alias for `TINYINT(1)` | ❌ (`BIT`) | ✅ (23ai+) | ❌ (integers) |
| Parameter style | Driver-defined | `$1` | `?` | `@name` | `:name` | `?`, `:name`, `@name` |

> **Portability Tip:** Use single quotes for strings, ISO `YYYY-MM-DD` dates, and parameters for values. These three habits remove most cross-database syntax problems in `WHERE` clauses.

---

# Common Mistakes

### Mistake 1

Using double quotes for string values.

---

### Mistake 2

Writing more than one `WHERE` keyword in the same query block instead of combining conditions with `AND`.

```sql
WHERE Country = 'India'
WHERE IsActive = 1     -- Syntax error
```

---

### Mistake 3

Using locale-dependent date formats such as `'04/03/2026'`.

---

### Mistake 4

Placing `WHERE` after `GROUP BY` or `ORDER BY`.

---

# Best Practices

✔ Put one condition per line.

✔ Use single quotes for strings and ISO dates.

✔ Match literal types to column types.

✔ Use parentheses around every `OR` group.

✔ Pass application values as parameters.

---

# Interview Questions

## Basic

1. Where does `WHERE` appear in a `SELECT` statement?
2. How do you include a single quote inside a string literal?
3. What is the difference between single and double quotes in SQL?

## Intermediate

4. Why should dates be written in `YYYY-MM-DD` format?
5. How do parameter placeholders differ between databases?
6. Can a query contain two `WHERE` clauses?

## Advanced

7. How does the parser represent a search condition internally?
8. Why can mismatched literal types hurt performance?
9. How do parameterized queries improve plan caching?

---

# Hands-on Exercises

## Exercise 1

Return customers whose last name is `O'Connor`.

---

## Exercise 2

Return orders placed on 15 March 2026 using a standard date literal.

---

## Exercise 3

Return products in category 2 that cost less than 25 and are in stock.

---

## Exercise 4

Find and fix the errors in this query:

```sql
SELECT ProductName
FROM Products
WHERE Category = "Books"
WHERE Price < 20;
```

---

# Related Topics

- **04.01 — SQL Syntax**
- **04.15 — SQL Identifiers**
- **04.17 — SQL Formatting and Style Guide**
- **06.01 — Introduction to WHERE**
- **06.03 — Comparison Operators**
- **06.04 — Logical Operators (AND, OR, NOT)**

---

# Summary

The `WHERE` clause follows `FROM` and precedes `GROUP BY`, and contains a single search condition built from predicates and logical operators. Predicates compare operands—columns, literals, expressions, or parameters—using operators. Correct syntax depends on details that are easy to get wrong: single quotes for strings, ISO dates, matching data types, and parentheses around `OR` groups. Writing filters clearly and passing values as parameters makes queries correct, portable, secure, and efficient.
