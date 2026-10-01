---
title: "16.03 - Plan Structure (Operators, Trees and Data Flow)"
description: "The structure shared by every execution plan: operators as iterators, parent and child nodes, the pull model, streaming versus blocking operators, startup and total cost, loops and executions, reading order in text, graphical and tabular plans, inclusive versus exclusive time, and where predicates and columns appear on each operator."
chapter: 16
section: 16.03
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 25 min
lastUpdated: 2026-10-01
---

# 16.03 Plan Structure (Operators, Trees and Data Flow)

---

# Learning Objectives

After completing this section, you will be able to:

- Describe operators as iterators that pull rows from their children.
- Read a plan in the order rows actually flow.
- Distinguish streaming from blocking operators.
- Interpret loops and executions, and per-loop versus total numbers.
- Convert inclusive operator time into the time an operator spent on its own.

---

# Operators Are Iterators

Almost every engine executes a plan with the **iterator** (Volcano) model. Each operator implements three calls:

```text
open()    prepare: allocate memory, open children
next()    return one row (or a batch), pulling rows from children as needed
close()   release resources
```

The root's `next()` is called by the client; it calls its children's `next()`, which call theirs, down to the leaves that read pages. So **control flows down** and **rows flow up**.

```text
         client asks for a row
                 │ next()
                 ▼
             [ Limit ]                rows ▲
                 │ next()                   │
                 ▼                          │
           [ Nested Loop ]                  │
             │ next()   ╲ next() (once per outer row)
             ▼            ▼                 │
      [ Index Scan ]   [ Index Scan ]       │
        Customers        Orders        ─────┘
```

Some engines also process rows in **batches** (SQL Server batch mode, Oracle and MySQL HeatWave vectorized engines, columnar extensions), but the tree and the reading order are the same.

---

# Reading Order

The rule for every format: **start at the leaves, follow the rows to the root**. Among siblings, the first child usually runs first.

```text
TEXT TREE (PostgreSQL, MySQL TREE)         the most indented lines are the leaves;
                                           "->" marks a child; read bottom-up, inner-first

GRAPHICAL (SSMS, Workbench, pgAdmin)       SQL Server: root on the LEFT, leaves on the RIGHT;
                                           rows flow right → left; the top child is the outer/build input

TABLE (Oracle DBMS_XPLAN)                  Id 0 is the root; indentation of "Operation" shows depth;
                                           the first child (lowest Id at a level) runs first

TABLE (MySQL traditional EXPLAIN)          one row per table, in join order (top row = first table read)
```

Example: the same plan in two notations.

```text
PostgreSQL text                              SQL Server graphical (drawn as text)
Hash Join                                    SELECT ◀── Hash Match ◀── Index Seek (Orders)       ← build (top)
  -> Seq Scan on orderitems                                     ◀── Clustered Index Scan (Items)  ← probe (bottom)
  -> Hash
       -> Index Scan on orders
```

Note the build side differs in position: PostgreSQL puts the hashed input under a `Hash` node as the **second** child; SQL Server draws the build input on **top**. Know your engine's convention.

---

# Streaming vs Blocking Operators

| Kind | Behaviour | Examples |
|------|-----------|----------|
| Streaming (pipelined) | Returns rows as soon as it gets them | Scan, seek, filter, compute, nested loop, merge join, stream aggregate, limit |
| Blocking | Must consume all input before returning the first row | Sort, hash aggregate, hash build (join build side), materialize/spool, window over unsorted input |
| Semi-blocking | Consumes one input fully, then streams the other | Hash join (build blocks, probe streams) |

Why it matters:

```text
SELECT … ORDER BY CreatedAt LIMIT 10;

with an index on CreatedAt:   Limit ← Index Scan (ordered)      streaming: reads ~10 rows, stops
without one:                  Limit ← Sort ← Seq Scan           blocking: reads ALL rows, sorts, returns 10
```

A `LIMIT` above only streaming operators can stop the whole plan early. A blocking operator anywhere below it means everything under that operator runs to completion first.

---

# Startup Cost and Total Cost

PostgreSQL shows two costs per node, and the same idea exists in every engine:

```text
Sort  (cost=152034.10..154534.10 rows=1000000 width=48)
             ▲ startup          ▲ total
```

- **Startup cost**: work before the first row can be returned (high for blocking operators).
- **Total cost**: work to return all rows.

