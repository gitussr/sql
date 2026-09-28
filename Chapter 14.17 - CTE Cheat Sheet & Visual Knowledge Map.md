---
title: "14.17 - CTE Cheat Sheet & Visual Knowledge Map"
description: "A one-stop reference for Chapter 14: WITH syntax and scope, chained CTEs, choosing between CTEs, subqueries, views and temporary tables, recursive CTE templates for hierarchies, graphs and series, cycle detection and SEARCH/CYCLE, recursion limits, data-modifying CTEs, common patterns, materialization rules and hints on PostgreSQL, MySQL, SQL Server, Oracle and SQLite, performance rules, and a knowledge map linking CTEs to earlier and later chapters."
chapter: 14
section: 14.17
category: Data Query Language (DQL)
difficulty: Beginner → Advanced
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 14.17 CTE Cheat Sheet & Visual Knowledge Map

---

# Learning Objectives

After completing this section, you will be able to:

- Recall CTE syntax, scope and engine differences at a glance.
- Reuse templates for recursive traversals, series and common patterns.
- Apply the materialization, recursion-limit and performance rules quickly.
- See how CTEs connect to the rest of the handbook.

---

# Syntax

```text
WITH name [(col, …)] AS ( query )                       one CTE
     [, name2 AS ( query using name ) …]                  more CTEs — ONE WITH, commas
SELECT … FROM name …;                                    main statement (the only scope)

WITH RECURSIVE name (col, …) AS (                         PostgreSQL, MySQL (required) · SQLite (optional)
    anchor                                                SQL Server, Oracle: plain WITH
    UNION ALL
    recursive member referencing name ONCE, with a stop condition
)
SELECT … FROM name;

name AS MATERIALIZED ( … )  /  AS NOT MATERIALIZED ( … )  PostgreSQL 12+, SQLite 3.35+
OPTION (MAXRECURSION n)                                   SQL Server, on the outer statement
SEARCH DEPTH|BREADTH FIRST BY col SET ord                 PostgreSQL 14+, Oracle
CYCLE col SET is_cycle [USING path]                       PostgreSQL 14+ (Oracle: TO 'Y' DEFAULT 'N')
```

---

# Scope and Placement

| Rule | Detail |
|------|--------|
| Lifetime | One statement |
| Visible to | Main statement, later CTEs, their subqueries |
| Name clash | CTE shadows a table — never reuse table names |
| `ORDER BY` inside | Only meaningful with `LIMIT`/`TOP`; order in the outer query |
| SQL Server | Previous statement must end with `;`; no `WITH` inside subqueries |
| Oracle | No `WITH` before `UPDATE`/`DELETE`; `INSERT INTO t WITH … SELECT` |
| MySQL | `WITH` before `UPDATE`/`DELETE`; `INSERT INTO t WITH … SELECT` |

---

# Choosing a Tool

```text
walk a tree / graph, generate rows iteratively      → recursive CTE
structure one query into named steps                → CTE
per-outer-row logic returning several rows          → LATERAL / CROSS APPLY
same logic in many queries, or access control       → view
expensive summary, read often, changes rarely       → materialized view
expensive intermediate reused / needs index / stats → temporary table
```

---

# Recursive Templates

```text
DESCENDANTS   anchor: WHERE ID = :root
              recursive: JOIN cte ON child.ParentID = cte.ID  WHERE cte.Level < :max

ANCESTORS     anchor: WHERE ID = :node
              recursive: JOIN cte ON node.ID = cte.ParentID

TREE DISPLAY  carry Level and zero-padded SortPath ('000001/000006') or an array (PostgreSQL)
              ORDER BY SortPath · indent with REPEAT/REPLICATE/LPAD · or SEARCH DEPTH FIRST

CLOSURE       anchor: (ParentID, ID) direct pairs
              recursive: (grandparent, ID) … → GROUP BY ancestor in the main query

BOM           carry CAST(Quantity AS BIGINT); multiply per level; SUM per part in the main query

GRAPH PATHS   carry Path; WHERE NOT next = ANY(path)  | CHARINDEX/INSTR('/' + next + '/', path) = 0
              + depth and cost limits · pick shortest in the main query · or CYCLE clause

SERIES        anchor: start · recursive: next value WHERE value < end (stop INSIDE the member)

CARRY         number rows with ROW_NUMBER in a CTE → recursive join on rn = prev.rn + 1
              (floored balances, compound interest, amortisation)
```

---

# Recursion Rules

```text
Each iteration sees ONLY the previous iteration's rows (working table)
Stops when an iteration returns no rows
UNION ALL: portable, cheap · UNION: dedups whole rows (not SQL Server/Oracle), useless once rows carry level/path
Recursive member: no aggregates/GROUP BY, one self-reference, not in a subquery, not on an outer join's nullable side
Types come from the anchor → CAST paths and quantities
Limits: SQL Server 100 (MAXRECURSION, 0 = none) · MySQL 1000 (cte_max_recursion_depth) · PostgreSQL/SQLite none · Oracle ORA-32044 on cycles
Always: depth column in the recursive member; cycle checks on graphs; prevent cycles on write
```

