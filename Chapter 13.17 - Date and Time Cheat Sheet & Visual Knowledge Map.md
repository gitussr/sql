---
title: "13.17 - Date and Time Cheat Sheet & Visual Knowledge Map"
description: "A one-stop reference for Chapter 13: temporal types, current date and time, extracting parts, adding intervals, differences, truncation and bucketing, formatting codes and parsing, time zone conversion, half-open range boundaries, series generation, ISO weeks and fiscal years, business-day formulas, sargable rewrites and indexing rules on PostgreSQL, MySQL, SQL Server, Oracle and SQLite, and a knowledge map linking dates to earlier and later chapters."
chapter: 13
section: 13.17
category: Data Query Language (DQL)
difficulty: Beginner → Advanced
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 13.17 Date and Time Cheat Sheet & Visual Knowledge Map

---

# Learning Objectives

After completing this section, you will be able to:

- Look up the spelling of common date and time operations on each major engine.
- Recall the type, range, time zone and calendar rules in one place.
- Apply the sargable rewrites and indexing rules quickly.
- See how date and time functions connect to the rest of the handbook.

---

# Types

| Meaning | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|---------|------------|-------|------------|--------|--------|
| Calendar date | `date` | `DATE` | `date` | `DATE` (+ `TRUNC` check) | ISO text |
| Instant | `timestamptz` | `DATETIME(6)` UTC / `TIMESTAMP` (≤ 2038) | `datetime2` UTC / `datetimeoffset` | `TIMESTAMP WITH TIME ZONE` | ISO text UTC / Unix int |
| Wall-clock | `timestamp` | `DATETIME` | `datetime2` | `TIMESTAMP` | ISO text |
| Duration | `interval` | seconds | seconds | `INTERVAL DAY TO SECOND` | seconds |
| Avoid | — | `TIMESTAMP` past 2038 | `datetime`, `smalldatetime` | assuming `DATE` has no time | mixed formats |

---

# Now

| Want | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|------|------------|-------|------------|--------|--------|
| Today | `CURRENT_DATE` | `CURDATE()` | `CAST(GETDATE() AS date)` | `TRUNC(SYSDATE)` | `date('now')` |
| Now (local) | `LOCALTIMESTAMP` | `NOW()` | `SYSDATETIME()` | `SYSTIMESTAMP` | `datetime('now', 'localtime')` |
| Now (UTC) | `NOW()` (timestamptz) | `UTC_TIMESTAMP()` | `SYSUTCDATETIME()` | `SYS_EXTRACT_UTC(SYSTIMESTAMP)` | `datetime('now')` |
| Stable for | Transaction | Statement | Query | Statement | Statement |

---

# Parts

| Part | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|------|------------|-------|------------|--------|--------|
| Year | `EXTRACT(YEAR FROM d)` | `YEAR(d)` | `YEAR(d)` | `EXTRACT(YEAR FROM d)` | `strftime('%Y', d)` |
| Month | `EXTRACT(MONTH FROM d)` | `MONTH(d)` | `MONTH(d)` | `EXTRACT(MONTH FROM d)` | `strftime('%m', d)` |
| Quarter | `EXTRACT(QUARTER FROM d)` | `QUARTER(d)` | `DATEPART(quarter, d)` | `TO_CHAR(d, 'Q')` | `(month + 2) / 3` |
| ISO weekday 1–7 | `EXTRACT(ISODOW FROM d)` | `WEEKDAY(d) + 1` | `(DATEPART(weekday, d) + @@DATEFIRST - 2) % 7 + 1` | `TRUNC(d) - TRUNC(d, 'IW') + 1` | `strftime('%u', d)` (3.46+) |
| ISO week / year | `EXTRACT(WEEK / ISOYEAR …)` | `WEEK(d, 3)`, `YEARWEEK(d, 3)` | `DATEPART(iso_week, d)` | `'IW'`, `'IYYY'` | `%V`, `%G` (3.46+) |
| Epoch seconds | `EXTRACT(EPOCH FROM ts)` | `UNIX_TIMESTAMP(ts)` | `DATEDIFF_BIG(second, '1970-01-01', ts)` | arithmetic | `unixepoch(ts)` |
| Build a date | `make_date(y, m, d)` | `STR_TO_DATE(…)` | `DATEFROMPARTS(y, m, d)` | `TO_DATE(…)` | `printf('%04d-%02d-%02d', …)` |

---

# Arithmetic and Differences