With a `LIMIT`, the optimizer weighs startup cost more heavily—this is the "row goal" from Section 15.05.

The actual-time pair has the same meaning: `actual time=0.031..0.402` is time to first row, then time to last row, in milliseconds.

---

# Loops and Executions

An operator can run many times—most commonly the inner side of a nested loop:

```text
Nested Loop  (actual rows=4,004 loops=1)
  -> Index Scan on orders o      (actual rows=1,001 loops=1)
  -> Index Scan on orderitems oi (actual time=0.004..0.006 rows=4 loops=1,001)
```

PostgreSQL and MySQL `EXPLAIN ANALYZE` report **per-loop averages**: the inner scan returned *on average* 4 rows per execution and took about 0.006 ms per execution. Totals are per-loop × loops:

```text
rows   4 × 1,001     ≈ 4,004 rows
time   0.006 × 1,001 ≈ 6 ms
```

| Engine | Executions shown as | Rows shown as |
|--------|---------------------|---------------|
| PostgreSQL | `loops=N` | Per loop (average) |
| MySQL `EXPLAIN ANALYZE` | `loops=N` | Per loop (average) |
| SQL Server | `Number of Executions` | `Actual Number of Rows for All Executions` (total) |
| Oracle `ALLSTATS LAST` | `Starts` | `A-Rows` total; `E-Rows` per start |

Forgetting this is the most common arithmetic mistake in plan reading (Section 16.16).

---

# Inclusive vs Exclusive Time

In PostgreSQL and MySQL, a node's actual time **includes its children**. To find where time is really spent, subtract:

```text
Hash Join            actual time=…..7.20      inclusive: 7.20 ms
  -> Index Scan      actual time=…..1.10      child
  -> Hash            actual time=…..3.90      child
exclusive time of Hash Join ≈ 7.20 − 1.10 − 3.90 = 2.20 ms
```

Visualizers (explain.dalibo.com, explain.depesz.com, pgMustard) do this subtraction for you and highlight the operators with the most exclusive time. SQL Server's actual plans (2014 SP2 / 2016 SP1 and later) show elapsed and CPU time per operator; for row-mode operators those numbers include their children, for batch-mode operators they do not. Oracle's `A-Time` is inclusive of children.

---

# What Each Operator Carries

Every operator node lists some of:

```text
Name / type          Index Scan, Hash Join, Sort …
Object               table or index read
Seek / index cond.   predicates used to navigate an index (cheap)
Filter / predicate   predicates checked row by row after reading (rows read, then discarded)
Join condition       Hash Cond / Merge Cond / join predicate
Output columns       which columns flow upward (VERBOSE / Output List)
Estimates            rows, width, cost
Actuals              rows, loops, time, reads, memory, spills
```

The distinction between a **seek/index condition** and a **filter** is one of the most useful things in any plan: the first limits what is read, the second only throws rows away after reading them (Section 16.12).

---

# Visual Representation

```text
                       ┌───────────┐
          rows ▲       │   Limit   │  streaming: stops after N rows
                       └─────┬─────┘
                       ┌─────┴─────┐
                       │   Sort    │  BLOCKING: reads all input first
                       └─────┬─────┘
                       ┌─────┴─────┐
                       │ Hash Join │  build blocks, probe streams
                       └──┬─────┬──┘
              probe ┌─────┘     └─────┐ build
            ┌───────┴──────┐   ┌──────┴──────┐
            │ Seq Scan     │   │ Hash        │
            │ OrderItems   │   │  └ Index Scan│
            └──────────────┘   │    Orders   │
                               └─────────────┘
          control (next()) flows down; rows flow up
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← leaves of the tree: the deepest operators
2. JOIN        ← binary operators with an outer/probe and an inner/build child
3. WHERE       ← seek conditions in leaves, filters on any operator
4. GROUP BY    ← aggregate operator above the joins
5. HAVING      ← filter on the aggregate
6. WINDOW      ← window operator, usually above a sort
7. SELECT      ← output columns and computed expressions
8. DISTINCT    ← unique/aggregate/sort operator
9. ORDER BY    ← sort near the root, unless order comes from below
10. LIMIT / FETCH / TOP   ← the root (or next to it) in most plans
```

---

# How the DBMS Executes This

