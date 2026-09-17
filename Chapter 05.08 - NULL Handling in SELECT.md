---
title: "05.08 - NULL Handling in SELECT"
description: "Understand how SQL NULL behaves in SELECT statements, expressions, functions, comparisons, and result sets. Learn NULL propagation, three-valued logic, and enterprise best practices."
chapter: 5
section: 5.08
category: Data Query Language (DQL)
difficulty: Beginner → Advanced
readingTime: 65 min
lastUpdated: 2026-08-04
---

# 05.08 NULL Handling in SELECT

---

# Learning Objectives

After completing this section, you will be able to:

- Understand what NULL represents.
- Distinguish NULL from zero, empty strings, and FALSE.
- Predict how NULL behaves in SELECT statements.
- Understand NULL propagation in expressions.
- Learn common NULL handling functions.
- Understand three-valued logic (introduction).
- Write production-quality SQL involving NULL values.

---

# What is NULL?

`NULL` represents **the absence of a value**.

It does **not** mean:

- Zero (`0`)
- Empty string (`''`)
- False (`FALSE`)
- Unknown text

Instead, it means:

> The database does not currently have a value for this field.

---

# Examples

Employee table

| Employee | Bonus |
|-----------|------:|
| Alice | 5000 |
| Bob | NULL |
| Carol | 7000 |

Bob's bonus is **unknown or not assigned**.

It is **not zero**.

---

# NULL is Not Zero

Incorrect assumption:

```text
NULL = 0
```

Wrong.

```text
NULL ≠ 0
```

Example:

```sql
SELECT
    NULL,
    0;
```

Different values.

---

# NULL is Not an Empty String

Example:

```text
NULL

''
```

Different concepts.

Empty string:

"There is a value, and it contains zero characters."

NULL:

"There is no known value."

Some DBMSs (historically Oracle SQL) treat empty strings as NULL, which affects portability.

---

# NULL is Not FALSE

Example:

```text
TRUE

FALSE

UNKNOWN (NULL)
```

SQL uses **three-valued logic**, not two-valued Boolean logic.

We'll study this in detail in the WHERE chapter.

---

# Selecting NULL

```sql
SELECT NULL;
```

Result

| NULL |
|------|
| NULL |

Perfectly valid SQL.

---

# NULL in Result Sets

Example:

```sql
SELECT
    EmployeeName,
    Bonus
FROM Employees;
```

Result

| Employee | Bonus |
|-----------|------:|
| Alice | 5000 |
| Bob | NULL |
| Carol | 7000 |

The database returns NULL exactly as stored.

---

# NULL Propagation

Most SQL expressions propagate NULL.

Example:

```sql
SELECT

100 + NULL;
```

Result

```
NULL
```

Another example:

```sql
SELECT

Salary + Bonus
FROM Employees;
```

If Bonus is NULL:

```
Result = NULL
```

The calculation becomes unknown.

---

# Why Does NULL Propagate?

Suppose:

```
Salary = 50000

Bonus = Unknown
```

Can the database determine:

```
50000 + Unknown ?
```

No.

Therefore:

```
Unknown
```

represented by NULL.

---

# Arithmetic Examples

```sql
SELECT

10 + NULL;
```

↓

```
NULL
```

---

```sql
SELECT

100 * NULL;
```

↓

```
NULL
```

---

```sql
SELECT

NULL / 5;
```

↓

```
NULL
```

---

# String Expressions

```sql
SELECT

'Hello ' || NULL;
```

Most DBMSs:

```
NULL
```

Vendor behavior may differ.

---

# Function Calls

Many functions return NULL if any required input is NULL.

Example:

```sql
UPPER(NULL)
```

↓

```
NULL
```

---

# Handling NULL

SQL provides functions for replacing NULL.

ANSI SQL:

```sql
COALESCE(Bonus,0)
```

Meaning:

```
If Bonus is NULL

↓

Use 0
```

Example:

```sql
SELECT

Salary +

COALESCE(Bonus,0)
```

Now:

```
50000 + NULL

↓

50000 + 0

↓

50000
```

---

# COALESCE()

Syntax:

```sql
COALESCE(
    expression,
    replacement
)
```

Example:

```sql
SELECT

COALESCE(Phone,'Not Available')
FROM Customers;
```

Result

| Phone |
|--------|
| 9876543210 |
| Not Available |

---

# Multiple COALESCE Values

```sql
COALESCE(
OfficePhone,
HomePhone,
MobilePhone,
'No Contact'
)
```

Returns the first non-NULL value.

---

# Vendor Functions

Different databases provide additional functions.

| Function | Database |
|----------|----------|
| COALESCE() | ANSI SQL |
| IFNULL() | MySQL |
| ISNULL() | SQL Server |
| NVL() | Oracle |

Prefer `COALESCE()` for portable SQL.

---

# NULL and Aliases

```sql
SELECT

COALESCE(Bonus,0)

AS Bonus
```

The alias applies after NULL replacement.

---

# NULL in Expressions

Example:

```sql
SELECT

Price *

Quantity

AS Total
```

If Quantity is NULL:

```
Total

↓

NULL
```

Better:

```sql
SELECT

Price *

COALESCE(Quantity,0)
```

---

# 📍 Execution Order Reminder

