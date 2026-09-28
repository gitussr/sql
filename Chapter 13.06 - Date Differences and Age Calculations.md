---
title: "13.06 - Date Differences and Age Calculations"
description: "Measuring the distance between dates and timestamps with date subtraction, DATEDIFF, TIMESTAMPDIFF, DATEDIFF_BIG, AGE, MONTHS_BETWEEN and julianday; why SQL Server DATEDIFF counts boundaries crossed while MySQL TIMESTAMPDIFF counts completed units; opposite argument orders; computing exact ages and completed years of service; durations in hours and minutes; and formatting elapsed time."
chapter: 13
section: 13.06
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 13.06 Date Differences and Age Calculations

---

# Learning Objectives

After completing this section, you will be able to:

- Compute the number of days between two dates on each engine.
- Explain the difference between counting boundaries and counting completed units.
- Get the argument order of `DATEDIFF` right on SQL Server and MySQL.
- Compute a person's exact age and completed years of service.
- Express durations in hours, minutes or seconds.

---

# Days Between Two Dates

| Engine | Days from `start` to `end` |
|--------|----------------------------|
| PostgreSQL | `end - start` (integer for `date`) |
| MySQL | `DATEDIFF(end, start)` |
| SQL Server | `DATEDIFF(day, start, end)` |
| Oracle | `end - start` (number; fractional if times differ) |
| SQLite | `julianday(end) - julianday(start)` (real) |

```sql
-- Days since each order was placed, on 2026-09-28

-- PostgreSQL
SELECT OrderID, CURRENT_DATE - OrderDate AS DaysAgo FROM Orders;

-- MySQL: DATEDIFF(later, earlier)
SELECT OrderID, DATEDIFF(CURDATE(), OrderDate) AS DaysAgo FROM Orders;

-- SQL Server: DATEDIFF(unit, earlier, later)
SELECT OrderID, DATEDIFF(day, OrderDate, CAST(GETDATE() AS date)) AS DaysAgo FROM Orders;

-- Oracle
SELECT OrderID, TRUNC(SYSDATE) - OrderDate AS DaysAgo FROM Orders;

-- SQLite
SELECT OrderID, CAST(julianday('now') - julianday(OrderDate) AS INTEGER) AS DaysAgo FROM Orders;
```

> MySQL `DATEDIFF(a, b)` is `a − b`. SQL Server `DATEDIFF(day, a, b)` is `b − a`. Porting code between them without swapping the arguments flips every sign.

---

# Boundaries Crossed vs Completed Units

SQL Server's `DATEDIFF` counts how many unit **boundaries** are crossed—not how many whole units have passed:

```sql
-- SQL Server
SELECT DATEDIFF(year,  '2025-12-31', '2026-01-01');             -- 1  (one day apart!)
SELECT DATEDIFF(month, '2026-01-31', '2026-02-01');             -- 1
SELECT DATEDIFF(hour,  '2026-09-28 10:59', '2026-09-28 11:01'); -- 1  (two minutes)
SELECT DATEDIFF(year,  '2026-01-01', '2026-12-31');             -- 0  (364 days)
```

MySQL's `TIMESTAMPDIFF` counts **completed** units:

```sql
-- MySQL: TIMESTAMPDIFF(unit, earlier, later)
SELECT TIMESTAMPDIFF(YEAR,  '2025-12-31', '2026-01-01');        -- 0
SELECT TIMESTAMPDIFF(MONTH, '2026-01-31', '2026-02-28');        -- 0
SELECT TIMESTAMPDIFF(MONTH, '2026-01-28', '2026-02-28');        -- 1
SELECT TIMESTAMPDIFF(HOUR,  '2026-09-28 10:59', '2026-09-28 11:01');   -- 0
```

```text
                 2025-12-31 ─────▶ 2026-01-01   (1 day)
SQL Server  DATEDIFF(year, …)      = 1   one year boundary crossed
MySQL       TIMESTAMPDIFF(YEAR, …) = 0   no complete year elapsed
```

Neither is wrong; they answer different questions. "Which calendar year difference?" is boundaries; "how many full years?" is completed units. Choose deliberately.

---

# Differences in Other Units

| Unit | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|------|------------|-------|------------|--------|--------|
| Seconds | `EXTRACT(EPOCH FROM b - a)` | `TIMESTAMPDIFF(SECOND, a, b)` | `DATEDIFF(second, a, b)` ¹ | `(CAST(b AS DATE) - CAST(a AS DATE)) * 86400` | `unixepoch(b) - unixepoch(a)` |
| Minutes | `EXTRACT(EPOCH FROM b - a) / 60` | `TIMESTAMPDIFF(MINUTE, a, b)` | `DATEDIFF(minute, a, b)` | `(b - a) * 1440` (DATE) | `(julianday(b) - julianday(a)) * 1440` |
| Months | `EXTRACT(YEAR FROM AGE(b, a)) * 12 + EXTRACT(MONTH FROM AGE(b, a))` | `TIMESTAMPDIFF(MONTH, a, b)` | `DATEDIFF(month, a, b)` (boundaries) | `MONTHS_BETWEEN(b, a)` (fractional) | — |

