---
title: "16.01 - Introduction to Execution Plans"
description: "What an execution plan is and why it matters: the plan as the optimizer's chosen program, estimated versus actual plans, the operator tree model shared by every engine, what plans show and what they hide, how plans connect to optimization work, and a first walk-through of a complete plan."
chapter: 16
section: 16.01
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 20 min
lastUpdated: 2026-10-01
---

# 16.01 Introduction to Execution Plans

---

# Learning Objectives

After completing this section, you will be able to:

- Define an execution plan and explain where it comes from.
- Distinguish estimated plans from actual plans.
- Describe the operator tree model that every engine uses.
- List what a plan tells you and what it does not.
- Walk through a complete small plan from leaves to root.

---

# What a Plan Is

SQL describes a result. The optimizer (Chapter 15) turns that description into a **plan**: a concrete program of physical operations. The plan is what actually runs.

```sql
SELECT c.CustomerName, o.OrderID, o.TotalAmount
FROM Customers c
JOIN Orders o ON o.CustomerID = c.CustomerID
WHERE c.Country = 'NZ'
  AND o.OrderDate >= DATE '2026-09-01';
```

```text
Nested Loop
  -> Index Scan using ix_customers_country on customers c
        Index Cond: (country = 'NZ')
  -> Index Scan using ix_orders_customer_date on orders o
        Index Cond: ((customerid = c.customerid) AND (orderdate >= '2026-09-01'))
```

In words: find New Zealand customers through the `Country` index; for each one, seek that customer's September orders through the `(CustomerID, OrderDate)` index. Nothing in the SQL said "nested loop" or "use this index"—the optimizer decided, and the plan records the decision.

---

# Estimated vs Actual Plans

| | Estimated plan | Actual plan |
|-|----------------|-------------|
| Runs the query? | No | Yes |
| Row counts | Predicted | Predicted **and** actual |
| Timing, reads, memory | No | Yes |
| Shows misestimates? | No | Yes |
| Safe for slow or data-modifying queries? | Yes | Only with care |
| Typical command | `EXPLAIN` | `EXPLAIN ANALYZE` / actual execution plan |

The **shape** of the two is normally the same: the actual plan is the estimated plan plus runtime counters. (Exceptions: adaptive features may switch join types or memory grants at run time, and a plan compiled now can differ from the plan cached for the application—Section 16.02.)

---

# The Operator Tree

Every engine represents a plan as a **tree of operators** (also called nodes, iterators or row sources):

```text
              Sort                         ← root: returns rows to the client
                │
            Hash Join                      ← combines two inputs
            ╱       ╲
   Seq Scan          Hash                  ← builds a hash table from its child
   Orders              │
                   Index Scan              ← leaves: read tables or indexes
                   Customers
```

- **Leaves** read data: scans, seeks, lookups.
- **Inner nodes** transform rows: join, filter, aggregate, sort, compute, limit.
- **The root** delivers the final rows.
- Rows flow **upward**, from leaves to root.

Sections 16.03 and 16.08–16.10 cover the tree model and the operator families in detail.

---

# What a Plan Tells You

```text
✔ How each table is read (scan, seek, lookup, index-only)
✔ Which indexes are used—and, by their absence, which are not
✔ Join order and join algorithm for every join
✔ Where predicates are applied (inside a seek, as a filter, after a join)
✔ Where sorting, aggregation, deduplication and limiting happen
✔ Estimated rows and costs at every operator
✔ (actual plans) real rows, loops, time, reads, memory, spills
```

# What a Plan Does Not Tell You

```text
✘ Why the optimizer rejected the alternatives (most engines show only the winner)
✘ Time spent waiting on locks, network or the client (Section 15.13, 15.14)
✘ Whether the same plan is used for other parameter values (Section 15.08)
✘ The cost of executing it 50,000 times a minute (workload statistics, Section 16.15)
✘ Whether the result is correct (a fast plan for a wrong query is still wrong)
```

---

# Cost Is Not Time

Optimizers rank plans by **cost**: a unitless number combining estimated I/O, CPU and memory. Cost is useful for comparing alternatives *inside one optimizer for one query*. It is not seconds, and it is computed from estimates—so a plan with a "low cost" can run for an hour when the estimates are wrong.

