---
title: "11.08 - FIRST_VALUE, LAST_VALUE and NTH_VALUE"
description: "Value window functions: FIRST_VALUE, LAST_VALUE and NTH_VALUE, their dependence on the frame, the LAST_VALUE default-frame trap, first and latest values per partition, comparing with the first or best row, FROM FIRST/LAST, IGNORE NULLS, and alternatives with MIN/MAX and ROW_NUMBER."
chapter: 11
section: 11.08
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 30 min
lastUpdated: 2026-09-25
---

# 11.08 FIRST_VALUE, LAST_VALUE and NTH_VALUE

---

# Learning Objectives

After completing this section, you will be able to:

- Return the first, last or n-th value of a window with value functions.
- Explain why value functions depend on the frame.
- Avoid the `LAST_VALUE` default-frame trap.
- Attach the first, latest or best row's attributes to every row.
- Choose between value functions, `MIN`/`MAX` and `ROW_NUMBER` filtering.

---

# The Three Value Functions

```sql
FIRST_VALUE(expression)  OVER (… ORDER BY … [frame])
LAST_VALUE(expression)   OVER (… ORDER BY … [frame])
NTH_VALUE(expression, n) OVER (… ORDER BY … [frame])
```

Each returns `expression` evaluated on a particular row **of the current frame**:

- `FIRST_VALUE` — the first row of the frame.
- `LAST_VALUE` — the last row of the frame.
- `NTH_VALUE(…, n)` — the n-th row of the frame (`NULL` if the frame has fewer than n rows).

Unlike `MIN` and `MAX`, they can return a column **other than** the one that determines the order—"the product name of the cheapest product", not just the cheapest price.

---

# FIRST_VALUE

```sql
-- Each employee with the name of the highest-paid person in the department
SELECT
    DepartmentID,
    EmployeeName,
    Salary,
    FIRST_VALUE(EmployeeName) OVER (PARTITION BY DepartmentID
                                    ORDER BY Salary DESC, EmployeeID) AS TopEarner
FROM Employees
WHERE Salary IS NOT NULL;
```

`FIRST_VALUE` works as expected with the default frame, because the default frame always starts at the beginning of the partition.

---

# The LAST_VALUE Trap

```sql
-- ❌ Intended: the most recent order date of the customer
SELECT OrderID, CustomerID, OrderDate,
       LAST_VALUE(OrderDate) OVER (PARTITION BY CustomerID ORDER BY OrderDate) AS LastOrderDate
FROM Orders;
```

```text
┌─────┬──────┬────────────┬───────────────┐
│ Ord │ Cust │ OrderDate  │ LastOrderDate │
├─────┼──────┼────────────┼───────────────┤
│ 101 │ 1    │ 2026-01-03 │ 2026-01-03    │  ← expected 2026-02-11
│ 102 │ 1    │ 2026-02-11 │ 2026-02-11    │
└─────┴──────┴────────────┴───────────────┘
```

The default frame with `ORDER BY` ends at the **current row** (and its peers). So the "last row of the frame" is the current row. Extend the frame to the end of the partition:

```sql
-- ✅
LAST_VALUE(OrderDate) OVER (PARTITION BY CustomerID
                            ORDER BY OrderDate, OrderID
                            ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
```

Or avoid `LAST_VALUE` altogether by reversing the order:

```sql
-- ✅ Same result, no frame needed
FIRST_VALUE(OrderDate) OVER (PARTITION BY CustomerID ORDER BY OrderDate DESC, OrderID DESC)
```

The reversed `FIRST_VALUE` is the most common idiom in practice.

---

# NTH_VALUE

```sql
-- Second-highest salary in each department, on every row
SELECT
    DepartmentID,
    EmployeeName,
    Salary,
    NTH_VALUE(Salary, 2) OVER (PARTITION BY DepartmentID
                               ORDER BY Salary DESC
                               ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS SecondHighest
FROM Employees
WHERE Salary IS NOT NULL;
```

`NTH_VALUE` counts **rows**, not distinct values: with two employees tied at the top, the second row's salary equals the first. For the second-highest distinct value use `DENSE_RANK` (Section 11.03).

