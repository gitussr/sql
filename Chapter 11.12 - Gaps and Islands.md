---
title: "11.12 - Gaps and Islands"
description: "Solving gaps-and-islands problems with window functions: finding missing values in sequences, grouping consecutive values with the ROW_NUMBER difference technique, change-flag and running-sum islands, date streaks, sessionisation by inactivity, merging overlapping intervals, and state durations."
chapter: 11
section: 11.12
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 35 min
lastUpdated: 2026-09-25
---

# 11.12 Gaps and Islands

---

# Learning Objectives

After completing this section, you will be able to:

- Recognise gaps-and-islands problems.
- Find gaps in numeric and date sequences with `LEAD`.
- Group consecutive values into islands with the row-number difference technique.
- Build islands from change flags and running sums.
- Compute streaks, sessions and state durations.
- Merge overlapping or adjacent intervals.

---

# What Are Gaps and Islands?

Many questions ask about **runs** of consecutive values:

```text
Sequence of values:   1  2  3  _  _  6  7  _  9  10  11
                      └──────┘      └───┘    └────────┘
                       island        island    island
                              └─gap─┘   └gap┘
```

- **Gaps:** missing values—missing invoice numbers, days without data.
- **Islands:** maximal runs of consecutive values—login streaks, uninterrupted service periods, sessions, consecutive days in a state.

Before window functions, these needed self-joins or procedural loops. Window functions solve them in a few set-based steps.

---

# Finding Gaps

```sql
-- Missing invoice numbers
SELECT InvoiceNo + 1 AS GapStart, NextNo - 1 AS GapEnd
FROM (
    SELECT InvoiceNo, LEAD(InvoiceNo) OVER (ORDER BY InvoiceNo) AS NextNo
    FROM Invoices
) AS t
WHERE NextNo - InvoiceNo > 1;
```

```text
InvoiceNo: 1001 1002 1003 1006 1007 1010
Gaps:      1004–1005, 1008–1009
```

The same works for dates:

```sql
-- Days with no sales record
SELECT SalesDate + 1 AS GapStart, NextDate - 1 AS GapEnd   -- PostgreSQL date arithmetic
FROM (
    SELECT SalesDate, LEAD(SalesDate) OVER (ORDER BY SalesDate) AS NextDate
    FROM DailySales
) AS t
WHERE NextDate - SalesDate > 1;
```

---

# Islands: The Row-Number Difference Technique

For consecutive integers (or consecutive days), subtract a `ROW_NUMBER` from the value. Within an island, both increase by 1 per row, so their difference is constant; it changes at every gap.

```sql
SELECT MIN(InvoiceNo) AS IslandStart, MAX(InvoiceNo) AS IslandEnd, COUNT(*) AS Size
FROM (
    SELECT InvoiceNo,
           InvoiceNo - ROW_NUMBER() OVER (ORDER BY InvoiceNo) AS grp
    FROM Invoices
) AS t
GROUP BY grp
ORDER BY IslandStart;
```

```text
InvoiceNo   ROW_NUMBER   InvoiceNo − ROW_NUMBER (grp)
1001        1            1000   ┐
1002        2            1000   │ island 1001–1003
1003        3            1000   ┘
1006        4            1002   ┐ island 1006–1007
1007        5            1002   ┘
1010        6            1004   ← island 1010
```

`grp` has no meaning of its own; it only has to be equal within an island and different between islands.

---

# Date Streaks

"Longest streak of consecutive login days per user":

```sql
WITH Days AS (
    SELECT DISTINCT UserID, CAST(LoginAt AS DATE) AS LoginDate
    FROM Logins
),
Grouped AS (
    SELECT UserID, LoginDate,
           LoginDate - CAST(ROW_NUMBER() OVER (PARTITION BY UserID ORDER BY LoginDate) AS INT) AS grp
    FROM Days
)
SELECT UserID, MIN(LoginDate) AS StreakStart, MAX(LoginDate) AS StreakEnd, COUNT(*) AS StreakDays
FROM Grouped
GROUP BY UserID, grp
ORDER BY UserID, StreakDays DESC;
```

(PostgreSQL date minus integer gives a date. SQL Server: `DATEADD(day, -ROW_NUMBER() OVER (…), LoginDate)`; MySQL: `DATE_SUB(LoginDate, INTERVAL ROW_NUMBER() OVER (…) DAY)`; Oracle: `LoginDate - ROW_NUMBER() OVER (…)`.)

The `DISTINCT` step matters: two logins on the same day must count as one day, or the difference technique breaks.

---

# Islands from Change Flags

When "consecutive" is not a numeric sequence—runs of the same status, the same price, the same value—use two steps:

1. Flag rows where a new island starts (`LAG` differs).
2. Running-sum the flags to number the islands.

