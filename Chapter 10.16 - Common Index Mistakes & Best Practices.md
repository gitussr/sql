---
title: "10.16 - Common Index Mistakes & Best Practices"
description: "A catalogue of index mistakes—non-SARGable predicates, wrong column order, unindexed foreign keys, over-indexing, redundant indexes, low-selectivity indexes, type mismatches, leading wildcards, OFFSET pagination, random keys, stale statistics and unsafe index DDL—with symptoms, fixes and a review checklist."
chapter: 10
section: 10.16
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 35 min
lastUpdated: 2026-09-25
---

# 10.16 Common Index Mistakes & Best Practices

---

# Learning Objectives

After completing this section, you will be able to:

- Recognise the most common index mistakes from their symptoms.
- Explain the cause of each mistake.
- Apply the standard fix for each.
- Review a schema and its queries with an index checklist.

---

# How Index Mistakes Show Up

| Symptom | Likely mistake |
|---------|----------------|
| Index exists but plan shows a full scan | 1 non-SARGable predicate, 7 type mismatch, 6 low selectivity, 12 stale statistics |
| Seek on first column, many rows filtered | 2 wrong column order |
| Joins and deletes on parent tables slow | 3 unindexed foreign keys |
| Inserts slow, log volume high | 4 over-indexing, 10 random keys |
| Many indexes with similar names | 5 redundant indexes |
| `LIKE '%x%'` slow | 8 leading wildcard |
| Later pages of a list get slower | 9 `OFFSET` pagination |
| Index seek + thousands of lookups | 11 not covering a hot query |
| Writes blocked during a deployment | 13 offline index DDL |

---

# Mistake 1: Non-SARGable Predicates

```sql
-- ❌ Function on the indexed column
WHERE YEAR(OrderDate) = 2026
WHERE LOWER(Email) = 'asha@example.com'        -- with an index on Email
WHERE TotalAmount * 1.18 > 1000

-- ✅ Bare column compared with a computable value
WHERE OrderDate >= '2026-01-01' AND OrderDate < '2027-01-01'
WHERE Email = 'asha@example.com'               -- with a case-insensitive collation, or
                                               -- an expression index on LOWER(Email)
WHERE TotalAmount > 1000 / 1.18
```

**Cause:** the index is sorted by the column, not by the function's result (Section 06.12). **Fix:** rewrite the predicate or index the expression (Section 10.10).

---

# Mistake 2: Wrong Column Order

```sql
-- Query
WHERE CustomerID = 42 AND OrderDate >= '2026-01-01'

-- ❌ Range column first: reads every recent order, filters by customer
CREATE INDEX IX_Orders_Date_Cust ON Orders (OrderDate, CustomerID);

-- ✅ Equality first
CREATE INDEX IX_Orders_Cust_Date ON Orders (CustomerID, OrderDate);
```

**Symptom:** plan shows a seek on the first column with a large residual filter. **Fix:** equality → sort → range (Section 10.15).

---

# Mistake 3: Unindexed Foreign Keys

```sql
ALTER TABLE Orders ADD CONSTRAINT FK_Orders_Customers
    FOREIGN KEY (CustomerID) REFERENCES Customers (CustomerID);
-- ❌ No index on Orders.CustomerID (PostgreSQL, SQL Server, Oracle, SQLite)
```

**Symptoms:** joins from `Customers` to `Orders` scan `Orders`; deleting a customer scans `Orders` to check for references, and on some engines takes broad locks. **Fix:** index every foreign key column that is joined on or whose parent rows are deleted—preferably as the leading column of a useful composite index.

---

# Mistake 4: Over-Indexing

```sql
-- ❌ One index per column "just in case"
CREATE INDEX IX_Orders_CustomerID  ON Orders (CustomerID);
CREATE INDEX IX_Orders_OrderDate   ON Orders (OrderDate);
CREATE INDEX IX_Orders_Status      ON Orders (Status);
CREATE INDEX IX_Orders_TotalAmount ON Orders (TotalAmount);
CREATE INDEX IX_Orders_CreatedBy   ON Orders (CreatedBy);
```

