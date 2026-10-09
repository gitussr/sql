---
title: "17.14 - Execution Flow of Views and Materialized Views"
description: "Step by step through what the database does with views and materialized views: parsing and catalog lookup, permission checks, view expansion in the rewriter, merging and pushdown in the optimizer, plan caching and invalidation, how views and materialized views appear in PostgreSQL, SQL Server, MySQL, Oracle and SQLite plans, and the execution flow of writes through views and of materialized view refresh."
chapter: 17
section: 17.14
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 25 min
lastUpdated: 2026-10-09
---

# 17.14 Execution Flow of Views and Materialized Views

---

# Learning Objectives

After completing this section, you will be able to:

- Trace a query on a view from parsing to execution.
- Explain where permissions, expansion, merging and pushdown happen.
- Recognise views and materialized views in each engine's plans.
- Describe how plan caches react to view changes and refreshes.
- Trace the flow of writes through views and of refreshes.

---

# The Full Flow of a Query on a View

```sql
SELECT CustomerName, Revenue
FROM rpt_CustomerRevenue
WHERE Country = 'IN'
ORDER BY Revenue DESC
FETCH FIRST 10 ROWS ONLY;
```

```text
1. PARSE        tokens → syntax tree; rpt_CustomerRevenue is just a name
2. RESOLVE      catalog lookup: name is a VIEW (or MATERIALIZED VIEW / TABLE)
3. AUTHORIZE    caller has SELECT on the view? (base tables: owner's or caller's rights, 17.06)
4. EXPAND       view → stored query tree substituted as a derived table (recursively for nested views)
                materialized view → NOT expanded; treated as a table
5. SIMPLIFY     merge mergeable blocks; push predicates through barriers; prune columns;
                eliminate unused joins; (Oracle/SQL Server Ent.) try rewriting to an MV / indexed view
6. OPTIMIZE     statistics → cardinalities → access paths, join order and algorithms → cheapest plan
7. CACHE        plan stored with dependencies on the view AND its base tables
8. EXECUTE      operators read base tables (view) or stored rows (materialized view)
```

---

# Step by Step: A Grouped View

```sql
CREATE VIEW rpt_CustomerRevenue AS
SELECT c.CustomerID, c.CustomerName, c.Country, SUM(o.TotalAmount) AS Revenue
FROM Customers c
JOIN Orders o ON o.CustomerID = c.CustomerID
GROUP BY c.CustomerID, c.CustomerName, c.Country;
```

After expansion, the optimizer sees a grouped derived table with an outer filter, sort and limit:

```text
outer block:   SELECT … FROM (grouped block) v WHERE v.Country = 'IN' ORDER BY v.Revenue DESC LIMIT 10
grouped block: SELECT … FROM Customers c JOIN Orders o … GROUP BY c.CustomerID, c.CustomerName, c.Country

can merge?     no — GROUP BY is a barrier
pushdown?      Country is a grouping column → copy "c.Country = 'IN'" into the grouped block
limit?         stays outside: top 10 by Revenue requires all groups first
```

```text
Limit  (rows=10)
  -> Sort  (Sort Key: (sum(o.totalamount)) DESC; top-N heapsort)
        -> HashAggregate  (Group Key: c.customerid)                      ← the view's GROUP BY
              -> Hash Join  (o.customerid = c.customerid)
                    -> Seq Scan on orders o
                    -> Hash
                          -> Index Scan using ix_customers_country on customers c
                                Index Cond: (country = 'IN'::text)       ← pushed down from outside
```

The same query on a **materialized** `CustomerRevenue` with an index on `(Country, Revenue DESC)`:

```text
Limit  (rows=10)
  -> Index Scan using ix_customerrevenue_country_rev on customerrevenue
        Index Cond: (country = 'IN'::text)
```

---

# Views in Each Engine's Plans

| Engine | Merged view | Unmerged view | Materialized view / indexed view |
|--------|-------------|---------------|----------------------------------|
| PostgreSQL | Base-table nodes only | `Subquery Scan on v` (or aggregate/append nodes labeled with the view alias) | Scan on the MV by name |
| SQL Server | Base-table operators only | Same, with aggregate/segment branches | `Clustered Index Scan/Seek (ViewClustered)` on the view |
| MySQL | `select_type = SIMPLE`, base tables | `<derivedN>`, `select_type = DERIVED` | n/a (summary table by name) |
| Oracle | Base tables only | `VIEW` operation named after the view; `VIEW PUSHED PREDICATE` | `MAT_VIEW ACCESS FULL` / `MAT_VIEW REWRITE ACCESS FULL` |
| SQLite | Base tables only (flattened) | `CO-ROUTINE v` or `MATERIALIZE v` | n/a |

