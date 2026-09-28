---
title: "15.16 - Common Query Optimization Mistakes & Best Practices"
description: "A catalogue of the most common query optimization mistakes—grouped into process, statistics and estimates, SQL shape, indexing, plan caching, pagination and sorting, writes and concurrency, and configuration—each with the symptom, the cause and the fix, followed by consolidated best practices and a review checklist."
chapter: 15
section: 15.16
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 30 min
lastUpdated: 2026-09-28
---

# 15.16 Common Query Optimization Mistakes & Best Practices

---

# Learning Objectives

After completing this section, you will be able to:

- Recognise the most common optimization mistakes from their symptoms.
- Explain the cause of each and apply the standard fix.
- Apply a consolidated set of best practices.
- Review queries and tuning changes with a checklist.

---

# Process Mistakes

### Mistake 1: Tuning by guesswork

```text
❌ "Let's add an index on every column in WHERE" / "rewrite it as a CTE, CTEs are faster"
✅ Read the actual plan; compare estimated and actual rows; fix what the evidence shows
```

---

### Mistake 2: Tuning the wrong query

```text
❌ Spending a week on a 30-second monthly report while a 3 ms query runs 40 million times a day
✅ Rank by total time / CPU / reads (15.14)
```

---

### Mistake 3: Testing on unrealistic data

```text
❌ 1,000 uniform rows in development; 10 million skewed rows in production
✅ Production-sized, production-skewed data; the application's parameter types and values
```

---

### Mistake 4: Changing many things at once

```text
❌ New index + rewritten query + memory setting in one release → which one helped (or hurt)?
✅ One change, measured before and after
```

---

### Mistake 5: Declaring victory on one warm run

```text
❌ "It ran in 200 ms on my second try"
✅ Compare logical reads and CPU; test cold and warm; test slow parameter values; test under load
```

---

# Statistics and Estimate Mistakes

### Mistake 6: Stale statistics after bulk changes

```text
❌ Symptom: estimates of 1 row, actual 2 million, right after a nightly load
✅ ANALYZE / UPDATE STATISTICS / DBMS_STATS as the last step of every bulk job
```

---

### Mistake 7: Correlated predicates

```text
❌ City = 'Mumbai' AND Country = 'IN' estimated as independent → underestimate → nested loops
✅ Extended / multi-column statistics (15.03)
```

---

### Mistake 8: Functions hiding columns from statistics

```text
❌ WHERE YEAR(OrderDate) = 2026 → guessed selectivity (and no seek)
✅ Half-open range on the bare column; expression statistics or index if unavoidable
```

---

# SQL Shape Mistakes

### Mistake 9: Non-sargable predicates

```text
❌ functions / arithmetic on indexed columns, LIKE '%x', CAST(col AS …)
✅ bare columns, constant-side computation, expression indexes (12.15, 13.15)
```

---

### Mistake 10: Type mismatches

```text
❌ NVARCHAR parameter vs VARCHAR column; number compared with a text column → column converted → scan
✅ Parameters, literals and join columns of the column's exact type
```

---

### Mistake 11: SELECT *

```text
❌ Prevents covering indexes; widens sorts, hashes and network transfer
✅ List the columns you need
```

---

### Mistake 12: Catch-all optional filters

```text
❌ WHERE (@a IS NULL OR a = @a) AND (@b IS NULL OR b = @b) … → one plan for all → scan
✅ Parameterized dynamic SQL with only the supplied filters; or OPTION (RECOMPILE)
```

---

### Mistake 13: Row-by-row processing and N+1 queries

```text
❌ Loops issuing one query per row (cursor, ORM lazy loading)
✅ Set-based statements and joins; batch operations
```

---

### Mistake 14: DISTINCT hiding a bad join

```text
❌ SELECT DISTINCT … after a join that multiplies rows
✅ EXISTS for existence; aggregate before joining (08.11)
```

---

# Indexing Mistakes

### Mistake 15: Missing indexes on join and filter columns

```text
❌ Unindexed foreign keys → scans on every nested-loop probe, blocking on parent deletes
✅ Index FK columns and frequent filter columns
```

---

### Mistake 16: Wrong column order in composite indexes

```text
❌ (OrderDate, CustomerID) for WHERE CustomerID = ? AND OrderDate > ?
✅ Equality columns first, range/order columns after: (CustomerID, OrderDate)
```

---

### Mistake 17: Too many indexes

```text
❌ Every column indexed "just in case" → slow writes, bloated storage, confused optimizer
✅ Indexes justified by real queries; drop unused ones (usage statistics)
```

---

### Mistake 18: Forcing index use when a scan is right

```text
❌ Index hint for a query returning 30% of the table → millions of lookups
✅ Accept the scan, or cover the query
```

---

# Plan Caching Mistakes

### Mistake 19: Unparameterized SQL

