---
title: "14.16 - Common CTE Mistakes & Best Practices"
description: "A catalogue of the most common CTE mistakes—grouped into syntax and scope, recursion, correctness, performance and portability—each with the symptom, the cause and the fix, followed by consolidated best practices and a review checklist for CTE queries."
chapter: 14
section: 14.16
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 14.16 Common CTE Mistakes & Best Practices

---

# Learning Objectives

After completing this section, you will be able to:

- Recognise the most common CTE mistakes from their symptoms.
- Explain the cause of each and apply the standard fix.
- Apply a consolidated set of CTE best practices.
- Review CTE queries with a checklist.

---

# Syntax and Scope Mistakes

### Mistake 1: Using a CTE in the next statement

```sql
WITH Totals AS (SELECT CustomerID, SUM(TotalAmount) AS Total FROM Orders GROUP BY CustomerID)
SELECT COUNT(*) FROM Totals;

SELECT * FROM Totals;        -- ❌ relation "totals" does not exist
```

A CTE lives for one statement. Repeat it, create a view, or use a temporary table.

---

### Mistake 2: Repeating WITH

```sql
WITH A AS (…), WITH B AS (…) SELECT …;     -- ❌ syntax error
WITH A AS (…),      B AS (…) SELECT …;     -- ✅
```

---

### Mistake 3: Missing semicolon before WITH (SQL Server)

```text
❌ Msg 319: Incorrect syntax near the keyword 'with' … the previous statement must be terminated with a semicolon
✅ End every statement with ;
```

---

### Mistake 4: A CTE named like a table

```sql
WITH Orders AS (SELECT * FROM Orders WHERE Status = 'Shipped')   -- ❌ confusing; recursive error on some engines
WITH ShippedOrders AS (SELECT * FROM Orders WHERE Status = 'Shipped')   -- ✅
```

---

### Mistake 5: ORDER BY inside a CTE for output order

```text
❌ WITH t AS (SELECT … ORDER BY OrderDate) SELECT * FROM t;   → order not guaranteed
✅ Put ORDER BY in the outermost query
```

---

# Recursion Mistakes

### Mistake 6: No termination

```text
❌ Symptom: SQL Server error 530, MySQL error 3636, or PostgreSQL query that never ends
✅ A condition in the recursive member that eventually yields no rows, plus a depth limit
```

---

### Mistake 7: Stop condition in the outer query

```sql
WITH RECURSIVE n (i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n)
SELECT i FROM n WHERE i <= 10;              -- ❌ recursion never stops

WITH RECURSIVE n (i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 10)
SELECT i FROM n;                            -- ✅
```

---

### Mistake 8: No cycle protection on graphs

```text
❌ Traversing routes, friendships or user-editable hierarchies with a tree query
✅ Path column with a "not visited" check, CYCLE clause, depth limit — and prevent cycles on write
```

---

### Mistake 9: Uncast accumulating columns

```text
❌ PostgreSQL / SQL Server: "types don't match between the anchor and the recursive part"
❌ MySQL: paths silently truncated to the anchor's length
✅ CAST(path AS VARCHAR(1000)), CAST(qty AS BIGINT) in the anchor (and the recursive member)
```

---

### Mistake 10: Joining in the wrong direction

```text
Down (descendants):  JOIN cte ON child.ParentID = cte.ID
Up   (ancestors):    JOIN cte ON node.ID = cte.ParentID
❌ Mixing them returns the wrong side of the tree (or only the start row)
```

---

### Mistake 11: Aggregating in the recursive member

```text
❌ SUM / COUNT / GROUP BY over the CTE inside the recursive member → error
✅ Recurse to build rows; aggregate in the main query
```

---

### Mistake 12: Unpadded sort paths

```text
❌ '1/10' sorts before '1/9'   → tree displayed out of order
✅ Zero-pad each segment ('000001/000010'), or use arrays / SEARCH DEPTH FIRST
```

---

# Correctness Mistakes

### Mistake 13: Fan-out when merging branches

```text
❌ Join raw Orders and raw Tickets per customer, then SUM → revenue multiplied by ticket count
✅ Aggregate each branch to the customer in its own CTE, then join
```

---

### Mistake 14: Non-deterministic deduplication

```text
❌ ROW_NUMBER() OVER (PARTITION BY Email ORDER BY CreatedAt DESC)   → ties keep a random row
✅ … ORDER BY CreatedAt DESC, CustomerID DESC
```

