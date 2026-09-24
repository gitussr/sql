---
title: "08.16 - Common GROUP BY Mistakes & Best Practices"
description: "A catalogue of GROUP BY and aggregation mistakes—ungrouped columns, wrong COUNT form, fan-out totals, NULL surprises, integer averages, late filtering, missing zero rows, averaging averages—each with the symptom, the cause and the fix, plus a review checklist."
chapter: 8
section: 8.16
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 40 min
lastUpdated: 2026-09-24
---

# 08.16 Common GROUP BY Mistakes & Best Practices

---

# Learning Objectives

After completing this section, you will be able to:

- Recognise the most common aggregation mistakes from their symptoms.
- Explain the cause of each mistake.
- Apply the correct fix for each.
- Review a grouped query with a systematic checklist.

---

# How to Use This Section

Each mistake is presented as **symptom → cause → fix**. Aggregation mistakes rarely produce errors; they produce plausible wrong numbers. The symptom is usually a total that "looks a bit high", a count that is never zero, or a report that differs from another one.

---

# Mistake 1: Selecting an Ungrouped Column

**Symptom:** an error on most engines; an arbitrary value on SQLite or permissive MySQL.

```sql
-- ❌
SELECT CustomerID, OrderDate, SUM(TotalAmount)
FROM Orders
GROUP BY CustomerID;
```

**Cause:** `OrderDate` has many values per customer.

**Fix:** decide which value you want.

```sql
-- ✅
SELECT CustomerID, MAX(OrderDate) AS LastOrder, SUM(TotalAmount) AS Revenue
FROM Orders
GROUP BY CustomerID;
```

For the full row of the latest order, use a window function or a join back (Section 08.07).

---

# Mistake 2: COUNT(*) After a LEFT JOIN

**Symptom:** entities with no activity show a count of 1.

```sql
-- ❌
SELECT c.CustomerID, COUNT(*) AS Orders
FROM Customers c LEFT JOIN Orders o ON o.CustomerID = c.CustomerID
GROUP BY c.CustomerID;
```

**Cause:** the preserved row with a `NULL`-extended right side is a row, and `COUNT(*)` counts rows.

**Fix:** count the optional table's key.

```sql
-- ✅
SELECT c.CustomerID, COUNT(o.OrderID) AS Orders
FROM Customers c LEFT JOIN Orders o ON o.CustomerID = c.CustomerID
GROUP BY c.CustomerID;
```

---

# Mistake 3: Summing Across a Fan-Out Join

**Symptom:** totals higher than the source table's total, by varying amounts per group.

```sql
-- ❌ Order totals repeated per item
SELECT o.CustomerID, SUM(o.TotalAmount)
FROM Orders o JOIN OrderItems oi ON oi.OrderID = o.OrderID
GROUP BY o.CustomerID;
```

**Cause:** a 1:N join repeats the order row once per item (Section 08.11).

**Fix:** sum at the finest grain, or aggregate each branch before joining.

```sql
-- ✅
SELECT o.CustomerID, SUM(oi.Quantity * oi.UnitPrice) AS Revenue
FROM Orders o JOIN OrderItems oi ON oi.OrderID = o.OrderID
GROUP BY o.CustomerID;
```

---

# Mistake 4: SUM(DISTINCT) to Hide Duplicates

**Symptom:** totals slightly **lower** than expected.

```sql
-- ❌
SELECT o.OrderID, SUM(DISTINCT p.Amount) AS Paid
FROM Orders o JOIN Payments p ON p.OrderID = o.OrderID
GROUP BY o.OrderID;
```

**Cause:** two genuine payments of the same amount are collapsed into one.

**Fix:** remove the duplication at its source—pre-aggregate or fix the join.

---

# Mistake 5: Missing Zero Rows

**Symptom:** categories, days or customers with no activity are absent from a report instead of showing zero.

```sql
-- ❌ Days with no orders disappear
SELECT OrderDate, COUNT(*) FROM Orders GROUP BY OrderDate;
```

