---
title: "03.07.04 - Alternate Key"
description: "Learn what an Alternate Key is, how it differs from a Primary Key and Candidate Key, and why it is important in relational database design."
chapter: 3
section: 3.7.4
category: Core SQL Concepts
difficulty: Beginner
readingTime: 15 min
lastUpdated: 2026-07-27
---

# 03.07.04 Alternate Key

## Learning Objectives

After completing this lesson, you will be able to:

- Understand what an Alternate Key is
- Learn how Alternate Keys are created
- Differentiate Alternate Key from Primary Key
- Differentiate Alternate Key from Candidate Key
- Understand how SQL implements Alternate Keys
- Follow best practices for Alternate Keys

---

# Introduction

Suppose a company stores employee information.

| EmployeeID | NationalID | Email | Name |
|------------|------------|-------|------|
|101|AB12345|john@company.com|John|
|102|CD56789|alice@company.com|Alice|
|103|EF98765|david@company.com|David|

All three columns are unique.

```
EmployeeID

NationalID

Email
```

Only one of them can become the **Primary Key**.

What happens to the remaining unique columns?

They become **Alternate Keys**.

---

# What is an Alternate Key?

An **Alternate Key** is a **Candidate Key that was not selected as the Primary Key**.

It still:

- Uniquely identifies records
- Prevents duplicate values
- Can be used to search records efficiently

However, it is **not the official identifier** of the table.

---

# Simple Definition

```
Candidate Keys

↓

Choose one

↓

Primary Key

↓

Remaining Candidate Keys

↓

Alternate Keys
```

---

# Visual Representation

```
Employees
─────────────────────────────────────────────
EmployeeID
NationalID
Email
FirstName
─────────────────────────────────────────────

Candidate Keys

✓ EmployeeID
✓ NationalID
✓ Email

↓

Primary Key

EmployeeID

↓

Alternate Keys

NationalID
Email
```

---

# Characteristics of an Alternate Key

An Alternate Key:

- Is unique
- Cannot contain duplicate values
- Usually should not contain NULL values
- Was eligible to become the Primary Key
- Is implemented using a `UNIQUE` constraint in SQL

---

# Real-World Example

## Employees

| EmployeeID | PassportNo | Email | Name |
|------------|------------|-------|------|
|101|P123456|john@company.com|John|
|102|P654321|alice@company.com|Alice|
|103|P987654|david@company.com|David|

Possible Candidate Keys

```
EmployeeID

PassportNo

Email
```

Chosen Primary Key

```
EmployeeID
```

Alternate Keys

```
PassportNo

Email
```

---

# SQL Example

```sql
CREATE TABLE Employees
(
    EmployeeID INT PRIMARY KEY,
    PassportNo VARCHAR(20) UNIQUE,
    Email VARCHAR(100) UNIQUE,
    FirstName VARCHAR(50)
);
```

---

## Explanation

`EmployeeID`

- Primary Key

`PassportNo`

- Alternate Key

`Email`

- Alternate Key

The `UNIQUE` constraint ensures that duplicate values cannot be inserted.

---

# Valid Data

| EmployeeID | PassportNo | Email |
|------------|------------|-------|
|101|P123456|john@company.com|
|102|P654321|alice@company.com|
|103|P987654|david@company.com|

All values are unique.

---

# Invalid Data

```sql
INSERT INTO Employees
VALUES
(
104,
'P123456',
'emma@company.com',
'Emma'
);
```

Result

```
ERROR

Duplicate value for UNIQUE column.
```

The database rejects the insertion because `PassportNo` must remain unique.

---

# Alternate Key vs Primary Key

| Alternate Key | Primary Key |
|---------------|-------------|
| More than one allowed | Only one allowed |
| Implemented using `UNIQUE` | Implemented using `PRIMARY KEY` |
| Not the official identifier | Official identifier |
| Usually not referenced by Foreign Keys | Commonly referenced by Foreign Keys |

---

# Alternate Key vs Candidate Key

| Candidate Key | Alternate Key |
|---------------|---------------|
| Before selecting Primary Key | After selecting Primary Key |
| Every possible unique identifier | Candidate Key not chosen |
| Design concept | Practical implementation |

---

# Alternate Key vs UNIQUE Constraint

Many beginners think these are identical.

They are closely related, but not exactly the same.

| Alternate Key | UNIQUE Constraint |
|---------------|-------------------|
| Database design concept | SQL constraint |
| Represents an unselected Candidate Key | Enforces uniqueness in SQL |

In practice, an Alternate Key is usually implemented using a `UNIQUE` constraint.

---

# Business Example

## Banking System

Possible unique columns

```
AccountNumber

NationalID

DebitCardNumber

Email
```

Primary Key

```
CustomerID
```

Alternate Keys

```
AccountNumber

NationalID

DebitCardNumber

Email
```

All remain unique because duplicate values would cause business problems.

---

# Why Use Alternate Keys?

Alternate Keys help to:

