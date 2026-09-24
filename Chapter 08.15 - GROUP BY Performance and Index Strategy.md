---
title: "08.15 - GROUP BY Performance and Index Strategy"
description: "Making grouped queries fast: filtering before grouping, indexes whose leading columns match GROUP BY, covering indexes for aggregates, MIN/MAX index shortcuts, aggregating before joining, narrow grouping keys, and summary tables and materialized views for repeated aggregation."
chapter: 8
section: 8.15
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 40 min
lastUpdated: 2026-09-24
---

# 08.15 GROUP BY Performance and Index Strategy

---

# Learning Objectives

After completing this section, you will be able to:

- Reduce the rows that reach `GROUP BY`.
- Design an index that supplies rows in grouping order.
- Design covering indexes for grouped queries.
- Use indexes to answer `MIN` and `MAX` instantly.
- Order index columns for queries that filter and group.
- Decide when to precompute aggregates in summary tables or materialized views.

---

# The Cost Model of Aggregation

```text
cost ≈ rows read
     + rows aggregated        (hash or sort work)
     + number of groups       (memory; output size)
     + joins around the aggregate
```

Every strategy in this section reduces one of those terms. The order of the list is roughly the order of payoff: reading fewer rows almost always matters most.

---

# Rule 1: Filter Before You Group

A selective, index-friendly `WHERE` reduces every later term.

```sql
-- ❌ Function on the column: full scan, then group
SELECT CustomerID, SUM(TotalAmount)
FROM Orders
WHERE EXTRACT(YEAR FROM OrderDate) = 2026
GROUP BY CustomerID;

-- ✅ Range on the column: index seek, then group
SELECT CustomerID, SUM(TotalAmount)
FROM Orders
WHERE OrderDate >= DATE '2026-01-01'
  AND OrderDate <  DATE '2027-01-01'
GROUP BY CustomerID;
```

Everything from Section 06.12 on SARGable predicates applies directly: the fastest aggregation is the one over rows that were never read.

---

# Rule 2: Index in Grouping Order

An index whose **leading columns** are the grouping columns delivers rows already grouped, so the engine can use a stream aggregate with no sort and no hash table:

```sql
CREATE INDEX ix_orders_customer ON Orders (CustomerID);

SELECT CustomerID, COUNT(*)
FROM Orders
GROUP BY CustomerID;
```

```text
Index (CustomerID)
1 → 101, 102
2 → 103, 104         → Stream aggregate reads in order:
3 → 105                 no sort, one group in memory at a time
```

Column order in the index must match the `GROUP BY` columns as a prefix, in any order the engine can use—`GROUP BY a, b` can use an index on `(a, b)` or `(b, a)`, since grouping (unlike sorting) does not care which comes first. An index on `(b)` alone does not help `GROUP BY a`.

---

# Rule 3: Cover the Query

If the index also contains every column the query reads, the table is never touched—an **index-only scan**:

```sql
-- Query
SELECT CustomerID, COUNT(*), SUM(TotalAmount)
FROM Orders
GROUP BY CustomerID;

-- Covering index: grouping column first, measures after
CREATE INDEX ix_orders_customer_amount
    ON Orders (CustomerID, TotalAmount);

-- SQL Server / PostgreSQL 11+: measures as non-key INCLUDE columns
CREATE INDEX ix_orders_customer_inc
    ON Orders (CustomerID) INCLUDE (TotalAmount);
```

```text
Without covering index          With covering index
index → table lookup per row    index only
1,000,000 random reads          one ordered pass over a narrow index
```

---

# Rule 4: Equality Filters First, Then Grouping Columns

When a query filters **and** groups, put columns tested with equality first, then the grouping columns, then range-filtered or measured columns:

```sql
SELECT CustomerID, SUM(TotalAmount)
FROM Orders
WHERE Status = 'Shipped'
  AND OrderDate >= DATE '2026-01-01'
GROUP BY CustomerID;

-- ✅ equality → grouping → range/measure
CREATE INDEX ix_orders_status_customer
    ON Orders (Status, CustomerID, OrderDate, TotalAmount);
```

```text
Index (Status, CustomerID, OrderDate, TotalAmount)

Status = 'Shipped'  ─┬─ Customer 1 ─ dates… amounts…   ← already grouped
                     ├─ Customer 2 ─ dates… amounts…
                     └─ Customer 3 ─ …
```

Within `Status = 'Shipped'`, entries are ordered by `CustomerID`, so the stream aggregate still works; the `OrderDate` range is checked on the index entries, and `TotalAmount` is read from the index.

Had the date range come before `CustomerID` in the index, rows would arrive in date order, not customer order—usable for filtering, useless for streaming the aggregation.

This is a trade-off, not a rule: if the date range is extremely selective and the grouping is small, `(Status, OrderDate)` with a hash aggregate may still win. Compare plans.

---

# Rule 5: MIN and MAX from an Index

Without `GROUP BY`, `MIN` and `MAX` on an indexed column read a single index entry:

```sql
SELECT MAX(OrderDate) FROM Orders;          -- one seek to the end of the index
```

