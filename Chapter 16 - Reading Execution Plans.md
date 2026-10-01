---
title: "Chapter 16 - Reading Execution Plans"
description: "Learn to read SQL execution plans: getting estimated and actual plans, plan trees and data flow, plan output on PostgreSQL, SQL Server, MySQL, Oracle and SQLite, access, join, sort and aggregate operators, estimates versus actuals, warnings and red flags, parallel plans, comparing plans and detecting regressions, and capturing plans in production."
chapter: 16
section: Introduction
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 25 min
lastUpdated: 2026-10-01
---

# Chapter 16 — Reading Execution Plans

> *"The plan is the optimizer's confession: it tells you exactly what it decided, and—if you ask for the actual plan—how wrong it was."*

---

# Learning Objectives

By the end of this chapter, you will be able to:

- Get estimated and actual execution plans on every major engine.
- Read a plan as a tree of operators and follow how rows flow through it.
- Interpret plan output from PostgreSQL, SQL Server, MySQL, Oracle and SQLite.
- Recognise access, join, sort, aggregate and set operators and what each one costs.
- Compare estimated with actual rows and find the operator where a plan went wrong.
- Spot warnings and red flags: spills, implicit conversions, residual predicates, excessive lookups.
- Read parallel plans and exchange operators.
- Compare two plans for the same query and detect plan regressions.
- Capture plans from production safely and continuously.

---

# Introduction

Chapter 15 explained how the optimizer chooses a plan. This chapter is about the evidence: the **execution plan** itself. Every earlier chapter showed fragments of plans—`Index Seek`, `Hash Join`, `HashAggregate`, `WindowAgg`, `CTE Scan`—and asked you to trust that they meant something. Here you learn to read whole plans fluently, on every engine, and to turn what they say into a diagnosis.

Reading plans is the core skill of performance work. Without it, tuning is guesswork: adding indexes nobody uses, rewriting queries into equivalent shapes the optimizer already produced, forcing hints that fix one parameter and break another. With it, most slow queries explain themselves in a few minutes: *this* scan read 40 million rows to return 12, *this* join expected 10 rows and got 2 million, *this* sort spilled to disk.

The difficulty is that every engine prints plans differently—text trees, graphical diagrams, tabular rows, JSON, XML—with different names for the same operators. Underneath, they all describe the same thing: a tree of operators that pull rows from their children, filter, combine and pass them up. Learn that model once, and every engine's output becomes a dialect of it.

---

# What is an Execution Plan?

```text
SQL                                                 Execution plan (a tree of operators)
SELECT c.CustomerName, SUM(o.TotalAmount)           HashAggregate (group by c.CustomerName)
FROM Customers c                                      └─ Hash Join (o.CustomerID = c.CustomerID)
JOIN Orders o ON o.CustomerID = c.CustomerID              ├─ Index Scan on Orders (OrderDate >= '2026-09-01')
WHERE o.OrderDate >= '2026-09-01'                         └─ Hash
GROUP BY c.CustomerName;                                       └─ Seq Scan on Customers
```

An **execution plan** is the program the database runs for a query: which tables and indexes it reads and how, in which order it joins them and with which algorithm, where it sorts, aggregates, filters and stops. There are two kinds:

1. **Estimated plan** — what the optimizer intends to do, with predicted row counts and costs. The query is not run.
2. **Actual plan** — the same plan after running the query, annotated with real row counts, executions, timings, reads and memory.

The estimated plan answers *what did the optimizer choose?* The actual plan also answers *was it right?*—and that second question is where most diagnoses happen (Section 16.11).

---

# Basic Workflow

```text
1. GET        the actual plan (EXPLAIN ANALYZE / actual execution plan / ALLSTATS LAST)
2. ORIENT     find the root, the leaves and the order rows flow in
3. TOTALS     total time, reads, memory; is the query working or waiting?
4. HOTSPOT    which operators account for most of the time or reads?
5. ESTIMATES  where do estimated and actual rows first diverge by 10× or more?
6. RED FLAGS  spills, conversions, residual filters, lookups ×1,000,000, sorts you didn't expect
7. EXPLAIN    connect the hotspot to a cause (Chapter 15), fix it, compare the new plan
```

Example (PostgreSQL):

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT OrderID, TotalAmount
FROM Orders
WHERE CustomerID = 42 AND Status = 'Pending';
```

```text
Index Scan using ix_orders_customer_date on orders  (cost=0.56..412.10 rows=3 width=14) (actual time=0.031..0.402 rows=2 loops=1)
  Index Cond: (customerid = 42)
  Filter: ((status)::text = 'Pending'::text)
  Rows Removed by Filter: 118
  Buffers: shared hit=124
