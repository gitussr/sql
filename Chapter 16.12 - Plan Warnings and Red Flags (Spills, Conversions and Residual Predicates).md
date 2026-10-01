---
title: "16.12 - Plan Warnings and Red Flags (Spills, Conversions and Residual Predicates)"
description: "The warnings and red flags worth checking in every execution plan: spills of sorts and hashes to disk, implicit conversions that block index seeks, residual predicates that read far more rows than they return, excessive lookups, scans on the inner side of nested loops, missing join predicates, memory grant problems, non-sargable predicates, user-defined functions, eager spools, and how each appears on PostgreSQL, SQL Server, MySQL, Oracle and SQLite."
chapter: 16
section: 16.12
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 25 min
lastUpdated: 2026-10-01
---

# 16.12 Plan Warnings and Red Flags (Spills, Conversions and Residual Predicates)

---

# Learning Objectives

After completing this section, you will be able to:

- Recognise the engine-generated warnings in plans.
- Find red flags the engine does not warn about.
- Explain the cause of each warning and the usual fix.
- Use a short checklist to scan any plan quickly.

---

# The Red-Flag Checklist

```text
 1. Spills            sort / hash / aggregate wrote to disk
 2. Conversions       CONVERT_IMPLICIT / INTERNAL_FUNCTION / ::text casts on a column
 3. Residual filters  rows read ≫ rows returned on a seek or scan
 4. Lookups × N       hundreds of thousands of key / rowid lookups
 5. Inner scans       scan with loops/executions ≫ 1 on the inner side of a nested loop
 6. No join predicate Cartesian product (missing ON condition)
 7. Grant problems    excessive grant / grant waits / spills despite a grant
 8. Misestimates      ≥ 10× between estimated and actual rows (Section 16.11)
 9. Opaque functions  scalar UDFs, multi-statement TVFs, row-by-row calls
10. Eager spools      indexes or tables built in tempdb on every execution
11. Big sorts         sorting millions of rows to return a few
12. No pruning        every partition scanned
```

---

# 1. Spills

```text
PostgreSQL   Sort Method: external merge  Disk: 61240kB
             Hash … Batches: 8 (originally 1)
             HashAggregate … Batches: 5  Disk Usage: 98304kB
             Buffers: … temp read=7655 written=7655
SQL Server   ⚠ Operator used tempdb to spill data during execution with spill level 1 and 1 spilled thread(s)
             (Sort Warnings / Hash Warnings, SpillToTempDb in XML)
Oracle       Used-Tmp column, Used-Mem with (1) one-pass or (n) multi-pass
MySQL        Sort_merge_passes, Created_tmp_disk_tables status counters
```

**Causes**: memory limit too low for the operator, or—more often—an **underestimate** that sized the memory too small.
**Fixes**: fix the estimate; reduce the rows reaching the operator (filter earlier, narrower rows); use index order to avoid the sort; raise memory for that session or query.

---

# 2. Implicit Conversions

```text
SQL Server   ⚠ Type conversion in expression (CONVERT_IMPLICIT(nvarchar(20),[o].[OrderCode],0))
               may affect "SeekPlan" in query plan choice
PostgreSQL   Filter: ((ordercode)::text = '12345'::text)            ← on a column of another type
             Filter: ((orderid)::numeric = 12345.0)
Oracle       filter(TO_NUMBER("O"."ORDERCODE")=12345)
             filter(SYS_OP_C2C("O"."CODE")=:B1)                      ← VARCHAR2 column vs NVARCHAR2 bind
MySQL        type = ALL / index despite an index on the column; Warning 1739 in SHOW WARNINGS
```

The conversion is applied to the **column**, so the index cannot be seeked and every row is converted. Classic causes: `NVARCHAR` parameters against `VARCHAR` columns (.NET, JDBC defaults), number literals against string columns, mismatched collations or character sets in joins.
**Fix**: make the parameter or literal the column's type; align column types used in joins (Sections 12.08, 15.07).

Note: SQL Server also warns `may affect "CardinalityEstimate"` for conversions in the `SELECT` list—usually harmless. The one that matters is `SeekPlan`.

---

# 3. Residual Predicates

```text
PostgreSQL   Index Scan … Index Cond: (customerid = 42)
               Filter: (status = 'Pending')   Rows Removed by Filter: 499,880
SQL Server   Index Seek  Seek Predicates: CustomerID = 42   Predicate: Status = 'Pending'
               Actual Number of Rows Read 500,000   Actual Number of Rows 120
Oracle       access("CUSTOMERID"=42)  filter("STATUS"='Pending')  (child A-Rows 500,000, parent 120)
MySQL        key_len shorter than expected; Using where with large rows
```

The engine reads 500,000 rows to return 120.
**Fix**: put the selective predicate in the index key—`(CustomerID, Status)`—or make it sargable so it can be a seek predicate.

