---
title: "13.11 - Generating Date Series and Calendar Tables"
description: "Generating one row per day, week or month with generate_series, SQL Server GENERATE_SERIES, recursive CTEs, CONNECT BY LEVEL and numbers tables; filling gaps in time-series reports with LEFT JOIN and COALESCE; designing and populating a calendar (date dimension) table with weekday, ISO week, month, quarter, fiscal and holiday columns; and using the calendar table for reporting, period boundaries and business-day logic."
chapter: 13
section: 13.11
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 30 min
lastUpdated: 2026-09-28
---

# 13.11 Generating Date Series and Calendar Tables

---

# Learning Objectives

After completing this section, you will be able to:

- Generate a series of dates on each major engine.
- Fill missing days, weeks or months in a time-series report.
- Design a calendar (date dimension) table.
- Populate a calendar table once and keep it current.
- Replace repeated date logic with joins to the calendar table.

---

# The Missing-Days Problem

```sql
SELECT OrderDate, COUNT(*) AS Orders
FROM Orders
WHERE OrderDate >= DATE '2026-09-01' AND OrderDate < DATE '2026-09-08'
GROUP BY OrderDate
ORDER BY OrderDate;
```

| OrderDate | Orders |
|-----------|--------|
| 2026-09-01 | 14 |
| 2026-09-02 | 9 |
| 2026-09-04 | 11 |
| 2026-09-07 | 6 |

September 3, 5 and 6 are missing—not zero, **missing**. A chart draws a straight line across them, and a 7-day moving average (Section 11.06) averages over the wrong rows. `GROUP BY` can only report groups that exist. To show every day, you need a source of days.

---

# Generating a Series

```sql
-- PostgreSQL
SELECT d::date AS Day
FROM generate_series(DATE '2026-09-01', DATE '2026-09-07', INTERVAL '1 day') AS d;

-- SQL Server 2022+: GENERATE_SERIES produces numbers; add them as days
SELECT DATEADD(day, value, '2026-09-01') AS Day
FROM GENERATE_SERIES(0, 6);

-- MySQL 8.0+, SQLite 3.8.3+: recursive CTE
WITH RECURSIVE Days(Day) AS (
    SELECT DATE '2026-09-01'
    UNION ALL
    SELECT Day + INTERVAL 1 DAY FROM Days WHERE Day < DATE '2026-09-07'   -- SQLite: date(Day, '+1 day')
)
SELECT Day FROM Days;

-- Oracle
SELECT DATE '2026-09-01' + LEVEL - 1 AS Day
FROM dual
CONNECT BY LEVEL <= DATE '2026-09-07' - DATE '2026-09-01' + 1;
```

Recursive CTEs have depth limits: MySQL's `cte_max_recursion_depth` defaults to 1000, SQL Server's `MAXRECURSION` to 100 (use `OPTION (MAXRECURSION 0)`). For long ranges, cross-join small digit tables or use a calendar table.

Months and weeks work the same way with a different step:

```sql
SELECT d::date AS MonthStart
FROM generate_series(DATE '2026-01-01', DATE '2026-12-01', INTERVAL '1 month') AS d;
```

---

# Filling Gaps

Put the series on the **left** and the facts on the right:

```sql
-- PostgreSQL
SELECT
    d::date                       AS Day,
    COALESCE(COUNT(o.OrderID), 0) AS Orders,          -- COUNT(col) is already 0 for no matches
    COALESCE(SUM(o.TotalAmount), 0) AS Revenue        -- SUM is NULL for no matches: COALESCE
FROM generate_series(DATE '2026-09-01', DATE '2026-09-07', INTERVAL '1 day') AS d
LEFT JOIN Orders AS o
       ON o.OrderDate = d::date
GROUP BY d
ORDER BY d;
```

