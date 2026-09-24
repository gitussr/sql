---
title: "08.05 - GROUP BY Syntax and Semantics"
description: "GROUP BY in depth: clause placement, how rows are partitioned into groups, grouping on one column, what may appear in SELECT, GROUP BY without aggregates, GROUP BY versus DISTINCT, ordering grouped results, and aliases and ordinal positions."
chapter: 8
section: 8.05
category: Data Query Language (DQL)
difficulty: Beginner → Intermediate
readingTime: 35 min
lastUpdated: 2026-09-24
---

# 08.05 GROUP BY Syntax and Semantics

---

# Learning Objectives

After completing this section, you will be able to:

- Place `GROUP BY` correctly in a `SELECT` statement.
- Describe exactly how `GROUP BY` partitions rows.
- State which expressions may appear in the `SELECT` list of a grouped query.
- Explain the relationship between `GROUP BY` and `DISTINCT`.
- Order grouped results by a grouping column or an aggregate.
- Decide whether to group by aliases or ordinal positions.

---

# Clause Placement

```sql
SELECT      select_list
FROM        table_source
WHERE       row_condition
GROUP BY    grouping_expression [, ...]
HAVING      group_condition
ORDER BY    sort_expression [, ...]
LIMIT / FETCH ...
```

`GROUP BY` comes after `WHERE` and before `HAVING`. Writing the clauses in any other order is a syntax error on every engine.

---

# How GROUP BY Partitions Rows

`GROUP BY` places every input row into exactly one group: the group of rows whose grouping expressions are **not distinct** from its own.

```sql
SELECT
    Status,
    COUNT(*)         AS Orders,
    SUM(TotalAmount) AS Amount
FROM Orders
GROUP BY Status;
```

```text
Input rows                           Groups                     Output
┌─────┬───────────┬────────┐
│ 101 │ Shipped   │ 250.00 │ ─┐    ┌───────────────────┐
│ 102 │ Pending   │  80.00 │  │    │ Shipped           │      Shipped    3   870.00
│ 103 │ Shipped   │ 500.00 │ ─┼──→ │ 101, 103, 104     │ ──→
│ 104 │ Shipped   │ 120.00 │ ─┘    ├───────────────────┤
│ 105 │ Cancelled │  60.00 │ ────→ │ Cancelled  105    │ ──→  Cancelled  1    60.00
└─────┴───────────┴────────┘       ├───────────────────┤
                         102 ────→ │ Pending    102    │ ──→  Pending    1    80.00
                                   └───────────────────┘
```

Three properties follow:

1. **Every row belongs to exactly one group.** No row is lost, none is counted twice.
2. **Groups are never empty.** A group exists only because at least one row has that value.
3. **The number of output rows equals the number of distinct grouping values.**

---

# What May Appear in the SELECT List

After grouping, each output row represents a whole group. An expression in `SELECT` is valid only if it has **one value per group**:

| Expression | Valid? | Why |
|-----------|--------|-----|
| A grouping column: `Status` | ✅ | Same for every row in the group |
| An aggregate: `SUM(TotalAmount)` | ✅ | One value computed from the group |
| A constant: `'2026'` | ✅ | Same everywhere |
| An expression of the above: `UPPER(Status)`, `SUM(x) / COUNT(*)` | ✅ | Built from single-valued parts |
| A non-grouped column: `OrderID` | ❌ | Many values per group |

```sql
SELECT
    Status,
    UPPER(Status)                     AS StatusLabel,
    COUNT(*)                          AS Orders,
    ROUND(SUM(TotalAmount) / COUNT(*), 2) AS AvgAmount,
    'FY2026'                          AS FiscalYear
FROM Orders
GROUP BY Status;
```

Columns that are *functionally dependent* on the grouping columns are a refinement of this rule, covered in Section 08.07.

---

# Grouping Columns Need Not Be Selected

The grouping columns do not have to appear in the output:

```sql
SELECT COUNT(*) AS OrdersPerCustomer
FROM Orders
GROUP BY CustomerID;
```

```text
OrdersPerCustomer
─────────────────
2
2
1
```

Legal, but usually unhelpful: without the key, a reader cannot tell which number belongs to which customer. It is occasionally useful as a derived table feeding an outer aggregate—"the average number of orders per customer".

```sql
SELECT AVG(OrdersPerCustomer * 1.0) AS AvgOrdersPerCustomer
FROM (
    SELECT COUNT(*) AS OrdersPerCustomer
    FROM Orders
    GROUP BY CustomerID
) AS per_customer;
```

---

# GROUP BY Without Aggregates