---

# 4. Lookups × N

```text
Key Lookup (Clustered)  Number of Executions 812,004       ← SQL Server
TABLE ACCESS BY INDEX ROWID  A-Rows 812,004  Buffers 830,512   ← Oracle
Index Scan … (no Index Only Scan) with Buffers far above the index size   ← PostgreSQL
```

**Fix**: cover the query (add the looked-up columns to the index), select fewer columns, or accept a scan if the query genuinely needs a large fraction of the table.

---

# 5. Scans on the Inner Side

```text
Nested Loop  (actual rows=12,000 loops=1)
  -> Seq Scan on customers c   (actual rows=12,000 loops=1)
  -> Seq Scan on orders o      (actual rows=1 loops=12,000)       ← 12,000 full scans of Orders!
        Filter: (customerid = c.customerid)
```

Usually a missing index on the join column, or a non-sargable join predicate (`ON CAST(o.CustomerRef AS INT) = c.CustomerID`). Also check SQL Server's `Table Spool (Lazy Spool)` on an inner side, which may be rescanned many times.

---

# 6. No Join Predicate

```text
SQL Server   ⚠ No Join Predicate (on Nested Loops)
PostgreSQL   Nested Loop with no Join Filter and no parameterized inner Index Cond
Oracle       MERGE JOIN CARTESIAN / BUFFER SORT
MySQL        Using join buffer (Block Nested Loop / hash join) with no ref and no condition
```

A Cartesian product—every row × every row—often from a missing `ON` condition, a wrong alias, or comma joins with a forgotten `WHERE` (Section 07.07). Sometimes intentional and tiny (a one-row parameter table), but check.

---

# 7. Memory Grant Problems

```text
SQL Server   ⚠ The query memory grant detected "ExcessiveGrant", which may impact the reliability.
               Grant size: Initial 1,048,576 KB, Final 1,048,576 KB, Used 4,096 KB
             MemoryGrantInfo: GrantWaitTime = 12,400 ms                 ← waited 12 s for memory
Oracle       OMem / 1Mem far above Used-Mem
PostgreSQL   (per-operator work_mem; look for spills instead)
```

Overestimates waste memory and make other queries wait; underestimates cause spills. Both trace back to estimates (Section 16.11). SQL Server 2017+ memory grant feedback adjusts grants for repeated executions.

---

# 8–12. Other Red Flags

```text
 8 Misestimates      est 12 / actual 96,000 → Section 16.11

 9 Opaque functions  SQL Server: Compute Scalar calling a scalar UDF; "TSQLUserDefinedFunctionsNotParallelizable"
                     in NonParallelPlanReason; multi-statement TVF estimated at 1 or 100 rows
                     PostgreSQL: Function Scan; SubPlan executed once per row (loops = N)
                     Oracle: high recursive calls; FILTER with a subquery run per row

10 Eager spools      SQL Server Index Spool (Eager Spool) → the plan builds a temporary index every run:
                     create the permanent index it describes

11 Big sorts         Sort input millions of rows, query returns 20 → index order + early stop

12 No pruning        PostgreSQL: no "Subplans Removed", every partition listed
                     Oracle: PARTITION RANGE ALL · SQL Server: Actual Partition Count = all
```

---

# What Is Not a Red Flag

```text
✔ a full scan of a small table, or of a large table when most rows are needed
✔ a hash join in a reporting query over large inputs
✔ a sort of a few thousand rows in memory
✔ a SQL Server "CardinalityEstimate" conversion warning on a SELECT-list expression
✔ parallelism in a large analytical query
✔ cost percentages that look high on cheap operators (they are estimates)
```

Red flags are where to look first, not proof of a problem. Confirm with actual rows, reads and time.

---

# Visual Representation

```text
              ┌────────── TOO MUCH WORK ──────────┐  ┌──── WRONG PLAN ────┐  ┌── RESOURCES ──┐
  plan  ───▶  residual filters · lookups × N        misestimates ≥ 10×      spills
              inner scans · big sorts · no pruning  conversions (no seek)   grant waits /
              no join predicate · eager spools      opaque functions        excessive grants
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← no pruning, inner scans, lookups × N, eager spools
2. JOIN        ← no join predicate, nested loop over misestimates, hash spills
3. WHERE       ← implicit conversions, residual predicates, non-sargable expressions
4. GROUP BY    ← hash aggregate spills
5. HAVING
6. WINDOW      ← sort spills under window operators
7. SELECT      ← scalar UDFs in Compute Scalar; SELECT * causing lookups
8. DISTINCT    ← dedup after fan-out
9. ORDER BY    ← big sorts, sort spills
10. LIMIT / FETCH / TOP   ← row-goal misestimates, OFFSET waste
```

