---
title: "14.06 - Hierarchies with Recursive CTEs (Trees, Paths and Levels)"
description: "Querying adjacency-list trees with recursive CTEs: descendants and ancestors, levels and depth, indented org charts, materialized path strings and sort keys for depth-first display order, leaf and root detection, subtree aggregates such as headcount and salary cost, bill-of-materials explosion with multiplied quantities, and Oracle CONNECT BY equivalents."
chapter: 14
section: 14.06
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 30 min
lastUpdated: 2026-09-28
---

# 14.06 Hierarchies with Recursive CTEs (Trees, Paths and Levels)

---

# Learning Objectives

After completing this section, you will be able to:

- Find all descendants or ancestors of a node.
- Compute levels and display a tree in depth-first order with indentation.
- Detect leaves and roots.
- Aggregate over subtrees (headcount, cost).
- Explode a bill of materials with multiplied quantities.
- Translate Oracle `CONNECT BY` queries to recursive CTEs.

---

# The Adjacency List

A tree stored as an **adjacency list** has one row per node and a column pointing to the parent (Section 03.08.07):

```text
Categories
CategoryID  CategoryName    ParentCategoryID
1           Electronics     NULL
2           Computers       1
3           Laptops         2
4           Desktops        2
5           Phones          1
6           Accessories     1
7           Laptop Bags     6
8           Chargers        6
```

```text
Electronics (1)
├── Computers (2)
│   ├── Laptops (3)
│   └── Desktops (4)
├── Phones (5)
└── Accessories (6)
    ├── Laptop Bags (7)
    └── Chargers (8)
```

---

# Descendants (Subtree)

```sql
WITH RECURSIVE Subtree (CategoryID, CategoryName, Level) AS (
    SELECT CategoryID, CategoryName, 0
    FROM Categories
    WHERE CategoryID = 2                                   -- Computers
    UNION ALL
    SELECT c.CategoryID, c.CategoryName, s.Level + 1
    FROM Categories AS c
    JOIN Subtree    AS s ON c.ParentCategoryID = s.CategoryID
)
SELECT * FROM Subtree;
-- Computers (0), Laptops (1), Desktops (1)
```

Exclude the starting node with `WHERE Level > 0` in the main query, or start the anchor at its children (`WHERE ParentCategoryID = 2`).

---

# Ancestors (Path to the Root)

```sql
WITH RECURSIVE Ancestors (CategoryID, CategoryName, ParentCategoryID, Distance) AS (
    SELECT CategoryID, CategoryName, ParentCategoryID, 0
    FROM Categories WHERE CategoryID = 7                    -- Laptop Bags
    UNION ALL
    SELECT c.CategoryID, c.CategoryName, c.ParentCategoryID, a.Distance + 1
    FROM Categories AS c
    JOIN Ancestors  AS a ON c.CategoryID = a.ParentCategoryID
)
SELECT CategoryName FROM Ancestors ORDER BY Distance DESC;
-- Electronics, Accessories, Laptop Bags
```

---

# Depth-First Display With a Sort Path

Ordering by `Level` gives breadth-first order (all level 1, then all level 2). A tree display needs **depth-first** order—each node followed by its children. Build a sort key from the path:

```sql
WITH RECURSIVE Tree (CategoryID, CategoryName, Level, SortPath) AS (
    SELECT CategoryID, CategoryName, 0,
           CAST(LPAD(CAST(CategoryID AS VARCHAR(10)), 6, '0') AS VARCHAR(1000))
    FROM Categories
    WHERE ParentCategoryID IS NULL
    UNION ALL
    SELECT c.CategoryID, c.CategoryName, t.Level + 1,
           CAST(t.SortPath || '/' || LPAD(CAST(c.CategoryID AS VARCHAR(10)), 6, '0') AS VARCHAR(1000))
    FROM Categories AS c
    JOIN Tree       AS t ON c.ParentCategoryID = t.CategoryID
)
SELECT REPEAT('    ', Level) || CategoryName AS Category
FROM Tree
ORDER BY SortPath;
```

```text
Electronics
    Computers
        Laptops
        Desktops
    Phones
    Accessories
        Laptop Bags
        Chargers
```

- Pad each ID to a fixed width so `'000010'` sorts after `'000009'` as text.
- To sort siblings by name instead of ID, build the path from padded names or from `ROW_NUMBER() OVER (PARTITION BY ParentCategoryID ORDER BY CategoryName)` computed in a CTE **before** the recursion.
- PostgreSQL can use an **array** path instead of a string: `ARRAY[CategoryID]` in the anchor, `t.SortPath || c.CategoryID` in the recursive member, `ORDER BY SortPath`—arrays compare element by element, no padding needed.
- SQL Server: `REPLICATE`, `RIGHT('000000' + CAST(id AS VARCHAR(10)), 6)` and `+`; MySQL: `CONCAT`, `LPAD`; SQLite: `printf('%06d', id)`.