- Prevent duplicate business data
- Protect unique business identifiers
- Improve data quality
- Support efficient searching
- Enforce business rules

Example

Two customers should never have the same:

- Passport Number
- National ID
- Aadhaar Number
- GST Number
- Company Registration Number

---

# Best Practices

- Choose a stable Primary Key.
- Implement remaining Candidate Keys with `UNIQUE`.
- Use Alternate Keys for business identifiers.
- Keep Alternate Keys meaningful.
- Avoid using frequently changing values as Alternate Keys.

---

# Common Mistakes

❌ Assuming every `UNIQUE` column is automatically an Alternate Key

A table may contain `UNIQUE` columns added for business rules that were never considered Candidate Keys during database design.

---

❌ Using email addresses as the Primary Key

Emails can change.

Use them as Alternate Keys instead.

---

❌ Forgetting to enforce uniqueness

Business identifiers should remain unique.

---

# 💡 Did You Know?

Many enterprise applications use **Surrogate Keys** (such as `CustomerID`) as the Primary Key while storing business identifiers (such as Passport Number, Email, Employee Code or Tax Number) as Alternate Keys.

This approach provides two major benefits:

- The Primary Key remains stable even if business information changes.
- Business identifiers are still protected against duplicates.

This design is common in banking, healthcare, ERP, HRMS and e-commerce systems.

---

# Quick Reference

| Property | Alternate Key |
|-----------|---------------|
| Unique | ✅ Yes |
| Duplicate Values | ❌ Not Allowed |
| NULL Values | Usually ❌ (recommended) |
| Number per Table | Multiple |
| Official Identifier | ❌ No |
| Can Become Primary Key | Already eligible, but not selected |
| SQL Implementation | `UNIQUE` |

---

# Database Support

Alternate Keys are a **database design concept**.

They are implemented using the `UNIQUE` constraint in all major relational databases.

| Database | Supported |
|-----------|-----------|
| MySQL | ✅ |
| PostgreSQL | ✅ |
| SQL Server | ✅ |
| Oracle | ✅ |
| SQLite | ✅ |

---

# Interview Questions

### What is an Alternate Key?

An Alternate Key is a Candidate Key that was not selected as the Primary Key.

---

### Can a table have multiple Alternate Keys?

Yes.

A table may have several Alternate Keys.

---

### Can an Alternate Key contain duplicate values?

No.

Alternate Keys must remain unique.

---

### Is an Alternate Key implemented using a SQL keyword?

There is no `ALTERNATE KEY` keyword in SQL.

It is typically implemented using a `UNIQUE` constraint.

---

### What is the difference between Candidate Key and Alternate Key?

A Candidate Key is any possible unique identifier before choosing the Primary Key.

An Alternate Key is a Candidate Key that was not selected.

---

### Why are Alternate Keys important?

They enforce uniqueness for important business identifiers such as passport numbers, email addresses and account numbers.

---

# Hands-on Exercises

## Exercise 1

Given the following table, identify:

- Candidate Keys
- Primary Key
- Alternate Keys

| StudentID | RollNo | Email | Name |
|------------|--------|-------|------|
|1001|CSE001|john@college.edu|John|
|1002|CSE002|alice@college.edu|Alice|

---

## Exercise 2

Create an `Employees` table with:

- EmployeeID (Primary Key)
- Email (Alternate Key)
- PassportNo (Alternate Key)

Use appropriate SQL constraints.

---

## Exercise 3

Insert duplicate email addresses.

Observe the database error.

---

## Exercise 4

Explain why the following columns make good Alternate Keys.

- Passport Number
- PAN Number
- Aadhaar Number
- GST Number
- Company Registration Number

---

## Exercise 5

Explain why the following are usually poor Alternate Keys.

- Name
- City
- Department
- Gender

---

# Chapter Summary

In this lesson, you learned:

- What an Alternate Key is
- How Alternate Keys are created
- Alternate Key characteristics
- Alternate Key vs Primary Key
- Alternate Key vs Candidate Key
- Alternate Key vs `UNIQUE`
- Best practices
- Common mistakes

Alternate Keys ensure that important business identifiers remain unique even though they are not used as the table's Primary Key. They play a significant role in maintaining data quality and enforcing business rules.

---

# Related Topics

### Previous Lessons

- **03.06** — SQL Constraints
- **03.07.01** — Primary Key
- **03.07.02** — Foreign Key
- **03.07.03** — Candidate Key

### Next Lessons

- **03.07.05** — Composite Key
- **03.07.06** — Super Key
- **03.07.07** — Surrogate Key
- **03.07.08** — Natural Key

### Recommended Reading

- `UNIQUE` Constraint
- Entity-Relationship (ER) Diagrams
- Database Normalization
- Database Design Best Practices

---

# What's Next?

In **03.07.05 – Composite Key**, you'll learn how multiple columns can work together to uniquely identify a record, when Composite Keys are necessary, and when using a Surrogate Key may be a better design choice.