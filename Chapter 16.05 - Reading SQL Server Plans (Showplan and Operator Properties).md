---
title: "16.05 - Reading SQL Server Plans (Showplan and Operator Properties)"
description: "How to read SQL Server execution plans: graphical layout and arrow widths, the root SELECT node and its properties, operator properties (estimated and actual rows, executions, seek predicates versus predicates, output lists), cost percentages, warnings, memory grants, row and batch mode, the showplan XML, STATISTICS IO and TIME, and a complete worked example."
chapter: 16
section: 16.05
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 25 min
lastUpdated: 2026-10-01
---

# 16.05 Reading SQL Server Plans (Showplan and Operator Properties)

---

# Learning Objectives

After completing this section, you will be able to:

- Navigate a graphical SQL Server plan and its arrows.
- Read the root `SELECT` node's properties: memory grant, compile details, parameters, warnings.
- Read operator properties: estimated and actual rows, executions, seek predicates and predicates.
- Recognise why cost percentages mislead.
- Pair a plan with `STATISTICS IO` and `TIME` output.

---

# Layout

```text
SELECT ◀──── Nested Loops ◀──── Index Seek [Customers].[ix_customers_country]      (outer, top)
 Cost: 0%     (Inner Join)            Cost: 2%
              Cost: 1%       ◀──── Index Seek [Orders].[ix_orders_customer_date]   (inner, bottom)
                                      Cost: 97%
```

- The **root** (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) is on the **left**; leaves are on the **right**.
- Rows flow **right to left** along the arrows.
- For joins, the **top** input is the outer (nested loops) or build (hash match) side.
- **Arrow thickness** is proportional to rows (actual rows in an actual plan, estimated otherwise)—a thick arrow into a thin one is a filter or a join discarding work.
- Hover an operator for a tooltip; press **F4** for its full Properties window, which has more than the tooltip.

---

# The Root Node

Select the root `SELECT` operator and open Properties (F4). The most useful items:

| Property | Why it matters |
|----------|----------------|
| `CardinalityEstimationModelVersion` | 70 = legacy CE, 120+ = new CE; changes estimates |
| `CompileTime`, `CompileCPU`, `CompileMemory` | Expensive compilations |
| `MemoryGrantInfo` (`RequestedMemory`, `GrantedMemory`, `MaxUsedMemory`) | Over- or under-sized grants; waits for grants |
| `Parameter List` (`Parameter Compiled Value`, `Parameter Runtime Value`) | Parameter sniffing evidence (Section 15.08) |
| `QueryTimeStats` (`CpuTime`, `ElapsedTime`) | Total CPU vs elapsed: working or waiting? |
| `WaitStats` (2016 SP1+) | Top waits during this execution |
| `Warnings` | Implicit conversions, spills, excessive grants, no join predicate |
| `StatementOptmEarlyAbortReason` | `TimeOut` = optimizer stopped searching; `GoodEnoughPlanFound` |
| `Optimization Level` | `TRIVIAL` (no cost-based search) or `FULL` |
| `QueryHash`, `QueryPlanHash` | Identify the query and the plan shape across executions |
| `Degree of Parallelism` | Parallel plan, and how many threads |

```text
Parameter List
  @CustomerID   Compiled Value: (42)    Runtime Value: (900017)     ← plan built for a small customer,
                                                                       running for a huge one
```

---

# Operator Properties

```text
Index Seek (NonClustered)  [Orders].[ix_orders_customer_date] [o]
  Seek Predicates      Seek Keys[1]: Prefix: [o].CustomerID = Scalar Operator([c].[CustomerID]),
                       Start: [o].OrderDate >= Scalar Operator('2026-09-01')
  Predicate            [o].[Status] = 'Pending'
  Output List          [o].OrderID, [o].CustomerID, [o].TotalAmount
  Estimated Number of Rows Per Execution        3.2
  Estimated Number of Rows for All Executions   1,280
  Estimated Number of Executions                400
  Number of Executions                          3,915
  Actual Number of Rows for All Executions      41,880
  Actual Number of Rows Read                    1,204,550
  Ordered: True    Scan Direction: FORWARD
  Actual I/O Statistics: Actual Logical Reads 12,446
  Actual Time Statistics: Actual Elapsed Time (ms) 820, Actual CPU Time (ms) 790
```

