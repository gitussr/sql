---
title: "13.02 - Date and Time Data Types"
description: "DATE, TIME, TIMESTAMP, TIMESTAMP WITH TIME ZONE and INTERVAL in standard SQL and their equivalents on PostgreSQL, MySQL, SQL Server, Oracle and SQLite: ranges, precision, storage, the difference between an instant and a wall-clock time, SQL Server DATETIME rounding, MySQL's 2038 TIMESTAMP limit, Oracle's DATE with a time, SQLite's text dates, and how to choose a type for each column."
chapter: 13
section: 13.02
category: Data Query Language (DQL)
difficulty: Beginner
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 13.02 Date and Time Data Types

---

# Learning Objectives

After completing this section, you will be able to:

- Name the standard temporal types and what each one holds.
- Map them to the types of each major engine.
- Distinguish an instant from a local wall-clock time.
- Choose precision and range deliberately.
- Avoid the type traps of SQL Server, MySQL, Oracle and SQLite.

---

# The Standard Types

| Standard type | Holds | Example |
|---------------|-------|---------|
| `DATE` | Year, month, day | `2026-09-28` |
| `TIME [(p)]` | Hour, minute, second, fraction | `14:30:05.123` |
| `TIMESTAMP [(p)]` | Date and time, **no** time zone | `2026-09-28 14:30:05` |
| `TIMESTAMP [(p)] WITH TIME ZONE` | Date, time and offset | `2026-09-28 14:30:05+05:30` |
| `INTERVAL` | A duration | `INTERVAL '3' DAY`, `INTERVAL '1-6' YEAR TO MONTH` |

`p` is the fractional-second precision: 0 (seconds) to 6 (microseconds) on most engines, 7 on SQL Server, 9 on Oracle.

---

# Instant vs Wall-Clock Time

This is the most important distinction in the chapter.

```text
INSTANT           a single point on the global timeline
                  "the order was placed at 2026-09-28 09:00:00 UTC"
                  same moment for everyone, everywhere
                  → TIMESTAMP WITH TIME ZONE, or TIMESTAMP holding UTC by convention

WALL-CLOCK TIME   what a clock on a wall shows somewhere
                  "the store opens at 09:00"  ·  "the meeting is at 14:30 Kolkata time"
                  meaningless as an instant until you know the zone
                  → TIMESTAMP (without time zone), TIME, plus a zone column if needed

CALENDAR DATE     a day on a calendar, not a moment
                  "hired on 2026-09-28" · "birthday 1990-10-15"
                  → DATE
```

Choose by asking what the value means:

- `CreatedAt`, `ShippedAt`, `LoggedInAt` → **instants**.
- `OrderDate` (the business day), `BirthDate`, `HireDate`, `DueDate` → **dates**.
- `StoreOpensAt`, a future appointment in the customer's zone → **wall-clock time** plus a zone.

> Future local appointments are the exception to "store UTC". If a country changes its daylight saving rules after the appointment is booked, the UTC instant computed at booking time will be wrong. Store the local time and the IANA zone name, and compute the instant when needed.

---

# PostgreSQL

| Type | Range | Resolution | Notes |
|------|-------|------------|-------|
| `date` | 4713 BC – 5874897 AD | 1 day | |
| `time` | 00:00 – 24:00 | 1 µs | |
| `timestamp` | 4713 BC – 294276 AD | 1 µs | No zone: wall-clock |
| `timestamptz` | same | 1 µs | Stored as UTC, shown in the session `TimeZone` |
| `interval` | ±178,000,000 years | 1 µs | Months, days and microseconds kept separately |

```sql
SELECT TIMESTAMPTZ '2026-09-28 14:30:00+05:30';
-- shown as 2026-09-28 09:00:00+00 when the session TimeZone is UTC
```

`timestamptz` does **not** store the original offset—it converts to UTC on input and to the session zone on output. Keep a separate zone column if you need to know where the event happened.

---

# MySQL

| Type | Range | Notes |
|------|-------|-------|
| `DATE` | 1000-01-01 – 9999-12-31 | |
| `TIME` | −838:59:59 – 838:59:59 | Can hold durations |
| `DATETIME(p)` | 1000-01-01 – 9999-12-31 | Wall-clock; stored as written |
| `TIMESTAMP(p)` | 1970-01-01 00:00:01 UTC – **2038-01-19 03:14:07 UTC** | Converted from session zone to UTC on write, back on read |
| `YEAR` | 1901 – 2155 | |

```sql
SET time_zone = '+05:30';
INSERT INTO t (dt, ts) VALUES ('2026-09-28 14:30:00', '2026-09-28 14:30:00');
SET time_zone = '+00:00';
SELECT dt, ts FROM t;   -- dt: 2026-09-28 14:30:00   ts: 2026-09-28 09:00:00
```

