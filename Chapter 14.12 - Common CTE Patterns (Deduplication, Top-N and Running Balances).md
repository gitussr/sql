---
title: "14.12 - Common CTE Patterns (Deduplication, Top-N and Running Balances)"
description: "Reusable CTE recipes: finding and removing duplicates, latest row per group, top-N per group, running balances and running totals that reset, gaps and islands, pivot preparation, comparing snapshots, sessionization, allocating quantities across rows, and parameter CTEs for readable constants."
chapter: 14
section: 14.12
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 30 min
lastUpdated: 2026-09-28
---

# 14.12 Common CTE Patterns (Deduplication, Top-N and Running Balances)

---

# Learning Objectives

After completing this section, you will be able to:

- Find and remove duplicate rows.
- Return the latest row or top N rows per group.
- Compute running balances, including balances that reset.
- Group consecutive rows into islands and events into sessions.
- Compare two snapshots of a table.
- Use a parameter CTE to name constants.

---

# Pattern 1: Find Duplicates

```sql
WITH Dups AS (
    SELECT LOWER(TRIM(Email)) AS NormalizedEmail, COUNT(*) AS Copies
    FROM Customers
    WHERE Email IS NOT NULL
    GROUP BY LOWER(TRIM(Email))
    HAVING COUNT(*) > 1
)
SELECT c.CustomerID, c.CustomerName, c.Email, d.Copies
FROM Customers AS c
JOIN Dups      AS d ON d.NormalizedEmail = LOWER(TRIM(c.Email))
ORDER BY d.NormalizedEmail, c.CustomerID;
```

Normalize before comparing (Chapter 12): `'Asha@Example.com '` and `'asha@example.com'` are the same customer.

---

# Pattern 2: Remove Duplicates, Keep One

```sql
WITH Ranked AS (
    SELECT CustomerID,
           ROW_NUMBER() OVER (
               PARTITION BY LOWER(TRIM(Email))
               ORDER BY CreatedAt DESC, CustomerID DESC     -- keep the newest; unique tiebreaker
           ) AS rn
    FROM Customers
    WHERE Email IS NOT NULL
)
DELETE FROM Customers
WHERE CustomerID IN (SELECT CustomerID FROM Ranked WHERE rn > 1);
```

On SQL Server, `DELETE FROM Ranked WHERE rn > 1` works directly (Section 14.10). Before deleting, re-point child rows (orders of the duplicate customers) to the kept customer.

---

# Pattern 3: Latest Row per Group

```sql
WITH Ranked AS (
    SELECT o.*,
           ROW_NUMBER() OVER (PARTITION BY CustomerID ORDER BY OrderDate DESC, OrderID DESC) AS rn
    FROM Orders AS o
)
SELECT * FROM Ranked WHERE rn = 1;
```

`ROW_NUMBER` guarantees exactly one row per customer. Alternatives: `DISTINCT ON` (PostgreSQL), a correlated `MAX` subquery, or `LATERAL … LIMIT 1` / `CROSS APPLY (SELECT TOP 1 …)`, which can be faster when there are few groups and an index on `(CustomerID, OrderDate DESC)` (Section 11.10).

---

# Pattern 4: Top N per Group

```sql
WITH Ranked AS (
    SELECT e.*,
           DENSE_RANK() OVER (PARTITION BY DepartmentID ORDER BY Salary DESC) AS SalaryRank
    FROM Employees AS e
    WHERE Salary IS NOT NULL
)
SELECT DepartmentID, EmployeeName, Salary, SalaryRank
FROM Ranked
WHERE SalaryRank <= 3
ORDER BY DepartmentID, SalaryRank;
```

`ROW_NUMBER` returns exactly N rows per group; `RANK` and `DENSE_RANK` include ties (possibly more than N rows).

---

# Pattern 5: Running Balance

```sql
WITH Movements AS (
    SELECT AccountID, PostedAt, TransactionID,
           CASE WHEN TxType = 'Credit' THEN Amount ELSE -Amount END AS SignedAmount
    FROM Transactions
)
SELECT AccountID, PostedAt, SignedAmount,
       SUM(SignedAmount) OVER (
           PARTITION BY AccountID
           ORDER BY PostedAt, TransactionID
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
       ) AS Balance
FROM Movements
ORDER BY AccountID, PostedAt, TransactionID;
```

Use `ROWS`, not the default `RANGE` frame, so two transactions at the same timestamp get separate balances (Section 11.05), and add a unique tiebreaker to the ordering.

---

# Pattern 6: Running Total That Resets

A balance that must not go below zero (a loyalty-points wallet where overspending is floored at zero) cannot be written with `SUM() OVER`, because each row depends on the previous **result**. A recursive CTE expresses it:

```sql
WITH RECURSIVE Numbered AS (
    SELECT CustomerID, Points,
           ROW_NUMBER() OVER (PARTITION BY CustomerID ORDER BY EventAt, EventID) AS rn
    FROM PointsEvents
),
Wallet (CustomerID, rn, Points, Balance) AS (
    SELECT CustomerID, rn, Points, GREATEST(Points, 0)
    FROM Numbered WHERE rn = 1
    UNION ALL
    SELECT n.CustomerID, n.rn, n.Points, GREATEST(w.Balance + n.Points, 0)
    FROM Numbered AS n
    JOIN Wallet   AS w ON n.CustomerID = w.CustomerID AND n.rn = w.rn + 1
)
SELECT * FROM Wallet ORDER BY CustomerID, rn;
```

The recursion walks each customer's events in order, carrying the floored balance. It runs one iteration per event (per customer, in parallel), so index or materialize `Numbered` for large data. (SQL Server before 2022: use `CASE`; SQLite: multi-argument `max(…)`.)

---

# Pattern 7: Gaps and Islands

```sql
-- Consecutive days on which each customer placed at least one order
WITH Days AS (
    SELECT DISTINCT CustomerID, OrderDate FROM Orders
),
Grouped AS (
    SELECT CustomerID, OrderDate,
           OrderDate - CAST(ROW_NUMBER() OVER (PARTITION BY CustomerID ORDER BY OrderDate) AS INT) AS IslandKey
    FROM Days
)
SELECT CustomerID, MIN(OrderDate) AS StreakStart, MAX(OrderDate) AS StreakEnd,
       COUNT(*) AS StreakDays
FROM Grouped
GROUP BY CustomerID, IslandKey
HAVING COUNT(*) >= 3
ORDER BY StreakDays DESC;
```

Consecutive dates minus consecutive row numbers give a constant—the island key (Section 11.12). Three CTE-friendly steps: distinct days, island keys, aggregate per island.

---

# Pattern 8: Sessionization

```sql
-- A new session starts after 30 minutes of inactivity
WITH Ordered AS (
    SELECT UserID, EventAt,
           LAG(EventAt) OVER (PARTITION BY UserID ORDER BY EventAt) AS PrevAt
    FROM Events
),
Flagged AS (
    SELECT UserID, EventAt,
           CASE WHEN PrevAt IS NULL OR EventAt - PrevAt > INTERVAL '30 minutes' THEN 1 ELSE 0 END AS NewSession
    FROM Ordered
),
Sessions AS (
    SELECT UserID, EventAt,
           SUM(NewSession) OVER (PARTITION BY UserID ORDER BY EventAt ROWS UNBOUNDED PRECEDING) AS SessionNo
    FROM Flagged
)
SELECT UserID, SessionNo, MIN(EventAt) AS Started, MAX(EventAt) AS Ended, COUNT(*) AS Events
FROM Sessions
GROUP BY UserID, SessionNo;
```

Flag boundaries, then a running sum of flags numbers the sessions.

---

# Pattern 9: Compare Two Snapshots

```sql
WITH Before AS (SELECT ProductID, ListPrice FROM PriceSnapshot WHERE SnapshotDate = DATE '2026-09-01'),
     After  AS (SELECT ProductID, ListPrice FROM PriceSnapshot WHERE SnapshotDate = DATE '2026-09-28')
SELECT COALESCE(a.ProductID, b.ProductID) AS ProductID,
       b.ListPrice AS OldPrice, a.ListPrice AS NewPrice,
       CASE WHEN b.ProductID IS NULL THEN 'Added'
            WHEN a.ProductID IS NULL THEN 'Removed'
            ELSE 'Changed' END AS ChangeType
FROM Before AS b
FULL OUTER JOIN After AS a ON a.ProductID = b.ProductID
WHERE b.ProductID IS NULL OR a.ProductID IS NULL OR a.ListPrice <> b.ListPrice;
```

(MySQL has no `FULL OUTER JOIN`; union a `LEFT JOIN` and a `RIGHT JOIN` anti-join—Section 07.06.)

---

# Pattern 10: Parameter CTE

Name the constants a query uses in one place at the top:

```sql
WITH Params AS (
    SELECT DATE '2026-01-01' AS StartDate,
           DATE '2027-01-01' AS EndDate,
           500.00            AS BigOrder
)
SELECT o.CustomerID, COUNT(*) AS BigOrders
FROM Orders AS o
CROSS JOIN Params AS p
WHERE o.OrderDate >= p.StartDate AND o.OrderDate < p.EndDate
  AND o.TotalAmount >= p.BigOrder
GROUP BY o.CustomerID;
```

Useful in ad-hoc analysis and tools without variables. In application code, use real bind parameters instead; the optimizer treats a parameter CTE's values as constants on most engines, but not always.

---

# Visual Representation

