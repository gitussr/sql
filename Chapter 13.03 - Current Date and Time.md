---
title: "13.03 - Current Date and Time"
description: "CURRENT_DATE, CURRENT_TIMESTAMP, LOCALTIMESTAMP, NOW(), GETDATE(), SYSDATETIME(), SYSUTCDATETIME(), SYSDATE and SQLite's 'now': which time zone each returns, whether it is fixed for the statement, the transaction or each call, using the database clock for defaults and audit columns, testing code that depends on now, and keeping 'now' out of cached plans and indexes."
chapter: 13
section: 13.03
category: Data Query Language (DQL)
difficulty: Beginner
readingTime: 20 min
lastUpdated: 2026-09-28
---

# 13.03 Current Date and Time

---

# Learning Objectives

After completing this section, you will be able to:

- Get the current date and timestamp on each major engine.
- Predict which time zone each "now" function returns.
- Explain statement, transaction and call-level stability of "now".
- Use the database clock for defaults and audit columns.
- Write date logic that can be tested with a fixed "now".

---

# The Standard Functions

```sql
SELECT
    CURRENT_DATE,          -- today's date in the session time zone
    CURRENT_TIME,          -- time with time zone (rarely useful)
    CURRENT_TIMESTAMP,     -- timestamp WITH time zone
    LOCALTIME,             -- time without time zone
    LOCALTIMESTAMP;        -- timestamp WITHOUT time zone (session wall-clock)
```

The standard forms have **no parentheses**. `CURRENT_TIMESTAMP` is the most portable "now" there is: every major engine accepts it.

---

# Vendor Functions

| Engine | Date | Timestamp (local) | Timestamp (UTC) | Changes within a statement? |
|--------|------|-------------------|-----------------|-----------------------------|
| PostgreSQL | `CURRENT_DATE` | `LOCALTIMESTAMP` | `NOW()` / `CURRENT_TIMESTAMP` (timestamptz) | No: fixed for the **transaction**; `clock_timestamp()` changes per call |
| MySQL | `CURDATE()` | `NOW()`, `CURRENT_TIMESTAMP` | `UTC_TIMESTAMP()` | No: fixed for the statement; `SYSDATE()` changes per call |
| SQL Server | `CAST(GETDATE() AS date)` | `GETDATE()`, `SYSDATETIME()` | `GETUTCDATE()`, `SYSUTCDATETIME()` | Evaluated once per reference in the query |
| Oracle | `TRUNC(SYSDATE)` | `SYSDATE` (DB server OS zone), `CURRENT_DATE` (session zone) | `SYS_EXTRACT_UTC(SYSTIMESTAMP)` | No: fixed for the statement |
| SQLite | `date('now')` | `datetime('now', 'localtime')` | `datetime('now')` | No: fixed for the statement (3.8.4+) |

```sql
-- PostgreSQL
SELECT NOW(), CURRENT_DATE, clock_timestamp();

-- MySQL
SELECT NOW(6), CURDATE(), UTC_TIMESTAMP(6), SYSDATE(6);

-- SQL Server
SELECT SYSDATETIME(), SYSUTCDATETIME(), SYSDATETIMEOFFSET(), CAST(GETDATE() AS date);

-- Oracle
SELECT SYSDATE, SYSTIMESTAMP, CURRENT_DATE, CURRENT_TIMESTAMP FROM dual;

-- SQLite
SELECT date('now'), datetime('now'), strftime('%Y-%m-%d %H:%M:%f', 'now'), unixepoch();
```

---

# Which Time Zone?

"Today" depends on where you are. At 2026-09-28 20:00 UTC it is already 2026-09-29 in Kolkata (UTC+05:30) and still 2026-09-28 in New York (UTC−04:00).

```text
Engine        CURRENT_DATE / NOW() is in…
PostgreSQL    the session's TimeZone setting
MySQL         the session's time_zone variable (default: server system zone)
SQL Server    the server's OS time zone (GETDATE); UTC with SYSUTCDATETIME
Oracle        SYSDATE: DB server OS zone · CURRENT_DATE: session zone
SQLite        UTC ('now'), unless you add 'localtime'
```

A report that uses `CURRENT_DATE` produces different rows when run from a session in a different zone. Decide which zone "today" belongs to—usually the business's—and compute it explicitly:

```sql
-- PostgreSQL: today in the business's zone, regardless of session
SELECT (NOW() AT TIME ZONE 'Asia/Kolkata')::date AS BusinessToday;

-- SQL Server 2016+
SELECT CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'India Standard Time' AS date) AS BusinessToday;
```

---

# Stability: Statement, Transaction or Call

```sql
-- PostgreSQL
BEGIN;
SELECT NOW();               -- 10:00:00.000
-- ... 5 seconds of work ...
SELECT NOW();               -- 10:00:00.000  (same: transaction start time)
SELECT clock_timestamp();   -- 10:00:05.123  (actual wall-clock)
COMMIT;
```

| Function | Stable for |
|----------|------------|
| PostgreSQL `NOW()`, `CURRENT_TIMESTAMP` | Transaction |
| PostgreSQL `statement_timestamp()` | Statement |
| PostgreSQL `clock_timestamp()` | Nothing (each call) |
| MySQL `NOW()` | Statement |
| MySQL `SYSDATE()` | Nothing (each call) |
| Oracle `SYSDATE`, `SYSTIMESTAMP` | Statement |
| SQL Server `GETDATE()`, `SYSDATETIME()` | Each reference is evaluated once per query, not per row |

Transaction stability is usually what you want: every row inserted by one business operation gets the same `CreatedAt`. Use the per-call variants only for measuring elapsed time.

> MySQL `SYSDATE()` is unsafe for statement-based replication and prevents index use in `WHERE`, because it is not a constant for the statement. Prefer `NOW()`.

---

# Defaults and Audit Columns

```sql
-- PostgreSQL
CREATE TABLE AuditLog (
    AuditID   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    Action    TEXT        NOT NULL,
    CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- MySQL
CREATE TABLE AuditLog (
    AuditID   BIGINT AUTO_INCREMENT PRIMARY KEY,
    Action    VARCHAR(100) NOT NULL,
    CreatedAt DATETIME(6)  NOT NULL DEFAULT (UTC_TIMESTAMP(6)),
    UpdatedAt TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
);

-- SQL Server
CREATE TABLE AuditLog (
    AuditID   BIGINT IDENTITY PRIMARY KEY,
    Action    NVARCHAR(100) NOT NULL,
    CreatedAt DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
);
```

Let the database set audit timestamps. A client clock can be minutes off, in another zone, or deliberately wrong.

---

# Relative Dates

"Now" is mostly used to build boundaries:

```sql
-- Orders from the last 30 days (PostgreSQL)
SELECT * FROM Orders WHERE OrderDate >= CURRENT_DATE - 30;

-- Invoices overdue today (SQL Server)
SELECT * FROM Invoices WHERE DueDate < CAST(GETDATE() AS date) AND PaidAt IS NULL;

-- Sessions active in the last 15 minutes (MySQL)
SELECT * FROM Sessions WHERE LastSeenAt >= UTC_TIMESTAMP() - INTERVAL 15 MINUTE;
```

Each boundary is computed once and compared with a bare column, so an index on the column can be used.

---

# Testing Code That Uses "Now"

Queries that call `CURRENT_DATE` directly give different answers every day, which makes them hard to test and hard to rerun for a past date. Pass the reference date as a parameter instead:

```sql
-- Instead of:  WHERE DueDate < CURRENT_DATE
SELECT * FROM Invoices WHERE DueDate < :as_of_date AND PaidAt IS NULL;
```

The application passes today's date in production and a fixed date in tests or when re-running last month's report.

---

# Visual Representation

```text
      transaction start                     statement start          this call
            │                                     │                     │
  ──────────●─────────────────────────────────────●─────────────────────●──────▶ time
            NOW()  (PostgreSQL)          NOW() (MySQL), SYSDATE (Oracle)  clock_timestamp(),
            CURRENT_TIMESTAMP            statement_timestamp()            SYSDATE() (MySQL)
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← CURRENT_DATE - 30 is a constant for the statement: index-friendly
4. GROUP BY
5. HAVING
6. WINDOW
7. SELECT      ← NOW() in the SELECT list returns the same value on every row
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Parse:     CURRENT_DATE recognised as a stable function
Optimize:  CURRENT_DATE - 30 folded into a run-time constant
           OrderDate >= <constant> → index range seek
Execute:   the constant is fixed at statement (or transaction) start;
           every row compares with the same value
```

Cached plans store the expression, not its value: the boundary is recomputed on every execution.

---