---

# Data-Modifying CTEs

```text
Portable        WITH k AS (SELECT key …) DELETE/UPDATE t WHERE key IN (SELECT key FROM k)   (Oracle: CTE inside the subquery)
SQL Server      WITH r AS (SELECT *, ROW_NUMBER() OVER (…) rn FROM t) DELETE FROM r WHERE rn > 1
PostgreSQL      WITH moved AS (DELETE FROM a WHERE … RETURNING *) INSERT INTO b SELECT * FROM moved
                one snapshot · main query sees changes only via RETURNING · all sub-statements run
Safety          preview as SELECT · transaction · unique tiebreakers · batch large changes
```

---

# Patterns

| Need | Steps |
|------|-------|
| Duplicates | Normalize → `GROUP BY … HAVING COUNT(*) > 1` |
| Remove duplicates | `ROW_NUMBER() OVER (PARTITION BY key ORDER BY keep_rule, unique)` → delete `rn > 1` |
| Latest / top-N per group | Rank → filter `rn = 1` / `rank <= N` |
| Running balance | Signed amount → `SUM() OVER (… ROWS UNBOUNDED PRECEDING)` |
| Floored balance | Numbered rows → recursive carry with `GREATEST(prev + x, 0)` |
| Islands | `date − ROW_NUMBER()` key → `GROUP BY` key |
| Sessions | `LAG` gap flag → running `SUM` of flags → `GROUP BY` |
| Snapshot diff | Two filtered CTEs → `FULL OUTER JOIN` → classify |
| Aggregate → window | Group CTE → ranks, shares, `LAG` |
| Window → aggregate | `LAG`/`ROW_NUMBER` CTE → `GROUP BY` |

---

# Materialization

| Engine | Referenced once | Referenced 2+ times | Control |
|--------|-----------------|---------------------|---------|
| PostgreSQL ≤ 11 | Materialized | Materialized | — |
| PostgreSQL 12+ | Inlined | Materialized | `MATERIALIZED` / `NOT MATERIALIZED` |
| MySQL | Merged if possible | Materialized once | `NO_MERGE` / `MERGE` hints |
| SQL Server | Inlined | Inlined **each time** | Temporary table |
| Oracle | Usually inlined | Usually materialized | `/*+ MATERIALIZE */` / `/*+ INLINE */` |
| SQLite | Flattened | Materialized | `MATERIALIZED` / `NOT MATERIALIZED` (3.35+) |

```text
inline      → pushdown, base-table indexes; recomputed per reference
materialize → computed once; fence: outer filters not pushed in; work table without indexes
```

---

# Performance Rules

```text
Filter early, inside the CTE, with sargable predicates
Don't compute an expensive CTE per reference (SQL Server) → temp table, LAG, SUM() OVER
Index the recursive join column (parent column when walking down); cover read columns
Carry keys, level, path only; join details after recursion
Prune and limit depth inside the recursive member
Recursive estimates are guesses → materialize big results before further joins
Precompute hot hierarchies: closure table, materialized path, ltree, hierarchyid
Check the plan: inline vs materialize, pushdown, repeated subplans, index seeks, estimates
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← CTEs read here: inlined subplans, work-table scans, recursive results
2. JOIN        ← recursive member joins working table to base table (index it)
3. WHERE       ← stop conditions and pruning inside recursive members; early filters inside CTEs
4. GROUP BY    ← aggregate after recursion; aggregate branches before merging
5. HAVING
6. WINDOW      ← rank for dedup/top-N; LAG with enough history; unique tiebreakers
7. SELECT      ← RETURNING output feeds the next step (PostgreSQL)
8. DISTINCT
9. ORDER BY    ← outermost only; SortPath or SEARCH column for trees
10. LIMIT / FETCH / TOP   ← never the termination mechanism for recursion
```

---

# How the DBMS Executes This

```text
WITH RECURSIVE Sub AS (anchor UNION ALL recursive) SELECT … FROM Sub JOIN Employees …

   Recursive Union
     ├─ anchor: Index Seek Employees (EmployeeID = 1)
     └─ loop:   WorkTable Scan ⋈ Index Seek Employees (ManagerID = work.EmployeeID)
                until no new rows
   CTE Scan Sub  ──▶ Join Employees for details ──▶ Sort for ORDER BY
```

---

# Visual Knowledge Map