**Cause:** groups exist only for data that exists.

**Fix:** drive the query from the table that defines the full set.

```sql
-- ✅ Calendar table outer-joined to the facts
SELECT d.CalendarDate, COUNT(o.OrderID) AS Orders
FROM Calendar AS d
LEFT JOIN Orders AS o ON o.OrderDate = d.CalendarDate
WHERE d.CalendarDate >= DATE '2026-09-01'
  AND d.CalendarDate <  DATE '2026-10-01'
GROUP BY d.CalendarDate
ORDER BY d.CalendarDate;
```

---

# Mistake 6: NULL Totals Shown as Blank

**Symptom:** empty cells where users expect `0`; null-reference errors in application code.

**Cause:** `SUM`, `AVG`, `MIN` and `MAX` return `NULL` on groups with no non-`NULL` values.

**Fix:** `COALESCE(SUM(x), 0)` where zero is the truth; an explicit "no data" state where it is not.

---

# Mistake 7: COALESCE Inside AVG

**Symptom:** averages lower than expected.

```sql
-- ❌ Contractors (NULL salary) counted as earning 0
SELECT DepartmentID, AVG(COALESCE(Salary, 0)) FROM Employees GROUP BY DepartmentID;
```

**Cause:** replacing `NULL` with `0` adds zeros to the denominator and the numerator.

**Fix:** decide what `NULL` means (Section 08.04). If it means "not applicable", use `AVG(Salary)`.

---

# Mistake 8: Integer Average

**Symptom:** averages that are always whole numbers on SQL Server.

```sql
-- ❌ SQL Server: AVG of INT is INT
SELECT AVG(Quantity) FROM OrderItems;
```

**Fix:**

```sql
-- ✅
SELECT AVG(CAST(Quantity AS DECIMAL(10,4))) FROM OrderItems;
```

The same truncation hits percentages: `100 * part / whole` → use `100.0`.

---

# Mistake 9: Row Filters in HAVING

**Symptom:** correct results, slow query.

```sql
-- ❌
SELECT CustomerID, SUM(TotalAmount)
FROM Orders
GROUP BY CustomerID
HAVING CustomerID IN (1, 2, 3);
```

**Fix:** row conditions belong in `WHERE`, where they reduce the rows that are grouped (Section 08.09).

---

# Mistake 10: Moving a Condition and Changing the Question

**Symptom:** a report total changes after a "harmless refactor".

**Cause:** `WHERE Status = 'Shipped'` changes what is summed; a group-level condition in `HAVING` changes which groups are shown. They are different questions.

**Fix:** decide the question first; use conditional aggregation when qualification and reporting need different rows (Section 08.10).

---

# Mistake 11: Averaging Averages

**Symptom:** a monthly average that differs from the average computed directly over the month.

```sql
-- ❌ Each day weighs the same, regardless of its number of orders
SELECT AVG(DailyAvg) FROM DailyStats WHERE Month = '2026-09';
```

**Cause:** an average of averages ignores group sizes.

**Fix:** keep additive measures and divide at the end.

```sql
-- ✅
SELECT SUM(DailyRevenue) / SUM(DailyOrders) AS AvgOrderValue
FROM DailyStats
WHERE Month = '2026-09';
```

The same applies to percentages, ratios and medians: none of them can be combined by averaging.

---

# Mistake 12: COUNT(DISTINCT) Across Levels

**Symptom:** monthly unique customers do not equal the sum of weekly unique customers.

**Cause:** distinct counts are not additive—a customer active in two weeks is one monthly customer.

**Fix:** compute distinct counts at each level from the underlying rows; never sum them.

---

# Mistake 13: Relying on GROUP BY for Order

**Symptom:** report rows appear in a different order after a data growth or upgrade.

**Cause:** hash aggregation produces unordered output; MySQL 8.0 removed implicit sorting.

**Fix:** always add `ORDER BY`, with a tie-breaker.

