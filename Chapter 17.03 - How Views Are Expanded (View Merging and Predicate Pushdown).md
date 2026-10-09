---
title: "17.03 - How Views Are Expanded (View Merging and Predicate Pushdown)"
description: "How the optimizer turns a query on a view into a query on base tables: view expansion, view merging, predicate pushdown into views, column pruning and join elimination, the constructs that prevent merging (aggregates, DISTINCT, window functions, LIMIT, UNION), MySQL's MERGE and TEMPTABLE algorithms, and how to see each outcome in an execution plan."
chapter: 17
section: 17.03
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 25 min
lastUpdated: 2026-10-09
---

# 17.03 How Views Are Expanded (View Merging and Predicate Pushdown)

---

# Learning Objectives

After completing this section, you will be able to:

- Describe how a view reference is expanded into its definition.
- Explain view merging, predicate pushdown, column pruning and join elimination.
- List the constructs that stop a view from being merged.
- Recognise merged and unmerged views in execution plans.
- Choose MySQL's `MERGE` or `TEMPTABLE` algorithm deliberately.

---

# Step 1: Expansion

```sql
SELECT CustomerName
FROM ActiveCustomers
WHERE Country = 'IN';
```

The rewriter replaces the view name with its definition, producing a derived table:

```sql
SELECT CustomerName
FROM (SELECT CustomerID, CustomerName, Email, Country
      FROM Customers
      WHERE IsActive = 1) AS ActiveCustomers
WHERE Country = 'IN';
```

Everything from here on is ordinary optimization of a derived table (Sections 09.08, 15.04).

---

# Step 2: Merging

When the view is a simple select–project–join block, the optimizer **merges** it into the outer query:

```sql
SELECT CustomerName
FROM Customers
WHERE IsActive = 1
  AND Country = 'IN';
```

```text
-- PostgreSQL plan: no trace of the view
Index Scan using ix_customers_country on customers
  Index Cond: (country = 'IN'::text)
  Filter: (isactive = 1)
```

Merged views cost nothing extra: predicates from both levels are combined, indexes are chosen for the combined predicate, and joins inside the view are reordered together with joins outside it.

---

# Step 3: Pushdown When Merging Is Impossible

```sql
CREATE VIEW CustomerOrderCounts AS
SELECT c.CustomerID, c.Country, COUNT(o.OrderID) AS OrderCount
FROM Customers c
LEFT JOIN Orders o ON o.CustomerID = c.CustomerID
GROUP BY c.CustomerID, c.Country;

SELECT * FROM CustomerOrderCounts WHERE Country = 'US';
```

A grouped view cannot be merged—`GROUP BY` must happen inside it. But `Country` is a grouping column, so filtering before grouping gives the same answer, and the optimizer **pushes the predicate down**:

```text
HashAggregate  (group key: c.customerid)
  -> Hash Right Join
        -> Seq Scan on orders o
        -> Hash
              -> Index Scan using ix_customers_country on customers c
                    Index Cond: (country = 'US'::text)      ← pushed into the view
```

Pushdown is **not** allowed for predicates on aggregates:

```sql
SELECT * FROM CustomerOrderCounts WHERE OrderCount > 100;   -- must aggregate every customer first
```

---

# Column Pruning and Join Elimination

```sql
CREATE VIEW OrderDetails AS
SELECT o.OrderID, o.OrderDate, o.TotalAmount, c.CustomerName, c.Country
FROM Orders o
LEFT JOIN Customers c ON c.CustomerID = o.CustomerID;

SELECT OrderID, TotalAmount
FROM OrderDetails
WHERE OrderDate >= DATE '2026-10-01';
```

The query uses no `Customers` column, and a `LEFT JOIN` to `Customers` on its primary key cannot add or remove `Orders` rows. The optimizer **eliminates the join**:

```text
Index Scan using ix_orders_orderdate on orders o
  Index Cond: (orderdate >= '2026-10-01'::date)
```

| Join in the view | Eliminated when unused? |
|------------------|-------------------------|
| `LEFT JOIN` to a unique/primary key | ✅ PostgreSQL, SQL Server, Oracle, MySQL 8.0+ (limited) |
| `INNER JOIN` on a trusted, non-null foreign key | ✅ SQL Server, Oracle (with `RELY`/validated FK); ❌ PostgreSQL |
| `INNER JOIN` without a foreign key | ❌ (the join could filter rows) |
| Join to a non-unique column | ❌ (the join could duplicate rows) |

This is why wide "everything" views can be cheap for narrow queries on some engines—and expensive on others (Section 17.08).

---

# What Prevents Merging

