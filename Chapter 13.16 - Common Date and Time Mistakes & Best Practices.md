---
title: "13.16 - Common Date and Time Mistakes & Best Practices"
description: "A catalogue of the most common date and time mistakes in SQL—grouped into performance, range filtering, types and storage, arithmetic and differences, time zones, formatting and portability—each with the symptom, the cause and the fix, followed by a consolidated list of best practices and a pre-release checklist of dates to test."
chapter: 13
section: 13.16
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 30 min
lastUpdated: 2026-09-28
---

# 13.16 Common Date and Time Mistakes & Best Practices

---

# Learning Objectives

After completing this section, you will be able to:

- Recognise the most common date and time mistakes from their symptoms.
- Explain the cause of each and apply the standard fix.
- Apply a consolidated set of best practices.
- Test date logic against the days on which it usually breaks.

---

# Performance Mistakes

### Mistake 1: A function on the date column in WHERE

```sql
-- ❌ Symptom: full scan; the query slows down as the table grows
WHERE YEAR(OrderDate) = 2026
WHERE CAST(CreatedAt AS DATE) = '2026-09-28'
WHERE DATE_TRUNC('month', OrderDate) = '2026-09-01'

-- ✅ Fix: half-open range on the bare column
WHERE OrderDate >= '2026-01-01' AND OrderDate < '2027-01-01'
```

---

### Mistake 2: Date arithmetic on the column side

```sql
-- ❌
WHERE DATEADD(day, 30, OrderDate) < @today
WHERE DATEDIFF(day, OrderDate, @today) > 30

-- ✅
WHERE OrderDate < DATEADD(day, -30, @today)
```

---

### Mistake 3: Dates stored or compared as text

```sql
-- ❌ Column OrderDateText VARCHAR holds '28/09/2026'
WHERE CONVERT(date, OrderDateText, 103) >= '2026-09-01'   -- per-row conversion, errors on bad rows
ORDER BY OrderDateText                                    -- '01/10/2026' sorts before '28/09/2026'

-- ✅ Store a DATE; convert once when loading
```

---

### Mistake 4: A volatile clock in WHERE

```sql
-- ❌ MySQL: SYSDATE() is re-evaluated per row → no index range
WHERE CreatedAt >= SYSDATE() - INTERVAL 1 DAY

-- ✅
WHERE CreatedAt >= NOW() - INTERVAL 1 DAY
```

---

# Range Mistakes

### Mistake 5: BETWEEN with date-only bounds on timestamps

```sql
-- ❌ Symptom: the last day's totals are too low
WHERE CreatedAt BETWEEN '2026-09-01' AND '2026-09-30'

-- ✅
WHERE CreatedAt >= '2026-09-01' AND CreatedAt < '2026-10-01'
```

---

### Mistake 6: "End of day" constants

```sql
-- ❌ Misses fractions; on SQL Server datetime, .999 rounds into the next day
WHERE CreatedAt <= '2026-09-30 23:59:59'
WHERE CreatedAt <= '2026-09-30 23:59:59.999'

-- ✅ Exclusive upper bound
WHERE CreatedAt < '2026-10-01'
```

---

### Mistake 7: Consecutive inclusive ranges

```text
❌ Sep: BETWEEN 09-01 AND 10-01 · Oct: BETWEEN 10-01 AND 11-01  → midnight of 10-01 counted twice
✅ Sep: [09-01, 10-01) · Oct: [10-01, 11-01)                     → every instant counted once
```

---

### Mistake 8: Missing days in time-series reports

```text
❌ Symptom: a chart with straight lines across days that had no sales; wrong moving averages
✅ Fix: drive the query from a generated series or calendar table with a LEFT JOIN, COALESCE to 0
```

---

# Type and Storage Mistakes

### Mistake 9: Oracle DATE has a time

```sql
-- ❌ Misses rows stored with a time of day
WHERE OrderDate = DATE '2026-09-28'

-- ✅ Range, or a CHECK (OrderDate = TRUNC(OrderDate)) constraint on the column
WHERE OrderDate >= DATE '2026-09-28' AND OrderDate < DATE '2026-09-29'
```

---

### Mistake 10: Legacy types with surprising limits

```text
❌ SQL Server datetime: 3.33 ms rounding, starts in 1753
❌ MySQL TIMESTAMP: ends 2038-01-19 03:14:07 UTC
✅ datetime2 on SQL Server · DATETIME (holding UTC) on MySQL for long-lived values
```

---

### Mistake 11: Local timestamps without a zone

```text
❌ Symptom: events out of order during the autumn clock change; durations off by an hour;
   reports shift when a server moves region
✅ Fix: store UTC or timestamp with time zone; store IANA zone names where local time matters
```

---

# Arithmetic and Difference Mistakes

### Mistake 12: Age from the difference of years

```sql
-- ❌ One year too old before the birthday
SELECT YEAR(@today) - YEAR(BirthDate)

-- ✅ Completed years
SELECT TIMESTAMPDIFF(YEAR, BirthDate, CURDATE());              -- MySQL
SELECT EXTRACT(YEAR FROM AGE(CURRENT_DATE, BirthDate));        -- PostgreSQL
```

