---
title: "15.15 - A Systematic Tuning Workflow"
description: "A repeatable method for tuning SQL: define the goal, find the queries that matter by total cost, capture the actual plan and runtime data, classify the problem as too much work, the wrong plan or waiting, locate the first estimate error or most expensive operator, choose the least invasive fix from a ranked list, verify with realistic data and concurrency, deploy safely, and monitor for regressions—with a worked example from symptom to fix."
chapter: 15
section: 15.15
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 30 min
lastUpdated: 2026-09-28
---

# 15.15 A Systematic Tuning Workflow

---

# Learning Objectives

After completing this section, you will be able to:

- Tune SQL with a repeatable, evidence-based method.
- Decide which queries to work on first.
- Classify a problem and locate its cause in the plan.
- Choose the least invasive effective fix.
- Verify, deploy and monitor changes safely.

---

# The Workflow

```text
 0. GOAL        what does "fast enough" mean? (p95 < 200 ms, report < 5 min, CPU −30%)
 1. FIND        which queries matter? rank by total time / reads / CPU
 2. CAPTURE     actual plan, runtime stats, parameters, waits, data volumes
 3. CLASSIFY    too much work · wrong plan · waiting
 4. LOCATE      first operator where estimate ≠ actual; most expensive operator
 5. FIX         least invasive change that addresses the cause
 6. VERIFY      same data, parameters, cache state, concurrency — before vs after
 7. DEPLOY      safely (index builds online, plan forcing reversible)
 8. MONITOR     confirm in production; watch for regressions elsewhere
```

---

# Step 0: Define the Goal

Tuning without a target never ends. State a measurable goal tied to users or resources:

```text
"Checkout order history endpoint: p95 under 150 ms at 300 requests/s"
"Nightly finance load finishes before 05:00"
"Reduce server CPU from 85% to under 60% at peak"
```

The goal also decides when to stop.

---

# Step 1: Find the Queries That Matter

```text
Sources:   pg_stat_statements · Query Store · Performance Schema / sys · AWR / V$SQLSTATS
           slow query logs · APM traces (which endpoint issued which SQL)
Rank by:   total elapsed time · total CPU · total logical reads · executions
Look for:  top 10 by total cost (often > 50% of load) · sudden regressions · p99 outliers
```

A handful of statements usually dominate. Fix those first.

---

# Step 2: Capture the Evidence

For the chosen query, collect:

```text
□ exact SQL text, as the application sends it (parameters, types, ORM-generated form)
□ representative parameter values — including the slow ones
□ actual execution plan with per-operator rows (and time/reads where available)
□ elapsed vs CPU time, logical/physical reads, waits
□ table sizes, index definitions, statistics freshness
□ execution frequency and concurrency
```

Reproduce the problem **the way production runs it**: same parameter types (Section 15.08), same session settings, realistic data size and skew.

---

# Step 3: Classify

```text
elapsed ≫ CPU, waits dominate                       → WAITING      (15.13, 15.14)
reads/rows far beyond what the result needs,
  estimates ≈ actuals                               → TOO MUCH WORK (index, SQL shape, schema)
estimates ≠ actuals by 10× or more,
  plan choices follow the wrong estimates           → WRONG PLAN   (statistics, SQL shape, parameters)
fast for some parameters, slow for others          → WRONG PLAN (sniffing, 15.08)
fast in isolation, slow under load                  → WAITING / resource contention
```

---

# Step 4: Locate the Cause in the Plan

```text
Read the plan bottom-up (leaves first):
  1. Find the FIRST operator where estimated rows and actual rows diverge by ≥ 10×.
     Everything above it was planned on false information.
  2. Find the operator with the highest actual time or reads.
  3. Look for red flags:
     - scan of a large table feeding a small result
     - nested loop with a huge number of inner executions
     - key lookups by the hundred thousand
     - sort / hash spilling to disk
     - "Rows Removed by Filter" in the millions
     - implicit conversion on a column (CONVERT_IMPLICIT, casts in Index Cond/Filter)
     - repeated subplans (CTE referenced several times on SQL Server)
```

Chapter 16 covers reading plans operator by operator.

---

# Step 5: Choose the Least Invasive Fix

Work down this list; stop at the first fix that meets the goal:

```text
 1. Refresh / improve statistics          ANALYZE, extended stats, histograms       (15.03)
 2. Rewrite the query                      sargable predicates, matching types,
                                           NOT EXISTS, fewer columns, set-based    (15.07)
 3. Add or change an index                 composite, covering, partial, expression (15.05, Ch. 10)
 4. Fix parameter handling                 recompile, custom plans, plan forcing    (15.08)
 5. Restructure                            pre-aggregate, temp table steps,
                                           keyset pagination, batching              (15.10–15.12)
 6. Change the schema / data design        stored derived columns, partitioning,
                                           rollups, denormalization                 (13.15)
 7. Change configuration                   memory settings, parallelism, RCSI       (15.11, 15.13)
 8. Hints / forced plans                   narrow, documented, reviewed             (15.09)
 9. Hardware / scale                       only after the above
```

Each fix has costs: indexes slow writes and take space, rewrites need testing, schema changes need migrations, configuration changes affect every query. Weigh them against the gain.

---

# Step 6: Verify

```text
□ same data volume and distribution as production
□ same parameter values (fast and slow ones) and types
□ compare logical reads and CPU, not only elapsed time
□ warm and cold cache where relevant
□ under concurrency for OLTP queries
□ results identical before and after (row counts, checksums) — a fast wrong query is not a fix
□ check other queries affected by the change (new index used elsewhere? writes slower?)
```

---

# Step 7: Deploy Safely

- Build indexes online where supported (`CREATE INDEX CONCURRENTLY` in PostgreSQL; `ONLINE = ON` in SQL Server Enterprise; `ALGORITHM=INPLACE, LOCK=NONE` in MySQL; `ONLINE` in Oracle).
- Prefer reversible changes first: plan forcing can be undone instantly; an index can be dropped; a rewritten query can be rolled back with the application.
- Change one thing per deployment where possible, so effects are attributable.

---

# Step 8: Monitor

```text
□ the target metric (p95, runtime, CPU) moved as expected in production
□ the query's plan in production is the one you tested (Query Store, auto_explain)
□ no new regressions: write latency, other queries' plans, lock waits
□ document: symptom, cause, fix, evidence, date — for the next person
```

---

# Worked Example

**Symptom.** The customer order-history endpoint's p95 rose from 80 ms to 2.4 s after a marketing campaign.

**Find.** Query Store shows one statement consuming 60% of CPU:

```sql
SELECT OrderID, OrderDate, Status, TotalAmount
FROM Orders
WHERE CustomerID = @cust AND Status <> 'Cancelled'
ORDER BY OrderDate DESC
OFFSET @skip ROWS FETCH NEXT 20 ROWS ONLY;
```

**Capture.** Two plans exist. For most customers: seek on `(CustomerID, OrderDate)` with lookups, 25 logical reads. For some calls: a clustered index scan, 410,000 reads. Compiled parameter value: a new "guest" customer ID used for all campaign guest checkouts—1.8 million orders.

**Classify.** Wrong plan (parameter sniffing on skewed data) plus too much work for deep `OFFSET` pages.

**Locate.** When the scan plan is cached, every normal customer's call scans the table. When the seek plan is cached, the guest customer's calls do 1.8 million lookups.

**Fix (least invasive first).**

```text
1. Statistics: fresh; the skew is real. No change.
2. Rewrite: keyset pagination instead of OFFSET; list columns (already done).
3. Index: covering index so the seek plan is good for every customer:
     CREATE INDEX ix_orders_cust_date_cov ON Orders (CustomerID, OrderDate DESC, OrderID DESC)
         INCLUDE (Status, TotalAmount) WITH (ONLINE = ON);
4. Data design: stop assigning all guest checkouts to one customer ID (application change, scheduled).
```

**Verify.** With the covering index and keyset pagination, both a normal customer and the guest customer read under 30 pages per page of results; the scan plan is no longer chosen for any value. Results identical.

**Deploy and monitor.** Index built online; application release with keyset pagination; p95 back to 60 ms; write latency on `Orders` up 3% (acceptable); documented in the tuning log.

---

# Visual Representation

```text
   GOAL → FIND → CAPTURE → CLASSIFY ─┬─ waiting ─────▶ concurrency / resources
                                     ├─ too much work ▶ SQL shape · index · schema
                                     └─ wrong plan ───▶ statistics · SQL shape · parameters · (hints)
                                              │
                          VERIFY ◀── FIX (least invasive first)
                            │
                          DEPLOY → MONITOR → next query
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← first place to look: access paths on the largest tables
2. JOIN        ← nested loop executions, hash spills, join order driven by estimates
3. WHERE       ← sargability, implicit conversions, rows removed by filter
4. GROUP BY    ← spills, hash vs stream, grouping on wide keys
5. HAVING
6. WINDOW      ← sorts that an index could provide
7. SELECT      ← SELECT * preventing covering indexes; scalar UDFs per row
8. DISTINCT    ← hiding fan-out
9. ORDER BY    ← sorts; mismatch with index order
10. LIMIT / FETCH / TOP   ← OFFSET depth; row goals
```

