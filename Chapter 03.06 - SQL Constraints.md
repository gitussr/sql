---
title: "03.06 - SQL Constraints"
description: "Learn how SQL Constraints enforce business rules, maintain data integrity, and prevent invalid data from entering your database."
chapter: 3
section: 3.6
category: Core SQL Concepts
difficulty: Beginner
readingTime: 22 min
lastUpdated: 2026-07-27
---

# 03.06 SQL Constraints

## Learning Objectives

After completing this lesson, you will be able to:

- Understand what SQL Constraints are
- Learn why constraints are important
- Identify different types of constraints
- Apply constraints while creating tables
- Modify constraints on existing tables
- Understand real-world use cases
- Avoid common database design mistakes

---

# Introduction

Imagine a company employee database.

What would happen if someone entered:

```
Age = -15

Salary = -5000

Email = Duplicate

EmployeeID = NULL
```

Technically, the database could store these values unless rules are enforced.

These rules are called **Constraints**.

Constraints help maintain **Data Integrity**, ensuring only valid data is stored.

---

# What is a Constraint?

A **Constraint** is a rule applied to one or more columns that restricts the type of data that can be stored.

Constraints ensure that:

- Data is accurate
- Data is valid
- Duplicate values are prevented
- Relationships remain consistent
- Business rules are enforced automatically

---

# Why Do We Need Constraints?

Without constraints:

| EmployeeID | Name | Salary |
|------------|------|---------|
| NULL | John | -5000 |
| 101 | Alice | 55000 |
| 101 | David | 70000 |

Problems:

- Duplicate Employee IDs
- Negative Salary
- Missing Employee ID

The database contains inconsistent data.

---

With constraints:

| EmployeeID | Name | Salary |
|------------|------|---------|
|101|John|65000|
|102|Alice|55000|
|103|David|70000|

Every record follows the rules.

---

# Types of SQL Constraints

The most common SQL constraints are:

| Constraint | Purpose |
|------------|----------|
| NOT NULL | Prevents NULL values |
| UNIQUE | Prevents duplicate values |
| PRIMARY KEY | Unique identifier for each row |
| FOREIGN KEY | Maintains relationships between tables |
| CHECK | Validates values using conditions |
| DEFAULT | Assigns a default value automatically |

---

# 1. NOT NULL Constraint

## What is NOT NULL?

A **NOT NULL** constraint ensures that a column must always contain a value.

---

### Example

```sql
CREATE TABLE Employees
(
    EmployeeID INT,
    FirstName VARCHAR(50) NOT NULL
);
```

---

### Valid Data

| EmployeeID | FirstName |
|------------|-----------|
|101|John|
|102|Alice|

---

### Invalid Data

| EmployeeID | FirstName |
|------------|-----------|
|103|NULL|

The database rejects the insertion.

---

### Explanation

Every employee must have a name.

A missing name makes the record incomplete.

---

# 2. UNIQUE Constraint

## What is UNIQUE?

The **UNIQUE** constraint prevents duplicate values.

---

### Example

```sql
CREATE TABLE Employees
(
    EmployeeID INT,
    Email VARCHAR(100) UNIQUE
);
```

---

### Valid Data

| EmployeeID | Email |
|------------|-----------------------|
|101|john@email.com|
|102|alice@email.com|

---

### Invalid Data

| EmployeeID | Email |
|------------|-----------------------|
|103|john@email.com|

Duplicate email addresses are not allowed.

---

### Explanation

Every employee must have a unique email address.

---

# 3. PRIMARY KEY Constraint

## What is PRIMARY KEY?

A **Primary Key** uniquely identifies every row in a table.

It combines two rules:

- NOT NULL
- UNIQUE

---

### Example

```sql
CREATE TABLE Employees
(
    EmployeeID INT PRIMARY KEY,
    FirstName VARCHAR(50)
);
```

---

### Valid Data

| EmployeeID | Name |
|------------|------|
|101|John|
|102|Alice|

---

### Invalid Data

Duplicate ID

| EmployeeID | Name |
|------------|------|
|101|David|

---

NULL ID

| EmployeeID | Name |
|------------|------|
|NULL|David|

Both insertions fail.

---

### Characteristics

A Primary Key:

- Must be unique
- Cannot contain NULL
- One Primary Key per table
- Can contain one or multiple columns (Composite Key)

---

# 4. FOREIGN KEY Constraint

## What is FOREIGN KEY?

A **Foreign Key** creates a relationship between two tables.

---

Departments

| DepartmentID | Department |
|--------------|------------|
|1|IT|
|2|HR|

---

Employees

| EmployeeID | Name | DepartmentID |
|------------|------|--------------|
|101|John|1|
|102|Alice|2|

---

### Example

```sql
CREATE TABLE Employees
(
    EmployeeID INT PRIMARY KEY,
    DepartmentID INT,
    FOREIGN KEY (DepartmentID)
    REFERENCES Departments(DepartmentID)
);
```

---

### Explanation

An employee can only belong to an existing department.

If Department 5 does not exist, SQL rejects the insertion.

---

# 5. CHECK Constraint

## What is CHECK?

A **CHECK** constraint validates data before storing it.

---

### Example

```sql
CREATE TABLE Employees
(
    Salary DECIMAL(10,2)
    CHECK (Salary > 0)
);
```

---

### Valid Values

```
45000

60000

120000
```

---

### Invalid Values

```
-500

-10000
```

SQL rejects invalid values.

---

### More Examples

Age

```sql
CHECK (Age >= 18)
```

Rating

```sql
CHECK (Rating BETWEEN 1 AND 5)
```

Percentage

```sql
CHECK (Marks <= 100)
```

---

