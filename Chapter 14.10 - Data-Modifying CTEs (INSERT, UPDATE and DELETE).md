---
title: "14.10 - Data-Modifying CTEs (INSERT, UPDATE and DELETE)"
description: "Using CTEs with data modification on each engine: WITH before UPDATE and DELETE to identify target rows, deleting duplicates through an updatable CTE on SQL Server, PostgreSQL data-modifying CTEs with RETURNING for moving and archiving rows in one statement, snapshot semantics and ordering rules, INSERT … SELECT from a CTE on Oracle and MySQL, batching large deletes, and safety practices for CTE-driven changes."
chapter: 14
section: 14.10
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 14.10 Data-Modifying CTEs (INSERT, UPDATE and DELETE)

---

# Learning Objectives

After completing this section, you will be able to:

- Use a CTE to select the rows an `UPDATE` or `DELETE` should change.
- Delete duplicates through an updatable CTE on SQL Server.
- Move rows between tables in one statement with PostgreSQL data-modifying CTEs.
- Explain the snapshot rules of data-modifying CTEs.
- Apply safety practices to CTE-driven changes.

---

# Three Levels of Support

```text
Level 1  CTE feeds a DML statement (read-only CTE)             PostgreSQL, MySQL, SQL Server, SQLite
         WITH t AS (SELECT …) UPDATE/DELETE … WHERE id IN (SELECT id FROM t)
         Oracle / MySQL INSERT: INSERT INTO x WITH t AS (…) SELECT … FROM t

Level 2  DML through the CTE (updatable CTE)                    SQL Server
         WITH t AS (SELECT … FROM Orders …) DELETE FROM t WHERE …

Level 3  DML inside the CTE, with RETURNING (data-modifying)    PostgreSQL
         WITH moved AS (DELETE FROM a … RETURNING *) INSERT INTO b SELECT * FROM moved
```

---

# Level 1: A CTE Chooses the Rows

```sql
-- Flag customers with no order in the last 365 days as inactive
-- PostgreSQL, MySQL 8.0, SQL Server, SQLite
WITH LastOrder AS (
    SELECT CustomerID, MAX(OrderDate) AS LastOrderDate
    FROM Orders
    GROUP BY CustomerID
)
UPDATE Customers
SET Status = 'Inactive'
WHERE CustomerID NOT IN (
    SELECT CustomerID FROM LastOrder WHERE LastOrderDate >= DATE '2025-09-28'
);
```

On SQL Server, `DATE '…'` becomes `'2025-09-28'`; on Oracle, move the CTE inside the subquery (`WHERE CustomerID NOT IN (WITH … SELECT …)`), because Oracle does not allow `WITH` before `UPDATE`. The `NOT IN` is safe here because `CustomerID` from `Orders` is never `NULL` in this schema; with a nullable column prefer `NOT EXISTS` (Section 09.12).

Join-style updates from a CTE:

```sql
-- SQL Server
WITH Totals AS (SELECT CustomerID, SUM(TotalAmount) AS Total FROM Orders GROUP BY CustomerID)
UPDATE c SET c.LifetimeValue = t.Total
FROM Customers AS c JOIN Totals AS t ON t.CustomerID = c.CustomerID;

-- PostgreSQL
WITH Totals AS (SELECT CustomerID, SUM(TotalAmount) AS Total FROM Orders GROUP BY CustomerID)
UPDATE Customers AS c SET LifetimeValue = t.Total
FROM Totals AS t WHERE t.CustomerID = c.CustomerID;

-- MySQL
WITH Totals AS (SELECT CustomerID, SUM(TotalAmount) AS Total FROM Orders GROUP BY CustomerID)
UPDATE Customers AS c JOIN Totals AS t ON t.CustomerID = c.CustomerID
SET c.LifetimeValue = t.Total;
```

---

# Level 2: Deleting Duplicates Through a CTE (SQL Server)

On SQL Server a CTE over a single table is **updatable**: `UPDATE` and `DELETE` against the CTE change the underlying table.

```sql
-- Keep the newest row per email; delete the rest
WITH Ranked AS (
    SELECT *,
           ROW_NUMBER() OVER (PARTITION BY Email ORDER BY CreatedAt DESC, CustomerID DESC) AS rn
    FROM Customers
    WHERE Email IS NOT NULL
)
DELETE FROM Ranked
WHERE rn > 1;
```

This is the most common SQL Server deduplication idiom. It works because each CTE row maps to exactly one base-table row. CTEs with joins, `GROUP BY` or `DISTINCT` are not updatable (a join CTE can be updated only if the change affects one base table).

Other engines need the key of the rows to delete:

```sql
-- PostgreSQL, MySQL 8.0, SQLite
WITH Ranked AS (
    SELECT CustomerID,
           ROW_NUMBER() OVER (PARTITION BY Email ORDER BY CreatedAt DESC, CustomerID DESC) AS rn
    FROM Customers
    WHERE Email IS NOT NULL
)
DELETE FROM Customers
WHERE CustomerID IN (SELECT CustomerID FROM Ranked WHERE rn > 1);
```

MySQL rejects a subquery on the same table being deleted from (error 1093) unless it is materialized—a CTE or derived table is materialized, so this form works in MySQL 8.0.

---

# Level 3: PostgreSQL Data-Modifying CTEs

PostgreSQL allows `INSERT`, `UPDATE` and `DELETE` **inside** the `WITH` clause. With `RETURNING`, the changed rows become the CTE's result:

```sql
-- Archive orders older than 2020 and remove them, atomically, in one statement
WITH Moved AS (
    DELETE FROM Orders
    WHERE OrderDate < DATE '2020-01-01'
    RETURNING *
)
INSERT INTO OrdersArchive
SELECT * FROM Moved;
```

```sql
-- Insert a customer and their first order, using the generated ID
WITH NewCustomer AS (
    INSERT INTO Customers (CustomerName, Email)
    VALUES ('Grace Ho', 'grace@example.com')
    RETURNING CustomerID
)
INSERT INTO Orders (CustomerID, OrderDate, Status, TotalAmount, CreatedAt)
SELECT CustomerID, CURRENT_DATE, 'Pending', 129.00, NOW()
FROM NewCustomer;
```

```sql
-- Update and report what changed
WITH Repriced AS (
    UPDATE Products
    SET ListPrice = ROUND(ListPrice * 1.05, 2)
    WHERE CategoryID = 3
    RETURNING ProductID, ListPrice
)
SELECT COUNT(*) AS ProductsRepriced, AVG(ListPrice) AS NewAvgPrice FROM Repriced;
```

---

# Snapshot Rules

Data-modifying CTEs in PostgreSQL follow rules that surprise people:

```text
1. All sub-statements see the SAME snapshot, taken at statement start.
   The main query does NOT see the CTE's changes in the tables —
   it sees them only through the CTE's RETURNING output.
2. Every data-modifying CTE runs to completion, even if the main query never reads it.
3. The order in which sub-statements modify rows is unspecified.
   Two sub-statements must not update the same row.
```

```sql
WITH Upd AS (UPDATE Products SET ListPrice = 0 WHERE ProductID = 1 RETURNING *)
SELECT ListPrice FROM Products WHERE ProductID = 1;    -- returns the OLD price
```

To act on the new values, read them from the `RETURNING` output, not from the table.

---

# Batching Large Deletes

Deleting millions of rows in one statement holds locks and grows the transaction log. Batch it, with the CTE choosing each batch:

```sql
-- SQL Server: repeat until @@ROWCOUNT = 0
WITH Batch AS (
    SELECT TOP (5000) * FROM AuditLog
    WHERE CreatedAt < '2024-01-01'
    ORDER BY CreatedAt
)
DELETE FROM Batch;

-- PostgreSQL: repeat until 0 rows
WITH Batch AS (
    SELECT AuditID FROM AuditLog
    WHERE CreatedAt < '2024-01-01'
    ORDER BY CreatedAt
    LIMIT 5000
)
DELETE FROM AuditLog WHERE AuditID IN (SELECT AuditID FROM Batch);
```

Each batch is a short transaction; an index on `CreatedAt` keeps each batch cheap. (For regular retention, dropping date partitions is better still—Section 13.15.)

---

# Visual Representation

```text
   PostgreSQL:  WITH Moved AS (DELETE FROM Orders … RETURNING *)
                        │  deleted rows (as of statement snapshot)
                        ▼
                INSERT INTO OrdersArchive SELECT * FROM Moved
                one statement → one atomic change: rows leave Orders and enter OrdersArchive together

   SQL Server:  WITH Ranked AS (SELECT …, ROW_NUMBER() … FROM Customers)
                DELETE FROM Ranked WHERE rn > 1     → deletes from Customers
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← the CTE (SELECT or data-modifying) is evaluated as a source
2. JOIN        ← UPDATE … FROM / JOIN a CTE to the target table
3. WHERE       ← choose target rows (rn > 1, id IN (SELECT … FROM cte))
4. GROUP BY    ← inside the CTE: compute totals used by the update
5. HAVING
6. WINDOW      ← inside the CTE: ROW_NUMBER() to rank duplicates
7. SELECT      ← RETURNING output feeds the next statement (PostgreSQL)
8. DISTINCT
9. ORDER BY    ← with TOP/LIMIT inside a CTE: choose which batch to delete
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
SQL Server DELETE FROM Ranked:
  scan Customers → compute ROW_NUMBER → filter rn > 1 → Clustered Index Delete on Customers
PostgreSQL WITH Moved AS (DELETE … RETURNING *) INSERT … SELECT FROM Moved:
  ModifyTable (Delete on orders) → CTE Scan Moved → ModifyTable (Insert on ordersarchive)
  both run in one statement, one snapshot, one transaction
```

