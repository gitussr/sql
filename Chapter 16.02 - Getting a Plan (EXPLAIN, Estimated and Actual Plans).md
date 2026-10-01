---
title: "16.02 - Getting a Plan (EXPLAIN, Estimated and Actual Plans)"
description: "How to obtain execution plans on PostgreSQL, SQL Server, MySQL, Oracle and SQLite: estimated plans with EXPLAIN and showplan, actual plans with EXPLAIN ANALYZE, STATISTICS XML and ALLSTATS LAST, output formats, getting the plan the application really uses from the plan cache, explaining parameterized queries, and running analyzed data-modifying statements safely."
chapter: 16
section: 16.02
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 25 min
lastUpdated: 2026-10-01
---

# 16.02 Getting a Plan (EXPLAIN, Estimated and Actual Plans)

---

# Learning Objectives

After completing this section, you will be able to:

- Get an estimated plan on every major engine.
- Get an actual plan with runtime statistics on every major engine.
- Choose an output format for reading, sharing or tooling.
- Retrieve the plan the application actually used from the plan cache.
- Explain parameterized and data-modifying statements safely.

---

# The Commands at a Glance

| Engine | Estimated plan | Actual plan |
|--------|----------------|-------------|
| PostgreSQL | `EXPLAIN query` | `EXPLAIN (ANALYZE, BUFFERS) query` |
| MySQL | `EXPLAIN query`, `EXPLAIN FORMAT=TREE query` | `EXPLAIN ANALYZE query` (8.0.18+) |
| SQL Server | `SET SHOWPLAN_XML ON` / SSMS "Display Estimated Execution Plan" (Ctrl+L) | `SET STATISTICS XML ON` / SSMS "Include Actual Execution Plan" (Ctrl+M) |
| Oracle | `EXPLAIN PLAN FOR query` + `DBMS_XPLAN.DISPLAY` | run with `/*+ GATHER_PLAN_STATISTICS */`, then `DBMS_XPLAN.DISPLAY_CURSOR(format => 'ALLSTATS LAST')` |
| SQLite | `EXPLAIN QUERY PLAN query` | CLI `.scanstats on` (builds with scan-status support) |

---

# PostgreSQL

```sql
-- Estimated: plan, costs and row estimates only
EXPLAIN
SELECT * FROM Orders WHERE CustomerID = 42;

-- Actual: runs the query, adds real rows, loops, time and buffer counts
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM Orders WHERE CustomerID = 42;

-- More detail: output columns, settings changed from defaults, WAL generated
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, WAL)
UPDATE Orders SET Status = 'Shipped' WHERE OrderID = 9000001;

-- Machine-readable for tools and visualizers
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT * FROM Orders WHERE CustomerID = 42;
```

Useful options:

| Option | Adds |
|--------|------|
| `ANALYZE` | Executes; actual time, rows, loops |
| `BUFFERS` | Shared/local/temp blocks hit, read, dirtied, written (on by default with `ANALYZE` from PostgreSQL 18) |
| `VERBOSE` | Output column lists, schema-qualified names |
| `SETTINGS` | Planner-relevant settings that differ from defaults |
| `WAL` | WAL records and bytes generated (data-modifying statements) |
| `TIMING OFF` | Keeps row counts but skips per-node timing (lower overhead) |
| `SUMMARY` | Planning and execution time totals |
| `GENERIC_PLAN` | Plans a query with `$1` placeholders without values (PostgreSQL 16+) |
| `FORMAT` | `TEXT`, `JSON`, `XML`, `YAML` |

---

# SQL Server

```sql
-- Estimated plan as XML (statement is compiled, not executed)
SET SHOWPLAN_XML ON;
GO
SELECT * FROM Orders WHERE CustomerID = 42;
GO
SET SHOWPLAN_XML OFF;
GO

-- Actual plan: executes and returns the plan with runtime counters
SET STATISTICS XML ON;
SELECT * FROM Orders WHERE CustomerID = 42;
SET STATISTICS XML OFF;

-- Pair with I/O and time statistics (messages tab)
SET STATISTICS IO, TIME ON;
```

In SSMS: **Ctrl+L** shows the estimated plan, **Ctrl+M** toggles "Include Actual Execution Plan", and **Live Query Statistics** shows rows flowing through a running query. Right-click a graphical plan → *Show Execution Plan XML* gives the full detail; *Save Execution Plan As* produces a `.sqlplan` file anyone can open.