---

### Mistake 13: DATEDIFF as "completed units"

```sql
-- ❌ SQL Server: 1, although only one day has passed
SELECT DATEDIFF(year, '2025-12-31', '2026-01-01');
```

SQL Server `DATEDIFF` counts boundaries. Use it for "calendar years apart"; correct it for "completed years".

---

### Mistake 14: Swapped DATEDIFF arguments

```text
MySQL       DATEDIFF(end, start)          = end − start
SQL Server  DATEDIFF(day, start, end)     = end − start
❌ Porting DATEDIFF(a, b) → DATEDIFF(day, a, b) flips the sign
```

---

### Mistake 15: Month arithmetic from the previous occurrence

```text
❌ Jan 31 → +1 month = Feb 28 → +1 month = Mar 28   (billing date drifts)
✅ anchor + n months: Jan 31, Feb 28, Mar 31, Apr 30, …
```

---

### Mistake 16: `d + 7` on MySQL

```sql
-- ❌ Numeric addition: 20260928 + 7 = 20260935
SELECT OrderDate + 7 FROM Orders;

-- ✅
SELECT OrderDate + INTERVAL 7 DAY FROM Orders;
```

---

# Time Zone Mistakes

### Mistake 17: Truncating UTC for local business days

```text
❌ An order at 2026-09-28 20:00 UTC counted on Sep 28 — it was Sep 29 in Kolkata
✅ Convert to the business zone, then truncate — or store the business date at write time
```

---

### Mistake 18: Converting the column instead of the boundaries

```sql
-- ❌ Per-row conversion, no index
WHERE CreatedAt AT TIME ZONE 'Asia/Kolkata' >= '2026-09-28'

-- ✅ Convert the boundary once
WHERE CreatedAt >= TIMESTAMP '2026-09-28' AT TIME ZONE 'Asia/Kolkata'
```

---

### Mistake 19: Zone abbreviations and fixed offsets for recurring local times

```text
❌ 'IST', 'CST', or '+05:30' stored for a user who expects "9 a.m. my time" all year
✅ IANA names such as 'Asia/Kolkata', 'America/Chicago'
```

---

# Formatting and Portability Mistakes

### Mistake 20: Ambiguous literals

```sql
-- ❌ March 4 or April 3, depending on session settings
WHERE OrderDate = '03/04/2026'

-- ✅
WHERE OrderDate = DATE '2026-03-04'      -- or '20260304' on SQL Server
```

---

### Mistake 21: Grouping or sorting by formatted text

```sql
-- ❌ 'Apr 2026' sorts before 'Jan 2026'; string built per row
GROUP BY TO_CHAR(OrderDate, 'Mon YYYY') ORDER BY 1

-- ✅ Group and sort by DATE_TRUNC('month', OrderDate); format in the outer query
```

---

### Mistake 22: Weekday numbers that depend on settings

```text
❌ DATEPART(weekday, d) = 1 means Sunday under US English and Monday under DATEFIRST 1
✅ ISO weekday functions, setting-independent expressions, or a calendar IsWeekend column
```

---

### Mistake 23: ISO week with calendar year

```text
❌ GROUP BY YEAR(d), ISO_WEEK(d)  → 2025-12-29 lands in "2025 week 1"
✅ GROUP BY ISO year and ISO week, or by the week-start date
```

---

### Mistake 24: Business days as weekdays

```text
❌ "5 business days" computed as 7 calendar days, ignoring public holidays
✅ Calendar table with IsBusinessDay and BusinessDayNumber
```

---

# Visual Representation

```text
                         DATE AND TIME MISTAKES
                                  │
   ┌──────────────┬───────────────┼───────────────┬──────────────┬───────────────┐
   ▼              ▼               ▼               ▼              ▼               ▼
 PERFORMANCE    RANGES          TYPES          ARITHMETIC     TIME ZONES     FORMAT/PORT
 function on    BETWEEN on      Oracle DATE    age by years   UTC truncation ambiguous
 column         timestamps      datetime,      DATEDIFF       column         literals
 text dates     23:59:59        TIMESTAMP 2038 boundaries     conversion     text sorting
 volatile clock missing days    local no zone  month drift    abbreviations  weekday/week
   1–4            5–8             9–11           12–16          17–19          20–24
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← drive time series from a calendar (Mistake 8)
2. JOIN        ← join facts to the calendar for business days (Mistake 24)
3. WHERE       ← half-open ranges on bare columns (Mistakes 1, 2, 5–7, 18)
4. GROUP BY    ← group by dates or ISO year + week, not text (Mistakes 21, 23)
5. HAVING
6. WINDOW
7. SELECT      ← correct ages and differences (Mistakes 12–14)
8. DISTINCT
9. ORDER BY    ← order by date values, not formatted text (Mistake 21)
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Most date mistakes fall into two groups:
  WRONG RESULTS    → the engine did exactly what was written, with its own rules
                     (inclusive BETWEEN, boundary-counting DATEDIFF, session formats, UTC days)
  SLOW RESULTS     → a function or conversion on the column turned a seek into a scan + filter
Both are visible: wrong results in tests on edge dates, slow results in EXPLAIN.
```

