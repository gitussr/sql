---
title: "03.09.06 - Soft Delete Pattern"
description: "Learn the Soft Delete Pattern, an enterprise database design pattern that preserves records by marking them as deleted instead of physically removing them. Discover how modern applications support recovery, auditing, compliance, and historical reporting."
chapter: 3
section: 3.9.6
category: Database Design Patterns
difficulty: Intermediate
readingTime: 35 min
lastUpdated: 2026-07-28
---

# 03.09.06 Soft Delete Pattern

---

# Learning Objectives

After completing this lesson, you will be able to:

- Understand the Soft Delete Pattern
- Differentiate soft deletes from hard deletes
- Design recoverable database records
- Prevent accidental data loss
- Support auditing and compliance
- Implement enterprise-grade deletion strategies

---

# Definition

The **Soft Delete Pattern** marks a record as deleted **without physically removing it** from the database.

Instead of executing:

```sql
DELETE FROM Customers
WHERE CustomerID = 101;
```

the record is updated.

```sql
UPDATE Customers
SET IsDeleted = TRUE
WHERE CustomerID = 101;
```

The data still exists but is hidden from normal application queries.

---

# Problem It Solves

Imagine an e-commerce customer accidentally deletes an order.

Using a normal DELETE statement:

```sql
DELETE FROM Orders
WHERE OrderID = 1001;
```

The record disappears forever.

Problems include:

- No recovery
- Broken reports
- Lost audit trail
- Compliance issues
- Broken foreign key relationships
- Customer support difficulties

---

# Solution

Instead of deleting the row:

```text
Order

↓

Deleted Flag = TRUE
```

The application simply ignores deleted records.

---

# Visual Representation

```text
Customers
------------------------------------
CustomerID
Name
Email
IsDeleted
DeletedAt
DeletedBy
```

Instead of:

```text
DELETE ROW
```

we perform:

```text
Update

↓

IsDeleted = TRUE
```

---

# ER Diagram

```text
+-----------------------------------+
| Customers                         |
+-----------------------------------+
| PK CustomerID                     |
| Name                              |
| Email                             |
| IsDeleted                         |
| DeletedAt                         |
| DeletedBy                         |
+-----------------------------------+
```

No additional table is required.

The deletion metadata becomes part of the entity itself.

---

# SQL Implementation

## Step 1 — Create Table

```sql
CREATE TABLE Customers (

    CustomerID INT PRIMARY KEY,

    CustomerName VARCHAR(100),

    Email VARCHAR(100),

    IsDeleted BOOLEAN DEFAULT FALSE,

    DeletedAt DATETIME,

    DeletedBy VARCHAR(100)
);
```

---

## Step 2 — Insert Data

```sql
INSERT INTO Customers
VALUES
(101,'Alice','alice@example.com',FALSE,NULL,NULL),

(102,'Bob','bob@example.com',FALSE,NULL,NULL);
```

---

## Step 3 — Soft Delete

```sql
UPDATE Customers

SET

IsDeleted = TRUE,

DeletedAt = NOW(),

DeletedBy = 'Admin'

WHERE CustomerID = 102;
```

---

## Step 4 — Retrieve Active Records

```sql
SELECT *

FROM Customers

WHERE IsDeleted = FALSE;
```

### Output

| CustomerID | Name |
|------------|------|
|101|Alice|

Bob still exists in the database but is hidden from normal users.

---

## Step 5 — Restore Deleted Record

```sql
UPDATE Customers

SET

IsDeleted = FALSE,

DeletedAt = NULL,

DeletedBy = NULL

WHERE CustomerID = 102;
```

The customer is immediately restored.

---

# How It Works

Without Soft Delete

```text
Delete Record

↓

Gone Forever
```

With Soft Delete

```text
Delete Request

↓

Update Flag

↓

Hidden

↓

Can Be Restored
```

---

# Hard Delete vs Soft Delete

| Hard Delete | Soft Delete |
|--------------|-------------|
| Physically removes data | Marks record as deleted |
| Cannot be recovered easily | Easily restored |
| Smaller database | Larger database |
| No history | Preserves history |
| Faster storage cleanup | Better auditing |

---

# Real-World Examples

## E-Commerce

```text
Customer

↓

Account Deleted

↓

Recover within 30 Days
```

---

## Gmail

Deleting an email usually moves it to:

```text
Trash

↓

30 Days

↓

Permanent Delete
```

This is Soft Delete.

---

## HRMS

```text
Employee

↓

Resigned

↓

Archived
```

The employee record remains for payroll and reporting.

---

## Hospital

```text
Patient Record

↓

Inactive

↓

Historical Record
```

Medical history is preserved.

---

## Banking

```text
Account Closed

↓

Archived

↓

Retained for Legal Reasons
```

---

## CRM

```text
Lead Deleted

↓

Recoverable

↓

Restore if Needed
```

---

# Enterprise Examples

| System | Soft Deleted Records |
|----------|----------------------|
| ERP | Suppliers |
| CRM | Leads |
| Hospital | Patients |
| Banking | Accounts |
| LMS | Courses |
| GitHub | Repositories |
| SaaS | Workspaces |
| E-Commerce | Customers |

---

# Common Soft Delete Columns

Most enterprise systems include:

| Column | Purpose |
|---------|----------|
| IsDeleted | Indicates logical deletion |
| DeletedAt | Timestamp |
| DeletedBy | User who deleted |
| DeleteReason | Optional explanation |

Some systems also include:

```text
ArchivedAt

ArchivedBy

RestoreDate
```

