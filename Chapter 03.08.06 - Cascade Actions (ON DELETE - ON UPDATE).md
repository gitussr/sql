---
title: "03.08.06 - Cascade Actions (ON DELETE / ON UPDATE)"
description: "Learn how ON DELETE and ON UPDATE actions control the behavior of related records in relational databases. Understand CASCADE, RESTRICT, SET NULL, NO ACTION, and SET DEFAULT with practical SQL examples."
chapter: 3
section: 3.8.6
category: Core SQL Concepts
difficulty: Intermediate
readingTime: 40 min
lastUpdated: 2026-07-27
---

# 03.08.06 Cascade Actions (`ON DELETE` / `ON UPDATE`)

## Learning Objectives

After completing this lesson, you will be able to:

- Understand why cascade actions exist
- Explain the purpose of `ON DELETE` and `ON UPDATE`
- Differentiate between CASCADE, RESTRICT, NO ACTION, SET NULL, and SET DEFAULT
- Choose the appropriate action for different business scenarios
- Design safer relational databases

---

# Introduction

In the previous chapter, you learned that **Referential Integrity** prevents invalid relationships between tables.

But an important question remains:

> **What should happen when a parent record is updated or deleted?**

Example:

```
Customers

↓

Orders
```

If a customer is deleted:

- Should the customer's orders also be deleted?
- Should deletion be blocked?
- Should the customer reference become NULL?

The answer depends on the **Cascade Action** configured on the Foreign Key.

---

# What are Cascade Actions?

**Cascade Actions** define how child records behave when the referenced parent record is:

- Updated
- Deleted

They are specified when creating a **Foreign Key**.

Example:

```sql
FOREIGN KEY (CustomerID)
REFERENCES Customers(CustomerID)
ON DELETE CASCADE
ON UPDATE CASCADE;
```

---

# Visual Representation

```text
           Parent Table
        +---------------+
        |  Customers    |
        +---------------+
               │
      ON DELETE / ON UPDATE
               │
               ▼
        +---------------+
        |    Orders     |
        +---------------+
           Child Table
```

The action determines what happens to the child records when the parent changes.

---

# Available Cascade Actions

| Action | Description |
|----------|-------------|
| CASCADE | Automatically update/delete child records |
| RESTRICT | Prevent the operation |
| NO ACTION | Reject the operation if child records exist |
| SET NULL | Set the Foreign Key to NULL |
| SET DEFAULT | Set the Foreign Key to its default value (if supported) |

---

# 1. CASCADE

## Definition

When the parent record changes, the child records are automatically updated or deleted.

---

## Example

Customers

| CustomerID |
|------------|
|1|

Orders

| OrderID | CustomerID |
|----------|------------|
|1001|1|
|1002|1|

Delete customer:

```sql
DELETE FROM Customers
WHERE CustomerID = 1;
```

Result:

```
Customers

(empty)

Orders

(empty)
```

Both orders are automatically deleted.

---

## SQL Example

```sql
CREATE TABLE Orders
(
    OrderID INT PRIMARY KEY,

    CustomerID INT,

    FOREIGN KEY(CustomerID)
    REFERENCES Customers(CustomerID)

    ON DELETE CASCADE

    ON UPDATE CASCADE
);
```

---

## When to Use

Suitable for:

- Temporary data
- Shopping carts
- Session data
- Wishlist items
- Order drafts

---

## Advantages

- Automatic cleanup
- Prevents orphan records
- Less application code

---

## Risks

Deleting one parent row can remove a large number of related records.

Always use with care.

---

# 2. RESTRICT

## Definition

The database refuses to delete or update a parent record if child records exist.

---

Example

```
Customer

↓

Orders
```

Trying to delete the customer results in an error.

---

SQL

```sql
FOREIGN KEY(CustomerID)

REFERENCES Customers(CustomerID)

ON DELETE RESTRICT
```

---

## Result

```
DELETE Customer

↓

ERROR

Orders still exist
```

---

## When to Use

Ideal for:

- Banking
- Accounting
- Payroll
- Inventory
- Medical systems

---

## Advantages

- Protects important data
- Prevents accidental deletion

---

# 3. NO ACTION

## Definition

Similar to RESTRICT.

If related child records exist, the database rejects the operation.

---

SQL

```sql
ON DELETE NO ACTION
```

---

## Difference from RESTRICT

In many database systems (such as MySQL), `RESTRICT` and `NO ACTION` behave the same.

Some database engines evaluate them at different times during transaction processing.

For most beginners, you can think of them as equivalent.

---

# 4. SET NULL

## Definition

When the parent record is deleted or updated, the Foreign Key in the child table becomes `NULL`.

---

Example

Customers

| CustomerID |
|------------|
|1|

Orders

| OrderID | CustomerID |
|----------|------------|
|1001|1|

Delete customer.

Result:

Orders

| OrderID | CustomerID |
|----------|------------|
|1001|NULL|

The order remains, but it is no longer linked to a customer.

---

## SQL

```sql
FOREIGN KEY(CustomerID)

REFERENCES Customers(CustomerID)

ON DELETE SET NULL
```

---

## Requirement

The Foreign Key column **must allow NULL values**.

Example:

```sql
CustomerID INT NULL
```

---

## When to Use

Useful when the child record is still meaningful without the parent.

Examples:

- Blog posts after author deletion
- Support tickets
- Historical audit records

---

# 5. SET DEFAULT

## Definition

When the parent record is deleted, the Foreign Key is set to a predefined default value.

---

Example

Customers

