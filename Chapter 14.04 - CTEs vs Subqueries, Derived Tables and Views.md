---
title: "14.04 - CTEs vs Subqueries, Derived Tables and Views"
description: "Choosing between a CTE, a derived table, a scalar or correlated subquery, LATERAL/APPLY, a view, a materialized view and a temporary table: equivalence of non-recursive CTEs and derived tables, reuse, readability, correlation, scope and lifetime, statistics and indexing, optimizer treatment, and a decision guide with examples of rewriting between forms."
chapter: 14
section: 14.04
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 14.04 CTEs vs Subqueries, Derived Tables and Views

---

# Learning Objectives

After completing this section, you will be able to:

- Rewrite a derived table as a CTE and back.
- Explain what CTEs can and cannot do compared with subqueries.
- Choose between a CTE, a view, a materialized view and a temporary table.
- Recognise when correlation or `LATERAL` is needed instead of a CTE.
- Apply a decision guide to real queries.

---

# CTE vs Derived Table

A non-recursive CTE referenced once is equivalent to a derived table (Section 09.08):

```sql
-- Derived table
SELECT c.CustomerName, t.Total
FROM (SELECT CustomerID, SUM(TotalAmount) AS Total
      FROM Orders GROUP BY CustomerID) AS t
JOIN Customers AS c ON c.CustomerID = t.CustomerID;

-- CTE
WITH t AS (SELECT CustomerID, SUM(TotalAmount) AS Total
           FROM Orders GROUP BY CustomerID)
SELECT c.CustomerName, t.Total
FROM t
JOIN Customers AS c ON c.CustomerID = t.CustomerID;
```

On inlining engines the two produce the same plan. The differences are practical:

| | Derived table | CTE |
|-|---------------|-----|
| Defined | Where it is used | Before the query |
| Reuse | Write it again | Reference by name |
| Reading order | Inside-out | Top-down |
| Recursion | ❌ | ✅ |
| Can reference outer query columns | Only with `LATERAL`/`APPLY` | ❌ |

---

# CTE vs Correlated Subquery

A CTE is evaluated independently of the outer query's rows. It **cannot** refer to a column of the outer query:

```sql
-- Correlated: latest order per customer, evaluated per customer row
SELECT c.CustomerID,
       (SELECT MAX(o.OrderDate) FROM Orders AS o WHERE o.CustomerID = c.CustomerID) AS LastOrder
FROM Customers AS c;

-- CTE: compute for all customers first, then join
WITH LastOrders AS (
    SELECT CustomerID, MAX(OrderDate) AS LastOrder FROM Orders GROUP BY CustomerID
)
SELECT c.CustomerID, l.LastOrder
FROM Customers AS c
LEFT JOIN LastOrders AS l ON l.CustomerID = c.CustomerID;
```

The CTE form is a "compute once for everyone, then join" rewrite. It is often faster for large sets; the correlated form can be faster when only a few outer rows qualify and an index serves each probe. When you need per-row logic that returns several rows or columns—"the three latest orders per customer"—use `LATERAL` / `CROSS APPLY` (Section 09.10), not a CTE.

---

# CTE vs View

```sql
CREATE VIEW CustomerTotals AS
SELECT CustomerID, SUM(TotalAmount) AS Total FROM Orders GROUP BY CustomerID;
```

| | CTE | View |
|-|-----|------|
| Lifetime | One statement | Permanent schema object |
| Shared across queries | No | Yes |
| Permissions | Caller needs access to base tables | Can grant on the view alone |
| Change management | Edit the query | `CREATE OR REPLACE VIEW`, dependency tracking |
| Optimizer | Inlined like a derived table | Inlined like a derived table (non-materialized views) |

Use a CTE for logic specific to one query; promote it to a view when several queries need the same definition, or when you want to grant access to a shaped result without granting access to the tables.

---

# CTE vs Materialized View

A materialized view (PostgreSQL, Oracle; SQL Server indexed views) **stores** its result and must be refreshed. A CTE stores nothing between statements. For expensive summaries read far more often than the data changes—daily dashboards—a materialized view is the right tool; a CTE recomputes on every run.

---

# CTE vs Temporary Table

```sql
-- Temporary table: computed once, indexed, reused across several statements
CREATE TEMPORARY TABLE tmp_CustomerTotals AS
SELECT CustomerID, SUM(TotalAmount) AS Total FROM Orders GROUP BY CustomerID;

CREATE INDEX ix_tmp_total ON tmp_CustomerTotals (Total);
ANALYZE tmp_CustomerTotals;                                  -- PostgreSQL: real statistics

SELECT … FROM tmp_CustomerTotals …;
SELECT … FROM tmp_CustomerTotals …;
```

| | CTE | Temporary table |
|-|-----|-----------------|
| Computed | Per statement (maybe per reference) | Once, explicitly |
| Reuse across statements | ❌ | ✅ |
| Indexes | ❌ | ✅ |
| Statistics | Estimated from the query | Real (after analysis) |
| Overhead | None | Create, write, drop; catalog activity |

A temporary table is the right choice when an expensive intermediate result is reused several times, needs an index, or when the optimizer's estimates for a complex CTE are badly wrong and real statistics would fix the plan.

---

# Decision Guide

```text
Need to walk a hierarchy/graph or generate rows iteratively?     → recursive CTE
Logic used by one query, improves readability?                   → CTE
Per-outer-row logic returning several rows or columns?           → LATERAL / CROSS APPLY
A single value per outer row?                                     → scalar subquery (or CTE + join)
Existence test?                                                  → EXISTS
Same logic needed by many queries or users?                      → view
Expensive summary, read often, changes rarely?                   → materialized view
Expensive intermediate reused many times, needs index or stats?  → temporary table
```

