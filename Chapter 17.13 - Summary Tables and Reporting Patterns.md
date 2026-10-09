---
title: "17.13 - Summary Tables and Reporting Patterns"
description: "Pre-aggregation for reporting with summary tables: when a hand-maintained table beats a materialized view, choosing the grain, rebuild, watermark-based incremental and partition-swap refresh patterns, late-arriving and updated rows, trigger-maintained counters, rolling up from fine to coarse summaries, serving dashboards from summaries, and reconciling summaries with base tables."
chapter: 17
section: 17.13
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 25 min
lastUpdated: 2026-10-09
---

# 17.13 Summary Tables and Reporting Patterns

---

# Learning Objectives

After completing this section, you will be able to:

- Decide when a summary table is a better choice than a materialized view.
- Choose the grain of a summary so it serves many reports.
- Implement rebuild, watermark-based and partition-swap refresh.
- Handle late-arriving and updated base rows correctly.
- Reconcile summaries with base tables.

---

# Why Summary Tables?

A **summary table** is an ordinary table holding pre-aggregated results, maintained by your own SQL rather than by the engine's materialized view machinery.

```text
choose a summary table when:
  • the engine has no materialized views (MySQL, SQLite)
  • you need incremental refresh the engine cannot do (PostgreSQL without extensions)
  • you need to keep history the base tables no longer have (purged raw events)
  • you need partitioning, custom indexes or column types the MV does not allow
  • refresh must merge data from several sources or apply business corrections
```

The cost: you own correctness. The engine no longer knows how the table was derived.

---

# Choosing the Grain

```sql
CREATE TABLE DailyProductSales (
    SalesDate    DATE        NOT NULL,
    ProductID    INT         NOT NULL,
    Country      VARCHAR(2)  NOT NULL,
    OrderCount   INT         NOT NULL,
    UnitsSold    INT         NOT NULL,
    Revenue      DECIMAL(18,2) NOT NULL,
    RefreshedAt  TIMESTAMP   NOT NULL,
    PRIMARY KEY (SalesDate, ProductID, Country)
);
```

The **grain**—one row per day, product and country—decides which questions the summary can answer:

```text
✔ revenue per month per category        (roll up days, join Products → Categories)
✔ top products in India last week       (filter Country, roll up days)
✔ daily trend for one product           (filter ProductID)
✘ revenue per customer                   (customer is not in the grain)
✘ distinct customers per day             (COUNT DISTINCT does not roll up—store it separately or use sketches)
```

Choose the finest grain that is still much smaller than the base data, store additive measures (counts, sums), and derive ratios and averages at query time.

---

# Pattern 1: Full Rebuild

```sql
BEGIN;
TRUNCATE DailyProductSales;          -- PostgreSQL: transactional; elsewhere use DELETE or a swap
INSERT INTO DailyProductSales (SalesDate, ProductID, Country, OrderCount, UnitsSold, Revenue, RefreshedAt)
SELECT CAST(o.OrderDate AS DATE), oi.ProductID, c.Country,
       COUNT(DISTINCT o.OrderID), SUM(oi.Quantity), SUM(oi.Quantity * oi.UnitPrice), CURRENT_TIMESTAMP
FROM Orders o
JOIN OrderItems oi ON oi.OrderID = o.OrderID
JOIN Customers c   ON c.CustomerID = o.CustomerID
WHERE o.Status <> 'Cancelled'
GROUP BY CAST(o.OrderDate AS DATE), oi.ProductID, c.Country;
COMMIT;
```

Simple and always correct, but its cost grows with all history. Fine for small bases or nightly windows with room to spare.

---

# Pattern 2: Swap

Build into a new table, then swap names, so readers never see a half-built summary:

```sql
-- PostgreSQL
CREATE TABLE DailyProductSales_new (LIKE DailyProductSales INCLUDING ALL);
INSERT INTO DailyProductSales_new SELECT … ;
BEGIN;
ALTER TABLE DailyProductSales     RENAME TO DailyProductSales_old;
ALTER TABLE DailyProductSales_new RENAME TO DailyProductSales;
COMMIT;
DROP TABLE DailyProductSales_old;

-- MySQL: atomic multi-table rename
RENAME TABLE DailyProductSales TO DailyProductSales_old, DailyProductSales_new TO DailyProductSales;

-- SQL Server: ALTER TABLE … SWITCH, or sp_rename inside a transaction
```

Grants and views on the old table must be re-pointed; views in PostgreSQL follow the **renamed** table (by OID), so prefer swapping data via partitions or re-creating dependent views when using this pattern there.

---

# Pattern 3: Watermark-Based Incremental Refresh

```sql
-- 1. remember the high-water mark BEFORE reading changes
--    (rows committed after this point are picked up next time)
-- 2. find the affected keys (grain values) changed since the last mark
-- 3. delete and recompute those keys only
-- 4. save the new mark only if everything succeeded
```

