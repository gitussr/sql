---
title: "09.15 - Subquery Performance and Index Strategy"
description: "Making subqueries fast: indexing correlation columns, covering indexes for EXISTS and scalar lookups, top-N-per-group indexes, SARGable subquery predicates, avoiding repeated scans, choosing between subquery, derived table, LATERAL and window forms, and diagnosing slow subqueries from the plan."
chapter: 9
section: 9.15
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 35 min
lastUpdated: 2026-09-25
---

# 09.15 Subquery Performance and Index Strategy

---

# Learning Objectives

After completing this section, you will be able to:

- Design indexes that support `IN`, `EXISTS`, `NOT EXISTS` and correlated scalar subqueries.
- Build covering indexes so that subquery probes never touch the table.
- Index for top-N-per-group with `LATERAL` or correlated row limits.
- Keep predicates inside subqueries SARGable.
- Remove repeated scans caused by multiple subqueries on the same table.
- Diagnose a slow subquery from its execution plan.

---

# The Cost Model in One Line

```text
Unnested subquery   → cost of a join            (algorithm + inputs)
Uncorrelated once   → cost of the subquery      (once)
Per-row subquery    → outer rows × inner cost   (the one that hurts)
```

Almost all subquery tuning is about the third line: either make each inner execution an index seek, or get the subquery rewritten into a join.

---

# Rule 1: Index the Correlation Column

Every correlated subquery filters the inner table on its correlation column. That column must lead an index.

```sql
-- Query
SELECT c.CustomerName
FROM Customers AS c
WHERE EXISTS (SELECT 1 FROM Orders AS o WHERE o.CustomerID = c.CustomerID);

-- Index
CREATE INDEX IX_Orders_CustomerID ON Orders (CustomerID);
```

```text
Without index                          With index
per customer: scan all Orders          per customer: 1 index seek, stop at first entry
10 000 customers × 1 000 000 orders    10 000 seeks
≈ 10¹⁰ row visits                      ≈ 10⁴ × log(10⁶) page reads
```

Foreign key columns are the usual correlation columns—and most engines do **not** index foreign keys automatically (MySQL/InnoDB is the exception).

---

# Rule 2: Add the Filter Columns

When the subquery filters on more than the correlation column, extend the index:

```sql
-- Customers with a pending order
WHERE EXISTS (SELECT 1 FROM Orders AS o
              WHERE o.CustomerID = c.CustomerID
                AND o.Status = 'Pending')

CREATE INDEX IX_Orders_Customer_Status ON Orders (CustomerID, Status);
```

Equality columns first (correlation and equality filters), then range columns:

```sql
-- Customers with an order in the last 30 days
WHERE EXISTS (SELECT 1 FROM Orders AS o
              WHERE o.CustomerID = c.CustomerID
                AND o.OrderDate >= CURRENT_DATE - INTERVAL '30' DAY)

CREATE INDEX IX_Orders_Customer_Date ON Orders (CustomerID, OrderDate);
```

---

# Rule 3: Cover the Scalar Lookup

For a scalar subquery that returns a value, include that value in the index so the probe is answered from the index alone:

```sql
-- Latest order date per customer
(SELECT MAX(o.OrderDate) FROM Orders AS o WHERE o.CustomerID = c.CustomerID)
-- → IX_Orders_Customer_Date (CustomerID, OrderDate): MAX is the last entry for the key

-- Customer name per order
(SELECT cu.CustomerName FROM Customers AS cu WHERE cu.CustomerID = o.CustomerID)
-- → primary key seek; add CustomerName with INCLUDE for a covering index on SQL Server
CREATE INDEX IX_Customers_ID_Name ON Customers (CustomerID) INCLUDE (CustomerName);
```

`MIN`/`MAX` over the second column of an index with a fixed first column is one index seek on every major engine.

---

# Rule 4: Index for Top N per Group

`LATERAL` / `APPLY` and correlated row-limit subqueries need an index whose order matches the subquery's `ORDER BY`:

