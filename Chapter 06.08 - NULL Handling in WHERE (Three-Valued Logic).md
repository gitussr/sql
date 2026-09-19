---
title: "06.08 - NULL Handling in WHERE (Three-Valued Logic)"
description: "Master NULL in SQL filters: IS NULL and IS NOT NULL, three-valued logic with TRUE, FALSE, and UNKNOWN, why rows disappear, NULL-safe comparison with IS DISTINCT FROM, COALESCE in predicates, and NULL traps in NOT, NOT IN, and optional filters."
chapter: 6
section: 6.08
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 60 min
lastUpdated: 2026-09-19
---

# 06.08 NULL Handling in WHERE (Three-Valued Logic)

---

# Learning Objectives

After completing this section, you will be able to:

- Test for missing values with `IS NULL` and `IS NOT NULL`.
- Explain SQL's three-valued logic.
- Predict how `NULL` affects comparisons, `AND`, `OR`, and `NOT`.
- Explain why rows "disappear" from filtered results.
- Use NULL-safe comparison (`IS DISTINCT FROM`).
- Use `COALESCE` in predicates responsibly.
- Avoid the most common NULL-related filtering bugs.

---

# Why This Section Matters

Section 05.08 introduced `NULL` in `SELECT` and promised a full treatment of three-valued logic in the `WHERE` chapter.

This is it.

`NULL` is responsible for more incorrect query results than any other SQL feature—not because it is complicated, but because it behaves differently from every value developers are used to.

---

# NULL Recap

`NULL` means **missing or unknown**. It is not:

- zero,
- an empty string,
- `FALSE`,
- a value at all.

Because `NULL` is unknown, SQL cannot say whether it equals anything—including another `NULL`.

---

# IS NULL

```sql
SELECT
    EmployeeName
FROM Employees
WHERE ManagerID IS NULL;
```

Returns employees with no manager.

---

# IS NOT NULL

```sql
SELECT
    CustomerName,
    Email
FROM Customers
WHERE Email IS NOT NULL;
```

Returns customers who have an email address.

`IS NULL` and `IS NOT NULL` are the **only** predicates that return TRUE or FALSE for a `NULL` value; they never return UNKNOWN.

---

# Why = NULL Does Not Work

```sql
SELECT *
FROM Employees
WHERE ManagerID = NULL;   -- always returns no rows
```

For every row:

```text
ManagerID = NULL   →   UNKNOWN
```

`WHERE` keeps only TRUE rows, so nothing is returned. The same applies to `<> NULL`, `> NULL`, and every other ordinary comparison.

---

# Three-Valued Logic

SQL predicates have three possible outcomes:

```text
TRUE        the condition holds
FALSE       the condition does not hold
UNKNOWN     the condition cannot be decided
```

UNKNOWN arises whenever a comparison involves `NULL`.

The key rule for filters:

> **`WHERE` keeps a row only if its condition is TRUE. FALSE and UNKNOWN both discard it.**

---

# Truth Tables

## AND

| AND | TRUE | FALSE | UNKNOWN |
|-----|------|-------|---------|
| **TRUE** | TRUE | FALSE | UNKNOWN |
| **FALSE** | FALSE | FALSE | FALSE |
| **UNKNOWN** | UNKNOWN | FALSE | UNKNOWN |

## OR

| OR | TRUE | FALSE | UNKNOWN |
|----|------|-------|---------|
| **TRUE** | TRUE | TRUE | TRUE |
| **FALSE** | TRUE | FALSE | UNKNOWN |
| **UNKNOWN** | TRUE | UNKNOWN | UNKNOWN |

## NOT

| A | NOT A |
|---|-------|
| TRUE | FALSE |
| FALSE | TRUE |
| UNKNOWN | UNKNOWN |

A useful way to think about UNKNOWN: "it might be TRUE or FALSE". The result is definite only when both possibilities give the same answer. `FALSE AND ?` is FALSE either way; `TRUE OR ?` is TRUE either way; everything else stays UNKNOWN.

---

# Why Rows Disappear

Employees table:

| EmployeeName | Bonus |
|--------------|-------|
| Alice | 1000 |
| Bob | NULL |
| Carol | 0 |

```sql
SELECT EmployeeName FROM Employees WHERE Bonus > 500;
```

| Row | `Bonus > 500` | Kept? |
|-----|---------------|-------|
| Alice | TRUE | ✅ |
| Bob | UNKNOWN | ❌ |
| Carol | FALSE | ❌ |

