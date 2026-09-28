---
title: "Chapter 15 - Query Optimization"
description: "Master SQL query optimization: how the optimizer parses, rewrites and costs plans, statistics and cardinality estimation, rewrites the optimizer performs, access paths, join ordering and algorithms, optimizer-friendly SQL, parameter sniffing and plan caching, hints and plan guides, pagination, aggregation and sorting, batch writes, locking and concurrency, measuring performance, and a systematic tuning workflow."
chapter: 15
section: Introduction
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 25 min
lastUpdated: 2026-09-28
---

# Chapter 15 — Query Optimization

> *"SQL says what you want. The optimizer decides how to get it—and it is only as good as what it knows."*

---

# Learning Objectives

By the end of this chapter, you will be able to:

- Describe how a query optimizer turns SQL into an execution plan.
- Explain how statistics and cardinality estimates drive every plan choice.
- Recognise the rewrites optimizers perform automatically—and the ones they cannot.
- Predict when the engine will scan, seek or look up rows, and which join algorithm it will pick.
- Write SQL that gives the optimizer the best chance: sargable, simple, honest about types.
- Diagnose parameter sniffing and plan-cache problems.
- Use hints and plan guides as a last resort, and know their risks.
- Optimize pagination, top-N, aggregation, sorting and large write operations.
- Understand how locking and concurrency affect query speed.
- Measure performance properly and follow a repeatable tuning workflow.

---

# Introduction

Every earlier chapter ended with a performance section: sargable predicates in Chapter 06, join algorithms in Chapter 07, aggregation strategies in Chapter 08, decorrelation in Chapter 09, index design in Chapter 10, window sorts in Chapter 11, function-based predicates in Chapters 12 and 13, CTE materialization in Chapter 14. This chapter pulls those threads together into one discipline: **query optimization**.

SQL is declarative. You describe the result; the database chooses the algorithm. For a query joining five tables there can be thousands of candidate plans—different join orders, different join algorithms, different indexes—whose run times differ by factors of a million. The component that chooses among them is the **query optimizer**, and most performance problems are cases where it chose badly: because its statistics were stale, because the SQL hid information from it, because a plan built for one parameter value was reused for another, or because no good plan existed at all without an index.

Optimization is therefore two skills: understanding what the optimizer does and needs, and following a disciplined process to find and fix the real bottleneck instead of guessing.

---

# What is Query Optimization?

```text
             SQL (what)                                    Plan (how)
   SELECT c.CustomerName, SUM(o.TotalAmount)         Hash Aggregate
   FROM Customers c JOIN Orders o …          ──▶       └─ Hash Join (o.CustomerID = c.CustomerID)
   WHERE o.OrderDate >= '2026-09-01'                        ├─ Index Range Scan Orders(OrderDate)
   GROUP BY c.CustomerName;                                 └─ Seq Scan Customers
                                   ▲
                         optimizer: enumerate alternatives,
                         estimate the cost of each, pick the cheapest
```

Query optimization has two meanings, and this chapter covers both:

1. **What the engine does** — parsing, rewriting, estimating and choosing a plan (Sections 15.02–15.06).
2. **What you do** — writing SQL, maintaining statistics, designing indexes and schemas, and tuning systematically so the engine can find a good plan (Sections 15.07–15.15).

---

# Basic Workflow

```text
1. MEASURE     find the queries that matter (total time = duration × executions)
2. EXPLAIN     get the actual plan with row counts and timings
3. DIAGNOSE    where do estimates and actuals diverge? where does time go?
4. FIX         the cause: statistics, SQL shape, index, schema, parameters, hints (last)
5. VERIFY      measure again under realistic data and concurrency
```

Example of one full cycle (PostgreSQL):

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM Orders
WHERE CAST(CreatedAt AS DATE) = DATE '2026-09-28';
-- Seq Scan on orders … rows=18400 … Buffers: shared read=412,000 … Execution Time: 3,900 ms

