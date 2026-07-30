---
title: "04.14 - SQL Comments"
description: "Learn how to write clear, maintainable SQL using comments. Understand single-line and multi-line comments, documentation standards, enterprise best practices, and common pitfalls."
chapter: 4
section: 4.14
category: SQL Fundamentals
difficulty: Beginner → Intermediate
readingTime: 25 min
lastUpdated: 2026-07-30
---

# 04.14 SQL Comments

---

# Learning Objectives

After completing this lesson, you will be able to:

- Understand the purpose of SQL comments.
- Differentiate single-line and multi-line comments.
- Write self-documenting SQL code.
- Learn enterprise documentation practices.
- Avoid common commenting mistakes.
- Understand when comments improve code quality and when they become technical debt.

---

# What are SQL Comments?

**SQL comments** are notes written inside SQL code that are **ignored by the database engine** during execution.

Comments are intended for **humans**, not the DBMS.

They help explain:

- Business logic
- Complex calculations
- Temporary code
- Query intent
- Maintenance information
- Deployment notes

---

# Why Comments Matter

Consider two queries.

Without comments:

```sql
SELECT *
FROM Orders
WHERE Status = 'P'
AND Amount > 5000;
```

A new developer may not know:

- What does `P` mean?
- Why 5000?
- Is this business logic?

Now with comments:

```sql
-- Retrieve high-value pending orders
-- Status 'P' = Pending Approval
-- Used by Finance Dashboard

SELECT *
FROM Orders
WHERE Status = 'P'
AND Amount > 5000;
```

The second query is much easier to understand.

---

# Types of SQL Comments

Most SQL databases support two primary comment styles.

## Single-Line Comment

Uses two hyphens.

```sql
-- Display all active customers

SELECT *
FROM Customers;
```

Everything after `--` on that line is ignored.

---

## Multi-Line Comment

Uses `/* */`.

```sql
/*
Generate monthly sales report.

Author:
Finance Team

Purpose:
Used by management dashboard.
*/

SELECT *
FROM Sales;
```

Useful for documenting larger sections of code.

---

# Visual Representation

```text
SQL Script

│

├── Comments
│      │
│      ├── Single-Line
│      └── Multi-Line
│
└── Executable SQL
```

Only executable SQL is processed by the database engine.

---

# How the SQL Parser Treats Comments

Internally, comments are removed before parsing.

```text
SQL Script

↓

Comment Removal

↓

Lexer

↓

Parser

↓

Optimizer

↓

Execution Engine
```

Comments do **not** affect execution plans.

---

# Common Uses of Comments

Developers commonly use comments to:

- Explain business rules.
- Describe complex joins.
- Document assumptions.
- Mark TODO items.
- Temporarily disable code.
- Identify script authors.
- Record deployment notes.

---

# Commenting Complex Queries

Example:

```sql
-- Calculate yearly revenue
-- Excludes cancelled orders

SELECT
    SUM(TotalAmount) AS Revenue
FROM Orders
WHERE Status <> 'Cancelled';
```

The comment explains **why** the query exists.

---

# Commenting Stored Procedures

Example:

```sql
/*
Procedure:
UpdateCustomerStatus

Purpose:
Updates customer loyalty tier
after yearly purchase evaluation.

Author:
Database Team

Last Modified:
2026-07-30
*/
```

Enterprise environments often require procedure headers.

---

# Commenting Migration Scripts

Example:

```sql
/*
Migration:
V1.12

Purpose:
Add EmailVerified column.

Reason:
Support new authentication module.
*/
```

Migration comments help future developers understand schema evolution.

---

# Temporarily Disabling SQL

Developers sometimes comment out code while debugging.

```sql
SELECT *
FROM Orders

-- WHERE Status = 'Pending';
```

Or:

```sql
/*
DELETE FROM Orders;
*/
```

> **Important:** Commenting out destructive statements is useful during development, but do not rely on comments as a long-term version control mechanism.

---

# Self-Documenting SQL vs Comments

Good SQL often reduces the need for excessive comments.

Less clear:

```sql
SELECT *
FROM T1;
```

More descriptive:

```sql
SELECT *
FROM CustomerOrders;
```

Clear table names, aliases, and column names reduce the need for explanatory comments.

