---
title: "11.05 - Window Frames (ROWS, RANGE and GROUPS)"
description: "Window frames in depth: frame units ROWS, RANGE and GROUPS, frame boundaries (UNBOUNDED, n PRECEDING/FOLLOWING, CURRENT ROW), peers and ties, the default frames, RANGE with numeric and interval offsets, frame exclusion, which functions use frames, and vendor support."
chapter: 11
section: 11.05
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 35 min
lastUpdated: 2026-09-25
---

# 11.05 Window Frames (ROWS, RANGE and GROUPS)

---

# Learning Objectives

After completing this section, you will be able to:

- Explain what a frame is and which functions use it.
- Write frames with `ROWS`, `RANGE` and `GROUPS`.
- Use every boundary: `UNBOUNDED PRECEDING`, `n PRECEDING`, `CURRENT ROW`, `n FOLLOWING`, `UNBOUNDED FOLLOWING`.
- Explain peers and why `RANGE` and `ROWS` differ on ties.
- Use `RANGE` with value and interval offsets for time-based windows.
- State the default frames and when to override them.

---

# What is a Frame?

Within an ordered partition, the **frame** is the subset of rows that an aggregate or value function uses for the current row. It moves as the current row moves.

```text
Partition ordered by SalesDate

  row 1   09-01  100
  row 2   09-02  120   ┐
  row 3   09-03   90   │ frame of row 4:
  row 4   09-04  110  ◀┘ ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
  row 5   09-05  130
  row 6   09-06   80
```

Frames apply to aggregate windows (`SUM`, `AVG`, `COUNT`, `MIN`, `MAX` …) and to `FIRST_VALUE`, `LAST_VALUE` and `NTH_VALUE`. Ranking functions, `LAG`, `LEAD` and distribution functions **ignore** frames.

---

# Frame Syntax

```sql
{ ROWS | RANGE | GROUPS }
    BETWEEN frame_start AND frame_end
    [ EXCLUDE { CURRENT ROW | GROUP | TIES | NO OTHERS } ]

frame_start / frame_end:
    UNBOUNDED PRECEDING
    n PRECEDING
    CURRENT ROW
    n FOLLOWING
    UNBOUNDED FOLLOWING
```

The short form `ROWS n PRECEDING` means `ROWS BETWEEN n PRECEDING AND CURRENT ROW`. The start must not come after the end.

---

# The Three Frame Units

| Unit | Counts | `2 PRECEDING` means |
|------|--------|---------------------|
| `ROWS` | Physical rows | The two rows before this one |
| `RANGE` | Values of the single `ORDER BY` column | Rows whose value is ≥ current value − 2 |
| `GROUPS` | Peer groups (sets of tied rows) | The two previous groups of ties |

```text
ORDER BY Score:   10  20  20  20  30  40

Current row = the 30

ROWS   BETWEEN 1 PRECEDING AND CURRENT ROW  →  20, 30          (one physical row back)
RANGE  BETWEEN 10 PRECEDING AND CURRENT ROW →  20, 20, 20, 30  (values 20..30)
GROUPS BETWEEN 1 PRECEDING AND CURRENT ROW  →  20, 20, 20, 30  (previous peer group + own)
```

---

# Peers and CURRENT ROW

**Peers** are rows with equal `ORDER BY` values. `CURRENT ROW` means different things per unit:

| Unit | `CURRENT ROW` as frame end means |
|------|----------------------------------|
| `ROWS` | Exactly this row |
| `RANGE` | This row **and all its peers** |
| `GROUPS` | This row's whole peer group |

That is the source of the running-total surprise from Section 11.02: the default frame `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` includes all rows tied with the current one.

---

# Default Frames

| Window | Default frame |
|--------|---------------|
| No `ORDER BY` | Entire partition (`ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`) |
| With `ORDER BY`, no frame | `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` |

```sql
-- These are identical
SUM(x) OVER (ORDER BY d)
SUM(x) OVER (ORDER BY d RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
```

Consequences:

- Running totals include ties (use `ROWS` and a unique order to avoid that).
- `LAST_VALUE(x) OVER (ORDER BY d)` returns the current row's value (or the last peer), not the partition's last value (Section 11.08).
- On SQL Server, the default `RANGE` frame uses a slower on-disk spool than `ROWS` (Section 11.14).

---

# Common Frames

```sql
-- Running total
ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW

-- Moving window of the last 7 rows (including current)
ROWS BETWEEN 6 PRECEDING AND CURRENT ROW

-- Centered window: 3 before, 3 after
ROWS BETWEEN 3 PRECEDING AND 3 FOLLOWING

-- Remaining total (from current to the end)
ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING

-- Whole partition, even with ORDER BY (e.g. for LAST_VALUE)
ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING

-- Previous rows only (exclude current)
ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
```

---

# RANGE with Value Offsets

`RANGE` with a numeric or interval offset defines the frame by **value distance**, which is what time-based windows really need:

```sql
-- Revenue over the last 7 calendar days, even if some days are missing
SELECT
    SalesDate,
    Revenue,
    SUM(Revenue) OVER (ORDER BY SalesDate
                       RANGE BETWEEN INTERVAL '6' DAY PRECEDING AND CURRENT ROW) AS Revenue7Days
FROM DailySales;
```

```text
SalesDate   Revenue   ROWS 6 PRECEDING       RANGE 6 DAYS PRECEDING
09-01       100       100                    100
09-02       120       220                    220
09-05        90       310  (3 rows)          310  (09-01..09-05)
09-09       110       420  (09-01..09-09!)   200  (09-03..09-09 → 09-05, 09-09)
```

`ROWS 6 PRECEDING` means "the previous six rows", which spans more than a week when days are missing. `RANGE INTERVAL '6' DAY PRECEDING` means "rows within six days", which is the business definition.

Rules for `RANGE` offsets:

- Exactly one `ORDER BY` expression, of a numeric, date or timestamp type.
- The offset type must match (number for numbers, interval for dates/timestamps).
- Supported by PostgreSQL 11+, MySQL 8.0, Oracle and SQLite 3.28+; **not** by SQL Server, which allows only `UNBOUNDED` and `CURRENT ROW` with `RANGE`.

On SQL Server, fill the date gaps first (join to a calendar table) and use `ROWS`.

---

# GROUPS

`GROUPS` counts peer groups rather than rows or values:

```sql
-- Sum of the current day's orders plus the previous two order-days
SUM(TotalAmount) OVER (ORDER BY OrderDate
                       GROUPS BETWEEN 2 PRECEDING AND CURRENT ROW)
```

Each distinct `OrderDate` is one group, however many orders it has. Supported by PostgreSQL 11+, SQLite 3.28+ and Oracle 21c+.

---

# Frame Exclusion

The standard `EXCLUDE` option removes rows from the frame:

```sql
-- Average salary of the department, excluding the employee themself
AVG(Salary) OVER (PARTITION BY DepartmentID
                  ORDER BY EmployeeID
                  ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
                  EXCLUDE CURRENT ROW)
```

| Option | Removes |
|--------|---------|
| `EXCLUDE CURRENT ROW` | The current row |
| `EXCLUDE GROUP` | The current row and its peers |
| `EXCLUDE TIES` | The current row's peers, but not the row itself |
| `EXCLUDE NO OTHERS` | Nothing (default) |

Supported by PostgreSQL 11+, SQLite 3.28+ and Oracle 21c+. Elsewhere, compute `(SUM(x) OVER (…) - x) / (COUNT(x) OVER (…) - 1)`.

---

# Frames and Empty Windows

If a frame contains no rows (for example `ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING` on the first row), aggregates return `NULL` (and `COUNT` returns `0`):

```text
Row 1: frame empty → SUM = NULL, COUNT = 0
Row 2: frame = row 1
Row 3: frame = rows 1–2
```

Moving averages over the first few rows therefore average fewer values; decide whether to show them, suppress them (`CASE WHEN COUNT(*) OVER (…) = 7 THEN AVG(…) END`), or pad the data.

---

# Visual Representation

```text
                  partition (ordered)
  ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐
  │  1  │  2  │  3  │  4● │  5  │  6  │  7  │     ● = current row
  └─────┴─────┴─────┴─────┴─────┴─────┴─────┘
  ◀──────── UNBOUNDED PRECEDING ────────┤          running total
              ├── 2 PRECEDING ──────────┤          moving window
                          ├─── CURRENT ROW → UNBOUNDED FOLLOWING ──▶   remaining total
  ◀──────────────── whole partition ───────────────────▶
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← rows removed here are absent from every frame
4. GROUP BY
5. HAVING
6. WINDOW      ← partitions are sorted and frames slide here
7. SELECT
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Frame maintenance for SUM over ROWS BETWEEN 6 PRECEDING AND CURRENT ROW

for each row r in the sorted partition:
    add r.x to the running sum                 (row enters the frame)
    if a row left the frame: subtract its x    (row leaves the frame)
    emit sum

MIN / MAX cannot "subtract" a leaving row:
    engines recompute over the frame, or keep a sorted structure / monotone deque
```

Invertible aggregates (`SUM`, `COUNT`, `AVG`) slide in constant time per row; non-invertible ones (`MIN`, `MAX`) may cost more for wide moving frames.

---

# 🔬 Engine Deep Dive

PostgreSQL implements the *moving-aggregate* optimisation through inverse transition functions: aggregates like `sum` and `count` declare how to remove a value, so a sliding frame updates in O(1) per row. Aggregates without an inverse (such as `max`) restart from the frame head whenever the frame start moves, which is O(frame size) per row. SQL Server's batch-mode *Window Aggregate* operator (2016+) computes sliding frames efficiently for both kinds.

