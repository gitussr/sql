---
title: "16.07 - Reading Oracle and SQLite Plans (DBMS_XPLAN and EXPLAIN QUERY PLAN)"
description: "How to read Oracle and SQLite execution plans: DBMS_XPLAN table columns (Id, Operation, Name, Rows, Cost, Starts, E-Rows, A-Rows, A-Time, Buffers, memory), the Predicate Information section with access and filter predicates, notes on adaptive plans, dynamic sampling and baselines, Real-Time SQL Monitoring, and SQLite's EXPLAIN QUERY PLAN tree with SCAN, SEARCH, covering indexes, temporary B-trees and automatic indexes."
chapter: 16
section: 16.07
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 25 min
lastUpdated: 2026-10-01
---

# 16.07 Reading Oracle and SQLite Plans (DBMS_XPLAN and EXPLAIN QUERY PLAN)

---

# Learning Objectives

After completing this section, you will be able to:

- Read Oracle's `DBMS_XPLAN` output, including `ALLSTATS LAST` columns.
- Use the Predicate Information section to separate access from filter predicates.
- Interpret notes about adaptive plans, dynamic sampling and baselines.
- Read SQLite's `EXPLAIN QUERY PLAN` tree.
- Map both engines' operator names to the general concepts.

---

# Oracle: The DBMS_XPLAN Table

```sql
SELECT /*+ GATHER_PLAN_STATISTICS */ o.OrderID, o.TotalAmount, c.CustomerName
FROM Orders o JOIN Customers c ON c.CustomerID = o.CustomerID
WHERE c.Country = 'NZ' AND o.OrderDate >= DATE '2026-09-01';

SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(NULL, NULL, 'ALLSTATS LAST'));
```

```text
SQL_ID  7h35uxf5uhmm1, child number 0
Plan hash value: 2817325571

-----------------------------------------------------------------------------------------------------------
| Id  | Operation                             | Name                    | Starts | E-Rows | A-Rows | Buffers |
-----------------------------------------------------------------------------------------------------------
|   0 | SELECT STATEMENT                      |                         |      1 |        |    214 |    1302 |
|   1 |  NESTED LOOPS                         |                         |      1 |     96 |    214 |    1302 |
|   2 |   NESTED LOOPS                        |                         |      1 |     96 |    214 |    1088 |
|   3 |    TABLE ACCESS BY INDEX ROWID BATCHED| CUSTOMERS               |      1 |    210 |    198 |     206 |
|*  4 |     INDEX RANGE SCAN                  | IX_CUSTOMERS_COUNTRY    |      1 |    210 |    198 |       4 |
|*  5 |    INDEX RANGE SCAN                   | IX_ORDERS_CUSTOMER_DATE |    198 |      1 |    214 |     882 |
|   6 |   TABLE ACCESS BY INDEX ROWID         | ORDERS                  |    214 |      1 |    214 |     214 |
-----------------------------------------------------------------------------------------------------------

Predicate Information (identified by operation id):
---------------------------------------------------
   4 - access("C"."COUNTRY"='NZ')
   5 - access("O"."CUSTOMERID"="C"."CUSTOMERID" AND "O"."ORDERDATE">=TO_DATE(' 2026-09-01 00:00:00', 'syyyy-mm-dd hh24:mi:ss'))
```

(`A-Time`, `Reads` and memory columns trimmed for width.)

| Column | Meaning |
|--------|---------|
| `Id` | Operation number; `0` is the root; `*` = has a predicate in the section below |
| `Operation` | Operator; **indentation** shows the tree |
| `Name` | Table or index |
| `Rows` / `E-Rows` | Estimated rows **per start** |
| `Starts` | Times the operation executed |
| `A-Rows` | Actual rows, **total across all starts** |
| `A-Time` | Actual elapsed time, inclusive of children |
| `Buffers` | Logical reads (consistent + current gets), inclusive |
| `Reads` / `Writes` | Physical reads / writes (temp writes = spills) |
| `OMem` / `1Mem` / `Used-Mem` | Optimal (in-memory) / one-pass memory estimate / memory used (`(0)` = optimal, `(1)` = one-pass, more = multi-pass) |
| `Cost (%CPU)` | Estimated cost (shown with `TYPICAL`/`ALL` formats) |

To compare estimate and actual: `E-Rows × Starts` vs `A-Rows`. At Id 5: 1 × 198 = 198 estimated, 214 actual—fine.

---

# Reading Order in Oracle

