---
title: "13.05 - Date Arithmetic and Intervals"
description: "Adding and subtracting days, months, years and times with + INTERVAL, DATEADD, DATE_ADD, ADD_MONTHS and SQLite modifiers; the end-of-month rule for adding months on each engine; why adding months is not associative; integer day arithmetic on DATE; intervals with mixed units; adding in a time zone across daylight saving changes; end-of-month and next-weekday helpers; and computing due dates and schedules."
chapter: 13
section: 13.05
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 13.05 Date Arithmetic and Intervals

---

# Learning Objectives

After completing this section, you will be able to:

- Add and subtract days, months, years, hours and minutes on each engine.
- Predict the result of adding a month to the 29th, 30th or 31st.
- Explain why month arithmetic is not reversible or associative.
- Compute end-of-month and next-weekday dates.
- Add durations correctly across daylight saving changes.

---

# Adding Intervals

| Operation | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|-----------|------------|-------|------------|--------|--------|
| + 7 days | `d + 7` or `d + INTERVAL '7 days'` | `d + INTERVAL 7 DAY` | `DATEADD(day, 7, d)` | `d + 7` | `date(d, '+7 days')` |
| + 1 month | `d + INTERVAL '1 month'` | `d + INTERVAL 1 MONTH` | `DATEADD(month, 1, d)` | `ADD_MONTHS(d, 1)` | `date(d, '+1 month')` |
| − 1 year | `d - INTERVAL '1 year'` | `d - INTERVAL 1 YEAR` | `DATEADD(year, -1, d)` | `ADD_MONTHS(d, -12)` | `date(d, '-1 year')` |
| + 90 minutes | `ts + INTERVAL '90 minutes'` | `ts + INTERVAL 90 MINUTE` | `DATEADD(minute, 90, ts)` | `ts + INTERVAL '90' MINUTE` | `datetime(ts, '+90 minutes')` |
| + n days (column) | `d + n` / `d + n * INTERVAL '1 day'` | `d + INTERVAL n DAY` | `DATEADD(day, n, d)` | `d + n` | `date(d, '+' \|\| n \|\| ' days')` |

```sql
-- PostgreSQL
SELECT OrderDate + INTERVAL '30 days' AS PaymentDue FROM Orders;

-- MySQL (DATE_ADD is the function form)
SELECT DATE_ADD(OrderDate, INTERVAL 30 DAY) AS PaymentDue FROM Orders;

-- SQL Server
SELECT DATEADD(day, 30, OrderDate) AS PaymentDue FROM Orders;

-- Oracle
SELECT OrderDate + 30 AS PaymentDue FROM Orders;

-- SQLite
SELECT date(OrderDate, '+30 days') AS PaymentDue FROM Orders;
```

---

# Result Types

- PostgreSQL: `date + integer` → `date`; `date + interval` → **`timestamp`**. Cast back with `::date` if you need a date.
- MySQL: `DATE + INTERVAL n DAY` → `DATE`; `+ INTERVAL n HOUR` → `DATETIME`.
- SQL Server: `DATEADD` returns the input's type. `DATEADD(hour, 1, <date>)` is an error: `date` has no hour.
- Oracle: `DATE + number` → `DATE` (fractions are parts of a day: `d + 1/24` adds one hour).
- SQLite: `date()` returns `'YYYY-MM-DD'`; `datetime()` returns `'YYYY-MM-DD HH:MM:SS'`.

---

# The End-of-Month Rule

What is January 31 plus one month?

| Engine | `2026-01-31` + 1 month | `2026-02-28` + 1 month | `2026-03-31` − 1 month |
|--------|------------------------|------------------------|-------------------------|
| PostgreSQL | `2026-02-28` | `2026-03-28` | `2026-02-28` |
| MySQL | `2026-02-28` | `2026-03-28` | `2026-02-28` |
| SQL Server | `2026-02-28` | `2026-03-28` | `2026-02-28` |
| Oracle `ADD_MONTHS` | `2026-02-28` | **`2026-03-31`** | `2026-02-28` |
| Oracle `+ INTERVAL '1' MONTH` | **Error ORA-01839** | `2026-03-28` | **Error** |
| SQLite | **`2026-03-03`** | `2026-03-28` | **`2026-03-03`** |

Three different rules:

1. **Clamp** (PostgreSQL, MySQL, SQL Server): if the day does not exist, use the last day of the target month.
2. **Clamp and stick to month-end** (Oracle `ADD_MONTHS`): if the input is the last day of its month, the result is the last day of the target month—so Feb 28 + 1 month is March **31**.
3. **Overflow** (SQLite by default): February 31 does not exist, so it rolls forward into March 3. SQLite 3.46+ accepts a `'floor'` modifier to clamp instead: `date('2026-01-31', '+1 month', 'floor')` → `2026-02-28`.

Oracle's interval arithmetic simply refuses invalid dates. Use `ADD_MONTHS` on Oracle for month arithmetic.

---

# Month Arithmetic Is Not Reversible

