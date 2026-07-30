---
title: "04.06 - SQL Operators & Expressions"
description: "Learn SQL operators and expressions, including arithmetic, comparison, logical, string, bitwise, and special operators. Understand how expressions are evaluated and used in real-world SQL queries."
chapter: 4
section: 4.6
category: SQL Fundamentals
difficulty: Beginner → Intermediate
readingTime: 55 min
lastUpdated: 2026-07-29
---

# 04.06 SQL Operators & Expressions

---

# Learning Objectives

After completing this lesson, you will be able to:

- Understand SQL operators and expressions
- Differentiate between operators and operands
- Use arithmetic, comparison, logical, and special operators
- Build expressions using multiple operators
- Understand operator precedence
- Write cleaner and more efficient SQL expressions

---

# What is an Operator?

An **operator** is a symbol or keyword that performs an operation on one or more values.

Example:

```sql
Salary + Bonus
```

The `+` operator adds two values.

---

# What is an Operand?

An **operand** is the value on which an operator acts.

Example:

```text
Salary + Bonus

Salary → Operand

Bonus → Operand

+ → Operator
```

---

# What is an Expression?

An **expression** is a combination of:

- Columns
- Literals
- Variables
- Functions
- Operators

that evaluates to a single value.

Example:

```sql
Salary * 12
```

returns the annual salary.

---

# Visual Representation

```text
Salary * 12

│      │

│      └── Literal

└──────── Column

      *

   Operator

↓

Expression

↓

Result
```

---

# Categories of SQL Operators

Most relational databases support several categories of operators.

```text
Arithmetic

↓

Comparison

↓

Logical

↓

String

↓

Special

↓

Bitwise (DBMS dependent)
```

---

# Arithmetic Operators

Used for mathematical calculations.

| Operator | Meaning |
|----------|---------|
| + | Addition |
| - | Subtraction |
| * | Multiplication |
| / | Division |
| % | Modulus (DBMS dependent) |

Example

```sql
SELECT
    Salary,
    Salary * 12 AS AnnualSalary
FROM Employees;
```

---

# Comparison Operators

Used to compare two values.

| Operator | Meaning |
|----------|---------|
| = | Equal |
| <> | Not Equal |
| != | Not Equal (DBMS dependent) |
| > | Greater Than |
| < | Less Than |
| >= | Greater Than or Equal |
| <= | Less Than or Equal |

Example

```sql
WHERE Salary > 50000
```

---

# Logical Operators

Logical operators combine conditions.

| Operator | Meaning |
|----------|---------|
| AND | Both conditions must be true |
| OR | At least one condition is true |
| NOT | Negates a condition |

Example

```sql
WHERE Department = 'IT'
AND Salary > 60000
```

---

# String Operators

Used with text values.

Common examples:

```sql
CONCAT()
```

```sql
||
```

```sql
+
```

Support depends on the database system.

Example

```sql
SELECT
    CONCAT(FirstName, ' ', LastName)
FROM Employees;
```

---

# Special Operators

SQL provides several operators designed for searching and filtering.

Examples:

```text
LIKE

IN

BETWEEN

EXISTS

ANY

ALL

IS NULL

IS NOT NULL
```

Example

```sql
WHERE Department IN
(
    'IT',
    'HR'
)
```

---

# Bitwise Operators

Some DBMSs support bitwise operations.

Examples:

```text
&

|

^

<<

>>
```

These are mainly used in specialised applications.

---

# Building Expressions

Expressions can combine multiple operators.

Example

```sql
(Salary + Bonus) * 12
```

The result is a single calculated value.

---

# Expressions in SELECT

```sql
SELECT

Salary,

Bonus,

Salary + Bonus AS MonthlyIncome

FROM Employees;
```

---

# Expressions in WHERE

```sql
SELECT *

FROM Employees

WHERE Salary * 12 > 600000;
```

---

# Expressions in ORDER BY

```sql
SELECT *

FROM Employees

ORDER BY Salary * 12 DESC;
```

---

# Expressions in GROUP BY

Some databases allow expressions inside grouping.

Example

```sql
GROUP BY YEAR(OrderDate)
```

---

# Operator Precedence

SQL evaluates operators in a specific order.

General precedence:

```text
()

↓

Arithmetic

↓

Comparison

↓

NOT

↓

AND

↓

OR
```

Example

```sql
WHERE
(
    Salary > 50000
    OR Bonus > 10000
)
AND Department = 'IT'
```

Parentheses improve readability and prevent logical errors.

---

# Complex Expression Example

```sql
SELECT

EmployeeID,

FirstName,

(Salary + Bonus) * 12 AS AnnualCompensation

FROM Employees

WHERE

Department = 'IT'

AND

Salary > 60000

ORDER BY

AnnualCompensation DESC;
```