| Property | Meaning |
|----------|---------|
| `Seek Predicates` | Used to navigate the index (cheap) |
| `Predicate` | Checked on each row read (residual predicate—rows read, then discarded) |
| `Actual Number of Rows Read` vs `Actual Number of Rows` | Rows touched vs rows passed on; a big ratio means a residual predicate is doing the work |
| `Estimated … Per Execution` vs `Actual … for All Executions` | Divide actual by `Number of Executions` before comparing |
| `Output List` | Columns returned; drives key lookups when the index doesn't cover them |
| `Ordered`, `Scan Direction` | Index order is being relied on (e.g., to avoid a sort) |
| `Actual Execution Mode` | `Row` or `Batch` (columnstore / batch mode on rowstore, 2019+) |

Above: estimated 400 executions, actual 3,915; estimated 3.2 rows per execution, actual ≈ 10.7. And 1.2 million rows read to return 41,880—`Status` is a residual predicate. Two separate problems in one operator.

---

# Cost Percentages Are Estimates

Every operator shows `Cost: NN%`. That number is the operator's **estimated** cost relative to the whole plan—**even in an actual plan**. When estimates are wrong, the percentages are wrong:

```text
Key Lookup     Cost: 2%      ← estimated 12 executions; actual 1,800,000
Sort           Cost: 61%     ← estimated big sort; actual tiny
```

Use actual rows, executions, elapsed/CPU time and logical reads to decide where the time went—not the percentages.

---

# Common Operators

| Operator | What it does |
|----------|--------------|
| `Clustered Index Scan` / `Table Scan` | Reads the whole table (clustered or heap) |
| `Index Scan` | Reads a whole nonclustered index |
| `Index Seek` / `Clustered Index Seek` | Navigates to matching entries |
| `Key Lookup` / `RID Lookup` | Fetches the rest of the row from the clustered index / heap |
| `Nested Loops` | Inner side executed per outer row (also used for lookups) |
| `Hash Match` | Hash join, hash aggregate or hash distinct (check `Logical Operation`) |
| `Merge Join` | Joins two sorted inputs |
| `Sort` / `Top N Sort` | Sorts; Top N keeps only N |
| `Stream Aggregate` | Aggregates sorted input |
| `Compute Scalar` | Calculates expressions (often cheap; may hide scalar UDF calls) |
| `Filter` | Applies a predicate after other operators |
| `Top` | Stops after N rows |
| `Parallelism` (Gather/Repartition/Distribute Streams) | Exchanges rows between threads (Section 16.13) |
| `Table Spool` / `Index Spool` / `Eager Spool` | Stores intermediate rows in tempdb for reuse |
| `Adaptive Join` | Chooses hash or nested loops at run time (batch mode, 2017+) |

---

# STATISTICS IO and TIME

```sql
SET STATISTICS IO, TIME ON;
SELECT …;
```

```text
Table 'Orders'. Scan count 3915, logical reads 12446, physical reads 0, read-ahead reads 0, …
Table 'Customers'. Scan count 1, logical reads 1650, physical reads 2, …
Table 'Worktable'. Scan count 0, logical reads 0, …

 SQL Server Execution Times:
   CPU time = 860 ms,  elapsed time = 912 ms.
```

- **Logical reads** (8 kB pages from the buffer pool) are the stable measure to compare before and after.
- **Scan count** is the number of seeks/scans started—here one per outer row of the nested loop.
- `Worktable` / `Workfile` rows indicate spools, sorts or hashes using tempdb.
- CPU close to elapsed: working. Elapsed ≫ CPU: waiting (look at `WaitStats`).

---

# The XML Behind the Picture

The graphical plan is a rendering of showplan XML. A fragment:

```text
<RelOp NodeId="4" PhysicalOp="Index Seek" LogicalOp="Index Seek" EstimateRows="3.2"
       EstimatedExecutionMode="Row" EstimateExecutions="400">
  <RunTimeInformation>
    <RunTimeCountersPerThread Thread="0" ActualRows="41880" ActualRowsRead="1204550"
       ActualExecutions="3915" ActualLogicalReads="12446" ActualElapsedms="820" ActualCPUms="790"/>
  </RunTimeInformation>
  <IndexScan Ordered="1" ScanDirection="FORWARD">
    <SeekPredicates> … </SeekPredicates>
    <Predicate> … </Predicate>
  </IndexScan>
</RelOp>
```

