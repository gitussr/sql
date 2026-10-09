---
title: "17.04 - Updatable Views (INSERT, UPDATE and DELETE Through Views)"
description: "Writing through SQL views: the rules that make a view updatable, single-table and join views, key-preserved tables in Oracle, the one-base-table rule in SQL Server, PostgreSQL auto-updatable views, MySQL MERGE views, insertable columns and defaults, rows that disappear after an update, read-only views, and when to write to base tables instead."
chapter: 17
section: 17.04
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 25 min
lastUpdated: 2026-10-09
---

# 17.04 Updatable Views (INSERT, UPDATE and DELETE Through Views)

---

# Learning Objectives

After completing this section, you will be able to:

- State the rules that make a view updatable.
- Write `INSERT`, `UPDATE` and `DELETE` statements through views.
- Explain how each engine handles views over joins.
- Predict which columns are insertable and what happens to omitted columns.
- Make a view read-only deliberately.

---

# The Core Idea

A write through a view is translated into a write on a base table. That translation is only possible when every view row corresponds to **exactly one identifiable row** of one base table, and every view column being written maps to **one base column**.

```sql
CREATE VIEW PendingOrders AS
SELECT OrderID, CustomerID, OrderDate, Status, TotalAmount
FROM Orders
WHERE Status = 'Pending';

UPDATE PendingOrders
SET Status = 'Shipped'
WHERE OrderID = 1001;
```

```sql
-- what the engine runs
UPDATE Orders
SET Status = 'Shipped'
WHERE OrderID = 1001
  AND Status = 'Pending';      -- the view's predicate is added
```

---

# What Makes a View Updatable

```text
✔ FROM has one base table (or one key-preserved / one modified table in a join view)
✔ columns written are plain column references (no expressions, no aggregates)
✘ GROUP BY, HAVING, aggregate functions
✘ DISTINCT
✘ window functions
✘ UNION / INTERSECT / EXCEPT (UNION ALL: some engines, partitioned views)
✘ LIMIT / TOP / FETCH (most engines)
✘ subqueries in the SELECT list that the column depends on
```

Expression columns can still exist in an updatable view; they are simply not writable:

```sql
CREATE VIEW OrderAmounts AS
SELECT OrderID, TotalAmount, TotalAmount * 0.18 AS Tax
FROM Orders;

UPDATE OrderAmounts SET TotalAmount = 500 WHERE OrderID = 1001;  -- ✅
UPDATE OrderAmounts SET Tax = 90 WHERE OrderID = 1001;           -- ❌ column is not updatable
```

---

# INSERT Through a View

```sql
CREATE VIEW CustomerContacts AS
SELECT CustomerID, CustomerName, Email
FROM Customers;

INSERT INTO CustomerContacts (CustomerName, Email)
VALUES ('Asha Rao', 'asha@example.com');
```

- Columns not in the view get their **default** (or `NULL`). If a hidden column is `NOT NULL` without a default, the insert fails.
- An insert into a filtered view can create a row the view **cannot see**:

```sql
INSERT INTO PendingOrders (OrderID, CustomerID, OrderDate, Status, TotalAmount)
VALUES (2002, 42, DATE '2026-10-09', 'Delivered', 120.00);   -- succeeds; the row is invisible in PendingOrders
```

`WITH CHECK OPTION` forbids this (Section 17.05).

---

# UPDATE and DELETE Through a View

```sql
UPDATE PendingOrders SET TotalAmount = TotalAmount * 0.9 WHERE CustomerID = 42;
DELETE FROM PendingOrders WHERE OrderDate < DATE '2026-01-01';
```

Both statements can only touch rows the view shows—the view's `WHERE` is combined with the statement's. That makes filtered views a natural way to limit the blast radius of maintenance scripts.

An `UPDATE` can move a row **out** of the view: after `SET Status = 'Shipped'`, the order no longer appears in `PendingOrders`. That is allowed unless the view has `WITH CHECK OPTION`.

