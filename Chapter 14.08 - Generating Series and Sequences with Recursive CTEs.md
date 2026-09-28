---
title: "14.08 - Generating Series and Sequences with Recursive CTEs"
description: "Using recursive CTEs as row generators: number sequences, date and time series, filling gaps in reports, splitting delimited strings into rows, expanding ranges and quantities into individual rows, running calculations such as compound interest and Fibonacci, iterative string processing, recursion depth and performance of generators compared with generate_series, numbers tables and calendar tables."
chapter: 14
section: 14.08
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 14.08 Generating Series and Sequences with Recursive CTEs

---

# Learning Objectives

After completing this section, you will be able to:

- Generate numbers and dates with a recursive CTE on any engine.
- Fill gaps in time-series reports with a generated series.
- Split delimited strings and expand ranges into rows.
- Compute iterative sequences such as compound interest.
- Choose between recursive generators, built-in series functions and permanent tables.

---

# Numbers

```sql
WITH RECURSIVE Numbers (n) AS (
    SELECT 1
    UNION ALL
    SELECT n + 1 FROM Numbers WHERE n < 10
)
SELECT n FROM Numbers;           -- 1 … 10
```

The termination condition belongs in the recursive member (`WHERE n < 10`). Filtering in the main query (`SELECT n FROM Numbers WHERE n <= 10`) does **not** stop the recursion—it generates forever and filters the output.

> SQLite also allows a `LIMIT` inside the recursive CTE, and MySQL 8.0.19+ allows `LIMIT` in the recursive member, but a `WHERE` condition is portable.

---

# Dates

```sql
-- PostgreSQL / MySQL (MySQL: Day + INTERVAL 1 DAY)
WITH RECURSIVE Days (Day) AS (
    SELECT DATE '2026-09-01'
    UNION ALL
    SELECT Day + 1 FROM Days WHERE Day < DATE '2026-09-30'
)
SELECT Day FROM Days;

-- SQL Server
WITH Days (Day) AS (
    SELECT CAST('2026-09-01' AS date)
    UNION ALL
    SELECT DATEADD(day, 1, Day) FROM Days WHERE Day < '2026-09-30'
)
SELECT Day FROM Days
OPTION (MAXRECURSION 400);

-- SQLite
WITH RECURSIVE Days (Day) AS (
    SELECT '2026-09-01'
    UNION ALL
    SELECT date(Day, '+1 day') FROM Days WHERE Day < '2026-09-30'
)
SELECT Day FROM Days;
```

SQL Server's default limit of 100 recursion levels stops a 365-day series; `OPTION (MAXRECURSION n)` on the outer statement raises it (Section 14.11).

---

# Filling Gaps

The generated series becomes the left side of a `LEFT JOIN` (Section 13.11):

```sql
WITH RECURSIVE Days (Day) AS (
    SELECT DATE '2026-09-01'
    UNION ALL
    SELECT Day + 1 FROM Days WHERE Day < DATE '2026-09-07'
)
SELECT d.Day,
       COUNT(o.OrderID)                AS Orders,
       COALESCE(SUM(o.TotalAmount), 0) AS Revenue
FROM Days AS d
LEFT JOIN Orders AS o ON o.OrderDate = d.Day
GROUP BY d.Day
ORDER BY d.Day;
```

Days with no orders appear with zeros.

---

# Splitting Delimited Strings

A classic use of recursion on engines without a split function:

```sql
-- PostgreSQL / SQLite style (SUBSTR, INSTR shown as POSITION for PostgreSQL)
WITH RECURSIVE Split (Item, Rest) AS (
    SELECT CAST('' AS VARCHAR(200)), CAST('red,green,blue' || ',' AS VARCHAR(200))
    UNION ALL
    SELECT CAST(SUBSTRING(Rest FROM 1 FOR POSITION(',' IN Rest) - 1) AS VARCHAR(200)),
           CAST(SUBSTRING(Rest FROM POSITION(',' IN Rest) + 1) AS VARCHAR(200))
    FROM Split
    WHERE Rest <> ''
)
SELECT Item FROM Split WHERE Item <> '';      -- red, green, blue
```

