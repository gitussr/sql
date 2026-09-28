---
title: "15.04 - Automatic Query Rewrites (Pushdown, Unnesting and Elimination)"
description: "The logical transformations optimizers apply before costing: constant folding and expression simplification, predicate pushdown into views, derived tables, CTEs and partitions, transitive predicates, view and CTE merging, subquery unnesting and decorrelation, semi-join and anti-join conversion, outer-to-inner join conversion, join elimination using keys and foreign keys, DISTINCT and ORDER BY elimination, OR expansion, and the rewrites optimizers cannot do so you must."
chapter: 15
section: 15.04
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 15.04 Automatic Query Rewrites (Pushdown, Unnesting and Elimination)

---

# Learning Objectives

After completing this section, you will be able to:

- Recognise the rewrites optimizers apply automatically.
- Avoid hand-optimizing what the engine already does.
- Write SQL that keeps rewrites possible.
- Identify rewrites the optimizer cannot perform, so you must.

---

# Constant Folding and Simplification

```sql
WHERE OrderDate >= DATE '2026-01-01' + INTERVAL '8 months'    -- folded to DATE '2026-09-01'
WHERE 1 = 1 AND Status = 'Shipped'                            -- 1 = 1 removed
WHERE Status = 'Shipped' AND Status = 'Pending'               -- contradiction: no rows, table may not be read
WHERE TotalAmount > 100 AND TotalAmount > 500                 -- simplified to > 500 (some engines)
WHERE NOT (TotalAmount <= 500)                                -- rewritten as TotalAmount > 500
```

Writing `1 = 1` in generated SQL costs nothing; the optimizer removes it.

---

# Predicate Pushdown

Filters are moved as close to the data as possible—into scans, below joins, into views, derived tables and inlined CTEs:

```sql
SELECT * FROM (
    SELECT CustomerID, SUM(TotalAmount) AS Total
    FROM Orders GROUP BY CustomerID
) AS t
WHERE t.CustomerID = 42;
```

```text
without pushdown:  aggregate 10,000,000 orders → keep customer 42
with pushdown:     seek Orders WHERE CustomerID = 42 → aggregate ~10 rows
```

A filter on a `GROUP BY` column can be pushed below the aggregation; a filter on an aggregate result (`WHERE t.Total > 1000`) cannot—it must wait until the totals exist.

Pushdown is blocked by:

- `LIMIT`/`TOP`, `OFFSET` inside the derived table (filtering before or after the limit gives different rows);
- window functions when the filter is not on a `PARTITION BY` column;
- materialized CTEs (Section 14.13), `DISTINCT` on some engines, `UNION` in older versions;
- volatile functions in the inner query.

---

# Transitive Predicates

```sql
SELECT * FROM Orders AS o JOIN OrderItems AS oi ON oi.OrderID = o.OrderID
WHERE o.OrderID = 101;
```

The optimizer infers `oi.OrderID = 101` and uses the index on `OrderItems(OrderID)` directly—no need to write it twice.

---

# View and CTE Merging

Non-materialized views and inlined CTEs are merged into the outer query, so the optimizer plans the whole thing at once:

```sql
CREATE VIEW ActiveCustomers AS SELECT * FROM Customers WHERE IsActive = TRUE;

SELECT * FROM ActiveCustomers WHERE Country = 'NZ';
-- planned as: SELECT * FROM Customers WHERE IsActive = TRUE AND Country = 'NZ'
```

Layered views ("views on views on views") are merged too, but each layer can add joins the outer query does not need—join elimination (below) removes some of them, not all.

---

# Subquery Unnesting and Decorrelation

Correlated subqueries are rewritten as joins where possible (Section 09.14):

```sql
-- Written
SELECT * FROM Customers AS c
WHERE EXISTS (SELECT 1 FROM Orders AS o WHERE o.CustomerID = c.CustomerID AND o.TotalAmount > 1000);

-- Planned as a semi-join (hash, merge or nested loop, whichever is cheapest)
Customers ⋉ Orders (CustomerID, TotalAmount > 1000)

-- NOT EXISTS → anti-join; IN (subquery) → semi-join; scalar subquery with aggregate → join to a grouped derived table
```

Because of unnesting, `EXISTS`, `IN` and an equivalent join usually get the same plan on modern engines (MySQL 8.0.16+ included). Exceptions: `NOT IN` over a nullable column cannot become a plain anti-join (Section 09.12), and complex correlated subqueries (with `LIMIT`, `OR`, or correlation inside aggregates) may stay as per-row loops.

---

# Outer to Inner Join Conversion

```sql
SELECT * FROM Customers AS c
LEFT JOIN Orders AS o ON o.CustomerID = c.CustomerID
WHERE o.TotalAmount > 500;          -- rejects the NULL rows the LEFT JOIN would add
```

A `WHERE` condition that rejects `NULL`s on the outer table makes the outer join equivalent to an inner join (Section 07.11). The optimizer converts it—freeing it to choose any join order—which is correct but often not what the author intended.

