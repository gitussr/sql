---
title: "17.05 - WITH CHECK OPTION and INSTEAD OF Triggers"
description: "Controlling writes through SQL views: WITH CHECK OPTION and its LOCAL and CASCADED forms, how it stops rows from escaping or being inserted outside a view, INSTEAD OF triggers that make join and aggregate views writable on PostgreSQL, SQL Server, Oracle and SQLite, PostgreSQL rules, and the design trade-offs of putting write logic behind views."
chapter: 17
section: 17.05
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 25 min
lastUpdated: 2026-10-09
---

# 17.05 WITH CHECK OPTION and INSTEAD OF Triggers

---

# Learning Objectives

After completing this section, you will be able to:

- Use `WITH CHECK OPTION` to keep writes inside a view's predicate.
- Explain the difference between `LOCAL` and `CASCADED` checking.
- Write `INSTEAD OF` triggers that make non-updatable views writable.
- Decide when write logic belongs behind a view and when it does not.

---

# WITH CHECK OPTION

```sql
CREATE VIEW PendingOrders AS
SELECT OrderID, CustomerID, OrderDate, Status, TotalAmount
FROM Orders
WHERE Status = 'Pending'
WITH CHECK OPTION;
```

Every `INSERT` and `UPDATE` through the view must produce rows that the view can still see:

```sql
INSERT INTO PendingOrders (OrderID, CustomerID, OrderDate, Status, TotalAmount)
VALUES (2002, 42, DATE '2026-10-09', 'Delivered', 120.00);
-- ERROR: new row violates check option for view "pendingorders"

UPDATE PendingOrders SET Status = 'Shipped' WHERE OrderID = 1001;
-- ERROR: the updated row would leave the view
```

`DELETE` is unaffected—deleting a visible row cannot create an invisible one.

```text
Without CHECK OPTION                         With CHECK OPTION
INSERT row outside the predicate → allowed   → rejected
UPDATE row out of the view       → allowed   → rejected
UPDATE row inside the view       → allowed   → allowed
DELETE visible row               → allowed   → allowed
```

---

# A Typical Use: Scoped Write Access

```sql
CREATE VIEW IndiaCustomers AS
SELECT CustomerID, CustomerName, Email, Country
FROM Customers
WHERE Country = 'IN'
WITH CHECK OPTION;

GRANT SELECT, INSERT, UPDATE ON IndiaCustomers TO india_support;
```

The India support team can read and change Indian customers only, cannot create customers in other countries, and cannot "move" a customer to another country—because the view refuses rows that leave it.

---

# LOCAL vs CASCADED

```sql
CREATE VIEW ActiveCustomers AS
SELECT * FROM Customers WHERE IsActive = 1;          -- no check option

CREATE VIEW ActiveIndiaCustomers AS
SELECT * FROM ActiveCustomers WHERE Country = 'IN'
WITH LOCAL CHECK OPTION;

CREATE VIEW ActiveIndiaCustomersStrict AS
SELECT * FROM ActiveCustomers WHERE Country = 'IN'
WITH CASCADED CHECK OPTION;
```

| Write | `LOCAL` | `CASCADED` (default) |
|-------|---------|----------------------|
| Row with `Country = 'US'` | ❌ rejected | ❌ rejected |
| Row with `Country = 'IN'`, `IsActive = 0` | ✅ allowed (underlying view has no check) | ❌ rejected (checks every level) |

`CASCADED` is the standard's default and the safer choice: it checks the predicate of the view **and every view beneath it**. SQL Server and Oracle accept only the plain form, without `LOCAL` or `CASCADED`; test how your engine treats predicates of underlying views before relying on them.

---

# INSTEAD OF Triggers

Views over joins, aggregates or unions are not updatable—unless you tell the engine what a write should mean. An **`INSTEAD OF` trigger** replaces the write on the view with your own statements.