| Day | Orders | Revenue |
|-----|--------|---------|
| 2026-09-01 | 14 | 1,820.00 |
| 2026-09-02 | 9 | 1,034.50 |
| 2026-09-03 | 0 | 0.00 |
| 2026-09-04 | 11 | 1,402.25 |
| 2026-09-05 | 0 | 0.00 |
| 2026-09-06 | 0 | 0.00 |
| 2026-09-07 | 6 | 690.00 |

Two details:

- Count a column from the fact table (`COUNT(o.OrderID)`), not `COUNT(*)`, which counts the series row and returns 1 for empty days (Section 08.03).
- Put filters on the fact table in the `ON` clause, not in `WHERE`, or the `LEFT JOIN` turns back into an inner join (Section 07.11).

For timestamp facts, join on a half-open range: `ON o.CreatedAt >= d AND o.CreatedAt < d + INTERVAL '1 day'`.

---

# The Calendar Table

Generating series in every query works, but enterprise systems keep a permanent **calendar table** (a *date dimension*): one row per day, with every calendar fact precomputed.

```sql
CREATE TABLE Calendar (
    CalendarDate      DATE        PRIMARY KEY,
    Year              SMALLINT    NOT NULL,
    Quarter           SMALLINT    NOT NULL,     -- 1–4
    Month             SMALLINT    NOT NULL,     -- 1–12
    MonthName         VARCHAR(9)  NOT NULL,
    DayOfMonth        SMALLINT    NOT NULL,
    DayOfYear         SMALLINT    NOT NULL,
    IsoDayOfWeek      SMALLINT    NOT NULL,     -- 1 = Monday … 7 = Sunday
    DayName           VARCHAR(9)  NOT NULL,
    IsoYear           SMALLINT    NOT NULL,     -- may differ from Year near New Year
    IsoWeek           SMALLINT    NOT NULL,     -- 1–53
    WeekStart         DATE        NOT NULL,     -- Monday of the ISO week
    MonthStart        DATE        NOT NULL,
    MonthEnd          DATE        NOT NULL,
    QuarterStart      DATE        NOT NULL,
    FiscalYear        SMALLINT    NOT NULL,
    FiscalQuarter     SMALLINT    NOT NULL,
    FiscalMonth       SMALLINT    NOT NULL,
    IsWeekend         BOOLEAN     NOT NULL,
    IsHoliday         BOOLEAN     NOT NULL DEFAULT FALSE,
    IsBusinessDay     BOOLEAN     NOT NULL,
    BusinessDayNumber INT                       -- running count of business days (Section 13.13)
);
```

A century of days is only about 36,500 rows—tiny. Wider tables are common: holiday names, pay periods, retail 4-4-5 periods, "same day last year" keys.

---

# Populating the Calendar

```sql
-- PostgreSQL: 2000-01-01 to 2050-12-31; fiscal year starts on April 1
INSERT INTO Calendar (
    CalendarDate, Year, Quarter, Month, MonthName, DayOfMonth, DayOfYear,
    IsoDayOfWeek, DayName, IsoYear, IsoWeek, WeekStart, MonthStart, MonthEnd, QuarterStart,
    FiscalYear, FiscalQuarter, FiscalMonth, IsWeekend, IsBusinessDay)
SELECT
    d,
    EXTRACT(YEAR    FROM d),
    EXTRACT(QUARTER FROM d),
    EXTRACT(MONTH   FROM d),
    TO_CHAR(d, 'FMMonth'),
    EXTRACT(DAY     FROM d),
    EXTRACT(DOY     FROM d),
    EXTRACT(ISODOW  FROM d),
    TO_CHAR(d, 'FMDay'),
    EXTRACT(ISOYEAR FROM d),
    EXTRACT(WEEK    FROM d),
    DATE_TRUNC('week', d)::date,
    DATE_TRUNC('month', d)::date,
    (DATE_TRUNC('month', d) + INTERVAL '1 month - 1 day')::date,
    DATE_TRUNC('quarter', d)::date,
    EXTRACT(YEAR FROM d + INTERVAL '9 months'),                       -- FY2027 = Apr 2026 – Mar 2027
    EXTRACT(QUARTER FROM d + INTERVAL '9 months'),
    EXTRACT(MONTH FROM d + INTERVAL '9 months'),
    EXTRACT(ISODOW FROM d) IN (6, 7),
    EXTRACT(ISODOW FROM d) NOT IN (6, 7)
FROM generate_series(DATE '2000-01-01', DATE '2050-12-31', INTERVAL '1 day') AS g(t)
CROSS JOIN LATERAL (SELECT t::date AS d) AS x;

-- then mark holidays
UPDATE Calendar AS c
SET IsHoliday = TRUE, IsBusinessDay = FALSE
FROM Holidays AS h
WHERE h.HolidayDate = c.CalendarDate AND h.Country = 'IN';
```

