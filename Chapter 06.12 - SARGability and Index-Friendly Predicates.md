---
title: "06.12 - SARGability and Index-Friendly Predicates"
description: "Learn what SARGable means and how to write WHERE predicates that can use indexes: avoiding functions and arithmetic on columns, implicit conversions, leading wildcards, and OR traps, plus composite index order, expression indexes, and partial indexes."
chapter: 6
section: 6.12
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 65 min
lastUpdated: 2026-09-19
---

# 06.12 SARGability and Index-Friendly Predicates

---

# Learning Objectives

After completing this section, you will be able to:

- Define SARGable and non-SARGable predicates.
- Recognize the patterns that prevent index seeks.
- Rewrite non-SARGable predicates into SARGable ones.
- Explain how composite index column order affects filtering.
- Use expression indexes, computed columns, and partial indexes.
- Verify SARGability in an execution plan.

---

# What Does SARGable Mean?

**SARG** stands for **Search ARGument**.

A predicate is **SARGable** when the database can use it to **navigate an index**—to seek directly to matching entries—instead of evaluating the predicate on every row.

```sql
WHERE OrderDate >= DATE '2026-01-01'          -- SARGable
```

```sql
WHERE YEAR(OrderDate) = 2026                  -- not SARGable
```

Both return the same rows. On a large table, the first may read a few thousand index entries; the second reads every row.

---

# The Core Rule

> **Leave the indexed column alone.**

A B-tree index is sorted by the **stored value** of the column. The engine can seek in that order only when the predicate compares the stored value directly:

```text
column  <operator>  expression-not-depending-on-the-row
```

Anything applied **to the column**—a function, arithmetic, a conversion, a leading wildcard—produces a value the index is not sorted by.

---

# Pattern 1: Functions on the Column

| Non-SARGable | SARGable |
|--------------|----------|
| `WHERE YEAR(OrderDate) = 2026` | `WHERE OrderDate >= DATE '2026-01-01' AND OrderDate < DATE '2027-01-01'` |
| `WHERE CAST(CreatedAt AS DATE) = DATE '2026-03-15'` | `WHERE CreatedAt >= TIMESTAMP '2026-03-15 00:00:00' AND CreatedAt < TIMESTAMP '2026-03-16 00:00:00'` |
| `WHERE UPPER(Email) = 'A@X.COM'` | Case-insensitive collation, or an expression index on `UPPER(Email)` |
| `WHERE LEFT(PostalCode, 3) = '700'` | `WHERE PostalCode LIKE '700%'` |
| `WHERE COALESCE(Status, 'New') = 'New'` | `WHERE Status = 'New' OR Status IS NULL` |

> **Note:** SQL Server can still seek when a `datetime` column is cast to `date`, but this is an optimizer special case. Writing the range explicitly works on every database.

---

# Pattern 2: Arithmetic on the Column