---

### Mistake 15: Filtering history away before LAG

```text
❌ WHERE Month >= '2026-01-01' in the step that computes LAG(Revenue, 12) → YoY all NULL
✅ Compute LAG over enough history; filter to the reporting period in the final step
```

---

### Mistake 16: Expecting to see data-modifying CTE changes in the table (PostgreSQL)

```text
❌ WITH u AS (UPDATE … RETURNING *) SELECT … FROM same_table   → sees old values
✅ Read changed values from the CTE's RETURNING output
```

---

# Performance Mistakes

### Mistake 17: Treating a CTE as a cache

```text
❌ Expensive CTE referenced three times on SQL Server → computed three times
✅ Temporary table, or restructure (LAG, SUM() OVER) to reference it once
```

---

### Mistake 18: Relying on pushdown into a materialized CTE

```text
❌ Aggregate everything in a CTE, filter to one customer outside → full aggregation
✅ Filter inside the CTE, or ensure it is inlined (NOT MATERIALIZED / single reference)
```

---

### Mistake 19: Missing index on the recursive join column

```text
❌ Each iteration scans the whole table
✅ Index the parent column (ManagerID, ParentCategoryID, ParentPartID)
```

---

### Mistake 20: Very long pipelines with compounding estimate errors

```text
❌ 20 chained CTEs; late steps estimated at 1 row, actual 1 million → nested loops everywhere
✅ Materialize key intermediates into temporary tables with real statistics
```

---

# Portability Mistakes

### Mistake 21: RECURSIVE keyword mismatch

```text
PostgreSQL / MySQL: WITH RECURSIVE required        SQL Server / Oracle: RECURSIVE not allowed
SQLite: optional
```

---

### Mistake 22: Assuming the same materialization everywhere

```text
PostgreSQL ≤ 11 always materialized; 12+ inlines single-use CTEs; SQL Server always inlines
✅ Check the plan on the production engine and version
```

---

### Mistake 23: Engine-specific CTE DML

```text
DELETE FROM cte               → SQL Server only
WITH x AS (DELETE … RETURNING) → PostgreSQL only
WITH … UPDATE                  → not Oracle
✅ Portable form: CTE computes keys; DML filters by those keys
```

---

# Visual Representation

```text
                             CTE MISTAKES
                                  │
   ┌──────────────┬───────────────┼────────────────┬───────────────┐
   ▼              ▼               ▼                ▼               ▼
 SYNTAX/SCOPE   RECURSION       CORRECTNESS      PERFORMANCE     PORTABILITY
 next statement no termination  fan-out          CTE as cache    RECURSIVE keyword
 repeated WITH  outer stop      tiebreakers      no pushdown     materialization
 semicolon      cycles, casts   LAG history      no index        CTE DML
 table names    direction, sort RETURNING        long chains
   1–5            6–12            13–16            17–20           21–23
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← CTE references (scope: this statement only — Mistake 1)
2. JOIN        ← aggregate branches before joining (Mistake 13); index recursive joins (Mistake 19)
3. WHERE       ← termination inside the recursive member (Mistake 7); filter inside CTEs (Mistake 18)
4. GROUP BY    ← aggregate after recursion (Mistake 11)
5. HAVING
6. WINDOW      ← unique tiebreakers (Mistake 14); enough history for LAG (Mistake 15)
7. SELECT
8. DISTINCT
9. ORDER BY    ← outermost only (Mistake 5); padded paths (Mistake 12)
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Errors you will see:
  "relation … does not exist"                      → CTE used outside its statement
  "Incorrect syntax near 'with'" (SQL Server)      → missing semicolon
  "types don't match between the anchor and…"      → uncast recursive column
  Msg 530 / ERROR 3636                              → recursion limit reached (termination or cycle)
  "recursive reference … must not appear within…"  → aggregate, subquery or outer join on the CTE
Silent problems (no error): fan-out, truncated paths (MySQL), random dedup winners, NULL YoY
```

---

# Best Practices

✔ Name CTEs after their contents; never after existing tables.

✔ One `WITH`, one idea per CTE, final `ORDER BY` outside.

✔ Every recursive CTE: termination in the recursive member, depth limit, cycle protection for graphs.

✔ Cast accumulating columns explicitly in the anchor.

✔ Aggregate after recursion and before merging branches.

✔ Use unique tiebreakers in every window ordering.