```text
2026-01-31 + 1 month = 2026-02-28
2026-02-28 − 1 month = 2026-01-28          ≠ 2026-01-31

2026-01-31 + 1 month + 1 month = 2026-03-28
2026-01-31 + 2 months           = 2026-03-31   ≠ 2026-03-28
```

For recurring schedules (billing on the 31st every month), always compute from the **anchor date**, never by adding one month to the previous occurrence:

```sql
-- PostgreSQL: the next 12 billing dates for a subscription that started 2026-01-31
SELECT (DATE '2026-01-31' + n * INTERVAL '1 month')::date AS BillingDate
FROM generate_series(0, 11) AS n;
-- 2026-01-31, 2026-02-28, 2026-03-31, 2026-04-30, 2026-05-31, …
```

---

# Day Arithmetic on DATE

Adding days to a `DATE` never has month-end problems—a day is always a day:

```sql
SELECT DATE '2026-02-27' + 2;            -- PostgreSQL: 2026-03-01
SELECT DATE '2026-09-28' - 7;            -- PostgreSQL: 2026-09-21 (one week ago)
```

On engines with integer day arithmetic (PostgreSQL, Oracle), `d + n` is the simplest and fastest form. MySQL requires `INTERVAL`: `d + 7` treats the date as the number `20260928` and returns `20260935`.

---

# Intervals With Mixed Units

```sql
-- PostgreSQL
SELECT TIMESTAMP '2026-09-28 14:30' + INTERVAL '1 month 2 days 3 hours';   -- 2026-10-30 17:30

-- MySQL: one unit per INTERVAL, or a compound unit
SELECT TIMESTAMP '2026-09-28 14:30:00' + INTERVAL '2 03:00' DAY_MINUTE;   -- 2026-09-30 17:30:00

-- SQL Server: nest DATEADD
SELECT DATEADD(hour, 3, DATEADD(day, 2, DATEADD(month, 1, '2026-09-28T14:30')));

-- Oracle
SELECT ADD_MONTHS(TIMESTAMP '2026-09-28 14:30:00', 1) + INTERVAL '2 03:00:00' DAY TO SECOND FROM dual;

-- SQLite: modifiers apply left to right
SELECT datetime('2026-09-28 14:30', '+1 month', '+2 days', '+3 hours');
```

Order matters when months are involved: add months first, then days, as every engine above does.

---

# Adding Time Across Daylight Saving Changes

In a zone with daylight saving time, "one day later" and "24 hours later" are different on the day the clocks change. In `America/New_York`, clocks go forward one hour at 02:00 on 2026-03-08:

```sql
-- PostgreSQL, session TimeZone = 'America/New_York'
SELECT TIMESTAMPTZ '2026-03-07 12:00' + INTERVAL '1 day';     -- 2026-03-08 12:00-04  (23 elapsed hours)
SELECT TIMESTAMPTZ '2026-03-07 12:00' + INTERVAL '24 hours';  -- 2026-03-08 13:00-04  (24 elapsed hours)
```

PostgreSQL adds `day` units in the session's local calendar and `hour` units as elapsed time. Other engines add to UTC or to wall-clock values without a zone, so both forms give the same result there. Decide which you mean: "same time tomorrow" (calendar) or "exactly 24 hours later" (elapsed), and do calendar arithmetic in the local zone (Section 13.09).

---

# Useful Derived Dates

```sql
-- Last day of the month
SELECT (DATE_TRUNC('month', d) + INTERVAL '1 month - 1 day')::date;   -- PostgreSQL
SELECT LAST_DAY(d);                                                   -- MySQL, Oracle
SELECT EOMONTH(d);                                                    -- SQL Server
SELECT date(d, 'start of month', '+1 month', '-1 day');               -- SQLite

-- First day of next month
SELECT (DATE_TRUNC('month', d) + INTERVAL '1 month')::date;           -- PostgreSQL
SELECT LAST_DAY(d) + INTERVAL 1 DAY;                                  -- MySQL
SELECT DATEADD(day, 1, EOMONTH(d));                                   -- SQL Server
SELECT LAST_DAY(d) + 1 FROM dual;                                     -- Oracle
SELECT date(d, 'start of month', '+1 month');                         -- SQLite

-- Next Monday strictly after d
SELECT d + (8 - EXTRACT(ISODOW FROM d))::int;                         -- PostgreSQL
SELECT NEXT_DAY(d, 'MONDAY') FROM dual;                               -- Oracle (NLS language)
SELECT date(d, '+1 day', 'weekday 1');                                -- SQLite
```

---

# Visual Representation

