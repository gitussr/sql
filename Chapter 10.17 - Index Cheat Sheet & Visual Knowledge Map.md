---
title: "10.17 - Index Cheat Sheet & Visual Knowledge Map"
description: "A complete index reference: DDL on every engine, B-tree facts, composite and covering rules, unique, partial and expression indexes, index types, access paths and plan labels, statistics, costs, maintenance commands, design method, and a chapter-wide knowledge map."
chapter: 10
section: 10.17
category: Data Query Language (DQL)
difficulty: All Levels
readingTime: 25 min
lastUpdated: 2026-09-25
---

# 10.17 Index Cheat Sheet & Visual Knowledge Map

---

# Learning Objectives

After completing this section, you will be able to:

- Recall index DDL for every major engine.
- Recall the rules for composite, covering, unique, partial and expression indexes.
- Match a workload to an index type.
- Read access paths in any engine's plan output.
- Locate any topic in the chapter from the knowledge map.

---

# Syntax Reference

```sql
-- Create
CREATE INDEX IX_T_A_B ON T (A, B DESC);
CREATE UNIQUE INDEX UX_T_Code ON T (Code);
CREATE INDEX IX_T_A ON T (A) INCLUDE (C, D);                 -- PostgreSQL 11+, SQL Server
CREATE INDEX IX_T_Pending ON T (CreatedAt) WHERE Status = 'P'; -- PostgreSQL, SQLite, SQL Server
CREATE INDEX IX_T_Lower ON T (LOWER(Email));                  -- PostgreSQL, Oracle, SQLite
CREATE INDEX IX_T_Lower ON T ((LOWER(Email)));                -- MySQL 8.0.13+
ALTER TABLE T ADD EmailLower AS LOWER(Email) PERSISTED;       -- SQL Server (then index it)

-- Online
CREATE INDEX CONCURRENTLY IX_T_A ON T (A);                    -- PostgreSQL
CREATE INDEX IX_T_A ON T (A) WITH (ONLINE = ON);              -- SQL Server (EE)
CREATE INDEX IX_T_A ON T (A) ALGORITHM = INPLACE LOCK = NONE; -- MySQL
CREATE INDEX IX_T_A ON T (A) ONLINE;                          -- Oracle (EE)

-- Hide / disable
ALTER TABLE T ALTER INDEX IX_T_A INVISIBLE;                   -- MySQL 8.0+
ALTER INDEX IX_T_A INVISIBLE;                                 -- Oracle
ALTER INDEX IX_T_A ON T DISABLE;                              -- SQL Server

-- Rebuild
REINDEX INDEX CONCURRENTLY IX_T_A;                            -- PostgreSQL 12+
ALTER INDEX IX_T_A ON T REBUILD WITH (ONLINE = ON);           -- SQL Server
ALTER INDEX IX_T_A REBUILD ONLINE;                            -- Oracle
OPTIMIZE TABLE T;                                             -- MySQL

-- Drop
DROP INDEX IX_T_A;                                            -- PostgreSQL, Oracle, SQLite
DROP INDEX IX_T_A ON T;                                       -- MySQL, SQL Server

-- Statistics
ANALYZE T;                          -- PostgreSQL, SQLite
ANALYZE TABLE T;                    -- MySQL
UPDATE STATISTICS T;                -- SQL Server
EXEC DBMS_STATS.GATHER_TABLE_STATS(USER, 'T');   -- Oracle
```

---

# B-Tree Facts

```text
Structure    root → branch → linked, sorted leaves (key + row locator)
Height       3–4 levels for billions of keys (fan-out in the hundreds)
Lookup cost  height + matching entries + lookups for uncovered columns
Supports     =, <, >, BETWEEN, LIKE 'prefix%', ORDER BY (both directions), MIN/MAX
Not          f(column), LIKE '%x', <> on most rows, columns not leading the index
Inserts      increasing keys → append; random keys → page splits, cache pressure
NULLs        indexed everywhere except Oracle all-NULL keys
```

---

# Composite and Covering Rules

```text
Leftmost prefix     (A, B, C) seeks A · A,B · A,B,C   — never B or C alone
Column order        Equality → Sort/Group → Range → (residual filters)
One range           columns after a range column cannot narrow the seek
Order by            equality prefix + ORDER BY columns in order and matching directions
Redundancy          (A) is redundant next to (A, B) unless unique/needed
Covering            every referenced column in the index → no lookups
INCLUDE             returned-only columns; not seekable; not part of uniqueness
Clustered engines   clustering key is in every secondary index for free
```

---

# Storage Models

