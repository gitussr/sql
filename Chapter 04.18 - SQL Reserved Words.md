---
title: "04.18 - SQL Reserved Words"
description: "Learn what SQL reserved words are, why they exist, how different DBMSs handle them, how quoted identifiers work, and how to avoid naming conflicts when designing professional database schemas."
chapter: 4
section: 4.18
category: SQL Fundamentals
difficulty: Beginner → Intermediate
readingTime: 30 min
lastUpdated: 2026-07-30
---

# 04.18 SQL Reserved Words

---

# Learning Objectives

After completing this lesson, you will be able to:

- Understand what SQL reserved words are.
- Differentiate reserved words, keywords, and identifiers.
- Avoid naming conflicts in database design.
- Use quoted identifiers when necessary.
- Understand DBMS-specific differences.
- Follow enterprise naming practices.

---

# What are SQL Reserved Words?

A **reserved word** is a word that has a predefined meaning in the SQL language and **cannot normally be used as an identifier without special handling**.

The SQL parser treats these words as part of the SQL grammar rather than as object names.

Examples include:

```text
SELECT
FROM
WHERE
JOIN
TABLE
CREATE
INSERT
UPDATE
DELETE
GROUP
ORDER
HAVING
```

When the parser encounters these words, it expects them to perform their language-defined role.

---

# Why Reserved Words Exist

Every programming language reserves certain words.

Consider C:

```c
int
if
while
return
```

Or Python:

```python
if
for
while
class
def
return
```

Similarly, SQL reserves words that define its syntax.

Without reserved words, the parser could not reliably distinguish commands from identifiers.

---

# Keywords vs Reserved Words

These terms are often used interchangeably, but they are not always identical.

### SQL Keywords

Words that have a special meaning in SQL.

Examples:

```text
SELECT
JOIN
WHERE
GROUP BY
ORDER BY
```

Some keywords may still be allowed as identifiers in certain DBMSs.

---

### Reserved Words

Words that a DBMS does **not** allow to be used as identifiers unless they are quoted or escaped.

Every reserved word is a keyword, but not every keyword is necessarily reserved.

---

# Identifiers vs Reserved Words

Consider the following:

```sql
CREATE TABLE Orders
(
    OrderID INT
);
```

`Orders` is an identifier.

Now consider:

```sql
CREATE TABLE SELECT
(
    ID INT
);
```

Here, `SELECT` is interpreted as a language keyword rather than a table name, leading to a syntax error.

---

# Common SQL Reserved Words

Frequently encountered reserved words include:

```text
SELECT
FROM
WHERE
INSERT
UPDATE
DELETE
CREATE
ALTER
DROP
TABLE
VIEW
INDEX
PRIMARY
FOREIGN
KEY
GROUP
ORDER
HAVING
DISTINCT
UNION
JOIN
INNER
LEFT
RIGHT
FULL
ON
IN
BETWEEN
LIKE
NULL
VALUES
INTO
AS
```

> The complete list varies between SQL standards and database vendors.

---

# What Happens if You Use One?

Example:

```sql
CREATE TABLE Order
(
    ID INT
);
```

Many DBMSs will reject this because `ORDER` is part of the SQL grammar (used in `ORDER BY`).

---

# Quoted Identifiers

ANSI SQL allows reserved words to be used as identifiers by quoting them.

```sql
CREATE TABLE "Order"
(
    "Select" INT
);
```

This is syntactically valid in many databases.

However, it introduces additional complexity.

Every future reference must also be quoted:

```sql
SELECT *
FROM "Order";
```

---

# Why Quoted Reserved Words Are Discouraged

Although technically possible, using reserved words as identifiers is rarely a good idea.

Problems include:

- Reduced readability
- Portability issues
- Frequent quoting
- ORM compatibility problems
- Higher maintenance cost

Prefer:

```text
Orders
```

Instead of:

```text
Order
```

Or:

```text
CustomerOrders
```

Instead of:

```text
Order
```

---

# Visual Representation

```text
SQL Parser

        │

        ▼

Identifier?

        │

   Yes ─────► Lookup Object

        │

        ▼

Reserved Word?

        │

Yes ─────────► SQL Grammar

No ──────────► Identifier Resolution
```

---

# DBMS Differences

Not every database reserves the same words.

Examples:

- PostgreSQL
- MySQL
- SQL Server
- Oracle
- SQLite
- MariaDB

Each vendor publishes its own reserved word list.

Some words that are legal in one database may be reserved in another.

---

# Case Sensitivity

Reserved words are generally case-insensitive.

These are treated equivalently:

```text
SELECT

select

Select
```

Quoted identifiers, however, may preserve case depending on the DBMS.

