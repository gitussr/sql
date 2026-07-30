---
title: "03.09.05 - Audit Log Pattern"
description: "Learn the Audit Log Pattern, a fundamental database design pattern used to record who performed an action, what changed, when it changed, and where the change originated. Discover how enterprise applications implement auditing for security, compliance, troubleshooting, and forensic analysis."
chapter: 3
section: 3.9.5
category: Database Design Patterns
difficulty: Intermediate
readingTime: 40 min
lastUpdated: 2026-07-27
---

# 03.09.05 Audit Log Pattern

---

# Learning Objectives

After completing this lesson, you will be able to:

- Understand the Audit Log Pattern
- Distinguish audit logs from status history
- Record business and security events
- Design enterprise-grade audit tables
- Support compliance and forensic investigations
- Implement immutable audit records

---

# Definition

The **Audit Log Pattern** records every important action performed within a system.

Unlike a Status History Pattern, which tracks **how a business entity changes state**, an Audit Log answers questions such as:

- Who performed the action?
- What action was performed?
- When did it happen?
- What data changed?
- Where did the request originate?
- Why was the action performed?

Audit logs create a permanent, chronological record of system activity.

---

# Problem It Solves

Suppose an employee's salary changes.

```text
Employee

Salary = £50,000
```

A week later:

```text
Salary = £60,000
```

The database now contains only the latest value.

Questions arise:

- Who changed the salary?
- When was it changed?
- What was the previous value?
- Was the change authorised?
- Was it made from the HR portal or an API?

Without an audit log, these questions cannot be answered.

---

# Solution

Maintain the business table as usual.

Create a separate audit table that records every important action.

```text
Employees

↓

EmployeeAuditLog
```

Every significant operation inserts a new audit record.

---

# Visual Representation

```text
Employees
-----------------------
EmployeeID (PK)
Name
Salary

         ▲
         │
         │
EmployeeAuditLog
----------------------------
AuditID (PK)
EmployeeID (FK)
Action
OldValue
NewValue
ChangedBy
ChangedAt
IPAddress
```

---

# ER Diagram

```text
+----------------------+
| Employees            |
+----------------------+
| PK EmployeeID        |
| Name                 |
| Salary               |
+----------------------+
          ▲
          │
          │
+--------------------------------+
| EmployeeAuditLog               |
+--------------------------------+
| PK AuditID                     |
| FK EmployeeID                  |
| Action                         |
| OldValue                       |
| NewValue                       |
| ChangedBy                      |
| ChangedAt                      |
| IPAddress                      |
+--------------------------------+
```

Relationship

```text
Employees

1

────────────<

Many Audit Records
```

---

# SQL Implementation

## Step 1 — Create Business Table

```sql
CREATE TABLE Employees (
    EmployeeID INT PRIMARY KEY,
    EmployeeName VARCHAR(100),
    Salary DECIMAL(10,2)
);
```

---

## Step 2 — Create Audit Table

```sql
CREATE TABLE EmployeeAuditLog (

    AuditID INT PRIMARY KEY,

    EmployeeID INT,

    Action VARCHAR(30),

    OldValue VARCHAR(255),

    NewValue VARCHAR(255),

    ChangedBy VARCHAR(100),

    ChangedAt DATETIME,

    IPAddress VARCHAR(45),

    FOREIGN KEY (EmployeeID)
        REFERENCES Employees(EmployeeID)
);
```

---

## Step 3 — Update Employee

```sql
UPDATE Employees

SET Salary = 60000

WHERE EmployeeID = 101;
```

---

## Step 4 — Record Audit

```sql
INSERT INTO EmployeeAuditLog
VALUES
(
1,
101,
'Salary Updated',
'50000',
'60000',
'Admin',
'2026-07-27 10:15:00',
'192.168.1.20'
);
```

---

## Step 5 — View Audit History

```sql
SELECT *

FROM EmployeeAuditLog

WHERE EmployeeID = 101

ORDER BY ChangedAt;
```

