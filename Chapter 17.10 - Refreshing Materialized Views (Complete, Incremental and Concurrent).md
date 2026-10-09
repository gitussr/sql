---
title: "17.10 - Refreshing Materialized Views (Complete, Incremental and Concurrent)"
description: "Keeping materialized views fresh: complete refresh, PostgreSQL REFRESH MATERIALIZED VIEW and CONCURRENTLY with its unique-index requirement, Oracle fast refresh with materialized view logs, ON COMMIT and ON DEMAND timing, DBMS_MVIEW and refresh groups, scheduling refreshes with pg_cron, jobs and events, swap-based refresh patterns, monitoring staleness and handling refresh failures."
chapter: 17
section: 17.10
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 25 min
lastUpdated: 2026-10-09
---

# 17.10 Refreshing Materialized Views (Complete, Incremental and Concurrent)

---

# Learning Objectives

After completing this section, you will be able to:

- Choose between complete and incremental refresh.
- Refresh PostgreSQL materialized views without blocking readers.
- Set up Oracle fast refresh with materialized view logs.
- Schedule refreshes and monitor their freshness.
- Handle refresh failures and growing refresh windows.

---

# Refresh Methods

| Method | What it does | Cost grows with | Engines |
|--------|--------------|-----------------|---------|
| **Complete** | Re-runs the whole query and replaces the result | Size of base data | PostgreSQL, Oracle |
| **Concurrent complete** | Re-runs the query, diffs with stored rows, applies changes | Base data + result size | PostgreSQL `CONCURRENTLY` |
| **Incremental (fast)** | Applies only the changes since the last refresh | Volume of changes | Oracle (MV logs), SQL Server (always) |
| **On commit** | Incremental, inside every committing transaction | Each transaction's changes | Oracle `ON COMMIT`, SQL Server indexed views |

---

# PostgreSQL: REFRESH and CONCURRENTLY

```sql
REFRESH MATERIALIZED VIEW CustomerRevenue;
```

A plain refresh rebuilds the view into new storage and swaps it in. It holds an `ACCESS EXCLUSIVE` lock: **readers are blocked** for the duration of the refresh.

```sql
CREATE UNIQUE INDEX ux_customerrevenue_id ON CustomerRevenue (CustomerID);

REFRESH MATERIALIZED VIEW CONCURRENTLY CustomerRevenue;
```

`CONCURRENTLY` computes the new result into a temporary table, compares it with the current contents using the unique index, and applies `INSERT`/`UPDATE`/`DELETE` for the differences. Readers continue to see the old rows until it commits.

```text
                    plain REFRESH                 REFRESH … CONCURRENTLY
readers             blocked                       not blocked
requirement         —                             a UNIQUE index on plain columns, no WHERE clause; view populated
cost                rebuild                       rebuild + diff (slower when most rows change)
bloat               none (new storage)            dead tuples from updates/deletes → needs VACUUM
two at once         serialized                    serialized (only one refresh per view at a time)
```

Use `CONCURRENTLY` for views read continuously; use the plain form for views read only after a batch load, or when most rows change on each refresh.

---

# Oracle: Fast Refresh with Materialized View Logs

```sql
CREATE MATERIALIZED VIEW LOG ON Orders
WITH ROWID, SEQUENCE (CustomerID, TotalAmount)
INCLUDING NEW VALUES;

CREATE MATERIALIZED VIEW CustomerRevenueMV
BUILD IMMEDIATE
REFRESH FAST ON DEMAND
AS
SELECT CustomerID,
       COUNT(*)            AS OrderCount,
       COUNT(TotalAmount)  AS AmountCount,     -- required for fast refresh of SUM
       SUM(TotalAmount)    AS Revenue
FROM Orders
GROUP BY CustomerID;

EXEC DBMS_MVIEW.REFRESH('CUSTOMERREVENUEMV', method => 'F');    -- F = fast, C = complete, ? = force
```

The log records every change to `Orders`. A fast refresh reads only those log rows and adjusts the affected groups—minutes of work become seconds.

Fast refresh has rules. For aggregate views: `COUNT(*)` must be present, `COUNT(col)` must accompany `SUM(col)` and `AVG(col)`, and some functions (`MIN`/`MAX` after deletes, analytic functions, many outer-join shapes) are not fast-refreshable. Ask Oracle before guessing:

```sql
EXEC DBMS_MVIEW.EXPLAIN_MVIEW('CUSTOMERREVENUEMV');
SELECT capability_name, possible, msgtxt FROM mv_capabilities_table;
```

| Timing | Meaning |
|--------|---------|
| `ON DEMAND` | Only when you call `DBMS_MVIEW.REFRESH` (or a job does) |
| `ON COMMIT` | In every transaction that changes a base table—always fresh, slower commits |
| `START WITH … NEXT …` | Built-in schedule |
| `ON STATEMENT` (12.2+) | After every DML statement, no MV log needed |

