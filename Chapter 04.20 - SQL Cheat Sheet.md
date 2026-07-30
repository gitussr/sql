---
title: "04.20 - SQL Cheat Sheet"
description: "A concise reference for SQL fundamentals, including syntax, execution order, command categories, clauses, operators, naming conventions, comments, identifiers, and enterprise best practices."
chapter: 4
section: 4.20
category: SQL Fundamentals
difficulty: Beginner → Advanced
readingTime: 20 min
lastUpdated: 2026-07-30
---

# 04.20 SQL Cheat Sheet

---

# Purpose

This chapter is a **quick reference guide** summarizing the most important SQL concepts covered in Chapter 04.

Use it when you need a reminder rather than a detailed explanation.

---

# SQL Statement Structure

```sql
SELECT column_list
FROM table_name
JOIN table_name
    ON join_condition
WHERE row_condition
GROUP BY column_list
HAVING group_condition
ORDER BY column_list
LIMIT n;
```

---

# Logical Execution Order ⭐

The **written order** of a SQL query differs from its **logical execution order**.

| Step | Clause | Purpose |
|------|---------|---------|
| 1 | FROM | Identify source tables |
| 2 | JOIN | Combine related tables |
| 3 | WHERE | Filter rows |
| 4 | GROUP BY | Form groups |
| 5 | HAVING | Filter groups |
| 6 | SELECT | Project columns |
| 7 | DISTINCT | Remove duplicates |
| 8 | ORDER BY | Sort rows |
| 9 | LIMIT / FETCH / TOP | Restrict output |

> **Remember:** This is the logical order used to reason about SQL, not necessarily the physical execution plan chosen by the optimizer.

---

# SQL Command Categories

| Category | Purpose | Examples |
|----------|---------|----------|
| DDL | Define database objects | CREATE, ALTER, DROP, TRUNCATE |
| DML | Modify data | INSERT, UPDATE, DELETE, MERGE |
| DQL | Retrieve data | SELECT |
| DCL | Manage permissions | GRANT, REVOKE |
| TCL | Manage transactions | COMMIT, ROLLBACK, SAVEPOINT |

---

# Common SQL Clauses

| Clause | Purpose |
|---------|---------|
| SELECT | Choose columns |
| FROM | Specify source tables |
| JOIN | Combine tables |
| WHERE | Filter rows |
| GROUP BY | Create groups |
| HAVING | Filter groups |
| ORDER BY | Sort output |
| DISTINCT | Remove duplicates |
| LIMIT / FETCH / TOP | Limit returned rows |

---

# SQL Operators

### Arithmetic

```text
+
-
*
/
%
```

### Comparison

```text
=
<>
!=
<
<=
>
>=
```

### Logical

```text
AND

OR

NOT
```

### Special

```text
LIKE

IN

BETWEEN

EXISTS

ANY

ALL

IS NULL

IS NOT NULL
```

---

# SQL Comments

Single-line

```sql
-- Comment
```

Multi-line

```sql
/*
Comment
*/
```

---

# SQL Identifiers

Examples:

```text
Database

Schema

Table

Column

View

Index

Constraint

Trigger

Procedure

Function
```

Guidelines:

- Be descriptive.
- Avoid spaces.
- Avoid special characters.
- Avoid reserved words.
- Follow one naming convention consistently.

---

# Naming Conventions

Recommended object names:

| Object | Example |
|---------|----------|
| Table | Customers |
| Column | CustomerName |
| Primary Key | CustomerID |
| Foreign Key | CustomerID |
| Index | IX_Customers_Email |
| Primary Key Constraint | PK_Customers |
| Foreign Key Constraint | FK_Orders_Customers |
| Check Constraint | CHK_Employee_Age |
| Trigger | TRG_Orders_Insert |

---

# Formatting Rules

✔ Capitalize SQL keywords.

✔ One column per line.

✔ One JOIN per line.

✔ Indent subqueries.

✔ Align JOIN conditions.

✔ Keep related clauses together.

✔ Use meaningful aliases.

Example:

```sql
SELECT
    c.CustomerName,
    o.OrderDate
FROM Customers AS c
INNER JOIN Orders AS o
    ON c.CustomerID = o.CustomerID
WHERE o.Status = 'Completed'
ORDER BY o.OrderDate DESC;
```

