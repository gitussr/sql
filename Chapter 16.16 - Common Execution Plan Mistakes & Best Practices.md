---
title: "16.16 - Common Execution Plan Mistakes & Best Practices"
description: "A catalogue of the most common mistakes in getting and reading execution plans—grouped into capturing plans, reading structure, arithmetic, interpreting operators, diagnosing estimates, acting on plans and production practice—each with the symptom and the correction, followed by consolidated best practices and a plan-review checklist."
chapter: 16
section: 16.16
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 25 min
lastUpdated: 2026-10-01
---

# 16.16 Common Execution Plan Mistakes & Best Practices

---

# Learning Objectives

After completing this section, you will be able to:

- Recognise the most common mistakes made when getting and reading plans.
- Correct each one with the right technique.
- Apply a consolidated set of plan-reading best practices.
- Review any plan with a short checklist.

---

# Capturing Plans

### Mistake 1: Reading the estimated plan to explain a slow run

```text
❌ "The plan says 12 rows and a nested loop—looks fine"
✅ Get the actual plan: estimated 12, actual 480,000 is the whole story
```

---

### Mistake 2: Explaining a different statement from the one the application runs

```text
❌ Literal values pasted into a query window; different parameter types; different SET options
✅ Reproduce the parameterized statement and types (sp_executesql, PREPARE/EXECUTE),
   or retrieve the real plan from the plan cache / Query Store / auto_explain
```

---

### Mistake 3: Running EXPLAIN ANALYZE on a write without protection

```text
❌ EXPLAIN ANALYZE DELETE FROM Events WHERE … ;      -- the rows are gone
✅ BEGIN; EXPLAIN (ANALYZE, BUFFERS) DELETE …; ROLLBACK;   -- on a replica or test copy if possible
```

---

### Mistake 4: Capturing plans on unrealistic data

```text
❌ A plan from a 1,000-row development table
✅ Production-sized, production-skewed data with production statistics and settings
```

---

# Reading Structure

### Mistake 5: Reading from the top down

```text
❌ "First it sorts, then it joins…"
✅ Start at the leaves; rows flow upward; the root runs last (and pulls first)
```

---

### Mistake 6: Mixing up build/probe or outer/inner sides

```text
❌ Assuming the first child is always the build side
✅ PostgreSQL: build under "Hash" (second child) · SQL Server: build = top input ·
   Oracle: build = first child · nested loops: outer = first child everywhere
```

---

### Mistake 7: Skipping the root node and summary lines

```text
❌ Jumping straight to the "most expensive" operator
✅ Read totals first: execution time, planning time, JIT, triggers (PostgreSQL);
   grant, compiled vs runtime parameters, CPU vs elapsed, waits, warnings (SQL Server root);
   Notes (Oracle)
```

---

# Arithmetic

### Mistake 8: Forgetting loops and executions

```text
❌ "The inner seek returns 4 rows in 0.006 ms"
✅ loops = 500,000 → 2,000,000 rows and 3 seconds in total
```

---

### Mistake 9: Comparing per-execution estimates with total actuals

```text
❌ SQL Server: Estimated Rows Per Execution 3 vs Actual Rows (all executions) 41,880 → "14,000× off!"
✅ Divide by Number of Executions first (Oracle: E-Rows × Starts vs A-Rows)
```

---

### Mistake 10: Treating inclusive time as exclusive

```text
❌ "The Hash Join takes 7.2 ms" (including its children)
✅ Subtract children's time, or use a visualizer that shows exclusive time
```

---

### Mistake 11: Treating cost as time

```text
❌ "This operator is 61% of the cost, so it's the slow part"
✅ Cost and cost % are estimates, even in actual plans; use actual rows, time, reads
```

---

# Interpreting Operators

### Mistake 12: Assuming every scan is bad

```text
❌ Forcing an index for a query that returns 30% of the table
✅ Judge by rows returned / rows read and by executions
```

---

### Mistake 13: Assuming "uses an index" means "efficient"

```text
❌ Index Seek → 812,000 Key Lookups; Index Scan with Rows Removed by Filter: 499,880
✅ Check residual predicates, rows read vs returned, lookups × executions
```

---

### Mistake 14: Missing spills and memory problems

```text
❌ Not noticing "external merge", Batches > 1, spill warnings, temp buffers, grant waits
✅ Check every sort, hash and aggregate for memory and spills
```

---

