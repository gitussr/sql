---
title: "14.15 - CTE Performance and Index Strategy"
description: "Making CTE queries fast: filtering early inside CTEs, keeping predicates pushable, avoiding repeated evaluation of expensive CTEs, temporary tables for reused or badly estimated intermediates, indexes for recursive joins on parent columns, carrying minimal columns through recursion, pruning recursion early, precomputed hierarchies (closure tables, materialized paths, ltree, hierarchyid), and a performance checklist."
chapter: 14
section: 14.15
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 14.15 CTE Performance and Index Strategy

---

# Learning Objectives

After completing this section, you will be able to:

- Write non-recursive CTEs that stay pushable and index-friendly.
- Avoid repeated evaluation of expensive CTEs.
- Index tables for recursive traversals.
- Keep recursive CTEs small and fast.
- Decide when to precompute a hierarchy instead of recursing.

---

# Rule 1: Filter Early, Inside the CTE

If a filter is known, put it where the data is read—don't rely on pushdown:

```sql
-- ⚠ Relies on pushdown (fails if the CTE is materialized)
WITH Totals AS (
    SELECT CustomerID, OrderDate, SUM(TotalAmount) AS Total
    FROM Orders GROUP BY CustomerID, OrderDate
)
SELECT * FROM Totals WHERE OrderDate >= DATE '2026-01-01';

-- ✅ Filter where the rows are read
WITH Totals AS (
    SELECT CustomerID, OrderDate, SUM(TotalAmount) AS Total
    FROM Orders
    WHERE OrderDate >= DATE '2026-01-01'
    GROUP BY CustomerID, OrderDate
)
SELECT * FROM Totals;
```

The second form is fast whether the engine inlines or materializes.

---

# Rule 2: Keep Predicates Sargable Inside CTEs

Everything from Sections 06.12, 12.15 and 13.15 applies inside CTEs. A CTE does not change how the optimizer treats `YEAR(OrderDate) = 2026`: it is still a scan.

A subtle trap: a **computed column** of a CTE used in an outer filter cannot use a base-table index, even when inlined:

```sql
WITH Enriched AS (
    SELECT o.*, CAST(o.CreatedAt AS DATE) AS CreatedDay
    FROM Orders AS o
)
SELECT * FROM Enriched WHERE CreatedDay = DATE '2026-09-28';   -- CAST on the column → scan
```

Filter the base column with a range inside the CTE, or outside on `CreatedAt`.

---

# Rule 3: Don't Compute Expensive Things Twice

```sql
WITH Heavy AS (…expensive aggregation…)
SELECT … FROM Heavy h1 JOIN Heavy h2 ON …;
```

| Engine | What happens | Remedy if too slow |
|--------|--------------|--------------------|
| SQL Server | Computed twice | `#temp` table |
| PostgreSQL 12+ | Materialized once (default for 2+ references) | Fine; add `NOT MATERIALIZED` only if pushdown matters more |
| MySQL | Materialized once | Fine |
| Oracle | Usually materialized | `/*+ MATERIALIZE */` to be sure |

Often the double reference can be removed entirely: a self-join to get "previous month" becomes `LAG`; a join to compute a total becomes `SUM() OVER ()`.

---

# Rule 4: Use Temporary Tables for Big or Badly Estimated Steps

```sql
-- SQL Server
SELECT CustomerID, SUM(TotalAmount) AS Total
INTO #CustomerTotals
FROM Orders
GROUP BY CustomerID;

CREATE CLUSTERED INDEX ix ON #CustomerTotals (CustomerID);

SELECT … FROM #CustomerTotals JOIN … ;
```

A temporary table computes once, can be indexed, and—unlike a CTE or table variable—gets real statistics, which fixes plans that depended on a wildly wrong estimate. The cost is extra writes and catalog activity; use it for intermediates that are reused or large.

---

# Rule 5: Index the Recursive Join

```sql
-- Walking down: children of the working set
CREATE INDEX ix_employees_manager       ON Employees (ManagerID);
CREATE INDEX ix_categories_parent       ON Categories (ParentCategoryID);
CREATE INDEX ix_bom_parent              ON BillOfMaterials (ParentPartID);   -- PK (ParentPartID, ChildPartID) already covers it
CREATE INDEX ix_routes_from             ON Routes (FromCity);                -- PK (FromCity, ToCity) already covers it

-- Walking up uses the primary key (EmployeeID, CategoryID) — already indexed
```

