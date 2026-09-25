---
title: "09.14 - Execution Flow of Subqueries (Unnesting and Decorrelation)"
description: "How engines execute subqueries: InitPlans and constant folding, SubPlans and per-row execution, subquery unnesting into semi-joins and anti-joins, decorrelation of scalar aggregates and the count bug, derived-table merging and materialisation, result caching, and reading subqueries in execution plans."
chapter: 9
section: 9.14
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 35 min
lastUpdated: 2026-09-25
---

# 09.14 Execution Flow of Subqueries (Unnesting and Decorrelation)

---

# Learning Objectives

After completing this section, you will be able to:

- Describe the three ways a subquery can be executed: once, per row, or rewritten away.
- Explain subquery unnesting into semi-joins and anti-joins.
- Explain decorrelation of scalar aggregate subqueries and the count bug.
- Explain derived-table merging, materialisation and predicate pushdown.
- Recognise each case in an execution plan.

---

# Three Execution Strategies

```text
                            Subquery
                               │
         ┌─────────────────────┼─────────────────────────┐
         ▼                     ▼                         ▼
   Run ONCE              Run PER ROW                REWRITE AWAY
   (uncorrelated)        (correlated,               (unnesting,
                          not rewritable)            decorrelation,
   InitPlan /            SubPlan /                   merging)
   constant scan         Apply / Filter             → ordinary joins
```

The logical meaning is always the same; only the cost differs. The optimizer's goal is to move as many subqueries as possible into the third column, where they take part in join ordering and algorithm selection like any other table.

---

# Strategy 1: Run Once

An uncorrelated subquery depends on nothing in the outer query, so it is evaluated once before (or at the start of) the outer query:

```text
SELECT * FROM Products WHERE ListPrice > (SELECT AVG(ListPrice) FROM Products)

PostgreSQL                               SQL Server
Seq Scan on Products                     Nested Loops (Inner Join)
  Filter: ListPrice > $0                   Stream Aggregate  ← computed once
  InitPlan 1 (returns $0)                    Scan Products
    Aggregate                              Filter ListPrice > [Expr1004]
      Seq Scan on Products                   Scan Products
```

An uncorrelated `IN` subquery may likewise be run once and its result **materialised** into a hash table or temporary index, then probed by each outer row.

---

# Strategy 2: Run per Row

When a correlated subquery cannot be rewritten, the executor evaluates it for each outer row, binding the outer reference as a parameter:

```text
SELECT c.CustomerID,
       (SELECT o.OrderID FROM Orders o WHERE o.CustomerID = c.CustomerID
        ORDER BY o.OrderDate DESC LIMIT 1)
FROM Customers c

Seq Scan on Customers c
  SubPlan 1                                  ← executed once per customer
    Limit
      Index Scan Backward using ix_orders_cust_date on Orders o
        Index Cond: (CustomerID = c.CustomerID)
```

Cost ≈ *outer rows × one inner execution*. With the index above, each inner execution reads one index entry, and this plan is excellent. Without it, each execution scans `Orders`.

SQL Server shows the same shape as a **Nested Loops (Apply)** operator with an *Outer References* list; Oracle shows a `FILTER` operation with the subquery as its second child.

---

# Strategy 3a: Unnesting IN and EXISTS

`IN` and `EXISTS` subqueries are turned into semi-joins, `NOT EXISTS` into anti-joins:

```text
SELECT c.* FROM Customers c
WHERE EXISTS (SELECT 1 FROM Orders o WHERE o.CustomerID = c.CustomerID)

      rewrite
         ↓
Customers c  ⋉  Orders o   ON o.CustomerID = c.CustomerID      (⋉ = semi-join)

Hash Semi Join
  Hash Cond: (c.CustomerID = o.CustomerID)
  -> Seq Scan on Customers c
  -> Hash
       -> Seq Scan on Orders o
```

Once unnested, the optimizer can choose the join order (drive from `Orders` if it is the smaller filtered side), the algorithm (hash, merge, nested loop), and parallelism—none of which is possible for a SubPlan.

---

# What Blocks Unnesting