`TIMESTAMP` ends in January 2038. Contracts, subscriptions and expiry dates can already exceed it; use `DATETIME` holding UTC for anything that may reach 2038.

---

# SQL Server

| Type | Range | Precision | Notes |
|------|-------|-----------|-------|
| `date` | 0001-01-01 – 9999-12-31 | 1 day | 3 bytes |
| `time(p)` | 00:00 – 23:59:59.9999999 | 100 ns | |
| `datetime2(p)` | 0001 – 9999 | 100 ns | **Preferred** for new code |
| `datetimeoffset(p)` | 0001 – 9999 | 100 ns | Stores the offset, not the zone name |
| `datetime` | 1753 – 9999 | **3.33 ms**, rounded to .000/.003/.007 | Legacy |
| `smalldatetime` | 1900 – 2079 | 1 minute | Legacy |

```sql
SELECT CAST('2026-09-28 23:59:59.999' AS DATETIME);
-- 2026-09-29 00:00:00.000  ← rounded up into the next day
```

This rounding is why `BETWEEN '2026-09-28' AND '2026-09-28 23:59:59.999'` on a `datetime` column includes midnight of the next day. Use `datetime2` and half-open ranges.

---

# Oracle

| Type | Holds | Notes |
|------|-------|-------|
| `DATE` | Date **and time to the second** | Default display often hides the time |
| `TIMESTAMP(p)` | Date and time, fraction to 9 digits | |
| `TIMESTAMP WITH TIME ZONE` | Plus offset or region name | Keeps the zone as written |
| `TIMESTAMP WITH LOCAL TIME ZONE` | Normalised to the database zone | Shown in the session zone |
| `INTERVAL YEAR TO MONTH` | Years and months | |
| `INTERVAL DAY TO SECOND` | Days to fractional seconds | |

```sql
SELECT TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI:SS') FROM dual;   -- shows the hidden time
```

Oracle has no date-only type. Keep a `DATE` column time-free with a check constraint:

```sql
ALTER TABLE Orders ADD CONSTRAINT ck_orderdate_midnight CHECK (OrderDate = TRUNC(OrderDate));
```

---

# SQLite

SQLite has **no** date or time types. It stores dates in one of three representations and provides functions that understand all three:

| Representation | Example | Sorts correctly as stored? |
|----------------|---------|----------------------------|
| ISO-8601 text | `'2026-09-28 14:30:00'` | ✅ (if always the same format) |
| Julian day number (`REAL`) | `2461312.1041667` | ✅ |
| Unix time (`INTEGER`) | `1790605800` | ✅ |

```sql
SELECT date('2026-09-28'), datetime(1790605800, 'unixepoch'), julianday('2026-09-28');
```

Pick one representation per column and enforce it with a `CHECK`, e.g. `CHECK (OrderDate IS date(OrderDate))`, so that `'28/09/2026'` cannot sneak in.

---

# Choosing a Type

| Column meaning | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------------|------------|-------|------------|--------|--------|
| Business date | `date` | `DATE` | `date` | `DATE` + `TRUNC` check | ISO text `YYYY-MM-DD` |
| Instant | `timestamptz` | `DATETIME(6)` in UTC (or `TIMESTAMP` before 2038) | `datetime2` in UTC or `datetimeoffset` | `TIMESTAMP WITH TIME ZONE` or UTC `TIMESTAMP` | ISO text in UTC, or Unix integer |
| Local wall-clock | `timestamp` + zone column | `DATETIME` + zone column | `datetime2` + zone column | `TIMESTAMP` + zone column | ISO text + zone column |
| Duration | `interval` or numeric seconds | numeric seconds | numeric seconds | `INTERVAL DAY TO SECOND` | numeric seconds |

Choose precision deliberately: milliseconds (3) or microseconds (6) are plenty for application events, and matching precision across related columns avoids equality surprises.

---

# Visual Representation

```text
                    DATE           TIMESTAMP              TIMESTAMP WITH TIME ZONE
                   ┌─────────┐    ┌──────────────────┐    ┌──────────────────────────┐
 what it holds     │ Y-M-D   │    │ Y-M-D h:m:s      │    │ Y-M-D h:m:s ± offset     │
 is it an instant? │ no      │    │ no (wall-clock)  │    │ yes                      │
 use for           │ HireDate│    │ StoreOpensAt     │    │ CreatedAt, ShippedAt     │
                   └─────────┘    └──────────────────┘    └──────────────────────────┘
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN        ← joining DATE to TIMESTAMP converts one side for every row pair
3. WHERE       ← comparing a DATE column with a TIMESTAMP value converts the column on some engines
4. GROUP BY
5. HAVING
6. WINDOW
7. SELECT      ← CAST(ts AS DATE) to show only the date
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

Type mismatches between a column and the value it is compared with trigger implicit conversion (Section 12.08). Compare `DATE` columns with `DATE` values and timestamps with timestamps.

---

# How the DBMS Executes This

```text
INSERT '2026-09-28 14:30:00+05:30' into:
  PostgreSQL timestamptz → convert to UTC → store 09:00:00 UTC
  MySQL TIMESTAMP        → convert from session time_zone to UTC → store
  MySQL DATETIME         → store as written (offset rejected before 8.0.19, converted after)
  SQL Server datetimeoffset → store 14:30:00 and +05:30
  Oracle TIMESTAMP WITH TIME ZONE → store 14:30:00 and +05:30
  SQLite                 → store the text exactly as written
