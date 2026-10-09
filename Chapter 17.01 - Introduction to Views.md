---
title: "17.01 - Introduction to Views"
description: "What a SQL view is and why it exists: a stored, named query that stores no rows, how a view differs from a table, a derived table, a CTE and a materialized view, the main uses of views (naming business rules, stable interfaces, simplification and access control), and the costs and limits every view design must respect."
chapter: 17
section: 17.01
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 20 min
lastUpdated: 2026-10-09
---

# 17.01 Introduction to Views

---

# Learning Objectives

After completing this section, you will be able to:

- Define a view and explain what the database stores for it.
- Distinguish views from tables, derived tables, CTEs and materialized views.
- Name the four main reasons to create a view.
- Recognise the costs and limits of views before you build on them.

---

# What a View Is

```sql
CREATE VIEW ActiveCustomers AS
SELECT CustomerID, CustomerName, Email, Country
FROM Customers
WHERE IsActive = 1;
```

A **view** is a `SELECT` statement stored in the catalog under a name. After it is created, `ActiveCustomers` can appear anywhere a table can appear in a query:

```sql
SELECT Country, COUNT(*) AS Customers
FROM ActiveCustomers
GROUP BY Country;

SELECT o.OrderID, a.CustomerName
FROM Orders o
JOIN ActiveCustomers a ON a.CustomerID = o.CustomerID
WHERE o.OrderDate >= DATE '2026-10-01';
```

The database stores the **definition**, the **column list** with types, the **owner**, the **permissions** and the **dependencies** on `Customers`. It stores **no rows**. Every query that reads the view runs its definition against the current data, so a view is never stale.

---

# Views Compared

| Object | Stored where | Lifetime | Stores rows? | Reusable by |
|--------|-------------|----------|--------------|-------------|
| Table | Catalog + data files | Until dropped | ✅ | Everyone with permission |
| View | Catalog | Until dropped | ❌ | Everyone with permission |
| Materialized view | Catalog + data files | Until dropped | ✅ (as of last refresh) | Everyone with permission |
| CTE | Inside one statement | One statement | ❌ (unless materialized) | That statement only |
| Derived table | Inside one statement | One statement | ❌ | That query block only |
| Temporary table | Session / transaction | Session | ✅ | That session |

A view and a derived table are almost the same thing to the optimizer—the difference is that the view's text lives in the catalog, so many queries, users and applications can share it (Section 14.04).

---

# Why Create a View?

## 1. Name a business rule once

```sql
CREATE VIEW NetRevenueByOrder AS
SELECT o.OrderID, o.OrderDate, o.CustomerID,
       SUM(oi.Quantity * oi.UnitPrice) - COALESCE(MAX(r.RefundAmount), 0) AS NetRevenue
FROM Orders o
JOIN OrderItems oi   ON oi.OrderID = o.OrderID
LEFT JOIN Refunds r  ON r.OrderID  = o.OrderID
WHERE o.Status <> 'Cancelled'
GROUP BY o.OrderID, o.OrderDate, o.CustomerID;
```

Every report that needs "net revenue" reads the view, so finance, marketing and the dashboard agree on the number.

## 2. Give applications a stable interface

When `Customers` is split into `Customers` and `CustomerContacts`, a view called `Customers_v1` can keep presenting the old shape until every caller has migrated.

## 3. Simplify complex queries

A five-table join that analysts write every day becomes one name. The optimizer still sees all five tables.

## 4. Control access

Grant `SELECT` on `PatientDirectory` (no diagnosis columns) and nothing on `Patients` (Section 17.06).

---

# What Views Do Not Do

```text
✘ make the underlying query faster      → a view IS its query (Section 17.03)
✘ store or cache results                → that is a materialized view (Section 17.09)
✘ guarantee row order                   → ORDER BY belongs in the outer query
✘ always accept writes                  → only updatable views do (Section 17.04)
✘ automatically follow table changes    → SELECT * is expanded at creation time (Section 17.07)
```

---

# A First Look at Expansion

```sql
SELECT CustomerName
FROM ActiveCustomers
WHERE Country = 'IN';
```

```sql
-- what the optimizer effectively plans
SELECT CustomerName
FROM Customers
WHERE IsActive = 1
  AND Country = 'IN';
```

The view's predicate and the outer predicate are combined, so an index on `(Country, IsActive)` serves the query exactly as if the view did not exist. This is **view merging**, and whether it is possible decides most of a view's performance (Section 17.03).

---

# Visual Representation

