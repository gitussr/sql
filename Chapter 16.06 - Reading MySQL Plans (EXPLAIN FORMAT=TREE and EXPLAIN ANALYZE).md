---
title: "16.06 - Reading MySQL Plans (EXPLAIN FORMAT=TREE and EXPLAIN ANALYZE)"
description: "How to read MySQL execution plans: the traditional tabular EXPLAIN (id, select_type, type, possible_keys, key, key_len, ref, rows, filtered, Extra), the access types from const to ALL, the important Extra values, the iterator tree of FORMAT=TREE, actual time, rows and loops from EXPLAIN ANALYZE, JSON cost details, and a complete worked example."
chapter: 16
section: 16.06
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 25 min
lastUpdated: 2026-10-01
---

# 16.06 Reading MySQL Plans (EXPLAIN FORMAT=TREE and EXPLAIN ANALYZE)

---

# Learning Objectives

After completing this section, you will be able to:

- Read every column of MySQL's traditional `EXPLAIN` output.
- Rank access types from best to worst.
- Interpret the important `Extra` values.
- Read `FORMAT=TREE` and `EXPLAIN ANALYZE` iterator trees.
- Use `key_len` to see how much of a composite index is used.

---

# The Traditional Tabular EXPLAIN

```sql
EXPLAIN
SELECT o.OrderID, o.TotalAmount, c.CustomerName
FROM Orders o
JOIN Customers c ON c.CustomerID = o.CustomerID
WHERE o.OrderDate >= '2026-09-01' AND o.Status = 'Pending';
```

```text
id select_type table type   possible_keys                            key                 key_len ref               rows    filtered Extra
1  SIMPLE      o     range  ix_orders_customer_date,ix_orders_orderdate ix_orders_orderdate 3       NULL              391220  10.00    Using index condition; Using where
1  SIMPLE      c     eq_ref PRIMARY                                  PRIMARY             4       shop.o.CustomerID 1       100.00   NULL
```

One row per table access, **in join order** (top row first). For a nested-loop join, each row's table is read once per combination of rows from the tables above it.

| Column | Meaning |
|--------|---------|
| `id` | Query block (`SELECT`) number; same id = same join |
| `select_type` | `SIMPLE`, `PRIMARY`, `SUBQUERY`, `DERIVED`, `DEPENDENT SUBQUERY`, `UNION`, `MATERIALIZED` … |
| `table` | Table or alias; `<derivedN>`, `<subqueryN>`, `<unionM,N>` for intermediate results |
| `partitions` | Partitions accessed (partition pruning) |
| `type` | **Access type** (below)—the single most important column |
| `possible_keys` | Indexes the optimizer considered |
| `key` | Index chosen (`NULL` = none) |
| `key_len` | Bytes of the index key used—shows how many composite-index columns are used |
| `ref` | Columns or constants compared with the index |
| `rows` | Estimated rows examined **per lookup** |
| `filtered` | Estimated % of those rows that survive the remaining conditions |
| `Extra` | Everything else (below) |

Estimated rows reaching the next table ≈ `rows × filtered / 100`. Above: 391,220 × 10% ≈ 39,122 orders, each looked up in `Customers` once.

---

# Access Types, Best to Worst

| `type` | Meaning |
|--------|---------|
| `system` / `const` | At most one row, read once (primary or unique key = constant) |
| `eq_ref` | One row per previous-row combination via a unique key (ideal join) |
| `ref` | Several rows per lookup via a non-unique index or key prefix |
| `fulltext` | Full-text index |
| `ref_or_null` | Like `ref`, plus a search for `NULL` |
| `index_merge` | Several indexes combined (union/intersection) |
| `unique_subquery` / `index_subquery` | Index lookup replacing an `IN` subquery |
| `range` | Index range scan (`BETWEEN`, `<`, `>`, `IN`, `LIKE 'abc%'`) |
| `index` | Full scan of an index (cheaper than the table only if covering or ordered) |
| `ALL` | **Full table scan** |

`ALL` on a large table that is not the first table in the join is usually the worst case: a full scan per row of the previous tables (in practice MySQL 8.0.18+ uses a hash join instead—see `Extra`).

---

# Important Extra Values