Covering the columns the recursive member reads avoids lookups per row:

```sql
CREATE INDEX ix_employees_manager_cov ON Employees (ManagerID) INCLUDE (EmployeeName, Salary);  -- SQL Server / PostgreSQL
```

---

# Rule 6: Carry Little, Join Late

Every column carried through the recursion is copied into every iteration's working table. Carry keys, level and path; fetch names and details afterwards:

```sql
WITH RECURSIVE Sub (EmployeeID, Level) AS (
    SELECT EmployeeID, 0 FROM Employees WHERE EmployeeID = 1
    UNION ALL
    SELECT e.EmployeeID, s.Level + 1
    FROM Employees AS e JOIN Sub AS s ON e.ManagerID = s.EmployeeID
    WHERE s.Level < 20
)
SELECT s.Level, e.EmployeeName, e.Salary, d.DepartmentName     -- details joined once, at the end
FROM Sub AS s
JOIN Employees   AS e ON e.EmployeeID = s.EmployeeID
LEFT JOIN Departments AS d ON d.DepartmentID = e.DepartmentID;
```

---

# Rule 7: Prune Early

Filters inside the recursive member reduce every later iteration; filters in the main query only reduce the output:

```sql
-- ✅ Only active employees are traversed (and their subtrees skipped)
JOIN Sub AS s ON e.ManagerID = s.EmployeeID
WHERE e.IsActive = TRUE AND s.Level < 20

-- ⚠ Traverses everyone, then discards inactive rows (and keeps subtrees under inactive managers)
SELECT * FROM Sub WHERE IsActive = TRUE
```

The two are not equivalent—pruning in the recursive member also removes descendants—so choose by meaning, but prefer pruning inside when it is what you mean.

---

# Rule 8: Precompute Hot Hierarchies

When the same hierarchy is traversed constantly (menus, permissions, reporting lines), precompute:

| Structure | Read "all descendants" | Write cost | Notes |
|-----------|------------------------|------------|-------|
| Adjacency list + recursive CTE | Recursive query | Cheapest | Default; fine for most |
| Closure table (ancestor, descendant, depth) | Single indexed lookup | Rows per ancestor on insert/move | Recursive CTE can (re)build it |
| Materialized path (`/1/6/7/`) | `LIKE '/1/6/%'` (index prefix) | Update subtree paths on move | Simple, portable |
| PostgreSQL `ltree` | `path <@ 'Top.Electronics'` with GiST | Update subtree on move | Rich operators |
| SQL Server `hierarchyid` | `IsDescendantOf` with index | `GetReparentedValue` on move | Built-in type |
| Nested sets (left/right) | Range query | Renumber on insert | Read-optimized, write-heavy |

```sql
-- Build a closure table from the adjacency list (PostgreSQL)
INSERT INTO CategoryClosure (AncestorID, DescendantID, Depth)
WITH RECURSIVE c (AncestorID, DescendantID, Depth) AS (
    SELECT CategoryID, CategoryID, 0 FROM Categories
    UNION ALL
    SELECT c.AncestorID, k.CategoryID, c.Depth + 1
    FROM c JOIN Categories AS k ON k.ParentCategoryID = c.DescendantID
)
SELECT * FROM c;
```

---

# Performance Checklist

```text
□ Filters inside the CTE where the rows are read
□ Sargable predicates inside CTEs (no functions on indexed columns)
□ Expensive CTEs not recomputed per reference (plan check; temp table on SQL Server)
□ Recursive join column indexed (parent column when walking down)
□ Only keys, level and path carried through recursion
□ Depth limit and pruning inside the recursive member
□ Estimate vs actual rows checked after recursive CTEs
□ Hot hierarchies precomputed (closure, path, ltree, hierarchyid)
```

---

# Visual Representation

```text
   cost of a recursive CTE ≈ Σ over iterations ( rows in working set × cost of one join probe )
                                                                      │
                                   index on parent column ── probe = seek (cheap)
                                   no index               ── probe = scan (whole table!)
   rows in working set  ↓  by pruning inside the recursive member
   width of each row    ↓  by carrying only keys, level and path
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← a filtered, narrow CTE is cheaper to read, inline or materialized
2. JOIN        ← recursive member: index seek on the parent column per working-set row
3. WHERE       ← inside CTEs: early filters and pruning; outside: only what cannot move in
4. GROUP BY    ← aggregate after recursion over narrow rows
5. HAVING
6. WINDOW
7. SELECT      ← join details (names, departments) at the end
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
good recursive plan:     Recursive Union
                           → WorkTable Scan (small)
                           → Index Scan on employees (ManagerID = worktable.EmployeeID)
bad recursive plan:      Recursive Union
                           → Hash Join
                               → Seq Scan on employees        ← every iteration!
                               → WorkTable Scan
```