```sql
SELECT EmployeeName FROM Employees WHERE NOT (Bonus > 500);
```

| Row | `NOT (Bonus > 500)` | Kept? |
|-----|---------------------|-------|
| Alice | FALSE | ❌ |
| Bob | UNKNOWN | ❌ |
| Carol | TRUE | ✅ |

Bob appears in **neither** result.

The two queries together do **not** return every row. This surprises developers who expect a condition and its negation to partition the table.

---

# The Partition Rule

For any predicate `P` on a nullable column:

```text
rows where P is TRUE
+ rows where P is FALSE
+ rows where P is UNKNOWN
= all rows
```

To include the UNKNOWN rows explicitly:

```sql
SELECT EmployeeName
FROM Employees
WHERE NOT (Bonus > 500)
   OR Bonus IS NULL;
```

---

# NULL with AND and OR

```sql
WHERE Country = 'India'
  AND Bonus > 500
```

For an Indian employee with `Bonus = NULL`:

```text
TRUE AND UNKNOWN   →   UNKNOWN   →   discarded
```

```sql
WHERE Country = 'India'
   OR Bonus > 500
```

For the same employee:

```text
TRUE OR UNKNOWN    →   TRUE      →   kept
```

`OR` can rescue a row when another branch is TRUE; `AND` cannot.

---

# NULL and NOT IN

The most dangerous consequence of three-valued logic (see Section 06.06):

```sql
WHERE CategoryID NOT IN (4, 7, NULL)
```

expands to:

```text
CategoryID <> 4 AND CategoryID <> 7 AND CategoryID <> NULL
                                          └──── UNKNOWN
```

The whole condition can never be TRUE, so **no rows are returned**. Use `NOT EXISTS` for subqueries.

---

# NULL-Safe Comparison

Sometimes you want `NULL` to be treated as a comparable value—for example, when detecting changes between two versions of a row.

Ordinary comparison:

```sql
WHERE OldEmail <> NewEmail
```

misses changes from `NULL` to a value, and from a value to `NULL`.

The SQL standard provides `IS DISTINCT FROM`:

```sql
WHERE OldEmail IS DISTINCT FROM NewEmail
```

| OldEmail | NewEmail | `<>` | `IS DISTINCT FROM` |
|----------|----------|------|--------------------|
| a@x.com | a@x.com | FALSE | FALSE |
| a@x.com | b@x.com | TRUE | TRUE |
| NULL | a@x.com | UNKNOWN | TRUE |
| NULL | NULL | UNKNOWN | FALSE |

`IS NOT DISTINCT FROM` is the NULL-safe equivalent of `=`.

Vendor alternatives:

```sql
-- MySQL: NULL-safe equality
WHERE OldEmail <=> NewEmail
```

```sql
-- SQLite: IS / IS NOT act as NULL-safe comparison
WHERE OldEmail IS NOT NewEmail
```

```sql
-- Portable fallback for "is different"
WHERE OldEmail <> NewEmail
   OR (OldEmail IS NULL AND NewEmail IS NOT NULL)
   OR (OldEmail IS NOT NULL AND NewEmail IS NULL)
```

---

# COALESCE in Predicates

`COALESCE` replaces `NULL` with a default value:

```sql
WHERE COALESCE(Bonus, 0) > 500
```

This treats a missing bonus as zero. It is valid, but it has two costs:

1. **Meaning changes.** "Unknown bonus" becomes "zero bonus". Make sure that is the business rule.
2. **Performance changes.** Wrapping the column in a function usually prevents index use (Section 06.12).

Often the intent is clearer without `COALESCE`:

```sql
WHERE Bonus > 500               -- NULLs excluded, deliberately
```

```sql
WHERE Bonus <= 500
   OR Bonus IS NULL             -- NULLs included, deliberately
```

---

# Optional Filter Parameters

Search screens often have optional filters. A common pattern:

```sql
SELECT *
FROM Orders
WHERE (? IS NULL OR Status = ?);
```

If the parameter is `NULL`, the first branch is TRUE and every row passes; otherwise only matching rows pass.

This is logically correct, but a single cached plan must serve both cases, which can lead to poor performance on large tables. Alternatives include building the SQL conditionally (with parameters), or database-specific options such as recompiling the statement.

---

# NULL and Empty Strings

In most databases, `''` (empty string) and `NULL` are different:

```sql
WHERE MiddleName = ''        -- empty string
WHERE MiddleName IS NULL     -- missing
```