---

# Views Over Joins

```sql
CREATE VIEW OrderWithCustomer AS
SELECT o.OrderID, o.Status, o.TotalAmount, c.CustomerID, c.CustomerName
FROM Orders o
JOIN Customers c ON c.CustomerID = o.CustomerID;
```

| Engine | Rule for join views |
|--------|---------------------|
| SQL Server | One statement may modify columns of **one** base table only |
| Oracle | Only **key-preserved** tables are modifiable: a table whose key is still unique in the view's result |
| MySQL | `UPDATE` may change columns of one table; `INSERT` only into one table if the join is an inner join; no `DELETE` |
| PostgreSQL | Not automatically updatable; use `INSTEAD OF` triggers or rules (Section 17.05) |
| SQLite | No view is updatable without `INSTEAD OF` triggers |

```sql
UPDATE OrderWithCustomer SET Status = 'Cancelled' WHERE OrderID = 1001;   -- ✅ Orders is key-preserved
UPDATE OrderWithCustomer SET CustomerName = 'X' WHERE OrderID = 1001;     -- ❌ Oracle: Customers is not key-preserved
                                                                          -- (one customer appears in many rows)
```

`Orders` is key-preserved because each order appears once in the join; `Customers` is not, because a customer with 50 orders appears 50 times. Changing `CustomerName` "for one row" would change it for all 50.

Oracle shows which columns are writable:

```sql
SELECT column_name, updatable, insertable, deletable
FROM user_updatable_columns
WHERE table_name = 'ORDERWITHCUSTOMER';
```

---

# Making a View Read-Only

```sql
CREATE VIEW OrderReport AS
SELECT OrderID, Status, TotalAmount FROM Orders
WITH READ ONLY;                                         -- Oracle

-- PostgreSQL / SQL Server / MySQL: grant SELECT only, or make the view non-updatable
GRANT SELECT ON OrderReport TO reporting_role;
```

---

# When to Write to Base Tables Instead

```text
Write through a view when:                     Write to base tables when:
  • the view restricts which rows a role may     • the write touches several tables
    change (with CHECK OPTION)                   • you need RETURNING / OUTPUT of hidden columns
  • the view is a compatibility layer for a      • triggers, defaults or constraints on hidden
    renamed or split table                         columns matter to the caller
  • it removes repeated WHERE clauses            • the view's rules differ across engines you support
```

---

# Visual Representation

```text
UPDATE PendingOrders SET Status = 'Shipped' WHERE OrderID = 1001
        │
        ▼  view is updatable? (one base table, plain columns, no aggregates/DISTINCT/windows)
        │        no → ERROR (or INSTEAD OF trigger, Section 17.05)
        ▼  yes
UPDATE Orders SET Status = 'Shipped' WHERE OrderID = 1001 AND Status = 'Pending'
        │
        ▼  WITH CHECK OPTION? → new row must still satisfy Status = 'Pending' → here it does not → ERROR
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← the view resolves to its base table (target of the write)
2. JOIN        ← in join views, only one (key-preserved) table may be modified
3. WHERE       ← the statement's WHERE AND the view's WHERE select the target rows
4. GROUP BY    ← present in the view → not updatable
5. HAVING      ← present in the view → not updatable
6. WINDOW      ← present in the view → not updatable
7. SELECT      ← only plain column references are writable
8. DISTINCT    ← present in the view → not updatable
9. ORDER BY
10. LIMIT / FETCH / TOP   ← present in the view → not updatable (most engines)
```

---

# How the DBMS Executes This

```text
DML on a view:
  1. expand the view; check it is updatable (or has an INSTEAD OF trigger)
  2. map each target column to its base column; reject expression columns
  3. build DML on the base table: statement WHERE AND view WHERE
  4. execute; base-table constraints, defaults and triggers fire as usual
  5. if WITH CHECK OPTION: verify each new/changed row satisfies the view's predicate
```

