---
title: "17.08 - Nested Views and Layered View Design"
description: "Designing views on top of views: why nested view stacks become slow and unreadable, redundant joins and repeated tables, optimizer limits on very deep stacks, how to flatten and inspect a view stack, a three-layer design (base, business and presentation views) with naming conventions, and rules for keeping layered views shallow, mergeable and maintainable."
chapter: 17
section: 17.08
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 20 min
lastUpdated: 2026-10-09
---

# 17.08 Nested Views and Layered View Design

---

# Learning Objectives

After completing this section, you will be able to:

- Explain how nested views are expanded and why deep stacks become slow.
- Detect redundant joins and repeated tables in a view stack.
- Flatten a view stack to see what a query really reads.
- Design a shallow, layered set of views with clear responsibilities.

---

# How Nested Views Expand

```sql
CREATE VIEW v_Customers AS
SELECT CustomerID, CustomerName, Country FROM Customers WHERE IsActive = 1;

CREATE VIEW v_CustomerOrders AS
SELECT c.CustomerID, c.CustomerName, c.Country, o.OrderID, o.OrderDate, o.TotalAmount
FROM v_Customers c
JOIN Orders o ON o.CustomerID = c.CustomerID;

CREATE VIEW v_CustomerRevenue AS
SELECT CustomerID, CustomerName, Country, SUM(TotalAmount) AS Revenue
FROM v_CustomerOrders
GROUP BY CustomerID, CustomerName, Country;
```

A query on `v_CustomerRevenue` expands recursively: `v_CustomerRevenue` → `v_CustomerOrders` → `v_Customers` → `Customers`. Each level is merged or kept as a block according to the rules of Section 17.03. Three levels of simple views are harmless. Ten levels written by different people over five years usually are not.

---

# How View Stacks Go Wrong

## Repeated tables

```sql
CREATE VIEW v_OrderEnriched AS
SELECT co.*, cr.Revenue AS CustomerRevenue
FROM v_CustomerOrders co
JOIN v_CustomerRevenue cr ON cr.CustomerID = co.CustomerID;
```

Flattened, this reads `Customers` **twice** and `Orders` **twice**, and aggregates all orders of every customer—because `v_CustomerRevenue` contains its own copy of the join. The author saw two tidy view names; the optimizer sees four tables and a `GROUP BY`.

## Joins nobody needs

```sql
SELECT OrderID, TotalAmount FROM v_OrderEnriched WHERE OrderDate >= DATE '2026-10-01';
```

The query needs two columns from `Orders`. But inner joins to views with aggregates cannot be eliminated, so the whole stack runs.

## Barriers at every level

A `DISTINCT` in level 2, a `ROW_NUMBER()` in level 4 and a `TOP` in level 6 each stop merging and pushdown. A filter written at the top reaches the base tables only if it survives every barrier on the way down.

## Optimizer limits

Very deep stacks produce queries with dozens of tables. Join-order search is exponential, so optimizers switch to heuristics (PostgreSQL `join_collapse_limit` and `geqo_threshold`, SQL Server's "Reason For Early Termination: Time Out", Oracle's permutation limit), and plan quality drops.

---

# Inspecting a View Stack

```sql
-- PostgreSQL: recursive dependency walk from a view down to its tables
WITH RECURSIVE deps AS (
    SELECT 'v_orderenriched'::regclass AS obj, 0 AS depth
    UNION ALL
    SELECT DISTINCT d.refobjid::regclass, deps.depth + 1
    FROM deps
    JOIN pg_rewrite r ON r.ev_class = deps.obj
    JOIN pg_depend  d ON d.objid = r.oid AND d.refobjid <> deps.obj
    JOIN pg_class   c ON c.oid = d.refobjid AND c.relkind IN ('r', 'v', 'm')
)
SELECT obj, MIN(depth) AS depth FROM deps GROUP BY obj ORDER BY depth;
```

The quickest check on any engine is the plan: count how many times each base table appears. If `Orders` appears three times in a query that mentions it once, the stack is duplicating work.

To flatten a view by hand, substitute each definition as a derived table, then simplify. On SQL Server, the plan XML lists every referenced table; on Oracle, `DBMS_UTILITY.EXPAND_SQL_TEXT` returns the fully expanded SQL:

```sql
DECLARE expanded CLOB;
BEGIN
  DBMS_UTILITY.EXPAND_SQL_TEXT('SELECT * FROM v_OrderEnriched', expanded);
  DBMS_OUTPUT.PUT_LINE(expanded);
END;
```

---

# A Layered Design That Stays Sane

```text
LAYER            PURPOSE                                   RULES
base   (b_)      one view per table: rename, cast,         single table, no joins, no aggregates
                 filter soft-deleted rows, hide columns    always mergeable
business (bz_)   one business concept: an order with its   joins of base views, no aggregates
                 customer, an active subscription          mergeable; keys declared so joins can be eliminated
reporting (rpt_) aggregates and ranking for one consumer   GROUP BY / windows allowed; never used by other views
                 or dashboard                              candidates for materialization (17.09)
```

Rules that keep the layers healthy:

```text
✔ depth ≤ 3: reporting → business → base → table
✔ a view never depends on a view in the same or a higher layer
✔ aggregate and window views are leaves: nothing builds on them
✔ each base table appears once in any flattened query
✔ a view has one owner team and one documented purpose
```

Schemas can enforce the layers: `base.Customers`, `business.CustomerOrders`, `reporting.CustomerRevenue`, with grants only on the outer schema.

---

# Refactoring a Bad Stack

