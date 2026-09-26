---
title: "12.15 - Scalar Function Performance and Index Strategy"
description: "Keeping function-based queries fast: why functions on columns block index seeks, a rewrite catalogue for common non-sargable predicates, expression indexes, functional key parts, computed and generated columns per engine, expression matching rules, normalising on write, functions in joins, grouping and sorting, the cost of expression indexes, and a method for diagnosing slow function-heavy queries."
chapter: 12
section: 12.15
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 35 min
lastUpdated: 2026-09-26
---

# 12.15 Scalar Function Performance and Index Strategy

---

# Learning Objectives

After completing this section, you will be able to:

- Explain why a function on an indexed column prevents an index seek.
- Rewrite common non-sargable predicates into index-friendly forms.
- Create expression indexes and indexed computed or generated columns on each engine.
- Make queries match an expression index exactly.
- Decide between rewriting, indexing an expression and normalising on write.
- Diagnose slow queries caused by scalar functions.

---

# Why Functions Block Index Seeks

A B-tree index on `Email` is sorted by `Email`. It can answer "where is `Email = 'asha@example.com'`?" by descending the tree. It **cannot** answer "where is `LOWER(Email) = 'asha@example.com'`?": the index is not sorted by `LOWER(Email)`, and the only way to know each row's `LOWER(Email)` is to compute it.

```text
Index on Email (sorted by Email)          Question: LOWER(Email) = 'asha@example.com'
  'Asha@Example.com'  ← lower() matches      The matching entries can be anywhere:
  'ben@example.com'                          'Asha@Example.com', 'ASHA@example.com', …
  'chen.wei@example.io'                      → read every entry (index or table scan)
```

This is the **sargability** rule from Section 06.12: a predicate can use an index only if the indexed expression appears **bare** on one side and the other side can be computed before the search.

---

# Rewrite Catalogue

| Non-sargable | Sargable rewrite | Notes |
|--------------|------------------|-------|
| `WHERE Price * 1.18 > 118` | `WHERE Price > 118 / 1.18` | Move arithmetic to the constant |
| `WHERE ABS(Balance) = 5` | `WHERE Balance IN (5, -5)` | |
| `WHERE ROUND(Price, 0) = 100` | `WHERE Price >= 99.5 AND Price < 100.5` | Range instead of rounding |
| `WHERE LEFT(Code, 3) = 'ABC'` | `WHERE Code LIKE 'ABC%'` | Prefix `LIKE` is sargable |
| `WHERE SUBSTRING(Code, 1, 3) = 'ABC'` | `WHERE Code LIKE 'ABC%'` | Beware `%`/`_` in the constant |
| `WHERE COALESCE(Status, 'New') = 'New'` | `WHERE Status = 'New' OR Status IS NULL` | |
| `WHERE ISNULL(Qty, 0) > 0` | `WHERE Qty > 0` | `NULL > 0` is unknown anyway |
| `WHERE CAST(Phone AS BIGINT) = 5550102030` | `WHERE Phone = '5550102030'` | Match the column's type |
| `WHERE FirstName \|\| ' ' \|\| LastName = 'Asha Rao'` | `WHERE FirstName = 'Asha' AND LastName = 'Rao'` | Compare parts |
| `WHERE YEAR(OrderDate) = 2026` | `WHERE OrderDate >= '2026-01-01' AND OrderDate < '2027-01-01'` | Chapter 13 |
| `WHERE TRIM(Code) = 'A1'` | Clean the data; then `WHERE Code = 'A1'` | Fix on write |
| `WHERE LOWER(Email) = 'x'` | Expression index, CI collation or lower-case storage | Next headings |

When no rewrite exists—case-insensitive match on a case-sensitive column, a domain extracted from an email, a normalised phone number—index the expression.

---

# Expression Indexes

