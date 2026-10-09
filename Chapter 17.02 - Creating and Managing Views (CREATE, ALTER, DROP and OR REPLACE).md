---
title: "17.02 - Creating and Managing Views (CREATE, ALTER, DROP and OR REPLACE)"
description: "How to create, replace, alter, rename and drop SQL views on PostgreSQL, MySQL, SQL Server, Oracle and SQLite: column lists, CREATE OR REPLACE and CREATE OR ALTER, IF EXISTS and CASCADE, view options such as ALGORITHM, SCHEMABINDING, WITH READ ONLY and security_invoker, finding views and their definitions in the catalog, and managing views through migrations."
chapter: 17
section: 17.02
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 20 min
lastUpdated: 2026-10-09
---

# 17.02 Creating and Managing Views (CREATE, ALTER, DROP and OR REPLACE)

---

# Learning Objectives

After completing this section, you will be able to:

- Create views with and without explicit column lists.
- Replace and alter views safely on each engine.
- Drop views, with and without their dependants.
- Use the most common view options on each engine.
- Find views and read their definitions from the catalog.

---

# Creating a View

```sql
CREATE VIEW CustomerOrderCounts AS
SELECT c.CustomerID,
       c.CustomerName,
       COUNT(o.OrderID) AS OrderCount
FROM Customers c
LEFT JOIN Orders o ON o.CustomerID = c.CustomerID
GROUP BY c.CustomerID, c.CustomerName;
```

Every column of a view needs a unique name. Expressions such as `COUNT(o.OrderID)` must be aliased, or named in a column list:

```sql
CREATE VIEW CustomerOrderCounts (CustomerID, CustomerName, OrderCount) AS
SELECT c.CustomerID, c.CustomerName, COUNT(o.OrderID)
FROM Customers c
LEFT JOIN Orders o ON o.CustomerID = c.CustomerID
GROUP BY c.CustomerID, c.CustomerName;
```

Rules that apply almost everywhere:

```text
✔ any valid SELECT: joins, aggregates, window functions, UNION, CTEs (WITH … inside the view)
✔ views may reference other views
✘ no parameters (use a table-valued function or a WHERE in the caller)
✘ ORDER BY is not allowed (SQL Server, unless with TOP/OFFSET) or not guaranteed (everywhere else)
✘ temporary tables cannot be referenced by a permanent view
```

---

# Replacing a View

| Engine | Syntax | Restriction |
|--------|--------|-------------|
| PostgreSQL | `CREATE OR REPLACE VIEW` | Existing columns must keep name, type and position; new columns only at the end |
| MySQL | `CREATE OR REPLACE VIEW` or `ALTER VIEW` | None beyond a valid definition |
| SQL Server | `CREATE OR ALTER VIEW` (2016 SP1+) or `ALTER VIEW` | Permissions are kept; `SCHEMABINDING` must be restated |
| Oracle | `CREATE OR REPLACE VIEW` | Grants are kept; dependants become invalid until recompiled |
| SQLite | `DROP VIEW` + `CREATE VIEW` | No replace or alter |

```sql
-- PostgreSQL: allowed (new column at the end)
CREATE OR REPLACE VIEW CustomerOrderCounts AS
SELECT c.CustomerID, c.CustomerName, COUNT(o.OrderID) AS OrderCount,
       MAX(o.OrderDate) AS LastOrderDate
FROM Customers c
LEFT JOIN Orders o ON o.CustomerID = c.CustomerID
GROUP BY c.CustomerID, c.CustomerName;

-- PostgreSQL: rejected — OrderCount changes type (bigint → numeric)
-- ERROR: cannot change data type of view column "ordercount"
```

Prefer replace/alter over drop-and-create: dropping a view also drops its grants and (on some engines) fails or cascades when other views depend on it.

---

# Dropping a View

```sql
DROP VIEW CustomerOrderCounts;
DROP VIEW IF EXISTS CustomerOrderCounts;            -- PostgreSQL, MySQL, SQL Server 2016+, SQLite, Oracle 23ai
DROP VIEW CustomerOrderCounts CASCADE;              -- PostgreSQL: also drops dependent views
DROP VIEW CustomerOrderCounts CASCADE CONSTRAINTS;  -- Oracle: drops constraints that reference the view
```

| Engine | Dependent views when you drop a view |
|--------|--------------------------------------|
| PostgreSQL | Error unless `CASCADE` (which drops them too) |
| SQL Server | Allowed; dependants fail at run time (unless schema-bound, which blocks the drop) |
| Oracle | Allowed; dependants become `INVALID` |
| MySQL | Allowed; dependants fail at run time |
| SQLite | Allowed; dependants fail at run time |

