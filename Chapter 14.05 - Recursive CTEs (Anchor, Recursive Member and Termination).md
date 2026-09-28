---
title: "14.05 - Recursive CTEs (Anchor, Recursive Member and Termination)"
description: "How a recursive CTE works: the anchor member, the recursive member, UNION ALL versus UNION, the working-table iteration model, termination when an iteration returns no rows, carrying level and path columns, column type rules between anchor and recursive member on each engine, restrictions on the recursive member (aggregates, DISTINCT, outer joins, single self-reference), multiple anchors, and walking up versus down a hierarchy."
chapter: 14
section: 14.05
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 30 min
lastUpdated: 2026-09-28
---

# 14.05 Recursive CTEs (Anchor, Recursive Member and Termination)

---

# Learning Objectives

After completing this section, you will be able to:

- Identify the anchor and recursive members of a recursive CTE.
- Trace the iteration model step by step.
- Guarantee termination.
- Carry level and path columns through the recursion.
- Avoid column type mismatches between the anchor and recursive member.
- Work within each engine's restrictions on the recursive member.

---

# Anatomy

```sql
WITH RECURSIVE Subordinates (EmployeeID, EmployeeName, ManagerID, Level) AS (
    -- 1. ANCHOR MEMBER: the starting rows (no self-reference)
    SELECT EmployeeID, EmployeeName, ManagerID, 0
    FROM Employees
    WHERE EmployeeID = 1

    UNION ALL                                        -- 2. combine

    -- 3. RECURSIVE MEMBER: references the CTE itself
    SELECT e.EmployeeID, e.EmployeeName, e.ManagerID, s.Level + 1
    FROM Employees    AS e
    JOIN Subordinates AS s ON e.ManagerID = s.EmployeeID
)
SELECT * FROM Subordinates;                          -- 4. main query
```

```text
anchor     → rows to start from                 (runs once)
UNION ALL  → how iterations are combined
recursive  → rows derived from the previous iteration's rows   (runs repeatedly)
stop       → when the recursive member returns no rows
```

---

# The Iteration Model

Sample hierarchy:

```text
EmployeeID  EmployeeName  ManagerID
1           Asha          NULL        (CEO)
2           Ben           1
3           Chen          1
4           Dana          2
5           Eli           2
6           Fatima        4
```

```text
Iteration 0 (anchor)            working table = {Asha(1), level 0}
Iteration 1  employees whose manager ∈ {1}      → {Ben(2), Chen(3)}, level 1
Iteration 2  employees whose manager ∈ {2, 3}   → {Dana(4), Eli(5)}, level 2
Iteration 3  employees whose manager ∈ {4, 5}   → {Fatima(6)}, level 3
Iteration 4  employees whose manager ∈ {6}      → {}   → STOP

Result = union of all iterations: 6 rows
```

The key rule: **each iteration's recursive member sees only the rows produced by the previous iteration**, not the whole accumulated result. The engine keeps a *working table* (the last iteration's rows) and an *result table* (everything so far):

```text
result ← anchor rows;  working ← anchor rows
loop:
    new ← recursive member evaluated with CTE = working
    if new is empty: stop
    result ← result ∪ new;  working ← new
```

---

# Termination

A recursive CTE stops when an iteration produces **no rows**. In a hierarchy that happens naturally when the leaves are reached—as long as the data has no cycles. Three ways to guarantee termination:

```sql
-- 1. Natural end of data (acyclic hierarchy)
JOIN Subordinates AS s ON e.ManagerID = s.EmployeeID

-- 2. A condition that becomes false
SELECT n + 1 FROM Numbers WHERE n < 100

-- 3. A depth limit as a safety net
JOIN Subordinates AS s ON e.ManagerID = s.EmployeeID
WHERE s.Level < 20
```

Section 14.07 adds cycle detection, and Section 14.11 covers engine-level recursion limits.

---

# UNION ALL vs UNION

```text
UNION ALL   keeps every row produced by every iteration                    (all engines)
UNION       discards rows already present in the result; an iteration
            whose rows are all duplicates produces nothing → recursion stops
            PostgreSQL, MySQL (UNION DISTINCT), SQLite · not SQL Server, not Oracle
```

`UNION` can therefore stop a traversal over cyclic data—but only when the **whole row** repeats. A row carrying a growing `Level` or `Path` is never a duplicate, so `UNION` does not help there. Use `UNION ALL` plus explicit termination; it is portable and cheaper (no duplicate check).

---

# Carrying Level and Path

Columns computed from the previous iteration accumulate information along the way:

```sql
WITH RECURSIVE OrgChart (EmployeeID, EmployeeName, Level, Path) AS (
    SELECT EmployeeID, EmployeeName, 0, CAST(EmployeeName AS VARCHAR(1000))
    FROM Employees
    WHERE ManagerID IS NULL
    UNION ALL
    SELECT e.EmployeeID, e.EmployeeName, o.Level + 1,
           CAST(o.Path || ' > ' || e.EmployeeName AS VARCHAR(1000))
    FROM Employees AS e
    JOIN OrgChart  AS o ON e.ManagerID = o.EmployeeID
)
SELECT Level, Path FROM OrgChart ORDER BY Path;
```