---

# 🏗️ Architecture Insight

PostgreSQL's data-modifying CTEs turn multi-step changes—archive and delete, insert parent and child, update and log—into single atomic statements without explicit transactions or round trips. Use them for small, related changes; for large data movements, batch the work so locks and log growth stay bounded.

---

# ⚡ Performance Tip

Deduplication through `ROW_NUMBER()` sorts the table by the partition key. An index on `(Email, CreatedAt DESC)` lets the engine read rows already in partition order and skip the sort.

---

# 🔒 Security Note

Run CTE-driven `DELETE` and `UPDATE` statements first as `SELECT`: replace `DELETE FROM Ranked WHERE rn > 1` with `SELECT * FROM Ranked WHERE rn > 1` and check the rows. Then run the change inside an explicit transaction so it can be rolled back if the affected row count is unexpected.

---

# 🌍 Production Consideration

A deduplication `ORDER BY` without a unique tiebreaker (`ORDER BY CreatedAt DESC` when two rows share a timestamp) can keep a different row each time it runs. Always end the ordering with a unique column.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `WITH … UPDATE/DELETE` | ❌ | ✅ | ✅ (8.0) | ✅ | ❌ (CTE in subquery) | ✅ |
| `INSERT INTO t WITH … SELECT` | ✅ | ✅ | ✅ | ❌ (`WITH` first) | ✅ | ✅ |
| DML through a CTE | ❌ | ❌ | ❌ | ✅ (single-table) | ❌ | ❌ |
| DML inside `WITH` + `RETURNING` | ❌ | ✅ | ❌ | ❌ (`OUTPUT` instead) | ❌ | ❌ (`RETURNING` on DML only, 3.35+) |

> **Portability Tip:** "CTE computes keys, DML filters by those keys" works on every engine except that Oracle needs the `WITH` inside the subquery. Updatable CTEs and data-modifying CTEs are SQL Server-only and PostgreSQL-only respectively.

---

# Common Mistakes

### Mistake 1

Expecting the main query to see a PostgreSQL data-modifying CTE's changes in the table.

---

### Mistake 2

Deduplicating with an `ORDER BY` that has no unique tiebreaker.

---

### Mistake 3

Trying to delete through a join or aggregate CTE on SQL Server.

---

### Mistake 4

Running a huge CTE-driven delete as one transaction.

---

### Mistake 5

Writing `WITH … UPDATE` on Oracle.

---

# Best Practices

✔ Preview every CTE-driven change as a `SELECT`.

✔ Wrap changes in a transaction and check row counts.

✔ Use unique tiebreakers in deduplication.

✔ Use `RETURNING` output, not the table, to see changed values in PostgreSQL.

✔ Batch large changes.

---

# Interview Questions

## Basic

1. Can a CTE be used with `UPDATE` or `DELETE`?
2. How do you delete duplicate rows with a CTE on SQL Server?
3. What does `RETURNING` do?

## Intermediate

4. How do you move rows from one table to another in one PostgreSQL statement?
5. Why does MySQL accept a CTE in `DELETE … WHERE id IN (…)` from the same table?
6. How do you batch a large delete with a CTE?

## Advanced

7. Explain the snapshot rules of PostgreSQL data-modifying CTEs.
8. Why must deduplication ordering end with a unique column?

---

# Hands-on Exercises

## Exercise 1

Delete duplicate customers by email, keeping the newest, on your engine.

---

## Exercise 2

On PostgreSQL, archive and delete orders older than 2020 in one statement.

---

## Exercise 3

Update each customer's lifetime value from a totals CTE.

---

# Related Topics

- **14.02 — CTE Syntax and Scope**
- **14.12 — Common CTE Patterns (Deduplication, Top-N and Running Balances)**
- **09.11 — Subqueries in INSERT, UPDATE and DELETE**
- **09.12 — NULL Handling in Subqueries**
- **11.10 — Top-N per Group, Deduplication and QUALIFY**

---

# Summary

CTEs combine with data modification at three levels: a read-only CTE that selects the rows an `UPDATE` or `DELETE` changes (most engines, with Oracle needing the CTE inside a subquery), DML through a single-table CTE on SQL Server—the standard deduplication idiom—and PostgreSQL's data-modifying CTEs, which run `INSERT`, `UPDATE` or `DELETE` inside `WITH` and pass `RETURNING` rows to the next step in one atomic statement with one snapshot. Preview changes as `SELECT`s, use unique tiebreakers, read new values from `RETURNING`, and batch large changes.