```text
   PATTERN                 STEPS
   dedupe / latest / top-N  rank (ROW_NUMBER / DENSE_RANK) ──▶ filter rn
   running balance          sign amounts ──▶ SUM() OVER (ROWS …)
   floored balance          number rows ──▶ recursive carry
   islands / sessions       row key (ROW_NUMBER / LAG flag) ──▶ running key ──▶ GROUP BY key
   snapshot diff            two filtered CTEs ──▶ FULL OUTER JOIN ──▶ classify
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← each pattern starts from the previous CTE
2. JOIN        ← snapshot diffs: FULL OUTER JOIN; parameters: CROSS JOIN
3. WHERE       ← filter on rn / rank computed in an earlier CTE
4. GROUP BY    ← islands and sessions: group by the computed key
5. HAVING      ← streaks of at least 3 days
6. WINDOW      ← ROW_NUMBER, LAG, running SUM
7. SELECT
8. DISTINCT
9. ORDER BY    ← unique tiebreakers inside window ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
rank-and-filter patterns:   Sort (or index order) → WindowAgg → Filter
running totals:             Sort by partition/order → WindowAgg (streaming)
recursive carry:            one iteration per row position; join on (key, rn + 1) → index/materialize
islands / sessions:         two window passes (can share one sort) → Hash/Stream Aggregate
```

---

# 🏗️ Architecture Insight

These patterns recur in almost every analytical codebase. Keep a team library of tested versions—with the tiebreakers, frames and `NULL` handling already correct—rather than rewriting them from memory each time.

---

# ⚡ Performance Tip

Rank-and-filter patterns sort by `(partition, order)` columns; an index in that order lets the engine skip the sort. For "latest row per group" with few groups and many rows each, `LATERAL`/`APPLY` with `LIMIT 1` over such an index can beat a full `ROW_NUMBER` scan.

---

# 🌍 Production Consideration

Every pattern that uses `ROW_NUMBER` or a running sum needs a **deterministic order**. Without a unique tiebreaker, deduplication keeps different rows on different runs and running balances change order between executions.

---

# SQL Standard vs Vendor Differences

| Pattern | Portable form | Vendor shortcuts |
|---------|---------------|------------------|
| Latest per group | `ROW_NUMBER` + filter | `DISTINCT ON` (PostgreSQL), `QUALIFY` (not in these five engines) |
| Delete duplicates | CTE keys + `DELETE … IN` | `DELETE FROM cte` (SQL Server) |
| Floor at zero | Recursive CTE | `MODEL` clause (Oracle) |
| Snapshot diff | `FULL OUTER JOIN` | `EXCEPT` both ways; MySQL needs a union of joins |
| `GREATEST` | `CASE` | `GREATEST` (PostgreSQL, MySQL, Oracle, SQL Server 2022+); multi-argument `max()` (SQLite) |

> **Portability Tip:** `ROW_NUMBER`, running `SUM` with `ROWS` frames and recursive carries work on all five engines (MySQL 8.0+, SQLite 3.25+).

---

# Common Mistakes

### Mistake 1

Deduplicating without normalizing the compared values.

---

### Mistake 2

Using `RANK` when exactly one row per group is required.

---

### Mistake 3

Running balances with the default `RANGE` frame and duplicate timestamps.

---

### Mistake 4

Trying to floor a running balance with `SUM() OVER`.

---

### Mistake 5

Omitting unique tiebreakers in window ordering.

---

# Best Practices

✔ Normalize before finding duplicates; re-point children before deleting.

✔ `ROW_NUMBER` for exactly one; `DENSE_RANK` for ties.

✔ `ROWS` frames and unique tiebreakers for running totals.

✔ Recursive CTEs for running values that depend on the previous result.

✔ Keep a library of tested pattern templates.

---

# Interview Questions

## Basic

1. How do you find duplicate emails?
2. How do you get each customer's latest order?
3. How do you get the top 3 salaries per department?

## Intermediate

4. Why use `ROWS` instead of `RANGE` for a running balance?
5. How do you group consecutive days into streaks?
6. How do you split events into sessions?

## Advanced

7. Why can't a floored running balance be written with a window function?
8. How do you compare two snapshots of a table and classify the differences?

---

# Hands-on Exercises

## Exercise 1

Find duplicate customers by normalized email and delete all but the newest.

---

## Exercise 2

Compute each account's running balance and the date of its lowest balance.

---

## Exercise 3

Sessionize page views with a 30-minute timeout and report average session length.

---

# Related Topics

- **14.09 — CTEs with Aggregates and Window Functions**
- **14.10 — Data-Modifying CTEs (INSERT, UPDATE and DELETE)**
- **11.05 — Window Frames (ROWS, RANGE and GROUPS)**
- **11.10 — Top-N per Group, Deduplication and QUALIFY**
- **11.12 — Gaps and Islands**
- **07.06 — FULL OUTER JOIN**

---

# Summary

A handful of CTE patterns cover most analytical work: rank-and-filter for duplicates, latest rows and top-N per group; signed amounts with a running `SUM` over a `ROWS` frame for balances; a recursive carry for running values that depend on the previous result, such as balances floored at zero; row-number or `LAG`-flag keys for islands and sessions; filtered CTEs with a `FULL OUTER JOIN` for snapshot diffs; and a parameter CTE for readable constants. Each relies on deterministic ordering and correct `NULL` handling, which is why tested templates are worth keeping.
