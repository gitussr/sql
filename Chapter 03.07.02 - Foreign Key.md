---
title: "03.07.02 - Foreign Key"
description: "Learn how Foreign Keys create relationships between tables, enforce referential integrity, and maintain consistent data in relational databases."
chapter: 3
section: 3.7.2
category: Core SQL Concepts
difficulty: Beginner
readingTime: 22 min
lastUpdated: 2026-07-27
---

# 03.07.02 Foreign Key

## Learning Objectives

After completing this lesson, you will be able to:

- Understand what a Foreign Key is
- Learn why Foreign Keys are important
- Understand Parent and Child tables
- Create Foreign Keys while creating tables
- Add Foreign Keys to existing tables
- Understand Referential Integrity
- Learn common Foreign Key actions
- Follow best practices for designing relationships

---

# Introduction

Imagine a company where every employee belongs to a department.

Departments

| DepartmentID | Department |
|--------------|------------|
| 1 | IT |
| 2 | HR |
| 3 | Finance |

Employees

| EmployeeID | Name | DepartmentID |
|------------|------|--------------|
|101|John|1|
|102|Alice|2|
|103|David|5|

Does **DepartmentID = 5** exist?

No.

The employee is assigned to a department that doesn't exist.

This creates **invalid data**.

Relational databases prevent this problem using a **Foreign Key**.

---

# What is a Foreign Key?

A **Foreign Key** is a column (or group of columns) that references the **Primary Key** of another table.

It creates a relationship between two tables.

A Foreign Key ensures that a value in the child table already exists in the parent table.

---

# Parent Table vs Child Table

A Foreign Key always connects two tables.

### Parent Table

Contains the **Primary Key**.

```
Departments
```

### Child Table

Contains the **Foreign Key**.

```
Employees
```

Relationship

```
Departments
      │
      │ Primary Key
      ▼
DepartmentID
      ▲
      │ Foreign Key
      │
Employees
```

---

# Real-World Examples

| Parent Table | Child Table | Foreign Key |
|---------------|-------------|-------------|
| Customers | Orders | CustomerID |
| Departments | Employees | DepartmentID |
| Categories | Products | CategoryID |
| Students | Enrollments | StudentID |
| Orders | OrderItems | OrderID |

---

# Why Do We Need Foreign Keys?

Without Foreign Keys

Employees

| EmployeeID | Name | DepartmentID |
|------------|------|--------------|
|101|John|1|
|102|Alice|2|
|103|David|99|

Department **99** doesn't exist.

The database becomes inconsistent.

---

With a Foreign Key

The database checks whether DepartmentID **99** exists.

If it doesn't,

```
Insertion Failed
```

Invalid data is rejected automatically.

---

# Visual Representation

```
Departments
────────────────────────
DepartmentID (PK)
DepartmentName
────────────────────────
1   IT
2   HR
3   Finance
────────────────────────
          ▲
          │
          │
Employees
────────────────────────
EmployeeID
Name
DepartmentID (FK)
────────────────────────
101 John 1
102 Alice 2
103 David 3
────────────────────────
```

---

# Creating Related Tables

## Parent Table

```sql
CREATE TABLE Departments
(
    DepartmentID INT PRIMARY KEY,
    DepartmentName VARCHAR(50)
);
```

---

## Child Table

```sql
CREATE TABLE Employees
(
    EmployeeID INT PRIMARY KEY,
    FirstName VARCHAR(50),
    DepartmentID INT,

    FOREIGN KEY (DepartmentID)
    REFERENCES Departments(DepartmentID)
);
```

---

## Explanation

This statement means:

- `DepartmentID` in the Employees table must match an existing `DepartmentID` in the Departments table.
- Invalid department references are rejected.

---

# Inserting Parent Records

```sql
INSERT INTO Departments
VALUES
(1,'IT'),
(2,'HR'),
(3,'Finance');
```

---

# Valid Child Records

```sql
INSERT INTO Employees
VALUES
(101,'John',1),
(102,'Alice',2);
```

Result

| EmployeeID | Name | DepartmentID |
|------------|------|--------------|
|101|John|1|
|102|Alice|2|

Both rows are inserted successfully.

---

# Invalid Child Record

```sql
INSERT INTO Employees
VALUES
(103,'David',5);
```

Result

```
ERROR

Foreign Key constraint violated.
```

Department **5** does not exist.

---

# Referential Integrity

A Foreign Key enforces **Referential Integrity**.

This means:

Every Foreign Key value must reference an existing Primary Key value.

Without Referential Integrity

```
Employee

DepartmentID = 99
```

Problem

No matching department exists.

---

With Referential Integrity

Only valid department IDs can be stored.

---

# Primary Key vs Foreign Key

| Primary Key | Foreign Key |
|--------------|-------------|
| Uniquely identifies a row | References another table |
| Must be unique | Duplicates are allowed |
| Cannot be NULL* | May allow NULL (optional relationship) |
| One per table | Multiple Foreign Keys allowed |

> *A Primary Key cannot contain `NULL`.

---

# One-to-Many Relationship

One department can have many employees.

```
IT
 │
 ├── John
 ├── Alice
 ├── Emma
 └── David
```

Relationship

```
One Department

↓

Many Employees
```

This is the most common database relationship.

---

# Foreign Key Actions

When a parent record is updated or deleted, databases can perform different actions.