```text
❌ Literal values concatenated → plan cache bloat, compile CPU, SQL injection risk
✅ Parameters / bind variables
```

---

### Mistake 20: Misdiagnosing parameter sniffing

```text
❌ Testing with literals or local variables, concluding "the query is fast"
✅ Test with parameters as the application sends them; compare compiled vs runtime values
```

---

### Mistake 21: RECOMPILE everywhere

```text
❌ OPTION (RECOMPILE) on statements executed thousands of times per second → CPU spent compiling
✅ Recompile infrequent skew-sensitive queries; force plans or fix indexes for hot ones
```

---

### Mistake 22: Hints as the first resort

```text
❌ Hints freeze today's plan against tomorrow's data; nobody remembers why
✅ Statistics, SQL, indexes, parameters first; hints narrow, documented, reviewed (15.09)
```

---

# Pagination and Sorting Mistakes

### Mistake 23: Deep OFFSET pagination

```text
❌ OFFSET 100000 reads and discards 100,000 rows
✅ Keyset pagination with a unique tiebreaker (15.10)
```

---

### Mistake 24: Sort and hash spills ignored

```text
❌ "external merge Disk: 800MB" in the plan, runtime 10× longer
✅ Fix estimates, narrow columns, filter earlier, index order; raise memory per session if needed
```

---

### Mistake 25: COUNT(*) for existence or totals on every request

```text
❌ IF (SELECT COUNT(*) …) > 0; exact total counts on every page
✅ EXISTS; fetch N + 1 rows; cached or estimated totals
```

---

# Write and Concurrency Mistakes

### Mistake 26: Huge single-statement writes

```text
❌ UPDATE/DELETE of millions of rows in one transaction → log growth, lock escalation, replica lag
✅ Indexed batches, or partition operations (15.12)
```

---

### Mistake 27: Long transactions

```text
❌ Transactions open during user think-time or remote calls → blocking, bloat, undo growth
✅ Short transactions; idle-in-transaction timeouts
```

---

### Mistake 28: NOLOCK as a performance fix

```text
❌ Dirty, missing or duplicated rows
✅ Snapshot-based reads (MVCC, RCSI)
```

---

# Configuration Mistakes

### Mistake 29: Raising memory settings globally

```text
❌ work_mem / sort_buffer_size raised for one report → memory exhaustion under concurrency
✅ Per-session or per-query settings for known heavy workloads
```

---

### Mistake 30: Hardware before diagnosis

```text
❌ Doubling CPU for a query that scans because of an implicit conversion
✅ Diagnose first; scale only when efficient queries still exceed capacity
```

---

# Visual Representation

```text
                              OPTIMIZATION MISTAKES
                                        │
   ┌──────────┬───────────┬──────────┬──┴───────┬──────────┬──────────┬────────────┐
   ▼          ▼           ▼          ▼          ▼          ▼          ▼            ▼
 PROCESS   STATISTICS  SQL SHAPE  INDEXING  PLAN CACHE PAGINATION WRITES/LOCKS  CONFIG
 guessing  stale       non-sarg.  missing   literals   OFFSET     huge writes   global memory
 wrong q.  correlated  types      order     sniffing   spills     long txns     hardware first
 toy data  functions   SELECT *   too many  RECOMPILE  COUNT(*)   NOLOCK
 many chg.             catch-all  forced    hints
 1 run                 N+1, DIST.
   1–5       6–8         9–14      15–18      19–22      23–25      26–28        29–30
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← access paths: missing/misordered indexes (15–18); SELECT * (11)
2. JOIN        ← unindexed FKs (15); DISTINCT hiding fan-out (14); estimates (6–8)
3. WHERE       ← sargability (9), types (10), catch-all filters (12)
4. GROUP BY    ← spills (24)
5. HAVING
6. WINDOW      ← sorts an index could provide
7. SELECT      ← needed columns only (11)
8. DISTINCT    ← only when duplicates are genuine (14)
9. ORDER BY    ← unique tiebreakers; index order
10. LIMIT / FETCH / TOP   ← keyset instead of deep OFFSET (23); N + 1 instead of COUNT (25)
```

---

# How the DBMS Executes This

```text
Plan symptoms and the mistakes behind them:
  Seq/Clustered Scan with a selective filter          → 9, 10, 15
  CONVERT_IMPLICIT / cast on a column                 → 10
  estimate 1, actual 1,000,000                        → 6, 7, 8, 20
  Nested Loop with millions of inner executions        → 6, 7, 15
  Key Lookup × 500,000                                → 11, 18
  Sort / Hash spill                                    → 24
  Limit over 100,000 produced rows                    → 23
  elapsed ≫ CPU, lock waits                           → 26, 27
```

---

# Best Practices

✔ Measure first; rank by total cost; set a goal.