---

# Reserved Words

Avoid using SQL keywords as identifiers.

Instead of:

```text
Order

User

Group

Table
```

Prefer:

```text
Orders

Users

CustomerGroups

CustomerTable
```

---

# SQL Processing Pipeline

```text
SQL Statement
      │
      ▼
Lexer / Tokenizer
      │
      ▼
Parser
      │
      ▼
Syntax Tree
      │
      ▼
Semantic Analyzer
      │
      ▼
Optimizer
      │
      ▼
Execution Plan
      │
      ▼
Execution Engine
      │
      ▼
Result Set
```

---

# SQL Execution Flow

```text
Written SQL

↓

Logical Processing

↓

Optimizer

↓

Physical Execution Plan

↓

Execution Engine

↓

Result Set
```

---

# SQL Style Guide

✔ Uppercase SQL keywords.

✔ Descriptive table names.

✔ Descriptive column names.

✔ Consistent aliases.

✔ Consistent indentation.

✔ Explicit JOIN syntax.

✔ Named constraints.

✔ Self-documenting SQL.

---

# Transaction Commands

```sql
BEGIN;

COMMIT;

ROLLBACK;

SAVEPOINT sp1;

ROLLBACK TO sp1;
```

---

# Security Checklist

✔ Use parameterized queries.

✔ Apply least privilege.

✔ Use roles instead of individual grants.

✔ Validate input.

✔ Protect sensitive data.

✔ Audit privileged operations.

---

# Performance Checklist

✔ Filter early.

✔ Index appropriately.

✔ Avoid unnecessary SELECT *.

✔ Review execution plans.

✔ Avoid unnecessary sorting.

✔ Prefer set-based operations.

✔ Keep transactions short.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Row Limiting | FETCH FIRST | LIMIT / FETCH | LIMIT | TOP / OFFSET-FETCH | FETCH FIRST | LIMIT |
| Identifier Quotes | "name" | "name" | `name` (default), "name" with ANSI mode | [name] or "name" | "name" | "name" |
| Auto Increment | Identity (standard options) | SERIAL / IDENTITY | AUTO_INCREMENT | IDENTITY | IDENTITY / Sequences | INTEGER PRIMARY KEY |
| Case Sensitivity | Standard-defined rules | Configurable behavior | Platform/config dependent | Generally case-insensitive identifiers | Preserves quoted case | Generally case-insensitive |

> **Tip:** Learn ANSI SQL first, then understand the vendor-specific extensions you use in production.

---

# Enterprise Checklist

Before deploying SQL:

- [ ] Naming conventions followed
- [ ] SQL formatted consistently
- [ ] Constraints explicitly named
- [ ] Indexes reviewed
- [ ] Transactions appropriate
- [ ] Security reviewed
- [ ] Execution plan checked
- [ ] Comments updated
- [ ] Tested on realistic data volumes
- [ ] Migration scripts version-controlled

---

# Interview Rapid Revision

Be able to explain:

- SQL processing pipeline
- Logical execution order
- DDL vs DML vs DQL
- ACID properties
- Isolation levels
- Primary vs Foreign Keys
- One-to-One, One-to-Many, Many-to-Many
- Referential integrity
- Cascade actions
- SQL identifiers
- Reserved words
- Naming conventions
- SQL formatting
- Query optimizer
- Execution plans

---

# Related Topics

- **Chapter 03 — Database Design**
- **Chapter 05 — SELECT Statement**
- **Chapter 06 — Filtering & Sorting**
- **Chapter 07 — Joins**
- **Chapter 08 — Aggregate Functions**
- **Chapter 09 — Subqueries & CTEs**

---

# Summary

Chapter 04 introduced the language of SQL—from its syntax and processing pipeline to execution order, command categories, identifiers, naming conventions, formatting standards, reserved words, and enterprise practices. This cheat sheet consolidates those concepts into a practical reference for day-to-day SQL development. As you move into Chapter 05 and begin writing queries, revisit this chapter whenever you need a quick reminder of SQL fundamentals or professional coding standards.