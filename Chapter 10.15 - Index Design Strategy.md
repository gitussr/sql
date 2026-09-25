---
title: "10.15 - Index Design Strategy"
description: "A repeatable method for choosing indexes: workload analysis, the baseline indexes every schema needs, designing per query with the equality-sort-range rule, consolidating candidates into a minimal set, validating with plans, handling multi-tenant and time-series tables, and evolving indexes as the application changes."
chapter: 10
section: 10.15
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 35 min
lastUpdated: 2026-09-25
---

# 10.15 Index Design Strategy

---

# Learning Objectives

After completing this section, you will be able to:

- Gather the workload information that index design needs.
- Define the baseline indexes every schema should have.
- Design an ideal index for a single query step by step.
- Consolidate many candidate indexes into a small set.
- Validate a design with execution plans and measurements.
- Apply patterns for multi-tenant, time-series and queue tables.

---

# Index for Queries, Not Columns

The most common index design error is starting from columns ("`Status` is filtered a lot, let's index it"). Good design starts from **queries**: which statements run, how often, how fast they must be, and what they read.

```text
Workload  →  candidate index per important query  →  consolidate  →  validate  →  monitor
```

---

# Step 1: Know the Workload

Collect, per table:

| Information | Source |
|-------------|--------|
| Most frequent queries | `pg_stat_statements`, Query Store, Performance Schema, AWR |
| Slowest queries (total time) | Same sources, ordered by total execution time |
| Latency requirements | Product / API SLOs |
| Write rate (inserts, updates, deletes per second) | Table statistics |
| Table size and growth | Catalog views |
| Data distribution and skew | Statistics, `GROUP BY … COUNT(*)` |

Prioritise by **total time** (frequency × duration), not by the slowest single execution: a 5 ms query run 10 million times a day matters more than a 20 s report run once.

---

# Step 2: The Baseline

Every schema should start with:

```text
1. Primary key on every table                                (automatic index)
2. Unique constraints on every natural key                   (automatic index)
3. An index on every foreign key column used in joins,
   or whose parent rows are deleted/updated                  (manual on most engines)
```

The third point also matters for writes: deleting a `Customers` row checks `Orders` for referencing rows; without an index on `Orders.CustomerID`, every such delete scans `Orders` (and may lock it).

A foreign-key index is often better as the **leading column of a composite index** designed for a real query (`(CustomerID, OrderDate)`), which serves both purposes.

---

# Step 3: Design the Ideal Index for One Query

Use the **equality → sort → range** rule (sometimes stated as ESR):

```text
1. Equality columns       (=, IN with one value, IS NULL)     → first, any order
2. Sort / group columns   (ORDER BY, GROUP BY)                → next, in query order and direction
3. Range column           (<, >, BETWEEN, LIKE 'x%')          → after that (only one is seekable)
4. Remaining filter columns                                    → key tail or INCLUDE (residual)
5. Returned columns (for covering, if the query is hot)       → INCLUDE / trailing key
```

Example:

```sql
SELECT OrderID, OrderDate, TotalAmount
FROM Orders
WHERE CustomerID = ?
  AND Status = 'Shipped'
  AND TotalAmount > 100
ORDER BY OrderDate DESC
FETCH FIRST 20 ROWS ONLY;
```

```text
Equality:  CustomerID, Status
Sort:      OrderDate DESC
Range:     TotalAmount > 100 (after the sort column: filtered, not seeked)
Returned:  OrderID (clustering key or trailing), TotalAmount

Ideal:  (CustomerID, Status, OrderDate DESC) INCLUDE (TotalAmount)
```

Why sort before range? Putting `TotalAmount` before `OrderDate` would let the range narrow the seek, but the rows would no longer come out in date order—every match would have to be read and sorted. For top-N queries, preserving order is usually worth more. For queries that return all matching rows, a range before sort can be better; compare both plans.

---

# Step 4: Consolidate

Per-query ideal indexes overlap. Merge them:

```text
Candidates for Orders
  Q1  (CustomerID, OrderDate DESC)            INCLUDE (TotalAmount)
  Q2  (CustomerID, Status, OrderDate DESC)    INCLUDE (TotalAmount)
  Q3  (CustomerID)                                                     ← FK / join
  Q4  (Status, OrderDate)                                              ← queue screen
  Q5  (OrderDate)                                                      ← daily report

Consolidated
  IX_Orders_Cust_Date     (CustomerID, OrderDate DESC) INCLUDE (Status, TotalAmount)
                          serves Q1, Q3, and Q2 (Status filtered in-index, few rows per customer)
  IX_Orders_Pending_Date  (OrderDate) WHERE Status = 'Pending'        serves Q4 (partial)
  IX_Orders_Date          (OrderDate)                                  serves Q5
```

