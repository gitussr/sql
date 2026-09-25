---
title: "10.07 - Unique Indexes and Constraints"
description: "Enforcing uniqueness with indexes: unique indexes versus UNIQUE and PRIMARY KEY constraints, composite uniqueness, NULL handling in unique indexes across engines, case-insensitive and conditional uniqueness, finding duplicates first, and how uniqueness helps the optimizer."
chapter: 10
section: 10.07
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 30 min
lastUpdated: 2026-09-25
---

# 10.07 Unique Indexes and Constraints

---

# Learning Objectives

After completing this section, you will be able to:

- Enforce uniqueness with a `UNIQUE` constraint or a unique index.
- Explain the relationship between primary keys, unique constraints and unique indexes.
- Define uniqueness over several columns.
- Predict how each engine treats `NULL` in unique indexes.
- Enforce case-insensitive and conditional uniqueness.
- Explain how uniqueness information improves query plans.

---

# What is a Unique Index?

A **unique index** is an index that rejects any insert or update that would create a second entry with the same key.

```sql
CREATE UNIQUE INDEX UX_Customers_Email ON Customers (Email);

INSERT INTO Customers (CustomerID, CustomerName, Email) VALUES (1, 'Asha', 'asha@example.com');
INSERT INTO Customers (CustomerID, CustomerName, Email) VALUES (2, 'Asha K', 'asha@example.com');
-- ❌ duplicate key value violates unique constraint "ux_customers_email"
```

Checking uniqueness requires finding whether the key already exists—exactly what a B-tree does in a few page reads. That is why every engine enforces uniqueness with an index.

---

# Constraint vs Index

```sql
-- Declarative constraint (standard SQL): creates a unique index behind the scenes
ALTER TABLE Customers ADD CONSTRAINT UQ_Customers_Email UNIQUE (Email);

-- Index created directly (vendor syntax)
CREATE UNIQUE INDEX UX_Customers_Email ON Customers (Email);
```

| | `UNIQUE` constraint | Unique index |
|---|---------------------|--------------|
| Part of the SQL standard | ✅ | ❌ |
| Can be referenced by a foreign key | ✅ | Engine-dependent (✅ SQL Server, MySQL, PostgreSQL; Oracle needs a constraint) |
| Partial / filtered / expression | ❌ | ✅ where supported |
| `INCLUDE` columns | SQL Server ✅ via index options | ✅ |
| Documents intent in the schema | ✅ (it is a rule) | Less so (it looks like tuning) |

Prefer the **constraint** when uniqueness is a business rule on plain columns; use a **unique index** when you need something constraints cannot express (partial, expression-based, or with included columns).

---

# Primary Keys

A primary key is a unique constraint plus `NOT NULL`, limited to one per table. Its index is also the clustered index on SQL Server (by default), InnoDB and SQLite (Section 10.04).

```sql
CREATE TABLE Orders (
    OrderID INT NOT NULL,
    ...
    CONSTRAINT PK_Orders PRIMARY KEY (OrderID)
);
```

---

# Composite Uniqueness

```sql
-- A product may appear only once per order
ALTER TABLE OrderItems ADD CONSTRAINT UQ_OrderItems_Order_Product UNIQUE (OrderID, ProductID);
```

The combination must be unique; each column individually may repeat. The resulting index `(OrderID, ProductID)` also serves every query that filters on `OrderID`—a unique constraint is often the composite index you needed anyway.

---

# NULL in Unique Indexes

The standard says `NULL`s are never equal, so several rows may have `NULL` in a unique column. Engines disagree:

| Engine | Multiple `NULL`s allowed in a unique column? |
|--------|---------------------------------------------|
| PostgreSQL | ✅ (default); `UNIQUE NULLS NOT DISTINCT` (15+) allows only one |
| MySQL | ✅ |
| SQL Server | ❌ only **one** `NULL` (treated as a value) |
| Oracle | ✅ for single-column keys (all-`NULL` keys are not indexed); composite keys with the same non-null parts conflict |
| SQLite | ✅ |

```sql
-- SQL Server: allow many NULLs, but unique non-null values
CREATE UNIQUE INDEX UX_Customers_Email ON Customers (Email) WHERE Email IS NOT NULL;

-- PostgreSQL 15+: treat NULLs as equal (at most one NULL)
ALTER TABLE Customers ADD CONSTRAINT UQ_Customers_Phone UNIQUE NULLS NOT DISTINCT (Phone);
```

---

# Case-Insensitive Uniqueness

`'Asha@Example.com'` and `'asha@example.com'` are different strings under a case-sensitive collation. To treat them as duplicates:

```sql
-- PostgreSQL, SQLite, Oracle: expression index
CREATE UNIQUE INDEX UX_Customers_LowerEmail ON Customers (LOWER(Email));

-- MySQL: default collations (e.g. utf8mb4_0900_ai_ci) are already case-insensitive
-- SQL Server: default collations are usually case-insensitive (…_CI_AS)

-- PostgreSQL alternative: case-insensitive column type
-- Email CITEXT  (extension)  or a nondeterministic ICU collation
```

Queries must then use the same expression (`WHERE LOWER(Email) = LOWER(?)`) to benefit from the index (Section 10.10).

---

# Conditional Uniqueness

"Only one active subscription per customer", "only one primary address per customer":

```sql
-- PostgreSQL, SQLite: partial unique index
CREATE UNIQUE INDEX UX_Addresses_Primary ON Addresses (CustomerID) WHERE IsPrimary = TRUE;

-- SQL Server: filtered unique index
CREATE UNIQUE INDEX UX_Addresses_Primary ON Addresses (CustomerID) WHERE IsPrimary = 1;

-- Oracle: function-based index; NULL keys are not indexed
CREATE UNIQUE INDEX UX_Addresses_Primary
ON Addresses (CASE WHEN IsPrimary = 1 THEN CustomerID END);

-- MySQL: functional index with the same NULL trick (8.0.13+)
CREATE UNIQUE INDEX UX_Addresses_Primary
ON Addresses ((CASE WHEN IsPrimary = 1 THEN CustomerID END));
```

This is also the standard way to make soft-deleted rows ignore uniqueness: `UNIQUE (Email) WHERE DeletedAt IS NULL`.

---

# Adding Uniqueness to Existing Data

A unique index cannot be created while duplicates exist. Find them first (Section 08.08):

```sql
SELECT LOWER(Email) AS EmailKey, COUNT(*) AS Customers
FROM Customers
WHERE Email IS NOT NULL
GROUP BY LOWER(Email)
HAVING COUNT(*) > 1;
```

Resolve them, then create the index—online on large tables. Between cleaning and creating, new duplicates can appear; creating the index is the only reliable end to that race.

---

# Deferrable Constraints

Standard SQL allows a constraint to be checked at commit rather than per statement:

```sql
-- PostgreSQL, Oracle
ALTER TABLE Seats ADD CONSTRAINT UQ_Seats_Position UNIQUE (RowNo, SeatNo)
    DEFERRABLE INITIALLY DEFERRED;

-- Swap two seats inside one transaction without a temporary violation
```

Deferrable uniqueness needs a non-unique check path internally and is slower; use it only where rows legitimately pass through duplicate states within a transaction. MySQL, SQL Server and SQLite do not support deferrable unique constraints.

---

# How Uniqueness Helps the Optimizer

A unique index tells the optimizer that a lookup returns **at most one row**:

- An equality seek on a unique key stops after one entry.
- A join to a unique key cannot multiply rows, so `IN`/`EXISTS` and inner joins become interchangeable (Section 09.13), and `DISTINCT` over such joins can be removed.
- Some engines eliminate joins entirely when a unique key guarantees the join adds no rows and no columns are used from the joined table.
- A scalar subquery on a unique key needs no "more than one row" check (Section 09.03).

Declaring uniqueness that the data already has is therefore a performance feature as well as an integrity feature.

---

# Visual Representation

```text
INSERT Email = 'ravi@example.com'
        │
        ▼
Unique index: seek 'ravi@example.com'
        │
   ┌────┴─────────┐
 found          not found
   │               │
   ▼               ▼
 ERROR:         insert key + row
 duplicate      (both in one atomic step)
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← seeks on a unique key return at most one row
2. JOIN        ← joins to a unique key never multiply rows
3. WHERE
4. GROUP BY    ← grouping by a unique key needs no aggregation work per group
5. HAVING
6. SELECT
7. DISTINCT    ← can be removed when a unique key is selected
8. ORDER BY
9. LIMIT / FETCH / TOP
```

For writes, uniqueness is checked as each row is inserted or updated (or at commit, for deferred constraints).

---

# How the DBMS Executes This

```text
INSERT INTO Customers … Email = 'ravi@example.com'

1. Insert the row into the table (heap or clustered index)
2. For each index: insert the entry
   Unique index: descend to the key position
       ├─ existing live entry with same key → raise error (statement rolls back)
       ├─ entry of an uncommitted concurrent insert → WAIT for that transaction
       └─ no entry → insert
```

The wait in the middle is how concurrent inserts of the same value are serialised: the second transaction blocks until the first commits (then errors) or rolls back (then succeeds).

---