---

# Enterprise Documentation Standards

Many organisations require standard comment headers.

Example:

```text
Script Name

Author

Created Date

Modified Date

Purpose

Dependencies

Change History

Ticket Number
```

These headers improve maintainability and auditability.

---

# 🏗️ Architecture Insight

Comments are ignored by the execution engine, but they remain valuable throughout the software development lifecycle. Code review tools, migration frameworks, and documentation generators often preserve comments, making them an important communication mechanism among developers.

---

# ⚡ Performance Tip

SQL comments do **not** improve query performance.

However, well-documented SQL often reduces maintenance time, making performance tuning easier because future engineers can understand the original design decisions.

---

# 🔒 Security Note

Never place sensitive information inside comments.

Avoid including:

- Passwords
- API keys
- Connection strings
- Personal data
- Confidential business information

Comments are frequently stored in version control systems and deployment artifacts.

---

# 🌍 Production Consideration

Production SQL scripts should contain meaningful documentation for:

- Database migrations
- Stored procedures
- Scheduled jobs
- ETL pipelines
- Reporting queries

Operational teams often rely on these comments during troubleshooting.

---

# 🚀 Enterprise Practice

Many organisations establish SQL commenting standards as part of their coding guidelines. Code reviews verify not only correctness and performance but also whether complex queries are sufficiently documented for future maintenance.

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB | SQLite |
|----------|:------:|:----------:|:----------:|:------:|:--------:|:------:|
| `--` Single-Line Comments | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/* ... */` Multi-Line Comments | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Optimizer Ignores Comments | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

> **Note:** Some DBMSs also support vendor-specific comment syntax (such as MySQL's executable comments), which will be covered later in DBMS-specific chapters.

---

# Common Mistakes

- Explaining **what** the SQL does instead of **why** it exists.
- Leaving outdated comments after code changes.
- Commenting every line unnecessarily.
- Storing sensitive information in comments.
- Using comments instead of meaningful object names.

---

# Best Practices

✔ Explain business intent rather than obvious syntax.

✔ Keep comments accurate and up to date.

✔ Use descriptive table and column names.

✔ Document complex logic and assumptions.

✔ Follow your team's commenting standards.

✔ Remove obsolete comments during refactoring.

---

# 💡 Did You Know?

Large enterprise databases may contain SQL scripts that remain in production for decades. Clear comments often become the only reliable source of business context after the original developers have left the organisation.

---

# Quick Reference

| Comment Type | Syntax | Typical Use |
|--------------|--------|-------------|
| Single-Line | `-- Comment` | Short explanations |
| Multi-Line | `/* Comment */` | Script headers, documentation |
| Temporary Disable | `/* SQL */` | Testing during development |

---

# Interview Questions

## Basic

1. What are SQL comments?
2. What is the difference between single-line and multi-line comments?
3. Do comments affect SQL execution?

### Intermediate

4. Why should comments explain **why** rather than **what**?
5. When should multi-line comments be preferred?
6. What information is typically included in enterprise SQL script headers?

### Advanced

7. How can poor commenting practices increase technical debt?
8. Why should comments never replace meaningful schema design?
9. Design a commenting standard for your database development team.

---

# Hands-on Exercises

### Exercise 1

Rewrite a complex SQL query by adding meaningful comments that explain the business logic.

### Exercise 2

Create a standard header template for stored procedures used by your organisation.

### Exercise 3

Review an existing SQL script and identify comments that are outdated, redundant, or misleading.

### Exercise 4

Compare self-documenting SQL (descriptive names) with heavily commented SQL. Discuss which is easier to maintain and why.

---

# Related Topics

- **04.01 — SQL Syntax**
- **04.03 — SQL Processing Pipeline**
- **05.xx — SELECT Statement**
- **05.xx — Stored Procedures**
- **09.xx — Database Documentation**
- **09.xx — Database Coding Standards**

---

# Summary

SQL comments are ignored by the database engine but play a vital role in software maintenance and collaboration. Effective comments explain the business intent, assumptions, and context behind SQL code rather than repeating obvious syntax. In enterprise environments, consistent commenting standards improve maintainability, simplify code reviews, support audits, and help future engineers understand complex database logic years after it was originally written.