¹ SQL Server `DATEDIFF` returns `INT`: seconds overflow after about 68 years, milliseconds after about 24 days. Use `DATEDIFF_BIG` (2016+) for large spans.

---

# Interval Results

In PostgreSQL and Oracle, subtracting timestamps returns an **interval**:

```sql
-- PostgreSQL
SELECT ShippedAt - CreatedAt AS TimeToShip FROM Orders;          -- 1 day 03:15:00
SELECT EXTRACT(EPOCH FROM ShippedAt - CreatedAt) / 3600.0 AS HoursToShip FROM Orders;   -- 27.25

-- Oracle
SELECT ShippedAt - CreatedAt AS TimeToShip FROM Orders;          -- +01 03:15:00.000000
SELECT EXTRACT(DAY FROM (ShippedAt - CreatedAt)) * 24
     + EXTRACT(HOUR FROM (ShippedAt - CreatedAt)) AS WholeHours FROM Orders;
```

Averages over intervals work in PostgreSQL (`AVG(ShippedAt - CreatedAt)`); elsewhere, average the numeric seconds and convert.

---

# Exact Age

Age in completed years is the classic trap. Subtracting years is wrong before the birthday:

```sql
-- ❌ Wrong on 2026-09-28 for BirthDate 1990-10-15: gives 36, the person is 35
SELECT EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM BirthDate) FROM Customers;
```

Correct forms:

```sql
-- PostgreSQL: AGE returns years, months and days
SELECT AGE(DATE '2026-09-28', DATE '1990-10-15');                         -- 35 years 11 mons 13 days
SELECT EXTRACT(YEAR FROM AGE(CURRENT_DATE, BirthDate)) AS Age FROM Customers;

-- MySQL: completed years
SELECT TIMESTAMPDIFF(YEAR, BirthDate, CURDATE()) AS Age FROM Customers;

-- Oracle: completed months / 12
SELECT TRUNC(MONTHS_BETWEEN(TRUNC(SYSDATE), BirthDate) / 12) AS Age FROM Customers;

-- SQL Server: boundaries, minus one if the birthday has not happened yet this year
SELECT DATEDIFF(year, BirthDate, @today)
     - CASE WHEN DATEADD(year, DATEDIFF(year, BirthDate, @today), BirthDate) > @today
            THEN 1 ELSE 0 END AS Age
FROM Customers;

-- Any engine: compare month-day as a number
-- (YYYYMMDD(today) - YYYYMMDD(birth)) / 10000, using integer division
```

People born on February 29 turn a year older on February 28 or March 1 in non-leap years, depending on the rule. PostgreSQL's `AGE` and MySQL's `TIMESTAMPDIFF` treat them as a year older on March 1; if the law or policy says February 28, encode that rule explicitly.

---

# Years of Service and Tenure Bands

```sql
-- PostgreSQL
SELECT
    e.EmployeeID,
    e.HireDate,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, e.HireDate))::int AS CompletedYears,
    CASE
        WHEN AGE(CURRENT_DATE, e.HireDate) <  INTERVAL '1 year'  THEN '< 1 year'
        WHEN AGE(CURRENT_DATE, e.HireDate) <  INTERVAL '5 years' THEN '1–4 years'
        ELSE '5+ years'
    END AS TenureBand
FROM Employees AS e;
```

---

# Formatting Elapsed Time

```sql
-- PostgreSQL: interval → text
SELECT TO_CHAR(ShippedAt - CreatedAt, 'DD "d" HH24 "h" MI "m"') FROM Orders;   -- 01 d 03 h 15 m

-- SQL Server: seconds → hh:mm:ss (under 24 hours)
SELECT CONVERT(varchar(8), DATEADD(second, DATEDIFF(second, CreatedAt, ShippedAt), 0), 108);

-- MySQL: seconds → hh:mm:ss (up to 838 hours)
SELECT SEC_TO_TIME(TIMESTAMPDIFF(SECOND, CreatedAt, ShippedAt));
```

---

# Visual Representation

```text
  start ────────────────────────────── end
        │◀──────── difference ────────▶│

  unit boundaries:   |      |      |      |          DATEDIFF (SQL Server) counts the |
  completed units:   [──────][──────][──                TIMESTAMPDIFF / AGE count full [──]
  exact:             1 day 03:15:00                     subtraction → interval (PG, Oracle)
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← DATEDIFF(day, OrderDate, @today) > 30 scans; OrderDate < @today - 30 seeks
4. GROUP BY    ← tenure bands, age groups
5. HAVING      ← AVG(duration) > threshold
6. WINDOW      ← LAG(d) OVER (…) then subtract: gap since the previous event
7. SELECT      ← ages, durations, days overdue
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
date - date            → integer subtraction on internal day numbers (cheap)
DATEDIFF(month, a, b)  → (year(b) − year(a)) * 12 + month(b) − month(a)   (boundaries)
TIMESTAMPDIFF(MONTH …) → same, minus one if b's day-and-time is before a's (completed)
AGE(b, a)              → year/month/day borrow arithmetic, like subtraction by hand
```

