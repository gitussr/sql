---
title: "13.12 - Weeks, Quarters and Fiscal Calendars"
description: "ISO-8601 weeks and ISO years versus US and locale week numbering; week numbers on PostgreSQL, MySQL WEEK modes, SQL Server iso_week and DATEFIRST, Oracle IW and WW, and SQLite; week-start dates; calendar quarters; fiscal years that start in April, July or October; shifting dates to compute fiscal periods; retail 4-4-5 calendars; and same-period-last-year comparisons."
chapter: 13
section: 13.12
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 13.12 Weeks, Quarters and Fiscal Calendars

---

# Learning Objectives

After completing this section, you will be able to:

- Explain ISO-8601 week numbering and why the ISO year can differ from the calendar year.
- Compute ISO week numbers and week-start dates on each engine.
- Recognise the other week-numbering systems and the settings that select them.
- Compute calendar quarters and fiscal years, quarters and months.
- Compare a period with the same period last year.

---

# ISO-8601 Weeks

ISO-8601 defines weeks so that every week has seven days and belongs to exactly one year:

```text
1. Weeks start on Monday.
2. Week 1 is the week that contains the year's first Thursday
   (equivalently: the week containing January 4).
3. A year has 52 or 53 weeks.
4. Days at the start of January can belong to the last week of the PREVIOUS ISO year;
   days at the end of December can belong to week 1 of the NEXT ISO year.
```

```text
            Mon   Tue   Wed   Thu   Fri   Sat   Sun
ISO 2026-W01 12-29 12-30 12-31 01-01 01-02 01-03 01-04     ← starts in 2025
ISO 2026-W40 09-28 09-29 09-30 10-01 10-02 10-03 10-04
ISO 2026-W53 12-28 12-29 12-30 12-31 01-01 01-02 01-03     ← 2026 has 53 ISO weeks; ends in 2027
```

So `2025-12-29` is in ISO year **2026**, week 1, and `2027-01-02` is in ISO year **2026**, week 53. Grouping by `(calendar year, ISO week)` splits these weeks in two. Always pair an ISO week with the **ISO year**.

---

# ISO Week on Each Engine

| Engine | ISO week | ISO year | Week start (Monday) |
|--------|----------|----------|---------------------|
| PostgreSQL | `EXTRACT(WEEK FROM d)` | `EXTRACT(ISOYEAR FROM d)` | `DATE_TRUNC('week', d)` |
| MySQL | `WEEK(d, 3)` | `YEARWEEK(d, 3) DIV 100` | `d - INTERVAL WEEKDAY(d) DAY` |
| SQL Server | `DATEPART(iso_week, d)` | computed ¹ | `DATETRUNC(iso_week, d)` (2022+) |
| Oracle | `TO_CHAR(d, 'IW')` | `TO_CHAR(d, 'IYYY')` | `TRUNC(d, 'IW')` |
| SQLite | `strftime('%V', d)` (3.46+) | `strftime('%G', d)` (3.46+) | `date(d, '-6 days', 'weekday 1')` |

¹ SQL Server: the ISO year is the year of the Thursday in the same week: `YEAR(DATEADD(day, 3 - (DATEPART(weekday, d) + @@DATEFIRST - 2) % 7, d))`.

```sql
-- PostgreSQL: orders per ISO week
SELECT EXTRACT(ISOYEAR FROM OrderDate) AS IsoYear,
       EXTRACT(WEEK    FROM OrderDate) AS IsoWeek,
       DATE_TRUNC('week', OrderDate)::date AS WeekStart,
       COUNT(*)
FROM Orders
GROUP BY 1, 2, 3
ORDER BY WeekStart;
```

Grouping by the **week-start date** alone is simpler still: it identifies the week uniquely, sorts correctly and needs no year pairing.

---

# Other Week Systems

| System | Week starts | Week 1 | Used by |
|--------|-------------|--------|---------|
| ISO-8601 | Monday | Contains first Thursday | Europe, most of Asia, ISO standards |
| US | Sunday | Contains January 1 | US retail, many US reports |
| Middle East | Saturday | Varies | Several countries |
| Oracle `WW` | Weekday of January 1 | Days 1–7 of the year | Oracle default `WW` format |

Engine defaults that are **not** ISO:

- MySQL `WEEK(d)` defaults to mode 0 (Sunday start, week 1 contains the first Sunday, range 0–53). `WEEK(d, 3)` is ISO.
- SQL Server `DATEPART(week, d)` depends on `SET DATEFIRST` and always makes January 1 part of week 1. Use `iso_week` for ISO.
- Oracle `WW` and `W` count 7-day blocks from January 1 or the 1st of the month, not calendar weeks.
- SQLite `%W` counts Monday-start weeks from 00; `%U` Sunday-start weeks from 00.

State which week definition a report uses. "Week 40" means different days in different systems.

---

# Quarters

Calendar quarters are simple: Q1 = January–March, Q2 = April–June, and so on.