`REFRESH FORCE` tries fast refresh and falls back to complete.

---

# SQL Server: No Refresh Needed

Indexed views are maintained synchronously: every `INSERT`, `UPDATE` or `DELETE` on a base table also updates the view's clustered index in the same transaction. They are never stale—and every write pays for them (Section 17.11).

---

# Incremental Refresh Without Native Support

PostgreSQL has no built-in incremental refresh (the `pg_ivm` extension adds it). MySQL and SQLite have no materialized views at all. The common pattern is a **watermark-based** summary-table update:

```sql
-- refresh only the days touched since the last run (PostgreSQL)
BEGIN;

CREATE TEMP TABLE changed_days ON COMMIT DROP AS
SELECT DISTINCT CAST(OrderDate AS DATE) AS SalesDate
FROM Orders
WHERE UpdatedAt > (SELECT LastRefreshedAt FROM RefreshLog WHERE Name = 'DailySales');

DELETE FROM DailySales d USING changed_days c WHERE d.SalesDate = c.SalesDate;

INSERT INTO DailySales (SalesDate, OrderCount, Revenue)
SELECT CAST(o.OrderDate AS DATE), COUNT(*), SUM(o.TotalAmount)
FROM Orders o
WHERE o.OrderDate >= (SELECT MIN(SalesDate) FROM changed_days)
  AND CAST(o.OrderDate AS DATE) IN (SELECT SalesDate FROM changed_days)
GROUP BY CAST(o.OrderDate AS DATE);

UPDATE RefreshLog SET LastRefreshedAt = now() WHERE Name = 'DailySales';
COMMIT;
```

The changed keys are captured once, the affected days are replaced in one transaction, and the watermark moves only if everything succeeded. Section 17.13 covers the pattern, including rows changed while the refresh runs.

---

# Scheduling Refreshes

```sql
-- PostgreSQL with pg_cron
SELECT cron.schedule('refresh-customer-revenue', '*/15 * * * *',
                     'REFRESH MATERIALIZED VIEW CONCURRENTLY CustomerRevenue');

-- Oracle scheduler
BEGIN
  DBMS_SCHEDULER.CREATE_JOB(
    job_name        => 'REFRESH_CUSTOMER_REVENUE',
    job_type        => 'PLSQL_BLOCK',
    job_action      => 'BEGIN DBMS_MVIEW.REFRESH(''CUSTOMERREVENUEMV'', ''F''); END;',
    repeat_interval => 'FREQ=MINUTELY;INTERVAL=15',
    enabled         => TRUE);
END;

-- MySQL event (summary table)
CREATE EVENT ev_refresh_daily_sales
ON SCHEDULE EVERY 15 MINUTE
DO CALL RefreshDailySales();
```

Order matters when materialized views depend on each other: refresh `DailySales` before `MonthlySales` that reads it. Oracle **refresh groups** (`DBMS_REFRESH`) refresh several views as one consistent transaction.

---

# Monitoring Freshness

```sql
-- PostgreSQL has no built-in "last refreshed" timestamp: record it yourself
CREATE TABLE RefreshLog (Name TEXT PRIMARY KEY, LastRefreshedAt TIMESTAMPTZ, DurationMs INT, Status TEXT);

-- Oracle
SELECT mview_name, last_refresh_type, last_refresh_date, staleness
FROM user_mviews;
```

```text
alert when   now() − LastRefreshedAt > freshness target
alert when   refresh duration grows week over week (the window will eventually be missed)
alert when   refresh fails (and keep serving the last good result—never an empty view)
```

---

# Visual Representation

```text
COMPLETE            base tables ──full query──▶ new result ──swap──▶ MV        (readers blocked in PG)
CONCURRENT (PG)     base tables ──full query──▶ temp ──diff via unique index──▶ MV (readers continue)
FAST (Oracle)       DML ──▶ MV LOG ──deltas──▶ MV                              (cost ∝ changes)
ON COMMIT / SQL Srv DML ──same transaction──▶ MV                               (always fresh, slower writes)
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← complete: base tables in full; fast: MV logs joined to base tables
2. JOIN
3. WHERE       ← incremental patterns restrict to changed keys or partitions
4. GROUP BY    ← only affected groups are recomputed in incremental refresh
5. HAVING      ← HAVING in a definition often prevents fast refresh
6. WINDOW      ← window functions usually prevent incremental refresh
7. SELECT
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
PG REFRESH:               lock MV (ACCESS EXCLUSIVE) → run query into new heap → swap relfilenode → rebuild indexes
PG REFRESH CONCURRENTLY:  lock MV (EXCLUSIVE: reads allowed) → run query into temp → full outer join temp
                          with MV on the unique key → apply deletes/inserts/updates → commit
Oracle FAST:              read MV log rows since last refresh → compute per-group deltas → merge into MV
                          → purge log rows no MV still needs
Oracle ON COMMIT:         at commit, apply this transaction's deltas to the MV before commit completes
```

