---
title: "12.11 - Collation, Case Sensitivity and Unicode"
description: "How collations decide equality and sort order: case and accent sensitivity, default collations per engine, the COLLATE clause, case-insensitive search with collations, ILIKE, citext and expression indexes, collations and uniqueness, binary versus linguistic order, Unicode encodings, utf8mb4 and N'' literals, normalisation, collation conflicts, and index implications."
chapter: 12
section: 12.11
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 30 min
lastUpdated: 2026-09-26
---

# 12.11 Collation, Case Sensitivity and Unicode

---

# Learning Objectives

After completing this section, you will be able to:

- Explain what a collation is and what it controls.
- Predict whether `'Asha' = 'asha'` is true on each engine by default.
- Override comparison rules with `COLLATE`.
- Implement case- and accent-insensitive search that can use an index.
- Explain how collation affects uniqueness, sorting and joins.
- Store and compare Unicode text correctly.

---

# What a Collation Is

A **collation** is a set of rules for comparing and sorting text. It decides:

| Question | Example | Sensitive | Insensitive |
|----------|---------|-----------|-------------|
| Case | `'Asha' = 'asha'` | false | true |
| Accents | `'José' = 'Jose'` | false | true |
| Order | `'apple'` vs `'Banana'` | Binary: `'Banana'` first | Linguistic: `'apple'` first |
| Trailing spaces | `'abc' = 'abc '` | "No pad": false | "Pad space": true |

Collation names encode these choices: SQL Server `Latin1_General_CI_AS` is **C**ase-**I**nsensitive, **A**ccent-**S**ensitive; MySQL `utf8mb4_0900_ai_ci` is **a**ccent-**i**nsensitive, **c**ase-**i**nsensitive.

Collation applies to **comparisons and sorting**—`=`, `<`, `LIKE`, `ORDER BY`, `GROUP BY`, `DISTINCT`, unique constraints and joins—not only to `WHERE`.

---

# Defaults Differ

```sql
SELECT CASE WHEN 'Asha' = 'asha' THEN 'equal' ELSE 'different' END;
```

| Engine | Typical default | Result |
|--------|-----------------|--------|
| SQL Server | `SQL_Latin1_General_CP1_CI_AS` (set at install) | `equal` |
| MySQL 8 | `utf8mb4_0900_ai_ci` | `equal` |
| PostgreSQL | Database locale (deterministic) | `different` |
| Oracle | `BINARY` (`NLS_COMP`, `NLS_SORT`) | `different` |
| SQLite | `BINARY` | `different` |

An application that works on SQL Server or MySQL can therefore break on PostgreSQL or Oracle: logins that matched regardless of case suddenly do not. Know your collation and test with mixed-case data.

Collation is set at several levels: server/instance, database, column, and expression. The most specific wins.

```sql
-- Column-level collation
CREATE TABLE Customers (
    Email VARCHAR(255) COLLATE Latin1_General_CI_AS      -- SQL Server
);
CREATE TABLE Customers (
    Email VARCHAR(255) COLLATE utf8mb4_0900_as_cs        -- MySQL: accent- and case-sensitive
);
```

---

# The COLLATE Clause

`COLLATE` changes the rules for one expression:

```sql
-- SQL Server: case-sensitive comparison on a CI column
SELECT * FROM Customers WHERE Email = 'Asha@Example.com' COLLATE Latin1_General_CS_AS;

-- MySQL: case-sensitive
SELECT * FROM Customers WHERE Email = 'Asha@Example.com' COLLATE utf8mb4_bin;

-- PostgreSQL: byte order sort (fast, not linguistic)
SELECT CustomerName FROM Customers ORDER BY CustomerName COLLATE "C";

-- SQLite: ASCII case-insensitive
SELECT * FROM Customers WHERE Email = 'Asha@Example.com' COLLATE NOCASE;
```

> An index is built with the column's collation. Comparing under a **different** collation usually cannot use it—`WHERE Email = @x COLLATE Latin1_General_CS_AS` on a CI-indexed column scans (or seeks on a CI range and then filters).