---

# Plan Caching and Invalidation

```text
event                                 effect on cached plans that use the view
CREATE OR REPLACE / ALTER VIEW        invalidated → recompiled on next use
ALTER TABLE on a base table           invalidated (the view's expansion depends on it)
statistics updated on a base table    may trigger recompilation (engine thresholds)
REFRESH MATERIALIZED VIEW (PG)        plans stay valid (same relation); new data may deserve new statistics
plain PG refresh                      swaps storage; plans stay valid; ANALYZE afterwards
SQL Server indexed view created       queries on base tables may recompile and start matching the view
Oracle MV becomes stale               rewrite stops (ENFORCED) at the next hard parse
```

Because a view is expanded **before** optimization, the cached plan belongs to the outer query, not to the view. Two queries that use the same view with different filters get different plans—there is no "plan of the view" to reuse.

---

# Execution Flow of a Write Through a View

```text
UPDATE PendingOrders SET TotalAmount = 90 WHERE OrderID = 1001
  1. resolve target: view → INSTEAD OF trigger? → yes: run trigger with OLD/NEW (or inserted/deleted)
  2. no trigger: auto-updatable? → map columns → base table Orders
  3. rewrite: UPDATE Orders SET TotalAmount = 90 WHERE OrderID = 1001 AND Status = 'Pending'
  4. plan and execute: index seek on the primary key, filter Status, update row
  5. base-table constraints, triggers, RLS policies fire
  6. WITH CHECK OPTION: new row satisfies the view predicate(s)?
  7. SQL Server indexed views / Oracle ON COMMIT MVs on Orders: maintained in the same transaction
```

---

# Execution Flow of a Refresh

```text
PostgreSQL REFRESH MATERIALIZED VIEW CONCURRENTLY CustomerRevenue
  1. lock MV in EXCLUSIVE mode (reads continue, other refreshes wait)
  2. execute the stored query → temporary result
  3. diff: full join temporary result ⟷ MV on the unique index columns
  4. apply DELETE / INSERT / UPDATE for changed rows
  5. commit → readers switch to the new rows

Oracle DBMS_MVIEW.REFRESH('CUSTOMERREVENUEMV', 'F')
  1. read MV log entries newer than the MV's last refresh
  2. compute per-group deltas (counts and sums) → merge into MV
  3. update refresh metadata; purge log entries no longer needed
```

---

# Visual Representation

```text
                     ┌─────────────── query on VIEW ───────────────┐
parse → resolve → authorize → EXPAND (recursive) → merge / pushdown / prune / eliminate
                                                        → optimize → cache → execute on BASE TABLES

                     ┌──────── query on MATERIALIZED VIEW ─────────┐
parse → resolve → authorize → (no expansion) → optimize like a table → execute on STORED ROWS

                     ┌──── query on BASE TABLES (Oracle / SQL Server Enterprise) ────┐
parse → resolve → … → REWRITE? matching fresh MV / indexed view → cheaper? → read stored rows
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← views expanded (or MVs read as tables) before anything else is planned
2. JOIN        ← merged views' joins join the global join-order search
3. WHERE       ← outer predicates merged or pushed into view blocks where safe
4. GROUP BY    ← view GROUP BY runs inside its block; MV GROUP BY ran at refresh time
5. HAVING      ← outer filters on view aggregates act like HAVING
6. WINDOW      ← view window functions run inside their block
7. SELECT      ← unused view columns pruned
8. DISTINCT
9. ORDER BY    ← outer ORDER BY; MV indexes may supply it
10. LIMIT / FETCH / TOP   ← outer limit; stops early only above streaming operators
```

---

# How the DBMS Executes This

```text
PostgreSQL:  rewriter (pg_rewrite rules) expands views → planner pulls up subqueries, pushes quals
             → executor; MVs are relations with relkind 'm'
SQL Server:  algebrizer binds view → expands to base tables (unless NOEXPAND) → simplification
             → view matching (Enterprise) → cost-based search
MySQL:       view resolved as derived table → merge or materialize (derived_merge, condition pushdown)
Oracle:      view merging and predicate pushing transformations → query rewrite to MVs → CBO
SQLite:      view as subquery → query flattener → push-down optimization → co-routine or materialize
```

