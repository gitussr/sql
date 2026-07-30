---
title: "03.07.01 - Primary Key"
description: "Learn what a Primary Key is, why every table should have one, and how it uniquely identifies each record in a relational database."
chapter: 3
section: 3.7.1
category: Core SQL Concepts
difficulty: Beginner
readingTime: 18 min
lastUpdated: 2026-07-27
---

# 03.07.01 Primary Key

## Learning Objectives

After completing this lesson, you will be able to:

- Understand what a Primary Key is
- Learn why every table needs a Primary Key
- Create a Primary Key while creating a table
- Add a Primary Key to an existing table
- Understand Primary Key characteristics
- Differentiate Primary Key from UNIQUE
- Follow best practices for designing Primary Keys

---

# Introduction

Imagine a school where every student has the same roll number.

```
Student
--------

John

Roll No: 101

Alice

Roll No: 101

David

Roll No: 101
```

How would the school identify the correct student?

It can't.

Every student needs a **unique identifier**.

Databases solve this problem using a **Primary Key**.

---

# What is a Primary Key?

A **Primary Key** is a column (or group of columns) that uniquely identifies every row in a table.

Every row must have a unique Primary Key value.

A Primary Key:

- Cannot contain duplicate values
- Cannot contain NULL values
- Must uniquely identify each record

---

# Real-World Examples

| Entity | Primary Key |
|---------|-------------|
| Student | StudentID |
| Employee | EmployeeID |
| Customer | CustomerID |
| Product | ProductID |
| Order | OrderID |
| Book | ISBN |
| Passport | Passport Number |

These values uniquely identify one specific record.

---

# Visual Representation

```
Employees
──────────────────────────────────────────────
EmployeeID | Name | Department | Salary
──────────────────────────────────────────────
101        | John | IT         | 65000
102        | Alice| HR         | 55000
103        | David| Sales      | 70000
──────────────────────────────────────────────
```

```
EmployeeID

101

102

103
```

Every value is unique.

Therefore,

```
EmployeeID
```

is the Primary Key.

---

# Why Do We Need a Primary Key?

Without a Primary Key

| Name | Department |
|------|------------|
| John | IT |
| John | HR |
| John | Sales |

Suppose we execute:

```sql
UPDATE Employees
SET Department = 'Finance'
WHERE Name = 'John';
```

Which John should SQL update?

Nobody knows.

---

With a Primary Key

| EmployeeID | Name |
|------------|------|
|101|John|
|102|John|
|103|John|

Now SQL can uniquely identify each employee.

```sql
UPDATE Employees
SET Department = 'Finance'
WHERE EmployeeID = 102;
```

Only one row is updated.

---

# Characteristics of a Primary Key

A Primary Key must:

- Be unique
- Never be NULL
- Identify one record only
- Exist only once per table
- Remain stable over time

---

# Creating a Primary Key

```sql
CREATE TABLE Employees
(
    EmployeeID INT PRIMARY KEY,
    FirstName VARCHAR(50),
    Department VARCHAR(50)
);
```

---

## Explanation

The column

```sql
EmployeeID
```

is declared as the Primary Key.

SQL automatically enforces:

- Uniqueness
- NOT NULL

---

# Inserting Valid Data

```sql
INSERT INTO Employees
VALUES
(101,'John','IT'),
(102,'Alice','HR'),
(103,'David','Sales');
```

Result

| EmployeeID | Name | Department |
|------------|------|------------|
|101|John|IT|
|102|Alice|HR|
|103|David|Sales|

---

# Attempting Duplicate Values

```sql
INSERT INTO Employees
VALUES
(101,'Emma','Finance');
```

Result

```
ERROR

Duplicate Primary Key.
```

The database rejects the insertion.

---

# Attempting NULL Values

```sql
INSERT INTO Employees
VALUES
(NULL,'Emma','Finance');
```

Result

```
ERROR

Primary Key cannot contain NULL.
```

---

# Adding a Primary Key Later

Suppose a table already exists.

```sql
CREATE TABLE Employees
(
    EmployeeID INT,
    FirstName VARCHAR(50)
);
```

Later,

```sql
ALTER TABLE Employees
ADD PRIMARY KEY(EmployeeID);
```

The table now has a Primary Key.

---

# Composite Primary Key

Sometimes one column is not enough.

Example

```
StudentID

CourseID
```

Neither column alone is unique.

Together they become unique.

```
StudentID + CourseID
```

Example

```sql
CREATE TABLE Enrollments
(
    StudentID INT,
    CourseID INT,

    PRIMARY KEY
    (
        StudentID,
        CourseID
    )
);
```

This is called a **Composite Primary Key**.

You'll learn more about composite keys in **03.07.05**.

---

# Primary Key vs UNIQUE