```sql
-- Each customer's 3 most recent orders
... WHERE o.CustomerID = c.CustomerID
    ORDER BY o.OrderDate DESC, o.OrderID DESC
    FETCH FIRST 3 ROWS ONLY

CREATE INDEX IX_Orders_Customer_Date_ID ON Orders (CustomerID, OrderDate DESC, OrderID DESC);
```

```text
Index entries for CustomerID = 2
(2, 2026-09-02, 118)  ← read
(2, 2026-07-11, 097)  ← read
(2, 2026-05-30, 084)  ← read      stop: 3 rows
(2, 2026-02-14, 051)
…
```

Each outer row reads exactly N index entries, no sort. Most engines can scan an ascending index backwards, so `DESC` in the index definition matters mainly when columns have mixed directions.

---

# Rule 5: Keep Subquery Predicates SARGable

Section 06.12's rules apply inside subqueries too—including the correlation predicate:

```sql
-- ❌ Function on the inner column: no index seek per outer row
WHERE EXISTS (SELECT 1 FROM Orders o
              WHERE CAST(o.CustomerID AS VARCHAR(10)) = c.CustomerCode)

-- ❌ Expression on the inner column
WHERE EXISTS (SELECT 1 FROM Orders o
              WHERE EXTRACT(YEAR FROM o.OrderDate) = 2026
                AND o.CustomerID = c.CustomerID)

-- ✅ Bare inner columns, range instead of function
WHERE EXISTS (SELECT 1 FROM Orders o
              WHERE o.CustomerID = c.CustomerID
                AND o.OrderDate >= DATE '2026-01-01'
                AND o.OrderDate <  DATE '2027-01-01')
```

Mismatched data types on the correlation (an `INT` column compared with a `VARCHAR`) cause implicit conversions with the same effect. Keep correlation columns the same type on both sides.

---

# Rule 6: One Pass per Table

Several subqueries against the same table each read it:

```sql
-- ❌ Three probes of Orders per customer
SELECT c.CustomerID,
       (SELECT COUNT(*)          FROM Orders o WHERE o.CustomerID = c.CustomerID),
       (SELECT SUM(TotalAmount)  FROM Orders o WHERE o.CustomerID = c.CustomerID),
       (SELECT MAX(OrderDate)    FROM Orders o WHERE o.CustomerID = c.CustomerID)
FROM Customers AS c;

-- ✅ One aggregation of Orders
SELECT c.CustomerID, COALESCE(s.Cnt, 0), s.Total, s.LastDate
FROM Customers AS c
LEFT JOIN (SELECT CustomerID, COUNT(*) AS Cnt, SUM(TotalAmount) AS Total, MAX(OrderDate) AS LastDate
           FROM Orders GROUP BY CustomerID) AS s
       ON s.CustomerID = c.CustomerID;

-- ✅ Or one lateral probe (good when few customers are selected)
SELECT c.CustomerID, s.Cnt, s.Total, s.LastDate
FROM Customers AS c
CROSS JOIN LATERAL (SELECT COUNT(*) AS Cnt, SUM(o.TotalAmount) AS Total, MAX(o.OrderDate) AS LastDate
                    FROM Orders o WHERE o.CustomerID = c.CustomerID) AS s;
```

(An aggregate without `GROUP BY` always returns one row, so `CROSS JOIN LATERAL` keeps customers without orders here.)

---

# Choosing a Form by Selectivity

| Situation | Usually fastest |
|-----------|-----------------|
| Few outer rows, indexed correlation | Correlated subquery / `LATERAL` (seeks) |
| Most outer rows, large inner table | Unnested join / grouped derived table (hash) |
| Top N per group, index on (group, sort) | `LATERAL` / `APPLY` |
| Top N per group, no index or most groups | `ROW_NUMBER()` in a derived table |
| Existence test | `EXISTS` (unnested to semi-join) |
| Exclusion | `NOT EXISTS` (anti-join) |
| Row compared with group figure, large table | Window function or grouped derived table |

