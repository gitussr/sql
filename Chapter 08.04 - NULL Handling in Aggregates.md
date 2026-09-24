---
title: "08.04 - NULL Handling in Aggregates"
description: "How every aggregate treats NULL: skipped values, NULL results on empty or all-NULL input, AVG denominators, COALESCE inside versus outside an aggregate, NULL as a grouping key, and when NULL should be treated as zero."
chapter: 8
section: 8.04
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 35 min
lastUpdated: 2026-09-24
---

# 08.04 NULL Handling in Aggregates

---

# Learning Objectives

After completing this section, you will be able to:

- State the rule every aggregate follows for `NULL` inputs.
- Predict the result of an aggregate over an all-`NULL` group.
- Explain how `NULL` changes the denominator of `AVG`.
- Choose between `COALESCE` inside and outside an aggregate.
- Explain why all `NULL` grouping values form a single group.
- Decide, from the business meaning of `NULL`, which treatment is correct.

---

# The Rule

Every aggregate except `COUNT(*)` **ignores `NULL` inputs**.

```text
Salary values in a department:  50000, NULL, 70000, NULL

COUNT(*)       4        rows
COUNT(Salary)  2        non-NULL values
SUM(Salary)    120000   50000 + 70000
AVG(Salary)    60000    120000 / 2        ← not / 4
MIN(Salary)    50000
MAX(Salary)    70000
```

This is different from arithmetic, where any `NULL` operand makes the result `NULL` (Section 05.08):

```text
50000 + NULL + 70000          →  NULL      (expression)
SUM of 50000, NULL, 70000     →  120000    (aggregate)
```

Aggregates were designed this way on purpose: a missing value is "unknown", and the aggregate summarises the values that are known.

---

# When the Result Itself is NULL

If a group contains **no non-`NULL` values**—because it is empty or because every value is `NULL`—the result is `NULL` for everything except `COUNT`.

| Group values | `COUNT(*)` | `COUNT(x)` | `SUM(x)` | `AVG(x)` | `MIN(x)` / `MAX(x)` |
|--------------|-----------|-----------|----------|----------|--------------------|
| `10, 20` | 2 | 2 | 30 | 15 | 10 / 20 |
| `10, NULL` | 2 | 1 | 10 | 10 | 10 / 10 |
| `NULL, NULL` | 2 | 0 | `NULL` | `NULL` | `NULL` |
| *(no rows)* | 0 | 0 | `NULL` | `NULL` | `NULL` |

```sql
SELECT
    d.DepartmentName,
    SUM(e.Salary) AS Payroll
FROM Departments AS d
LEFT JOIN Employees AS e
    ON e.DepartmentID = d.DepartmentID
GROUP BY d.DepartmentID, d.DepartmentName;
```

```text
DepartmentName │ Payroll
───────────────┼─────────
Engineering    │ 420000
Legal          │ NULL      ← no employees, or only contractors
```

---

# COALESCE Outside: Missing Total Means Zero

When a missing total means "nothing", convert the result:

```sql
SELECT
    d.DepartmentName,
    COALESCE(SUM(e.Salary), 0) AS Payroll
FROM Departments AS d
LEFT JOIN Employees AS e
    ON e.DepartmentID = d.DepartmentID
GROUP BY d.DepartmentID, d.DepartmentName;
```

This changes only the final `NULL` into `0`. It does not change how individual values are treated.

---

# COALESCE Inside: Missing Value Means Zero

When an individual missing value genuinely means zero, convert each input:

```sql
SELECT
    AVG(Discount)              AS AvgOfDiscountedOrders,
    AVG(COALESCE(Discount, 0)) AS AvgOverAllOrders
FROM Orders;
```

```text
Discount:  10, NULL, NULL, 30

AVG(Discount)               (10 + 30) / 2  = 20
AVG(COALESCE(Discount, 0))  (10 + 0 + 0 + 30) / 4 = 10
```

Both are "correct"—they answer different questions:

- "What is the average discount **when a discount is given**?" → `AVG(Discount)`
- "What is the average discount **per order**?" → `AVG(COALESCE(Discount, 0))`

For `SUM`, the two placements give the same total except on a group with no rows at all, where `SUM(COALESCE(x, 0))` is still `NULL` and `COALESCE(SUM(x), 0)` is `0`. For `AVG`, `COUNT`, `MIN` and `MAX`, they can differ substantially.

---

# The Meaning of NULL Decides

`NULL` has no single business meaning. Before choosing a treatment, find out what it means in that column:

| Column | `NULL` means | Correct treatment |
|--------|-------------|-------------------|
| `Orders.Discount` | No discount given | Zero: `COALESCE(Discount, 0)` |
| `Employees.Salary` | Contractor, not salaried | Exclude: `AVG(Salary)` as-is |
| `Readings.Temperature` | Sensor failed | Exclude, and report the gap |
| `Survey.Rating` | Question skipped | Exclude; report response count too |

Replacing `NULL` with zero in the wrong column is a silent data-quality bug: a failed sensor reading of "0 °C" drags every average down.

---

# AVG and Its Denominator

`AVG(x)` is exactly `SUM(x) / COUNT(x)`. Showing the denominator alongside an average is good practice whenever `x` is nullable:

```sql
SELECT
    ProductID,
    AVG(Rating)   AS AvgRating,
    COUNT(Rating) AS Ratings,
    COUNT(*)      AS Reviews
FROM Reviews
GROUP BY ProductID;
```

```text
ProductID │ AvgRating │ Ratings │ Reviews
──────────┼───────────┼─────────┼────────
7         │ 5.0       │ 1       │ 40       ← one rating among 40 reviews
```

An average of 5.0 from one value is not the same evidence as 4.6 from four hundred.

---

# NULL as a Grouping Key

`GROUP BY` treats all `NULL`s in a grouping column as **one group**—even though `NULL = NULL` is not true in a `WHERE` clause.

```sql
SELECT
    DepartmentID,
    COUNT(*) AS Employees
FROM Employees
GROUP BY DepartmentID;
```

```text
DepartmentID │ Employees
─────────────┼──────────
10           │ 12
20           │ 8
NULL         │ 3        ← all unassigned employees together
```

The standard defines grouping by "not distinct" rather than by equality, and two `NULL`s are not distinct from each other. `DISTINCT`, `UNION` and `PARTITION BY` follow the same rule.

Give the `NULL` group a readable label in the output:

```sql
SELECT
    COALESCE(d.DepartmentName, '(Unassigned)') AS Department,
    COUNT(*) AS Employees
FROM Employees AS e
LEFT JOIN Departments AS d ON d.DepartmentID = e.DepartmentID
GROUP BY d.DepartmentName;
```

Be careful not to group by the `COALESCE` result if a real department could share the label; group by the key, label in `SELECT`.

---

# NULLs Introduced by Outer Joins

An outer join creates `NULL`s that do not exist in any table. Aggregates treat them exactly like stored `NULL`s:

```sql
SELECT
    c.CustomerName,
    COUNT(o.OrderID)   AS Orders,     -- 0 for customers with none
    SUM(o.TotalAmount) AS Revenue     -- NULL for customers with none
FROM Customers AS c
LEFT JOIN Orders AS o ON o.CustomerID = c.CustomerID
GROUP BY c.CustomerID, c.CustomerName;
```

`COUNT` of the optional side gives `0`; every other aggregate gives `NULL`. That asymmetry is why reports built on outer joins almost always wrap `SUM` in `COALESCE`.

---

# Visual Representation

```text
      group                    what each aggregate sees
┌────┬──────┬────┐
│ 10 │ NULL │ 30 │     COUNT(*)  ▪ ▪ ▪          3
└────┴──────┴────┘     COUNT(x)  ▪ · ▪          2
                       SUM(x)    10 + 30        40
                       AVG(x)    40 / 2         20
                       AVG(COALESCE(x,0))
                                 (10+0+30)/3    13.33
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN        ← outer joins add NULL-extended rows
3. WHERE
4. GROUP BY    ← NULL keys form one group; aggregates skip NULL inputs
5. HAVING
6. SELECT      ← COALESCE around an aggregate is applied here
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

`COALESCE` **inside** an aggregate runs per row during step 4; `COALESCE` **outside** runs once per group in step 6. That is why the two produce different results.

---

# How the DBMS Executes This

```text
for each row in group:
    v = evaluate(x)
    if v IS NULL: skip            -- SUM, AVG, MIN, MAX, COUNT(x)
    else: update accumulator

finalise:
    if no non-NULL value seen: return NULL   -- SUM, AVG, MIN, MAX
    else: return accumulator result
