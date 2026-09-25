---
title: "09.11 - Subqueries in INSERT, UPDATE and DELETE"
description: "Driving data modification with subqueries: INSERT … SELECT, UPDATE with scalar and correlated subqueries, UPDATE … FROM and MERGE, DELETE with IN and EXISTS, the self-reference restriction, the NULL overwrite trap, and running such statements safely."
chapter: 9
section: 9.11
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 35 min
lastUpdated: 2026-09-25
---

# 09.11 Subqueries in INSERT, UPDATE and DELETE

---

# Learning Objectives

After completing this section, you will be able to:

- Copy rows between tables with `INSERT … SELECT`, including "insert if missing".
- Update columns from a correlated scalar subquery without overwriting unmatched rows with `NULL`.
- Choose between a correlated `UPDATE`, `UPDATE … FROM`/`JOIN` and `MERGE`.
- Delete rows with `IN`, `EXISTS` and `NOT EXISTS`.
- Work around MySQL's restriction on reading the table being modified.
- Preview, batch and verify subquery-driven modifications safely.

---

# Why Subqueries in DML?

Data modification rarely uses literal values alone. Real statements say:

- *Archive* every order older than two years.
- *Set* each customer's lifetime value to the sum of their orders.
- *Delete* products that have never been sold.
- *Insert* the customers from a staging table who are not already present.

Each needs the answer to a query. Every subquery form from this chapter—scalar, `IN`, `EXISTS`, derived table—can appear inside `INSERT`, `UPDATE` and `DELETE`.

---

# INSERT … SELECT

```sql
-- Archive orders from 2024
INSERT INTO OrdersArchive (OrderID, CustomerID, OrderDate, Status, TotalAmount)
SELECT o.OrderID, o.CustomerID, o.OrderDate, o.Status, o.TotalAmount
FROM Orders AS o
WHERE o.OrderDate < DATE '2025-01-01';
```

There are no parentheses around the `SELECT`, but it is a query supplying rows—a table subquery by another name. Always list the target columns explicitly; relying on column order breaks when either table changes.

---

# Insert If Missing

```sql
-- Add staged customers that do not exist yet
INSERT INTO Customers (CustomerID, CustomerName, Country)
SELECT s.CustomerID, s.CustomerName, s.Country
FROM StagingCustomers AS s
WHERE NOT EXISTS (
    SELECT 1 FROM Customers AS c WHERE c.CustomerID = s.CustomerID
);
```

This is correct for a single session, but under concurrency two sessions can both see "not exists" and both insert. The primary key catches the duplicate (one statement fails); for a race-free upsert use the engine's native form: `INSERT … ON CONFLICT DO NOTHING` (PostgreSQL, SQLite), `INSERT IGNORE` / `ON DUPLICATE KEY` (MySQL), or `MERGE` (SQL Server, Oracle, PostgreSQL 15+).

---

# INSERT with a Scalar Subquery

```sql
-- Record an order for the customer found by e-mail
INSERT INTO Orders (OrderID, CustomerID, OrderDate, Status, TotalAmount)
VALUES (
    5001,
    (SELECT c.CustomerID FROM Customers AS c WHERE c.Email = 'asha@example.com'),
    CURRENT_DATE,
    'Pending',
    250.00
);
```

If no customer matches, the subquery yields `NULL` and a guest order is silently created. If the column were `NOT NULL`, the insert would fail instead—which is usually the better outcome.

---

# UPDATE with a Correlated Scalar Subquery

```sql
-- Store each customer's lifetime value
UPDATE Customers AS c
SET LifetimeValue = (
    SELECT COALESCE(SUM(o.TotalAmount), 0)
    FROM Orders AS o
    WHERE o.CustomerID = c.CustomerID
);
```

(`UPDATE Customers AS c` works on PostgreSQL and SQLite; on SQL Server and Oracle write `UPDATE Customers c` or reference the table name in the subquery.)

---

# The NULL Overwrite Trap

```sql
-- Copy each product's price from a supplier price list
UPDATE Products
SET ListPrice = (
    SELECT sp.NewPrice
    FROM SupplierPrices AS sp
    WHERE sp.ProductID = Products.ProductID
);
```

