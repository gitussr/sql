---
title: "05.09 - SELECT Without FROM"
description: "Learn how SQL evaluates expressions without reading tables, understand SELECT without FROM, Oracle's DUAL table, execution behavior, and DBMS compatibility."
chapter: 5
section: 5.09
category: Data Query Language (DQL)
difficulty: Beginner → Intermediate
readingTime: 30 min
lastUpdated: 2026-08-04
---

# 05.09 SELECT Without FROM

---

# Learning Objectives

After completing this section, you will be able to:

- Understand why `SELECT` can be used without `FROM`.
- Evaluate constants and expressions.
- Execute built-in functions without reading tables.
- Understand Oracle's `DUAL` table.
- Explain how the database executes table-less queries.
- Write portable SQL across different database systems.

---

# Does Every SELECT Need a FROM Clause?

No.

Many SQL statements do **not** require a table.

Examples:

```sql
SELECT 100;
```

```sql
SELECT 'Hello, SQL!';
```

```sql
SELECT CURRENT_DATE;
```

These queries evaluate expressions directly.

---

# Why Does This Work?

A `SELECT` statement does two possible jobs:

1. Retrieve data from a row source.
2. Evaluate expressions.

When no row source is required, the database simply evaluates the expressions and returns the result.

---

# Selecting a Constant

```sql
SELECT
    100;
```

Result

| 100 |
|----:|
| 100 |

No table is accessed.

---

# Selecting Multiple Constants

```sql
SELECT
    100 AS Value,
    'SQL' AS Language,
    TRUE AS Supported;
```

Possible result:

| Value | Language | Supported |
|------:|----------|-----------|
| 100 | SQL | TRUE |

(Some DBMSs represent Boolean values differently.)

---

# Arithmetic Expressions

```sql
SELECT
    10 + 20 AS Sum,
    15 * 8 AS Product;
```

Result

| Sum | Product |
|----:|--------:|
| 30 | 120 |

The database evaluates the expressions directly.

---

# String Expressions

```sql
SELECT
    'Hello' || ' World' AS Greeting;
```

Depending on the DBMS, string concatenation syntax may differ.

---

# Built-in Functions

```sql
SELECT
    CURRENT_DATE,
    CURRENT_TIME,
    CURRENT_TIMESTAMP;
```

The database evaluates each function and returns the values.

---

# Useful for Testing

Developers often test expressions without creating sample tables.

Example:

```sql
SELECT
    ROUND(123.456, 2);
```

or

```sql
SELECT
    COALESCE(NULL, 'Default');
```

This is a convenient way to verify function behavior.

---

# 📍 Execution Order Reminder

When there is **no `FROM` clause**, the logical execution order is simplified.

```text
SELECT
        ↓
DISTINCT (if present)
        ↓
ORDER BY
        ↓
LIMIT / FETCH / TOP
```

Since there is no row source, the database skips row-oriented phases such as `FROM`, `JOIN`, `WHERE`, `GROUP BY`, and `HAVING`.

---

# Oracle's DUAL Table

Historically, Oracle required a special one-row, one-column table named `DUAL`.

Example:

```sql
SELECT
    CURRENT_DATE
FROM DUAL;
```

`DUAL` provides a row source so that Oracle can execute the query.

Modern Oracle versions optimize `DUAL` heavily, making its overhead negligible.

---

# What is DUAL?

Conceptually:

```text
DUAL

+------+
| DUMMY|
+------+
|   X  |
+------+
```

It contains a single row and a single column.

Applications rarely use the column itself; the table simply satisfies the requirement for a row source.

---

# Modern Database Behavior

Most modern database systems allow:

```sql
SELECT
    CURRENT_DATE;
```

without requiring a table.

This aligns more closely with the SQL standard and simplifies expression evaluation.

---

# Real-World Uses

## Testing Calculations

```sql
SELECT
    500 * 1.18 AS Total;
```

---

## Testing Date Functions

```sql
SELECT
    CURRENT_TIMESTAMP;
```

---

## Testing NULL Handling

```sql
SELECT
    COALESCE(NULL, 'Unknown');
```

---

## Verifying String Functions

```sql
SELECT
    UPPER('database');
```

---

# How the DBMS Executes This

Example:

```sql
SELECT
    10 * 20;
```

Execution flow:

```text
SQL Statement
        │
        ▼
Parser
        │
        ▼
Build expression tree
        │
        ▼
Optimizer
        │
        ▼
Constant folding
        │
        ▼
Execution Engine
        │
        ▼
Return one-row result
```

No storage engine access is required because there are no tables to read.

---

# 🔬 Engine Deep Dive

A table-less query bypasses most storage-related components of the database engine.

