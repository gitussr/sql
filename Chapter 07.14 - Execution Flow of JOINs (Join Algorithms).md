---
title: "07.14 - Execution Flow of JOINs (Join Algorithms)"
description: "How the engine executes a join: logical versus physical processing, nested loop, hash and merge join algorithms with their costs and requirements, join order selection, cardinality estimation, and how to read a join execution plan."
chapter: 7
section: 7.14
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 40 min
lastUpdated: 2026-09-22
---

# 07.14 Execution Flow of JOINs (Join Algorithms)

---

# Learning Objectives

After completing this section, you will be able to:

- Trace a join through the logical processing order.
- Describe nested loop, hash and merge joins.
- State when each algorithm is chosen and what it costs.
- Explain how the optimizer selects a join order.
- Describe how cardinality estimates drive both choices.
- Read a join execution plan and spot the common failures.

---

# Logical vs Physical

The logical order defines the **result**; the physical plan defines **how** it is produced.

```text
LOGICAL (what the answer means)      PHYSICAL (what the engine does)

1. FROM                              Access paths chosen per table
2. JOIN                              One join operator per join
3. WHERE                             Filters pushed as early as legal
4. GROUP BY                          Sort or hash aggregate
5. HAVING                            Filter after aggregation
6. SELECT                            Compute expressions
7. DISTINCT                          Sort or hash distinct
8. ORDER BY                          Sort (or use an index order)
9. LIMIT                             Stop early
```

The engine is free to do anything that produces the same rows—reorder joins, push filters down, skip tables it can prove unnecessary—but never anything that changes the result.

---

# Algorithm 1: Nested Loop Join

```text
for each row R in OUTER:
    for each row S in INNER where S matches R:
        emit (R, S)
```

```sql
SELECT c.CustomerName, o.OrderID
FROM Customers AS c
INNER JOIN Orders AS o ON o.CustomerID = c.CustomerID
WHERE c.CustomerID = 42;
```

```text
Outer: Customers, 1 row (primary-key seek)

    ↓ for that one row

Inner: index seek Orders(CustomerID = 42)

    ↓

Emit matches
```

| Property | Value |
|----------|-------|
| Cost | `outer_rows × inner_lookup_cost` |
| Memory | Minimal |
| Needs an index | Strongly preferred on the inner side |
| First row returned | Immediately |
| Best for | A small outer input and an indexed inner table |
| Worst for | Large outer input, or an unindexed inner table |

Without an index on the inner side, the inner table is scanned once per outer row—the classic `O(n × m)` disaster. When a plan shows a nested loop over a large outer input with an inner *scan*, the missing index is almost always the problem.

---

# Algorithm 2: Hash Join

```text
Phase 1 — Build:  read the smaller input, hash it on the join key
Phase 2 — Probe:  read the larger input, look each row up in the hash table
```

```sql
SELECT c.CustomerName, o.OrderID
FROM Customers AS c
INNER JOIN Orders AS o ON o.CustomerID = c.CustomerID;
```

```text
Build  Customers (3,000 rows)      Probe  Orders (900,000 rows)

  hash(CustomerID) → bucket          for each order:
  ┌─────┬──────────────┐               hash(CustomerID)
  │ 001 │ Ada          │               look up the bucket
  │ 002 │ Grace        │               emit matches
  │ ... │ ...          │
  └─────┴──────────────┘
```

| Property | Value |
|----------|-------|
| Cost | `build_rows + probe_rows` (roughly linear) |
| Memory | Proportional to the build input |
| Needs an index | No |
| Condition | Equality only |
| First row returned | After the build completes |
| Best for | Large, unindexed, unsorted inputs |
| Worst for | Build input too large for memory (spills to disk) |

Hash join is the workhorse of analytics: it turns "join two big tables" from quadratic into roughly linear work, at the price of memory.

---

# Algorithm 3: Merge Join (Sort-Merge)

```text
Both inputs sorted by the join key, then walked in parallel
```

```text
Customers (sorted)     Orders (sorted)
    1 Ada        ───►       1 101
    2 Grace      ───►       1 102
    3 Linus                 2 103
                            5 104

Two cursors advance together; the smaller key moves forward.
```

| Property | Value |
|----------|-------|
| Cost | Sorting (if needed) + one pass over each input |
| Memory | Low if the inputs are already sorted |
| Needs an index | Helpful—a sorted index avoids the sort |
| Condition | Equality (and some range conditions) |
| First row returned | After sorting |
| Best for | Pre-sorted inputs, or very large sorted joins |
| Worst for | Unsorted inputs that must be sorted first |