```text
                          COMMON TABLE EXPRESSIONS (Chapter 14)
                  named · statement-scoped · optionally recursive
                                         │
   ┌─────────────┬──────────────┬────────┴───────┬────────────────┬────────────────┐
   ▼             ▼              ▼                ▼                ▼                ▼
 SYNTAX       PIPELINES      ALTERNATIVES     RECURSION        ANALYSIS          DML
 14.02        14.03          14.04            14.05–14.08      14.09, 14.12      14.10
 WITH, scope, chaining,      subquery, view,  anchor, member,  aggregate ↔       keys → DML,
 column lists branch/merge,  temp table,      trees, graphs,   window, dedup,    DELETE FROM cte,
 placement    debugging      LATERAL          series, cycles   islands, sessions RETURNING
   └─────────────┴──────────────┴────────┬───────┴────────────────┴────────────────┘
                                         ▼
          LIMITS 14.11 ── MAXRECURSION · cte_max_recursion_depth · depth columns · cycle prevention
                                         ▼
          MATERIALIZATION 14.13 ── inline vs materialize · MATERIALIZED hints · per-engine rules
                                         ▼
          EXECUTION 14.14 ── rewrite · Recursive Union · work tables · estimates
                                         ▼
          PERFORMANCE 14.15 ── filter early · no recompute · index parent columns · precompute
                                         ▼
          MISTAKES 14.16 ── scope · recursion · correctness · performance · portability

Connections to other chapters
  03.08.07 Self-referencing relationships  ──→ 14.05, 14.06 (adjacency lists)
  03.09.08 Hierarchical pattern            ──→ 14.06, 14.15 (closure tables, paths)
  07.08 SELF JOIN                          ──→ 14.05 (one level vs any depth)
  08.11 Fan-out and pre-aggregation        ──→ 14.03 (aggregate branches before merging)
  09.08 Derived tables                     ──→ 14.04 (CTE = named derived table)
  09.10 LATERAL and CROSS APPLY            ──→ 14.04 (per-row logic)
  11.xx Window functions                   ──→ 14.09, 14.12 (multi-step analysis, patterns)
  13.11 Date series and calendar tables    ──→ 14.08 (recursive generators)
  14.xx Common Table Expressions           ──→ 15.xx Query Optimization, 16.xx Reading Execution Plans
```

---

# One-Page Summary

```text
CONCEPTS
  A CTE is a named result set for one statement; non-recursive CTEs structure queries,
  recursive CTEs add iteration: anchor + self-referencing member until no new rows
  CTEs are not caches: engines inline or materialize them by their own rules

RULES
  One WITH, descriptive names, final ORDER BY outside, never reuse table names
  Recursive: UNION ALL, stop inside the member, depth limit, cycle checks on graphs, cast accumulators
  Aggregate after recursion and before merging branches; unique tiebreakers in window orderings
  CTE DML: keys-then-DML is portable; DELETE FROM cte (SQL Server); RETURNING chains (PostgreSQL)
  Filter early; don't recompute expensive CTEs; index parent columns; carry little; read the plan
```

---

# 🏗️ Architecture Insight

The chapter reduces to one idea: *name the steps, bound the recursion*. Named steps make complex SQL readable, testable and reviewable; bounded recursion—termination, depth limits, cycle checks and acyclic data—makes the most powerful CTE feature safe to use in production.

---

# ⚡ Performance Tip

If you remember one performance rule from this chapter: a CTE is optimized, not cached. Check whether it was inlined or materialized, whether filters reached it, and—for recursion—whether each iteration uses an index.

---

# 💡 Did You Know?

Recursive queries were standardised in SQL:1999, but it took almost two decades for all five engines in this handbook to support them: SQL Server 2005, PostgreSQL 8.4 (2009), Oracle 11g Release 2 (2009, after decades of `CONNECT BY`), SQLite 3.8.3 (2014) and MySQL 8.0 (2018). Code that must still run on MySQL 5.7 has to emulate hierarchies with application loops, stored procedures or precomputed paths.

---

# Related Topics

- **14.01 — Introduction to Common Table Expressions**
- **14.05 — Recursive CTEs (Anchor, Recursive Member and Termination)**
- **14.13 — Materialization and Inlining (MATERIALIZED and NOT MATERIALIZED)**
- **14.16 — Common CTE Mistakes & Best Practices**
- **13.17 — Date and Time Cheat Sheet & Visual Knowledge Map**
- **11.17 — Window Function Cheat Sheet & Visual Knowledge Map**
- **09.17 — Subquery Cheat Sheet & Visual Knowledge Map**
- **15.xx — Query Optimization**

---

# Summary

This section condenses Chapter 14 into a single reference: `WITH` syntax, scope and placement rules; chained pipelines; the choice between CTEs, subqueries, views, materialized views and temporary tables; recursive templates for descendants, ancestors, tree display, closures, bills of materials, graph paths, series and carried values; recursion rules and limits; data-modifying CTEs on each engine; the common patterns; materialization defaults and hints across PostgreSQL, MySQL, SQL Server, Oracle and SQLite; and the performance rules. One idea carries the whole chapter—name the steps, bound the recursion—and the knowledge map shows how CTEs build on relationships, joins, aggregation, subqueries, window functions and date series from earlier chapters.