```sql
-- SQL Server
CREATE VIEW dbo.OrderWithCustomer AS
SELECT o.OrderID, o.Status, o.TotalAmount, c.CustomerID, c.CustomerName, c.Email
FROM dbo.Orders o
JOIN dbo.Customers c ON c.CustomerID = o.CustomerID;
GO

CREATE TRIGGER dbo.trg_OrderWithCustomer_Update
ON dbo.OrderWithCustomer
INSTEAD OF UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE o
    SET o.Status = i.Status, o.TotalAmount = i.TotalAmount
    FROM dbo.Orders o
    JOIN inserted i ON i.OrderID = o.OrderID;

    UPDATE c
    SET c.Email = i.Email
    FROM dbo.Customers c
    JOIN (SELECT DISTINCT CustomerID, Email FROM inserted) i ON i.CustomerID = c.CustomerID;
END;
```

```sql
-- PostgreSQL
CREATE FUNCTION order_with_customer_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE Orders    SET Status = NEW.Status, TotalAmount = NEW.TotalAmount WHERE OrderID = OLD.OrderID;
    UPDATE Customers SET Email  = NEW.Email                                  WHERE CustomerID = OLD.CustomerID;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_order_with_customer_update
INSTEAD OF UPDATE ON OrderWithCustomer
FOR EACH ROW EXECUTE FUNCTION order_with_customer_update();
```

```sql
-- SQLite (the only way to write through any view)
CREATE TRIGGER trg_pending_orders_insert
INSTEAD OF INSERT ON PendingOrders
BEGIN
    INSERT INTO Orders (OrderID, CustomerID, OrderDate, Status, TotalAmount)
    VALUES (NEW.OrderID, NEW.CustomerID, NEW.OrderDate, 'Pending', NEW.TotalAmount);
END;
```

| Engine | Granularity | Row images |
|--------|-------------|------------|
| SQL Server | Per statement | `inserted`, `deleted` pseudo-tables |
| PostgreSQL | Per row (`FOR EACH ROW`) | `OLD`, `NEW` |
| Oracle | Per row | `:OLD`, `:NEW` |
| SQLite | Per row | `OLD`, `NEW` |
| MySQL | ❌ not supported on views | — |

Chapter 18 covers triggers in general; here they matter as the escape hatch for writable views.

---

# PostgreSQL Rules

PostgreSQL also has `CREATE RULE … DO INSTEAD`, an older query-rewrite mechanism that predates `INSTEAD OF` triggers. Rules rewrite the statement once instead of firing per row, but their semantics with volatile functions and multi-row statements are surprising. Prefer `INSTEAD OF` triggers for new code.

---

# Trade-offs of Write Logic Behind Views

```text
✔ old code keeps working while tables change underneath
✔ one place enforces how a "customer order" is written
✘ hidden work: an UPDATE on a view may touch three tables and fire their triggers
✘ RETURNING / OUTPUT, row counts and error messages may surprise callers
✘ per-row triggers are slow for bulk writes
✘ behaviour differs per engine (MySQL cannot do it at all)
```

---

# Visual Representation

```text
INSERT / UPDATE on view
        │
        ├─ INSTEAD OF trigger exists? ── yes ──▶ trigger body runs; original statement discarded
        │                                         (writes any tables it likes)
        │ no
        ├─ view updatable? ── no ──▶ ERROR
        │ yes
        ▼
write on base table (view predicate added)
        │
        ▼
WITH CHECK OPTION? ── yes ──▶ new row satisfies this view's predicate (LOCAL)
                               or every level's predicate (CASCADED)? ── no ──▶ ERROR
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← the target view resolves to its base table, or to its INSTEAD OF trigger
2. JOIN        ← join views need a trigger to define which tables a write changes
3. WHERE       ← the view's predicate limits the target rows and, with CHECK OPTION, the new rows
4. GROUP BY    ← aggregate views are writable only through triggers
5. HAVING
6. WINDOW
7. SELECT      ← the trigger maps view columns to base columns explicitly
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
CHECK OPTION:  after computing each new row version → evaluate the view's WHERE (and, if CASCADED,
               every underlying view's WHERE) against it → false or unknown → raise error, roll back statement
INSTEAD OF:    expand the target view → find trigger for the event → build OLD/NEW (or inserted/deleted)
               from the statement → run the trigger body instead of any base-table write
```