---

# Best Practices

✔ Use `DATE` for business dates, UTC or timestamp with time zone for instants.

✔ Store IANA zone names for users, stores and future local appointments.

✔ Filter with half-open ranges on bare columns; compute boundaries on the constant side.

✔ Write literals as `DATE 'YYYY-MM-DD'` or ISO-8601; pass dates as typed parameters.

✔ Convert to the business zone before truncating to dates—or store the business date.

✔ Use completed-unit functions for ages and tenure; compute recurring dates from an anchor.

✔ Group by truncated dates; format last.

✔ Keep a calendar table for weeks, fiscal periods, holidays and business days.

✔ Index equality columns first, the date range last; index deterministic expressions when needed.

✔ Partition large time-series tables by date and pre-aggregate for dashboards.

---

# Pre-Release Test Checklist

```text
Dates that break date logic — test every date-dependent query against them:
  □ the 29th, 30th and 31st of a month (month arithmetic)
  □ February 28 and 29 of a leap year; February 28 of a non-leap year
  □ December 28 – January 4 (ISO weeks, week 53, fiscal year ends)
  □ the spring-forward and fall-back days in every zone you serve
  □ the last instant of a period (23:59:59.999999) and the first of the next (00:00:00)
  □ a public holiday falling next to a weekend
  □ a session with a different time zone, DATEFORMAT, language or NLS setting
  □ NULL dates (not yet shipped, open-ended validity)
```

---

# 🏗️ Architecture Insight

Most of these mistakes are prevented by design rather than by care: correct types, UTC storage, a calendar table, a business-date column written once, typed parameters, and a shared library of date-range helpers. Code review then only needs to check that queries use them.

---

# ⚡ Performance Tip

When a date query is slow, look first for a function or conversion on the date column in `WHERE`, `JOIN` or a partition key. It is the single most common cause, and the fix—a half-open range—is almost always possible.

---

# 🌍 Production Consideration

Date bugs are time bombs: code that works today fails on the 31st, on February 29, at New Year or at a clock change. Put the checklist dates into automated tests, and run date-dependent reports with a parameterised reference date so any day can be reproduced.

---

# SQL Standard vs Vendor Differences

| Mistake area | Worst on | Why |
|--------------|----------|-----|
| Date with hidden time | Oracle | `DATE` includes time |
| Legacy precision | SQL Server | `datetime` rounds to 3.33 ms |
| 2038 limit | MySQL | `TIMESTAMP` range |
| Text dates | SQLite | No date type; text comparison |
| Session-dependent literals | SQL Server, Oracle | `DATEFORMAT`, `NLS_DATE_FORMAT` |
| Boundary-counting differences | SQL Server | `DATEDIFF` semantics |
| Month overflow | SQLite | `'+1 month'` overflows into the next month |

> **Portability Tip:** The portable subset—`DATE`, UTC timestamps, ISO literals, `CURRENT_TIMESTAMP`, half-open ranges and a calendar table—avoids nearly every engine-specific trap in this list.

---

# Interview Questions

## Basic

1. Why is `WHERE YEAR(OrderDate) = 2026` a problem?
2. What is wrong with `BETWEEN '2026-09-01' AND '2026-09-30'` on a timestamp?
3. How should you write a date literal?

## Intermediate

4. Why does Oracle `WHERE OrderDate = DATE '2026-09-28'` miss rows?
5. Why is `YEAR(today) - YEAR(BirthDate)` wrong?
6. Why do billing dates drift when you add one month each time?

## Advanced

7. Why are daily reports wrong when you truncate UTC timestamps?
8. Which dates would you include in tests for date logic, and why?

---

# Hands-on Exercises

## Exercise 1

Review ten date queries from your codebase against the 24 mistakes and fix what you find.

---

## Exercise 2

Write automated tests for a monthly report using the checklist dates.

---

## Exercise 3

Find every `BETWEEN` on a timestamp column in your schema's queries and rewrite it.

---

# Related Topics

- **13.10 — Filtering Date Ranges (Half-Open Intervals)**
- **13.15 — Date and Time Performance and Index Strategy**
- **13.17 — Date and Time Cheat Sheet & Visual Knowledge Map**
- **12.16 — Common Scalar Function Mistakes & Best Practices**
- **06.13 — Common WHERE Mistakes & Best Practices**

---

# Summary

Date and time mistakes fall into six groups: performance (functions and arithmetic on columns, text dates, volatile clocks), ranges (`BETWEEN` on timestamps, end-of-day constants, overlapping periods, missing days), types (Oracle's `DATE`, legacy precision and range limits, local times without zones), arithmetic (ages, boundary-counting `DATEDIFF`, swapped arguments, drifting month arithmetic), time zones (UTC truncation, per-row conversion, abbreviations) and formatting and portability (ambiguous literals, text sorting, setting-dependent weekdays and weeks, business days as weekdays). Correct types, UTC storage, half-open ranges, ISO literals and a calendar table prevent most of them, and testing against the checklist dates catches the rest.