```text
1. Inventory    list every view in the stack, its depth and its consumers (query logs)
2. Flatten      expand the top view; note repeated tables and barriers
3. Rewrite      write the flattened query directly over base views, each table once,
                aggregates computed once (CTEs inside the view are fine)
4. Compare      same results (EXCEPT both ways) and better plans
5. Replace      CREATE OR REPLACE the top view with the rewrite; retire unused middle views
```

---

# Visual Representation

```text
BAD: deep, repeated, barriers everywhere               GOOD: three shallow layers
rpt_Dashboard                                          rpt_CustomerRevenue  (GROUP BY)
  └ v_OrderEnriched                                      └ bz_CustomerOrders  (joins)
      ├ v_CustomerOrders                                     ├ b_Customers  → Customers
      │   └ v_Customers → Customers                          └ b_Orders     → Orders
      │   └ Orders
      └ v_CustomerRevenue (GROUP BY)                   each table once · barriers only at the top
          └ v_CustomerOrders
              └ v_Customers → Customers   (again)
              └ Orders                    (again)
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← every level of the stack expands here, innermost first
2. JOIN        ← joins from all merged levels are ordered together
3. WHERE       ← top-level filters must survive every barrier to reach the tables
4. GROUP BY    ← each grouped level is a barrier for the levels above it
5. HAVING
6. WINDOW      ← each windowed level is a barrier too
7. SELECT      ← unused columns pruned across levels when merged
8. DISTINCT    ← a DISTINCT anywhere in the stack blocks merging at that level
9. ORDER BY
10. LIMIT / FETCH / TOP   ← a limit inside the stack blocks pushdown below it
```

---

# How the DBMS Executes This

```text
Rewrite:   expand top view → find views in its definition → expand those → … until only tables remain
Simplify:  bottom-up, merge each mergeable block into its parent; push predicates through barriers
           where safe; eliminate unused left joins to unique keys
Optimize:  one large query; if it exceeds join-search limits → heuristic or truncated search
Result:    as good as the flattened query the optimizer ended up with—not the tidy stack you see
```

---

# 🏗️ Architecture Insight

A view stack is code reuse **without** a compiler that removes duplication. In application code, calling the same function twice is cheap; in SQL, referencing the same view twice usually means computing it twice. Reuse definitions through layers, not by joining views that overlap.

---

# ⚡ Performance Tip

When a report built on views is slow, flatten its top view and count the base-table references. Removing a duplicated aggregate from a stack often helps more than any index.

---

# 🌍 Production Consideration

Deep stacks make incidents slow to diagnose: a 200-line plan for a 5-line query. Document each view's layer and purpose, and add the stack depth to code review for new views.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Views on views | ✅ | ✅ | ✅ | ✅ (max 32 levels of nesting) | ✅ | ✅ |
| Expanded SQL text | ❌ | ❌ (plan / `pg_get_viewdef` per level) | ❌ | ❌ (plan) | `DBMS_UTILITY.EXPAND_SQL_TEXT` | ❌ |
| Join-search limits | ❌ | `join_collapse_limit`, GEQO | `optimizer_search_depth` | Optimizer timeout | Permutation limits | Planner heuristics |

> **Portability Tip:** Layering rules are engine-independent. Shallow stacks of mergeable views behave well on every engine; deep stacks behave differently on each.

---

# Common Mistakes

### Mistake 1

Joining two views that both contain the same base tables.

---

### Mistake 2

Building new views on top of aggregate or windowed views.

---

### Mistake 3

Letting the stack grow without anyone owning its overall design.

---

### Mistake 4

Optimizing indexes for a stacked query before checking how many times each table is read.

---

# Best Practices

✔ Keep stacks three levels deep or less.

✔ Make aggregate and window views leaves.

✔ Ensure each base table appears once in a flattened query.

✔ Use schemas or prefixes to mark layers.

✔ Flatten and compare when refactoring.

---

# Interview Questions

## Basic

1. What happens when a view references another view?
2. Why can nested views be slower than the equivalent single query?
3. What is a layered view design?

## Intermediate

4. How do you find how many times a base table is read by a stacked view?
5. Why should aggregate views not be used as building blocks for other views?
6. How do optimizer join-search limits affect deep view stacks?

## Advanced

7. Describe how you would refactor a ten-level view stack safely.
8. Design base, business and reporting layers for an order-management schema.

---

# Hands-on Exercises

## Exercise 1

Build `v_Customers`, `v_CustomerOrders`, `v_CustomerRevenue` and `v_OrderEnriched`, and count base-table references in the plan of a query on `v_OrderEnriched`.

---

## Exercise 2

Rewrite `v_OrderEnriched` so each table is read once, and verify identical results with `EXCEPT`.

---

## Exercise 3

Write a recursive catalog query that prints the depth of every view in your database.

---

# Related Topics

- **17.03 — How Views Are Expanded (View Merging and Predicate Pushdown)**
- **17.07 — View Dependencies, Schema Binding and Schema Changes**
- **14.03 — Multiple and Chained CTEs**
- **15.06 — Join Ordering and Join Algorithm Selection**
- **08.11 — Aggregating Across JOINs (Fan-Out and Pre-Aggregation)**

---

# Summary

Nested views are expanded recursively until only base tables remain, and the optimizer plans the flattened result. Deep stacks go wrong in predictable ways: the same tables are read several times, unneeded joins survive, barriers at many levels stop pushdown, and very large flattened queries exceed the optimizer's search limits. Keep stacks shallow with base, business and reporting layers; make aggregate and window views leaves; ensure each table appears once in the flattened query; and refactor bad stacks by flattening, rewriting, comparing and replacing.
