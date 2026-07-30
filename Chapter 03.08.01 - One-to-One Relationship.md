---
title: "03.08.01 - One-to-One Relationship"
description: "Learn how One-to-One (1:1) relationships work in relational databases, when to use them, how to implement them using Primary Keys and Foreign Keys, and explore real-world examples."
chapter: 3
section: 3.8.1
category: Core SQL Concepts
difficulty: Beginner
readingTime: 20 min
lastUpdated: 2026-07-27
---

# 03.08.01 One-to-One Relationship

## Learning Objectives

After completing this lesson, you will be able to:

- Understand what a One-to-One relationship is
- Identify real-world One-to-One relationships
- Implement One-to-One relationships in SQL
- Know when One-to-One relationships are appropriate
- Avoid common database design mistakes

---

# Introduction

A **One-to-One (1:1) Relationship** means:

> **One record in Table A is associated with exactly one record in Table B.**

Likewise,

> **One record in Table B belongs to exactly one record in Table A.**

This is the simplest type of database relationship.

---

# Visual Representation

```text
Person
   │
   │ 1 : 1
   │
Passport
```

One person owns one passport.

One passport belongs to one person.

---

# Simple Example

## Persons

| PersonID | Name |
|----------|------|
|1|Alice|
|2|Bob|
|3|Charlie|

---

## Passports

| PassportID | PersonID | PassportNumber |
|------------|----------|----------------|
|101|1|P123456|
|102|2|P654321|
|103|3|P987654|

Each person has only one passport.

Each passport belongs to only one person.

---

# Real-World Examples

| Table A | Table B |
|----------|----------|
| Person | Passport |
| Employee | Locker |
| User | User Profile |
| Vehicle | Registration Certificate |
| Citizen | National ID |
| Student | Student ID Card |
| Patient | Medical Record |

---

# Why Use a One-to-One Relationship?

Instead of placing every piece of information into one table, we separate data based on purpose.

Example:

Instead of this:

```text
Users

Name

Email

Photo

Biography

Social Links

Preferences

Theme

Language

Notifications
```

We split the data into:

```text
Users

↓

UserProfiles
```

This keeps the database:

- Cleaner
- Faster
- Easier to maintain

---

# Database Design

## Users

| Column | Key |
|----------|-----|
| UserID | Primary Key |
| Name | Normal |
| Email | UNIQUE |

---

## UserProfiles

| Column | Key |
|----------|-----|
| ProfileID | Primary Key |
| UserID | Foreign Key + UNIQUE |
| Photo | Normal |
| Bio | Normal |

Notice:

`UserID` is marked as **UNIQUE**.

This ensures one user cannot have multiple profiles.

---

# ER Diagram

```text
+----------------------+
|        Users         |
+----------------------+
| PK UserID            |
| Name                 |
| Email (UNIQUE)       |
+----------+-----------+
           |
           | 1
           |
           | 1
+----------+-----------+
|     UserProfiles     |
+----------------------+
| PK ProfileID         |
| FK UserID (UNIQUE)   |
| Photo                |
| Bio                  |
+----------------------+
```

---

# SQL Example

## Create Users Table

```sql
CREATE TABLE Users
(
    UserID INT AUTO_INCREMENT PRIMARY KEY,

    Name VARCHAR(100),

    Email VARCHAR(100) UNIQUE
);
```

---

## Create UserProfiles Table

```sql
CREATE TABLE UserProfiles
(
    ProfileID INT AUTO_INCREMENT PRIMARY KEY,

    UserID INT UNIQUE,

    Photo VARCHAR(255),

    Bio TEXT,

    FOREIGN KEY (UserID)
    REFERENCES Users(UserID)
);
```

### Explanation

- `FOREIGN KEY` connects the profile to the user.
- `UNIQUE(UserID)` ensures each user can have **only one** profile.

---

# Sample Data

## Users

| UserID | Name |
|---------|------|
|1|Alice|
|2|Bob|

---

## UserProfiles

| ProfileID | UserID | Bio |
|------------|---------|------|
|1|1|Web Developer|
|2|2|Database Administrator|

---

# Relationship Flow

```text
Users

1 Alice

↓

1 Profile

--------------------

Users

1 Bob

↓

1 Profile
```