✔ Read actual plans; fix the first estimate error.

✔ Keep statistics fresh; add extended statistics for correlated columns.

✔ Write sargable, type-consistent, set-based SQL; list columns.

✔ Index FKs and real query patterns; equality columns first; cover hot queries.

✔ Parameterize; handle skew deliberately; hints last.

✔ Keyset pagination; avoid unnecessary sorts, counts and `DISTINCT`s.

✔ Batch large writes; keep transactions short; use snapshot reads.

✔ Tune configuration per workload; scale hardware last.

✔ Verify with realistic data and concurrency, change one thing at a time, document.

---

# Review Checklist

```text
Query review
□ No functions / arithmetic / casts on indexed columns in WHERE and ON
□ Parameter and literal types match column types
□ Explicit column list; no SELECT * in application code
□ No catch-all (@p IS NULL OR …) filters without RECOMPILE or dynamic SQL
□ NOT EXISTS instead of NOT IN over nullable columns; EXISTS instead of COUNT for existence
□ No DISTINCT masking fan-out; aggregation before joins that multiply rows
□ Keyset pagination with unique ORDER BY for deep or large lists
□ Set-based statements; no per-row queries from loops

Change review
□ Evidence: actual plan and runtime stats before and after
□ Same data, parameters, cache state and concurrency in both measurements
□ Results identical
□ Side effects measured: writes, storage, other queries' plans
□ Hints/forced plans documented with reason and date
□ Deployed reversibly; monitored in production
```

---

# 🏗️ Architecture Insight

Most of these mistakes are prevented by team habits rather than individual heroics: code review with a SQL checklist, always-on workload statistics, statistics maintenance built into data pipelines, production-like test data, and a documented tuning workflow. Make the good path the default path.

---

# ⚡ Performance Tip

The three checks with the highest payoff across real systems: functions or type conversions on indexed columns, unindexed foreign keys, and stale statistics after bulk loads.

---

# 🌍 Production Consideration

Many mistakes surface only at scale or under load—sniffed plans after a restart, lock escalation during a month-end batch, spills under concurrent reports. Monitor p99 latency, plan changes and waits continuously, not just after complaints.

---

# SQL Standard vs Vendor Differences

| Mistake area | Most affected | Why |
|--------------|---------------|-----|
| Parameter sniffing | SQL Server, Oracle, PostgreSQL (generic plans) | Global/cached plans |
| Unparameterized SQL | SQL Server, Oracle | Plan cache / shared pool pressure |
| Implicit conversion | SQL Server (Unicode), MySQL (string vs number) | Type precedence rules |
| Reader–writer blocking | SQL Server without RCSI | Locking read committed default |
| MVCC bloat from long transactions | PostgreSQL | VACUUM horizon |
| Stale histograms | MySQL | Histograms never auto-refresh |
| No hints to fall back on | PostgreSQL | By design (extensions only) |

> **Portability Tip:** The process and SQL-shape practices apply to every engine. The engine-specific risks in the table deserve extra attention on those engines.

---

# Interview Questions

## Basic

1. Why is `SELECT *` bad for performance?
2. Why should you rank queries by total time?
3. Why are stale statistics a problem?

## Intermediate

4. How can a parameter type cause a scan?
5. Why is deep `OFFSET` pagination slow?
6. Why is `NOLOCK` not a performance fix?

## Advanced

7. Name five plan symptoms and the mistakes they usually indicate.
8. How would you set up a team process that prevents most of these mistakes?

---

# Hands-on Exercises

## Exercise 1

Review ten production queries against the query checklist and fix what you find.

---

## Exercise 2

Find unindexed foreign keys in a schema and measure the effect of indexing one.

---

## Exercise 3

Take a past tuning change and check it against the change-review checklist.

---

# Related Topics

- **15.07 — Writing Optimizer-Friendly SQL**
- **15.15 — A Systematic Tuning Workflow**
- **15.17 — Query Optimization Cheat Sheet & Visual Knowledge Map**
- **10.16 — Common Index Mistakes & Best Practices**
- **06.13 — Common WHERE Mistakes & Best Practices**

---

# Summary

Query optimization mistakes fall into eight groups: process (guessing, tuning the wrong query, unrealistic data, many changes at once, single warm runs), statistics (stale, correlated, function-hidden), SQL shape (non-sargable predicates, type mismatches, `SELECT *`, catch-all filters, N+1 loops, `DISTINCT` masking joins), indexing (missing, misordered, excessive, forced), plan caching (literals, misdiagnosed sniffing, `RECOMPILE` everywhere, hints first), pagination and sorting (deep `OFFSET`, spills, counts), writes and concurrency (huge statements, long transactions, `NOLOCK`) and configuration (global memory settings, hardware first). Evidence-based tuning, the review checklists and team habits prevent most of them.