```sql
-- Periods during which each order stayed in the same status
WITH Flagged AS (
    SELECT h.OrderID, h.ChangedAt, h.Status,
           CASE WHEN h.Status = LAG(h.Status) OVER (PARTITION BY h.OrderID ORDER BY h.ChangedAt, h.HistoryID)
                THEN 0 ELSE 1 END AS IsStart
    FROM OrderStatusHistory AS h
),
Numbered AS (
    SELECT f.*,
           SUM(IsStart) OVER (PARTITION BY OrderID ORDER BY ChangedAt, HistoryID
                              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS IslandNo
    FROM Flagged AS f
)
SELECT OrderID, IslandNo, MIN(Status) AS Status,
       MIN(ChangedAt) AS FromTime, MAX(ChangedAt) AS LastChangeInIsland
FROM Numbered
GROUP BY OrderID, IslandNo
ORDER BY OrderID, IslandNo;
```

```text
Status:   Pending Pending Shipped Shipped Shipped Pending
IsStart:     1       0       1       0       0       1
IslandNo:    1       1       2       2       2       3
```

This flag-and-sum pattern is the most general islands technique: any rule for "starts a new island" can go in the `CASE`.

---

# Sessionisation

Group events into sessions separated by more than 30 minutes of inactivity:

```sql
WITH Gaps AS (
    SELECT e.UserID, e.EventAt,
           CASE WHEN e.EventAt - LAG(e.EventAt) OVER (PARTITION BY e.UserID ORDER BY e.EventAt, e.EventID)
                     <= INTERVAL '30' MINUTE
                THEN 0 ELSE 1 END AS NewSession
    FROM Events AS e
),
Sessions AS (
    SELECT g.*,
           SUM(NewSession) OVER (PARTITION BY UserID ORDER BY EventAt
                                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS SessionNo
    FROM Gaps AS g
)
SELECT UserID, SessionNo, MIN(EventAt) AS SessionStart, MAX(EventAt) AS SessionEnd, COUNT(*) AS Events
FROM Sessions
GROUP BY UserID, SessionNo;
```

The first event of each user has `LAG = NULL`; the comparison is UNKNOWN, the `CASE` falls to `ELSE 1`, and a session starts—exactly right.

---

# Merging Overlapping Intervals

"Combine overlapping bookings of the same room into occupied periods":

```sql
WITH Ordered AS (
    SELECT b.RoomID, b.StartAt, b.EndAt,
           MAX(b.EndAt) OVER (PARTITION BY b.RoomID ORDER BY b.StartAt, b.BookingID
                              ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS PrevMaxEnd
    FROM Bookings AS b
),
Flagged AS (
    SELECT o.*,
           CASE WHEN o.StartAt <= o.PrevMaxEnd THEN 0 ELSE 1 END AS IsStart
    FROM Ordered AS o
),
Numbered AS (
    SELECT f.*,
           SUM(IsStart) OVER (PARTITION BY RoomID ORDER BY StartAt
                              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS Grp
    FROM Flagged AS f
)
SELECT RoomID, MIN(StartAt) AS OccupiedFrom, MAX(EndAt) AS OccupiedTo
FROM Numbered
GROUP BY RoomID, Grp;
```

The running `MAX(EndAt)` over **all previous** bookings (not just the previous one) handles a long booking that overlaps several later short ones. Use `<` instead of `<=` if touching intervals should stay separate.

---

# Durations in Each State

Combine islands with `LEAD` to measure how long each state lasted:

```sql
SELECT OrderID, Status, ChangedAt AS Entered,
       LEAD(ChangedAt) OVER (PARTITION BY OrderID ORDER BY ChangedAt, HistoryID) AS LeftAt
FROM OrderStatusHistory;
-- Duration = LeftAt − Entered; the current state has LeftAt NULL
```

Aggregating durations by status gives "average time in Pending", "average time to ship"—core operational metrics.

---

# Choosing a Technique

| Data | Technique |
|------|-----------|
| Integer or daily sequence, find missing | `LEAD` difference > 1 |
| Integer or daily sequence, find runs | Value − `ROW_NUMBER` |
| Runs of equal values | `LAG` change flag + running `SUM` |
| Events separated by inactivity | Time-gap flag + running `SUM` |
| Overlapping intervals | Running `MAX(end)` over previous rows + flag + running `SUM` |

---

# Visual Representation

```text
Flag-and-sum islands

value      A   A   B   B   B   A   C   C
IsStart    1   0   1   0   0   1   1   0      ← LAG differs?
IslandNo   1   1   2   2   2   3   4   4      ← running SUM(IsStart)
           └───┘   └───────┘   └┘  └───┘
GROUP BY IslandNo → one row per island
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← restrict to the entities / period first
4. GROUP BY    ← (outer query) one row per island
5. HAVING      ← e.g. streaks of at least 7 days
6. WINDOW      ← (inner queries) LAG flags, ROW_NUMBER, running SUM
7. SELECT
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

Islands need windows **before** grouping, which the single-query order does not allow—hence the CTE chain: window in one step, group in the next.

---

# How the DBMS Executes This

```text
CTE chain for flag-and-sum islands

