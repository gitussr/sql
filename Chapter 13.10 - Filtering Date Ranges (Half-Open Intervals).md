---
title: "13.10 - Filtering Date Ranges (Half-Open Intervals)"
description: "Why >= start AND < next_start is the correct way to filter dates and timestamps; how BETWEEN drops most of the last day on timestamp columns and double-counts boundaries; 23:59:59 and SQL Server datetime rounding traps; computing boundaries for today, this month, last month, year to date and rolling windows; overlapping periods and date range overlap tests; and why half-open ranges keep index seeks."
chapter: 13
section: 13.10
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 13.10 Filtering Date Ranges (Half-Open Intervals)

---

# Learning Objectives

After completing this section, you will be able to:

- Write date range filters that are correct for both dates and timestamps.
- Explain why `BETWEEN` is unsafe for timestamp ranges.
- Compute boundaries for common reporting periods.
- Test whether two date ranges overlap.
- Keep date filters index-friendly.

---

# The Half-Open Interval

```sql
WHERE col >= :start AND col < :next_start
```

The start is **included**; the end is **excluded**. The interval is written `[start, end)`.

```text
      September 2026 = [2026-09-01, 2026-10-01)

   ──●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━○──▶
   09-01 00:00:00                                  10-01 00:00:00
   included                                        excluded
```

It works identically for `DATE`, `TIMESTAMP` at any precision, and `timestamptz`, and consecutive periods tile perfectly: every instant belongs to exactly one period.

---

# Why BETWEEN Fails on Timestamps

`BETWEEN a AND b` means `>= a AND <= b` (Section 06.05). On a `DATE` column it is fine. On a timestamp column:

```sql
-- ❌ Orders on September 30 after midnight are excluded
WHERE CreatedAt BETWEEN '2026-09-01' AND '2026-09-30'
-- the upper bound '2026-09-30' means 2026-09-30 00:00:00
```

```text
   BETWEEN '2026-09-01' AND '2026-09-30'
   ──●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   09-01 00:00                          09-30 00:00   ← 09-30 00:00:01 … 23:59:59 lost
```

The usual "fix" introduces new bugs:

```sql
-- ❌ Misses 23:59:59.5 on engines with fractional seconds
WHERE CreatedAt BETWEEN '2026-09-01 00:00:00' AND '2026-09-30 23:59:59'

-- ❌ SQL Server datetime rounds .999 up to 2026-10-01 00:00:00.000 — includes October's first instant
WHERE CreatedAt BETWEEN '2026-09-01' AND '2026-09-30 23:59:59.999'

-- ❌ Consecutive BETWEEN ranges both include a row at exactly 2026-10-01 00:00:00
WHERE CreatedAt BETWEEN '2026-09-01' AND '2026-10-01'   -- September
WHERE CreatedAt BETWEEN '2026-10-01' AND '2026-11-01'   -- October (double-counts midnight)

-- ✅ Correct for every type and precision
WHERE CreatedAt >= '2026-09-01' AND CreatedAt < '2026-10-01'
```

Use half-open ranges everywhere, even on `DATE` columns, so the pattern never changes when a column's type does.

---

# Common Period Boundaries

With `:today` as the reference date (or `CURRENT_DATE`):

| Period | Start (inclusive) | End (exclusive) |
|--------|-------------------|-----------------|
| Today | `:today` | `:today + 1 day` |
| Yesterday | `:today − 1 day` | `:today` |
| Last 7 days incl. today | `:today − 6 days` | `:today + 1 day` |
| This month | first of `:today`'s month | first of next month |
| Last month | first of previous month | first of `:today`'s month |
| Month to date | first of `:today`'s month | `:today + 1 day` |
| This year | January 1 | next January 1 |
| Year to date | January 1 | `:today + 1 day` |
| Same period last year | start − 1 year | end − 1 year |

