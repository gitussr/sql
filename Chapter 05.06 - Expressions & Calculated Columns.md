---
title: "05.06 - Expressions & Calculated Columns"
description: "Learn how SQL expressions work, how calculated columns are evaluated, and how database engines optimize expressions during query execution."
chapter: 5
section: 5.06
category: Data Query Language (DQL)
difficulty: Beginner → Advanced
readingTime: 60 min
lastUpdated: 2026-08-04
---

# 05.06 Expressions & Calculated Columns

---

# Learning Objectives

After completing this section, you will be able to:

- Understand SQL expressions.
- Create calculated columns.
- Perform arithmetic calculations.
- Build string expressions.
- Work with date/time expressions.
- Understand Boolean expressions.
- Learn how SQL evaluates expressions.
- Understand expression optimization.
- Distinguish deterministic and non-deterministic expressions.
- Apply enterprise best practices.

---

# What is an Expression?

An expression is a combination of one or more values, columns, operators, and functions that evaluates to a single value.

Examples:

```text
Salary * 12

Price + Tax

FirstName || ' ' || LastName

Quantity * UnitPrice

CURRENT_DATE

UPPER(CustomerName)
```

Every expression ultimately produces exactly one value.

---

# Expressions vs Stored Data

A table stores data.

Example:

| Product | Price |
|---------|------:|
| Laptop | 800 |

Expression:

```sql
Price * 1.18
```

Output:

```
944
```

The value **944** is calculated during query execution.

Nothing is written back to the database.

---

# Basic Syntax

```sql
SELECT
    expression
FROM table_name;
```

Example:

```sql
SELECT
    Salary * 12
FROM Employees;
```

---

# Calculated Columns

Expressions inside SELECT become calculated columns.

Example:

```sql
SELECT
    ProductName,
    Price,
    Price * 0.18 AS GST,
    Price * 1.18 AS FinalPrice
FROM Products;
```

Result

| Product | Price | GST | FinalPrice |
|---------|------:|----:|-----------:|
| Laptop | 800 | 144 | 944 |

---

# Types of Expressions

SQL supports many expression categories.

```text
Expressions

│

├── Arithmetic

├── String

├── Date & Time

├── Boolean

├── Comparison

├── Function Calls

├── CASE Expressions

└── Subquery Expressions
```

---

# Arithmetic Expressions

Example:

```sql
SELECT
    Quantity,
    UnitPrice,
    Quantity * UnitPrice AS Total
FROM OrderItems;
```

Supported operators:

```text
+

-

*

/

%

()
```

---

# Operator Precedence

SQL follows mathematical precedence.

```text
()

*

/

+

-
```

Example:

```sql
SELECT

10 + 5 * 2;
```

Result

```
20
```

because multiplication occurs first.

Using parentheses:

```sql
SELECT

(10 + 5) * 2;
```

Result

```
30
```

Always use parentheses when precedence might be unclear.

---

# String Expressions

Concatenate text.

ANSI SQL:

```sql
SELECT

FirstName || ' ' || LastName
FROM Employees;
```

MySQL:

```sql
SELECT

CONCAT(FirstName,' ',LastName)
FROM Employees;
```

SQL Server:

```sql
SELECT

FirstName + ' ' + LastName
FROM Employees;
```

---

# Date Expressions

Example:

```sql
SELECT

HireDate,
CURRENT_DATE
FROM Employees;
```

Or

```sql
SELECT

OrderDate,
OrderDate + INTERVAL '7' DAY
FROM Orders;
```

Date syntax differs across vendors.

---

# Boolean Expressions

Used for logical evaluation.

Example:

```sql
SELECT

Salary > 50000
FROM Employees;
```

Possible result:

```text
TRUE

FALSE
```

Boolean expressions are heavily used in:

- WHERE
- HAVING
- CASE
- JOIN conditions

---

# Comparison Expressions

```sql
Price > 100

Salary <= 50000

Age <> 18

Status = 'Active'
```