---

# Join Elimination

A join whose columns are not used and that cannot change the row count can be removed:

```sql
CREATE VIEW OrderDetails AS
SELECT o.OrderID, o.OrderDate, o.TotalAmount, c.CustomerName
FROM Orders AS o
LEFT JOIN Customers AS c ON c.CustomerID = o.CustomerID;   -- c.CustomerID is the primary key

SELECT OrderID, TotalAmount FROM OrderDetails WHERE OrderDate >= DATE '2026-09-01';
-- Customers is never read: a LEFT JOIN to a unique key adds no rows and no used columns
```

| Join type | Can be eliminated when | Engines |
|-----------|------------------------|---------|
| `LEFT JOIN` to a unique key, no columns used | Always safe | PostgreSQL, SQL Server, Oracle, MySQL (limited) |
| `INNER JOIN` via a trusted foreign key, no columns used | FK guarantees a match and column is `NOT NULL` | SQL Server, Oracle (not PostgreSQL) |

This is one reason to declare primary keys and foreign keys—and, on SQL Server, to keep foreign keys trusted (not created or re-enabled `WITH NOCHECK`).

---

# DISTINCT, GROUP BY and ORDER BY Elimination

```sql
SELECT DISTINCT CustomerID, CustomerName FROM Customers;       -- CustomerID is a key: DISTINCT removed
SELECT … FROM (SELECT … ORDER BY x) AS t;                      -- inner ORDER BY without LIMIT: ignored
SELECT CustomerID, COUNT(*) FROM Orders GROUP BY CustomerID ORDER BY CustomerID;
                                                               -- stream aggregate over an index in CustomerID order: no sort
```

---

# OR Expansion and IN Lists

```sql
WHERE CustomerID = 42 OR Email = 'asha@example.com'
```

Two different indexed columns combined with `OR` cannot use one index seek. Optimizers may expand it into a union of two seeks (Oracle "OR expansion", SQL Server index union, PostgreSQL `BitmapOr`, MySQL index merge). When they don't, rewriting as `UNION` (or `UNION ALL` with a guard) helps:

```sql
SELECT * FROM Customers WHERE CustomerID = 42
UNION
SELECT * FROM Customers WHERE Email = 'asha@example.com';
```

`IN (1, 2, 3)` is handled as multiple equality seeks on every engine; very long `IN` lists (thousands of values) are better passed as a table (temporary table, array parameter, table-valued parameter) and joined.

---

# Partition Pruning

Partitioned tables (Section 13.15) are pruned when the predicate on the partition key is sargable—at plan time for literals, and at run time for parameters on engines that support dynamic pruning (PostgreSQL 11+, Oracle, SQL Server).

---

# What Optimizers Cannot Rewrite

| You wrote | The optimizer cannot | You should |
|-----------|----------------------|------------|
| `WHERE YEAR(OrderDate) = 2026` | Invert the function into a range (most engines) | Write the range |
| `WHERE Phone = 5550102030` on `VARCHAR` | Change the column's type | Pass a string |
| `NOT IN` over nullable columns | Use an anti-join (semantics differ) | `NOT EXISTS` |
| `OFFSET 100000` | Skip rows without reading them | Keyset pagination (15.10) |
| `SELECT *` | Drop columns the application ignores | List columns |
| A loop of 1000 single-row queries from the app | Batch them | Send one set-based query |
| Scalar UDF with a query inside | Inline it (except newer SQL Server/PostgreSQL SQL functions) | Rewrite as a join |
| Multiple `OR`ed conditions across tables | Always split them | `UNION` of simpler queries |

---

# Visual Representation

```text
   as written                                    after rewrites
   SELECT … FROM view v                          SELECT …
   WHERE v.CustomerID = 42                       FROM Orders o                  (view merged,
     AND EXISTS (SELECT … correlated …)          SEMI JOIN Payments p ON …        Customers join eliminated,
                                                 WHERE o.CustomerID = 42         EXISTS → semi-join,
                                                                                  filter pushed to Orders)
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← views and CTEs merged; unused joins eliminated; partitions pruned
2. JOIN        ← outer joins converted to inner when WHERE rejects NULLs; subqueries become semi/anti-joins
3. WHERE       ← constants folded; predicates pushed down and inferred transitively
4. GROUP BY    ← filters on grouping columns pushed below the aggregate
5. HAVING      ← conditions without aggregates moved to WHERE
6. WINDOW      ← filters on PARTITION BY columns can be pushed below
7. SELECT      ← unused columns pruned
8. DISTINCT    ← removed when a key guarantees uniqueness
9. ORDER BY    ← removed inside derived tables without LIMIT; satisfied by index order
10. LIMIT / FETCH / TOP   ← blocks pushdown of outer filters into the limited query
```

---

# How the DBMS Executes This