Each iteration cuts off the first item. Appending a trailing delimiter in the anchor makes the last item behave like the others.

Prefer built-ins where they exist: PostgreSQL `string_to_table` / `unnest(string_to_array(…))`, SQL Server `STRING_SPLIT` (with `enable_ordinal` in 2022+), MySQL `JSON_TABLE` over a JSON array, Oracle `REGEXP_SUBSTR … CONNECT BY LEVEL`. And prefer not storing delimited lists at all (Section 03.09).

---

# Expanding Ranges and Quantities

```sql
-- One row per seat for bookings stored as ranges (SeatFrom, SeatTo)
WITH RECURSIVE Seats (BookingID, Seat, SeatTo) AS (
    SELECT BookingID, SeatFrom, SeatTo FROM Bookings
    UNION ALL
    SELECT BookingID, Seat + 1, SeatTo FROM Seats WHERE Seat < SeatTo
)
SELECT BookingID, Seat FROM Seats ORDER BY BookingID, Seat;

-- One row per unit for label printing (Quantity = 3 → three rows)
WITH RECURSIVE Units (OrderItemID, UnitNo, Quantity) AS (
    SELECT OrderItemID, 1, Quantity FROM OrderItems WHERE Quantity >= 1
    UNION ALL
    SELECT OrderItemID, UnitNo + 1, Quantity FROM Units WHERE UnitNo < Quantity
)
SELECT OrderItemID, UnitNo FROM Units;
```

The anchor returns many rows; each expands independently until its own condition fails.

---

# Iterative Calculations

Each iteration can compute a value from the previous one—useful for sequences that depend on the prior term:

```sql
-- Compound interest: balance after each month at 1% per month on 10,000
WITH RECURSIVE Schedule (MonthNo, Balance) AS (
    SELECT 0, CAST(10000.00 AS DECIMAL(14,2))
    UNION ALL
    SELECT MonthNo + 1, CAST(ROUND(Balance * 1.01, 2) AS DECIMAL(14,2))
    FROM Schedule
    WHERE MonthNo < 12
)
SELECT * FROM Schedule;
-- 0: 10000.00, 1: 10100.00, 2: 10201.00, …, 12: 11268.25

-- Fibonacci
WITH RECURSIVE Fib (n, a, b) AS (
    SELECT 1, CAST(0 AS BIGINT), CAST(1 AS BIGINT)
    UNION ALL
    SELECT n + 1, b, a + b FROM Fib WHERE n < 20
)
SELECT n, a AS Fibonacci FROM Fib;
```

Rounding at each step (as a bank would) is exactly what a recursive CTE expresses naturally and a closed-form formula does not. Loan amortisation schedules follow the same pattern with interest and principal columns.

---

# Choosing a Generator

| Generator | Pros | Cons |
|-----------|------|------|
| Recursive CTE | Portable; can carry state (running values) | Row-by-row iteration; recursion limits; slower for large series |
| `generate_series` (PostgreSQL), `GENERATE_SERIES` (SQL Server 2022+) | Fast, set-based, no limits | Engine-specific; no carried state |
| Numbers / calendar table | Fast, indexed, portable once built | Must be created and maintained |
| Cross join of digit sets (`0–9` × `0–9` × …) | Portable, set-based | Verbose |

For large series (hundreds of thousands of rows) or frequent use, a permanent numbers or calendar table beats recursion. Recursive CTEs shine when each row depends on the previous one.

---

# Visual Representation

