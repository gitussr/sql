---
title: "03.07.03 - Candidate Key"
description: "Learn what a Candidate Key is, how it differs from a Primary Key, and how database designers choose the best key to uniquely identify records."
chapter: 3
section: 3.7.3
category: Core SQL Concepts
difficulty: Beginner
readingTime: 18 min
lastUpdated: 2026-07-27
---

# 03.07.03 Candidate Key

## Learning Objectives

After completing this lesson, you will be able to:

- Understand what a Candidate Key is
- Learn why a table can have multiple Candidate Keys
- Differentiate Candidate Key from Primary Key
- Understand uniqueness and minimality
- Identify Candidate Keys in a table
- Follow best practices when selecting a Primary Key

---

# Introduction

Imagine a university student database.

| StudentID | RollNo | Email | Name |
|------------|--------|-------|------|
|1001|CSE001|john@college.edu|John|
|1002|CSE002|alice@college.edu|Alice|
|1003|CSE003|david@college.edu|David|

Which column uniquely identifies each student?

- StudentID ✅
- RollNo ✅
- Email ✅

All three columns uniquely identify a student.

However, a table can have only **one Primary Key**.

So what are the remaining unique columns called?

They are called **Candidate Keys**.

---

# What is a Candidate Key?

A **Candidate Key** is a column (or combination of columns) that can uniquely identify every row in a table.

Every Candidate Key satisfies two conditions:

- It is **unique**
- It is **minimal**

Any Candidate Key is eligible to become the Primary Key.

---

# Understanding "Candidate"

Think of a job interview.

```
10 Candidates

↓

Only 1 Selected
```

Similarly,

```
Multiple Candidate Keys

↓

One chosen as Primary Key
```

The remaining Candidate Keys remain unique but are not selected.

---

# Characteristics of a Candidate Key

A Candidate Key:

- Uniquely identifies every record
- Cannot contain duplicate values
- Cannot contain NULL values
- Contains the minimum number of columns required
- Can be selected as the Primary Key

---

# Real-World Example

## Employees

| EmployeeID | NationalID | Email | Name |
|------------|------------|-------|------|
|101|AB12345|john@company.com|John|
|102|CD45678|alice@company.com|Alice|
|103|EF78901|david@company.com|David|

Possible Candidate Keys:

```
EmployeeID

NationalID

Email
```

Each uniquely identifies an employee.

---

# Visual Representation

```
Employees
───────────────────────────────────────────────
EmployeeID
NationalID
Email
Name
Department
───────────────────────────────────────────────

Candidate Keys

✓ EmployeeID

✓ NationalID

✓ Email
```

One of these becomes the Primary Key.

---

# Choosing the Primary Key

Suppose we select:

```
EmployeeID
```

Then

| Column | Role |
|---------|------|
|EmployeeID|Primary Key|
|NationalID|Candidate Key|
|Email|Candidate Key|

The remaining Candidate Keys still uniquely identify records.

---

# Candidate Key Rules

To qualify as a Candidate Key, a column must:

### Be Unique

Example

| EmployeeID |
|------------|
|101|
|102|
|103|

No duplicates exist.

---

### Be Minimal

Example

```
EmployeeID + Email
```

This combination is unique.

But

```
EmployeeID
```

alone is already unique.

Therefore,

```
EmployeeID + Email
```

is **not** a Candidate Key because it contains unnecessary columns.

---

# SQL Example

```sql
CREATE TABLE Employees
(
    EmployeeID INT PRIMARY KEY,
    NationalID VARCHAR(20) UNIQUE,
    Email VARCHAR(100) UNIQUE,
    FirstName VARCHAR(50)
);
```

---

## Explanation

The table contains three unique columns.

```
EmployeeID

NationalID

Email
```

Each qualifies as a Candidate Key.

Only `EmployeeID` is chosen as the Primary Key.

---

# Candidate Key vs Primary Key

| Candidate Key | Primary Key |
|---------------|-------------|
| Multiple allowed | Only one per table |
| Unique | Unique |
| Cannot contain NULL | Cannot contain NULL |
| May or may not be selected | Selected from Candidate Keys |
| Eligible to become Primary Key | Official identifier |

---

# Candidate Key vs Super Key

| Candidate Key | Super Key |
|---------------|-----------|
| Minimal | May contain extra columns |
| No unnecessary attributes | May include unnecessary attributes |
| Smallest unique identifier | Any unique identifier |

Example

```
EmployeeID
```

Candidate Key

```
EmployeeID + Name
```

Super Key

Because `Name` is unnecessary.

---

# Candidate Key vs Alternate Key

| Candidate Key | Alternate Key |
|---------------|---------------|
| Before selecting the Primary Key | After selecting the Primary Key |
| All possible choices | Remaining Candidate Keys |

Example

Before selection

