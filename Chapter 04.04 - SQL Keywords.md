---
title: "04.04 - SQL Keywords"
description: "Learn what SQL keywords are, how they differ from identifiers, why reserved words exist, and how to use SQL keywords correctly. Understand SQL standards, vendor-specific keywords, and professional coding conventions."
chapter: 4
section: 4.4
category: SQL Fundamentals
difficulty: Beginner
readingTime: 35 min
lastUpdated: 2026-07-28
---

# 04.04 SQL Keywords

---

# Learning Objectives

After completing this lesson, you will be able to:

- Understand what SQL keywords are
- Differentiate keywords from identifiers
- Recognise commonly used SQL keywords
- Understand reserved vs non-reserved keywords
- Follow professional SQL coding conventions
- Avoid common keyword-related mistakes

---

# What are SQL Keywords?

**SQL keywords** are predefined words that have special meaning in the SQL language.

They tell the Database Management System (DBMS) **what action to perform**.

For example,

```sql
SELECT
```

tells the database:

> "Retrieve data."

Likewise,

```sql
INSERT
```

means:

> "Add new data."

The database recognises these words because they are part of the SQL language itself.

---

# Real-World Analogy

Think of SQL as a language.

In English:

```text
Run
Walk
Read
Write
```

are verbs.

Similarly, SQL has its own vocabulary.

```text
SELECT
INSERT
UPDATE
DELETE
CREATE
DROP
ALTER
```

Each keyword represents a specific database operation.

---

# Example

```sql
SELECT FirstName

FROM Employees

WHERE Department = 'IT';
```

Keywords:

```text
SELECT

FROM

WHERE
```

Identifiers:

```text
FirstName

Employees

Department
```

Literal:

```text
'IT'
```

---

# Visual Representation

```text
SELECT FirstName

FROM Employees

WHERE Department = 'IT';
```

```text
┌──────────┐
│ SELECT   │ ← Keyword
└──────────┘

┌────────────┐
│ FirstName │ ← Identifier
└────────────┘

┌──────────┐
│ FROM     │ ← Keyword
└──────────┘

┌────────────┐
│ Employees │ ← Identifier
└────────────┘

┌──────────┐
│ WHERE    │ ← Keyword
└──────────┘

┌────────────┐
│ Department │ ← Identifier
└────────────┘

┌──────────┐
│ 'IT'     │ ← Literal
└──────────┘
```

---

# Common SQL Keywords

## Data Retrieval

```text
SELECT

FROM

WHERE

GROUP BY

HAVING

ORDER BY

DISTINCT

LIMIT
```

---

## Data Manipulation

```text
INSERT

UPDATE

DELETE

MERGE
```

---

## Database Definition

```text
CREATE

ALTER

DROP

TRUNCATE

RENAME
```

---

## Transactions

```text
BEGIN

COMMIT

ROLLBACK

SAVEPOINT
```

---

## Security

```text
GRANT

REVOKE
```

---

## Joins

```text
JOIN

INNER JOIN

LEFT JOIN

RIGHT JOIN

FULL JOIN

CROSS JOIN
```

---

## Conditions

```text
AND

OR

NOT

IN

BETWEEN

LIKE

EXISTS

IS NULL
```

---

# SQL Keywords vs Identifiers

| SQL Keyword | Identifier |
|-------------|------------|
| Built into SQL | Created by the developer |
| Has predefined meaning | Represents a database object |
| Cannot change meaning | Can be chosen by the developer |
| Example: `SELECT` | Example: `Employees` |

Example:

```sql
SELECT

EmployeeID

FROM Employees;
```

| Word | Type |
|------|------|
| SELECT | Keyword |
| EmployeeID | Identifier |
| FROM | Keyword |
| Employees | Identifier |

---

# Reserved Keywords

Some keywords are **reserved**.

This means they **cannot normally be used as object names**.

Bad example:

```sql
CREATE TABLE SELECT
(
    ID INT
);
```

Most databases reject this.

---

# Escaping Reserved Words

Some DBMSs allow reserved words when quoted.

MySQL

```sql
CREATE TABLE `ORDER`
(
    ID INT
);
```

SQL Server

```sql
CREATE TABLE [ORDER]
(
    ID INT
);
```

PostgreSQL

```sql
CREATE TABLE "ORDER"
(
    ID INT
);
```

Although possible, it is generally discouraged.

---

# SQL Standard Keywords

The SQL standard defines hundreds of keywords.

Examples:

```text
SELECT

INSERT

UPDATE

DELETE

CREATE

ALTER

DROP

FROM

WHERE

GROUP

ORDER

JOIN

HAVING
```

Every major relational database supports these core keywords.

---

# Vendor-Specific Keywords

Different database systems provide additional keywords.

Examples:

MySQL

```text
AUTO_INCREMENT

SHOW

DESCRIBE
```

PostgreSQL

```text
RETURNING

ILIKE

SERIAL
```

SQL Server

```text
TOP

IDENTITY

GO
```

Oracle

```text
ROWNUM

CONNECT BY

MINUS
```

These are extensions and may not work in other DBMSs.

---

# Case Sensitivity

Keywords are generally **case-insensitive**.

These are equivalent:

```sql
SELECT *
FROM Employees;
```

```sql
select *
from employees;
```

```sql
SeLeCt *
FrOm Employees;
```

However, professional SQL uses:

```sql
SELECT
FROM
WHERE
```

in uppercase.

---

# SQL Formatting Convention

Professional style:

```sql
SELECT
    EmployeeID,
    FirstName,
    LastName

FROM Employees

WHERE Department = 'IT'

ORDER BY LastName;
```

This makes SQL easier to review and maintain.

---

# 🏗️ Architecture Insight

A SQL parser does **not** understand keywords based on colour or formatting in your editor.

It only sees a stream of tokens.

For example:

```sql
SELECT * FROM Employees;
```

Internally becomes:

```text
KEYWORD

IDENTIFIER

KEYWORD

IDENTIFIER
```

Syntax highlighting is provided by your SQL editor—not by the database itself.

---

# ⚡ Performance Tip

Writing:

```sql
select
```

instead of

```sql
SELECT
```

does **not** affect query performance.

The parser normalises keywords before processing them.

Choose uppercase keywords for readability, not speed.

---

# 🔒 Security Note

Avoid naming database objects after SQL keywords.

Bad:

```text
USER

ORDER

TABLE

GROUP

INDEX
```

Using reserved words often requires quoting, which increases complexity and reduces code portability.

---

# 🌍 Production Consideration

Enterprise systems often support multiple database engines.

Avoid vendor-specific keywords unless absolutely necessary.

Example:

Instead of relying on:

```text
TOP
```

(SQL Server)

prefer ANSI-standard approaches where possible, making migrations between MySQL, PostgreSQL, SQL Server, and Oracle much easier.

---

# 🚀 Enterprise Practice

Most development teams enforce SQL formatting through linters or code review standards.

A common convention is:

- SQL keywords in **UPPERCASE**
- Table names in `PascalCase` or `snake_case`
- Consistent indentation
- One clause per line
- Descriptive aliases

Consistent formatting improves readability and collaboration across large teams.

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB | SQLite |
|---------|:------:|:----------:|:----------:|:------:|:--------:|:------:|
| Standard SQL Keywords | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reserved Words | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Vendor Extensions | ✅ | ✅ | ✅ | ✅ | ✅ | Limited |

---

# Common Mistakes

## Using Reserved Words

```sql
CREATE TABLE SELECT
```

---

## Mixing Vendor Keywords

Using:

```sql
TOP
```

inside MySQL.

---

## Poor Formatting

```sql
select*from employees where id=1;
```

instead of properly formatted SQL.

---

# Best Practices

✔ Learn ANSI SQL keywords first.

✔ Write keywords in uppercase.

✔ Avoid reserved words as identifiers.

✔ Prefer portable SQL when possible.

✔ Follow your team's SQL style guide.

---

# 💡 Did You Know?

The SQL standard (ISO/IEC 9075) defines hundreds of keywords, but no single database implements every one of them exactly the same way. That's why modern relational databases remain largely compatible while still offering proprietary extensions such as PostgreSQL's `RETURNING`, SQL Server's `TOP`, and MySQL's `AUTO_INCREMENT`.

---

# Quick Reference

| Category | Examples |
|----------|----------|
| Retrieval | SELECT, FROM, WHERE |
| Manipulation | INSERT, UPDATE, DELETE |
| Definition | CREATE, ALTER, DROP |
| Transactions | COMMIT, ROLLBACK |
| Security | GRANT, REVOKE |
| Joins | JOIN, LEFT JOIN, RIGHT JOIN |

---

# Interview Questions

## Basic

1. What is an SQL keyword?
2. What is the difference between a keyword and an identifier?
3. Why are SQL keywords usually written in uppercase?

### Intermediate

4. What is a reserved keyword?
5. Why should developers avoid vendor-specific keywords?
6. Explain the difference between ANSI SQL keywords and proprietary SQL extensions.

### Advanced

7. How does the SQL parser recognise keywords?
8. Why can using reserved keywords reduce database portability?
9. What challenges arise when migrating SQL code between DBMSs?

---

# Hands-on Exercises

## Exercise 1

Identify the keywords in the following statement:

```sql
SELECT FirstName

FROM Employees

WHERE Department = 'Sales'

ORDER BY FirstName;
```

---

## Exercise 2

Separate the following into **keywords**, **identifiers**, and **literals**:

```sql
SELECT ProductName

FROM Products

WHERE Price > 100;
```

---

## Exercise 3

Research three vendor-specific SQL keywords used by:

- MySQL
- PostgreSQL
- SQL Server

Explain what each one does.

---

# Related Topics

- **04.01 — SQL Syntax**
- **04.02 — SQL Statements**
- **04.03 — SQL Processing Pipeline**
- **04.05 — SQL Clauses**
- **04.06 — SQL Operators & Expressions**
- **04.07 — SQL Command Categories**

---

# Summary

SQL keywords are predefined words that define the structure and behaviour of SQL statements. They form the vocabulary of the SQL language and instruct the DBMS to retrieve, modify, define, secure, and manage data. Understanding the difference between keywords, identifiers, and literals—and following standard SQL conventions—helps you write SQL that is readable, portable, and maintainable across different database systems.