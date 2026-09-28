---
title: "13.04 - Extracting Date Parts (EXTRACT, DATEPART and DATENAME)"
description: "Extracting years, quarters, months, days, weekdays, day of year, hours and epoch seconds with EXTRACT, date_part, DATEPART, DATENAME, YEAR(), MONTH(), DAYOFWEEK, strftime and TO_CHAR; weekday numbering differences and SET DATEFIRST; month and day names and language settings; building dates from parts with make_date, DATEFROMPARTS and MAKEDATE; and why parts belong in SELECT and GROUP BY, not on indexed columns in WHERE."
chapter: 13
section: 13.04
category: Data Query Language (DQL)
difficulty: Beginner
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 13.04 Extracting Date Parts (EXTRACT, DATEPART and DATENAME)

---

# Learning Objectives

After completing this section, you will be able to:

- Extract any part of a date or timestamp on each major engine.
- Predict the weekday number each engine returns.
- Get month and weekday names, and know what controls their language.
- Build a date from year, month and day parts.
- Use extracted parts for grouping without harming index use.

---

# EXTRACT

```sql
EXTRACT(field FROM datetime_value)
```

```sql
SELECT
    o.OrderID,
    o.OrderDate,                              -- 2026-09-28
    EXTRACT(YEAR    FROM o.OrderDate) AS Y,   -- 2026
    EXTRACT(QUARTER FROM o.OrderDate) AS Q,   -- 3
    EXTRACT(MONTH   FROM o.OrderDate) AS M,   -- 9
    EXTRACT(DAY     FROM o.OrderDate) AS D    -- 28
FROM Orders AS o;
```

`EXTRACT` is standard and works on PostgreSQL, MySQL and Oracle. SQL Server uses `DATEPART`; SQLite uses `strftime`.

---

# Fields and Their Spellings

| Part | Standard / PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|------|------------------------|-------|------------|--------|--------|
| Year | `EXTRACT(YEAR FROM d)` | `YEAR(d)` | `YEAR(d)`, `DATEPART(year, d)` | `EXTRACT(YEAR FROM d)` | `strftime('%Y', d)` |
| Quarter | `EXTRACT(QUARTER FROM d)` | `QUARTER(d)` | `DATEPART(quarter, d)` | `TO_CHAR(d, 'Q')` | `(strftime('%m', d) + 2) / 3` |
| Month | `EXTRACT(MONTH FROM d)` | `MONTH(d)` | `MONTH(d)` | `EXTRACT(MONTH FROM d)` | `strftime('%m', d)` |
| Day of month | `EXTRACT(DAY FROM d)` | `DAY(d)` | `DAY(d)` | `EXTRACT(DAY FROM d)` | `strftime('%d', d)` |
| Day of year | `EXTRACT(DOY FROM d)` | `DAYOFYEAR(d)` | `DATEPART(dayofyear, d)` | `TO_CHAR(d, 'DDD')` | `strftime('%j', d)` |
| Hour | `EXTRACT(HOUR FROM ts)` | `HOUR(ts)` | `DATEPART(hour, ts)` | `EXTRACT(HOUR FROM ts)` ¹ | `strftime('%H', ts)` |
| Epoch seconds | `EXTRACT(EPOCH FROM ts)` | `UNIX_TIMESTAMP(ts)` | `DATEDIFF_BIG(second, '1970-01-01', ts)` | `(CAST(ts AS DATE) - DATE '1970-01-01') * 86400` | `unixepoch(ts)`, `strftime('%s', ts)` |

¹ Oracle `EXTRACT(HOUR …)` works on `TIMESTAMP`, not on `DATE`: use `EXTRACT(HOUR FROM CAST(d AS TIMESTAMP))` or `TO_CHAR(d, 'HH24')`.

SQLite's `strftime` returns **text** (`'09'`, not `9`). Cast it before arithmetic or numeric comparison: `CAST(strftime('%m', d) AS INTEGER)`.

---

# Return Types

- PostgreSQL 14+: `EXTRACT` returns `numeric`; `date_part` returns `double precision`. `EXTRACT(SECOND …)` includes fractions (`5.123`).
- MySQL, SQL Server: integers.
- Oracle: numbers; `EXTRACT(SECOND …)` includes fractions for `TIMESTAMP`.
- SQLite: text from `strftime`.

---

# Weekdays: The Numbering Trap

For Monday 2026-09-28:

| Expression | Result | Week starts | Range |
|------------|--------|-------------|-------|
| PostgreSQL `EXTRACT(DOW FROM d)` | 1 | Sunday = 0 | 0–6 |
| PostgreSQL `EXTRACT(ISODOW FROM d)` | 1 | Monday = 1 | 1–7 |
| MySQL `DAYOFWEEK(d)` | 2 | Sunday = 1 | 1–7 |
| MySQL `WEEKDAY(d)` | 0 | Monday = 0 | 0–6 |
| SQL Server `DATEPART(weekday, d)` | 2 (default US setting) | Depends on `SET DATEFIRST` | 1–7 |
| Oracle `TO_CHAR(d, 'D')` | 2 (US) or 1 (Europe) | Depends on `NLS_TERRITORY` | 1–7 |
| SQLite `strftime('%w', d)` | `'1'` | Sunday = 0 | 0–6 |
| SQLite `strftime('%u', d)` (3.46+) | `'1'` | Monday = 1 | 1–7 |

Five engines, at least six conventions, and two of them depend on session settings. To test for weekends portably, compare **names** in a fixed language, or use the ISO numbering where available:

```sql
-- PostgreSQL
WHERE EXTRACT(ISODOW FROM d) IN (6, 7)

-- MySQL
WHERE WEEKDAY(d) IN (5, 6)

-- SQL Server: independent of DATEFIRST
WHERE (DATEPART(weekday, d) + @@DATEFIRST - 2) % 7 + 1 IN (6, 7)   -- 1 = Monday … 7 = Sunday

-- Oracle: independent of NLS settings
WHERE TO_CHAR(d, 'DY', 'NLS_DATE_LANGUAGE=ENGLISH') IN ('SAT', 'SUN')

-- SQLite
WHERE strftime('%w', d) IN ('0', '6')
```

A calendar table (Section 13.11) with an `IsWeekend` column avoids the problem entirely.

---

# Month and Weekday Names

```sql
-- PostgreSQL / Oracle
SELECT TO_CHAR(DATE '2026-09-28', 'FMDay, FMMonth DD');         -- Monday, September 28

-- MySQL
SELECT DAYNAME('2026-09-28'), MONTHNAME('2026-09-28');           -- Monday, September

-- SQL Server
SELECT DATENAME(weekday, '2026-09-28'), DATENAME(month, '2026-09-28');   -- Monday, September

-- SQLite: no names; map numbers yourself
SELECT CASE strftime('%w', '2026-09-28') WHEN '0' THEN 'Sunday' WHEN '1' THEN 'Monday' ... END;
```

Names follow the session language: `SET LANGUAGE` (SQL Server), `lc_time_names` (MySQL), `NLS_DATE_LANGUAGE` (Oracle), `lc_time` with the `TM` prefix (PostgreSQL). Never compare with names unless you fix the language, and never sort by them—`April` sorts before `January`.

---

# Building Dates From Parts

The reverse of extraction:

```sql
-- PostgreSQL
SELECT make_date(2026, 9, 28), make_timestamp(2026, 9, 28, 14, 30, 0);

-- MySQL
SELECT MAKEDATE(2026, 271);                               -- year + day of year → 2026-09-28
SELECT STR_TO_DATE(CONCAT(2026, '-', 9, '-', 28), '%Y-%m-%d');

-- SQL Server
SELECT DATEFROMPARTS(2026, 9, 28), DATETIME2FROMPARTS(2026, 9, 28, 14, 30, 0, 0, 0);

-- Oracle
SELECT TO_DATE(2026 || '-' || 9 || '-' || 28, 'YYYY-MM-DD') FROM dual;

-- SQLite
SELECT printf('%04d-%02d-%02d', 2026, 9, 28);
```

Building dates from parts is the right way to compute boundaries such as "first day of the order's month" on engines without truncation functions—but Section 13.07 shows simpler forms.

---

# Grouping by Parts

```sql
SELECT
    EXTRACT(YEAR  FROM o.OrderDate) AS Y,
    EXTRACT(MONTH FROM o.OrderDate) AS M,
    COUNT(*)                        AS Orders
FROM Orders AS o
GROUP BY EXTRACT(YEAR FROM o.OrderDate), EXTRACT(MONTH FROM o.OrderDate)
ORDER BY Y, M;
```

Grouping by `MONTH` alone merges September 2025 with September 2026. Always group by year **and** month—or by a truncated date (Section 13.07), which carries both in one value.

---

# Parts in WHERE

```sql
-- ❌ Function on the column: every row is read and computed
WHERE EXTRACT(YEAR FROM OrderDate) = 2026

-- ✅ Range on the bare column: index range seek
WHERE OrderDate >= DATE '2026-01-01' AND OrderDate < DATE '2027-01-01'
```

Some part-based filters have no range equivalent—"all orders placed on a Monday", "every order in December of any year". For those, use a calendar table join or an expression index on the part (Section 13.15).

---

# Visual Representation

