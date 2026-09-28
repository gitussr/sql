---
title: "14.07 - Graph Traversal and Cycle Detection (SEARCH and CYCLE)"
description: "Traversing general graphs with recursive CTEs: directed and undirected edges, all paths between two nodes with cumulative cost, shortest paths, reachability, why cycles make recursion infinite, detecting cycles with path arrays and delimited strings on each engine, depth limits, the standard SEARCH DEPTH/BREADTH FIRST and CYCLE clauses on PostgreSQL 14+ and Oracle, and when a graph database or a dedicated algorithm is the better tool."
chapter: 14
section: 14.07
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 30 min
lastUpdated: 2026-09-28
---

# 14.07 Graph Traversal and Cycle Detection (SEARCH and CYCLE)

---

# Learning Objectives

After completing this section, you will be able to:

- Traverse directed and undirected graphs with recursive CTEs.
- Find paths between two nodes with their total cost, and the shortest one.
- Explain why cycles make naive recursion infinite.
- Detect cycles with a path column on every engine.
- Use the standard `SEARCH` and `CYCLE` clauses where supported.
- Recognise when SQL is the wrong tool for a graph problem.

---

# Trees vs Graphs

```text
TREE                          GRAPH
every node has ≤ 1 parent     a node can be reached by several paths
no cycles                     cycles are possible:  A → B → C → A
recursion ends at the leaves  recursion may never end
```

Routes between cities, social connections, package dependencies, referral chains and money transfers are graphs. The recursive CTE is the same as for trees; the difference is that **termination is no longer automatic**.

```text
Routes (directed)
Mumbai  → Pune       150
Mumbai  → Nashik     170
Pune    → Hyderabad  560
Nashik  → Hyderabad  610
Hyderabad → Kolkata 1500
Pune    → Mumbai     150        ← cycle Mumbai → Pune → Mumbai
```

---

# The Infinite Loop

```sql
-- ❌ Never terminates on the data above (until an engine limit or memory stops it)
WITH RECURSIVE Reach (City) AS (
    SELECT 'Mumbai'
    UNION ALL
    SELECT r.ToCity FROM Routes AS r JOIN Reach AS x ON r.FromCity = x.City
)
SELECT * FROM Reach;
```

Mumbai → Pune → Mumbai → Pune → … Each iteration produces rows, so the loop never stops. SQL Server stops at 100 levels with an error, MySQL at 1000; PostgreSQL, Oracle (without a detected cycle) and SQLite keep going.

For pure **reachability**, `UNION` (where allowed) is enough, because the rows carry no growing column and repeats are discarded:

```sql
-- PostgreSQL, MySQL, SQLite: terminates — a city already reached is not added again
WITH RECURSIVE Reach (City) AS (
    SELECT CAST('Mumbai' AS VARCHAR(50))
    UNION
    SELECT r.ToCity FROM Routes AS r JOIN Reach AS x ON r.FromCity = x.City
)
SELECT * FROM Reach;
```

As soon as you carry a path, a distance or a depth, every row is unique and you need explicit cycle detection.

---

# Cycle Detection With a Path

Carry the list of visited nodes and refuse to revisit one:

```sql
-- PostgreSQL: array path
WITH RECURSIVE Paths (City, Path, TotalKm) AS (
    SELECT CAST('Mumbai' AS VARCHAR(50)), ARRAY[CAST('Mumbai' AS VARCHAR(50))], 0
    UNION ALL
    SELECT r.ToCity, p.Path || r.ToCity, p.TotalKm + r.DistanceKm
    FROM Routes AS r
    JOIN Paths  AS p ON r.FromCity = p.City
    WHERE NOT r.ToCity = ANY(p.Path)                   -- not visited on this path
)
SELECT * FROM Paths WHERE City = 'Kolkata' ORDER BY TotalKm;
```

| City | Path | TotalKm |
|------|------|---------|
| Kolkata | {Mumbai,Pune,Hyderabad,Kolkata} | 2210 |
| Kolkata | {Mumbai,Nashik,Hyderabad,Kolkata} | 2280 |

On engines without arrays, use a **delimited string** with delimiters on both sides, so `'Pune'` does not match inside `'Puned'`:

```sql
-- SQL Server
WITH Paths (City, Path, TotalKm) AS (
    SELECT CAST('Mumbai' AS VARCHAR(50)), CAST('/Mumbai/' AS VARCHAR(4000)), 0
    UNION ALL
    SELECT r.ToCity, CAST(p.Path + r.ToCity + '/' AS VARCHAR(4000)), p.TotalKm + r.DistanceKm
    FROM Routes AS r
    JOIN Paths  AS p ON r.FromCity = p.City
    WHERE CHARINDEX('/' + r.ToCity + '/', p.Path) = 0
)
SELECT * FROM Paths WHERE City = 'Kolkata' ORDER BY TotalKm;

-- MySQL:  WHERE LOCATE(CONCAT('/', r.ToCity, '/'), p.Path) = 0   (path cast to CHAR(4000) in the anchor)
-- SQLite: WHERE instr(p.Path, '/' || r.ToCity || '/') = 0
-- Oracle: WHERE INSTR(p.Path, '/' || r.ToCity || '/') = 0
```

