---
title: "13.07 - Truncating and Bucketing Dates (DATE_TRUNC and date_bin)"
description: "Truncating timestamps to the day, week, month, quarter or year with DATE_TRUNC, DATETRUNC, Oracle TRUNC, MySQL format and arithmetic tricks and SQLite 'start of' modifiers; casting a timestamp to a date; fixed-width buckets such as 15 minutes or 7 days with date_bin, DATE_BUCKET and epoch arithmetic; grouping reports by time bucket; truncating in a time zone; and why truncation belongs in GROUP BY and SELECT but not on indexed columns in WHERE."
chapter: 13
section: 13.07
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 13.07 Truncating and Bucketing Dates (DATE_TRUNC and date_bin)

---

# Learning Objectives

After completing this section, you will be able to:

- Truncate a date or timestamp to the start of its day, week, month, quarter or year.
- Truncate on engines that have no truncation function.
- Group events into fixed-width buckets such as 15 minutes.
- Truncate in the business's time zone rather than UTC.
- Use truncation for grouping without breaking index use.

---

# What Truncation Does

Truncation sets every field smaller than the chosen unit to its minimum:

```text
2026-09-28 14:37:52  truncated to …
   minute   → 2026-09-28 14:37:00
   hour     → 2026-09-28 14:00:00
   day      → 2026-09-28 00:00:00
   week     → 2026-09-28 00:00:00   (Monday; ISO weeks start on Monday)
   month    → 2026-09-01 00:00:00
   quarter  → 2026-07-01 00:00:00
   year     → 2026-01-01 00:00:00
```

The result is a date or timestamp that **identifies the bucket**—and, unlike separate year and month numbers, it sorts, joins and formats naturally.

---

# Truncation Functions

| Unit | PostgreSQL | SQL Server 2022+ | Oracle | MySQL | SQLite |
|------|------------|------------------|--------|-------|--------|
| Day | `DATE_TRUNC('day', ts)` or `ts::date` | `DATETRUNC(day, ts)` or `CAST(ts AS date)` | `TRUNC(ts)` | `DATE(ts)` | `date(ts)` |
| Week (Mon) | `DATE_TRUNC('week', ts)` | `DATETRUNC(iso_week, ts)` | `TRUNC(ts, 'IW')` | `DATE(ts) - INTERVAL WEEKDAY(ts) DAY` | `date(ts, '-6 days', 'weekday 1')` |
| Month | `DATE_TRUNC('month', ts)` | `DATETRUNC(month, ts)` | `TRUNC(ts, 'MM')` | `DATE_FORMAT(ts, '%Y-%m-01')` | `date(ts, 'start of month')` |
| Quarter | `DATE_TRUNC('quarter', ts)` | `DATETRUNC(quarter, ts)` | `TRUNC(ts, 'Q')` | `MAKEDATE(YEAR(ts), 1) + INTERVAL (QUARTER(ts) - 1) QUARTER` | see below |
| Year | `DATE_TRUNC('year', ts)` | `DATETRUNC(year, ts)` | `TRUNC(ts, 'YYYY')` | `MAKEDATE(YEAR(ts), 1)` | `date(ts, 'start of year')` |
| Hour | `DATE_TRUNC('hour', ts)` | `DATETRUNC(hour, ts)` | `TRUNC(ts, 'HH24')` | `DATE_FORMAT(ts, '%Y-%m-%d %H:00:00')` | `strftime('%Y-%m-%d %H:00:00', ts)` |

Notes:

- PostgreSQL `DATE_TRUNC` returns `timestamp` (or `timestamptz`); add `::date` for a date.
- MySQL `DATE_FORMAT` returns **text**. Wrap it in `CAST(… AS DATE)` or use arithmetic forms if you need a date value.
- SQL Server before 2022: `DATEADD(month, DATEDIFF(month, 0, ts), 0)` truncates to the month; `DATEFROMPARTS(YEAR(ts), MONTH(ts), 1)` also works.
- SQLite quarter: `date(ts, 'start of month', '-' || ((CAST(strftime('%m', ts) AS INTEGER) - 1) % 3) || ' months')`.
- SQLite week: `'weekday 1'` moves forward to the next Monday (or stays if already Monday), so step back six days first.

---

# Casting a Timestamp to a Date

The simplest truncation is to the day:

```sql
SELECT CAST(CreatedAt AS DATE) FROM Orders;     -- standard; PostgreSQL, SQL Server, MySQL
SELECT TRUNC(CreatedAt) FROM Orders;            -- Oracle (CAST keeps the time on Oracle DATE)
```

On a `timestamptz` column in PostgreSQL, the cast uses the **session** time zone to decide which day an instant falls on. The same query returns different days from sessions in different zones—see "Truncating in a Time Zone" below.

---

# Monthly Report

