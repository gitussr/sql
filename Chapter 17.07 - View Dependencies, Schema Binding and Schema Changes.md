---
title: "17.07 - View Dependencies, Schema Binding and Schema Changes"
description: "How SQL views depend on tables, columns and other views: SELECT * expansion at creation time, dependency tracking in each engine's catalog, what happens to views when base tables change, invalid views and recompilation in Oracle, sp_refreshview and SCHEMABINDING in SQL Server, PostgreSQL's dependency errors, and a safe procedure for changing tables that views depend on."
chapter: 17
section: 17.07
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 25 min
lastUpdated: 2026-10-09
---

# 17.07 View Dependencies, Schema Binding and Schema Changes

---

# Learning Objectives

After completing this section, you will be able to:

- Explain why `SELECT *` in a view is frozen at creation time.
- Find which views depend on a table or column on each engine.
- Predict what happens to views when a base table changes.
- Use `SCHEMABINDING`, `sp_refreshview` and Oracle recompilation.
- Change tables safely when views depend on them.

---

# SELECT * Is Expanded When the View Is Created

```sql
CREATE VIEW CustomerAll AS
SELECT * FROM Customers;            -- columns: CustomerID, CustomerName, Email, Country, IsActive, CreatedAt

ALTER TABLE Customers ADD Phone VARCHAR(20);

SELECT * FROM CustomerAll;          -- still six columns: no Phone
```

Every major engine resolves `*` into a fixed column list when the view is created. New columns do not appear; dropped or renamed columns break the view (or block the change).

```text
                      add column      drop column used by view    rename column used by view
PostgreSQL            not visible     ERROR (dependency)          view follows the rename (stores column ids)
SQL Server            not visible*    view breaks at run time     view breaks at run time
Oracle                not visible     view becomes INVALID        view becomes INVALID
MySQL                 not visible     view breaks at run time     view breaks at run time
SQLite                VISIBLE (*)     view breaks at run time     rename updates the view (3.25+)

* SQL Server: metadata can even shift columns by position until sp_refreshview is run
  SQLite stores the original text and re-parses it, so * expands again on each use
```

---

# Finding Dependencies

```sql
-- PostgreSQL: which views use table customers?
SELECT DISTINCT v.relname AS view_name
FROM pg_depend d
JOIN pg_rewrite r ON r.oid = d.objid
JOIN pg_class v   ON v.oid = r.ev_class
WHERE d.refobjid = 'customers'::regclass
  AND v.relname <> 'customers';

-- standard information_schema (PostgreSQL, SQL Server)
SELECT view_schema, view_name
FROM information_schema.view_table_usage
WHERE table_name = 'customers';

-- SQL Server
SELECT referencing_schema_name, referencing_entity_name
FROM sys.dm_sql_referencing_entities('dbo.Customers', 'OBJECT');

-- Oracle
SELECT name, type FROM user_dependencies
WHERE referenced_name = 'CUSTOMERS' AND type = 'VIEW';

-- MySQL (8.0.13+)
SELECT view_schema, view_name FROM information_schema.view_table_usage
WHERE table_name = 'customers';
```

Column-level dependencies: `information_schema.view_column_usage` (PostgreSQL, SQL Server), `sys.sql_expression_dependencies` (SQL Server), `pg_depend` with `refobjsubid` (PostgreSQL).

---

# PostgreSQL: Dependencies Are Enforced

```sql
ALTER TABLE Customers DROP COLUMN Email;
-- ERROR: cannot drop column email of table customers because other objects depend on it
-- DETAIL: view customerall depends on column email of table customers
-- HINT: Use DROP ... CASCADE to drop the dependent objects too.

ALTER TABLE Customers ALTER COLUMN Email TYPE VARCHAR(320);
-- ERROR: cannot alter type of a column used by a view or rule
```

The safe pattern is drop-change-recreate in one transaction (PostgreSQL DDL is transactional):

