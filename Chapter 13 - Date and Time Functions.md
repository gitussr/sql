---
title: "Chapter 13 - Date and Time Functions"
description: "Master SQL date and time handling: temporal data types, the current date and time, extracting parts, date arithmetic and intervals, differences and ages, truncating and bucketing, formatting and parsing, time zones, half-open range filters, calendar tables, weeks, quarters and fiscal years, business days, and how date functions affect execution plans and index use."
chapter: 13
section: Introduction
category: Data Query Language (DQL)
difficulty: Beginner → Advanced
readingTime: 25 min
lastUpdated: 2026-09-28
---

# Chapter 13 — Date and Time Functions

> *"Every system stores time. Few store it correctly."*

---

# Learning Objectives

By the end of this chapter, you will be able to:

- Choose the right temporal data type for dates, times, timestamps and durations.
- Get the current date and time and know which moment each function returns.
- Extract years, months, weekdays and other parts from a date.
- Add and subtract intervals, and predict what happens at the end of a month.
- Compute differences and ages that match what the business means.
- Truncate timestamps to days, weeks and months and bucket them into fixed intervals.
- Format dates for output and parse text into dates safely.
- Store and convert timestamps across time zones and daylight saving changes.
- Filter date ranges with half-open intervals that stay index-friendly.
- Build and use calendar tables for reports, fiscal years and business days.

---

# Introduction

Chapter 12 covered scalar functions for strings, numbers, conversions and `NULL`s. It deliberately left out one family, because it is large enough and treacherous enough to need a chapter of its own: **date and time functions**.

Almost every table has a date in it—an order date, a hire date, a login timestamp, a delivery deadline. Almost every report groups by one—sales per month, sign-ups per week, tickets per hour. And almost every engine handles them differently: different types, different function names, different argument orders, different answers to "what is January 31 plus one month?"

Dates also hide some of SQL's most expensive mistakes. `WHERE YEAR(OrderDate) = 2026` reads every row in the table. `BETWEEN '2026-09-01' AND '2026-09-30'` silently drops most of September 30 from a timestamp column. A server clock in the wrong time zone shifts every day boundary in every report.

This chapter teaches the functions, the dialect differences and the correctness and performance rules together.

---

# What is a Date and Time Function?

A date and time function is a scalar function (Chapter 12) whose inputs or output are **temporal values**: dates, times, timestamps or intervals.

```text
Orders                                 EXTRACT(YEAR …)  DATE_TRUNC('month', …)   OrderDate + 30 days
┌─────────┬────────────┬─────────┐     ┌──────┐         ┌────────────┐           ┌────────────┐
│ OrderID │ OrderDate  │ Status  │     │      │         │            │           │            │
├─────────┼────────────┼─────────┤     ├──────┤         ├────────────┤           ├────────────┤
│ 101     │ 2026-01-31 │ Shipped │  →  │ 2026 │         │ 2026-01-01 │           │ 2026-03-02 │
│ 102     │ 2026-02-14 │ Pending │  →  │ 2026 │         │ 2026-02-01 │           │ 2026-03-16 │
│ 103     │ 2026-09-28 │ Shipped │  →  │ 2026 │         │ 2026-09-01 │           │ 2026-10-28 │
└─────────┴────────────┴─────────┘     └──────┘         └────────────┘           └────────────┘

one row in  →  one value out  (a part, a new date, a difference, or text)
```

Date and time functions fall into five jobs:

1. **Get now** — `CURRENT_DATE`, `CURRENT_TIMESTAMP`, `NOW()`, `GETDATE()`, `SYSDATE`.
2. **Take apart** — `EXTRACT`, `DATEPART`, `YEAR()`, `DATE_TRUNC`.
3. **Move** — `+ INTERVAL`, `DATEADD`, `DATE_ADD`, `ADD_MONTHS`.
4. **Measure** — date subtraction, `DATEDIFF`, `TIMESTAMPDIFF`, `AGE`, `MONTHS_BETWEEN`.
5. **Convert** — `TO_CHAR`, `FORMAT`, `DATE_FORMAT`, `TO_DATE`, `STR_TO_DATE`, `AT TIME ZONE`.