---

# Alternative Implementation

Some databases use the **same Primary Key** in both tables.

Example:

```text
Users

PK UserID

↓

UserProfiles

PK + FK UserID
```

SQL

```sql
CREATE TABLE UserProfiles
(
    UserID INT PRIMARY KEY,

    Photo VARCHAR(255),

    Bio TEXT,

    FOREIGN KEY(UserID)
    REFERENCES Users(UserID)
);
```

This is a stricter implementation of a One-to-One relationship.

---

# When Should You Use One-to-One?

Use it when:

- Information is optional
- Sensitive data should be separated
- Large columns should be isolated
- Different teams manage different data
- Security permissions differ

Examples:

- User ↔ Profile
- Employee ↔ Payroll
- Customer ↔ Loyalty Card
- Student ↔ Hostel Record

---

# Advantages

✅ Reduces table size.

✅ Improves maintainability.

✅ Separates sensitive information.

✅ Supports modular application design.

✅ Makes permissions easier to manage.

---

# Disadvantages

❌ Requires additional joins.

❌ Adds complexity if overused.

❌ Not suitable when one record can have many related records.

---

# Common Mistakes

❌ Forgetting to add `UNIQUE` to the Foreign Key.

Without it, the relationship becomes **One-to-Many**.

---

❌ Storing all information in one table.

Large tables become difficult to manage.

---

❌ Using a One-to-One relationship where a One-to-Many relationship is needed.

Example:

Customer → Orders

A customer can place many orders, so One-to-One is incorrect.

---

# 💡 Did You Know?

Large applications such as **Facebook**, **LinkedIn**, and many enterprise HR systems often separate user authentication data from profile information.

For example:

```text
Users

↓

UserProfiles

↓

UserSettings

↓

UserSecurity
```

Each table has a specific responsibility, making the system easier to scale and maintain.

---

# Best Practices

✅ Use a Foreign Key with a `UNIQUE` constraint.

✅ Keep frequently accessed data in the main table.

✅ Move optional or rarely used data into a separate table.

✅ Document why the One-to-One relationship exists.

---

# Quick Reference

| Feature | One-to-One |
|----------|------------|
| Parent Record | One |
| Child Record | One |
| Foreign Key | Required |
| UNIQUE Constraint | Required |
| Common Use Cases | User Profiles, Passports, Payroll |

---

# Interview Questions

### What is a One-to-One relationship?

One record in one table is associated with exactly one record in another table.

---

### How do you enforce a One-to-One relationship?

By adding a `UNIQUE` constraint to the Foreign Key (or using the Foreign Key as the Primary Key).

---

### Give three real-world examples.

- Person ↔ Passport
- User ↔ Profile
- Employee ↔ Locker

---

### Can a Foreign Key alone create a One-to-One relationship?

No.

A `UNIQUE` constraint is also required.

---

### When should you avoid a One-to-One relationship?

When one parent record needs to relate to multiple child records.

---

# Hands-on Exercises

## Exercise 1

Create a database with:

- Users
- UserProfiles

Implement a One-to-One relationship.

---

## Exercise 2

Create:

- Employees
- EmployeeLockers

Ensure each employee has only one locker.

---

## Exercise 3

Modify an existing table to convert a One-to-Many relationship into a One-to-One relationship using a `UNIQUE` constraint.

---

## Exercise 4

Design a database for:

- Citizens
- Passports

Write the SQL statements to enforce the relationship.

---

# Chapter Summary

In this lesson, you learned:

- What a One-to-One relationship is
- How it differs from other relationship types
- How to implement it using `FOREIGN KEY` and `UNIQUE`
- Common real-world use cases
- Best practices for database design

One-to-One relationships are less common than One-to-Many relationships, but they are extremely useful for separating optional, secure, or specialised data into dedicated tables.

---

# Related Topics

### Previous Lessons

- 03.07 — Database Keys
- 03.08 — Relationships in Databases

### Next Lessons

- **03.08.02 — One-to-Many Relationship**
- **03.08.03 — Many-to-Many Relationship**
- **03.08.04 — Junction (Bridge) Tables**

### Recommended Reading

- Foreign Keys
- UNIQUE Constraints
- Referential Integrity
- Entity-Relationship (ER) Diagrams