```sql
BEGIN;
DROP VIEW CustomerAll;
ALTER TABLE Customers ALTER COLUMN Email TYPE VARCHAR(320);
CREATE VIEW CustomerAll AS SELECT CustomerID, CustomerName, Email, Country FROM Customers;
GRANT SELECT ON CustomerAll TO reporting_role;
COMMIT;
```

---

# SQL Server: SCHEMABINDING and sp_refreshview

Without schema binding, SQL Server lets you change or drop anything; the view fails when next used, or—worse—returns columns shifted by position:

```sql
EXEC sp_refreshview 'dbo.CustomerAll';    -- re-read base metadata after table changes
```

With schema binding, the base objects cannot be changed in ways that affect the view:

```sql
CREATE VIEW dbo.CustomerDirectory
WITH SCHEMABINDING AS
SELECT CustomerID, CustomerName, Country      -- no *, two-part names required
FROM dbo.Customers;

ALTER TABLE dbo.Customers DROP COLUMN Country;
-- Msg 5074: The object 'CustomerDirectory' is dependent on column 'Country'.
```

Schema binding is required for indexed views (Section 17.11) and is a good default for any view that other code depends on.

---

# Oracle: Invalid Views and Recompilation

```sql
ALTER TABLE Customers DROP COLUMN Email;

SELECT object_name, status FROM user_objects WHERE object_name = 'CUSTOMERALL';
-- CUSTOMERALL   INVALID

ALTER VIEW CustomerAll COMPILE;     -- or just query it: Oracle recompiles on first use
-- ORA-04063: view "CUSTOMERALL" has errors   (if the dropped column is still referenced)
```

Oracle 11g+ tracks **fine-grained dependencies**: adding a column or changing an unrelated column no longer invalidates views that do not use it. `CREATE FORCE VIEW` creates a view even when its base objects do not exist yet—useful in deployment scripts with circular ordering.

---

# A Safe Procedure for Schema Changes

```text
1. FIND      every view (and view-on-view) that depends on the table or column
2. CLASSIFY  additive change (new column)          → views unaffected; add the column to views that need it
             breaking change (drop/rename/retype)  → views must change first or together
3. EXPAND    add the new column/table; create new view versions that use it (CustomerAll_v2)
4. MIGRATE   move callers to the new views
5. CONTRACT  drop old views, then drop the old column
6. VERIFY    query every dependent view; on SQL Server run sp_refreshview; on Oracle check INVALID objects
```

This is the expand-and-contract pattern applied to views: no step breaks a running caller.

---

# Visual Representation

```text
TABLE Customers (CustomerID, CustomerName, Email, Country, …)
   ▲ column-level dependency
   │
VIEW CustomerAll (* frozen into a column list)        VIEW CustomerDirectory WITH SCHEMABINDING
   ▲                                                      ▲ blocks ALTER/DROP of used columns
   │
VIEW ReportCustomers (view on a view)
   ▲
   │  ALTER TABLE Customers DROP COLUMN Email
   └── PostgreSQL: ERROR · Oracle: INVALID · SQL Server/MySQL/SQLite: fails at next use
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← base objects resolved through stored dependencies (or re-parsed: SQLite)
2. JOIN
3. WHERE
4. GROUP BY
5. HAVING
6. WINDOW
7. SELECT      ← the view's column list was fixed when it was created
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
CREATE VIEW:   resolve names → expand * → store column list → record dependency rows
               (view → table, view → column; SCHEMABINDING marks them as blocking)
ALTER TABLE:   look up dependants of the changed object
               PostgreSQL: block, or CASCADE drop
               SQL Server: block if schema-bound; otherwise allow (metadata may be stale)
               Oracle:     mark dependants INVALID (fine-grained: only if they use the changed part)
Next use:      Oracle recompiles INVALID views automatically; others error if the column is gone
```

---

# 🏗️ Architecture Insight