---

# 🏗️ Architecture Insight

Recursive CTEs make adjacency lists practical, but they are not free. Match the structure to the workload: adjacency lists and CTEs for write-heavy or moderate-size hierarchies, precomputed structures for read-heavy, latency-sensitive ones—maintained by the same recursive CTEs when the hierarchy changes.

---

# ⚡ Performance Tip

On SQL Server, the most frequent CTE performance fix is replacing a CTE that is referenced several times, or whose estimate is badly wrong, with a temporary table. On PostgreSQL, it is checking that an outer filter was pushed into a CTE that the planner decided to materialize.

---

# 🌍 Production Consideration

Performance of recursive CTEs depends on the data's shape—depth and fan-out—more than on its size. A reorganisation that adds a management layer or flattens a category tree can change a query's cost noticeably. Include worst-case shapes (deep chains, very wide levels) in performance tests.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Temporary tables with stats | ✅ | ✅ (`ANALYZE`) | ✅ | ✅ (`#temp`) | Global temporary tables | ✅ |
| Hierarchy type | ❌ | `ltree` | ❌ | `hierarchyid` | ❌ | ❌ |
| Covering index (`INCLUDE`) | ❌ | ✅ (11+) | ❌ (composite instead) | ✅ | ❌ (composite instead) | ❌ |
| Materialization control | ❌ | ✅ | Hints | ❌ | Hints | ✅ |

> **Portability Tip:** Early filters, sargable predicates, an index on the parent column and a depth limit are portable and account for most CTE performance.

---

# Common Mistakes

### Mistake 1

Relying on pushdown instead of filtering inside the CTE.

---

### Mistake 2

Missing the index on the parent column.

---

### Mistake 3

Carrying wide rows through deep recursion.

---

### Mistake 4

Filtering traversals in the main query when pruning inside was intended.

---

### Mistake 5

Recursing on every request for a hierarchy that rarely changes.

---

# Best Practices

✔ Filter early and sargably inside CTEs.

✔ Avoid recomputing expensive CTEs; use temporary tables when needed.

✔ Index recursive join columns; cover the columns the recursion reads.

✔ Carry little through recursion; join details at the end.

✔ Precompute hot hierarchies.

---

# Interview Questions

## Basic

1. Which column should be indexed for walking down a hierarchy?
2. Why filter inside a CTE rather than outside?
3. What is a closure table?

## Intermediate

4. Why can a computed CTE column in an outer filter prevent index use?
5. When is a temporary table better than a CTE?
6. Why carry only keys through recursion?

## Advanced

7. Compare closure tables, materialized paths and `hierarchyid` for a read-heavy category tree.
8. Why does pruning inside the recursive member give a different result from filtering the output?

---

# Hands-on Exercises

## Exercise 1

Measure an org-chart traversal before and after adding an index on `ManagerID`.

---

## Exercise 2

Build a closure table for categories with a recursive CTE and compare a descendant query against the recursive version.

---

## Exercise 3

On SQL Server, replace a twice-referenced aggregate CTE with a temporary table and compare plans.

---

# Related Topics

- **14.13 — Materialization and Inlining (MATERIALIZED and NOT MATERIALIZED)**
- **14.14 — Execution Flow of CTEs**
- **10.05 — Composite Indexes and Column Order**
- **10.06 — Covering Indexes and Included Columns**
- **03.09.08 — Hierarchical (Tree) Pattern**
- **15.xx — Query Optimization**

---

# Summary

Fast CTE queries filter early and sargably inside each CTE, avoid computing expensive CTEs more than once (using temporary tables where the engine recomputes or misestimates), and keep recursive traversals cheap: an index on the column the recursive member joins on, only keys, level and path carried through iterations, pruning and depth limits inside the recursive member, and details joined at the end. For hot, read-heavy hierarchies, precompute a closure table, materialized path, `ltree` or `hierarchyid`—maintained, if you like, by the same recursive CTEs.