| `Extra` | Meaning | Good or bad? |
|---------|---------|--------------|
| `Using index` | Covering: answered from the index alone | Good |
| `Using index condition` | Index condition pushdown: some `WHERE` checked inside the storage engine using index columns | Good |
| `Using where` | Rows filtered after reading | Neutral; bad with large `rows` |
| `Using filesort` | An explicit sort (memory or disk), not "a file" necessarily | Watch for large inputs |
| `Using temporary` | An internal temporary table (`GROUP BY`, `DISTINCT`, `UNION`) | Watch for large inputs |
| `Using join buffer (hash join)` | Hash join (8.0.18+); earlier `Block Nested Loop` | Fine for big joins; check for a missing index |
| `Using index for group-by` | Loose index scan for `GROUP BY` / `MIN` / `MAX` | Good |
| `Backward index scan` | Index read in descending order | Fine |
| `Using MRR` | Multi-range read: lookups sorted by primary key | Good |
| `Select tables optimized away` | Answered from index metadata (e.g., `MIN(id)`) | Good |
| `Impossible WHERE` | Condition always false | Check your SQL |
| `Start temporary`, `End temporary`, `FirstMatch`, `LooseScan` | Semi-join strategies for `IN`/`EXISTS` | Neutral |

---

# key_len: How Much of the Index Is Used

```sql
-- ix_orders_customer_date (CustomerID INT, OrderDate DATE)
EXPLAIN SELECT * FROM Orders WHERE CustomerID = 42 AND OrderDate >= '2026-01-01';
-- key_len = 7   → INT (4) + DATE (3): both columns used
EXPLAIN SELECT * FROM Orders WHERE CustomerID = 42 AND YEAR(OrderDate) = 2026;
-- key_len = 4   → only CustomerID; the function on OrderDate is a filter, not a seek
```

Typical sizes: `INT` 4, `BIGINT` 8, `DATE` 3, `DATETIME` 5 (+ fractional seconds), `VARCHAR(n)` n × bytes-per-character + 2; add 1 for each nullable column.

---

# FORMAT=TREE (8.0.16+)

The tree format shows the iterator plan MySQL actually executes, with the same leaves-up reading as other engines:

```sql
EXPLAIN FORMAT=TREE
SELECT c.Country, SUM(o.TotalAmount) AS Revenue
FROM Orders o JOIN Customers c ON c.CustomerID = o.CustomerID
WHERE o.OrderDate >= '2026-09-01'
GROUP BY c.Country;
```

```text
-> Table scan on <temporary>
    -> Aggregate using temporary table
        -> Nested loop inner join  (cost=312840 rows=146500)
            -> Index range scan on o using ix_orders_orderdate over ('2026-09-01' <= OrderDate), with index condition: (o.OrderDate >= DATE'2026-09-01')  (cost=164100 rows=146500)
            -> Single-row index lookup on c using PRIMARY (CustomerID = o.CustomerID)  (cost=0.25 rows=1)
```

Common iterator names:

```text
Table scan on t                          full scan                      (type ALL)
Index scan on t using ix                 full index scan                (type index)
Index range scan on t using ix over (…)  range                          (type range)
Index lookup on t using ix (col = …)     ref
Single-row index lookup on t using PK    eq_ref
Covering index lookup / range scan       … with Using index
Filter: (condition)                      rows filtered after reading
Nested loop inner join / left join / semijoin / antijoin
Inner hash join (a = b)  -> … -> Hash    hash join; the input under "Hash" is the build side
Sort: col DESC  /  Sort: col, limit input to 10 row(s) per chunk
Aggregate using temporary table  /  Group aggregate  /  Stream results
Limit: 10 row(s)
Materialize / Materialize CTE / Temporary table with deduplication
```

---

# EXPLAIN ANALYZE (8.0.18+)

```text
-> Nested loop inner join  (cost=312840 rows=146500) (actual time=0.09..1,404 rows=391,220 loops=1)
    -> Index range scan on o using ix_orders_orderdate over ('2026-09-01' <= OrderDate) …
         (cost=164100 rows=146500) (actual time=0.06..488 rows=391,220 loops=1)
    -> Single-row index lookup on c using PRIMARY (CustomerID = o.CustomerID)
         (cost=0.25 rows=1) (actual time=0.002..0.002 rows=1 loops=391,220)
```

| Part | Meaning |
|------|---------|
| `cost=… rows=…` | Estimated cost and rows |
| `actual time=0.06..488` | ms to first row .. all rows, **per loop**, inclusive of children |
| `rows=391,220` | Actual rows, **per loop** (average) |
| `loops=391,220` | Executions |

