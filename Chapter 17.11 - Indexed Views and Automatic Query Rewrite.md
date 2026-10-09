---
title: "17.11 - Indexed Views and Automatic Query Rewrite"
description: "SQL Server indexed views and Oracle query rewrite: requirements for indexed views (SCHEMABINDING, deterministic expressions, COUNT_BIG, required SET options), the unique clustered index and extra nonclustered indexes, synchronous maintenance costs, automatic matching versus the NOEXPAND hint, Oracle ENABLE QUERY REWRITE, query_rewrite_integrity and staleness, dimensions, and how to confirm a rewrite in the execution plan."
chapter: 17
section: 17.11
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 25 min
lastUpdated: 2026-10-09
---

# 17.11 Indexed Views and Automatic Query Rewrite

---

# Learning Objectives

After completing this section, you will be able to:

- Create SQL Server indexed views and meet their requirements.
- Explain the write cost of synchronously maintained views.
- Use `NOEXPAND` and understand automatic view matching.
- Enable Oracle query rewrite and choose an integrity level.
- Confirm in a plan that a query was answered from a materialized result.

---

# SQL Server Indexed Views

An indexed view is a view with a **unique clustered index**. Creating that index materializes the view's rows, and from then on SQL Server keeps them in sync with every base-table write.

```sql
SET ANSI_NULLS, QUOTED_IDENTIFIER, ANSI_PADDING, ANSI_WARNINGS, CONCAT_NULL_YIELDS_NULL, ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;
GO

CREATE VIEW dbo.ProductSales
WITH SCHEMABINDING AS
SELECT oi.ProductID,
       COUNT_BIG(*)                      AS LineCount,
       SUM(oi.Quantity)                  AS UnitsSold,
       SUM(oi.Quantity * oi.UnitPrice)   AS Revenue
FROM dbo.OrderItems oi
GROUP BY oi.ProductID;
GO

CREATE UNIQUE CLUSTERED INDEX ux_ProductSales ON dbo.ProductSales (ProductID);
CREATE NONCLUSTERED INDEX ix_ProductSales_Revenue ON dbo.ProductSales (Revenue DESC);
```

Requirements (the most common ones):

```text
✔ WITH SCHEMABINDING, two-part names (dbo.Table), explicit column list (no *)
✔ deterministic expressions only (no GETDATE(), no non-deterministic functions)
✔ GROUP BY views must include COUNT_BIG(*)
✔ SUM over non-nullable expressions (wrap nullable ones in ISNULL)
✔ the SET options above, at creation AND in every session that writes base tables
✘ no outer joins, no subqueries, no DISTINCT, no UNION, no TOP, no window functions
✘ no AVG, MIN, MAX, STDEV (store SUM and COUNT_BIG and divide in the query)
✘ no self-joins, no other views, no CTEs, no text/ntext/image columns
```

---

# The Write Cost

```text
INSERT INTO OrderItems (…) VALUES (…)    → also: find ProductSales row for ProductID → update counts and sums
UPDATE OrderItems SET Quantity = …       → also: adjust the old and new groups
DELETE FROM OrderItems WHERE …           → also: decrement; delete the group when COUNT_BIG reaches 0
```

Every write on `OrderItems` now also updates the view's clustered index **in the same transaction**. Aggregated indexed views add a hot spot: thousands of concurrent inserts for the same `ProductID` all update one view row and serialize on its lock. Indexed views fit tables that are read far more than written—reporting databases, dimension tables, slowly changing facts.

---

# Using an Indexed View

```sql
-- direct reference with NOEXPAND: always reads the stored rows
SELECT ProductID, Revenue
FROM dbo.ProductSales WITH (NOEXPAND)
WHERE Revenue > 1000000;

-- base-table query: Enterprise Edition may match the view automatically
SELECT oi.ProductID, SUM(oi.Quantity * oi.UnitPrice) AS Revenue
FROM dbo.OrderItems oi
GROUP BY oi.ProductID
HAVING SUM(oi.Quantity * oi.UnitPrice) > 1000000;
```

| Edition | Query references the view | Query references base tables |
|---------|---------------------------|------------------------------|
| Enterprise / Developer | Expanded and maybe re-matched; `NOEXPAND` forces the view | May be matched to the view automatically |
| Standard / others | Expanded to base tables **unless** `WITH (NOEXPAND)` | Never matched |