---

# 🏗️ Architecture Insight

Updatable views are most valuable as **compatibility layers**. When a table is renamed or split, a view with the old name and shape—updatable or backed by `INSTEAD OF` triggers—lets old code keep writing while new code moves to the new tables.

---

# ⚡ Performance Tip

A write through a view is planned like a write on the base table with the view's predicate added. If `DELETE FROM PendingOrders WHERE …` is slow, look for an index that supports both predicates together.

---

# 🌍 Production Consideration

Writing through a view does not bypass base-table triggers, constraints or row-level security. A bulk update through a view fires the same triggers as a bulk update on the table.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Single-table updatable views | ✅ | ✅ (9.3+) | ✅ | ✅ | ✅ | ❌ |
| Join views writable | ✅ (SQL:1999 rules) | ❌ (triggers) | Partly | One table per statement | Key-preserved tables | ❌ |
| `UNION ALL` views writable | ✅ | ❌ | ❌ | Partitioned views | ❌ | ❌ |
| Writable-column metadata | `information_schema.columns.is_updatable` | ✅ | ✅ | Partial | `USER_UPDATABLE_COLUMNS` | ❌ |
| Read-only option | ❌ | Grants / non-updatable | Grants | Grants | `WITH READ ONLY` | Always read-only |

> **Portability Tip:** Single-table views with plain columns are writable on every engine except SQLite. Anything else needs engine-specific rules or `INSTEAD OF` triggers.

---

# Common Mistakes

### Mistake 1

Inserting through a filtered view and creating rows the view cannot see.

---

### Mistake 2

Updating a non-key-preserved column in a join view and expecting it to change one row.

---

### Mistake 3

Leaving a `NOT NULL` column without a default out of an insertable view.

---

### Mistake 4

Assuming every engine allows the same writes through the same view.

---

# Best Practices

✔ Keep writable views single-table with plain columns.

✔ Add `WITH CHECK OPTION` to filtered views that accept writes.

✔ Give hidden `NOT NULL` columns defaults.

✔ Make reporting views read-only by grants or options.

✔ Check `is_updatable` metadata instead of guessing.

---

# Interview Questions

## Basic

1. What makes a view updatable?
2. Can you update a view that contains `GROUP BY`? Why not?
3. What happens to columns not included in an insertable view?

## Intermediate

4. What is a key-preserved table in Oracle?
5. How does SQL Server restrict updates through join views?
6. Why can an `INSERT` through a filtered view create an invisible row?

## Advanced

7. Explain the view update problem with an example where an update would be ambiguous.
8. Design a compatibility view for a table split into two, keeping old `UPDATE` statements working.

---

# Hands-on Exercises

## Exercise 1

Create `PendingOrders`, update one order to `'Shipped'` through it, and confirm it disappears from the view.

---

## Exercise 2

Create `OrderWithCustomer` and try updating a column from each table. Record what your engine allows.

---

## Exercise 3

Query `information_schema.columns` (or `USER_UPDATABLE_COLUMNS`) to list the updatable columns of your views.

---

# Related Topics

- **17.05 — WITH CHECK OPTION and INSTEAD OF Triggers**
- **09.11 — Subqueries in INSERT, UPDATE and DELETE**
- **14.10 — Data-Modifying CTEs (INSERT, UPDATE and DELETE)**
- **15.12 — Optimizing Writes (Batch INSERT, UPDATE and DELETE)**

---

# Summary

A view is updatable when each of its rows maps to one identifiable row of one base table and the written columns are plain base columns—no aggregates, `DISTINCT`, windows, set operations or limits. Writes are translated into writes on the base table with the view's predicate added. Join views follow engine-specific rules: one table per statement in SQL Server, key-preserved tables in Oracle, triggers in PostgreSQL and SQLite. Inserts and updates can create or move rows outside the view unless `WITH CHECK OPTION` is used, and hidden columns take their defaults.