---

# Case-Insensitive Search That Uses an Index

On engines whose default is case-sensitive, there are four approaches:

```sql
-- 1. Expression index on LOWER (PostgreSQL, Oracle, SQLite; MySQL 8.0.13+ functional index)
CREATE INDEX ix_customers_email_lower ON Customers (LOWER(Email));
SELECT * FROM Customers WHERE LOWER(Email) = LOWER('Asha@Example.com');    -- uses the index

-- 2. Store normalised values (and enforce it)
ALTER TABLE Customers ADD CONSTRAINT ck_email_lower CHECK (Email = LOWER(Email));

-- 3. PostgreSQL: a case-insensitive type or collation
CREATE EXTENSION IF NOT EXISTS citext;
ALTER TABLE Customers ALTER COLUMN Email TYPE citext;                         -- comparisons ignore case

CREATE COLLATION ci (provider = icu, locale = 'und-u-ks-level2', deterministic = false);
ALTER TABLE Customers ALTER COLUMN Email TYPE VARCHAR(255) COLLATE ci;

-- 4. Oracle: a case-insensitive column collation (12.2+) or session settings
ALTER SESSION SET NLS_COMP = LINGUISTIC;
ALTER SESSION SET NLS_SORT = BINARY_CI;
```

PostgreSQL's `ILIKE` is a case-insensitive `LIKE`; it can use a trigram index but not a plain B-tree.

Avoid `WHERE UPPER(Email) = UPPER(@x)` without a matching expression index—it scans the table on every call.

---

# Collation and Uniqueness

A unique constraint enforces uniqueness **under the column's collation**:

```sql
-- Email VARCHAR(255) UNIQUE
INSERT INTO Customers (CustomerID, CustomerName, Email) VALUES (10, 'A', 'asha@example.com');
INSERT INTO Customers (CustomerID, CustomerName, Email) VALUES (11, 'B', 'Asha@Example.com');
-- Case-insensitive collation (SQL Server, MySQL default): duplicate key error
-- Case-sensitive collation (PostgreSQL, Oracle, SQLite default): both rows accepted
```

For emails and user names, you almost always want case-insensitive uniqueness. On case-sensitive engines, enforce it with a unique expression index: `CREATE UNIQUE INDEX ux_email ON Customers (LOWER(Email));`.

MySQL's `_0900_` collations are also **accent-insensitive**: `'José'` and `'Jose'` collide in a unique index—sometimes a surprise for name columns.

---

# Binary vs Linguistic Order

```text
Values: 'apple', 'Banana', 'cherry', 'Éclair', '10', '9'

Binary / "C" order (by code point):   '10', '9', 'Banana', 'apple', 'cherry', 'Éclair'
Linguistic order (en):                 '10', '9', 'apple', 'Banana', 'cherry', 'Éclair'
```

- Binary order is fast and stable across library versions; linguistic order is what people expect in user-facing lists.
- Digits are compared as characters in both: `'10' < '9'`. Sort numeric text by casting it (or store it as a number).
- Linguistic order depends on the collation library (glibc, ICU). Upgrading the operating system's glibc changed sort order for many PostgreSQL installations and silently corrupted text indexes until they were rebuilt—PostgreSQL now warns about collation version mismatches.

---

# Unicode Storage

| Engine | Unicode storage | Watch out for |
|--------|-----------------|---------------|
| PostgreSQL | Database encoding `UTF8` | Encoding is fixed per database |
| MySQL | `utf8mb4` character set | Legacy `utf8` (= `utf8mb3`) cannot store emoji or some CJK characters |
| SQL Server | `NVARCHAR` (UTF-16), or `VARCHAR` with a `_UTF8` collation (2019+) | Literals need the `N` prefix |
| Oracle | `AL32UTF8` database character set; `NVARCHAR2` | `VARCHAR2(n)` counts bytes by default |
| SQLite | UTF-8 or UTF-16 text | Built-in `upper`/`lower`/`NOCASE` handle ASCII only |

