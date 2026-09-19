---
title: "06.11 - Execution Flow of WHERE"
description: "Follow a WHERE clause through the SQL engine: parsing, predicate normalization, selectivity and cardinality estimation, access versus filter predicates, predicate pushdown, index seeks and scans, and reading filters in execution plans."
chapter: 6
section: 6.11
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 65 min
lastUpdated: 2026-09-19
---

# 06.11 Execution Flow of WHERE

---

# Learning Objectives

After completing this section, you will be able to:

- Trace a `WHERE` clause from SQL text to execution.
- Explain predicate normalization and simplification.
- Define selectivity and cardinality.
- Distinguish access predicates from filter predicates.
- Explain predicate pushdown.
- Explain why the optimizer sometimes ignores an index.
- Find filters in an execution plan.

---

# Why Study the Execution Flow?

Two queries can return identical rows while one takes milliseconds and the other takes minutes.

The difference is almost never the logic of the filter—it is **how the engine evaluates it**. Understanding that process explains why indexes help, why some predicates are slow, and what execution plans are telling you.

---

# Logical vs Physical

**Logically**, `WHERE` runs after `FROM` and tests every row:

```text
FROM → WHERE → GROUP BY → HAVING → SELECT → ...
```

**Physically**, the engine is free to do anything that produces the same result:

- read only the rows an index says can match,
- apply the filter inside the storage engine,
- filter before a join instead of after it,
- skip entire partitions.

The logical model defines the **answer**. The physical plan decides the **cost**.

---

# The Full Pipeline

```text
SQL text
    │
    ▼
1. Parse               → expression tree for the WHERE condition
    │
    ▼
2. Bind / Analyze      → resolve columns, types, implicit conversions
    │
    ▼
3. Normalize           → simplify, fold constants, rewrite
    │
    ▼
4. Estimate            → selectivity and cardinality of each predicate
    │
    ▼
5. Plan                → choose access paths, push predicates down
    │
    ▼
6. Execute             → seek / scan, evaluate remaining filters
    │
    ▼
Qualifying rows
```

---

# Step 1: Parse

```sql
WHERE Status = 'Shipped'
  AND OrderDate >= DATE '2026-01-01'
```

becomes an expression tree:

```text
                AND
              /     \
            =         >=
          /   \      /    \
      Status 'Shipped' OrderDate DATE '2026-01-01'
```

---

# Step 2: Bind and Analyze

The engine checks that `Status` and `OrderDate` exist and determines their types.

If types differ, conversions are inserted here:

```text
VARCHAR column = INTEGER literal
        │
        ▼
CONVERT(column) = literal      ← may disable index use
```

This step is invisible in the SQL text but often visible in the execution plan.

---

# Step 3: Normalize

The optimizer simplifies the condition:

| Rewrite | Before | After |
|---------|--------|-------|
| Constant folding | `Salary > 600000 / 12` | `Salary > 50000` |
| Contradiction detection | `Price > 10 AND Price < 5` | `FALSE` (no rows, possibly no I/O) |
| Tautology removal | `Status = 'A' AND 1 = 1` | `Status = 'A'` |
| `OR` to `IN` | `A = 1 OR A = 2` | `A IN (1, 2)` |
| `BETWEEN` expansion | `A BETWEEN 1 AND 5` | `A >= 1 AND A <= 5` |
| Transitive closure | `a.ID = b.ID AND a.ID = 5` | adds `b.ID = 5` |

Transitive closure is especially powerful in joins: a filter on one table can be propagated to another.

---

# Step 4: Estimate Selectivity

**Selectivity** is the fraction of rows a predicate is expected to keep.

```text
selectivity = rows passing / total rows
```

| Predicate | Table rows | Expected rows | Selectivity |
|-----------|------------|---------------|-------------|
| `OrderID = 42` | 10,000,000 | 1 | 0.0000001 |
| `Status = 'Shipped'` | 10,000,000 | 8,000,000 | 0.8 |
| `Country = 'Bhutan'` | 10,000,000 | 2,000 | 0.0002 |

The expected number of rows is the **cardinality estimate**. The optimizer derives it from **statistics**:

- number of rows,
- number of distinct values,
- histograms of value distribution,
- fraction of `NULL`s.

Combined predicates are estimated too—often by assuming independence:

```text
selectivity(A AND B) ≈ selectivity(A) × selectivity(B)
```

When columns are correlated (for example, `City` and `PostalCode`), this assumption produces poor estimates, which is why some databases support multi-column (extended) statistics.

---

# Step 5: Plan

## Access Predicates vs Filter Predicates

```text
WHERE CustomerID = 17 AND Status = 'Open'
Index on (CustomerID)
```

| Predicate | Role | Effect |
|-----------|------|--------|
| `CustomerID = 17` | **Access predicate** | Navigates the index; only matching entries are read |
| `Status = 'Open'` | **Filter predicate** | Checked on each row after it is read |