```sql
-- PostgreSQL
BEGIN;
SELECT now() AS new_mark \gset                  -- or store into a variable in a procedure

CREATE TEMP TABLE affected ON COMMIT DROP AS
SELECT DISTINCT CAST(o.OrderDate AS DATE) AS SalesDate
FROM Orders o
WHERE o.UpdatedAt >  (SELECT LastRefreshedAt FROM RefreshLog WHERE Name = 'DailyProductSales')
  AND o.UpdatedAt <= :'new_mark';

DELETE FROM DailyProductSales s USING affected a WHERE s.SalesDate = a.SalesDate;

INSERT INTO DailyProductSales (…)
SELECT … FROM Orders o JOIN OrderItems oi … JOIN Customers c …
WHERE CAST(o.OrderDate AS DATE) IN (SELECT SalesDate FROM affected)
  AND o.Status <> 'Cancelled'
GROUP BY …;

UPDATE RefreshLog SET LastRefreshedAt = :'new_mark' WHERE Name = 'DailyProductSales';
COMMIT;
```

Recomputing whole affected days (instead of adding deltas) handles updates and deletes correctly. The pitfalls:

```text
late commits     a transaction that started before new_mark but commits after it has UpdatedAt < new_mark
                 → re-read a safety overlap (e.g. mark − 5 minutes), or use commit-ordered change data
                   (logical replication / CDC / rowversion) instead of timestamps
hard deletes     deleted rows have no UpdatedAt → soft deletes, a deletes log table, or CDC
dimension change a customer's Country changes → all their days are affected; include such changes
                 in the affected-keys query or rebuild periodically
```

---

# Pattern 4: Partition Refresh

```sql
-- summary partitioned by month; recompute one month into a staging table, then exchange it
-- Oracle
ALTER TABLE MonthlySales EXCHANGE PARTITION p202610 WITH TABLE MonthlySales_stage;
-- SQL Server
ALTER TABLE MonthlySales_stage SWITCH TO MonthlySales PARTITION 82;
-- PostgreSQL
BEGIN;
ALTER TABLE MonthlySales DETACH PARTITION MonthlySales_202610;
ALTER TABLE MonthlySales ATTACH PARTITION MonthlySales_202610_new FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
COMMIT;
```

Closed months are never touched again; only the open month (and late corrections) is rebuilt.

---

# Pattern 5: Trigger-Maintained Counters

```sql
-- SQLite: keep a running count synchronously (MySQL: ON DUPLICATE KEY UPDATE in a FOR EACH ROW trigger)
CREATE TRIGGER trg_orders_count AFTER INSERT ON Orders
BEGIN
    INSERT INTO CustomerOrderTotals (CustomerID, OrderCount, Revenue)
    VALUES (NEW.CustomerID, 1, NEW.TotalAmount)
    ON CONFLICT (CustomerID) DO UPDATE
    SET OrderCount = OrderCount + 1, Revenue = Revenue + excluded.Revenue;
END;
```

Always fresh, like a SQL Server indexed view—and with the same costs: every write is slower, hot keys serialize, and `UPDATE`/`DELETE` need their own triggers. Use for small, critical counters, not for wide reporting summaries.

---

# Rolling Up and Serving Reports

```sql
-- monthly by category, from the daily summary (thousands of rows read, not millions)
SELECT DATE_TRUNC('month', s.SalesDate) AS SalesMonth,
       cat.CategoryName,
       SUM(s.Revenue) AS Revenue
FROM DailyProductSales s
JOIN Products p     ON p.ProductID = s.ProductID
JOIN Categories cat ON cat.CategoryID = p.CategoryID
WHERE s.SalesDate >= DATE '2026-01-01'
GROUP BY DATE_TRUNC('month', s.SalesDate), cat.CategoryName;
```

Layer summaries: raw events → hourly → daily → monthly, each built from the previous one. Dashboards read the coarsest summary that answers their question.

---

# Reconciliation

```sql
-- compare a sample day against the base tables
SELECT s.Revenue AS SummaryRevenue, b.Revenue AS BaseRevenue
FROM (SELECT SUM(Revenue) AS Revenue FROM DailyProductSales WHERE SalesDate = DATE '2026-10-08') s
CROSS JOIN (
    SELECT SUM(oi.Quantity * oi.UnitPrice) AS Revenue
    FROM Orders o JOIN OrderItems oi ON oi.OrderID = o.OrderID
    WHERE o.OrderDate >= DATE '2026-10-08' AND o.OrderDate < DATE '2026-10-09'
      AND o.Status <> 'Cancelled'
) b;
```

Run reconciliation checks after each refresh for recent days, and periodically for random older days. A summary that drifts silently is worse than a slow query.

---

# Visual Representation

