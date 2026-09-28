---
title: "15.05 - Choosing Access Paths (Scans, Seeks and Lookups)"
description: "How the optimizer decides how to read each table: full scans, index seeks and range scans, index-only (covering) scans, key and RID lookups, bitmap scans, the selectivity tipping point between seeks and scans, clustering and physical order, sequential versus random I/O, partial scans for LIMIT, parallel scans, and how to make the cheap access path possible with covering and composite indexes."
chapter: 15
section: 15.05
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 15.05 Choosing Access Paths (Scans, Seeks and Lookups)

---

# Learning Objectives

After completing this section, you will be able to:

- Name the ways an engine can read a table.
- Explain the tipping point between an index seek with lookups and a full scan.
- Recognise when a covering index removes lookups.
- Explain why physical order (clustering) changes the cost of index access.
- Make the cheapest access path available with the right index.

---

# The Access Paths

| Access path | Reads | Best when |
|-------------|-------|-----------|
| Full (sequential) scan | Every page of the table, in order | A large fraction of rows is needed, or the table is small |
| Index seek / range scan | The index entries matching a predicate | Few rows match a sargable predicate |
| Index-only (covering) scan | Only the index, never the table | Every needed column is in the index |
| Key / RID lookup | One table row per index entry | After a seek, when the index lacks needed columns |
| Bitmap index scan + heap scan (PostgreSQL) | Index entries → sorted page list → pages | Medium selectivity, or combining several indexes |
| Full index scan | Every entry of an index | Index is narrower than the table, or delivers needed order |

Section 10.08 introduced these operators; this section is about **how the optimizer chooses among them**.

---

# Seek + Lookup vs Scan: The Tipping Point

```sql
SELECT * FROM Orders WHERE OrderDate >= :from;          -- index on OrderDate, not covering
```

```text
rows matching   index seek + lookups                     full scan
       0.01%    1,000 lookups (≈ 1,000 random reads)     125,000 sequential page reads
       1%       100,000 lookups                          125,000 pages
       5%       500,000 lookups (random!)                125,000 pages      ← scan wins
      50%       5,000,000 lookups                        125,000 pages      ← scan wins easily
```

Each lookup is a random read of a table page; a scan reads pages sequentially, many per I/O. The tipping point—where the scan becomes cheaper—is often somewhere between **a fraction of a percent and a few percent** of the table, depending on row width, clustering, storage and cache.

So a full scan is not always a mistake. When a query returns 30% of a table, a scan **is** the right plan, and forcing the index makes it slower.

---

# Covering Indexes Move the Tipping Point

If the index contains every column the query needs, there are no lookups:

```sql
-- Needs OrderDate, CustomerID, TotalAmount
SELECT CustomerID, TotalAmount FROM Orders WHERE OrderDate >= :from;

CREATE INDEX ix_orders_date_cov ON Orders (OrderDate) INCLUDE (CustomerID, TotalAmount);  -- SQL Server / PostgreSQL 11+
CREATE INDEX ix_orders_date_cov ON Orders (OrderDate, CustomerID, TotalAmount);           -- MySQL / Oracle / SQLite
```

```text
covering index range scan: reads only the matching part of a narrow index, sequentially
→ efficient even for 20–30% of the table
```

`SELECT *` defeats covering indexes: it needs every column, so every matching row costs a lookup. Listing only the needed columns is one of the simplest optimizations there is.

PostgreSQL note: an index-only scan still checks the visibility map; on a table with many recently modified pages, it falls back to heap reads until `VACUUM` updates the map.

---

# Clustering and Physical Order

The cost of lookups depends on whether matching rows are **physically close**:

```text
clustered by OrderDate (rows stored in date order):     100,000 matching rows ≈ 1,000 pages
scattered (random physical order):                      100,000 matching rows ≈ 100,000 pages
```

