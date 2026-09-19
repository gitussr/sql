---
title: "06.13 - Common WHERE Mistakes & Best Practices"
description: "Avoid the most common and costly SQL WHERE clause mistakes—NULL comparisons, precedence bugs, NOT IN traps, date-range errors, non-SARGable predicates, injection, and unfiltered updates—and adopt enterprise best practices for correct, secure, and fast filtering."
chapter: 6
section: 6.13
category: Data Query Language (DQL)
difficulty: Beginner → Advanced
readingTime: 60 min
lastUpdated: 2026-09-19
---

# 06.13 Common WHERE Mistakes & Best Practices

---

# Learning Objectives

After completing this section, you will be able to:

- Recognize the most frequent `WHERE` clause mistakes.
- Explain why each mistake produces wrong results, slow queries, or security risks.
- Apply a correct alternative for each mistake.
- Use a review checklist for filters.
- Adopt enterprise practices for safe data modification.

---

# Why This Section Matters

`WHERE` clause mistakes are dangerous because most of them **do not cause errors**.

The query runs. It returns rows. The rows are simply the wrong ones—or the right ones, a thousand times too slowly.

This section collects the mistakes from the whole chapter into one reference.

---

# Mistake Categories

```text
WHERE mistakes
    │
    ├── Correctness   → wrong rows, silently
    │
    ├── Performance   → right rows, too slowly
    │
    └── Safety        → injection, or changing the wrong data
```

---

# Correctness Mistakes

## Mistake 1: Comparing with NULL Using =

```sql
-- Wrong: never returns rows
WHERE ManagerID = NULL
```

```sql
-- Correct
WHERE ManagerID IS NULL
```

Any ordinary comparison with `NULL` is UNKNOWN (Section 06.08).

---

## Mistake 2: Forgetting That Inequality Excludes NULL

```sql
-- Excludes rows where Status is NULL
WHERE Status <> 'Closed'
```

```sql
-- If NULL statuses should be included
WHERE Status <> 'Closed'
   OR Status IS NULL
```

Decide deliberately whether each filter should include `NULL` rows.

---

## Mistake 3: Mixing AND and OR Without Parentheses

```sql
-- Wrong: returns every Indian customer, active or not
WHERE Country = 'India'
   OR Country = 'Nepal'
  AND IsActive = 1
```

```sql
-- Correct
WHERE (Country = 'India' OR Country = 'Nepal')
  AND IsActive = 1
```

`AND` binds before `OR` (Section 06.04).

---

## Mistake 4: NOT IN with a Nullable Subquery

```sql
-- Returns nothing if any ManagerID is NULL
WHERE EmployeeID NOT IN (SELECT ManagerID FROM Employees)
```

```sql
-- Correct
WHERE NOT EXISTS (
    SELECT 1
    FROM Employees r
    WHERE r.ManagerID = e.EmployeeID
)
```

(Section 06.06 and 06.10.)

---

## Mistake 5: BETWEEN on Date-Time Columns

```sql
-- Misses almost all of 31 January
WHERE CreatedAt BETWEEN '2026-01-01' AND '2026-01-31'
```

```sql
-- Correct half-open range
WHERE CreatedAt >= TIMESTAMP '2026-01-01 00:00:00'
  AND CreatedAt <  TIMESTAMP '2026-02-01 00:00:00'
```

(Section 06.05.)

---

## Mistake 6: Using a SELECT Alias in WHERE

```sql
-- Error in most databases
SELECT Salary * 12 AS AnnualSalary
FROM Employees
WHERE AnnualSalary > 600000;
```

```sql
-- Correct
SELECT Salary * 12 AS AnnualSalary
FROM Employees
WHERE Salary > 50000;
```

`WHERE` runs before `SELECT` (Section 06.01).

---

## Mistake 7: Using Aggregates in WHERE

```sql
-- Error
WHERE COUNT(*) > 5
```

```sql
-- Correct: filter groups with HAVING
GROUP BY Department
HAVING COUNT(*) > 5
```

---

## Mistake 8: Treating _ as a Literal in LIKE

```sql
-- Also matches 'report-2026' and 'reportX2026'
WHERE FileName LIKE 'report_2026%'
```

```sql
-- Correct
WHERE FileName LIKE 'report\_2026%' ESCAPE '\'
```

(Section 06.07.)

---

## Mistake 9: Assuming Case Sensitivity

```sql
WHERE Country = 'india'
```

matches `'India'` on MySQL's default collations but not on PostgreSQL or Oracle. Know your collation, and store data consistently.

---

## Mistake 10: Relying on Evaluation Order

```sql
-- May still divide by zero
WHERE Quantity <> 0
  AND Total / Quantity > 10
```

```sql
-- Safe on its own
WHERE Total / NULLIF(Quantity, 0) > 10
```

SQL does not guarantee short-circuit evaluation (Section 06.04).

---

# Performance Mistakes

## Mistake 11: Functions on Indexed Columns

```sql
-- Full scan
WHERE YEAR(OrderDate) = 2026
```

```sql
-- Index range scan
WHERE OrderDate >= DATE '2026-01-01'
  AND OrderDate <  DATE '2027-01-01'
```