A `GROUP BY` with no aggregate functions returns each distinct combination of the grouping columns once—exactly what `DISTINCT` does:

```sql
SELECT Country FROM Customers GROUP BY Country;
SELECT DISTINCT Country FROM Customers;
```

Both return one row per country, and most optimizers produce the same plan for both.

Prefer `DISTINCT` when you only want unique values; it states the intent. Use `GROUP BY` when you are computing something per group.

| Intent | Write |
|--------|-------|
| "Which countries appear?" | `SELECT DISTINCT Country` |
| "How many customers per country?" | `SELECT Country, COUNT(*) ... GROUP BY Country` |

Combining both—`SELECT DISTINCT Country, COUNT(*) ... GROUP BY Country`—is redundant: grouped rows are already unique on their grouping columns.

---

# Ordering Grouped Results

`GROUP BY` does **not** guarantee any order. Engines that group by sorting often return rows in key order, and engines that group by hashing do not—and the same engine may switch between the two as data grows.

```sql
-- ❌ Order depends on the plan
SELECT Status, COUNT(*) FROM Orders GROUP BY Status;

-- ✅ Order is guaranteed
SELECT Status, COUNT(*) AS Orders
FROM Orders
GROUP BY Status
ORDER BY Orders DESC, Status;
```

Because `ORDER BY` runs after `SELECT`, it can sort by an aggregate, by its alias, or by a grouping column. Adding a tie-breaker (here `Status`) makes the order fully deterministic.

---

# Aliases and Ordinal Positions in GROUP BY

Some engines let you group by a `SELECT` alias or by the position of a `SELECT` column:

```sql
-- Group by alias (PostgreSQL, MySQL, SQLite, Oracle 23ai+)
SELECT EXTRACT(YEAR FROM OrderDate) AS OrderYear, COUNT(*)
FROM Orders
GROUP BY OrderYear;

-- Group by position (PostgreSQL, MySQL, SQLite)
SELECT EXTRACT(YEAR FROM OrderDate) AS OrderYear, COUNT(*)
FROM Orders
GROUP BY 1;
```

Standard SQL allows neither, because `GROUP BY` logically runs before `SELECT`, where aliases are defined. The portable form repeats the expression:

```sql
SELECT EXTRACT(YEAR FROM OrderDate) AS OrderYear, COUNT(*) AS Orders
FROM Orders
GROUP BY EXTRACT(YEAR FROM OrderDate);
```

Ordinal positions are also fragile: inserting a column at the front of the `SELECT` list silently changes what the query groups by. Enterprise style guides commonly forbid them.

A trap specific to alias grouping: if an alias has the same name as a real column, engines disagree about which one `GROUP BY` means. PostgreSQL prefers the input column. Avoid giving an alias the name of an existing column.

---

# One Grouping Column, Many Aggregates

A single grouping pass can compute any number of aggregates:

```sql
SELECT
    o.CustomerID,
    COUNT(*)             AS Orders,
    SUM(o.TotalAmount)   AS Revenue,
    AVG(o.TotalAmount)   AS AvgOrder,
    MIN(o.OrderDate)     AS FirstOrder,
    MAX(o.OrderDate)     AS LastOrder
FROM Orders AS o
GROUP BY o.CustomerID;
```

All six aggregates are accumulated in the same pass over `Orders`. Computing them in six separate queries would read the table six times.

---

# Visual Representation

```text
FROM / WHERE                  GROUP BY Status                SELECT

rows ─────────────┐     ┌──── Shipped   : ▪ ▪ ▪   ──→   Shipped    3  870
                  ├────→├──── Pending   : ▪       ──→   Pending    1   80
                  │     └──── Cancelled : ▪       ──→   Cancelled  1   60
                  │
          each row → one group          each group → one row
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE
4. GROUP BY    ← You are here: rows are partitioned into groups
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

Because `GROUP BY` runs before `SELECT`, standard SQL cannot use `SELECT` aliases in it; because `ORDER BY` runs after, it can.

---

# How the DBMS Executes This

```text
SELECT Status, COUNT(*), SUM(TotalAmount)
FROM Orders
GROUP BY Status

Option A — Hash Aggregate
    build hash table keyed by Status
    for each row: probe → update accumulators
    emit one row per hash entry            (unordered)

Option B — Stream (Sorted) Aggregate
    read rows ordered by Status (index or sort)
    accumulate until Status changes → emit group
                                           (ordered by Status)