```text
ADD                    PostgreSQL         MySQL                  SQL Server             Oracle             SQLite
  + n days             d + n              d + INTERVAL n DAY     DATEADD(day, n, d)     d + n              date(d, '+n days')
  + n months           d + INTERVAL 'n month'  d + INTERVAL n MONTH  DATEADD(month, n, d) ADD_MONTHS(d, n)  date(d, '+n months')
  last day of month    trunc + 1 mon − 1 day  LAST_DAY(d)        EOMONTH(d)             LAST_DAY(d)        'start of month','+1 month','-1 day'

MONTH-END RULE         Jan 31 + 1 month:  clamp → Feb 28 (PG, MySQL, SQL Server, Oracle ADD_MONTHS)
                                          overflow → Mar 3 (SQLite; 'floor' clamps in 3.46+)
                       Feb 28 + 1 month:  Mar 28, except Oracle ADD_MONTHS → Mar 31 (month-end sticks)
RECURRING DATES        anchor + n months, never previous + 1 month

DIFFERENCE             days: PG/Oracle end − start · MySQL DATEDIFF(end, start) · SQL Server DATEDIFF(day, start, end)
                       SQL Server DATEDIFF counts BOUNDARIES: DATEDIFF(year, '2025-12-31', '2026-01-01') = 1
                       completed units: MySQL TIMESTAMPDIFF · PG AGE · Oracle MONTHS_BETWEEN
                       age: TIMESTAMPDIFF(YEAR, birth, today) · EXTRACT(YEAR FROM AGE(today, birth))
```

---

# Truncation and Buckets

| To | PostgreSQL | MySQL | SQL Server 2022+ | Oracle | SQLite |
|----|------------|-------|------------------|--------|--------|
| Day | `ts::date` | `DATE(ts)` | `CAST(ts AS date)` | `TRUNC(ts)` | `date(ts)` |
| ISO week | `DATE_TRUNC('week', d)` | `d - INTERVAL WEEKDAY(d) DAY` | `DATETRUNC(iso_week, d)` | `TRUNC(d, 'IW')` | `date(d, '-6 days', 'weekday 1')` |
| Month | `DATE_TRUNC('month', d)` | `DATE_FORMAT(d, '%Y-%m-01')` (text) | `DATETRUNC(month, d)` | `TRUNC(d, 'MM')` | `date(d, 'start of month')` |
| Year | `DATE_TRUNC('year', d)` | `MAKEDATE(YEAR(d), 1)` | `DATETRUNC(year, d)` | `TRUNC(d, 'YYYY')` | `date(d, 'start of year')` |
| 15-min bucket | `date_bin('15 minutes', ts, origin)` | epoch `DIV 900 * 900` | `DATE_BUCKET(minute, 15, ts)` | arithmetic | `unixepoch(ts) / 900 * 900` |

---

# Formatting and Parsing

```text
                    PostgreSQL/Oracle     MySQL           SQL Server FORMAT   SQLite
year / month / day  YYYY MM DD            %Y %m %d        yyyy MM dd          %Y %m %d
hour / min / sec    HH24 MI SS            %H %i %s        HH mm ss            %H %M %S
month / day name    FMMonth FMDay         %M %W           MMMM dddd           —
format              TO_CHAR(d, f)         DATE_FORMAT     FORMAT / CONVERT(…, style)   strftime(f, d)
parse               TO_DATE(s, f)         STR_TO_DATE     CONVERT(date, s, style) / TRY_CONVERT   —
Unix → timestamp    TO_TIMESTAMP(n)       FROM_UNIXTIME   DATEADD(second, n, '1970-01-01')        datetime(n, 'unixepoch')

LITERALS            DATE '2026-09-28' · TIMESTAMP '2026-09-28 14:05:00' · SQL Server '20260928', '2026-09-28T14:05:00'
INTERCHANGE         ISO-8601 with offset or Z: 2026-09-28T14:05:00Z
FORMAT LAST         group and sort by dates; format in the outer query or the application
```

---

# Time Zones

```text
STORE        instants in UTC / timestamptz · IANA zone names for users and future local times
CONVERT      PostgreSQL  ts AT TIME ZONE 'Asia/Kolkata'   (timestamptz → local; timestamp → instant)
             SQL Server  dto AT TIME ZONE 'India Standard Time'   (Windows names, 2016+)
             MySQL       CONVERT_TZ(ts, 'UTC', 'Asia/Kolkata')    (load zone tables!)
             Oracle      FROM_TZ(ts, 'UTC') AT TIME ZONE 'Asia/Kolkata'
             SQLite      datetime(ts, 'localtime') / 'utc' only
LOCAL DAY    convert to the business zone BEFORE truncating, or store BusinessDate at write time
WHERE        convert the BOUNDARIES, keep the column bare
DST          spring-forward gap (local time does not exist) · fall-back overlap (happens twice)
```

---

# Range Boundaries