### Mistake 15: Ignoring what LIMIT sits on

```text
❌ "It has LIMIT 20, so it's cheap"
✅ Look below the Limit/Top: a blocking sort or a row-goal scan can read millions of rows
```

---

# Diagnosing Estimates

### Mistake 16: Fixing the symptom operator

```text
❌ Hinting the top-level join because it is 8,000× off
✅ Walk up from the leaves; fix the FIRST operator where estimates diverge
```

---

### Mistake 17: Forcing a plan without fixing the estimate

```text
❌ OPTION (HASH JOIN) / USE_HASH hint; everything above still costed on wrong rows
✅ Statistics, multi-column statistics, sargable SQL, parameter handling first (Chapter 15)
```

---

### Mistake 18: Ignoring overestimates

```text
❌ "Too many rows estimated is safe"
✅ Overestimates cause excessive grants, needless scans and parallelism, JIT on small queries
```

---

# Acting on Plans

### Mistake 19: Creating every suggested missing index

```text
❌ CREATE INDEX for each Missing Index hint / AUTOMATIC index line
✅ Consolidate into a deliberate index design for the workload (Section 10.15)
```

---

### Mistake 20: Comparing plans unfairly

```text
❌ Cold "before", warm "after"; different parameters; statistics refreshed in between
✅ Hold everything constant; compare logical reads and CPU; verify identical results
```

---

### Mistake 21: Changing several things and reading one plan

```text
❌ New index + rewritten query + memory setting, then one "after" plan
✅ One change, one new plan, one comparison
```

---

# Production Practice

### Mistake 22: Having no plan history when an incident happens

```text
❌ "We can't reproduce it and the plan is no longer in the cache"
✅ Query Store / AWR / auto_explain / slow logs always on; tested retrieval runbook
```

---

### Mistake 23: Leaving forced plans unmanaged

```text
❌ Forced plans from two years ago, no owner, no reason, blocking better plans
✅ Every forced plan documented, reviewed after upgrades, removed when the cause is fixed
```

---

### Mistake 24: Sharing raw plans

```text
❌ Pasting production plans with customer emails and account numbers into public tools
✅ Scrub literals and parameter values; use private or self-hosted visualizers
```

---

# Consolidated Best Practices

```text
GET            actual plans, with buffers / I/O, for the statement the application really runs
ORIENT         leaves first; identify outer/inner and build/probe; read totals and root properties
NORMALISE      multiply per-loop numbers by loops; divide totals by executions; subtract children
ESTIMATES      compare estimated vs actual at every operator; fix the first 10× divergence
WORK           rows read vs rows returned; lookups × executions; scans on inner sides
RESOURCES      spills, grants, temp usage, parallel skew, waits
ACT            fix causes (statistics, SQL, types, indexes, parameters) before forcing plans
VERIFY         compare fairly: same data, parameters, settings; reads and CPU; identical results
OPERATE        capture workload stats and plan history always; actual plans on thresholds
PROTECT        restrict and scrub plans; roll back analyzed writes
```

---

# Plan-Review Checklist

```text
☐ Is this the ACTUAL plan of the statement the application runs (parameters, types, settings)?
☐ Total time, CPU vs elapsed, planning/compile time, JIT, triggers, waits?
☐ For every leaf: scan or seek? rows read vs returned? residual predicates? executions?
☐ For every join: algorithm, outer/build side, inner executions, spills?
☐ Estimated vs actual rows: where is the first ≥ 10× divergence, and why?
☐ Sorts, aggregates, windows: needed? how many rows? memory? spills?
☐ Limit/Top: what blocks below it? rows read below it?
☐ Warnings: conversions, no join predicate, grants, spools, unpruned partitions?
☐ Parallelism: appropriate? balanced? workers launched?
☐ After the fix: same results, fewer reads, better estimates, verified under realistic load?
```

---

# Visual Representation

```text
   GET ──▶ ORIENT ──▶ NORMALISE ──▶ ESTIMATES ──▶ WORK ──▶ RESOURCES ──▶ ACT ──▶ VERIFY
   actual   leaves,     loops,        first 10×      rows read,  spills,      cause      fair
   plan     totals,     executions,   divergence     lookups,    grants,      first,     comparison
            root props  exclusive                    inner scans parallelism  hints last
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← most access mistakes: scans judged wrongly, lookups ignored
2. JOIN        ← most arithmetic mistakes: loops and executions forgotten
3. WHERE       ← residual predicates and conversions missed
4. GROUP BY    ← spills missed
5. HAVING
6. WINDOW      ← sorts under windows missed
7. SELECT      ← SELECT * causing lookups
8. DISTINCT    ← dedup after fan-out
9. ORDER BY    ← big sorts accepted
10. LIMIT / FETCH / TOP   ← "it has a LIMIT, so it's cheap"
```