---

## Mistake 12: Arithmetic on the Column Side

```sql
WHERE Price * 1.18 > 1000       -- non-SARGable
WHERE Price > 1000 / 1.18       -- SARGable
```

---

## Mistake 13: Implicit Type Conversion

```sql
-- PhoneNumber is VARCHAR
WHERE PhoneNumber = 5551234     -- converts every row
WHERE PhoneNumber = '5551234'   -- index-friendly
```

---

## Mistake 14: Leading Wildcards on Large Tables

```sql
WHERE ProductName LIKE '%phone%'
```

Use trigram or full-text indexes for contains-searches, or restrict to prefix searches.

---

## Mistake 15: Huge Literal IN Lists

```sql
WHERE CustomerID IN (1, 2, 3, ..., 25000)
```

Load the values into a temporary table and join or use `EXISTS`.

---

## Mistake 16: Masking Join Problems with DISTINCT

```sql
SELECT DISTINCT c.CustomerName
FROM Customers c
JOIN Orders o ON o.CustomerID = c.CustomerID
WHERE o.Status = 'Open';
```

If you only need customers with open orders, use `EXISTS`.

---

# Safety Mistakes

## Mistake 17: Concatenating User Input

```text
// Vulnerable application code
"SELECT * FROM Users WHERE Email = '" + input + "'"
```

```sql
-- Safe: parameterized
SELECT *
FROM Users
WHERE Email = ?;
```

---

## Mistake 18: UPDATE or DELETE Without WHERE

```sql
-- Updates every row
UPDATE Products
SET Price = 0;
```

Always write the `WHERE` clause first, and verify it with a `SELECT`.

---

## Mistake 19: Unverified Filters on Data Changes

```sql
DELETE FROM Orders
WHERE CreatedAt < '2025-01-01';
```

Is the column a date or a timestamp? Which time zone? How many rows will this delete? A filter that is "almost right" in a `DELETE` destroys data.

---

# The Safe Modification Workflow

```text
1. Write the WHERE clause as a SELECT
        │
        ▼
2. Check the row count and sample rows
        │
        ▼
3. BEGIN TRANSACTION
        │
        ▼
4. Run the UPDATE / DELETE with the same WHERE
        │
        ▼
5. Compare the affected-row count with step 2
        │
        ├── matches   → COMMIT
        └── differs   → ROLLBACK and investigate
```

```sql
SELECT COUNT(*)
FROM Orders
WHERE Status = 'Cancelled'
  AND CreatedAt < TIMESTAMP '2025-01-01 00:00:00';

BEGIN;   -- BEGIN TRANSACTION in SQL Server

DELETE FROM Orders
WHERE Status = 'Cancelled'
  AND CreatedAt < TIMESTAMP '2025-01-01 00:00:00';

-- Verify the reported row count, then:
COMMIT;
```

---

# Filter Review Checklist

```text
Correctness
  ☐ NULL handled explicitly (IS NULL / IS DISTINCT FROM)?
  ☐ Every OR group parenthesized?
  ☐ No NOT IN against a nullable subquery?
  ☐ Date-time filters use half-open ranges?
  ☐ LIKE wildcards and case sensitivity understood?

Performance
  ☐ Indexed columns bare (no functions, arithmetic, casts)?
  ☐ Literal and parameter types match column types?
  ☐ Leading wildcards avoided or specially indexed?
  ☐ Execution plan shows expected access predicates?

Safety
  ☐ All external values passed as parameters?
  ☐ UPDATE / DELETE filters verified with SELECT?
  ☐ Changes run in a transaction with row-count check?
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE   ← Every mistake in this section happens here
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

Remembering that `WHERE` runs **before** `SELECT` and **before** grouping explains mistakes 6 and 7 directly.

---

# How the DBMS Executes This

Many mistakes are visible in the execution plan before they reach production:

| Symptom in the plan | Likely mistake |
|---------------------|----------------|
| Full scan despite an index | Function, arithmetic, or conversion on the column |
| `CONVERT_IMPLICIT` / type cast on a column | Mismatched literal or parameter type |
| Estimated rows ≪ actual rows | Stale statistics, correlated predicates, non-SARGable expressions |
| Anti-join with extra NULL checks | `NOT IN` against a nullable column |
| Sort/hash for `DISTINCT` after a join | Duplicates masked instead of using `EXISTS` |

---

# 🔬 Engine Deep Dive

Some mistakes are caught by the engine, others are not:

```text
Detected at parse / bind time (errors):
    alias in WHERE, aggregate in WHERE,
    two WHERE clauses, unknown column

Detected at run time (errors):
    scalar subquery returning many rows,
    conversion failures, division by zero

NOT detected at all (silent):
    = NULL, precedence bugs, NOT IN with NULL,
    BETWEEN on date-times, wildcard _ in LIKE,
    case-sensitivity assumptions, missing WHERE
