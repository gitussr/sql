---
title: "Chapter 02 - Databases & Tables"
description: "Learn how relational databases organize data using databases, tables, rows, columns, data types, and relationships."
icon: table
order: 2
category: Fundamentals
difficulty: Beginner
readingTime: 18 min
lastUpdated: 2026-07-27
---

# Databases & Tables

## Learning Objectives

After completing this chapter, you will be able to:

- Understand what a database is
- Understand what a table is
- Differentiate between rows and columns
- Learn common SQL data types
- Understand constraints
- Learn Primary Keys and Foreign Keys
- Understand relationships between tables
- Design a simple relational database

---

# Introduction

Every modern application stores its information inside a **database**.

Whether you're using:

- Facebook
- Instagram
- Amazon
- Netflix
- WhatsApp
- Banking Software
- Hospital Management System

all of them organize their data using **tables** inside databases.

Before writing SQL queries, you must understand how data is structured.

---

# What is a Database?

A **Database** is a structured collection of related information.

Think of it as a digital filing cabinet.

Instead of keeping everything in one file, related information is organized into multiple tables.

## Example

```
School Database
│
├── Students
├── Teachers
├── Courses
├── Attendance
├── Marks
└── Fees
```

Each table stores a specific type of information.

---

# What is a Table?

A **Table** stores data in rows and columns.

It is similar to an Excel spreadsheet but much more powerful.

Example:

**Employees**

| EmployeeID | Name | Department | Salary |
|------------|------|------------|---------|
| 1 | John | IT | 65000 |
| 2 | Alice | HR | 55000 |
| 3 | David | Sales | 60000 |

A database usually contains many related tables.

---

# Rows (Records)

A **Row** represents one complete record.

Example

| EmployeeID | Name | Department |
|------------|------|------------|
| **1** | **John** | **IT** |

This entire horizontal line is one row.

Rows are also called:

- Record
- Tuple

---

# Columns (Fields)

A **Column** represents one property of the data.

Example

| EmployeeID | Name | Department | Salary |
|------------|------|------------|---------|

Each vertical section is called a column.

Columns are also known as:

- Field
- Attribute

---

# Rows vs Columns

| Rows | Columns |
|------|----------|
| Horizontal | Vertical |
| Represents one record | Represents one property |
| Number increases as data grows | Usually fixed during table design |

---

# Naming Conventions

Choose meaningful names.

✅ Good

```
Customers
Employees
Products
OrderItems
Invoices
```

❌ Bad

```
Table1
Data
Info
ABC
Temp
```

Column names should also be descriptive.

✅ Good

```
first_name
last_name
email
salary
created_at
```

❌ Bad

```
x
abc
a1
test
```

---

# SQL Data Types

Every column stores one type of data.

## Integer

Stores whole numbers.

```text
1
25
100
5000
```

Example

```sql
employee_id INT
```

---

## Decimal

Stores numbers with decimal places.

Example

```sql
salary DECIMAL(10,2)
```

Possible values

```
1250.50
89999.99
```

---

## VARCHAR

Stores variable-length text.

Example

```sql
name VARCHAR(100)
```

Possible values

```
John
Alice
Michael
```

---

## CHAR

Stores fixed-length text.

Example

```sql
country_code CHAR(2)
```

Possible values

```
IN
US
AU
UK
```

---

## DATE

Stores dates.

Example

```sql
joining_date DATE
```

Possible values

```
2026-01-15
2025-12-31
```

---

## DATETIME / TIMESTAMP

Stores date and time.

Example

```sql
created_at TIMESTAMP
```

Possible values

```
2026-07-27 10:45:12
```

---

## BOOLEAN

Stores TRUE or FALSE values.

Example

```sql
is_active BOOLEAN
```

---

# Creating Your First Database

```sql
CREATE DATABASE CompanyDB;
```

## Explanation

Creates a new database named **CompanyDB**.

The database is initially empty.

---

# Using a Database

```sql
USE CompanyDB;
```

## Explanation

Makes CompanyDB the active database.

All future SQL statements will run inside it.

---

# Creating Your First Table

```sql
CREATE TABLE Employees
(
    employee_id INT,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    department VARCHAR(50),
    salary DECIMAL(10,2)
);
```

## Explanation

Creates an Employees table with five columns.

Each column stores a different type of information.