| Non-SARGable | SARGable |
|--------------|----------|
| `WHERE Salary * 12 > 600000` | `WHERE Salary > 50000` |
| `WHERE Price + 10 < 100` | `WHERE Price < 90` |
| `WHERE OrderDate + 30 > CURRENT_DATE` | `WHERE OrderDate > CURRENT_DATE - 30` (using your database's date arithmetic) |

Move the arithmetic to the constant side. The optimizer folds the constant once (Section 06.11).

---

# Pattern 3: Implicit Conversion

```sql
-- AccountNumber is VARCHAR(20)
WHERE AccountNumber = 12345
```

The database may convert `AccountNumber` to a number on every row, preventing a seek (and failing on non-numeric values).

```sql
WHERE AccountNumber = '12345'
```

A subtle version happens with application parameters: in SQL Server, an `NVARCHAR` parameter compared to a `VARCHAR` column can force a conversion of the column. Declare parameter types to match column types exactly.

---

# Pattern 4: Leading Wildcards

| Non-SARGable | SARGable |
|--------------|----------|
| `WHERE Name LIKE '%son'` | — (use a reverse-string expression index or full-text/trigram index) |
| `WHERE Name LIKE '%son%'` | — (use trigram or full-text indexing) |
| — | `WHERE Name LIKE 'Son%'` |

Only a known **prefix** gives the engine a starting point in the sorted index.

---

# Pattern 5: OR Across Different Columns

```sql
WHERE FirstName = 'Asha'
   OR LastName = 'Rao'
```

No single index is sorted by both columns. The optimizer may combine two indexes (index union / bitmap OR), or fall back to a scan.

Alternatives:

```sql
SELECT * FROM People WHERE FirstName = 'Asha'
UNION
SELECT * FROM People WHERE LastName = 'Rao';
```

Ensure each branch has a suitable index, and check the plan.

---

# Pattern 6: Negation

```sql
WHERE Status <> 'Closed'
WHERE Status NOT IN ('Closed', 'Archived')
WHERE Name NOT LIKE 'A%'
```

These are technically evaluable against an index, but they usually match most of the table, so a scan is often cheaper. When the "remaining" set is small, express it positively:

```sql
WHERE Status IN ('Open', 'Pending')
```

---

# Composite Indexes and Column Order

A composite index on `(CustomerID, OrderDate)` is sorted first by `CustomerID`, then by `OrderDate` within each customer.

```text
CustomerID │ OrderDate
───────────┼────────────
    16     │ 2026-02-01
    17     │ 2025-11-03
    17     │ 2026-01-15   ◄─┐
    17     │ 2026-03-02   ◄─┤ one contiguous range
    17     │ 2026-04-20   ◄─┘
    18     │ 2026-01-09
```

| Predicate | Can seek? |
|-----------|-----------|
| `CustomerID = 17` | ✅ Leading column |
| `CustomerID = 17 AND OrderDate >= '2026-01-01'` | ✅ Both columns, one range |
| `OrderDate >= '2026-01-01'` | ❌ Not the leading column (full index scan at best) |
| `CustomerID > 10 AND OrderDate = '2026-01-15'` | Partially: range on `CustomerID`, `OrderDate` as filter |

Guidelines:

- Put **equality** columns first.
- Put the **range** column after the equality columns.
- Columns after the first range column are used as filters, not for seeking.

Some databases (Oracle, MySQL 8, and PostgreSQL 18 support a *skip scan*) can use an index without its leading column when that column has few distinct values, but you should not design around it.

---

# Expression (Function-Based) Indexes

When a function on the column is genuinely required, index the expression itself:

```sql
-- PostgreSQL, Oracle, SQLite
CREATE INDEX idx_users_email_lower
ON Users (LOWER(Email));
```

```sql
-- MySQL 8.0.13+
CREATE INDEX idx_users_email_lower
ON Users ((LOWER(Email)));
```

```sql
-- SQL Server: computed column, then index it
ALTER TABLE Users ADD EmailLower AS LOWER(Email);
CREATE INDEX idx_users_email_lower ON Users (EmailLower);
```

The query must use **the same expression** for the index to apply:

```sql
WHERE LOWER(Email) = 'a@x.com'
```

---

# Partial (Filtered) Indexes

When queries always target a small subset, index only that subset:

```sql
-- PostgreSQL / SQLite: partial index
CREATE INDEX idx_orders_unshipped
ON Orders (OrderDate)
WHERE ShippedDate IS NULL;
```

```sql
-- SQL Server: filtered index
CREATE INDEX idx_orders_unshipped
ON Orders (OrderDate)
WHERE ShippedDate IS NULL;
```

The index stays small and fast, and queries with the matching condition can use it.

---

# Covering Indexes

If an index contains every column a query needs, the engine never visits the table:

```sql
CREATE INDEX idx_orders_customer_date
ON Orders (CustomerID, OrderDate)
INCLUDE (TotalAmount);          -- PostgreSQL 11+, SQL Server
```

```sql
SELECT OrderDate, TotalAmount
FROM Orders
WHERE CustomerID = 17
  AND OrderDate >= DATE '2026-01-01';
```

This is an **index-only scan**: SARGable access plus no table lookups.

---

# Before and After

```sql
-- Before: three non-SARGable predicates
SELECT OrderID
FROM Orders
WHERE YEAR(OrderDate) = 2026
  AND UPPER(Status) = 'OPEN'
  AND TotalAmount * 1.18 > 1000;
```

```sql
-- After: all SARGable (assuming Status is stored in a consistent case)
SELECT OrderID
FROM Orders
WHERE OrderDate >= DATE '2026-01-01'
  AND OrderDate <  DATE '2027-01-01'
  AND Status = 'Open'
  AND TotalAmount > 1000 / 1.18;
```

---

# Verifying SARGability

Never assume—check the plan:

```text
PostgreSQL   Index Cond: (...)           ← SARGable, used for access
             Filter: (...)               ← evaluated after reading

SQL Server   Seek Predicates             ← SARGable
             Predicate                   ← residual filter

Oracle       access(...)                 ← SARGable
             filter(...)                 ← residual filter

MySQL        type: range / ref           ← index access
             type: ALL                   ← full table scan
```

A predicate you expected to be an access predicate appearing as a filter is the clearest sign of a SARGability problem.

---

# Visual Representation

```text
SARGable: OrderDate >= '2026-01-01'

Index (sorted by OrderDate)
│2025-11│2025-12│2026-01│2026-02│2026-03│
                  ▲──────────────────────►
                  seek, then read forward


Non-SARGable: YEAR(OrderDate) = 2026

Index is sorted by OrderDate, not by YEAR(OrderDate)
│2025-11│2025-12│2026-01│2026-02│2026-03│
 ▲──────────────────────────────────────►
 compute YEAR() for every entry
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE   ← SARGable predicates let the engine skip rows before reading them
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Predicate arrives at the optimizer

↓

Is the column bare, with a row-independent value on the other side?

├── yes → Does an index lead with this column
│         (after any equality columns)?
│         ├── yes → access predicate (seek / range scan)
│         └── no  → filter predicate
│
└── no  → Does an expression index match exactly?
          ├── yes → access predicate on the expression index
          └── no  → filter predicate (evaluated on every row read)
```

---

# 🔬 Engine Deep Dive

Why can't the engine "just apply the function to the index"?

```text
Index on Email (sorted):
    alice@x.com
    Bob@x.com
    carol@x.com
    ZED@x.com

Sorted by LOWER(Email) instead:
    alice@x.com
    bob@x.com
    carol@x.com
    zed@x.com
```

For `LOWER()` the orders happen to be similar, but for most functions (`YEAR()`, arithmetic, `SUBSTRING()`, hash functions) the transformed values are not in the same order as the stored values. The engine cannot know where the matching entries lie without computing the function for each entry—which is exactly a scan. An expression index solves this by storing the entries sorted by the computed value.

---

# 🏗️ Architecture Insight

SARGability is the contract between query design and physical design. Queries must present predicates in a form indexes can use, and the schema must provide indexes shaped like the queries' most important predicates. Neither side can make a slow filter fast on its own.

---

# ⚡ Performance Tip

Before adding a new index to fix a slow query, check whether the existing predicates are SARGable. Rewriting one `YEAR(OrderDate) = 2026` into a date range often makes an existing index usable and removes the need for a new one.

---

# 🔒 Security Note

Non-SARGable filters on public-facing endpoints can be abused: an attacker who can trigger many full-table scans (for example, through a search field backed by `LIKE '%term%'`) can degrade the database for all users. Rate-limit expensive searches and ensure public filters are index-supported.

---

# 🌍 Production Consideration

ORMs and query builders frequently generate non-SARGable SQL—functions on columns, mismatched parameter types, or `OR`-heavy optional filters. Review the SQL your ORM actually sends for high-traffic queries, not just the application code that produces it.

---

# 🚀 Enterprise Practice

Enterprise teams include SARGability checks in code review and automated SQL linting, flagging functions applied to columns in `WHERE`, implicit conversions, and leading wildcards. Query stores and slow-query logs are reviewed regularly to catch regressions after releases.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| B-tree indexes | Not standardized | ✅ | ✅ | ✅ | ✅ | ✅ |
| Expression indexes | — | ✅ | ✅ (8.0.13+) | Via computed columns | ✅ | ✅ |
| Partial / filtered indexes | — | ✅ | ❌ | ✅ | Via function-based indexes | ✅ |
| Included (covering) columns | — | `INCLUDE` (11+) | Add to key | `INCLUDE` | Add to key | Add to key |
| Index skip scan | — | ✅ (18+) | ✅ (8.0.13+) | ❌ | ✅ | ✅ (with statistics) |

> **Portability Tip:** Indexes are outside the SQL standard entirely, but SARGable predicate writing is portable: bare columns, matching types, constant-side arithmetic, and prefix-only wildcards work well on every database.

---

# Common Mistakes

### Mistake 1

Applying `YEAR()`, `CAST()`, `UPPER()`, or other functions to indexed columns.

---

### Mistake 2

Putting arithmetic on the column side of a comparison.

---

### Mistake 3

Comparing columns with parameters or literals of a different type.

---

### Mistake 4

Ordering composite index columns with the range column first.

---

### Mistake 5

Creating an expression index but querying with a slightly different expression.

---

# Best Practices

✔ Keep indexed columns bare in predicates.

✔ Move arithmetic and conversions to the constant side.

✔ Match parameter types to column types exactly.

✔ Design composite indexes with equality columns first, then range columns.

✔ Use expression, partial, and covering indexes deliberately.

✔ Verify access predicates in the execution plan.

---

# Interview Questions

## Basic

1. What does SARGable mean?
2. Why is `WHERE YEAR(OrderDate) = 2026` not SARGable?
3. Rewrite `WHERE Price * 2 > 100` to be SARGable.

## Intermediate

4. Why does a leading wildcard prevent an index seek?
5. How can implicit conversion make a predicate non-SARGable?
6. Which predicates can use an index on `(CustomerID, OrderDate)`?

## Advanced

7. What are expression indexes, and when must the query match them exactly?
8. What is a partial or filtered index, and when is it useful?
9. How do you confirm in an execution plan that a predicate is SARGable?

---

# Hands-on Exercises

## Exercise 1

Rewrite as SARGable:

```sql
WHERE CAST(CreatedAt AS DATE) = DATE '2026-09-01'
```

---

## Exercise 2

Rewrite as SARGable:

```sql
WHERE DiscountPercent / 100 > 0.2
```

---

## Exercise 3

Design one composite index to support both queries:

```sql
WHERE CustomerID = ? AND Status = 'Open'
WHERE CustomerID = ? AND Status = 'Open' AND OrderDate >= ?
```

---

## Exercise 4

A login query runs `WHERE LOWER(Email) = LOWER(?)` on 50 million users. Propose two solutions that allow an index seek, and explain the trade-offs.

---

# Related Topics

- **06.07 — LIKE and Pattern Matching**
- **06.09 — Filtering with Expressions and Functions**
- **06.11 — Execution Flow of WHERE**
- **10.xx — Indexes**
- **15.xx — Query Optimization**
- **16.xx — Reading Execution Plans**

---

# Summary

A SARGable predicate compares a bare column with a value that does not depend on the row, allowing the engine to seek or range-scan an index instead of evaluating every row. Functions, arithmetic, and conversions on the column, leading wildcards, and `OR` across columns commonly break SARGability. Rewriting predicates to keep columns bare, ordering composite index columns with equality before range, and using expression, partial, and covering indexes where appropriate turns slow filters into fast ones—and execution plans confirm whether each predicate is truly being used for access.
