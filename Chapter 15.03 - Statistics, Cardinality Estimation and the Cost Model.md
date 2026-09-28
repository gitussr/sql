---
title: "15.03 - Statistics, Cardinality Estimation and the Cost Model"
description: "What optimizer statistics contain (row counts, distinct values, null fractions, most common values, histograms), how selectivity and cardinality are estimated for equality, range, AND/OR and join predicates, the independence assumption and correlated columns, extended and multi-column statistics, skew and histograms, stale statistics and automatic update thresholds, sampling, estimation errors that compound through joins, and commands to inspect and refresh statistics on each engine."
chapter: 15
section: 15.03
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 30 min
lastUpdated: 2026-09-28
---

# 15.03 Statistics, Cardinality Estimation and the Cost Model

---

# Learning Objectives

After completing this section, you will be able to:

- List what optimizer statistics contain.
- Estimate the selectivity of simple predicates the way an optimizer does.
- Explain the independence assumption and how correlated columns break it.
- Use histograms and extended statistics to fix skew and correlation problems.
- Keep statistics fresh, and inspect them on each engine.

---

# What Statistics Contain

```text
Per table:     row count, page count
Per column:    number of distinct values (NDV)
               fraction of NULLs
               most common values (MCV) and their frequencies
               histogram of the remaining values (bucket boundaries)
               average width
               correlation between value order and physical order (PostgreSQL)
Per index:     depth, leaf pages, clustering factor (Oracle), distinct keys
Multi-column:  (optional) joint distinct counts, dependencies, combined MCVs
```

```sql
-- PostgreSQL: column statistics
SELECT attname, n_distinct, null_frac, most_common_vals, most_common_freqs, histogram_bounds
FROM pg_stats WHERE tablename = 'customers' AND attname = 'country';
```

| attname | n_distinct | null_frac | most_common_vals | most_common_freqs |
|---------|-----------|-----------|------------------|-------------------|
| country | 152 | 0.001 | {IN,US,GB,DE,…} | {0.60,0.20,0.03,0.02,…} |

---

# Selectivity and Cardinality

**Selectivity** is the fraction of rows a predicate keeps; **cardinality** is the estimated number of rows (selectivity × input rows).

```text
Customers: 1,000,000 rows, Country NDV = 152

Country = 'IN'     MCV frequency 0.60                  → 600,000 rows
Country = 'NZ'     not in MCV list: (1 − ΣMCV) / (NDV − #MCV)
                   ≈ (1 − 0.90) / (152 − 20) ≈ 0.00076   → ~760 rows
Country = :param   value unknown at plan time: 1 / NDV   → ~6,600 rows  (or sniffed, Section 15.08)
OrderDate >= X     histogram: fraction of buckets above X
Email IS NULL      null_frac
LIKE 'abc%'        treated as a range; '%abc%' → fixed guess (often 5–10% or less)
f(col) = X         no statistics on f(col) → fixed guess (e.g. 0.5%–10% depending on engine)
```

The last line is why functions on columns (Chapters 12, 13) hurt plans even when no index is involved: the optimizer has to guess.

---

# Combining Predicates: The Independence Assumption

```text
sel(A AND B) = sel(A) × sel(B)
sel(A OR B)  = sel(A) + sel(B) − sel(A) × sel(B)
```

This is right when columns are independent—and badly wrong when they are **correlated**:

```sql
SELECT * FROM Customers WHERE City = 'Mumbai' AND Country = 'IN';
```

```text
sel(City = 'Mumbai')  = 0.05
sel(Country = 'IN')   = 0.60
independent estimate  = 0.05 × 0.60 = 0.03   → 30,000 rows
reality               = every Mumbai customer is in India → 0.05 → 50,000 rows
```

Here the error is modest. With three or four correlated predicates (City, State, Country, PostalCode) estimates can be 100× too low, pushing the optimizer toward nested loops that explode.

---

# Extended and Multi-Column Statistics

```sql
-- PostgreSQL 10+: functional dependencies, n-distinct, MCV lists (12+) across columns
CREATE STATISTICS st_customers_city_country (dependencies, ndistinct, mcv)
    ON City, Country FROM Customers;
ANALYZE Customers;

-- PostgreSQL 14+: statistics on an expression
CREATE STATISTICS st_orders_year ON (EXTRACT(YEAR FROM OrderDate)) FROM Orders;

-- SQL Server: multi-column statistics (density of the combination; histogram on the first column)
CREATE STATISTICS st_customers_city_country ON Customers (City, Country);

-- Oracle: column groups
SELECT DBMS_STATS.CREATE_EXTENDED_STATS(USER, 'CUSTOMERS', '(CITY, COUNTRY)') FROM dual;

-- MySQL 8.0: histograms on single columns (no multi-column statistics; composite indexes help)
ANALYZE TABLE Customers UPDATE HISTOGRAM ON Country WITH 64 BUCKETS;
```