| Level | Path |
|-------|------|
| 0 | Asha |
| 1 | Asha > Ben |
| 2 | Asha > Ben > Dana |
| 3 | Asha > Ben > Dana > Fatima |
| 2 | Asha > Ben > Eli |
| 1 | Asha > Chen |

(SQL Server: `+` instead of `||`; MySQL: `CONCAT`.)

---

# Column Types: Anchor Decides

The anchor member fixes each column's type. If the recursive member produces a wider value, engines react differently:

| Engine | Anchor `Name` is `VARCHAR(100)`, path grows longer |
|--------|----------------------------------------------------|
| PostgreSQL | Error: *recursive query "orgchart" column 4 has type character varying(100) in non-recursive term but type character varying overall* |
| SQL Server | Error: *Types don't match between the anchor and the recursive part in column "Path"* |
| MySQL | Type taken from the anchor: **truncation** (error "Data too long" in strict mode) |
| Oracle | Error or truncation depending on expression |
| SQLite | No problem (dynamic typing) |

The fix is the same everywhere: **cast the column explicitly in both members** to a type wide enough for the deepest path—`CAST(… AS VARCHAR(1000))`, `NVARCHAR(MAX)` on SQL Server, `CHAR(1000)` on MySQL, `TEXT` on PostgreSQL. The same applies to numeric columns whose type widens (`INT` × `INT` in a quantity product can overflow; cast to `BIGINT` or `DECIMAL`).

---

# Restrictions on the Recursive Member

Because each iteration must be computable from the previous one alone, engines restrict the recursive member:

| Not allowed in the recursive member | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|-------------------------------------|------------|-------|------------|--------|--------|
| Aggregates / `GROUP BY` over the CTE | ❌ | ❌ | ❌ | ❌ | ❌ |
| `DISTINCT` | ✅ allowed | ❌ | ❌ | ❌ | ✅ |
| Window functions | ✅ allowed | ❌ | ✅ allowed | ✅ allowed | ❌ |
| Self-reference more than once | ❌ | ❌ | ❌ | ❌ | ❌ |
| Self-reference in a subquery | ❌ | ❌ | ❌ | ❌ | ❌ |
| Self-reference on the nullable side of an outer join | ❌ | ❌ | ❌ (no outer joins at all) | ❌ | ❌ |
| `ORDER BY` / `LIMIT` | ❌ | `LIMIT` (8.0.19+) | ❌ (`TOP` not allowed) | ❌ | ✅ (controls queue order) |

Allowed entries still apply per iteration only: a window function in the recursive member of PostgreSQL, SQL Server or Oracle sees just the current iteration's rows. When you need aggregation over the whole traversal, do it in the **main query** after the recursion finishes (Section 14.06's subtree totals).

---

# Multiple Anchors and Multiple Starting Points

The anchor can return many rows—the recursion then runs from all of them in parallel:

```sql
-- Every top-level category and its whole subtree, labelled with its root
WITH RECURSIVE Tree (CategoryID, RootID, Level) AS (
    SELECT CategoryID, CategoryID, 0 FROM Categories WHERE ParentCategoryID IS NULL
    UNION ALL
    SELECT c.CategoryID, t.RootID, t.Level + 1
    FROM Categories AS c JOIN Tree AS t ON c.ParentCategoryID = t.CategoryID
)
SELECT RootID, COUNT(*) AS CategoriesInTree FROM Tree GROUP BY RootID;
```

Several anchor queries may be combined with `UNION ALL` before the recursive member (SQL Server requires all anchors to come first).

---

# Walking Down vs Walking Up

The join direction decides the traversal direction:

```sql
-- DOWN: descendants (children of the rows found so far)
JOIN Tree AS t ON c.ParentCategoryID = t.CategoryID

-- UP: ancestors (parent of the rows found so far)
JOIN Tree AS t ON c.CategoryID = t.ParentCategoryID
```

```sql
-- Breadcrumb for category 57: walk up to the root
WITH RECURSIVE Ancestors (CategoryID, CategoryName, ParentCategoryID, Depth) AS (
    SELECT CategoryID, CategoryName, ParentCategoryID, 0 FROM Categories WHERE CategoryID = 57
    UNION ALL
    SELECT c.CategoryID, c.CategoryName, c.ParentCategoryID, a.Depth + 1
    FROM Categories AS c JOIN Ancestors AS a ON c.CategoryID = a.ParentCategoryID
)
SELECT CategoryName FROM Ancestors ORDER BY Depth DESC;   -- root first
```

Walking up follows one parent per step—a single chain—so it is cheap. Walking down can fan out to many children per step.

---

# Visual Representation