---

# MySQL

```sql
-- Traditional tabular plan
EXPLAIN SELECT * FROM Orders WHERE CustomerID = 42;

-- Tree format (8.0.16+): closest to other engines' output
EXPLAIN FORMAT=TREE SELECT * FROM Orders WHERE CustomerID = 42;

-- JSON: includes cost details
EXPLAIN FORMAT=JSON SELECT * FROM Orders WHERE CustomerID = 42;

-- Actual: executes, then prints the tree with actual time, rows and loops (8.0.18+)
EXPLAIN ANALYZE SELECT * FROM Orders WHERE CustomerID = 42;

-- The plan of a statement running in another session
EXPLAIN FOR CONNECTION 1234;
```

MySQL 8.0.32+ lets you choose the default format with the `explain_format` system variable.

---

# Oracle

```sql
-- Estimated: writes the plan into PLAN_TABLE, then display it
EXPLAIN PLAN FOR
SELECT * FROM Orders WHERE CustomerID = 42;

SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY);

-- Actual: collect row-source statistics, run, then show the last execution's plan
SELECT /*+ GATHER_PLAN_STATISTICS */ * FROM Orders WHERE CustomerID = 42;

SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(NULL, NULL, 'ALLSTATS LAST'));

-- A plan already in the cursor cache, by SQL_ID
SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR('7h35uxf5uhmm1', NULL, 'TYPICAL'));
```

`EXPLAIN PLAN` can disagree with the real plan: it does not peek at bind values and treats binds as `VARCHAR2`. `DISPLAY_CURSOR` shows the plan that actually ran. In SQL*Plus, `SET AUTOTRACE TRACEONLY EXPLAIN STATISTICS` is a quick alternative.

---

# SQLite

```sql
EXPLAIN QUERY PLAN
SELECT * FROM Orders WHERE CustomerID = 42;
```

```text
QUERY PLAN
`--SEARCH Orders USING INDEX ix_orders_customer_date (CustomerID=?)
```

`EXPLAIN` (without `QUERY PLAN`) prints the virtual-machine bytecode—rarely what you want. In the `sqlite3` shell, `.eqp on` prints the query plan before every statement's result, and `.scanstats on` adds loop and row counts when the library was built with scan-status support.

---

# Getting the Plan the Application Used

A plan you compile in a query tool can differ from the plan the application is running: different parameter values (sniffing), different session settings, different parameter data types, or an older cached plan. Retrieve the real one:

```sql
-- SQL Server: cached plans for statements that mention Orders
SELECT TOP (20) qs.execution_count, qs.total_elapsed_time / qs.execution_count AS avg_us,
       st.text, qp.query_plan
FROM sys.dm_exec_query_stats qs
CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
CROSS APPLY sys.dm_exec_query_plan(qs.plan_handle) qp
WHERE st.text LIKE '%Orders%'
ORDER BY qs.total_elapsed_time DESC;

-- SQL Server 2019+: last actual plan (needs LAST_QUERY_PLAN_STATS = ON)
SELECT qps.query_plan
FROM sys.dm_exec_query_stats qs
CROSS APPLY sys.dm_exec_query_plan_stats(qs.plan_handle) qps;
```

```sql
-- Oracle: find the SQL_ID, then display the cursor's plan
SELECT sql_id, child_number, executions, elapsed_time / NULLIF(executions, 0) AS avg_us
FROM V$SQL
WHERE sql_text LIKE '%FROM Orders WHERE CustomerID%';
```

```text
PostgreSQL   auto_explain logs plans of slow statements as they run (Section 16.15)
MySQL        EXPLAIN FOR CONNECTION <id> for a running statement; Performance Schema for history
SQL Server   Query Store keeps plans per query over time (Section 16.15)
```

---

# Explaining Parameterized Queries

```sql
-- PostgreSQL: prepare, then explain an execution with real values
PREPARE q(int) AS SELECT * FROM Orders WHERE CustomerID = $1;
EXPLAIN (ANALYZE, BUFFERS) EXECUTE q(42);

-- PostgreSQL 16+: the generic plan, without values
EXPLAIN (GENERIC_PLAN) SELECT * FROM Orders WHERE CustomerID = $1;
```

```sql
-- SQL Server: reproduce the application's call exactly (types matter!)
EXEC sp_executesql
     N'SELECT * FROM Orders WHERE CustomerID = @c',
     N'@c int',
     @c = 42;