The path check stops each path from looping, but the number of **simple paths** can still grow exponentially in a dense graph. Add a depth or cost limit too:

```sql
WHERE NOT r.ToCity = ANY(p.Path)
  AND cardinality(p.Path) < 8                          -- at most 7 hops
  AND p.TotalKm + r.DistanceKm < 3000                  -- prune expensive paths early
```

---

# Shortest Path

Recursive CTEs enumerate paths; the shortest is then chosen in the main query:

```sql
SELECT Path, TotalKm
FROM Paths
WHERE City = 'Kolkata'
ORDER BY TotalKm
FETCH FIRST 1 ROW ONLY;
```

This is a brute-force search—fine for small graphs (tens to low thousands of edges with a hop limit). It is not Dijkstra's algorithm: it cannot discard a path when a shorter path to the same intermediate node is found later, because iterations cannot see other paths' results. For large graphs use a graph extension (PostgreSQL's pgRouting, SQL Server's `SHORTEST_PATH` in graph `MATCH` queries), or run the algorithm in application code.

---

# Undirected Graphs

Store each edge once and traverse it in both directions with a CTE that unions the two directions:

```sql
WITH RECURSIVE Edges (A, B) AS (
    SELECT PersonID, FriendID FROM Friendships
    UNION ALL
    SELECT FriendID, PersonID FROM Friendships
),
Network (PersonID, Path, Degree) AS (
    SELECT 1, ARRAY[1], 0
    UNION ALL
    SELECT e.B, n.Path || e.B, n.Degree + 1
    FROM Edges AS e JOIN Network AS n ON e.A = n.PersonID
    WHERE NOT e.B = ANY(n.Path) AND n.Degree < 3
)
SELECT PersonID, MIN(Degree) AS DegreesOfSeparation
FROM Network
GROUP BY PersonID;
```

Friends within three degrees of person 1, with the smallest degree for each.

---

# The Standard SEARCH Clause

SQL:1999 defines a `SEARCH` clause that adds an ordering column for depth-first or breadth-first output (PostgreSQL 14+, Oracle 11gR2+):

```sql
-- PostgreSQL 14+
WITH RECURSIVE Tree (CategoryID, CategoryName, ParentCategoryID) AS (
    SELECT CategoryID, CategoryName, ParentCategoryID FROM Categories WHERE ParentCategoryID IS NULL
    UNION ALL
    SELECT c.CategoryID, c.CategoryName, c.ParentCategoryID
    FROM Categories AS c JOIN Tree AS t ON c.ParentCategoryID = t.CategoryID
) SEARCH DEPTH FIRST BY CategoryID SET TreeOrder
SELECT CategoryName FROM Tree ORDER BY TreeOrder;
```

- `SEARCH DEPTH FIRST BY cols SET ordcol` — `ordcol` sorts each node after its parent and before the next sibling (siblings ordered by `cols`).
- `SEARCH BREADTH FIRST BY cols SET ordcol` — `ordcol` sorts level by level.

The column must still be used in the main query's `ORDER BY`.

---

# The Standard CYCLE Clause

```sql
-- PostgreSQL 14+
WITH RECURSIVE Paths (City, TotalKm) AS (
    SELECT CAST('Mumbai' AS VARCHAR(50)), 0
    UNION ALL
    SELECT r.ToCity, p.TotalKm + r.DistanceKm
    FROM Routes AS r JOIN Paths AS p ON r.FromCity = p.City
) CYCLE City SET IsCycle USING VisitedPath
SELECT City, TotalKm, VisitedPath FROM Paths WHERE NOT IsCycle;

-- Oracle
WITH Paths (City, TotalKm) AS (
    SELECT CAST('Mumbai' AS VARCHAR2(50)), 0 FROM dual
    UNION ALL
    SELECT r.ToCity, p.TotalKm + r.DistanceKm
    FROM Routes r JOIN Paths p ON r.FromCity = p.City
) CYCLE City SET IsCycle TO 'Y' DEFAULT 'N'
SELECT City, TotalKm FROM Paths WHERE IsCycle = 'N';
```

The engine tracks the values of the `CYCLE` columns along each path. When a row would repeat a value already on its path, it is emitted once with the cycle mark set, and the recursion does not continue from it. PostgreSQL also exposes the path column (`USING VisitedPath`). Without `CYCLE`, Oracle raises `ORA-32044: cycle detected while executing recursive WITH query` when it encounters a cycle.

---

# Visual Representation