---

# 🏗️ Architecture Insight

Refresh strategy is a property of the **data flow**, not of the view. If base tables are loaded in nightly batches, refresh after the load completes; if they change continuously, choose incremental refresh or accept a fixed staleness. Triggering refresh from the end of the ETL job is more reliable than a clock-based schedule.

---

# ⚡ Performance Tip

When a PostgreSQL concurrent refresh is slow because most rows change, switch to a plain refresh into a **new** materialized view and rename it into place inside a short transaction; readers are blocked only for the rename.

---

# 🌍 Production Consideration

Oracle materialized view logs grow until every dependent view has refreshed. A fast-refresh view that is dropped or no longer refreshed can leave a log that grows forever and slows every write on the base table. Monitor log sizes and unregister unused views.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Complete refresh | ❌ | `REFRESH MATERIALIZED VIEW` | n/a | n/a | `DBMS_MVIEW.REFRESH(…,'C')` | n/a |
| Non-blocking refresh | ❌ | `CONCURRENTLY` (unique index) | n/a | n/a | Atomic refresh (default) | n/a |
| Incremental refresh | ❌ | Extension (`pg_ivm`) | n/a | Automatic | Fast refresh + MV logs | n/a |
| On commit | ❌ | ❌ | n/a | Always | `ON COMMIT` | n/a |
| Last refresh metadata | ❌ | ❌ | n/a | n/a | `USER_MVIEWS` | n/a |
| Scheduler | ❌ | `pg_cron` / external | Events | SQL Agent | `DBMS_SCHEDULER` | External |

> **Portability Tip:** A refresh procedure with a `RefreshLog` table is the portable core: the procedure can call `REFRESH MATERIALIZED VIEW`, `DBMS_MVIEW.REFRESH`, or rebuild a summary table, while monitoring stays identical.

---

# Common Mistakes

### Mistake 1

Running a plain PostgreSQL refresh on a view that dashboards read continuously.

---

### Mistake 2

Using `CONCURRENTLY` without the required unique index.

---

### Mistake 3

Defining an Oracle `REFRESH FAST` view without checking `EXPLAIN_MVIEW` capabilities.

---

### Mistake 4

Refreshing dependent materialized views in the wrong order.

---

# Best Practices

✔ Match the refresh method to the change rate and the freshness target.

✔ Use `CONCURRENTLY` for continuously read PostgreSQL views.

✔ Use fast refresh with MV logs on Oracle for large, slowly changing bases.

✔ Trigger refreshes from data loads where possible.

✔ Record and monitor refresh time, duration and status.

---

# Interview Questions

## Basic

1. What is the difference between complete and incremental refresh?
2. Why does a plain PostgreSQL refresh block readers?
3. What does `REFRESH … CONCURRENTLY` require?

## Intermediate

4. What is an Oracle materialized view log, and what does it cost?
5. Compare `ON DEMAND` and `ON COMMIT` refresh.
6. How do you find out why an Oracle view is not fast-refreshable?

## Advanced

7. Design incremental refresh for a daily sales summary on an engine without native support.
8. A nightly refresh has grown from 10 to 90 minutes over a year. How do you fix it?

---

# Hands-on Exercises

## Exercise 1

On PostgreSQL, refresh a materialized view with and without `CONCURRENTLY` while another session reads it.

---

## Exercise 2

On Oracle, create an MV log and a fast-refreshable aggregate view; insert orders and fast-refresh it.

---

## Exercise 3

Build a `RefreshLog` table and a refresh procedure that records start time, duration and status.

---

# Related Topics

- **17.09 — Materialized View Fundamentals**
- **17.12 — Indexing Materialized Views**
- **17.13 — Summary Tables and Reporting Patterns**
- **15.12 — Optimizing Writes (Batch INSERT, UPDATE and DELETE)**
- **15.13 — Concurrency, Locking and Query Performance**

---

# Summary

Materialized views are refreshed completely (rerun the query), concurrently (rerun and apply only the differences, without blocking readers) or incrementally (apply only base-table changes). PostgreSQL offers complete refresh, optionally `CONCURRENTLY` with a unique index; Oracle offers complete, fast and on-commit refresh driven by materialized view logs; SQL Server maintains indexed views on every write; MySQL and SQLite rely on summary tables with watermark-based refresh. Match the method to the change rate and freshness target, schedule refreshes in dependency order—ideally from the data load—and monitor last refresh time, duration and failures.