```sql
SELECT EXTRACT(QUARTER FROM d);                 -- PostgreSQL, MySQL (QUARTER(d))
SELECT DATEPART(quarter, d);                    -- SQL Server
SELECT TO_CHAR(d, 'Q');                         -- Oracle
SELECT (CAST(strftime('%m', d) AS INTEGER) + 2) / 3;   -- SQLite

-- Quarter start
SELECT DATE_TRUNC('quarter', d);                -- PostgreSQL
SELECT TRUNC(d, 'Q');                           -- Oracle
SELECT DATETRUNC(quarter, d);                   -- SQL Server 2022+
```

---

# Fiscal Years

Many organisations use a fiscal year that does not start in January:

| Organisation | Fiscal year | FY naming |
|--------------|-------------|-----------|
| India, UK government, Japan | April – March | Usually by end year: FY2027 = Apr 2026 – Mar 2027 |
| US federal government | October – September | By end year: FY2027 = Oct 2026 – Sep 2027 |
| Australia | July – June | By end year |
| Many companies | Any month | Either convention |

The trick: **shift the date** so the fiscal year start lands on January 1, then use ordinary calendar functions.

```text
Fiscal year starts in month S, named by END year:
    shift = 13 − S months        (April: +9, July: +6, October: +3)
    FiscalYear    = YEAR(d + shift)
    FiscalQuarter = QUARTER(d + shift)
    FiscalMonth   = MONTH(d + shift)
Named by START year: shift = 1 − S months (April: −3) instead.
```

```sql
-- PostgreSQL: April–March fiscal year, named by end year
SELECT
    OrderDate,
    EXTRACT(YEAR    FROM OrderDate + INTERVAL '9 months') AS FiscalYear,
    EXTRACT(QUARTER FROM OrderDate + INTERVAL '9 months') AS FiscalQuarter,
    EXTRACT(MONTH   FROM OrderDate + INTERVAL '9 months') AS FiscalMonth
FROM Orders;
-- 2026-09-28 → FY 2027, FQ 2, FM 6

-- SQL Server
SELECT YEAR(DATEADD(month, 9, OrderDate))            AS FiscalYear,
       DATEPART(quarter, DATEADD(month, 9, OrderDate)) AS FiscalQuarter
FROM Orders;

-- Oracle
SELECT EXTRACT(YEAR FROM ADD_MONTHS(OrderDate, 9)) AS FiscalYear,
       TO_CHAR(ADD_MONTHS(OrderDate, 9), 'Q')      AS FiscalQuarter
FROM Orders;
```

Shifting by whole months never changes the day-of-month problem here, because only the year, quarter and month of the shifted date are read.

Fiscal year boundaries for filtering:

```sql
-- FY2027 (April start): [2026-04-01, 2027-04-01)
WHERE OrderDate >= DATE '2026-04-01' AND OrderDate < DATE '2027-04-01'
```

---

# Retail 4-4-5 Calendars

Retailers often use calendars where every period is a whole number of weeks, so periods compare like-for-like (same number of Saturdays):

```text
Quarter = 13 weeks = 4 + 4 + 5 weeks
Year    = 52 weeks (364 days), with a 53rd week added every 5–6 years
Year ends on the same weekday each year (e.g. the Saturday nearest January 31)
```

These calendars cannot be computed with a simple shift. Store them in the calendar table (`RetailYear`, `RetailPeriod`, `RetailWeek`) generated from the published rules.

---

# Same Period Last Year

```sql
-- Revenue for September 2026 and September 2025 side by side (PostgreSQL)
SELECT
    SUM(TotalAmount) FILTER (WHERE OrderDate >= DATE '2026-09-01' AND OrderDate < DATE '2026-10-01') AS ThisYear,
    SUM(TotalAmount) FILTER (WHERE OrderDate >= DATE '2025-09-01' AND OrderDate < DATE '2025-10-01') AS LastYear
FROM Orders
WHERE OrderDate >= DATE '2025-09-01' AND OrderDate < DATE '2026-10-01';
```

For weekly comparisons, compare ISO week *n* of this ISO year with week *n* of last ISO year—or, in retail, the date 364 days earlier (same weekday)—rather than the same calendar date, which falls on a different weekday. A calendar table can store a `SameDayLastYear` column so every report uses one definition.

---

# Visual Representation