Planning Time: 0.142 ms
Execution Time: 0.431 ms
```

Read it as: one index scan, seeking on `CustomerID` (`Index Cond`), then checking `Status` row by row (`Filter`), discarding 118 rows to return 2, touching 124 cached pages. Fast enough here—but if the customer had 500,000 orders, that `Filter` line would be the problem, and an index on `(CustomerID, Status)` the fix.

---

# The Sample Schema

Every section uses the Chapter 15 schema and assumed sizes:

```text
Table          Rows (approx.)   Notes
Customers        1,000,000      Country is skewed: 60% 'IN', 20% 'US', the rest spread across 150 countries
Orders          10,000,000      OrderDate spans 2020–2026, Status mostly 'Delivered', ~1% 'Pending'
OrderItems      40,000,000      ~4 items per order
Products           50,000
Categories          2,000
Employees          20,000
Events         500,000,000      append-only, partitioned by month
```

```sql
-- primary keys on every table, plus:
CREATE INDEX ix_orders_customer_date ON Orders (CustomerID, OrderDate);
CREATE INDEX ix_orders_orderdate     ON Orders (OrderDate);
CREATE INDEX ix_orders_createdat     ON Orders (CreatedAt);
CREATE INDEX ix_orderitems_order     ON OrderItems (OrderID);
CREATE INDEX ix_orderitems_product   ON OrderItems (ProductID);
CREATE INDEX ix_customers_country    ON Customers (Country);
```

Plan output in this chapter is real in shape but abbreviated: costs, widths and timings are illustrative, and long lines are trimmed.

---

# The Plan-Reading Toolkit

| Topic | What it gives you | Section |
|-------|-------------------|---------|
| Getting plans | Estimated vs actual, on every engine | 16.02 |
| Plan structure | Trees, iterators, data flow, reading order | 16.03 |
| PostgreSQL | `EXPLAIN (ANALYZE, BUFFERS)` line by line | 16.04 |
| SQL Server | Graphical and XML showplan, operator properties | 16.05 |
| MySQL | Tabular `EXPLAIN`, `FORMAT=TREE`, `EXPLAIN ANALYZE` | 16.06 |
| Oracle and SQLite | `DBMS_XPLAN`, `EXPLAIN QUERY PLAN` | 16.07 |
| Access operators | Scans, seeks, lookups, bitmaps | 16.08 |
| Join operators | Nested loop, hash, merge | 16.09 |
| Sort, aggregate, set | Sorts, groupings, windows, unions, top-N | 16.10 |
| Estimates vs actuals | Finding the misestimate that broke the plan | 16.11 |
| Red flags | Spills, conversions, residual predicates, warnings | 16.12 |
| Parallelism | Workers, gather and repartition operators | 16.13 |
| Comparing plans | Before/after, regressions, plan diffs | 16.14 |
| Production capture | Query Store, `auto_explain`, AWR, slow logs | 16.15 |

```text
                          every plan answers four questions:
   ┌──────────────────┬──────────────────────┬──────────────────────┬──────────────────────┐
   │ HOW IS EACH      │ IN WHAT ORDER AND    │ WHERE DOES THE       │ HOW WRONG WERE       │
   │ TABLE READ?      │ HOW ARE TABLES       │ WORK GO? (time,      │ THE ESTIMATES?       │
   │ (scan / seek /   │ COMBINED? (nested    │ reads, memory,       │ (estimated vs        │
   │  lookup)         │ loop / hash / merge) │ spills)              │ actual rows)         │
   └──────────────────┴──────────────────────┴──────────────────────┴──────────────────────┘
```

---

# 📍 Execution Order Reminder

A plan shows the **physical** order the engine chose; the **logical** order still defines the result:

```text
1. FROM        ← leaf operators: scans, seeks, lookups (the deepest nodes in the plan)
2. JOIN        ← join operators combine two child inputs
3. WHERE       ← appears as seek conditions, filters on scans, or separate Filter operators
4. GROUP BY    ← HashAggregate / Stream Aggregate / GroupAggregate
5. HAVING      ← a filter on the aggregate's output
6. WINDOW      ← WindowAgg / Sequence Project / WINDOW SORT, usually above a sort
7. SELECT      ← Compute Scalar / output lists; projected columns decide covering
8. DISTINCT    ← Unique / HashAggregate / Sort (Distinct Sort)
9. ORDER BY    ← Sort / Top-N Sort, or absent when an index supplies the order
10. LIMIT / FETCH / TOP   ← Limit / Top near the root, which can stop the whole plan early
```

> In a plan, the logical steps are often merged, reordered or missing: a `WHERE` predicate may live inside an index seek, an `ORDER BY` may vanish because an index already delivers rows in order, and a `LIMIT` at the root may mean most of the plan never runs to completion.

---

# How the DBMS Executes This

```text
Optimizer output: a tree of operators (the plan)
   │
   ▼