---

# Renaming a View

```sql
ALTER VIEW CustomerOrderCounts RENAME TO CustomerOrderStats;   -- PostgreSQL
RENAME TABLE CustomerOrderCounts TO CustomerOrderStats;        -- MySQL
EXEC sp_rename 'dbo.CustomerOrderCounts', 'CustomerOrderStats'; -- SQL Server (definition text keeps the old name!)
RENAME CustomerOrderCounts TO CustomerOrderStats;              -- Oracle
```

In SQL Server, `sp_rename` does not update the stored definition, so `OBJECT_DEFINITION` and scripted views show the old name; drop and recreate instead.

---

# Common View Options

```sql
-- MySQL: how the view is processed and whose privileges it uses
CREATE ALGORITHM = MERGE SQL SECURITY INVOKER VIEW ActiveCustomers AS
SELECT CustomerID, CustomerName, Country FROM Customers WHERE IsActive = 1;

-- SQL Server: bind to the schema of the base tables; hide the definition
CREATE VIEW dbo.ActiveCustomers
WITH SCHEMABINDING, ENCRYPTION AS
SELECT CustomerID, CustomerName, Country FROM dbo.Customers WHERE IsActive = 1;

-- Oracle: forbid writes through the view
CREATE OR REPLACE VIEW ActiveCustomers AS
SELECT CustomerID, CustomerName, Country FROM Customers WHERE IsActive = 1
WITH READ ONLY;

-- PostgreSQL: run with the caller's privileges and prevent leaky predicates
CREATE VIEW ActiveCustomers WITH (security_invoker = true, security_barrier = true) AS
SELECT CustomerID, CustomerName, Country FROM Customers WHERE IsActive = 1;
```

| Option | Engine | Effect | Section |
|--------|--------|--------|---------|
| `ALGORITHM = MERGE / TEMPTABLE / UNDEFINED` | MySQL | Merge into the query or materialize a temp table | 17.03 |
| `SQL SECURITY DEFINER / INVOKER` | MySQL | Whose privileges apply to base tables | 17.06 |
| `security_invoker`, `security_barrier` | PostgreSQL (15+ for invoker) | Caller's privileges; no predicate leaks | 17.06 |
| `WITH SCHEMABINDING` | SQL Server | Blocks changes to referenced columns; required for indexed views | 17.07, 17.11 |
| `WITH CHECK OPTION` | All but SQLite | Writes must stay visible through the view | 17.05 |
| `WITH READ ONLY` | Oracle | No DML through the view | 17.04 |
| `FORCE` | Oracle | Create even if base objects do not exist yet | 17.07 |

---

# Finding Views and Their Definitions

```sql
-- standard (PostgreSQL, MySQL, SQL Server)
SELECT table_schema, table_name, view_definition
FROM information_schema.views
WHERE table_name = 'activecustomers';

SELECT pg_get_viewdef('activecustomers'::regclass, true);   -- PostgreSQL
SHOW CREATE VIEW ActiveCustomers;                            -- MySQL
SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.ActiveCustomers'));  -- SQL Server (or sp_helptext)
SELECT text FROM user_views WHERE view_name = 'ACTIVECUSTOMERS';   -- Oracle
SELECT sql  FROM sqlite_master WHERE type = 'view' AND name = 'ActiveCustomers';  -- SQLite
```

PostgreSQL and SQL Server store a normalized form of the definition (`SELECT *` already expanded into a column list); MySQL also rewrites it fully qualified. Keep the original source in version control—the catalog's text is not your formatting.

---

# Visual Representation

```text
   CREATE VIEW ─────────▶ catalog: definition · columns · owner · options · dependencies
        │
        ├── CREATE OR REPLACE / CREATE OR ALTER / ALTER VIEW   (keeps grants)
        │       PostgreSQL: same columns, new ones only at the end
        │
        ├── RENAME                                               (SQL Server: text keeps old name)
        │
        └── DROP VIEW [IF EXISTS] [CASCADE]                      (drops grants; dependants break or go too)
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← the view's FROM runs inside the caller's FROM
2. JOIN
3. WHERE
4. GROUP BY    ← grouped views need aliases for every aggregate column
5. HAVING
6. WINDOW
7. SELECT      ← view column names come from aliases or the column list
8. DISTINCT
9. ORDER BY    ← not part of a view's contract
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
CREATE VIEW:            parse → resolve names → expand * → derive column names and types
                        → record dependencies → store definition → grant owner privileges
CREATE OR REPLACE:      same, then compare with the old column list (PostgreSQL) → swap definition
                        → keep grants → invalidate cached plans that used the view
DROP VIEW:              check dependants (error / cascade / invalidate) → remove catalog rows and grants
```

