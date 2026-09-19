---
title: "06.03 - Comparison Operators"
description: "Master SQL comparison operators in WHERE: equality, inequality, and ordering comparisons for numbers, strings, and dates, including collation, case sensitivity, trailing spaces, implicit conversion, and NULL behavior."
chapter: 6
section: 6.03
category: Data Query Language (DQL)
difficulty: Beginner → Advanced
readingTime: 45 min
lastUpdated: 2026-09-19
---

# 06.03 Comparison Operators

---

# Learning Objectives

After completing this section, you will be able to:

- Use `=`, `<>`, `!=`, `<`, `>`, `<=`, and `>=`.
- Compare numbers, strings, and dates correctly.
- Explain how collations affect string comparison.
- Recognize implicit data-type conversion.
- Understand why comparisons with `NULL` return UNKNOWN.
- Compare two columns within the same row.
- Choose comparisons that indexes can use.

---

# The Comparison Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `=` | Equal to | `Country = 'India'` |
| `<>` | Not equal to (standard) | `Status <> 'Closed'` |
| `!=` | Not equal to (widely supported extension) | `Status != 'Closed'` |
| `<` | Less than | `Price < 100` |
| `>` | Greater than | `Salary > 50000` |
| `<=` | Less than or equal to | `Quantity <= 5` |
| `>=` | Greater than or equal to | `OrderDate >= DATE '2026-01-01'` |

Each comparison produces TRUE, FALSE, or UNKNOWN.

---

# Equality

```sql
SELECT
    ProductName,
    CategoryID
FROM Products
WHERE CategoryID = 4;
```

Equality is the most selective and most index-friendly comparison. Lookups by primary key are equality predicates:

```sql
SELECT *
FROM Customers
WHERE CustomerID = 1024;
```

---

# Inequality

```sql
SELECT
    OrderID,
    Status
FROM Orders
WHERE Status <> 'Delivered';
```

`<>` is the SQL standard form. `!=` is supported by every major database but is not part of the standard.

> **Note:** Inequality predicates usually match most of a table, so they rarely benefit from an index.

---

# Ordering Comparisons

```sql
SELECT
    EmployeeName,
    Salary
FROM Employees
WHERE Salary >= 60000;
```

```sql
SELECT
    ProductName,
    StockLevel
FROM Products
WHERE StockLevel < ReorderLevel;
```

The second example compares **two columns of the same row**—a very common pattern for business rules.

---

# Comparing Numbers

Numeric comparison works as expected across integer and decimal types:

```sql
WHERE Price > 19.99
```

Be careful with approximate types (`FLOAT`, `REAL`, `DOUBLE`):

```sql
WHERE Ratio = 0.1   -- may not match stored value 0.1000000000000000055...
```

Use `DECIMAL`/`NUMERIC` for exact values such as money, or compare approximate values within a tolerance:

```sql
WHERE ABS(Ratio - 0.1) < 0.000001
```

---

# Comparing Strings

Strings are compared character by character according to a **collation**—a set of rules for ordering and equality.

```sql
WHERE LastName >= 'M'
```

returns last names from `M` onwards in the collation's order.

A collation decides:

- whether `'a'` equals `'A'` (case sensitivity),
- whether `'é'` equals `'e'` (accent sensitivity),
- how letters, digits, and symbols are ordered,
- how trailing spaces are treated.

---

## Case Sensitivity

```sql
WHERE Country = 'india'
```

| Database | Default result for stored `'India'` |
|----------|-------------------------------------|
| PostgreSQL | No match (case-sensitive by default) |
| MySQL | Match (default collations are case-insensitive) |
| SQL Server | Usually match (default install collations are case-insensitive) |
| Oracle | No match (binary comparison by default) |
| SQLite | No match (`=` is case-sensitive; `LIKE` is not for ASCII) |

The same query can therefore return different results on different systems.

---

## Trailing Spaces

Under the SQL standard's PAD SPACE rules, trailing spaces are ignored when comparing strings:

```sql
WHERE Code = 'AB'
```

