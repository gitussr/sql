---
title: "14.14 - Execution Flow of CTEs"
description: "How engines process CTEs from parse to execution: name resolution, rewriting non-recursive CTEs as derived tables, materialization decisions, the recursive union operator with work tables and spools, cardinality estimation for recursive CTEs, per-iteration join strategies, lazy evaluation of recursive CTEs, and reading CTEs in PostgreSQL, SQL Server, MySQL and Oracle execution plans."
chapter: 14
section: 14.14
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 14.14 Execution Flow of CTEs

---

# Learning Objectives

After completing this section, you will be able to:

- Trace a CTE query from parsing to execution.
- Describe how a recursive CTE is executed with work tables.
- Explain why row estimates for recursive CTEs are often wrong.
- Identify CTE operators in execution plans on each major engine.

---

# The Pipeline

```text
SQL text
   │
   ▼
1. PARSE          WITH clause → list of named definitions; recursion detected by self-reference
   │
   ▼
2. RESOLVE        each table reference: CTE name? (innermost WITH first) → else schema object
   │
   ▼
3. REWRITE        non-recursive CTE → inline as derived table, or mark for materialization
   │              (engine rules and hints, Section 14.13)
   ▼
4. OPTIMIZE       inlined CTEs optimized with the outer query (pushdown, join reordering)
   │              materialized / recursive CTEs optimized as separate sub-plans
   ▼
5. EXECUTE        materialized: fill work table once, scan per reference
                  recursive: iterate anchor → recursive member until empty
```

---

# Non-Recursive CTEs: Inlined

```sql
WITH Big AS (SELECT OrderID, CustomerID FROM Orders WHERE TotalAmount > 500)
SELECT c.CustomerName, COUNT(*)
FROM Big JOIN Customers AS c ON c.CustomerID = Big.CustomerID
WHERE c.Country = 'IN'
GROUP BY c.CustomerName;
```

After inlining, the optimizer sees:

```sql
SELECT c.CustomerName, COUNT(*)
FROM (SELECT OrderID, CustomerID FROM Orders WHERE TotalAmount > 500) AS Big
JOIN Customers AS c ON c.CustomerID = Big.CustomerID
WHERE c.Country = 'IN'
GROUP BY c.CustomerName;
```

…and then flattens the derived table, so the plan is the same as if the query had been written as a plain join. The CTE leaves no trace in the plan.

---

# Recursive CTEs: The Recursive Union

Every engine executes a recursive CTE with the same loop, under different operator names:

```text
                 ┌────────────────────────────────────┐
                 │ Recursive Union                    │
                 │                                    │
   anchor plan ──┼──▶ rows → result + working table   │
                 │           │                        │
                 │           ▼                        │
                 │   recursive plan (reads working    │
                 │   table as the CTE) ──▶ new rows   │
                 │           │                        │
                 │   new rows empty? ── yes ─▶ done   │
                 │           │ no                     │
                 │   result += new; working = new ────┘
                 └────────────────────────────────────┘
```

```text
PostgreSQL:   Recursive Union
                -> anchor subplan
                -> Hash Join / Nested Loop
                     -> WorkTable Scan on subordinates
                     -> Index Scan using ix_employees_managerid on employees
              CTE Scan on subordinates        ← the main query reads the result

SQL Server:   Index Spool (Lazy Spool)         ← stores rows, feeds them back
                -> Concatenation
                     -> anchor branch
                     -> Assert (MAXRECURSION check)
                        -> Nested Loops (Inner Join)
                             -> Table Spool (Lazy Spool)   ← reads the stack of rows
                             -> Index Seek on Employees(ManagerID)

MySQL:        EXPLAIN: select_type "RECURSIVE" / "Recursive"; <derivedN> table materialized
Oracle:       UNION ALL (RECURSIVE WITH) BREADTH FIRST / DEPTH FIRST, RECURSIVE WITH PUMP
```

SQL Server's spool processes rows as a stack (effectively depth-first), PostgreSQL's work table level by level (breadth-first). The **set** of rows is the same; the internal order differs—another reason to `ORDER BY` explicitly.

---

# The Join Inside Each Iteration

Each iteration joins the working table (usually small) to the base table (often large). The plan chosen once is used for every iteration:

```text
working table (few rows) ⋈ Employees
   with an index on ManagerID:   Nested Loop + Index Seek   → cost ∝ rows in working table
   without an index:             Hash Join / scan           → full scan of Employees EVERY iteration
```

A 10-level hierarchy without the index scans the table 10 times. That is the single most common reason a recursive CTE is slow.

---

# Estimating Recursive CTEs

The optimizer must guess how many rows a recursive CTE returns before running it—and it cannot know the depth of the data:

```text
PostgreSQL:  estimate ≈ anchor rows × 10 (a fixed multiplier for the recursive term)
SQL Server:  estimates from the anchor and a guess for the recursive part
Oracle:      estimates per iteration; dynamic statistics may help
```

Wrong estimates affect everything **after** the CTE: a closure CTE estimated at 100 rows that actually returns 2 million leads to nested loops where hash joins were needed. Remedies:

- materialize the recursive result into a temporary table and analyse it before joining further;
- keep the main query after a large recursion simple;
- on SQL Server, `OPTION (RECOMPILE)` or query hints; on PostgreSQL, restructure so the large join happens inside the recursion or after materializing.

---

# Lazy Evaluation

Recursive CTEs are often evaluated lazily—iterations run only as the consumer asks for rows. In PostgreSQL:

```sql
WITH RECURSIVE n (i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n)
SELECT i FROM n LIMIT 5;                -- returns 1..5 and stops, despite no termination condition
```

