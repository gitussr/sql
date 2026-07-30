---
title: "03.03 - Records, Fields & Cells"
description: "Understand the smallest building blocks of a relational database table: records, fields, cells, and values."
chapter: 3
section: 3.3
category: Core SQL Concepts
difficulty: Beginner
readingTime: 12 min
lastUpdated: 2026-07-27
---

# 03.03 Records, Fields & Cells

## Learning Objectives

After completing this lesson, you will be able to:

- Understand what a Record is
- Understand what a Field is
- Understand what a Cell is
- Differentiate between Record, Row, Field, Column and Cell
- Read and interpret tabular data correctly
- Understand how SQL retrieves individual values

---

# Introduction

A relational database stores information in **tables**.

Every table is made up of:

- Rows
- Columns
- Records
- Fields
- Cells

These terms are sometimes used interchangeably, which often confuses beginners.

This lesson explains each term with practical examples.

---

# Building Blocks of a Table

Consider the following table.

## Employees

| EmployeeID | FirstName | Department | Salary |
|------------|-----------|------------|---------|
| 101 | John | IT | 65000 |
| 102 | Alice | HR | 55000 |
| 103 | David | Sales | 60000 |

Every value inside this table belongs to one of these building blocks.

---

# What is a Record?

A **Record** is one complete set of related information.

A record represents one object.

Example

| EmployeeID | FirstName | Department | Salary |
|------------|-----------|------------|---------|
| **101** | **John** | **IT** | **65000** |

This entire row is one record.

---

# Record Example

```
Employee

ID : 101
Name : John
Department : IT
Salary : 65000
```

Everything together forms one record.

---

# Characteristics of a Record

A record:

- Represents one object
- Contains multiple fields
- Occupies one row
- Usually identified by a Primary Key

Examples

```
Employee 101

Employee 102

Employee 103
```

Each employee is one record.

---

# What is a Field?

A **Field** is one individual piece of information within a record.

Example

```
John
```

is a field value.

Likewise,

```
IT

65000

101
```

are also field values.

---

# Field Example

Employee Record

| EmployeeID | FirstName | Department |
|------------|-----------|------------|
| 101 | John | IT |

Fields

```
101

John

IT
```

Each value is a field.

---

# What is a Cell?

A **Cell** is the intersection of one row and one column.

Example

| EmployeeID | FirstName | Department |
|------------|-----------|------------|
| 101 | **John** | IT |

The value

```
John
```

occupies one cell.

Every individual value stored inside a table occupies one cell.

---

# Visual Representation

```
                COLUMN
                   │
                   ▼
            FirstName
                │
                ▼
       ┌────────────────────┐
ROW →  │101│John│IT│65000    │
       └────────────────────┘
            ▲
            │
           CELL
```

---

# Record vs Row

These terms usually mean the same thing.

| Record | Row |
|---------|-----|
| Logical representation | Physical table row |
| One complete object | One horizontal line |

Most database professionals use both terms interchangeably.

---

# Field vs Column

These terms are also commonly interchangeable.

| Field | Column |
|--------|---------|
| Individual value or attribute | Vertical table structure |

Example

Column

```
Department
```

Field value

```
IT
```

---

# Cell vs Field

Many books treat these terms as identical.

However,

| Cell | Field |
|------|---------|
| Physical location inside a table | Information stored within that location |

Example

```
John
```

is stored inside one cell and is also considered a field value.

---

# Complete Breakdown

Consider the following table.

| EmployeeID | FirstName | Department | Salary |
|------------|-----------|------------|---------|
| 101 | John | IT | 65000 |
| 102 | Alice | HR | 55000 |

### Table

```
Employees
```

---

### Rows

```
2
```

---

### Columns

```
4
```

---

### Records

```
2
```

---

### Cells

```
8
```

---

### Example Cell

```
John
```

---

### Example Record

```
101 John IT 65000
```

---

### Example Column

```
Department
```

---

# How SQL Reads Data

Suppose we want all employee names.

```sql
SELECT FirstName
FROM Employees;
```

## Output

| FirstName |
|------------|
| John |
| Alice |
| David |

### Explanation

SQL retrieves values stored in the **FirstName column**.

Each returned value comes from a different record.

---

# Retrieving One Record

```sql
SELECT *
FROM Employees
WHERE EmployeeID = 101;
```

## Output

| EmployeeID | FirstName | Department | Salary |
|------------|-----------|------------|---------|
| 101 | John | IT | 65000 |

### Explanation

Only one record is returned because only one employee has EmployeeID 101.

---

# Retrieving One Field Value

```sql
SELECT Salary
FROM Employees
WHERE EmployeeID = 101;
```

## Output

| Salary |
|---------|
| 65000 |

### Explanation

The query retrieves one field value from one record.

---

# How SQL Processes Tables

```
Table
   │
   ├── Row (Record)
   │      │
   │      ├── Cell
   │      ├── Cell
   │      ├── Cell
   │      └── Cell
   │
   ├── Row (Record)
   │
   └── Row (Record)
```

This hierarchical structure is common to all relational databases.

---

# Why These Terms Matter

Understanding these terms helps you:

- Write accurate SQL queries
- Design better databases
- Understand interview questions
- Communicate with database administrators
- Read technical documentation

---

# Best Practices

- Use "row" when discussing table structure.
- Use "record" when referring to business data.
- Use meaningful field names.
- Keep one value per cell.
- Avoid storing multiple values inside a single field.

---

# Common Mistakes

❌ Confusing rows with columns

❌ Calling an entire table a record

❌ Storing multiple values inside one field

Example

```
Skills

HTML,CSS,JavaScript,PHP
```

Instead, store related values in separate tables when appropriate.

---

# Interview Questions

### What is a record?

A record is one complete set of related information stored in a table.

---

### What is a field?

A field is one individual piece of information within a record.

---

### What is a cell?

A cell is the intersection of one row and one column containing a single value.

---

### Is a row the same as a record?

In relational databases, these terms are generally used interchangeably.

---

### What is the difference between a field and a column?

A column defines the structure of the table, while a field is the actual value stored for a record in that column.

---

# Hands-on Exercises

## Exercise 1

Given the table below:

| StudentID | Name | Course |
|------------|------|---------|
| 1 | Emma | SQL |
| 2 | Liam | Python |

Identify:

- Number of records
- Number of rows
- Number of columns
- Number of cells

---

## Exercise 2

Identify the following:

```
StudentID

Emma

SQL

Student 1
```

Classify each as:

- Record
- Field
- Column
- Cell

---

## Exercise 3

Write a SQL query to retrieve only the **Course** column.

---

## Exercise 4

Write a SQL query to retrieve the complete record for **StudentID = 2**.

---

# Chapter Summary

In this lesson, you learned:

- What a record is
- What a field is
- What a cell is
- Record vs Row
- Field vs Column
- Cell vs Field
- How SQL retrieves records and individual field values
- Why these concepts are important in relational databases

Understanding these terms will make it much easier to read SQL queries, design tables and communicate using standard database terminology.

---

# What's Next?

In **03.04 – NULL Values**, you'll learn how SQL represents missing or unknown information, why `NULL` is different from `0` or an empty string, and how to work with `NULL` safely in queries.