```sql
-- PostgreSQL: last month
WHERE OrderDate >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
  AND OrderDate <  DATE_TRUNC('month', CURRENT_DATE)

-- MySQL: last month
WHERE OrderDate >= DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m-01')
  AND OrderDate <  DATE_FORMAT(CURDATE(), '%Y-%m-01')

-- SQL Server: last month
WHERE OrderDate >= DATEADD(month, -1, DATEFROMPARTS(YEAR(@today), MONTH(@today), 1))
  AND OrderDate <  DATEFROMPARTS(YEAR(@today), MONTH(@today), 1)

-- Oracle: last month
WHERE OrderDate >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -1)
  AND OrderDate <  TRUNC(SYSDATE, 'MM')

-- SQLite: last month
WHERE OrderDate >= date('now', 'start of month', '-1 month')
  AND OrderDate <  date('now', 'start of month')
```

All the functions are on the **constant** side, computed once. The column stays bare.

---

# Timestamps and "Today"

For a timestamp column, "today" is still a half-open range of instants:

```sql
-- PostgreSQL: orders created today (session time zone)
WHERE CreatedAt >= CURRENT_DATE AND CreatedAt < CURRENT_DATE + 1

-- SQL Server
WHERE CreatedAt >= CAST(GETDATE() AS date)
  AND CreatedAt <  DATEADD(day, 1, CAST(GETDATE() AS date))
```

Compare this with the tempting but non-sargable form:

```sql
WHERE CAST(CreatedAt AS DATE) = CURRENT_DATE   -- function on the column
```

If "today" means today in a particular zone, compute the boundaries in that zone (Section 13.09).

---

# Rolling Windows

"Last 24 hours" and "last 30 days" are also half-open, anchored at now:

```sql
WHERE CreatedAt >= NOW() - INTERVAL '24 hours'        -- PostgreSQL
WHERE CreatedAt >= DATEADD(hour, -24, SYSUTCDATETIME()) -- SQL Server (UTC column)
WHERE CreatedAt >= UTC_TIMESTAMP() - INTERVAL 24 HOUR -- MySQL (UTC column)
```

The upper bound is implicit (nothing is in the future)—or add `AND CreatedAt < NOW()` if clock skew can produce future rows.

---

# Overlapping Ranges

Two half-open ranges `[s1, e1)` and `[s2, e2)` overlap when:

```sql
s1 < e2 AND s2 < e1
```

```sql
-- Bookings that overlap a requested stay of [2026-10-10, 2026-10-14)
SELECT *
FROM Bookings AS b
WHERE b.RoomID   = :room
  AND b.CheckIn  < DATE '2026-10-14'
  AND b.CheckOut > DATE '2026-10-10';
```

With half-open ranges, a guest checking out on October 10 does not conflict with one checking in on October 10—exactly the business meaning. PostgreSQL range types express the same test directly and can enforce "no overlaps" with an exclusion constraint:

```sql
-- PostgreSQL
ALTER TABLE Bookings ADD CONSTRAINT no_double_booking
    EXCLUDE USING gist (RoomID WITH =, daterange(CheckIn, CheckOut, '[)') WITH &&);
```

(The `=` operator on an integer column inside a GiST index needs the `btree_gist` extension.)

---

# Open-Ended Ranges

Validity periods often use `NULL` for "still valid":

```sql
-- Prices valid on :d, where ValidTo IS NULL means open-ended
WHERE ValidFrom <= :d
  AND (ValidTo > :d OR ValidTo IS NULL)
```

Many designs use a sentinel such as `9999-12-31` instead of `NULL`, which keeps the predicate simpler and index-friendly: `WHERE ValidFrom <= :d AND ValidTo > :d`.

---

# Visual Representation

```text
  [──── Aug ────)[──── Sep ────)[──── Oct ────)
  every instant belongs to exactly one month; boundaries never double-count

  overlap test for [s1, e1) and [s2, e2):
      s1 ─────────── e1
               s2 ─────────── e2        s1 < e2  AND  s2 < e1   → overlap
      s1 ──── e1
                  s2 ──── e2            s2 >= e1                → no overlap (touching is fine)
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN        ← range joins: f.Day >= p.StartDate AND f.Day < p.EndDate
3. WHERE       ← half-open range on the bare column; boundaries computed once
4. GROUP BY
5. HAVING
6. WINDOW
7. SELECT
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
WHERE OrderDate >= '2026-09-01' AND OrderDate < '2026-10-01'
        │
        ▼
Index Seek (range):  seek to the first key ≥ 2026-09-01
                     read forward while key < 2026-10-01
                     stop — rows outside the range are never touched
```

