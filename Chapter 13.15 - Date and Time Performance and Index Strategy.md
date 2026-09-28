---
title: "13.15 - Date and Time Performance and Index Strategy"
description: "Making date queries fast: sargable rewrites for YEAR, CAST to DATE, DATE_TRUNC, DATEDIFF and formatted-date predicates; composite indexes with equality columns before the date range; covering indexes for time-series reports; expression indexes and computed columns for part-based filters; storing derived business dates; BRIN indexes and clustered keys for append-only time data; table partitioning by date with partition pruning; rollup tables; and retention with partition drops."
chapter: 13
section: 13.15
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 30 min
lastUpdated: 2026-09-28
---

# 13.15 Date and Time Performance and Index Strategy

---

# Learning Objectives

After completing this section, you will be able to:

- Rewrite common non-sargable date predicates as ranges.
- Order composite index columns for date-range queries.
- Index date parts and derived dates when a range is impossible.
- Use BRIN indexes, clustering and partitioning for large time-series tables.
- Speed up recurring time-bucketed reports with rollup tables.

---

# Sargable Rewrites

| Non-sargable | Sargable rewrite |
|--------------|------------------|
| `YEAR(OrderDate) = 2026` | `OrderDate >= '2026-01-01' AND OrderDate < '2027-01-01'` |
| `YEAR(d) = 2026 AND MONTH(d) = 9` | `d >= '2026-09-01' AND d < '2026-10-01'` |
| `CAST(CreatedAt AS DATE) = '2026-09-28'` | `CreatedAt >= '2026-09-28' AND CreatedAt < '2026-09-29'` |
| `DATE_TRUNC('month', d) = '2026-09-01'` | `d >= '2026-09-01' AND d < '2026-10-01'` |
| `DATEDIFF(day, OrderDate, @today) <= 30` | `OrderDate >= DATEADD(day, -30, @today)` |
| `OrderDate + INTERVAL '30 days' < CURRENT_DATE` | `OrderDate < CURRENT_DATE - INTERVAL '30 days'` |
| `TO_CHAR(d, 'YYYY-MM') = '2026-09'` | `d >= '2026-09-01' AND d < '2026-10-01'` |
| `CreatedAt AT TIME ZONE 'Asia/Kolkata' >= '2026-09-28'` | `CreatedAt >= TIMESTAMP '2026-09-28' AT TIME ZONE 'Asia/Kolkata'` |
| `DATE(CreatedAt) BETWEEN :a AND :b` | `CreatedAt >= :a AND CreatedAt < :b + INTERVAL '1 day'` |

The pattern is always the same: move every function to the constant side and express the condition as a half-open range on the bare column.

---

# Composite Indexes: Equality First, Range Last

Most date queries also filter by something else:

```sql
SELECT OrderID, OrderDate, TotalAmount
FROM Orders
WHERE CustomerID = :c
  AND OrderDate >= :s AND OrderDate < :e;
```

```text
Index (CustomerID, OrderDate)  ✅  seek to CustomerID = c, then read the date range: contiguous
Index (OrderDate, CustomerID)  ⚠  seek to the date range, then check CustomerID on every entry in it
```

Put **equality** columns first and the **date range** column after them (Section 10.05). An index with the date first is right when queries filter on the date range alone, or with inequality or low-selectivity columns.

For reports that read only a few columns, make the index covering:

```sql
-- PostgreSQL / SQL Server
CREATE INDEX ix_orders_cust_date ON Orders (CustomerID, OrderDate) INCLUDE (TotalAmount, Status);
```

---

# Status Plus Date

"Open orders older than 7 days" is a classic queue query:

```sql
SELECT OrderID FROM Orders
WHERE Status = 'Pending' AND CreatedAt < NOW() - INTERVAL '7 days';
```

```sql
CREATE INDEX ix_orders_status_created ON Orders (Status, CreatedAt);

-- PostgreSQL / SQL Server: partial (filtered) index when pending orders are few
CREATE INDEX ix_orders_pending_created ON Orders (CreatedAt) WHERE Status = 'Pending';
```

The partial index contains only pending orders, stays small, and serves the query with a range seek.

---

# When a Range Is Impossible: Index the Expression

Some filters have no range form: "orders placed on Mondays", "orders in the 9 a.m. hour", "customers whose birthday is this month".

```sql
-- PostgreSQL: expression index (the expression must be IMMUTABLE)
CREATE INDEX ix_orders_isodow ON Orders ((EXTRACT(ISODOW FROM OrderDate)));

-- SQL Server: persisted computed column + index
ALTER TABLE Orders ADD OrderWeekday AS DATEPART(weekday, OrderDate);   -- depends on DATEFIRST: not indexable
ALTER TABLE Orders ADD OrderMonth   AS MONTH(OrderDate) PERSISTED;     -- deterministic: indexable
CREATE INDEX ix_orders_month ON Orders (OrderMonth);

-- MySQL 8.0: functional index
CREATE INDEX ix_customers_birth_month ON Customers ((MONTH(BirthDate)));

-- Oracle: function-based index
CREATE INDEX ix_orders_hour ON Orders (TO_NUMBER(TO_CHAR(CreatedAt, 'HH24')));
```