| Construct inside the subquery | Why it blocks |
|-------------------------------|---------------|
| Row limit (`LIMIT`, `TOP`, `FETCH FIRST`) | "First N per outer row" has no join equivalent |
| Correlation inside `OR` with outer conditions | `WHERE a = 1 OR EXISTS (…)` cannot become a single join |
| Correlation through a non-deterministic function | Result could differ per evaluation |
| Set operations with correlation in several branches | Rewrite needs per-branch handling (some engines do it) |
| `NOT IN` on nullable columns | Needs null-aware semantics |
| Correlation more than one level up | Some engines only unnest one level |

When a plan shows a SubPlan or Apply where you expected a join, look for one of these.

---

# Strategy 3b: Decorrelating Scalar Aggregates

```sql
SELECT e.EmployeeName
FROM Employees AS e
WHERE e.Salary > (SELECT AVG(e2.Salary) FROM Employees AS e2
                  WHERE e2.DepartmentID = e.DepartmentID);
```

```text
      rewrite
         ↓
SELECT e.EmployeeName
FROM Employees e
JOIN (SELECT DepartmentID, AVG(Salary) AS a
      FROM Employees GROUP BY DepartmentID) d
  ON d.DepartmentID = e.DepartmentID
WHERE e.Salary > d.a
```

The per-row subquery becomes one aggregation and one join. SQL Server and Oracle apply this rewrite automatically; PostgreSQL generally does not, so writing the derived-table form yourself can make a large difference there.

---

# The Count Bug

Decorrelation must preserve the behaviour for outer rows with **no** inner rows:

```sql
-- Customers with fewer than 2 orders (including those with none)
SELECT c.CustomerID
FROM Customers AS c
WHERE (SELECT COUNT(*) FROM Orders AS o WHERE o.CustomerID = c.CustomerID) < 2;
```

```text
Naive rewrite:
  Customers JOIN (SELECT CustomerID, COUNT(*) n FROM Orders GROUP BY CustomerID) t
  WHERE t.n < 2
  → customers with NO orders have no row in t → wrongly dropped

Correct rewrite:
  Customers LEFT JOIN (…) t ON …
  WHERE COALESCE(t.n, 0) < 2
```

`COUNT` over no rows is `0`, but a missing group is "no row" and becomes `NULL` after an outer join. This bug, identified in early decorrelation research in the 1980s, is why optimizers use outer joins plus a `COALESCE`-like projection when decorrelating `COUNT`—and why you must do the same when rewriting by hand (Section 09.13).

---

# Strategy 3c: Merging Derived Tables

```text
SELECT t.OrderID FROM (SELECT * FROM Orders WHERE Status = 'Shipped') t
WHERE t.TotalAmount > 500

      merge
         ↓
SELECT OrderID FROM Orders WHERE Status = 'Shipped' AND TotalAmount > 500
```

Simple derived tables (and simple views and CTEs) are dissolved into the outer query. Derived tables with `GROUP BY`, `DISTINCT`, window functions, row limits or set operations cannot be merged; they are executed as separate steps. Two techniques keep those cheap:

- **Predicate pushdown**: an outer filter on a grouping column (`WHERE t.CustomerID = 5`) is moved inside, below the `GROUP BY`.
- **Join predicate pushdown** (Oracle, SQL Server): for a nested-loop join to a grouped derived table, the join key is pushed in as a parameter, so the derived table aggregates only the rows for the current outer key—turning it into a lateral subquery internally.

---

# Materialisation and Caching

When a subquery's result is reused, engines may store it:

| Mechanism | Engine | What it stores |
|-----------|--------|----------------|
| Hashed SubPlan | PostgreSQL | Uncorrelated `IN`/`NOT IN` result in a hash table |
| Materialized CTE / subquery | PostgreSQL, MySQL, Oracle | Derived table result in a work table |
| Memoize | PostgreSQL 14+ | Results of parameterised inner scans of nested-loop joins, by key |
| Lazy / Eager Spool | SQL Server | Inner results; lazy spool replays for repeated outer values |
| Scalar subquery caching | Oracle | Recent (outer value → result) pairs |
| Subquery materialization | MySQL | Uncorrelated `IN` result with a temporary index |

---

# Reading a Plan: Checklist