```

Pasting a literal (`WHERE CustomerID = 42`) into a query window often produces a *different* plan from the parameterized statement—the optimizer sees the value, and SQL Server may even auto-parameterize differently. Reproduce the application's statement shape and parameter types.

---

# Analyzing Data-Modifying Statements Safely

`EXPLAIN ANALYZE` executes the statement. For `INSERT`, `UPDATE`, `DELETE` and `MERGE`:

```sql
-- PostgreSQL
BEGIN;
EXPLAIN (ANALYZE, BUFFERS, WAL)
DELETE FROM Events WHERE OccurredAt < TIMESTAMPTZ '2020-01-01 00:00+00';
ROLLBACK;
```

```sql
-- SQL Server
BEGIN TRANSACTION;
SET STATISTICS XML ON;
DELETE FROM Events WHERE OccurredAt < '2020-01-01';
SET STATISTICS XML OFF;
ROLLBACK TRANSACTION;
```

Remember that rolling back still did all the work—and holds locks until the rollback finishes. MySQL's `EXPLAIN ANALYZE` works with `SELECT` and multi-table `UPDATE`/`DELETE`; for other writes, use plain `EXPLAIN`.

---

# Output Formats

| Format | Good for |
|--------|----------|
| Text tree | Reading in a terminal, pasting into tickets |
| Graphical (SSMS, Workbench, pgAdmin, SQL Developer) | Spotting thick arrows and expensive operators quickly |
| JSON / XML | Visualizers, diffing, automated checks, full property detail |
| Tabular (MySQL traditional, Oracle `DBMS_XPLAN`) | Compact overview of access types per table |

Share plans in a format others can open: `.sqlplan` files for SQL Server, `FORMAT JSON` or text for PostgreSQL (paste into visualizers such as explain.dalibo.com or explain.depesz.com—after scrubbing literals).

---

# Visual Representation

```text
                   estimated plan                          actual plan
                   (compile only)                          (compile + execute)
PostgreSQL         EXPLAIN                                 EXPLAIN (ANALYZE, BUFFERS)
MySQL              EXPLAIN [FORMAT=TREE|JSON]              EXPLAIN ANALYZE
SQL Server         SHOWPLAN_XML / Ctrl+L                   STATISTICS XML / Ctrl+M
Oracle             EXPLAIN PLAN + DISPLAY                  GATHER_PLAN_STATISTICS + DISPLAY_CURSOR
SQLite             EXPLAIN QUERY PLAN                      .scanstats on
                                    │
                   what the APPLICATION used:  plan cache · Query Store · auto_explain · V$SQL
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← EXPLAIN shows how each table will be read
2. JOIN        ← … and how they will be combined
3. WHERE       ← … and where each predicate will be applied
4. GROUP BY    ← EXPLAIN ANALYZE adds groups produced and memory used
5. HAVING
6. WINDOW
7. SELECT      ← VERBOSE / output lists show which columns each operator carries
8. DISTINCT
9. ORDER BY    ← actual plans show sort method, memory and spills
10. LIMIT / FETCH / TOP   ← actual plans show how early the query stopped
```

---

# How the DBMS Executes This

```text
EXPLAIN query
  parse → rewrite → optimize → print plan            (no rows read, no locks on data)

EXPLAIN ANALYZE query
  parse → rewrite → optimize → EXECUTE with instrumentation → discard result rows
  → print plan + per-operator counters               (full cost of the query, plus overhead)