Search the XML when the graphical plan is huge: `Warnings`, `SpillToTempDb`, `CONVERT_IMPLICIT`, `MissingIndex`, `ActualRowsRead`. In parallel plans, `RunTimeCountersPerThread` shows how evenly work was split.

---

# A Complete Worked Example

```sql
SELECT o.OrderID, o.OrderDate, o.TotalAmount, c.CustomerName
FROM Orders o
JOIN Customers c ON c.CustomerID = o.CustomerID
WHERE o.OrderDate >= '2026-09-01' AND o.OrderDate < '2026-10-01'
ORDER BY o.TotalAmount DESC;
```

```text
SELECT ◀─ Sort ◀──────── Hash Match (Inner Join) ◀─ Clustered Index Scan [Customers]          (build, top)
         (Warning:        actual 391,220                actual 1,000,000
          spilled to                          ◀─ Nested Loops ◀─ Index Seek [ix_orders_orderdate]  est 146,500 / act 391,220
          tempdb)                                                ◀─ Key Lookup [Orders]            executions 391,220
```

1. `Index Seek` on `ix_orders_orderdate` returned 391,220 rows (estimated 146,500).
2. The index does not contain `TotalAmount` or `CustomerID`, so `Key Lookup` ran 391,220 times—hundreds of thousands of random page reads.
3. `Hash Match` built a hash table of all one million customers to join them.
4. `Sort` had a memory grant sized for 146,500 rows; it received 391,220 and **spilled** to tempdb (yellow warning triangle).

Fixes in order: refresh statistics on `Orders.OrderDate` (fixes the estimate, and the grant); make the date index cover the query—`CREATE INDEX ix_orders_orderdate_cov ON Orders (OrderDate) INCLUDE (CustomerID, TotalAmount)`—which removes the key lookups.

---

# Visual Representation

```text
  root (left) ◀────────────────────────────────────── leaves (right)
  SELECT props: grant · params (compiled vs runtime) · CPU vs elapsed · waits · warnings
     ◀═══ thick arrow = many rows ═══ operator ◀── thin arrow = few rows
  operator props: Seek Predicates (navigate) · Predicate (residual) · Rows Read vs Rows
                  Est per execution × executions vs Actual for all executions
                  Logical reads · Elapsed / CPU · Execution mode · Warnings ⚠
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← Index Seek / Index Scan / Clustered Index Scan / Table Scan at the right edge
2. JOIN        ← Nested Loops / Hash Match / Merge Join / Adaptive Join
3. WHERE       ← Seek Predicates, Predicate properties, or a Filter operator
4. GROUP BY    ← Stream Aggregate / Hash Match (Aggregate)
5. HAVING      ← Filter after the aggregate
6. WINDOW      ← Segment + Sequence Project / Window Spool / Window Aggregate (batch)
7. SELECT      ← Compute Scalar; Output List properties
8. DISTINCT    ← Hash Match (Flow Distinct) / Sort (Distinct Sort) / Stream Aggregate
9. ORDER BY    ← Sort / Top N Sort, or Ordered = True on an index operator
10. LIMIT / FETCH / TOP   ← Top at the left, next to the root
```

---

# How the DBMS Executes This

```text
Actual plan capture (STATISTICS XML / Ctrl+M):
  compile (or reuse cached plan) → execute with per-operator runtime counters
  → counters per thread: ActualRows, ActualRowsRead, ActualExecutions, reads, elapsed, CPU
  → appended to the plan XML as RunTimeInformation → rendered graphically by SSMS
Lightweight profiling (2019+ default) makes these counters cheap enough for Live Query Statistics.
```

---

# 🏗️ Architecture Insight

SQL Server's `Missing Index` suggestions in plans are produced during optimization for that single query: they ignore column order subtleties, existing similar indexes, write cost and other queries. Treat them as hints toward an index design (Section 10.15), not as a ready-made `CREATE INDEX`.

---

# ⚡ Performance Tip

