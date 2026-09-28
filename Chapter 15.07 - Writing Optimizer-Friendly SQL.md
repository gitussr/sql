---
title: "15.07 - Writing Optimizer-Friendly SQL"
description: "SQL habits that help the optimizer: sargable predicates, matching data types and parameter types, selecting only needed columns, avoiding functions and arithmetic on indexed columns, NOT EXISTS instead of nullable NOT IN, UNION ALL instead of UNION, avoiding OR across columns and catch-all queries, set-based operations instead of row-by-row loops and N+1 queries, limiting scalar UDFs, avoiding unnecessary DISTINCT and ORDER BY, and keeping queries small enough to optimize."
chapter: 15
section: 15.07
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 30 min
lastUpdated: 2026-09-28
---

# 15.07 Writing Optimizer-Friendly SQL

---

# Learning Objectives

After completing this section, you will be able to:

- Write predicates the optimizer can use for index seeks and good estimates.
- Avoid type mismatches that silently disable indexes.
- Choose constructs that give the optimizer freedom (`NOT EXISTS`, `UNION ALL`).
- Replace catch-all and `OR`-heavy queries with plannable alternatives.
- Replace row-by-row and N+1 access with set-based SQL.

---

# 1. Keep Indexed Columns Bare

The single most important habit (Sections 06.12, 12.15, 13.15):

| Instead of | Write |
|------------|-------|
| `WHERE YEAR(OrderDate) = 2026` | `WHERE OrderDate >= '2026-01-01' AND OrderDate < '2027-01-01'` |
| `WHERE UPPER(Email) = 'A@X.COM'` | `WHERE Email = 'a@x.com'` (normalized on write) or an expression index |
| `WHERE TotalAmount * 1.18 > 1000` | `WHERE TotalAmount > 1000 / 1.18` |
| `WHERE SUBSTRING(Code, 1, 3) = 'ABC'` | `WHERE Code LIKE 'ABC%'` |
| `WHERE COALESCE(Status, 'New') = 'New'` | `WHERE Status = 'New' OR Status IS NULL` |
| `WHERE DATEDIFF(day, OrderDate, @today) < 30` | `WHERE OrderDate > DATEADD(day, -30, @today)` |

Bare columns give the optimizer both an index seek **and** real statistics for the estimate.

---

# 2. Match Types

```sql
-- EmployeeCode VARCHAR(20), indexed
WHERE EmployeeCode = N'E-1042'              -- ❌ SQL Server: NVARCHAR literal → CONVERT_IMPLICIT on the column → scan
WHERE EmployeeCode = 'E-1042'               -- ✅

-- Phone VARCHAR(30), indexed
WHERE Phone = 5550102030                    -- ❌ MySQL/SQL Server/Oracle: column converted to a number → scan (and errors)
WHERE Phone = '5550102030'                  -- ✅

-- CustomerID INT
WHERE CustomerID = '42'                     -- ✅ usually fine: the literal is converted once
```

The rule (Section 12.08): the **column** must not be converted. Make literals, parameters and join columns the column's type. In application code, declare parameter types and lengths explicitly—many drivers send all strings as Unicode by default.

---

# 3. Select Only What You Need

```sql
SELECT * FROM Orders WHERE CustomerID = :c;                 -- ❌ every column: lookups, wide rows, more network
SELECT OrderID, OrderDate, TotalAmount FROM Orders WHERE CustomerID = :c;   -- ✅ can be covered by an index
```

`SELECT *` prevents covering indexes, widens sorts and hash tables (more memory, more spills), sends unused bytes over the network, and breaks when columns are added. In `EXISTS (SELECT * …)`, `*` is harmless—no columns are read.

---

# 4. Prefer NOT EXISTS to NOT IN on Nullable Columns

```sql
-- ❌ If any Orders.CustomerID is NULL, returns no rows; also blocks a plain anti-join
SELECT * FROM Customers WHERE CustomerID NOT IN (SELECT CustomerID FROM Orders);

-- ✅ Correct and plannable as an anti-join
SELECT * FROM Customers AS c
WHERE NOT EXISTS (SELECT 1 FROM Orders AS o WHERE o.CustomerID = c.CustomerID);
```

---

# 5. UNION ALL Unless You Need Deduplication

```sql
SELECT OrderID FROM Orders2025 UNION     SELECT OrderID FROM Orders2026;   -- sorts or hashes to remove duplicates
SELECT OrderID FROM Orders2025 UNION ALL SELECT OrderID FROM Orders2026;   -- simply concatenates
```

When the branches cannot overlap, `UNION ALL` gives the same result without the deduplication step.

---

