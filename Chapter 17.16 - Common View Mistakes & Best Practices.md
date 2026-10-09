---
title: "17.16 - Common View Mistakes & Best Practices"
description: "A catalogue of the most common mistakes with SQL views and materialized views—SELECT * in definitions, ORDER BY in views, expecting views to be faster, barrier views, deep and duplicated view stacks, invisible inserts, missing check options, leaky security views, broken dependencies, unrefreshed or blocking materialized views, wrong roll-ups in summaries—with the correct technique for each, consolidated best practices and a view-review checklist."
chapter: 17
section: 17.16
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 25 min
lastUpdated: 2026-10-09
---

# 17.16 Common View Mistakes & Best Practices

---

# Learning Objectives

After completing this section, you will be able to:

- Recognise the most common mistakes made with views and materialized views.
- Correct each one with the right technique.
- Apply a consolidated set of view best practices.
- Review any view or materialized view with a short checklist.

---

# Definitions

### Mistake 1: SELECT * in a view

```text
❌ CREATE VIEW CustomerAll AS SELECT * FROM Customers;
   new columns never appear; dropped columns break the view; callers get columns they should not
✅ CREATE VIEW CustomerAll AS SELECT CustomerID, CustomerName, Email, Country FROM Customers;
```

---

### Mistake 2: Relying on ORDER BY inside a view

```text
❌ CREATE VIEW TopCustomers AS SELECT TOP 100 PERCENT … ORDER BY Revenue DESC;   -- order is ignored
✅ CREATE VIEW CustomerRevenueView AS SELECT …;   SELECT … FROM CustomerRevenueView ORDER BY Revenue DESC;
```

---

### Mistake 3: Unaliased or ambiguous column names

```text
❌ SELECT c.CustomerID, o.CustomerID, SUM(o.TotalAmount) …   -- duplicate name, unnamed expression
✅ SELECT c.CustomerID, SUM(o.TotalAmount) AS Revenue …      -- every column has one clear name
```

---

### Mistake 4: Business rules that differ between "the same" views

```text
❌ ActiveCustomers excludes IsActive = 0; ActiveCustomers2 also excludes test accounts
✅ One base/business view per concept; other views build on it (Section 17.08)
```

---

# Performance

### Mistake 5: Expecting a view to be faster than its query

```text
❌ "We moved the report query into a view to speed it up"
✅ A view IS its query. Fix indexes or the query; materialize only if the cost is inherent (17.15)
```

---

### Mistake 6: Filtering behind a barrier

```text
❌ SELECT * FROM RankedOrders WHERE OrderDate >= '2026-10-01';   -- ranks all 10M orders first
✅ filter on PARTITION BY / GROUP BY columns, or use a parameterized function (17.15)
```

---

### Mistake 7: Deep and duplicated view stacks

```text
❌ v_A joins v_B and v_C, which both contain Orders and Customers → each table read twice
✅ ≤ 3 layers; aggregate views are leaves; each table appears once when flattened (17.08)
```

---

### Mistake 8: Non-SARGable expressions inside views

```text
❌ view exposes only CAST(OrderDate AS DATE) AS OrderDay; callers filter OrderDay
✅ expose OrderDate too and filter ranges on it, or add a matching expression index
```

---

### Mistake 9: Missing keys that would eliminate joins

```text
❌ wide view with LEFT JOINs to tables without primary keys; untrusted foreign keys
✅ declare primary keys and trusted (validated) foreign keys; NOT NULL where true
```

---

# Writes Through Views

### Mistake 10: Invisible inserts and escaping updates

```text
❌ INSERT INTO PendingOrders (…, Status) VALUES (…, 'Delivered');   -- row vanishes from the view
✅ CREATE VIEW PendingOrders AS … WHERE Status = 'Pending' WITH CHECK OPTION;
```

---

### Mistake 11: Updating a non-key-preserved column through a join view

```text
❌ UPDATE OrderWithCustomer SET CustomerName = 'X' WHERE OrderID = 1001;   -- intent: one row
✅ update Customers directly, by CustomerID, knowing it affects every order of that customer
```

---

### Mistake 12: Row-by-row INSTEAD OF triggers for bulk work

```text
❌ UPDATE on a 1M-row view with a FOR EACH ROW INSTEAD OF trigger
✅ set-based statements on base tables for bulk changes; statement-level logic on SQL Server
```

---

# Security

### Mistake 13: Security view with readable base tables

```text
❌ GRANT SELECT ON CustomerDirectory TO support;   -- but support can still read Customers
✅ REVOKE base-table access; grant only on the view; test with the restricted login
```

---

### Mistake 14: Leaky predicates against untrusted callers

```text
❌ plain view filtering by tenant, callers can create functions
✅ PostgreSQL security_barrier, or row-level security policies on the table (17.06)
```