```

Which option the optimizer picks depends on the number of groups, available indexes and memory. Section 08.14 covers both in depth.

---

# 🔬 Engine Deep Dive

MySQL before 8.0 always grouped by sorting, so `GROUP BY` implied `ORDER BY`—and it even accepted `GROUP BY col DESC`. Version 8.0 removed both the implicit sort and the `ASC`/`DESC` syntax on `GROUP BY`. Applications that displayed grouped data "in order" without `ORDER BY` changed behaviour on upgrade with no error at all.

---

# 🏗️ Architecture Insight

`GROUP BY` defines the primary key of its result: the grouping columns are unique in the output. That makes a grouped query a natural source for a summary table—its grouping columns become the summary table's key, and a unique constraint on them will catch any change that alters the grain.

---

# ⚡ Performance Tip

Group by the narrowest column that identifies the group. `GROUP BY CustomerID` hashes a 4-byte integer; `GROUP BY CustomerName, Country` hashes two strings for the same groups. Join to the descriptive columns after aggregating, or include them via functional dependency (Section 08.07).

---

# 🌍 Production Consideration

Queries that rely on `GROUP BY` for order work in development, where tables are small and the optimizer sorts, and break in production, where the optimizer switches to hashing. Treat any grouped query without `ORDER BY` whose output reaches a user as a latent bug.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `GROUP BY` expression | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `GROUP BY` alias | ❌ | ✅ | ✅ | ❌ | ✅ (23ai+) | ✅ |
| `GROUP BY` ordinal position | ❌ | ✅ | ✅ | ❌ | ✅ (23ai+, with parameter) | ✅ |
| `GROUP BY` implies order | ❌ | ❌ | ❌ (8.0+) | ❌ | ❌ | ❌ |
| `ORDER BY` aggregate alias | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

> **Portability Tip:** Repeat the full expression in `GROUP BY` and use aliases only in `ORDER BY`. That form runs unchanged on every engine.

---

# Common Mistakes

### Mistake 1

Relying on `GROUP BY` to sort the result.

---

### Mistake 2

Selecting a non-grouped, non-aggregated column.

---

### Mistake 3

Grouping by ordinal position and later reordering the `SELECT` list.

---

### Mistake 4

Using `GROUP BY` with no aggregates where `DISTINCT` expresses the intent.

---

### Mistake 5

Adding `DISTINCT` to a grouped query "to remove duplicates" that cannot exist.

---

# Best Practices

✔ Every non-aggregated `SELECT` expression appears in `GROUP BY`.

✔ Add an explicit `ORDER BY` with a tie-breaker.

✔ Repeat expressions in `GROUP BY` rather than grouping by alias or position.

✔ Group by keys; attach descriptive columns afterwards.

✔ Compute all aggregates of the same grain in one query.

---

# Interview Questions

## Basic

1. Where does `GROUP BY` appear in a `SELECT` statement?
2. How many rows does a grouped query return?
3. Does `GROUP BY` sort its output?

## Intermediate

4. Which expressions are allowed in the `SELECT` list of a grouped query?
5. What is the difference between `GROUP BY Country` and `SELECT DISTINCT Country`?
6. Why can't standard SQL use a `SELECT` alias in `GROUP BY`?

## Advanced

7. Why is grouping by ordinal position risky?
8. Why might the same grouped query return rows in a different order after the table grows?
9. What happens when a `SELECT` alias has the same name as a real column that you group by?

---

# Hands-on Exercises

## Exercise 1

Return the number of orders and total amount per order status, sorted by total amount descending.

---

## Exercise 2

Return the number of customers per country using `GROUP BY`, then return the list of countries using `DISTINCT`.

---

## Exercise 3

Return the number of orders per order year, grouping by the expression rather than by its alias.

---

## Exercise 4

Compute the average number of orders per customer.

---

# Related Topics

- **08.01 — Introduction to Aggregation and Grouping**
- **08.06 — Grouping by Multiple Columns and Expressions**
- **08.07 — The SELECT List Rule (Functional Dependency)**
- **08.14 — Execution Flow of GROUP BY (Hash and Stream Aggregation)**
- **05.07 — DISTINCT**
- **05.05 — Column Aliases**

---

# Summary

`GROUP BY` follows `WHERE` and precedes `HAVING`, and partitions the input so that every row belongs to exactly one non-empty group; the output has one row per distinct grouping value. The `SELECT` list may contain only grouping expressions, aggregates, constants and expressions built from them. A `GROUP BY` without aggregates is equivalent to `DISTINCT`, grouped results are unordered unless `ORDER BY` says otherwise, and grouping by alias or ordinal position is a non-portable convenience that the standard form—repeating the expression—avoids.