The same plan works for any period length, which is why date-range queries on large tables stay fast as long as the column is bare.

---

# 🏗️ Architecture Insight

Model periods as `[start, end)` everywhere—in tables (`ValidFrom`, `ValidTo`), in APIs (`from`, `to` exclusive) and in reports. Mixing inclusive and exclusive ends between systems produces off-by-one-day errors that are very hard to spot in aggregates.

---

# ⚡ Performance Tip

A half-open range on the leading column of an index is a single range seek. Put the date column first in the index when most queries filter on a date range and optionally on other columns, or second after an equality column (`(CustomerID, OrderDate)`) when queries always filter by that column too.

---

# 🌍 Production Consideration

Reports that users can parameterise ("from" and "to" dates in a UI) usually show an inclusive "to" date. Convert it once at the boundary—`end = to + 1 day`—and use the half-open form in SQL.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `>= AND <` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (ISO text compares correctly) |
| `BETWEEN` inclusive | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `OVERLAPS` predicate | ✅ | ✅ | ❌ | ❌ | ✅ (undocumented) | ❌ |
| Range types | ❌ | `daterange`, `tstzrange` | ❌ | ❌ | ❌ | ❌ |
| Exclusion constraint | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |

> **Portability Tip:** `col >= :start AND col < :end` and `s1 < e2 AND s2 < e1` are portable to every engine. Use them instead of `OVERLAPS` or range types unless you target PostgreSQL only.

---

# Common Mistakes

### Mistake 1

Using `BETWEEN` with date-only bounds on a timestamp column.

---

### Mistake 2

Using `23:59:59` or `.999` as an upper bound.

---

### Mistake 3

Using consecutive inclusive ranges that double-count boundaries.

---

### Mistake 4

Casting the column to a date in `WHERE`.

---

### Mistake 5

Writing an overlap test with `<=` on half-open ranges.

---

# Best Practices

✔ Always filter with `>= start AND < next_start`.

✔ Compute boundaries on the constant side.

✔ Convert inclusive user input to exclusive ends once.

✔ Test overlaps with `s1 < e2 AND s2 < e1`.

✔ Model stored periods as half-open.

---

# Interview Questions

## Basic

1. What is a half-open interval?
2. Why is `BETWEEN '2026-09-01' AND '2026-09-30'` wrong for timestamps?
3. How do you filter orders placed today?

## Intermediate

4. Write a filter for "last month" on your engine.
5. How do you test whether two bookings overlap?
6. Why is `CAST(CreatedAt AS DATE) = CURRENT_DATE` slow?

## Advanced

7. Why is `'2026-09-30 23:59:59.999'` dangerous on SQL Server `datetime`?
8. How can PostgreSQL prevent overlapping bookings declaratively?

---

# Hands-on Exercises

## Exercise 1

Rewrite five `BETWEEN` date filters in your codebase as half-open ranges.

---

## Exercise 2

Write filters for today, month to date, last month and year to date.

---

## Exercise 3

Find all pairs of overlapping bookings for the same room.

---

# Related Topics

- **06.05 — BETWEEN**
- **06.12 — SARGability and Index-Friendly Predicates**
- **13.07 — Truncating and Bucketing Dates (DATE_TRUNC and date_bin)**
- **13.15 — Date and Time Performance and Index Strategy**

---

# Summary

Filter dates and timestamps with half-open intervals—`>= start AND < next_start`—which are correct at every precision, tile consecutive periods without gaps or double-counting, and let the engine perform an index range seek. `BETWEEN` with date-only bounds drops most of the last day on timestamp columns, and `23:59:59` or `.999` upper bounds miss fractions or round into the next day. Compute period boundaries on the constant side, test overlaps with `s1 < e2 AND s2 < e1`, and model stored periods as half-open too.
