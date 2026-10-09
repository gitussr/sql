---
title: "17.06 - Views for Security (Row-Level and Column-Level Access)"
description: "Using SQL views as an access-control layer: column-level hiding, row-level filtering by user, role, tenant or session context, definer versus invoker rights, ownership chaining, leaky predicates and PostgreSQL security_barrier, masking sensitive values, and when to move from security views to built-in row-level security and dynamic data masking."
chapter: 17
section: 17.06
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 25 min
lastUpdated: 2026-10-09
---

# 17.06 Views for Security (Row-Level and Column-Level Access)

---

# Learning Objectives

After completing this section, you will be able to:

- Hide columns and rows from roles with views and grants.
- Filter rows by the current user, role, tenant or session context.
- Explain definer and invoker rights and ownership chaining.
- Prevent leaky predicates from exposing hidden rows.
- Decide between security views, row-level security and data masking.

---

# Column-Level Access

```sql
CREATE VIEW CustomerDirectory AS
SELECT CustomerID, CustomerName, Country          -- no Email, no Phone, no DateOfBirth
FROM Customers;

REVOKE ALL ON Customers FROM support_role;
GRANT SELECT ON CustomerDirectory TO support_role;
```

The support team can list customers but cannot read contact details—not because the application hides them, but because the database never returns them.

Masking is a variation: return a column, but not its full value.

```sql
CREATE VIEW CustomerContactsMasked AS
SELECT CustomerID,
       CustomerName,
       CONCAT(LEFT(Email, 2), '***@', SUBSTRING(Email FROM POSITION('@' IN Email) + 1)) AS EmailMasked
FROM Customers;
```

---

# Row-Level Access

```sql
-- by database user (Oracle / PostgreSQL / SQL Server have equivalents)
CREATE VIEW MyTeamEmployees AS
SELECT e.EmployeeID, e.EmployeeName, e.DepartmentID, e.HireDate
FROM Employees e
JOIN Employees m ON m.EmployeeID = e.ManagerID
WHERE m.LoginName = CURRENT_USER;
```

```sql
-- by application session context (multi-tenant)
-- PostgreSQL
CREATE VIEW TenantOrders AS
SELECT OrderID, CustomerID, OrderDate, Status, TotalAmount
FROM Orders
WHERE TenantID = current_setting('app.tenant_id')::int;

-- SQL Server
CREATE VIEW dbo.TenantOrders AS
SELECT OrderID, CustomerID, OrderDate, Status, TotalAmount
FROM dbo.Orders
WHERE TenantID = CAST(SESSION_CONTEXT(N'tenant_id') AS INT);

-- Oracle
CREATE VIEW TenantOrders AS
SELECT OrderID, CustomerID, OrderDate, Status, TotalAmount
FROM Orders
WHERE TenantID = SYS_CONTEXT('app_ctx', 'tenant_id');
```

The application sets the context once per connection or request; every query through the view is scoped automatically.

| Source of identity | PostgreSQL | MySQL | SQL Server | Oracle |
|--------------------|------------|-------|------------|--------|
| Database user | `current_user`, `session_user` | `CURRENT_USER()`, `USER()` | `USER_NAME()`, `SUSER_SNAME()` | `USER`, `SYS_CONTEXT('USERENV','SESSION_USER')` |
| Role membership | `pg_has_role(…)` | `CURRENT_ROLE()` | `IS_MEMBER(…)` | `SYS_CONTEXT('SYS_SESSION_ROLES', …)` |
| Session context | `current_setting('app.x')` | User variables (not in views) | `SESSION_CONTEXT(N'x')` | `SYS_CONTEXT('ctx','x')` |

MySQL views cannot reference user variables, so per-session row filtering in MySQL usually uses `CURRENT_USER()` joined to a mapping table.

---

# Whose Privileges? Definer vs Invoker

```text
DEFINER rights (default almost everywhere)      INVOKER rights
the view reads base tables with the              the view reads base tables with the
privileges of the view's OWNER                   privileges of the CALLER
→ caller needs SELECT on the view only           → caller needs SELECT on the view AND the tables
→ the classic "security view" pattern            → views are just shortcuts, not a security layer
```