NULL replacement inside the SELECT list occurs during projection.

Logical execution order:

```text
FROM

↓

JOIN

↓

WHERE

↓

GROUP BY

↓

HAVING

↓

SELECT

← NULL handling here

↓

DISTINCT

↓

ORDER BY
```

---

# Three-Valued Logic (Introduction)

Unlike programming languages, SQL logic contains:

```text
TRUE

FALSE

UNKNOWN
```

UNKNOWN usually originates from NULL.

This affects:

- WHERE
- HAVING
- JOIN
- CASE

A complete discussion appears in the WHERE chapter.

---

# How the DBMS Executes NULL Handling

Query:

```sql
SELECT

COALESCE(Bonus,0)
FROM Employees;
```

Execution:

```text
Read Row

↓

Read Bonus

↓

Is NULL?

↓

Yes

↓

Use 0

↓

Return Result
```

---

# 🔬 Engine Deep Dive

NULL is represented internally using metadata rather than a literal value.

```text
Developer writes

COALESCE(Bonus,0)

        │

        ▼

Parser builds expression tree

        │

        ▼

Execution Engine reads row

        │

        ▼

NULL bitmap checked

        │

        ▼

Bonus is NULL?

      /     \

    Yes      No

    │         │

Return 0   Return Bonus

        │

        ▼

Projection
```

Most database engines store a **NULL bitmap** alongside row data to indicate which columns contain NULL values without requiring special placeholder values.

---

# 🏗️ Architecture Insight

In many row-oriented database engines, NULL values are tracked using a compact bitmap associated with each row. This allows the engine to determine whether a column is NULL before attempting to interpret its stored value.

---

# ⚡ Performance Tip

`COALESCE()` is inexpensive for most queries. However, wrapping indexed columns inside expressions can sometimes prevent efficient index usage in predicates. We'll revisit this in the `WHERE` and indexing chapters.

---

# 🔒 Security Note

Replacing NULL with display values such as `'Unknown'` or `'N/A'` improves user experience but should not obscure whether data is genuinely missing. Audit systems should preserve the distinction between missing and actual values.

---

# 🌍 Production Consideration

Enterprise applications frequently replace NULL values before sending API responses or generating reports. Doing so provides consistent user interfaces while preserving the original database values.

---

# 🚀 Enterprise Practice

Most organizations establish clear conventions for NULL handling. Business rules determine whether missing values should remain NULL, be replaced with defaults in reports, or be validated before insertion. Consistency across applications is more important than the specific replacement value.

---

# SQL Standard vs Vendor Differences

| Feature | ANSI SQL | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|-----------|------------|--------|------------|---------|---------|
| NULL | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| COALESCE() | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| IFNULL() | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| ISNULL() | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| NVL() | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Empty string = NULL | ❌ | ❌ | ❌ | ❌ | Often Yes | ❌ |

> **Portability Tip:** Prefer `COALESCE()` in portable SQL. Avoid relying on vendor-specific functions unless your application targets a single database platform.

---

# Common Mistakes

### Mistake 1

Assuming NULL equals zero.

---

### Mistake 2

Treating NULL as an empty string.

---

### Mistake 3

Forgetting that arithmetic expressions usually propagate NULL.

---

### Mistake 4

Using vendor-specific NULL functions when writing portable SQL.

---

# Best Practices

✔ Treat NULL as "unknown" rather than "empty."

✔ Use `COALESCE()` for portable SQL.

✔ Decide NULL handling based on business requirements.

✔ Alias calculated values after NULL replacement.

✔ Keep presentation defaults separate from stored data whenever possible.

---

# Interview Questions

## Basic

1. What does NULL represent?
2. Is NULL equal to zero?
3. Is NULL an empty string?

### Intermediate

4. Explain NULL propagation in expressions.
5. Why does `100 + NULL` return NULL?
6. What is the purpose of `COALESCE()`?

### Advanced

7. What is a NULL bitmap?
8. Why does SQL require three-valued logic?
9. Why is `COALESCE()` generally preferred over vendor-specific functions?

---

# Hands-on Exercises

## Exercise 1

Write a query that replaces NULL phone numbers with `'Not Available'`.

---

## Exercise 2

Calculate annual compensation using:

```
Salary + Bonus
```

ensuring that NULL bonuses are treated as zero.

---

## Exercise 3

Explain why the following query returns NULL:

```sql
SELECT
    100 + NULL;
```

---

## Exercise 4

Rewrite the following query using `COALESCE()`:

```sql
SELECT
    Salary + Bonus
FROM Employees;
```

---

# Related Topics

- **05.06 — Expressions & Calculated Columns**
- **05.09 — FROM Clause**
- **06.xx — WHERE Clause (Three-Valued Logic)**
- **08.xx — Aggregate Functions & NULL**
- **09.xx — CASE Expressions**
- **12.xx — Scalar Functions**

---

# Summary

`NULL` represents the absence of a known value rather than zero, an empty string, or FALSE. Most SQL expressions propagate NULL, making it a fundamental concept that influences calculations, comparisons, and query results. Functions such as `COALESCE()` provide portable ways to substitute default values, while database engines efficiently track NULLs using internal metadata structures such as NULL bitmaps. Mastering NULL handling is essential for writing correct, portable, and enterprise-grade SQL.