---

# Future Compatibility

Avoid using words that **may become reserved in future SQL standards or DBMS versions**.

A legal identifier today could become invalid after an upgrade.

Choosing descriptive business names reduces this risk.

---

# Enterprise Naming Strategy

Professional teams usually establish rules such as:

✔ Never use reserved words.

✔ Never depend on quoted identifiers.

✔ Prefer descriptive business names.

✔ Follow organisation-wide naming conventions.

This improves portability across database platforms.

---

# 🏗️ Architecture Insight

During parsing, the SQL lexer classifies tokens before semantic analysis begins. Reserved words are immediately recognised as language tokens, while potential identifiers are passed forward for object resolution. This distinction allows the parser to interpret SQL statements unambiguously.

---

# ⚡ Performance Tip

Reserved words have **no direct effect on execution performance**. However, avoiding them prevents unnecessary quoting and improves code readability, making maintenance and troubleshooting more efficient.

---

# 🔒 Security Note

Using quoted reserved words can make dynamically generated SQL harder to construct safely. Consistent, non-reserved identifiers reduce the risk of mistakes when building parameterised queries or integrating with ORMs.

---

# 🌍 Production Consideration

Schema objects often outlive the applications that use them. Choosing identifiers that are independent of vendor-specific reserved word lists improves portability, simplifies migrations, and reduces the risk of upgrade-related issues.

---

# 🚀 Enterprise Practice

Many engineering teams automatically validate schema names during code review or CI/CD using SQL linters and migration tools. These checks reject object names that conflict with reserved words or violate internal naming standards.

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB | SQLite |
|----------|:------:|:----------:|:----------:|:------:|:--------:|:------:|
| Reserved Word List | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Quoted Identifiers | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Vendor-Specific Reserved Words | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

> **Note:** Always consult your DBMS documentation for the current list of reserved words, as it may change between versions.

---

# Common Mistakes

- Naming tables `Order`, `User`, or `Group`.
- Assuming every DBMS reserves the same words.
- Overusing quoted identifiers.
- Forgetting to quote reserved-word identifiers consistently.
- Ignoring future portability.

---

# Best Practices

✔ Avoid reserved words for object names.

✔ Use descriptive business-oriented identifiers.

✔ Prefer `Orders` instead of `Order`.

✔ Check vendor documentation before finalising schema names.

✔ Use quoted identifiers only when absolutely necessary.

---

# 💡 Did You Know?

The SQL standard defines hundreds of keywords, but each DBMS decides which of them are treated as reserved. As a result, an identifier that works perfectly in one database engine may cause a syntax error in another.

---

# Quick Reference

| Reserved Word | Better Identifier |
|---------------|-------------------|
| Order | Orders |
| User | Users |
| Group | CustomerGroups |
| Table | CustomerTable |
| Index | ProductIndexLog |
| Select | CustomerSelection |

---

# Interview Questions

## Basic

1. What is an SQL reserved word?
2. How does a reserved word differ from an identifier?
3. Why should reserved words be avoided in schema design?

### Intermediate

4. Explain the difference between keywords and reserved words.
5. What are quoted identifiers?
6. Why are quoted identifiers discouraged in enterprise systems?

### Advanced

7. How does the SQL parser distinguish reserved words from identifiers?
8. Why do reserved word lists differ across DBMSs?
9. Design a naming strategy that avoids reserved word conflicts while remaining portable across PostgreSQL, MySQL, SQL Server, Oracle, and SQLite.

---

# Hands-on Exercises

### Exercise 1

Review a sample schema and identify any object names that conflict with common SQL reserved words. Rename them using descriptive business terms.

### Exercise 2

Research the reserved word list for your preferred DBMS. Compare it with the SQL standard and note any vendor-specific additions.

### Exercise 3

Create a table using a quoted reserved word as its name (in a test database). Observe how every subsequent reference must also be quoted.

### Exercise 4

Write a short guideline explaining when quoted identifiers should and should not be used in your team's database projects.

---

# Related Topics

- **04.04 — SQL Keywords**
- **04.15 — SQL Identifiers**
- **04.16 — SQL Naming Conventions & Coding Standards**
- **04.17 — SQL Formatting & Style Guide**
- **04.19 — SQL Best Practices & Common Mistakes**

---

# Summary

SQL reserved words are language-defined terms that the parser interprets as part of SQL syntax. Using them as identifiers can cause ambiguity, portability problems, and maintenance challenges. Professional database designs avoid reserved words, use descriptive business-oriented names, and rely on consistent naming conventions rather than quoted identifiers. Understanding reserved words is an important step toward writing portable, maintainable, and enterprise-ready SQL.