```text
Developer writes

SELECT 10 * 20

        │
        ▼
Lexer creates tokens

        │
        ▼
Parser builds expression tree

        │
        ▼
Semantic Analyzer validates data types

        │
        ▼
Optimizer performs constant folding

        │
        ▼
Execution Engine evaluates expression

        │
        ▼
Return one synthetic row
```

Notice that:

- No table scan occurs.
- No index lookup occurs.
- No buffer manager access is needed.
- No disk pages are read.

---

# 🏗️ Architecture Insight

A `SELECT` statement does not inherently require persistent data. When no row source is referenced, the database creates a **synthetic one-row result** containing the evaluated expressions.

---

# ⚡ Performance Tip

Table-less `SELECT` statements are extremely inexpensive because they avoid storage access. They are ideal for testing expressions, validating functions, and experimenting with SQL syntax.

---

# 🔒 Security Note

Although no application tables are accessed, executing built-in functions may still require appropriate permissions in some database systems. Security policies apply to functions as well as data.

---

# 🌍 Production Consideration

Production systems frequently use table-less `SELECT` statements during database migrations, health checks, monitoring scripts, and automated deployment pipelines to verify connectivity or evaluate server-side functions.

---

# 🚀 Enterprise Practice

Database administrators often execute lightweight statements such as:

```sql
SELECT CURRENT_TIMESTAMP;
```

or

```sql
SELECT 1;
```

to verify database connectivity before running more complex operations. Many client libraries and connection pools also use similar statements as heartbeat or health-check queries.

---

# SQL Standard vs Vendor Differences

| Feature | ANSI SQL | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|-----------|------------|--------|------------|---------|---------|
| `SELECT` without `FROM` | Supported concept | ✅ | ✅ | ✅ | Traditionally requires `DUAL` in older style | ✅ |
| `DUAL` table | ❌ | ❌ | Optional compatibility | ❌ | ✅ | ❌ |
| `CURRENT_DATE` without table | ✅ | ✅ | ✅ | ✅ | Modern versions support simplified forms in many contexts, though `DUAL` remains common | ✅ |

> **Portability Tip:** If your SQL must run across multiple DBMSs, remember that Oracle documentation and legacy code frequently use `FROM DUAL`, while most other systems allow table-less `SELECT` statements directly.

---

# Common Mistakes

### Mistake 1

Assuming every `SELECT` requires a table.

---

### Mistake 2

Using `FROM DUAL` in database systems where it is unnecessary.

---

### Mistake 3

Believing a table-less query performs a table scan.

It does not access persistent table storage.

---

### Mistake 4

Confusing a synthetic result row with data retrieved from a table.

---

# Best Practices

✔ Use table-less `SELECT` statements to test expressions and functions.

✔ Prefer standard syntax unless Oracle compatibility is required.

✔ Use aliases for calculated values to improve readability.

✔ Keep portability in mind when writing cross-platform SQL.

---

# Interview Questions

## Basic

1. Can a `SELECT` statement be executed without a `FROM` clause?
2. What types of values can be returned without accessing a table?
3. What is Oracle's `DUAL` table?

### Intermediate

4. Why does `SELECT 10 + 20;` not require table access?
5. What is the purpose of `DUAL`?
6. Why are table-less `SELECT` statements useful during development?

### Advanced

7. Explain how the execution pipeline differs between a table-less `SELECT` and a table-based query.
8. What optimizations can the database apply to constant expressions?
9. Why are connectivity checks often implemented using `SELECT 1`?

---

# Hands-on Exercises

## Exercise 1

Write a query that returns:

- Today's date
- Current timestamp

without reading any table.

---

## Exercise 2

Write a query that calculates:

```
125 × 8 + 50
```

using only a `SELECT` statement.

---

## Exercise 3

Rewrite the following Oracle query for PostgreSQL or MySQL:

```sql
SELECT
    CURRENT_DATE
FROM DUAL;
```

---

## Exercise 4

Explain why the following query performs no table scan:

```sql
SELECT
    UPPER('enterprise');
```

---

# Related Topics

- **05.06 — Expressions & Calculated Columns**
- **05.08 — NULL Handling in SELECT**
- **05.10 — FROM Clause**
- **12.xx — Scalar Functions**
- **15.xx — Query Processing & Optimization**

---

# Summary

A `SELECT` statement can evaluate constants, expressions, and built-in functions without reading any table. In these cases, the database produces a synthetic result row rather than scanning persistent storage. This capability makes table-less queries valuable for testing, debugging, monitoring, and health checks. While most modern database systems support `SELECT` without `FROM`, Oracle's historical use of the `DUAL` table remains an important portability consideration for enterprise SQL development.