```sql
-- PostgreSQL (double parentheses around an expression)
CREATE INDEX ix_customers_email_lower ON Customers ((LOWER(Email)));

-- MySQL 8.0.13+: functional key part
CREATE INDEX ix_customers_email_lower ON Customers ((LOWER(Email)));

-- Oracle: function-based index
CREATE INDEX ix_customers_email_lower ON Customers (LOWER(Email));

-- SQLite 3.9+
CREATE INDEX ix_customers_email_lower ON Customers (LOWER(Email));

-- SQL Server: index a computed column
ALTER TABLE Customers ADD EmailLower AS LOWER(Email);
CREATE INDEX ix_customers_email_lower ON Customers (EmailLower);
```

The query must use the indexed expression:

```sql
SELECT CustomerID FROM Customers WHERE LOWER(Email) = 'asha@example.com';   -- uses the index
SELECT CustomerID FROM Customers WHERE UPPER(Email) = 'ASHA@EXAMPLE.COM';   -- does not
SELECT CustomerID FROM Customers WHERE LOWER(TRIM(Email)) = '…';            -- does not
```

Requirements everywhere: the expression must be **deterministic** (PostgreSQL: only `IMMUTABLE` functions), and on SQL Server the computed column must also be precise (no `FLOAT`) to be indexed.

---

# Generated and Computed Columns

A generated column stores (or defines) a derived value that behaves like a normal column:

```sql
-- PostgreSQL 12+ (stored)
ALTER TABLE Customers ADD COLUMN EmailDomain TEXT
    GENERATED ALWAYS AS (split_part(Email, '@', 2)) STORED;
CREATE INDEX ix_customers_domain ON Customers (EmailDomain);

-- MySQL 5.7+ (VIRTUAL or STORED)
ALTER TABLE Customers ADD COLUMN EmailDomain VARCHAR(255)
    GENERATED ALWAYS AS (SUBSTRING_INDEX(Email, '@', -1)) VIRTUAL;
CREATE INDEX ix_customers_domain ON Customers (EmailDomain);

-- SQL Server
ALTER TABLE Customers ADD EmailDomain AS SUBSTRING(Email, CHARINDEX('@', Email) + 1, 255) PERSISTED;
CREATE INDEX ix_customers_domain ON Customers (EmailDomain);

-- Oracle 11g+ (virtual column)
ALTER TABLE Customers ADD (EmailDomain VARCHAR2(255)
    GENERATED ALWAYS AS (SUBSTR(Email, INSTR(Email, '@') + 1)) VIRTUAL);
CREATE INDEX ix_customers_domain ON Customers (EmailDomain);

-- SQLite 3.31+
ALTER TABLE Customers ADD COLUMN EmailDomain TEXT
    GENERATED ALWAYS AS (substr(Email, instr(Email, '@') + 1)) VIRTUAL;
CREATE INDEX ix_customers_domain ON Customers (EmailDomain);
```

Advantages over a bare expression index:

- Queries can reference the column by name: `WHERE EmailDomain = 'example.com'`—no need to repeat the exact expression.
- **SQL Server and MySQL** also match the expression itself to the generated column (`WHERE SUBSTRING_INDEX(Email, '@', -1) = …` can use the index), if it is written identically.
- The value is visible to reports and statistics.

---

# Normalise on Write

The cheapest function at read time is the one you never call:

```sql
-- Store the canonical form, enforce it, index the plain column
UPDATE Customers SET Email = LOWER(TRIM(Email)) WHERE Email <> LOWER(TRIM(Email));
ALTER TABLE Customers ADD CONSTRAINT ck_email_canonical CHECK (Email = LOWER(TRIM(Email)));
CREATE UNIQUE INDEX ux_customers_email ON Customers (Email);

-- Queries compare plain values
SELECT CustomerID FROM Customers WHERE Email = LOWER(TRIM(:input));   -- function on the constant side
```

When the original form must be kept (for example, display names as typed), store both: the original and a normalised generated column.

---

# Functions in Joins, Grouping and Sorting