---

# Expression Evaluation Flow

```text
Read Row

↓

Evaluate Expression

↓

Apply Operators

↓

Calculate Result

↓

Return Value
```

---

# 🏗️ Architecture Insight

Expressions become nodes in the **Abstract Syntax Tree (AST)**.

Example:

```text
Annual Salary

│

├── Salary

├── *

└── 12
```

The optimizer analyses these expression trees when building an execution plan.

---

# ⚡ Performance Tip

Avoid applying functions or calculations directly to indexed columns in filtering conditions when possible.

Example:

Less efficient:

```sql
WHERE YEAR(OrderDate) = 2026
```

Often better:

```sql
WHERE OrderDate >= '2026-01-01'
AND OrderDate < '2027-01-01'
```

The second form is more likely to allow efficient index usage in many database systems.

---

# 🔒 Security Note

Never build expressions by concatenating user input into SQL strings.

Unsafe:

```text
Salary > " + userInput
```

Always use parameterized queries or prepared statements to avoid SQL injection vulnerabilities.

---

# 🌍 Production Consideration

Enterprise reporting queries frequently contain complex expressions involving:

- Mathematical calculations
- Currency conversions
- Date arithmetic
- Conditional expressions
- Aggregate functions

Keeping expressions readable and well documented makes long-term maintenance much easier.

---

# 🚀 Enterprise Practice

Many teams define calculated values once using:

- Views
- Computed/generated columns
- Common Table Expressions (CTEs)

instead of repeating the same expression throughout the application.

This reduces duplication and improves consistency.

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB | SQLite |
|---------|:------:|:----------:|:----------:|:------:|:--------:|:------:|
| Arithmetic Operators | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Comparison Operators | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Logical Operators | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Special Operators | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bitwise Operators | ✅ | ✅ | ✅ | Limited | ✅ | Limited |

---

# Common Mistakes

## Forgetting Parentheses

Incorrect:

```sql
Salary + Bonus * 12
```

May not produce the intended result.

Preferred:

```sql
(Salary + Bonus) * 12
```

---

## Comparing NULL with "="

Incorrect:

```sql
WHERE ManagerID = NULL
```

Correct:

```sql
WHERE ManagerID IS NULL
```

---

## Mixing Data Types

Avoid comparing incompatible types without understanding implicit conversions.

---

# Best Practices

✔ Use parentheses to clarify complex expressions.

✔ Write readable expressions.

✔ Prefer standard SQL operators.

✔ Avoid unnecessary calculations in filtering conditions.

✔ Test complex expressions with sample data.

---

# 💡 Did You Know?

The SQL optimizer may simplify constant expressions before executing a query. For example, an expression like `5 + 10` is evaluated during query processing rather than for every row. This optimisation, known as **constant folding**, reduces unnecessary computation during execution.

---

# Quick Reference

| Category | Examples |
|----------|----------|
| Arithmetic | `+`, `-`, `*`, `/`, `%` |
| Comparison | `=`, `<>`, `>`, `<`, `>=`, `<=` |
| Logical | `AND`, `OR`, `NOT` |
| String | `CONCAT()`, `||`, `+` |
| Special | `LIKE`, `IN`, `BETWEEN`, `EXISTS`, `IS NULL` |
| Bitwise | `&`, `|`, `^`, `<<`, `>>` |

---

# Interview Questions

## Basic

1. What is an SQL operator?
2. What is the difference between an operator and an operand?
3. What is an expression?

## Intermediate

4. Explain operator precedence.
5. Why are parentheses recommended in complex expressions?
6. What are special operators?

## Advanced

7. What is constant folding?
8. How can expressions affect index usage?
9. Explain why applying functions to indexed columns may impact performance.

---

# Hands-on Exercises

## Exercise 1

Write expressions to calculate:

- Annual salary
- Total compensation
- Discounted price

---

## Exercise 2

Create a query using:

- Arithmetic operators
- Comparison operators
- Logical operators

in the same statement.

---

## Exercise 3

Rewrite an expression using parentheses to improve readability.

---

## Exercise 4

Research which string concatenation operator is used by your preferred DBMS.

---

# Related Topics

- **04.01 — SQL Syntax**
- **04.02 — SQL Statements**
- **04.03 — How SQL Works Internally**
- **04.04 — SQL Keywords**
- **04.05 — SQL Clauses**
- **05.xx — SELECT Statement**
- **06.xx — WHERE Clause**

---

# Summary

SQL operators perform actions such as arithmetic, comparison, logical evaluation, and pattern matching, while expressions combine operators, operands, functions, and literals to produce meaningful results. Understanding how expressions are evaluated, how operator precedence works, and how expressions interact with the query optimizer lays the foundation for writing efficient, readable, and production-ready SQL queries.