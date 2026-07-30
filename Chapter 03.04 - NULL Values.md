---
title: "03.04 - NULL Values"
description: "Learn what NULL means in SQL, how it differs from 0 or an empty string, and how to work with NULL values safely."
chapter: 3
section: 3.4
category: Core SQL Concepts
difficulty: Beginner
readingTime: 15 min
lastUpdated: 2026-07-27
---

# 03.04 NULL Values

## Learning Objectives

After completing this lesson, you will be able to:

- Understand what NULL means
- Differentiate NULL from 0 and empty strings
- Learn why NULL values exist
- Query NULL values correctly
- Use `IS NULL` and `IS NOT NULL`
- Avoid common mistakes when working with NULL

---

# Introduction

One of the most misunderstood concepts in SQL is **NULL**.

Many beginners think NULL means:

- Zero (`0`)
- Blank (`''`)
- Space (`' '`)

This is **incorrect**.

In SQL, **NULL means the value is unknown, missing, unavailable, or not yet assigned.**

---

# What is NULL?

**NULL** represents the **absence of a value**.

It does **not** mean:

- Zero
- Blank text
- False

Instead, it means:

> "There is currently no value stored."

---

# Real-World Example

Imagine a company has just hired a new employee.

| EmployeeID | Name | Email |
|------------|------|--------|
| 101 | John | john@email.com |
| 102 | Alice | alice@email.com |
| 103 | David | NULL |

David hasn't received an official company email yet.

The email isn't blank.

It simply **doesn't exist yet**.

Therefore:

```
Email = NULL
```

---

# Understanding NULL

Think of a school examination.

| Student | Marks |
|----------|-------|
| John | 82 |
| Alice | 91 |
| David | NULL |

Why NULL?

Possible reasons:

- Student absent
- Result pending
- Marks not entered
- Information unavailable

The database does **not guess**.

It stores:

```
NULL
```

---

# NULL vs Zero

Many beginners confuse these.

| Value | Meaning |
|--------|----------|
| NULL | Unknown |
| 0 | Known value |
| 50 | Known value |

Example

Employee Bonus

| Name | Bonus |
|------|-------|
| John | 0 |
| Alice | 5000 |
| David | NULL |

John

```
Bonus = 0

(The company gave no bonus.)
```

David

```
Bonus = NULL

(The bonus hasn't been decided yet.)
```

These are completely different meanings.

---

# NULL vs Empty String

Example

| Customer | Phone |
|----------|--------|
| John | "" |
| Alice | NULL |

Empty String

```
""
```

Means

The value exists but contains no characters.

NULL

Means

The value is unknown or missing.

---

# NULL vs Blank Space

These are also different.

| Value | Meaning |
|--------|----------|
| NULL | Unknown |
| "" | Empty text |
| " " | One space character |

These should never be treated as the same value.

---

# Example Table

## Employees

| EmployeeID | Name | Email | Phone |
|------------|------|--------|--------|
| 101 | John | john@email.com | 9876543210 |
| 102 | Alice | NULL | 9876500000 |
| 103 | David | david@email.com | NULL |
| 104 | Emma | NULL | NULL |

---

# Retrieving All Records

```sql
SELECT *
FROM Employees;
```

## Output

| EmployeeID | Name | Email | Phone |
|------------|------|--------|--------|
|101|John|john@email.com|9876543210|
|102|Alice|NULL|9876500000|
|103|David|david@email.com|NULL|
|104|Emma|NULL|NULL|

---

# Finding NULL Values

To find missing values:

```sql
SELECT *
FROM Employees
WHERE Email IS NULL;
```

## Output

| EmployeeID | Name |
|------------|------|
|102|Alice|
|104|Emma|

### Explanation

`IS NULL` checks whether a column contains NULL.

---

# Finding Available Values

```sql
SELECT *
FROM Employees
WHERE Email IS NOT NULL;
```

## Output

| EmployeeID | Name |
|------------|------|
|101|John|
|103|David|

### Explanation

`IS NOT NULL` returns only rows that contain actual values.

---

# Incorrect Way to Compare NULL

❌ Wrong

```sql
SELECT *
FROM Employees
WHERE Email = NULL;
```

This returns **no rows**.

---

Another incorrect example:

```sql
SELECT *
FROM Employees
WHERE Email <> NULL;
```

Also incorrect.