---

### Mistake 15: Invoker rights on a "security" view

```text
❌ SQL SECURITY INVOKER / security_invoker = true, then expecting the view to protect the table
✅ definer rights (default) for security views; invoker rights for convenience views only
```

---

# Dependencies and Change

### Mistake 16: Breaking views with table changes

```text
❌ ALTER TABLE … DROP COLUMN Email; reports fail the next morning
✅ find dependants first (catalog queries); expand-and-contract; verify every view after migration (17.07)
```

---

### Mistake 17: DROP … CASCADE to silence a dependency error

```text
❌ DROP VIEW base_customers CASCADE;   -- also drops 14 views owned by other teams
✅ read the dependency list, change dependants deliberately, then drop
```

---

### Mistake 18: Dropping and recreating a view without its grants

```text
❌ DROP VIEW v; CREATE VIEW v …;   -- every role loses access
✅ CREATE OR REPLACE / CREATE OR ALTER / ALTER VIEW, or re-apply grants in the same migration
```

---

# Materialized Views and Summaries

### Mistake 19: No refresh plan

```text
❌ CREATE MATERIALIZED VIEW … ; forgotten for three months
✅ freshness target, scheduled or load-triggered refresh, RefreshLog, alerts on staleness
```

---

### Mistake 20: Blocking refresh on a continuously read view

```text
❌ REFRESH MATERIALIZED VIEW Dashboard;   -- readers wait for minutes
✅ unique index + REFRESH MATERIALIZED VIEW CONCURRENTLY, or build-and-swap
```

---

### Mistake 21: Indexed view on a hot write path

```text
❌ aggregated indexed view on OrderItems with 5,000 inserts/s for a few hot products
✅ asynchronous summary table, or an indexed view only on read-mostly tables
```

---

### Mistake 22: Rolling up non-additive measures

```text
❌ monthly AVG = AVG(daily AVG);  monthly distinct customers = SUM(daily distinct customers)
✅ store SUM and COUNT; compute averages at query time; store distinct counts per grain or use sketches
```

---

### Mistake 23: Timestamp watermarks that miss rows

```text
❌ WHERE UpdatedAt > last_mark   -- misses late commits and hard deletes
✅ overlap window, commit-ordered change capture, soft deletes or delete logs (17.13)
```

---

### Mistake 24: Hiding staleness from users

```text
❌ dashboard shows numbers with no "as of" time; users compare with live data
✅ display the last successful refresh time beside materialized results
```

---

# Consolidated Best Practices

```text
DEFINE        explicit columns, clear aliases, one view per business concept, no ORDER BY
LAYER         base → business → reporting; ≤ 3 levels; aggregate/window views are leaves
PERFORM       mergeable by default; SARGable columns exposed; keys and trusted FKs declared;
              index the combined predicate; parameterized functions instead of filters behind barriers
WRITE         single-table updatable views; WITH CHECK OPTION; INSTEAD OF only where needed
SECURE        grant on views, revoke on tables; definer rights; barriers or RLS for untrusted callers
CHANGE        migrations in source control; dependency checks; expand-and-contract; keep grants
MATERIALIZE   only for inherent cost; freshness target; refresh method by change rate;
              unique key + read indexes; statistics after refresh; monitored and displayed freshness
SUMMARIZE     right grain; additive measures; idempotent, transactional, logged refresh; reconciliation
```

---

# View-Review Checklist

```text
☐ Explicit column list? every column named? no ORDER BY?
☐ Does it duplicate a rule another view already defines?
☐ How deep is the stack below it? does any base table appear twice when flattened?
☐ Will typical callers' filters merge or push down? any GROUP BY / DISTINCT / window / LIMIT barrier?
☐ Are filterable columns exposed raw (SARGable)? are keys and FKs declared for join elimination?
☐ Writable? if so: WITH CHECK OPTION? defaults for hidden NOT NULL columns?
☐ Security view? base tables revoked? definer rights? barrier or RLS needed?
☐ Who depends on it (views, reports, apps)? how will it change safely?
☐ Materialized? freshness target, refresh method, unique key, read indexes, statistics, monitoring?
☐ Plan of a typical caller checked on production-sized data?
```

---

# Visual Representation

```text
   DEFINE ──▶ LAYER ──▶ PERFORM ──▶ WRITE ──▶ SECURE ──▶ CHANGE ──▶ MATERIALIZE ──▶ SUMMARIZE
   columns,   ≤3 levels, mergeable,   check     grants,    deps,      freshness,      grain,
   aliases,   leaves for keys, SARG,  option,   definer,   migrations, refresh,       additive,
   one rule   aggregates indexes      triggers  barriers   grants      indexes        reconcile
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← stacks and duplicated tables; MV vs view chosen here
2. JOIN        ← joins that could be eliminated but are not
3. WHERE       ← filters that cannot pass barriers; non-SARGable view columns; missing check options
4. GROUP BY    ← grouped views as fences; non-additive roll-ups in summaries
5. HAVING
6. WINDOW      ← ranked views as fences
7. SELECT      ← SELECT * and unnamed columns
8. DISTINCT    ← DISTINCT added to "fix" duplicates from a bad join
9. ORDER BY    ← ORDER BY in a view
10. LIMIT / FETCH / TOP   ← LIMIT inside a view blocks all pushdown
```