Merge join shines when a clustered index or a previous sort already supplies the order—and when the query's `ORDER BY` needs the same order anyway, so the sort is paid for once.

---

# Choosing Between Them

```text
Is there an equality condition?
    no  → Nested Loop (the only general option)
    yes ↓

Is one input small and the other indexed on the key?
    yes → Nested Loop with index seeks
    no  ↓

Are both inputs already sorted on the key?
    yes → Merge Join
    no  ↓

Does the smaller input fit in memory?
    yes → Hash Join
    no  → Hash Join with spilling, or Merge Join with sorts
```

| Scenario | Usual choice |
|----------|--------------|
| `WHERE id = 42` then join | Nested loop |
| Two large tables, no useful index | Hash |
| Both sides sorted by the key | Merge |
| Non-equi condition (`<`, `BETWEEN`) | Nested loop |
| `EXISTS` / `NOT EXISTS` | Semi/anti variant of any of the three |

---

# Join Order

For three tables there are twelve possible orders; for ten tables, millions. The optimizer searches the space using statistics and picks the cheapest plan it finds.

```text
((Customers ⋈ Orders) ⋈ OrderItems)
((Orders ⋈ OrderItems) ⋈ Customers)
((Customers ⋈ OrderItems) ⋈ Orders)    ← may be impossible: no direct condition
```

The guiding principle is **filter early, join small**:

```text
Orders filtered to today  →  400 rows
    ⋈ OrderItems (index seek per order)
        ⋈ Customers (index seek per order)
```

is vastly cheaper than joining nine hundred thousand orders to everything and filtering at the end. Modern optimizers normally find this themselves, provided the statistics are current.

---

# Cardinality Estimation

Every decision above depends on one number: how many rows each step will produce.

```text
Statistics (histograms, distinct counts, null fractions)
        │
        ▼
Estimated rows per operator
        │
        ▼
Estimated cost per candidate plan
        │
        ▼
Plan selection
```

When the estimate is wrong, the choice is wrong:

| Estimate | Reality | Consequence |
|----------|---------|-------------|
| 10 rows | 1,000,000 rows | Nested loop chosen: a million index seeks |
| 1,000,000 rows | 10 rows | Hash join chosen: a hash table built for nothing |

Causes of bad estimates: stale statistics, correlated columns treated as independent, expressions the optimizer cannot see through (`WHERE YEAR(OrderDate) = 2026`), parameter sniffing, and table variables without statistics.

The first diagnostic step for any slow join is to compare **estimated** with **actual** rows in the plan. A large discrepancy points at the estimate, not at the algorithm.

---

# Reading a Join Plan

```text
Hash Join  (cost=1543.00 rows=8921 actual rows=8899 loops=1)
  Hash Cond: (o.customerid = c.customerid)
  ->  Seq Scan on orders o  (rows=900000 actual rows=900000)
  ->  Hash  (rows=3000 actual rows=3000)
        ->  Seq Scan on customers c  (rows=3000)
```

What to look for:

1. **Algorithm** — is it the one you expected?
2. **Estimated vs actual rows** — within a factor of two or so?
3. **Access path** — seek or scan, and is the scan justified?
4. **Build side** — is the *smaller* input being hashed?
5. **Spills / temporary files** — a hash or sort that exceeded memory.
6. **Loops** — a nested loop's inner side executed thousands of times.

```sql
EXPLAIN ANALYZE SELECT ...;          -- PostgreSQL
EXPLAIN ANALYZE SELECT ...;          -- MySQL 8.0+
SET STATISTICS PROFILE ON;           -- SQL Server (or the graphical plan)
EXPLAIN PLAN FOR SELECT ...;         -- Oracle
EXPLAIN QUERY PLAN SELECT ...;       -- SQLite
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN    ← the physical algorithm runs here
3. WHERE
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

Logical position is fixed; physical execution is not. A filter written in `WHERE` may be applied before the join, and a join may be skipped entirely if a constraint proves it cannot change the result.

---

# How the DBMS Executes This

```text
SQL text
    │
    ▼
Parse → syntax tree
    │
    ▼
Bind → resolve tables, columns, aliases
    │
    ▼
Logical rewrite → predicate pushdown, subquery flattening,
                  outer join simplification, join reordering
    │
    ▼
Cost-based optimization → statistics → candidate plans → cheapest plan
    │
    ▼
Execute → access paths + join operators
    │
    ▼