Same arithmetic as PostgreSQL: the customer lookup took 0.002 ms × 391,220 ≈ 780 ms in total. Estimated 146,500 orders, actual 391,220: refresh statistics (`ANALYZE TABLE Orders`) or add a histogram (`ANALYZE TABLE Orders UPDATE HISTOGRAM ON OrderDate`).

---

# FORMAT=JSON

```text
"query_block": {
  "cost_info": { "query_cost": "312840.10" },
  "table": {
    "table_name": "o", "access_type": "range", "key": "ix_orders_orderdate",
    "used_key_parts": ["OrderDate"],
    "rows_examined_per_scan": 146500, "rows_produced_per_join": 14650, "filtered": "10.00",
    "index_condition": "(`o`.`OrderDate` >= DATE'2026-09-01')",
    "cost_info": { "read_cost": "…", "eval_cost": "…", "prefix_cost": "…", "data_read_per_join": "…" },
    "used_columns": ["OrderID", "CustomerID", "OrderDate", "TotalAmount", "Status"],
    "attached_condition": "(`o`.`Status` = 'Pending')"
```

JSON adds `used_key_parts` (clearer than `key_len`), `attached_condition` (the filter applied after reading), `used_columns` (why an index is not covering) and the cost breakdown.

---

# A Complete Worked Example

```sql
EXPLAIN
SELECT EmployeeID, FirstName, LastName
FROM Employees
WHERE DepartmentID = 7
ORDER BY LastName
LIMIT 20;
```

```text
id select_type table     type possible_keys key  key_len ref  rows  filtered Extra
1  SIMPLE      Employees ALL  NULL          NULL NULL    NULL 20000 10.00    Using where; Using filesort
```

`type = ALL`, `key = NULL`: no usable index, every one of 20,000 rows read; `Using filesort`: all matching rows sorted to return 20. After `CREATE INDEX ix_emp_dept_lastname ON Employees (DepartmentID, LastName)`:

```text
id select_type table     type possible_keys        key                  key_len ref   rows filtered Extra
1  SIMPLE      Employees ref  ix_emp_dept_lastname ix_emp_dept_lastname 4       const 210  100.00   NULL
```

`type = ref` on the department, no filesort (the index delivers `LastName` order), and the `LIMIT` stops after 20 index entries plus lookups.

---

# Visual Representation

```text
TRADITIONAL (one row per table, in join order)
  type      const/eq_ref ─ ref ─ range ─ index ─ ALL        best ─────────▶ worst
  key       chosen index; key_len = how many key columns are used
  rows × filtered%  ≈ rows passed to the next table
  Extra     Using index ✔ · Using index condition ✔ · Using filesort / temporary ⚠ · join buffer

TREE / ANALYZE (iterators, leaves up)
  -> parent  (cost rows) (actual time=first..last rows=per-loop loops=n)
      -> child 1 (outer)
      -> child 2 (inner; or "Hash" = build side)
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← one EXPLAIN row per table; type = access method
2. JOIN        ← row order = join order; Nested loop / hash join iterators
3. WHERE       ← Using index condition (pushed into the index) or Using where / Filter
4. GROUP BY    ← Using temporary / Aggregate using temporary table / Using index for group-by
5. HAVING      ← Filter above the aggregate
6. WINDOW      ← Window aggregate / Window multi-pass iterators
7. SELECT      ← used_columns (JSON) decide whether Using index is possible
8. DISTINCT    ← Using temporary / Temporary table with deduplication
9. ORDER BY    ← Using filesort / Sort, or index order (no filesort)
10. LIMIT / FETCH / TOP   ← Limit: N row(s)
```

---

# How the DBMS Executes This

```text
MySQL 8.0 executes every query with the iterator executor:
  optimizer → access paths → iterator tree (what FORMAT=TREE prints)
  EXPLAIN ANALYZE wraps every iterator with timing/row counters, runs the query,
  discards the rows, prints the tree with actual time, rows and loops
  The traditional table is a flattened view of the same plan, one row per table.
```

---

# 🏗️ Architecture Insight

InnoDB tables are clustered by primary key, and every secondary index contains the primary key. That is why `Using index` is possible with secondary indexes that "don't include" the primary key column, and why a short primary key keeps every secondary index—and every lookup—cheaper (Section 10.04).