The standard also allows `FROM LAST` (count from the end of the frame); Oracle supports it, others generally do not. SQL Server does not support `NTH_VALUE` at all.

---

# Attaching the First Row's Attributes

Value functions shine when you need several attributes of a specific row:

```sql
-- Each order with the date and amount of the customer's first order
SELECT
    o.OrderID,
    o.CustomerID,
    o.OrderDate,
    FIRST_VALUE(o.OrderDate)   OVER w AS FirstOrderDate,
    FIRST_VALUE(o.TotalAmount) OVER w AS FirstOrderAmount,
    FIRST_VALUE(o.OrderID)     OVER w AS FirstOrderID
FROM Orders AS o
WINDOW w AS (PARTITION BY o.CustomerID ORDER BY o.OrderDate, o.OrderID);
```

(The `WINDOW` clause is covered in Section 11.11; on engines without it, repeat the `OVER (…)` definition.)

Cohort analysis builds on exactly this: `FIRST_VALUE(OrderDate)` gives each customer's acquisition date, and every later order can be expressed as "months since first order".

---

# Value Functions vs MIN / MAX

| Need | Use |
|------|-----|
| The earliest date | `MIN(OrderDate) OVER (PARTITION BY …)` |
| The largest amount | `MAX(TotalAmount) OVER (PARTITION BY …)` |
| The **amount** of the earliest order | `FIRST_VALUE(TotalAmount) OVER (… ORDER BY OrderDate, OrderID)` |
| The **name** of the top earner | `FIRST_VALUE(EmployeeName) OVER (… ORDER BY Salary DESC, EmployeeID)` |

`MIN`/`MAX` return the extreme value of the ordered column itself and need no ordering; value functions return any column of the row found by the ordering.

---

# Value Functions vs Filtering with ROW_NUMBER

```sql
-- Only the first order row per customer
SELECT * FROM (
    SELECT o.*, ROW_NUMBER() OVER (PARTITION BY CustomerID ORDER BY OrderDate, OrderID) AS rn
    FROM Orders AS o
) AS t
WHERE rn = 1;

-- Every order row, with the first order's date attached
SELECT o.*, FIRST_VALUE(OrderDate) OVER (PARTITION BY CustomerID ORDER BY OrderDate, OrderID)
FROM Orders AS o;
```

`ROW_NUMBER` + filter **selects** the row; `FIRST_VALUE` **annotates** every row with it.

---

# Visual Representation

```text
Partition ordered by OrderDate:   r1   r2   r3   r4   r5
                                                ●             current row r3

Default frame (start → current):  [r1   r2   r3]
    FIRST_VALUE = r1   LAST_VALUE = r3  ← trap   NTH_VALUE(…,4) = NULL

Full frame (UNBOUNDED both ways): [r1   r2   r3   r4   r5]
    FIRST_VALUE = r1   LAST_VALUE = r5           NTH_VALUE(…,4) = r4
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE       ← e.g. remove NULL salaries so they are not "first"
4. GROUP BY
5. HAVING
6. WINDOW      ← value functions read rows of the current frame here
7. SELECT
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
FIRST_VALUE(x) OVER (PARTITION BY p ORDER BY o)
    remember x of the first row in each partition; emit it for every row (streaming)

LAST_VALUE(x) OVER (… ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
    must read to the end of the partition before emitting its first row (buffering)

FIRST_VALUE(x) OVER (… ORDER BY o DESC)
    streaming again — the reversed-order idiom avoids buffering
```

---

# 🔬 Engine Deep Dive

Frames that extend to `UNBOUNDED FOLLOWING` force the window operator to buffer each partition completely before producing output, because the last row is not known until the partition ends. The reversed `FIRST_VALUE` form lets the engine emit rows as they stream in. On large partitions the difference is noticeable in memory use and in time to first row.

---

# 🏗️ Architecture Insight

Value functions implement "as of the first/last event" attributes—acquisition channel, first product bought, latest status—that are otherwise stored redundantly on parent rows and kept in sync with triggers or application code. Deriving them with windows keeps the event table the single source of truth.

