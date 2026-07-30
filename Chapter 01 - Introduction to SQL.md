---
title: "Chapter 01 - Introduction to SQL"
description: "Learn what SQL is, why it exists, how databases work, and where SQL is used in real-world applications."
icon: database
order: 1
category: Fundamentals
difficulty: Beginner
readingTime: 12 min
lastUpdated: 2026-07-27
---

# Introduction to SQL

## Learning Objectives

After completing this chapter, you will be able to:

- Understand what SQL is
- Differentiate between a Database and DBMS
- Understand how relational databases store data
- Learn basic SQL terminology
- Know where SQL is used in modern applications
- Write your first SQL query

---

# What is SQL?

**SQL (Structured Query Language)** is the standard language used to communicate with relational databases.

It allows developers to:

- Create databases
- Create tables
- Insert data
- Read data
- Update data
- Delete data
- Manage users and permissions

Think of SQL as the language that allows your application to "talk" with a database.

---

# Why Do We Need SQL?

Imagine a school storing information inside Excel files.

| Student | Class | Marks |
|----------|-------|-------|
| John | 10 | 82 |
| Alice | 10 | 91 |
| David | 9 | 74 |

Now imagine:

- 5 million students
- Thousands of teachers
- Hundreds of schools
- Continuous updates every second

Managing this amount of information using spreadsheets becomes almost impossible.

A relational database solves this problem.

SQL is the language used to manage that database.

---

# What is a Database?

A **Database** is an organized collection of related data.

Examples:

- Student records
- Employee information
- Customer details
- Banking transactions
- Hospital records
- Product catalogues

A database stores information efficiently so it can be searched, updated and managed quickly.

---

# What is DBMS?

A **Database Management System (DBMS)** is software used to create and manage databases.

Examples include:

| DBMS | Company | Type |
|------|----------|------|
| MySQL | Oracle | Relational |
| PostgreSQL | PostgreSQL Global Development Group | Relational |
| Microsoft SQL Server | Microsoft | Relational |
| Oracle Database | Oracle | Relational |
| SQLite | SQLite Consortium | Embedded |
| MariaDB | MariaDB Foundation | Relational |

A DBMS acts as the bridge between your application and your stored data.

---

# What is an RDBMS?

**RDBMS** stands for **Relational Database Management System**.

Instead of storing everything together, an RDBMS stores information inside related tables.

Example:

Students Table

| StudentID | Name |
|-----------|------|
| 1 | John |
| 2 | Alice |

Courses Table

| CourseID | Course |
|-----------|----------|
| 101 | SQL |
| 102 | Python |

Enrollments Table

| StudentID | CourseID |
|-----------|-----------|
| 1 | 101 |
| 2 | 102 |

Each table stores one type of information while relationships connect them together.

---

# Database Terminology

| Term | Meaning |
|------|----------|
| Database | Collection of tables |
| Table | Collection of rows and columns |
| Row | One record |
| Column | One attribute |
| Record | Same as row |
| Field | Individual value inside a row |
| Primary Key | Unique identifier |
| Foreign Key | Links two tables |

---

# Real-World Example

Imagine an online shopping website.

Instead of one huge table, data is separated into multiple tables.

```
Customers
Products
Orders
OrderItems
Payments
Categories
Reviews
```

Relationships connect all these tables.

This design improves performance, scalability and data consistency.

---

# Where is SQL Used?

SQL is used almost everywhere.

- Banking Systems
- E-commerce Websites
- Hospital Management Systems
- School Management Systems
- ERP Software
- HRMS
- Inventory Systems
- Airline Reservation Systems
- Social Media Platforms
- Government Applications

Almost every business application stores its data inside a database.

---

# Popular SQL Databases

| Database | Open Source | Enterprise Support |
|-----------|-------------|--------------------|
| MySQL | ✅ | ✅ |
| PostgreSQL | ✅ | ✅ |
| SQLite | ✅ | ❌ |
| MariaDB | ✅ | ✅ |
| SQL Server | ❌ | ✅ |
| Oracle Database | ❌ | ✅ |

---

# SQL Categories

SQL commands are generally divided into five groups.

| Category | Purpose |
|-----------|----------|
| DDL | Define database structure |
| DML | Insert, Update, Delete data |
| DQL | Retrieve data |
| DCL | Control user permissions |
| TCL | Manage transactions |

These categories will be covered in later chapters.

---

# Your First SQL Query

Suppose we have an Employee table.

| ID | Name | Department | Salary |
|----|------|------------|---------|
| 1 | John | IT | 65000 |
| 2 | Alice | HR | 55000 |
| 3 | David | Sales | 60000 |

Retrieve all employees:

```sql
SELECT *
FROM Employee;
```

## Output

| ID | Name | Department | Salary |
|----|------|------------|---------|
| 1 | John | IT | 65000 |
| 2 | Alice | HR | 55000 |
| 3 | David | Sales | 60000 |

### Explanation

`SELECT` retrieves data from a table.

`*` means "return all columns."

---

# SQL Workflow

A typical SQL workflow looks like this:

```
Application
      │
      ▼
SQL Query
      │
      ▼
Database Server
      │
      ▼
Table
      │
      ▼
Result
```

---

# Advantages of SQL

- Easy to learn
- Standardised language
- Fast data retrieval
- Supports millions of records
- Secure
- Reliable
- Widely supported
- Works across multiple database systems

---

# Common Misconceptions

### SQL is a Programming Language

Not exactly.

SQL is a **query language**, not a general-purpose programming language.

---

### SQL is Only for Backend Developers

Incorrect.

Data Analysts, Data Scientists, Backend Developers, DevOps Engineers, QA Engineers and Database Administrators all use SQL regularly.

---

### SQL is Difficult

SQL syntax is relatively simple.

Most beginners can start writing useful queries within a few hours.

---

# Best Practices

- Write SQL keywords in uppercase.
- Use meaningful table names.
- Use meaningful column names.
- Keep queries readable.
- Add comments where necessary.
- Avoid `SELECT *` in production applications unless required.

---

# Chapter Summary

In this chapter you learned:

- What SQL is
- Why databases are necessary
- Difference between Database and DBMS
- What an RDBMS is
- Common database terminology
- Real-world SQL applications
- SQL command categories
- Your first SQL query

---

# What's Next?

In **Chapter 02**, you'll learn about:

- Database
- Tables
- Rows
- Columns
- Data Types
- Constraints
- Primary Keys
- Foreign Keys
- Relationships

These concepts form the foundation of every SQL database.