The same query may flip between these as data grows, which is why plans should be re-checked on production-sized data.

---

# Diagnosing a Slow Subquery

```text
1. EXPLAIN ANALYZE (or actual execution plan).
2. Find SubPlan / DEPENDENT SUBQUERY / Nested Loops (Apply) / FILTER nodes.
3. For each: loops (executions) × rows read per loop.
4. Inner access a scan? → index the correlation column (+ filters, + covered values).
5. Inner access a seek but loops enormous? → reduce outer rows first (filter earlier),
   or rewrite to a join / derived table so it runs once.
6. Estimated vs actual rows far apart? → update statistics; check correlated columns.
7. NOT IN on nullable column? → NOT EXISTS.
```

```text
PostgreSQL example of a problem plan

Seq Scan on customers c  (actual rows=50000 loops=1)
  Filter: (SubPlan 1)
  SubPlan 1
    ->  Seq Scan on orders o  (actual rows=0 loops=50000)     ← 50 000 full scans
          Filter: (customerid = c.customerid)

Fix: CREATE INDEX ON orders (customerid);  → Index Only Scan, loops=50000, ~3 pages each
Better: write EXISTS so it becomes a Hash Semi Join, one pass over orders.
```

---

# Statistics and Estimates

Subquery plans depend on estimates of how many outer rows there are and how many inner rows match each. Stale statistics produce the classic failure: the optimizer estimates 10 outer rows, chooses a per-row nested loop, and actually gets 10 million. Keep statistics current on tables used in subqueries, and treat a large gap between estimated and actual loop counts as the first thing to fix.

---

# Visual Representation

```text
Outer rows ───────────────┐
  (reduce with WHERE)     │  × per-row inner cost ──→ total
                          │
Inner cost per row:       │
  scan               ████████████████████  (no index)
  seek + lookup      ███                   (index on correlation column)
  index-only seek    █                     (covering index)
  unnested join      ─ one pass, independent of outer row count ─
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← filter outer rows here BEFORE per-row subqueries in SELECT run
4. GROUP BY
5. HAVING
6. SELECT      ← per-row scalar subqueries cost (rows surviving WHERE) × inner cost
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP  ← some engines run SELECT-list subqueries only for the rows kept here
```

---

# How the DBMS Executes This

```text
Correlated subquery with index on correlation column

Nested Loop (Semi)
  -> Seq Scan on Customers                    outer: N rows
  -> Index Only Scan on IX_Orders_CustomerID  inner: 1 seek per outer row, stop at first
       Index Cond: CustomerID = c.CustomerID

Cost ≈ N × (index depth) page reads, independent of Orders size.
```

---

# 🔬 Engine Deep Dive

For an unnested semi-join, the optimizer chooses between a nested loop (cheap when the outer side is small and the inner side indexed) and a hash semi-join (cheap when both sides are large). The crossover depends on the estimated outer row count. With a good index, the optimizer can also *reverse* the join—drive from the smaller, deduplicated inner side and seek into the outer table—something a literally executed per-row subquery could never do. This is the main reason unnested forms usually win on large data.

---

# 🏗️ Architecture Insight

Subquery performance is mostly an **indexing of foreign keys** problem. Correlation columns, `IN` subquery columns and `EXISTS` join columns are nearly always foreign keys. A schema standard that says "every foreign key column is the leading column of some index" prevents most slow subqueries before they are written.

---

# ⚡ Performance Tip

Filter the outer query as early as possible. A `SELECT`-list subquery runs once per row that survives `WHERE`; halving the outer rows halves its cost, regardless of indexes.

---

# 🔒 Security Note

Indexes created to speed subqueries are visible to anyone who can read the schema and may reveal access patterns (for example, an index on `Users(IsSuspended)`), but they do not expose data. The more relevant risk is denial of service: an unindexed correlated subquery behind a public search endpoint can be made quadratic by an attacker who controls the outer row count.

---