# 6. Avoid OR Across Different Columns

```sql
-- ⚠ One index cannot serve both conditions; may scan
SELECT * FROM Customers WHERE Email = :e OR Phone = :p;

-- ✅ Two seeks
SELECT * FROM Customers WHERE Email = :e
UNION
SELECT * FROM Customers WHERE Phone = :p;
```

Some optimizers do this themselves (Section 15.04); check the plan before rewriting.

---

# 7. Avoid Catch-All Queries

Search screens often produce one query for every combination of optional filters:

```sql
-- ❌ One plan must serve every combination; usually a scan
SELECT * FROM Orders
WHERE (@CustomerID IS NULL OR CustomerID = @CustomerID)
  AND (@Status     IS NULL OR Status     = @Status)
  AND (@From       IS NULL OR OrderDate >= @From);
```

The cached plan cannot use the `CustomerID` index when `@CustomerID` is `NULL`, so it typically scans for everyone. Options:

```sql
-- ✅ Build SQL with only the supplied filters (parameterized, never concatenated values)
--    e.g. "SELECT … FROM Orders WHERE CustomerID = @CustomerID AND OrderDate >= @From"

-- ✅ SQL Server: recompile per execution so NULL branches are removed
… OPTION (RECOMPILE);
```

Dynamic SQL with parameters gives each combination its own well-fitted, cached plan.

---

# 8. Think in Sets, Not Loops

```text
❌ Application loop (N+1 problem):
   SELECT * FROM Orders WHERE OrderDate = today;           -- 1 query → 5,000 orders
   for each order:
       SELECT * FROM OrderItems WHERE OrderID = ?;         -- 5,000 queries, 5,000 round trips

✅ One set-based query:
   SELECT o.OrderID, oi.ProductID, oi.Quantity
   FROM Orders AS o JOIN OrderItems AS oi ON oi.OrderID = o.OrderID
   WHERE o.OrderDate = today;
```

The same applies inside the database: cursors and `WHILE` loops that process one row at a time are almost always slower than a single `UPDATE … FROM`, `MERGE` or `INSERT … SELECT`. ORMs cause N+1 patterns through lazy loading; use eager loading or explicit joins for lists.

---

# 9. Be Careful With Scalar User-Defined Functions

```sql
SELECT OrderID, dbo.CustomerTier(CustomerID) FROM Orders;   -- UDF runs a query per row
```

Scalar UDFs that read tables execute once per row and hide their cost from the optimizer (Section 12.13). SQL Server 2019+ can inline many of them; PostgreSQL inlines simple `LANGUAGE sql` functions. Otherwise, rewrite as a join or an inline table-valued function.

---

# 10. Drop Unnecessary Work

```sql
SELECT DISTINCT o.OrderID, … FROM Orders o JOIN OrderItems oi …   -- DISTINCT hiding fan-out: use EXISTS
SELECT … ORDER BY …   (in a subquery or when the app re-sorts anyway)  -- unnecessary sort
SELECT COUNT(*) FROM big_table WHERE …   just to check existence       -- use EXISTS
```

```sql
-- ❌ Counts every matching row
IF (SELECT COUNT(*) FROM Orders WHERE CustomerID = @c) > 0 …
-- ✅ Stops at the first match
IF EXISTS (SELECT 1 FROM Orders WHERE CustomerID = @c) …
```

---

# 11. Keep Queries Plannable

- Very large queries (dozens of joins, deeply nested views) exceed optimizer search limits (Section 15.02). Break them into steps with temporary tables.
- Many layers of views can hide unnecessary joins and repeated work; flatten hot paths.
- Very long `IN` lists (thousands of literals) bloat parsing and plan caching; pass a table-valued parameter, array or temporary table and join.

---

# Visual Representation

```text
   the optimizer can help you when …          and cannot when …
   ──────────────────────────────────         ──────────────────────────────────
   columns are bare                           columns are wrapped in functions
   types match                                the column must be converted
   you name the columns you need              you ask for SELECT *
   you ask one set-based question             you ask 5,000 tiny questions
   the query says exactly what it filters     one catch-all query serves every filter
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← fewer, narrower tables; no unnecessary views
2. JOIN        ← matching join column types; EXISTS for existence
3. WHERE       ← bare columns, matching types, no catch-all OR NULL patterns
4. GROUP BY    ← group by columns, not expressions, where possible
5. HAVING
6. WINDOW
7. SELECT      ← only needed columns (covering indexes, narrow sorts)
8. DISTINCT    ← only when duplicates are genuinely possible
9. ORDER BY    ← only when the caller needs the order
10. LIMIT / FETCH / TOP   ← ask for the rows you will show
```