---

# Rewriting Between Forms

Nested derived tables → CTE chain (innermost first):

```sql
SELECT *
FROM (SELECT CustomerID, Total
      FROM (SELECT CustomerID, SUM(TotalAmount) AS Total FROM Orders GROUP BY CustomerID) AS a
      WHERE Total > 1000) AS b
JOIN Customers AS c ON c.CustomerID = b.CustomerID;

-- becomes
WITH a AS (SELECT CustomerID, SUM(TotalAmount) AS Total FROM Orders GROUP BY CustomerID),
     b AS (SELECT CustomerID, Total FROM a WHERE Total > 1000)
SELECT * FROM b JOIN Customers AS c ON c.CustomerID = b.CustomerID;
```

The innermost derived table becomes the first CTE; each enclosing level becomes the next.

---

# Visual Representation

```text
                   scope / lifetime ───────────────────────────────────────▶
   subquery          CTE                 temp table            view / materialized view
   one place         one statement       one session           permanent
   inside-out        top-down, named     computed once,        shared definition;
                     recursive possible  indexable, stats      MV stores data
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← derived tables, CTEs, views and temp tables all appear here as sources
2. JOIN        ← LATERAL / APPLY items are evaluated per row of the preceding items
3. WHERE       ← scalar and EXISTS subqueries often appear here
4. GROUP BY
5. HAVING
6. WINDOW
7. SELECT      ← scalar subqueries in the select list run per output row (or are decorrelated)
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
derived table     ─┐
non-recursive CTE ─┼─▶ inlined into the query tree → optimized together (predicates pushed in)
ordinary view     ─┘
materialized CTE  ───▶ computed into a work table for the statement
temporary table   ───▶ a real table: scanned or index-sought; has its own statistics
materialized view ───▶ a real table holding the stored result
```

---

# 🏗️ Architecture Insight

The choice is mostly about **scope of reuse**: within one query (CTE), across queries (view), across time (materialized view), across statements in one job (temporary table). Picking the narrowest scope that works keeps the schema small and the logic close to where it is used.

---

# ⚡ Performance Tip

If a CTE is referenced several times on SQL Server, or a complex CTE gets wildly wrong row estimates on any engine, try materializing it into a temporary table. Real statistics on the intermediate result often fix the rest of the plan.

---

# 🔒 Security Note

Views can expose a subset of columns and rows while hiding the base tables; CTEs cannot—the caller needs permission on every table the CTE reads. Use views (or security-definer functions) for access control, CTEs for query structure.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Derived tables | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `LATERAL` / `APPLY` | `LATERAL` | `LATERAL` | `LATERAL` (8.0.14+) | `CROSS/OUTER APPLY` | Both (12c+) | ❌ |
| Materialized views | ❌ | ✅ | ❌ | Indexed views | ✅ | ❌ |
| Temporary tables | ✅ | ✅ | ✅ | `#temp` | Global temporary (private 18c+) | ✅ |

> **Portability Tip:** CTEs, derived tables and views are portable. Temporary table syntax and materialized views differ the most.

---

# Common Mistakes

### Mistake 1

Trying to reference outer-query columns inside a CTE.

---

### Mistake 2

Using a CTE as if it were a cache shared across statements.

---

### Mistake 3

Duplicating the same CTE in many reports instead of creating a view.

---

### Mistake 4

Reusing an expensive CTE many times on an engine that recomputes it.

---

# Best Practices

✔ Prefer CTEs to nested derived tables for readability.

✔ Use `LATERAL`/`APPLY` for per-row, multi-row logic.

✔ Promote shared logic to views; expensive, stable summaries to materialized views.

✔ Use temporary tables for reused, expensive or badly estimated intermediates.

---

# Interview Questions

## Basic

1. What is the difference between a CTE and a derived table?
2. What is the difference between a CTE and a view?
3. Can a CTE be used across statements?

## Intermediate

4. Why can't a CTE replace every correlated subquery?
5. When is a temporary table better than a CTE?
6. When would you use a materialized view instead?

## Advanced

7. How do views and CTEs differ for access control?
8. Rewrite three nested derived tables as a CTE chain and explain the order.

---

# Hands-on Exercises

## Exercise 1

Rewrite a correlated "latest order per customer" subquery as a CTE plus join, and compare plans.

---

## Exercise 2

Convert a nested query to a CTE chain and then into a view.

---

## Exercise 3

Replace a CTE referenced three times with a temporary table on SQL Server and compare timings.

---

# Related Topics

- **09.08 — Derived Tables (Subqueries in FROM)**
- **09.07 — Correlated Subqueries**
- **09.10 — LATERAL and CROSS APPLY**
- **14.03 — Multiple and Chained CTEs**
- **14.13 — Materialization and Inlining (MATERIALIZED and NOT MATERIALIZED)**

---

# Summary

A non-recursive CTE is a named, top-down-readable derived table that can be referenced several times; it cannot correlate with the outer query (use `LATERAL`/`APPLY` for that) and it lives for one statement only. Views share definitions across queries and can serve as access-control boundaries, materialized views store expensive results across time, and temporary tables compute an intermediate once with real indexes and statistics. Choose the narrowest scope of reuse that works, and fall back to a temporary table when a CTE is recomputed or badly estimated.