---

# ⚡ Performance Tip

Scan the `type` and `Extra` columns first. `ALL` on a large table, `Using filesort` or `Using temporary` with large `rows`, and `key_len` shorter than the composite index you expected account for most MySQL plan problems.

---

# 🌍 Production Consideration

MySQL does not cache plans: each execution is optimized again, so `EXPLAIN` on the same SQL text and values is close to what runs. But estimates come from InnoDB index dives and sampled statistics; after large data changes run `ANALYZE TABLE`, and for skewed non-indexed columns add histograms.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Tabular per-table plan | ❌ | ❌ | ✅ (traditional) | ❌ | Tabular per operator | ❌ |
| Access-type ranking column | ❌ | ❌ | ✅ (`type`) | ❌ | ❌ | ❌ |
| Index key length used | ❌ | `Index Cond` shows columns | `key_len`, `used_key_parts` | Seek Keys | `access()` predicates | `(col=? AND col>?)` |
| Covering index marker | ❌ | `Index Only Scan` | `Using index` | No Key Lookup | No `TABLE ACCESS BY INDEX ROWID` | `COVERING INDEX` |
| Actual rows | ❌ | ✅ | `EXPLAIN ANALYZE` | ✅ | ✅ | Limited |

> **Portability Tip:** MySQL's `type` column is a handy mental scale for any engine: constant lookup, unique join lookup, non-unique lookup, range, full index scan, full table scan.

---

# Common Mistakes

### Mistake 1

Reading `Using filesort` as "sorted on disk"—it means "sorted explicitly", possibly in memory.

---

### Mistake 2

Assuming `key` is used fully without checking `key_len` or `used_key_parts`.

---

### Mistake 3

Treating `rows` as the rows returned rather than rows examined per lookup.

---

### Mistake 4

Using only the traditional table and missing the iterator details in `FORMAT=TREE`.

---

# Best Practices

✔ Read `type`, `key`, `key_len`, `rows`, `filtered` and `Extra` for every table.

✔ Use `FORMAT=TREE` for structure and `EXPLAIN ANALYZE` for actuals.

✔ Prefer `ref`/`eq_ref`/`range` with `Using index` on hot paths.

✔ Remove `Using filesort` from top-N queries with an index in `ORDER BY` order.

✔ Refresh statistics and add histograms when estimates and actuals diverge.

---

# Interview Questions

## Basic

1. What does `type = ALL` mean?
2. What does `Using index` mean in `Extra`?
3. What is the order of rows in a traditional `EXPLAIN`?

## Intermediate

4. How do you use `key_len` to see whether both columns of a composite index are used?
5. What is the difference between `Using index condition` and `Using where`?
6. What does `Using join buffer (hash join)` indicate?

## Advanced

7. Explain why `rows × filtered` matters for the next table in the join.
8. Compare the information in the traditional `EXPLAIN`, `FORMAT=TREE` and `EXPLAIN ANALYZE`.

---

# Hands-on Exercises

## Exercise 1

Find a query with `Using filesort` and remove it with a composite index that matches the filter and the order.

---

## Exercise 2

Compare `key_len` for a sargable and a non-sargable predicate on the second column of a composite index.

---

## Exercise 3

Run `EXPLAIN ANALYZE` on a join and compute the total time of the inner lookup from per-loop time and loops.

---

# Related Topics

- **16.02 — Getting a Plan (EXPLAIN, Estimated and Actual Plans)**
- **16.03 — Plan Structure (Operators, Trees and Data Flow)**
- **16.08 — Table Access Operators (Scans, Seeks, Lookups and Bitmaps)**
- **10.05 — Composite Indexes and Column Order**
- **06.12 — SARGability and Index-Friendly Predicates**

---

# Summary

MySQL offers three views of the same plan. The traditional table lists one row per table in join order, with the access `type` from `const` to `ALL`, the chosen `key` and how many bytes of it are used, estimated `rows` and `filtered`, and `Extra` flags such as `Using index`, `Using index condition`, `Using filesort` and `Using temporary`. `FORMAT=TREE` shows the iterator tree MySQL actually executes, and `EXPLAIN ANALYZE` adds actual time, rows and loops per iterator, with PostgreSQL-style per-loop arithmetic. JSON adds used key parts, attached conditions, used columns and cost details.