---

# Basic Syntax

```sql
-- Standard SQL
EXTRACT(field FROM datetime_value)
datetime_value + INTERVAL 'n' unit
CURRENT_DATE, CURRENT_TIMESTAMP
```

Example (PostgreSQL):

```sql
SELECT
    o.OrderID,
    o.OrderDate,
    EXTRACT(YEAR FROM o.OrderDate)            AS OrderYear,
    DATE_TRUNC('month', o.OrderDate)::date    AS OrderMonth,
    o.OrderDate + INTERVAL '30 days'          AS PaymentDue,
    CURRENT_DATE - o.OrderDate                AS DaysSinceOrder
FROM Orders AS o
WHERE o.OrderDate >= DATE '2026-01-01'
  AND o.OrderDate <  DATE '2027-01-01';
```

The same query needs different function names on every other engine. The sections of this chapter show each operation on PostgreSQL, MySQL, SQL Server, Oracle and SQLite.

---

# The Sample Schema

Every section of this chapter uses the Chapter 12 schema, with timestamps on orders, a birth date and home time zone on customers, and a holiday table.

```sql
CREATE TABLE Customers (
    CustomerID   INT PRIMARY KEY,
    CustomerName VARCHAR(100) NOT NULL,
    Email        VARCHAR(255),
    Phone        VARCHAR(30),
    Country      VARCHAR(50),
    BirthDate    DATE,                          -- NULL when not provided
    TimeZone     VARCHAR(64)                    -- IANA name, e.g. 'Asia/Kolkata'
);

CREATE TABLE Orders (
    OrderID     INT PRIMARY KEY,
    CustomerID  INT REFERENCES Customers(CustomerID),
    OrderDate   DATE          NOT NULL,         -- business date of the order
    Status      VARCHAR(20)   NOT NULL,
    TotalAmount DECIMAL(10,2) NOT NULL,
    CreatedAt   TIMESTAMP WITH TIME ZONE NOT NULL,   -- exact instant the order was placed
    ShippedAt   TIMESTAMP WITH TIME ZONE             -- NULL until shipped
);

CREATE TABLE Employees (
    EmployeeID   INT PRIMARY KEY,
    EmployeeName VARCHAR(100) NOT NULL,
    ManagerID    INT REFERENCES Employees(EmployeeID),
    DepartmentID INT,
    Salary       DECIMAL(10,2),
    HireDate     DATE NOT NULL
);

CREATE TABLE DailySales (
    SalesDate DATE PRIMARY KEY,
    Revenue   DECIMAL(12,2) NOT NULL
);

CREATE TABLE Holidays (
    HolidayDate DATE        NOT NULL,
    Country     VARCHAR(50) NOT NULL,
    HolidayName VARCHAR(100) NOT NULL,
    PRIMARY KEY (HolidayDate, Country)
);
```

`Products` and `OrderItems` are unchanged from Chapter 12. `TIMESTAMP WITH TIME ZONE` is PostgreSQL and Oracle spelling; SQL Server uses `DATETIMEOFFSET` (or `DATETIME2` holding UTC), MySQL uses `TIMESTAMP` or `DATETIME` holding UTC, and SQLite stores ISO-8601 text. Section 13.02 explains the choice.

---

# The Date and Time Toolkit

| Job | Typical functions | Section |
|-----|-------------------|---------|
| Types | `DATE`, `TIME`, `TIMESTAMP`, `TIMESTAMPTZ`, `INTERVAL` | 13.02 |
| Now | `CURRENT_DATE`, `CURRENT_TIMESTAMP`, `NOW()`, `SYSDATETIME()` | 13.03 |
| Parts | `EXTRACT`, `DATEPART`, `YEAR()`, `DAYOFWEEK` | 13.04 |
| Arithmetic | `+ INTERVAL`, `DATEADD`, `DATE_ADD`, `ADD_MONTHS` | 13.05 |
| Differences | `a - b`, `DATEDIFF`, `TIMESTAMPDIFF`, `AGE`, `MONTHS_BETWEEN` | 13.06 |
| Truncation | `DATE_TRUNC`, `DATETRUNC`, `TRUNC`, `date_bin`, `DATE_BUCKET` | 13.07 |
| Formatting | `TO_CHAR`, `FORMAT`, `DATE_FORMAT`, `strftime`, `TO_DATE` | 13.08 |
| Time zones | `AT TIME ZONE`, `CONVERT_TZ`, `FROM_TZ` | 13.09 |
| Series | `generate_series`, recursive CTEs, calendar tables | 13.11 |