---

# Mistake 14: Grouping by a Descriptive Column

**Symptom:** two different entities merged into one row.

```sql
-- ❌ Two customers named "Ada Lovelace" merge
GROUP BY c.CustomerName
```

**Fix:** group by the key; display the name alongside it.

---

# Mistake 15: Month Without Year, Days in the Wrong Time Zone

**Symptom:** January totals include several years; late-evening sales appear on the next day.

**Fix:** bucket with a truncation that keeps the year (`DATE_TRUNC('month', ...)`), and convert to the reporting time zone before truncating (Section 08.06).

---

# Mistake 16: Subtotal Rows Mistaken for Data

**Symptom:** after `ROLLUP`, a downstream sum is double the real total; a `NULL` country is labelled "All countries".

**Fix:** use `GROUPING()` to label and filter subtotal rows; give consumers an explicit level column (Section 08.12).

---

# Mistake 17: Truncated String Aggregates

**Symptom:** product lists cut off mid-word for large orders on MySQL.

**Cause:** `GROUP_CONCAT` stops at `group_concat_max_len` (1,024 bytes by default) with only a warning.

**Fix:** raise the limit for the session, or return rows / JSON instead of a long string.

---

# The Review Checklist

Use this for every grouped query in code review:

```text
GRAIN
  □ What does one output row represent? Is it written down?
  □ Is every non-aggregated SELECT column in GROUP BY (or dependent on its key)?

JOINS
  □ What is the grain after each join?
  □ Is any measure summed from a table coarser than that grain?
  □ Are two 1:N branches joined together? → pre-aggregate

COUNTS AND NULLS
  □ Which COUNT form, and can its column be NULL after an outer join?
  □ What does NULL mean in each aggregated column?
  □ Should an empty SUM read as 0?

FILTERS
  □ Row conditions in WHERE, aggregate conditions in HAVING?
  □ Are WHERE predicates SARGable?

PRESENTATION
  □ ORDER BY present, with a tie-breaker?
  □ Integer division avoided in averages and percentages?
  □ Subtotal rows labelled?

VERIFICATION
  □ Does the report total reconcile with a direct SUM over the source?
```

---

# Visual Representation

```text
         wrong total?
              │
   ┌──────────┼──────────────┐
too high    too low       blank / missing
   │           │               │
fan-out     inner join       NULL SUM (→ COALESCE)
join        dropped rows     no group for empty data
            SUM(DISTINCT)    (→ drive from dimension)
            WHERE vs HAVING
            COALESCE in AVG
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN        ← fan-out and dropped rows originate here
3. WHERE       ← filters that change what is summed
4. GROUP BY    ← grain, NULL groups, missing zero rows
5. HAVING      ← group filters, NULL aggregates discard groups
6. SELECT      ← SELECT list rule, COALESCE on totals, integer division
7. DISTINCT
8. ORDER BY    ← the only guarantee of order
9. LIMIT / FETCH / TOP
```

Almost every mistake in this section can be located at one step of this list—which makes the list a debugging tool as much as a teaching device.

---

# How the DBMS Executes This

```text
Debugging a wrong total, step by step

1. SELECT COUNT(*), SUM(measure) FROM source WHERE <same filters>;
      → the truth

2. Add each JOIN, one at a time, re-running COUNT(*) and SUM(measure)
      → the join that changes either number is the culprit

3. Add GROUP BY; SUM the grouped results in an outer query
      → must equal step 1 (or step 2's justified value)
```

This incremental rebuild isolates fan-out and dropped-row bugs in minutes, however complex the final query.

---

# 🔬 Engine Deep Dive

Optimizers treat aggregation queries as algebraic expressions and may reorder joins, push filters down or aggregate early—but only when the result is provably unchanged. None of these rewrites can fix a logically wrong query; they preserve its wrong answer faithfully. When a total is wrong, look at the query's logic, not its plan.

---

# 🏗️ Architecture Insight