| Construct in the view | Merge? | Pushdown of outer predicates |
|-----------------------|--------|------------------------------|
| Simple `SELECT … FROM … JOIN … WHERE` | ✅ | n/a (merged) |
| `GROUP BY` / aggregates | ❌ | ✅ on grouping columns only |
| `DISTINCT` | ❌ (mostly) | ✅ on output columns |
| Window functions | ❌ | ✅ only on `PARTITION BY` columns |
| `LIMIT` / `TOP` / `FETCH` | ❌ | ❌ (would change which rows are kept) |
| `UNION ALL` | ❌ (becomes an append) | ✅ into each branch |
| `UNION` (distinct) | ❌ | ✅ into each branch |
| Volatile functions (`random()`, `now()` in some engines) | ❌ | ❌ |
| User variables, `ROWNUM` (Oracle) | ❌ | ❌ |
| Outer join where the view is on the nullable side | Partly | Restricted |

```sql
-- window function in a view: pushdown only on the PARTITION BY column
CREATE VIEW RankedOrders AS
SELECT OrderID, CustomerID, OrderDate,
       ROW_NUMBER() OVER (PARTITION BY CustomerID ORDER BY OrderDate DESC) AS rn
FROM Orders;

SELECT * FROM RankedOrders WHERE CustomerID = 42 AND rn = 1;   -- CustomerID pushed; rn filtered after
SELECT * FROM RankedOrders WHERE OrderDate >= DATE '2026-01-01'; -- NOT pushed: ranks would change
```

---

# MySQL: MERGE vs TEMPTABLE

```sql
CREATE ALGORITHM = MERGE     VIEW v1 AS SELECT … ;   -- fold into the outer query
CREATE ALGORITHM = TEMPTABLE VIEW v2 AS SELECT … ;   -- run into an internal temp table first
CREATE ALGORITHM = UNDEFINED VIEW v3 AS SELECT … ;   -- default: MERGE when possible
```

```text
EXPLAIN for a TEMPTABLE view:
id  select_type  table        type  rows
1   PRIMARY      <derived2>   ALL   1,000,000      ← the whole view was materialized
2   DERIVED      customers    ALL   1,000,000
```

`TEMPTABLE` releases base-table locks sooner but loses pushdown and indexes on the result (MySQL 8 can add an auto-key to the temp table, and 8.0.22+ pushes some conditions into derived tables). `MERGE` is right for almost all views; MySQL silently falls back to `TEMPTABLE` for aggregates, `DISTINCT`, `LIMIT`, `UNION` and subqueries in the select list.

---

# Seeing the Outcome in a Plan

| Engine | Merged | Not merged |
|--------|--------|------------|
| PostgreSQL | Only base tables appear | `Subquery Scan on v`, or the view's alias on an aggregate/append node |
| SQL Server | Only base tables appear (views are always expanded unless `NOEXPAND`) | Separate aggregate/segment branch; filters above it |
| Oracle | Base tables only | `VIEW` operation with the view name; `VIEW PUSHED PREDICATE` when pushed |
| MySQL | Base tables only, `select_type = SIMPLE` | `<derivedN>` table, `select_type = DERIVED` |
| SQLite | Base tables only | `CO-ROUTINE v` or `MATERIALIZE v` |

---

# Visual Representation

```text
query on view ──▶ EXPANSION (view text becomes a derived table)
                     │
         ┌───────────┴─────────────────────────────┐
         ▼                                         ▼
   simple SPJ view                        aggregates / DISTINCT / windows / LIMIT / UNION
   MERGE into outer block                 keep as a separate block
   • predicates combined                  • PUSH DOWN safe predicates (grouping / partition cols)
   • joins reordered together             • evaluate the block
   • unused columns pruned                • outer filters applied to its output
   • unused joins eliminated              • may be materialized (temp table / spool)
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← view replaced by a derived table; merged or kept as a block
2. JOIN        ← merged views' joins are reordered with the outer joins
3. WHERE       ← outer predicates merged, pushed down, or applied above the view block
4. GROUP BY    ← a grouped view is a barrier for predicates on aggregates
5. HAVING      ← an outer filter on a view aggregate behaves like HAVING
6. WINDOW      ← window functions are barriers except for PARTITION BY columns
7. SELECT      ← unused view columns pruned; unused joins eliminated
8. DISTINCT    ← a DISTINCT view is a barrier for merging
9. ORDER BY
10. LIMIT / FETCH / TOP   ← a limit inside a view blocks all pushdown
```

---

# How the DBMS Executes This

```text
Rewrite phase:   view reference → stored parse tree substituted as a subquery in FROM
Simplification:  can the subquery be pulled up (merged)? → yes: flatten into parent block
                 no → for each outer conjunct: references only columns that are safe to filter
                      before the view's barrier (grouping keys / partition keys / UNION branch outputs)?
                      → yes: copy it inside the view block
Cost-based:      join order, access paths and algorithms chosen for the resulting blocks
Pruning:         output columns no one references are removed; removable joins dropped
```