**Oracle is the exception**: it treats `''` as `NULL` for `VARCHAR2`. In Oracle, `WHERE MiddleName = ''` never returns rows, and `WHERE MiddleName IS NULL` returns both.

---

# NULL in CHECK Constraints vs WHERE

A final subtlety: `WHERE` and `CHECK` treat UNKNOWN differently.

| Context | Accepts UNKNOWN? |
|---------|------------------|
| `WHERE`, `HAVING`, `JOIN ... ON` | ❌ Row discarded |
| `CHECK` constraint | ✅ Row allowed |

```sql
CHECK (Discount >= 0)
```

allows `Discount = NULL`, because the check result is UNKNOWN, not FALSE. Add `NOT NULL` if missing values should be rejected.

---

# Visual Representation

```text
               WHERE Bonus > 500

All rows ──►  ┌──────────────┬──────────────┬──────────────┐
              │    TRUE      │    FALSE     │   UNKNOWN    │
              │  (returned)  │ (discarded)  │ (discarded)  │
              └──────────────┴──────────────┴──────────────┘

           WHERE NOT (Bonus > 500)

All rows ──►  ┌──────────────┬──────────────┬──────────────┐
              │    FALSE     │    TRUE      │   UNKNOWN    │
              │ (discarded)  │  (returned)  │ (discarded)  │
              └──────────────┴──────────────┴──────────────┘

         The UNKNOWN rows are never returned by either query.
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN      ← ON conditions also discard UNKNOWN
3. WHERE     ← UNKNOWN rows are discarded here
4. GROUP BY
5. HAVING    ← and here, for groups
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

Three-valued logic applies at every filtering step, not only in `WHERE`.

---

# How the DBMS Executes This

```text
WHERE ManagerID IS NULL

↓

Does an index include NULL entries?

├── PostgreSQL, SQL Server, MySQL, SQLite:
│   B-tree indexes store NULLs → index seek possible
│
└── Oracle:
    single-column B-tree indexes do NOT store all-NULL keys
    → full scan unless a composite or function-based index is used

↓

