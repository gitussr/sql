---
title: "13.14 - Execution Flow of Date and Time Functions"
description: "How engines process date and time expressions: literal binding and implicit conversion using session settings, stable versus volatile functions and when CURRENT_TIMESTAMP is evaluated, constant folding of date boundaries, sargable and non-sargable placement, cardinality estimates for date ranges and ascending keys, per-row cost of formatting and time zone conversion, and reading date predicates in execution plans."
chapter: 13
section: 13.14
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 13.14 Execution Flow of Date and Time Functions

---

# Learning Objectives

After completing this section, you will be able to:

- Trace how a date literal is typed and converted.
- Explain when "now" functions are evaluated and why that matters for plans.
- Identify which date expressions the optimizer folds into constants.
- Read date predicates in execution plans as seek predicates or filters.
- Recognise estimation problems specific to date columns.

---

# The Pipeline

```text
SQL text
   │
   ▼
1. PARSE        recognise literals, functions, operators
   │
   ▼
2. BIND         assign types: DATE column vs '2026-09-28' literal vs parameter
   │            insert implicit conversions (using session DATEFORMAT / NLS / DateStyle)
   ▼
3. SIMPLIFY     fold constants: DATE '2026-09-01' + INTERVAL '1 month' → 2026-10-01
   │            mark CURRENT_DATE - 30 as a run-time constant
   ▼
4. OPTIMIZE     bare column vs constant range → index seek predicate
   │            function on column → residual filter (unless an expression index matches)
   │            estimate rows from histograms of the date column
   ▼
5. EXECUTE      compute boundaries once; evaluate per-row expressions at their operator
```

---

# Step 2: Binding Literals

```sql
WHERE OrderDate >= '2026-09-01'
```

The literal is text. The engine must decide what it means:

| Engine | What happens |
|--------|--------------|
| PostgreSQL | Untyped literal takes the column's type (`date`) and is parsed once, using `DateStyle` if ambiguous |
| MySQL | String compared with `DATE`: converted to a date once (year-first formats only) |
| SQL Server | `varchar` has lower precedence than `date`, so the literal is converted once, using `DATEFORMAT` |
| Oracle | Converted with `NLS_DATE_FORMAT`; fails or misreads if it does not match—use `DATE '…'` |
| SQLite | Compared as **text**: works only if both sides use the same ISO format |

The dangerous case is the reverse: a **column** of text compared with a date value. Then the column is converted per row, the index is lost, and bad rows can raise errors (Section 12.08).

---

# Step 3: When Is "Now" Evaluated?

`CURRENT_TIMESTAMP`, `NOW()`, `GETDATE()` and `SYSDATE` are **stable** within a statement (PostgreSQL: within a transaction). The optimizer can treat them like parameters: unknown at compile time, constant at run time.

```sql
WHERE CreatedAt >= NOW() - INTERVAL '1 day'
```

```text
compile time:  NOW() - INTERVAL '1 day'  →  "run-time constant"  → plan an index range seek
run time:      compute it once at statement start → seek from that value
```

**Volatile** functions—PostgreSQL `clock_timestamp()`, MySQL `SYSDATE()`, `RANDOM()`—change per call. The engine must evaluate them per row, so they cannot drive an index seek:

```sql
-- MySQL
WHERE CreatedAt >= SYSDATE() - INTERVAL 1 DAY   -- full scan: SYSDATE() is re-evaluated per row
WHERE CreatedAt >= NOW()     - INTERVAL 1 DAY   -- index range seek
```