| Engine | Table storage | Secondary index locator |
|--------|---------------|------------------------|
| PostgreSQL | Heap | TID (page, item) |
| MySQL InnoDB | Clustered on PK | Primary key |
| SQL Server | Clustered on PK (default) or heap | Clustering key or RID |
| Oracle | Heap (IOT optional) | ROWID |
| SQLite | Clustered on rowid (`WITHOUT ROWID` → PK) | rowid or PK |

```text
Good clustering key:  narrow · unique · static · increasing
```

---

# Unique, Partial and Expression Indexes

| Need | Tool |
|------|------|
| Business uniqueness | `UNIQUE` constraint |
| Case-insensitive uniqueness | Unique expression index on `LOWER(col)` / CI collation |
| One active row per parent | Partial / filtered unique index |
| Many `NULL`s in a unique column on SQL Server | Filtered unique index `WHERE col IS NOT NULL` |
| One `NULL` only (PostgreSQL 15+) | `UNIQUE NULLS NOT DISTINCT` |
| Index only hot rows | Partial index (`WHERE Status = 'Pending'`) |
| Make `f(col) = x` seekable | Expression index or generated column |

```text
Partial index used only if query WHERE implies index WHERE (literal, not parameter)
Expression index used only if query uses the same deterministic expression
```

---

# Index Types

| Type | Serves | Engines |
|------|--------|---------|
| B-tree | Equality, range, order, uniqueness | All |
| Hash | Equality only | PostgreSQL (others: memory tables) |
| Bitmap | Low-cardinality AND/OR in warehouses | Oracle |
| GIN / inverted / full-text | Words, arrays, JSON containment, trigrams | PostgreSQL, full-text in all |
| GiST / SP-GiST / R-tree | Spatial, ranges, overlap, nearest | PostgreSQL, spatial in all |
| BRIN / zone maps | Huge naturally ordered tables | PostgreSQL, Oracle |
| Columnstore | Analytical scans and aggregates | SQL Server, Oracle In-Memory, extensions |
| Vector (HNSW / IVF) | Approximate nearest embeddings | pgvector, Oracle 23ai, SQL Server 2025 |

---

# Access Paths and Plan Labels

| Path | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|------|-----------|-------|-----------|--------|--------|
| Full scan | `Seq Scan` | `ALL` | `Table / Clustered Index Scan` | `TABLE ACCESS FULL` | `SCAN` |
| Seek / range | `Index Scan` + `Index Cond` | `ref` / `range` | `Index Seek` | `INDEX RANGE SCAN` | `SEARCH … USING INDEX` |
| Lookup | inside `Index Scan` | implicit | `Key / RID Lookup` | `BY INDEX ROWID` | implicit |
| Covered | `Index Only Scan` | `Using index` | seek without lookup | no table access | `COVERING INDEX` |
| Bitmap | `Bitmap Index/Heap Scan` | `index_merge` | — | `BITMAP` ops | — |
| Residual filter | `Filter` | `Using where` | `Predicate` | `filter(...)` | — |

```text
Tipping point: seek + lookups beats a full scan only below a few % of rows
               (higher with good clustering / covering, lower with random order)
```

---

# Statistics and Estimates

```text
Selectivity      fraction of rows a predicate returns → decides seek vs scan
Statistics       row count · n_distinct · null fraction · MCVs · histograms · correlation
Independence     sel(A AND B) = sel(A) × sel(B) → wrong for correlated columns
                 → extended / multi-column statistics
Stale stats      after bulk loads; new values beyond histogram → estimate ≈ 0
Parameter skew   one cached plan for very different values → recompile / PSP / split
Diagnose         estimated vs actual rows; fix estimates before indexes
```

---

# Costs and Maintenance

```text
Every index:  + work on INSERT / DELETE / UPDATE of its columns
              + log volume, replication, backup size
              + disk and buffer memory
              + possible contention (last page, unique checks, range locks)

Maintenance:  density & bloat, not "fragmentation %", drive rebuilds
              rebuild online and selectively; tune autovacuum / auto-stats
              review unused, duplicate, missing indexes over a full cycle
              invisible / disabled before dropping
              create secondary indexes after bulk loads
```

---

# Design Method

```text
1. Workload     top queries by total time; write rates; sizes; skew
2. Baseline     PKs · unique natural keys · foreign-key indexes
3. Per query    Equality → Sort → Range, + INCLUDE for hot queries
4. Consolidate  merge prefixes, share leading columns, partial for hot subsets
5. Validate     actual plans, latency, write cost on production-sized data
6. Monitor      usage stats, slow-query logs, statistics freshness
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← access path: full scan, seek, bitmap, index-only
2. JOIN        ← inner join column index → nested loop seeks; ordered → merge join
3. WHERE       ← equality + one range = seek; the rest = residual filter
4. GROUP BY    ← grouping columns in index order → stream aggregate
5. HAVING
6. SELECT      ← covering → no lookups
7. DISTINCT    ← index order / loose scan
8. ORDER BY    ← index order → no sort
9. LIMIT / FETCH / TOP  ← ordered index → stop after N
```