# SQL Standard vs Vendor Differences

| Feature | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|---------|-----------|-------|-----------|--------|--------|
| FK columns indexed automatically | ❌ | ✅ (InnoDB) | ❌ | ❌ | ❌ |
| Covering (`INCLUDE`) indexes | ✅ (11+) | ❌ (use composite) | ✅ | ❌ (use composite) | ❌ (use composite) |
| Descending index keys | ✅ | ✅ (8.0+) | ✅ | ✅ | ✅ |
| Actual-row plan | `EXPLAIN ANALYZE` | `EXPLAIN ANALYZE` (8.0.18+) | Actual execution plan | `DBMS_XPLAN` with `GATHER_PLAN_STATISTICS` | `EXPLAIN QUERY PLAN` (estimates only) |
| Per-row subquery label | `SubPlan` | `DEPENDENT SUBQUERY` | `Nested Loops` (Apply) | `FILTER` | `CORRELATED … SUBQUERY` |

> **Portability Tip:** A composite index `(correlation column, filter columns, returned column)` is covering on every engine; `INCLUDE` is an optimisation on those that support it.

---

# Common Mistakes

### Mistake 1

No index on the foreign key used as a correlation column.

---

### Mistake 2

A function or type conversion on the inner correlation column.

---

### Mistake 3

Several scalar subqueries against the same child table.

---

### Mistake 4

Top N per group with `LATERAL` but no index matching the `ORDER BY`.

---

### Mistake 5

Tuning from estimated plans only, without checking actual loop counts.

---

# Best Practices

✔ Index every foreign key that appears in a subquery correlation.

✔ Order composite index columns: correlation, equality filters, range/sort, returned values.

✔ Keep inner predicates SARGable and types matched.

✔ Read each table once per query where possible.

✔ Diagnose with actual plans: executions × rows per execution.

✔ Keep statistics current on tables used in subqueries.

---

# Interview Questions

## Basic

1. Which column should be indexed to support a correlated `EXISTS`?
2. Why is an unindexed correlated subquery slow?
3. How do you see whether a subquery runs once per row?

## Intermediate

4. What index supports "each customer's three latest orders" with `LATERAL`?
5. Why do several scalar subqueries on the same table hurt, and how do you fix it?
6. How can a type mismatch on the correlation column prevent index use?

## Advanced

7. When is a per-row subquery faster than an unnested hash semi-join?
8. How can an unnested semi-join be driven from the inner side?
9. How do stale statistics lead to catastrophic subquery plans?

---

# Hands-on Exercises

## Exercise 1

Create a large `Orders` table without an index on `CustomerID`. Time a correlated `EXISTS`, add the index, and time it again.

---

## Exercise 2

Design one index that supports "customers with a pending order in the last 30 days".

---

## Exercise 3

Rewrite a query with four scalar subqueries on `Orders` so that `Orders` is read once. Compare plans.

---

## Exercise 4

Compare `LATERAL` and `ROW_NUMBER()` for top 3 orders per customer, first with 10 customers selected, then with all customers.

---

# Related Topics

- **06.12 — SARGability and Index-Friendly Predicates**
- **07.15 — JOIN Performance and Index Strategy**
- **08.15 — GROUP BY Performance and Index Strategy**
- **09.10 — LATERAL and CROSS APPLY**
- **09.14 — Execution Flow of Subqueries (Unnesting and Decorrelation)**
- **10.xx — Indexes**

---

# Summary

Subquery performance is dominated by per-row execution: outer rows times the cost of one inner run. Make that inner run an index seek by indexing the correlation column—usually a foreign key—followed by equality filters, range or sort columns, and returned values so the probe is covered. Keep inner predicates SARGable and correlation types matched, read each child table once instead of through several scalar subqueries, and choose between correlated, `LATERAL`, derived-table and window forms by how many outer rows are involved. Diagnose with actual plans, focusing on executions and rows read per execution, and keep statistics current so the optimizer chooses between nested loops and hash joins correctly.