```text
SQL Server:   plan properties show "Simplification", joins removed from the tree, Left Semi Join operators
PostgreSQL:   EXPLAIN shows Hash Semi Join / Anti Join, no node for eliminated tables, "One-Time Filter: false" for contradictions
Oracle:       plan notes; 10053 trace lists transformations (JE = join elimination, SU = subquery unnesting, OR expansion)
MySQL:        EXPLAIN + SHOW WARNINGS prints the rewritten query; semijoin strategies in EXPLAIN
```

---

# 🏗️ Architecture Insight

Rewrites depend on metadata: keys, foreign keys, `NOT NULL` and trusted constraints. A schema that declares them lets the optimizer simplify complex views automatically; a schema without them forces every query to be hand-tuned.

---

# ⚡ Performance Tip

Don't hand-optimize what the engine already does—converting `EXISTS` to joins, repeating transitive predicates, removing `1 = 1`. Spend effort on the rewrites it cannot do: sargable predicates, `NOT EXISTS` over nullable columns, keyset pagination and set-based access from the application.

---

# 🌍 Production Consideration

MySQL's `SHOW WARNINGS` after `EXPLAIN` prints the query as the optimizer rewrote it—a quick way to see unnesting, merging and pushdown in action. Other engines show the same information indirectly through the plan's operators.

---

# SQL Standard vs Vendor Differences

| Rewrite | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|---------|------------|-------|------------|--------|--------|
| Predicate pushdown into derived tables | ✅ | ✅ (8.0.22+ into materialized) | ✅ | ✅ | ✅ |
| Subquery unnesting (EXISTS/IN) | ✅ | ✅ (semijoin, 8.0.16+ for EXISTS) | ✅ | ✅ | Partial |
| `LEFT JOIN` elimination | ✅ | Limited | ✅ | ✅ | ✅ (3.x, limited) |
| `INNER JOIN` elimination via FK | ❌ | ❌ | ✅ (trusted FK) | ✅ | ❌ |
| OR expansion / index union | `BitmapOr` | Index merge | Index union | OR expansion | Multi-index OR |
| Show rewritten query | ❌ | `SHOW WARNINGS` | ❌ | 10053 trace | ❌ |

> **Portability Tip:** Pushdown, merging and unnesting are universal in current versions. Join elimination and OR handling vary—check the plan before relying on them.

---

# Common Mistakes

### Mistake 1

Hand-rewriting `EXISTS` as joins "for speed" and introducing duplicates.

---

### Mistake 2

Putting `LIMIT` inside a derived table and blocking pushdown.

---

### Mistake 3

Filtering the outer table of a `LEFT JOIN` in `WHERE` and silently getting an inner join.

---

### Mistake 4

Leaving out keys and foreign keys, preventing join and `DISTINCT` elimination.

---

### Mistake 5

Expecting the optimizer to fix non-sargable predicates.

---

# Best Practices

✔ Write clear SQL and let the optimizer do routine rewrites.

✔ Declare keys, foreign keys and `NOT NULL`.

✔ Do the rewrites optimizers cannot: sargable predicates, `NOT EXISTS`, keyset pagination.

✔ Check plans to confirm pushdown and elimination happened.

---

# Interview Questions

## Basic

1. What is predicate pushdown?
2. What is constant folding?
3. Why do `EXISTS` and `IN` often get the same plan?

## Intermediate

4. When can a join be eliminated?
5. Why does a `WHERE` condition on the right table turn a `LEFT JOIN` into an inner join?
6. What blocks predicate pushdown into a derived table?

## Advanced

7. Why can SQL Server eliminate an inner join via a foreign key but not always a `LEFT JOIN` without a unique key?
8. Name three rewrites the optimizer cannot do for you.

---

# Hands-on Exercises

## Exercise 1

Create a view joining Orders and Customers and show that a query using only order columns does not read Customers.

---

## Exercise 2

Compare plans for `EXISTS`, `IN` and `JOIN` versions of the same question.

---

## Exercise 3

On MySQL, use `EXPLAIN` + `SHOW WARNINGS` to see how a correlated subquery was rewritten.

---

# Related Topics

- **15.02 — How the Query Optimizer Works (Parsing, Rewriting and Cost-Based Planning)**
- **15.07 — Writing Optimizer-Friendly SQL**
- **09.14 — Execution Flow of Subqueries (Unnesting and Decorrelation)**
- **07.11 — ON vs WHERE (Join Conditions and Filters)**
- **14.13 — Materialization and Inlining (MATERIALIZED and NOT MATERIALIZED)**

---

# Summary

Before costing any plan, optimizers rewrite queries: they fold constants, push predicates into scans, views, derived tables and partitions, infer transitive predicates, merge views and CTEs, unnest subqueries into semi- and anti-joins, convert outer joins to inner joins when `WHERE` rejects `NULL`s, and eliminate unnecessary joins, `DISTINCT`s and sorts using keys and constraints. Knowing these rewrites saves hand-tuning effort; knowing their limits—functions on columns, type mismatches, nullable `NOT IN`, `OFFSET`, `SELECT *`, application loops—tells you what you still have to fix yourself.