-- Fix: sargable half-open range on the indexed column (Section 13.10)
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM Orders
WHERE CreatedAt >= TIMESTAMPTZ '2026-09-28 00:00+00' AND CreatedAt < TIMESTAMPTZ '2026-09-29 00:00+00';
-- Index Scan using ix_orders_createdat … Buffers: shared hit=820 … Execution Time: 21 ms
```

---

# The Sample Schema

Every section uses the Chapter 14 schema. Sizes matter for optimization, so the examples assume a mid-sized production database:

```text
Table          Rows (approx.)   Notes
Customers        1,000,000      Country is skewed: 60% 'IN', 20% 'US', the rest spread across 150 countries
Orders          10,000,000      OrderDate spans 2020–2026, newest rows inserted continuously
OrderItems      40,000,000      ~4 items per order
Products           50,000
Categories          2,000       tree, depth ≤ 6
Employees          20,000
Events         500,000,000      append-only, partitioned by month (Section 13.15)
```

Indexes assumed unless a section says otherwise:

```sql
-- primary keys on every table, plus:
CREATE INDEX ix_orders_customer_date ON Orders (CustomerID, OrderDate);
CREATE INDEX ix_orders_orderdate     ON Orders (OrderDate);
CREATE INDEX ix_orders_createdat     ON Orders (CreatedAt);
CREATE INDEX ix_orderitems_order     ON OrderItems (OrderID);
CREATE INDEX ix_orderitems_product   ON OrderItems (ProductID);
CREATE INDEX ix_customers_country    ON Customers (Country);
```

---

# The Optimization Toolkit

| Topic | What it gives you | Section |
|-------|-------------------|---------|
| Optimizer internals | Why a plan was chosen | 15.02 |
| Statistics and estimates | The inputs every choice depends on | 15.03 |
| Automatic rewrites | What you do not need to hand-optimize | 15.04 |
| Access paths | Scan vs seek vs lookup decisions | 15.05 |
| Join ordering | Order and algorithm for multi-table queries | 15.06 |
| Optimizer-friendly SQL | Writing queries the optimizer can plan well | 15.07 |
| Plan caching | Parameter sniffing, prepared statements | 15.08 |
| Hints | Overriding the optimizer, safely | 15.09 |
| Pagination and top-N | Fast "first page" and "next page" queries | 15.10 |
| Aggregation and sorting | Avoiding sorts, spills and huge groupings | 15.11 |
| Write optimization | Fast, safe `INSERT`/`UPDATE`/`DELETE` at scale | 15.12 |
| Concurrency | Locks, blocking, isolation and speed | 15.13 |
| Measurement | Timing, I/O, waits, query statistics | 15.14 |
| Workflow | A repeatable tuning method | 15.15 |

```text
                     every slow query comes down to:
   ┌─────────────────────────┬───────────────────────────┬─────────────────────────────┐
   │ TOO MUCH WORK           │ THE WRONG PLAN            │ WAITING                     │
   │ (reads rows it doesn't  │ (bad estimates, sniffed   │ (locks, I/O, memory, CPU    │
   │  need: no index, non-   │  parameters, SQL that     │  contention from other      │
   │  sargable, SELECT *)    │  hides information)       │  sessions)                  │
   └─────────────────────────┴───────────────────────────┴─────────────────────────────┘
```

---

# 📍 Execution Order Reminder

The logical order is fixed; the physical plan may reorder almost everything as long as the result is the same:

```text
1. FROM        ← optimizer chooses join order and access paths for every table
2. JOIN        ← optimizer chooses nested loop, hash or merge join per join
3. WHERE       ← predicates pushed down to scans and index seeks
4. GROUP BY    ← hash or stream aggregate; may be pushed below joins
5. HAVING
6. WINDOW      ← sorts shared with ORDER BY when possible
7. SELECT      ← only needed columns carried (covering indexes)
8. DISTINCT    ← may become a hash aggregate or be eliminated
9. ORDER BY    ← satisfied by index order, top-N sort, or full sort
10. LIMIT / FETCH / TOP   ← can stop the whole plan early
```

> The logical order defines **what** the result is. The optimizer is free to execute steps in any order that produces the same result—which is why a filter written in `WHERE` can be applied inside an index seek before any join happens.

---

# How the DBMS Executes This

```text
SQL text
   │ parse (syntax) → bind (names, types, permissions)
   ▼
Logical tree
   │ rewrite: view/CTE inlining, subquery unnesting, predicate pushdown,
   │          join elimination, constant folding, OR/IN transformations
   ▼
Search space
   │ enumerate join orders × join algorithms × access paths
   │ estimate rows (statistics) → estimate cost (I/O + CPU + memory)
   ▼
Chosen plan ──▶ plan cache (reused for later executions)
   │
   ▼