```
EmployeeID

Email

NationalID
```

After selecting

```
Primary Key

↓

EmployeeID
```

Remaining

```
Email

NationalID
```

These become **Alternate Keys**.

---

# Real-World Example

## Passport Office

Possible unique identifiers

- Passport Number
- National ID
- Driving Licence Number

All qualify as Candidate Keys.

The system chooses one as the Primary Key.

---

# Best Practices

- Choose a stable Candidate Key as the Primary Key.
- Prefer values that rarely change.
- Keep Candidate Keys short.
- Ensure Candidate Keys remain unique.
- Use surrogate keys when natural values may change frequently.

---

# Common Mistakes

❌ Assuming every unique column is automatically the Primary Key

❌ Using unnecessary columns in Candidate Keys

❌ Selecting a Candidate Key that changes frequently

Example

```
Email
```

Email addresses may change.

A numeric EmployeeID is often a better Primary Key.

---

# 💡 Did You Know?

Every Primary Key **starts its life as a Candidate Key**.

Database designers first identify **all** Candidate Keys.

Only after evaluating factors such as stability, simplicity, and performance do they choose one to become the Primary Key.

The remaining Candidate Keys are usually implemented using **UNIQUE** constraints.

---

# Quick Reference

| Property | Candidate Key |
|-----------|---------------|
| Unique | ✅ Yes |
| NULL Allowed | ❌ No |
| Minimum Columns | ✅ Yes |
| Multiple Per Table | ✅ Yes |
| Can Become Primary Key | ✅ Yes |
| Selected as Official Identifier | ❌ Not necessarily |

---

# Database Support

Candidate Keys are a **database design concept** rather than a separate SQL keyword.

They are typically implemented using:

- `PRIMARY KEY`
- `UNIQUE`
- `NOT NULL`

All major relational databases support Candidate Keys through these constraints.

| Database | Supported |
|-----------|-----------|
| MySQL | ✅ |
| PostgreSQL | ✅ |
| SQL Server | ✅ |
| Oracle | ✅ |
| SQLite | ✅ |

---

# Interview Questions

### What is a Candidate Key?

A Candidate Key is a minimal set of column(s) that can uniquely identify every row in a table.

---

### Can a table have multiple Candidate Keys?

Yes.

A table may have several Candidate Keys, but only one is selected as the Primary Key.

---

### Can a Candidate Key contain NULL values?

No.

A Candidate Key must uniquely identify every record and therefore cannot contain `NULL`.

---

### What is meant by "minimal"?

Minimal means no unnecessary column is included.

Removing any column would make the key non-unique.

---

### What happens to Candidate Keys that are not selected?

They become **Alternate Keys** and are typically enforced using `UNIQUE` constraints.

---

### Is every Primary Key a Candidate Key?

Yes.

Every Primary Key is selected from the available Candidate Keys.

---

# Hands-on Exercises

## Exercise 1

Identify all Candidate Keys.

| StudentID | RollNo | Email | Name |
|------------|--------|-------|------|
|1001|CSE001|john@college.edu|John|
|1002|CSE002|alice@college.edu|Alice|

---

## Exercise 2

Choose the best Primary Key from:

- StudentID
- Email
- RollNo

Explain your choice.

---

## Exercise 3

Explain why the following is **not** a Candidate Key.

```
StudentID + Email
```

---

## Exercise 4

Design a `Customers` table.

Identify at least three possible Candidate Keys.

Select one as the Primary Key.

---

## Exercise 5

Consider an online banking system.

Which of the following could be Candidate Keys?

- Account Number
- Customer Name
- Mobile Number
- National ID
- Email Address

Explain your reasoning.

---

# Chapter Summary

In this lesson, you learned:

- What a Candidate Key is
- Why a table can have multiple Candidate Keys
- Candidate Key characteristics
- Minimality and uniqueness
- Candidate Key vs Primary Key
- Candidate Key vs Super Key
- Candidate Key vs Alternate Key
- Best practices for selecting a Primary Key

Candidate Keys represent every possible unique identifier for a table. During database design, one Candidate Key is chosen as the Primary Key, while the remaining ones typically become Alternate Keys.

---

# Related Topics

### Previous Lessons

- **03.06** — SQL Constraints
- **03.07.01** — Primary Key
- **03.07.02** — Foreign Key

### Next Lessons

- **03.07.04** — Alternate Key
- **03.07.05** — Composite Key
- **03.07.06** — Super Key

### Recommended Reading

- Understanding `UNIQUE` Constraints
- Database Normalization
- Entity-Relationship (ER) Diagrams
- Database Design Best Practices

---

# What's Next?

In **03.07.04 – Alternate Key**, you'll learn how the Candidate Keys that are **not selected** as the Primary Key become Alternate Keys, why they are still important, and how they are commonly implemented using `UNIQUE` constraints.