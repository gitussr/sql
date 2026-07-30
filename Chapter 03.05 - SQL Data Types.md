---
title: "03.05 - SQL Data Types"
description: "Learn about SQL data types, why they are important, and how to choose the appropriate data type for your database columns."
chapter: 3
section: 3.5
category: Core SQL Concepts
difficulty: Beginner
readingTime: 20 min
lastUpdated: 2026-07-27
---

# 03.05 SQL Data Types

## Learning Objectives

After completing this lesson, you will be able to:

- Understand what SQL data types are
- Learn why data types are important
- Differentiate between numeric, character, date/time and Boolean data types
- Choose the correct data type for a column
- Avoid common mistakes while designing tables
- Understand how data types affect storage and performance

---

# Introduction

Imagine writing a student registration form.

You wouldn't store:

- Student Name as a number
- Salary as text
- Date of Birth as a paragraph

Every piece of information has a **specific type**.

Databases work the same way.

Each column must define **what kind of data it can store**.

This is called a **Data Type**.

---

# What is a Data Type?

A **Data Type** defines the type of values that can be stored in a column.

It tells the database:

- What kind of data is allowed
- How much storage to allocate
- How to validate input
- How to process the data efficiently

Example:

```text
Age          → Number

Name         → Text

JoiningDate  → Date

Salary       → Decimal Number

IsActive     → Boolean
```

---

# Why Are Data Types Important?

Using the correct data type provides several benefits.

- Improves performance
- Saves storage space
- Prevents invalid data
- Makes calculations accurate
- Improves query optimisation
- Maintains data integrity

---

## Example

Suppose the **Age** column stores text.

```
Twenty Five
```

Can SQL calculate the average age?

No.

Instead,

```text
25
```

allows SQL to perform calculations correctly.

---

# Categories of SQL Data Types

Most relational databases classify data types into these categories.

| Category | Purpose |
|-----------|----------|
| Numeric | Numbers |
| Character | Text |
| Date & Time | Dates and Times |
| Boolean | True / False |
| Binary | Images, Files, Documents |
| JSON / XML | Structured Data (Database-dependent) |

---

# Numeric Data Types

Numeric data types store numbers.

---

## INT

Stores whole numbers.

### Example

```sql
Age INT
```

Possible values

```
18

45

100

250
```

### Use Cases

- Employee ID
- Student ID
- Quantity
- Age
- Stock Count

---

## BIGINT

Stores very large integers.

### Example

```sql
Population BIGINT
```

### Use Cases

- Population
- Transaction IDs
- Large counters

---

## DECIMAL

Stores precise decimal numbers.

### Example

```sql
Salary DECIMAL(10,2)
```

Possible values

```
25000.00

15999.95

9999999.99
```

### Explanation

`10`

Total number of digits.

`2`

Digits after the decimal point.

---

## FLOAT

Stores approximate decimal numbers.

### Example

```sql
Temperature FLOAT
```

### Use Cases

- Scientific calculations
- Sensor readings
- GPS coordinates

> Financial data should usually use **DECIMAL** instead of **FLOAT** to avoid rounding errors.

---

# Character Data Types

Character data types store text.

---

## CHAR

Stores **fixed-length** text.

### Example

```sql
CountryCode CHAR(2)
```

Possible values

```
IN

US

GB

AU
```

Even if you store

```
US
```

the database reserves space for exactly two characters.

---

## VARCHAR

Stores **variable-length** text.

### Example

```sql
FirstName VARCHAR(50)
```

Possible values

```
John

Alice

Christopher
```

