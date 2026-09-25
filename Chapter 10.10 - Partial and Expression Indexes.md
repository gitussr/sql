---
title: "10.10 - Partial and Expression Indexes"
description: "Indexing some rows and computed values: partial (filtered) indexes and when the optimizer can use them, expression and function-based indexes, computed-column indexes on SQL Server, matching query expressions exactly, case-insensitive search, date truncation, JSON attributes, and determinism requirements."
chapter: 10
section: 10.10
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 30 min
lastUpdated: 2026-09-25
---

# 10.10 Partial and Expression Indexes

---

# Learning Objectives

After completing this section, you will be able to:

- Create partial (filtered) indexes that cover only the rows queries need.
- Explain when the optimizer can prove a partial index applies.
- Create expression (function-based) indexes for computed predicates.
- Write queries whose expressions match the index exactly.
- Index JSON attributes and case-insensitive values.
- Use the equivalent techniques on engines without direct support.

---

# Partial (Filtered) Indexes

A **partial index** (PostgreSQL, SQLite) or **filtered index** (SQL Server) includes only rows that satisfy a `WHERE` condition.

```sql
-- 2% of orders are pending, and the pending queue is queried constantly
CREATE INDEX IX_Orders_Pending ON Orders (OrderDate)
WHERE Status = 'Pending';
```

```text
Full index on (Status, OrderDate)      Partial index on (OrderDate) WHERE Status = 'Pending'
5 000 000 entries                      100 000 entries
~150 MB                                ~3 MB, usually fully cached
every order insert/update touches it   only pending orders touch it
```

Typical uses:

| Pattern | Partial index |
|---------|---------------|
| Work queues | `WHERE Status IN ('Pending', 'Processing')` |
| Soft delete | `WHERE DeletedAt IS NULL` |
| Sparse columns | `WHERE ExternalRef IS NOT NULL` |
| Hot recent data | `WHERE IsArchived = FALSE` |
| Conditional uniqueness | `UNIQUE … WHERE IsPrimary` (Section 10.07) |

---

# When the Optimizer Can Use a Partial Index

The optimizer must **prove** that every row the query needs is in the index—that the query's `WHERE` implies the index's `WHERE`.

```sql
CREATE INDEX IX_Orders_Pending ON Orders (OrderDate) WHERE Status = 'Pending';

-- ✅ Query predicate matches the index predicate
SELECT OrderID FROM Orders WHERE Status = 'Pending' AND OrderDate < DATE '2026-09-01';

-- ❌ No Status predicate: rows outside the index could qualify
SELECT OrderID FROM Orders WHERE OrderDate < DATE '2026-09-01';

-- ❌ Parameter: the plan must work for any value, not just 'Pending'
SELECT OrderID FROM Orders WHERE Status = ? AND OrderDate < ?;
```

The last case is the important trap: with a parameterised status, generic plans cannot use the partial index. Write the constant literally in queries that should use it (it is not user input, so this is safe), or use a separate query per status.

Engines prove implication for simple cases—equality, `IS NULL`/`IS NOT NULL`, some ranges (`x > 10` implies `x > 5`). Complex expressions must match closely.

---

# Filtered Indexes on SQL Server

```sql
CREATE NONCLUSTERED INDEX IX_Orders_Pending
ON dbo.Orders (OrderDate) INCLUDE (CustomerID, TotalAmount)
WHERE Status = 'Pending';
```

SQL Server restrictions: the filter must be a simple comparison (no functions, no `OR` across columns, no computed columns), and queries with parameters or local variables often cannot match it unless compiled with `OPTION (RECOMPILE)`. Some session settings (`ANSI_NULLS`, `QUOTED_IDENTIFIER`, etc.) must be `ON` for modifications to succeed.

---

# Engines Without Partial Indexes

Oracle and MySQL have no `WHERE` clause on indexes. Oracle's B-tree does not index rows whose key is entirely `NULL`, which enables a function-based workaround:

```sql
-- Oracle: index only pending orders
CREATE INDEX IX_Orders_Pending ON Orders (CASE WHEN Status = 'Pending' THEN OrderDate END);

SELECT OrderID FROM Orders
WHERE (CASE WHEN Status = 'Pending' THEN OrderDate END) < DATE '2026-09-01';
```

MySQL 8.0.13+ can use the same trick with a functional index, but it still indexes the `NULL` entries, so it saves no space—only uniqueness workarounds benefit.

---

# Expression (Function-Based) Indexes

An **expression index** stores the result of an expression instead of a raw column. It makes non-SARGable predicates (Section 06.12) indexable.

```sql
-- Case-insensitive lookup
CREATE INDEX IX_Customers_LowerEmail ON Customers (LOWER(Email));
SELECT * FROM Customers WHERE LOWER(Email) = LOWER('Asha@Example.com');     -- ✅

-- Year of order
CREATE INDEX IX_Orders_Year ON Orders ((EXTRACT(YEAR FROM OrderDate)));
SELECT COUNT(*) FROM Orders WHERE EXTRACT(YEAR FROM OrderDate) = 2026;      -- ✅

-- Computed amount
CREATE INDEX IX_OrderItems_LineTotal ON OrderItems ((Quantity * UnitPrice));
SELECT * FROM OrderItems WHERE Quantity * UnitPrice > 1000;                  -- ✅
```

(PostgreSQL requires an extra pair of parentheses around expressions that are not simple function calls; MySQL requires them around every expression.)

---

# The Expression Must Match

The optimizer matches the query's expression to the index's expression **textually or structurally**, not semantically:

```sql
CREATE INDEX IX_Customers_LowerEmail ON Customers (LOWER(Email));

WHERE LOWER(Email) = 'asha@example.com'        -- ✅ same expression
WHERE UPPER(Email) = 'ASHA@EXAMPLE.COM'        -- ❌ different function
WHERE LOWER(TRIM(Email)) = 'asha@example.com'  -- ❌ different expression
WHERE Email ILIKE 'asha@example.com'           -- ❌ different operator
```

Standardise the expression in one place—a view, a generated column, or a shared query helper—so every query uses exactly the indexed form.

Often the better fix is to avoid the expression altogether: `OrderDate >= DATE '2026-01-01' AND OrderDate < DATE '2027-01-01'` uses a plain index on `OrderDate` and needs no expression index.

---

# Computed / Generated Columns

SQL Server has no expression indexes; instead, index a **computed column**. MySQL, PostgreSQL, Oracle and SQLite support generated columns too, which makes the expression visible and reusable.

```sql
-- SQL Server
ALTER TABLE Customers ADD EmailLower AS LOWER(Email) PERSISTED;
CREATE INDEX IX_Customers_EmailLower ON Customers (EmailLower);
-- Queries using LOWER(Email) = … can match the computed column automatically

-- MySQL 5.7+
ALTER TABLE Customers ADD EmailLower VARCHAR(255) GENERATED ALWAYS AS (LOWER(Email)) STORED;
CREATE INDEX IX_Customers_EmailLower ON Customers (EmailLower);

-- PostgreSQL 12+
ALTER TABLE Customers ADD COLUMN EmailLower TEXT GENERATED ALWAYS AS (LOWER(Email)) STORED;
```

---

# Determinism

An index stores the expression's result once, when the row is written. The expression must therefore always return the same result for the same input:

```sql
-- ❌ Not allowed: result changes over time
CREATE INDEX … ON Orders ((OrderDate > CURRENT_DATE - 30));

-- ❌ Not allowed (or dangerous): depends on session settings
CREATE INDEX … ON Orders ((TO_CHAR(OrderDate, 'Mon')));   -- depends on locale
```