```text
Products 1, 2, 3        SupplierPrices has rows for 1 and 2 only

Product 1  → 31.50
Product 2  → 185.00
Product 3  → NULL       ❌ price wiped out: the subquery found no row
```

An `UPDATE` without `WHERE` updates **every** row, and a scalar subquery with no match returns `NULL`. Always restrict the update to rows that have a match:

```sql
UPDATE Products
SET ListPrice = (
    SELECT sp.NewPrice FROM SupplierPrices AS sp
    WHERE sp.ProductID = Products.ProductID
)
WHERE EXISTS (
    SELECT 1 FROM SupplierPrices AS sp
    WHERE sp.ProductID = Products.ProductID
);
```

This pairing—scalar subquery in `SET`, matching `EXISTS` in `WHERE`—is the portable pattern for correlated updates.

---

# UPDATE … FROM / UPDATE with JOIN

Most engines offer a join syntax that reads the source once and updates only matched rows:

```sql
-- PostgreSQL
UPDATE Products AS p
SET ListPrice = sp.NewPrice
FROM SupplierPrices AS sp
WHERE sp.ProductID = p.ProductID;

-- SQL Server
UPDATE p
SET p.ListPrice = sp.NewPrice
FROM Products AS p
JOIN SupplierPrices AS sp ON sp.ProductID = p.ProductID;

-- MySQL
UPDATE Products AS p
JOIN SupplierPrices AS sp ON sp.ProductID = p.ProductID
SET p.ListPrice = sp.NewPrice;
```

Beware: if the source has **two** rows for one target row, the join forms silently apply one of them (which one is undefined), while the scalar-subquery form fails with "more than one row". The failure is safer. Ensure the source is unique on the join key—pre-aggregate it in a derived table if necessary.

---

# MERGE

`MERGE` combines insert, update and (optionally) delete driven by a source query:

```sql
MERGE INTO Products AS p
USING (
    SELECT ProductID, MAX(NewPrice) AS NewPrice      -- one row per product
    FROM SupplierPrices
    GROUP BY ProductID
) AS sp
ON (sp.ProductID = p.ProductID)
WHEN MATCHED THEN
    UPDATE SET ListPrice = sp.NewPrice
WHEN NOT MATCHED THEN
    INSERT (ProductID, ProductName, ListPrice)
    VALUES (sp.ProductID, 'New product', sp.NewPrice);
```

The `USING` clause is a derived table. The standard requires that each target row matches at most one source row; SQL Server and Oracle raise an error if it does not, which is why the source is grouped here.

---

# DELETE with Subqueries

```sql
-- Delete order lines of cancelled orders
DELETE FROM OrderItems
WHERE OrderID IN (
    SELECT o.OrderID FROM Orders AS o WHERE o.Status = 'Cancelled'
);

-- Delete products never sold
DELETE FROM Products
WHERE NOT EXISTS (
    SELECT 1 FROM OrderItems AS oi WHERE oi.ProductID = Products.ProductID
);

-- Delete all but the newest row per duplicate e-mail
DELETE FROM Customers
WHERE CustomerID NOT IN (
    SELECT MAX(c.CustomerID)
    FROM Customers AS c
    GROUP BY c.Email
);
```

The last statement is safe with `NOT IN` only because `MAX(CustomerID)` over a primary key can never be `NULL`. It also reads the table it deletes from—which MySQL does not allow directly (see below).

---

# Reading the Table Being Modified

The standard defines that a subquery sees the table **as it was before** the statement began, so self-referencing modifications are well defined. PostgreSQL, SQL Server, Oracle and SQLite follow this.

MySQL rejects it:

```text
ERROR 1093: You can't specify target table 'Customers' for update in FROM clause
```

The usual workaround is to wrap the subquery in a derived table, which MySQL materialises first:

```sql
-- MySQL
DELETE FROM Customers
WHERE CustomerID NOT IN (
    SELECT keep.CustomerID
    FROM (SELECT MAX(CustomerID) AS CustomerID
          FROM Customers GROUP BY Email) AS keep
);
```

