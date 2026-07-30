I think this is the point where your handbook should transition from **"learning SQL"** to **"thinking like a database architect."**

For the previous case studies, we focused on relationships. A **Banking System** is different—it's the first domain where **data correctness is more important than convenience**.

I would therefore expand the structure slightly. This becomes the template for all future enterprise systems (ERP, Finance, Insurance, Airline, etc.).

---

```md
---
title: "03.08.09.05 - Real-World Relationship Case Study: Banking System"
description: "Learn how enterprise banking systems are designed using relational databases. Explore customers, accounts, transactions, audit logs, branches, loans, ACID transactions, master-detail relationships, partitioning, and multi-branch architecture."
chapter: 3
section: 3.8.9.5
category: Core SQL Concepts
difficulty: Advanced
readingTime: 90 min
lastUpdated: 2026-07-27
---
```

# 03.08.09.05 Banking System

## Learning Objectives

After completing this lesson, you will be able to:

* Design an enterprise banking database
* Understand why banking systems depend on ACID properties
* Build secure account and transaction relationships
* Design audit-ready database schemas
* Understand Master–Detail relationships
* Design multi-branch banking systems
* Learn why banks almost never delete data

---

# Introduction

A banking system is one of the most demanding database applications in the world.

Unlike an e-commerce website, banking systems cannot tolerate:

* Lost transactions
* Duplicate transfers
* Missing balances
* Incorrect interest calculations
* Accidental data deletion

Every transaction must be:

* Accurate
* Recoverable
* Auditable
* Secure

This is why banks rely heavily on relational databases.

---

# Business Requirements

The bank should support:

* Customers
* Multiple bank accounts
* Savings & Current accounts
* Branches
* Employees
* Transactions
* Money transfers
* Loans
* Debit cards
* Credit cards
* Fixed deposits
* Nominees
* Statements
* Audit history

---

# Step 1 — Identify Entities

| Entity             | Purpose              |
| ------------------ | -------------------- |
| Customers          | Customer information |
| Branches           | Bank branches        |
| Employees          | Bank staff           |
| Accounts           | Customer accounts    |
| Transactions       | Money movement       |
| TransactionDetails | Debit/Credit entries |
| Beneficiaries      | Transfer recipients  |
| Loans              | Loan accounts        |
| LoanPayments       | EMI history          |
| Cards              | Debit/Credit cards   |
| Nominees           | Legal nominees       |
| Statements         | Monthly statements   |
| AuditLogs          | Compliance history   |
| StatusHistory      | Status tracking      |
| Currency           | Lookup table         |

---

# Step 2 — Relationship Analysis

| Parent                           | Child       | Relationship |
| -------------------------------- | ----------- | ------------ |
| Branch → Employees               | One-to-Many |              |
| Branch → Accounts                | One-to-Many |              |
| Customer → Accounts              | One-to-Many |              |
| Customer → Loans                 | One-to-Many |              |
| Customer → Cards                 | One-to-Many |              |
| Customer → Beneficiaries         | One-to-Many |              |
| Customer → Nominees              | One-to-Many |              |
| Account → Transactions           | One-to-Many |              |
| Transaction → TransactionDetails | One-to-Many |              |
| Loan → LoanPayments              | One-to-Many |              |
| Account → Statements             | One-to-Many |              |
| Employees → AuditLogs            | One-to-Many |              |
| Accounts → StatusHistory         | One-to-Many |              |

---

# Enterprise ER Diagram

```text
Branches
    │
    ├────────── Employees
    │
    └────────── Accounts
                    │
          ┌─────────┼─────────┐
          ▼         ▼         ▼
 Transactions  Statements  StatusHistory
      │
      ▼
TransactionDetails

Customers
   │
   ├──────── Accounts
   ├──────── Loans
   ├──────── Cards
   ├──────── Beneficiaries
   └──────── Nominees

Loans
    │
    ▼
LoanPayments

Employees
     │
     ▼
AuditLogs
```

---

# Relationship Breakdown

## One-to-Many

Customer

↓

Accounts

A customer may own multiple accounts.

---

Branch

↓

Accounts

Each account belongs to one branch.

---

Account

↓

Transactions

An account contains thousands or millions of transactions.

---

Loan

↓

LoanPayments

Each loan contains many repayments.

---

## Master–Detail Relationship

One of the most important banking patterns.

```
Transactions

↓

TransactionDetails
```

Example

```
Transaction

Transfer ₹5,000

↓

Debit Entry

↓

Credit Entry
```

The transaction acts as the **Master**.

Each accounting entry becomes a **Detail**.

This allows complete auditability.

---

# ACID Transactions

Banking systems rely on **ACID** properties.

| Property    | Meaning                                    |
| ----------- | ------------------------------------------ |
| Atomicity   | All operations succeed or none do          |
| Consistency | Database rules are always maintained       |
| Isolation   | Concurrent transactions remain independent |
| Durability  | Committed transactions survive failures    |

Example:

```
Transfer ₹5,000

Account A

↓

Debit ₹5,000

↓

Credit ₹5,000

↓

Commit
```

If the credit fails:

```
Rollback
```

Neither account changes.

This prevents inconsistent balances.

---

# Audit Tables

Banks never rely only on application logs.

Every important change is recorded.

Example

```
AuditLogs

AuditID

EmployeeID

Action

OldValue

NewValue

Timestamp

IPAddress
```

Audit tables answer questions like:

> Who changed this account?

> When was it changed?

> What was the previous value?

---

# Soft Deletes vs Hard Deletes

Banks almost never perform:

```sql
DELETE FROM Accounts;
```

Instead:

```text
Status = Closed

ClosedDate = 2026-07-01
```

The record remains for:

* Compliance
* Legal investigations
* Tax reporting
* Auditing

Hard deletes are generally reserved for temporary or test data.

---

# Status History Tables

Instead of storing only:

```
AccountStatus

= Active
```

Banks store:

```
StatusHistory

↓

Active

↓

Frozen

↓

Blocked

↓

Closed
```

Example table:

| StatusHistoryID | AccountID | Status | EffectiveFrom |
| --------------- | --------- | ------ | ------------- |
| 1               | 101       | Active | 2024-01-15    |
| 2               | 101       | Frozen | 2025-03-02    |
| 3               | 101       | Active | 2025-03-10    |

This preserves a complete timeline of state changes.

---

# Lookup (Reference) Tables

Instead of storing free-text values repeatedly:

```
Savings

Savings

Savings

Savings
```

Use:

```
AccountTypes

1 Savings

2 Current

3 Salary

4 Fixed Deposit
```

Benefits:

* Smaller storage
* Better consistency
* Easier reporting
* Centralised maintenance

Other common lookup tables include:

* Transaction Types
* Currency Codes
* Countries
* Loan Types
* Card Types
* Customer Status

---

# Slowly Changing Dimensions (SCD)

Customers change information over time:

Old address:

```
London
```

New address:

```
Manchester
```

Some systems overwrite the value.

Banks often preserve history.

```
CustomerAddressHistory

↓

Old Address

↓

New Address

↓

Effective Dates
```

This concept is known as a **Slowly Changing Dimension (SCD)** and is widely used in data warehouses and analytical systems.

---

# Multi-Branch Architecture

Large banks operate thousands of branches.

```
Branches

↓

Accounts

↓

Transactions
```

Every account belongs to a branch.

Every employee belongs to a branch.

Reports can then be generated:

* Per branch
* Per city
* Per region
* Nationwide

---

# Multi-Tenant Architecture

Some banking platforms serve multiple banks using the same software.

```
Tenant

↓

Branches

↓

Customers

↓

Accounts
```

Every table includes:

```
TenantID
```

This ensures one bank cannot access another bank's data.

---

# Partitioning Considerations

Transaction tables grow extremely quickly.

Instead of one enormous table:

```
Transactions
```

Banks partition data by:

* Year
* Month
* Branch
* Region

Benefits:

* Faster queries
* Easier backups
* Improved maintenance
* Better scalability

---

# Performance Considerations

Enterprise banking databases require:

* Indexes on AccountID, CustomerID, TransactionDate, BranchID
* Optimised execution plans
* Read replicas for reporting
* Archiving historical statements
* Efficient partitioning of transaction tables

---

# Security Considerations

Banking systems require strong security.

Recommended practices:

* Encrypt sensitive customer information.
* Never store PINs in plain text.
* Tokenise or securely handle payment credentials.
* Enforce Role-Based Access Control (RBAC).
* Record every administrative action in audit logs.
* Use database transactions for financial operations.

---

# DBMS Compatibility

| Feature           | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB |
| ----------------- | :---: | :--------: | :--------: | :----: | :-----: |
| ACID Transactions |   ✅   |      ✅     |      ✅     |    ✅   |    ✅    |
| Foreign Keys      |   ✅   |      ✅     |      ✅     |    ✅   |    ✅    |
| Audit Tables      |   ✅   |      ✅     |      ✅     |    ✅   |    ✅    |
| Partitioning      |   ✅   |      ✅     |      ✅     |    ✅   |    ✅    |
| Window Functions  |   ✅   |      ✅     |      ✅     |    ✅   |    ✅    |

---

# 💡 Did You Know?

Banks typically **never calculate an account balance by storing only one "CurrentBalance" value**.

Instead, the balance is derived from a complete ledger of debit and credit transactions, with cached balances maintained for performance. This ledger-first approach provides traceability, supports auditing, and helps ensure financial accuracy.

---

# Interview Questions

1. Why are ACID properties essential in banking?
2. What is a Master–Detail relationship?
3. Why are audit tables mandatory?
4. Why do banks prefer soft deletes?
5. What are lookup tables?
6. What is a Slowly Changing Dimension (SCD)?
7. Why partition transaction tables?
8. Why should account balances be auditable?

---

# Hands-on Exercises

### Exercise 1

Draw the ER diagram for the banking system.

---

### Exercise 2

Design tables for:

* Customers
* Accounts
* Transactions
* TransactionDetails
* Loans
* AuditLogs

---

### Exercise 3

Design a money transfer process that:

* Debits one account
* Credits another account
* Rolls back if any step fails

Describe how ACID properties protect the operation.

---

### Exercise 4

Design lookup tables for:

* Account Types
* Transaction Types
* Loan Types
* Customer Status

---

### Exercise 5

Extend the schema to support:

* Mobile Banking
* Internet Banking
* ATM Transactions
* UPI/Faster Payments/Real-Time Payments (region-specific)
* Foreign Currency Accounts
* Fraud Detection Alerts

Identify the additional entities and relationships.

---

# Summary

This case study introduced enterprise database design concepts through a banking system. In addition to standard relationships, you explored ACID transactions, Master–Detail patterns, audit logging, soft deletes, status history, lookup tables, Slowly Changing Dimensions, partitioning, and multi-branch/multi-tenant architecture.

These patterns are foundational for building secure, scalable, and auditable financial systems.

---

# Related Topics

### Previous Lessons

* 03.08.09.01 — Student Management System
* 03.08.09.02 — E-Commerce Platform
* 03.08.09.03 — Hospital Management System
* 03.08.09.04 — Human Resource Management System (HRMS)

### Next Lesson

**03.08.09.06 — Real-World Relationship Case Study: Social Media Platform**

```