# 🔬 Engine Deep Dive

`INSERT … ON CONFLICT` (PostgreSQL, SQLite), `INSERT … ON DUPLICATE KEY UPDATE` (MySQL) and `MERGE` (SQL Server, Oracle) all rely on unique indexes: the index is the arbiter that decides whether the row "already exists". PostgreSQL's `ON CONFLICT (Email)` requires a unique index or constraint on exactly that column list (or matching partial index predicate) to exist.

---

# 🏗️ Architecture Insight

Every natural key in the domain—e-mail, IBAN, SKU, national ID—should be backed by a unique constraint even when a surrogate key is the primary key. Without it, the database cannot prevent duplicates, and "check then insert" logic in the application will eventually let them in under concurrency.

---

# ⚡ Performance Tip

Declare unique constraints wherever the data is unique. They cost little more than the non-unique index you would need for lookups anyway, and they give the optimizer cardinality guarantees that improve join and subquery plans.

---

# 🔒 Security Note

Unique constraint errors can leak information: an error "e-mail already registered" on a sign-up form confirms that an account exists. Applications should translate constraint violations into messages that do not reveal whether a particular value is already in the database.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `UNIQUE` constraint | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multiple `NULL`s in unique column | ✅ | ✅ | ✅ | ❌ (one) | ✅ | ✅ |
| `NULLS NOT DISTINCT` | ✅ (SQL:2023) | ✅ (15+) | ❌ | n/a | ❌ | ❌ |
| Partial / filtered unique index | n/a | ✅ | Functional-index workaround | ✅ | Function-based workaround | ✅ |
| Deferrable unique constraint | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| FK referencing a unique index (not constraint) | n/a | ✅ | ✅ | ✅ | ❌ | ✅ |

> **Portability Tip:** A plain `UNIQUE` constraint on `NOT NULL` columns behaves identically everywhere. `NULL` handling and conditional uniqueness are where engines differ.

---

# Common Mistakes

### Mistake 1

Enforcing uniqueness only in application code ("check then insert").

---

### Mistake 2

Assuming SQL Server allows several `NULL`s in a unique column.

---

### Mistake 3

Adding `INCLUDE`-worthy columns to a unique key and weakening the constraint.

---

### Mistake 4

Forgetting case-insensitivity for e-mail addresses and user names.

---

### Mistake 5

Creating a non-unique index on a column that is in fact unique, and losing the optimizer benefits.

---

# Best Practices

✔ Back every natural key with a unique constraint.

✔ Use constraints for business rules; unique indexes for partial or expression-based rules.

✔ Decide explicitly how `NULL`s should behave and test it on your engine.

✔ Find and fix duplicates before adding a unique index.

✔ Use partial unique indexes for "one active per parent" rules and soft deletes.

---

# Interview Questions

## Basic

1. What does a unique index do?
2. What is the difference between a primary key and a unique constraint?
3. How do you make a pair of columns unique together?

## Intermediate

4. How many `NULL`s can a unique column hold on SQL Server? On PostgreSQL?
5. How do you enforce case-insensitive uniqueness of e-mail addresses?
6. How do you allow only one primary address per customer?

## Advanced

7. How do unique indexes serialise concurrent inserts of the same value?
8. How does uniqueness help the optimizer with joins and `DISTINCT`?
9. When would you use a deferrable unique constraint?

---

# Hands-on Exercises

## Exercise 1

Add a case-insensitive unique index on `Customers.Email` after removing duplicates.

---

## Exercise 2

Test on your engine how many `NULL` e-mails a unique index allows.

---

## Exercise 3

Enforce "only one open cart per customer" with a partial or filtered unique index.

---

## Exercise 4

Open two sessions and insert the same unique value concurrently; observe the blocking and the outcome after commit and rollback.

---

# Related Topics

- **10.03 — Creating and Managing Indexes**
- **10.10 — Partial and Expression Indexes**
- **08.08 — HAVING**
- **09.13 — Subqueries vs JOINs**
- **03.07.03 — Candidate Key**

---

# Summary

Uniqueness is enforced by a unique B-tree index, created either by a standard `UNIQUE`/`PRIMARY KEY` constraint or directly with `CREATE UNIQUE INDEX`. Constraints express business rules; unique indexes add partial, expression-based and covering variants. Composite uniqueness applies to the combination of columns, and `NULL` handling differs—SQL Server allows one `NULL`, others allow many, and PostgreSQL 15+ offers `NULLS NOT DISTINCT`. Case-insensitive and conditional rules need expression or partial indexes. Unique indexes also serialise concurrent inserts, arbitrate upserts, and tell the optimizer that lookups and joins return at most one row.