---

# Advantages

✅ Prevents accidental data loss

✅ Easy recovery

✅ Supports auditing

✅ Better compliance

✅ Preserves relationships

✅ Historical reporting

---

# Disadvantages

❌ Larger database

❌ Queries become more complex

❌ Requires filtering

❌ Indexes become larger

---

# Performance Considerations

Large tables may contain millions of deleted rows.

Recommended practices:

- Index `IsDeleted`.
- Create filtered indexes where supported.
- Archive very old deleted records.
- Periodically purge records beyond the retention period.

Example:

```sql
CREATE INDEX idx_customer_active

ON Customers(IsDeleted);
```

---

# Best Practices

✔ Always filter active records.

```sql
WHERE IsDeleted = FALSE
```

✔ Record who deleted the row.

✔ Record when it happened.

✔ Keep restore functionality.

✔ Combine with Audit Logs.

✔ Define retention policies.

---

# Common Mistakes

## Forgetting to Filter

Incorrect:

```sql
SELECT *

FROM Customers;
```

Deleted customers appear.

Correct:

```sql
SELECT *

FROM Customers

WHERE IsDeleted = FALSE;
```

---

## Using DELETE Anyway

If Soft Delete is the application standard:

Avoid:

```sql
DELETE FROM Customers;
```

Use:

```sql
UPDATE Customers

SET IsDeleted = TRUE;
```

---

## Missing Metadata

Avoid storing only:

```text
IsDeleted
```

Also store:

- DeletedAt
- DeletedBy
- Reason

---

## Soft Deleting Everything

Not every table requires Soft Delete.

Example:

```text
Shopping Cart Items

OTP Codes

Session Tokens

Temporary Cache
```

These temporary records can usually be hard deleted safely.

---

# Typical Workflow

```text
User Clicks Delete

↓

Application Validates

↓

Update IsDeleted

↓

Insert Audit Log

↓

Hide Record

↓

Allow Restore
```

---

# Integration with Other Patterns

Soft Delete works well with:

| Pattern | Purpose |
|----------|---------|
| Audit Log | Record deletion activity |
| Status History | Track lifecycle |
| Lookup Table | Deletion reasons |
| Versioning | Preserve document versions |
| Multi-Tenant | Tenant-safe deletion |

---

# Security Considerations

Deleted records should:

- Not appear in public APIs
- Not appear in search results
- Respect user permissions
- Be recoverable only by authorised users
- Be permanently removed only through administrative processes

---

# Compliance Considerations

Some regulations require retaining deleted records for a defined period.

Others, such as **GDPR's Right to Erasure**, may require permanent deletion under specific circumstances.

Many enterprise systems therefore implement:

```text
Soft Delete

↓

Retention Period

↓

Permanent Purge
```

This balances business recovery needs with legal obligations.

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB |
|---------|:-----:|:----------:|:----------:|:------:|:--------:|
| Boolean Flag | ✅ | ✅ | ✅ | ✅ | ✅ |
| Timestamp | ✅ | ✅ | ✅ | ✅ | ✅ |
| Filtered Queries | ✅ | ✅ | ✅ | ✅ | ✅ |
| Index Support | ✅ | ✅ | ✅ | ✅ | ✅ |

---

# 💡 Did You Know?

Most SaaS platforms don't immediately delete your account when you click **Delete**. Instead, they mark it as inactive or deleted, allowing a recovery period (for example, 14–30 days). After the retention period expires, a background job permanently removes the data if required by business rules or legal policies.

---

# Interview Questions

## Basic

1. What is a Soft Delete?
2. How is it different from a Hard Delete?
3. Why is Soft Delete useful?

## Intermediate

4. Which columns are commonly used in a Soft Delete implementation?
5. Why should queries filter deleted rows?
6. When should records be permanently removed?

## Advanced

7. How would you implement Soft Delete across an entire enterprise application?
8. How does Soft Delete interact with foreign keys?
9. How would you archive millions of deleted records?
10. How does GDPR affect Soft Delete implementations?

---

# Hands-on Exercises

## Exercise 1

Design a Customer table supporting:

- Soft Delete
- Restore
- Audit information

---

## Exercise 2

Modify an Order Management System to support:

- Deleted Orders
- Restore Orders
- Permanent Purge

---

## Exercise 3

Design a Hospital Patient database.

Determine which entities should:

- Soft Delete
- Hard Delete

Explain your reasoning.

---

## Exercise 4

Design a SaaS Workspace.

Support:

- Workspace deletion
- 30-day recovery period
- Permanent deletion after retention

---

## Exercise 5

Design a CRM system.

Implement Soft Delete for:

- Customers
- Leads
- Opportunities

Also identify which tables should continue using Hard Delete.

---

# Related Patterns

- **03.09.04 — Status History Pattern**
- **03.09.05 — Audit Log Pattern**
- **03.09.07 — Versioning Pattern**
- **03.09.11 — Event Log Pattern**

Soft Delete is commonly combined with Audit Logs to record deletion events, Status History to track lifecycle changes, and scheduled background jobs that permanently purge expired records.

---

# Summary

The **Soft Delete Pattern** allows applications to logically remove records while preserving them for recovery, auditing, historical reporting, and regulatory compliance. Instead of physically deleting data, records are marked as deleted and excluded from normal queries. This approach is widely used in enterprise systems such as CRM platforms, e-commerce websites, ERP software, banking applications, healthcare systems, and modern SaaS products because it balances data safety with operational flexibility.