# 6. DEFAULT Constraint

## What is DEFAULT?

A **DEFAULT** constraint automatically inserts a value when none is provided.

---

### Example

```sql
CREATE TABLE Employees
(
    Status VARCHAR(20)
    DEFAULT 'Active'
);
```

---

### Insert

```sql
INSERT INTO Employees
(Name)
VALUES
('John');
```

---

### Result

| Name | Status |
|------|--------|
|John|Active|

---

### Explanation

Since no Status was supplied, SQL automatically inserted the default value.

---

# Using Multiple Constraints

Real-world tables often combine multiple constraints.

```sql
CREATE TABLE Employees
(
    EmployeeID INT PRIMARY KEY,
    FirstName VARCHAR(50) NOT NULL,
    Email VARCHAR(100) UNIQUE,
    Salary DECIMAL(10,2)
        CHECK (Salary > 0),
    Status VARCHAR(20)
        DEFAULT 'Active'
);
```

---

## Explanation

This table ensures:

- Every employee has a unique ID.
- Names cannot be empty.
- Email addresses cannot be duplicated.
- Salary must be greater than zero.
- Status defaults to "Active."

---

# Constraint Summary

| Constraint | Prevents |
|------------|----------|
| NOT NULL | Missing values |
| UNIQUE | Duplicate values |
| PRIMARY KEY | Duplicate and NULL identifiers |
| FOREIGN KEY | Invalid relationships |
| CHECK | Invalid business rules |
| DEFAULT | Missing optional values |

---

# Real-World Example

## Banking System

| Column | Constraint |
|---------|------------|
| AccountNumber | PRIMARY KEY |
| CustomerName | NOT NULL |
| Balance | CHECK (Balance >= 0) |
| Email | UNIQUE |
| Status | DEFAULT 'Active' |

These constraints ensure that account information remains accurate and consistent.

---

# Constraint Violation Example

```sql
INSERT INTO Employees
VALUES
(101, NULL, 'john@email.com', -5000);
```

Problems:

- Name violates `NOT NULL`
- Salary violates `CHECK`

The database rejects the row.

---

# Best Practices

- Always define a Primary Key.
- Use NOT NULL for mandatory information.
- Use UNIQUE for emails and usernames.
- Validate business rules with CHECK.
- Use DEFAULT for predictable values.
- Use FOREIGN KEY to maintain relationships.
- Define constraints during table creation whenever possible.

---

# Common Mistakes

❌ Creating tables without Primary Keys

❌ Allowing duplicate email addresses

❌ Allowing negative salaries

❌ Using application code instead of database constraints for validation

❌ Forgetting Foreign Keys between related tables

---

# 💡 Did You Know?

Constraints are enforced **by the database itself**, not by your application.

Even if data is inserted using:

- PHP
- Python
- Java
- Node.js
- Excel Import
- Database Management Tools

the database still validates every constraint before accepting the data.

This makes constraints one of the most reliable ways to protect data integrity.

---

# Database Support

Most SQL databases support these core constraints.

| Constraint | MySQL | PostgreSQL | SQL Server | Oracle |
|------------|--------|------------|------------|---------|
| NOT NULL | ✅ | ✅ | ✅ | ✅ |
| UNIQUE | ✅ | ✅ | ✅ | ✅ |
| PRIMARY KEY | ✅ | ✅ | ✅ | ✅ |
| FOREIGN KEY | ✅ | ✅ | ✅ | ✅ |
| CHECK | ✅* | ✅ | ✅ | ✅ |
| DEFAULT | ✅ | ✅ | ✅ | ✅ |

> **Note:** Modern versions of MySQL enforce `CHECK` constraints. Older versions parsed them but did not enforce them.

---

# Interview Questions

### What is a SQL Constraint?

A constraint is a rule that controls what data can be stored in a table.

---

### Why are constraints important?

They improve data integrity, prevent invalid data, and enforce business rules.

---

### Which constraint uniquely identifies a row?

`PRIMARY KEY`

---

### Which constraint prevents duplicate values?

`UNIQUE`

---

### Which constraint prevents NULL values?

`NOT NULL`

---

### Which constraint validates custom business rules?

`CHECK`

---

### Which constraint automatically inserts a value?

`DEFAULT`

---

### Which constraint creates relationships between tables?

`FOREIGN KEY`

---

# Hands-on Exercises

## Exercise 1

Create an `Employees` table with the following constraints:

- EmployeeID → PRIMARY KEY
- FirstName → NOT NULL
- Email → UNIQUE
- Salary → CHECK (Salary > 0)
- Status → DEFAULT 'Active'

---

## Exercise 2

Insert valid records into the table.

Verify that all rows are inserted successfully.

---

## Exercise 3

Try inserting:

- Duplicate EmployeeID
- Duplicate Email
- NULL FirstName
- Negative Salary

Observe which constraints reject the data.

---

## Exercise 4

Design constraints for the following tables:

- Customers
- Products
- Orders
- Students
- Library Books

Explain why each constraint is needed.

---

# Chapter Summary

In this lesson, you learned:

- What SQL Constraints are
- Why constraints are important
- NOT NULL
- UNIQUE
- PRIMARY KEY
- FOREIGN KEY
- CHECK
- DEFAULT
- Real-world business rules
- Constraint best practices

Constraints form the foundation of reliable database design by ensuring that only valid and consistent data is stored.

---

# What's Next?

In **03.07 – Keys in SQL**, you'll explore database keys in depth, including:

- Primary Key
- Foreign Key
- Candidate Key
- Alternate Key
- Composite Key
- Super Key
- Natural Key
- Surrogate Key

You'll learn how these keys uniquely identify records and connect related tables in relational database systems.