```sql
-- SQL Server: without N, characters outside the code page become '?'
INSERT INTO Customers (CustomerID, CustomerName) VALUES (20, '陈伟');    -- stored as '??'
INSERT INTO Customers (CustomerID, CustomerName) VALUES (20, N'陈伟');   -- correct (NVARCHAR column)
```

---

# Unicode Normalisation

The same visible text can have different code points:

```text
'é' = U+00E9                    (precomposed)
'é' = U+0065 'e' + U+0301 ´     (decomposed)
```

Deterministic collations compare them as **different**. Normalise on input:

```sql
-- PostgreSQL 13+
SELECT NORMALIZE(CustomerName, NFC) FROM Customers;
SELECT * FROM Customers WHERE CustomerName IS NOT NFC NORMALIZED;

-- Oracle
SELECT COMPOSE(CustomerName) FROM Customers;
```

On other engines, normalise in the application before inserting. Accent-insensitive search is a separate concern: MySQL `_ai_` collations, SQL Server `_AI` collations, and PostgreSQL's `unaccent` extension (with an expression index).

---

# Collation Conflicts

```sql
-- SQL Server: temp table columns use tempdb's collation
SELECT *
FROM #Staging AS s
JOIN Customers AS c ON c.Email = s.Email;
-- Msg 468: Cannot resolve the collation conflict between "…_CI_AS" and "…_CS_AS"
```

Fix it where the data is defined (`CREATE TABLE #Staging (Email VARCHAR(255) COLLATE DATABASE_DEFAULT)`), not with `COLLATE` in every join—a `COLLATE` on the indexed side of a join can prevent index use.

---

# Visual Representation

```text
                     'Asha' vs 'asha'     'José' vs 'Jose'     index usable?
utf8mb4_0900_ai_ci        =                    =                 ✅ (column collation)
Latin1_General_CI_AS      =                    ≠                 ✅
PostgreSQL default        ≠                    ≠                 ✅
LOWER(Email) = LOWER(x)   =                    ≠                 only with an index on LOWER(Email)
Email = x COLLATE other   depends              depends           ❌ usually not
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN        ← join keys with different collations: conflict or no index use
3. WHERE       ← equality and LIKE follow the collation
4. GROUP BY    ← 'UK' and 'uk' form one group under a CI collation
5. HAVING
6. WINDOW      ← PARTITION BY and ORDER BY inside OVER follow collation too
7. SELECT
8. DISTINCT    ← DISTINCT follows collation: 'UK' and 'uk' are duplicates under CI
9. ORDER BY    ← sort order is the collation's order
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Binary collation:      compare bytes (memcmp)                         fastest
Linguistic collation:  build sort keys (ICU/glibc strxfrm) per value,
                       compare keys; multi-level: base letter → accent → case
Case-insensitive:      compare only the first levels (base letter, maybe accent)
Index:                 B-tree ordered by the column's collation sort keys
```

Linguistic comparison is several times slower than binary. For large sorts of machine identifiers (codes, hashes, URLs), a binary collation such as PostgreSQL's `"C"` is both faster and more predictable.

---

# 🏗️ Architecture Insight

Choose collations deliberately at design time: one database default, documented, with explicit column collations only where behaviour must differ (case-sensitive codes, case-insensitive emails). Changing a collation later means rebuilding indexes, re-checking unique constraints (new duplicates may appear) and retesting every comparison.

---

# ⚡ Performance Tip

Match the comparison to the index. Either the column's collation already gives the behaviour you want, or you create an expression index (`LOWER(Email)`) and query it exactly as indexed. Never add `COLLATE` or `UPPER` to the column side of a hot predicate without a matching index.

---

# 🔒 Security Note