The query must use **exactly** the indexed expression. Only **deterministic** expressions can be indexed: `DATEPART(weekday, …)` depends on `DATEFIRST` and `EXTRACT(… FROM timestamptz)` depends on the session time zone, so neither is accepted. Convert explicitly (`EXTRACT(HOUR FROM CreatedAt AT TIME ZONE 'UTC')`) to make it deterministic.

---

# Store Derived Dates at Write Time

If reports constantly derive the business date from an instant in a time zone, store it:

```sql
ALTER TABLE Orders ADD BusinessDate DATE;   -- set by the application or a trigger on insert
CREATE INDEX ix_orders_business_date ON Orders (BusinessDate);
```

Now "orders on business day 2026-09-28 in Kolkata" is an equality seek on a 4-byte column instead of a per-row zone conversion. The same applies to fiscal period keys and week-start dates on very large fact tables.

---

# Large Append-Only Time Data

Event, log and sensor tables are inserted in time order and queried by time range. Physical order then matches the query pattern, which enables cheap indexes:

```sql
-- PostgreSQL: BRIN (block range index) — tiny, stores min/max per block range
CREATE INDEX ix_events_created_brin ON Events USING brin (CreatedAt);
```

A BRIN index on a billion-row table can be a few megabytes (a B-tree would be tens of gigabytes), and it skips every block range whose min/max does not overlap the requested dates. It works only while physical order follows the date (Section 10.09).

On SQL Server and MySQL InnoDB, clustering the table on (date, id) keeps date ranges physically contiguous; on SQL Server, a clustered columnstore index is common for large time-series analytics.

---

# Partitioning by Date

Partitioning splits a table into child tables by date range:

```sql
-- PostgreSQL declarative partitioning
CREATE TABLE Events (
    EventID   BIGINT      NOT NULL,
    CreatedAt TIMESTAMPTZ NOT NULL,
    Payload   JSONB
) PARTITION BY RANGE (CreatedAt);

CREATE TABLE Events_2026_09 PARTITION OF Events
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');      -- half-open, like every range
CREATE TABLE Events_2026_10 PARTITION OF Events
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
```

Benefits:

- **Partition pruning**: `WHERE CreatedAt >= '2026-09-28' AND CreatedAt < '2026-09-29'` reads only `Events_2026_09`. Pruning needs the same sargable predicate on the partition key—`WHERE DATE(CreatedAt) = …` defeats it just as it defeats an index.
- **Retention**: dropping or detaching an old partition removes a month of data instantly, without a massive `DELETE`.
- **Maintenance**: statistics, vacuum and index rebuilds run per partition.

MySQL (`PARTITION BY RANGE COLUMNS`), SQL Server (partition functions and schemes) and Oracle (interval partitioning, which creates partitions automatically) offer the same idea.

---

# Rollup Tables

Dashboards that show "revenue per day for the last two years" should not aggregate the raw orders on every page view:

```sql
CREATE TABLE DailyRevenue (
    SalesDate DATE PRIMARY KEY,
    Orders    INT            NOT NULL,
    Revenue   DECIMAL(14,2)  NOT NULL
);

-- refreshed incrementally, e.g. nightly for the previous day
INSERT INTO DailyRevenue (SalesDate, Orders, Revenue)
SELECT OrderDate, COUNT(*), SUM(TotalAmount)
FROM Orders
WHERE OrderDate >= :yesterday AND OrderDate < :today
GROUP BY OrderDate;
```

Monthly and yearly figures then aggregate 730 rows instead of millions. PostgreSQL materialized views, SQL Server indexed views and Oracle materialized views with fast refresh automate parts of this.

---

# Visual Representation

```text
  query shape                                   index / structure
  ────────────────────────────────────────────  ─────────────────────────────────────────
  d >= :s AND d < :e                            B-tree (d)
  CustomerID = :c AND d range                   B-tree (CustomerID, d) [INCLUDE …]
  Status = 'Pending' AND CreatedAt < …          partial index (CreatedAt) WHERE Status = 'Pending'
  weekday / hour / birthday month               expression index or indexed computed column
  business date in a zone                       stored BusinessDate + B-tree
  append-only, billions of rows, time ranges    BRIN / clustered key / partitions by month
  dashboards over long periods                  rollup table or materialized view
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← partition pruning removes partitions outside the date range
2. JOIN        ← join rollups to the calendar instead of raw facts
3. WHERE       ← half-open range on the bare column: index seek, BRIN skip, pruning
4. GROUP BY    ← stream aggregate when rows arrive in date order from the index
5. HAVING
6. WINDOW
7. SELECT
8. DISTINCT
9. ORDER BY    ← ORDER BY date matches index order: no sort
10. LIMIT / FETCH / TOP   ← "latest 20 events" reads 20 index entries backwards
```

