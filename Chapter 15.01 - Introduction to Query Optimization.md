---
title: "15.01 - Introduction to Query Optimization"
description: "What query optimization is, why declarative SQL needs an optimizer, the size of the plan search space, the three causes of slow queries (too much work, the wrong plan, waiting), the division of labour between the optimizer and the developer, response time versus throughput, and the measure-explain-diagnose-fix-verify cycle the rest of Chapter 15 builds on."
chapter: 15
section: 15.01
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 20 min
lastUpdated: 2026-09-28
---

# 15.01 Introduction to Query Optimization

---

# Learning Objectives

After completing this section, you will be able to:

- Explain why SQL needs a query optimizer.
- Estimate how large a plan search space can be.
- Classify a slow query as too much work, the wrong plan, or waiting.
- Describe what the optimizer is responsible for and what you are.
- Follow the measure–explain–diagnose–fix–verify cycle.

---

# Declarative SQL Needs an Optimizer

```sql
SELECT c.CustomerName, SUM(oi.Quantity * oi.UnitPrice) AS Revenue
FROM Customers  AS c
JOIN Orders     AS o  ON o.CustomerID = c.CustomerID
JOIN OrderItems AS oi ON oi.OrderID   = o.OrderID
WHERE c.Country = 'NZ'
  AND o.OrderDate >= DATE '2026-09-01'
GROUP BY c.CustomerName;
```

This query says nothing about **how** to find the rows. Should the engine start with New Zealand customers (a few thousand) and look up their orders, or start with September's orders (a few hundred thousand) and look up their customers? Use indexes or scan? Join with nested loops, hashing or merging? Aggregate before or after the second join?

```text
Plan A: Customers(Country='NZ') ─NL→ Orders(CustomerID, OrderDate) ─NL→ OrderItems(OrderID)
        reads ≈ 3,000 customers + 1,200 orders + 4,800 items                  ≈ 10 ms
Plan B: Orders(OrderDate ≥ Sep) ─Hash→ Customers ─Hash→ OrderItems (full scan)
        reads ≈ 400,000 orders + 1,000,000 customers + 40,000,000 items       ≈ 40 s
```

Same result, four thousand times different. Choosing between plans like these is the optimizer's job.

---

# The Search Space

The number of plans grows explosively with the number of tables:

```text
tables   join orders (left-deep)   × algorithms (3 per join)   × access paths
2        2                          × 3
3        6                          × 9
5        120                        × 81          ≈ 10,000 before access paths
10       3,628,800                  × 19,683      ≈ 7 × 10^10
```

No optimizer tries them all. They prune with dynamic programming, heuristics and time limits—PostgreSQL switches to a genetic algorithm above 12 `FROM` items (`geqo_threshold`), SQL Server stops searching when a plan is "good enough" for the estimated cost. For very large queries, the optimizer may never see the best plan.

---

# Three Causes of Slow Queries

```text
1. TOO MUCH WORK                 2. THE WRONG PLAN                  3. WAITING
   the best plan still reads        a good plan exists, the           the plan is fine, but the
   far more data than needed        optimizer did not choose it       query waits for something
   ─────────────────────────        ─────────────────────────         ─────────────────────────
   missing index                    stale / missing statistics         locks held by others
   non-sargable predicate           skewed data, correlated columns    disk I/O (cold cache)
   SELECT * with wide rows          parameter sniffing                 memory grants, spills
   OFFSET pagination                SQL that hides information         CPU contention
   N+1 queries from the app         (functions, type mismatches)       network, client fetch
   fix: index, rewrite, schema      fix: statistics, rewrite, params   fix: concurrency, resources
```

Diagnosing which of the three applies decides what to fix. A plan that estimates 10 rows and processes 10 million is cause 2; a plan that correctly processes 10 million rows because no index exists is cause 1; a query that takes 30 seconds but uses 50 ms of CPU is cause 3.

---

# Who Does What

| The optimizer | You |
|---------------|-----|
| Chooses join order and algorithms | Provide indexes that make good plans possible |
| Chooses scans, seeks and lookups | Write sargable predicates with matching types |
| Rewrites subqueries, views, CTEs | Keep SQL simple enough to rewrite |
| Estimates rows from statistics | Keep statistics fresh and representative |
| Caches and reuses plans | Parameterize sensibly; handle skewed parameters |
| Allocates memory for sorts and hashes | Avoid sorting or grouping more than needed |
| — | Measure, and change one thing at a time |

The optimizer is very good at what it controls and powerless over the rest. Most tuning is about the right-hand column.

---

# Response Time vs Throughput

```text
RESPONSE TIME   how long one execution takes (user-facing latency)
THROUGHPUT      how many executions per second the system sustains
RESOURCE COST   CPU, reads, memory, locks consumed per execution
```

A parallel plan can cut response time while consuming more total CPU, lowering throughput for everyone else. A query that holds locks for 50 ms instead of 5 ms may look fast alone and still throttle a busy system. Optimize for the metric that matters: latency for interactive endpoints, total resource cost for high-volume queries, completion time for batch jobs.

---

# The Tuning Cycle

