---
title: "03.02 - Tables, Rows & Columns"
description: "Learn how relational databases organize data using tables, rows, columns, records, fields, and cells."
chapter: 3
section: 3.2
category: Core SQL Concepts
difficulty: Beginner
readingTime: 15 min
lastUpdated: 2026-07-27
---

# 03.02 Tables, Rows & Columns

## Learning Objectives

After completing this lesson, you will be able to:

- Understand what a table is
- Understand rows, columns and cells
- Differentiate between records and fields
- Learn table naming conventions
- Understand why relational databases use tables
- Read and interpret tabular data

---

# Introduction

Everything stored inside a relational database is organised into **tables**.

Whether you're managing:

- Employees
- Customers
- Products
- Students
- Orders

the data is stored in tables consisting of **rows** and **columns**.

Understanding tables is the foundation of SQL because every SQL query interacts with one or more tables.

---

# What is a Table?

A **Table** is a collection of related data organised into **rows** and **columns**.

Each table represents one type of entity.

Examples:

```
Employees
Customers
Products
Orders
Invoices
Students
```

Think of a table as a well-organised spreadsheet where every row represents one item and every column represents one characteristic of that item.

---

# Real-World Example

Imagine a company maintaining employee information.

Instead of storing everything in documents, the information is stored in a table.

**Employees**

| EmployeeID | FirstName | Department | Salary |
|------------|-----------|------------|---------|
| 101 | John | IT | 65000 |
| 102 | Alice | HR | 55000 |
| 103 | David | Sales | 60000 |

This entire structure is called a **table**.

---

# Table Structure

```
Employees
─────────────────────────────────────────────────────
EmployeeID | FirstName | Department | Salary
─────────────────────────────────────────────────────
101        | John      | IT         | 65000
102        | Alice     | HR         | 55000
103        | David     | Sales      | 60000
─────────────────────────────────────────────────────
```

A table consists of:

- Columns
- Rows
- Cells

---

# What is a Row?

A **Row** represents one complete record in a table.

Each row contains information about one object.

Example

| EmployeeID | FirstName | Department |
|------------|-----------|------------|
| **101** | **John** | **IT** |

This single horizontal line is one row.

Rows are also called:

- Record
- Tuple

---

# Characteristics of a Row

A row:

- Represents one object
- Contains values for every column
- Is uniquely identified using a Primary Key
- Increases as more data is inserted

Example

```
Employee 101

Employee 102

Employee 103
```

Each employee is one row.

---

# What is a Column?

A **Column** represents one attribute of the data.

Example

| EmployeeID | FirstName | Department | Salary |
|------------|-----------|------------|---------|

Columns describe **what information** is stored.

---

# Characteristics of a Column

A column:

- Has a name
- Has a data type
- Stores one type of information
- Usually remains fixed after table creation

Example

```
EmployeeID

FirstName

Department

Salary
```

---

# What is a Cell?

A **Cell** is the intersection of one row and one column.

Example

| EmployeeID | FirstName | Department |
|------------|-----------|------------|
| 101 | **John** | IT |

The value **John** is one cell.

Every individual value inside a table is stored inside a cell.

---

# Record vs Row

These terms are often used interchangeably.

| Term | Meaning |
|------|----------|
| Row | Horizontal collection of values |
| Record | One complete object stored in a row |

Example

```
Employee 101
```

This is both:

- One row
- One record

---

# Field vs Column

Again, these terms are commonly interchangeable.

| Term | Meaning |
|------|----------|
| Column | Database structure |
| Field | Individual attribute stored in a column |

Example

```
FirstName
```

This is a column.

The value

```
John
```

is the field value.

---

# Visual Representation

```
                    COLUMN

          EmployeeID
               │
               ▼
        ┌──────────────────┐
ROW --->│101│John│IT│65000 │
        ├──────────────────┤
        │102│Alice│HR│55000│
        ├──────────────────┤
        │103│David│Sales...│
        └──────────────────┘
```

---

# Example Table

## Customers

| CustomerID | Name | City | Email |
|------------|------|------|--------|
| 1 | John | London | john@email.com |
| 2 | Alice | Paris | alice@email.com |
| 3 | David | Berlin | david@email.com |

Table Name

```
Customers
```

Rows

```
3
```

Columns

```
4
```

Cells

```
3 × 4 = 12
```

---

# Table Naming Conventions

Professional developers use meaningful names.

✅ Good

```
Employees

Customers

Products

Orders

Invoices
```