**Symptoms:** slow inserts and updates, high log volume, large backups, indexes that are never used. **Fix:** design from queries, consolidate into composites, and drop unused indexes (Sections 10.13–10.15).

---

# Mistake 5: Redundant and Duplicate Indexes

```sql
-- ❌ (CustomerID) is a leading prefix of (CustomerID, OrderDate)
CREATE INDEX IX_Orders_CustomerID      ON Orders (CustomerID);
CREATE INDEX IX_Orders_Customer_Date   ON Orders (CustomerID, OrderDate);

-- ❌ Same definition twice under different names (often from an ORM and a DBA)
CREATE INDEX IX_Orders_Cust    ON Orders (CustomerID);
CREATE INDEX orders_customerid_idx ON Orders (CustomerID);
```

**Fix:** find with catalog queries (Section 10.14) and drop the redundant one—unless it enforces uniqueness.

---

# Mistake 6: Indexing Low-Selectivity Columns Alone

```sql
-- ❌ 95% of rows are 'Shipped'; the index is rarely useful and always maintained
CREATE INDEX IX_Orders_Status ON Orders (Status);
```

**Fix:** use `Status` as the leading equality column of a composite (`(Status, OrderDate)`) or a partial index for the rare values (`WHERE Status = 'Pending'`).

---

# Mistake 7: Data Type Mismatches

```sql
-- Column: CustomerCode VARCHAR(20), indexed
-- ❌ Numeric literal forces conversion of the column on some engines
WHERE CustomerCode = 12345

-- Column: Email VARCHAR (non-Unicode); parameter sent as NVARCHAR (SQL Server)
-- ❌ Implicit conversion of the column → scan
WHERE Email = @EmailNVarchar

-- ✅ Match the column's type
WHERE CustomerCode = '12345'
```

**Symptom:** plan warnings about implicit conversion (SQL Server), a `Filter` with a cast on the column (PostgreSQL), or a full scan despite an index. **Fix:** match literal and parameter types to the column—including in ORM parameter mappings—and keep join columns the same type on both sides.

---

# Mistake 8: Leading Wildcards

```sql
-- ❌ B-tree cannot seek
WHERE CustomerName LIKE '%kumar%'

-- ✅ Prefix search can
WHERE CustomerName LIKE 'kumar%'
```

**Fix:** for genuine substring search, use a trigram (PostgreSQL `pg_trgm`) or full-text index (Section 10.09); for suffix search, index the reversed string.

---

# Mistake 9: OFFSET Pagination on Large Tables

```sql
-- ❌ Page 10 000 reads 200 000 rows to return 20
ORDER BY OrderDate DESC, OrderID DESC OFFSET 199980 ROWS FETCH NEXT 20 ROWS ONLY;

-- ✅ Keyset pagination
WHERE (OrderDate, OrderID) < (:lastDate, :lastId)
ORDER BY OrderDate DESC, OrderID DESC FETCH FIRST 20 ROWS ONLY;
```

**Fix:** keyset pagination with a unique tiebreaker and a matching index (Section 10.11).

---

# Mistake 10: Random Keys on Large Clustered Tables

```sql
-- ❌ Random UUIDv4 clustered primary key on a 500-million-row InnoDB / SQL Server table
OrderID CHAR(36) PRIMARY KEY DEFAULT (UUID())
```

**Symptoms:** insert throughput drops as the table grows past memory, page splits, large secondary indexes. **Fix:** a `BIGINT` identity or time-ordered UUID (UUIDv7) as the clustering key; keep random public identifiers in a unique secondary index if needed.

---

# Mistake 11: Not Covering Hot Queries