---

# 🏗️ Architecture Insight

The execution flow explains the chapter's main rule: **a view is a compile-time abstraction; a materialized view is a run-time one**. Views disappear before execution and cost exactly what their expanded query costs; materialized views exist at run time and cost what reading their stored rows costs.

---

# ⚡ Performance Tip

When diagnosing a slow query on a view, always look at the plan of the **outer** query. The plan tells you which view blocks were merged, which predicates were pushed, which joins were eliminated, and which view became a fence.

---

# 🌍 Production Consideration

Replacing a heavily used view on a busy server invalidates many cached plans at once and can cause a compilation storm. Deploy view changes off-peak, and on SQL Server watch for compile CPU and `RESOURCE_SEMAPHORE_QUERY_COMPILE` waits afterwards.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Expansion mechanism | Implementation | Rewriter rules | Derived table | Algebrizer | View transformations | Subquery flattening |
| Unmerged view in plan | ❌ | `Subquery Scan` | `<derivedN>` | Separate branch | `VIEW` | `CO-ROUTINE` / `MATERIALIZE` |
| MV in plan | ❌ | Scan on MV | n/a | `ViewClustered` | `MAT_VIEW ACCESS` | n/a |
| Rewrite to MV | ❌ | ❌ | ❌ | Enterprise | ✅ | ❌ |

> **Portability Tip:** The flow—resolve, authorize, expand, simplify, optimize, execute—is the same on every engine. Only the names of the stages and plan nodes differ.

---

# Common Mistakes

### Mistake 1

Looking for "the plan of the view" instead of the plan of the query that uses it.

---

### Mistake 2

Assuming a materialized view is expanded like a view and reflects current data.

---

### Mistake 3

Forgetting that writes through views fire base-table triggers and maintain indexed views.

---

### Mistake 4

Replacing views at peak time and causing mass recompilation.

---

# Best Practices

✔ Read outer-query plans to see how views were expanded.

✔ Check for unmerged-view markers in plans (`Subquery Scan`, `VIEW`, `<derivedN>`, `MATERIALIZE`).

✔ Confirm MV or indexed-view usage in plans.

✔ Deploy view changes off-peak.

✔ Update statistics after refreshes.

---

# Interview Questions

## Basic

1. At which stage is a view replaced by its definition?
2. Is a materialized view expanded like a view?
3. Where are permissions on a view checked?

## Intermediate

4. How do you recognise an unmerged view in PostgreSQL, MySQL and Oracle plans?
5. What happens to cached plans when a view is replaced?
6. Trace an `UPDATE` through a view with `WITH CHECK OPTION`.

## Advanced

7. Why is there no reusable "plan of a view"?
8. Trace a PostgreSQL concurrent refresh and explain why readers are not blocked.

---

# Hands-on Exercises

## Exercise 1

Run `EXPLAIN` on queries over a mergeable and a grouped view and mark where each view went.

---

## Exercise 2

Compare the plan of the same top-10 query on a grouped view and on an indexed materialized view.

---

## Exercise 3

Replace a view and observe plan-cache invalidation (`sys.dm_exec_cached_plans`, `V$SQL`, or `pg_stat_statements` plan counts).

---

# Related Topics

- **17.03 — How Views Are Expanded (View Merging and Predicate Pushdown)**
- **15.02 — How the Query Optimizer Works (Parsing, Rewriting and Cost-Based Planning)**
- **15.08 — Parameter Sniffing, Plan Caching and Prepared Statements**
- **16.03 — Plan Structure (Operators, Trees and Data Flow)**
- **14.14 — Execution Flow of CTEs**

---

# Summary

A query on a view is parsed, the name resolved to a view, permissions checked, the view expanded recursively into its definition, and the result simplified—merged, pushed down, pruned, joins eliminated—before ordinary cost-based optimization. A materialized view is not expanded; it is planned like a table, and Oracle and SQL Server Enterprise can even rewrite base-table queries to use it. Plans show the outcome, cached plans belong to the outer query and are invalidated by view or table changes, writes through views follow trigger, mapping, base-write and check-option steps, and refreshes recompute or apply deltas under engine-specific locks.