Consolidation rules:

- An index that is a leading prefix of another is redundant (unless unique or much narrower).
- Two indexes sharing leading equality columns can often become one, at the cost of a residual filter for one query—acceptable when each key value has few rows.
- Replace per-query `INCLUDE` lists with one union list, dropping rarely needed wide columns.
- Prefer a partial index for selective, fixed-value subsets.

---

# Step 5: Validate

```text
For each important query:
  □ Plan uses the intended index (seek, not scan)
  □ No Sort under Limit/Top when the index should provide order
  □ Lookups acceptable (or zero for covered queries)
  □ Estimated ≈ actual rows
  □ Latency meets its target with production-sized data

For each table:
  □ Insert/update latency and log volume acceptable
  □ Total index size acceptable relative to memory
```

Validate on a copy of production data or a realistic generated data set—plans on a 1 000-row development table say nothing about production.

---

# Step 6: Monitor and Evolve

Indexes decay as applications change: new features add queries, old ones disappear. Schedule the review from Section 10.14 (unused, duplicate, missing), and treat each index change as a migration with a stated purpose.

---

# Pattern: Multi-Tenant Tables

When every query filters by tenant, the tenant column leads every index:

```sql
CREATE INDEX IX_Orders_Tenant_Customer_Date ON Orders (TenantID, CustomerID, OrderDate DESC);
CREATE UNIQUE INDEX UX_Customers_Tenant_Email ON Customers (TenantID, LOWER(Email));
```

- Uniqueness is usually per tenant: `(TenantID, Email)`, not `(Email)`.
- The primary key may also start with `TenantID` on clustered engines, keeping each tenant's rows together.
- Very large tenants skew statistics (Section 10.12); consider partitioning by tenant or separate plans.

---

# Pattern: Time-Series and Event Tables

```text
Characteristics:   append-only, increasing timestamp, queries by recent time range
Indexes:           (EntityID, CreatedAt DESC)  for "history of X"
                   BRIN (CreatedAt) or partitioning by time for "all events in range"
Avoid:             many secondary indexes (insert rate), random keys
Lifecycle:         drop or archive old partitions instead of DELETE
```

---

# Pattern: Queue Tables

```sql
-- Workers poll: next pending jobs in order
SELECT JobID FROM Jobs
WHERE Status = 'Pending'
ORDER BY Priority DESC, CreatedAt
FETCH FIRST 10 ROWS ONLY
FOR UPDATE SKIP LOCKED;

CREATE INDEX IX_Jobs_Pending ON Jobs (Priority DESC, CreatedAt) WHERE Status = 'Pending';
```

The partial index stays small no matter how many completed jobs accumulate.

---

# Pattern: Search Screens with Many Optional Filters

Screens with ten optional filters cannot have an index per combination. Strategies:

- Index the **mandatory** or most selective filters (date range, tenant, status) in one or two composites.
- Let rare filters be residual predicates.
- For truly ad-hoc filtering over large data, use a columnstore, bitmap-capable engine or search engine.
- Avoid "catch-all" `WHERE (@p IS NULL OR col = @p)` queries on SQL Server without `OPTION (RECOMPILE)`; build the SQL dynamically (with parameters) from the filters actually supplied.

---

# Visual Representation

```text
        workload                 candidates                 final set
┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│ Q1 10M/day  5 ms     │──→│ (Cust, Date) +Tot    │─┐ │ IX_Cust_Date +Status │
│ Q2  2M/day  8 ms     │──→│ (Cust, Status, Date) │─┤ │   +Tot               │
│ Q3 FK join           │──→│ (Cust)               │─┘ │ IX_Pending (partial) │
│ Q4 queue   50k/day   │──→│ (Status, Date)       │──→│ IX_Date              │
│ Q5 report  1/day     │──→│ (Date)               │──→│                      │
└──────────────────────┘   └──────────────────────┘   └──────────────────────┘
                                   5 indexes                3 indexes
```

---

# 📍 Execution Order Reminder

The ESR rule mirrors how an index is consumed along the logical order:

```text
1. FROM        ← table chosen; the index is entered
2. JOIN        ← join column = an equality column for the inner table
3. WHERE       ← equality columns fix the slice; range column narrows or filters
4. GROUP BY    ← grouping columns follow equality columns
5. HAVING
6. SELECT      ← INCLUDE columns cover the projection
7. DISTINCT
8. ORDER BY    ← sort columns follow equality columns
9. LIMIT / FETCH / TOP  ← index order lets the scan stop early
```

---

# How the DBMS Executes This

