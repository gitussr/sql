---
title: "13.01 - Introduction to Date and Time Functions"
description: "What date and time functions are, the five jobs they do (get now, take apart, move, measure, convert), how engines store temporal values internally, why dates are the least portable part of SQL, and the three rules—right type, explicit time zone, bare column in predicates—that the rest of Chapter 13 builds on."
chapter: 13
section: 13.01
category: Data Query Language (DQL)
difficulty: Beginner
readingTime: 20 min
lastUpdated: 2026-09-28
---

# 13.01 Introduction to Date and Time Functions

---

# Learning Objectives

After completing this section, you will be able to:

- Describe what a date and time function does.
- Group date functions by the job they perform.
- Explain how engines store dates and timestamps internally.
- Recognise why the same date query needs different syntax on each engine.
- State the three rules that prevent most date bugs.

---

# Dates Are Everywhere

Look at any schema and count the temporal columns:

```text
Orders       OrderDate, CreatedAt, ShippedAt, DeliveredAt
Customers    BirthDate, CreatedAt, LastLoginAt
Employees    HireDate, TerminationDate
Invoices     InvoiceDate, DueDate, PaidAt
Subscriptions StartsOn, EndsOn, TrialEndsAt
```

And count the questions that depend on them:

- How many orders did we take **last month**?
- Which invoices are **overdue**?
- How **old** is this customer?
- What is our revenue **per week**, including weeks with no sales?
- How many **business days** did this ticket stay open?
- What time was it **for the customer** when they placed the order?

Every one of those questions is answered with date and time functions.

---

# The Five Jobs

```text
                           DATE AND TIME FUNCTIONS
                                     │
   ┌──────────────┬──────────────────┼──────────────────┬─────────────────┐
   ▼              ▼                  ▼                  ▼                 ▼
 GET NOW       TAKE APART          MOVE              MEASURE           CONVERT
 CURRENT_DATE  EXTRACT            + INTERVAL        d1 - d2           TO_CHAR
 NOW()         DATEPART           DATEADD           DATEDIFF          TO_DATE
 GETDATE()     DATE_TRUNC         DATE_ADD          AGE               AT TIME ZONE
 SYSDATE       YEAR(), MONTH()    ADD_MONTHS        MONTHS_BETWEEN    FORMAT
   13.03       13.04, 13.07        13.05              13.06           13.08, 13.09
```

```sql
-- PostgreSQL: one query, all five jobs
SELECT
    CURRENT_DATE                                   AS Today,          -- get now
    EXTRACT(MONTH FROM o.OrderDate)                AS OrderMonth,     -- take apart
    o.OrderDate + INTERVAL '30 days'               AS PaymentDue,     -- move
    CURRENT_DATE - o.OrderDate                     AS AgeInDays,      -- measure
    TO_CHAR(o.OrderDate, 'DD Mon YYYY')            AS Display         -- convert
FROM Orders AS o;
```

---

# How Engines Store Time

Internally, a date is a number:

| Engine | `DATE` stored as | Timestamp stored as |
|--------|------------------|---------------------|
| PostgreSQL | Days since 2000-01-01 (4 bytes) | Microseconds since 2000-01-01 (8 bytes) |
| MySQL | Packed year/month/day (3 bytes) | `DATETIME`: packed fields; `TIMESTAMP`: seconds since 1970 UTC |
| SQL Server | Days since 0001-01-01 (3 bytes) | `DATETIME2`: days + time ticks (6–8 bytes) |
| Oracle | 7 bytes: century, year, month, day, **hour, minute, second** | `TIMESTAMP`: 11 bytes with fractional seconds |
| SQLite | No date type: text, real or integer | Same |

Two consequences:

1. **Comparing and subtracting bare date columns is cheap**—it is integer arithmetic—and index-friendly.
2. **Text is not a date.** `'2026-09-28'` is a string until the engine converts it. The conversion follows session settings (date format, language, time zone), so the same literal can mean different things on different connections. Section 13.08 covers this.

> Oracle's `DATE` always includes a time of day. `WHERE OrderDate = DATE '2026-09-28'` misses a row stored as `2026-09-28 14:30:00`. This single fact explains a large share of Oracle date bugs.