```text
   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
   │ MEASURE  │──▶ │ EXPLAIN  │──▶ │ DIAGNOSE │──▶ │   FIX    │──▶ │  VERIFY  │
   │ which    │    │ actual   │    │ estimate │    │ one      │    │ same data│
   │ queries? │    │ plan     │    │ vs actual│    │ change   │    │ & params │
   └──────────┘    └──────────┘    └──────────┘    └──────────┘    └────┬─────┘
        ▲                                                               │
        └───────────────────── next most expensive query ◀──────────────┘
```

Section 15.15 expands each step into a checklist.

---

# Visual Representation

```text
   SQL ──▶ optimizer ──▶ plan ──▶ executor ──▶ rows
            ▲    ▲        │
    statistics  indexes   └──▶ plan cache ──▶ reused for the next execution
   (what it knows) (what it can use)
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← which table first? decided by estimated row counts
2. JOIN        ← nested loop, hash or merge? decided by estimated sizes and available indexes
3. WHERE       ← pushed into scans and seeks wherever possible
4. GROUP BY    ← hash or stream aggregate, possibly early (before joins)
5. HAVING
6. WINDOW
7. SELECT
8. DISTINCT
9. ORDER BY    ← avoided entirely if an index delivers rows in order
10. LIMIT / FETCH / TOP   ← lets the plan stop early — changes which plan is cheapest
```

---

# How the DBMS Executes This

```text
Plan A in operator form:
  Hash Aggregate (CustomerName)
    └─ Nested Loop
         ├─ Nested Loop
         │    ├─ Index Scan Customers (Country = 'NZ')              est 3,000
         │    └─ Index Scan Orders (CustomerID = c.id, OrderDate ≥ …) est 0.4 per customer
         └─ Index Scan OrderItems (OrderID = o.id)                   est 4 per order
The optimizer picked it because estimated rows at each step were small.
If statistics said 'NZ' had 600,000 customers, Plan B would look cheaper.
```

---

# 🏗️ Architecture Insight

Design for the optimizer: normalized schemas with declared keys and foreign keys give it facts it can use (uniqueness, join cardinality, eliminable joins); consistent data types keep comparisons sargable; and a small number of well-chosen indexes shaped by real queries give it good options.

---

# ⚡ Performance Tip

Before optimizing a query, ask whether it should run at all: caching results in the application, pre-aggregating, batching many small queries into one, or removing an N+1 loop often beats any amount of SQL tuning.

---

# 🌍 Production Consideration

Plans change without code changes: statistics refresh, data grows past a threshold, a parameter value is sniffed differently after a restart, an engine upgrade changes the cost model. Capture plans and query statistics continuously so you can see when and why a query's plan changed.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Cost-based optimizer | Implementation | ✅ | ✅ | ✅ | ✅ | ✅ (NGQP) |
| Large-query strategy | — | GEQO above 12 items | Greedy search (`optimizer_search_depth`) | Timeout / good-enough plan | Permutation limits, adaptive plans | Heuristic N-nearest-neighbour search |
| Plan cache | — | Per session (prepared statements) | Not for plain SQL | Global | Global (shared pool) | Per prepared statement |

> **Portability Tip:** Every engine has a cost-based optimizer fed by statistics; the details of search strategy and caching differ. The workflow in this chapter applies to all of them.

---

# Common Mistakes

### Mistake 1

Assuming the SQL text determines the execution order.

---

### Mistake 2

Treating every slow query as a missing-index problem.

---

### Mistake 3

Optimizing response time of one query at the expense of system throughput.

---

# Best Practices

✔ Classify a slow query before fixing it: work, plan or waiting.

✔ Give the optimizer good inputs: statistics, indexes, keys, types.

✔ Tune by total cost and verify every change.

---

# Interview Questions

## Basic

1. What does a query optimizer do?
2. Why can two plans for the same query differ so much in speed?
3. What is an execution plan?

## Intermediate

4. Why doesn't the optimizer evaluate every possible plan?
5. What are the three broad causes of slow queries?
6. What is the difference between response time and throughput?

## Advanced

7. How can a correct plan still be slow?
8. Why can the same SQL get a different plan tomorrow?

---

# Hands-on Exercises

## Exercise 1

Write down two different plans for the sample query and estimate the rows each reads.

---

## Exercise 2

Find the ten most expensive queries by total time on a database you use.

---

## Exercise 3

For one slow query, decide whether the cause is work, plan or waiting, and justify it.

---

# Related Topics

- **Chapter 15 — Query Optimization**
- **15.02 — How the Query Optimizer Works (Parsing, Rewriting and Cost-Based Planning)**
- **15.15 — A Systematic Tuning Workflow**
- **04.03 — How SQL Works Internally (SQL Query Processing Pipeline)**

---

# Summary

SQL describes results, not algorithms, so every engine relies on a cost-based optimizer to choose among a search space that grows explosively with the number of tables. Slow queries do too much work, run the wrong plan, or wait on other sessions and resources—each needing a different fix. The optimizer controls plan choice; you control its inputs (indexes, statistics, SQL shape, types, parameters) and the process: measure, explain, diagnose, fix one thing, and verify.