✔ Filter early inside CTEs; check plans for pushdown and repeated evaluation.

✔ Index recursive join columns; carry little through recursion.

✔ Use temporary tables for reused or badly estimated intermediates.

✔ Write CTE DML in the portable "keys, then DML" form unless you target one engine.

---

# Review Checklist

```text
□ Every CTE has a descriptive, unique name
□ Every computed column is named
□ Only the outermost query has ORDER BY (except with LIMIT/TOP inside)
□ Recursive CTEs: anchor correct, join direction correct, termination inside, depth limit
□ Graph traversals: visited-node check or CYCLE clause
□ Accumulating columns cast to wide enough types
□ No fan-out: branches aggregated before joining
□ Window orderings end in a unique column
□ Expensive CTEs referenced once, or materialized deliberately
□ Plan checked: pushdown, repeated subplans, index seeks in recursive members, estimates
```

---

# 🏗️ Architecture Insight

Most CTE mistakes come from forgetting that a CTE is neither a variable nor a table: it has no lifetime beyond the statement, no guaranteed order, no guaranteed single evaluation, and—when recursive—no built-in brakes. Teams that document these four facts in their SQL guidelines avoid nearly all of the mistakes above.

---

# ⚡ Performance Tip

The two checks with the biggest payoff are an index on the recursive join column and making sure an expensive CTE is not evaluated once per reference.

---

# 🌍 Production Consideration

Silent CTE bugs—fan-out, truncated paths, random deduplication winners—pass tests on small data and fail on production data. Test with duplicates, ties, deep hierarchies and long paths.

---

# SQL Standard vs Vendor Differences

| Mistake area | Most affected | Why |
|--------------|---------------|-----|
| Missing semicolon | SQL Server | `WITH` is overloaded in T-SQL |
| Recursion limit errors | SQL Server (100), MySQL (1000) | Low default limits |
| Runaway recursion | PostgreSQL, SQLite | No default limit |
| Silent truncation | MySQL | Recursive column types from the anchor |
| Repeated evaluation | SQL Server | CTEs always inlined |
| Lost pushdown | PostgreSQL ≤ 11 | CTEs always materialized |
| CTE DML | Oracle | No `WITH` before DML |

> **Portability Tip:** The portable subset—named non-recursive CTEs, recursive CTEs with `UNION ALL`, cast anchors and depth limits, final `ORDER BY`, keys-then-DML—avoids nearly every engine-specific trap.

---

# Interview Questions

## Basic

1. Why can't a CTE be used in the next statement?
2. Why is `ORDER BY` inside a CTE not enough to order the result?
3. What happens if a recursive CTE has no termination condition?

## Intermediate

4. Why must accumulating columns be cast in the anchor?
5. What causes fan-out in a multi-CTE query, and how do you avoid it?
6. Why must deduplication orderings end with a unique column?

## Advanced

7. Why can the same CTE query be fast on PostgreSQL 12 and slow on PostgreSQL 11?
8. Which CTE bugs produce no error at all, and how do you catch them?

---

# Hands-on Exercises

## Exercise 1

Review five CTE queries from your codebase against the checklist.

---

## Exercise 2

Reproduce three of the listed errors on your engine and fix them.

---

## Exercise 3

Create test data with ties, cycles and deep paths, and run your recursive and deduplication queries against it.

---

# Related Topics

- **14.05 — Recursive CTEs (Anchor, Recursive Member and Termination)**
- **14.13 — Materialization and Inlining (MATERIALIZED and NOT MATERIALIZED)**
- **14.15 — CTE Performance and Index Strategy**
- **14.17 — CTE Cheat Sheet & Visual Knowledge Map**
- **09.16 — Common Subquery Mistakes & Best Practices**

---

# Summary

CTE mistakes fall into five groups: syntax and scope (using a CTE outside its statement, repeated `WITH`, SQL Server's semicolon, table-name collisions, inner `ORDER BY`), recursion (no or misplaced termination, cycles, uncast columns, wrong join direction, aggregates in the recursive member, unpadded paths), correctness (fan-out, non-deterministic deduplication, filtering history before `LAG`, invisible PostgreSQL CTE changes), performance (treating CTEs as caches, lost pushdown, unindexed recursive joins, long pipelines) and portability (the `RECURSIVE` keyword, materialization rules, engine-specific DML). A short review checklist and test data with ties, cycles and deep paths catch most of them.
