---
title: "16.09 - Join Operators (Nested Loop, Hash and Merge)"
description: "How joins appear in execution plans: nested loop joins with outer and inner inputs and per-row executions, hash joins with build and probe sides, memory and batches, merge joins with sorted inputs, semi-join and anti-join variants, adaptive joins, join order in multi-table plans, and how to judge each join operator from estimated and actual rows."
chapter: 16
section: 16.09
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 25 min
lastUpdated: 2026-10-01
---

# 16.09 Join Operators (Nested Loop, Hash and Merge)

---

# Learning Objectives

After completing this section, you will be able to:

- Identify the outer/inner and build/probe inputs of each join operator.
- Judge a nested loop by outer rows and inner executions.
- Judge a hash join by build size, memory and batches.
- Recognise merge joins and the sorts that feed them.
- Read semi-, anti-, outer and adaptive join variants, and the join order of a multi-table plan.

---

# Join Operators Across Engines

| Algorithm | PostgreSQL | SQL Server | MySQL | Oracle | SQLite |
|-----------|------------|------------|-------|--------|--------|
| Nested loop | `Nested Loop` | `Nested Loops` | `Nested loop inner join` | `NESTED LOOPS` | (all joins) |
| Hash | `Hash Join` + `Hash` | `Hash Match` | `Inner hash join` + `Hash` | `HASH JOIN` | — |
| Merge | `Merge Join` | `Merge Join` | — | `MERGE JOIN` (+ `SORT JOIN`) | — |
| Adaptive | — | `Adaptive Join` | — | adaptive plan (`STATISTICS COLLECTOR`) | — |

Section 07.14 explains how each algorithm works; this section is about reading them in plans.

---

# Nested Loop

```text
Nested Loop  (actual time=0.06..38.4 rows=4,004 loops=1)
  -> Index Scan using ix_orders_orderdate on orders o      (rows=950 actual rows=1,001 loops=1)        ← OUTER
        Index Cond: (orderdate = '2026-09-28'::date)
  -> Index Scan using ix_orderitems_order on orderitems oi (rows=4 actual rows=4 loops=1,001)          ← INNER
        Index Cond: (orderid = o.orderid)
```

- **Outer** input (first child): read once.
- **Inner** input (second child): executed once **per outer row**—`loops=1,001`.
- Cost ≈ outer rows × cost of one inner execution.

What to check:

```text
✔ inner side is a seek on an index (not a scan)
✔ outer rows (actual) are close to the estimate
✘ inner side is a Seq Scan / Table Scan / full index scan with loops ≫ 1
✘ outer actual rows ≫ estimate (the classic "nested loop over a misestimate", Section 16.11)
```

SQL Server also uses `Nested Loops` for key lookups and for `APPLY`; Oracle's double `NESTED LOOPS` separates index probes from row fetches (Section 16.07).

---

# Hash Join

```text
Hash Join  (actual time=402.1..2,610.8 rows=3,912,004 loops=1)
  Hash Cond: (oi.orderid = o.orderid)
  -> Seq Scan on orderitems oi   (actual rows=40,000,000 loops=1)                 ← PROBE
  -> Hash  (actual rows=978,000 loops=1)                                           ← BUILD
        Buckets: 1048576  Batches: 4  Memory Usage: 65,537kB
        -> Index Scan using ix_orders_orderdate on orders o  (actual rows=978,000 loops=1)
              Index Cond: (orderdate >= '2026-07-01'::date)
```

- **Build** input: read completely into an in-memory hash table (PostgreSQL: under `Hash`; SQL Server: the **top** input; MySQL: under `Hash`; Oracle: the **first** child).
- **Probe** input: streamed; each row looks up the hash table.
- Cost ≈ read both inputs once + memory for the build side.

What to check:

```text
✔ the SMALLER input is the build side
✔ Batches: 1 (PostgreSQL) / no spill warning (SQL Server) / Used-Mem (0) optimal pass (Oracle)
✘ Batches > 1, "Operator used tempdb to spill data", Used-Tmp → hash spilled to disk
✘ build side estimated small but actually huge → memory sized wrong → spill
✘ hash join probing 40M rows to return a handful—maybe a nested loop with an index is better
```

---

# Merge Join

```text
Merge Join  (actual rows=978,000 loops=1)
  Merge Cond: (o.orderid = oi.orderid)
  -> Index Scan using orders_pkey on orders o            (actual rows=978,000 loops=1)
  -> Index Scan using ix_orderitems_order on orderitems oi (actual rows=3,912,004 loops=1)
```