```text
PostgreSQL   cost=0.56..412.10        arbitrary units (seq_page_cost = 1.0 by default)
SQL Server   Estimated Subtree Cost   historic "seconds on a 1990s machine"—today, just units
Oracle       Cost (%CPU)              units of single-block reads
MySQL        cost=1.2 / query_cost    optimizer cost-model units
SQLite       (none shown)
```

Measured numbers—actual rows, time, reads—always win over cost.

---

# A First Complete Walk-Through

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.ProductName, SUM(oi.Quantity) AS Units
FROM OrderItems oi
JOIN Products p ON p.ProductID = oi.ProductID
WHERE oi.OrderID BETWEEN 9000000 AND 9001000
GROUP BY p.ProductName
ORDER BY Units DESC
LIMIT 5;
```

```text
Limit  (actual time=8.91..8.92 rows=5 loops=1)
  -> Sort  (actual time=8.91..8.91 rows=5 loops=1)
        Sort Key: (sum(oi.quantity)) DESC
        Sort Method: top-N heapsort  Memory: 25kB
        -> HashAggregate  (actual time=8.40..8.70 rows=3,610 loops=1)
              Group Key: p.productname
              -> Hash Join  (actual time=4.10..7.20 rows=4,004 loops=1)
                    Hash Cond: (oi.productid = p.productid)
                    -> Index Scan using ix_orderitems_order on orderitems oi  (actual rows=4,004 loops=1)
                          Index Cond: ((orderid >= 9000000) AND (orderid <= 9001000))
                    -> Hash  (actual time=3.90..3.90 rows=50,000 loops=1)
                          -> Seq Scan on products p  (actual rows=50,000 loops=1)
Execution Time: 9.05 ms
```

Reading from the leaves:

1. `Seq Scan on products` reads all 50,000 products; `Hash` builds a hash table from them.
2. `Index Scan on orderitems` seeks the 4,004 items of 1,001 orders.
3. `Hash Join` probes the hash table with each item: 4,004 joined rows.
4. `HashAggregate` groups them into 3,610 product names.
5. `Sort` keeps only the top 5 by units (a top-N heapsort, 25 kB).
6. `Limit` returns 5 rows.

Total: 9 ms. The biggest single piece of work is hashing all 50,000 products to join 4,004 rows—acceptable here; at higher volumes a nested loop with seeks on `Products` might win.

---

# Plans in the Optimization Workflow

```text
symptom (slow page, timeout, CPU spike)
   │
   ▼
find the query (Section 15.14) ──▶ get its ACTUAL plan ──▶ read it (this chapter)
   │                                                         │
   │                          ┌──────────────────────────────┤
   ▼                          ▼                              ▼
too much work?        wrong plan? (estimates)         waiting? (plan looks fine,
(scans, lookups,      → statistics, SQL shape,         elapsed ≫ CPU)
 spills) → index,       parameters (Ch. 15)            → locks, I/O, waits
 SQL, schema
   │
   ▼
fix one thing ──▶ new actual plan ──▶ compare (Section 16.14)
```

---

# Visual Representation

```text
   SQL (what)  ──▶  OPTIMIZER  ──▶  PLAN (how)  ──▶  EXECUTOR  ──▶  rows
                       ▲              │                  │
                  statistics,         │ EXPLAIN          │ EXPLAIN ANALYZE
                  indexes,            ▼                  ▼
                  constraints    estimated plan      actual plan
                                 (beliefs)           (beliefs + facts)
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← leaf operators read the tables in the FROM clause
2. JOIN        ← join operators; the optimizer chose their order and algorithm
3. WHERE       ← seek conditions, scan filters or separate filter operators
4. GROUP BY    ← aggregate operators (hash or sorted)
5. HAVING      ← a filter above the aggregate
6. WINDOW      ← window operators above a sort
7. SELECT      ← projections and computed expressions
8. DISTINCT    ← unique / hash aggregate / distinct sort
9. ORDER BY    ← sort, top-N sort, or index order
10. LIMIT / FETCH / TOP   ← limit / top at the root
```

---

# How the DBMS Executes This

```text
Limit.next()
  └─ Sort.next()            first call: pull ALL rows from below, keep top 5
        └─ HashAggregate    first call: pull ALL rows from below, build groups
              └─ Hash Join  build: pull all products into a hash table
                            probe: pull order items one by one, emit matches