---

# How the DBMS Executes This

```text
SELECT * FROM Events WHERE CreatedAt >= '2026-09-28' AND CreatedAt < '2026-09-29'
ORDER BY CreatedAt DESC LIMIT 20;

Partitioned table Events
  → pruning: only Events_2026_09 qualifies
    → Index Scan Backward on Events_2026_09 (CreatedAt)
        Index Cond: CreatedAt >= … AND CreatedAt < …
      → Limit 20       (stops after 20 rows; no sort)
```

---

# 🏗️ Architecture Insight

Time-series data has a lifecycle: hot (recent, frequently queried, updated), warm (read for reports) and cold (kept for compliance). Partitioning by date lets each stage have its own storage, indexes and retention, and makes deleting expired data a metadata operation rather than a multi-hour `DELETE`.

---

# ⚡ Performance Tip

"Latest N" queries (`ORDER BY CreatedAt DESC LIMIT 20`) are cheap with an index on `CreatedAt` (or `(UserID, CreatedAt)` for per-user feeds): the engine reads the index backwards and stops after N rows. Without such an index, it sorts the whole table.

---

# 🔒 Security Note

Retention by partition drop is also a privacy tool: data that must be deleted after a legal period can be removed reliably and completely by dropping the expired partition, instead of relying on a `DELETE` that might be interrupted or miss rows.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Expression index | ❌ | ✅ (immutable) | ✅ (8.0.13+) | Computed column | Function-based | ✅ (deterministic) |
| Partial index | ❌ | ✅ | ❌ | Filtered index | ❌ (function trick) | ✅ |
| BRIN / block skipping | ❌ | BRIN | ❌ | Columnstore segment elimination | Zone maps (Exadata), storage indexes | ❌ |
| Range partitioning by date | ❌ | ✅ | ✅ | ✅ | ✅ + interval | ❌ |
| Materialized views | ❌ | ✅ (manual refresh) | ❌ | Indexed views | ✅ (fast refresh) | ❌ |

> **Portability Tip:** Sargable rewrites and composite B-tree indexes work on every engine. BRIN, partitioning syntax and materialized views are engine-specific tools layered on top.

---

# Common Mistakes

### Mistake 1

Wrapping the date column in a function in `WHERE`.

---

### Mistake 2

Putting the date range column before equality columns in a composite index.

---

### Mistake 3

Trying to index a non-deterministic date expression.

---

### Mistake 4

Using a non-sargable predicate on a partition key and losing pruning.

---

### Mistake 5

Deleting old time-series data row by row instead of dropping partitions.

---

# Best Practices

✔ Rewrite every date predicate as a half-open range on the bare column.

✔ Index equality columns first, the date range last.

✔ Use partial indexes for queue-like "status + date" queries.

✔ Index deterministic expressions or store derived dates when ranges are impossible.

✔ Partition large time-series tables by date, and pre-aggregate for dashboards.

---

# Interview Questions

## Basic

1. How do you rewrite `YEAR(OrderDate) = 2026` to use an index?
2. What order should columns have in an index for `CustomerID = ? AND OrderDate range`?
3. What is partition pruning?

## Intermediate

4. How do you make "orders on Mondays" fast?
5. Why can't `DATEPART(weekday, d)` be indexed on SQL Server?
6. What is a BRIN index good for?

## Advanced

7. How would you design storage for a billion-row event table queried by time range?
8. When would you store a derived business date instead of computing it?

---

# Hands-on Exercises

## Exercise 1

Find five non-sargable date predicates in your codebase and rewrite them.

---

## Exercise 2

Create `(CustomerID, OrderDate)` and `(OrderDate, CustomerID)` indexes and compare plans for a per-customer date-range query.

---

## Exercise 3

Partition an events table by month and verify pruning with `EXPLAIN` for a one-day query.

---

# Related Topics

- **13.10 — Filtering Date Ranges (Half-Open Intervals)**
- **13.14 — Execution Flow of Date and Time Functions**
- **06.12 — SARGability and Index-Friendly Predicates**
- **10.05 — Composite Indexes and Column Order**
- **10.09 — Index Types (Hash, Bitmap, GIN, GiST, BRIN and Columnstore)**
- **10.10 — Partial and Expression Indexes**
- **12.15 — Scalar Function Performance and Index Strategy**
- **15.xx — Query Optimization**

---

# Summary

Fast date queries start with sargable predicates: move every function to the constant side and filter with half-open ranges on the bare column. Composite indexes put equality columns before the date range, partial indexes serve status-plus-date queues, and expression indexes or stored derived dates handle filters that have no range form—provided the expression is deterministic. Large append-only time data benefits from BRIN indexes, clustering, and partitioning by date for pruning and instant retention, while rollup tables keep long-period dashboards from re-aggregating raw facts.
