---
title: "03.08 - Relationships in Databases"
description: "Understand how tables are connected in relational databases using One-to-One, One-to-Many, and Many-to-Many relationships. Learn why relationships are the backbone of SQL database design."
chapter: 3
section: 3.8
category: Core SQL Concepts
difficulty: Beginner
readingTime: 20 min
lastUpdated: 2026-07-27
---

# 03.08 Relationships in Databases

## Learning Objectives

After completing this chapter, you will be able to:

- Understand why database relationships are required
- Explain the three types of relationships
- Identify relationships in real-world applications
- Design relational databases correctly
- Use Primary Keys and Foreign Keys to connect tables
- Prepare for SQL JOINs in upcoming chapters

---

# Introduction

A relational database stores data in **multiple related tables** instead of one large table.

Rather than duplicating data, tables are connected using **relationships**.

For example:

- A customer places many orders.
- A department has many employees.
- A student enrolls in many courses.

These connections are called **database relationships**.

---

# Why Are Relationships Important?

Imagine an e-commerce website.

Without relationships, every order would repeatedly store:

- Customer Name
- Customer Email
- Customer Phone
- Customer Address

This creates:

- Duplicate data
- Larger databases
- Difficult updates
- Data inconsistency

Instead, relational databases store customer information once and reference it whenever needed.

---

# Example

Instead of this:

| OrderID | Customer Name | Email | Product |
|----------|---------------|--------|----------|
|1001|John|john@email.com|Laptop|
|1002|John|john@email.com|Mouse|

The database stores:

### Customers

| CustomerID | Name |
|------------|------|
|1|John|

### Orders

| OrderID | CustomerID |
|----------|------------|
|1001|1|
|1002|1|

This eliminates duplication and improves efficiency.

---

# What Creates a Relationship?

Relationships are built using:

- **Primary Key (PK)** — uniquely identifies a row.
- **Foreign Key (FK)** — references the Primary Key of another table.

Example:

```text
Customers
------------------
CustomerID (PK)

Orders
------------------
CustomerID (FK)
```

Here, `Orders.CustomerID` points to `Customers.CustomerID`, connecting the two tables.

---

# Types of Database Relationships

Every relational database is built using three fundamental relationship types.

| Relationship | Description |
|--------------|-------------|
| One-to-One (1:1) | One record matches one record |
| One-to-Many (1:N) | One record matches many records |
| Many-to-Many (M:N) | Many records match many records |

These three relationship types are sufficient to model almost every business system.

---

# Relationship Overview

```text
                 Database Relationships

                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼

   One-to-One     One-to-Many    Many-to-Many
      (1:1)           (1:N)          (M:N)
```

---

# One-to-One (1:1)

One record in Table A is related to **exactly one** record in Table B.

Example:

```
Person

↓

Passport
```

One person has one passport.

One passport belongs to one person.

Typical examples:

- Person ↔ Passport
- Employee ↔ Locker
- User ↔ Profile
- Vehicle ↔ Registration

---

# One-to-Many (1:N)

One record in the parent table can be related to **many** records in the child table.

Example:

```
Customer

↓

Orders
```

One customer can place many orders.

Each order belongs to only one customer.

Typical examples:

- Customer → Orders
- Department → Employees
- Category → Products
- Teacher → Students

This is the **most common relationship** in relational databases.

---

# Many-to-Many (M:N)

Many records in one table are related to many records in another table.

Example:

```
Students

↔

Courses
```

A student can study many courses.

A course contains many students.

Relational databases cannot directly implement a Many-to-Many relationship.

Instead, they use a **junction (bridge) table**.

Example:

```
Students

↓

Enrollments

↓

Courses
```

---

# Real-World Examples

| Industry | Relationship |
|-----------|--------------|
| Banking | Customer → Accounts |
| Hospital | Doctor → Patients |
| School | Student ↔ Courses |
| E-Commerce | Customer → Orders |
| Library | Member → Borrowed Books |
| Airline | Passenger → Bookings |
| HRMS | Department → Employees |

---

# Relationship Symbols

| Symbol | Meaning |
|----------|---------|
| 1:1 | One-to-One |
| 1:N | One-to-Many |
| M:N | Many-to-Many |

---

# How Relationships Are Implemented

| Relationship | Implementation |
|--------------|----------------|
| One-to-One | Foreign Key + UNIQUE |
| One-to-Many | Foreign Key |
| Many-to-Many | Junction Table + Two Foreign Keys |

---

# Enterprise Best Practices

✅ Use integer Surrogate Keys as Primary Keys.

✅ Create relationships using Foreign Keys.

✅ Avoid duplicate business data.

✅ Enforce Referential Integrity.

✅ Use junction tables for Many-to-Many relationships.

---

# 💡 Did You Know?

Every major relational database system—including **MySQL**, **PostgreSQL**, **SQL Server**, **Oracle**, and **MariaDB**—uses the same three relationship types.

Whether you're building a blog, an ERP, an HRMS, or an e-commerce platform, these relationship patterns remain the same.

---

# Common Mistakes

❌ Storing all information in one table.

---

❌ Duplicating customer or product data.

---

❌ Forgetting Foreign Key constraints.

---

❌ Attempting to create a direct Many-to-Many relationship without a junction table.

---

# Quick Reference

| Relationship | Parent | Child |
|--------------|--------|-------|
| One-to-One | One | One |
| One-to-Many | One | Many |
| Many-to-Many | Many | Many (through a junction table) |

---

# What's Coming Next?

The following lessons explore each relationship type in detail:

- **03.08.01 — One-to-One Relationship**
- **03.08.02 — One-to-Many Relationship**
- **03.08.03 — Many-to-Many Relationship**
- **03.08.04 — Junction (Bridge) Tables**
- **03.08.05 — Referential Integrity**
- **03.08.06 — Cascade Actions (`ON DELETE`, `ON UPDATE`)**
- **03.08.07 — Self-Referencing Relationships**
- **03.08.08 — Relationship Design Best Practices**
- **03.08.09 — Interview Questions & Exercises**

---

# Chapter Summary

In this chapter, you learned:

- Why relational databases use relationships
- The role of Primary Keys and Foreign Keys
- The three fundamental relationship types
- Where each relationship is used in real-world systems
- How relationships reduce data duplication and improve consistency

Understanding these concepts is essential before learning **SQL JOINs**, **Normalization**, and advanced database design. Relationships form the foundation of every relational database.