---

# Why Dates Are the Least Portable Part of SQL

The same question—*orders per month in 2026*—on five engines:

```sql
-- PostgreSQL
SELECT DATE_TRUNC('month', OrderDate)::date AS M, COUNT(*)
FROM Orders WHERE OrderDate >= DATE '2026-01-01' AND OrderDate < DATE '2027-01-01'
GROUP BY 1 ORDER BY 1;

-- MySQL
SELECT DATE_FORMAT(OrderDate, '%Y-%m-01') AS M, COUNT(*)
FROM Orders WHERE OrderDate >= '2026-01-01' AND OrderDate < '2027-01-01'
GROUP BY M ORDER BY M;

-- SQL Server 2022+
SELECT DATETRUNC(month, OrderDate) AS M, COUNT(*)
FROM Orders WHERE OrderDate >= '2026-01-01' AND OrderDate < '2027-01-01'
GROUP BY DATETRUNC(month, OrderDate) ORDER BY M;

-- Oracle
SELECT TRUNC(OrderDate, 'MM') AS M, COUNT(*)
FROM Orders WHERE OrderDate >= DATE '2026-01-01' AND OrderDate < DATE '2027-01-01'
GROUP BY TRUNC(OrderDate, 'MM') ORDER BY M;

-- SQLite
SELECT date(OrderDate, 'start of month') AS M, COUNT(*)
FROM Orders WHERE OrderDate >= '2026-01-01' AND OrderDate < '2027-01-01'
GROUP BY M ORDER BY M;
```

Only the `WHERE` clause is (nearly) the same everywhere—and it is the part that matters most for performance.

Dialects differ in:

- **Types** — whether `DATE` has a time, whether time zones are stored, whether intervals exist.
- **Names and argument order** — `DATEDIFF(a, b)` in MySQL is `a − b` in days; `DATEDIFF(day, a, b)` in SQL Server is `b − a`.
- **Calendar rules** — what January 31 plus one month is, which day starts the week, what week 1 is.
- **"Now"** — whether it is fixed for the statement, the transaction, or changes per row.

---

# Dates in Every Clause

```sql
SELECT
    DATE_TRUNC('week', o.OrderDate)::date      AS WeekStart,     -- SELECT: derive a bucket
    COUNT(*)                                   AS Orders
FROM Orders AS o
WHERE o.OrderDate >= CURRENT_DATE - 90                           -- WHERE: bare column, constant side computed once
GROUP BY DATE_TRUNC('week', o.OrderDate)                         -- GROUP BY: bucket defines the groups
HAVING COUNT(*) > 10                                             -- HAVING: filter buckets
ORDER BY WeekStart;                                              -- ORDER BY: date value, not text
```

---

# Visual Representation

```text
   STORED                   COMPUTED                        SHOWN
   ┌────────────────┐       ┌───────────────────────┐       ┌──────────────────┐
   │ instant (UTC)  │──────▶│ business date, bucket,│──────▶│ '28 Sep 2026'    │
   │ business DATE  │       │ difference, due date  │       │ '09/28/2026'     │
   └────────────────┘       └───────────────────────┘       └──────────────────┘
     typed, indexed           date functions                   formatting, last
     13.02                    13.04 – 13.07, 13.12             13.08
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← calendar tables and generated date series enter here
2. JOIN        ← join facts to dates to keep empty days
3. WHERE       ← compare bare date columns with constant boundaries
4. GROUP BY    ← time buckets: DATE_TRUNC, EXTRACT
5. HAVING
6. WINDOW      ← ordered by date for running totals, LAG and LEAD
7. SELECT      ← formatting and derived dates
8. DISTINCT
9. ORDER BY    ← sort by the date, not by its text
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Bind:
  '2026-09-28' compared with a DATE column → literal converted to DATE once
  CURRENT_DATE - 90                        → computed once per statement
Optimize:
  OrderDate >= <constant>                  → index range seek on OrderDate
  DATE_TRUNC('week', OrderDate) in GROUP BY → computed per row, then hashed or sorted
Execute:
  scan the index range → compute buckets → aggregate → format output
```