### Output

| AuditID | Action | Old Value | New Value | Changed By |
|----------|---------|-----------|-----------|------------|
|1|Salary Updated|50000|60000|Admin|

The audit table preserves the complete history of changes while the **Employees** table stores only the latest values.

---

# How It Works

Business Table

```text
Latest Data
```

Audit Table

```text
Change 1

↓

Change 2

↓

Change 3

↓

Change 4
```

The audit table becomes a permanent timeline of business activity.

---

# What Should an Audit Record Contain?

A comprehensive audit record typically includes:

| Field | Purpose |
|--------|----------|
| AuditID | Unique identifier |
| TableName | Which table changed |
| RecordID | Which record changed |
| Action | INSERT / UPDATE / DELETE |
| OldValue | Previous data |
| NewValue | New data |
| ChangedBy | User or system |
| ChangedAt | Timestamp |
| IPAddress | Client IP |
| Device | Browser or device |
| SessionID | User session |
| Reason | Optional business reason |

---

# Real-World Examples

## HRMS

```text
Salary Updated

↓

Promotion

↓

Department Changed
```

---

## Banking

```text
Account Locked

↓

Loan Approved

↓

Transfer Authorised
```

---

## E-Commerce

```text
Order Cancelled

↓

Price Updated

↓

Refund Processed
```

---

## Hospital

```text
Medical Record Updated

↓

Prescription Changed

↓

Patient Discharged
```

---

## CRM

```text
Lead Assigned

↓

Opportunity Closed

↓

Customer Updated
```

---

## SaaS

```text
Role Changed

↓

API Key Created

↓

Workspace Deleted
```

---

# Enterprise Examples

| System | Typical Audit Events |
|----------|----------------------|
| ERP | Purchase Approved |
| Banking | Large Fund Transfer |
| CRM | Customer Data Updated |
| Hospital | Medical Record Access |
| Government | Citizen Record Modified |
| LMS | Grades Changed |
| GitHub | Repository Permission Changed |
| Salesforce | User Role Modified |

---

# Audit Log vs Status History

| Status History | Audit Log |
|----------------|-----------|
| Tracks workflow | Tracks actions |
| Business lifecycle | System activity |
| Focus on status | Focus on changes |
| Current + history | Complete audit trail |
| Workflow analysis | Security & compliance |

Example

Status History

```text
Pending

↓

Approved

↓

Completed
```

Audit Log

```text
User Logged In

↓

Order Created

↓

Price Changed

↓

Permission Updated

↓

Password Reset
```

---

# Advantages

✅ Complete accountability

✅ Security monitoring

✅ Regulatory compliance

✅ Easier troubleshooting

✅ Supports forensic investigations

✅ Improves transparency

---

# Disadvantages

❌ Rapid database growth

❌ Additional write operations

❌ Sensitive information requires protection

❌ Archiving strategy is necessary

---

# Performance Considerations

Audit tables often become the largest tables in an enterprise database.

Recommended practices:

- Index `RecordID`
- Index `ChangedAt`
- Partition by date
- Archive old records
- Compress historical data
- Store structured JSON only when appropriate

Many organisations move older audit records into a data warehouse after a defined retention period.

---

# Best Practices

✔ Never update audit records.

✔ Never delete audit records.

✔ Treat audit logs as append-only.

✔ Record timestamps using UTC.

✔ Store both old and new values.

✔ Capture user identity.

✔ Record request source (IP/API).

✔ Secure audit tables with strict permissions.

---

# Common Mistakes

## Editing Audit Records

❌ Bad

```text
UPDATE AuditLog
```

Audit records should be immutable.

---

## Logging Only Failures

Log both successful and unsuccessful operations.

Example:

```text
Login Successful

Login Failed

Password Changed

Permission Modified
```

---

## Missing User Information

Avoid:

```text
Updated Record
```

Instead record:

```text
Updated By

↓

John Smith

↓

Administrator
```

---

## Auditing Every Minor Change

Avoid logging temporary calculations or cache updates.

Focus on meaningful business and security events.

---

# Typical Audit Workflow

```text
User Login

↓

Open Employee Record

↓

Update Salary

↓

Save Changes

↓

Insert Audit Record

↓

Commit Transaction
```

The audit record is created as part of the same transaction to ensure consistency.

---

# Integration with Other Patterns

Audit Logs frequently work alongside:

| Pattern | Purpose |
|----------|---------|
| Lookup Table | Action types |
| Status History | Workflow tracking |
| Soft Delete | Record deletion events |
| Versioning | Historical document versions |
| Event Log | Publish events to other services |

---

# Security Considerations

Audit logs are sensitive.

Protect them by:

- Restricting read access
- Preventing updates
- Encrypting sensitive fields
- Recording failed login attempts
- Monitoring suspicious behaviour
- Retaining records according to organisational policy

---

# Compliance

Many industries require audit logs.

Examples include:

- GDPR
- HIPAA
- PCI DSS
- ISO 27001
- SOC 2
- Financial regulations
- Government compliance frameworks

Audit logs help demonstrate accountability during security reviews and regulatory inspections.

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB |
|---------|:-----:|:----------:|:----------:|:------:|:--------:|
| Triggers | ✅ | ✅ | ✅ | ✅ | ✅ |
| JSON Support | ✅ | ✅ | ✅ | ✅ | ✅ |
| Transactions | ✅ | ✅ | ✅ | ✅ | ✅ |
| Partitioning | ✅ | ✅ | ✅ | ✅ | ✅ |

---

# 💡 Did You Know?

Banks often retain audit logs for many years, even after an account is closed. These records are invaluable during fraud investigations, dispute resolution, security incidents, and regulatory audits because they provide a trusted history of who accessed or modified critical financial data.

---

# Interview Questions

## Basic

1. What is an Audit Log?
2. Why is an Audit Log important?
3. What information should an audit record contain?

## Intermediate

4. What is the difference between an Audit Log and Status History?
5. Why should audit logs be immutable?
6. Why are timestamps recorded in UTC?

## Advanced

7. How would you audit changes to multiple tables?
8. Should audit logging be implemented using triggers or application code? Discuss the trade-offs.
9. How would you archive billions of audit records?
10. How would you protect audit logs from unauthorised access?

---

# Hands-on Exercises

## Exercise 1

Design an Employee Audit System.

Record:

- Salary changes
- Department transfers
- Promotions

---

## Exercise 2

Design an E-Commerce Audit System.

Record:

- Order cancellation
- Price updates
- Refund approvals

---

## Exercise 3

Design a Banking Audit System.

Track:

- Login attempts
- Fund transfers
- Loan approvals
- Password changes

---

## Exercise 4

Design a SaaS Audit System.

Track:

- Workspace creation
- User invitations
- Role changes
- API key generation
- Subscription updates

---

## Exercise 5

Design a Hospital Audit System.

Track:

- Medical record access
- Prescription updates
- Patient discharge
- Billing modifications

Draw the ER diagram and identify which events require auditing.

---

# Related Patterns

- **03.09.04 — Status History Pattern**
- **03.09.06 — Soft Delete Pattern**
- **03.09.07 — Versioning Pattern**
- **03.09.11 — Event Log Pattern**

Audit Logs often complement these patterns to provide a complete history of business operations, security events, and data changes.

---

# Summary

The **Audit Log Pattern** provides a permanent, append-only record of important business and security events. Unlike Status History, which focuses on workflow progression, audit logs capture **who** performed an action, **what** changed, **when** it happened, and **where** the request originated. They are essential for security, compliance, troubleshooting, and forensic analysis, making them a core component of modern enterprise applications in banking, healthcare, e-commerce, ERP, government, and SaaS platforms.