```text
Id 0 SELECT STATEMENT                       root
 Id 1 NESTED LOOPS                          children of 1: Id 2 and Id 6
  Id 2 NESTED LOOPS                         children of 2: Id 3 and Id 5 (first child runs first)
   Id 3 TABLE ACCESS BY INDEX ROWID BATCHED     ← fed by Id 4
    Id 4 INDEX RANGE SCAN IX_CUSTOMERS_COUNTRY  ← first operation that produces rows
   Id 5 INDEX RANGE SCAN IX_ORDERS_CUSTOMER_DATE  ← once per customer (Starts = 198)
  Id 6 TABLE ACCESS BY INDEX ROWID ORDERS        ← once per order entry (Starts = 214)
```

Rule of thumb: the first operation without children, going down the tree along first children, runs first; a parent's children run in Id order. The "two nested loops" shape (12c+ "nested loop batching") is how Oracle separates index probes from table row fetches.

---

# Predicate Information: access vs filter

```text
   4 - access("C"."COUNTRY"='NZ')                         navigates the index
   7 - filter("O"."STATUS"='Pending')                     checked on each row read
   9 - access("O"."CUSTOMERID"="C"."CUSTOMERID")          join key (hash join or index probe)
       filter(INTERNAL_FUNCTION("O"."ORDERDATE")>=…)       ← a function on the column: implicit conversion!
```

- `access(...)` predicates limit what is read (index seek, hash join key).
- `filter(...)` predicates discard rows after reading.
- `INTERNAL_FUNCTION`, `TO_NUMBER("COL")` or `SYS_OP_C2C` wrapped around a column usually mean an implicit data-type or character-set conversion that prevents index access (Section 16.12).

---

# Common Oracle Operations

| Operation | Meaning |
|-----------|---------|
| `TABLE ACCESS FULL` | Full table scan |
| `TABLE ACCESS BY INDEX ROWID [BATCHED]` | Lookup of rows found through an index |
| `INDEX UNIQUE SCAN` / `INDEX RANGE SCAN` | Seek for one / several entries |
| `INDEX FULL SCAN` / `INDEX FAST FULL SCAN` | Whole index in order / unordered multiblock read |
| `INDEX SKIP SCAN` | Uses a composite index without its leading column |
| `NESTED LOOPS` / `HASH JOIN` / `MERGE JOIN` | Join algorithms; `… SEMI` / `… ANTI` / `… OUTER` variants |
| `SORT ORDER BY` / `SORT ORDER BY STOPKEY` | Sort / top-N sort |
| `HASH GROUP BY` / `SORT GROUP BY` | Aggregation |
| `COUNT STOPKEY` | `ROWNUM` / `FETCH FIRST` early stop |
| `VIEW` | An inline view or CTE kept as a unit |
| `TEMP TABLE TRANSFORMATION` | Materialized `WITH` clause |
| `PX COORDINATOR` / `PX SEND` / `PX RECEIVE` | Parallel execution (Section 16.13) |
| `PARTITION RANGE ITERATOR` / `SINGLE` / `ALL` | Partition pruning (`Pstart`/`Pstop` columns) |
| `STATISTICS COLLECTOR` | Adaptive plan decision point |

---

# Notes Below the Plan

```text
Note
-----
   - dynamic statistics used: dynamic sampling (level=2)          ← statistics missing on a table
   - this is an adaptive plan (rows marked '-' are inactive)      ← join method decided at run time
   - SQL plan baseline SQL_PLAN_8a7c… used for this statement     ← plan pinned by a baseline
   - Warning: basic plan statistics not available …               ← no GATHER_PLAN_STATISTICS / statistics_level
   - cardinality feedback used for this statement                 ← re-optimized after a bad estimate
```

Read the notes every time: they often explain why a plan differs from what you expected. Use format `'ALLSTATS LAST +ADAPTIVE'` to see both branches of an adaptive plan, and `'+PEEKED_BINDS'` to see bind values used at optimization.

---

# Real-Time SQL Monitoring

For long-running or parallel statements, Oracle's SQL Monitor (`DBMS_SQL_MONITOR` / `DBMS_SQLTUNE.REPORT_SQL_MONITOR`, Enterprise Edition with the Tuning Pack) shows the plan **while it runs**: rows per operation, active time, I/O, memory, parallel servers, and which operation is executing now. It is the best Oracle view for a query that takes minutes.

---

# SQLite: EXPLAIN QUERY PLAN

```sql
EXPLAIN QUERY PLAN
SELECT c.CustomerName, o.OrderID, o.TotalAmount
FROM Customers c
JOIN Orders o ON o.CustomerID = c.CustomerID
WHERE c.Country = 'NZ'
ORDER BY o.TotalAmount DESC;
```

