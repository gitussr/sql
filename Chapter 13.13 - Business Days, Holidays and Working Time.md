---
title: "13.13 - Business Days, Holidays and Working Time"
description: "Counting business days between two dates, adding n business days, and measuring working hours in SQL: why weekday arithmetic alone is not enough, holiday tables per country, business-day numbering in a calendar table for O(1) counting and adding, next and previous business day, SLA elapsed working time with business hours, and time-zone considerations for multi-region calendars."
chapter: 13
section: 13.13
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 30 min
lastUpdated: 2026-09-28
---

# 13.13 Business Days, Holidays and Working Time

---

# Learning Objectives

After completing this section, you will be able to:

- Count business days between two dates.
- Add a number of business days to a date.
- Find the next or previous business day.
- Maintain holidays for several countries.
- Measure elapsed working time for service-level agreements.

---

# Why Weekday Arithmetic Is Not Enough

"Five business days after Friday" is not "seven calendar days after Friday" if Monday is a public holiday. Business-day logic needs three inputs:

```text
1. WEEKEND RULE    Saturday/Sunday in most countries; Friday/Saturday in several others
2. HOLIDAYS        per country (often per region), announced year by year, sometimes moved
3. BUSINESS HOURS  for working-time SLAs: e.g. 09:00–18:00 local time
```

A pure formula can handle the weekend rule. Holidays require **data**. The calendar table (Section 13.11) is the natural place for both.

---

# Holidays Table

```sql
CREATE TABLE Holidays (
    HolidayDate DATE         NOT NULL,
    Country     VARCHAR(50)  NOT NULL,
    HolidayName VARCHAR(100) NOT NULL,
    PRIMARY KEY (HolidayDate, Country)
);

INSERT INTO Holidays VALUES
    (DATE '2026-10-02', 'IN', 'Gandhi Jayanti'),
    (DATE '2026-12-25', 'IN', 'Christmas Day'),
    (DATE '2026-11-26', 'US', 'Thanksgiving Day'),
    (DATE '2026-12-25', 'US', 'Christmas Day');
```

When a business operates in several countries, business-day flags depend on the country, so the calendar either gets one `IsBusinessDay` column per country or a separate `BusinessCalendar (CalendarDate, Country, IsBusinessDay, BusinessDayNumber)` table.

---

# Counting Business Days: The Direct Way

```sql
-- Business days in [start, end) for India, from the calendar table
SELECT COUNT(*) AS BusinessDays
FROM Calendar AS c
WHERE c.CalendarDate >= :start
  AND c.CalendarDate <  :end
  AND c.IsoDayOfWeek < 6
  AND NOT EXISTS (SELECT 1 FROM Holidays AS h
                  WHERE h.HolidayDate = c.CalendarDate AND h.Country = 'IN');
```

Correct, but it reads one calendar row per day in the range. Per order in a large report, that multiplies quickly.

---

# Business Day Numbering

The key technique: give every business day a **running number**, and give non-business days the number of the preceding business day.

```text
CalendarDate  Day  IsBusinessDay  BusinessDayNumber
2026-09-28    Mon  ✔               6800
2026-09-29    Tue  ✔               6801
2026-09-30    Wed  ✔               6802
2026-10-01    Thu  ✔               6803
2026-10-02    Fri  ✘ (holiday)     6803
2026-10-03    Sat  ✘               6803
2026-10-04    Sun  ✘               6803
2026-10-05    Mon  ✔               6804
```

```sql
-- Populate once (PostgreSQL; window functions from Chapter 11)
UPDATE Calendar AS c
SET BusinessDayNumber = n.Num
FROM (
    SELECT CalendarDate,
           SUM(CASE WHEN IsBusinessDay THEN 1 ELSE 0 END)
               OVER (ORDER BY CalendarDate) AS Num
    FROM Calendar
) AS n
WHERE n.CalendarDate = c.CalendarDate;
```

`BusinessDayNumber` on a date is the number of business days **on or before** that date. Business-day questions become two lookups:

```sql
-- Business days in [start, end): business days up to end − 1, minus business days up to start − 1
SELECT e.BusinessDayNumber - s.BusinessDayNumber AS BusinessDays
FROM Calendar AS s, Calendar AS e
WHERE s.CalendarDate = :start - 1        -- SQL Server: DATEADD(day, -1, @start)
  AND e.CalendarDate = :end   - 1;
```