(With derived-table merging enabled, MySQL may need `optimizer_switch='derived_merge=off'` or a `NO_MERGE` hint for this to work.) A multi-table `DELETE … JOIN` is the other common MySQL workaround.

---

# Running Modifications Safely

```sql
-- 1. Preview: run the subquery-driven WHERE as a SELECT
SELECT COUNT(*)
FROM Products
WHERE NOT EXISTS (SELECT 1 FROM OrderItems oi WHERE oi.ProductID = Products.ProductID);

-- 2. Modify inside a transaction and check the affected row count
BEGIN;
DELETE FROM Products
WHERE NOT EXISTS (SELECT 1 FROM OrderItems oi WHERE oi.ProductID = Products.ProductID);
-- expect the same count as step 1
COMMIT;   -- or ROLLBACK
```

For large tables, modify in batches (for example, 10 000 keys at a time selected by a subquery with a row limit) to keep transactions short and locks brief.

---

# Visual Representation

```text
UPDATE target SET col = (scalar subquery)      WHERE EXISTS (matching subquery)
┌─────────────┐                                ┌───────────────┐
│ Product 1   │ ── match ──→ 31.50  ✅          │ has a match?  │ ✅ updated
│ Product 2   │ ── match ──→ 185.00 ✅          │ has a match?  │ ✅ updated
│ Product 3   │ ── none ───→ NULL   ❌          │ has a match?  │ ❌ untouched
└─────────────┘                                └───────────────┘
 without WHERE: product 3 wiped              with WHERE EXISTS: product 3 kept
```

---

# 📍 Execution Order Reminder

For an `UPDATE` or `DELETE`, the logical order is:

```text
1. FROM        ← target table (and joined sources, where supported)
2. WHERE       ← subqueries choose the rows to modify, against the pre-statement data
3. SET         ← scalar subqueries compute new values for each chosen row
4. RETURNING / OUTPUT
```

All subqueries see the data as it was when the statement started, not as rows are being changed.

---

# How the DBMS Executes This

```text
UPDATE Products SET ListPrice = (SELECT …) WHERE EXISTS (SELECT …)

Plan
  Update on Products
    Hash Semi Join                      ← WHERE EXISTS unnested
      Seq Scan on Products
      Hash: SupplierPrices
    SubPlan (per updated row)           ← SET scalar subquery
      Index Scan on SupplierPrices (ProductID)
```

Many engines execute the `SET` subquery per updated row, so `UPDATE … FROM`/`MERGE` can be significantly faster for large updates because they read the source once.

---

# 🔬 Engine Deep Dive

To guarantee that subqueries see the pre-statement state, engines separate reading from writing. PostgreSQL relies on MVCC: the statement's snapshot never includes its own changes. SQL Server inserts a **table spool** ("Halloween protection") between the read and the write when the plan could otherwise see its own updates—for example, when an index being updated is also used to find the rows. MySQL's error 1093 is the historical alternative: forbid the pattern rather than protect it.

---

# 🏗️ Architecture Insight

Derived values maintained by `UPDATE … SET col = (SELECT SUM …)`—lifetime value, stock on hand, counters—are a form of denormalisation. The subquery defines the truth; the column caches it. Every such column needs an owner and a refresh strategy (trigger, scheduled job, or event-driven update), and a reconciliation query that compares the cached value with the subquery.

---

# ⚡ Performance Tip

Index the correlation column of the source table (`SupplierPrices(ProductID)`, `OrderItems(ProductID)`). A correlated `SET` subquery or `EXISTS` filter without it scans the source once per modified row.

---

# 🔒 Security Note

`UPDATE` and `DELETE` need `SELECT` privilege on every table their subqueries read, in addition to `UPDATE`/`DELETE` on the target. A user with `DELETE` on `Products` but no `SELECT` on `OrderItems` cannot run "delete never-sold products". Grant the narrowest set that the job requires.

---

# 🌍 Production Consideration