Executor: iterators pull rows through operators; actual rows may differ from estimates
```

---

# Chapter Structure

| Section | Topic |
|---------|-------|
| 15.01 | Introduction to Query Optimization |
| 15.02 | How the Query Optimizer Works (Parsing, Rewriting and Cost-Based Planning) |
| 15.03 | Statistics, Cardinality Estimation and the Cost Model |
| 15.04 | Automatic Query Rewrites (Pushdown, Unnesting and Elimination) |
| 15.05 | Choosing Access Paths (Scans, Seeks and Lookups) |
| 15.06 | Join Ordering and Join Algorithm Selection |
| 15.07 | Writing Optimizer-Friendly SQL |
| 15.08 | Parameter Sniffing, Plan Caching and Prepared Statements |
| 15.09 | Optimizer Hints and Plan Guides |
| 15.10 | Pagination and Top-N Query Optimization |
| 15.11 | Optimizing Aggregation and Sorting |
| 15.12 | Optimizing Writes (Batch INSERT, UPDATE and DELETE) |
| 15.13 | Concurrency, Locking and Query Performance |
| 15.14 | Measuring Query Performance (Timing, I/O and Wait Statistics) |
| 15.15 | A Systematic Tuning Workflow |
| 15.16 | Common Query Optimization Mistakes & Best Practices |
| 15.17 | Query Optimization Cheat Sheet & Visual Knowledge Map |

---

# Real-World Examples

## E-Commerce

```sql
-- Before: OFFSET pagination re-reads every skipped row (page 5,000 reads 100,000 rows)
SELECT OrderID, OrderDate, TotalAmount
FROM Orders
WHERE CustomerID = :c
ORDER BY OrderDate DESC, OrderID DESC
OFFSET 99980 ROWS FETCH NEXT 20 ROWS ONLY;

-- After: keyset pagination continues from the last row seen (reads 20 rows)
SELECT OrderID, OrderDate, TotalAmount
FROM Orders
WHERE CustomerID = :c
  AND (OrderDate, OrderID) < (:lastDate, :lastId)