```text
               Application / report / user
                          │  SELECT … FROM ActiveCustomers WHERE Country = 'IN'
                          ▼
        ┌──────────────────────────────────────────┐
        │ VIEW  ActiveCustomers  (definition only)  │  ← permissions checked here
        │   SELECT CustomerID, CustomerName, …       │
        │   FROM Customers WHERE IsActive = 1        │
        └──────────────────────────────────────────┘
                          │  expanded into the query
                          ▼
        ┌──────────────────────────────────────────┐
        │ TABLE Customers  (rows live here)          │
        └──────────────────────────────────────────┘
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← the view name is replaced by its definition
2. JOIN        ← joins inside and outside the view are planned together
3. WHERE       ← the view's WHERE and the outer WHERE are combined when merged
4. GROUP BY    ← a grouped view is evaluated before outer filters on non-grouping columns
5. HAVING
6. WINDOW
7. SELECT      ← only the view columns the query uses need to be computed
8. DISTINCT
9. ORDER BY    ← put ordering in the outer query, never rely on the view's
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
CREATE VIEW:   parse and validate the SELECT → resolve column names and types
               → store definition, columns, owner, dependencies in the catalog
SELECT … view: look up name → view found → check privileges on the view
               → substitute definition → optimize the whole query → execute against base tables
```

---

# 🏗️ Architecture Insight

A view is a contract about **shape and meaning**, not about storage. That separation is what lets a database team change tables without breaking every client—and what makes careless views dangerous: when ten applications depend on a view, its definition becomes as hard to change as a public API.

---

# ⚡ Performance Tip

Before blaming a view for a slow query, rewrite the query by hand with the view's definition inlined and compare plans. If the plans are identical, the view is not the problem; the query is.

---

# 🌍 Production Consideration

Views are cheap to create and easy to forget. Keep them in source control with the migrations that create the tables they depend on, and remove unused views; a stale view that still compiles may still be queried by an old report with wrong numbers.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `CREATE VIEW` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Column list `CREATE VIEW v (a, b)` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (3.9+) |
| Temporary views | ❌ | `CREATE TEMP VIEW` | ❌ | ❌ | ❌ | `CREATE TEMP VIEW` |
| Recursive views | ✅ (`CREATE RECURSIVE VIEW`) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Views in other schemas/databases | ✅ | ✅ | ✅ | ✅ | ✅ | Attached databases (temp views only) |

> **Portability Tip:** A plain `CREATE VIEW name AS SELECT …` with explicit column names in the `SELECT` runs unchanged on every major engine. Options (`ALGORITHM`, `SCHEMABINDING`, `WITH READ ONLY`, `security_barrier`) are where dialects diverge.

---

# Common Mistakes

### Mistake 1

Treating a view as a cache and expecting it to be faster than its query.

---

### Mistake 2

Writing `SELECT *` in a view definition.

---

### Mistake 3

Creating a view for every query, until the catalog holds thousands of near-duplicates.

---

### Mistake 4

Assuming a view's `WHERE` clause is an access-control boundary without checking grants on the base tables.

---

# Best Practices

✔ Create a view when a definition is shared, stable and meaningful.

✔ Name views after what they mean (`ActiveCustomers`), not how they work.

✔ List columns explicitly.

✔ Keep view definitions in source control.

✔ Check the plans of the queries that use a view.

---

# Interview Questions

## Basic

1. What is a view, and what does the database store for it?
2. Does a view store rows? When is its data current?
3. Give three reasons to create a view.

## Intermediate

4. How does a view differ from a CTE and from a materialized view?
5. Why is `SELECT *` risky in a view definition?
6. What does it mean for the optimizer to merge a view into a query?

## Advanced

7. A team says "we moved the query into a view to make it faster". What do you check?
8. How can views help migrate a table to a new structure without downtime?

---

# Hands-on Exercises

## Exercise 1

Create `ActiveCustomers`, query it with a `WHERE` on `Country`, and compare the plan with the same query written directly against `Customers`.

---

## Exercise 2

Create a view that names "net revenue per order", and write two different reports that use it.

---

## Exercise 3

List the views in your database from the catalog (`information_schema.views`, `sys.views`, `USER_VIEWS` or `sqlite_master`) and find one that is no longer used.

---

# Related Topics

- **14.04 — CTEs vs Subqueries, Derived Tables and Views**
- **09.08 — Derived Tables (Subqueries in FROM)**
- **17.02 — Creating and Managing Views (CREATE, ALTER, DROP and OR REPLACE)**
- **17.03 — How Views Are Expanded (View Merging and Predicate Pushdown)**
- **17.09 — Materialized View Fundamentals**

---

# Summary

A view is a stored, named `SELECT`: the catalog keeps its definition, columns, owner, permissions and dependencies, but no rows, so it is always current. Queries use it like a table, and the engine expands it into the query before optimizing. Views name business rules, give applications a stable interface, simplify complex queries and control access. They do not cache results, guarantee order or always accept writes—those jobs belong to materialized views, the outer query and updatable-view rules.