```

---

# 🏗️ Architecture Insight

A column's type is documentation. A `DATE` says "a calendar day"; a `timestamptz` says "an instant"; a `TIMESTAMP` without zone says "a wall-clock reading"—and should always come with a note (or a zone column) saying whose wall. Choosing types by meaning prevents entire classes of bugs before any query is written.

---

# ⚡ Performance Tip

Smaller types make smaller indexes: a `DATE` is 3–4 bytes, a timestamp 8. Index a business `DATE` column rather than deriving the date from a timestamp at query time.

---

# 🔒 Security Note

Do not accept dates from clients as free text and store them unchanged, especially in SQLite or text columns. Validate and convert at the boundary so malformed or out-of-range values cannot break reports or bypass expiry checks.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Date only | `DATE` | ✅ | ✅ | ✅ | ❌ (has time) | Text |
| Timestamp | `TIMESTAMP` | ✅ | `DATETIME` | `datetime2` | ✅ | Text |
| With time zone | ✅ | Converted to UTC | `TIMESTAMP` (UTC, to 2038) | `datetimeoffset` | ✅ (keeps zone) | ❌ |
| Interval | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Max fraction digits | Implementation | 6 | 6 | 7 | 9 | Any (text) |

> **Portability Tip:** `DATE` and a UTC timestamp at microsecond precision are the most portable pair. Avoid relying on stored offsets or interval columns if the schema must move between engines.

---

# Common Mistakes

### Mistake 1

Storing dates as `VARCHAR` or as integers like `20260928`.

---

### Mistake 2

Using SQL Server `datetime` and being surprised by 3 ms rounding.

---

### Mistake 3

Using MySQL `TIMESTAMP` for dates that may be after 2038.

---

### Mistake 4

Storing local timestamps without recording the zone.

---

### Mistake 5

Assuming PostgreSQL `timestamptz` remembers the original offset.

---

# Best Practices

✔ Use `DATE` for calendar days and a timestamp with zone (or UTC) for instants.

✔ Prefer `datetime2` on SQL Server and `DATETIME` over `TIMESTAMP` on MySQL for long-lived values.

✔ Constrain Oracle `DATE` business dates to midnight and SQLite dates to one format.

✔ Store an IANA zone name alongside local wall-clock times.

✔ Match precision across related columns.

---

# Interview Questions

## Basic

1. What is the difference between `DATE` and `TIMESTAMP`?
2. Which type would you use for a birth date?
3. Does SQLite have a date type?

## Intermediate

4. What is the difference between an instant and a wall-clock time?
5. What does `CAST('2026-09-28 23:59:59.999' AS DATETIME)` return on SQL Server?
6. What happens to MySQL `TIMESTAMP` values in 2038?

## Advanced

7. Why should future local appointments be stored as local time plus a zone name, not UTC?
8. What does PostgreSQL store for a `timestamptz` value, and what does it lose?

---

# Hands-on Exercises

## Exercise 1

Classify each temporal column in the sample schema as instant, date or wall-clock time.

---

## Exercise 2

On SQL Server, compare the stored value of `'2026-09-28 23:59:59.999'` in `datetime`, `datetime2(3)` and `datetime2(7)`.

---

## Exercise 3

On Oracle, add a check constraint that keeps `HireDate` at midnight, and find existing violations.

---

# Related Topics

- **13.01 — Introduction to Date and Time Functions**
- **13.09 — Time Zones, UTC and Daylight Saving Time**
- **12.08 — Type Conversion (CAST, CONVERT and TRY_CAST)**
- **03.05 — SQL Data Types**

---

# Summary

Standard SQL defines `DATE`, `TIME`, `TIMESTAMP`, `TIMESTAMP WITH TIME ZONE` and `INTERVAL`, but each engine implements them differently: PostgreSQL converts `timestamptz` to UTC, MySQL's `TIMESTAMP` ends in 2038, SQL Server's legacy `datetime` rounds to 3.33 ms, Oracle's `DATE` carries a time, and SQLite has no temporal types at all. Choose types by meaning—`DATE` for calendar days, a timestamp with zone or UTC for instants, and a local timestamp plus a zone name for future wall-clock times—and constrain columns so they can hold only what they are meant to.