```sql
-- PostgreSQL
SELECT
    DATE_TRUNC('month', o.OrderDate)::date AS SalesMonth,
    COUNT(*)                               AS Orders,
    SUM(o.TotalAmount)                     AS Revenue
FROM Orders AS o
WHERE o.OrderDate >= DATE '2026-01-01'
  AND o.OrderDate <  DATE '2027-01-01'
GROUP BY DATE_TRUNC('month', o.OrderDate)
ORDER BY SalesMonth;
```

| SalesMonth | Orders | Revenue |
|------------|--------|---------|
| 2026-01-01 | 412 | 51,210.40 |
| 2026-02-01 | 388 | 47,905.10 |
| … | … | … |

Months with no orders do not appear. Section 13.11 fills them in with a generated series or calendar table.

---

# Fixed-Width Buckets

Truncation works for calendar units. For arbitrary widths—every 15 minutes, every 6 hours, every 10 days—use **binning**:

```sql
-- PostgreSQL 14+: date_bin(stride, source, origin)
SELECT date_bin(INTERVAL '15 minutes', CreatedAt, TIMESTAMPTZ '2026-01-01 00:00+00') AS Slot,
       COUNT(*)
FROM Orders
GROUP BY Slot ORDER BY Slot;

-- SQL Server 2022+: DATE_BUCKET(datepart, number, date [, origin])
SELECT DATE_BUCKET(minute, 15, CreatedAt) AS Slot, COUNT(*)
FROM Orders
GROUP BY DATE_BUCKET(minute, 15, CreatedAt) ORDER BY Slot;

-- Any engine: integer division of epoch seconds (MySQL shown)
SELECT FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(CreatedAt) / 900) * 900) AS Slot, COUNT(*)
FROM Orders
GROUP BY Slot ORDER BY Slot;

-- SQLite
SELECT datetime((unixepoch(CreatedAt) / 900) * 900, 'unixepoch') AS Slot, COUNT(*)
FROM Orders
GROUP BY Slot ORDER BY Slot;
```

The **origin** decides where buckets start. 6-hour buckets from origin midnight give 00:00, 06:00, 12:00, 18:00; from origin 03:00 they give 03:00, 09:00, … Choose an origin aligned with the business day.

---

# Truncating in a Time Zone

An order placed at `2026-09-28 20:00 UTC` belongs to September 28 in New York but September 29 in Kolkata. Truncating a UTC timestamp gives the UTC day—usually the wrong day for a business report.

```sql
-- PostgreSQL: convert to local wall-clock, then truncate
SELECT DATE_TRUNC('day', CreatedAt AT TIME ZONE 'Asia/Kolkata')::date AS BusinessDay, COUNT(*)
FROM Orders
GROUP BY BusinessDay;

-- PostgreSQL 12+: DATE_TRUNC with a zone argument (returns timestamptz)
SELECT DATE_TRUNC('day', CreatedAt, 'Asia/Kolkata') FROM Orders;

-- SQL Server 2016+
SELECT CAST(CreatedAt AT TIME ZONE 'India Standard Time' AS date) AS BusinessDay, COUNT(*)
FROM Orders
GROUP BY CAST(CreatedAt AT TIME ZONE 'India Standard Time' AS date);
```

Many systems avoid this per-query conversion by storing the business date (`OrderDate`) alongside the instant (`CreatedAt`) at write time.

---

# Truncation in WHERE

```sql
-- ❌ Truncating the column: every row is read
WHERE DATE_TRUNC('month', OrderDate) = DATE '2026-09-01'
WHERE CAST(CreatedAt AS DATE) = '2026-09-28'

-- ✅ Range on the bare column
WHERE OrderDate >= DATE '2026-09-01' AND OrderDate < DATE '2026-10-01'
WHERE CreatedAt >= '2026-09-28' AND CreatedAt < '2026-09-29'
```

SQL Server is an exception for one case: `CAST(datetime_col AS date) = @d` is recognised as a range and can still seek (via a dynamic seek), though the cardinality estimate may be poor. Do not rely on it elsewhere—write the range.

---

# Visual Representation

```text
   events:    •  • ••   •    •••  •   ••  •    •  ••• •  •
   time:   ──┼────────┼────────┼────────┼────────┼──────▶
           00:00    00:15    00:30    00:45    01:00
   bucket:  [ 00:00 ) [ 00:15 ) [ 00:30 ) [ 00:45 ) …
   count:      4         4         3         4

   each event maps to the start of its bucket → GROUP BY that start
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN        ← join truncated facts to a calendar table's month-start column
3. WHERE       ← use a range, not a truncated column
4. GROUP BY    ← DATE_TRUNC / date_bin / DATE_BUCKET define the buckets
5. HAVING
6. WINDOW      ← month-over-month change with LAG over the truncated month
7. SELECT      ← format the bucket start for display
8. DISTINCT
9. ORDER BY    ← order by the bucket value, not its text
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Index range seek on OrderDate (from WHERE)
        │
        ▼
Compute DATE_TRUNC('month', OrderDate) per row
        │
        ▼
Hash Aggregate on the bucket (or Stream Aggregate: rows arrive in date order from the index,
                               so truncated buckets arrive in order too — no sort needed)
        │
        ▼
Sort by bucket for ORDER BY (often avoided with Stream Aggregate)
```