Dependencies make views part of the schema's **public surface**. Before every breaking table change, the question is not only "which applications use this column?" but "which views use it, and who uses those views?". Catalog queries answer the first half; query logs answer the second.

---

# ⚡ Performance Tip

On SQL Server, stale view metadata after table changes can also produce poor plans or wrong column types. Run `sp_refreshview` (or `sp_refreshsqlmodule`) for non-schema-bound views as part of every migration that changes their tables.

---

# 🌍 Production Consideration

In PostgreSQL, `DROP VIEW` + `ALTER TABLE` + `CREATE VIEW` takes an `ACCESS EXCLUSIVE` lock on the table for the length of the transaction. Keep the transaction short and set `lock_timeout`, so the migration fails fast instead of queueing every query behind it.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `*` frozen at creation | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (re-parsed) |
| Dependencies enforced | ✅ (`RESTRICT`) | ✅ | ❌ | With `SCHEMABINDING` | Invalidation | ❌ |
| Dependency catalog | `view_table_usage`, `view_column_usage` | ✅ + `pg_depend` | `view_table_usage` (8.0.13+) | ✅ + DMVs | `USER_DEPENDENCIES` | ❌ |
| Refresh metadata | ❌ | n/a | n/a | `sp_refreshview` | `ALTER VIEW … COMPILE` | n/a |
| Create before base exists | ❌ | ❌ | ❌ | ❌ | `CREATE FORCE VIEW` | ✅ (checked at use) |

> **Portability Tip:** Never use `SELECT *` in views you ship. Explicit column lists behave the same on every engine and make dependencies visible in the view text itself.

---

# Common Mistakes

### Mistake 1

Expecting a `SELECT *` view to show columns added to the table later.

---

### Mistake 2

Running `DROP … CASCADE` in PostgreSQL to "fix" a dependency error, and silently dropping other teams' views.

---

### Mistake 3

Changing tables on SQL Server without refreshing non-schema-bound views.

---

### Mistake 4

Ignoring `INVALID` objects in Oracle after a deployment.

---

# Best Practices

✔ List columns explicitly in every view.

✔ Use `SCHEMABINDING` on SQL Server views that other code depends on.

✔ Find dependants from the catalog before every breaking change.

✔ Use expand-and-contract for breaking changes.

✔ Verify all dependent views after each migration.

---

# Interview Questions

## Basic

1. Why does a `SELECT *` view not show a newly added column?
2. How do you find which views depend on a table?
3. What does `WITH SCHEMABINDING` do?

## Intermediate

4. What happens in PostgreSQL when you drop a column that a view uses?
5. What is an invalid view in Oracle, and how does it become valid again?
6. When do you need `sp_refreshview`?

## Advanced

7. Plan a zero-downtime column rename on a table used by twenty views.
8. Compare enforced dependencies (PostgreSQL) with invalidation (Oracle) for deployment workflows.

---

# Hands-on Exercises

## Exercise 1

Create `CustomerAll` with `SELECT *`, add a column to `Customers`, and confirm it does not appear.

---

## Exercise 2

Try to drop a column used by a view on your engine and record the result.

---

## Exercise 3

Write a catalog query that lists all views depending, directly or through other views, on `Orders`.

---

# Related Topics

- **17.02 — Creating and Managing Views (CREATE, ALTER, DROP and OR REPLACE)**
- **17.08 — Nested Views and Layered View Design**
- **17.11 — Indexed Views and Automatic Query Rewrite**
- **10.03 — Creating and Managing Indexes**

---

# Summary

Views depend on the tables, columns and views they reference, and `SELECT *` is frozen into a column list when the view is created (except in SQLite). Engines react differently to breaking table changes: PostgreSQL refuses them, SQL Server allows them unless the view is schema-bound, Oracle invalidates and later recompiles dependent views, and MySQL and SQLite let views fail at the next use. Find dependants from the catalog before every change, list columns explicitly, use schema binding where available, and apply expand-and-contract so that no step breaks a running caller.
