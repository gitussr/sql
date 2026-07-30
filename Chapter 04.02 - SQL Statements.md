---
title: "04.02 - SQL Statements"
description: "Learn what SQL statements are, how they are structured, the different types of SQL statements, statement execution, delimiters, and best practices for writing professional SQL code."
chapter: 4
section: 4.2
category: SQL Fundamentals
difficulty: Beginner
readingTime: 40 min
lastUpdated: 2026-07-28
---

# 04.02 SQL Statements

---

# Learning Objectives

After completing this lesson, you will be able to:

- Understand what an SQL statement is
- Identify the components of an SQL statement
- Differentiate between simple and compound statements
- Learn how SQL statements are executed
- Understand statement terminators
- Write clean and readable SQL statements

---

# What is an SQL Statement?

An **SQL statement** is a complete instruction sent to a Database Management System (DBMS) requesting it to perform a specific task.

The task may be to:

- Retrieve data
- Insert new records
- Update existing records
- Delete records
- Create database objects
- Modify database structures
- Control user permissions
- Manage transactions

Simply put:

> **An SQL statement is a command that tells the database what to do.**

---

# Real-World Analogy

Imagine giving instructions to a librarian.

Examples:

```text
Find all books.

↓

Add a new book.

↓

Remove an old book.

↓

Create a new shelf.
```

Each instruction is separate.

Similarly, every SQL statement performs one specific action.

---

# Basic SQL Statement Structure

Most SQL statements contain:

```text
Command

↓

Object

↓

Options

↓

Semicolon
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
├── Target

FROM
│
├── Clause

Employees
│
├── Table

;
│
└── Statement Terminator
```

---

# Example SQL Statements

Retrieve records

```sql
SELECT *

FROM Employees;
```

Insert a record

```sql
INSERT INTO Employees
(
    EmployeeID,
    FirstName
)
VALUES
(
    1,
    'John'
);
```

Update records

```sql
UPDATE Employees

SET Salary = 65000

WHERE EmployeeID = 1;
```

Delete records

```sql
DELETE

FROM Employees

WHERE EmployeeID = 1;
```

Create a table

```sql
CREATE TABLE Departments
(
    DepartmentID INT PRIMARY KEY,
    DepartmentName VARCHAR(100)
);
```

Each of these is an independent SQL statement.

---

# Statement Components

A statement is usually composed of several parts.

Example:

```sql
SELECT
    FirstName,
    LastName

FROM Employees

WHERE Department = 'HR'

ORDER BY LastName;
```

Components:

| Component | Purpose |
|-----------|----------|
| SELECT | Command |
| FirstName, LastName | Columns |
| FROM | Clause |
| Employees | Table |
| WHERE | Filter |
| ORDER BY | Sorting |
| ; | Statement Terminator |

---

# One Statement vs Multiple Statements

A script may contain a single statement:

```sql
SELECT *

FROM Employees;
```

Or multiple statements:

```sql
CREATE TABLE Departments
(
    DepartmentID INT PRIMARY KEY,
    DepartmentName VARCHAR(100)
);

INSERT INTO Departments
VALUES
(
    1,
    'Human Resources'
);

SELECT *

FROM Departments;
```

The database executes each statement separately.

---

# Statement Terminator

The semicolon (`;`) marks the end of a statement.

Example:

```sql
SELECT *

FROM Employees;
```

Multiple statements:

```sql
SELECT *

FROM Employees;

SELECT *

FROM Departments;
```

Using semicolons consistently improves readability and portability between different database systems.

---

# SQL Scripts

A collection of SQL statements stored in a file is called an **SQL script**.

Example:

```sql
CREATE DATABASE CompanyDB;

USE CompanyDB;

CREATE TABLE Employees
(
    EmployeeID INT PRIMARY KEY,
    FirstName VARCHAR(50)
);

INSERT INTO Employees
VALUES
(
    1,
    'John'
);

SELECT *

FROM Employees;
```

Scripts are commonly used to:

- Create databases
- Install applications
- Populate sample data
- Perform migrations
- Automate administrative tasks

---

# Statement Execution

When an SQL statement is submitted:

```text
SQL Statement

↓

SQL Parser

↓

Syntax Validation

↓

Query Optimizer

↓

Execution Engine

↓

Database

↓

Result
```

The DBMS validates the syntax before executing the statement.

If the syntax is incorrect, execution stops and an error is returned.

---

# Statement Types

SQL statements can be grouped into five main categories.