```text
                  every date and time expression answers:
   ┌──────────────────────┬─────────────────────────┬──────────────────────────────┐
   │ WHICH TYPE?          │ WHICH TIME ZONE?        │ WHICH CALENDAR RULE?         │
   │ (date, timestamp,    │ (UTC, server, session,  │ (month-end, week start,      │
   │  with/without zone)  │  or the user's)         │  ISO week, fiscal year)      │
   └──────────────────────┴─────────────────────────┴──────────────────────────────┘
```

---

# 📍 Execution Order Reminder

Date and time functions are evaluated wherever their expression appears:

```text
1. FROM        ← generate_series / calendar tables produce one row per day here
2. JOIN        ← joining facts to a calendar table fills in missing days
3. WHERE       ← date range predicates: keep the column bare to use its index
4. GROUP BY    ← DATE_TRUNC / EXTRACT expressions define time buckets
5. HAVING
6. WINDOW      ← running totals and moving averages ordered by date
7. SELECT      ← formatting with TO_CHAR / FORMAT belongs here
8. DISTINCT
9. ORDER BY    ← order by the date value, not by its formatted text
10. LIMIT / FETCH / TOP
```

> `CURRENT_TIMESTAMP` is evaluated once per statement (PostgreSQL: once per transaction), not once per row, so every row of a query sees the same "now". A `WHERE` predicate that compares a column with `CURRENT_DATE - 30` is therefore sargable: the right-hand side is a constant for the whole statement.

---

# How the DBMS Executes This

```text
SQL Statement
        │
        ▼
Parser: resolve types — is '2026-09-28' a DATE, a TIMESTAMP, or text?
        │   (literals are converted using the session's date format and time zone)
        ▼
Optimizer:
  - evaluate CURRENT_DATE, CURRENT_DATE - 30, DATE '2026-01-01' once
  - turn  OrderDate >= constant  into an index range seek
  - leave YEAR(OrderDate) = 2026 as a per-row filter (unless an expression index matches)
        │
        ▼
Executor: compute per-row expressions (EXTRACT, DATE_TRUNC, formatting) at their operator
```

Internally, engines store dates and timestamps as numbers—days or microseconds from an epoch—so comparisons and arithmetic on bare columns are cheap. The expensive cases are functions that prevent an index seek, implicit conversions from text, and time-zone conversions evaluated for every row.

---

# Chapter Structure

| Section | Topic |
|---------|-------|
| 13.01 | Introduction to Date and Time Functions |
| 13.02 | Date and Time Data Types |
| 13.03 | Current Date and Time |
| 13.04 | Extracting Date Parts (EXTRACT, DATEPART and DATENAME) |
| 13.05 | Date Arithmetic and Intervals |
| 13.06 | Date Differences and Age Calculations |
| 13.07 | Truncating and Bucketing Dates (DATE_TRUNC and date_bin) |
| 13.08 | Formatting and Parsing Dates |
| 13.09 | Time Zones, UTC and Daylight Saving Time |
| 13.10 | Filtering Date Ranges (Half-Open Intervals) |
| 13.11 | Generating Date Series and Calendar Tables |
| 13.12 | Weeks, Quarters and Fiscal Calendars |
| 13.13 | Business Days, Holidays and Working Time |
| 13.14 | Execution Flow of Date and Time Functions |
| 13.15 | Date and Time Performance and Index Strategy |
| 13.16 | Common Date and Time Mistakes & Best Practices |
| 13.17 | Date and Time Cheat Sheet & Visual Knowledge Map |

---

# Real-World Examples

## E-Commerce