may match `'AB   '`. PostgreSQL ignores trailing spaces only for `CHAR(n)` values, and databases using NO PAD collations (such as MySQL 8's default `utf8mb4_0900_*` collations) treat them as significant.

---

# Comparing Dates and Times

```sql
SELECT
    OrderID,
    OrderDate
FROM Orders
WHERE OrderDate >= DATE '2026-01-01';
```

Dates compare chronologically.

Be careful when a column stores **date and time** but you compare to a date:

```sql
WHERE CreatedAt = DATE '2026-03-15'
```

This matches only rows at exactly midnight. Use a half-open range instead:

```sql
WHERE CreatedAt >= TIMESTAMP '2026-03-15 00:00:00'
  AND CreatedAt <  TIMESTAMP '2026-03-16 00:00:00'
```

Section 06.09 covers date filtering in depth.

---

# Comparing Different Data Types

If operand types differ, the database converts one of them.

```sql
-- PhoneNumber is VARCHAR
WHERE PhoneNumber = 5551234
```

Depending on the database, this may:

- convert every `PhoneNumber` to a number (slow, and errors on non-numeric values), or
- raise an error, or
- behave unpredictably with leading zeros.

The fix is to compare like with like:

```sql
WHERE PhoneNumber = '5551234'
```

---

# Comparisons with NULL

Any ordinary comparison with `NULL` returns **UNKNOWN**:

```text
5    =  NULL   → UNKNOWN
NULL =  NULL   → UNKNOWN
NULL <> 3      → UNKNOWN
```

So this query never returns rows:

```sql
SELECT *
FROM Employees
WHERE ManagerID = NULL;
```

Use `IS NULL` instead:

```sql
SELECT *
FROM Employees
WHERE ManagerID IS NULL;
```

Section 06.08 explains three-valued logic fully.

---

# Inequality Silently Excludes NULL

```sql
SELECT *
FROM Orders
WHERE Status <> 'Delivered';
```

Rows where `Status` is `NULL` are **not** returned, because `NULL <> 'Delivered'` is UNKNOWN. If those rows matter:

```sql
WHERE Status <> 'Delivered'
   OR Status IS NULL
```

---

# Visual Representation

```text
Row value      Predicate: Salary >= 60000     Result      Kept?

45000          45000 >= 60000                 FALSE       ❌
60000          60000 >= 60000                 TRUE        ✅
72000          72000 >= 60000                 TRUE        ✅
NULL           NULL  >= 60000                 UNKNOWN     ❌
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE   ← Comparisons are evaluated here
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

Comparisons in `WHERE` see the original column values, not expressions or aliases defined in `SELECT`.

---

# How the DBMS Executes This

```text
Predicate: CustomerID = 1024

↓

Is there an index on CustomerID?

↓ yes

Index seek → jump directly to key 1024

↓

Read the matching row(s)
```

```text
Predicate: Salary >= 60000

↓

Is there an index on Salary?

↓ yes

Index range scan → start at 60000, read forwards
```

Equality and range comparisons map directly onto B-tree index navigation.

---

# 🔬 Engine Deep Dive

A B-tree index keeps keys sorted. Comparison operators translate into index operations:

```text
=            →  Seek to one key
>, >=        →  Seek to start key, scan forwards
<, <=        →  Scan from beginning to end key (or seek and scan backwards)
<> / !=      →  Usually a full scan (two ranges: below and above the value)
```

This is why equality and range predicates are fast on indexed columns, while inequality predicates usually are not.

---

# 🏗️ Architecture Insight

Comparison semantics are defined by data types and collations, not by the SQL text. Changing a column's collation or type changes the meaning of every comparison that uses it. For this reason, collation choices are architectural decisions made at database or column design time, not per query.

---

# ⚡ Performance Tip

Keep the indexed column alone on one side of the comparison and give it a value of the same type on the other side. `WHERE Price * 1.1 > 100` cannot use an index on `Price`; `WHERE Price > 100 / 1.1` can.

---

# 🔒 Security Note

Case-insensitive comparisons on security-relevant values—such as usernames or API keys—can cause unexpected matches. Compare secrets and identifiers using case-sensitive or binary semantics where the business rules require exact matching.

---

# 🌍 Production Consideration

When applications migrate between database systems, comparison behavior (case sensitivity, trailing spaces, empty strings, implicit conversions) is one of the most common sources of subtle data differences. Document the collation of every text column that is used for filtering.

---

# 🚀 Enterprise Practice

Enterprise schemas choose a default collation deliberately and use explicit, well-documented exceptions—for example, a case-sensitive collation on a `ProductCode` column—rather than applying functions such as `UPPER()` in queries.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `=`, `<`, `>`, `<=`, `>=` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `<>` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `!=` | ❌ (extension) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Default string case sensitivity | Collation-defined | Sensitive | Insensitive | Usually insensitive | Sensitive | Sensitive (`=`) |
| Empty string `''` is `NULL` | ❌ | ❌ | ❌ | ❌ | ✅ (for `VARCHAR2`) | ❌ |
| NULL-safe equality | `IS NOT DISTINCT FROM` | ✅ | `<=>` | ✅ (2022+) | ❌ | ✅ (3.39+; also `IS`) |

> **Portability Tip:** Prefer `<>` over `!=` for standard SQL, and never rely on a database's default case sensitivity. Oracle's treatment of `''` as `NULL` means `WHERE Code = ''` returns no rows there.

---

# Common Mistakes

### Mistake 1

Using `= NULL` or `<> NULL`.

---

### Mistake 2

Comparing a date-time column to a plain date with `=`.

---

### Mistake 3

Comparing numbers to text columns, causing implicit conversion.

---

### Mistake 4

Assuming `<> 'X'` returns rows where the column is `NULL`.

---

### Mistake 5

Expecting the same case-sensitivity behavior on every database.

---

# Best Practices

✔ Use `<>` for portable inequality.

✔ Compare values of matching data types.

✔ Use half-open ranges for date-time values.

✔ Use `IS NULL` / `IS NOT NULL` for missing values.

✔ Know the collation of every text column you filter on.

✔ Use `DECIMAL` for exact values such as money.

---

# Interview Questions

## Basic

1. List SQL's comparison operators.
2. What is the difference between `<>` and `!=`?
3. Why does `WHERE Column = NULL` return no rows?

## Intermediate

4. What is a collation, and how does it affect string comparison?
5. Why is `WHERE CreatedAt = DATE '2026-03-15'` often wrong?
6. Why does `WHERE Status <> 'Closed'` exclude rows with a `NULL` status?

## Advanced

7. How do comparison operators map onto B-tree index operations?
8. Explain the risks of implicit data-type conversion in comparisons.
9. How do PAD SPACE and NO PAD collations differ?

---

# Hands-on Exercises

## Exercise 1

Return all products whose stock level is below their reorder level.

---

## Exercise 2

Return all orders placed on or after 1 January 2026.

---

## Exercise 3

Return all tasks whose status is not `Done`, including tasks with no status.

---

## Exercise 4

Rewrite this predicate so that an index on `Price` can be used:

```sql
WHERE Price * 1.18 > 500
```

---

# Related Topics

- **04.06 — SQL Operators and Expressions**
- **05.08 — NULL Handling in SELECT**
- **06.04 — Logical Operators (AND, OR, NOT)**
- **06.08 — NULL Handling in WHERE (Three-Valued Logic)**
- **06.12 — SARGability and Index-Friendly Predicates**
- **10.xx — Indexes**

---

# Summary

Comparison operators—`=`, `<>`, `<`, `>`, `<=`, and `>=`—are the building blocks of nearly every `WHERE` clause. Their results depend on data types and collations: numbers compare numerically, dates chronologically, and strings according to collation rules for case, accents, and trailing spaces. Every comparison with `NULL` yields UNKNOWN, which silently removes rows. Comparing like types, keeping indexed columns bare, and using `IS NULL` for missing values produces filters that are correct, portable, and fast.