| Category | Purpose |
|----------|----------|
| DDL | Define database objects |
| DML | Modify data |
| DQL | Retrieve data |
| DCL | Control permissions |
| TCL | Manage transactions |

These categories will be discussed in detail in the next lessons.

---

# SQL Statement Order

A `SELECT` statement generally follows this structure:

```sql
SELECT columns

FROM table

WHERE condition

GROUP BY columns

HAVING condition

ORDER BY columns;
```

Not every clause is required.

Example:

```sql
SELECT *

FROM Products;
```

---

# SQL Statement Formatting

Professional SQL is easy to read.

Recommended:

```sql
SELECT
    EmployeeID,
    FirstName,
    Salary

FROM Employees

WHERE Department = 'IT'

ORDER BY Salary DESC;
```

Avoid:

```sql
select employeeid,firstname,salary from employees where department='IT' order by salary desc;
```

---

# Visual Representation

```text
SQL Statement

│

├── Command

├── Clauses

├── Table

├── Conditions

├── Sorting

└── Terminator
```

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB | SQLite |
|---------|:------:|:----------:|:----------:|:------:|:--------:|:------:|
| SQL Statements | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multiple Statements | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| SQL Scripts | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Statement Terminator | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

# Common Mistakes

## Missing Semicolon

Incorrect:

```sql
SELECT *

FROM Employees
```

Preferred:

```sql
SELECT *

FROM Employees;
```

---

## Mixing Multiple Statements

Incorrect:

```sql
SELECT *

INSERT INTO Employees;
```

Each statement must be complete before the next begins.

---

## Incorrect Statement Order

Incorrect:

```sql
WHERE Salary > 50000

SELECT *

FROM Employees;
```

Correct:

```sql
SELECT *

FROM Employees

WHERE Salary > 50000;
```

---

## Executing Partial Statements

Running only part of a statement:

```sql
SELECT *

FROM
```

results in a syntax error because the statement is incomplete.

---

# Best Practices

✔ Write one logical statement at a time.

✔ End every statement with a semicolon.

✔ Format statements consistently.

✔ Use comments to describe complex logic.

✔ Test statements before executing them on production databases.

✔ Keep SQL scripts organised into logical sections.

---

# 💡 Did You Know?

A single SQL script used to initialise a production database may contain **thousands of SQL statements**. During application deployment, these scripts create tables, indexes, views, stored procedures, permissions, and initial data—all automatically without manual intervention.

---

# Quick Reference

| Statement | Purpose |
|-----------|---------|
| `SELECT` | Retrieve data |
| `INSERT` | Add new records |
| `UPDATE` | Modify records |
| `DELETE` | Remove records |
| `CREATE` | Create database objects |
| `ALTER` | Modify database objects |
| `DROP` | Remove database objects |
| `TRUNCATE` | Remove all rows from a table |
| `GRANT` | Give permissions |
| `COMMIT` | Save a transaction |

---

# Interview Questions

## Basic

1. What is an SQL statement?
2. Why is a semicolon used?
3. Can an SQL script contain multiple statements?

---

## Intermediate

4. What happens when an SQL statement is executed?
5. What is the difference between an SQL statement and an SQL script?
6. Why should SQL statements be properly formatted?

---

## Advanced

7. Explain how the SQL parser and query optimiser process a statement.
8. Why do some DBMSs allow semicolons to be omitted in interactive sessions?
9. How would you organise a deployment script containing thousands of SQL statements?

---

# Hands-on Exercises

## Exercise 1

Identify the command, clauses, table, and terminator in the following statement:

```sql
SELECT FirstName

FROM Employees

WHERE City = 'London';
```

---

## Exercise 2

Write an SQL script that:

1. Creates a table named `Students`
2. Inserts two records
3. Retrieves all records

---

## Exercise 3

Correct the syntax errors:

```sql
FROM Products

SELECT *;
```

---

## Exercise 4

Write three separate SQL statements:

- Retrieve all employees
- Retrieve all departments
- Retrieve all products

---

# Related Topics

- **04.01 — SQL Syntax**
- **04.03 — SQL Keywords**
- **04.04 — SQL Clauses**
- **04.05 — SQL Operators & Expressions**
- **04.06 — SQL Command Categories**
- **04.07 — SQL Comments**

---

# Summary

An **SQL statement** is a complete instruction sent to a database to perform a specific task, such as retrieving data, inserting records, creating tables, or managing transactions. Every SQL program is built from individual statements, each following a defined syntax. Understanding how statements are structured, terminated, formatted, and executed provides the foundation for writing clear, reliable, and maintainable SQL code throughout your development career.