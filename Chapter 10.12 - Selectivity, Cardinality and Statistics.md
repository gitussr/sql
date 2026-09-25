---
title: "10.12 - Selectivity, Cardinality and Statistics"
description: "How the optimizer decides whether to use an index: selectivity and cardinality, column statistics and histograms, most-common values, correlated columns and extended statistics, stale statistics, parameter sensitivity and plan caching, and how to keep estimates accurate."
chapter: 10
section: 10.12
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 35 min
lastUpdated: 2026-09-25
---

# 10.12 Selectivity, Cardinality and Statistics

---

# Learning Objectives

After completing this section, you will be able to:

- Define selectivity and cardinality, and relate them to index usefulness.
- Describe the statistics an optimizer keeps: row counts, distinct values, histograms, most-common values.
- Explain how estimates go wrong for correlated columns, skew and stale statistics.
- Update statistics and create extended (multi-column) statistics.
- Explain parameter sensitivity and plan caching problems.
- Compare estimated and actual rows in a plan to diagnose bad index choices.

---

# Selectivity and Cardinality

- **Cardinality** of a column: the number of distinct values. `Status` (3 values) is low-cardinality; `Email` (unique) is high-cardinality.
- **Selectivity** of a predicate: the fraction of rows it returns. `CustomerID = 42` might select 0.001% of orders; `Status <> 'Cancelled'` selects 97%.
- **Cardinality estimate** (in plan output): the optimizer's estimate of how many rows an operator returns.

```text
Orders: 5 000 000 rows

Predicate                         Selectivity   Rows       Index useful?
CustomerID = 42                   0.001 %       50         ✅ seek
OrderDate = '2026-09-01'          0.03 %        1 500      ✅ seek
Status = 'Pending'                2 %           100 000    ✅ maybe (partial index ideal)
Status = 'Shipped'                95 %          4 750 000  ❌ scan
```

Index usefulness follows selectivity: the fewer rows a predicate returns, the more an index helps.

---

# Why Low-Cardinality Columns Are Poor Index Leaders

An index on `Status` alone mostly returns huge portions of the table, which a full scan reads more efficiently. But low cardinality is not the whole story:

- Skewed data: `Status = 'Pending'` (2%) is selective even though `Status` has only 3 values.
- Composite indexes: `Status` is fine as a leading equality column followed by other columns (`(Status, OrderDate)`), because the combination is selective.
- Partial indexes: `WHERE Status = 'Pending'` indexes only the selective value.

---

# What Statistics Contain

Optimizers cannot count rows for every query, so they keep **statistics** gathered by sampling or scanning:

```text
Table-level          row count, page count, average row width
Column-level         number of distinct values (n_distinct)
                     fraction of NULLs
                     most common values (MCV) and their frequencies
                     histogram of the remaining values
                     physical correlation with table order
Index-level          tree height, leaf pages, clustering factor
Multi-column         (extended stats) combined distinct counts, dependencies, MCVs
```

```sql
-- PostgreSQL: inspect column statistics
SELECT attname, n_distinct, null_frac, most_common_vals, most_common_freqs, correlation
FROM pg_stats WHERE tablename = 'orders' AND attname = 'status';

-- SQL Server
DBCC SHOW_STATISTICS ('dbo.Orders', 'IX_Orders_Status');

-- MySQL 8.0
ANALYZE TABLE Orders UPDATE HISTOGRAM ON Status WITH 16 BUCKETS;
SELECT * FROM information_schema.COLUMN_STATISTICS WHERE TABLE_NAME = 'Orders';

-- Oracle
SELECT column_name, num_distinct, num_nulls, histogram FROM user_tab_col_statistics
WHERE table_name = 'ORDERS';
```

---

# How Estimates Are Computed

```text
Equality on a most-common value:     Status = 'Pending'  → MCV frequency 0.02 × 5 M = 100 000
Equality on another value:           (1 − Σ MCV freq − null_frac) / (n_distinct − #MCV) × rows
Range:                               fraction of histogram buckets covered × rows
AND of two predicates:               sel(A) × sel(B)        ← assumes independence
OR:                                  sel(A) + sel(B) − sel(A) × sel(B)
Join:                                rows(A) × rows(B) / max(n_distinct(A.key), n_distinct(B.key))
```

Every estimate feeds the next operator's estimate, so an early error multiplies through the plan.

---

# Correlated Columns

The independence assumption fails when columns are related:

```sql
SELECT * FROM Addresses WHERE City = 'Mumbai' AND State = 'Maharashtra';
```

```text
sel(City = 'Mumbai')        = 0.05
sel(State = 'Maharashtra')  = 0.10
Independent estimate        = 0.05 × 0.10 = 0.005  → 5 000 rows
Actual                      = 0.05                  → 50 000 rows (every Mumbai is in Maharashtra)
```