| Primary Key | UNIQUE |
|--------------|---------|
| Only one per table | Multiple allowed |
| Cannot contain NULL | May allow NULL (database-dependent) |
| Identifies the record | Prevents duplicates |
| Automatically NOT NULL | NOT NULL must be added separately if required |

---

# Primary Key vs Foreign Key

| Primary Key | Foreign Key |
|--------------|-------------|
| Identifies records | Creates relationships |
| Must be unique | Can contain duplicate values |
| Cannot be NULL | May allow NULL (depending on design) |
| Exists in parent table | Exists in child table |

---

# Real-World Example

## Online Shopping

### Products

| ProductID | Product |
|------------|----------|
|1001|Laptop|
|1002|Mouse|
|1003|Keyboard|

Here,

```
ProductID
```

is the Primary Key.

Every product has exactly one unique ID.

---

# Auto Increment Primary Keys

Many databases automatically generate Primary Key values.

MySQL

```sql
EmployeeID INT AUTO_INCREMENT
PRIMARY KEY
```

PostgreSQL

```sql
EmployeeID SERIAL
PRIMARY KEY
```

SQL Server

```sql
EmployeeID INT IDENTITY(1,1)
PRIMARY KEY
```

This avoids manually generating IDs.

---

# Best Practices

- Every table should have a Primary Key.
- Use numeric IDs whenever possible.
- Keep Primary Keys short.
- Never reuse deleted Primary Key values.
- Avoid changing Primary Key values.
- Use surrogate numeric keys for large systems.

---

# Common Mistakes

❌ Using names as Primary Keys

```
John

Alice

David
```

Names can repeat.

---

❌ Using email addresses as Primary Keys

Email addresses can change.

---

❌ Using phone numbers

People change phone numbers.

---

❌ Updating Primary Key values frequently

This can affect related tables and relationships.

---

# 💡 Did You Know?

A Primary Key automatically creates an **index** in most relational database systems.

This means queries such as:

```sql
SELECT *
FROM Employees
WHERE EmployeeID = 101;
```

are typically much faster than searching non-indexed columns.

Primary Keys improve both **data integrity** and **query performance**.

---

# Database Support

| Database | Primary Key Support |
|-----------|---------------------|
| MySQL | ✅ |
| PostgreSQL | ✅ |
| SQL Server | ✅ |
| Oracle | ✅ |
| SQLite | ✅ |

All major relational database systems support Primary Keys.

---

# Interview Questions

### What is a Primary Key?

A Primary Key uniquely identifies every row in a table.

---

### Can a table have multiple Primary Keys?

No.

A table can have only **one Primary Key**, although that key may consist of multiple columns (Composite Primary Key).

---

### Can a Primary Key contain NULL?

No.

Primary Keys must always contain a value.

---

### Can Primary Keys contain duplicate values?

No.

Every Primary Key value must be unique.

---

### Why is a Primary Key important?

It uniquely identifies records, maintains data integrity, improves indexing, and enables relationships with other tables.

---

### Is a Primary Key automatically indexed?

Yes, in most relational database systems, a Primary Key automatically creates an index to improve query performance.

---

# Quick Reference

| Property              | Primary Key                  |
| --------------------- | ---------------------------- |
| Duplicate Values      | ❌ Not Allowed                |
| NULL Values           | ❌ Not Allowed                |
| Per Table             | One                          |
| Multiple Columns      | ✅ Yes (Composite PK)         |
| Automatically Indexed | ✅ Usually Yes                |
| Purpose               | Uniquely identifies each row |

---

# Hands-on Exercises

## Exercise 1

Create a table named `Students` with the following columns:

- StudentID
- FirstName
- LastName
- Email

Make `StudentID` the Primary Key.

---

## Exercise 2

Insert five valid student records.

Verify that all rows are inserted successfully.

---

## Exercise 3

Attempt to insert:

- A duplicate StudentID
- A NULL StudentID

Observe the database errors.

---

## Exercise 4

Modify an existing table by adding a Primary Key using the `ALTER TABLE` statement.

---

## Exercise 5

Consider the following columns:

- Email
- Mobile Number
- Passport Number
- EmployeeID
- Username

Which would make good Primary Keys? Which would not? Explain your reasoning.

---

# Chapter Summary

In this lesson, you learned:

- What a Primary Key is
- Why every table needs one
- Primary Key characteristics
- Creating and modifying Primary Keys
- Composite Primary Keys (introduction)
- Primary Key vs UNIQUE
- Primary Key vs Foreign Key
- Auto-incrementing Primary Keys
- Best practices and common mistakes

A well-designed Primary Key is the foundation of every relational database. It ensures each record can be uniquely identified, supports relationships between tables, and enables efficient indexing and querying.

---

# What's Next?

In **03.07.02 – Foreign Key**, you'll learn how relational databases connect tables together, enforce referential integrity, and prevent orphaned records using **Foreign Keys**.