```text
Index Seek on IX_Orders_CustomerID   (rows: 3 000)
Key Lookup on PK_Orders              (executions: 3 000)   ← 90% of the query cost
```

**Fix:** add the looked-up columns to the index as `INCLUDE` (or trailing key) columns for queries that run very often (Section 10.06).

---

# Mistake 12: Stale Statistics

**Symptom:** estimated rows wildly different from actual rows; index ignored for selective predicates or used for huge ones. **Fix:** refresh statistics after bulk changes, add extended statistics for correlated columns (Section 10.12).

---

# Mistake 13: Unsafe Index DDL in Production

```sql
-- ❌ Blocks writes on a 200 GB table for an hour
CREATE INDEX IX_Orders_Status_Date ON Orders (Status, OrderDate);

-- ✅
SET lock_timeout = '5s';
CREATE INDEX CONCURRENTLY IX_Orders_Status_Date ON Orders (Status, OrderDate);
```

**Fix:** online builds, lock timeouts, migrations, and a check for leftover invalid indexes (Section 10.03).

---

# Mistake 14: Trusting Indexes Without Reading Plans

"We added an index and it's still slow" usually means the index is not used—or is used badly. **Fix:** read the actual plan before and after every index change.

---

# Review Checklist

```text
Baseline
  □ Every table has a primary key
  □ Every natural key has a unique constraint
  □ Every joined / referenced foreign key column leads some index

Design
  □ Each index serves named queries (documented)
  □ Composite column order is equality → sort → range
  □ No index is a duplicate or leading prefix of another (unless unique)
  □ Low-selectivity columns only inside composites or partial indexes
  □ Hot queries covered; INCLUDE lists small

Queries
  □ Predicates are SARGable; types match columns and parameters
  □ No leading-wildcard LIKE on large tables without a trigram/full-text index
  □ Deep lists use keyset pagination

Operations
  □ Statistics refreshed after bulk changes
  □ Index DDL online, with lock timeouts, via migrations
  □ Unused / duplicate / bloated index review scheduled
  □ Write-heavy tables within their index budget
```

---

# Visual Representation

```text
                         Index mistakes
                               │
     ┌──────────────┬──────────┼──────────────┬───────────────┐
     │              │          │              │               │
  QUERY          DESIGN     MISSING        TOO MANY       OPERATIONS
     │              │          │              │               │
 functions on   column order  FK index      over-indexing   stale stats
 columns        low-select.   covering      redundant       offline DDL
 type mismatch  random keys   (hot query)   duplicates      no plan checks
 %wildcard
 OFFSET paging
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← mistakes 10, 12: wrong access path chosen or expensive storage
2. JOIN        ← mistake 3: unindexed foreign keys
3. WHERE       ← mistakes 1, 2, 6, 7, 8: predicates the index cannot seek
4. GROUP BY
5. HAVING
6. SELECT      ← mistake 11: lookups for columns not covered
7. DISTINCT
8. ORDER BY    ← mistake 2: sort columns missing from the index
9. LIMIT / FETCH / TOP  ← mistake 9: OFFSET reads every skipped row
```

---

# How the DBMS Executes This

```text
Mistake                     What the plan shows
─────────────────────────   ─────────────────────────────────────────────────
Non-SARGable / type cast    Seq Scan / Index Scan with Filter on f(column)
Wrong column order          Seek on first column, large "Rows Removed by Filter"
Unindexed FK                Seq Scan of child inside Nested Loop / on DELETE
Not covering                Key Lookup / heap fetches ≈ rows returned
OFFSET pagination           Limit over Index Scan reading offset + N rows
Stale statistics            estimated rows ≠ actual rows by 10×+
```

---

# 🔬 Engine Deep Dive

SQL Server flags two of these mistakes directly in plans: a yellow warning for **implicit conversions** that affect seek plans, and **missing index** hints. PostgreSQL's `auto_explain` module can log plans of slow queries automatically, which is the practical way to catch mistakes 1, 2, 7 and 11 in production traffic rather than in tests.