---

# How the DBMS Executes This

```text
WHERE EmployeeCode = @code  (@code NVARCHAR, column VARCHAR)
  SQL Server plan: Index Scan, Predicate: CONVERT_IMPLICIT(nvarchar(20), [EmployeeCode], 0) = @code
  warning: "Type conversion in expression may affect SeekPlan"
WHERE EmployeeCode = @code  (@code VARCHAR(20))
  plan: Index Seek, Seek Keys: EmployeeCode = @code
```

---

# 🏗️ Architecture Insight

Many "SQL performance" problems are really data-access-layer problems: ORMs that load entire object graphs, lazy loading in loops, string parameters sent with the wrong type, pagination done in memory. Review the SQL the application actually sends—from logs or query statistics—not just the SQL you think it sends.

---

# ⚡ Performance Tip

A quick review heuristic: search your query text for functions applied to column names in `WHERE`/`ON`, for `SELECT *`, for `NOT IN (SELECT`, for `OR … IS NULL` parameter patterns, and for `DISTINCT` after joins. Each is a likely optimization target.

---

# 🔒 Security Note

Replacing catch-all queries with dynamic SQL must never mean concatenating user values into SQL text. Build the SQL structure dynamically, pass every value as a parameter, and validate any identifier (column name for sorting) against a fixed allow-list.

---

# SQL Standard vs Vendor Differences

| Habit | Why it matters everywhere | Engine specifics |
|-------|---------------------------|------------------|
| Bare columns | Seeks and statistics | Expression indexes differ (12.15) |
| Matching types | Avoid column conversion | SQL Server Unicode parameters; MySQL string/number comparison |
| `NOT EXISTS` | Correct with `NULL`s | All engines |
| `UNION ALL` | No dedup step | All engines |
| No catch-all | One plan per shape | `OPTION (RECOMPILE)` (SQL Server); custom plans (PostgreSQL) |
| Scalar UDFs | Per-row execution | Inlining: SQL Server 2019+, PostgreSQL SQL functions |

> **Portability Tip:** Optimizer-friendly SQL is portable SQL: bare columns, matching types, explicit column lists, `NOT EXISTS`, `UNION ALL` and set-based statements work well on every engine.

---

# Common Mistakes

### Mistake 1

Functions on indexed columns in `WHERE` and `ON`.

---

### Mistake 2

Parameters or literals of a different type than the column.

---

### Mistake 3

`SELECT *` in application queries.

---

### Mistake 4

Catch-all `(@p IS NULL OR col = @p)` queries.

---

### Mistake 5

N+1 query loops from the application.

---

# Best Practices

✔ Keep columns bare and types matched.

✔ Select only needed columns.

✔ Use `NOT EXISTS`, `UNION ALL` and `EXISTS` appropriately.

✔ Replace catch-all queries with parameterized dynamic SQL or recompilation.

✔ Use set-based SQL instead of loops and N+1 patterns.

---

# Interview Questions

## Basic

1. Why is `WHERE YEAR(OrderDate) = 2026` slow?
2. What is wrong with `SELECT *`?
3. What is the N+1 query problem?

## Intermediate

4. How can a parameter type make a query scan?
5. Why prefer `NOT EXISTS` over `NOT IN`?
6. Why are catch-all queries hard to optimize?

## Advanced

7. How would you implement an optional-filter search screen efficiently and safely?
8. When should you rewrite an `OR` as a `UNION`?

---

# Hands-on Exercises

## Exercise 1

Find five non-sargable predicates in your codebase and rewrite them.

---

## Exercise 2

Compare plans for a catch-all search query and a dynamically built parameterized version.

---

## Exercise 3

Replace an application loop of per-row queries with one set-based query and measure the difference.

---

# Related Topics

- **06.12 — SARGability and Index-Friendly Predicates**
- **12.08 — Type Conversion (CAST, CONVERT and TRY_CAST)**
- **12.13 — User-Defined Scalar Functions**
- **15.04 — Automatic Query Rewrites (Pushdown, Unnesting and Elimination)**
- **15.08 — Parameter Sniffing, Plan Caching and Prepared Statements**

---

# Summary

Optimizer-friendly SQL gives the optimizer accurate information and real choices: bare indexed columns with matching types (so seeks and statistics work), explicit column lists (so indexes can cover), `NOT EXISTS` instead of nullable `NOT IN`, `UNION ALL` when duplicates are impossible, `UNION` instead of `OR` across columns when needed, one plan per query shape instead of catch-all filters, set-based statements instead of loops and N+1 queries, and queries small enough to optimize. These habits are portable and fix a large share of performance problems before any index or hint is needed.