```

`SUM` needs a "seen any value" flag in its state precisely so that an all-`NULL` group returns `NULL` rather than `0`.

---

# 🔬 Engine Deep Dive

SQLite provides `TOTAL(x)` alongside `SUM(x)`: it always returns a floating-point value and returns `0.0` rather than `NULL` on empty or all-`NULL` input. It exists because the standard's `NULL` result surprised so many users. Other engines expect you to write `COALESCE(SUM(x), 0)` instead, which keeps the exact numeric type.

---

# 🏗️ Architecture Insight

Many aggregation disputes are really schema disputes: a column that uses `NULL` to mean both "zero" and "unknown" cannot be aggregated correctly by anyone. When a value has a natural default—quantity discounted, number of retries—declare it `NOT NULL DEFAULT 0` and reserve `NULL` for genuinely unknown values.

---

# ⚡ Performance Tip

`COALESCE` outside an aggregate is evaluated once per group; inside, once per row. On a billion-row aggregation into ten groups, the outside form is effectively free. Put it inside only when the semantics require it.

---

# 🌍 Production Consideration

A `NULL` total reaching application code often surfaces as an exception (null reference) or as an empty cell a user reads as "no data". Decide the presentation deliberately: `COALESCE(SUM(x), 0)` when zero is true, and an explicit "no data" state when it is not.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Aggregates skip `NULL` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `SUM` of no values is `NULL` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (`TOTAL` gives `0.0`) |
| `NULL`s form one group | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Warning when `NULL`s are skipped | ✅ (warning) | ❌ | ❌ | ✅ (`ANSI_WARNINGS`) | ❌ | ❌ |

> **Portability Tip:** SQL Server reports "Warning: Null value is eliminated by an aggregate or other SET operation." That message is informational, not an error, but some client drivers surface it as an exception. It is the standard-mandated warning; other engines simply stay silent.

---

# Common Mistakes

### Mistake 1

Wrapping every aggregated column in `COALESCE(x, 0)` "for safety", changing averages and minimums.

---

### Mistake 2

Showing `SUM(...)` from an outer join without `COALESCE`, so empty groups display blank.

---

### Mistake 3

Reporting an average without its denominator when most values are `NULL`.

---

### Mistake 4

Expecting `GROUP BY` to split `NULL` keys into separate groups.

---

# Best Practices

✔ Decide what `NULL` means in each column before aggregating it.

✔ Use `COALESCE` outside the aggregate to present empty totals as zero.

✔ Use `COALESCE` inside only when each missing value truly is zero.

✔ Report `COUNT(x)` next to `AVG(x)` for nullable measures.

✔ Label the `NULL` group in output rather than leaving it blank.

---

# Interview Questions

## Basic

1. Do aggregates include `NULL` values?
2. What does `SUM` return when every value is `NULL`?
3. How many groups do three `NULL` grouping values form?

## Intermediate

4. What is the difference between `COALESCE(SUM(x), 0)` and `SUM(COALESCE(x, 0))`?
5. Why can `AVG(x)` differ from `AVG(COALESCE(x, 0))`?
6. Why does `COUNT(o.OrderID)` return 0 but `SUM(o.TotalAmount)` return `NULL` for a customer with no orders?

## Advanced

7. Why does `GROUP BY` put `NULL`s together when `NULL = NULL` is not true?
8. When is replacing `NULL` with zero a data-quality bug?
9. What state must a `SUM` accumulator keep to return `NULL` for an all-`NULL` group?

---

# Hands-on Exercises

## Exercise 1

Return payroll per department, showing `0` for departments with no salaried employees.

---

## Exercise 2

Compute the average discount per discounted order and per order, and explain the difference.

---

## Exercise 3

Count employees per department, labelling unassigned employees as `(Unassigned)`.

---

## Exercise 4

For each product, return its average rating, the number of ratings and the number of reviews.

---

# Related Topics

- **08.02 — Aggregate Functions (COUNT, SUM, AVG, MIN, MAX)**
- **08.03 — COUNT Variants**
- **05.08 — NULL Handling in SELECT**
- **06.08 — NULL Handling in WHERE (Three-Valued Logic)**
- **07.12 — NULL Handling in JOINs**

---

# Summary

Aggregates skip `NULL` inputs, and every aggregate except `COUNT` returns `NULL` when a group has no non-`NULL` values. `AVG` divides by the number of non-`NULL` values, so it differs from an average that treats `NULL` as zero. `COALESCE` outside an aggregate turns an empty result into zero; inside, it turns each missing value into zero—which is right only when the column's `NULL` genuinely means zero. `GROUP BY` places all `NULL` keys in one group, and outer joins introduce `NULL`s that aggregates treat exactly like stored ones.
