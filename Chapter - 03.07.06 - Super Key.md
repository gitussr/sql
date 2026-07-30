---
title: "03.07.06 - Super Key"
description: "Learn what a Super Key is, why it is broader than a Candidate Key, and how it helps identify records uniquely in relational databases."
chapter: 3
section: 3.7.6
category: Core SQL Concepts
difficulty: Beginner
readingTime: 18 min
lastUpdated: 2026-07-27
---

# 03.07.06 Super Key

## Learning Objectives

After completing this lesson, you will be able to:

- Understand what a Super Key is
- Learn how Super Keys uniquely identify records
- Differentiate Super Key from Candidate Key
- Differentiate Super Key from Primary Key
- Identify Super Keys in a database table
- Understand the concept of minimality
- Follow best practices while designing database keys

---

# Introduction

Consider the following employee table.

| EmployeeID | Email | Name | Department |
|------------|-------|------|------------|
|101|john@company.com|John|IT|
|102|alice@company.com|Alice|HR|
|103|david@company.com|David|Finance|

We already know:

```
EmployeeID
```

uniquely identifies every employee.

But what about these?

```
EmployeeID + Name

EmployeeID + Department

EmployeeID + Email

EmployeeID + Name + Department
```

They also uniquely identify every employee.

All of them are called **Super Keys**.

---

# What is a Super Key?

A **Super Key** is **one or more columns that can uniquely identify every row in a table**.

Unlike a Candidate Key, a Super Key **may contain unnecessary columns**.

---

# Simple Definition

```
Unique Identifier

+

Optional Extra Columns

=

Super Key
```

---

# Why Do We Need Super Keys?

During database design, we first identify **every possible unique combination**.

These combinations are called **Super Keys**.

From these Super Keys, we remove unnecessary columns.

The remaining minimal keys become **Candidate Keys**.

Finally,

one Candidate Key becomes the **Primary Key**.

---

# Visual Representation

```
Super Keys
────────────────────────────

EmployeeID

EmployeeID + Name

EmployeeID + Email

EmployeeID + Department

EmployeeID + Name + Email

EmployeeID + Name + Department

...

↓

Remove unnecessary columns

↓

Candidate Keys

↓

Choose one

↓

Primary Key
```

---

# Example Table

## Employees

| EmployeeID | Email | Name | Department |
|------------|-------|------|------------|
|101|john@company.com|John|IT|
|102|alice@company.com|Alice|HR|
|103|david@company.com|David|Finance|

---

# Identifying Super Keys

Possible Super Keys

```
EmployeeID

EmployeeID + Name

EmployeeID + Email

EmployeeID + Department

EmployeeID + Name + Email

EmployeeID + Email + Department

EmployeeID + Name + Email + Department
```

Every one of these uniquely identifies a row.

Therefore,

they are all Super Keys.

---

# What is NOT a Super Key?

Consider

```
Department
```

Can it uniquely identify employees?

No.

Multiple employees can belong to the same department.

```
Department

↓

Not Unique

↓

Not a Super Key
```

Similarly,

```
Name
```

is not a Super Key because multiple employees may share the same name.

---

# SQL Example

```sql
CREATE TABLE Employees
(
    EmployeeID INT PRIMARY KEY,
    Email VARCHAR(100) UNIQUE,
    FirstName VARCHAR(50),
    Department VARCHAR(50)
);
```

---

## Explanation

Possible Super Keys include:

```
EmployeeID

Email

EmployeeID + Department

Email + FirstName

EmployeeID + Email

EmployeeID + Email + Department
```

Some of these are Candidate Keys.

Others contain unnecessary columns.

---

# Understanding Minimality

Suppose

```
EmployeeID
```

is unique.

Then

```
EmployeeID + Name
```

is also unique.

But is **Name** needed?

No.

Therefore,

```
EmployeeID + Name
```

is a Super Key,

not a Candidate Key.

---

# Super Key vs Candidate Key

| Super Key | Candidate Key |
|------------|---------------|
| May contain extra columns | No extra columns |
| Unique | Unique |
| May not be minimal | Always minimal |
| Many possible | Fewer possible |

---

## Example

```
EmployeeID
```

Candidate Key

```
EmployeeID + Name
```

Super Key

Because **Name** is unnecessary.

---

# Super Key vs Primary Key

| Super Key | Primary Key |
|------------|-------------|
| Many allowed | Only one |
| May contain unnecessary columns | Always minimal |
| Design concept | Selected key |
| May not be used in the database | Official identifier |

---

# Super Key vs Composite Key

| Super Key | Composite Key |
|------------|---------------|
| One or more columns | Two or more columns |
| May contain unnecessary columns | Uses multiple columns together |
| General concept | Structural type of key |

A Composite Key can also be a Super Key if it uniquely identifies records.

---

# ER Diagram

```text
+------------------+
|   Departments    |
+------------------+
| PK DepartmentID  |
| DepartmentName   |
+------------------+
          ▲
          │
          │
+-------------------------------+
|         Employees             |
+-------------------------------+
| PK EmployeeID                 |
| Email (UNIQUE)                |
| Name                          |
| FK DepartmentID               |
+-------------------------------+
```

Possible Super Keys in the **Employees** table:

```
EmployeeID

Email

EmployeeID + Name

EmployeeID + Email

Email + DepartmentID

EmployeeID + Email + Name
```

Not all of these are Candidate Keys.

---

# Real-World Example

## Passport Office

Possible unique identifiers

```
Passport Number

Passport Number + Name

Passport Number + Country

Passport Number + Name + DOB
```

Every combination uniquely identifies a passport.

However,

```
Passport Number
```

alone is sufficient.

The remaining combinations are Super Keys with unnecessary columns.

---

# Advantages

- Helps identify every possible unique identifier.
- Forms the basis for Candidate Key selection.
- Supports proper database design.
- Useful during normalization.

---

# Disadvantages

- Many Super Keys are unnecessarily large.
- Larger keys reduce readability.
- Larger indexes consume more storage.
- Not suitable as Primary Keys when simpler alternatives exist.

---

# Best Practices

- Use Super Keys during database design.
- Remove unnecessary columns to obtain Candidate Keys.
- Select the smallest Candidate Key as the Primary Key.
- Avoid implementing oversized Super Keys.

---

# Common Mistakes

❌ Thinking every Super Key should become a Primary Key.

Only **one minimal Candidate Key** should be selected.

---

❌ Confusing Composite Keys with Super Keys.

A Composite Key uses multiple columns.

A Super Key may use one or many columns.

---

❌ Including unnecessary attributes.

Example

```
EmployeeID + Name + Department + Email
```

If `EmployeeID` already identifies the record,

the remaining columns are unnecessary.

---

# 💡 Did You Know?

Every **Candidate Key** is a **Super Key**, but **not every Super Key is a Candidate Key**.

Think of it this way:

```
All Apples are Fruits

But

Not all Fruits are Apples
```

Similarly,

```
All Candidate Keys are Super Keys

But

Not all Super Keys are Candidate Keys
```

This is one of the most frequently asked interview concepts in database design.

---

# Quick Reference

| Property | Super Key |
|-----------|-----------|
| Uniquely Identifies Rows | ✅ Yes |
| Extra Columns Allowed | ✅ Yes |
| Must Be Minimal | ❌ No |
| Can Become Primary Key | Only after becoming a Candidate Key |
| Number per Table | Many |
| Database Concept | Yes |

---

# Database Support

A **Super Key** is a **database design concept**, not a SQL keyword.

It is implemented through combinations of:

- `PRIMARY KEY`
- `UNIQUE`
- Database design rules

Supported by all relational database systems.

| Database | Supported |
|-----------|-----------|
| MySQL | ✅ |
| PostgreSQL | ✅ |
| SQL Server | ✅ |
| Oracle | ✅ |
| SQLite | ✅ |

---

# Interview Questions

### What is a Super Key?

A Super Key is a set of one or more columns that uniquely identifies every row in a table.

---

### Can a Super Key contain unnecessary columns?

Yes.

Unlike Candidate Keys, Super Keys may include extra attributes.

---

### Is every Candidate Key a Super Key?

Yes.

Every Candidate Key is a Super Key.

---

### Is every Super Key a Candidate Key?

No.

Only minimal Super Keys qualify as Candidate Keys.

---

### Can a table have multiple Super Keys?

Yes.

A table can have many Super Keys.

---

### Why are Super Keys important?

They help database designers identify all possible unique identifiers before selecting Candidate Keys and the Primary Key.

---

# Hands-on Exercises

## Exercise 1

Given the following table:

| StudentID | Email | Name |
|------------|-------|------|
|101|john@college.edu|John|
|102|alice@college.edu|Alice|

List all possible Super Keys.

---

## Exercise 2

Identify which Super Keys are also Candidate Keys.

Explain your reasoning.

---

## Exercise 3

Explain why the following is a Super Key but not a Candidate Key.

```
StudentID + Email
```

---

## Exercise 4

Create an `Employees` table.

Identify:

- Super Keys
- Candidate Keys
- Primary Key

---

## Exercise 5

For the following columns, determine whether they are:

- Super Key
- Candidate Key
- Neither

```
EmployeeID

EmployeeID + Name

Department

Email

Email + Department
```

---

# Chapter Summary

In this lesson, you learned:

- What a Super Key is
- Why Super Keys are important
- Super Key characteristics
- Minimality
- Super Key vs Candidate Key
- Super Key vs Primary Key
- Super Key vs Composite Key
- Best practices
- Common mistakes

A Super Key represents **every possible combination of columns that can uniquely identify a record**. By removing unnecessary columns, database designers obtain Candidate Keys, from which one is selected as the Primary Key.

---

# Related Topics

### Previous Lessons

- **03.07.01** — Primary Key
- **03.07.02** — Foreign Key
- **03.07.03** — Candidate Key
- **03.07.04** — Alternate Key
- **03.07.05** — Composite Key

### Next Lessons

- **03.07.07** — Surrogate Key
- **03.07.08** — Natural Key
- **03.07.09** — Comparison of All Keys

### Recommended Reading

- Database Normalization
- SQL Constraints
- Entity-Relationship (ER) Diagrams
- Relational Database Design

---

# What's Next?

In **03.07.07 – Surrogate Key**, you'll learn why modern enterprise databases often use system-generated IDs instead of business data as Primary Keys, and why Surrogate Keys are widely adopted in large-scale applications.