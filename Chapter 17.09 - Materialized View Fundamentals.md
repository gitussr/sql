---
title: "17.09 - Materialized View Fundamentals"
description: "What a materialized view is and when to use one: storing a query's result, the freshness-versus-speed trade-off, creating materialized views in PostgreSQL and Oracle, SQL Server's indexed-view equivalent, MySQL and SQLite alternatives with summary tables, WITH NO DATA and build options, storage and write costs, and a decision guide for choosing between a view, a materialized view, a summary table and a cache."
chapter: 17
section: 17.09
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 25 min
lastUpdated: 2026-10-09
---

# 17.09 Materialized View Fundamentals

---

# Learning Objectives

After completing this section, you will be able to:

- Explain what a materialized view stores and how it differs from a view.
- Create materialized views on PostgreSQL and Oracle, and their equivalents elsewhere.
- Reason about freshness, read speed, refresh cost and storage together.
- Choose between a view, a materialized view, a summary table and an application cache.

---

# What a Materialized View Stores

```sql
CREATE MATERIALIZED VIEW CustomerRevenue AS
SELECT c.CustomerID, c.CustomerName, c.Country,
       COUNT(o.OrderID)   AS OrderCount,
       SUM(o.TotalAmount) AS Revenue
FROM Customers c
JOIN Orders o ON o.CustomerID = c.CustomerID
GROUP BY c.CustomerID, c.CustomerName, c.Country;
```

```text
               VIEW                                 MATERIALIZED VIEW
catalog:       definition                           definition + refresh metadata
storage:       none                                 ~1,000,000 rows (one per customer)
read:          join 10M orders + aggregate          read stored rows (+ indexes)
               every time (seconds)                 (milliseconds)
freshness:     always current                       as of the last refresh
```

The query runs once at creation (and at every refresh); reads see that stored result.

---

# The Trade-Off

```text
                 fresh ◀──────────────────────────────────────────▶ fast
plain view          materialized view, incremental/on commit       materialized view, nightly
(always current,    (seconds behind, extra write cost)             (hours behind, cheap reads,
 full query cost)                                                    big refresh job)
```

Every materialized view needs answers to four questions:

| Question | Example answer |
|----------|----------------|
| How stale may it be? | "Up to 15 minutes" |
| How expensive is the query? | 40 s, reads 10M rows |
| How often is it read? | 50,000 times a day |
| How often do base tables change? | 200,000 order inserts a day |

A 40-second query read 50,000 times a day that may be 15 minutes stale is an ideal candidate. A cheap query read rarely is not.

---

# Creating Materialized Views

```sql
-- PostgreSQL
CREATE MATERIALIZED VIEW CustomerRevenue AS
SELECT … ;                                  -- populated immediately
CREATE MATERIALIZED VIEW CustomerRevenue AS
SELECT …
WITH NO DATA;                               -- empty and unreadable until the first REFRESH

-- Oracle
CREATE MATERIALIZED VIEW CustomerRevenue
BUILD IMMEDIATE                             -- or BUILD DEFERRED
REFRESH COMPLETE ON DEMAND                  -- refresh method and timing (Section 17.10)
ENABLE QUERY REWRITE                        -- let the optimizer use it automatically (Section 17.11)
AS
SELECT … ;
```

```sql
-- SQL Server: an indexed view is the materialized form (Section 17.11)
CREATE VIEW dbo.CustomerRevenue WITH SCHEMABINDING AS
SELECT o.CustomerID, COUNT_BIG(*) AS OrderCount, SUM(o.TotalAmount) AS Revenue
FROM dbo.Orders o
GROUP BY o.CustomerID;
GO
CREATE UNIQUE CLUSTERED INDEX ux_CustomerRevenue ON dbo.CustomerRevenue (CustomerID);
```

```sql
-- MySQL / SQLite: no materialized views — build a summary table (Section 17.13)
CREATE TABLE CustomerRevenue AS
SELECT o.CustomerID, COUNT(*) AS OrderCount, SUM(o.TotalAmount) AS Revenue
FROM Orders o
GROUP BY o.CustomerID;
```

| Engine | What you get | Maintenance |
|--------|--------------|-------------|
| PostgreSQL | `MATERIALIZED VIEW` | Manual `REFRESH` (full), optionally `CONCURRENTLY` |
| Oracle | `MATERIALIZED VIEW` | Complete, fast (incremental) or on-commit refresh; query rewrite |
| SQL Server | Indexed view | Maintained **synchronously** by every write; always fresh |
| MySQL | — | Summary tables + events/triggers/jobs |
| SQLite | — | Summary tables + triggers |

---

# Using a Materialized View

A materialized view is read like a table:

```sql
SELECT CustomerName, Revenue
FROM CustomerRevenue
WHERE Country = 'IN'
ORDER BY Revenue DESC
FETCH FIRST 20 ROWS ONLY;
```