---

# 🏗️ Architecture Insight

`ROWS` versus `RANGE` is a question about the **data model of time**. If rows are dense and regular (one per day, guaranteed), `ROWS` and `RANGE` agree. If they are sparse or irregular (orders, events), only a value-based frame—or a calendar table that densifies the data—gives business-correct "last 7 days" figures. Decide which your data is before choosing.

---

# ⚡ Performance Tip

Write `ROWS` explicitly for running totals and moving windows unless you specifically need peer or value semantics. On SQL Server it avoids the on-disk spool of the default `RANGE` frame; everywhere, it avoids buffering peer groups.

---

# 🔒 Security Note

Frames do not change which rows a query may see. They do change which values are combined—so an `EXCLUDE CURRENT ROW` average over a group of two reveals the other person's value exactly. Treat such "leave-one-out" figures as potentially identifying.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `ROWS` frames | ✅ | ✅ | ✅ | ✅ (2012+) | ✅ | ✅ |
| `RANGE UNBOUNDED / CURRENT ROW` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `RANGE n PRECEDING` (value offset) | ✅ | ✅ (11+) | ✅ | ❌ | ✅ | ✅ (3.28+) |
| `RANGE INTERVAL …` | ✅ | ✅ (11+) | ✅ | ❌ | ✅ | ❌ (numeric only) |
| `GROUPS` | ✅ | ✅ (11+) | ❌ | ❌ | ✅ (21c+) | ✅ (3.28+) |
| `EXCLUDE` | ✅ | ✅ (11+) | ❌ | ❌ | ✅ (21c+) | ✅ (3.28+) |

> **Portability Tip:** `ROWS BETWEEN … AND …` with `UNBOUNDED`, `n PRECEDING/FOLLOWING` and `CURRENT ROW` runs everywhere. For time-based windows on SQL Server, densify with a calendar table and use `ROWS`.

---

# Common Mistakes

### Mistake 1

Relying on the default `RANGE` frame for running totals over non-unique orderings.

---

### Mistake 2

Using `ROWS 6 PRECEDING` for "last 7 days" over data with missing days.

---

### Mistake 3

Expecting a frame to affect `ROW_NUMBER`, `RANK`, `LAG` or `LEAD`.

---

### Mistake 4

Forgetting that the first rows of a moving window have partial frames.

---

### Mistake 5

Using `RANGE` with an offset on SQL Server.

---

# Best Practices

✔ Write every frame explicitly when a window has `ORDER BY`.

✔ Use `ROWS` for row-based running and moving calculations.

✔ Use `RANGE` with intervals (or a calendar table) for time-based windows.

✔ Handle partial frames at the start of each partition.

✔ Use `EXCLUDE` or arithmetic for "everyone but me" figures.

---

# Interview Questions

## Basic

1. What is a window frame?
2. What is the default frame when a window has `ORDER BY`?
3. Write the frame for a 7-row moving average.

## Intermediate

4. What is the difference between `ROWS` and `RANGE`?
5. What are peers, and how does `CURRENT ROW` treat them?
6. Why does `ROWS 6 PRECEDING` not always mean "last 7 days"?

## Advanced

7. What does `GROUPS BETWEEN 1 PRECEDING AND CURRENT ROW` include?
8. Why can sliding `SUM` be computed in constant time per row but sliding `MAX` not?
9. How would you compute a true 7-day window on SQL Server?

---

# Hands-on Exercises

## Exercise 1

Compute a running total of `DailySales.Revenue` with `ROWS` and with the default frame, on data with duplicate dates.

---

## Exercise 2

Delete some days from `DailySales` and compare a 7-row and a 7-day moving sum.

---

## Exercise 3

Compute each employee's department average salary excluding themselves.

---

## Exercise 4

Compute a centered 5-day moving average and suppress it where fewer than 5 rows are in the frame.

---

# Related Topics

- **11.02 — The OVER Clause (PARTITION BY and ORDER BY)**
- **11.04 — Aggregate Window Functions**
- **11.06 — Running Totals, Moving Averages and Shares**
- **11.08 — FIRST_VALUE, LAST_VALUE and NTH_VALUE**
- **11.14 — Execution Flow of Window Functions**

---

# Summary

A frame is the moving subset of an ordered partition that aggregate and value window functions use for each row. `ROWS` counts physical rows, `RANGE` measures distance in the value of the single order key and treats ties as peers, and `GROUPS` counts peer groups. Boundaries run from `UNBOUNDED PRECEDING` through `n PRECEDING`, `CURRENT ROW` and `n FOLLOWING` to `UNBOUNDED FOLLOWING`, and `EXCLUDE` can remove the current row or its peers. With `ORDER BY` the default frame is `RANGE … CURRENT ROW`, which includes ties—so write frames explicitly, use `ROWS` for row-based calculations, and use `RANGE` intervals or a calendar table for time-based windows.