Open the root node's Properties first. `Parameter List` (compiled vs runtime values), `MemoryGrantInfo`, `QueryTimeStats` and `WaitStats` answer "wrong plan, too much work, or waiting?" before you look at a single operator.

---

# 🌍 Production Consideration

Actual plans from SSMS are captured under your session's `SET` options. If `ARITHABORT` (SSMS default ON) differs from the application's setting (often OFF for .NET clients), you get a **different cache entry**—and possibly a different plan. Compare `SET` options in the plan's `StatementSetOptions` with the application's before concluding "it's fast in SSMS".

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Graphical plan in standard tool | ❌ | pgAdmin | Workbench | SSMS | SQL Developer | ❌ |
| Compiled vs runtime parameter values | ❌ | ❌ | ❌ | ✅ (`Parameter List`) | Peeked binds (`+PEEKED_BINDS`) | ❌ |
| Memory grant details | ❌ | `work_mem` per node | ❌ | ✅ (`MemoryGrantInfo`) | `OMem`/`1Mem`/`Used-Mem` | ❌ |
| Waits in plan | ❌ | ❌ | ❌ | ✅ (`WaitStats`) | SQL Monitor | ❌ |
| Missing index hints | ❌ | ❌ | ❌ | ✅ | SQL Tuning Advisor | ❌ |

> **Portability Tip:** SQL Server plans hide much of their detail in properties. Make F4 (Properties) and the XML your default view, not the tooltip.

---

# Common Mistakes

### Mistake 1

Using `Cost: NN%` to decide which operator is slow in an actual plan.

---

### Mistake 2

Comparing `Estimated Number of Rows Per Execution` directly with `Actual Number of Rows for All Executions`.

---

### Mistake 3

Creating every `Missing Index` suggestion the plan offers.

---

### Mistake 4

Concluding "it's fast in SSMS" without matching the application's `SET` options and parameter types.

---

# Best Practices

✔ Start with the root node's properties.

✔ Follow thick arrows; compare rows read with rows returned.

✔ Normalise estimates and actuals by executions before comparing.

✔ Check warnings: conversions, spills, grants, missing join predicates.

✔ Confirm findings with `STATISTICS IO, TIME` logical reads and CPU.

---

# Interview Questions

## Basic

1. In which direction do rows flow in an SSMS graphical plan?
2. What is a Key Lookup, and when does it appear?
3. What does arrow thickness represent?

## Intermediate

4. What is the difference between `Seek Predicates` and `Predicate`?
5. Why are cost percentages unreliable in an actual plan?
6. What do `Parameter Compiled Value` and `Parameter Runtime Value` tell you?

## Advanced

7. A Sort shows a spill warning. Which root-node properties explain why, and how would you fix it?
8. Why might a query be fast in SSMS but slow from the application, and how would you prove it with plan properties?

---

# Hands-on Exercises

## Exercise 1

Capture an actual plan with a Key Lookup and record executions, rows and logical reads; then add `INCLUDE` columns and compare.

---

## Exercise 2

Find a query where `Actual Number of Rows Read` is at least 100× `Actual Number of Rows`, and move the residual predicate into the index key.

---

## Exercise 3

Run a parameterized query with a small value, then a large one, and compare compiled and runtime values in the root node.

---

# Related Topics

- **16.02 — Getting a Plan (EXPLAIN, Estimated and Actual Plans)**
- **16.08 — Table Access Operators (Scans, Seeks, Lookups and Bitmaps)**
- **16.12 — Plan Warnings and Red Flags (Spills, Conversions and Residual Predicates)**
- **15.08 — Parameter Sniffing, Plan Caching and Prepared Statements**
- **10.06 — Covering Indexes and Included Columns**

---

# Summary

SQL Server plans flow right to left, from leaf operators to the root, with arrow widths showing rows. The root node's properties answer the big questions first: memory grant, compiled versus runtime parameters, CPU versus elapsed time, waits and warnings. Operator properties separate seek predicates from residual predicates, compare rows read with rows returned, and report estimated rows per execution against actual rows for all executions, plus logical reads and time. Cost percentages are estimates even in actual plans, so decide using actual counters, `STATISTICS IO` and `TIME`, and the plan XML, which holds every detail the graphical view hides.