- **SQL Server, MySQL InnoDB**: tables are stored in clustered-index (primary key) order; secondary index lookups go through the clustered key (Section 10.04).
- **Oracle**: the index's **clustering factor** measures how scattered the table rows are relative to index order; a high factor makes the optimizer avoid the index.
- **PostgreSQL**: heap tables have no enforced order; `pg_stats.correlation` shows how well a column's order matches physical order; `CLUSTER` reorders once (not maintained).

Append-only time-series tables are naturally clustered by time—which is why date-range queries on them are cheap and BRIN indexes work (Section 13.15).

---

# Bitmap Scans (PostgreSQL)

For medium selectivity, PostgreSQL collects matching row locations from the index into a **bitmap**, sorts them by page, then reads each page once:

```text
Bitmap Heap Scan on orders
  Recheck Cond: (orderdate >= '2026-09-01')
  -> Bitmap Index Scan on ix_orders_orderdate
```

It sits between seek + lookup (random) and full scan (everything), and it can combine indexes: `BitmapAnd` / `BitmapOr` for `WHERE A = 1 AND B = 2` with separate indexes on `A` and `B`. Other engines have similar mechanisms (SQL Server index intersection, MySQL index merge, Oracle bitmap conversions), used less often.

---

# LIMIT Changes the Choice

```sql
SELECT * FROM Orders WHERE Status = 'Pending' ORDER BY CreatedAt LIMIT 10;
```

With an index on `CreatedAt`, the engine can scan the index in order and stop after finding 10 pending orders—even if it has to skip non-pending ones. Whether that beats "find all pending orders, sort, take 10" depends on how many rows it must skip. If pending orders are rare **and** old, the ordered scan may read millions of entries before finding 10: a classic row-goal misestimate. An index on `(Status, CreatedAt)` serves both the filter and the order.

---

# Parallel Scans

Large scans may be split across workers (PostgreSQL `Parallel Seq Scan`, SQL Server parallelism, Oracle parallel query, MySQL 8.0.14+ parallel clustered index reads for `COUNT(*)` only). Parallelism reduces response time for big scans at the cost of more total CPU—good for reports, risky for high-concurrency OLTP where many parallel queries compete.

---

# Choosing Indexes for Access Paths

```text
Query shape                                   Index that enables the cheap path
WHERE a = ?                                   (a)
WHERE a = ? AND b > ?                         (a, b)            equality first, range last
WHERE a = ? ORDER BY c                        (a, c)            filter + order, no sort
SELECT x, y WHERE a = ?                       (a) INCLUDE (x, y) covering, no lookups
WHERE a = ? OR b = ?                          (a) and (b)       bitmap/index union, or UNION rewrite
WHERE f(a) = ?                                expression index on f(a), or rewrite (12.15, 13.15)
```

Section 10.15 covers index design in full.

---

# Visual Representation

```text
   cost ▲
        │                     seek + lookups
        │                   /
        │                 /
        │   full scan   /   ← tipping point (often ~0.5–5% of rows)
        │─────────────X───────────────────────────────
        │           /
        │         /        covering index range scan (much flatter)
        │       / ___________________________________
        │     /__/
        └──────────────────────────────────────────────▶ fraction of rows matched
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← access path chosen per table: scan, seek, index-only, bitmap
2. JOIN        ← inner side of a nested loop: one seek per outer row (index essential)
3. WHERE       ← sargable predicates become seek predicates; the rest become filters
4. GROUP BY    ← index order can feed a stream aggregate
5. HAVING
6. WINDOW
7. SELECT      ← needed columns decide whether the index covers the query
8. DISTINCT
9. ORDER BY    ← index order can remove the sort
10. LIMIT / FETCH / TOP   ← row goal favours ordered index scans that stop early
```

---

# How the DBMS Executes This

```text
Index Seek on ix_orders_orderdate (OrderDate >= @from)         est 1,200  actual 1,150
  └─ Key Lookup (Clustered) on Orders                          executions 1,150
cheap: 1,150 lookups

same query, @from a year earlier:
Clustered Index Scan on Orders   (predicate OrderDate >= @from)  est 2,100,000
optimizer switched to a scan because 21% of rows match
```

