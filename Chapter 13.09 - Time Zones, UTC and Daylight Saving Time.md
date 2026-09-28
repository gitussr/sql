---
title: "13.09 - Time Zones, UTC and Daylight Saving Time"
description: "Offsets versus IANA zone names, storing instants in UTC, converting with AT TIME ZONE, CONVERT_TZ, FROM_TZ and SQLite's localtime modifier; the two directions of AT TIME ZONE in PostgreSQL; session time zones; daylight saving gaps and overlaps; local business days from UTC instants; time zone data updates; and designing schemas for global users."
chapter: 13
section: 13.09
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 30 min
lastUpdated: 2026-09-28
---

# 13.09 Time Zones, UTC and Daylight Saving Time

---

# Learning Objectives

After completing this section, you will be able to:

- Distinguish an offset from a time zone.
- Store instants in UTC and convert them for display or reporting.
- Use `AT TIME ZONE` correctly in both directions.
- Explain what happens to local times in daylight saving gaps and overlaps.
- Compute a user's local business day from a UTC instant.
- Keep time zone rules up to date.

---

# Offsets vs Time Zones

```text
OFFSET      a fixed difference from UTC            +05:30, -04:00, Z
            says nothing about other dates

TIME ZONE   a region's rules over time              Asia/Kolkata, America/New_York, Europe/London
            (IANA name)                             includes every past and future offset change,
                                                    daylight saving, and political changes
```

`America/New_York` is `-05:00` in winter and `-04:00` in summer. Knowing that an event happened at `-04:00` does not tell you whether it was in New York, Toronto or Santiago—or what the offset will be next month.

- Store **offsets** (or UTC) for past instants: they are enough to identify the moment.
- Store **IANA zone names** when you need to compute local times for other dates: recurring meetings, future appointments, "9 a.m. every day for this user".
- Avoid abbreviations like `IST` (India? Ireland? Israel?) and `CST` (US Central? China?).

---

# The UTC Rule

```text
Write:    convert to UTC at the boundary  →  store UTC (or timestamptz)
Compute:  in UTC  (differences, ordering, "last 24 hours")
Present:  convert to the viewer's zone at the last moment
Report:   convert to the BUSINESS zone before truncating to days
```

Set the database server, application servers and connection sessions to UTC as well, so that functions such as `GETDATE()`, `NOW()` and implicit conversions cannot shift values.

---

# PostgreSQL: AT TIME ZONE

`AT TIME ZONE` does two opposite things depending on the input type:

```sql
-- timestamptz AT TIME ZONE zone → timestamp (local wall-clock in that zone)
SELECT TIMESTAMPTZ '2026-09-28 20:00:00+00' AT TIME ZONE 'Asia/Kolkata';
-- 2026-09-29 01:30:00        "what did the clock in Kolkata show?"

-- timestamp AT TIME ZONE zone → timestamptz (interpret wall-clock as that zone)
SELECT TIMESTAMP '2026-09-29 01:30:00' AT TIME ZONE 'Asia/Kolkata';
-- 2026-09-28 20:00:00+00     "which instant is 01:30 in Kolkata?"
```

```text
 timestamptz (instant) ── AT TIME ZONE 'X' ──▶ timestamp (wall-clock in X)
 timestamp (wall-clock) ── AT TIME ZONE 'X' ──▶ timestamptz (instant)
```

Applying it twice to the wrong type is a common way to shift values by the offset twice.

The session setting controls how `timestamptz` is displayed and how untyped strings are interpreted:

```sql
SET TimeZone = 'UTC';
```

---

# SQL Server: AT TIME ZONE and datetimeoffset

```sql
-- datetime2 (no offset) AT TIME ZONE → datetimeoffset: "this wall-clock is in that zone"
SELECT CAST('2026-09-29 01:30' AS datetime2) AT TIME ZONE 'India Standard Time';
-- 2026-09-29 01:30:00 +05:30

-- datetimeoffset AT TIME ZONE → datetimeoffset converted to that zone
SELECT CAST('2026-09-28 20:00 +00:00' AS datetimeoffset) AT TIME ZONE 'India Standard Time';
-- 2026-09-29 01:30:00 +05:30

-- UTC datetime2 column → local wall-clock
SELECT CreatedAtUtc AT TIME ZONE 'UTC' AT TIME ZONE 'Eastern Standard Time' AS CreatedLocal
FROM Orders;
```

SQL Server uses **Windows** zone names (`'Eastern Standard Time'`, which also covers daylight time), listed in `sys.time_zone_info`. SQL Server 2016+ only. `SWITCHOFFSET(dto, '+05:30')` changes the offset without DST rules.

---

# MySQL: CONVERT_TZ

```sql
-- named zones require the time zone tables to be loaded (mysql_tzinfo_to_sql)
SELECT CONVERT_TZ('2026-09-28 20:00:00', 'UTC', 'Asia/Kolkata');      -- 2026-09-29 01:30:00
SELECT CONVERT_TZ('2026-09-28 20:00:00', '+00:00', '+05:30');         -- works without tables

SET time_zone = '+00:00';     -- session zone: affects NOW() and TIMESTAMP columns
```

