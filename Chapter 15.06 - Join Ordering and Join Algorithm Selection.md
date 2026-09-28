---
title: "15.06 - Join Ordering and Join Algorithm Selection"
description: "How the optimizer orders joins and picks nested loop, hash or merge join for each: driving tables and selective filters first, left-deep and bushy trees, cost trade-offs of each algorithm, memory grants and spills for hash joins, sort requirements for merge joins, the danger of underestimated nested loops, semi-joins and anti-joins, join order limits for large queries, and how indexes, statistics and SQL structure influence the choice."
chapter: 15
section: 15.06
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 15.06 Join Ordering and Join Algorithm Selection

---

# Learning Objectives

After completing this section, you will be able to:

- Explain why join order matters and how the optimizer chooses it.
- Predict when nested loop, hash or merge join is cheapest.
- Recognise the classic failure: a nested loop driven by an underestimate.
- Diagnose hash join spills and merge join sorts.
- Influence join choices through indexes, statistics and SQL structure.

---

# Why Order Matters

```sql
SELECT c.CustomerName, o.OrderID, oi.ProductID
FROM Customers  AS c
JOIN Orders     AS o  ON o.CustomerID = c.CustomerID
JOIN OrderItems AS oi ON oi.OrderID   = o.OrderID
WHERE c.Country = 'NZ' AND oi.ProductID = 777;
```

```text
Order 1: Customers(NZ: 760) → Orders (≈ 7,600) → OrderItems filtered by ProductID
Order 2: OrderItems(ProductID = 777: 800) → Orders (800) → Customers, keep NZ
Order 3: Orders (10,000,000) → …                               ← never sensible
```

The general rule: **start with the most selective filter, and keep intermediate results small.** Which of order 1 or 2 is better depends on the actual counts—exactly what statistics are for.

---

# Join Trees

```text
left-deep                         bushy
      ⋈                              ⋈
     /  \                          /    \
    ⋈    D                        ⋈      ⋈
   /  \                          / \    / \
  ⋈    C                        A   B  C   D
 / \
A   B
```

Most optimizers favour left-deep trees (each join adds one table to a growing result), which suit pipelined nested loops. Some also consider bushy trees, useful when two independent pairs of tables can each be reduced before joining (for example, two dimension tables filtered separately in a star schema).

---

# The Three Algorithms

| | Nested loop | Hash join | Merge join |
|-|-------------|-----------|------------|
| How | For each outer row, probe the inner input | Build a hash table on the smaller input, probe with the larger | Walk two inputs sorted on the join key |
| Cost | outer rows × cost of one inner probe | build + probe, roughly linear | linear, plus sorts if inputs are unsorted |
| Needs | Index on the inner join column (otherwise a scan per outer row) | Memory for the build side; equality join | Sorted inputs (index order or sort); equality or range |
| Best when | Outer input small; inner indexed | Large, unsorted inputs | Both inputs already sorted (indexes, earlier merge) |
| Returns first rows | Immediately | After the build phase | Immediately once inputs are sorted |
| Non-equality joins | ✅ | ❌ | Limited (range) |

Chapter 07.14 introduced the algorithms; here the question is when the optimizer picks each.

```text
cost ▲            nested loop (indexed inner)
     │           /
     │          /
     │         /      hash join ─────────────────────────
     │        /  ____/
     │       /__/
     │   ___/
     └───────────────────────────────────────────▶ outer rows
     nested loop wins below the crossover; hash join above it
```

---

# The Classic Failure: Underestimated Nested Loops

```text
estimated                                  actual
Nested Loop  (est 20 rows)                 2,400,000 rows
  ├─ Filter on Orders (est 20)             2,400,000
  └─ Index Seek on Customers per row       2,400,000 seeks  ← minutes instead of seconds
```

Nested loops are cheap when the outer input is small and catastrophic when it is not. An estimate that is 100,000× too low—stale statistics, correlated predicates, a sniffed parameter, a function on a column—makes the optimizer pick a nested loop that performs millions of probes. The fix is almost always the estimate, not the join hint.

The opposite failure exists too: a hash join over millions of rows chosen because of an **over**estimate, when a few index probes would have done.

---

# Hash Joins: Memory and Spills