The two most expensive production incidents in this area are an `UPDATE` without a `WHERE` that sets unmatched rows to `NULL`, and a `DELETE … NOT IN` that deletes nothing (or everything) because of a `NULL`. Preview with `SELECT COUNT(*)`, run inside a transaction, compare the affected-row count, and only then commit.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `INSERT … SELECT` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Correlated `UPDATE … SET = (subquery)` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `UPDATE … FROM` | ❌ | ✅ | `UPDATE … JOIN` | ✅ | 23ai+ (else `MERGE`) | ✅ (3.33+) |
| `MERGE` | ✅ | ✅ (15+) | ❌ | ✅ | ✅ | ❌ |
| Subquery reading the target table | ✅ | ✅ | ❌ (error 1093) | ✅ | ✅ | ✅ |
| `RETURNING` / `OUTPUT` | ✅ (`FINAL TABLE`) | `RETURNING` | ❌ | `OUTPUT` | `RETURNING INTO` | `RETURNING` (3.35+) |

> **Portability Tip:** The correlated `SET col = (SELECT …) WHERE EXISTS (SELECT …)` pattern runs on every engine. Join-based updates are faster but have a different syntax on each.

---

# Common Mistakes

### Mistake 1

Correlated `UPDATE` without a matching `WHERE EXISTS`, setting unmatched rows to `NULL`.

---

### Mistake 2

`UPDATE … FROM` against a source with duplicate keys, applying an arbitrary value.

---

### Mistake 3

`DELETE … WHERE x NOT IN (subquery)` where the subquery can return `NULL`.

---

### Mistake 4

`INSERT … SELECT` without an explicit target column list.

---

### Mistake 5

Running a large subquery-driven `DELETE` as one transaction on a busy table.

---

# Best Practices

✔ Pair every correlated `SET` subquery with a matching `WHERE EXISTS`.

✔ Make the source unique on the join key before `UPDATE … FROM` or `MERGE`.

✔ Use `NOT EXISTS` in `DELETE` exclusions.

✔ Preview with `SELECT COUNT(*)` and run modifications inside a transaction.

✔ Batch large modifications.

---

# Interview Questions

## Basic

1. How do you copy rows from one table to another?
2. How do you delete products that have never been sold?
3. What does `INSERT … SELECT` need to be safe against schema changes?

## Intermediate

4. Why can a correlated `UPDATE` set values to `NULL` unexpectedly, and how do you prevent it?
5. What is the difference between `UPDATE … FROM` and a correlated `UPDATE` when the source has duplicates?
6. How do you insert rows only if they do not already exist?

## Advanced

7. Why does MySQL reject a subquery on the table being updated, and how do you work around it?
8. What is Halloween protection?
9. Why does `MERGE` require each target row to match at most one source row?

---

# Hands-on Exercises

## Exercise 1

Archive all cancelled orders older than one year into `OrdersArchive`, then delete them from `Orders` and `OrderItems`.

---

## Exercise 2

Set each product's `ListPrice` to its average selling price over the last 90 days, leaving products with no recent sales untouched.

---

## Exercise 3

Remove duplicate customers, keeping the lowest `CustomerID` per e-mail, in a form that also runs on MySQL.

---

## Exercise 4

Write a `MERGE` that updates existing products from a staging table and inserts new ones.

---

# Related Topics

- **04.09 — Data Manipulation Language (DML) Deep Dive**
- **09.03 — Scalar Subqueries**
- **09.05 — EXISTS and NOT EXISTS**
- **09.08 — Derived Tables (Subqueries in FROM)**
- **09.12 — NULL Handling in Subqueries**
- **04.12 — Transaction Control Language (TCL) Deep Dive**

---

# Summary

Subqueries drive data modification: `INSERT … SELECT` copies rows, `NOT EXISTS` makes inserts conditional, correlated scalar subqueries compute new values in `UPDATE`, and `IN`/`EXISTS` choose rows to `DELETE`. A correlated `SET` subquery returns `NULL` for unmatched rows, so it must be paired with a matching `WHERE EXISTS`; join-based updates and `MERGE` read the source once but require it to be unique on the key. Subqueries see the data as it was before the statement—except on MySQL, which forbids reading the target table unless the subquery is materialised in a derived table. Preview, run in a transaction, compare row counts and batch large changes.