```text
PATTERN              col >= :start AND col < :next_start          (never BETWEEN on timestamps)
Today                [today, today + 1 day)
Last 7 days          [today − 6 days, today + 1 day)
This month           [first of month, first of next month)
Last month           [first of previous month, first of this month)
Year to date         [Jan 1, today + 1 day)
Fiscal year (Apr)    FY2027 = [2026-04-01, 2027-04-01)
Overlap              s1 < e2 AND s2 < e1
Open-ended           ValidFrom <= :d AND (ValidTo > :d OR ValidTo IS NULL)
```

---

# Series, Calendars, Weeks and Business Days

```text
SERIES       PG generate_series(d1, d2, '1 day') · SQL Server GENERATE_SERIES(0, n) + DATEADD
             MySQL/SQLite WITH RECURSIVE · Oracle CONNECT BY LEVEL
GAP FILL     series/calendar LEFT JOIN facts · COUNT(fact.col) · COALESCE(SUM(…), 0) · fact filters in ON
CALENDAR     one row per day: parts, ISO week, WeekStart, MonthStart, fiscal, IsWeekend, IsHoliday,
             IsBusinessDay, BusinessDayNumber · populate decades ahead · maintain holidays
ISO WEEK     Monday start · week 1 contains the first Thursday · pair with ISO year · 52 or 53 weeks
FISCAL       shift by (13 − start month) months, then YEAR / QUARTER / MONTH
BUSINESS     BusinessDayNumber = running count of business days (on or before the date)
             days in [a, b) = BDN(b − 1) − BDN(a − 1)
             a + n business days = first business day with BDN = BDN(a) + n
```

---

# Sargable Rewrites

```text
YEAR(d) = 2026                          →  d >= '2026-01-01' AND d < '2027-01-01'
CAST(ts AS DATE) = '2026-09-28'         →  ts >= '2026-09-28' AND ts < '2026-09-29'
DATE_TRUNC('month', d) = '2026-09-01'   →  d >= '2026-09-01' AND d < '2026-10-01'
DATEDIFF(day, d, @today) <= 30          →  d >= DATEADD(day, -30, @today)
d + INTERVAL '30 days' < CURRENT_DATE   →  d < CURRENT_DATE - INTERVAL '30 days'
TO_CHAR(d, 'YYYY-MM') = '2026-09'       →  d >= '2026-09-01' AND d < '2026-10-01'
ts AT TIME ZONE z >= :local             →  ts >= :local AT TIME ZONE z
weekday / hour / birthday month         →  expression index (deterministic) or calendar join
```

---

# Execution and Performance

```text
Bind      literals converted with session settings → use typed literals and parameters
Stable    CURRENT_TIMESTAMP / NOW(): once per statement (PG: transaction) → index-friendly
Volatile  clock_timestamp(), MySQL SYSDATE(): per row → not in WHERE
Place     bare column + constant range → seek · function on column → filter
Estimate  ascending key: recent ranges under-estimated → refresh statistics
Cost      compare < EXTRACT/TRUNC < + months < AT TIME ZONE < formatting → apply expensive ones last
Index     (equality columns, date) INCLUDE (…) · partial index for status + date queues
Scale     BRIN / clustered date key · partition by month (pruning, instant retention) · rollup tables
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← generate_series / Calendar; partition pruning on the date key
2. JOIN        ← calendar LEFT JOIN facts; business-day number joins
3. WHERE       ← half-open ranges on bare columns; boundaries converted once
4. GROUP BY    ← DATE_TRUNC / date_bin / ISO year + week / fiscal columns
5. HAVING
6. WINDOW      ← running totals, moving averages, LAG over gap-free dates
7. SELECT      ← ages, due dates, local times, formatting (last)
8. DISTINCT
9. ORDER BY    ← order by date values, never by formatted text
10. LIMIT / FETCH / TOP   ← latest-N reads the date index backwards
```

---

# How the DBMS Executes This

```text
SELECT DATE_TRUNC('month', OrderDate), SUM(TotalAmount)
FROM Orders WHERE OrderDate >= :s AND OrderDate < :e GROUP BY 1

   Index Range Seek (OrderDate ≥ :s, < :e)   ← boundaries computed once
        │  rows arrive in date order
        ▼
   Compute DATE_TRUNC per row
        ▼
   Stream or Hash Aggregate by month
        ▼
   Format (if any) on the handful of output rows
```

---

# Visual Knowledge Map