| Action | Description |
|---------|-------------|
| RESTRICT | Prevent the operation if child records exist |
| CASCADE | Apply the change to related child rows |
| SET NULL | Set the Foreign Key to NULL |
| SET DEFAULT | Set the Foreign Key to its default value |
| NO ACTION | Check constraints at the end of the statement (database-dependent) |

---

## Example: ON DELETE CASCADE

```sql
FOREIGN KEY (DepartmentID)
REFERENCES Departments(DepartmentID)
ON DELETE CASCADE;
```

If a department is deleted,

its related employee records are also deleted automatically.

---

## Example: ON DELETE SET NULL

```sql
FOREIGN KEY (DepartmentID)
REFERENCES Departments(DepartmentID)
ON DELETE SET NULL;
```

If a department is deleted,

the employee's `DepartmentID` becomes `NULL`.

---

# Adding a Foreign Key Later

Suppose the table already exists.

```sql
ALTER TABLE Employees
ADD CONSTRAINT FK_Department
FOREIGN KEY (DepartmentID)
REFERENCES Departments(DepartmentID);
```

This adds a Foreign Key after table creation.

---

# Multiple Foreign Keys

A table can contain more than one Foreign Key.

Example

```
Orders

CustomerID

EmployeeID

ShippingAddressID
```

Each column references a different parent table.

---

# Real-World Example

## E-Commerce

### Customers

| CustomerID | Customer |
|------------|----------|
|1|John|
|2|Alice|

---

### Orders

| OrderID | CustomerID |
|----------|------------|
|1001|1|
|1002|2|

`CustomerID` in **Orders** is a Foreign Key.

It links each order to its customer.

---

# Best Practices

- Create a Primary Key before creating a Foreign Key.
- Use meaningful column names.
- Index Foreign Key columns when appropriate for performance.
- Avoid unnecessary cascading deletes.
- Keep relationships simple and well documented.
- Enforce relationships in the database, not only in application code.

---

# Common Mistakes

❌ Referencing a column that is not a Primary Key or UNIQUE key

❌ Inserting child records before parent records

❌ Deleting parent rows without considering child records

❌ Forgetting to define Foreign Keys

❌ Using mismatched data types between related columns

---

# 💡 Did You Know?

A Foreign Key **does not automatically create an index** in every database system.

For example:

- PostgreSQL does **not** automatically index Foreign Keys.
- MySQL's InnoDB storage engine often creates supporting indexes if needed.

For large databases, indexing Foreign Key columns can significantly improve the performance of joins and delete/update operations.

---

# Quick Reference

| Property | Foreign Key |
|-----------|-------------|
| Purpose | Links two tables |
| Duplicate Values | ✅ Allowed |
| NULL Values | ✅ Allowed (optional) |
| References | Primary Key or UNIQUE Key |
| Per Table | Multiple Allowed |
| Creates Relationships | ✅ Yes |
| Enforces Referential Integrity | ✅ Yes |
| Automatically Indexed | Database-dependent |

---

# Database Support

| Database | Foreign Key Support |
|-----------|---------------------|
| MySQL | ✅ |
| PostgreSQL | ✅ |
| SQL Server | ✅ |
| Oracle | ✅ |
| SQLite | ✅ |

---

# Interview Questions

### What is a Foreign Key?

A Foreign Key is a column that references the Primary Key (or UNIQUE key) of another table to establish a relationship.

---

### Why are Foreign Keys important?

They maintain referential integrity and prevent invalid relationships between tables.

---

### Can a Foreign Key contain duplicate values?

Yes.

Many child records can reference the same parent record.

---

### Can a table have multiple Foreign Keys?

Yes.

A table can reference multiple parent tables.

---

### Can a Foreign Key contain NULL?

Yes.

If the relationship is optional and the column allows `NULL`.

---

### What is Referential Integrity?

Referential Integrity ensures that every Foreign Key value refers to an existing record in the parent table.

---

### What is the difference between a Primary Key and a Foreign Key?

A Primary Key uniquely identifies a record in its own table.

A Foreign Key references a record in another table.

---

# Hands-on Exercises

## Exercise 1

Create two tables:

- Departments
- Employees

Create a Foreign Key relationship between them.

---

## Exercise 2

Insert valid department records.

Then insert employees that reference those departments.

---

## Exercise 3

Attempt to insert an employee with a non-existent `DepartmentID`.

Observe the error returned by your database.

---

## Exercise 4

Create a `Customers` and `Orders` database design.

Identify:

- Primary Key
- Foreign Key
- Parent Table
- Child Table

---

## Exercise 5

Research the following actions and explain when each should be used.

- CASCADE
- RESTRICT
- SET NULL
- NO ACTION

---

# Chapter Summary

In this lesson, you learned:

- What a Foreign Key is
- Parent and Child tables
- Referential Integrity
- Creating Foreign Keys
- Adding Foreign Keys to existing tables
- One-to-Many relationships
- Foreign Key actions
- Best practices and common mistakes

Foreign Keys are one of the defining features of relational databases. They ensure that related data remains accurate, consistent, and connected across multiple tables.

---

# What's Next?

In **03.07.03 – Candidate Key**, you'll learn how database designers identify all possible unique keys in a table, why only one becomes the Primary Key, and how the remaining keys are classified as Candidate Keys.