```text
   anchor      n = 1
   iteration   n = 2   (from 1)
   iteration   n = 3   (from 2)
   …
   iteration   n = 10  (from 9)
   iteration   WHERE n < 10 false for n = 10 → no row → stop

   state carried per row:  (MonthNo, Balance) → (MonthNo + 1, ROUND(Balance × 1.01, 2))
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← the generator CTE produces its rows first
2. JOIN        ← LEFT JOIN facts to the generated series
3. WHERE       ← inside the recursive member: the stop condition (not in the outer query!)
4. GROUP BY    ← outer query: aggregate facts per generated value
5. HAVING
6. WINDOW
7. SELECT
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
recursive generator of N rows:
  N iterations, one row each (for single-row anchors) → N small loops
  SQL Server: stops at MAXRECURSION (default 100) with Msg 530
generate_series(1, N):
  one set-returning function call streaming N rows → much cheaper per row
```

---

# 🏗️ Architecture Insight

If several queries generate the same series (days of the year, hours of the day, numbers up to 10,000), create a permanent table once. It is faster, can carry extra attributes (business-day flags, fiscal periods), and removes recursion limits from the picture.

---

# ⚡ Performance Tip

A recursive CTE that produces one row per iteration is essentially a loop. Keep generated series small, or generate larger ones set-based: for example, a 1–1000 generator cross-joined with itself yields a million rows in two small recursions.

---

# 🌍 Production Consideration

Generators that depend on data (expanding quantities, splitting strings) can hit recursion limits when an unusual row arrives—an order line with quantity 5000, a string with 200 items. Set limits deliberately and validate inputs.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Recursive generator | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Built-in series | ❌ | `generate_series` | ❌ | `GENERATE_SERIES` (2022+) | `CONNECT BY LEVEL` | `generate_series` (extension) |
| String split | ❌ | `string_to_table` | `JSON_TABLE` | `STRING_SPLIT` | `REGEXP_SUBSTR` + `CONNECT BY` | Recursive CTE / JSON |
| Default depth limit | ❌ | None | 1000 | 100 | None | None |

> **Portability Tip:** A recursive number or date generator is the one series technique that runs everywhere. Raise SQL Server's and MySQL's limits when generating more than 100 or 1000 rows.

---

# Common Mistakes

### Mistake 1

Putting the stop condition in the outer query instead of the recursive member.

---

### Mistake 2

Hitting SQL Server's 100-level limit when generating a year of days.

---

### Mistake 3

Using a recursive generator for millions of rows.

---

### Mistake 4

Forgetting a trailing delimiter when splitting strings, and losing the last item.

---

# Best Practices

✔ Stop recursion inside the recursive member.

✔ Set recursion limits explicitly for data-dependent generators.

✔ Use built-in series functions or permanent tables for large or frequent series.

✔ Use recursive CTEs where each row depends on the previous one.

---

# Interview Questions

## Basic

1. How do you generate the numbers 1 to 100 with a recursive CTE?
2. How do you generate every date in a month?
3. Why generate a series in a report?

## Intermediate

4. Why doesn't `WHERE n <= 10` in the outer query stop recursion?
5. How do you split a comma-separated string into rows?
6. How do you expand a quantity into one row per unit?

## Advanced

7. When is a recursive CTE better than `generate_series`?
8. How do you generate a million rows efficiently without a numbers table?

---

# Hands-on Exercises

## Exercise 1

Generate every hour of 2026-09-28 and count orders per hour, including empty hours.

---

## Exercise 2

Build a 12-month loan amortisation schedule with interest, principal and balance.

---

## Exercise 3

Split a tags string into rows on an engine without a split function.

---

# Related Topics

- **14.05 — Recursive CTEs (Anchor, Recursive Member and Termination)**
- **14.11 — Recursion Limits and Safety**
- **13.11 — Generating Date Series and Calendar Tables**
- **12.03 — Substrings, Searching and Replacing**

---

# Summary

Recursive CTEs are portable row generators: a one-row anchor plus a recursive member that increments a value until a condition in the recursive member fails produces numbers, dates or times, and many-row anchors expand ranges and quantities or split strings. Because each iteration can use the previous row's values, recursion expresses sequences such as compound interest and amortisation naturally. For large or frequently used series, built-in functions (`generate_series`, `GENERATE_SERIES`) or permanent numbers and calendar tables are faster, and SQL Server and MySQL need their recursion limits raised beyond 100 and 1000 levels.