PostgreSQL requires functions to be declared `IMMUTABLE`; SQL Server requires computed columns to be deterministic (and precise, to be persisted and indexed); Oracle requires `DETERMINISTIC` user functions. Marking a function immutable when it is not produces an index that silently disagrees with the table.

---

# Indexing JSON Attributes

A B-tree expression index on one extracted attribute is often better than a general JSON index:

```sql
-- PostgreSQL
CREATE INDEX IX_Events_Type ON Events ((Payload ->> 'type'));
SELECT * FROM Events WHERE Payload ->> 'type' = 'checkout';

-- MySQL: functional index with an explicit type
CREATE INDEX IX_Events_Type ON Events ((CAST(Payload ->> '$.type' AS CHAR(30)) COLLATE utf8mb4_bin));

-- SQL Server: computed column over JSON_VALUE
ALTER TABLE Events ADD EventType AS JSON_VALUE(Payload, '$.type');
CREATE INDEX IX_Events_Type ON Events (EventType);

-- Oracle
CREATE INDEX IX_Events_Type ON Events (JSON_VALUE(Payload, '$.type'));
```

---

# Combining Both

Partial and expression indexes combine naturally:

```sql
-- Case-insensitive unique e-mail among active customers only (PostgreSQL)
CREATE UNIQUE INDEX UX_Customers_ActiveEmail
ON Customers (LOWER(Email))
WHERE DeletedAt IS NULL;
```

---

# Visual Representation

```text
Full index              Partial index                Expression index
every row               only rows WHERE Status =     f(column) for every row
                        'Pending'
┌───────────────┐       ┌──────────┐                 ┌───────────────────────┐
│ ▪▪▪▪▪▪▪▪▪▪▪▪▪ │       │ ▪▪       │                 │ lower(email) → row    │
│ ▪▪▪▪▪▪▪▪▪▪▪▪▪ │       └──────────┘                 └───────────────────────┘
└───────────────┘       small, hot, cheap to write    makes f(col) = x SARGable
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← a partial index is a candidate only if the query's WHERE implies its filter
2. JOIN
3. WHERE       ← an expression index is used only if the WHERE contains the same expression
4. GROUP BY    ← grouping by an indexed expression can stream in index order
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY    ← ordering by an indexed expression can avoid a sort
9. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Candidate index: IX_Orders_Pending (OrderDate) WHERE Status = 'Pending'

1. Does query WHERE imply Status = 'Pending'?          (predicate proof)
       no  → index not considered
       yes ↓
2. Does query WHERE contain a condition on OrderDate?  (seekable?)
3. Cost it like any other index — with its much smaller size

Candidate index: IX_Customers_LowerEmail (lower(email))

1. Does the query contain the expression lower(email)?  (expression match)
2. Is it compared with a constant/parameter by a supported operator?
3. Cost it; statistics on the expression come from ANALYZE of the index
```

---

# 🔬 Engine Deep Dive

PostgreSQL gathers statistics for expression indexes as if the expression were a column, so `WHERE LOWER(Email) = …` gets accurate row estimates once the index exists—even when the plan does not use it. The `CREATE STATISTICS` command (PostgreSQL 14+) can collect expression statistics without an index when you only need better estimates.

---

# 🏗️ Architecture Insight

Partial indexes let physical design follow the **lifecycle** of data: hot, active rows get rich, small indexes; cold history gets few or none. Combined with soft deletes and status columns, they keep OLTP indexes proportional to the working set rather than to the whole table's history.

---

# ⚡ Performance Tip

For work queues (`WHERE Status = 'Pending' ORDER BY CreatedAt LIMIT 10 FOR UPDATE SKIP LOCKED`), a partial index on `(CreatedAt) WHERE Status = 'Pending'` keeps each poll to a few page reads no matter how many millions of completed jobs the table holds.

---

# 🔒 Security Note