Return rows where the predicate is TRUE
```

---

# 🔬 Engine Deep Dive

Internally, many engines represent a Boolean predicate result with three states and store a separate **null bitmap** for each row:

```text
Row header
┌──────────────────────────────────┐
│ null bitmap: 0 1 0 0             │  ← bit set = column is NULL
├──────────────────────────────────┤
│ EmployeeID │ ManagerID │ ...     │
│    17      │  (no data)│         │
└──────────────────────────────────┘
```

Evaluating `ManagerID IS NULL` is a bitmap check. Evaluating `ManagerID = 5` first checks the bitmap: if the bit is set, the result is UNKNOWN without reading the value at all.

---

# 🏗️ Architecture Insight

Three-valued logic is a consequence of allowing `NULL` in the schema. Every nullable column adds a third outcome to every predicate that touches it. Deciding which columns may be `NULL`—and declaring `NOT NULL` wherever a value is always required—is therefore not only a data-quality decision but also a query-correctness decision.

---

# ⚡ Performance Tip

Filtering on `IS NULL` can be fast in most databases because B-tree indexes store `NULL` entries. In Oracle, index `NULL`-heavy columns with a composite index (for example, `(ManagerID, 0)`) or a function-based index. Partial indexes such as PostgreSQL's `WHERE ShippedDate IS NULL` are ideal for small "pending" subsets.

---

# 🔒 Security Note

Access filters that compare nullable columns can fail open or closed unexpectedly. A predicate such as `WHERE OwnerID <> @CurrentUser` does not return rows where `OwnerID` is `NULL`, while `NOT (OwnerID = @CurrentUser)` has the same blind spot. Security predicates should be written and tested explicitly for `NULL` values.

---

# 🌍 Production Consideration

Reports built on filters such as `Status <> 'Closed'` silently exclude rows with a `NULL` status, so totals disagree with the underlying table. When reconciling reports, always check how many rows fall into the UNKNOWN category.

---

# 🚀 Enterprise Practice

Mature data models minimize nullable columns, use explicit status values instead of `NULL` where a state is known (for example, `'Unassigned'`), and document the meaning of `NULL` for every nullable column so that filters can be written deliberately.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `IS NULL` / `IS NOT NULL` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `IS [NOT] DISTINCT FROM` | ✅ | ✅ | ❌ | ✅ (2022+) | ❌ | ✅ (3.39+) |
| Other NULL-safe equality | — | — | `<=>` | — | `DECODE(a, b, 1, 0) = 1` | `IS` / `IS NOT` |
| `''` treated as `NULL` | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `NULL` stored in B-tree indexes | Implementation-defined | ✅ | ✅ | ✅ | Not for all-NULL keys | ✅ |
| `SET ANSI_NULLS OFF` (`= NULL` matches) | ❌ | ❌ | ❌ | Deprecated option | ❌ | ❌ |

> **Portability Tip:** Use `IS NULL` / `IS NOT NULL` for missing values and write NULL-safe comparisons explicitly when your target database lacks `IS DISTINCT FROM`. Never rely on SQL Server's deprecated `ANSI_NULLS OFF` behavior.

---

# Common Mistakes

### Mistake 1

Writing `= NULL` or `<> NULL`.

---

### Mistake 2

Expecting `WHERE P` and `WHERE NOT P` together to return all rows.

---

### Mistake 3

Using `NOT IN` with a subquery that can return `NULL`.

---

### Mistake 4

Using `COALESCE(column, default)` in `WHERE` without considering the change in meaning and the loss of index use.

---

### Mistake 5

Comparing two nullable columns with `<>` to detect changes.

---

### Mistake 6

Assuming `CHECK` constraints reject `NULL` values.

---

# Best Practices

✔ Use `IS NULL` and `IS NOT NULL` for missing values.

✔ Decide explicitly whether each filter should include `NULL` rows.

✔ Use `NOT EXISTS` instead of `NOT IN` for subqueries.

✔ Use `IS DISTINCT FROM` (or an equivalent) for NULL-safe comparison.

✔ Declare `NOT NULL` on columns that must always have a value.

✔ Test filters with rows that contain `NULL`.

---

# 💡 Did You Know?

E. F. Codd, the inventor of the relational model, later proposed **four**-valued logic that distinguished "missing but applicable" from "missing and inapplicable". SQL adopted a single `NULL` and three-valued logic instead—a simpler design that is the source of most of the surprises in this section.

---

# Interview Questions

## Basic

1. Why does `WHERE Column = NULL` return no rows?
2. What are the three possible results of a SQL predicate?
3. Which rows does `WHERE` keep?

## Intermediate

4. What is `TRUE AND UNKNOWN`? What is `FALSE AND UNKNOWN`?
5. Why don't `WHERE P` and `WHERE NOT P` together return every row?
6. What does `IS DISTINCT FROM` do, and when do you need it?

## Advanced

7. Explain step by step why `NOT IN` with a `NULL` returns no rows.
8. Why do `CHECK` constraints accept rows that `WHERE` would reject?
9. How does Oracle's handling of `NULL` and empty strings affect filters?

---

# Hands-on Exercises

## Exercise 1

Return all orders that have not been shipped (`ShippedDate` is missing).

---

## Exercise 2

Return employees whose bonus is not greater than 1000, **including** employees with no bonus recorded.

---

## Exercise 3

Given `CustomersStaging` and `Customers` tables with the same columns, return customers whose `Phone` changed—including changes to and from `NULL`.

---

## Exercise 4

Predict the number of rows each query returns, given `Bonus` values `(1000, NULL, 0, 700)`:

```sql
SELECT * FROM Employees WHERE Bonus > 500;
SELECT * FROM Employees WHERE NOT (Bonus > 500);
SELECT * FROM Employees WHERE Bonus > 500 OR Bonus <= 500;
```

---

# Related Topics

- **05.08 — NULL Handling in SELECT**
- **06.03 — Comparison Operators**
- **06.04 — Logical Operators (AND, OR, NOT)**
- **06.06 — IN and NOT IN**
- **06.10 — EXISTS and Subqueries in WHERE (Introduction)**
- **06.12 — SARGability and Index-Friendly Predicates**

---

# Summary

`NULL` represents a missing or unknown value, and any ordinary comparison with it produces UNKNOWN. SQL's three-valued logic defines how UNKNOWN combines with `AND`, `OR`, and `NOT`, and `WHERE` keeps only rows whose condition is TRUE—so rows with `NULL` silently disappear from both a filter and its negation. `IS NULL`, `IS NOT NULL`, and `IS DISTINCT FROM` handle missing values explicitly, `NOT EXISTS` avoids the `NOT IN` trap, and careful schema design with `NOT NULL` constraints reduces the number of places where UNKNOWN can arise at all.