---

# 🏗️ Architecture Insight

Treat view DDL as migrations, never as ad-hoc fixes in production. A view replaced by hand in one environment is the classic source of "the numbers differ between staging and production".

---

# ⚡ Performance Tip

Replacing a view invalidates cached plans of every query that uses it. On a busy SQL Server or Oracle system, replacing a hot view triggers a wave of recompilations; do it at a quiet time.

---

# 🌍 Production Consideration

`DROP VIEW … CASCADE` in PostgreSQL silently drops every view that depends on it—possibly views owned by other teams. Run it without `CASCADE` first and read the error's list of dependants.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Replace | ❌ | `OR REPLACE` (compatible) | `OR REPLACE`, `ALTER VIEW` | `CREATE OR ALTER`, `ALTER VIEW` | `OR REPLACE` | ❌ |
| `DROP … IF EXISTS` | ❌ | ✅ | ✅ | ✅ (2016+) | ✅ (23ai) | ✅ |
| `DROP … CASCADE` | ✅ | ✅ | Parsed, ignored | ❌ | `CASCADE CONSTRAINTS` | ❌ |
| Rename | ❌ | `ALTER VIEW … RENAME` | `RENAME TABLE` | `sp_rename` | `RENAME` | ❌ |
| Definition in catalog | `information_schema.views` | ✅ + `pg_get_viewdef` | ✅ + `SHOW CREATE VIEW` | ✅ + `OBJECT_DEFINITION` | `USER_VIEWS.TEXT` | `sqlite_master.sql` |

> **Portability Tip:** For scripts that must run everywhere, use `DROP VIEW IF EXISTS` followed by `CREATE VIEW`, and re-apply grants afterwards.

---

# Common Mistakes

### Mistake 1

Dropping and recreating a view and forgetting to re-grant permissions.

---

### Mistake 2

Trying to change a column's type with `CREATE OR REPLACE VIEW` in PostgreSQL.

---

### Mistake 3

Using `sp_rename` on a SQL Server view and leaving its stored text out of date.

---

### Mistake 4

Using `DROP … CASCADE` without first checking what depends on the view.

---

# Best Practices

✔ Alias every computed column.

✔ Prefer replace/alter to drop-and-create.

✔ Manage view DDL in migrations, with grants alongside.

✔ Check dependants before dropping or changing a view.

✔ Keep the formatted source in version control; do not rely on catalog text.

---

# Interview Questions

## Basic

1. How do you create a view with a computed column?
2. How do you drop a view only if it exists?
3. Where can you read a view's definition?

## Intermediate

4. What may and may not change with `CREATE OR REPLACE VIEW` in PostgreSQL?
5. What happens to dependent views when you drop a view on different engines?
6. What does `WITH SCHEMABINDING` do in SQL Server?

## Advanced

7. Why is renaming a view with `sp_rename` discouraged?
8. Design a migration that changes a view column's type in PostgreSQL when other views depend on it.

---

# Hands-on Exercises

## Exercise 1

Create `CustomerOrderCounts`, then add a `LastOrderDate` column with `CREATE OR REPLACE` (or `CREATE OR ALTER`).

---

## Exercise 2

Create a second view on top of the first and try to drop the first one. Record what your engine does.

---

## Exercise 3

Read your view's definition from the catalog and compare it with the text you wrote.

---

# Related Topics

- **17.01 — Introduction to Views**
- **17.03 — How Views Are Expanded (View Merging and Predicate Pushdown)**
- **17.07 — View Dependencies, Schema Binding and Schema Changes**
- **10.03 — Creating and Managing Indexes**

---

# Summary

`CREATE VIEW` stores a named query with unique column names, its options and its dependencies. Engines differ in how views are replaced (`OR REPLACE`, `OR ALTER`, `ALTER VIEW`, or drop-and-create in SQLite), renamed, and dropped—especially in what happens to dependent views. Options such as MySQL's `ALGORITHM` and `SQL SECURITY`, SQL Server's `SCHEMABINDING`, Oracle's `WITH READ ONLY` and PostgreSQL's `security_invoker` change how a view is processed and secured. Manage views through migrations, keep grants with them, and check dependants before every change.