| Engine | Default | Switch |
|--------|---------|--------|
| PostgreSQL | Owner's privileges | `WITH (security_invoker = true)` (15+) |
| MySQL | `SQL SECURITY DEFINER` | `SQL SECURITY INVOKER` |
| SQL Server | Ownership chaining: same owner → base tables not re-checked | Different owners break the chain |
| Oracle | Owner's privileges (definer) | `BEQUEATH CURRENT_USER` (12c+) |
| SQLite | No privileges | n/a |

SQL Server's **ownership chaining** is the mechanism behind definer rights there: if the view and its tables share an owner (usually `dbo`), only permission on the view is checked.

---

# Leaky Predicates

A view's filter can be undermined by a function in the **caller's** predicate that the optimizer evaluates **before** the view's own filter:

```sql
-- attacker-owned function with a side effect
CREATE FUNCTION leak(t text) RETURNS boolean
LANGUAGE plpgsql COST 0.0000001 AS $$
BEGIN RAISE NOTICE 'saw: %', t; RETURN true; END $$;

SELECT * FROM TenantOrders WHERE leak(Status || ' ' || TotalAmount::text);
-- if leak() runs before "TenantID = …", NOTICE messages show other tenants' rows
```

PostgreSQL's fix:

```sql
CREATE VIEW TenantOrders WITH (security_barrier = true) AS
SELECT OrderID, CustomerID, OrderDate, Status, TotalAmount
FROM Orders
WHERE TenantID = current_setting('app.tenant_id')::int;
```

With `security_barrier`, the view's conditions are applied before any non-`LEAKPROOF` function from the outer query. The cost: fewer optimizations, because outer predicates can no longer be pushed below the view's filter.

Error messages are another channel: `WHERE 1 / (TotalAmount - 999.99) > 0` against hidden rows can reveal whether a value exists through a division-by-zero error. Barrier views and built-in row-level security protect against this class of leak; plain views do not.

---

# Built-In Row-Level Security

```sql
-- PostgreSQL
ALTER TABLE Orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON Orders
  USING (TenantID = current_setting('app.tenant_id')::int);

-- SQL Server
CREATE FUNCTION sec.fn_tenant(@TenantID INT) RETURNS TABLE WITH SCHEMABINDING AS
RETURN SELECT 1 AS ok WHERE @TenantID = CAST(SESSION_CONTEXT(N'tenant_id') AS INT);
CREATE SECURITY POLICY sec.TenantPolicy
  ADD FILTER PREDICATE sec.fn_tenant(TenantID) ON dbo.Orders,
  ADD BLOCK PREDICATE  sec.fn_tenant(TenantID) ON dbo.Orders;

-- Oracle: Virtual Private Database (DBMS_RLS.ADD_POLICY)
```

| | Security views | Row-level security |
|---|----------------|--------------------|
| Applies to | Queries through the view | Every query on the table, including ad-hoc ones |
| Bypass risk | Anyone with table access bypasses it | Only owners / `BYPASSRLS` / exempt roles |
| Leak protection | `security_barrier` (PostgreSQL) only | Built in |
| Write control | `WITH CHECK OPTION` | `WITH CHECK` / block predicates |
| Portability | High | Engine-specific |

Use views when the rule is part of the **interface** (a directory, a masked export). Use row-level security when the rule must hold **no matter how** the table is queried.

---

# Visual Representation

```text
            support_role ──SELECT──▶ VIEW CustomerDirectory ──(owner's rights)──▶ TABLE Customers
                 │                    columns: ID, Name, Country                  all columns, all rows
                 └──SELECT──▶ TABLE Customers   ✘ permission denied

  row filter:   VIEW TenantOrders  WHERE TenantID = session tenant
                    ▲ security_barrier: view filter first, caller's functions after
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← privileges checked on the view; base tables read with owner's or caller's rights
2. JOIN        ← mapping tables (user → department, user → tenant) join here
3. WHERE       ← security filter; with a barrier it runs before untrusted outer predicates
4. GROUP BY
5. HAVING
6. WINDOW
7. SELECT      ← column-level hiding and masking happen here
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Permission check:   caller has SELECT on the view? → no: error
Base-table access:  definer rights → check owner's privileges (SQL Server: skip if same owner)
                    invoker rights → check caller's privileges on every base table
Optimization:       ordinary view: outer predicates may be evaluated before the view's filter
                    security_barrier: view quals first; only LEAKPROOF outer functions pushed down
Row-level security: policy predicates added to every scan of the table, before user predicates
```