```

Instrumentation adds overhead—sometimes a lot for queries that process many rows quickly, because each operator reads a clock for every row. If timing looks inflated, use PostgreSQL's `TIMING OFF` or compare with the query's normal run time.

---

# 🏗️ Architecture Insight

Make plans easy to get. Give developers read access to `EXPLAIN` on production-sized replicas, enable plan capture (Query Store, `auto_explain`, AWR) before you need it, and include "how do I get the actual plan for this endpoint's queries?" in the service runbook.

---

# ⚡ Performance Tip

On PostgreSQL, always add `BUFFERS` (automatic from version 18). Time varies with cache state; buffer counts show how much data each operator touched, and they are what you compare before and after a change.

---

# 🔒 Security Note

`EXPLAIN` requires the same privileges as running the query, and `EXPLAIN ANALYZE` actually runs it. SQL Server's `SHOWPLAN` permission lets users see plans—including literals and object names—for statements they can run. Grant plan-cache and Query Store access (`VIEW SERVER STATE`, `VIEW DATABASE STATE`) deliberately: cached plans can contain other users' parameter values.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Estimated plan | ❌ | `EXPLAIN` | `EXPLAIN` | `SHOWPLAN_XML` | `EXPLAIN PLAN` | `EXPLAIN QUERY PLAN` |
| Actual plan | ❌ | `EXPLAIN ANALYZE` | `EXPLAIN ANALYZE` | `STATISTICS XML` | `ALLSTATS LAST` | `.scanstats` |
| JSON output | ❌ | ✅ | ✅ | ❌ (XML) | ❌ (XML via `DBMS_XPLAN` APIs) | ❌ |
| Plan of running statement | ❌ | `pg_stat_activity` (text only) | `EXPLAIN FOR CONNECTION` | `sys.dm_exec_query_statistics_xml` | `V$SQL_PLAN`, SQL Monitor | ❌ |
| Explain a generic parameterized plan | ❌ | `GENERIC_PLAN` (16+) | n/a | Estimated plan of `sp_executesql` | `EXPLAIN PLAN` (no bind peeking) | ❌ |

> **Portability Tip:** Every engine has an "estimated" and an "actual" mode. Learn both commands for the engines you use, and always know which one you are looking at.

---

# Common Mistakes

### Mistake 1

Running `EXPLAIN ANALYZE DELETE …` on production without a transaction.

---

### Mistake 2

Explaining a query with literals when the application sends parameters of a different type.

---

### Mistake 3

Trusting Oracle `EXPLAIN PLAN` output for a statement that uses bind variables.

---

### Mistake 4

Leaving `SET STATISTICS XML ON` or `SHOWPLAN_XML ON` enabled and wondering why queries return no rows or extra result sets.

---

# Best Practices

✔ Use the actual-plan command whenever the query can safely run.

✔ Add `BUFFERS` (PostgreSQL) or `STATISTICS IO` (SQL Server) to every analyzed run.

✔ Reproduce the application's statement exactly: parameters, types, settings.

✔ Pull the application's real plan from the plan cache or plan store.

✔ Wrap analyzed writes in a transaction and roll back.

---

# Interview Questions

## Basic

1. How do you get an estimated plan on PostgreSQL and SQL Server?
2. What does `EXPLAIN ANALYZE` do that `EXPLAIN` does not?
3. What is `PLAN_TABLE` in Oracle?

## Intermediate

4. Why can Oracle's `EXPLAIN PLAN` show a different plan from the one that ran?
5. How do you see the plan the application is using in SQL Server?
6. How do you safely get an actual plan for a `DELETE`?

## Advanced

7. Why can a literal in a query window produce a different plan than the application's parameterized statement?
8. When would you use PostgreSQL's `TIMING OFF`, and what do you lose?

---

# Hands-on Exercises

## Exercise 1

Get the estimated and actual plan for the same query on your engine, in text and in JSON or XML.

---

## Exercise 2

Run an `UPDATE` through `EXPLAIN ANALYZE` inside a transaction, roll it back, and confirm no rows changed.

---

## Exercise 3

Find a cached plan for an application query in the plan cache or plan store, and compare it with the plan you get by pasting the query with literals.

---

# Related Topics

- **16.01 — Introduction to Execution Plans**
- **16.04 — Reading PostgreSQL Plans (EXPLAIN ANALYZE and BUFFERS)**
- **16.05 — Reading SQL Server Plans (Showplan and Operator Properties)**
- **16.15 — Capturing Plans in Production (Query Store, auto_explain and AWR)**
- **15.08 — Parameter Sniffing, Plan Caching and Prepared Statements**

---

# Summary

Every engine offers an estimated plan (compile only) and an actual plan (execute with instrumentation): `EXPLAIN` and `EXPLAIN (ANALYZE, BUFFERS)` in PostgreSQL, `EXPLAIN` and `EXPLAIN ANALYZE` in MySQL, `SHOWPLAN_XML` and `STATISTICS XML` in SQL Server, `EXPLAIN PLAN` and `DISPLAY_CURSOR('ALLSTATS LAST')` in Oracle, and `EXPLAIN QUERY PLAN` in SQLite. Choose text for reading and JSON or XML for tools. The plan that matters is the one the application ran, so reproduce its parameters and types or retrieve the plan from the cache or plan store, and always wrap analyzed data-modifying statements in a transaction you roll back.