```sql
-- JOIN on an expression: hash join still works, index nested loop on Customers does not
SELECT … FROM Leads AS l JOIN Customers AS c ON LOWER(l.Email) = LOWER(c.Email);
-- With an expression index on LOWER(c.Email), a nested loop can seek per lead.

-- GROUP BY / ORDER BY an expression: an expression index supplies the order
CREATE INDEX ix_customers_domain ON Customers (EmailDomain);
SELECT EmailDomain, COUNT(*) FROM Customers GROUP BY EmailDomain;   -- ordered scan, streaming aggregate
SELECT CustomerID FROM Customers ORDER BY EmailDomain LIMIT 20;     -- no sort needed
```

The same rule applies everywhere: an index helps only when the expression it stores is the expression the query uses.

---

# The Cost of Expression Indexes

Every expression index is recomputed on every insert and on every update of its input columns:

```text
INSERT a customer:
  table row write
  + index on CustomerID
  + index on LOWER(Email)          ← LOWER() evaluated, entry inserted
  + index on EmailDomain           ← expression evaluated, entry inserted
```

- Cheap built-ins add little; regular expressions, JSON extraction and UDFs add more.
- A non-inlined UDF in an index is called for every write—and a slow or failing function makes writes slow or failing.
- Changing a function's definition requires rebuilding its indexes.