---

# 🏗️ Architecture Insight

Security that lives in the database holds for every client: the web app, the BI tool, the analyst's notebook and the support script. Security views are the lightest way to get there; row-level security is the strongest. Both beat filters scattered through application code.

---

# ⚡ Performance Tip

Session-context filters (`current_setting`, `SESSION_CONTEXT`, `SYS_CONTEXT`) are evaluated once per query and treated as constants, so an index leading with `TenantID` serves them well. Security barriers can block other pushdowns; check plans after adding them.

---

# 🔒 Security Note

A security view is only as strong as the grants around it. Revoke direct table access, avoid `PUBLIC` grants, and remember that table owners and superusers see everything. Test with a real restricted login, not with your own.

---

# 🌍 Production Consideration

When connection pools reuse sessions, session context must be set at the start of every request and cleared at the end. A context left over from the previous request is a cross-tenant data leak.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Grants on views | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Definer / invoker choice | ❌ | `security_invoker` (15+) | `SQL SECURITY` | Ownership chaining | `BEQUEATH` | n/a |
| Leak-proof views | ❌ | `security_barrier` | ❌ | ❌ | ❌ | ❌ |
| Row-level security | ❌ | Policies (9.5+) | ❌ | Security policies (2016+) | VPD | ❌ |
| Dynamic data masking | ❌ | Extensions | Enterprise masking | ✅ (2016+) | Data Redaction | ❌ |

> **Portability Tip:** Column-hiding views plus grants work on every engine with privileges. Row filtering by session context, leak protection and row-level security are engine-specific.

---

# Common Mistakes

### Mistake 1

Granting `SELECT` on a security view while the base table is still readable.

---

### Mistake 2

Using invoker rights and expecting the view to protect the table.

---

### Mistake 3

Relying on a plain view against users who can write their own functions.

---

### Mistake 4

Leaving session context set on pooled connections.

---

# Best Practices

✔ Revoke base-table access when views are the security layer.

✔ Use definer rights for security views, invoker rights for convenience views.

✔ Use `security_barrier` or row-level security against untrusted callers.

✔ Index the columns used by security filters.

✔ Test with restricted logins.

---

# Interview Questions

## Basic

1. How can a view hide columns from a role?
2. How do you filter a view's rows by the current user?
3. What is the difference between definer and invoker rights?

## Intermediate

4. What is ownership chaining in SQL Server?
5. What is a leaky predicate, and how does `security_barrier` prevent it?
6. How do views and row-level security differ?

## Advanced

7. Design tenant isolation for a pooled web application using session context.
8. Why can error messages leak hidden rows, and which mechanisms prevent it?

---

# Hands-on Exercises

## Exercise 1

Create `CustomerDirectory`, a role with access only to the view, and confirm the role cannot read `Customers`.

---

## Exercise 2

Create `TenantOrders` filtered by session context and test two sessions with different tenants.

---

## Exercise 3

On PostgreSQL, reproduce a leaky predicate with `RAISE NOTICE`, then fix it with `security_barrier`.

---

# Related Topics

- **17.05 — WITH CHECK OPTION and INSTEAD OF Triggers**
- **17.07 — View Dependencies, Schema Binding and Schema Changes**
- **12.13 — User-Defined Scalar Functions**
- **15.13 — Concurrency, Locking and Query Performance**

---

# Summary

Views are a classic access-control layer: grant on the view, revoke on the tables, and roles see only the columns and rows the view exposes. Rows can be filtered by user, role or session context; columns can be hidden or masked. Definer rights (the default, or ownership chaining in SQL Server) make the pattern work; invoker rights turn views into mere shortcuts. Plain views can leak hidden rows through untrusted functions and error messages, so PostgreSQL offers `security_barrier`, and engines with built-in row-level security enforce rules on every query, not just those through a view.