Indexes on column combinations also give some engines combined distinct counts; an expression index gives the optimizer statistics on the expression.

---

# Skew and Histograms

Data is rarely uniform. `Country` has one value covering 60% of rows and 100 values covering under 0.1% each:

```text
Country   rows        best plan for "WHERE Country = ?"
IN        600,000     full scan (index lookups for 60% of the table would be slower)
NZ        760         index seek + lookups
```

Without an MCV list or histogram, the optimizer assumes uniformity (1/NDV ≈ 6,600 rows for every value) and picks one plan for both. Histograms and MCV lists let it tell the difference—**if** the literal value is visible at plan time. With parameters, skew leads to parameter sniffing problems (Section 15.08).

Histogram resolution:

| Engine | Default detail | Increase |
|--------|----------------|----------|
| PostgreSQL | 100 MCVs / 100 buckets (`default_statistics_target`) | `ALTER TABLE … ALTER COLUMN … SET STATISTICS 1000` |
| SQL Server | Up to 200 histogram steps | Fixed; filtered statistics for hot ranges |
| Oracle | 254 buckets by default, up to 2048 (12c+); frequency, top-frequency and hybrid histograms | `METHOD_OPT => 'FOR COLUMNS SIZE 254 COUNTRY'` |
| MySQL | Histograms only when created (up to 1024 buckets) | `UPDATE HISTOGRAM … WITH n BUCKETS` |
| SQLite | `sqlite_stat1` averages; `sqlite_stat4` samples if compiled in | `ANALYZE` |

---

# Join Cardinality

```text
|A ⋈ B on A.x = B.y| ≈ |A| × |B| / max(NDV(A.x), NDV(B.y))

Orders (10,000,000) ⋈ Customers (1,000,000) on CustomerID
  NDV(Orders.CustomerID) = 900,000, NDV(Customers.CustomerID) = 1,000,000
  → 10,000,000 × 1,000,000 / 1,000,000 = 10,000,000 rows   (each order matches one customer ✔)
```

Filters before the join change both inputs. Errors **multiply** through joins:

```text
step 1 estimate 2× low  →  step 2 inherits and adds 3×  →  step 3 adds 5×  →  30× low at the top
```

This is why late operators in big queries often have the worst estimates, and why materializing an intermediate result (with fresh statistics) can fix a plan.

---

# Stale Statistics

Statistics are snapshots. After large changes they describe a table that no longer exists:

```text
Nightly load adds 2,000,000 rows dated today
histogram maximum = yesterday
WHERE OrderDate = CURRENT_DATE → estimated ~1 row, actual 2,000,000 (ascending key problem, Section 13.14)
```

Automatic updates:

| Engine | Automatic statistics |
|--------|---------------------|
| PostgreSQL | autovacuum `ANALYZE` after 10% + 50 rows change (`autovacuum_analyze_scale_factor`) |
| SQL Server | Auto update when modifications exceed a threshold (dynamic ≈ √(1000 × rows) for large tables, 2016+ compatibility); synchronous by default, optional async |
| Oracle | Nightly maintenance window job for stale objects (> 10% changed); real-time statistics in some editions (19c+) |
| MySQL InnoDB | Persistent stats recalculated after ~10% of rows change (`innodb_stats_auto_recalc`); histograms never auto-refresh |
| SQLite | Never automatic; run `ANALYZE` or `PRAGMA optimize` |

On a 500-million-row table, 10% is 50 million changes—so statistics can be stale for weeks. Refresh explicitly after bulk loads, and schedule updates for large, fast-changing tables.

```sql
ANALYZE Orders;                                               -- PostgreSQL
UPDATE STATISTICS Orders WITH FULLSCAN;                       -- SQL Server
EXEC DBMS_STATS.GATHER_TABLE_STATS(USER, 'ORDERS');           -- Oracle
ANALYZE TABLE Orders;                                         -- MySQL
ANALYZE Orders;   PRAGMA optimize;                            -- SQLite
```

---

# Sampling

Statistics are usually built from samples: PostgreSQL reads 300 × statistics target rows, SQL Server samples a percentage that shrinks as tables grow, InnoDB reads 20 pages per index by default (`innodb_stats_persistent_sample_pages`). Samples are fine for uniform data and can miss rare values or misjudge NDV on skewed data. For critical columns, raise the sample (`FULLSCAN`, higher targets, more sample pages).

---

# Visual Representation

```text
   data ──ANALYZE──▶ statistics ──▶ selectivity ──▶ cardinality ──▶ cost ──▶ plan choice
          (sample)   NDV, MCV,       per predicate   rows per        per
                     histogram,      (AND: multiply) operator        alternative
                     null_frac       (join: ÷ NDV)
   stale / missing / correlated / function-hidden ──▶ wrong cardinality ──▶ wrong plan
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← table row counts: the starting cardinalities
2. JOIN        ← join cardinality: |A| × |B| / max(NDV) — errors multiply here
3. WHERE       ← predicate selectivity from MCVs, histograms, null fractions
4. GROUP BY    ← number of groups ≈ NDV of the grouping columns (combined NDV if available)
5. HAVING      ← often a fixed guess
6. WINDOW
7. SELECT
8. DISTINCT    ← output rows ≈ NDV of the selected columns
9. ORDER BY
10. LIMIT / FETCH / TOP   ← caps the cardinality and changes which plan is cheapest
```

