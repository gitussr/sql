---
title: "10.08 - Index Seeks, Scans and Lookups"
description: "The access paths an optimizer can choose: full table scans, index seeks and range scans, full index scans, lookups, bitmap scans, index-only access and index intersection; how each appears in PostgreSQL, SQL Server, MySQL, Oracle and SQLite plans; and the tipping point between seek and scan."
chapter: 10
section: 10.08
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 35 min
lastUpdated: 2026-09-25
---

# 10.08 Index Seeks, Scans and Lookups

---

# Learning Objectives

After completing this section, you will be able to:

- Name the access paths an optimizer can use for a table.
- Distinguish an index seek, a range scan and a full index scan.
- Explain lookups and why they make index access expensive for many rows.
- Explain bitmap scans and when PostgreSQL uses them.
- Explain the tipping point where a full scan beats an index.
- Read each access path in the plan output of the major engines.

---

# The Access Paths

```text
                          How can rows of Orders be read?
                                       │
   ┌───────────────┬───────────────────┼──────────────────┬──────────────────┐
   ▼               ▼                   ▼                  ▼                  ▼
Full table     Index seek /        Full index         Bitmap index       Index-only
scan           range scan          scan               scan               access
(every page)   (+ lookups)         (every leaf,       (collect locators, (covering
               part of index       in key order)       sort, fetch pages) index, no table)
```

The optimizer estimates the cost of each available path and picks the cheapest.

---

# Full Table Scan

Reads every page of the table sequentially and tests each row.

```text
PostgreSQL:  Seq Scan on orders            Filter: (status = 'Pending')
SQL Server:  Table Scan (heap) / Clustered Index Scan
MySQL:       type: ALL
Oracle:      TABLE ACCESS FULL
SQLite:      SCAN orders
```

Not always bad. Sequential reads are efficient, can use large I/O requests and read-ahead, and parallelise well. For queries returning a large share of the table, a full scan is the right plan.

---

# Index Seek and Range Scan

Descends the B-tree to the first qualifying key and reads leaf entries until the condition no longer holds.

```text
PostgreSQL:  Index Scan using ix_orders_customerid   Index Cond: (customerid = 42)
SQL Server:  Index Seek (NonClustered)  Seek Predicates: CustomerID = 42
MySQL:       type: ref (equality) / range (range)   key: ix_orders_customerid
Oracle:      INDEX RANGE SCAN / INDEX UNIQUE SCAN
SQLite:      SEARCH orders USING INDEX ix_orders_customerid (customerid=?)
```

Cost ≈ tree height + entries read + lookups for rows not covered.

---

# Full Index Scan

Reads every leaf of an index in key order without a seek condition. Useful when:

- the index covers the query and is much narrower than the table (count rows, read one column);
- the query needs rows in index order (`ORDER BY` / `GROUP BY` on the key) and a sort would be expensive.

```text
PostgreSQL:  Index Only Scan (no Index Cond) / Index Scan (for order)
SQL Server:  Index Scan (NonClustered)
MySQL:       type: index
Oracle:      INDEX FULL SCAN / INDEX FAST FULL SCAN (unordered, multiblock)
SQLite:      SCAN orders USING COVERING INDEX …
```

---

# Lookups

When the index lacks some needed columns, each matching entry requires a trip to the table:

```text
SQL Server:  Key Lookup (Clustered) / RID Lookup (heap)    under a Nested Loops
PostgreSQL:  part of "Index Scan" (heap fetch per entry)
MySQL:       implicit for secondary indexes not "Using index"
Oracle:      TABLE ACCESS BY INDEX ROWID (BATCHED)
SQLite:      implicit (no COVERING in the plan line)
```

Lookups are random reads: in the worst case one page per row. They are why an index that selects "only" 5% of a large table can lose to a full scan.

---

# The Tipping Point

```text
Rows returned by the predicate  →

Cost
 │                                                        ╱ index seek + lookups
 │                                                    ╱
 │                                                ╱
 │ ─────────────────────────────────────────╳───────────  full table scan
 │                                      ╱   │
 │                                  ╱       │
 │                             ╱            │
 │                        ╱                 │
 │ ______________ ╱                         │
 └──────────────────────────────────────────┴──────────→
  few rows                           tipping point (often 1–20% of rows)
```

The tipping point depends on how many rows fit on a page, how well the table is physically ordered by the index key (the **correlation** or **clustering factor**), whether pages are cached, and the storage type. A covering index has no lookups, so its line stays low much longer—often it wins even for most of the table.

---

# Bitmap Scans (PostgreSQL)

Between the two extremes, PostgreSQL uses a **bitmap index scan** followed by a **bitmap heap scan**:

```text
Bitmap Heap Scan on orders
  Recheck Cond: (customerid = ANY ('{42,43,…}'))
  ->  Bitmap Index Scan on ix_orders_customerid
        Index Cond: (customerid = ANY ('{42,43,…}'))

1. Read the index, set a bit for every matching heap page (or row)
2. Visit those heap pages in physical order, each once
```

Sorting fetches by page turns random I/O into ordered I/O and reads each page once, even if it holds many matches. Bitmaps from several indexes can be combined with `BitmapAnd` / `BitmapOr`, which is how PostgreSQL uses two single-column indexes for `A = 1 AND B = 2` or `A = 1 OR B = 2`.

Oracle's `TABLE ACCESS BY INDEX ROWID BATCHED` and SQL Server's prefetching nested loops pursue the same goal.

---

# Index-Only Access

When the index covers the query, no lookups happen at all (Section 10.06):

```text
PostgreSQL:  Index Only Scan   (Heap Fetches: 0)
SQL Server:  Index Seek with no Key Lookup
MySQL:       Extra: Using index
Oracle:      INDEX RANGE SCAN with no TABLE ACCESS
SQLite:      USING COVERING INDEX
```

---

# Seek Predicates vs Residual Predicates

A plan distinguishes conditions used to navigate the index from conditions checked afterwards:

```sql
-- Index (CustomerID, OrderDate)
WHERE CustomerID = 42 AND TotalAmount > 100
```

```text
SQL Server   Seek Predicates: CustomerID = 42
             Predicate:       TotalAmount > 100        ← checked after lookup

PostgreSQL   Index Cond: (customerid = 42)
             Filter: (totalamount > 100)
             Rows Removed by Filter: 380

Oracle       access("CUSTOMERID"=42)
             filter("TOTALAMOUNT">100)
```

A large *Rows Removed by Filter* means the engine read many rows only to discard them—a sign that the filter column belongs in the index.

---

# Index Condition Pushdown

A residual condition on an index column can be tested **inside** the index before the lookup:

```sql
-- Index (CustomerID, OrderDate); query:
WHERE CustomerID = 42 AND EXTRACT(MONTH FROM OrderDate) = 9
```

The month condition cannot seek, but `OrderDate` is in the index entry, so it can be evaluated there, skipping lookups for non-matching entries. MySQL shows this as *Using index condition*; SQL Server and PostgreSQL do it as a matter of course for index columns; Oracle shows a `filter` on the `INDEX RANGE SCAN` line.

---

# Reading It All Together

```sql
EXPLAIN ANALYZE
SELECT OrderID, TotalAmount
FROM Orders
WHERE CustomerID = 42 AND Status = 'Shipped';
```

```text
Index Scan using ix_orders_customerid on orders
      (cost=0.43..210.10 rows=45 width=12) (actual time=0.03..0.41 rows=41 loops=1)
  Index Cond: (customerid = 42)
  Filter: ((status)::text = 'Shipped'::text)
  Rows Removed by Filter: 9
```

Interpretation: the seek on `CustomerID` is good; 50 entries read, 41 kept; each needed a heap fetch. `(CustomerID, Status) INCLUDE (TotalAmount)` would make it a pure index-only seek of 41 entries.

---

# Visual Representation

```text
Full table scan      ████████████████████████████████  all table pages, sequential
Index seek           ▲ ▪▪▪                              few index pages
  + lookups              ↓  ↓    ↓ ↓        ↓           random table pages
Bitmap scan          ▲ ▪▪▪▪▪▪▪                          index pages
                         → → → → → → →                  table pages in order, once each
Index-only           ▲ ▪▪▪▪                             index pages only
Full index scan      ▪▪▪▪▪▪▪▪▪▪▪▪                       every leaf, in key order
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← the access path for each table is chosen and executed here
2. JOIN        ← inner side of nested loops: one seek per outer row
3. WHERE       ← split into seek predicates and residual filters
4. GROUP BY
5. HAVING
6. SELECT      ← determines whether lookups are needed at all
7. DISTINCT
8. ORDER BY    ← ordered index scans can replace a sort
9. LIMIT / FETCH / TOP  ← favours index scans that can stop early
```

---

# How the DBMS Executes This

```text
For each table in the query:
    candidate paths = { full scan } ∪ { each usable index × (seek | full scan | bitmap) }
    for each path:
        rows    = selectivity(predicates) × table rows       ← statistics
        pages   = index pages + lookup pages (clustering factor)
        cost    = pages × page cost + rows × CPU cost
    keep the cheapest (and any that deliver useful ordering)
```

---

# 🔬 Engine Deep Dive