The fiscal-year shift (`+ 9 months` for an April start) is explained in Section 13.12. The table is populated once, extended every few years, and updated when holidays are announced.

---

# Using the Calendar Table

```sql
-- Monthly revenue including empty months, with fiscal labels
SELECT c.FiscalYear, c.FiscalMonth, c.MonthStart,
       COALESCE(SUM(o.TotalAmount), 0) AS Revenue
FROM Calendar AS c
LEFT JOIN Orders AS o ON o.OrderDate = c.CalendarDate
WHERE c.CalendarDate >= DATE '2026-04-01' AND c.CalendarDate < DATE '2027-04-01'
GROUP BY c.FiscalYear, c.FiscalMonth, c.MonthStart
ORDER BY c.MonthStart;

-- Orders placed on weekends (portable: no engine-specific weekday functions)
SELECT o.*
FROM Orders AS o
JOIN Calendar AS c ON c.CalendarDate = o.OrderDate
WHERE c.IsWeekend;

-- Business days in each month
SELECT MonthStart, COUNT(*) AS BusinessDays
FROM Calendar
WHERE IsBusinessDay AND Year = 2026
GROUP BY MonthStart
ORDER BY MonthStart;
```

The calendar table makes queries **portable** (the engine-specific logic runs once, at population time), **consistent** (every report uses the same week, fiscal and holiday definitions) and often **faster** (joins on a small indexed table instead of per-row function calls).

---

# Visual Representation

```text
   Calendar (every day)               Orders (days with sales)
   ┌────────────┬─────┬─────────┐     ┌────────────┬────────┐
   │ 2026-09-01 │ Tue │ biz day │ ───▶│ 2026-09-01 │ 14 rows│
   │ 2026-09-02 │ Wed │ biz day │ ───▶│ 2026-09-02 │  9 rows│
   │ 2026-09-03 │ Thu │ biz day │ ─ ✗ │            │        │  → 0 after COALESCE
   │ 2026-09-04 │ Fri │ biz day │ ───▶│ 2026-09-04 │ 11 rows│
   │ 2026-09-05 │ Sat │ weekend │ ─ ✗ │            │        │  → 0
   └────────────┴─────┴─────────┘     └────────────┴────────┘
          LEFT JOIN keeps every calendar row
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← the series or Calendar is the driving (left) table
2. JOIN        ← LEFT JOIN facts; fact filters go in ON
3. WHERE       ← filter the calendar's date range here
4. GROUP BY    ← group by calendar columns (MonthStart, FiscalYear, IsoWeek)
5. HAVING
6. WINDOW      ← moving averages over complete, gap-free series
7. SELECT      ← COALESCE empty sums to 0
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Calendar (range seek on CalendarDate: 365 rows)
        │
        ▼
Nested Loop / Hash Left Join  ── Orders (index on OrderDate)
        │
        ▼
Hash Aggregate by calendar columns
```

The calendar side is small and indexed on its primary key; the fact side is read once for the date range. `generate_series` is a set-returning function in the `FROM` clause—the planner estimates its row count (1000 by default in PostgreSQL unless it can compute it).

---

# 🏗️ Architecture Insight