`CONVERT_TZ` returns `NULL` when a named zone is unknown—usually because the zone tables were never loaded. Check with `SELECT CONVERT_TZ(NOW(), 'UTC', 'Asia/Kolkata')` after provisioning a server.

---

# Oracle

```sql
SELECT FROM_TZ(TIMESTAMP '2026-09-29 01:30:00', 'Asia/Kolkata')                -- attach a zone
FROM dual;
SELECT FROM_TZ(TIMESTAMP '2026-09-28 20:00:00', 'UTC') AT TIME ZONE 'Asia/Kolkata'
FROM dual;                                                                       -- convert
SELECT SYS_EXTRACT_UTC(SYSTIMESTAMP) FROM dual;                                  -- now in UTC
SELECT SESSIONTIMEZONE, DBTIMEZONE FROM dual;
```

`TIMESTAMP WITH LOCAL TIME ZONE` columns are normalised to the database zone and displayed in the session zone automatically.

---

# SQLite

```sql
SELECT datetime('2026-09-28 20:00:00', 'localtime');   -- UTC → the OS local zone of the process
SELECT datetime('2026-09-29 01:30:00', 'utc');         -- OS local → UTC
SELECT datetime('2026-09-28 20:00:00', '+330 minutes');-- fixed offset
```

SQLite knows only UTC and the process's local zone. Conversions to arbitrary named zones must happen in the application.

---

# Daylight Saving Gaps and Overlaps

When clocks go forward, an hour of local time **does not exist**. When they go back, an hour **happens twice**.

```text
America/New_York, 2026-03-08 (spring forward)       2026-11-01 (fall back)
  01:59 EST  →  03:00 EDT                            01:59 EDT → 01:00 EST
  02:00–02:59 never happens (GAP)                    01:00–01:59 happens twice (OVERLAP)
```

```sql
-- PostgreSQL: a non-existent local time is shifted forward
SELECT TIMESTAMP '2026-03-08 02:30' AT TIME ZONE 'America/New_York';   -- 2026-03-08 07:30:00+00 (03:30 EDT)

-- An ambiguous local time picks one of the two instants
SELECT TIMESTAMP '2026-11-01 01:30' AT TIME ZONE 'America/New_York';   -- one of 05:30 or 06:30 UTC
```

Consequences:

- A local-time column cannot represent both 01:30 events on 2026-11-01 distinctly—sorting by it puts events out of order.
- A daily job scheduled at 02:30 local time does not run on 2026-03-08 unless the scheduler handles the gap.
- Durations computed from local times are an hour off across the change.

UTC has no gaps or overlaps. That is the main reason to store it.

---

# Local Business Days From UTC Instants

A daily sales report for a store in Kolkata must group by the **Kolkata** date:

```sql
-- PostgreSQL
SELECT (o.CreatedAt AT TIME ZONE 'Asia/Kolkata')::date AS BusinessDay,
       COUNT(*), SUM(o.TotalAmount)
FROM Orders AS o
WHERE o.CreatedAt >= TIMESTAMP '2026-09-01' AT TIME ZONE 'Asia/Kolkata'
  AND o.CreatedAt <  TIMESTAMP '2026-10-01' AT TIME ZONE 'Asia/Kolkata'
GROUP BY BusinessDay
ORDER BY BusinessDay;
```

The `WHERE` clause converts the **boundaries** (September 1 and October 1 in Kolkata) into instants once, and compares them with the bare `CreatedAt` column—so the index on `CreatedAt` is still used.

For users in many zones, join each row to its customer's zone:

```sql
SELECT c.CustomerID,
       (o.CreatedAt AT TIME ZONE c.TimeZone) AS LocalPlacedAt
FROM Orders AS o
JOIN Customers AS c ON c.CustomerID = o.CustomerID;
```

---

# Keeping Zone Rules Current

Governments change time zone rules—abolishing daylight saving, moving offsets, sometimes with weeks of notice. Engines ship a copy of the IANA time zone database:

- **PostgreSQL** bundles it (or uses the OS copy); minor releases update it.
- **MySQL** reads the `mysql.time_zone*` tables loaded from the OS; reload after OS updates.
- **SQL Server** uses the Windows registry; Windows updates change it.
- **Oracle** ships time zone files upgraded with `DBMS_DST`.

Outdated rules produce wrong local times for affected zones—another reason to store UTC and convert at the edges.

---

# Visual Representation

