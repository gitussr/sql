---
title: "16.11 - Estimates vs Actuals (Finding Cardinality Misestimates)"
description: "How to find the misestimate that broke a plan: comparing estimated and actual rows correctly on each engine, the ratio rule and the first-divergence rule, how errors propagate up through joins and aggregates, the common causes (stale statistics, skew, correlated predicates, functions, parameters, table variables, row goals), how each cause looks in a plan, and how to confirm a fix."
chapter: 16
section: 16.11
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 25 min
lastUpdated: 2026-10-01
---

# 16.11 Estimates vs Actuals (Finding Cardinality Misestimates)

---

# Learning Objectives

After completing this section, you will be able to:

- Compare estimated and actual rows correctly on every engine.
- Find the lowest operator where estimates first go wrong.
- Explain how one misestimate propagates and changes the rest of the plan.
- Recognise the common causes of misestimates from plan evidence.
- Confirm that a fix improved the estimate and the plan.

---

# Why Estimates Decide Everything

The optimizer chooses access paths, join order, join algorithms, memory grants and parallelism from **estimated rows** (Section 15.03). When an estimate is wrong, every decision built on it can be wrong:

```text
estimate 12 rows   → nested loop, seek + lookup, tiny memory grant, serial plan
actual 480,000     → 480,000 inner executions, 480,000 lookups, spills, one CPU busy
```

Reading actual plans is mostly the skill of finding **where** the estimate went wrong and **why**.

---

# Comparing Correctly

| Engine | Estimate | Actual | Compare |
|--------|----------|--------|---------|
| PostgreSQL | `rows=` (per loop) | `actual … rows=` (per loop) | Directly (both per loop); total = × `loops` |
| MySQL `EXPLAIN ANALYZE` | `rows=` (per loop) | `actual … rows=` (per loop) | Directly |
| SQL Server | Estimated Rows **Per Execution** (and for All Executions, 2019+ SSMS) | Actual Rows **for All Executions** | Actual ÷ executions vs per-execution estimate |
| Oracle | `E-Rows` (per start) | `A-Rows` (total) | `E-Rows × Starts` vs `A-Rows` |

Use the **ratio**, not the difference: estimate 10 / actual 1,000 (100×) matters far more than estimate 1,000,000 / actual 1,100,000 (1.1×). A common rule of thumb: investigate anything off by **10× or more**, in either direction.

---

# The First-Divergence Rule

Misestimates propagate upward: an error at a leaf multiplies through every join above it. So the operator with the biggest error is often not the cause. Find the **lowest** operator (closest to the leaves) where the estimate first diverges:

```text
Hash Join                       est 1,200        actual 9,600,000    ← 8,000× off (a symptom)
  -> Nested Loop                est 300          actual 2,400,000    ← 8,000× off (a symptom)
        -> Index Scan Orders    est 12           actual 96,000       ← 8,000× off: FIRST divergence
              Index Cond: (status = 'Pending' AND region = 'APAC')
        -> Index Scan OrderItems  est 25 per loop  actual 25 per loop  ← fine
  -> Seq Scan Products          est 50,000       actual 50,000       ← fine
```

The fix belongs to the `Orders` estimate—probably correlated predicates (below). Fixing anything higher up treats symptoms.

---

# How Errors Propagate

```text
join estimate ≈ |outer| × |inner| × join selectivity
      an outer estimate 100× too low → join estimate ~100× too low
      → next join's outer input 100× too low → ...
two independent 10× errors in a three-table join can compound to 100×
aggregates cap the error: GROUP BY Country can never return more than ~150 rows
```

This is why misestimates matter most in **multi-join** queries, and why the deepest error is the one worth fixing.

---

# Common Causes and Their Plan Signatures