In data warehouses, the calendar table is the **date dimension** of a star schema, and fact tables often store an integer `DateKey` (`20260928`) referencing it. In OLTP databases, keep the natural `DATE` as the key; the calendar table then joins directly on the business date column.

---

# ⚡ Performance Tip

Join facts to the calendar on the bare date column (`o.OrderDate = c.CalendarDate`) and filter the date range on **both** sides where possible (`c.CalendarDate` in `WHERE`, `o.OrderDate` range in `ON`), so the fact table can use its date index too.

---

# 🌍 Production Consideration

A calendar table that ends in 2030 will silently drop rows in 2031. Populate generously (decades ahead), monitor the maximum date, and treat holiday updates as a routine data-maintenance task with an owner.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Series function | ❌ | `generate_series` (dates) | ❌ | `GENERATE_SERIES` (numbers, 2022+) | ❌ | `generate_series` (extension, numbers) |
| Recursive CTE | ✅ | ✅ | ✅ (8.0+) | ✅ (no `RECURSIVE` keyword) | ✅ (11gR2+) | ✅ |
| Row generator | ❌ | — | — | — | `CONNECT BY LEVEL` | — |
| Calendar table | Any | ✅ | ✅ | ✅ | ✅ | ✅ |

> **Portability Tip:** A calendar table is the most portable way to generate dates: once it is populated, every query that uses it is plain standard SQL.

---

# Common Mistakes

### Mistake 1

Expecting `GROUP BY` to produce rows for days with no data.

---

### Mistake 2

Using `COUNT(*)` after a `LEFT JOIN` from the series and getting 1 for empty days.

---

### Mistake 3

Filtering the fact table in `WHERE` and losing the empty days.

---

### Mistake 4

Hitting the recursion limit with a long recursive CTE.

---

### Mistake 5

Letting the calendar table run out of future dates.

---

# Best Practices

✔ Drive time-series reports from a series or calendar table with `LEFT JOIN`.

✔ Count a fact column and `COALESCE` sums to zero.

✔ Keep a calendar table with week, month, fiscal and holiday columns.

✔ Populate it decades ahead and maintain holidays.

✔ Use calendar columns instead of engine-specific date functions in reports.

---

# Interview Questions

## Basic

1. Why do days with no orders not appear in a `GROUP BY` report?
2. How do you generate a series of dates on PostgreSQL?
3. What is a calendar table?

## Intermediate

4. Why use `COUNT(o.OrderID)` instead of `COUNT(*)` when filling gaps?
5. How do you generate dates on MySQL?
6. What columns would you put in a calendar table?

## Advanced

7. Why can a calendar table make date queries more portable?
8. How does a calendar table help moving averages?

---

# Hands-on Exercises

## Exercise 1

Report daily orders for September 2026 with zero-filled days.

---

## Exercise 2

Create and populate a calendar table for 2020–2040 on your engine.

---

## Exercise 3

Using the calendar table, report revenue by fiscal quarter including quarters with no sales.

---

# Related Topics

- **13.12 — Weeks, Quarters and Fiscal Calendars**
- **13.13 — Business Days, Holidays and Working Time**
- **07.04 — LEFT JOIN (LEFT OUTER JOIN)**
- **07.11 — ON vs WHERE (Join Conditions and Filters)**
- **08.03 — COUNT Variants**
- **11.06 — Running Totals, Moving Averages and Shares**

---

# Summary

`GROUP BY` reports only the dates that exist, so time-series reports need a source of dates: `generate_series` on PostgreSQL, `GENERATE_SERIES` plus `DATEADD` on SQL Server 2022, recursive CTEs on MySQL and SQLite, and `CONNECT BY LEVEL` on Oracle. Drive the report from the series with a `LEFT JOIN`, count a fact column, and `COALESCE` sums to zero. A permanent calendar table—one row per day with weekday, ISO week, month, quarter, fiscal and holiday columns—makes every report consistent, portable and fast, as long as it is populated far ahead and its holidays are maintained.