---

# How the DBMS Executes This

```text
Nothing in the engine prevents these mistakes: EXPLAIN prints numbers, and the
reader decides what they mean. Most mistakes are reading errors—direction, arithmetic,
estimates versus facts—rather than missing information in the plan.
```

---

# 🏗️ Architecture Insight

Teams that rarely make these mistakes have institutionalised plan reading: a shared checklist, a standard capture setup, a runbook per engine, plan review for new hot-path queries, and post-incident notes that record which plan changed and why.

---

# ⚡ Performance Tip

Before touching anything, write one sentence: "This query is slow because operator X does Y, caused by Z." If you cannot fill in all three from the plan, you are not ready to change the query.

---

# 🌍 Production Consideration

The costliest mistake is acting on a plan that does not represent production: different data, parameters, settings or version. When in doubt, get the plan from production's own capture mechanisms.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Rows per loop vs total | ❌ | Per loop | Per loop | Total (per-execution estimate) | `A-Rows` total, `E-Rows` per start | Total |
| Explicit warnings | ❌ | ❌ | `SHOW WARNINGS` | ✅ | Notes | ❌ |
| Inclusive timing | ❌ | ✅ | ✅ | Row mode inclusive | ✅ | ❌ |
| Safe analyze of writes | ❌ | Transaction + rollback | Plain `EXPLAIN` for most writes | Transaction + rollback | Transaction + rollback | `EXPLAIN QUERY PLAN` only |

> **Portability Tip:** Most plan-reading mistakes are about direction and arithmetic, and the rules differ per engine. Keep the table above next to you until the conventions are automatic.

---

# Common Mistakes

### Mistake 1

Treating this catalogue as a list of operators to avoid rather than reading errors to avoid.

---

### Mistake 2

Applying a fix from the catalogue without confirming the cause in the actual plan.

---

# Best Practices

✔ Use the plan-review checklist for every investigation.

✔ Normalise every number before comparing.

✔ Fix the first misestimate and the real cause, not the symptom.

✔ Compare plans fairly and change one thing at a time.

✔ Keep production plan capture on and protected.

---

# Interview Questions

## Basic

1. Why is an estimated plan not enough to explain a slow query?
2. What is wrong with reading a plan from the top down?
3. Why are cost percentages misleading?

## Intermediate

4. How do you compare SQL Server estimated and actual rows correctly?
5. Why might "uses an index" still be inefficient?
6. Why should you fix the first misestimate rather than the largest one?

## Advanced

7. Describe five mistakes that lead to fixing the wrong thing, and how to avoid each.
8. Design a team checklist and capture setup that prevents most plan-reading mistakes.

---

# Hands-on Exercises

## Exercise 1

Take a plan from your system and apply the plan-review checklist; write down every finding.

---

## Exercise 2

Find one example of Mistake 8 (loops) and Mistake 9 (per-execution vs total) in real plans and correct the arithmetic.

---

## Exercise 3

Write the one-sentence diagnosis ("operator X does Y, caused by Z") for three slow queries.

---

# Related Topics

- **16.01 — Introduction to Execution Plans**
- **16.11 — Estimates vs Actuals (Finding Cardinality Misestimates)**
- **16.12 — Plan Warnings and Red Flags (Spills, Conversions and Residual Predicates)**
- **16.17 — Execution Plan Cheat Sheet & Visual Knowledge Map**
- **15.16 — Common Query Optimization Mistakes & Best Practices**

---

# Summary

Most execution-plan mistakes are reading errors: using estimated plans to explain slow runs, explaining a different statement from the application's, reading top-down, confusing build and probe sides, forgetting loops and executions, treating inclusive time and cost as measured time, judging scans and index use without rows read and executions, missing spills and row goals, fixing symptom operators instead of the first misestimate, forcing plans without fixing estimates, comparing plans unfairly, and operating without plan history. The checklist in this section—get, orient, normalise, check estimates, work and resources, act on causes, verify fairly—prevents nearly all of them.