```text
Orders / OrderItems / Customers (raw, 50M rows)
      │  refresh (rebuild · swap · watermark · partition exchange · triggers)
      ▼
DailyProductSales (grain: day × product × country, ~5M rows)
      │  roll up
      ▼
MonthlyCategorySales (~50K rows) ──▶ dashboards, exports
      ▲
RefreshLog: name · mark · duration · status        Reconciliation: summary = base? (recent + sampled days)
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← refresh reads base tables (or a finer summary); reports read the summary
2. JOIN        ← dimension joins happen at refresh time or at query time, by design
3. WHERE       ← refresh restricted to affected keys; reports filter on summary keys
4. GROUP BY    ← refresh groups at the grain; reports roll up to coarser groups
5. HAVING
6. WINDOW      ← running totals usually computed at query time over the summary
7. SELECT      ← store additive measures; derive ratios here
8. DISTINCT    ← COUNT DISTINCT does not roll up
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Rebuild:      one large aggregate query (hash aggregate over joins) → bulk insert
Watermark:    small scan for changed keys (index on UpdatedAt) → delete affected rows → aggregate
              only matching base rows (index on OrderDate) → insert → update mark, commit
Partition:    aggregate one partition's worth into staging → metadata-only exchange/attach
Triggers:     per base-row write: upsert into the summary row (row lock on that key)
```

---

# 🏗️ Architecture Insight

Summary tables are the database-side half of a reporting architecture. Once refresh logic grows beyond a few statements—many sources, slowly changing dimensions, late data—it usually belongs in a data pipeline (ELT tools, a warehouse) rather than in the OLTP database. Start in the database; move out when the rules outgrow it.

---

# ⚡ Performance Tip

Index base tables for the refresh, not just for the application: an index on `UpdatedAt` finds changed rows, and an index on `OrderDate` recomputes affected days without scanning history.

---

# 🌍 Production Consideration

Refresh jobs fail. Make them idempotent (rerunning recomputes the same keys), transactional (no half-applied refresh), and observable (`RefreshLog` with status and duration), and keep serving the last good summary when a run fails.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Atomic swap | ❌ | Transactional `RENAME` / partitions | `RENAME TABLE a TO b, c TO a` | `SWITCH`, `sp_rename` in transaction | `EXCHANGE PARTITION` | Transactional `ALTER TABLE RENAME` |
| Upsert for counters | `MERGE` | `ON CONFLICT` | `ON DUPLICATE KEY UPDATE` | `MERGE` | `MERGE` | `ON CONFLICT` |
| Change tracking | ❌ | Logical decoding | Binlog | Change Tracking / CDC, `rowversion` | MV logs, CDC/GoldenGate | ❌ |
| Scheduler | ❌ | `pg_cron` | Events | SQL Agent | `DBMS_SCHEDULER` | External |

> **Portability Tip:** The rebuild and watermark patterns use only `INSERT … SELECT`, `DELETE` and a log table, so they run on every engine; swaps, upserts and change capture are where dialects differ.

---

# Common Mistakes

### Mistake 1

Storing averages or distinct counts and then summing them in roll-ups.

---

### Mistake 2

Using a timestamp watermark without handling late commits or hard deletes.

---

### Mistake 3

Truncating and rebuilding a summary in place while dashboards read it.

---

### Mistake 4

Never reconciling summaries with base tables.

---

# Best Practices

✔ Choose the finest useful grain and store additive measures.

✔ Recompute whole affected keys instead of applying deltas.

✔ Make refreshes idempotent, transactional and logged.

✔ Swap or exchange partitions to avoid exposing partial results.

✔ Reconcile recent and sampled historical data regularly.

---

# Interview Questions

## Basic

1. What is a summary table?
2. What is the grain of a summary table?
3. Why store sums and counts instead of averages?

## Intermediate

4. Describe a watermark-based incremental refresh.
5. How do you refresh a summary without readers seeing partial data?
6. When is a summary table better than a materialized view?

## Advanced

7. How do late-committing transactions break timestamp watermarks, and how do you fix it?
8. Design a raw → hourly → daily → monthly summary pipeline with reconciliation.

---

# Hands-on Exercises

## Exercise 1

Create `DailyProductSales` and fill it with a full rebuild.

---

## Exercise 2

Implement watermark-based refresh with `RefreshLog`, update some orders, and verify only their days are recomputed.

---

## Exercise 3

Write a reconciliation query that flags days where summary and base revenue differ.

---

# Related Topics

- **17.09 — Materialized View Fundamentals**
- **17.10 — Refreshing Materialized Views (Complete, Incremental and Concurrent)**
- **08.12 — ROLLUP, CUBE and GROUPING SETS**
- **13.07 — Truncating and Bucketing Dates (DATE_TRUNC and date_bin)**
- **15.12 — Optimizing Writes (Batch INSERT, UPDATE and DELETE)**

---

# Summary

Summary tables are hand-maintained pre-aggregations: the portable alternative to materialized views, and the right tool when you need custom incremental logic, history or partitioning. Choose a grain fine enough to serve many reports and store additive measures. Refresh by full rebuild, swap, watermark-based recomputation of affected keys, partition exchange, or—for small counters—triggers, and handle late commits, hard deletes and dimension changes explicitly. Make refreshes idempotent, transactional and logged, roll up from fine to coarse summaries, and reconcile summaries with base tables regularly.