Executor opens the root operator
   │ root asks its child for a row → child asks its own children → … → leaves read pages
   │ rows flow upward one at a time (or in batches); blocking operators (Sort, Hash build)
   │ must consume their whole input before returning the first row
   ▼
Instrumentation (actual plans only): each operator counts rows, loops/executions,
time, buffers and memory as it runs; the engine prints those counters beside the estimates
```

---

# Chapter Structure

| Section | Topic |
|---------|-------|
| 16.01 | Introduction to Execution Plans |
| 16.02 | Getting a Plan (EXPLAIN, Estimated and Actual Plans) |
| 16.03 | Plan Structure (Operators, Trees and Data Flow) |
| 16.04 | Reading PostgreSQL Plans (EXPLAIN ANALYZE and BUFFERS) |
| 16.05 | Reading SQL Server Plans (Showplan and Operator Properties) |
| 16.06 | Reading MySQL Plans (EXPLAIN FORMAT=TREE and EXPLAIN ANALYZE) |
| 16.07 | Reading Oracle and SQLite Plans (DBMS_XPLAN and EXPLAIN QUERY PLAN) |
| 16.08 | Table Access Operators (Scans, Seeks, Lookups and Bitmaps) |
| 16.09 | Join Operators (Nested Loop, Hash and Merge) |
| 16.10 | Sort, Aggregate and Set Operators |
| 16.11 | Estimates vs Actuals (Finding Cardinality Misestimates) |
| 16.12 | Plan Warnings and Red Flags (Spills, Conversions and Residual Predicates) |
| 16.13 | Parallel Plans and Exchange Operators |
| 16.14 | Comparing Plans and Detecting Plan Regressions |
| 16.15 | Capturing Plans in Production (Query Store, auto_explain and AWR) |
| 16.16 | Common Execution Plan Mistakes & Best Practices |
| 16.17 | Execution Plan Cheat Sheet & Visual Knowledge Map |

---

# Real-World Examples

## E-Commerce

```text
-- "The order history page is slow for some customers"
Nested Loop  (actual rows=482,000 loops=1)
  -> Index Scan using ix_orders_customer_date on orders  (rows=12 estimated, actual rows=48,200)
  -> Index Scan using ix_orderitems_order on orderitems  (actual rows=10 loops=48,200)
```

The estimate for one large business customer was 12 orders; the actual was 48,200. The nested loop that was perfect for 12 outer rows ran its inner side 48,200 times. Diagnosis in one glance: a skew-driven misestimate (Sections 15.03, 16.11).

---

## Banking

```text
-- SQL Server actual plan, Index Scan on Transactions with a warning:
Type conversion in expression (CONVERT_IMPLICIT(nvarchar(20),[t].[AccountNo],0))
may affect "SeekPlan" in query plan choice
```

The application sent an `NVARCHAR` parameter for a `VARCHAR` column, turning a seek into a scan of 300 million rows (Section 16.12).

---

## Hospital

```text
-- PostgreSQL: a nightly report suddenly takes 40 minutes
Sort  (actual time=1,912,004..2,101,330 rows=58,000,000 loops=1)
  Sort Method: external merge  Disk: 4,812,336kB