With an index on `(CustomerID, Status)`, **both** become access predicates, and fewer rows are read.

---

## Index or Scan?

The optimizer compares estimated costs:

```text
Index path:
    seek cost
  + (matching rows × cost of fetching each row)

Scan path:
    read all pages sequentially
  + evaluate filter on every row
```

For a highly selective predicate (few rows), the index wins.

For a predicate matching a large fraction of the table, a sequential scan is often **cheaper**, because fetching millions of rows one by one through an index involves far more random I/O than reading the table once.

> **Remember:** The optimizer ignoring an index is not always a mistake. It may be the correct decision.

---

## Predicate Pushdown

The optimizer moves filters as close to the data source as possible.

```sql
SELECT
    c.CustomerName,
    o.OrderID
FROM Customers c
JOIN Orders o
    ON o.CustomerID = c.CustomerID
WHERE c.Country = 'Bhutan';
```

Without pushdown:

```text
Join ALL customers with ALL orders
        │
        ▼
Filter Country = 'Bhutan'
```

With pushdown:

```text
Filter Customers: Country = 'Bhutan'   (2,000 rows)
        │
        ▼
Join only those customers with their orders
```

Pushdown also works into views, derived tables, CTEs (in most databases), partitioned tables, and even external storage such as Parquet files or remote databases.

---

## Partition Pruning

If `Orders` is partitioned by month:

```sql
WHERE OrderDate >= DATE '2026-03-01'
  AND OrderDate <  DATE '2026-04-01'
```

the optimizer can skip every partition except March. Pruning happens only when the predicate is written directly on the partition key—another reason to keep columns bare.

---

# Step 6: Execute

```text
Index Seek on Orders(CustomerID)        ← access predicate
    │
    ▼
Fetch row
    │
    ▼
Filter: Status = 'Open'                 ← filter predicate
    │
    ▼
Pass qualifying row to the next operator
```

Rows flow through operators one at a time (or in batches), so filtering early reduces work for every downstream operator: joins, sorts, aggregations, and network transfer.

---

# Reading Filters in Execution Plans

Each database shows filters differently:

| Database | Command | Where filters appear |
|----------|---------|----------------------|
| PostgreSQL | `EXPLAIN (ANALYZE, BUFFERS)` | `Index Cond:` (access), `Filter:` and `Rows Removed by Filter:` |
| MySQL | `EXPLAIN FORMAT=TREE`, `EXPLAIN ANALYZE` | `Index lookup`, `Filter:` |
| SQL Server | Actual execution plan | Seek Predicates (access), Predicate (filter) |
| Oracle | `DBMS_XPLAN.DISPLAY_CURSOR` | `access(...)` and `filter(...)` in Predicate Information |
| SQLite | `EXPLAIN QUERY PLAN` | `SEARCH ... USING INDEX` vs `SCAN` |

Example (PostgreSQL):

```text
Index Scan using orders_customer_idx on orders
  Index Cond: (customer_id = 17)
  Filter: (status = 'Open')
  Rows Removed by Filter: 38
```

This tells you the index found the customer's rows, and 38 of them were then discarded by the status filter—a hint that a composite index might help.

---

# Estimated vs Actual Rows

The most useful diagnostic in any plan is the comparison between **estimated** and **actual** row counts:

```text
Estimated rows:     120
Actual rows:     95,000
```

A large mismatch means the optimizer planned for the wrong situation—often because of stale statistics, correlated columns, or a non-SARGable predicate that the optimizer could not estimate.

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE   ← Logically here; physically pushed as early as possible
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

A complete example:

```sql
SELECT
    OrderID,
    TotalAmount
FROM Orders
WHERE CustomerID = 17
  AND OrderDate >= DATE '2026-01-01'
  AND TotalAmount > 100;
```

With an index on `(CustomerID, OrderDate)`:

```text
Parse and bind
    │
    ▼
Normalize (nothing to fold)
    │
    ▼
Estimate: CustomerID = 17               → ~200 rows
          + OrderDate >= 2026-01-01     → ~40 rows
          + TotalAmount > 100           → ~25 rows
    │
    ▼
Plan: Index range scan on (CustomerID, OrderDate)
      access:  CustomerID = 17 AND OrderDate >= '2026-01-01'
      filter:  TotalAmount > 100
    │
    ▼
Execute: read ~40 index entries, fetch ~40 rows, return ~25
```

---

# 🔬 Engine Deep Dive

Modern storage engines can evaluate filters **below** the row-fetch step:

```text
Traditional:
    Index → fetch full row → evaluate filter

Index condition pushdown (MySQL ICP, similar features elsewhere):
    Index → evaluate filter on index columns → fetch only survivors

Storage / columnar pushdown:
    Storage layer skips whole blocks using min/max metadata
    (zone maps, block range indexes, Parquet row-group statistics)
```