A hash join needs memory for its build side. If the estimate is too low, the memory grant is too small, and the hash table **spills** to disk (temp files, tempdb), multiplying I/O:

```text
PostgreSQL:  Hash  Buckets: 65536  Batches: 16  Memory Usage: 4096kB      ← Batches > 1 = spilled
SQL Server:  warning "Operator used tempdb to spill data during execution with spill level 2"
MySQL:       hash join spills to disk chunks when join_buffer_size is exceeded
```

Remedies: fix the estimate (so the grant is right), reduce the build side (filter earlier, select fewer columns), or raise per-operation memory (`work_mem` in PostgreSQL, `join_buffer_size` in MySQL) with care—it is allocated per operation, per session. SQL Server's memory grant feedback (2017+/2019+) adjusts the grant on later executions.

---

# Merge Joins: Sorted Inputs

A merge join is cheapest when both inputs are already ordered by the join key—typically from indexes on the key, or from a previous merge join:

```text
Merge Join (o.CustomerID = c.CustomerID)
  ├─ Index Scan on Customers (PK order)
  └─ Index Scan on Orders ix_orders_customer_date (CustomerID order)
```

If one side must be sorted first, the sort's cost and memory often make a hash join cheaper. Merge joins also handle some range conditions and produce sorted output that a later `GROUP BY` or `ORDER BY` can reuse (an "interesting order", Section 15.02).

---

# Semi-Joins and Anti-Joins

`EXISTS`, `IN`, `NOT EXISTS` become semi- and anti-joins (Section 15.04), with the same three algorithms plus early exit: a semi-join stops probing after the first match per outer row.

```text
Hash Semi Join / Nested Loop Semi Join / Merge Semi Join
Hash Anti Join / Nested Loop Anti Join
```

MySQL adds semi-join strategies (FirstMatch, LooseScan, Materialization, DuplicateWeedout) visible in `EXPLAIN`.

---

# Join Order Limits

For many tables the optimizer cannot explore every order (Section 15.02):

```text
PostgreSQL: joins beyond join_collapse_limit (8) are planned in the order written;
            above geqo_threshold (12) FROM items, a genetic search is used
MySQL:      greedy search, optimizer_search_depth
SQL Server: search stops at "good enough" or timeout
```

In very large queries, the written order and the grouping of joins can influence the plan. Reducing the number of joined tables (pre-aggregating, splitting into steps) usually beats trying to steer the search.

---

# Influencing Join Choices

```text
Goal                                         Lever
Make nested loops cheap                      index the inner join column (FK columns!)
Make estimates right                         statistics, extended stats, sargable filters (15.03, 15.07)
Make hash joins fit in memory                select fewer columns; filter before joining
Enable merge joins without sorts             indexes in join-key order
Shrink intermediate results                  aggregate before joining (08.11); semi-joins instead of joins + DISTINCT
Stop fan-out                                 join at the right grain; EXISTS for existence tests
Last resort                                  join hints / plan forcing (15.09)
```

Indexing foreign key columns is the most common single fix: without an index on `Orders(CustomerID)`, every nested loop from customers to orders scans the orders table.

---

# Visual Representation

```text
   small outer + indexed inner          large + large, unsorted          both sorted on key
   ┌─────────┐                          ┌─────────┐   ┌─────────┐        ┌───────┐ ┌───────┐
   │ 760 NZ  │─seek─▶ Orders(Cust)      │ 2M rows │──▶│ hash tbl│◀─probe │ sorted│=│ sorted│
   │customers│   ×760                   └─────────┘   └─────────┘  8M    └───────┘ └───────┘
   └─────────┘                              build          probe          walk both once
   NESTED LOOP                              HASH JOIN                      MERGE JOIN
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← driving table: usually the one with the most selective filter
2. JOIN        ← order chosen by estimated intermediate sizes; algorithm per join
3. WHERE       ← filters pushed to each table before joining shrink every join
4. GROUP BY    ← may be pushed below a join (pre-aggregation) to shrink it
5. HAVING
6. WINDOW
7. SELECT
8. DISTINCT    ← a DISTINCT after a join often signals a missing semi-join
9. ORDER BY    ← merge joins can deliver the needed order
10. LIMIT / FETCH / TOP   ← favours nested loops, which return first rows immediately
```

---

# How the DBMS Executes This