These return Boolean values.

---

# Function Expressions

Expressions may call functions.

Example:

```sql
SELECT

UPPER(CustomerName),

LENGTH(CustomerName),

ROUND(Price,2)
FROM Products;
```

Functions themselves are expressions.

---

# Nested Expressions

Expressions can contain other expressions.

Example:

```sql
SELECT

(Quantity * Price) * 1.18
FROM OrderItems;
```

Evaluation:

```text
Quantity

×

Price

↓

Subtotal

×

1.18

↓

Final Price
```

---

# CASE Expressions

Conditional logic.

```sql
SELECT

EmployeeName,

CASE

WHEN Salary > 100000 THEN 'Executive'

WHEN Salary > 50000 THEN 'Senior'

ELSE 'Junior'

END AS Level

FROM Employees;
```

CASE is one of SQL's most powerful expression types.

---

# NULL in Expressions

NULL propagates through most expressions.

Example:

```sql
SELECT

Salary + Bonus
```

If Bonus is NULL:

```
Result = NULL
```

Use:

```sql
COALESCE(Bonus,0)
```

to avoid unwanted NULL propagation.

---

# 📍 Execution Order Reminder

Expressions are evaluated during the SELECT phase.

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

← Expressions evaluated here

↓

DISTINCT

↓

ORDER BY
```

The rows must exist before their expressions can be calculated.

---

# Expression Trees

Internally, the parser builds an expression tree.

Query:

```sql
SELECT

Price * Quantity + Tax
```

Tree:

```text
        +

      /   \

     *    Tax

   /   \

Price Quantity
```

Expression trees allow optimizers to simplify calculations.

---

# Constant Folding

Optimizers simplify constant expressions.

Example:

```sql
SELECT

10 * 20;
```

Instead of computing every execution:

```text
10 × 20

↓

200
```

The optimizer replaces the expression with:

```sql
SELECT

200;
```

This optimization is called **Constant Folding**.

---

# Deterministic vs Non-Deterministic Expressions

Deterministic:

Same input → Same output.

Example:

```sql
ABS(-10)
```

Always returns:

```
10
```

---

Non-deterministic:

Output may change.

```sql
CURRENT_TIMESTAMP

RAND()

RANDOM()

NEWID()
```

These cannot always be optimized in the same way.

---

# Expression Reuse

Some DBMSs automatically reuse common expressions.

Example:

```sql
SELECT

Salary * 12,

Salary * 12 + Bonus
```

The optimizer may compute:

```text
Salary * 12
```

once instead of twice.

This depends on the database engine.

---

# Expression Pushdown

Modern optimizers attempt to evaluate expressions as close to the data source as possible.

Example:

```sql
SELECT

UPPER(CustomerName)
FROM Customers;
```

In distributed databases:

```text
Storage Node

↓

Apply expression

↓

Return processed values
```

instead of sending raw data first.

This reduces network traffic.

---

# How the DBMS Executes This

Example:

```sql
SELECT

Quantity * UnitPrice AS Total
FROM OrderItems;
```

Execution flow:

```text
Parser

↓

Build Expression Tree

↓

Semantic Analysis

↓

Resolve Columns

↓

Optimizer

↓

Constant Folding

↓

Execution Engine

↓

Evaluate Expression

↓

Projection

↓

Return Result
```

---

# 🔬 Engine Deep Dive

Every expression is transformed into an internal tree before execution.

```text
Developer writes

Quantity * UnitPrice

        │

        ▼

Lexer creates tokens

        │

        ▼

Parser builds expression tree

        │

        ▼

Semantic Analyzer validates data types

        │

        ▼

Optimizer simplifies constants

        │

        ▼

Execution Engine evaluates each row

        │

        ▼

Projection attaches alias

        │

        ▼