```text
             2026-09-28 14:30:05.123
               │    │  │  │  │  │
   YEAR ───────┘    │  │  │  │  └──── SECOND 5.123
   MONTH ───────────┘  │  │  └─────── MINUTE 30
   DAY ────────────────┘  └────────── HOUR 14
   derived:  QUARTER 3 · DOY 271 · ISODOW 1 (Monday) · ISO WEEK 40 · EPOCH 1790605805.123
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← parts of indexed columns here force a scan; use ranges
4. GROUP BY    ← parts define time buckets: group by year AND month
5. HAVING
6. WINDOW
7. SELECT      ← names and numbers of parts for display
8. DISTINCT
9. ORDER BY    ← order by numbers, not names
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
EXTRACT(MONTH FROM OrderDate)
  internal date (days since epoch) → civil calendar conversion → month field
  cost: a few arithmetic operations per row
In WHERE:  no index on the expression → evaluated for every scanned row → Filter
In GROUP BY: computed per row, then hashed or sorted into groups
```

---

# 🏗️ Architecture Insight

Frequently used parts—year, month, quarter, ISO week, weekday, fiscal period—belong in a calendar table, computed once for every date. Queries then join on the date and read the parts, instead of repeating engine-specific extraction logic in every report.

---

# ⚡ Performance Tip

If you must filter by a part with no range form (for example, weekday), SQL Server computed columns, MySQL generated columns and PostgreSQL expression indexes can index it: `CREATE INDEX ix_orders_isodow ON Orders ((EXTRACT(ISODOW FROM OrderDate)))`.

---

# 🌍 Production Consideration

Weekday numbers and names change with session settings (`SET DATEFIRST`, `SET LANGUAGE`, `NLS_TERRITORY`, `lc_time_names`). A connection pool configured differently from your development machine can shift every "weekend" filter by a day. Use setting-independent expressions or a calendar table.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `EXTRACT` | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Shortcut functions | ❌ | ❌ | `YEAR()`, `MONTH()`, … | `YEAR()`, `MONTH()`, `DAY()` | ❌ | ❌ |
| Weekday base | ❌ | `DOW` 0 = Sun, `ISODOW` 1 = Mon | 1 = Sun / 0 = Mon | `DATEFIRST` | NLS | 0 = Sun |
| Names | ❌ | `TO_CHAR` | `DAYNAME`, `MONTHNAME` | `DATENAME` | `TO_CHAR` | ❌ |
| Build from parts | ❌ | `make_date` | `MAKEDATE` | `DATEFROMPARTS` | `TO_DATE` | `printf` |

> **Portability Tip:** `EXTRACT(YEAR | MONTH | DAY …)` is portable across PostgreSQL, MySQL and Oracle. Weekday numbers and names are not portable anywhere—use a calendar table.

---

# Common Mistakes

### Mistake 1

Grouping by month without year.

---

### Mistake 2

Assuming weekday 1 is Monday.

---

### Mistake 3

Filtering with `YEAR(OrderDate) = 2026` on an indexed column.

---

### Mistake 4

Comparing SQLite `strftime` output with numbers.

---

### Mistake 5

Sorting by month name.

---

# Best Practices

✔ Use `EXTRACT` where available; `DATEPART` on SQL Server.

✔ Use ISO weekday numbering or setting-independent expressions.

✔ Group by year and month, or by a truncated date.

✔ Filter with ranges, not extracted parts.

✔ Keep part names for display only.

---

# Interview Questions

## Basic

1. How do you get the year of a date in standard SQL?
2. What is the SQL Server equivalent of `EXTRACT`?
3. How do you get a month name?

## Intermediate

4. What does MySQL `DAYOFWEEK` return for a Monday?
5. Why is grouping by `MONTH(OrderDate)` alone wrong?
6. Why is `WHERE YEAR(OrderDate) = 2026` slow?

## Advanced

7. Write a weekend test that works regardless of `SET DATEFIRST`.
8. How would you index "orders placed on a Monday"?

---

# Hands-on Exercises

## Exercise 1

Show each order's year, quarter, month, ISO weekday and day of year.

---

## Exercise 2

Count orders per weekday name, ordered Monday to Sunday.

---

## Exercise 3

Build the first day of each order's month from its parts.

---

# Related Topics

- **13.07 — Truncating and Bucketing Dates (DATE_TRUNC and date_bin)**
- **13.11 — Generating Date Series and Calendar Tables**
- **13.12 — Weeks, Quarters and Fiscal Calendars**
- **08.06 — Grouping by Multiple Columns and Expressions**
- **06.09 — Filtering with Expressions and Functions**

---

# Summary

`EXTRACT` (or `DATEPART`, `YEAR()`, `strftime`) returns one part of a date: year, quarter, month, day, day of year, hour, second or epoch. The names differ by engine, SQLite returns text, and weekday numbering differs everywhere and may depend on session settings—use ISO numbering, setting-independent expressions or a calendar table. Parts are for `SELECT` and `GROUP BY` (always year with month); in `WHERE`, replace them with ranges on the bare column, or back them with an expression index.