```text
Hash Join  (Hash Cond: o.customerid = c.customerid)  rows=7,420 actual=7,390
  -> Seq Scan on orders o  (Filter: orderdate >= '2026-09-01')        ← probe side
  -> Hash  (Batches: 1  Memory Usage: 120kB)                          ← build side fits
       -> Index Scan on customers c (country = 'NZ')  rows=760
Estimates match actuals; the build side is the small filtered customer set.
```

---

# 🏗️ Architecture Insight

Join performance is decided largely at design time: foreign keys indexed, join columns of identical types, keys narrow (integers rather than long strings), and schemas that let common questions be answered with few joins. Star schemas in warehouses exist precisely so that joins are predictable: small filtered dimensions, one large fact table, hash joins.

---

# ⚡ Performance Tip

When you see a nested loop with a huge number of executions on its inner side, compare the outer input's estimated and actual rows. If the estimate was small and the actual is large, fix the estimate; a hash join will usually follow on its own.

---

# 🌍 Production Consideration

Memory for hash joins and sorts is shared by all concurrent queries. Raising `work_mem` or similar settings globally to fix one query's spill can exhaust memory under load. Raise it per session or per query where the engine allows, and prefer fixing estimates and query shape.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Nested loop | Implementation | ✅ | ✅ | ✅ | ✅ | ✅ (only algorithm) |
| Hash join | Implementation | ✅ | ✅ (8.0.18+) | ✅ | ✅ | ❌ (automatic indexes instead) |
| Merge join | Implementation | ✅ | ❌ | ✅ | ✅ | ❌ |
| Adaptive join | ❌ | ❌ | ❌ | ✅ (2017+, batch mode) | ✅ (12c+) | ❌ |
| Join memory setting | ❌ | `work_mem` | `join_buffer_size` | Memory grants | PGA settings | — |

> **Portability Tip:** SQLite joins only with nested loops (building temporary automatic indexes when useful), and MySQL has no merge join. Index your join columns on every engine.

---

# Common Mistakes

### Mistake 1

Forcing a hash or loop join instead of fixing the estimate.

---

### Mistake 2

Leaving foreign key columns unindexed.

---

### Mistake 3

Joining at the wrong grain and fixing duplicates with `DISTINCT`.

---

### Mistake 4

Raising join memory globally to fix one spill.

---

# Best Practices

✔ Index join columns, especially foreign keys.

✔ Keep estimates accurate so the right algorithm is chosen.

✔ Filter and aggregate before joining.

✔ Use `EXISTS` for existence, not join + `DISTINCT`.

✔ Reduce table count in very large queries.

---

# Interview Questions

## Basic

1. Name the three join algorithms.
2. When is a nested loop join efficient?
3. What does a hash join need?

## Intermediate

4. Why does join order matter?
5. What is a hash join spill, and how do you fix it?
6. When does a merge join beat a hash join?

## Advanced

7. Explain how an underestimate leads to a catastrophic nested loop.
8. How do join order search limits affect queries with many tables?

---

# Hands-on Exercises

## Exercise 1

Compare plans for a three-table join with and without an index on `Orders(CustomerID)`.

---

## Exercise 2

Force a hash join spill on PostgreSQL by lowering `work_mem`, then fix it by selecting fewer columns.

---

## Exercise 3

Find a query that uses `DISTINCT` to remove join duplicates and rewrite it with `EXISTS`.

---

# Related Topics

- **07.14 — Execution Flow of JOINs (Join Algorithms)**
- **07.15 — JOIN Performance and Index Strategy**
- **08.11 — Aggregating Across JOINs (Fan-Out and Pre-Aggregation)**
- **15.03 — Statistics, Cardinality Estimation and the Cost Model**
- **15.05 — Choosing Access Paths (Scans, Seeks and Lookups)**

---

# Summary

The optimizer orders joins to keep intermediate results small—starting from the most selective filter—and picks an algorithm per join: nested loops for small outer inputs with indexed inner sides, hash joins for large unsorted inputs (needing memory, spilling when underestimated), and merge joins for inputs already sorted on the key. The most common failure is a nested loop chosen because of an underestimate; the fix is usually the estimate. Indexed foreign keys, accurate statistics, early filtering and aggregation, and semi-joins for existence tests give the optimizer the inputs it needs; hints are the last resort.