---

# 🏗️ Architecture Insight

"How long?" questions often have a business definition that is not a plain subtraction: service-level times count business hours only, loan interest uses day-count conventions (30/360, actual/365), and legal ages follow jurisdiction-specific rules. Name the convention, implement it once, and test it; do not let every report compute its own difference.

---

# ⚡ Performance Tip

Rewrite difference predicates as range predicates: `DATEDIFF(day, OrderDate, @today) <= 30` becomes `OrderDate >= DATEADD(day, -30, @today)`. The first computes `DATEDIFF` for every row; the second seeks.

---

# 🌍 Production Consideration

Differences between timestamps stored in local time are wrong by an hour across a daylight saving change. Store instants in UTC (or with a time zone) and the subtraction is always the true elapsed time.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `date - date` | Interval | Integer days | ❌ (numeric nonsense) | ❌ | Number of days | ❌ |
| Unit difference | ❌ | `EXTRACT(EPOCH …)`, `AGE` | `TIMESTAMPDIFF` (completed) | `DATEDIFF` (boundaries) | `MONTHS_BETWEEN`, arithmetic | `julianday`, `unixepoch` |
| Day difference function | ❌ | ❌ | `DATEDIFF(end, start)` | `DATEDIFF(day, start, end)` | ❌ | `timediff` (3.43+, text) |
| Years/months/days | ❌ | `AGE` | ❌ | ❌ | `MONTHS_BETWEEN` | ❌ |

> **Portability Tip:** No difference function is portable. Wrap each engine's form in a view or keep it in one place per query, and document whether it counts boundaries or completed units.

---

# Common Mistakes

### Mistake 1

Computing age as the difference of two years.

---

### Mistake 2

Swapping `DATEDIFF` arguments when porting between MySQL and SQL Server.

---

### Mistake 3

Using SQL Server `DATEDIFF(year, …)` as "completed years".

---

### Mistake 4

Overflowing `DATEDIFF(millisecond, …)` on SQL Server.

---

### Mistake 5

Subtracting local timestamps across a DST change.

---

# Best Practices

✔ Use `AGE`, `TIMESTAMPDIFF` or `MONTHS_BETWEEN` for completed years and months.

✔ Correct SQL Server `DATEDIFF` when you need completed units.

✔ Convert durations to seconds before averaging on engines without interval types.

✔ Rewrite difference predicates as ranges on the bare column.

✔ Subtract UTC or zoned timestamps, never local ones.

---

# Interview Questions

## Basic

1. How do you get the number of days between two dates on PostgreSQL?
2. What does MySQL `DATEDIFF('2026-09-28', '2026-09-01')` return?
3. How do you compute age in MySQL?

## Intermediate

4. What does SQL Server `DATEDIFF(year, '2025-12-31', '2026-01-01')` return, and why?
5. Why is `YEAR(today) - YEAR(BirthDate)` wrong?
6. How do you get hours between two timestamps in PostgreSQL?

## Advanced

7. Write a correct age calculation for SQL Server.
8. When should a report count boundaries rather than completed units?

---

# Hands-on Exercises

## Exercise 1

For each order, show days from order to shipment and hours from `CreatedAt` to `ShippedAt`.

---

## Exercise 2

Compute each customer's age in completed years and group customers into age bands.

---

## Exercise 3

Compare `DATEDIFF(month, …)` on SQL Server with `TIMESTAMPDIFF(MONTH, …)` on MySQL for ten date pairs around month-ends.

---

# Related Topics

- **13.05 — Date Arithmetic and Intervals**
- **13.13 — Business Days, Holidays and Working Time**
- **11.07 — LAG and LEAD**
- **12.10 — Conditional Expressions (CASE, IIF, GREATEST and LEAST)**

---

# Summary

Date differences are computed by subtraction on PostgreSQL and Oracle, `DATEDIFF` and `TIMESTAMPDIFF` on MySQL, `DATEDIFF` on SQL Server and `julianday` or `unixepoch` on SQLite—with opposite argument orders between MySQL and SQL Server. SQL Server's `DATEDIFF` counts unit boundaries crossed, while MySQL's `TIMESTAMPDIFF`, PostgreSQL's `AGE` and Oracle's `MONTHS_BETWEEN` measure completed units, which is what ages and years of service require. Subtract instants rather than local times, convert durations to seconds for averaging, and rewrite difference predicates as ranges on the bare column.