The formula is correct whether `start` and `end` fall on business days, weekends or holidays. Rules such as "excluding the start day, including the end day"—common for SLAs—shift both lookups by one day (`:start` and `:end`). Define the rule once, wrap it in a view or function, and test it.

---

# Adding Business Days

```sql
-- The date n business days after :d (the first business day with number = start + n)
SELECT MIN(c2.CalendarDate) AS DueDate
FROM Calendar AS c1
JOIN Calendar AS c2
  ON c2.BusinessDayNumber = c1.BusinessDayNumber + :n
 AND c2.IsBusinessDay
WHERE c1.CalendarDate = :d;
```

Friday 2026-10-02 is a holiday in India. Three business days after Wednesday 2026-09-30 (number 6802):

```text
6802 + 3 = 6805  →  the business day numbered 6805  →  Tuesday 2026-10-06
```

For a whole table of orders:

```sql
SELECT o.OrderID, o.OrderDate, due.CalendarDate AS DeliverBy
FROM Orders AS o
JOIN Calendar AS c   ON c.CalendarDate = o.OrderDate
JOIN Calendar AS due ON due.BusinessDayNumber = c.BusinessDayNumber + 5
                    AND due.IsBusinessDay;
```

---

# Next and Previous Business Day

```sql
-- Next business day on or after :d
SELECT MIN(CalendarDate) FROM Calendar WHERE CalendarDate >= :d AND IsBusinessDay;

-- Previous business day strictly before :d
SELECT MAX(CalendarDate) FROM Calendar WHERE CalendarDate < :d AND IsBusinessDay;
```

Both are single index range probes on the calendar's primary key. Settlement dates, payment runs and "if the due date falls on a holiday, pay on the next business day" rules all use them.

---

# Without a Calendar Table: Weekends Only

When holidays do not matter and no calendar table exists, weekdays between two dates can be counted with arithmetic. The logic is fiddly and engine-specific; for example, in PostgreSQL:

```sql
-- Weekdays (Mon–Fri) in [s, e)
SELECT COUNT(*)
FROM generate_series(:s::date, :e::date - 1, INTERVAL '1 day') AS d
WHERE EXTRACT(ISODOW FROM d) < 6;
```

Closed-form formulas exist (full weeks × 5 plus a remainder adjustment), but they are easy to get wrong at the edges. A calendar table is simpler and also handles holidays.

---

# Working Time for SLAs

"Respond within 8 working hours" with business hours 09:00–18:00 means a ticket opened at 17:00 on Monday is due at 16:00 on Tuesday.

A robust approach splits each ticket's interval into business-day slices:

```sql
-- PostgreSQL: working minutes between OpenedAt and ResolvedAt, 09:00–18:00 local, business days only
SELECT t.TicketID,
       SUM(
         GREATEST(
           0,
           EXTRACT(EPOCH FROM
             LEAST(t.ResolvedLocal, c.CalendarDate + TIME '18:00')
           - GREATEST(t.OpenedLocal, c.CalendarDate + TIME '09:00')
           ) / 60
         )
       ) AS WorkingMinutes
FROM (
    SELECT TicketID,
           OpenedAt   AT TIME ZONE 'Asia/Kolkata' AS OpenedLocal,
           ResolvedAt AT TIME ZONE 'Asia/Kolkata' AS ResolvedLocal
    FROM Tickets
    WHERE ResolvedAt IS NOT NULL
) AS t
JOIN Calendar AS c
  ON c.CalendarDate >= CAST(t.OpenedLocal AS date)
 AND c.CalendarDate <= CAST(t.ResolvedLocal AS date)
 AND c.IsBusinessDay
GROUP BY t.TicketID;
```

For each business day the ticket spans, the overlap between the ticket's interval and that day's working window is computed and summed. Convert to the **support team's** local zone first—business hours are local.

---

# Visual Representation