```text
            anchor ─────────────▶ {Asha}
                                    │ recursive member (children of working set)
            iteration 1 ────────▶ {Ben, Chen}
                                    │
            iteration 2 ────────▶ {Dana, Eli}
                                    │
            iteration 3 ────────▶ {Fatima}
                                    │
            iteration 4 ────────▶ {}  ── stop
   result = anchor ∪ it1 ∪ it2 ∪ it3
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← the recursive CTE is fully computed (all iterations) before the main query reads it
2. JOIN        ← inside the recursive member: join the working table to the base table
3. WHERE       ← inside the recursive member: termination and depth conditions
4. GROUP BY    ← only in the main query, after recursion
5. HAVING
6. WINDOW      ← in the main query to see all rows (per-iteration only inside the member)
7. SELECT      ← Level + 1, Path || child: computed per iteration
8. DISTINCT
9. ORDER BY    ← order by Path or Level in the main query
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
PostgreSQL:  Recursive Union
               ├─ anchor plan
               └─ recursive plan: WorkTable Scan ⋈ Employees (index on ManagerID)
SQL Server:  Index Spool (lazy) → Concatenation(anchor, recursive: Nested Loops with Table Spool)
MySQL:       "Recursive" derived table materialized iteratively
Each iteration: working table joined to the base table; new rows appended to the result
```

An index on the join column of the recursive member (`Employees.ManagerID` for walking down) turns each iteration into index seeks instead of a full scan per level.

---

# 🏗️ Architecture Insight

Adjacency lists (`ParentID` columns) are simple to write and maintain; recursive CTEs make them easy to query. Alternatives—materialized paths, nested sets, closure tables, PostgreSQL `ltree`, SQL Server `hierarchyid`—make reads faster at the cost of more complex writes (Section 03.09.08). Recursive CTEs make the adjacency list good enough for most hierarchies.

---

# ⚡ Performance Tip

Index the column the recursive member joins on. For walking down, that is the parent column (`ManagerID`, `ParentCategoryID`); for walking up, the primary key already serves.

---

# 🔒 Security Note

Recursion over data that users can edit (org charts, forum reply trees, referral chains) can be made to loop if cycles are possible. Add a depth limit to every production recursive CTE even when the data "should" be acyclic.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Keyword | `WITH RECURSIVE` | `WITH RECURSIVE` | `WITH RECURSIVE` | `WITH` | `WITH` | Either |
| Column list | Optional | Optional | Optional | Optional | Required | Optional |
| `UNION` (distinct) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Type mismatch | Error | Error | Truncates to anchor type | Error | Error | Dynamic |
| Outer join in recursive member | Restricted | Restricted | Restricted | ❌ | Restricted | Restricted |

> **Portability Tip:** Anchor + `UNION ALL` + a recursive member with an inner join, explicit casts in the anchor, and a depth limit in `WHERE` runs on every engine once you adjust the `RECURSIVE` keyword.

---

# Common Mistakes

### Mistake 1

Joining in the wrong direction (walking up when you meant down).

---

### Mistake 2

Leaving path columns uncast so they are truncated or rejected.

---

### Mistake 3

Aggregating inside the recursive member.

---

### Mistake 4

Relying on `UNION` to stop cycles when rows carry a level or path.

---

### Mistake 5

Forgetting that each iteration sees only the previous iteration's rows.

---

# Best Practices

✔ Write the anchor first and check it returns the right starting rows.

✔ Use `UNION ALL` with explicit termination.

✔ Cast level, path and quantity columns in the anchor.

✔ Aggregate in the main query, after recursion.

✔ Add a depth limit and index the recursive join column.

---

# Interview Questions

## Basic

1. What are the two parts of a recursive CTE?
2. When does a recursive CTE stop?
3. Why is `UNION ALL` usually used?

## Intermediate

4. Which rows does the recursive member see in each iteration?
5. How do you walk up a hierarchy instead of down?
6. Why must path columns be cast in the anchor?

## Advanced

7. Why are aggregates not allowed in the recursive member?
8. When does `UNION` stop a traversal over cyclic data, and when does it not?

---

# Hands-on Exercises

## Exercise 1

List every employee under the CEO with their level.

---

## Exercise 2

Build the breadcrumb path for a category, root first.

---

## Exercise 3

Trigger a type-mismatch error on your engine with an uncast path column, then fix it.

---

# Related Topics

- **14.06 — Hierarchies with Recursive CTEs (Trees, Paths and Levels)**
- **14.07 — Graph Traversal and Cycle Detection (SEARCH and CYCLE)**
- **14.11 — Recursion Limits and Safety**
- **03.08.07 — Self-Referencing Relationships**
- **07.08 — SELF JOIN**

---

# Summary

A recursive CTE combines an anchor member (the starting rows) with a recursive member that references the CTE, usually through `UNION ALL`. The engine repeats the recursive member using only the previous iteration's rows and stops when an iteration returns nothing; the result is the union of all iterations. Carry level and path columns to accumulate information, cast them explicitly in the anchor so types match, and respect engine restrictions—no aggregates or repeated self-references in the recursive member. The join direction decides whether you walk down to descendants or up to ancestors, and every production recursion should have a termination guarantee.