Most of the mistakes above disappear when metric definitions live in one place. A governed layer—views, a semantic model, or a metrics store—defines "revenue", "active customer" and "order count" once, with the grain, join paths and `NULL` treatment decided by someone who checked them. Reports then select metrics instead of re-deriving them.

---

# ⚡ Performance Tip

Two of the mistakes—row filters in `HAVING` and joining before aggregating—are also the two most common performance problems in grouped queries. Fixing them for correctness or clarity usually makes the query faster as a side effect.

---

# 🌍 Production Consideration

Automate reconciliation. A scheduled check that compares key report totals against direct sums over source tables—and alerts on any difference—catches fan-out bugs introduced by schema changes long before a user notices a number that looks slightly off.

---

# SQL Standard vs Vendor Differences

| Mistake | Engines where it is silent |
|---------|---------------------------|
| Ungrouped column in `SELECT` | SQLite; MySQL with `ONLY_FULL_GROUP_BY` disabled |
| Integer `AVG` | SQL Server |
| `GROUP BY` assumed to sort | MySQL before 8.0 hid it; all engines with hash aggregation |
| Truncated string aggregation | MySQL (`GROUP_CONCAT`) |
| `NULL` skipped warning | Silent everywhere except SQL Server (`ANSI_WARNINGS`) |

> **Portability Tip:** A query that is correct on a strict engine is correct everywhere; a query that merely runs on a permissive one may not be. Test grouped queries against PostgreSQL or SQL Server semantics even when production runs on SQLite or MySQL.

---

# Best Practices

✔ Write the grain before the query.

✔ Group by keys; show names alongside them.

✔ Count the optional side's key after outer joins.

✔ Pre-aggregate every 1:N branch before joining.

✔ Decide the meaning of `NULL` per column.

✔ Store and combine additive measures; divide last.

✔ Filter rows in `WHERE`, groups in `HAVING`.

✔ Always `ORDER BY`.

✔ Reconcile totals with the source.

---

# Interview Questions

## Basic

1. Why does `COUNT(*)` return 1 for a customer with no orders after a `LEFT JOIN`?
2. Why are days with no orders missing from a daily report?
3. Why might `AVG(Quantity)` return a whole number?

## Intermediate

4. What causes a total to be higher than the source table's total?
5. Why is `SUM(DISTINCT ...)` a dangerous fix?
6. Why can't you average daily averages to get a monthly average?

## Advanced

7. Why are distinct counts not additive across time periods?
8. How would you systematically find the join that inflates a report?
9. Which aggregation mistakes are silent on SQLite but errors on PostgreSQL?

---

# Hands-on Exercises

## Exercise 1

Take a report that uses `COUNT(*)` after a `LEFT JOIN` and fix it.

---

## Exercise 2

Produce a daily order count for September 2026 that includes days with zero orders.

---

## Exercise 3

Given a table of daily order counts and revenue, compute the correct monthly average order value.

---

## Exercise 4

Apply the review checklist to a grouped query from your own work and record each finding.

---

# Related Topics

- **08.07 — The SELECT List Rule (Functional Dependency)**
- **08.09 — WHERE vs HAVING**
- **08.11 — Aggregating Across JOINs (Fan-Out and Pre-Aggregation)**
- **08.04 — NULL Handling in Aggregates**
- **07.16 — Common JOIN Mistakes & Best Practices**
- **06.13 — Common WHERE Mistakes & Best Practices**

---

# Summary

Aggregation mistakes rarely raise errors; they produce plausible wrong numbers. Totals that are too high usually come from fan-out joins; too low from dropped rows, `SUM(DISTINCT)`, misplaced filters or `COALESCE` inside `AVG`; blank or missing from `NULL` totals and groups that do not exist for empty data. Name the grain, group by keys, choose the right `COUNT`, decide what `NULL` means, combine only additive measures, filter in the right clause, always order the result, and reconcile totals with the source—the review checklist turns those habits into a routine.