---

# 🏗️ Architecture Insight

Design views to be **mergeable** by default: plain joins and filters, with aggregation and ranking left to the queries that need them, or isolated in clearly named aggregate views. A view that contains `GROUP BY` or a window function is a fence; everything that uses it pays for whatever is inside the fence.

---

# ⚡ Performance Tip

If a filter on a grouped or windowed view is slow, check whether the filter column is a grouping or `PARTITION BY` column. If it is not, the engine must evaluate the whole view first; move the filter inside a parameterized table-valued function, or query the base tables directly.

---

# 🌍 Production Consideration

Optimizer improvements in new engine versions change which views are merged and which predicates are pushed down. After an upgrade, re-check plans of critical queries that use complex views (Section 16.14).

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| View merging | Implementation | ✅ (subquery pull-up) | ✅ (`MERGE`) | ✅ (always expands) | ✅ (complex view merging too) | ✅ (query flattening) |
| Pushdown into grouped views | Implementation | ✅ | ✅ (8.0.22+) | ✅ | ✅ | ✅ (push-down optimization) |
| Join elimination | Implementation | ✅ (left joins) | Limited | ✅ | ✅ | ✅ (left joins, 3.x) |
| Control the algorithm | ❌ | ❌ | `ALGORITHM =` | `NOEXPAND` (indexed views) | `MERGE` / `NO_MERGE` / `PUSH_PRED` hints | ❌ |

> **Portability Tip:** Simple views merge everywhere. Views with aggregates, windows or limits are where engines differ most; test those on every engine you support.

---

# Common Mistakes

### Mistake 1

Filtering a grouped view on an aggregate column and expecting an index to help.

---

### Mistake 2

Putting `LIMIT`/`TOP` inside a view, which blocks every pushdown.

---

### Mistake 3

Filtering a ranked view on a non-partition column and getting different results than expected—because the filter was correctly applied after ranking.

---

### Mistake 4

Using MySQL `ALGORITHM = TEMPTABLE` for a simple view and materializing a million rows for every query.

---

# Best Practices

✔ Keep general-purpose views mergeable.

✔ Put aggregation, `DISTINCT` and ranking in dedicated, clearly named views.

✔ Filter grouped views on grouping columns.

✔ Declare primary and foreign keys so unused joins can be eliminated.

✔ Check plans for `Subquery Scan`, `VIEW`, `<derivedN>` or `MATERIALIZE` nodes.

---

# Interview Questions

## Basic

1. What does it mean to expand a view?
2. What is view merging?
3. Name three constructs that prevent a view from being merged.

## Intermediate

4. When can a predicate be pushed into a view with `GROUP BY`?
5. Why can the optimizer remove a `LEFT JOIN` from a view the query does not need?
6. How do you tell from a MySQL `EXPLAIN` that a view was materialized?

## Advanced

7. Why may a filter on a column outside `PARTITION BY` not be pushed into a view with `ROW_NUMBER()`?
8. When is an `INNER JOIN` in a view eligible for elimination, and why does PostgreSQL not do it?

---

# Hands-on Exercises

## Exercise 1

Create `CustomerOrderCounts` and compare plans for `WHERE Country = 'US'` and `WHERE OrderCount > 100`.

---

## Exercise 2

Create `OrderDetails` with a `LEFT JOIN` to `Customers` and check whether a query using only `Orders` columns still reads `Customers`.

---

## Exercise 3

On MySQL, create the same view with `ALGORITHM = MERGE` and `TEMPTABLE` and compare `EXPLAIN` output.

---

# Related Topics

- **09.08 — Derived Tables (Subqueries in FROM)**
- **14.13 — Materialization and Inlining (MATERIALIZED and NOT MATERIALIZED)**
- **15.04 — Automatic Query Rewrites (Pushdown, Unnesting and Elimination)**
- **16.03 — Plan Structure (Operators, Trees and Data Flow)**
- **17.08 — Nested Views and Layered View Design**

---

# Summary

A query on a view is first expanded into a query on a derived table. Simple views are merged into the outer query, so they cost nothing extra; views with aggregates, `DISTINCT`, window functions, limits or set operations stay as separate blocks, and only predicates that are safe before those barriers—on grouping columns, partition columns or union branch outputs—are pushed down. Column pruning and join elimination make wide views cheap for narrow queries when keys are declared. Plans show the outcome: base tables only when merged, `Subquery Scan`, `VIEW`, `<derivedN>` or `MATERIALIZE` nodes when not.