```text
   Mon 28     Tue 29     Wed 30     Thu 01     Fri 02     Sat 03    Sun 04    Mon 05
   ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐   ┌┄┄┄┄┄┄┐   ┌┄┄┄┄┐    ┌┄┄┄┄┐    ┌──────┐
   │ 6800 │   │ 6801 │   │ 6802 │   │ 6803 │   ┆ 6803 ┆   ┆6803┆    ┆6803┆    │ 6804 │
   └──────┘   └──────┘   └──────┘   └──────┘   └┄┄┄┄┄┄┘   └┄┄┄┄┘    └┄┄┄┄┘    └──────┘
                                                holiday    weekend   weekend
   business days in [Wed 30, Mon 05) = BDN(Sun 04) − BDN(Tue 29) = 6803 − 6801 = 2  (Wed, Thu)
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← Calendar or BusinessCalendar joined to facts
2. JOIN        ← join on BusinessDayNumber + n to add business days
3. WHERE       ← restrict the calendar range; filter IsBusinessDay
4. GROUP BY    ← per ticket when summing working-time slices
5. HAVING      ← tickets that breached the SLA
6. WINDOW      ← running SUM of IsBusinessDay populates BusinessDayNumber
7. SELECT      ← due dates, business-day counts
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Business-day count with numbering:
  two index seeks on Calendar's primary key → one subtraction      (constant time)
Business-day count by scanning:
  range scan of Calendar for the interval → anti-join to Holidays → count   (∝ days)
Add n business days:
  seek start → compute number + n → seek by BusinessDayNumber (index it) → first business day
```

Index `BusinessDayNumber` (with `IsBusinessDay` and `CalendarDate`) so the second lookup is also a seek.

---

# 🏗️ Architecture Insight

Business calendars are shared reference data. Store them once, per country or region, with an owner who updates holidays when they are announced, and expose business-day operations as views or functions. Letting each service keep its own holiday list guarantees that two systems will one day disagree on a due date.

---

# ⚡ Performance Tip

The business-day numbering turns "count" and "add" from operations proportional to the number of days into constant-time lookups—important when computing due dates for millions of orders in one query.

---

# 🌍 Production Consideration

Holidays change: governments declare one-off holidays, move holidays that fall on weekends, and publish next year's calendar late. After any holiday update, recompute the `IsBusinessDay` flags and the `BusinessDayNumber` column from the changed date onward, and consider whether already-computed due dates must be recalculated.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Business-day functions | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Weekday detection | ❌ | `ISODOW` | `WEEKDAY` | `DATEPART` + `DATEFIRST` | `TO_CHAR 'DY'` | `strftime('%w')` |
| Running number | Window `SUM` | ✅ | ✅ (8.0+) | ✅ | ✅ | ✅ (3.25+) |
| Calendar table | Any | ✅ | ✅ | ✅ | ✅ | ✅ |

> **Portability Tip:** No engine has built-in business-day functions. A calendar table with `IsBusinessDay` and `BusinessDayNumber` makes business-day logic identical on every engine.

---

# Common Mistakes

### Mistake 1

Treating business days as weekdays and ignoring holidays.

---

### Mistake 2

Scanning the calendar per row to count business days in large reports.

---

### Mistake 3

Assuming the weekend is Saturday and Sunday everywhere.

---

### Mistake 4

Computing working hours in UTC instead of the team's local zone.

---

### Mistake 5

Updating holidays without recomputing business-day numbers.

---

# Best Practices

✔ Keep holidays as data, per country or region.

✔ Add `IsBusinessDay` and `BusinessDayNumber` to the calendar table.

✔ Count and add business days with number arithmetic.

✔ Define inclusive/exclusive rules for business-day counts once, with tests.

✔ Compute working time in the local zone of the people doing the work.

---

# Interview Questions

## Basic

1. Why is "business days" not the same as "weekdays"?
2. Where would you store public holidays?
3. How do you find the next business day?

## Intermediate

4. How does a business-day number column help count business days?
5. How do you add five business days to each order date?
6. How do you handle multiple countries?

## Advanced

7. How would you compute working minutes between two timestamps with 09:00–18:00 business hours?
8. What must happen when a new holiday is announced?

---

# Hands-on Exercises

## Exercise 1

Add `IsBusinessDay` and `BusinessDayNumber` to your calendar table for India.

---

## Exercise 2

Compute a delivery date five business days after each order date.

---

## Exercise 3

For each resolved ticket, compute working minutes to resolution and list SLA breaches over 8 working hours.

---

# Related Topics

- **13.11 — Generating Date Series and Calendar Tables**
- **13.06 — Date Differences and Age Calculations**
- **13.09 — Time Zones, UTC and Daylight Saving Time**
- **11.04 — Aggregate Window Functions**

---

# Summary

Business-day logic needs a weekend rule, holiday data and, for working-time SLAs, business hours—none of which SQL engines provide as built-in functions. Store holidays per country, mark business days in the calendar table, and number them with a running count so that counting and adding business days become constant-time lookups. Next and previous business days are simple range probes, working time is the sum of overlaps between an interval and each day's working window in the local zone, and every holiday update must recompute the business-day flags and numbers.