```text
QUERY PLAN
|--SEARCH c USING INDEX ix_customers_country (Country=?)
|--SEARCH o USING INDEX ix_orders_customer_date (CustomerID=?)
`--USE TEMP B-TREE FOR ORDER BY
```

SQLite joins are always nested loops; the listed order is the loop nesting (first line = outermost loop). Lines:

| Line | Meaning |
|------|---------|
| `SCAN t` | Full table scan |
| `SCAN t USING INDEX ix` | Full scan of an index (for order or covering) |
| `SCAN t USING COVERING INDEX ix` | Full scan of a covering index |
| `SEARCH t USING INDEX ix (a=? AND b>?)` | Index seek; the parentheses show which columns are used |
| `SEARCH t USING COVERING INDEX ix (…)` | Seek, no table access |
| `SEARCH t USING INTEGER PRIMARY KEY (rowid=?)` | Rowid lookup |
| `SEARCH t USING AUTOMATIC COVERING INDEX (col=?)` | SQLite built a temporary index for this query—a missing index |
| `USE TEMP B-TREE FOR ORDER BY / GROUP BY / DISTINCT` | Explicit sort / grouping structure |
| `BLOOM FILTER ON t (col=?)` | Bloom filter to skip lookups (3.38+) |
| `CORRELATED SCALAR SUBQUERY n` / `LIST SUBQUERY n` | Subquery evaluation |
| `MATERIALIZE name` / `CO-ROUTINE name` | A view or CTE materialized or streamed |
| `COMPOUND QUERY` / `UNION ALL` | Set operations |

---

# SQLite: Fixing a Plan

```text
-- Before
QUERY PLAN
|--SCAN o
`--SEARCH c USING INTEGER PRIMARY KEY (rowid=?)

-- After CREATE INDEX ix_orders_status_created ON Orders(Status, CreatedAt):
QUERY PLAN
|--SEARCH o USING INDEX ix_orders_status_created (Status=?)
`--SEARCH c USING INTEGER PRIMARY KEY (rowid=?)
```

`SCAN` on a large table in the outer loop, `AUTOMATIC COVERING INDEX`, and `USE TEMP B-TREE` on large results are SQLite's main red flags. Run `ANALYZE` (or `PRAGMA optimize`) so the planner has statistics in `sqlite_stat1`.

---

# Visual Representation

```text
ORACLE  DBMS_XPLAN ALLSTATS LAST
  | Id | Operation (indented tree) | Name | Starts | E-Rows (per start) | A-Rows (total) | A-Time | Buffers | Reads | Mem |
  Predicate Information:  access() = navigate · filter() = discard after reading
  Note:  dynamic sampling · adaptive plan · baseline · cardinality feedback

SQLITE  EXPLAIN QUERY PLAN
  |--SEARCH / SCAN (outer loop)
  |--SEARCH / SCAN (inner loop, once per outer row)
  `--USE TEMP B-TREE FOR ORDER BY
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← TABLE ACCESS FULL / INDEX RANGE SCAN · SCAN / SEARCH
2. JOIN        ← NESTED LOOPS / HASH JOIN / MERGE JOIN · SQLite: nested loops in listed order
3. WHERE       ← access() vs filter() predicates · SEARCH (col=?) vs SCAN
4. GROUP BY    ← HASH GROUP BY / SORT GROUP BY · USE TEMP B-TREE FOR GROUP BY
5. HAVING      ← filter() on the GROUP BY operation
6. WINDOW      ← WINDOW SORT / WINDOW BUFFER · SQLite: CO-ROUTINE with window processing
7. SELECT      ← projection; covering index decides table access
8. DISTINCT    ← HASH UNIQUE / SORT UNIQUE · USE TEMP B-TREE FOR DISTINCT
9. ORDER BY    ← SORT ORDER BY · USE TEMP B-TREE FOR ORDER BY (or index order)
10. LIMIT / FETCH / TOP   ← COUNT STOPKEY / SORT ORDER BY STOPKEY · SQLite: loop stops early
```

---

# How the DBMS Executes This

```text
Oracle: the cursor's plan lives in V$SQL_PLAN; with GATHER_PLAN_STATISTICS (or
statistics_level = ALL) row-source statistics are recorded in V$SQL_PLAN_STATISTICS_ALL;
DISPLAY_CURSOR joins the two and formats them.

SQLite: the planner turns the query into nested loops of bytecode; EXPLAIN QUERY PLAN
prints one line per loop and per temporary structure; EXPLAIN prints the raw bytecode.
```

---

# 🏗️ Architecture Insight