```text
             Jan               Feb              Mar
   … 29 30 31 │ 1 … 27 28 │ 1 2 3 …
          ▲                ▲          ▲
   2026-01-31      clamp: 02-28   overflow: 03-03 (SQLite)
       + 1 month   (PG, MySQL, SQL Server, Oracle ADD_MONTHS)

   2026-02-28 + 1 month → 03-28 (clamp engines) · 03-31 (Oracle ADD_MONTHS: month-end sticks)
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN        ← date arithmetic in ON conditions (e.g. s.Day BETWEEN o.OrderDate AND o.OrderDate + 7)
3. WHERE       ← put arithmetic on the constant side: OrderDate >= :today - 30
4. GROUP BY
5. HAVING
6. WINDOW
7. SELECT      ← due dates, expiry dates, schedules
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
d + 7                → integer addition on the internal day number
d + INTERVAL '1 month' → convert to year/month/day, add months, apply the engine's
                        month-end rule, convert back
WHERE OrderDate + 30 < :today   → column-side arithmetic: scan
WHERE OrderDate < :today - 30   → constant-side arithmetic: folded once, index seek
```

---

# 🏗️ Architecture Insight

Business rules about dates—"due 30 days after invoice", "renews on the same day each month", "trial ends at the end of the 14th day in the customer's zone"—are policy, not arithmetic. Encode each rule once (a function, a view, or a column computed at write time), document which month-end rule it uses, and test it against the 29th, 30th and 31st.

---

# ⚡ Performance Tip

Move arithmetic off the column. `WHERE DueDate - 7 <= CURRENT_DATE` scans; `WHERE DueDate <= CURRENT_DATE + 7` seeks.

---

# 🌍 Production Consideration

Month arithmetic differs between engines and between application libraries. If the application computes billing dates in one language and the database recomputes them in SQL, they will disagree on some months. Pick one place to compute schedule dates, store the results, and let both sides read them.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `d + INTERVAL` | ✅ | ✅ | ✅ (`INTERVAL n UNIT`) | ❌ | ✅ (errors on invalid dates) | ❌ |
| Function form | ❌ | ❌ | `DATE_ADD`, `DATE_SUB` | `DATEADD` | `ADD_MONTHS` | modifiers |
| `d + n` days | ❌ | ✅ | ❌ (numeric addition!) | ❌ (`date`), ✅ (`datetime`) | ✅ | ❌ |
| Month-end rule | Error | Clamp | Clamp | Clamp | `ADD_MONTHS`: clamp + stick | Overflow (`floor` in 3.46+) |
| Last day of month | ❌ | Truncate + interval | `LAST_DAY` | `EOMONTH` | `LAST_DAY` | modifiers |

> **Portability Tip:** Adding days is safe everywhere (with each engine's syntax). Adding months is where engines disagree; test month-end dates on every engine you support.

---

# Common Mistakes

### Mistake 1

Adding one month repeatedly instead of adding n months to the anchor date.

---

### Mistake 2

Writing `d + 7` in MySQL.

---

### Mistake 3

Using `+ INTERVAL '1' MONTH` on Oracle month-end dates.

---

### Mistake 4

Assuming SQLite clamps `'+1 month'` to the end of February.

---

### Mistake 5

Putting arithmetic on the column side of a predicate.

---

# Best Practices

✔ Add days with the engine's native day arithmetic.

✔ Use `ADD_MONTHS` on Oracle and `'floor'` on SQLite 3.46+ when you want clamping.

✔ Compute recurring dates from the anchor: anchor + n months.

✔ Distinguish calendar days from elapsed hours across DST changes.

✔ Keep arithmetic on the constant side of `WHERE`.

---

# Interview Questions

## Basic

1. How do you add 30 days to a date on SQL Server?
2. How do you subtract one year on MySQL?
3. What does `EOMONTH` return?

## Intermediate

4. What is `2026-01-31` plus one month on PostgreSQL and on SQLite?
5. Why is `2026-01-31 + 1 month + 1 month` different from `+ 2 months`?
6. What does `d + 7` do on MySQL?

## Advanced

7. Explain Oracle's `ADD_MONTHS` month-end rule and when it differs from other engines.
8. When is "+ 1 day" not "+ 24 hours"?

---

# Hands-on Exercises

## Exercise 1

Compute the payment due date (30 days) and the first day of the following month for each order.

---

## Exercise 2

Generate the next 12 monthly billing dates for subscriptions starting on the 29th, 30th and 31st.

---

## Exercise 3

Compare `ADD_MONTHS` and `+ INTERVAL '1' MONTH` on Oracle for the last day of every month in 2026.

---

# Related Topics

- **13.06 — Date Differences and Age Calculations**
- **13.09 — Time Zones, UTC and Daylight Saving Time**
- **13.13 — Business Days, Holidays and Working Time**
- **05.06 — Expressions & Calculated Columns**

---

# Summary

Date arithmetic adds or subtracts intervals: `+ INTERVAL` in standard SQL, PostgreSQL, MySQL and Oracle, `DATEADD` in SQL Server, `ADD_MONTHS` in Oracle and modifiers in SQLite. Adding days is simple everywhere except MySQL, where `d + n` is numeric addition. Adding months exposes three different month-end rules—clamp, clamp-and-stick, and overflow—and month arithmetic is neither reversible nor associative, so recurring dates must be computed from an anchor. Calendar units and elapsed hours differ across daylight saving changes, and arithmetic belongs on the constant side of predicates.