---

# Correct Way

Always use

```sql
IS NULL
```

or

```sql
IS NOT NULL
```

Correct example

```sql
SELECT *
FROM Employees
WHERE Email IS NULL;
```

---

# Why Can't We Use "="?

NULL represents an unknown value.

Imagine asking:

```
Is an unknown value equal to another unknown value?
```

SQL cannot determine the answer.

Therefore

```sql
NULL = NULL
```

is **not TRUE**.

Instead, SQL uses

```sql
IS NULL
```

---

# NULL in Calculations

Suppose

| Salary | Bonus |
|---------|-------|
|50000|5000|
|60000|NULL|

Query

```sql
SELECT Salary + Bonus
FROM Employees;
```

Result

```
55000

NULL
```

Any arithmetic involving NULL usually returns NULL.

---

# NULL in Aggregate Functions

Example Table

| Salary |
|---------|
|50000|
|60000|
|NULL|
|70000|

```sql
SELECT
COUNT(Salary),
AVG(Salary),
SUM(Salary)
FROM Employees;
```

Result

```
COUNT = 3

AVG = 60000

SUM = 180000
```

Most aggregate functions ignore NULL values.

---

# Common Causes of NULL

NULL values appear when:

- Information is unavailable
- User skipped a field
- Data hasn't arrived yet
- Optional information isn't provided
- Value hasn't been calculated

---

# Business Examples

Hospital

```
Discharge Date

NULL

(Patient still admitted.)
```

---

School

```
Result

NULL

(Result pending.)
```

---

E-commerce

```
Tracking Number

NULL

(Order not shipped.)
```

---

HR

```
Resignation Date

NULL

(Employee still working.)
```

---

# Best Practices

- Use NULL only when appropriate.
- Don't confuse NULL with zero.
- Don't confuse NULL with empty strings.
- Always use `IS NULL`.
- Use `IS NOT NULL` when filtering existing values.
- Decide carefully whether a column should allow NULL values.

---

# Common Mistakes

❌ Using

```sql
= NULL
```

---

❌ Using

```sql
<> NULL
```

---

❌ Treating

```
NULL

0

""
```

as identical values.

---

❌ Forgetting that arithmetic with NULL usually returns NULL.

---

# Interview Questions

### What is NULL?

NULL represents an unknown, missing or unavailable value.

---

### Is NULL equal to zero?

No.

Zero is a valid number.

NULL means no known value exists.

---

### Is NULL equal to an empty string?

No.

An empty string contains zero characters.

NULL represents no value.

---

### How do you find NULL values?

```sql
WHERE column_name IS NULL
```

---

### How do you find non-NULL values?

```sql
WHERE column_name IS NOT NULL
```

---

### Can you compare NULL using "="?

No.

Always use:

```sql
IS NULL

IS NOT NULL
```

---

# 💡 Did You Know?

In SQL, `NULL` is based on **three-valued logic (TRUE, FALSE, UNKNOWN)** rather than normal Boolean logic. This is why expressions like `NULL = NULL` do not evaluate to `TRUE`. You'll explore this behavior further when learning `WHERE`, logical operators, and predicates later in the handbook.

---

# Hands-on Exercises

## Exercise 1

Create a table named:

```
Employees
```

Allow the following columns to accept NULL values:

- Email
- Phone
- DateOfLeaving

---

## Exercise 2

Write a query that returns employees whose phone number is missing.

---

## Exercise 3

Write a query that returns employees who have an email address.

---

## Exercise 4

Given the following values:

```
NULL

0

''

' '
```

Explain the difference between each.

---

## Exercise 5

Predict the output.

```sql
SELECT *
FROM Employees
WHERE Phone = NULL;
```

Why is the result incorrect?

---

# Chapter Summary

In this lesson, you learned:

- What NULL means
- Why NULL exists
- NULL vs Zero
- NULL vs Empty String
- NULL vs Blank Space
- Using `IS NULL`
- Using `IS NOT NULL`
- NULL in calculations
- NULL in aggregate functions
- Best practices for handling missing data

Understanding NULL correctly is essential because almost every real-world database contains missing or unknown information.

---

# What's Next?

In **03.05 – SQL Data Types**, you'll learn how SQL stores numbers, text, dates, times, Boolean values, and other data types, and how choosing the correct data type improves performance, storage efficiency, and data integrity.