Expression indexes execute their function for every inserted and updated row, with the privileges of the index owner in some engines. On PostgreSQL, functions used in indexes should be `IMMUTABLE`, schema-qualified and owned by a trusted role, because a malicious or changed function affects every writer to the table.

---

# SQL Standard vs Vendor Differences

| Feature | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|---------|-----------|-------|-----------|--------|--------|
| Partial / filtered index | ✅ | ❌ | ✅ (simple predicates) | ❌ (`NULL` trick) | ✅ (3.8.0+) |
| Expression index | ✅ | ✅ (8.0.13+) | Via computed column | ✅ function-based | ✅ (3.9.0+) |
| Generated columns | ✅ (12+, stored) | ✅ (5.7+) | Computed columns | Virtual columns | ✅ (3.31+) |
| Determinism enforced | `IMMUTABLE` | Deterministic built-ins | Deterministic + precise | `DETERMINISTIC` | Deterministic functions |
| Parameterised queries use partial index | Custom plans only | n/a | Often needs `RECOMPILE` | n/a | ✅ if literal matches |

> **Portability Tip:** Generated (computed) columns with ordinary indexes are the most portable way to index an expression: the expression lives once in the table definition and queries can reference the column by name.

---

# Common Mistakes

### Mistake 1

Querying a partial index's filter column with a parameter, so the plan cannot use it.

---

### Mistake 2

Writing a slightly different expression in the query than in the index.

---

### Mistake 3

Creating an expression index where a SARGable rewrite would allow a plain index.

---

### Mistake 4

Using a non-deterministic function (or a falsely `IMMUTABLE` one) in an index.

---

### Mistake 5

Assuming Oracle and MySQL support `CREATE INDEX … WHERE`.

---

# Best Practices

✔ Use partial indexes for small, hot subsets: queues, active rows, sparse columns.

✔ Write partial-index predicates literally in the queries that need them.

✔ Prefer SARGable rewrites; use expression indexes when the expression is inherent.

✔ Centralise indexed expressions in generated columns or views.

✔ Index only deterministic expressions.

---

# Interview Questions

## Basic

1. What is a partial (filtered) index?
2. What is an expression index?
3. How do you index `LOWER(Email)`?

## Intermediate

4. Why can't a query with `WHERE Status = ?` use a partial index on `Status = 'Pending'`?
5. How do you emulate an expression index on SQL Server?
6. Why must an indexed expression be deterministic?

## Advanced

7. How does the optimizer decide that a partial index applies?
8. How can you emulate a partial index on Oracle?
9. When is a B-tree expression index on a JSON attribute better than a GIN index on the whole document?

---

# Hands-on Exercises

## Exercise 1

Create a partial index for pending orders and compare its size with a full index on `(Status, OrderDate)`.

---

## Exercise 2

Make `WHERE LOWER(Email) = ?` use an index on your engine.

---

## Exercise 3

Show a plan that uses the partial index with a literal and does not use it with a parameter.

---

## Exercise 4

Index the `type` attribute of a JSON payload column and query by it.

---

# Related Topics

- **10.07 — Unique Indexes and Constraints**
- **10.09 — Index Types (Hash, Bitmap, GIN, GiST, BRIN and Columnstore)**
- **06.09 — Filtering with Expressions and Functions**
- **06.12 — SARGability and Index-Friendly Predicates**
- **03.09.06 — Soft Delete Pattern**

---

# Summary

Partial (filtered) indexes include only rows matching a condition, making indexes for queues, active rows and sparse columns tiny and cheap to maintain; the optimizer uses them only when it can prove the query's `WHERE` implies the index's filter, which parameters often prevent. Expression (function-based) indexes store computed values so that predicates like `LOWER(Email) = …`, extracted JSON attributes and derived amounts become seekable, provided the query uses exactly the same deterministic expression. SQL Server uses computed columns and filtered indexes, Oracle relies on function-based indexes and its `NULL` behaviour, MySQL on functional indexes, and generated columns offer the most portable path.