---

# How the DBMS Executes This

```text
The engine accepts almost every mistake in this catalogue: it expands SELECT * once, ignores
ORDER BY in views, plans barrier views as written, lets inserts escape without CHECK OPTION,
serves stale materialized views without complaint and rolls up averages as asked.
The defences are design rules, reviews and monitoring, not engine errors.
```

---

# 🏗️ Architecture Insight

Most view problems are **ownership** problems: views created for one report, reused by another, extended by a third team, and never reviewed as a whole. Give every view an owner, a layer and a purpose, and most of this catalogue never happens.

---

# ⚡ Performance Tip

For any slow query that uses views, ask three questions in order: did the filters reach the base tables, were unused joins eliminated, and is any table read twice? Those three checks explain most view-related slowness.

---

# 🌍 Production Consideration

The most damaging view mistakes are silent: a summary that drifted, a materialized view that stopped refreshing, a security view whose base table became readable. Monitor freshness, reconcile summaries, and audit grants periodically.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Rejects `ORDER BY` in views | ❌ | ❌ (allowed, not guaranteed) | ❌ (allowed) | ✅ (unless `TOP`/`OFFSET`) | ❌ (allowed) | ❌ (allowed) |
| Blocks breaking table changes | `RESTRICT` | ✅ | ❌ | With `SCHEMABINDING` | Invalidates | ❌ |
| Built-in staleness metadata | ❌ | ❌ | n/a | n/a (always fresh) | `USER_MVIEWS.STALENESS` | n/a |
| Leak protection | ❌ | `security_barrier` | ❌ | ❌ | ❌ | ❌ |

> **Portability Tip:** The mistakes are universal; the engines differ only in which ones they catch for you. Assume none of them are caught, and review accordingly.

---

# Common Mistakes

### Mistake 1

Treating this catalogue as a list of features to avoid rather than misuses to avoid.

---

### Mistake 2

Fixing a view-related problem without confirming the cause in the outer query's plan.

---

# Best Practices

✔ Use the view-review checklist for every new or changed view.

✔ Keep views explicit, shallow, mergeable and owned.

✔ Protect writes with check options and security with grants, barriers or RLS.

✔ Change views through migrations with dependency checks.

✔ Give every materialized view and summary a freshness contract and monitoring.

---

# Interview Questions

## Basic

1. Why is `SELECT *` a mistake in a view definition?
2. Why does `ORDER BY` in a view not guarantee order?
3. What goes wrong when you insert through a filtered view without `WITH CHECK OPTION`?

## Intermediate

4. Why is a monthly average computed from daily averages wrong?
5. What is the risk of `DROP VIEW … CASCADE`?
6. Why can an indexed view slow down inserts dramatically?

## Advanced

7. Review a given view stack with the checklist and list its problems in priority order.
8. Design monitoring that would catch a materialized view that silently stopped refreshing.

---

# Hands-on Exercises

## Exercise 1

Find three views in a database you work with that use `SELECT *`, and rewrite them with explicit columns.

---

## Exercise 2

Apply the view-review checklist to the most-used view in your database and record the findings.

---

## Exercise 3

Build a staleness alert query for every materialized view or summary table, using `RefreshLog` or `USER_MVIEWS`.

---

# Related Topics

- **17.08 — Nested Views and Layered View Design**
- **17.15 — View Performance and Index Strategy**
- **17.17 — View Cheat Sheet & Visual Knowledge Map**
- **14.16 — Common CTE Mistakes & Best Practices**
- **16.16 — Common Execution Plan Mistakes & Best Practices**

---

# Summary

The common view mistakes fall into seven groups: definitions (`SELECT *`, `ORDER BY`, unnamed columns, duplicated rules), performance (expecting views to be faster, filtering behind barriers, deep and duplicated stacks, non-SARGable columns, missing keys), writes (escaping rows, non-key-preserved updates, row-by-row triggers), security (readable base tables, leaky predicates, invoker rights), change (broken dependencies, cascading drops, lost grants), materialized views (no refresh plan, blocking refreshes, indexed views on hot write paths) and summaries (non-additive roll-ups, leaky watermarks, hidden staleness). The engine catches few of them, so explicit definitions, shallow layers, check options, grants, migrations, freshness contracts and a review checklist are the defence.