(MySQL's `--sysdate-is-now` option makes `SYSDATE()` behave like `NOW()`.)

---

# Step 3: Constant Folding

Expressions made only of literals are computed once during planning:

```sql
WHERE OrderDate >= DATE '2026-09-01'
  AND OrderDate <  DATE '2026-09-01' + INTERVAL '1 month'    -- folded to 2026-10-01
```

Expressions involving parameters or stable functions are computed once per execution. Either way, the column side stays bare and the predicate is a range.

---

# Step 4: Placement

```text
predicate                                        becomes
───────────────────────────────────────────────  ─────────────────────────────────────
OrderDate >= :s AND OrderDate < :e               Seek Predicate (index range)
CreatedAt >= NOW() - INTERVAL '1 day'            Seek Predicate
YEAR(OrderDate) = 2026                           Predicate / Filter (every row)
CAST(CreatedAt AS DATE) = :d                     SQL Server: dynamic range seek · others: Filter
DATE_TRUNC('month', OrderDate) = :m              Filter (unless expression index)
TO_CHAR(OrderDate, 'YYYY-MM') = '2026-09'        Filter, plus a string built per row
CreatedAt AT TIME ZONE 'Asia/Kolkata' >= :local  Filter, plus a zone lookup per row
```

Plans show the difference directly:

```text
-- PostgreSQL, range predicate
Index Scan using ix_orders_orderdate on orders
  Index Cond: ((orderdate >= '2026-09-01'::date) AND (orderdate < '2026-10-01'::date))

-- PostgreSQL, function on the column
Seq Scan on orders
  Filter: (EXTRACT(year FROM orderdate) = '2026'::numeric)
  Rows Removed by Filter: 4,812,330
```

---

# Step 4: Estimating Date Ranges

The optimizer estimates how many rows a date range returns from the column's **histogram**. Two date-specific problems:

**1. The ascending key problem.** New rows always have the latest dates. Statistics gathered last night do not know about today's rows, so a query for "orders since this morning" is estimated at ~0 rows even when there are thousands—leading to nested loops that should have been hash joins.

```text
histogram max = 2026-09-27 (stats from last night)
WHERE CreatedAt >= '2026-09-28'   → estimated 1 row, actual 18,400
```

Engines mitigate this differently: SQL Server's newer cardinality estimator assumes some rows beyond the histogram, PostgreSQL probes the index for the actual maximum value during planning, and Oracle extrapolates within limits. Frequent statistics updates on tables with ascending date keys still help.

**2. Functions hide the column.** For `YEAR(OrderDate) = 2026` the optimizer has no histogram on the expression and guesses a fixed selectivity. PostgreSQL extended statistics on expressions (14+) or an expression index give it real statistics.

---

# Step 5: Per-Row Cost

```text
operation                                   relative cost per row
──────────────────────────────────────────  ─────────────────────
compare bare DATE with constant             1   (integer compare)
date + integer days                         1
EXTRACT / DATEPART                          ~2–5 (civil calendar arithmetic)
DATE_TRUNC                                  ~2–5
+ INTERVAL '1 month'                        ~5 (month arithmetic, end-of-month rule)
AT TIME ZONE 'region'                       ~10–50 (rule lookup, offset search)
TO_CHAR / FORMAT with names                 ~20–100 (string building, locale lookup)
SQL Server FORMAT()                         much higher (.NET call per row)
```

The numbers are indicative, but the order matters: comparisons are cheap, formatting and zone conversion are expensive. Apply expensive functions to as few rows as possible—after filtering, after aggregation, after `LIMIT`.

---

# Visual Representation

```text
         WHERE CreatedAt >= NOW() - INTERVAL '1 day'  AND  EXTRACT(HOUR FROM CreatedAt) = 9
                     │                                        │
      bind: timestamptz vs timestamptz ✓            no index on the expression
      simplify: NOW()-1 day = run-time constant                │
                     ▼                                        ▼
            Index Range Seek on CreatedAt ──────────▶ Filter: EXTRACT(HOUR …) = 9
                     (reads 1 day of rows)                 (evaluated on those rows only)
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← set-returning functions (generate_series) evaluated here
2. JOIN        ← date expressions in ON evaluated per candidate pair
3. WHERE       ← stable boundaries computed once; column functions per row
4. GROUP BY    ← bucket expressions evaluated per row before hashing or sorting
5. HAVING
6. WINDOW
7. SELECT      ← formatting evaluated per output row
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP   ← format after this in an outer query to format fewer rows
```

---

# How the DBMS Executes This

```text
EXPLAIN checklist for a date query:
  □ Is the date predicate an Index Cond / Seek Predicate?          (should be)
  □ Is there a CONVERT_IMPLICIT or cast on the COLUMN side?        (should not be)
  □ Are estimated rows close to actual rows for the date range?    (ascending key?)
  □ Is a volatile function (SYSDATE(), clock_timestamp()) in WHERE? (replace it)
  □ Is formatting or AT TIME ZONE applied before aggregation?      (move it later)
```

---

# 🏗️ Architecture Insight

Execution plans are cached and reused. A plan built for `@start = yesterday` (few rows) may be reused for `@start = last year` (millions of rows)—parameter sensitivity is common with date ranges. Reports with widely varying ranges may need plan hints, recompilation, or separate queries for "recent" and "historical" ranges.

---

# ⚡ Performance Tip

When a query must return formatted dates, format in an outer query over the already-filtered, already-aggregated, already-limited rows:

```sql
SELECT TO_CHAR(Day, 'FMDay DD Mon') AS Label, Revenue
FROM (SELECT OrderDate AS Day, SUM(TotalAmount) AS Revenue
      FROM Orders WHERE OrderDate >= :s AND OrderDate < :e
      GROUP BY OrderDate) AS t
ORDER BY Day;
```

---

# 🌍 Production Consideration

Session settings change binding. The same SQL text can bind `'03/04/2026'` differently for two application servers with different `DATEFORMAT`, language or `NLS` settings—and SQL Server caches plans per set of such options, so it can also create duplicate plans. Use typed parameters and ISO literals so binding never depends on the session.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| "Now" stable for | Statement | Transaction | Statement | Per reference, per query | Statement | Statement |
| Volatile clock | ❌ | `clock_timestamp()` | `SYSDATE()` | — | — | — |
| Implicit conversion shown in plan | ❌ | Cast in `Index Cond`/`Filter` | Warnings | `CONVERT_IMPLICIT` | `INTERNAL_FUNCTION` | — |
| Expression statistics | ❌ | Extended statistics (14+) | Functional index / generated column | Computed column stats | Virtual column / extended stats | ❌ |
| Ascending key mitigation | ❌ | Actual max from index at plan time | Histogram updates | CE assumptions, trace flags | Extrapolation | ❌ |

> **Portability Tip:** The execution rules are the same everywhere: bare column plus constant boundary seeks, function on the column filters. Plans look different, but the diagnosis does not.

---

# Common Mistakes

### Mistake 1

Using a volatile clock (`SYSDATE()`, `clock_timestamp()`) in `WHERE`.

---

### Mistake 2

Relying on session settings to interpret date literals.

---

### Mistake 3

Ignoring estimate-versus-actual gaps on recent date ranges.

---

### Mistake 4

Formatting or converting time zones before filtering and aggregating.

---

# Best Practices

✔ Compare bare date columns with stable, constant boundaries.

✔ Use typed literals and parameters of the column's type.

✔ Update statistics frequently on tables with ascending date keys.

✔ Apply expensive date functions last, to the fewest rows.

✔ Check plans for seek predicates and implicit conversions.

---

# Interview Questions

## Basic

1. When is `CURRENT_TIMESTAMP` evaluated in a query?
2. What does the optimizer do with `DATE '2026-09-01' + INTERVAL '1 month'`?
3. What is a seek predicate?

## Intermediate

4. Why does MySQL `SYSDATE()` in `WHERE` prevent index use?
5. How do you see an implicit conversion in a SQL Server plan?
6. Why is `TO_CHAR` in `WHERE` doubly expensive?

## Advanced

7. Explain the ascending key problem.
8. Why can one cached plan be bad for different date ranges?

---

# Hands-on Exercises

## Exercise 1

Compare the plans of `YEAR(OrderDate) = 2026` and the half-open range version.

---

## Exercise 2

On MySQL, compare the plans for `NOW()` and `SYSDATE()` in a "last day" filter.

---

## Exercise 3

Insert a day of new rows without updating statistics and compare estimated and actual rows for a "today" query.

---

# Related Topics

- **13.15 — Date and Time Performance and Index Strategy**
- **12.14 — Execution Flow of Scalar Functions**
- **10.12 — Selectivity, Cardinality and Statistics**
- **06.11 — Execution Flow of WHERE**
- **16.xx — Reading Execution Plans**

---

# Summary

A date expression is parsed, bound to types (converting literals with session settings), simplified (folding constants and treating stable "now" functions as run-time constants), placed in the plan as a seek predicate or a filter, and evaluated either once or per row. Bare columns compared with constant boundaries become index seeks; functions on the column, volatile clocks and implicit conversions on the column side become per-row filters. Date columns also suffer from the ascending key estimation problem, and formatting and time-zone conversion are the most expensive per-row operations, so apply them last.