```

The sort spilled 4.8 GB to disk. Raising `work_mem` for the report session, or an index that supplies the order, removes the spill (Sections 15.11, 16.10).

---

## HRMS

```text
-- MySQL EXPLAIN for a department roster
id  select_type  table  type  key   rows     filtered  Extra
1   SIMPLE       e      ALL   NULL  20,000   10.00     Using where; Using filesort
```

`type = ALL` means a full table scan, and `Using filesort` means an explicit sort. An index on `(DepartmentID, LastName)` turns both into `ref` with no filesort (Section 16.06).

---

## Social Media

```text
-- Oracle DBMS_XPLAN ALLSTATS LAST for the feed query
| Id | Operation                     | Name           | Starts | E-Rows | A-Rows |
|  1 |  COUNT STOPKEY                |                |      1 |        |     50 |
|  2 |   INDEX RANGE SCAN DESCENDING | IX_POSTS_AUTH  |      1 |     50 |     50 |
```

`COUNT STOPKEY` above an ordered index range scan: the engine read exactly 50 index entries and stopped. That is what a well-indexed top-N query looks like (Section 15.10).

---

# 🏗️ Architecture Insight

Plans are an interface contract between your schema, your SQL and the optimizer. Teams that read plans routinely design differently: they index for the plans they want, keep data types consistent so seeks are possible, choose keys that cluster related rows together, and check the plan of every new hot-path query before it ships—not after it pages someone at 2 a.m.

---

# ⚡ Performance Tip

Always prefer the **actual** plan when you can afford to run the query. Estimated plans show only what the optimizer believed; most performance problems are cases where that belief was wrong, and only the actual plan shows the gap.

---

# 🔒 Security Note

Plans contain literal values, parameter values, object names and sometimes data distribution details. `EXPLAIN ANALYZE` also **executes** the statement—including `INSERT`, `UPDATE` and `DELETE`. Restrict who can capture plans from production, scrub literals before sharing plans outside the team, and wrap analyzed data-modifying statements in a transaction you roll back.

---

# 🌍 Production Consideration

A plan from your laptop is evidence about your laptop. Plans depend on table sizes, statistics, data skew, configuration (memory, parallelism, cost settings), engine version and even parameter values. Capture plans from production—or a production-sized copy with production statistics—before drawing conclusions (Section 16.15).

---

# 🚀 Enterprise Practice

Mature teams keep plans as artifacts: baseline plans for critical queries stored with the code, automatic plan capture (Query Store, `auto_explain`, AWR), alerts when a query's plan changes and its duration regresses, and plan review as part of code review for new data-access code. "Show me the actual plan" is the first question in every performance incident.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Estimated plan | ❌ | `EXPLAIN` | `EXPLAIN` | `SET SHOWPLAN_XML ON`, Ctrl+L | `EXPLAIN PLAN FOR` + `DBMS_XPLAN.DISPLAY` | `EXPLAIN QUERY PLAN` |
| Actual plan | ❌ | `EXPLAIN ANALYZE` | `EXPLAIN ANALYZE` (8.0.18+) | `SET STATISTICS XML ON`, Ctrl+M | `DBMS_XPLAN.DISPLAY_CURSOR(…, 'ALLSTATS LAST')` | `.scanstats on` (CLI, limited) |
| Formats | ❌ | Text, JSON, XML, YAML | Traditional, TREE, JSON | Graphical, XML, text | Text (many format options), HTML/XML reports | Text tree |
| Production capture | ❌ | `auto_explain`, `pg_stat_statements` | Performance Schema, slow log | Query Store, plan cache DMVs | AWR, `V$SQL_PLAN`, SQL Monitor | ❌ |

> **Portability Tip:** Operator names differ wildly—`Seq Scan`, `Table Scan`, `TABLE ACCESS FULL`, `type = ALL` and `SCAN` all mean "read every row". The concepts are portable; Section 16.17 has a translation table.

---

# Common Mistakes

- Reading only the estimated plan and missing the misestimate that caused the problem.
- Trusting "cost %" or relative cost as if it were measured time.
- Reading the plan top-down as if the root ran first, instead of following data from the leaves.
- Forgetting that per-loop numbers must be multiplied by loops or executions.
- Running `EXPLAIN ANALYZE` on a `DELETE` in production without a transaction.
- Comparing plans captured on different data, statistics or parameter values.
- Fixing the most expensive-looking operator instead of the first wrong estimate below it.

---

# Best Practices

✔ Get the actual plan, with buffers or I/O, whenever you can run the query.

✔ Read from the leaves upward, following the rows.

✔ Compare estimated and actual rows at every operator; find the first large gap.

✔ Look at reads and memory, not only time.

✔ Check warnings and red flags before inventing theories.

✔ Capture production plans continuously, and keep baselines for critical queries.

---

# 💡 Did You Know?

The `EXPLAIN` keyword is older than most of the engines that use it. IBM's DB2 shipped an `EXPLAIN` statement in the 1980s that wrote the chosen access path into a `PLAN_TABLE`—which is why Oracle's `EXPLAIN PLAN` still writes its output into a table called `PLAN_TABLE` that you then query with `DBMS_XPLAN`.

---

# Related Topics

- **Chapter 15 — Query Optimization**
- **05.12 — Execution Flow of SELECT**
- **07.14 — Execution Flow of JOINs (Join Algorithms)**
- **08.14 — Execution Flow of GROUP BY (Hash and Stream Aggregation)**
- **10.08 — Index Seeks, Scans and Lookups**
- **15.03 — Statistics, Cardinality Estimation and the Cost Model**
- **15.14 — Measuring Query Performance (Timing, I/O and Wait Statistics)**
- **17.xx — Views and Materialized Views**

---

# Summary

An execution plan is the tree of operators the database runs for a query: leaves read tables and indexes, joins combine inputs, sorts and aggregates reshape them, and the root returns rows. Estimated plans show the optimizer's intentions; actual plans add real rows, executions, time, reads and memory, which is where most diagnoses come from. This chapter teaches the shared model behind every engine's output, the dialects of PostgreSQL, SQL Server, MySQL, Oracle and SQLite, the main operator families, how to find the misestimate that broke a plan, the red flags worth checking first, parallel plans, plan comparison and regressions, and how to capture plans from production.