Case- and accent-insensitive comparisons affect identity. Two accounts `admin` and `Admin`—or `admin` and `аdmin` with a Cyrillic `а`—can be treated as the same or different depending on collation and normalisation. Enforce case-insensitive uniqueness for user names and emails, normalise Unicode on input, and consider restricting identifiers to a safe character set.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `COLLATE` clause | ✅ | ✅ | ✅ | ✅ | ✅ (12.2+) | ✅ |
| Default case sensitivity | Implementation-defined | Sensitive | Insensitive | Insensitive (usual) | Sensitive | Sensitive |
| Case-insensitive options | — | `citext`, ICU nondeterministic, `ILIKE` | `_ci` collations | `_CI` collations | `BINARY_CI`, `LINGUISTIC` | `NOCASE` (ASCII) |
| Accent-insensitive options | — | `unaccent`, ICU | `_ai` collations | `_AI` collations | `BINARY_AI` | ❌ |
| `NORMALIZE` | ✅ | ✅ (13+) | ❌ | ❌ | `COMPOSE` | ❌ |

> **Portability Tip:** Do not rely on the default collation. For case-insensitive matching, store normalised values (lower-case) with a check constraint, or use `LOWER(col)` with an expression index—both behave the same on every engine.

---

# Common Mistakes

### Mistake 1

Assuming comparisons are case-insensitive because they were on the previous database.

---

### Mistake 2

`WHERE UPPER(Email) = UPPER(@x)` without an expression index.

---

### Mistake 3

Using MySQL's legacy `utf8` and losing emoji.

---

### Mistake 4

Omitting the `N` prefix for Unicode literals on SQL Server.

---

### Mistake 5

Applying `COLLATE` to the indexed side of a join or predicate.

---

# Best Practices

✔ Document the default collation and test with mixed-case, accented and non-Latin data.

✔ Enforce case-insensitive uniqueness for identities.

✔ Use `utf8mb4` on MySQL and `NVARCHAR` or UTF-8 collations on SQL Server.

✔ Normalise Unicode on input.

✔ Use binary collations for machine identifiers, linguistic ones for human text.

---

# Interview Questions

## Basic

1. What is a collation?
2. Is `'Asha' = 'asha'` true on SQL Server by default? On PostgreSQL?
3. What does `CI_AS` mean?

## Intermediate

4. How do you do an index-friendly case-insensitive search on PostgreSQL?
5. How does collation affect unique constraints?
6. Why does `'10'` sort before `'9'`?

## Advanced

7. Why can `COLLATE` in a predicate prevent index use?
8. What went wrong when glibc upgrades changed collation order?
9. What is Unicode normalisation and why does it matter for comparisons?

---

# Hands-on Exercises

## Exercise 1

Check the default collation of your database and test `'Asha' = 'asha'`.

---

## Exercise 2

Create a case-insensitive unique constraint on `Customers.Email` on a case-sensitive engine.

---

## Exercise 3

Write a case-insensitive email lookup that uses an index, and confirm it with the execution plan.

---

## Exercise 4

Insert a Chinese name on SQL Server with and without the `N` prefix and compare the results.

---

# Related Topics

- **12.02 — String Basics (Length, Case and Trimming)**
- **12.15 — Scalar Function Performance and Index Strategy**
- **10.07 — Unique Indexes and Constraints**
- **10.10 — Partial and Expression Indexes**
- **06.07 — LIKE and Pattern Matching**

---

# Summary

A collation defines how text is compared and sorted: case and accent sensitivity, order and trailing-space handling. Defaults differ—SQL Server and MySQL are usually case-insensitive, PostgreSQL, Oracle and SQLite case-sensitive—and they apply to equality, `LIKE`, sorting, grouping, `DISTINCT`, joins and unique constraints. `COLLATE` overrides the rules per expression but usually defeats indexes built with another collation; index-friendly case-insensitive search uses the column's collation, normalised storage or an expression index on `LOWER(col)`. Store Unicode with `utf8mb4`, `NVARCHAR`/`N''` or UTF-8 databases, normalise it on input, and choose collations deliberately at design time.