---

# The Three Rules

Everything in this chapter comes back to three rules:

```text
1. RIGHT TYPE         DATE for business dates · timestamp with zone (or UTC) for instants
                      never text, never numbers like 20260928
2. EXPLICIT ZONE      know which time zone every timestamp and every "now" is in
3. BARE COLUMN        date functions on the constant side of a predicate, not on the column
```

---

# 🏗️ Architecture Insight

Decide early which layer owns each part of date handling. The database owns storage (types, UTC, constraints such as `ShippedAt >= CreatedAt`) and calendar facts (a calendar table). The application owns presentation (locale, user's time zone, format). Queries in between should pass dates as typed parameters, never as formatted strings.

---

# ⚡ Performance Tip

A date column is one of the most common leading keys of an index, because most analytic and operational queries filter on a time range. Keep those predicates as `column >= :start AND column < :end` so the index can be used for a range seek.

---

# 🌍 Production Consideration

Server and session defaults change what date expressions mean: `SET DATEFORMAT` and `SET LANGUAGE` in SQL Server, `NLS_DATE_FORMAT` in Oracle, the `time_zone` variable in MySQL, the `TimeZone` setting in PostgreSQL. Code that relies on defaults can behave differently in production than in development. Use ISO literals and explicit zones.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `DATE 'YYYY-MM-DD'` literal | ✅ | ✅ | ✅ | ❌ (use `'YYYYMMDD'` or `'YYYY-MM-DD'`) | ✅ | ❌ (plain text) |
| `CURRENT_DATE` | ✅ | ✅ | ✅ | ❌ (use `CAST(GETDATE() AS DATE)`) | ✅ (session zone) | ✅ (UTC) |
| `EXTRACT` | ✅ | ✅ | ✅ | ❌ (`DATEPART`) | ✅ | ❌ (`strftime`) |
| `DATE` holds a time | ❌ | ❌ | ❌ | ❌ | ✅ | n/a |

> **Portability Tip:** Write the `WHERE` clause portably (ISO literals, half-open ranges) and isolate the engine-specific date functions in the `SELECT` and `GROUP BY` clauses.

---

# Common Mistakes

### Mistake 1

Treating a date stored as text as if it were a date.

---

### Mistake 2

Forgetting that Oracle's `DATE` contains a time of day.

---

### Mistake 3

Assuming date functions have the same name and argument order on every engine.

---

# Best Practices

✔ Use proper temporal types for every date and time column.

✔ Write literals in ISO-8601 form.

✔ Compare bare date columns with constant boundaries.

✔ Keep formatting for the final output.

---

# Interview Questions

## Basic

1. Name three date and time functions and what they do.
2. How is a date stored internally?
3. Why is `'2026-09-28'` not automatically a date?

## Intermediate

4. Why does Oracle's `DATE` cause equality comparisons to fail?
5. Why is `WHERE OrderDate >= CURRENT_DATE - 30` index-friendly?

## Advanced

6. Explain why date queries are harder to port than joins or aggregates.
7. How do session settings change the meaning of a date literal?

---

# Hands-on Exercises

## Exercise 1

List every temporal column in a schema you work with and its data type. Find any stored as text or numbers.

---

## Exercise 2

Write "orders per month in 2026" for two different engines.

---

## Exercise 3

Rewrite a query that uses `YEAR(OrderDate) = 2026` in `WHERE` into a half-open range.

---

# Related Topics

- **Chapter 13 — Date and Time Functions**
- **13.02 — Date and Time Data Types**
- **13.10 — Filtering Date Ranges (Half-Open Intervals)**
- **12.01 — Introduction to Scalar Functions**
- **06.12 — SARGability and Index-Friendly Predicates**

---

# Summary

Date and time functions get the current moment, take temporal values apart, move them by intervals, measure the distance between them, and convert them to text and between time zones. Engines store dates as numbers, so comparisons on bare columns are cheap, but each engine uses different types, names, argument orders and calendar rules—Oracle's `DATE` even carries a time of day. Three rules prevent most problems: use the right type, be explicit about time zones, and keep date columns bare in predicates.