Sort (entity, time)
  WindowAgg LAG                  → IsStart
    WindowAgg running SUM        → IslandNo       (same sort order: no extra sort)
      HashAggregate / GroupAggregate by (entity, IslandNo)
```

All window steps share one ordering, so the whole analysis costs one sort plus a group-by.

---

# 🔬 Engine Deep Dive

The flag-and-sum pattern is effectively a two-pass state machine written declaratively: `LAG` compares with the previous state, the running `SUM` carries a counter. Oracle's `MATCH_RECOGNIZE` clause (SQL:2016 row pattern recognition, Oracle 12c+) expresses such patterns directly—"a run of rows with the same status", "a V-shaped price dip"—and is worth knowing where available.

---

# 🏗️ Architecture Insight

Gaps and islands turn raw events into business entities: sessions, visits, stays, outages, subscriptions, streaks. Many systems compute these in batch jobs outside the database; with windows they can be defined as views over event tables, keeping the definition of "a session" in one reviewed SQL statement.

---

# ⚡ Performance Tip

Index `(entity, time)` and keep all window steps on the same `PARTITION BY`/`ORDER BY`, so that the entire chain needs one ordered read and no extra sorts.

---

# 🔒 Security Note

Sessionisation and streak analysis profile user behaviour. Aggregate or pseudonymise results where individual behaviour patterns are not needed, and respect data-retention limits on the event tables they use.

---

# SQL Standard vs Vendor Differences

| Feature | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|---------|-----------|-------|-----------|--------|--------|
| `LAG` / running `SUM` islands | ✅ | ✅ | ✅ | ✅ | ✅ |
| Date − integer | ✅ | `DATE_SUB` | `DATEADD` | ✅ | `date(x, '-n day')` |
| Interval comparison for sessions | ✅ | ✅ | `DATEDIFF` | ✅ | `julianday` arithmetic |
| `MATCH_RECOGNIZE` | ❌ | ❌ | ❌ | ✅ (12c+) | ❌ |
| Range types / multirange aggregation | ✅ (`range_agg`, 14+) | ❌ | ❌ | ❌ | ❌ |

> **Portability Tip:** The window techniques are portable; only date arithmetic differs. Isolate it in one expression per query, or precompute day numbers with a calendar table.

---

# Common Mistakes

### Mistake 1

Applying the row-number difference to data with duplicate values (e.g. several logins per day) without deduplicating first.

---

### Mistake 2

Comparing only with the previous interval's end when merging intervals, missing long overlapping bookings.

---

### Mistake 3

Non-unique ordering, making `LAG` flags non-deterministic.

---

### Mistake 4

Forgetting that the first row's `LAG` is `NULL` and mishandling it in the flag.

---

# Best Practices

✔ Deduplicate to one row per unit (day, number) before the difference technique.

✔ Use flag-and-sum for any non-arithmetic island rule.

✔ Use a running `MAX(end)` over previous rows for interval merging.

✔ Order uniquely and partition by entity.

✔ Build the analysis as a CTE chain: flag → number → group.

---

# Interview Questions

## Basic

1. What is a gaps-and-islands problem?
2. How do you find missing numbers in a sequence?
3. How do you find each user's login streaks?

## Intermediate

4. Why does `value − ROW_NUMBER()` identify islands?
5. How do you group rows into runs of the same status?
6. How do you split events into sessions separated by 30 minutes of inactivity?

## Advanced

7. How do you merge overlapping intervals correctly?
8. Why must duplicates be removed before the difference technique?
9. What does `MATCH_RECOGNIZE` add over window functions?

---

# Hands-on Exercises

## Exercise 1

Find all missing `OrderID` ranges in `Orders`.

---

## Exercise 2

Find the longest streak of consecutive days with revenue above 1 000 in `DailySales`.

---

## Exercise 3

Sessionise a web events table with a 30-minute timeout and report sessions per user per day.

---

## Exercise 4

Merge overlapping room bookings into occupied periods, including a long booking that overlaps three short ones.

---

# Related Topics

- **11.03 — Ranking Functions (ROW_NUMBER, RANK, DENSE_RANK, NTILE)**
- **11.06 — Running Totals, Moving Averages and Shares**
- **11.07 — LAG and LEAD**
- **08.05 — GROUP BY Syntax and Semantics**

---

# Summary

Gaps-and-islands problems ask about missing values and runs of consecutive values. Gaps come from `LEAD` differences greater than one step. Islands of consecutive numbers or days come from `value − ROW_NUMBER()`, which is constant within a run; islands of equal states, sessions and overlapping intervals come from flagging where a new run starts (with `LAG` or a running `MAX` of previous ends) and running-summing the flags into island numbers, then grouping. With deduplicated input, unique ordering and a CTE chain that shares one sort, these techniques turn event data into streaks, sessions, stays and state durations.