Use `NOEXPAND` whenever you query an indexed view directly: it guarantees the view is used on every edition and lets SQL Server create statistics on the view's columns.

```text
Plan with the view used:
Clustered Index Scan (ViewClustered)  [dbo].[ProductSales].[ux_ProductSales]
```

---

# Oracle Query Rewrite

```sql
CREATE MATERIALIZED VIEW ProductSalesMV
BUILD IMMEDIATE
REFRESH FAST ON COMMIT
ENABLE QUERY REWRITE
AS
SELECT ProductID,
       COUNT(*)                     AS LineCount,
       SUM(Quantity)                AS UnitsSold,
       COUNT(Quantity)              AS QtyCount,
       SUM(Quantity * UnitPrice)    AS Revenue,
       COUNT(Quantity * UnitPrice)  AS RevCount
FROM OrderItems
GROUP BY ProductID;
```

```sql
SELECT ProductID, SUM(Quantity * UnitPrice) AS Revenue
FROM OrderItems
GROUP BY ProductID;
```

```text
| Id | Operation                     | Name           |
|  0 | SELECT STATEMENT              |                |
|  1 |  MAT_VIEW REWRITE ACCESS FULL | PRODUCTSALESMV |
```

The query never mentions `ProductSalesMV`, yet the optimizer answered it from the materialized view. Oracle can rewrite queries that:

```text
✔ match the MV exactly
✔ aggregate to a coarser level (MV per product → query per category, joining Products)
✔ filter on MV grouping columns
✔ need a subset of the MV's columns
✔ join extra tables to the MV's result (with constraints or dimensions declared)
```

---

# Rewrite Integrity

```sql
ALTER SESSION SET query_rewrite_integrity = ENFORCED;   -- default: only fresh MVs, only validated constraints
ALTER SESSION SET query_rewrite_integrity = TRUSTED;    -- trust RELY constraints and dimensions
ALTER SESSION SET query_rewrite_integrity = STALE_TOLERATED;   -- also use stale MVs
```

| Level | Uses stale MVs? | Trusts unvalidated constraints/dimensions? |
|-------|-----------------|--------------------------------------------|
| `ENFORCED` | ❌ | ❌ |
| `TRUSTED` | ❌ | ✅ |
| `STALE_TOLERATED` | ✅ | ✅ |

With `ENFORCED`, a stale on-demand MV is silently ignored and queries fall back to base tables—a common reason rewrite "stops working" after base-table changes. `DBMS_MVIEW.EXPLAIN_REWRITE` explains why a specific query was not rewritten.

**Dimensions** (`CREATE DIMENSION`) declare hierarchies such as day → month → year or product → category, letting Oracle roll an MV up to coarser levels without joins it cannot prove safe.

---

# Visual Representation

```text
SQL SERVER INDEXED VIEW                          ORACLE QUERY REWRITE
base write ──same transaction──▶ view index      query on base tables
                                                     │ optimizer: is there an MV that can answer this?
query WITH (NOEXPAND) ──▶ view index                 ├─ yes, fresh (or tolerated) ──▶ MAT_VIEW REWRITE ACCESS
query on base tables  ──(Enterprise)──▶ match?       └─ no ──▶ ordinary plan on base tables
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← the optimizer may replace base tables with an indexed view or MV
2. JOIN        ← joins already done in the stored result disappear from the plan
3. WHERE       ← filters on grouping columns can be answered from the stored result
4. GROUP BY    ← finer stored groups can be rolled up to coarser query groups
5. HAVING      ← evaluated on stored aggregates
6. WINDOW
7. SELECT      ← AVG computed as SUM / COUNT from stored columns
8. DISTINCT
9. ORDER BY    ← a view index can supply the order
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
SQL Server write:     modify base row → compute delta for the affected view row(s) → update view's
                      clustered (and nonclustered) indexes → commit together
SQL Server read:      NOEXPAND → scan/seek view index; otherwise expand → (Enterprise) view matching
Oracle rewrite:       after parsing, compare query blocks with eligible MVs (text match, then general
                      rewrite with joins/rollups) → check freshness vs integrity level → cost both → pick cheaper
```

---

# 🏗️ Architecture Insight