Both inputs must arrive sorted on the join key. Check where the order comes from:

```text
✔ both inputs are ordered index scans      → merge join is very cheap
⚠ a Sort under one or both inputs          → the sort may cost more than the join
⚠ SQL Server "Many to Many: True"          → duplicates on both sides need a worktable in tempdb
```

---

# Semi-, Anti- and Outer Joins

```text
EXISTS / IN            → Semi Join        Nested Loop Semi Join · Hash Semi Join · Left Semi Join · NESTED LOOPS SEMI
NOT EXISTS             → Anti Join        Hash Anti Join · Left Anti Semi Join · HASH JOIN ANTI
NOT IN (nullable)      → null-aware anti  HASH JOIN ANTI NA (Oracle) · extra NULL checks / row count spool (SQL Server)
LEFT / RIGHT / FULL    → Outer join       Hash Left Join · Merge Full Join · Nested Loops (Left Outer Join)
```

A semi join stops probing after the first match per outer row—cheaper than an inner join plus `DISTINCT`. Seeing `HashAggregate` / `Unique` above an inner join where you expected a semi join may mean the query was written with `JOIN … DISTINCT` (Section 09.13). PostgreSQL may also show `Hash Right Join` / `Hash Right Anti Join`: the same join with the build side swapped to the smaller input.

---

# Adaptive Joins

```text
-- SQL Server 2017+ (batch mode)
Adaptive Join
  Adaptive Threshold Rows: 1,412
  Actual Join Type: HashMatch            ← decided at run time
  Estimated Join Type: NestedLoops
-- Oracle
- this is an adaptive plan (rows marked '-' are inactive)
```

An adaptive join reads the build input first, then picks hash or nested loops depending on whether the actual row count crosses a threshold. It protects against some misestimates; it does not fix them—the rest of the plan above is still costed with the wrong estimate.

---

# Join Order in Multi-Table Plans

```text
Hash Join                                   ← third join
  -> Nested Loop                            ← second join
        -> Hash Join                        ← FIRST join: the deepest one
              -> Seq Scan on orderitems
              -> Hash -> Seq Scan on products (filter: CategoryID = 12)
        -> Index Scan on orders (orderid = oi.orderid)
  -> Hash -> Seq Scan on customers
```

The deepest join runs first; its output is the outer or probe input of the next join. Check that **early joins reduce rows**: a filtered small table (`products` of one category) joined early, large tables joined later. A join that **multiplies** rows early (fan-out) and a filter or `DISTINCT` much later is a sign of a poor join order or a query that needs restructuring (Section 08.11).

---

# Judging a Join from the Numbers

| Symptom | Likely cause | Look next at |
|---------|--------------|--------------|
| Nested loop, outer actual ≫ estimate | Underestimate on the outer side | Outer input's estimate (16.11) |
| Nested loop, inner side is a scan | Missing index on the join key | Index on the inner join column |
| Hash join, `Batches > 1` / spill | Build side larger than memory, or underestimated | `work_mem` / grant, estimate of build side |
| Hash join, build side is the larger input | Misestimate swapped the sides | Estimates of both inputs |
| Merge join with expensive sorts | Inputs not available in key order | Index matching the join key |
| Join output ≫ both inputs | Many-to-many fan-out | Join keys, missing condition, cross join |

---

# Visual Representation

```text
NESTED LOOP                    HASH JOIN                        MERGE JOIN
  outer ──▶ for each row:        build ──▶ hash table (memory)    sorted A ─┐
              inner seek            probe ──▶ lookup ──▶ match    sorted B ─┴▶ zip on key
  cost ~ outer × inner seek      cost ~ |A| + |B| (+ spill)       cost ~ |A| + |B| (+ sorts)
  check: loops, inner = seek     check: build = smaller, batches  check: where order comes from
  ideal: small outer, indexed    ideal: big unsorted inputs       ideal: both inputs pre-sorted
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← access operators feed each join
2. JOIN        ← nested loop / hash / merge; deepest join first
3. WHERE       ← filters pushed below joins; join filters applied after matching
4. GROUP BY    ← aggregation above the joins (or pushed below them)
5. HAVING
6. WINDOW
7. SELECT
8. DISTINCT    ← above a join: may indicate a semi join written as JOIN
9. ORDER BY    ← merge join or nested loop can preserve useful order
10. LIMIT / FETCH / TOP   ← favours nested loops that produce first rows quickly
```