```text
Calendar year 2026:  Jan ─────────────────────────────────────────── Dec
Fiscal FY2027 (Apr): ··········│Apr ── Q1 ──│ Q2 │ Q3 │ Q4 ── Mar│··········
                               2026-04-01                  2027-03-31
shift +9 months:               2027-01-01  ←── same fiscal position ── 2027-12-31
                                 → YEAR = 2027 = FiscalYear, QUARTER = FiscalQuarter
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN        ← join to Calendar for fiscal and retail periods
3. WHERE       ← filter fiscal periods with their date boundaries
4. GROUP BY    ← group by ISO year + ISO week, or week start, or fiscal columns
5. HAVING
6. WINDOW      ← LAG over periods for period-over-period change
7. SELECT      ← labels like 'FY2027 Q2', '2026-W40'
8. DISTINCT
9. ORDER BY    ← order by period start date
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
EXTRACT(WEEK FROM d)          → civil date → ISO week arithmetic (per row)
d + INTERVAL '9 months'       → month arithmetic (per row), then EXTRACT
JOIN Calendar ON date         → lookup of precomputed columns (per row, via index or hash)
```

For large fact tables, the calendar join and the per-row expressions cost about the same; the calendar wins on consistency and portability.

---

# 🏗️ Architecture Insight

Week and fiscal definitions are business decisions that change rarely but matter everywhere. Put them in the calendar table, owned by finance or the data team, and forbid ad-hoc week and fiscal calculations in reports. Two reports that disagree about which week a day belongs to erode trust in all reports.

---

# ⚡ Performance Tip

Filtering by fiscal period with expressions (`WHERE YEAR(DATEADD(month, 9, OrderDate)) = 2027`) scans. Filter with the period's date boundaries, or join to the calendar and filter on `c.FiscalYear = 2027` with the date range repeated on the fact table.

---

# 🌍 Production Consideration

The last days of December and the first days of January are where week logic breaks: ISO week 1 starting in December, week 53 existing in some years only, and MySQL mode 0 returning week 0. Include December 28 – January 4 of several years in the tests for any weekly report.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| ISO week | ❌ | `EXTRACT(WEEK)` | `WEEK(d, 3)` | `DATEPART(iso_week)` | `'IW'` | `%V` (3.46+) |
| ISO year | ❌ | `EXTRACT(ISOYEAR)` | `YEARWEEK(d, 3)` | Computed | `'IYYY'` | `%G` (3.46+) |
| Default week | ❌ | ISO | Mode 0 (Sunday) | `DATEFIRST` | `WW` (Jan 1 blocks) | `%W` Monday, from 00 |
| Quarter | ❌ | `EXTRACT(QUARTER)` | `QUARTER()` | `DATEPART(quarter)` | `'Q'` | Arithmetic |
| Fiscal year | ❌ | Shift + extract | Shift + extract | Shift + extract | Shift + extract | Shift + extract |

> **Portability Tip:** Week-start dates and a calendar table are portable; week numbers are not. Group by `WeekStart` when you can.

---

# Common Mistakes

### Mistake 1

Pairing an ISO week number with the calendar year.

---

### Mistake 2

Using MySQL `WEEK(d)` or SQL Server `DATEPART(week, d)` and expecting ISO weeks.

---

### Mistake 3

Assuming every year has 52 weeks.

---

### Mistake 4

Computing fiscal years with a `CASE` per month instead of a shift.

---

### Mistake 5

Comparing weeks with the same calendar dates last year instead of the same weekday.

---

# Best Practices

✔ Use ISO weeks with ISO years, or group by week-start date.

✔ Name the week system in every weekly report.

✔ Compute fiscal periods by shifting months, and store them in the calendar table.

✔ Filter fiscal periods with date boundaries.

✔ Test weekly logic around New Year.

---

# Interview Questions

## Basic

1. On which day does an ISO week start?
2. How do you get the quarter of a date?
3. What is a fiscal year?

## Intermediate

4. Which ISO week and year does 2025-12-29 belong to?
5. What does MySQL `WEEK(d)` return by default?
6. How do you compute an April–March fiscal year?

## Advanced

7. Why can grouping by calendar year and ISO week split a week?
8. How would you compare this week's sales with the same week last year?

---

# Hands-on Exercises

## Exercise 1

Show the ISO year, ISO week and week start of every date from 2026-12-25 to 2027-01-06.

---

## Exercise 2

Report revenue by fiscal year and quarter for an October–September fiscal year.

---

## Exercise 3

Produce a weekly report comparing each week's revenue with the same ISO week last year.

---

# Related Topics

- **13.04 — Extracting Date Parts (EXTRACT, DATEPART and DATENAME)**
- **13.07 — Truncating and Bucketing Dates (DATE_TRUNC and date_bin)**
- **13.11 — Generating Date Series and Calendar Tables**
- **08.10 — Conditional Aggregation (FILTER and CASE)**

---

# Summary

ISO-8601 weeks start on Monday, week 1 contains the year's first Thursday, and the ISO year can differ from the calendar year near New Year—so ISO weeks must be paired with ISO years, or replaced by week-start dates. Engines default to other week systems (MySQL mode 0, SQL Server `DATEFIRST`, Oracle `WW`), so ask for ISO explicitly. Calendar quarters are simple; fiscal years are computed by shifting the date so the fiscal start lands on January 1. Retail and other special calendars belong in the calendar table, together with same-period-last-year keys, so every report uses the same definitions.