---

# How the DBMS Executes This

```text
Tuning log entry (template)
  Query:        order history (query_id 1234)
  Goal:         p95 < 150 ms
  Evidence:     plan A 25 reads / plan B 410,000 reads; compiled value = guest ID
  Class:        wrong plan (sniffing) + deep OFFSET
  Fix:          covering index + keyset pagination; data fix scheduled
  Verification: < 30 reads for all tested customers; results identical
  Side effects: Orders write latency +3%
  Date / owner: 2026-09-28 / DB team
```

---

# 🏗️ Architecture Insight

A tuning workflow is only as good as its inputs. Always-on workload statistics, plan history, application tracing that links endpoints to SQL, and production-like test data turn tuning from firefighting into routine engineering.

---

# ⚡ Performance Tip

Stop when the goal is met. The last 10% of improvement often costs more (indexes, complexity, maintenance) than it returns, and the next query on the list is usually a better use of time.

---

# 🔒 Security Note

When copying production data to reproduce a performance problem, mask personal and sensitive data, or reproduce with synthetic data that has the same volume and skew. Plans and statistics can often be reproduced without real values.

---

# 🌍 Production Consideration

Performance work is continuous. Data grows, access patterns change, engines are upgraded. Re-run the "find" step regularly (weekly top-N review), and include plan regression checks in upgrade and release processes.

---

# SQL Standard vs Vendor Differences

| Workflow step | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|---------------|------------|-------|------------|--------|--------|
| Find | `pg_stat_statements` | sys schema, slow log | Query Store | AWR, `V$SQLSTATS` | Application timing |
| Capture plan | `EXPLAIN (ANALYZE, BUFFERS)`, `auto_explain` | `EXPLAIN ANALYZE` | Actual plan, Query Store | `DBMS_XPLAN` | `EXPLAIN QUERY PLAN` |
| Online index | `CONCURRENTLY` | `ALGORITHM=INPLACE` | `ONLINE = ON` (Enterprise) | `ONLINE` | ❌ |
| Reversible plan fix | `pg_hint_plan` (extension) | Query rewrite plugin | Query Store forcing | SQL plan baselines | ❌ |
| Advisors | Extensions (e.g. HypoPG hypothetical indexes) | ❌ | Database Engine Tuning Advisor, missing index DMVs | SQL Tuning Advisor (licensed) | `.expert` in the CLI |

> **Portability Tip:** The workflow is identical on every engine; only the tools in each step change.

---

# Common Mistakes

### Mistake 1

Tuning without a goal or without measuring first.

---

### Mistake 2

Jumping to hints or hardware before cheaper fixes.

---

### Mistake 3

Reproducing with different parameters, types or data than production.

---

### Mistake 4

Changing several things at once.

---

### Mistake 5

Not verifying that results stay identical.

---

# Best Practices

✔ Set a measurable goal and stop when it is met.

✔ Work on queries ranked by total cost.

✔ Reproduce exactly as production runs the query.

✔ Fix the cause with the least invasive change.

✔ Verify, deploy reversibly, monitor, and document.

---

# Interview Questions

## Basic

1. What are the steps of a tuning workflow?
2. How do you decide which query to tune first?
3. Why define a goal before tuning?

## Intermediate

4. How do you classify a slow query?
5. Where in a plan do you start looking?
6. In what order would you consider fixes?

## Advanced

7. Walk through tuning a query that is fast for most parameters and slow for a few.
8. How do you make sure a tuning change does not cause regressions elsewhere?

---

# Hands-on Exercises

## Exercise 1

Apply the full workflow to the most expensive query on a database you use, and write a tuning log entry.

---

## Exercise 2

Reproduce a production slow query with correct parameter types and compare with a naive reproduction.

---

## Exercise 3

For one fix, list its side effects (write cost, storage, other plans) and how you measured them.

---

# Related Topics

- **15.01 — Introduction to Query Optimization**
- **15.14 — Measuring Query Performance (Timing, I/O and Wait Statistics)**
- **15.16 — Common Query Optimization Mistakes & Best Practices**
- **10.15 — Index Design Strategy**
- **16.xx — Reading Execution Plans**

---

# Summary

Systematic tuning starts with a measurable goal and the queries that matter most by total cost, captures the actual plan and runtime evidence exactly as production runs the query, classifies the problem as too much work, the wrong plan or waiting, and locates the first estimate error or most expensive operator. Fixes are chosen from least to most invasive—statistics, query rewrites, indexes, parameter handling, restructuring, schema, configuration, hints, hardware—then verified with realistic data and concurrency, deployed reversibly, monitored in production and documented.