With `GROUP BY`, an index on `(group, value)` lets each group's `MIN` or `MAX` be read from the first or last entry of that group:

```sql
CREATE INDEX ix_orders_customer_date ON Orders (CustomerID, OrderDate);

SELECT CustomerID, MAX(OrderDate) AS LastOrder
FROM Orders
GROUP BY CustomerID;
```

MySQL applies this as a loose index scan, skipping from group to group. Other engines still read every entry but avoid sorting and table access. For "latest row per group" with only a few groups, a lateral query that seeks once per group is fastest of all:

```sql
-- PostgreSQL
SELECT c.CustomerID, last.OrderDate
FROM Customers AS c
CROSS JOIN LATERAL (
    SELECT o.OrderDate
    FROM Orders AS o
    WHERE o.CustomerID = c.CustomerID
    ORDER BY o.OrderDate DESC
    FETCH FIRST 1 ROW ONLY
) AS last;
```

---

# Rule 6: Aggregate Before Joining

Joining a large fact table to dimensions and **then** grouping processes every joined row. Grouping the fact table by its foreign key first shrinks the join input to one row per group:

```sql
-- ❌ Join 10M order rows to Customers, then group
SELECT c.Country, SUM(o.TotalAmount)
FROM Orders AS o
INNER JOIN Customers AS c ON c.CustomerID = o.CustomerID
GROUP BY c.Country;

-- ✅ Group 10M rows to 50K customers, join 50K rows, group again
SELECT c.Country, SUM(t.Revenue)
FROM (
    SELECT CustomerID, SUM(TotalAmount) AS Revenue
    FROM Orders
    GROUP BY CustomerID
) AS t
INNER JOIN Customers AS c ON c.CustomerID = t.CustomerID
GROUP BY c.Country;
```

Optimizers sometimes perform this rewrite themselves (eager aggregation, Section 08.11). Writing it explicitly guarantees it, and the same pattern is required for correctness when joins fan out.

---

# Rule 7: Group by Narrow Keys

The grouping key is hashed or sorted for every row. Narrow integer keys are cheapest:

| Grouping key | Bytes per row hashed |
|--------------|---------------------|
| `CustomerID INT` | 4 |
| `CustomerName VARCHAR(100), Country VARCHAR(50)` | up to ~150, plus collation-aware comparison |
| `DATE_TRUNC('day', CreatedAt)` | 8, plus a function call per row |

Group by the key and join descriptive columns afterwards, or rely on functional dependency (Section 08.07). For expression keys used in many queries, a stored computed column (with an index) removes the per-row function call and can supply grouping order.

---

# Rule 8: Precompute Repeated Aggregations

When the same aggregation runs constantly over data that changes slowly, compute it once:

| Technique | Freshness | Maintenance |
|-----------|-----------|-------------|
| Materialized view (PostgreSQL, Oracle) | As of last refresh | `REFRESH MATERIALIZED VIEW` on a schedule; Oracle supports fast (incremental) refresh |
| Indexed view (SQL Server) | Always current | Maintained on every write; requires `COUNT_BIG(*)` and deterministic expressions |
| Summary table updated by triggers or application | Current | Custom code; risk of drift |
| Summary table rebuilt by a batch job | As of last run | Simple; period-end reports |

```sql
-- PostgreSQL
CREATE MATERIALIZED VIEW DailyRevenue AS
SELECT
    DATE_TRUNC('day', OrderDate) AS Day,
    COUNT(*)                     AS Orders,
    SUM(TotalAmount)             AS Revenue
FROM Orders
GROUP BY DATE_TRUNC('day', OrderDate);

CREATE UNIQUE INDEX ON DailyRevenue (Day);

REFRESH MATERIALIZED VIEW CONCURRENTLY DailyRevenue;
```

Store **additive** measures—`SUM` and `COUNT`—in summaries, never only averages: an average of daily averages is not the monthly average, but monthly `SUM(Revenue) / SUM(Orders)` is.

---

# Visual Representation

```text
Index design for:  WHERE Status = ?  AND OrderDate >= ?  GROUP BY CustomerID
                   SELECT SUM(TotalAmount)

      (Status,      CustomerID,      OrderDate,      TotalAmount)
       equality     grouping order   range filter    covered measure
         seek        stream agg      checked in      no table access
                                     index
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN        ← aggregate before this step to shrink join input
3. WHERE       ← filter here, with SARGable predicates
4. GROUP BY    ← index order lets this step stream instead of hash
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY    ← free when the aggregate already produced key order
9. LIMIT / FETCH / TOP
```

Each performance rule targets one step: `WHERE` reads less, index order removes the sort or hash, pre-aggregation shrinks the join.

---

# How the DBMS Executes This

```text
Before: no index

Sort (Revenue DESC)
  └─ HashAggregate (CustomerID)          48,000 groups
       └─ Seq Scan Orders                10,000,000 rows
            Filter: Status='Shipped' AND OrderDate >= …

After: index (Status, CustomerID, OrderDate, TotalAmount)

Sort (Revenue DESC)
  └─ GroupAggregate (CustomerID)
       └─ Index Only Scan ix_orders_status_customer
            Index Cond: Status='Shipped' AND OrderDate >= …
            Heap Fetches: 0              ← fully covered
```