```text
Design-time tools

PostgreSQL   hypopg (hypothetical indexes) + EXPLAIN
SQL Server   Database Engine Tuning Advisor, missing-index DMVs, Query Store
MySQL        EXPLAIN / EXPLAIN ANALYZE, sys schema views
Oracle       SQL Access Advisor, SQL Tuning Advisor, invisible indexes
All          test copy of production data + actual plans
```

Advisors propose; they do not know your write costs, future queries or which suggestions overlap. Use them as input to the consolidation step, not as its output.

---

# 🔬 Engine Deep Dive

Oracle Autonomous Database and Azure SQL offer **automatic indexing**: the service creates candidate indexes invisibly, verifies them against real workload, makes the beneficial ones visible and drops those that are not used. It is a mechanised version of this section's loop—workload, candidates, validation, monitoring—and a useful reference for the discipline it requires when done by hand.

---

# 🏗️ Architecture Insight

Index design is where application design and database design meet. The access patterns—"customer's order history", "pending jobs", "search by e-mail"—are product features. Documenting them next to the schema, with the index that serves each, keeps the physical design aligned with the product as both change.

---

# ⚡ Performance Tip

Start from the top 10 queries by total execution time. In most OLTP systems they account for the majority of database load, and three or four well-designed composite indexes fix most of them.

---

# 🔒 Security Note

Workload analysis tools capture query text, which can include literal values (e-mail addresses, names) when applications do not use parameters. Treat captured workloads as sensitive and prefer normalised query fingerprints.

---

# SQL Standard vs Vendor Differences

| Capability | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|------------|-----------|-------|-----------|--------|--------|
| Workload statistics | `pg_stat_statements` | Performance Schema | Query Store | AWR / ASH | ❌ |
| Hypothetical indexes | `hypopg` | ❌ (invisible indexes) | DTA hypothetical | Invisible / virtual indexes | ❌ |
| Index advisor | Extensions | ❌ | DTA, DMVs | Access / Tuning Advisor | `.expert` (CLI) |
| Automatic indexing | ❌ | ❌ | Azure SQL | Autonomous DB (19c+) | ❌ |

> **Portability Tip:** The method—workload, ESR, consolidate, validate, monitor—is engine-independent. Only the tools used at each step differ.

---

# Common Mistakes

### Mistake 1

Designing indexes from columns instead of from queries.

---

### Mistake 2

Creating one index per query without consolidating.

---

### Mistake 3

Prioritising the slowest single query over the highest total load.

---

### Mistake 4

Validating on tiny development data.

---

### Mistake 5

Accepting advisor output unchanged.

---

# Best Practices

✔ Start with PKs, unique natural keys and foreign-key indexes.

✔ Design per query with equality → sort → range, then include returned columns for hot queries.

✔ Consolidate candidates into the smallest set that meets latency targets.

✔ Validate with actual plans on production-sized data, including write cost.

✔ Document each index's purpose and review regularly.

---

# Interview Questions

## Basic

1. Which indexes should every schema have?
2. Why should index design start from queries?
3. What is the equality–sort–range rule?

## Intermediate

4. How do you prioritise which queries to index for?
5. How do you consolidate `(A)`, `(A, B)` and `(A, C)`?
6. Why should the tenant column lead indexes in a multi-tenant table?

## Advanced

7. When should a range column come before the sort column?
8. How would you index a search screen with ten optional filters?
9. What are the limits of automatic index advisors?

---

# Hands-on Exercises

## Exercise 1

Write the five most important queries for the sample schema's order history, admin and reporting screens, and design an ideal index for each.

---

## Exercise 2

Consolidate the five candidates into a minimal set and justify each merge.

---

## Exercise 3

Validate the set on a generated data set of 5 million orders: plans, latency and insert cost.

---

## Exercise 4

Design indexes for a multi-tenant version of the schema with a `TenantID` on every table.

---

# Related Topics

- **10.05 — Composite Indexes and Column Order**
- **10.06 — Covering Indexes and Included Columns**
- **10.11 — Indexing for JOIN, GROUP BY and ORDER BY**
- **10.14 — Index Maintenance (Fragmentation, Rebuilds and Monitoring)**
- **03.09.11 — Multi-Tenant Pattern**

---

# Summary

Index design is a loop: understand the workload, give every schema its baseline of primary keys, unique natural keys and foreign-key indexes, design an ideal index per important query with the equality → sort → range rule plus covering for hot queries, consolidate the candidates into the smallest set that meets latency targets, validate plans and write costs on realistic data, and monitor as the application evolves. Multi-tenant, time-series, queue and search-screen tables each have recognisable patterns, and advisors and automatic indexing are useful inputs—never substitutes—for this discipline.