```text
       store                      compute                        show / report
  ┌──────────────────┐      ┌─────────────────────┐      ┌──────────────────────────────┐
  │ CreatedAt (UTC)  │─────▶│ differences, order, │─────▶│ AT TIME ZONE viewer's zone   │
  │ no gaps/overlaps │      │ last 24 hours       │      │ business zone before ::date  │
  └──────────────────┘      └─────────────────────┘      └──────────────────────────────┘
          ▲
  convert at write:  local + IANA zone → UTC
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN        ← join to Customers for each user's zone name
3. WHERE       ← convert the boundaries to UTC, keep CreatedAt bare
4. GROUP BY    ← convert to the business zone BEFORE truncating to a date
5. HAVING
6. WINDOW
7. SELECT      ← convert to the viewer's zone for display
8. DISTINCT
9. ORDER BY    ← order by the UTC instant, not by local wall-clock
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
CreatedAt AT TIME ZONE 'Asia/Kolkata'
  look up the zone's rules (cached) → find the offset valid at that instant → add it
  cost: a rule lookup per row — noticeable on hundreds of millions of rows
WHERE CreatedAt >= <boundary AT TIME ZONE …>
  boundary converted once → index range seek on CreatedAt
```

---

# 🏗️ Architecture Insight

A global system needs three things per event: the UTC instant, the zone in which it should be interpreted (the user's or the store's), and often the derived local business date, stored at write time. Storing the business date avoids repeating zone conversions in every report and freezes the answer even if zone rules later change.

---

# ⚡ Performance Tip

Converting every row's timestamp to local time in `WHERE` disables the index. Convert the constant boundaries instead—two conversions per query rather than one per row.

---

# 🔒 Security Note

Do not trust a client-supplied offset or zone for audit or expiry logic. Record the server's UTC time for security-relevant events, and treat the client's zone only as a display preference.

---

# 🌍 Production Consideration

Scheduled jobs, cut-off times and "end of day" batches expressed in local time must handle the gap and overlap days. Test each scheduled time against both daylight saving transitions of every zone you operate in.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `AT TIME ZONE` | ✅ | ✅ (two directions) | ❌ | ✅ (2016+) | ✅ | ❌ |
| Conversion function | ❌ | `timezone(zone, ts)` | `CONVERT_TZ` | `SWITCHOFFSET` (offset only) | `FROM_TZ`, `NEW_TIME` | `'localtime'`, `'utc'` |
| Zone names | ❌ | IANA | IANA (tables must be loaded) | Windows names | IANA | OS local only |
| Session zone | `SET TIME ZONE` | `SET TimeZone` | `SET time_zone` | ❌ (server OS) | `ALTER SESSION SET TIME_ZONE` | ❌ |

> **Portability Tip:** Storing UTC and converting in the application is the most portable design. In SQL, `AT TIME ZONE` works on PostgreSQL, SQL Server and Oracle, but with different zone names on SQL Server.

---

# Common Mistakes

### Mistake 1

Storing local timestamps without a zone.

---

### Mistake 2

Using abbreviations like `IST` or `CST` as zone identifiers.

---

### Mistake 3

Truncating UTC instants to dates for a local business report.

---

### Mistake 4

Applying `AT TIME ZONE` to the wrong input type and shifting twice.

---

### Mistake 5

Forgetting to load MySQL time zone tables, so `CONVERT_TZ` returns `NULL`.

---

# Best Practices

✔ Store instants in UTC or as timestamps with time zone.

✔ Store IANA zone names for users, stores and future local appointments.

✔ Convert to the business zone before truncating to dates.

✔ Convert constant boundaries in `WHERE`, not the column.

✔ Keep servers and sessions in UTC and zone data up to date.

---

# Interview Questions

## Basic

1. What is the difference between an offset and a time zone?
2. Why store timestamps in UTC?
3. How do you convert a UTC timestamp to Kolkata time on PostgreSQL?

## Intermediate

4. What are the two behaviours of `AT TIME ZONE` in PostgreSQL?
5. What happens to 02:30 local time on the spring-forward day?
6. Why does `CONVERT_TZ` return `NULL` on a new MySQL server?

## Advanced

7. How would you report daily sales in each store's local business day efficiently?
8. Why should a future appointment be stored as local time plus zone name?

---

# Hands-on Exercises

## Exercise 1

Show each order's `CreatedAt` in UTC, in `Asia/Kolkata` and in the customer's own zone.

---

## Exercise 2

Count orders per local business day for September 2026 in `America/New_York`, using an index-friendly `WHERE`.

---

## Exercise 3

List every local time on 2026-11-01 in `America/New_York` between 00:30 and 02:30 in 30-minute steps, with the UTC instant each maps to.

---

# Related Topics

- **13.02 — Date and Time Data Types**
- **13.03 — Current Date and Time**
- **13.07 — Truncating and Bucketing Dates (DATE_TRUNC and date_bin)**
- **13.10 — Filtering Date Ranges (Half-Open Intervals)**

---

# Summary

An offset identifies an instant; a time zone (an IANA name) holds a region's rules, including daylight saving. Store instants in UTC or as timestamps with time zone, store zone names where future local times matter, and convert at the edges: `AT TIME ZONE` on PostgreSQL, SQL Server and Oracle (with two directions in PostgreSQL and Windows names on SQL Server), `CONVERT_TZ` on MySQL, and only local/UTC on SQLite. Local time has gaps and overlaps at daylight saving changes; UTC does not. Convert to the business zone before truncating to dates, convert constant boundaries rather than columns in `WHERE`, and keep zone data current.