---

# How the DBMS Executes This

```text
EXPLAIN ANALYZE fragment (PostgreSQL):
  Nested Loop  (cost=… rows=12 …) (actual … rows=48,210 loops=1)
    -> Index Scan on customers (rows=30,000) (actual rows=50,000)      ← correlation: City + Country
    -> Index Scan on orders (rows=0.0004 per loop) (actual rows=0.96)  ← stale histogram
  estimate 12, actual 48,210 → a hash join would have been far cheaper
```

---

# 🏗️ Architecture Insight

Statistics maintenance is part of the data pipeline. Any job that loads, deletes or rewrites a large share of a table should refresh its statistics as its final step—before the reports that read it run.

---

# ⚡ Performance Tip

When a plan looks wrong, look for the **first** operator (from the bottom of the plan) where estimated and actual rows diverge by 10× or more. Fixing that estimate—fresh statistics, extended statistics, a sargable rewrite—usually fixes everything above it.

---

# 🌍 Production Consideration

Refreshing statistics can itself change plans—occasionally for the worse—and on SQL Server and Oracle it invalidates cached plans, causing a burst of compilations. Schedule large refreshes at quiet times, and keep a way to pin a known-good plan while investigating (Section 15.09).

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Refresh | ❌ | `ANALYZE` | `ANALYZE TABLE` | `UPDATE STATISTICS` | `DBMS_STATS` | `ANALYZE` |
| View statistics | ❌ | `pg_stats` | `information_schema.COLUMN_STATISTICS` | `DBCC SHOW_STATISTICS`, `sys.dm_db_stats_histogram` | `USER_TAB_COL_STATISTICS`, `USER_HISTOGRAMS` | `sqlite_stat1` |
| Multi-column | ❌ | `CREATE STATISTICS` | ❌ | Multi-column stats | Column groups | ❌ |
| Expression stats | ❌ | ✅ (14+) | Via functional index | Computed columns | Virtual columns / extended stats | ❌ |
| Automatic | ❌ | autovacuum | InnoDB auto recalc | Auto update | Maintenance window | ❌ |

> **Portability Tip:** Every engine estimates from row counts, distinct values and histograms; how you create, inspect and refresh them is engine-specific.

---

# Common Mistakes

### Mistake 1

Never refreshing statistics after bulk loads.

---

### Mistake 2

Ignoring correlated columns in multi-predicate filters.

---

### Mistake 3

Relying on automatic updates for very large tables.

---

### Mistake 4

Hiding columns behind functions so the optimizer must guess.

---

### Mistake 5

Assuming MySQL histograms stay current (they never auto-refresh).

---

# Best Practices

✔ Refresh statistics after large data changes.

✔ Add extended/multi-column statistics for correlated predicates.

✔ Raise histogram detail or sample size for skewed, critical columns.

✔ Find the lowest operator where estimates diverge and fix that estimate.

✔ Schedule statistics maintenance for large, fast-changing tables.

---

# Interview Questions

## Basic

1. What do optimizer statistics contain?
2. What is cardinality?
3. How do you refresh statistics on your engine?

## Intermediate

4. How does the optimizer estimate `Country = 'NZ'`?
5. What is the independence assumption, and when does it fail?
6. Why do estimates get worse in later joins?

## Advanced

7. How would you fix an underestimate caused by `City` and `Country` being correlated?
8. Why can statistics be stale on a 500-million-row table despite automatic updates?

---

# Hands-on Exercises

## Exercise 1

Inspect the statistics of a skewed column on your engine.

---

## Exercise 2

Find a query whose estimate is wrong because of correlated predicates, and fix it with extended statistics.

---

## Exercise 3

Load a day of new rows, compare estimates before and after refreshing statistics.

---

# Related Topics

- **15.02 — How the Query Optimizer Works (Parsing, Rewriting and Cost-Based Planning)**
- **15.08 — Parameter Sniffing, Plan Caching and Prepared Statements**
- **10.12 — Selectivity, Cardinality and Statistics**
- **13.14 — Execution Flow of Date and Time Functions**

---

# Summary

Optimizer statistics—row counts, distinct values, null fractions, most common values and histograms—turn predicates into selectivities and row estimates, which drive every plan choice. Estimates fail when statistics are stale, when correlated columns are multiplied as if independent, when data is skewed and the value is unknown, when functions hide columns, and when errors compound through joins. Extended statistics, finer histograms, larger samples and explicit refreshes after data changes fix most estimation problems; the first operator whose estimate diverges from reality is where to start.