| Cause | Plan signature | Fix (Chapter 15) |
|-------|----------------|------------------|
| Stale statistics | Large error on a simple predicate, often on recent data (`OrderDate >= last week`) | `ANALYZE` / `UPDATE STATISTICS` / `DBMS_STATS` |
| Skewed values | Error for some parameter values but not others; `= 'IN'` vs `= 'NZ'` | Histograms, more statistics detail, sniffing handling |
| Correlated predicates | Each predicate alone estimates well; together badly underestimated (`City = 'Mumbai' AND Country = 'IN'`) | Extended / multi-column statistics |
| Functions on columns | Fixed-guess estimates (PostgreSQL often 0.5% of rows for `= f(col)`, SQL Server fixed percentages) | Sargable rewrite, expression index / statistics |
| Parameters / sniffing | Estimate matches the compiled value, not the runtime value | Section 15.08 |
| Table variables / temp tables without stats | SQL Server table variable estimated at 1 row (before 2019's deferred compilation) | Temp tables, recompile, deferred compilation |
| Row goals | Estimate assumes early stop under `LIMIT`/`TOP`/`EXISTS`; actual reads far more | Better index, remove row goal, rewrite |
| Multi-statement / opaque functions | Fixed estimates for table-valued functions (e.g., 1 or 100 rows) | Inline functions, interleaved execution (SQL Server 2017+) |
| Joins on non-key or computed columns | Join output wildly over- or underestimated | Statistics on join columns, constraints, rewrite |

---

# Reading the Signatures

### Stale statistics

```text
Index Scan using ix_orders_orderdate on orders  (rows=1 …) (actual rows=410,882 loops=1)
  Index Cond: (orderdate >= '2026-09-24'::date)
```

Estimate of 1 for a date range above the statistics' highest known value: the last week's data was loaded after statistics were gathered. (Newer engines extrapolate for ascending keys; older or disabled settings do not.)

### Correlated predicates

```text
Index Scan on customers  (rows=82 …) (actual rows=61,400 loops=1)
  Filter: ((city = 'Mumbai') AND (country = 'IN'))
```

`City = 'Mumbai'` matches ~10% of Indian customers, but the optimizer multiplied two independent selectivities.

```sql
-- PostgreSQL: teach the optimizer about the dependency
CREATE STATISTICS st_customers_city_country (dependencies, mcv) ON City, Country FROM Customers;
ANALYZE Customers;
```

### Parameter sniffing

```text
SQL Server root node:
  @Country  Compiled Value: ('NZ')   Runtime Value: ('IN')
Index Seek … Estimated Rows 4,200    Actual Rows 600,000
```

### Row goal

```text
Limit  (rows=10)
  -> Index Scan using ix_orders_createdat on orders  (rows=10 …) (actual rows=10 loops=1)
        Filter: (status = 'Pending')
        Rows Removed by Filter: 4,812,330
```

The estimate of 10 was right for the *output*; the hidden error is how many rows had to be **read** to find them.

---

# Overestimates Matter Too

Underestimates cause nested loops over huge inputs, spills and too-small memory grants. Overestimates cause:

```text
• hash joins and scans where a few seeks would do
• huge memory grants → other queries wait for memory (SQL Server RESOURCE_SEMAPHORE)
• needless parallelism for small queries
• JIT compilation on small PostgreSQL queries (cost above jit_above_cost)
```

---

# Confirming the Fix

```text
before:  Index Scan on orders   est 12       actual 96,000   → Nested Loop, 96,000 lookups, 4.1 s
fix:     CREATE STATISTICS … ON Status, Region; ANALYZE Orders;
after:   Index Scan on orders   est 88,000   actual 96,000   → Hash Join, 0.6 s
```

A good fix changes the **estimate** first; the better plan follows. If you change the plan (with a hint) without changing the estimate, everything above the forced operator is still costed on wrong numbers.

---

# Visual Representation

```text
   operator                  estimate     actual       ratio
   Hash Join                    1,200    9,600,000    8000×  ┐
   Nested Loop                    300    2,400,000    8000×  │ symptoms (propagated)
   Index Scan Orders               12       96,000    8000×  ┘ ◀── FIRST divergence = cause
   Index Scan OrderItems  25/loop      25/loop        1×      ok
   Seq Scan Products           50,000       50,000    1×      ok
                         walk up from the leaves; stop at the first ≥ 10× gap
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← leaf estimates from table and column statistics
2. JOIN        ← join estimates multiply input estimates; errors compound here
3. WHERE       ← predicate selectivity: MCVs, histograms, independence assumption
4. GROUP BY    ← group count from distinct-value statistics
5. HAVING      ← often a fixed-guess selectivity
6. WINDOW      ← row count unchanged; sort memory sized from the estimate
7. SELECT
8. DISTINCT    ← distinct-value estimates
9. ORDER BY    ← sort memory grant sized from the estimate
10. LIMIT / FETCH / TOP   ← row goal lowers estimates below it
```

---

# How the DBMS Executes This

```text
optimization:  statistics → selectivity per predicate → rows per operator → cost → plan
execution:     each operator counts real rows
EXPLAIN ANALYZE / actual plan prints both side by side
the optimizer never sees the actual counts of THIS run (except adaptive features and
feedback mechanisms: SQL Server CE / memory grant feedback, Oracle statistics feedback)
```

---

# 🏗️ Architecture Insight

Schemas that help estimation also help performance: declared foreign keys and `NOT NULL`, normalised columns rather than packed strings, separate columns rather than computed predicates, and naturally independent attributes. Every place the optimizer must guess is a place a plan can go wrong.

---

# ⚡ Performance Tip

Look at estimates **before** time. The slowest operator tells you where time went; the first misestimate tells you why the optimizer sent it there.

---

# 🌍 Production Consideration

Estimates depend on statistics that change over time. A plan that was right last month can go wrong after a data load, a skew shift or a statistics refresh with a small sample. Schedule statistics maintenance after bulk changes, and alert on plan changes for critical queries (Section 16.14).

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Estimate vs actual in one view | ❌ | ✅ | ✅ (`EXPLAIN ANALYZE`) | ✅ | ✅ (`ALLSTATS`) | Limited |
| Multi-column statistics | ❌ | `CREATE STATISTICS` | Histograms (single column) | Multi-column stats | Column groups | `sqlite_stat4` (multi-column prefixes) |
| Automatic estimate feedback | ❌ | ❌ | ❌ | CE feedback (2022), memory grant feedback | Statistics feedback, adaptive plans | ❌ |
| Fixed guesses for functions | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |

> **Portability Tip:** Every optimizer assumes independence between predicates and uses fixed guesses where it has no statistics. The first-divergence method works identically everywhere.

---

# Common Mistakes

### Mistake 1

Fixing the operator with the largest error instead of the lowest one.

---

### Mistake 2

Comparing per-execution estimates with total actuals.

---

### Mistake 3

Forcing a join type with a hint while leaving the misestimate in place.

---

### Mistake 4

Ignoring overestimates because "the plan is safe".

---

# Best Practices

✔ Compare estimates and actuals at every operator, normalised by executions.

✔ Walk up from the leaves and stop at the first gap of 10× or more.

✔ Match the plan signature to a cause before choosing a fix.

✔ Fix estimates (statistics, SQL, parameters) before forcing plans.

✔ Confirm that the new plan's estimates are close to actuals.

---

# Interview Questions

## Basic

1. What is a cardinality misestimate?
2. Why should you compare estimates and actuals as a ratio?
3. Why does an underestimate often lead to a nested loop join?

## Intermediate

4. How do you compare estimates and actuals in SQL Server and Oracle plans?
5. What plan evidence suggests correlated predicates?
6. Why is the operator with the largest error not necessarily the cause?

## Advanced

7. Explain how a row goal can hide a misestimate in a plan whose output estimate is exactly right.
8. What problems can an overestimate cause?

---

# Hands-on Exercises

## Exercise 1

Find a plan with at least one 10× misestimate and identify the lowest operator where it begins.

---

## Exercise 2

Create a correlated-column misestimate, fix it with multi-column statistics, and compare plans.

---

## Exercise 3

Load new rows beyond the statistics' range, query them, then refresh statistics and compare estimates.

---

# Related Topics

- **15.03 — Statistics, Cardinality Estimation and the Cost Model**
- **15.08 — Parameter Sniffing, Plan Caching and Prepared Statements**
- **10.12 — Selectivity, Cardinality and Statistics**
- **16.09 — Join Operators (Nested Loop, Hash and Merge)**
- **16.12 — Plan Warnings and Red Flags (Spills, Conversions and Residual Predicates)**

---

# Summary

Every plan decision rests on estimated rows, so the most valuable thing in an actual plan is the comparison of estimated and actual rows—normalised by executions, judged as a ratio, and investigated at 10× or more. Errors propagate and compound upward through joins, so the cause is the lowest operator where estimates first diverge. Stale statistics, skew, correlated predicates, functions, sniffed parameters, opaque objects and row goals each leave a recognisable signature. Fix the estimate first—statistics, SQL shape, parameter handling—and confirm the fix by seeing estimates close to actuals and the better plan that follows.