---

# 🏗️ Architecture Insight

Wide tables make every access path more expensive—scans read more pages, lookups fetch more bytes, covering indexes become impractical. Keep hot tables narrow; move large, rarely read columns (documents, blobs, JSON payloads) to side tables fetched only when needed.

---

# ⚡ Performance Tip

When a plan shows a seek followed by hundreds of thousands of lookups, either the predicate is not selective enough (a scan may really be better) or the index should cover the query. Adding `INCLUDE` columns is usually cheaper than adding another index.

---

# 🌍 Production Consideration

The same query can flip between seek and scan as data grows or parameters change—"it was fast yesterday". That is often the optimizer correctly reacting to more rows, with a covering index as the robust fix, or incorrectly reacting to a sniffed parameter (Section 15.08).

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Covering with `INCLUDE` | ❌ | ✅ (11+) | ❌ (composite) | ✅ | ❌ (composite) | ❌ (composite) |
| Clustered table storage | ❌ | ❌ (heap; `CLUSTER` once) | ✅ (InnoDB PK) | ✅ (clustered index) | Index-organized tables (optional) | `WITHOUT ROWID` tables |
| Bitmap combining | ❌ | `BitmapAnd/Or` | Index merge | Index intersection | Bitmap conversion | Multi-index OR |
| Parallel scans | ❌ | ✅ | Limited | ✅ | ✅ | ❌ |

> **Portability Tip:** "Seek when few rows match, scan when many do, cover to avoid lookups" holds everywhere. How tables are physically organised differs and changes the tipping point.

---

# Common Mistakes

### Mistake 1

Assuming every full scan is a problem.

---

### Mistake 2

Forcing an index for a query that returns a large fraction of the table.

---

### Mistake 3

Using `SELECT *` and preventing covering indexes.

---

### Mistake 4

Ignoring physical clustering when judging index usefulness.

---

# Best Practices

✔ Judge scans by the fraction of rows needed.

✔ Cover frequent queries to remove lookups.

✔ Select only needed columns.

✔ Design composite indexes for filter + order.

✔ Keep hot tables narrow.

---

# Interview Questions

## Basic

1. What is the difference between an index seek and a full scan?
2. What is a key lookup?
3. What is a covering index?

## Intermediate

4. Why can a full scan be faster than an index seek?
5. How does `SELECT *` affect access path choice?
6. What is a bitmap heap scan?

## Advanced

7. How does physical clustering change the cost of an index range scan?
8. Why can `ORDER BY … LIMIT 10` choose a plan that reads millions of index entries?

---

# Hands-on Exercises

## Exercise 1

Find the selectivity at which your engine switches from seek to scan for a date-range query.

---

## Exercise 2

Add `INCLUDE` columns (or a composite index) to remove lookups and compare reads.

---

## Exercise 3

Compare `SELECT *` with a column list on a query served by a covering index.

---

# Related Topics

- **10.06 — Covering Indexes and Included Columns**
- **10.08 — Index Seeks, Scans and Lookups**
- **10.04 — Clustered and Nonclustered Indexes**
- **15.03 — Statistics, Cardinality Estimation and the Cost Model**
- **15.06 — Join Ordering and Join Algorithm Selection**

---

# Summary

For each table the optimizer chooses an access path: full scan, index seek or range scan with lookups, index-only scan, or bitmap scan. Seeks with lookups win when few rows match; beyond a tipping point—often a fraction of a percent to a few percent, depending on clustering and row width—a sequential scan is cheaper. Covering indexes remove lookups and flatten that curve, `SELECT *` prevents them, physical clustering makes range access cheaper, and `LIMIT` shifts the choice toward ordered index scans. Good access paths start with indexes shaped by the query: equality columns, then range or order columns, then included columns.