```

The silent category is the most dangerous, which is why reviews and tests with realistic data—including `NULL`s and boundary values—matter so much.

---

# 🏗️ Architecture Insight

Many filtering mistakes are symptoms of schema decisions: nullable columns that should be `NOT NULL`, numbers stored as text, date-times stored as strings, inconsistent case in stored values. Fixing the schema removes whole classes of `WHERE` bugs permanently, rather than one query at a time.

---

# ⚡ Performance Tip

When a filtered query is slow, check in this order: SARGability of each predicate, type mismatches, estimated versus actual rows, and only then whether a new index is needed. Most slow filters are fixed by rewriting, not by indexing.

---

# 🔒 Security Note

Parameterization is mandatory, not optional. Combine it with least-privilege accounts, so that even a mistaken or malicious filter cannot read or modify data outside the application's scope, and with row-level security where tenants or users must be isolated.

---

# 🌍 Production Consideration

Production databases often enforce safeguards against unfiltered changes: MySQL's `sql_safe_updates`, review gates for ad-hoc data fixes, mandatory backups before bulk deletes, and audit logs of data-modifying statements. These guardrails exist because `WHERE` mistakes in data changes are costly and common.

---

# 🚀 Enterprise Practice

Enterprise teams codify these lessons: SQL linters flag `= NULL`, unparenthesized `OR`, `NOT IN (subquery)`, functions on columns, and missing `WHERE` clauses; test suites include `NULL` and boundary values; and every production data fix follows the select-first, transaction, row-count-check workflow.

---

# SQL Standard vs Vendor Differences

| Safeguard | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|-----------|--------------|------------|--------|------------|---------|---------|
| Transactions for data fixes | ✅ | ✅ | ✅ (InnoDB) | ✅ | ✅ | ✅ |
| Block unfiltered `UPDATE`/`DELETE` | — | Via extensions/triggers | `sql_safe_updates` | Via triggers / policies | Via triggers / policies | ❌ |
| `RETURNING` affected rows | — | `RETURNING` | ❌ | `OUTPUT` | `RETURNING INTO` | `RETURNING` (3.35+) |
| Row-level security | — | ✅ | ❌ | ✅ | ✅ (VPD) | ❌ |

> **Portability Tip:** The mistakes in this section are portable—they occur on every database. Safeguards, however, are vendor-specific, so learn the tools your production database provides.

---

# Best Practices

✔ Use `IS NULL`, `IS NOT NULL`, and `IS DISTINCT FROM` for missing values.

✔ Parenthesize every `OR` group.

✔ Prefer `NOT EXISTS` over `NOT IN` for subqueries.

✔ Use half-open ranges for dates and times.

✔ Keep indexed columns bare and types matched.

✔ Parameterize every external value.

✔ Verify data-changing filters with `SELECT` and run them in transactions.

✔ Test with `NULL`s, boundaries, and realistic volumes.

---

# Interview Questions

## Basic

1. Why does `WHERE x = NULL` return no rows?
2. What goes wrong when `AND` and `OR` are mixed without parentheses?
3. How do you safely delete old records?

## Intermediate

4. Why is `NOT IN` with a subquery risky?
5. Why is `BETWEEN` risky on date-time columns?
6. Name three predicate patterns that prevent index use.

## Advanced

7. Which `WHERE` mistakes are silent and which produce errors?
8. How would you detect an implicit conversion problem in an execution plan?
9. Design a review checklist for filters in a code review process.

---

# Hands-on Exercises

## Exercise 1

Find and fix every problem in this query:

```sql
SELECT OrderID, Total * 1.18 AS TotalWithTax
FROM Orders
WHERE Status = "Open"
   OR Status = "Pending"
  AND TotalWithTax > 1000
  AND YEAR(CreatedAt) = 2026
  AND CouponCode = NULL;
```

---

## Exercise 2

Write the complete safe workflow to delete sessions that expired more than 90 days ago.

---

## Exercise 3

Rewrite so that it returns departments with no employees, even when some employees have no department:

```sql
SELECT DepartmentName
FROM Departments
WHERE DepartmentID NOT IN (SELECT DepartmentID FROM Employees);
```

---

## Exercise 4

A report of "open tickets" uses `WHERE Status <> 'Closed'` and its total is 400 lower than the number of tickets that are not closed. Explain the likely cause and fix it.

---

# Related Topics

- **05.13 — Common SELECT Mistakes & Best Practices**
- **06.04 — Logical Operators (AND, OR, NOT)**
- **06.06 — IN and NOT IN**
- **06.08 — NULL Handling in WHERE (Three-Valued Logic)**
- **06.12 — SARGability and Index-Friendly Predicates**
- **06.14 — WHERE Cheat Sheet & Visual Knowledge Map**

---

# Summary

Most `WHERE` clause mistakes are silent: `= NULL`, unparenthesized `OR`, `NOT IN` with `NULL`, `BETWEEN` on date-times, and unescaped `LIKE` wildcards return plausible but wrong results. Performance mistakes—functions, arithmetic, and conversions on columns, leading wildcards, and huge `IN` lists—return correct results too slowly. Safety mistakes—concatenated input and unverified data changes—put data at risk. A consistent checklist, parameterized queries, SARGable predicates, tests with `NULL` and boundary values, and a select-first, transactional workflow for data changes prevent nearly all of them.