In analytical systems, block-level skipping means a filter on a sorted or clustered column may avoid reading most of the data at all—without any traditional index.

---

# 🏗️ Architecture Insight

The execution flow of `WHERE` is where logical SQL, statistics, indexes, and storage layout meet. Physical design choices—index column order, clustering, partitioning, and data types—determine which predicates can become access predicates. Designing these structures around the application's most important filters is a core database-architecture responsibility.

---

# ⚡ Performance Tip

When a filtered query is slow, compare estimated and actual rows in the plan, check whether each predicate is an access predicate or a filter, and look for implicit conversions. These three checks explain the large majority of slow filters.

---

# 🔒 Security Note

Row-level security is implemented by adding predicates to queries automatically. Those predicates participate in normal optimization, so security filters benefit from the same indexing as application filters—and a poorly indexed security predicate can slow down every query on the table.

---

# 🌍 Production Consideration

Query plans can change when data grows or statistics are refreshed. A filter that used an index yesterday may switch to a scan today if its estimated selectivity crosses a threshold. Monitoring plan changes for critical queries is standard practice in production database operations.

---

# 🚀 Enterprise Practice

Performance teams keep execution plans for business-critical queries under version control or use plan baselines, forced plans, or query stores, so that an unexpected plan change can be detected and reverted quickly.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Execution plans | Not standardized | `EXPLAIN` | `EXPLAIN` | Showplan | `EXPLAIN PLAN`, `DBMS_XPLAN` | `EXPLAIN QUERY PLAN` |
| Actual row counts | — | `EXPLAIN ANALYZE` | `EXPLAIN ANALYZE` (8.0.18+) | Actual plan | `GATHER_PLAN_STATISTICS` | ❌ |
| Multi-column statistics | — | `CREATE STATISTICS` | Histograms (single column) | Multi-column stats | Column groups | ❌ |
| Partition pruning | — | ✅ | ✅ | ✅ | ✅ | ❌ |
| Index condition pushdown | — | Index-only / bitmap scans | ICP | Seek + residual predicates | ✅ | Limited |

> **Portability Tip:** The logical meaning of `WHERE` is standardized, but execution plans, statistics, and optimizer features are entirely vendor-specific. Learn the plan format of the database you run in production.

---

# Common Mistakes

### Mistake 1

Assuming conditions are evaluated in the order they are written.

---

### Mistake 2

Assuming an unused index means the optimizer is wrong.

---

### Mistake 3

Ignoring the difference between estimated and actual row counts.

---

### Mistake 4

Forgetting to refresh statistics after large data changes.

---

# Best Practices

✔ Read execution plans for important filtered queries.

✔ Distinguish access predicates from filter predicates.

✔ Compare estimated and actual rows.

✔ Keep statistics up to date.

✔ Design composite indexes so key filters become access predicates.

✔ Write predicates on partition keys directly.

---

# Interview Questions

## Basic

1. What is the difference between logical and physical evaluation of `WHERE`?
2. What is selectivity?
3. Why might the optimizer choose a table scan despite an index?

## Intermediate

4. What is the difference between an access predicate and a filter predicate?
5. What is predicate pushdown?
6. What is constant folding?

## Advanced

7. Why do correlated columns cause bad cardinality estimates?
8. What is index condition pushdown?
9. How would you diagnose a filtered query whose actual rows are 1,000 times the estimate?

---

# Hands-on Exercises

## Exercise 1

Run `EXPLAIN` on a query that filters by primary key and identify the access path.

---

## Exercise 2

Run `EXPLAIN` on a query that filters a low-selectivity column (for example, a status that most rows share) and explain the plan chosen.

---

## Exercise 3

Given an index on `(CustomerID)`, identify the access and filter predicates in:

```sql
WHERE CustomerID = 5 AND Status = 'Open' AND TotalAmount > 100
```

Then design an index that turns two of them into access predicates.

---

## Exercise 4

Explain how the optimizer can use `c.Country = 'Bhutan'` to reduce the work of a join between `Customers` and `Orders`.

---

# Related Topics

- **04.03 — How SQL Works Internally (SQL Query Processing Pipeline)**
- **05.12 — Execution Flow of SELECT**
- **06.09 — Filtering with Expressions and Functions**
- **06.12 — SARGability and Index-Friendly Predicates**
- **10.xx — Indexes**
- **16.xx — Reading Execution Plans**

---

# Summary

A `WHERE` clause is parsed into an expression tree, bound to column types, normalized, and estimated using statistics before the optimizer decides how to evaluate it. Predicates that match an index's leading columns become access predicates that limit what is read; others become filters applied to fetched rows. Pushdown, transitive closure, partition pruning, and storage-level skipping move filtering as close to the data as possible. Reading execution plans—especially access versus filter predicates and estimated versus actual rows—turns filter performance from guesswork into diagnosis.
