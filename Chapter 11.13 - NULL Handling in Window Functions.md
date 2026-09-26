---
title: "11.13 - NULL Handling in Window Functions"
description: "How NULLs behave in windows: NULL partition keys, NULL ordering and NULLS FIRST/LAST, NULLs in aggregate windows and empty frames, LAG/LEAD defaults versus NULL values, IGNORE NULLS, carrying the last non-null value forward portably, and NULL-safe ranking."
chapter: 11
section: 11.13
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 30 min
lastUpdated: 2026-09-25
---

# 11.13 NULL Handling in Window Functions

---

# Learning Objectives

After completing this section, you will be able to:

- Predict how `NULL` partition keys are grouped.
- Control where `NULL`s sort in window orderings.
- Predict aggregate window results with `NULL` values and empty frames.
- Distinguish a `LAG` default from a genuine `NULL` value.
- Carry the last non-null value forward with and without `IGNORE NULLS`.
- Rank nullable columns deliberately.

---

# NULL Partition Keys

`PARTITION BY` treats all `NULL` keys as **one partition**, exactly like `GROUP BY` (Section 08.04):

```sql
SELECT OrderID, CustomerID,
       COUNT(*) OVER (PARTITION BY CustomerID) AS OrdersInPartition
FROM Orders;
-- All guest orders (CustomerID NULL) share one partition and one count
```

That is different from joins, where `NULL` keys never match (Section 11.04). If guest orders should not be treated as one "customer", exclude them in `WHERE`, or partition by a substitute key:

```sql
PARTITION BY COALESCE(CAST(CustomerID AS VARCHAR(20)), 'guest-' || CAST(OrderID AS VARCHAR(20)))
```

which gives each guest order its own partition.

---

# NULLs in the Window ORDER BY

`NULL`s sort together, either first or last:

| Engine | `ASC` | `DESC` | `NULLS FIRST/LAST` |
|--------|-------|--------|--------------------|
| PostgreSQL | Last | First | ✅ |
| Oracle | Last | First | ✅ |
| MySQL | First | Last | ❌ |
| SQL Server | First | Last | ❌ |
| SQLite | First | Last | ✅ (3.30+) |

This decides who is "first" or "top":

```sql
-- PostgreSQL: contractors (Salary NULL) rank FIRST in a DESC ranking!
RANK() OVER (ORDER BY Salary DESC)

-- ✅ Explicit
RANK() OVER (ORDER BY Salary DESC NULLS LAST)

-- ✅ Portable
RANK() OVER (ORDER BY CASE WHEN Salary IS NULL THEN 1 ELSE 0 END, Salary DESC)
```

Or exclude `NULL`s from the ranking in `WHERE` if they should not be ranked at all. All `NULL`s are peers of each other (they tie).

---

# NULLs in Aggregate Windows

Aggregate windows follow the aggregate rules: `SUM`, `AVG`, `MIN`, `MAX`, `COUNT(col)` skip `NULL`s; `COUNT(*)` counts rows.

```text
Salary values in frame: 50, NULL, 70

SUM   = 120        AVG = 60  (120 / 2, not / 3)
COUNT(Salary) = 2  COUNT(*) = 3
```

A frame in which every value is `NULL`—or which is empty—gives `NULL` for `SUM`, `AVG`, `MIN`, `MAX` and `0` for counts:

```sql
SUM(Revenue) OVER (ORDER BY SalesDate ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING)
-- first row: empty frame → NULL
```

Running totals over data with `NULL`s simply skip them; if a missing value should count as zero, `COALESCE` it inside: `SUM(COALESCE(Revenue, 0)) OVER (…)`.

---

# LAG/LEAD: Default vs NULL Value

`LAG(x)` returns `NULL` in two different situations:

```text
1. There is no previous row (first row of the partition)   → default or NULL
2. The previous row exists, but its x is NULL              → NULL (default NOT used)
```

```sql
LAG(Reading, 1, 0) OVER (PARTITION BY SensorID ORDER BY ReadAt)
-- first row      → 0     (default)
-- previous NULL  → NULL  (the actual value)
```

To tell them apart, check for the existence of a previous row separately: `ROW_NUMBER() OVER (…) = 1` marks the first row.

---

# IGNORE NULLS

The SQL standard's `IGNORE NULLS` makes offset and value functions skip rows whose value is `NULL`:

```sql
-- Oracle, SQL Server 2022+: last known reading for every row
SELECT SensorID, ReadAt, Reading,
       LAST_VALUE(Reading) IGNORE NULLS OVER (PARTITION BY SensorID ORDER BY ReadAt
                                               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS LastKnown
FROM SensorReadings;
```

```text
ReadAt   Reading   LastKnown
10:00    20.5      20.5
10:05    NULL      20.5     ← carried forward
10:10    NULL      20.5
10:15    21.0      21.0
10:20    NULL      21.0
```

(Syntax placement varies: Oracle also accepts `LAST_VALUE(Reading IGNORE NULLS)`; SQL Server 2022 places `IGNORE NULLS` after the function's parentheses.)

---

# Carry Forward Without IGNORE NULLS

PostgreSQL, MySQL and SQLite lack `IGNORE NULLS`. The portable technique uses a running count of non-null values to form groups:

```sql
WITH Grouped AS (
    SELECT SensorID, ReadAt, Reading,
           COUNT(Reading) OVER (PARTITION BY SensorID ORDER BY ReadAt
                                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS grp
    FROM SensorReadings
)
SELECT SensorID, ReadAt, Reading,
       MAX(Reading) OVER (PARTITION BY SensorID, grp) AS LastKnown
FROM Grouped;
```

```text
ReadAt   Reading   grp (running COUNT of non-null)   LastKnown (MAX in grp)
10:00    20.5      1                                  20.5
10:05    NULL      1                                  20.5
10:10    NULL      1                                  20.5
10:15    21.0      2                                  21.0
10:20    NULL      2                                  21.0
```

`COUNT(Reading)` increases only on non-null rows, so each non-null value starts a group that includes the following `NULL`s; `MAX` over the group returns that value (the only non-null in it). Rows before the first non-null value get `NULL`—correct, nothing is known yet.

This is the flag-and-sum islands technique from Section 11.12 with "non-null value" as the island start.

---

# NULL-Safe Comparisons with LAG

Change detection with `<>` misses changes to or from `NULL`:

```sql
-- ❌ 'Pending' → NULL → 'Shipped': the NULL rows compare as UNKNOWN, not "changed"
CASE WHEN Status <> LAG(Status) OVER (…) THEN 1 ELSE 0 END

-- ✅ NULL-safe inequality
CASE WHEN Status IS DISTINCT FROM LAG(Status) OVER (…) THEN 1 ELSE 0 END    -- PostgreSQL, SQL Server 2022+, SQLite (IS NOT)
CASE WHEN NOT (Status <=> LAG(Status) OVER (…)) THEN 1 ELSE 0 END           -- MySQL
```

---

# Ranking Nullable Columns

```sql
-- Top 3 salaries per department, contractors excluded
SELECT *
FROM (
    SELECT e.*, DENSE_RANK() OVER (PARTITION BY DepartmentID ORDER BY Salary DESC) AS dr
    FROM Employees AS e
    WHERE e.Salary IS NOT NULL          -- decide explicitly
) AS t
WHERE t.dr <= 3;
```

Without the filter, the `NULL` salaries form one peer group that ranks first (PostgreSQL, Oracle) or last (MySQL, SQL Server, SQLite) in a descending ranking—so the same query returns different people on different engines.

---

# Visual Representation

```text
Readings:   20.5   NULL   NULL   21.0   NULL
COUNT so far: 1     1      1      2      2      ← groups
MAX in grp: 20.5  20.5   20.5   21.0   21.0    ← carried forward

LAG(Reading):  NULL  20.5  NULL  NULL  21.0
                 ▲           ▲
          no previous row   previous row's value is NULL
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← exclude NULL keys or values here if they should not participate
4. GROUP BY
5. HAVING
6. WINDOW      ← NULL keys form one partition; NULLs sort first or last; aggregates skip NULLs
7. SELECT
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
PARTITION BY k          : sort puts all NULL k together → one partition
ORDER BY v [NULLS …]    : NULL position fixed by engine default or explicit option
SUM / AVG / MIN / MAX   : accumulator ignores NULL inputs
LAG(x) IGNORE NULLS     : operator keeps the last non-NULL x seen in the partition
```

---

# 🔬 Engine Deep Dive

Implementing `IGNORE NULLS` for `LAG` with an offset greater than one requires the window operator to remember the last *n* non-null values rather than the last *n* rows—a small ring buffer that skips `NULL` inputs. It is a modest extension, which is why engines are gradually adding it; until then, the running-count grouping technique is the dependable fallback.

---

# 🏗️ Architecture Insight

Sparse measurements—sensors reporting only on change, prices recorded only when they move, status snapshots with gaps—are common in event-driven systems. "Last observation carried forward" is the standard way to turn them into dense series, and implementing it in SQL keeps the rule (how long a value remains valid, whether to carry across days) explicit and reviewable.

---

# ⚡ Performance Tip

The carry-forward technique uses two window passes with compatible orderings (`PARTITION BY SensorID ORDER BY ReadAt`, then `PARTITION BY SensorID, grp`); index `(SensorID, ReadAt)` so the first pass reads rows in order.

---

# 🔒 Security Note

Carrying forward values can make stale data look current. Where decisions depend on freshness (medical readings, prices), return the timestamp of the carried value alongside it so consumers can see its age.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `NULL` keys form one partition | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `NULLS FIRST/LAST` in window | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ (3.30+) |
| `IGNORE NULLS` (`LAG`/`LEAD`/`FIRST_VALUE`/`LAST_VALUE`) | ✅ | ❌ | ❌ | ✅ (2022+) | ✅ | ❌ |
| `IS DISTINCT FROM` | ✅ | ✅ | `<=>` | ✅ (2022+) | ✅ (23ai+) | `IS NOT` |

> **Portability Tip:** Order `NULL`s with a `CASE` expression and carry values forward with the running-count technique; both work on every engine.

---

# Common Mistakes

### Mistake 1

Letting `NULL`s rank first in a descending ranking on PostgreSQL or Oracle.

---

### Mistake 2

Treating all guest orders (`NULL` customer) as one customer in a partition.

---

### Mistake 3

Assuming the `LAG` default replaces `NULL` values from existing rows.

---

### Mistake 4

Detecting changes with `<>`, missing transitions to or from `NULL`.

---

### Mistake 5

Assuming `AVG` over a frame divides by the frame size including `NULL`s.

---

# Best Practices

✔ Decide whether `NULL` keys and values participate; filter in `WHERE` if not.

✔ State `NULLS FIRST/LAST` or use a `CASE` ordering.

✔ Use `IS DISTINCT FROM` (or equivalents) for change detection.

✔ Use `IGNORE NULLS` where available, the running-count technique elsewhere.

✔ `COALESCE` inside aggregates when missing values mean zero.

---

# Interview Questions

## Basic

1. How are `NULL` values in `PARTITION BY` treated?
2. Where do `NULL`s sort in a descending window order on PostgreSQL and SQL Server?
3. What does `SUM` over a frame containing `NULL`s return?

## Intermediate

4. When does `LAG(x, 1, 0)` return `NULL` instead of `0`?
5. What does `IGNORE NULLS` do?
6. How do you detect a status change that involves `NULL`?

## Advanced

7. How do you carry the last non-null value forward without `IGNORE NULLS`?
8. Why can the same ranking query return different rows on different engines?
9. How would you give each guest order its own partition?

---

# Hands-on Exercises

## Exercise 1

Rank employees by salary per department on your engine, with and without excluding contractors, and compare.

---

## Exercise 2

Carry forward the last known sensor reading using the running-count technique.

---

## Exercise 3

Flag status changes in a history containing `NULL` statuses, with `<>` and with a `NULL`-safe comparison.

---

## Exercise 4

Show the difference between `LAG(x, 1, 0)` on the first row and on a row whose predecessor has `x = NULL`.

---

# Related Topics

- **06.08 — NULL Handling in WHERE (Three-Valued Logic)**
- **08.04 — NULL Handling in Aggregates**
- **09.12 — NULL Handling in Subqueries**
- **11.07 — LAG and LEAD**
- **11.12 — Gaps and Islands**

---

# Summary

In windows, `NULL` partition keys form a single partition, `NULL`s sort together first or last depending on the engine (controllable with `NULLS FIRST/LAST` or a `CASE` ordering), and aggregate windows skip `NULL` values, returning `NULL` for empty or all-`NULL` frames. `LAG`/`LEAD` defaults apply only when no neighbouring row exists, not when its value is `NULL`. `IGNORE NULLS` carries the last known value forward on Oracle and SQL Server 2022; elsewhere, a running `COUNT` of non-null values defines groups whose `MAX` carries the value forward. Decide explicitly whether `NULL`s participate, and use `NULL`-safe comparisons for change detection.