```sql
SELECT
    DATE_TRUNC('month', o.OrderDate)::date AS SalesMonth,
    COUNT(*)                               AS Orders,
    SUM(o.TotalAmount)                     AS Revenue
FROM Orders AS o
WHERE o.OrderDate >= DATE '2026-01-01'
  AND o.OrderDate <  DATE '2027-01-01'
GROUP BY DATE_TRUNC('month', o.OrderDate)
ORDER BY SalesMonth;
```

Monthly revenue for 2026, filtered with a half-open range so the index on `OrderDate` is used.

---

## Banking

```sql
SELECT
    l.LoanID,
    l.DisbursedOn,
    (l.DisbursedOn + INTERVAL '1 month' * l.TermMonths)::date AS MaturityDate
FROM Loans AS l;
```

A maturity date computed by adding whole months—the month-end rule of Section 13.05 matters for loans disbursed on the 29th, 30th or 31st.

---

## Hospital

```sql
SELECT
    a.AdmissionID,
    a.AdmittedAt,
    a.DischargedAt,
    a.DischargedAt - a.AdmittedAt                     AS LengthOfStay,
    EXTRACT(EPOCH FROM a.DischargedAt - a.AdmittedAt) / 3600.0 AS Hours
FROM Admissions AS a
WHERE a.DischargedAt IS NOT NULL;
```

Length of stay as an interval and as decimal hours. Timestamps with time zone keep the answer right across a daylight saving change.

---

## HRMS

```sql
SELECT
    e.EmployeeID,
    e.HireDate,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, e.HireDate)) AS CompletedYears
FROM Employees AS e;
```

Completed years of service for anniversary awards—not the difference between the two years, which overcounts before the anniversary.

---

## Social Media

```sql
SELECT
    date_bin(INTERVAL '15 minutes', p.CreatedAt, TIMESTAMPTZ '2026-01-01 00:00+00') AS Slot,
    COUNT(*)                                                                    AS Posts
FROM Posts AS p
WHERE p.CreatedAt >= NOW() - INTERVAL '1 day'
GROUP BY Slot
ORDER BY Slot;
```

Posting activity in 15-minute buckets over the last 24 hours.

---

# 🏗️ Architecture Insight

Treat time as three separate things: the **instant** something happened (store as a timestamp with time zone, or UTC), the **business date** it belongs to (store as a `DATE`, decided once, in the business's time zone), and the **presentation** (format in the application, in the viewer's locale and zone). Most date bugs come from mixing these: deriving business dates from server-local timestamps, formatting in SQL and then parsing the text again, or storing local wall-clock time without saying which zone it is in.

---

# ⚡ Performance Tip

Never wrap an indexed date column in a function in `WHERE`. Replace `WHERE YEAR(OrderDate) = 2026` with `WHERE OrderDate >= '2026-01-01' AND OrderDate < '2027-01-01'`, and `WHERE CAST(CreatedAt AS DATE) = '2026-09-28'` with a one-day half-open range. Both turn a full scan into an index range seek.

---

# 🔒 Security Note

Timestamps are evidence. Audit columns (`CreatedAt`, `ModifiedAt`, `LoggedInAt`) should be set by the database—`DEFAULT CURRENT_TIMESTAMP` or a trigger—in UTC, not supplied by the client, whose clock and time zone can be wrong or deliberately forged. Token and session expiry checks should also compare with the database clock, not with a time sent in the request.

---

# 🌍 Production Consideration

Most date bugs appear only on particular days: the 29th–31st of a month, February 29, the two days a year when clocks change, New Year's week (ISO week 1 can start in December), and the moment a server or session time zone differs from the one the developer assumed. Test date logic against those days explicitly, and keep the database server, the application servers and the stored data in UTC.

---

# 🚀 Enterprise Practice