| CustomerID |
|------------|
|1|

Default CustomerID

```
0
```

Delete customer.

Orders become:

| OrderID | CustomerID |
|----------|------------|
|1001|0|

---

## SQL

```sql
FOREIGN KEY(CustomerID)

REFERENCES Customers(CustomerID)

ON DELETE SET DEFAULT
```

---

## Important

`SET DEFAULT` is **not supported by MySQL/InnoDB**.

It is available in some other database systems, such as PostgreSQL and SQL Server.

If your DBMS does not support it, use another action such as `SET NULL` or handle the behavior in application logic.

---

# Comparison Table

| Action | Parent Deleted | Child Records |
|----------|----------------|---------------|
| CASCADE | Allowed | Deleted |
| RESTRICT | Blocked | Remain |
| NO ACTION | Blocked | Remain |
| SET NULL | Allowed | FK becomes NULL |
| SET DEFAULT | Allowed | FK becomes default value |

---

# Real-World Examples

## E-Commerce

```
Customers

↓

Orders
```

Usually:

```
RESTRICT
```

Orders are business records and should not disappear automatically.

---

## Shopping Cart

```
Users

↓

CartItems
```

Usually:

```
CASCADE
```

Deleting a user removes temporary cart items.

---

## HRMS

```
Departments

↓

Employees
```

Usually:

```
RESTRICT
```

Employees should be reassigned before a department is removed.

---

## Blog

```
Authors

↓

Posts
```

Possible options:

- `SET NULL` (posts remain without an author)
- `RESTRICT` (prevent deleting authors with posts)

The choice depends on business requirements.

---

# Enterprise Best Practices

| Scenario | Recommended Action |
|-----------|--------------------|
| Banking | RESTRICT |
| Accounting | RESTRICT |
| Payroll | RESTRICT |
| Orders | RESTRICT |
| Cart Items | CASCADE |
| Session Data | CASCADE |
| User Preferences | CASCADE |
| Audit Logs | SET NULL or RESTRICT |
| Lookup Tables | RESTRICT |

---

# Common Mistakes

❌ Using `CASCADE` everywhere.

---

❌ Accidentally deleting thousands of child records.

---

❌ Using `SET NULL` on a column declared as `NOT NULL`.

---

❌ Forgetting to understand business rules before choosing an action.

---

# 💡 Did You Know?

Enterprise applications rarely rely on database cascade actions alone.

Many systems first perform validation in the application layer (for example, checking permissions or business rules) and then rely on the database's Foreign Key constraints as a final safeguard to maintain data integrity.

---

# Performance Considerations

- Cascade operations can affect many rows in large databases.
- Index Foreign Key columns for better performance.
- Be cautious with deep cascade chains involving multiple tables.
- Test cascade behavior in staging environments before production deployments.

---

# Quick Reference

| Action | Recommended For |
|----------|-----------------|
| CASCADE | Temporary data |
| RESTRICT | Critical business data |
| NO ACTION | Standard protection |
| SET NULL | Optional relationships |
| SET DEFAULT | Systems that support default references |

---

# Interview Questions

### What is a Cascade Action?

A rule that defines what happens to child records when a referenced parent record is updated or deleted.

---

### What is the difference between CASCADE and RESTRICT?

- **CASCADE** automatically updates or deletes related child records.
- **RESTRICT** blocks the operation if related child records exist.

---

### When should you use `ON DELETE CASCADE`?

For temporary or dependent data, such as shopping carts or session records.

---

### Why is `RESTRICT` commonly used in banking systems?

Because important financial records should never be deleted automatically.

---

### Can `SET NULL` be used on a `NOT NULL` column?

No. The Foreign Key column must allow `NULL`.

---

### Is `SET DEFAULT` supported in MySQL?

No. MySQL's InnoDB storage engine does not support `ON DELETE SET DEFAULT` or `ON UPDATE SET DEFAULT`.

---

# Hands-on Exercises

## Exercise 1

Create:

- Customers
- Orders

Test:

- `ON DELETE CASCADE`

Observe what happens when a customer is deleted.

---

## Exercise 2

Repeat the previous exercise using:

```sql
ON DELETE RESTRICT
```

Observe the difference.

---

## Exercise 3

Create:

- Authors
- Posts

Use:

```sql
ON DELETE SET NULL
```

Verify that posts remain after deleting an author.

---

## Exercise 4

Create three separate databases demonstrating:

- CASCADE
- RESTRICT
- SET NULL

Compare the results.

---

## Exercise 5

For the following systems, recommend the most appropriate cascade action and explain your reasoning:

- Banking
- Hospital Management
- E-Commerce
- Library Management
- HRMS
- School Management

---

# Summary

In this lesson, you learned:

- What Cascade Actions are
- How `ON DELETE` and `ON UPDATE` work
- The differences between `CASCADE`, `RESTRICT`, `NO ACTION`, `SET NULL`, and `SET DEFAULT`
- How to choose the correct action based on business requirements
- Best practices for designing safe and maintainable relational databases

Choosing the right cascade action is an important database design decision. It directly affects data integrity, application behavior, and long-term maintainability.

---

# Related Topics

### Previous Lessons

- 03.08.04 — Junction (Bridge) Tables
- 03.08.05 — Referential Integrity

### Next Lessons

- **03.08.07 — Self-Referencing Relationships**
- **03.08.08 — Relationship Design Best Practices**
- **03.08.09 — Relationship Case Studies**
- **03.08.10 — Relationship Comparison Cheat Sheet**
- **03.08.11 — Interview Questions & Exercises**