```text
       Mumbai ──150──▶ Pune ──560──▶ Hyderabad ──1500──▶ Kolkata
          │ ▲            │                ▲
          │ └────150─────┘  cycle          │
          └──170──▶ Nashik ──610───────────┘

   path check: Mumbai → Pune → (Mumbai already on path ✘)
                           → Hyderabad → Kolkata ✔  2210 km
               Mumbai → Nashik → Hyderabad → Kolkata ✔  2280 km
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← the recursive CTE enumerates paths (with cycle and depth checks inside)
2. JOIN        ← inside the recursive member: frontier ⋈ edges
3. WHERE       ← inside: not visited, depth limit, cost pruning
4. GROUP BY    ← main query: MIN(Degree) per node
5. HAVING
6. WINDOW      ← main query: ROW_NUMBER() per destination to keep the shortest path
7. SELECT
8. DISTINCT
9. ORDER BY    ← SEARCH ordering column, or total cost
10. LIMIT / FETCH / TOP   ← the single shortest path
```

---

# How the DBMS Executes This

```text
iteration k: all simple paths of length k from the start
             working table = frontier paths; join to Routes on FromCity (index it)
             filter: ToCity not in path, depth < limit, cost < limit
             paths × out-degree → next frontier
cost ~ number of simple paths explored — can grow exponentially with depth
```

---

# 🏗️ Architecture Insight

Relational databases handle graph questions well when the depth is bounded and small (org charts, bills of materials, "friends of friends"). For deep traversals, weighted shortest paths on large graphs, or pattern matching across many hops, use a graph extension (pgRouting, Apache AGE, SQL Server graph tables) or a graph database, and keep SQL for the rest.

---

# ⚡ Performance Tip

Prune as early as possible in the recursive member—depth limits, cost limits, filters on edge types—because every row that survives an iteration multiplies in the next. Index the edge table on the column the recursion joins on (`Routes(FromCity)`).

---

# 🔒 Security Note

Recursive queries over user-generated graphs (followers, referrals, shared folders) are a denial-of-service risk: a user can create a dense or cyclic structure that makes a traversal explode. Always cap depth, and consider a statement timeout for such queries.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `SEARCH` clause | ✅ | ✅ (14+) | ❌ | ❌ | ✅ | ❌ |
| `CYCLE` clause | ✅ | ✅ (14+) | ❌ | ❌ | ✅ | ❌ |
| Array path | ❌ | ✅ | ❌ (JSON array possible) | ❌ | ❌ | ❌ (JSON possible) |
| `UNION` for reachability | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Automatic cycle error | ❌ | ❌ | ❌ (limit 1000) | ❌ (limit 100) | ORA-32044 | ❌ |
| Graph features | SQL/PGQ (2023) | Extensions | ❌ | Graph tables, `MATCH` | SQL/PGQ (23ai) | ❌ |

> **Portability Tip:** A delimited-string path with a `LIKE`/`INSTR`-style check plus a depth limit works on every engine. `SEARCH`, `CYCLE` and arrays are cleaner but limited to PostgreSQL and Oracle.

---

# Common Mistakes

### Mistake 1

Traversing a graph with a tree query and no cycle detection.

---

### Mistake 2

Checking visited nodes with an undelimited string (`'%Pune%'` matches `'Puned'`).

---

### Mistake 3

Relying on `UNION` to stop cycles while carrying a path or cost.

---

### Mistake 4

Enumerating all paths in a dense graph without depth or cost limits.

---

### Mistake 5

Treating the enumerate-then-pick approach as an efficient shortest-path algorithm.

---

# Best Practices

✔ Carry a path and exclude visited nodes.

✔ Delimit string paths on both sides.

✔ Combine cycle checks with depth and cost limits.

✔ Use `CYCLE` and `SEARCH` on PostgreSQL 14+ and Oracle.

✔ Move large weighted graph problems to graph tools.

---

# Interview Questions

## Basic

1. What is the difference between traversing a tree and a graph?
2. Why can a recursive CTE loop forever?
3. How do you stop revisiting a node?

## Intermediate

4. When is `UNION` enough to stop recursion?
5. How do you find all paths from A to B with total distance?
6. What does the `CYCLE` clause do?

## Advanced

7. Why is enumerating paths not the same as Dijkstra's algorithm?
8. How would you traverse an undirected graph stored with one row per edge?

---

# Hands-on Exercises

## Exercise 1

List every city reachable from Mumbai.

---

## Exercise 2

Find all paths from Mumbai to Kolkata with at most five hops, shortest first, on two engines.

---

## Exercise 3

On PostgreSQL 14+, rewrite Exercise 2 with the `CYCLE` clause.

---

# Related Topics

- **14.05 — Recursive CTEs (Anchor, Recursive Member and Termination)**
- **14.06 — Hierarchies with Recursive CTEs (Trees, Paths and Levels)**
- **14.11 — Recursion Limits and Safety**
- **03.08.07 — Self-Referencing Relationships**

---

# Summary

Graphs differ from trees in one way that matters: cycles, which make naive recursion endless. Plain reachability can use `UNION` where allowed; anything carrying a path, cost or depth needs explicit cycle detection—an array path on PostgreSQL, a delimited string elsewhere—combined with depth and cost limits, because the number of simple paths can grow exponentially. PostgreSQL 14+ and Oracle support the standard `SEARCH` clause for depth- or breadth-first ordering and the `CYCLE` clause for automatic cycle marking. Recursive CTEs suit bounded graph questions; large weighted shortest-path problems belong in graph extensions or application code.