Because truncation preserves order, an index on the date column can feed a stream aggregate by month without a sort on engines that recognise it.

---

# 🏗️ Architecture Insight

Dashboards with many time-bucketed queries benefit from **pre-aggregated rollup tables** keyed by the bucket start (`SalesByDay`, `EventsByHour`). Truncate once, when loading, and let every dashboard read the rollup. The raw table then serves only drill-downs.

---

# ⚡ Performance Tip

Group by the truncated value itself, not by its formatted text: `GROUP BY DATE_TRUNC('month', d)` hashes an 8-byte timestamp; `GROUP BY TO_CHAR(d, 'YYYY-MM')` builds and hashes a string per row.

---

# 🌍 Production Consideration

Week truncation depends on the week start. `DATE_TRUNC('week', …)` and Oracle `'IW'` use Monday; SQL Server `DATETRUNC(week, …)` uses `SET DATEFIRST` (Sunday by default in US English), while `iso_week` always uses Monday. Pick one explicitly and state it on the report.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Truncate function | ❌ | `DATE_TRUNC` | ❌ | `DATETRUNC` (2022+) | `TRUNC(d, fmt)` | `'start of …'` modifiers |
| To day | `CAST(ts AS DATE)` | ✅ | `DATE(ts)` | ✅ | `TRUNC(ts)` | `date(ts)` |
| Fixed buckets | ❌ | `date_bin` (14+) | Epoch arithmetic | `DATE_BUCKET` (2022+) | Arithmetic | Epoch arithmetic |
| Week start | ❌ | Monday | Build it | `DATEFIRST` / `iso_week` | `'IW'` Monday, `'WW'` Jan 1 weekday | Build it |

> **Portability Tip:** `CAST(ts AS DATE)` is portable (except Oracle, where `TRUNC` is needed). Month and week truncation need engine-specific forms, or a join to a calendar table with a `MonthStart` column.

---

# Common Mistakes

### Mistake 1

Truncating the column in `WHERE` instead of using a range.

---

### Mistake 2

Truncating UTC timestamps for a report in local business days.

---

### Mistake 3

Grouping by formatted text such as `'2026-09'` and sorting it as text.

---

### Mistake 4

Forgetting that MySQL's `DATE_FORMAT` trick returns a string.

---

### Mistake 5

Mixing week definitions (Sunday vs Monday) between reports.

---

# Best Practices

✔ Group by a truncated date, which carries year and month together.

✔ Use `date_bin` or `DATE_BUCKET` for fixed-width buckets with an explicit origin.

✔ Truncate in the business time zone, or store the business date.

✔ Filter with half-open ranges on the bare column.

✔ Fill missing buckets with a calendar table.

---

# Interview Questions

## Basic

1. What does truncating a timestamp to the month return?
2. How do you truncate to the day on SQL Server?
3. What is the Oracle equivalent of `DATE_TRUNC('month', d)`?

## Intermediate

4. How do you truncate to the month on MySQL?
5. Why is `WHERE DATE_TRUNC('month', OrderDate) = '2026-09-01'` slow?
6. How do you group events into 15-minute buckets?

## Advanced

7. Why can truncating a `timestamptz` give different days in different sessions?
8. How can an index on the date column avoid a sort in a monthly report?

---

# Hands-on Exercises

## Exercise 1

Count orders per month and per ISO week for 2026.

---

## Exercise 2

Count orders per hour of the business day in `Asia/Kolkata`.

---

## Exercise 3

Group `CreatedAt` into 6-hour buckets starting at 03:00.

---

# Related Topics

- **13.04 — Extracting Date Parts (EXTRACT, DATEPART and DATENAME)**
- **13.09 — Time Zones, UTC and Daylight Saving Time**
- **13.11 — Generating Date Series and Calendar Tables**
- **08.06 — Grouping by Multiple Columns and Expressions**
- **08.14 — Execution Flow of GROUP BY (Hash and Stream Aggregation)**

---

# Summary

Truncation maps a date or timestamp to the start of its day, week, month, quarter or year, producing a single value that identifies the bucket and sorts correctly. PostgreSQL has `DATE_TRUNC`, SQL Server 2022 `DATETRUNC`, Oracle `TRUNC`, SQLite `'start of'` modifiers, and MySQL needs format or arithmetic tricks. Fixed-width buckets use `date_bin`, `DATE_BUCKET` or epoch arithmetic with a chosen origin. Truncate in the business's time zone, group by the truncated value, and never truncate an indexed column in `WHERE`—use a half-open range instead.