Oracle's plan is identified by its **plan hash value**: two executions with the same plan hash used the same plan shape. Tracking plan hash values per `SQL_ID` over time (AWR, `DBA_HIST_SQLSTAT`) is the standard way to detect that a statement changed plans—and when (Section 16.14).

---

# ⚡ Performance Tip

In Oracle, the fastest diagnosis is usually the row where `E-Rows × Starts` and `A-Rows` first differ by an order of magnitude, read together with its predicates. In SQLite, look for `SCAN` on big tables and `AUTOMATIC` indexes.

---

# 🌍 Production Consideration

`GATHER_PLAN_STATISTICS` adds overhead to the statement it is in; `statistics_level = ALL` adds it to every statement in the session—never set it system-wide in production. For production statements, use SQL Monitor reports or AWR plan history instead.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Predicate placement shown | ❌ | `Index Cond` / `Filter` | `index_condition` / `attached_condition` | Seek Predicates / Predicate | `access()` / `filter()` | `(col=?)` in `SEARCH` |
| Executions | ❌ | `loops` | `loops` | Number of Executions | `Starts` | ❌ |
| Plan identity | ❌ | ❌ (`queryid` for SQL) | ❌ | `QueryPlanHash` | Plan hash value | ❌ |
| Live progress | ❌ | `pg_stat_progress_*` (some commands) | ❌ | Live Query Statistics | SQL Monitor | ❌ |
| Join algorithms | ❌ | NL, hash, merge | NL, hash | NL, hash, merge, adaptive | NL, hash, merge, adaptive | Nested loops only |

> **Portability Tip:** Oracle's `access`/`filter` split is the same idea as PostgreSQL's `Index Cond`/`Filter` and SQL Server's Seek Predicates/Predicate. Look for it in every plan.

---

# Common Mistakes

### Mistake 1

Comparing `E-Rows` with `A-Rows` without multiplying `E-Rows` by `Starts`.

---

### Mistake 2

Skipping the Predicate Information and Note sections.

---

### Mistake 3

Using `EXPLAIN PLAN` instead of `DISPLAY_CURSOR` for statements with bind variables.

---

### Mistake 4

Ignoring `AUTOMATIC COVERING INDEX` in SQLite plans instead of creating the index.

---

# Best Practices

✔ In Oracle, use `ALLSTATS LAST` with `GATHER_PLAN_STATISTICS` for diagnosis.

✔ Read predicates and notes every time.

✔ Track plan hash values over time for critical statements.

✔ In SQLite, read the plan as nested loops in listed order.

✔ Run `ANALYZE` / `PRAGMA optimize` so SQLite has statistics.

---

# Interview Questions

## Basic

1. What does `TABLE ACCESS FULL` mean?
2. What is the difference between `access` and `filter` predicates?
3. What does `SCAN` versus `SEARCH` mean in SQLite?

## Intermediate

4. How do you compare `E-Rows` and `A-Rows` correctly?
5. What does `COUNT STOPKEY` indicate?
6. What does `USE TEMP B-TREE FOR ORDER BY` mean in SQLite?

## Advanced

7. What does "this is an adaptive plan" mean, and how do you see the inactive rows?
8. Why does `INTERNAL_FUNCTION` around a column in a predicate deserve attention?

---

# Hands-on Exercises

## Exercise 1

In Oracle, run a query with `GATHER_PLAN_STATISTICS` and find the operation with the largest gap between estimated and actual rows.

---

## Exercise 2

Compare the Predicate Information for a sargable and a non-sargable date predicate.

---

## Exercise 3

In SQLite, find a query with `AUTOMATIC COVERING INDEX`, create a real index, and compare plans.

---

# Related Topics

- **16.02 — Getting a Plan (EXPLAIN, Estimated and Actual Plans)**
- **16.03 — Plan Structure (Operators, Trees and Data Flow)**
- **16.11 — Estimates vs Actuals (Finding Cardinality Misestimates)**
- **16.14 — Comparing Plans and Detecting Plan Regressions**
- **10.08 — Index Seeks, Scans and Lookups**

---

# Summary

Oracle's `DBMS_XPLAN.DISPLAY_CURSOR` with `ALLSTATS LAST` prints an indented operation table with starts, estimated rows per start, actual total rows, time, buffers, physical reads and memory, followed by Predicate Information that separates `access` from `filter` predicates and notes about dynamic sampling, adaptive plans and baselines. SQLite's `EXPLAIN QUERY PLAN` prints one line per nested loop—`SCAN` for full reads, `SEARCH` for index seeks, covering and automatic indexes, and temporary B-trees for sorting and grouping. Both map onto the same concepts as every other engine: access paths, join order, predicates that navigate versus filter, and where sorting and early stopping happen.