It can be indexed (Section 17.12), joined, filtered and used in other views. It cannot be written to directly (except Oracle's updatable materialized views used in replication).

---

# Costs You Pay

```text
storage       a full copy of the result (plus indexes)
refresh       CPU and I/O to recompute; locks while refreshing (PostgreSQL non-concurrent: blocks reads)
write path    incremental refresh needs change logs on base tables → every INSERT/UPDATE/DELETE writes more
              SQL Server indexed views: every base-table write also updates the view, synchronously
staleness     readers can see old results; must be visible to users ("data as of 06:00")
operations    schedules, failures, monitoring, refresh windows that grow with the data
```

---

# Choosing the Right Tool

| Need | Choose |
|------|--------|
| Name a rule; data must be current; query is fast enough | **View** |
| Expensive query, read often, staleness acceptable | **Materialized view** |
| Expensive aggregate, must be current, write rate moderate (SQL Server) | **Indexed view** |
| Engine without MVs, or custom incremental logic, or history must be kept | **Summary table** (17.13) |
| Per-user results, very high read rate, application-owned | **Application cache** (Redis etc.) |
| Expensive query run once inside one statement | **CTE / temporary table** |

---

# Visual Representation

```text
BASE TABLES ──(query runs at REFRESH time)──▶ MATERIALIZED VIEW (stored rows + indexes)
   │  changes keep happening                         │
   │                                                 ▼
   │                                         readers: fast, but as of last refresh
   └──(change logs, optional)──▶ incremental refresh applies only the deltas
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← at query time: the stored rows are a table; at refresh time: the base tables
2. JOIN        ← joins inside the definition ran at refresh time
3. WHERE       ← outer filters apply to stored rows and can use the MV's indexes
4. GROUP BY    ← aggregation already done at refresh time (that is the point)
5. HAVING
6. WINDOW
7. SELECT
8. DISTINCT
9. ORDER BY    ← an index on the MV can supply the order
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
CREATE MATERIALIZED VIEW:  store definition → run query → write result into new storage → mark populated
SELECT FROM mv:            plan a scan/seek on the MV's storage, like any table (no base-table access)
REFRESH (complete):        rerun the query → replace the stored rows (swap or truncate+insert)
REFRESH (incremental):     read change logs since last refresh → apply deltas to stored rows
```

---

# 🏗️ Architecture Insight

A materialized view is a **derived copy** with a declared source. That declaration is its advantage over a hand-built table: the engine knows exactly how the copy was produced, can rebuild it at any time, and (on Oracle and SQL Server) can even use it to answer queries that never mention it.

---

# ⚡ Performance Tip

Materialize the expensive, stable part of a query, not the whole report. Daily totals per customer can serve the monthly report, the yearly report and the customer page; a materialized copy of one specific report serves only that report.

---

# 🌍 Production Consideration

Display freshness to users. A "data as of 06:00 IST" label on a dashboard turns a confusing discrepancy into an expected one, and it requires storing the last successful refresh time (Section 17.10).

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Materialized views | ❌ | ✅ (9.3+) | ❌ | Indexed views | ✅ | ❌ |
| Build deferred | ❌ | `WITH NO DATA` | n/a | n/a | `BUILD DEFERRED` | n/a |
| Automatic freshness | ❌ | ❌ | n/a | ✅ (synchronous) | `ON COMMIT` | n/a |
| Indexable | ❌ | ✅ | n/a | ✅ (must have a unique clustered index) | ✅ | n/a |
| Used automatically for base-table queries | ❌ | ❌ | n/a | ✅ Enterprise | ✅ `QUERY REWRITE` | n/a |

> **Portability Tip:** Summary tables refreshed by a scheduled job work on every engine. Choose engine-native materialized views when you need their refresh or rewrite features, and keep the refresh logic in one place either way.

---

# Common Mistakes

### Mistake 1

Materializing a query that is already fast enough as a view.

---

### Mistake 2

Creating a materialized view with no refresh schedule.

---

### Mistake 3

Showing materialized results to users without saying how old they are.

---

### Mistake 4

Materializing one report instead of the reusable aggregate beneath many reports.

---

# Best Practices

✔ Write down the freshness requirement before creating a materialized view.

✔ Materialize expensive, frequently read, reusable results.

✔ Index materialized views for the queries that read them.

✔ Record and display the last refresh time.

✔ Prefer engine-native features when you need incremental refresh or query rewrite.

---

# Interview Questions

## Basic

1. What does a materialized view store that a view does not?
2. What is the main trade-off of a materialized view?
3. Which engines support materialized views natively?

## Intermediate

4. How does a SQL Server indexed view differ from a PostgreSQL materialized view?
5. What does `WITH NO DATA` do in PostgreSQL?
6. What costs does a materialized view add to the write path?

## Advanced

7. Given a query's cost, read rate, change rate and freshness requirement, decide whether to materialize it.
8. Why is materializing a reusable aggregate better than materializing a specific report?

---

# Hands-on Exercises

## Exercise 1

Create `CustomerRevenue` as a view and as a materialized view; compare the time of a top-20 query on each.

---

## Exercise 2

Insert new orders and show that the materialized view does not reflect them until refreshed.

---

## Exercise 3

On MySQL or SQLite, build the equivalent summary table and a script that rebuilds it.

---

# Related Topics

- **17.10 — Refreshing Materialized Views (Complete, Incremental and Concurrent)**
- **17.11 — Indexed Views and Automatic Query Rewrite**
- **17.13 — Summary Tables and Reporting Patterns**
- **14.13 — Materialization and Inlining (MATERIALIZED and NOT MATERIALIZED)**
- **15.11 — Optimizing Aggregation and Sorting**

---

# Summary

A materialized view stores the result of its query, so reads are as fast as reading a table, but results are only as fresh as the last refresh. PostgreSQL and Oracle provide `MATERIALIZED VIEW`, SQL Server provides synchronously maintained indexed views, and MySQL and SQLite rely on summary tables. Every materialized view costs storage, refresh work and sometimes extra write work, so it should be justified by an expensive, frequently read query whose staleness is acceptable—and it needs a refresh plan, indexes and visible freshness.