Enterprise data platforms commonly standardise on UTC storage for instants, a `DATE` column for every business date, a shared **calendar (date dimension) table** holding fiscal periods, week numbers and holidays, half-open ranges in every date filter, and ISO-8601 (`YYYY-MM-DD`, `YYYY-MM-DDTHH:MI:SSZ`) for every date that crosses a system boundary as text.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Date type | `DATE` | ✅ | ✅ | ✅ (2008+) | `DATE` includes time | Text / number |
| Timestamp with zone | `TIMESTAMP WITH TIME ZONE` | ✅ (stored as UTC) | ❌ (`TIMESTAMP` converts to UTC) | `DATETIMEOFFSET` | ✅ | ❌ |
| Interval type | `INTERVAL` | ✅ | Keyword only | ❌ | ✅ | ❌ |
| Extract a part | `EXTRACT` | ✅ | ✅ + `YEAR()` … | `DATEPART`, `YEAR()` | ✅ | `strftime` |
| Add a month | `d + INTERVAL '1' MONTH` | ✅ | `DATE_ADD` | `DATEADD` | `ADD_MONTHS` | `date(d, '+1 month')` |
| Truncate to month | ❌ | `DATE_TRUNC` | ❌ (format trick) | `DATETRUNC` (2022+) | `TRUNC(d, 'MM')` | `date(d, 'start of month')` |
| Day difference | `d1 - d2` | ✅ (integer) | `DATEDIFF(d1, d2)` | `DATEDIFF(day, d2, d1)` | ✅ (number) | `julianday` difference |

> **Portability Tip:** `DATE` literals written as `DATE 'YYYY-MM-DD'`, `CURRENT_DATE`, `CURRENT_TIMESTAMP`, `EXTRACT` and comparisons with half-open ranges are the portable core. Adding intervals, differences, truncation and formatting all need per-engine spellings.

---

# Common Mistakes

- Wrapping an indexed date column in `YEAR()`, `CAST(… AS DATE)` or `DATE_TRUNC` in `WHERE`.
- Using `BETWEEN '2026-09-01' AND '2026-09-30'` on a timestamp column and losing the last day.
- Storing dates as text in a non-ISO format and sorting or comparing them as strings.
- Computing age as the difference between two years.
- Assuming `DATEDIFF` returns the same answer, with the same argument order, on every engine.
- Storing local wall-clock timestamps without a time zone.
- Formatting dates in SQL and then comparing or sorting the formatted text.

---

# Best Practices

✔ Store instants in UTC or as timestamps with time zone; store business dates as `DATE`.

✔ Filter with half-open ranges: `>= start AND < next_start`.

✔ Keep date columns bare in predicates; compute boundaries on the constant side.

✔ Write literals as `DATE 'YYYY-MM-DD'` or ISO-8601 strings.

✔ Use a calendar table for fiscal periods, week numbers, holidays and gap-filling.

✔ Format dates in the presentation layer, or last, in the outermost `SELECT`.

---

# 💡 Did You Know?

Many engines count days from different epochs. PostgreSQL stores dates relative to 2000-01-01, SQLite's `julianday` counts from noon on November 24, 4714 BC in the proleptic Gregorian calendar, Unix time counts seconds from 1970-01-01 UTC, and SQL Server's old `DATETIME` type starts at 1753-01-01 because that was the first full year in which Britain and its colonies used the Gregorian calendar—the earlier dates are ambiguous.

---

# Related Topics

- **Chapter 12 — Scalar Functions**
- **06.05 — BETWEEN**
- **06.09 — Filtering with Expressions and Functions**
- **06.12 — SARGability and Index-Friendly Predicates**
- **08.06 — Grouping by Multiple Columns and Expressions**
- **10.10 — Partial and Expression Indexes**
- **11.06 — Running Totals, Moving Averages and Shares**
- **12.08 — Type Conversion (CAST, CONVERT and TRY_CAST)**
- **15.xx — Query Optimization**

---

# Summary

Date and time functions are scalar functions over dates, times, timestamps and intervals: they get the current moment, take values apart, move them by intervals, measure the distance between them, and convert them to and from text and between time zones. They are one of the least portable parts of SQL—Oracle's `DATE` holds a time, SQLite has no date type at all, and `DATEDIFF` takes different arguments and counts different things on different engines. The chapter's recurring themes are choosing the right type, being explicit about time zones and calendar rules, filtering with half-open ranges on bare columns, and using calendar tables instead of re-deriving calendar facts in every query.