The **clustering factor** (Oracle) or **correlation** (PostgreSQL `pg_stats.correlation`) measures how closely the table's physical order follows the index order. With correlation near 1 (for example, an index on an increasing `OrderDate` of an append-only table), consecutive index entries point to the same table pages and lookups are nearly sequential. With correlation near 0 (an index on `CustomerID` of the same table), every lookup is a random page. Two indexes returning the same number of rows can therefore have very different costs.

---

# 🏗️ Architecture Insight

Access-path choice is a statistical decision made per execution plan, not per index. The same index can be ideal for one parameter value and harmful for another (Section 10.12). Designs that keep result sizes predictable—bounded pages, selective filters—keep plans stable.

---

# ⚡ Performance Tip

When a query that "has an index" is slow, look at three numbers in the actual plan: rows read vs rows returned (residual filtering), number of lookups, and loop count on the inner side of joins. Each points to a different fix: better key columns, covering columns, or an index on the join column.

---

# 🔒 Security Note

Execution plans can reveal data distributions (row estimates) and object names. Access to `EXPLAIN` output of other users' queries, plan caches and performance views (`pg_stat_statements`, `sys.dm_exec_query_plan`) should be limited to administrators.

---

# SQL Standard vs Vendor Differences

| Path | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|------|-----------|-------|-----------|--------|--------|
| Full table scan | `Seq Scan` | `ALL` | `Table Scan` / `Clustered Index Scan` | `TABLE ACCESS FULL` | `SCAN t` |
| Seek / range | `Index Scan` + `Index Cond` | `ref` / `range` | `Index Seek` | `INDEX RANGE/UNIQUE SCAN` | `SEARCH t USING INDEX` |
| Full index scan | `Index (Only) Scan` without cond | `index` | `Index Scan` | `INDEX FULL / FAST FULL SCAN` | `SCAN t USING … INDEX` |
| Lookup | inside `Index Scan` | implicit | `Key Lookup` / `RID Lookup` | `TABLE ACCESS BY INDEX ROWID` | implicit |
| Bitmap | `Bitmap Index/Heap Scan` | `index_merge` | — | `BITMAP CONVERSION` | — |
| Index-only | `Index Only Scan` | `Using index` | seek without lookup | no table access line | `COVERING INDEX` |

> **Portability Tip:** The concepts are identical everywhere; only the names differ. Learn this table for your engines and every plan becomes readable.

---

# Common Mistakes

### Mistake 1

Treating every full scan as a problem.

---

### Mistake 2

Ignoring the lookup count under an index seek.

---

### Mistake 3

Reading only estimated plans and missing *Rows Removed by Filter*.

---

### Mistake 4

Assuming an index will be used because it exists.

---

# Best Practices

✔ Read actual plans: rows read, rows returned, lookups, loops.

✔ Move residual filter columns into the index when they discard many rows.

✔ Cover queries whose cost is dominated by lookups.

✔ Accept full scans for queries that read much of the table.

---

# Interview Questions

## Basic

1. What is the difference between an index seek and an index scan?
2. What is a key lookup?
3. When is a full table scan the best plan?

## Intermediate

4. What is the tipping point between index seek and full scan?
5. What is a bitmap heap scan, and why is it used?
6. What is the difference between a seek predicate and a residual predicate?

## Advanced

7. How does the clustering factor affect index cost?
8. What is index condition pushdown?
9. Why can a covering index win even for a large fraction of the table?

---

# Hands-on Exercises

## Exercise 1

Find a `CustomerID` range that makes your engine switch from an index seek to a full scan.

---

## Exercise 2

Produce a PostgreSQL plan with a `BitmapAnd` over two single-column indexes.

---

## Exercise 3

Find a query whose plan shows many rows removed by a residual filter, and fix it with a better index.

---

## Exercise 4

Compare the plan for the same query with an index on an increasing column and on a random column of the same selectivity.

---

# Related Topics

- **10.02 — How B-Tree Indexes Work**
- **10.06 — Covering Indexes and Included Columns**
- **10.12 — Selectivity, Cardinality and Statistics**
- **06.11 — Execution Flow of WHERE**
- **16.xx — Reading Execution Plans**

---

# Summary

For every table, the optimizer chooses among a full table scan, an index seek or range scan with lookups, a full index scan, a bitmap scan and index-only access. Seeks win for few rows; lookups make them expensive as row counts grow, until a sequential full scan becomes cheaper at a tipping point that depends on physical ordering and caching. Bitmap scans sit between the two, covering indexes remove lookups entirely, and plans separate seek predicates from residual filters. Reading rows read versus returned, lookup counts and loop counts in actual plans shows which index change—key columns, covering columns or a new join index—will help.