# 🏗️ Architecture Insight

Pick one clock. If the application sets some timestamps and the database sets others, differences between the two clocks produce events that appear to happen out of order. The database clock is usually the better single source, because every writer shares it.

---

# ⚡ Performance Tip

Functions that change per call (`clock_timestamp()`, MySQL `SYSDATE()`) are not constants, so comparisons against them cannot use an index as a range seek. Use the statement- or transaction-stable forms in `WHERE`.

---

# 🔒 Security Note

Expiry checks (password reset tokens, sessions, signed links) should compare with the database clock inside the same statement that consumes the token: `UPDATE Tokens SET UsedAt = NOW() WHERE Token = :t AND ExpiresAt > NOW() AND UsedAt IS NULL`. A check in the application followed by a separate update leaves a window for reuse.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `CURRENT_DATE` | ✅ | ✅ | ✅ | ❌ | ✅ (session zone) | ✅ (UTC) |
| `CURRENT_TIMESTAMP` | ✅ | ✅ (timestamptz) | ✅ (local) | ✅ (= `GETDATE()`) | ✅ (with zone) | ✅ (UTC text) |
| UTC now | ❌ | `NOW() AT TIME ZONE 'UTC'` | `UTC_TIMESTAMP()` | `SYSUTCDATETIME()` | `SYS_EXTRACT_UTC(SYSTIMESTAMP)` | `datetime('now')` |
| Per-call clock | ❌ | `clock_timestamp()` | `SYSDATE()` | `SYSDATETIME()` per reference | `SYSTIMESTAMP` per statement | ❌ |

> **Portability Tip:** Use `CURRENT_TIMESTAMP` when you need "now" in portable code, and pass reference dates as parameters when the meaning of "today" matters.

---

# Common Mistakes

### Mistake 1

Assuming `CURRENT_DATE` is in the business's time zone.

---

### Mistake 2

Using `GETDATE()` for stored timestamps on a server not set to UTC.

---

### Mistake 3

Expecting `NOW()` to change between statements in a PostgreSQL transaction.

---

### Mistake 4

Letting the client supply `CreatedAt`.

---

### Mistake 5

Hard-coding `CURRENT_DATE` in reports that need to be rerun for past dates.

---

# Best Practices

✔ Store UTC with `SYSUTCDATETIME()`, `UTC_TIMESTAMP()`, `NOW()` into `timestamptz`, or `datetime('now')`.

✔ Compute "business today" in the business's time zone explicitly.

✔ Set audit columns with database defaults.

✔ Pass the reference date as a parameter in reports and tests.

✔ Use per-call clocks only for measuring elapsed time.

---

# Interview Questions

## Basic

1. What is the portable way to get the current timestamp?
2. How do you get today's date on SQL Server?
3. What does SQLite's `'now'` return?

## Intermediate

4. Why does `NOW()` return the same value twice in a PostgreSQL transaction?
5. What is the difference between `SYSDATE` and `CURRENT_DATE` on Oracle?
6. Why is `WHERE OrderDate >= CURRENT_DATE - 30` index-friendly?

## Advanced

7. Why can MySQL `SYSDATE()` prevent index use?
8. How would you make a date-dependent report reproducible for a past date?

---

# Hands-on Exercises

## Exercise 1

On your engine, print the current date and timestamp in the session zone and in UTC.

---

## Exercise 2

In PostgreSQL, compare `NOW()`, `statement_timestamp()` and `clock_timestamp()` inside one transaction with a `pg_sleep(2)` between statements.

---

## Exercise 3

Rewrite an overdue-invoices query to take the reference date as a parameter.

---

# Related Topics

- **13.02 — Date and Time Data Types**
- **13.09 — Time Zones, UTC and Daylight Saving Time**
- **13.10 — Filtering Date Ranges (Half-Open Intervals)**
- **05.09 — SELECT Without FROM**

---

# Summary

Every engine can return the current date and time, but they differ in name, time zone and stability. `CURRENT_TIMESTAMP` is portable; `SYSUTCDATETIME()`, `UTC_TIMESTAMP()`, `timestamptz` defaults and SQLite's `'now'` give UTC; PostgreSQL fixes `NOW()` for the transaction, most others for the statement, and per-call clocks exist for timing. Use the database clock for audit columns, compute "today" in the business's zone explicitly, and pass reference dates as parameters so date-dependent queries can be tested and rerun.