Network layer serializes result
```

Large analytical queries may evaluate billions of expressions during execution.

---

# 🏗️ Architecture Insight

Expressions are represented internally as operator trees rather than text. This enables optimizers to reorder, simplify, or eliminate calculations while preserving the query's logical meaning.

---

# ⚡ Performance Tip

Avoid repeatedly computing expensive expressions. If the same calculation is used multiple times across queries, consider computed/generated columns, indexed expressions (where supported), or materialized views.

---

# 🔒 Security Note

Expressions can reveal derived sensitive information even when raw values are hidden. For example, calculating age from a birth date or aggregating salaries may expose business insights. Apply the same access controls to derived data as to stored data.

---

# 🌍 Production Consideration

Applications frequently use calculated columns to prepare API responses, invoices, dashboards, and analytics. Keeping calculations inside SQL ensures consistency across multiple applications using the same database.

---

# 🚀 Enterprise Practice

Enterprise systems favor deterministic expressions for indexed computed columns and query optimization. Complex business logic is often encapsulated in reusable database views or functions rather than duplicated across hundreds of application queries.

---

# SQL Standard vs Vendor Differences

| Feature | ANSI SQL | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|-----------|------------|--------|------------|---------|---------|
| Arithmetic expressions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| CASE expressions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `||` string concatenation | ✅ | ✅ | ❌ (`CONCAT`) | ❌ (`+`) | ✅ | ✅ |
| Date arithmetic syntax | Standardized concept | Rich interval support | Different interval syntax | `DATEADD()` | Rich interval support | Limited |
| Boolean type | Standard | Native | Native | Uses `BIT`/Boolean-like expressions | SQL Boolean in PL/SQL contexts; SQL predicates | Integer-based truth values |

> **Portability Tip:** Arithmetic and `CASE` expressions are highly portable. String concatenation, date arithmetic, and some built-in functions vary significantly across database vendors.

---

# Common Mistakes

### Mistake 1

Ignoring operator precedence.

---

### Mistake 2

Forgetting that `NULL` usually propagates through expressions.

---

### Mistake 3

Using vendor-specific functions when writing portable SQL.

---

### Mistake 4

Duplicating complex calculations across multiple queries instead of centralizing them.

---

# Best Practices

✔ Alias calculated columns.

✔ Use parentheses for clarity.

✔ Prefer deterministic functions when possible.

✔ Handle `NULL` explicitly with `COALESCE()` or equivalent.

✔ Keep expressions readable.

✔ Test expressions on representative production data.

---

# Interview Questions

## Basic

1. What is an SQL expression?
2. What is a calculated column?
3. What is operator precedence?

### Intermediate

4. Explain constant folding.
5. Why does `NULL + 100` usually return `NULL`?
6. What is an expression tree?

### Advanced

7. Explain deterministic versus non-deterministic expressions.
8. How does the optimizer simplify expressions?
9. What is expression pushdown, and why is it important in distributed databases?

---

# Hands-on Exercises

## Exercise 1

Write a query that calculates annual salary from a monthly salary.

---

## Exercise 2

Create a calculated column that computes:

```
Quantity × UnitPrice
```

---

## Exercise 3

Write a `CASE` expression that classifies products as:

- Cheap
- Standard
- Premium

based on price.

---

## Exercise 4

Explain why the following expression returns `NULL` when `Bonus` is `NULL`:

```sql
Salary + Bonus
```

Rewrite it using `COALESCE()`.

---

# Related Topics

- **05.05 — Column Aliases**
- **05.07 — DISTINCT**
- **06.xx — WHERE Clause**
- **08.xx — Aggregate Functions**
- **09.xx — CASE Expression (Deep Dive)**
- **12.xx — Scalar Functions**
- **15.xx — Query Optimization**

---

# Summary

SQL expressions transform stored data into meaningful information by combining values, operators, functions, and conditional logic. Every expression is parsed into an internal expression tree, validated, optimized, and evaluated during the `SELECT` phase of query execution. Understanding calculated columns, operator precedence, `NULL` propagation, deterministic functions, and optimizer techniques such as constant folding prepares you to write efficient, maintainable, and enterprise-grade SQL queries.