Index the expressions that hot queries use; do not index every expression that some query might use (Chapter 10's cost rules apply unchanged).

---

# A Diagnosis Method

```text
1. Find the slow query (monitoring, slow query log, Query Store, pg_stat_statements)
2. Read the actual plan:
     full scan with a Filter on a function of a column?        → sargability problem
     CONVERT_IMPLICIT / cast on the column side?                → type mismatch
     big gap between estimated and actual rows on that filter? → missing expression statistics
     UDF with tiny estimated cost and large actual time?        → non-inlined function
3. Fix, in order of preference:
     rewrite the predicate (catalogue above)
     fix the type of the literal or parameter
     normalise on write
     add an expression index / indexed generated column
     replace or inline the UDF
4. Re-read the plan and compare actual time and rows read
```

---

# Visual Representation

```text
WHERE LOWER(Email) = 'asha@example.com'

no suitable index          index on Email           index on LOWER(Email)
─────────────────          ──────────────           ─────────────────────
Seq Scan                   Index/Seq Scan +         Index Seek
compute LOWER per row      Filter LOWER per entry   LOWER already stored
reads N rows               reads N entries          reads ~1 entry
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN        ← expression join keys: index nested loop only with an expression index
3. WHERE       ← function on the column side: scan; on the constant side: seek
4. GROUP BY    ← expression index can supply grouping order
5. HAVING
6. WINDOW      ← PARTITION BY / ORDER BY expressions can also use expression indexes
7. SELECT      ← functions here do not affect index choice
8. DISTINCT
9. ORDER BY    ← expression index can avoid the sort
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Optimizer, for each predicate  f(col) op constant:
  1. is there an index whose key is exactly f(col)?   → index seek / range
  2. (SQL Server, MySQL) is there a computed/generated column defined as f(col)
     with an index?                                     → match, then seek
  3. otherwise                                          → scan + filter, estimate by guess
Expression index maintenance on write:
  compute f(new values) → insert/update index entry
```

---

# 🔬 Engine Deep Dive

Expression matching is textual-structural: the optimizer compares the parsed expression trees. PostgreSQL treats `lower(email)` and `lower(email::text)` as the same only if the implicit casts resolve identically; SQL Server's computed-column matching requires the same functions, arguments and data types, and does not match if the query's literal types force a different conversion. When an expression index "is not used", compare the plan's filter expression character by character with the index definition.

---

# 🏗️ Architecture Insight

Every recurring function in a hot predicate is a request for a better representation of the data. Emails lower-cased on write, phone numbers stored as digits, domains as generated columns, JSON attributes promoted to columns: each turns a per-query computation into a stored, indexed value. The schema should hold the forms the queries need.

---

# ⚡ Performance Tip

Before adding an expression index, try the rewrite catalogue: arithmetic, rounding, prefix, `COALESCE` and type-mismatch problems usually disappear with a rewrite and need no new index at all.

---

# 🔒 Security Note

A function-based unique index enforces rules the application might otherwise miss—for example `UNIQUE (LOWER(Email))` stops two accounts differing only in case. Rely on the database for such identity rules; application-only checks race and can be bypassed.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Expression index | ❌ | ✅ | ✅ (8.0.13+) | Via computed column | ✅ (function-based) | ✅ (3.9+) |
| Generated columns | ✅ (SQL:2003) | ✅ (12+, stored; 18+ virtual) | ✅ (5.7+) | ✅ (computed) | ✅ (virtual, 11g+) | ✅ (3.31+) |
| Query expression matched to generated column | — | ❌ (reference the column) | ✅ | ✅ | ✅ | ❌ |
| UDFs in indexes | — | `IMMUTABLE` only | ❌ | Deterministic, schemabound | `DETERMINISTIC` | Deterministic |
| Statistics on expressions | — | ✅ | ✅ (histograms on functional parts) | ✅ | ✅ | ✅ |

> **Portability Tip:** Indexed generated columns are the most portable way to index an expression: every major engine supports them, and queries can reference the column by name without repeating the expression.

---

# Common Mistakes

### Mistake 1

Wrapping an indexed column in a function and wondering why the index is ignored.

---

### Mistake 2

Creating an expression index and querying a slightly different expression.

---

### Mistake 3

Indexing an expression that could have been rewritten away.

---

### Mistake 4

Indexing a slow or non-deterministic UDF.

---

### Mistake 5

Normalising with functions in every query instead of once on write.

---

# Best Practices

✔ Keep indexed columns bare; move functions to the constant side.

✔ Use the rewrite catalogue before adding indexes.

✔ Prefer indexed generated columns for derived values queries filter on.

✔ Normalise canonical forms on write and enforce them with constraints.

✔ Verify every fix in the actual execution plan.

---

# Interview Questions

## Basic

1. Why does `WHERE LOWER(Email) = …` not use an index on `Email`?
2. How do you rewrite `WHERE LEFT(Code, 3) = 'ABC'`?
3. What is an expression index?

## Intermediate

4. How do you index a computed value on SQL Server?
5. Why must an indexed function be deterministic?
6. How do you rewrite `WHERE COALESCE(Status, 'New') = 'New'`?

## Advanced

7. When would you choose a generated column over an expression index?
8. What does an expression index cost on writes?
9. Walk through diagnosing a slow query caused by a function predicate.

---

# Hands-on Exercises

## Exercise 1

Rewrite five non-sargable predicates from the catalogue and confirm index use in plans.

---

## Exercise 2

Add an expression index for case-insensitive email lookup and verify the query uses it.

---

## Exercise 3

Add an indexed `EmailDomain` generated column and count customers per domain using it.

---

## Exercise 4

Measure insert time into `Customers` with and without two expression indexes.

---

# Related Topics

- **12.14 — Execution Flow of Scalar Functions**
- **12.16 — Common Scalar Function Mistakes & Best Practices**
- **06.12 — SARGability and Index-Friendly Predicates**
- **10.10 — Partial and Expression Indexes**
- **10.13 — The Cost of Indexes (Writes, Storage and Locking)**
- **15.xx — Query Optimization**

---

# Summary

A function applied to an indexed column hides the column's order from the index, so the engine must compute the function for every row. Most such predicates can be rewritten—moving arithmetic to the constant side, using ranges, prefix `LIKE`, `OR … IS NULL` and correctly typed literals. When a derived value is genuinely needed, index it with an expression index, a functional key part, or an indexed computed or generated column, and make queries use the exact same expression (or the generated column's name). Normalising on write is often better still. Expression indexes cost CPU on every write and must be deterministic, so index the expressions hot queries use and verify each change in the plan.