---

# How the DBMS Executes This

```text
Warnings are produced at two moments:
  compile time:  implicit conversions affecting seeks, missing join predicates,
                 missing indexes, unparallelizable functions (plan XML / notes)
  run time:      spills, grant waits, excessive grants, actual rows read
                 (only in ACTUAL plans and runtime statistics)
An estimated plan cannot show run-time warnings—another reason to prefer actual plans.
```

---

# 🏗️ Architecture Insight

Most red flags have schema-level root causes: inconsistent data types across tables and application layers (conversions), missing foreign-key indexes (inner scans), wide rows and no covering indexes (lookups), business logic in scalar functions (opaque functions). Fixing them once in the design removes whole classes of warnings.

---

# ⚡ Performance Tip

In SQL Server, search the plan XML for `<Warnings`, `CONVERT_IMPLICIT`, `SpillToTempDb` and `EagerSpool`. In PostgreSQL, search the text for `external`, `Batches:`, `Rows Removed`, `temp read` and `loops=` with large values. A one-minute scan finds most problems.

---

# 🌍 Production Consideration

Many red flags only appear under production conditions: conversions only with the application's driver parameter types, spills only with production-sized inputs, grant waits only under concurrency. Capture actual plans and runtime statistics from production (Section 16.15) before declaring a plan clean.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Explicit warnings in plan | ❌ | ❌ (evidence in node details) | `SHOW WARNINGS` after `EXPLAIN` | ✅ (Warnings element) | Notes section | ❌ |
| Spill visibility | ❌ | ✅ | Status counters | ✅ | ✅ | ❌ |
| Conversion visibility | ❌ | Casts in Filter | `SHOW WARNINGS` | `CONVERT_IMPLICIT` warning | `INTERNAL_FUNCTION`, `TO_NUMBER` | ❌ |
| Rows read vs returned | ❌ | `Rows Removed by Filter` | Estimate only | `Actual Rows Read` | Child vs parent `A-Rows` | ❌ |
| Missing index hints | ❌ | ❌ | ❌ | ✅ | Advisors | `AUTOMATIC` index |

> **Portability Tip:** Only SQL Server prints many warnings explicitly. On other engines, the same problems appear as evidence—casts in filters, removed-row counts, temp buffers—that you must look for.

---

# Common Mistakes

### Mistake 1

Ignoring a `SeekPlan` conversion warning because the query "uses an index" (as a scan).

---

### Mistake 2

Raising server-wide memory to fix spills caused by a misestimate.

---

### Mistake 3

Treating every warning as critical, including `CardinalityEstimate` conversions in the `SELECT` list.

---

### Mistake 4

Looking for warnings in estimated plans, where run-time warnings never appear.

---

# Best Practices

✔ Scan every actual plan with the twelve-point checklist.

✔ Fix conversions by matching parameter and column types.

✔ Move residual predicates into index keys when selective.

✔ Fix the estimate behind spills and grant problems before adding memory.

✔ Confirm each red flag with actual rows, reads and time.

---

# Interview Questions

## Basic

1. What is a spill?
2. What is an implicit conversion warning?
3. What is a residual predicate?

## Intermediate

4. Why does an `NVARCHAR` parameter against a `VARCHAR` column cause a scan?
5. What does "No Join Predicate" mean?
6. Why do misestimates cause spills?

## Advanced

7. What does an Eager Index Spool tell you about your indexes?
8. Explain why some warnings appear only in actual plans.

---

# Hands-on Exercises

## Exercise 1

Create an implicit conversion by comparing a string column with a number; find the evidence in your engine's plan, then fix it.

---

## Exercise 2

Find a seek with a residual predicate and measure rows read versus rows returned before and after extending the index key.

---

## Exercise 3

Make a sort spill, then remove the spill without changing server-wide memory settings.

---

# Related Topics

- **06.12 — SARGability and Index-Friendly Predicates**
- **12.08 — Type Conversion (CAST, CONVERT and TRY_CAST)**
- **15.07 — Writing Optimizer-Friendly SQL**
- **16.11 — Estimates vs Actuals (Finding Cardinality Misestimates)**
- **16.16 — Common Execution Plan Mistakes & Best Practices**

---

# Summary

A handful of red flags explain most bad plans: spills of sorts, hashes and aggregates; implicit conversions that turn seeks into scans; residual predicates that read far more rows than they return; huge numbers of lookups; scans on the inner side of nested loops; missing join predicates; memory grant problems; misestimates; opaque functions; eager spools; big sorts; and unpruned partitions. SQL Server prints many of them as explicit warnings, while other engines show them as evidence in node details. Many appear only in actual plans and production conditions. Treat each as a lead, confirm it with actual numbers, and fix the underlying cause—usually types, indexes or estimates—rather than the symptom.