❌ Bad

```
Table1

Data

Temp

ABC

Sample
```

Names should clearly describe the data stored inside the table.

---

# Column Naming Conventions

Good column names are descriptive.

✅ Good

```
EmployeeID

FirstName

LastName

Salary

JoiningDate

Email
```

❌ Bad

```
a

x

col1

data

test
```

---

# Why Do Databases Use Tables?

Imagine storing employee information in plain text.

```
John works in IT.

Alice works in HR.

David works in Sales.
```

Finding information would be difficult.

Instead, tables organise information into structured columns.

This allows SQL to search, sort and filter data efficiently.

---

# Example SQL Query

Suppose we have this table.

| EmployeeID | FirstName | Department |
|------------|-----------|------------|
| 101 | John | IT |
| 102 | Alice | HR |
| 103 | David | Sales |

Retrieve all rows.

```sql
SELECT *
FROM Employees;
```

## Output

| EmployeeID | FirstName | Department |
|------------|-----------|------------|
| 101 | John | IT |
| 102 | Alice | HR |
| 103 | David | Sales |

### Explanation

`SELECT` retrieves data from a table.

`*` means return every column.

---

# Selecting Specific Columns

Instead of returning every column:

```sql
SELECT
FirstName,
Department
FROM Employees;
```

## Output

| FirstName | Department |
|------------|------------|
| John | IT |
| Alice | HR |
| David | Sales |

### Explanation

Only the requested columns are returned.

This is more efficient than using `SELECT *`.

---

# Table Design Principles

A good table should:

- Store one type of information
- Have meaningful column names
- Use appropriate data types
- Include a Primary Key
- Avoid duplicate information

Example

```
Employees
```

should only store employee information.

Do not store:

- Products
- Orders
- Customers

inside the same table.

---

# One Table vs Multiple Tables

❌ Poor Design

```
Employee
Customer
Product
Supplier
Invoice

(All inside one table)
```

This creates duplicate data and unnecessary complexity.

---

✅ Better Design

```
Employees

Customers

Products

Orders

Invoices
```

Each table has one responsibility.

---

# Best Practices

- One table should represent one entity.
- Use meaningful table names.
- Use meaningful column names.
- Keep naming conventions consistent.
- Include a Primary Key.
- Avoid duplicate columns.
- Store only related information.

---

# Common Mistakes

❌ Creating one huge table for the entire application

❌ Using meaningless column names

```
Column1

Column2

Data

Temp
```

❌ Storing multiple values in one column

```
Skills

HTML,CSS,JS,PHP
```

Instead, use separate related tables when appropriate.

---

# Interview Questions

### What is a table?

A table is a collection of related data organised into rows and columns.

---

### What is a row?

A row represents one complete record.

---

### What is a column?

A column stores one attribute of the data.

---

### What is a cell?

A cell is the intersection of one row and one column containing a single value.

---

### What is the difference between a row and a column?

Rows store complete records horizontally, while columns store individual attributes vertically.

---

### Why do relational databases use tables?

Tables organise data efficiently, making it easier to retrieve, update, filter and maintain information.

---

# Hands-on Exercises

## Exercise 1

Create a table structure for storing student information.

Suggested columns:

```
StudentID

FirstName

LastName

Email

Phone

DateOfBirth
```

---

## Exercise 2

Count the following:

| ProductID | ProductName | Price |
|------------|-------------|-------|
| 1 | Mouse | 650 |
| 2 | Keyboard | 1200 |
| 3 | Monitor | 9800 |

Identify:

- Number of rows
- Number of columns
- Number of cells

---

## Exercise 3

Design separate tables for an online shopping application.

Suggested entities:

```
Customers

Products

Orders

Payments

Categories

Suppliers
```

---

## Exercise 4

Identify whether the following are **Table**, **Row**, **Column**, or **Cell**.

- Employees
- Salary
- John
- EmployeeID
- Employee 101

---

# Chapter Summary

In this lesson, you learned:

- What a table is
- What rows represent
- What columns represent
- What cells contain
- The difference between rows and columns
- Record vs Row
- Field vs Column
- Table naming conventions
- Basic SQL queries for retrieving table data
- Good table design practices

These concepts form the basis for writing SQL queries and designing relational databases.

---

# What's Next?

In **03.03 – Records, Fields & Cells**, you'll explore the smallest building blocks of a table, understand how individual values are stored, and learn the terminology used across different database systems.