ORDER BY OrderDate DESC, OrderID DESC
FETCH FIRST 20 ROWS ONLY;
```

The row-value comparison `(a, b) < (x, y)` works on PostgreSQL, MySQL and SQLite; Section 15.10 shows the expanded form for SQL Server and Oracle.

---

## Banking

```sql
-- A statement query that was fast for most accounts and slow for a few large ones:
-- the cached plan was built for a small account (parameter sniffing, Section 15.08).
SELECT * FROM Transactions WHERE AccountID = @acct AND PostedAt >= @from
OPTION (RECOMPILE);   -- SQL Server: one fix among several, with a CPU cost per execution
```

---

## Hospital

```sql
-- Stale statistics after a nightly bulk load: estimates of 1 row, actual 250,000.
ANALYZE LabResults;                                      -- PostgreSQL
-- EXEC sp_updatestats; / UPDATE STATISTICS LabResults;  -- SQL Server
-- EXEC DBMS_STATS.GATHER_TABLE_STATS('HOSP', 'LABRESULTS');  -- Oracle
```

Refreshing statistics after large data changes is the cheapest optimization there is (Section 15.03).

---

## HRMS

```sql
-- Implicit conversion: EmployeeCode is VARCHAR, the parameter arrives as NVARCHAR → index scan.
-- Fix: send the parameter with the column's type (Section 12.08, 15.07).
SELECT * FROM Employees WHERE EmployeeCode = @code;   -- @code declared VARCHAR(20)
```

---

## Social Media

```sql
-- A feed query dominated by a sort of millions of rows; an index in ORDER BY order
-- lets the engine read the newest 50 posts directly and stop (Section 15.10, 15.11).
CREATE INDEX ix_posts_author_created ON Posts (AuthorID, CreatedAt DESC);
SELECT PostID, Body, CreatedAt FROM Posts
WHERE AuthorID = :a ORDER BY CreatedAt DESC FETCH FIRST 50 ROWS ONLY;
```

---

# 🏗️ Architecture Insight

Most large performance wins come from design, not from clever SQL: the right indexes for the real query workload, data types that match how values are compared, business dates stored instead of derived, partitions for time-series data, pre-aggregated tables for dashboards, and an application that asks for what it needs (no `SELECT *`, no N+1 query loops). Query optimization starts in the schema and the data-access layer.

---

# ⚡ Performance Tip

Optimize by **total cost**, not by the slowest single run. A 5 ms query executed 20 million times a day costs far more than a 30-second report run once. Sort queries by total time (duration × executions) before choosing what to tune.

---

# 🔒 Security Note

Performance diagnostics expose data: plans contain literal values, query-store and slow-log entries contain parameters, and sampling tools capture SQL text. Restrict access to them as you would to the data itself, and scrub literals before sharing plans outside the team.

---

# 🌍 Production Consideration

Performance depends on data volume, data distribution, concurrency and cache state—none of which development databases reproduce by default. Tune against production-like data (size and skew), measure with warm and cold caches, and test under concurrent load before declaring a fix.

---

# 🚀 Enterprise Practice

Enterprises treat query performance as an operational discipline: continuous capture of query statistics (Query Store, `pg_stat_statements`, Performance Schema, AWR), performance budgets per endpoint, regression checks of execution plans before releases, scheduled statistics maintenance, and a documented tuning workflow with hints allowed only through review.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Show plan | ❌ | `EXPLAIN (ANALYZE, BUFFERS)` | `EXPLAIN ANALYZE` (8.0.18+) | Actual execution plan, `SET STATISTICS XML` | `DBMS_XPLAN` | `EXPLAIN QUERY PLAN` |
| Update statistics | ❌ | `ANALYZE` | `ANALYZE TABLE` | `UPDATE STATISTICS` | `DBMS_STATS` | `ANALYZE`, `PRAGMA optimize` |
| Query statistics store | ❌ | `pg_stat_statements` | Performance Schema, sys | Query Store | AWR / V$SQL | ❌ |
| Hints | ❌ | ❌ (extension `pg_hint_plan`) | `/*+ … */`, `FORCE INDEX` | `OPTION (…)`, `WITH (…)` | `/*+ … */` | `INDEXED BY`, `CROSS JOIN` order |
| Plan pinning | ❌ | ❌ | ❌ | Query Store forcing, plan guides | SQL plan baselines, profiles | ❌ |

> **Portability Tip:** The principles are portable—sargable predicates, fresh statistics, matching types, good indexes, measuring before changing. The tools (plan output, statistics commands, hints, plan stores) are entirely engine-specific.

---

# Common Mistakes

- Tuning by guesswork instead of reading the actual plan.
- Optimizing the slowest query instead of the most expensive in total.
- Testing on small, uniform development data.
- Adding hints before fixing statistics, SQL shape or indexes.
- Assuming a fast run proves a fix (warm cache, lucky parameter).
- Ignoring waits and blocking—some slow queries do little work but wait a lot.
- Changing several things at once and not knowing which one helped.

---

# Best Practices

✔ Measure first: find expensive queries by total time.

✔ Read the actual plan and compare estimated with actual rows.

✔ Keep statistics fresh and representative.

✔ Write sargable, type-consistent, simple SQL.

✔ Fix the cause—index, SQL, schema, statistics—before reaching for hints.

✔ Verify with realistic data, parameters and concurrency.

---

# 💡 Did You Know?

Cost-based optimization dates back to IBM's System R project in the 1970s. Its 1979 paper by Patricia Selinger and colleagues introduced the ideas nearly every relational optimizer still uses: estimating selectivity from statistics, computing a cost for each candidate plan, and choosing join orders with dynamic programming while keeping "interesting orders" that later steps can reuse.

---

# Related Topics

- **Chapter 14 — Common Table Expressions**
- **06.12 — SARGability and Index-Friendly Predicates**
- **07.14 — Execution Flow of JOINs (Join Algorithms)**
- **10.12 — Selectivity, Cardinality and Statistics**
- **10.15 — Index Design Strategy**
- **12.15 — Scalar Function Performance and Index Strategy**
- **13.15 — Date and Time Performance and Index Strategy**
- **16.xx — Reading Execution Plans**

---

# Summary

Query optimization is the art of getting a good execution plan: the optimizer parses and rewrites SQL, estimates row counts from statistics, costs alternative access paths, join orders and algorithms, and caches the cheapest plan it finds. Most slow queries do too much work, run the wrong plan because of bad estimates or reused parameters, or wait on other sessions. The chapter explains what the optimizer does and needs, how to write SQL and maintain statistics so it can succeed, how to handle plan caching, hints, pagination, aggregation, writes and concurrency, and how to measure and tune systematically rather than by guesswork.