The standard `SEARCH DEPTH FIRST BY` clause (Section 14.07) generates this ordering column automatically on PostgreSQL 14+ and Oracle.

---

# Leaves and Roots

```sql
-- Roots: no parent
SELECT * FROM Categories WHERE ParentCategoryID IS NULL;

-- Leaves: no children
SELECT * FROM Categories AS c
WHERE NOT EXISTS (SELECT 1 FROM Categories AS k WHERE k.ParentCategoryID = c.CategoryID);
```

Inside a traversal, add an `IsLeaf` flag in the main query with the same `NOT EXISTS`. Oracle `CONNECT BY` provides it directly as `CONNECT_BY_ISLEAF`.

---

# Subtree Aggregates

"How many people report to each manager, directly or indirectly, and what do they cost?" The recursion pairs every manager with every descendant; the main query aggregates:

```sql
WITH RECURSIVE ManagerOf (ManagerID, EmployeeID) AS (
    SELECT ManagerID, EmployeeID FROM Employees WHERE ManagerID IS NOT NULL   -- direct reports
    UNION ALL
    SELECT m.ManagerID, r.EmployeeID                                           -- reports of reports
    FROM ManagerOf AS r
    JOIN Employees AS m ON m.EmployeeID = r.ManagerID
    WHERE m.ManagerID IS NOT NULL
)
SELECT mo.ManagerID,
       COUNT(*)              AS TotalReports,
       SUM(e.Salary)         AS TotalSalaryCost
FROM ManagerOf AS mo
JOIN Employees AS e ON e.EmployeeID = mo.EmployeeID
GROUP BY mo.ManagerID
ORDER BY TotalReports DESC;
```

The CTE builds the **transitive closure**—one row per (ancestor, descendant) pair. Its size is roughly *nodes × average depth*, which is fine for org charts and category trees; for very large, deep trees, consider storing a closure table.

---

# Bill of Materials Explosion

In a bill of materials, a component can appear under several assemblies, and quantities **multiply** down the tree:

```text
Bicycle (100)
├── 2 × Wheel (200)
│   ├── 36 × Spoke (300)
│   └──  1 × Rim (310)
└── 1 × Frame (400)
    └── 4 × Bolt (500)
Wheel also appears in: Spare Wheel Kit
```

```sql
WITH RECURSIVE Explosion (PartID, Quantity, Level) AS (
    SELECT ChildPartID, CAST(Quantity AS BIGINT), 1
    FROM BillOfMaterials
    WHERE ParentPartID = 100                               -- one bicycle
    UNION ALL
    SELECT b.ChildPartID, e.Quantity * b.Quantity, e.Level + 1
    FROM BillOfMaterials AS b
    JOIN Explosion       AS e ON b.ParentPartID = e.PartID
)
SELECT p.PartName,
       SUM(e.Quantity)              AS TotalQuantity,
       SUM(e.Quantity) * p.UnitCost AS TotalCost
FROM Explosion AS e
JOIN Parts     AS p ON p.PartID = e.PartID
GROUP BY p.PartName, p.UnitCost
ORDER BY p.PartName;
```

| PartName | TotalQuantity |
|----------|---------------|
| Bolt | 4 |
| Frame | 1 |
| Rim | 2 |
| Spoke | 72 |
| Wheel | 2 |

`SUM` in the main query combines a component that appears on several branches. For the raw-material cost only, restrict to leaves (parts that are never a `ParentPartID`). Cast the quantity to `BIGINT` or `DECIMAL`: products of quantities grow fast.

---

# Oracle CONNECT BY Equivalents

```sql
-- Oracle hierarchical query
SELECT LEVEL, LPAD(' ', 4 * (LEVEL - 1)) || CategoryName AS Category,
       SYS_CONNECT_BY_PATH(CategoryName, ' > ') AS Path,
       CONNECT_BY_ISLEAF AS IsLeaf
FROM Categories
START WITH ParentCategoryID IS NULL
CONNECT BY PRIOR CategoryID = ParentCategoryID
ORDER SIBLINGS BY CategoryName;
```

| `CONNECT BY` feature | Recursive CTE equivalent |
|----------------------|--------------------------|
| `START WITH` | Anchor `WHERE` |
| `CONNECT BY PRIOR id = parent` | Recursive join `c.parent = t.id` |
| `LEVEL` | `Level` column (+1 per iteration) |
| `SYS_CONNECT_BY_PATH` | Path column built by concatenation |
| `CONNECT_BY_ISLEAF` | `NOT EXISTS` child check |
| `ORDER SIBLINGS BY` | Sort path or `SEARCH DEPTH FIRST BY` |
| `NOCYCLE`, `CONNECT_BY_ISCYCLE` | `CYCLE` clause or path check (14.07) |

---

# Visual Representation