```text
                           DATE AND TIME FUNCTIONS (Chapter 13)
            instants in UTC · dates as DATE · half-open ranges · bare columns
                                          │
   ┌────────────┬─────────────┬───────────┼────────────┬──────────────┬───────────────┐
   ▼            ▼             ▼           ▼            ▼              ▼               ▼
  TYPES        NOW          PARTS      ARITHMETIC   TRUNCATION     FORMATTING     TIME ZONES
  13.02        13.03        13.04      13.05–13.06    13.07          13.08          13.09
  date, tz,    stable vs    EXTRACT,   intervals,   DATE_TRUNC,    TO_CHAR,       UTC, IANA,
  interval,    volatile,    weekday    month-end,   date_bin,      ISO literals,  AT TIME ZONE,
  engine traps UTC now      traps      DATEDIFF     buckets        parsing        DST gaps
   └────────────┴─────────────┴───────────┬────────────┴──────────────┴───────────────┘
                                          ▼
          RANGES 13.10 ── [start, end) · overlaps · period boundaries
                                          ▼
          CALENDARS 13.11–13.13 ── series · calendar table · ISO weeks · fiscal · business days
                                          ▼
          EXECUTION 13.14 ── bind · stable now · seek vs filter · ascending keys
                                          ▼
          PERFORMANCE 13.15 ── rewrites · composite & expression indexes · BRIN · partitions
                                          ▼
          MISTAKES 13.16 ── performance · ranges · types · arithmetic · zones · formatting

Connections to other chapters
  03.05 SQL Data Types                    ──→ 13.02
  06.05 BETWEEN                           ──→ 13.10 (why not on timestamps)
  06.12 SARGability                       ──→ 13.15
  07.11 ON vs WHERE                       ──→ 13.11 (gap filling with LEFT JOIN)
  08.06 Grouping by expressions           ──→ 13.07 (time buckets)
  10.10 Partial and expression indexes    ──→ 13.15
  11.06 Running totals, moving averages   ──→ 13.11 (gap-free series)
  11.12 Gaps and islands                  ──→ 13.05, 13.13 (consecutive days)
  12.08 Type conversion                   ──→ 13.08 (parsing, implicit conversion)
  13.xx Date and Time Functions           ──→ 15.xx Query Optimization, 16.xx Reading Execution Plans
```

---

# One-Page Summary

```text
CONCEPTS
  Instants, calendar dates and wall-clock times are different things — store each in its own type
  Every date expression answers: which type? which time zone? which calendar rule?
  Dates are among the least portable parts of SQL: names, argument order and rules differ

RULES
  DATE for business dates; UTC or timestamptz for instants; IANA names for zones
  CURRENT_TIMESTAMP is portable; pass the reference date as a parameter in reports
  EXTRACT for parts; ISO weekday and ISO week + ISO year; group by year AND month
  Recurring dates from an anchor; know each engine's month-end rule
  Completed-unit functions for ages; SQL Server DATEDIFF counts boundaries
  Truncate in the business zone; group by truncated dates; format last in ISO or in the app
  Filter with [start, end) on bare columns; overlap = s1 < e2 AND s2 < e1
  Calendar table for series, weeks, fiscal periods, holidays and business days
  Index (equality, date); expression indexes must be deterministic; partition large time data
```

---

# 🏗️ Architecture Insight

The chapter reduces to one idea: *decide the meaning of time once*. Decide which type each column has, which zone each report uses, which week and fiscal rules the business follows and which days are business days—then encode those decisions in the schema and the calendar table, so that individual queries only filter ranges and join.

---

# ⚡ Performance Tip

If you remember one performance rule from this chapter: a date column in `WHERE` must stand alone on one side of a comparison. `OrderDate >= :start AND OrderDate < :end` is a seek; anything wrapped around `OrderDate` is a scan.

---

# 💡 Did You Know?

ISO-8601 was first published in 1988, and its `YYYY-MM-DD` order was chosen so that dates sort correctly as plain text—a property that makes it the only date format that works identically in file names, log files, CSV exports and SQLite text columns. The standard's week-numbering rule (week 1 contains the first Thursday) comes from the same idea of making every week belong to exactly one year.

---

# Related Topics

- **13.01 — Introduction to Date and Time Functions**
- **13.10 — Filtering Date Ranges (Half-Open Intervals)**
- **13.15 — Date and Time Performance and Index Strategy**
- **13.16 — Common Date and Time Mistakes & Best Practices**
- **12.17 — Scalar Function Cheat Sheet & Visual Knowledge Map**
- **11.17 — Window Function Cheat Sheet & Visual Knowledge Map**
- **06.14 — WHERE Cheat Sheet & Visual Knowledge Map**
- **15.xx — Query Optimization**

---

# Summary

This section condenses Chapter 13 into a single reference: temporal types and their traps, current date and time, parts, interval arithmetic and month-end rules, differences and ages, truncation and buckets, formatting codes and parsing, time zone conversion, half-open range boundaries, series and calendar tables, ISO weeks, fiscal years and business-day formulas across PostgreSQL, MySQL, SQL Server, Oracle and SQLite; the sargable rewrites and indexing rules; and the execution model of binding, stable "now" functions and seek-versus-filter placement. One idea carries the whole chapter—decide the meaning of time once—and the knowledge map shows how dates build on data types, filtering, joins, grouping, indexing, window functions and scalar functions from earlier chapters.