---

# 🔬 Engine Deep Dive

PostgreSQL's index-only scans depend on the visibility map: pages modified since the last `VACUUM` require a heap visit to check row visibility ("Heap Fetches" in the plan). A covering index on a table with heavy updates may still read the table for many rows. SQL Server and Oracle index-only access does not have this dependency, because row versions are handled differently.

---

# 🏗️ Architecture Insight

Indexes that serve grouped reports slow down every insert and update on the table. On busy OLTP tables, the better architecture is often to keep transactional indexes minimal and serve aggregation from a replica, a materialized summary or an analytical store—so that reporting load and write load do not compete for the same structures.

---

# ⚡ Performance Tip

Before adding an index for a grouped query, check the plan's biggest cost: if the time is spent reading rows the `WHERE` could have excluded, fix the predicate first; if it is spent hashing or sorting, an index in grouping order helps; if it is spent in a join after the aggregate, pre-aggregate.

---

# 🌍 Production Consideration

Materialized summaries introduce staleness. Every report reading one should show "as of" its last refresh, and refresh jobs need monitoring: a silently failing refresh produces dashboards that are confidently wrong. `REFRESH ... CONCURRENTLY` (PostgreSQL) keeps the old contents readable during a refresh but requires a unique index on the view.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `INCLUDE` columns in index | ❌ | ✅ (11+) | ❌ | ✅ | ❌ | ❌ |
| Index-only scan for aggregates | n/a | ✅ | ✅ | ✅ | ✅ | ✅ (covering index) |
| Materialized views | ❌ | ✅ (manual refresh) | ❌ | Indexed views | ✅ (incl. fast refresh) | ❌ |
| Automatic query rewrite to summaries | ❌ | ❌ | ❌ | ✅ (Enterprise) | ✅ (query rewrite) | ❌ |
| Expression / computed-column index | ❌ | ✅ | ✅ (8.0.13+) | ✅ | ✅ | ✅ |

> **Portability Tip:** A composite index with the measure columns at the end covers the query on every engine; `INCLUDE` is a refinement that keeps non-key columns out of the index's sort order where supported.

---

# Common Mistakes

### Mistake 1

Filtering with a function on the column (`WHERE YEAR(OrderDate) = 2026`) in a grouped report.

---

### Mistake 2

Indexing the grouping column but not the measure, forcing a table lookup per row.

---

### Mistake 3

Putting the range-filtered column before the grouping column in the index.

---

### Mistake 4

Joining large fact tables to dimensions before aggregating.

---

### Mistake 5

Storing only averages in summary tables, making correct roll-ups impossible.

---

# Best Practices

✔ Filter with SARGable predicates before grouping.

✔ Index equality columns, then grouping columns, then range and measure columns.

✔ Cover frequent grouped queries; check for heap or table lookups.

✔ Aggregate facts before joining dimensions.

✔ Precompute repeated aggregations with additive measures and a visible "as of".

---

# Interview Questions

## Basic

1. Why does a selective `WHERE` speed up a grouped query?
2. What is a covering index?
3. Why is `SELECT MAX(OrderDate) FROM Orders` fast with an index?

## Intermediate

4. Which index supports `WHERE Status = ? GROUP BY CustomerID` with `SUM(TotalAmount)`?
5. Why does grouping before joining reduce work?
6. What is the difference between a materialized view and an indexed view?

## Advanced

7. Why can an index on `(Status, OrderDate, CustomerID)` be worse than `(Status, CustomerID, OrderDate)` for a grouped query?
8. Why should summary tables store sums and counts rather than averages?
9. Why might a PostgreSQL index-only scan still read the table?

---

# Hands-on Exercises

## Exercise 1

Rewrite a grouped query that filters with `EXTRACT(YEAR ...)` to use a date range, and compare the plans.

---

## Exercise 2

Design and create a covering index for revenue per customer of shipped orders since a given date.

---

## Exercise 3

Rewrite "revenue per country" to aggregate `Orders` by customer before joining `Customers`.

---

## Exercise 4

Create a materialized daily revenue summary and use it to compute monthly revenue correctly.

---

# Related Topics

- **08.14 — Execution Flow of GROUP BY (Hash and Stream Aggregation)**
- **08.11 — Aggregating Across JOINs (Fan-Out and Pre-Aggregation)**
- **06.12 — SARGability and Index-Friendly Predicates**
- **07.15 — JOIN Performance and Index Strategy**
- **10.xx — Indexes and Covering Indexes**
- **15.xx — Query Optimization**

---

# Summary

Grouped queries get faster by reading fewer rows, avoiding sorts and hash tables, and shrinking joins. Filter with SARGable predicates first; index equality columns, then grouping columns, then range and measure columns so the engine can stream the aggregate from a covering index; let indexes answer `MIN` and `MAX` directly; aggregate facts before joining dimensions; and group by narrow keys. When the same aggregation runs constantly, precompute it in a materialized view, indexed view or summary table that stores additive measures and shows how fresh it is.