---

# Constraints

Constraints define rules for data.

They improve data quality and integrity.

---

## NOT NULL

Ensures a column always contains a value.

```sql
name VARCHAR(100) NOT NULL
```

---

## UNIQUE

Prevents duplicate values.

```sql
email VARCHAR(255) UNIQUE
```

---

## DEFAULT

Automatically inserts a default value.

```sql
status VARCHAR(20) DEFAULT 'Active'
```

---

## CHECK

Restricts values based on a condition.

```sql
salary DECIMAL(10,2)
CHECK (salary > 0)
```

---

## PRIMARY KEY

Uniquely identifies every row.

```sql
employee_id INT PRIMARY KEY
```

Example

| EmployeeID | Name |
|------------|------|
| 1 | John |
| 2 | Alice |
| 3 | David |

Properties

- Must be unique
- Cannot contain NULL
- Only one Primary Key per table

---

## FOREIGN KEY

Creates a relationship between two tables.

Example

Departments

| DepartmentID | Department |
|--------------|------------|
| 1 | IT |
| 2 | HR |

Employees

| EmployeeID | Name | DepartmentID |
|------------|------|--------------|
| 1 | John | 1 |
| 2 | Alice | 2 |

```sql
FOREIGN KEY (department_id)
REFERENCES Departments(department_id)
```

## Explanation

Each employee belongs to an existing department.

The database prevents invalid department references.

---

# Table Relationships

Relational databases connect tables using keys.

---

## One-to-One (1:1)

Example

```
Person
    │
    ▼
Passport
```

One person has one passport.

---

## One-to-Many (1:N)

Example

```
Department
     │
     ├── Employee
     ├── Employee
     ├── Employee
```

One department contains many employees.

Most common relationship.

---

## Many-to-Many (M:N)

Example

```
Students
      │
Enrollment
      │
Courses
```

A student can enrol in many courses.

A course can contain many students.

Requires a junction (bridge) table.

---

# Database Design Example

```
CompanyDB
│
├── Employees
├── Departments
├── Projects
├── Clients
├── Salaries
└── Attendance
```

Relationships

```
Departments
      │
      ├──────────────┐
      ▼              │
Employees            │
      │              │
      ▼              │
Attendance           │
                     │
Projects─────────────┘
```

Good database design avoids duplicate information.

---

# Best Practices

- Use singular or plural table names consistently.
- Use meaningful column names.
- Define proper data types.
- Always create a Primary Key.
- Use Foreign Keys to maintain relationships.
- Avoid storing duplicate information.
- Keep related data in separate tables.

---

# Common Mistakes

❌ Storing everything in one table

❌ Using incorrect data types

❌ Forgetting Primary Keys

❌ Allowing unnecessary NULL values

❌ Duplicating customer information

❌ Naming columns like `column1`, `data`, `temp`

---

# Interview Questions

### What is the difference between a database and a table?

A database is a collection of related tables, while a table stores actual data in rows and columns.

---

### What is a row?

A row represents one complete record.

---

### What is a column?

A column stores one attribute of the data.

---

### Why do we use Primary Keys?

To uniquely identify every record.

---

### Why do we use Foreign Keys?

To establish relationships and maintain referential integrity between tables.

---

# Hands-on Exercises

## Exercise 1

Create a database named:

```
SchoolDB
```

---

## Exercise 2

Create a table named:

```
Students
```

Columns

- StudentID
- Name
- Email
- Phone
- DateOfBirth

---

## Exercise 3

Identify suitable data types for:

- Price
- Age
- Product Name
- Order Date
- IsActive

---

## Exercise 4

Design tables for an online bookstore.

Hint

```
Books
Authors
Customers
Orders
OrderItems
Publishers
```

Try identifying the Primary Keys and Foreign Keys.

---

# Chapter Summary

In this chapter you learned:

- What a database is
- What a table is
- Rows and columns
- SQL data types
- Constraints
- Primary Keys
- Foreign Keys
- Table relationships
- Basic database design principles

These concepts form the foundation of every SQL database.

---

# What's Next?

In **Chapter 03 – DDL (Data Definition Language)**, you'll learn how to create, modify and delete database objects using:

- CREATE
- ALTER
- DROP
- TRUNCATE

You'll also learn how professional database schemas evolve over time without losing data.