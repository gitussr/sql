---
title: "14.11 - Recursion Limits and Safety"
description: "Engine recursion limits and how to change them: SQL Server MAXRECURSION (default 100, error 530), MySQL cte_max_recursion_depth (default 1000) and max_execution_time, PostgreSQL and SQLite with no limit, Oracle cycle detection; defensive depth columns versus engine limits, statement timeouts, memory and temporary storage growth, runaway recursion symptoms, and preventing cycles in data with constraints and triggers."
chapter: 14
section: 14.11
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 20 min
lastUpdated: 2026-09-28
---

# 14.11 Recursion Limits and Safety

---

# Learning Objectives

After completing this section, you will be able to:

- State the default recursion limit on each major engine.
- Raise or lower the limit for a single query or session.
- Explain why a depth column is better than relying on engine limits.
- Protect recursive queries with timeouts.
- Prevent cycles in hierarchical data at write time.

---

# Engine Limits

| Engine | Default limit | Behaviour at the limit | How to change |
|--------|---------------|------------------------|---------------|
| SQL Server | 100 levels | Error 530, statement aborted | `OPTION (MAXRECURSION n)`, 0–32767; 0 = unlimited |
| MySQL | 1000 levels | Error 3636, statement aborted | `SET SESSION cte_max_recursion_depth = n` or `/*+ SET_VAR(cte_max_recursion_depth = n) */` |
| PostgreSQL | None | Runs until done, out of memory/disk, or cancelled | `statement_timeout` |
| Oracle | None | ORA-32044 if a cycle is detected; otherwise runs | `CYCLE` clause, resource limits |
| SQLite | None | Runs until done or interrupted | `LIMIT` in the CTE, application interrupt |

"Level" means iteration: a limit of 100 allows the anchor plus 100 recursive iterations.

---

# SQL Server: MAXRECURSION

```sql
WITH Days (Day) AS (
    SELECT CAST('2026-01-01' AS date)
    UNION ALL
    SELECT DATEADD(day, 1, Day) FROM Days WHERE Day < '2026-12-31'
)
SELECT Day FROM Days
OPTION (MAXRECURSION 400);                 -- on the OUTER statement, not inside the CTE
```

Without the hint:

```text
Msg 530, Level 16, State 1
The statement terminated. The maximum recursion 100 has been exhausted before statement completion.
```

- The hint applies to the whole statement; it cannot be set per CTE, and it is not allowed inside a view definition (put it on the query that uses the view).
- `MAXRECURSION 0` removes the limit. Use it only with a termination guarantee in the query itself.

---

# MySQL: cte_max_recursion_depth

```sql
SET SESSION cte_max_recursion_depth = 5000;

-- or for one statement
SELECT /*+ SET_VAR(cte_max_recursion_depth = 5000) */ n
FROM (
    WITH RECURSIVE Numbers (n) AS (
        SELECT 1 UNION ALL SELECT n + 1 FROM Numbers WHERE n < 5000
    )
    SELECT n FROM Numbers
) AS x;
```

```text
ERROR 3636 (HY000): Recursive query aborted after 1001 iterations.
Try increasing @@cte_max_recursion_depth to a larger value.
```

MySQL also stops recursion at `max_execution_time` (milliseconds, for `SELECT`) if it is set, and 8.0.19+ accepts a `LIMIT` in the recursive CTE as a row cap.

---

# Engines Without Limits

PostgreSQL, SQLite and (for acyclic data) Oracle will keep iterating as long as the recursive member produces rows. A runaway query shows up as:

- a statement that never finishes, with CPU busy;
- growing temporary files (PostgreSQL work tables spill to disk once they exceed `work_mem`);
- memory pressure on the server.

Protect them with a statement timeout:

```sql
-- PostgreSQL: for this session or transaction
SET statement_timeout = '30s';
SET LOCAL statement_timeout = '30s';       -- inside a transaction only
```

In SQLite, the application sets a progress handler or calls `sqlite3_interrupt`.

---

# Depth Columns vs Engine Limits

Engine limits are a **safety net**, not a design. They abort the whole statement with an error, discarding the result—and they are either too high to prevent damage (unlimited) or too low for legitimate data (100).

A depth column in the query stops the recursion **gracefully**, returning everything up to the depth:

```sql
WITH RECURSIVE OrgChart (EmployeeID, ManagerID, Depth) AS (
    SELECT EmployeeID, ManagerID, 0 FROM Employees WHERE ManagerID IS NULL
    UNION ALL
    SELECT e.EmployeeID, e.ManagerID, o.Depth + 1
    FROM Employees AS e
    JOIN OrgChart  AS o ON e.ManagerID = o.EmployeeID
    WHERE o.Depth < 25                                  -- graceful stop
)
SELECT * FROM OrgChart;
```

To **detect** that the limit was hit (data deeper than expected, or a cycle), check the maximum depth in the result:

```sql
SELECT CASE WHEN MAX(Depth) >= 25 THEN 'Depth limit reached — check for cycles' ELSE 'OK' END
FROM OrgChart;
```

Combine: a depth column sized for real data, plus the engine limit (or timeout) set somewhat higher as a backstop.

---

# Preventing Cycles in the Data

The best protection is data that cannot contain cycles.

```sql
-- 1. A node cannot be its own parent
ALTER TABLE Categories
    ADD CONSTRAINT ck_not_own_parent CHECK (ParentCategoryID <> CategoryID);
```

Longer cycles (A → B → C → A) cannot be expressed as a `CHECK` constraint. Check them when the parent changes:

```sql
-- 2. Before setting Category :id's parent to :newParent, reject if :id is an ancestor of :newParent
WITH RECURSIVE Ancestors (CategoryID, ParentCategoryID) AS (
    SELECT CategoryID, ParentCategoryID FROM Categories WHERE CategoryID = :newParent
    UNION ALL
    SELECT c.CategoryID, c.ParentCategoryID
    FROM Categories AS c JOIN Ancestors AS a ON c.CategoryID = a.ParentCategoryID
)
SELECT EXISTS (SELECT 1 FROM Ancestors WHERE CategoryID = :id) AS WouldCreateCycle;
```

Run the check in a trigger or in the application's update path, inside the same transaction as the update (with appropriate locking, so two concurrent moves cannot together create a cycle).

---

# Visual Representation

```text
   iterations ──────────────────────────────────────────────────────────────▶
   0   1   2   3 … 25                          100            1000         ∞
   │           │                                │              │            │
   │     depth column stops here           SQL Server      MySQL       PostgreSQL,
   │     (graceful, partial result)        error 530       error 3636  SQLite: timeout
   anchor                                                                or resources
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← recursion runs to completion (or to a limit) before the main query continues
2. JOIN
3. WHERE       ← inside the recursive member: Depth < n stops gracefully
4. GROUP BY
5. HAVING
6. WINDOW
7. SELECT
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP   ← an outer LIMIT does not stop recursion on most engines
```

---

# How the DBMS Executes This

```text
each iteration:
  new rows = recursive member(working table)
  SQL Server: iteration counter > MAXRECURSION → abort with Msg 530
  MySQL:      iteration counter > cte_max_recursion_depth → abort with 3636
  PostgreSQL: no counter; work table grows (memory → temp files); statement_timeout cancels
depth column: rows failing Depth < n are not produced → next iteration empty → normal stop
```

An outer `LIMIT` can stop a PostgreSQL recursive CTE early in some plans (the recursion is evaluated lazily as rows are requested), but this is an implementation detail—never rely on it for termination.

---

# 🏗️ Architecture Insight

Treat recursion limits like any other resource limit: set them per workload. Interactive queries get short timeouts and small depths; batch jobs that legitimately explode large bills of materials get higher limits, run at quiet times, with monitoring.

---

# ⚡ Performance Tip

Deep recursion with wide rows (long path strings, arrays) consumes memory per level. Carry only the columns the recursion needs, and join to get names and details in the main query afterwards.

---

# 🔒 Security Note

Never expose `MAXRECURSION 0` or unlimited recursion to queries over user-editable data. A single malicious or accidental cycle can tie up a server core and fill temporary storage.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Default limit | ❌ | None | 1000 | 100 | None | None |
| Per-query setting | ❌ | `SET LOCAL statement_timeout` | `SET_VAR` hint | `OPTION (MAXRECURSION)` | — | `LIMIT` in CTE |
| Cycle detection | `CYCLE` | `CYCLE` (14+) | ❌ | ❌ | `CYCLE`, ORA-32044 | ❌ |
| Statement timeout | ❌ | `statement_timeout` | `max_execution_time` | Client timeout / Resource Governor | Resource Manager | Progress handler |

> **Portability Tip:** A depth column in the recursive member is the one protection that works identically everywhere and returns a result instead of an error.

---

# Common Mistakes

### Mistake 1

Placing `OPTION (MAXRECURSION)` inside the CTE instead of on the outer statement.

---

### Mistake 2

Using `MAXRECURSION 0` without a termination condition.

---

### Mistake 3

Relying on an outer `LIMIT` to stop recursion.

---

### Mistake 4

Assuming PostgreSQL will stop a runaway recursion on its own.

---

### Mistake 5

Checking for cycles only in queries, never at write time.

---

# Best Practices

✔ Add a depth column with a realistic limit to every recursive CTE.

✔ Keep engine limits and timeouts as a backstop.

✔ Detect when the depth limit is reached.

✔ Prevent cycles when hierarchies are updated.

✔ Carry minimal columns through deep recursion.

---

# Interview Questions

## Basic

1. What is SQL Server's default recursion limit?
2. How do you raise it?
3. What is MySQL's default limit?

## Intermediate

4. Why is a depth column better than an engine limit?
5. How do you protect a PostgreSQL recursive query?
6. Where does the `MAXRECURSION` hint go?

## Advanced

7. How would you prevent cycles in a category tree when categories are moved?
8. Why doesn't an outer `LIMIT` reliably stop recursion?

---

# Hands-on Exercises

## Exercise 1

Generate 500 numbers on SQL Server and MySQL, adjusting the limits.

---

## Exercise 2

Create a cycle in a test hierarchy and observe each engine's behaviour with and without a depth column.

---

## Exercise 3

Write a cycle-prevention check for moving a category to a new parent.

---

# Related Topics

- **14.05 — Recursive CTEs (Anchor, Recursive Member and Termination)**
- **14.07 — Graph Traversal and Cycle Detection (SEARCH and CYCLE)**
- **14.08 — Generating Series and Sequences with Recursive CTEs**
- **03.06 — SQL Constraints**

---

# Summary

SQL Server stops recursion after 100 iterations and MySQL after 1000, both with errors; PostgreSQL, SQLite and (for acyclic data) Oracle have no limit. Raise limits with `OPTION (MAXRECURSION n)` or `cte_max_recursion_depth`, and protect unlimited engines with statement timeouts. Engine limits are only a backstop: a depth column in the recursive member stops gracefully and returns a result, and checking the maximum depth reveals cycles or unexpectedly deep data. The strongest protection is preventing cycles when hierarchies are edited.