```text
   descendants (walk down)              ancestors (walk up)
          [2]                                 [1]
         /   \        anchor = 2               ▲
       [3]   [4]      join: child.parent       │   join: node.id = t.parent
                            = t.id            [6]
                                               ▲
                                              [7]  anchor = 7
   depth-first order: sort by path 000001/000002/000003 …
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← the recursive CTE produces all (node, level, path) rows first
2. JOIN        ← join the traversal to Employees / Parts for names, salaries, costs
3. WHERE       ← e.g. Level > 0 to drop the starting node
4. GROUP BY    ← subtree aggregates happen here, after recursion
5. HAVING      ← managers with more than 50 reports
6. WINDOW
7. SELECT      ← indentation with REPEAT / LPAD
8. DISTINCT
9. ORDER BY    ← sort path for depth-first display; Level for breadth-first
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
walk down:   each iteration = working table ⋈ Categories ON ParentCategoryID  → needs index on ParentCategoryID
walk up:     each iteration = working table ⋈ Categories ON CategoryID        → primary key seek
closure:     rows = Σ depth(node); aggregation in the main query (hash aggregate)
BOM:         rows = number of root-to-node paths; shared components appear once per path
```

---

# 🏗️ Architecture Insight

For read-heavy hierarchies (category menus rendered on every page), precompute the traversal: store a materialized path, a closure table, or cache the rendered tree, and refresh it when the hierarchy changes. Recursive CTEs are ideal for moderate trees and for maintaining those precomputed structures.

---

# ⚡ Performance Tip

Index `ParentID` columns (`ManagerID`, `ParentCategoryID`, `BillOfMaterials.ParentPartID`). Without the index every iteration scans the whole table; with it each iteration costs one seek per node in the working set.

---

# 🌍 Production Consideration

Hierarchies change: people move teams, categories are re-parented. A move that makes a node its own ancestor creates a cycle that breaks every recursive query. Prevent it at write time—check that the new parent is not in the node's subtree before updating—and keep a depth limit in queries as a second line of defence.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Recursive CTE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `CONNECT BY` | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Array paths | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `SEARCH DEPTH FIRST` | ✅ | ✅ (14+) | ❌ | ❌ | ✅ | ❌ |
| Hierarchy types | ❌ | `ltree` extension | ❌ | `hierarchyid` | ❌ | ❌ |

> **Portability Tip:** Descendant, ancestor, level and string-path queries with recursive CTEs are portable. Array paths, `CONNECT BY` and hierarchy types are engine-specific.

---

# Common Mistakes

### Mistake 1

Ordering a tree display by `Level` and getting breadth-first order.

---

### Mistake 2

Building sort paths from unpadded numbers (`'10'` sorts before `'9'`).

---

### Mistake 3

Adding BOM quantities instead of multiplying them down the tree.

---

### Mistake 4

Forgetting to aggregate components that appear on several branches.

---

### Mistake 5

Overflowing `INT` quantity products in deep BOMs.

---

# Best Practices

✔ Index parent columns.

✔ Use padded string paths or arrays for depth-first order.

✔ Compute subtree aggregates in the main query over a closure CTE.

✔ Multiply quantities in BOM explosions and cast to a wide type.

✔ Prevent cycles when hierarchies are edited.

---

# Interview Questions

## Basic

1. How do you find all subcategories of a category?
2. How do you get a node's ancestors?
3. What is an adjacency list?

## Intermediate

4. How do you display a tree in depth-first order?
5. How do you find leaf nodes?
6. How do you count all direct and indirect reports per manager?

## Advanced

7. How does a bill-of-materials explosion differ from a simple subtree query?
8. Translate `START WITH … CONNECT BY PRIOR` to a recursive CTE.

---

# Hands-on Exercises

## Exercise 1

Print the full category tree with indentation in depth-first order, siblings sorted by name.

---

## Exercise 2

For every manager, compute total reports and total salary cost.

---

## Exercise 3

Explode the BOM for one assembly and compute total raw-material cost from leaf parts only.

---

# Related Topics

- **14.05 — Recursive CTEs (Anchor, Recursive Member and Termination)**
- **14.07 — Graph Traversal and Cycle Detection (SEARCH and CYCLE)**
- **03.09.08 — Hierarchical (Tree) Pattern**
- **03.08.07 — Self-Referencing Relationships**
- **07.08 — SELF JOIN**

---

# Summary

Recursive CTEs make adjacency-list trees easy to query: walk down from a node for its subtree, walk up for its ancestors, and carry a level and a padded path (or an array) to display the tree depth-first with indentation. Subtree aggregates come from a closure CTE of (ancestor, descendant) pairs aggregated in the main query, and bill-of-materials explosions multiply quantities down the tree and sum components across branches. Oracle's `CONNECT BY` features all have CTE equivalents. Index parent columns, cast accumulating columns, and prevent cycles when hierarchies are edited.