Query rewrite makes materialized views **invisible infrastructure**: a DBA can add or drop them to speed up existing reports without changing a single query. That is powerful for BI workloads with many ad-hoc queries over the same facts—and a reason to document them carefully, because their effect is not visible in application code.

---

# ⚡ Performance Tip

On SQL Server, measure write throughput before and after adding an indexed view on a busy table. If the view is aggregated on a hot key, consider a summary table updated asynchronously instead (Section 17.13).

---

# 🌍 Production Consideration

Sessions that write base tables of an indexed view must use the required `SET` options. Old client libraries or linked-server connections with `ARITHABORT OFF` or `ANSI_WARNINGS OFF` will fail with error 1934 on every insert once the view is indexed.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Indexed / synchronously maintained views | ❌ | ❌ | ❌ | ✅ | `ON COMMIT` / `ON STATEMENT` MVs | ❌ |
| Automatic rewrite to MVs | ❌ | ❌ | ❌ | Enterprise | ✅ `ENABLE QUERY REWRITE` | ❌ |
| Force use of the stored result | ❌ | Query the MV | n/a | `WITH (NOEXPAND)` | `REWRITE` hint | n/a |
| Explain rewrite decisions | ❌ | n/a | n/a | Plan properties | `DBMS_MVIEW.EXPLAIN_REWRITE` | n/a |

> **Portability Tip:** Only SQL Server and Oracle rewrite base-table queries to stored results. On other engines, applications must query the materialized view or summary table by name.

---

# Common Mistakes

### Mistake 1

Querying an indexed view on Standard Edition without `NOEXPAND` and getting a base-table plan.

---

### Mistake 2

Adding an aggregated indexed view on a high-insert table and serializing writers.

---

### Mistake 3

Expecting Oracle to rewrite to a stale `ON DEMAND` MV under `ENFORCED` integrity.

---

### Mistake 4

Forgetting `COUNT_BIG(*)` or `COUNT(col)` columns that maintenance requires.

---

# Best Practices

✔ Use indexed views on read-mostly tables.

✔ Always query indexed views with `WITH (NOEXPAND)`.

✔ Store `SUM` and `COUNT` and derive averages in queries.

✔ Choose Oracle rewrite integrity deliberately, and use `EXPLAIN_REWRITE`.

✔ Confirm rewrites in plans before relying on them.

---

# Interview Questions

## Basic

1. What makes a SQL Server view an indexed view?
2. What does `NOEXPAND` do?
3. What is query rewrite in Oracle?

## Intermediate

4. Why must an aggregated indexed view include `COUNT_BIG(*)`?
5. How does an indexed view affect insert performance on its base table?
6. What are the three Oracle `query_rewrite_integrity` levels?

## Advanced

7. Why can't an indexed view contain `MAX`, and how would you work around it?
8. A report stopped using an Oracle MV after a data load. Diagnose it.

---

# Hands-on Exercises

## Exercise 1

Create `dbo.ProductSales` as an indexed view and compare a revenue query's plan with and without `NOEXPAND`.

---

## Exercise 2

Measure insert throughput on `OrderItems` before and after indexing the view.

---

## Exercise 3

On Oracle, create `ProductSalesMV` with query rewrite and confirm `MAT_VIEW REWRITE ACCESS` in the plan of a base-table query.

---

# Related Topics

- **17.09 — Materialized View Fundamentals**
- **17.12 — Indexing Materialized Views**
- **10.04 — Clustered and Nonclustered Indexes**
- **15.04 — Automatic Query Rewrites (Pushdown, Unnesting and Elimination)**
- **16.05 — Reading SQL Server Plans (Showplan and Operator Properties)**

---

# Summary

SQL Server indexed views are schema-bound views with a unique clustered index; they are materialized and maintained synchronously by every base-table write, which keeps them always fresh but adds write cost and possible contention. Strict requirements—deterministic expressions, `COUNT_BIG(*)`, no outer joins or `MIN`/`MAX`, specific `SET` options—apply. Enterprise Edition can match base-table queries to them; elsewhere, query them with `NOEXPAND`. Oracle's query rewrite answers base-table queries from materialized views automatically, including roll-ups, governed by the integrity level and freshness. In both cases, the plan shows whether the stored result was used.