This works because `LIMIT` stops pulling rows. It is not guaranteed by the standard, it breaks as soon as the plan needs all rows (a sort, an aggregate, a hash join on the CTE), and it fails on SQL Server (MAXRECURSION) and MySQL. Always write a real termination condition.

---

# Visual Representation

```text
   parse ─▶ resolve names ─▶ rewrite ─┬─ non-recursive, inline ─▶ one combined plan
                                      ├─ materialize ─────────▶ subplan → work table → CTE scans
                                      └─ recursive ───────────▶ Recursive Union loop → result table
                                                                       │
                                                           main query reads the result
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← CTE references resolved; inlined subplans or work-table scans
2. JOIN        ← per-iteration join inside recursive members (index the join column)
3. WHERE       ← pushed into inlined CTEs; applied after materialized ones
4. GROUP BY
5. HAVING
6. WINDOW
7. SELECT
8. DISTINCT
9. ORDER BY    ← internal recursion order differs by engine; always sort explicitly
10. LIMIT / FETCH / TOP   ← may stop lazy recursion early — never rely on it
```

---

# How the DBMS Executes This

```text
EXPLAIN checklist for CTE queries:
  □ Was each non-recursive CTE inlined or materialized — and is that what you want?
  □ Were outer filters pushed into the CTE?
  □ Is a CTE's subplan repeated (SQL Server) where once would do?
  □ Does the recursive member use an index seek on the join column?
  □ How far is the recursive CTE's estimate from actual rows?
  □ What join strategies were chosen AFTER the CTE, based on that estimate?
```

---

# 🏗️ Architecture Insight

Execution plans treat CTEs very differently from how they read: a beautifully structured 8-step pipeline may become one flat join (inlined) or a series of work tables (materialized). Judge performance by the plan, not by the shape of the SQL.

---

# ⚡ Performance Tip

Use `EXPLAIN ANALYZE` (PostgreSQL), actual execution plans (SQL Server), `EXPLAIN ANALYZE` (MySQL 8.0.18+) or `DBMS_XPLAN.DISPLAY_CURSOR` with runtime statistics (Oracle) to compare estimated and actual rows for recursive CTEs. The gap usually explains a slow plan.

---

# 🌍 Production Consideration

A recursive query that is fast today can slow down as the hierarchy grows deeper or wider, because both the work per iteration and the estimate error grow. Monitor recursive queries over growing data and re-check their plans periodically.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Recursive operator | Implementation | Recursive Union + WorkTable Scan | Recursive derived table | Spools + Concatenation | RECURSIVE WITH PUMP | Queue-based loop |
| Internal order | Undefined | Breadth-first | Breadth-first | Depth-first (stack) | Breadth-first (default) | Queue; `ORDER BY` in CTE controls it |
| Plan shows CTE | ❌ | CTE / CTE Scan nodes | `<derivedN>` | Inlined operators | `SYS_TEMP` / WITH PUMP | `SCAN` of CTE |
| Lazy evaluation | ❌ | Often | ❌ | ❌ | ❌ | Often |

> **Portability Tip:** The execution model—anchor, loop over a working set, stop on empty—is universal. Plans, internal ordering and estimates are engine-specific.

---

# Common Mistakes

### Mistake 1

Judging a CTE's cost by its SQL shape rather than its plan.

---

### Mistake 2

Missing the index on the recursive join column.

---

### Mistake 3

Trusting the optimizer's row estimate for a recursive CTE.

---

### Mistake 4

Relying on lazy evaluation and `LIMIT` for termination.

---

# Best Practices

✔ Read the plan for every performance-sensitive CTE query.

✔ Index the recursive join column.

✔ Materialize large recursive results before further complex joins.

✔ Compare estimated and actual rows.

✔ Sort explicitly; never rely on internal recursion order.

---

# Interview Questions

## Basic

1. What happens to a non-recursive CTE during optimization?
2. What operator executes a recursive CTE in PostgreSQL?
3. Why should a recursive join column be indexed?

## Intermediate

4. What is a work table?
5. Why are recursive CTE estimates often wrong?
6. Why might a recursive CTE return rows in different orders on different engines?

## Advanced

7. Explain SQL Server's spool-based recursive plan.
8. Why does `LIMIT` sometimes stop an unterminated recursive CTE in PostgreSQL, and why must you not rely on it?

---

# Hands-on Exercises

## Exercise 1

Run `EXPLAIN ANALYZE` on an org-chart query with and without an index on `ManagerID`.

---

## Exercise 2

Compare the estimated and actual row counts of a closure CTE.

---

## Exercise 3

Find the CTE operators in an execution plan on two different engines.

---

# Related Topics

- **14.13 — Materialization and Inlining (MATERIALIZED and NOT MATERIALIZED)**
- **14.15 — CTE Performance and Index Strategy**
- **09.14 — Execution Flow of Subqueries (Unnesting and Decorrelation)**
- **10.12 — Selectivity, Cardinality and Statistics**
- **16.xx — Reading Execution Plans**

---

# Summary

A CTE query is parsed, its names resolved (CTEs before tables), and each non-recursive CTE is either inlined—after which it disappears into a single optimized plan—or materialized into a work table. Recursive CTEs run as a loop: the anchor seeds a working table, the recursive member is joined against it until an iteration is empty, and the union of all iterations is the result. The per-iteration join needs an index, the optimizer's estimate of a recursive result is a guess that can mislead the rest of the plan, and internal ordering and lazy evaluation differ by engine—so read plans, compare estimates with actuals, and write explicit termination and `ORDER BY`.