A 10× underestimate may lead the optimizer to choose an index seek with 50 000 lookups instead of a scan, or a nested loop join where a hash join was needed. **Extended statistics** fix this:

```sql
-- PostgreSQL 10+
CREATE STATISTICS st_addresses_city_state (dependencies, ndistinct, mcv)
ON City, State FROM Addresses;
ANALYZE Addresses;

-- SQL Server: multi-column statistics are created with composite indexes,
-- or explicitly:
CREATE STATISTICS st_Addresses_City_State ON dbo.Addresses (City, State);

-- Oracle: column groups
SELECT DBMS_STATS.CREATE_EXTENDED_STATS(USER, 'ADDRESSES', '(CITY, STATE)') FROM dual;
```

---

# Stale Statistics

Statistics describe the data as it was when they were gathered. After large loads or deletes, they can be badly wrong:

```text
Statistics say: Orders has 10 000 rows, OrderDate max = 2026-06-30
Reality:        Orders has 5 000 000 rows, 2 M of them after 2026-06-30

WHERE OrderDate > '2026-07-01'
  → estimated 1 row (beyond the histogram) → nested loop + index seek
  → actual 2 000 000 rows → hours instead of seconds
```

The "ascending key" problem—new values beyond the last histogram bucket—is common for dates and identity columns. Engines mitigate it (SQL Server's newer cardinality estimator, PostgreSQL using the index to find the actual max at plan time), but fresh statistics are the real fix.

```sql
ANALYZE Orders;                                        -- PostgreSQL, SQLite
UPDATE STATISTICS dbo.Orders WITH FULLSCAN;            -- SQL Server
ANALYZE TABLE Orders;                                  -- MySQL
EXEC DBMS_STATS.GATHER_TABLE_STATS(USER, 'ORDERS');    -- Oracle
```

All major engines refresh statistics automatically after enough rows change (PostgreSQL autovacuum's analyze, SQL Server auto-update, MySQL persistent stats auto-recalc, Oracle's nightly job). After bulk loads, refresh explicitly—do not wait for the thresholds.

---

# Parameter Sensitivity

A cached plan compiled for one parameter value is reused for others:

```sql
SELECT * FROM Orders WHERE CustomerID = @CustomerID;

@CustomerID = 42       → 50 rows        → index seek + lookups  ✅
@CustomerID = 1        → 900 000 rows   (a marketplace account) → same plan ❌ (900 000 lookups)
```

This is **parameter sniffing** (SQL Server) or the generic-versus-custom plan problem (PostgreSQL prepared statements). Remedies:

| Remedy | Engine |
|--------|--------|
| Recompile per execution: `OPTION (RECOMPILE)` | SQL Server |
| Optimise for a typical value: `OPTION (OPTIMIZE FOR (@p = 42))` | SQL Server |
| Parameter Sensitive Plan optimisation (multiple cached plans) | SQL Server 2022+ |
| `plan_cache_mode = force_custom_plan` | PostgreSQL 12+ |
| Adaptive cursor sharing (multiple plans by bind value) | Oracle |
| Split the query for known outliers | All |

---

# Diagnosing Estimate Errors

```text
Index Scan using ix_orders_customerid on orders
  (cost=… rows=48 …) (actual … rows=912344 loops=1)
             ▲                        ▲
         estimated                 actual        → 19 000× underestimate
```

Rule of thumb: when estimated and actual rows differ by more than a factor of 10 at the bottom of a plan, fix the estimate first (statistics, extended statistics, query rewrite) before changing indexes. A correct index cannot help if the optimizer believes it returns 48 rows when it returns 900 000.

---

# Visual Representation

```text
Histogram on OrderDate (equi-depth, 10 buckets of 500 000 rows)

2019 ├──┤2020├──┤2021├──┤2022├──┤2023├──┤2024├──┤2025├─┤2026-03├┤2026-06├┤2026-06-30
                                                                         │
                                                             statistics end here
                                              new data after this date is invisible
                                              → estimate ≈ 0 rows until next ANALYZE
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← row estimates decide scan vs seek for each table
2. JOIN        ← estimated input sizes decide join algorithm and order
3. WHERE       ← predicate selectivity comes from statistics
4. GROUP BY    ← estimated number of groups decides hash vs stream aggregate
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY    ← estimated rows decide sort strategy and memory
9. LIMIT / FETCH / TOP
```

Statistics influence every step of the plan, even though they never change the result.

---

# How the DBMS Executes This

```text
Query compile time
  ├─ read table/column/index statistics from the catalog
  ├─ estimate selectivity of each predicate
  ├─ estimate rows for each candidate plan node
  ├─ cost each candidate (pages × I/O cost + rows × CPU cost)
  └─ cache the plan (for prepared/parameterised statements)

Execution time
  └─ plan runs as chosen — estimates are not revisited
     (except adaptive features: adaptive joins, memory grant feedback, re-optimisation)
```

---

# 🔬 Engine Deep Dive

Modern engines correct estimate errors during or after execution: SQL Server's **adaptive joins** choose between hash and nested loop at run time based on actual rows, and **memory grant feedback** and **cardinality estimation feedback** adjust later executions; Oracle's **adaptive plans** and **statistics feedback** do similar things. PostgreSQL relies on accurate statistics up front, which is why `ANALYZE` and extended statistics matter so much there.

---

# 🏗️ Architecture Insight

Data skew is a design fact, not an accident: marketplaces have huge sellers, social networks have celebrities, multi-tenant systems have large tenants. Queries whose selectivity varies by orders of magnitude across parameter values need a deliberate strategy—separate code paths, recompilation, or partitioning by tenant—rather than one plan for all.

---

# ⚡ Performance Tip

After every large data load or purge, run the engine's statistics command on the affected tables before users query them. It is the cheapest performance fix there is.

---

# 🔒 Security Note

Statistics contain real data values—most common values and histogram boundaries. In PostgreSQL, `pg_stats` shows only columns the user can read, but `pg_statistic` is restricted to superusers for a reason. Treat statistics views and exported plans as containing sample data.

---

# SQL Standard vs Vendor Differences

| Feature | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|---------|-----------|-------|-----------|--------|--------|
| Refresh command | `ANALYZE` | `ANALYZE TABLE` | `UPDATE STATISTICS` | `DBMS_STATS` | `ANALYZE` |
| Automatic refresh | Autovacuum | Persistent stats auto-recalc | Auto update stats | Maintenance job | ❌ (`PRAGMA optimize`) |
| Histograms | ✅ | ✅ (8.0+, on demand) | ✅ (on stats objects) | ✅ | ✅ (`sqlite_stat4`) |
| Multi-column statistics | `CREATE STATISTICS` | ❌ | ✅ | Column groups | ❌ |
| Parameter-sensitive plans | Custom/generic plans | n/a | PSP (2022+) | Adaptive cursor sharing | n/a |
| Run-time adaptive plans | ❌ | ❌ | Adaptive joins | Adaptive plans | ❌ |

> **Portability Tip:** Every engine needs statistics refreshed after bulk changes; only the command differs. Put it in your load scripts.

---

# Common Mistakes

### Mistake 1

Indexing a low-cardinality column alone and expecting it to be used.

---

### Mistake 2

Loading millions of rows and querying immediately without refreshing statistics.

---

### Mistake 3

Blaming the index when the real problem is a row estimate off by 1 000×.

---

### Mistake 4

Ignoring correlated columns in multi-column filters.

---

### Mistake 5

Assuming one cached plan is good for every parameter value on skewed data.

---

# Best Practices

✔ Judge index usefulness by predicate selectivity, not by column cardinality alone.

✔ Refresh statistics after bulk loads and large deletes.

✔ Create extended statistics for correlated filter columns.

✔ Compare estimated and actual rows before changing indexes.

✔ Handle skewed parameters deliberately.

---

# Interview Questions

## Basic

1. What is selectivity?
2. What are database statistics?
3. Why might an index on `Status` not be used?

## Intermediate

4. How do stale statistics cause bad plans?
5. What is a histogram used for?
6. What is parameter sniffing?

## Advanced

7. Why does the independence assumption break for correlated columns, and how do extended statistics help?
8. What is the ascending key problem?
9. How do adaptive joins reduce the impact of bad estimates?

---

# Hands-on Exercises

## Exercise 1

Inspect the statistics of `Orders.Status` on your engine and compute the expected estimate for `Status = 'Pending'`.

---

## Exercise 2

Load 1 million new orders with future dates, run a date-range query before and after refreshing statistics, and compare estimates.

---

## Exercise 3

Create correlated `City`/`State` data, check the estimate for `City = … AND State = …`, then add extended statistics and check again.

---

## Exercise 4

Create a skewed `CustomerID` distribution and observe plan reuse for a frequent and a rare customer.

---

# Related Topics

- **10.08 — Index Seeks, Scans and Lookups**
- **10.15 — Index Design Strategy**
- **04.03 — How SQL Works Internally (SQL Query Processing Pipeline)**
- **15.xx — Query Optimization**

---

# Summary

Whether an index is used depends on selectivity—the fraction of rows a predicate returns—and the optimizer estimates it from statistics: row counts, distinct values, null fractions, most-common values and histograms. Estimates go wrong when statistics are stale, when new values lie beyond the histogram, when columns are correlated, and when one cached plan serves very different parameter values. Refresh statistics after bulk changes, add extended statistics for correlated columns, handle skewed parameters deliberately, and compare estimated with actual rows in plans before concluding that an index is missing or wrong.