---

# 🏗️ Architecture Insight

`WITH CHECK OPTION` turns a view's `WHERE` from a filter into a **constraint on writes**. Combined with grants on the view only, it is a simple, declarative way to scope who may change which rows—often all a small application needs before reaching for full row-level security (Section 17.06).

---

# ⚡ Performance Tip

Row-level `INSTEAD OF` triggers run their body once per row. A 100,000-row `UPDATE` through such a view runs 200,000 single-row updates. For bulk changes, write to the base tables directly with set-based statements.

---

# 🌍 Production Consideration

A `WITH CHECK OPTION` violation aborts the whole statement. Batch jobs that write through checked views should validate input first, or handle the error and report which rows violated the view's predicate.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `WITH CHECK OPTION` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `LOCAL` / `CASCADED` | ✅ | ✅ | ✅ | ❌ (plain form only) | ❌ (plain form only) | ❌ |
| `INSTEAD OF` triggers on views | ✅ (SQL:2008) | ✅ (row) | ❌ | ✅ (statement) | ✅ (row) | ✅ (row) |
| Rules | ❌ | `CREATE RULE` | ❌ | ❌ | ❌ | ❌ |

> **Portability Tip:** `WITH CHECK OPTION` on a single-table view is the most portable way to scope writes. `INSTEAD OF` triggers work on four of the five engines, but with different trigger syntax and per-row versus per-statement semantics.

---

# Common Mistakes

### Mistake 1

Forgetting `WITH CHECK OPTION` on a filtered view used for scoped write access.

---

### Mistake 2

Using `LOCAL` and expecting the underlying view's predicate to be enforced.

---

### Mistake 3

Writing a SQL Server `INSTEAD OF` trigger that assumes one row in `inserted`.

---

### Mistake 4

Running bulk updates through a view with row-level `INSTEAD OF` triggers.

---

# Best Practices

✔ Add `WITH CHECK OPTION` to every filtered view that accepts writes.

✔ Use `CASCADED` (the default) unless you have a specific reason not to.

✔ Write set-based statement triggers on SQL Server; handle many rows.

✔ Keep `INSTEAD OF` logic simple and documented.

✔ Use base tables for bulk writes.

---

# Interview Questions

## Basic

1. What does `WITH CHECK OPTION` do?
2. Does `WITH CHECK OPTION` affect `DELETE`?
3. What is an `INSTEAD OF` trigger?

## Intermediate

4. Explain `LOCAL` vs `CASCADED` check options with nested views.
5. How do you make a join view writable in PostgreSQL?
6. Why is SQLite different from other engines for writable views?

## Advanced

7. Compare per-row and per-statement `INSTEAD OF` triggers and their performance.
8. Design scoped write access for regional support teams using views only.

---

# Hands-on Exercises

## Exercise 1

Add `WITH CHECK OPTION` to `PendingOrders` and try to update an order to `'Shipped'` through it.

---

## Exercise 2

Build nested views with `LOCAL` and `CASCADED` check options and test which inserts each accepts.

---

## Exercise 3

Write an `INSTEAD OF UPDATE` trigger for `OrderWithCustomer` and update `Status` and `Email` in one statement.

---

# Related Topics

- **17.04 — Updatable Views (INSERT, UPDATE and DELETE Through Views)**
- **17.06 — Views for Security (Row-Level and Column-Level Access)**
- **14.10 — Data-Modifying CTEs (INSERT, UPDATE and DELETE)**
- **18.xx — Stored Procedures and Triggers**

---

# Summary

`WITH CHECK OPTION` makes a view's predicate a constraint on writes: inserts and updates through the view must produce rows the view can still see. `CASCADED` checks every level of nested views, `LOCAL` only the current one; SQL Server and Oracle offer only the plain form. `INSTEAD OF` triggers make otherwise non-updatable views writable by replacing the write with explicit statements—per statement in SQL Server, per row in PostgreSQL, Oracle and SQLite, and not at all in MySQL. Both tools are useful for scoped write access and compatibility layers, but bulk writes belong on base tables.