The database stores only the characters actually entered (subject to the column's maximum length).

---

## TEXT

Stores large amounts of text.

Example

```sql
Description TEXT
```

Use Cases

- Blog Posts
- Product Descriptions
- User Comments
- Documentation

---

# Date & Time Data Types

---

## DATE

Stores calendar dates.

Example

```sql
DateOfBirth DATE
```

Possible values

```
1999-05-18

2026-07-27
```

---

## TIME

Stores only time.

Example

```sql
OfficeStartTime TIME
```

Possible values

```
09:30:00

18:15:00
```

---

## DATETIME

Stores both date and time.

Example

```sql
CreatedAt DATETIME
```

Possible values

```
2026-07-27 10:45:20
```

---

## TIMESTAMP

Stores date and time.

Often used for:

- Record creation
- Updates
- Audit logs
- Tracking changes

Example

```sql
UpdatedAt TIMESTAMP
```

---

# Boolean Data Type

Stores two possible values.

```sql
IsActive BOOLEAN
```

Possible values

```
TRUE

FALSE
```

Examples

```
Employee Active

Course Completed

Email Verified

Payment Successful
```

> Some database systems implement Boolean values differently. For example, MySQL commonly stores them internally as `1` (TRUE) and `0` (FALSE).

---

# Binary Data Types

Stores binary information.

Examples

- Images
- PDF Files
- Videos
- Audio
- Documents

Common data types include:

```
BLOB

BYTEA (PostgreSQL)

VARBINARY
```

---

# JSON Data Type

Modern databases can store JSON directly.

Example

```json
{
  "name":"John",
  "age":25,
  "city":"London"
}
```

Example

```sql
Profile JSON
```

Useful for:

- APIs
- Configuration
- Dynamic attributes

---

# Example Table

## Employees

| Column | Data Type |
|----------|------------|
| EmployeeID | INT |
| FirstName | VARCHAR(50) |
| LastName | VARCHAR(50) |
| Salary | DECIMAL(10,2) |
| JoiningDate | DATE |
| IsActive | BOOLEAN |

---

# Creating a Table

```sql
CREATE TABLE Employees
(
    EmployeeID INT,
    FirstName VARCHAR(50),
    LastName VARCHAR(50),
    Salary DECIMAL(10,2),
    JoiningDate DATE,
    IsActive BOOLEAN
);
```

---

## Explanation

Each column stores a different type of information.

Choosing the correct data type improves efficiency and data quality.

---

# Choosing the Right Data Type

| Data | Recommended Type |
|--------|------------------|
| Age | INT |
| Salary | DECIMAL |
| Name | VARCHAR |
| Country Code | CHAR |
| Birth Date | DATE |
| Login Time | TIME |
| Created At | TIMESTAMP |
| Product Description | TEXT |
| Active Status | BOOLEAN |

---

# Poor Design Example

```sql
Salary VARCHAR(50)
```

Problems

- Cannot perform calculations efficiently
- Sorting becomes unreliable
- Wastes storage

---

Better

```sql
Salary DECIMAL(10,2)
```

---

# Data Types Across Database Systems

| Concept | MySQL | PostgreSQL | SQL Server | Oracle |
|----------|--------|------------|------------|---------|
| Integer | INT | INTEGER | INT | NUMBER |
| Variable Text | VARCHAR | VARCHAR | VARCHAR | VARCHAR2 |
| Boolean | BOOLEAN / TINYINT | BOOLEAN | BIT | No native BOOLEAN in SQL tables* |
| Large Text | TEXT | TEXT | VARCHAR(MAX) | CLOB |

> *Oracle SQL traditionally uses `NUMBER(1)` or similar patterns for Boolean-like values in tables, although PL/SQL supports `BOOLEAN`.

---

# Best Practices

- Choose the smallest suitable data type.
- Use `DECIMAL` for financial values.
- Use `VARCHAR` for variable-length text.
- Store dates using `DATE` or `TIMESTAMP`, not text.
- Use meaningful column names.
- Avoid storing numbers as strings.
- Review storage requirements before creating large tables.

---

# Common Mistakes

❌ Storing numbers inside `VARCHAR`

❌ Using `TEXT` for short names

❌ Using `FLOAT` for money

❌ Storing dates as strings

```
"27 July 2026"
```

Instead

```
2026-07-27
```

---

# 💡 Did You Know?

Choosing the correct data type doesn't just save storage—it can also make queries significantly faster.

For example:

- Searching an `INT` column is generally faster than searching a `VARCHAR` column.
- Indexes built on properly typed columns are smaller and more efficient.
- Poor data type choices can slow down joins, sorting and filtering, especially in databases containing millions of rows.

Professional database designers often spend considerable time selecting the most appropriate data type before creating a table.

---

# Interview Questions

### What is a SQL data type?

A data type defines the kind of values a column can store.

---

### Why are data types important?

They improve storage efficiency, data validation, performance and data integrity.

---

### When should you use VARCHAR instead of CHAR?

Use `VARCHAR` when the length of the text varies.

---

### Why is DECIMAL preferred over FLOAT for money?

Because `DECIMAL` stores exact values, while `FLOAT` may introduce rounding errors.

---

### Which data type should be used for dates?

Use `DATE` or `TIMESTAMP`, depending on whether you need only the date or both the date and time.

---

# Hands-on Exercises

## Exercise 1

Choose suitable data types for the following columns.

```
StudentID

StudentName

CourseFee

DateOfBirth

Email

IsVerified
```

---

## Exercise 2

Create a table named `Products` with the following columns.

- ProductID
- ProductName
- Price
- Stock
- CreatedAt
- IsAvailable

Use appropriate data types for each column.

---

## Exercise 3

Explain why the following designs are poor.

```sql
Age VARCHAR(20)

Salary FLOAT

JoiningDate VARCHAR(100)
```

---

## Exercise 4

For each scenario, recommend the most appropriate data type.

- Mobile Number
- Country Code
- Product Description
- Invoice Amount
- Login Timestamp

---

# Chapter Summary

In this lesson, you learned:

- What SQL data types are
- Why data types are important
- Numeric data types
- Character data types
- Date and time data types
- Boolean data types
- Binary and JSON data types
- How to choose the correct data type
- Common mistakes to avoid

Selecting the right data type is one of the first steps toward building efficient, reliable and scalable databases.

---

# What's Next?

In **03.06 – SQL Constraints**, you'll learn how databases enforce rules to maintain data accuracy and integrity using constraints such as `NOT NULL`, `UNIQUE`, `CHECK`, `DEFAULT`, `PRIMARY KEY`, and `FOREIGN KEY`.