```text
client: fetch
 └─ Limit.next()                                   wants 10 rows
     └─ Sort.next()   first call → loop Child.next() until exhausted, sort, return row 1
         └─ Hash Join.next()
             first call → build: loop Hash.next() until exhausted (hash table of Orders)
             then → probe: OrderItems row → look up hash table → emit matches
         …
     Limit has 10 rows → close() all operators → query ends
```

---

# 🏗️ Architecture Insight

Blocking operators define a plan's memory profile and latency. Interactive queries should be built from streaming operators fed by indexes (seek → nested loop → limit), so the first rows arrive in milliseconds. Analytical queries can afford blocking hash joins and aggregates—but need memory budgeted for them.

---

# ⚡ Performance Tip

Look for blocking operators directly below a `LIMIT`/`TOP`. A `Sort` under a `Limit` usually means "read everything, then keep 10"; an index matching the `ORDER BY` turns it into "read 10".

---

# 🌍 Production Consideration

Per-loop numbers hide the scale of nested-loop inner sides. A seek that takes 0.05 ms looks harmless until you see `loops=2,000,000`—100 seconds in total. Always multiply before you dismiss an operator.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Tree layout | ❌ | Indented text, root at top | Indented text (TREE) | Graphical, root at left | Indented table, Id 0 = root | Indented text |
| Executions | ❌ | `loops` | `loops` | Number of Executions | `Starts` | `.scanstats` loops |
| Rows reported | ❌ | Per loop | Per loop | Total | `A-Rows` total | Total |
| Startup/total cost | ❌ | ✅ | ✅ (`cost=`) | Subtree cost only | Cost only | ❌ |
| Per-operator time | ❌ | Inclusive | Inclusive | Elapsed/CPU (row mode inclusive) | `A-Time` inclusive | ❌ |

> **Portability Tip:** "Leaves first, rows upward, multiply by executions" works for every engine. Check whether rows are per execution or total before doing arithmetic.

---

# Common Mistakes

### Mistake 1

Reading a text plan from the top as if the root ran first.

---

### Mistake 2

Forgetting to multiply per-loop rows and time by loops.

---

### Mistake 3

Treating inclusive time as the operator's own time.

---

### Mistake 4

Expecting a `LIMIT` to make a query fast when a sort sits below it.

---

# Best Practices

✔ Start at the leaves and follow the rows upward.

✔ Know whether your engine reports rows per execution or in total.

✔ Subtract children's time to find an operator's own time—or use a visualizer.

✔ Identify blocking operators; they decide latency and memory.

✔ Distinguish index/seek conditions from filters on every leaf.

---

# Interview Questions

## Basic

1. In which direction do rows flow through a plan?
2. What is a blocking operator? Give two examples.
3. What does `loops=1000` mean on a plan node?

## Intermediate

4. What is the difference between startup cost and total cost?
5. Why can `LIMIT 10` still read a whole table?
6. How do you compute an operator's exclusive time in PostgreSQL?

## Advanced

7. Compare how PostgreSQL and SQL Server draw the build side of a hash join.
8. Explain the iterator model and why it makes early termination possible.

---

# Hands-on Exercises

## Exercise 1

Take a PostgreSQL or MySQL actual plan with a nested loop and compute total rows and time for its inner side.

---

## Exercise 2

For the same query with and without an index matching `ORDER BY … LIMIT 10`, mark every blocking operator in both plans.

---

## Exercise 3

Compute exclusive time for every node of a five-node plan and find the most expensive operator.

---

# Related Topics

- **16.01 — Introduction to Execution Plans**
- **16.04 — Reading PostgreSQL Plans (EXPLAIN ANALYZE and BUFFERS)**
- **16.09 — Join Operators (Nested Loop, Hash and Merge)**
- **16.10 — Sort, Aggregate and Set Operators**
- **15.10 — Pagination and Top-N Query Optimization**

---

# Summary

Every plan is a tree of iterators: the client pulls from the root, each operator pulls from its children, and rows flow from the leaves upward. Read plans from the leaves to the root, following each engine's layout conventions. Streaming operators pass rows on immediately, while blocking operators such as sorts, hash aggregates and hash builds consume their entire input first—which decides latency, memory and whether a `LIMIT` can stop early. Operators that run many times report loops or executions, and PostgreSQL and MySQL show per-loop averages that must be multiplied. Node times are inclusive of children, so subtract to find each operator's own cost, and always distinguish predicates that navigate an index from filters that discard rows after reading them.
