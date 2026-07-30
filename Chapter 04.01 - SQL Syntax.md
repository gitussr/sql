---
title: "04.01 - SQL Syntax"
description: "Learn the fundamental syntax of SQL, including SQL statements, clauses, keywords, expressions, operators, identifiers, and formatting rules. Understand how SQL is written before learning CREATE, SELECT, INSERT, UPDATE, and DELETE."
chapter: 4
section: 4.1
category: SQL Fundamentals
difficulty: Beginner
readingTime: 45 min
lastUpdated: 2026-07-28
---

# 04.01 SQL Syntax

---

# Learning Objectives

After completing this lesson, you will be able to:

- Understand SQL syntax and grammar
- Identify SQL keywords
- Recognise SQL clauses
- Write valid SQL statements
- Understand expressions and operators
- Follow professional SQL formatting conventions

---

# What is SQL Syntax?

Just as every spoken language has grammatical rules, SQL also follows a set of rules called **syntax**.

Syntax defines **how SQL statements must be written** so that the Database Management System (DBMS) can understand and execute them.

Example:

Correct SQL

```sql
SELECT FirstName
FROM Employees;
```

Incorrect SQL

```sql
FROM Employees
SELECT FirstName;
```

The second example contains the same words but in the wrong order, making it invalid.

---

# Real-World Analogy

Imagine asking someone:

Correct English

> Please open the door.

Incorrect English

> Door please open the.

The words are familiar, but the sentence structure is wrong.

SQL works exactly the same way.

---

# Basic SQL Statement Structure

Most SQL statements follow this pattern:

```sql
COMMAND

OBJECT

OPTIONS;
```

Example:

```sql
SELECT *

FROM Employees;
```

Breaking it down:

```text
SELECT
│
├── Command

*
│
├── What to retrieve

FROM
│
├── Clause

Employees
│
└── Table
```

---

# General SQL Syntax

Although every SQL command has its own syntax, many statements follow a common structure.

```sql
COMMAND column_list

FROM table_name

WHERE condition

GROUP BY column

HAVING condition

ORDER BY column;
```

Not every clause is required.

For example:

```sql
SELECT *

FROM Products;
```

is perfectly valid.

---

# SQL Keywords

Keywords are reserved words recognised by the SQL language.

Examples:

```text
SELECT

FROM

WHERE

INSERT

UPDATE

DELETE

CREATE

ALTER

DROP

JOIN

GROUP BY

ORDER BY
```

Keywords tell the database **what action to perform**.

Example:

```sql
SELECT ProductName

FROM Products;
```

Here,

```text
SELECT

FROM
```

are SQL keywords.

---

# SQL Clauses

A clause is a part of an SQL statement.

Example:

```sql
SELECT Name

FROM Employees

WHERE Salary > 50000

ORDER BY Name;
```

Clauses:

| Clause | Purpose |
|---------|----------|
| SELECT | Choose columns |
| FROM | Specify table |
| WHERE | Filter rows |
| ORDER BY | Sort results |

Think of clauses as individual building blocks that together form a complete SQL statement.

---

# SQL Expressions

An expression produces a value.

Example:

```sql
Salary * 12
```

This expression calculates annual salary.

Example:

```sql
SELECT

Salary * 12 AS AnnualSalary

FROM Employees;
```

Expressions may contain:

- Columns
- Numbers
- Functions
- Operators
- Constants

---

# SQL Operators

Operators perform calculations or comparisons.

Arithmetic Operators

```text
+

-

*

/

%
```

Comparison Operators

```text
=

>

<

>=

<=

<>

!=
```

Logical Operators

```text
AND

OR

NOT
```

Example:

```sql
SELECT *

FROM Employees

WHERE Salary > 50000
AND Department = 'IT';
```

---

# SQL Identifiers

Identifiers are names used for database objects.

Examples:

```text
Database Name

Table Name

Column Name

View Name

Index Name

Constraint Name
```

Example:

```sql
Employees

FirstName

Salary

Orders
```

Identifiers should be meaningful and consistent.

---

# SQL Literals

A literal is a fixed value written directly into the SQL statement.

Examples:

String

```sql
'John'
```

Number

```sql
100
```

Decimal

```sql
2500.50
```

Boolean (where supported)

```sql
TRUE
```

Date

```sql
'2026-07-28'
```

Example:

```sql
SELECT *

FROM Employees

WHERE City = 'London';
```

Here,

```text
'London'
```

is a string literal.

---

# SQL Comments

Comments are ignored by the database.

Single-line comment

```sql
-- Retrieve all employees
```

Multi-line comment

```sql
/*
Retrieve
all
employees
*/
```

Comments improve readability and documentation.

---

# Statement Terminator

Most SQL statements end with a semicolon (`;`).

Example:

```sql
SELECT *

FROM Employees;
```

Although some database systems allow it to be omitted for single statements, using semicolons consistently is considered best practice.

---

# SQL is Case-Insensitive (Mostly)

These statements are equivalent:

```sql
SELECT *
FROM Employees;
```

```sql
select *
from employees;
```