Rows
```

---

# 🔬 Engine Deep Dive

Hash joins spill when the build input exceeds the memory grant: partitions are written to temporary storage and re-read in a second pass, which can be an order of magnitude slower. Plans report this as "Batches"/"spills" (SQL Server), "Disk" usage in `EXPLAIN ANALYZE` (PostgreSQL), or temporary table statistics (MySQL). Spilling is usually a symptom of a bad row estimate rather than a genuinely huge input.

---

# 🏗️ Architecture Insight

Three algorithms cover every join because they trade the same three resources differently: nested loop spends random I/O and needs an index; hash spends memory and needs equality; merge spends ordering and rewards clustered data. Knowing which resource is scarce on your system predicts which algorithm you should expect to see.

---

# ⚡ Performance Tip

Keep statistics current. Most "the query suddenly got slow" incidents are a plan flip caused by stale statistics after a bulk load, not by a change in the SQL. Refreshing statistics is cheaper and safer than adding a join hint.

---

# 🌍 Production Consideration

Join hints (`FORCE ORDER`, `USE HASH`, `ORDERED`) freeze a plan that is correct today and may be wrong after the data grows. Treat them as temporary mitigation with an expiry date, and fix the underlying cause—missing index, stale statistics, non-SARGable predicate—before the hint outlives its usefulness.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Nested loop | — | ✅ | ✅ | ✅ | ✅ | ✅ |
| Hash join | — | ✅ | ✅ (8.0.18+) | ✅ | ✅ | ❌ |
| Merge join | — | ✅ | ❌ | ✅ | ✅ | ❌ |
| Plan command | — | `EXPLAIN ANALYZE` | `EXPLAIN ANALYZE` | `SET STATISTICS` | `EXPLAIN PLAN` | `EXPLAIN QUERY PLAN` |
| Join hints | ❌ | ❌ | `STRAIGHT_JOIN` | `OPTION (...)` | optimizer hints | ❌ |

> **Portability Tip:** SQLite only implements nested loop joins, so index design matters more there than anywhere else. MySQL had no hash join before 8.0.18 and still has no merge join, which is why index-driven nested loops dominate MySQL tuning advice.

---

# Common Mistakes

### Mistake 1

Blaming the algorithm when the real problem is a row estimate that is wrong by orders of magnitude.

---

### Mistake 2

Adding a join hint instead of an index.

---

### Mistake 3

Reading only the estimated plan and never comparing it with actual rows.

---

### Mistake 4

Assuming a hash join is always better than a nested loop. For a highly selective lookup, the nested loop wins easily.

---

# Best Practices

✔ Read the plan before tuning anything.

✔ Compare estimated with actual row counts first.

✔ Keep statistics fresh, especially after bulk loads.

✔ Index join keys so that nested loops can seek.

✔ Write SARGable join conditions—no functions on join columns.

✔ Use hints only as temporary, documented mitigation.

---

# Interview Questions

## Basic

1. Name the three join algorithms.
2. Which algorithm needs an index on the inner table?
3. Which requires an equality condition?

## Intermediate

4. When is a hash join preferred over a nested loop?
5. What does a merge join require of its inputs?
6. How does join order affect cost?

## Advanced

7. What happens when a hash join spills to disk?
8. How do cardinality estimation errors change the chosen plan?
9. Why is a join hint a risky long-term fix?

---

# Hands-on Exercises

## Exercise 1

Run `EXPLAIN ANALYZE` on a two-table join and identify the algorithm, the build side and the actual row counts.

---

## Exercise 2

Add an index on the foreign key and compare the plans before and after.

---

## Exercise 3

Force a nested loop on two large tables and explain the cost difference.

---

## Exercise 4

Find a query whose estimated and actual row counts differ by more than 10× and explain why.

---

# Related Topics

- **07.10 — Joining Multiple Tables**
- **07.15 — JOIN Performance and Index Strategy**
- **06.11 — Execution Flow of WHERE**
- **06.12 — SARGability and Index-Friendly Predicates**
- **04.03 — How SQL Works Internally (SQL Query Processing Pipeline)**
- **05.12 — Execution Flow of SELECT**

---

# Summary

A join's logical position is fixed at step 2 of query processing, but its physical execution is chosen by the optimizer from three algorithms: nested loop, which spends random I/O and wants an index on the inner side; hash join, which spends memory and requires an equality condition; and merge join, which requires sorted inputs and rewards clustered data. The optimizer also chooses the join order, and both decisions rest entirely on cardinality estimates drawn from statistics—so most join performance problems are estimation problems, visible as a large gap between estimated and actual rows in the plan. Read the plan first, fix statistics and indexes before reaching for hints.