```text
1. Find every subquery in the SQL.
2. For each, locate it in the plan:
     - absorbed into a Semi / Anti / ordinary Join?        → unnested ✅
     - an InitPlan / computed once?                        → uncorrelated ✅
     - a SubPlan / Apply / FILTER with a child?            → per row ⚠️
3. For each per-row subquery, check:
     - estimated/actual executions (loops)
     - whether the inner access is an index seek or a scan
4. If per-row + scan + many loops → add an index or rewrite.
```

---

# Visual Representation

```text
SQL text                     After rewrite                    Plan
────────────────────────     ──────────────────────────────   ─────────────────────
WHERE x > (SELECT AVG…)   →  constant $0                    →  InitPlan + Filter
WHERE EXISTS (… corr …)   →  ⋉ semi-join                    →  Hash / NL Semi Join
WHERE NOT EXISTS (…)      →  ▷ anti-join                    →  Hash / NL Anti Join
WHERE x > (SELECT AVG…    →  JOIN grouped derived table     →  Hash Join + HashAgg
           corr …)
FROM (simple SELECT) t    →  merged into outer query        →  (no separate node)
FROM (GROUP BY …) t       →  separate block, pushed filters →  Subquery Scan + Agg
SELECT (… LIMIT 1 corr)   →  unchanged                      →  SubPlan per row
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← derived tables are merged, materialised or pushed into here
2. JOIN        ← unnested subqueries become joins here
3. WHERE       ← un-rewritten subqueries run as filters here
4. GROUP BY
5. HAVING
6. SELECT      ← un-rewritten scalar subqueries run here
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

The logical order defines the result; the rewrites above change where the work physically happens without changing what is returned.

---

# How the DBMS Executes This

```text
Parse ──→ Bind ──→ Rewrite ─────────────────────────→ Optimize ──→ Execute
                     │
                     ├─ fold uncorrelated scalars into InitPlans
                     ├─ unnest IN / EXISTS / NOT EXISTS → semi / anti joins
                     ├─ decorrelate scalar aggregates → outer join + GROUP BY
                     ├─ merge simple derived tables / views / CTEs
                     └─ push predicates into non-mergeable blocks