```sql
SeLeCt *
FrOm Employees;
```

However, by convention:

- SQL keywords are written in **UPPERCASE**
- Database object names use **PascalCase**, **snake_case**, or your team's agreed naming convention

Example:

```sql
SELECT FirstName

FROM Employees;
```

---

# SQL Formatting Best Practices

Professional SQL is easy to read.

Good

```sql
SELECT
    EmployeeID,
    FirstName,
    LastName,
    Salary
FROM Employees
WHERE Department = 'IT'
ORDER BY Salary DESC;
```

Poor

```sql
select employeeid,firstname,lastname,salary from employees where department='IT' order by salary desc;
```

Readable SQL is easier to debug, review, and maintain.

---

# Common SQL Syntax Rules

- Keywords must be spelled correctly.
- Clauses must appear in the correct order.
- Table names must exist.
- Column names must exist.
- String values should be enclosed in quotes.
- Parentheses must be balanced.
- Statements should end with a semicolon.
- SQL keywords should be consistently formatted.

---

# Visual Representation

```text
SQL Statement

│

├── Command

├── Clause

├── Table

├── Columns

├── Conditions

└── Terminator
```

---

# Sample SQL Statements

Retrieve all employees

```sql
SELECT *

FROM Employees;
```

Retrieve selected columns

```sql
SELECT
    FirstName,
    LastName
FROM Employees;
```

Filter records

```sql
SELECT *

FROM Employees

WHERE Department = 'HR';
```

Sort results

```sql
SELECT *

FROM Employees

ORDER BY Salary DESC;
```

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB | SQLite |
|---------|:------:|:----------:|:----------:|:------:|:--------:|:------:|
| Standard SQL Syntax | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Comments | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Expressions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Operators | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Semicolon Support | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

# Common Mistakes

## Misspelling Keywords

Wrong

```sql
SELEC *

FROM Employees;
```

Correct

```sql
SELECT *

FROM Employees;
```

---

## Incorrect Clause Order

Wrong

```sql
WHERE Salary > 50000

FROM Employees

SELECT *;
```

Correct

```sql
SELECT *

FROM Employees

WHERE Salary > 50000;
```

---

## Forgetting Quotes

Wrong

```sql
WHERE City = London
```

Correct

```sql
WHERE City = 'London'
```

---

## Missing Semicolon

Although some DBMSs accept it, always write:

```sql
SELECT *

FROM Employees;
```

---

# Best Practices

✔ Write SQL keywords in uppercase.

✔ Use meaningful table and column names.

✔ Indent long queries consistently.

✔ Place each clause on a new line.

✔ Comment complex SQL logic.

✔ Follow a consistent formatting style across the project.

---

# 💡 Did You Know?

SQL is based on the **ISO/IEC SQL standard**, first published in 1987. While database systems such as MySQL, PostgreSQL, SQL Server, Oracle, MariaDB, and SQLite add their own extensions, the core SQL syntax remains largely the same across all major relational database systems. This means that once you learn standard SQL syntax, most of your knowledge is transferable between different databases.

---

# Quick Reference

| Component | Example |
|------------|---------|
| Keyword | `SELECT` |
| Clause | `WHERE Salary > 50000` |
| Identifier | `Employees` |
| Literal | `'London'` |
| Expression | `Salary * 12` |
| Operator | `>` |
| Comment | `-- Employee Report` |
| Terminator | `;` |

---

# Interview Questions

## Basic

1. What is SQL syntax?
2. What is the difference between a keyword and a clause?
3. What is an SQL identifier?
4. Why are semicolons used?

---

## Intermediate

5. Explain SQL expressions with examples.
6. Why are SQL keywords usually written in uppercase?
7. What are SQL literals?

---

## Advanced

8. Is SQL case-sensitive?
9. Why do different DBMSs have slightly different SQL syntax?
10. Explain the importance of writing readable SQL.

---

# Hands-on Exercises

## Exercise 1

Identify the keywords, clauses, identifiers, and literals in the following query:

```sql
SELECT FirstName

FROM Employees

WHERE City = 'London';
```

---

## Exercise 2

Rewrite this query using professional formatting:

```sql
select firstname,lastname,salary from employees where department='IT';
```

---

## Exercise 3

Correct the syntax errors:

```sql
FROM Employees

SELECT Name;
```

---

## Exercise 4

Write an SQL statement that retrieves all records from a table named `Products`.

---

## Related Topics

- **04.02 — SQL Statements**
- **04.03 — SQL Keywords**
- **04.04 — SQL Execution Order**
- **04.05 — SQL Command Categories**
- **04.06 — SQL Comments**
- **04.07 — SQL Identifiers**
- **04.08 — SQL Naming Conventions**

---

# Summary

SQL syntax is the set of grammatical rules that determines how SQL statements are written. A valid SQL statement consists of commands, clauses, identifiers, expressions, operators, and literals arranged in the correct order. Following standard SQL syntax and formatting conventions not only prevents errors but also makes your code easier to read, maintain, and collaborate on. Mastering SQL syntax is the first step toward writing reliable and professional database queries.