---

# How the DBMS Executes This

```text
Nested Loop:  open outer; for each outer row → rebind inner (parameter = outer key) → run inner
Hash Join:    open build child → consume all → hash table (partitions to temp if too big)
              open probe child → for each row hash the key → look up → emit matches
Merge Join:   open both children → advance the side with the smaller key → emit on equal keys
```

---

# 🏗️ Architecture Insight

Join operators reveal missing foreign-key indexes faster than any audit: a nested loop whose inner side scans a child table, or a hash join that reads 40 million child rows to return 20, usually means the child's foreign-key column has no index (Section 10.11).

---

# ⚡ Performance Tip

When an interactive query uses a hash join over two large inputs to return a few rows, look for the missing index that would allow a nested loop with seeks. When a report uses a nested loop with millions of inner executions, look for the misestimate that hid a hash join from the optimizer.

---

# 🌍 Production Consideration

Hash joins and merge-join sorts use memory per query. Under concurrency, many queries each requesting a large grant can queue (SQL Server `RESOURCE_SEMAPHORE` waits) or spill. Watch memory grants and spills in production plans, not just durations.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Hash join | ❌ | ✅ | ✅ (8.0.18+) | ✅ | ✅ | ❌ |
| Merge join | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Adaptive join | ❌ | ❌ | ❌ | ✅ (2017+) | ✅ (12c+) | ❌ |
| Build side position | ❌ | Second child (`Hash`) | Under `Hash` | Top input | First child | n/a |
| Spill indicator | ❌ | `Batches > 1` | Limited | Spill warning | `Used-Tmp`, multi-pass | n/a |

> **Portability Tip:** The three algorithms and their trade-offs are universal; only the build-side position and spill indicators differ. SQLite and MySQL lack merge joins, so the advice "provide sorted inputs" does not apply there.

---

# Common Mistakes

### Mistake 1

Blaming the nested loop instead of the misestimate on its outer input.

---

### Mistake 2

Reading the inner side's per-loop time without multiplying by loops.

---

### Mistake 3

Missing hash spills because the duration looked acceptable on a quiet server.

---

### Mistake 4

Ignoring a fan-out join that multiplies rows before a late `DISTINCT`.

---

# Best Practices

✔ Identify outer/inner and build/probe for every join.

✔ Check inner-side executions and access type on nested loops.

✔ Check build size, memory and batches on hash joins.

✔ Check where the order comes from on merge joins.

✔ Verify that early joins reduce rows.

---

# Interview Questions

## Basic

1. What are the outer and inner inputs of a nested loop join?
2. What is the build side of a hash join?
3. What does a merge join require from its inputs?

## Intermediate

4. How do you recognise a hash join spill in PostgreSQL and SQL Server plans?
5. Why is a scan on the inner side of a nested loop a red flag?
6. How does a semi join appear in a plan, and why is it cheaper than `JOIN … DISTINCT`?

## Advanced

7. Explain how an adaptive join decides its algorithm and what it does not fix.
8. Given a four-table plan, how do you determine the join order and judge whether it is good?

---

# Hands-on Exercises

## Exercise 1

Capture a nested loop join and compute the inner side's total rows and time.

---

## Exercise 2

Force a hash join to spill by lowering memory, and identify the spill indicator on your engine.

---

## Exercise 3

Write an `EXISTS` query and the equivalent `JOIN … DISTINCT`; compare the join operators in both plans.

---

# Related Topics

- **07.14 — Execution Flow of JOINs (Join Algorithms)**
- **15.06 — Join Ordering and Join Algorithm Selection**
- **16.08 — Table Access Operators (Scans, Seeks, Lookups and Bitmaps)**
- **16.11 — Estimates vs Actuals (Finding Cardinality Misestimates)**
- **09.13 — Subqueries vs JOINs**

---

# Summary

Join operators combine two inputs. A nested loop runs its inner side once per outer row, so it is judged by outer rows and by whether the inner side is an index seek. A hash join reads its build side into memory and streams the probe side, so it is judged by build size, memory and spills. A merge join zips two sorted inputs, so it is judged by where the order comes from. Semi-, anti- and outer variants and adaptive joins follow the same rules. In multi-table plans the deepest join runs first; good plans reduce rows early, and most bad join choices trace back to a misestimated input.