After the blocking operators finish, the Limit returns 5 rows and the query ends.
```

---

# 🏗️ Architecture Insight

A plan is the meeting point of everything you design: tables (row width and count), keys (physical order), indexes (available access paths), constraints (what the optimizer may assume), statistics (its estimates) and SQL (what it must compute). When a plan is bad, the cause is almost always one of those inputs—not the optimizer being "dumb".

---

# ⚡ Performance Tip

When you look at a plan, ask "how many rows did each operator touch compared with how many the query returns?" A query returning 20 rows whose leaves read 20 million is doing too much work, whatever the cost numbers say.

---

# 🌍 Production Consideration

`EXPLAIN ANALYZE` runs the query. On a production primary, run it on a replica when possible, wrap data-modifying statements in `BEGIN … ROLLBACK`, and set a statement timeout so a runaway plan cannot hold resources for an hour.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Plan command | ❌ | `EXPLAIN` | `EXPLAIN` / `DESCRIBE` | Showplan `SET` options, SSMS | `EXPLAIN PLAN`, `DBMS_XPLAN` | `EXPLAIN QUERY PLAN` |
| Actual row counts | ❌ | ✅ | ✅ (8.0.18+) | ✅ | ✅ (`GATHER_PLAN_STATISTICS`) | Limited |
| Cost shown | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Graphical plans | ❌ | Third-party (pgAdmin, explain.dalibo.com) | Workbench Visual Explain | SSMS, Azure Data Studio | SQL Developer, OEM | ❌ |

> **Portability Tip:** No SQL standard defines plans or `EXPLAIN`. Learn the tree model once and treat each engine's syntax as a dialect.

---

# Common Mistakes

### Mistake 1

Treating cost as time.

---

### Mistake 2

Reading only estimated plans when the question is "why was it slow?"

---

### Mistake 3

Assuming the plan you get in a query tool is the plan the application uses.

---

### Mistake 4

Running `EXPLAIN ANALYZE` on data-modifying statements without rolling back.

---

# Best Practices

✔ Prefer actual plans; fall back to estimated plans for queries too slow or risky to run.

✔ Read from the leaves to the root.

✔ Compare rows touched with rows returned.

✔ Treat cost as a ranking tool, not a measurement.

✔ Capture the plan the application actually uses.

---

# Interview Questions

## Basic

1. What is an execution plan?
2. What is the difference between an estimated and an actual plan?
3. Which operators are the leaves of a plan?

## Intermediate

4. Why is the optimizer's cost not a measure of time?
5. What can a plan not tell you about a slow query?
6. Why might the plan in your query tool differ from the application's plan?

## Advanced

7. Walk through a plan with a hash join, a hash aggregate and a top-N sort, explaining when each operator produces its first row.
8. How would you decide whether a slow query is doing too much work, running the wrong plan, or waiting?

---

# Hands-on Exercises

## Exercise 1

Get the estimated and actual plan for the same three-table query and list what the actual plan adds.

---

## Exercise 2

For one plan, write down every operator from the leaves to the root, with the rows each one produced.

---

## Exercise 3

Find a query whose leaves read at least 100 times more rows than it returns, and explain why.

---

# Related Topics

- **15.01 — Introduction to Query Optimization**
- **15.02 — How the Query Optimizer Works (Parsing, Rewriting and Cost-Based Planning)**
- **16.02 — Getting a Plan (EXPLAIN, Estimated and Actual Plans)**
- **16.03 — Plan Structure (Operators, Trees and Data Flow)**
- **05.12 — Execution Flow of SELECT**

---

# Summary

An execution plan is the physical program the optimizer chose for a query: a tree whose leaves read tables and indexes and whose inner operators join, filter, aggregate, sort and limit as rows flow up to the root. Estimated plans show the optimizer's beliefs; actual plans add the facts—rows, loops, time, reads and memory—which is why they are the primary diagnostic tool. Cost ranks alternatives but is not time. Plans show how the query runs, not why alternatives were rejected, how long it waited, or how often it runs; those come from the other tools of Chapter 15.