```

Each rewrite is applied only when the engine can prove it preserves the result, including `NULL` and empty-group behaviour.

---

# 🔬 Engine Deep Dive

The theoretical basis for decorrelation is the **Apply** operator (also called dependent join): *R Apply E* evaluates expression *E* for each row of *R*. Every correlated subquery can be written as an Apply; a set of algebraic identities then pushes the Apply down through selections, projections, aggregations and joins until the correlation disappears and the Apply becomes an ordinary join. SQL Server's optimizer is built directly on this model, and recent research (for example, Neumann and Kemper's "Unnesting Arbitrary Queries") extends it so that *any* correlated subquery can be decorrelated—an approach adopted by systems such as DuckDB and Umbra.

---

# 🏗️ Architecture Insight

Because unnesting is a rewrite, **the same query can have very different performance across engines and versions**. A subquery that SQL Server decorrelates may run per row on PostgreSQL; a `NOT IN` that Oracle turns into a null-aware anti-join may be a hashed SubPlan elsewhere. For code that must perform on several engines, prefer the forms every optimizer handles well: `EXISTS`, `NOT EXISTS`, uncorrelated `IN`, and explicit derived tables for per-group figures.

---

# ⚡ Performance Tip

When a plan shows a per-row subquery, check the loop count first. A SubPlan executed 20 times is irrelevant; one executed 2 million times with a scan inside is the whole cost of the query.

---

# 🔒 Security Note

Rewrites never change which rows a user is allowed to see: row-level security predicates are attached to base tables before the rewrite phase and travel with them into whatever join the subquery becomes. That is also why security predicates can themselves block some rewrites (PostgreSQL's security barrier views limit predicate pushdown for leaky functions).

---

# SQL Standard vs Vendor Differences

| Capability | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|------------|-----------|-------|-----------|--------|--------|
| Uncorrelated scalar computed once | ✅ InitPlan | ✅ | ✅ | ✅ | ✅ |
| `IN`/`EXISTS` → semi-join | ✅ | ✅ (5.6+) | ✅ | ✅ | Partial |
| `NOT EXISTS` → anti-join | ✅ | ✅ (8.0.17+) | ✅ | ✅ | Partial |
| Scalar aggregate decorrelation | Limited | Opt-in (`subquery_to_derived`) | ✅ | ✅ | ❌ |
| Derived table merge | ✅ | ✅ (5.7+) | ✅ | ✅ | ✅ |
| Join predicate pushdown into grouped derived table | Limited | ✅ (8.0.22+ condition pushdown) | ✅ | ✅ | ❌ |
| Plan shows per-row subquery as | SubPlan | `DEPENDENT SUBQUERY` | Nested Loops (Apply) | `FILTER` | `CORRELATED SCALAR SUBQUERY` |

> **Portability Tip:** Learn how each target engine labels per-row subqueries in its plan output (`SubPlan`, `DEPENDENT SUBQUERY`, `Apply`, `FILTER`); that label is the one to look for when a subquery is slow.

---

# Common Mistakes

### Mistake 1

Assuming every correlated subquery runs once per row—and rewriting queries the optimizer had already unnested.

---

### Mistake 2

Assuming every subquery is unnested—and missing a SubPlan with a scan executed millions of times.

---

### Mistake 3

Hand-decorrelating a `COUNT(*)` subquery with an inner join and dropping rows with no matches.

---

### Mistake 4

Adding a row limit inside an `EXISTS` subquery "for speed", which blocks unnesting on some engines.

---

# Best Practices

✔ Read the plan to see which strategy the engine chose for each subquery.

✔ Look at loop counts on every per-row subquery.

✔ Keep correlation to simple equality on indexed columns so unnesting is possible.

✔ Preserve empty-group behaviour (`LEFT JOIN` + `COALESCE`) when decorrelating by hand.

✔ Re-check plans after engine upgrades; rewrite capabilities change between versions.

---

# Interview Questions

## Basic

1. What is an InitPlan?
2. What does it mean to unnest a subquery?
3. What is a semi-join?

## Intermediate

4. Which constructs prevent an `EXISTS` subquery from being unnested?
5. How is a correlated `AVG` subquery decorrelated?
6. How do you recognise a per-row subquery in PostgreSQL, MySQL and SQL Server plans?

## Advanced

7. What is the count bug, and how do optimizers avoid it?
8. What is the Apply operator, and how does it relate to decorrelation?
9. What is join predicate pushdown into a derived table?

---

# Hands-on Exercises

## Exercise 1

Run `EXPLAIN` on an `EXISTS` query and a `NOT IN` query over the same tables. Identify the semi-join, anti-join or SubPlan.

---

## Exercise 2

Write "employees above department average" as a correlated subquery and as a derived-table join. Compare plans on PostgreSQL or your engine.

---

## Exercise 3

Hand-decorrelate `WHERE (SELECT COUNT(*) FROM Orders o WHERE o.CustomerID = c.CustomerID) = 0` and verify it still returns customers with no orders.

---

## Exercise 4

Add `LIMIT 1` inside an `EXISTS` subquery and check whether the plan changes on your engine.

---

# Related Topics

- **09.07 — Correlated Subqueries**
- **09.13 — Subqueries vs JOINs**
- **09.15 — Subquery Performance and Index Strategy**
- **07.14 — Execution Flow of JOINs (Join Algorithms)**
- **04.03 — How SQL Works Internally (SQL Query Processing Pipeline)**
- **16.xx — Reading Execution Plans**

---

# Summary

An engine executes a subquery in one of three ways: once, when it is uncorrelated; once per outer row, when it is correlated and cannot be rewritten; or not at all as a subquery, when the optimizer rewrites it into joins. `IN` and `EXISTS` become semi-joins, `NOT EXISTS` becomes an anti-join, correlated scalar aggregates become outer joins to grouped derived tables (with care for the count bug), and simple derived tables are merged. Row limits, correlation inside `OR`, and nullable `NOT IN` block these rewrites. Reading the plan—looking for SubPlans, Apply operators and their loop counts—shows which strategy was chosen and whether an index or rewrite is needed.