---

# 🏗️ Architecture Insight

Most index mistakes come from two gaps: developers who write queries without seeing plans, and schemas designed without a list of access patterns. Closing both—plan review in code review, and access patterns documented beside the schema—prevents more problems than any tuning effort afterwards.

---

# ⚡ Performance Tip

When investigating a slow query, check mistakes in this order: statistics (12), SARGability and types (1, 7), column order (2), covering (11). They are the most frequent and the cheapest to fix.

---

# 🔒 Security Note

Mistake 13 has an availability dimension: an index build that blocks writes is an outage. Include index DDL in change-management procedures with the same care as schema changes that alter data.

---

# SQL Standard vs Vendor Differences

| Mistake | Engine-specific twist |
|---------|----------------------|
| Unindexed FK | MySQL/InnoDB creates FK indexes automatically; others do not |
| Type mismatch | SQL Server `NVARCHAR` parameters vs `VARCHAR` columns; MySQL string-to-number comparisons |
| Case-insensitive search | Often free with MySQL / SQL Server default collations; needs an expression index on PostgreSQL / Oracle |
| Offline DDL | SQLite has no online option; SQL Server / Oracle online builds need Enterprise edition |
| Partial-index workaround | Not available on MySQL; Oracle needs function-based `NULL` trick |

> **Portability Tip:** The mistakes are universal, but whether they bite depends on engine defaults—check collations, FK indexing and online DDL support for each target engine.

---

# Common Mistakes

### Mistake 1

Fixing slow queries by adding indexes without checking whether an existing index could be used with a query rewrite.

---

### Mistake 2

Never removing indexes once added.

---

# Best Practices

✔ Keep predicates SARGable and types matched.

✔ Design composite indexes with equality → sort → range.

✔ Index foreign keys; cover hot queries.

✔ Consolidate, and remove unused and redundant indexes.

✔ Refresh statistics and read actual plans.

✔ Change indexes online, through migrations.

---

# Interview Questions

## Basic

1. Why doesn't `WHERE YEAR(OrderDate) = 2026` use an index on `OrderDate`?
2. Why should foreign keys be indexed?
3. What is wrong with indexing every column?

## Intermediate

4. How can a data type mismatch disable an index?
5. How do you find redundant indexes?
6. Why is `OFFSET` pagination slow for deep pages?

## Advanced

7. Why are random UUID clustered keys a problem at scale?
8. In what order would you investigate a slow query that "has an index"?
9. How would you prevent index mistakes in a team's development process?

---

# Hands-on Exercises

## Exercise 1

For each of mistakes 1, 2, 7 and 8, write a query that exhibits it on the sample schema, show the plan, and fix it.

---

## Exercise 2

Run the review checklist against the sample schema and list every finding.

---

## Exercise 3

Find all unindexed foreign keys in a database with a catalog query.

---

## Exercise 4

Convert an `OFFSET` pagination endpoint to keyset pagination and compare deep-page timings.

---

# Related Topics

- **10.05 — Composite Indexes and Column Order**
- **10.12 — Selectivity, Cardinality and Statistics**
- **10.15 — Index Design Strategy**
- **06.12 — SARGability and Index-Friendly Predicates**
- **09.16 — Common Subquery Mistakes & Best Practices**
- **08.16 — Common GROUP BY Mistakes & Best Practices**

---

# Summary

Index mistakes fall into five families: queries that cannot use indexes (functions on columns, type mismatches, leading wildcards, `OFFSET` pagination), designs that serve queries badly (wrong column order, low-selectivity leaders, random clustering keys), missing indexes (unindexed foreign keys, uncovered hot queries), too many indexes (over-indexing, redundancy, duplicates), and operational lapses (stale statistics, offline DDL, no plan checks). Each has a well-known fix, and the review checklist catches most of them before they reach production.