---

# ⚡ Performance Tip

Prefer `FIRST_VALUE` with a reversed order over `LAST_VALUE` with an unbounded-following frame. It returns the same value, streams instead of buffering, and cannot fall into the default-frame trap.

---

# 🔒 Security Note

`FIRST_VALUE(EmployeeName) … ORDER BY Salary DESC` publishes who the top earner is to everyone who sees the report. Value functions make it easy to attach another person's attributes to each row; review them with the same care as a join to that person's record.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `FIRST_VALUE` / `LAST_VALUE` | ✅ | ✅ | ✅ | ✅ (2012+) | ✅ | ✅ |
| `NTH_VALUE` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `FROM FIRST` / `FROM LAST` | ✅ | ❌ | `FROM FIRST` only | ❌ | ✅ | ❌ |
| `IGNORE NULLS` | ✅ | ❌ | ❌ | ✅ (2022+) | ✅ | ❌ |

> **Portability Tip:** `FIRST_VALUE` with an explicit, unique `ORDER BY` is the portable choice. Replace `LAST_VALUE` with a reversed `FIRST_VALUE`, and `NTH_VALUE` with `ROW_NUMBER` filtering where SQL Server must be supported.

---

# Common Mistakes

### Mistake 1

`LAST_VALUE` with the default frame, returning the current row.

---

### Mistake 2

Non-unique `ORDER BY`, so the "first" row among ties is arbitrary.

---

### Mistake 3

Expecting `NTH_VALUE(x, 2)` to return the second **distinct** value.

---

### Mistake 4

Letting `NULL` values sort first and become the `FIRST_VALUE`.

---

# Best Practices

✔ Use reversed `FIRST_VALUE` instead of `LAST_VALUE`.

✔ Write the full frame whenever `LAST_VALUE` or `NTH_VALUE` must see the whole partition.

✔ Order uniquely.

✔ Filter or order `NULL`s explicitly.

✔ Use `MIN`/`MAX` for the extreme value itself; value functions for other columns of that row.

---

# Interview Questions

## Basic

1. What does `FIRST_VALUE` return?
2. Why does `LAST_VALUE(x) OVER (ORDER BY d)` often return the current row's value?
3. How do you fix it?

## Intermediate

4. How is `FIRST_VALUE(Name) OVER (ORDER BY Salary DESC)` different from `MAX(Salary) OVER ()`?
5. What does `NTH_VALUE(x, 2)` return when the first two rows tie?
6. When would you use `ROW_NUMBER` filtering instead of `FIRST_VALUE`?

## Advanced

7. Why does an unbounded-following frame require buffering?
8. How would you compute each customer's acquisition month for cohort analysis?
9. How do you emulate `NTH_VALUE` on SQL Server?

---

# Hands-on Exercises

## Exercise 1

Show every order with the amount of the customer's first and most recent order.

---

## Exercise 2

Show each product with the name of the cheapest product in its category.

---

## Exercise 3

Demonstrate the `LAST_VALUE` trap and fix it in two ways.

---

## Exercise 4

Compute each customer's first order month and, for every order, the number of months since then.

---

# Related Topics

- **11.03 — Ranking Functions (ROW_NUMBER, RANK, DENSE_RANK, NTILE)**
- **11.05 — Window Frames (ROWS, RANGE and GROUPS)**
- **11.07 — LAG and LEAD**
- **11.11 — Named Windows and the WINDOW Clause**
- **11.13 — NULL Handling in Window Functions**

---

# Summary

`FIRST_VALUE`, `LAST_VALUE` and `NTH_VALUE` return an expression evaluated on the first, last or n-th row of the current frame, so they can attach any attribute of the first, latest or best row to every row. Because the default frame ends at the current row, `LAST_VALUE` needs an explicit `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING` frame—or, better, a `FIRST_VALUE` with reversed order, which also streams without buffering. `NTH_VALUE` counts rows rather than distinct values and is missing on SQL Server. Order uniquely and handle `NULL`s so the chosen row is deterministic.