---

# How the DBMS Executes This

```text
Parse → Bind → Optimize → Execute

Optimize   enumerate access paths per table (scan / each usable index / bitmap)
           estimate rows from statistics; cost pages and CPU
           pick join order, join algorithms and aggregation strategy
           prefer paths that also deliver needed order
Execute    descend B-trees, walk leaves, fetch rows, stop early where possible
Write      maintain every index; enforce uniqueness via index seeks
```

---

# Visual Knowledge Map

```text
                              CHAPTER 10 — Indexes
                                       │
     ┌───────────────────┬─────────────┴──────────────┬─────────────────────┐
     │                   │                            │                     │
 FOUNDATIONS          DESIGN                       USAGE                OPERATIONS
     │                   │                            │                     │
10.01 Intro         10.05 Composite            10.08 Seeks / Scans   10.12 Statistics
10.02 B-tree        10.06 Covering             10.11 JOIN / GROUP /  10.13 Costs
10.03 DDL           10.07 Unique                     ORDER BY         10.14 Maintenance
10.04 Clustered     10.10 Partial / Expr
                    10.09 Index types
                         │
                    10.15 Design Strategy
                         │
               ┌─────────┴─────────┐
          10.16 Mistakes      10.17 Cheat Sheet
```

```text
Dependencies

  06.12 SARGability                    ──→ 10.01, 10.10, 10.16
  07.14 Join algorithms                ──→ 10.08, 10.11
  07.15 JOIN index strategy            ──→ 10.11
  08.14 Hash / stream aggregation      ──→ 10.11
  08.15 GROUP BY index strategy        ──→ 10.06, 10.11
  09.15 Subquery index strategy        ──→ 10.11, 10.15
  10.xx Indexes                        ──→ 11.xx Window Functions, 15.xx Query Optimization,
                                           16.xx Reading Execution Plans
```

---

# One-Page Summary

```text
CONCEPTS
  An index is a sorted copy of columns with row pointers
  B-trees: shallow, balanced, linked leaves → seek, range, order, min/max
  Clustered = table stored in key order; secondary indexes point to it
  Optimizer uses an index only when estimates say it is cheaper

RULES
  Index for queries, not columns
  PK + unique natural keys + FK indexes as the baseline
  Equality → Sort → Range; leftmost prefix; one range seekable
  Cover hot queries with INCLUDE; SELECT only needed columns
  Partial indexes for hot subsets; expression indexes for inherent expressions
  Keep predicates SARGable and types matched
  Keyset pagination for deep lists
  Every index costs writes — budget, consolidate, drop unused
  Fresh statistics; compare estimated vs actual rows
  Build, rebuild and drop online, via migrations
```

---

# 🏗️ Architecture Insight

The chapter reduces to one question asked of every index: *which queries does it make cheaper, and what does it cost every write?* Answer the first with plans and the second with measurements, and the rest of the chapter—column order, covering, partial and expression indexes, maintenance—follows as technique.

---

# ⚡ Performance Tip

If you remember one index rule from this chapter: for each important query, one composite index with its equality columns first and its sort columns next usually turns a scan-and-sort into a seek that reads only the rows returned.

---

# 💡 Did You Know?

Rudolf Bayer and Edward McCreight's 1972 paper "Organization and Maintenance of Large Ordered Indexes" introduced the B-tree. Its B+tree variant, with all keys in linked leaves, became the standard index structure of relational databases and file systems. In 1979 Douglas Comer's survey "The Ubiquitous B-Tree" had already called it the de facto standard for database indexes.

---

# Related Topics

- **10.01 — Introduction to Indexes**
- **10.05 — Composite Indexes and Column Order**
- **10.15 — Index Design Strategy**
- **10.16 — Common Index Mistakes & Best Practices**
- **09.17 — Subquery Cheat Sheet & Visual Knowledge Map**
- **08.17 — GROUP BY Cheat Sheet & Visual Knowledge Map**
- **11.xx — Window Functions**
- **16.xx — Reading Execution Plans**

---

# Summary

This section condenses Chapter 10 into a single reference: index DDL on every engine, how B-trees work, the leftmost-prefix and equality → sort → range rules for composite indexes, covering with `INCLUDE`, unique, partial and expression indexes, specialised index types, access paths and their plan labels, statistics and estimates, the write and storage costs of each index, maintenance practice, and a repeatable design method. One question carries the whole chapter—which queries does this index make cheaper, and what does it cost every write—and the knowledge map shows how indexes build on SARGability, join algorithms and aggregation strategies from earlier chapters and lead into query optimization and execution plans.
