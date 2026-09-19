---
title: "06.14 - WHERE Cheat Sheet & Visual Knowledge Map"
description: "A compact reference for the SQL WHERE clause: syntax, operators, precedence, NULL truth tables, range, list and pattern predicates, SARGable rewrites, vendor differences, and a visual map connecting every Chapter 06 concept."
chapter: 6
section: 6.14
category: Data Query Language (DQL)
difficulty: Beginner → Advanced
readingTime: 30 min
lastUpdated: 2026-09-19
---

# 06.14 WHERE Cheat Sheet & Visual Knowledge Map

---

# Learning Objectives

After completing this section, you will be able to:

- Recall `WHERE` syntax and every predicate type at a glance.
- Apply precedence and three-valued logic rules quickly.
- Choose the right predicate for a filtering task.
- Rewrite common non-SARGable predicates.
- See how every Chapter 06 topic connects.

---

# Syntax at a Glance

```sql
SELECT      column_list
FROM        table_name
WHERE       search_condition
GROUP BY    ...
HAVING      ...
ORDER BY    ...;
```

```sql
UPDATE table_name SET ... WHERE search_condition;
DELETE FROM table_name WHERE search_condition;
```

A row is kept only when `search_condition` is **TRUE**.

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE   ← Row filtering happens here
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

- No `SELECT` aliases in `WHERE`.
- No aggregates in `WHERE` (use `HAVING`).

---

# Predicate Quick Reference

| Need | Predicate | Section |
|------|-----------|---------|
| Exact match | `col = value` | 06.03 |
| Not equal | `col <> value` | 06.03 |
| Ordering | `col < v`, `>`, `<=`, `>=` | 06.03 |
| Inclusive range | `col BETWEEN low AND high` | 06.05 |
| Half-open range | `col >= start AND col < end` | 06.05 |
| One of a list | `col IN (a, b, c)` | 06.06 |
| None of a list | `col NOT IN (a, b, c)` (no `NULL`s!) | 06.06 |
| Prefix | `col LIKE 'abc%'` | 06.07 |
| Contains | `col LIKE '%abc%'` (slow at scale) | 06.07 |
| Missing value | `col IS NULL` | 06.08 |
| Present value | `col IS NOT NULL` | 06.08 |
| NULL-safe equality | `a IS NOT DISTINCT FROM b` | 06.08 |
| Related rows exist | `EXISTS (subquery)` | 06.10 |
| No related rows | `NOT EXISTS (subquery)` | 06.10 |
| Compare with computed value | `col > (SELECT AVG(...) ...)` | 06.10 |

---

# Operator Precedence

```text
Highest
  1.  *  /  %
  2.  +  -
  3.  =  <>  <  >  <=  >=  LIKE  IN  BETWEEN  IS
  4.  NOT
  5.  AND
  6.  OR
Lowest
```

> **Remember:** `AND` before `OR`. Parenthesize every `OR` group.

---

# Three-Valued Logic

| AND | TRUE | FALSE | UNKNOWN |
|-----|------|-------|---------|
| **TRUE** | TRUE | FALSE | UNKNOWN |
| **FALSE** | FALSE | FALSE | FALSE |
| **UNKNOWN** | UNKNOWN | FALSE | UNKNOWN |

| OR | TRUE | FALSE | UNKNOWN |
|----|------|-------|---------|
| **TRUE** | TRUE | TRUE | TRUE |
| **FALSE** | TRUE | FALSE | UNKNOWN |
| **UNKNOWN** | TRUE | UNKNOWN | UNKNOWN |

| A | NOT A |
|---|-------|
| TRUE | FALSE |
| FALSE | TRUE |
| UNKNOWN | UNKNOWN |

```text
x = NULL            → UNKNOWN   (use IS NULL)
x NOT IN (1, NULL)  → never TRUE
EXISTS (...)        → never UNKNOWN
```

---

# LIKE Wildcards

| Pattern | Matches |
|---------|---------|
| `'abc%'` | starts with `abc` |
| `'%abc'` | ends with `abc` |
| `'%abc%'` | contains `abc` |
| `'a_c'` | `a` + any one character + `c` |
| `'50\%%' ESCAPE '\'` | starts with the literal `50%` |

---

# Date Filtering Patterns

```sql
-- One day (date-time column)
WHERE CreatedAt >= TIMESTAMP '2026-03-15 00:00:00'
  AND CreatedAt <  TIMESTAMP '2026-03-16 00:00:00'
```

```sql
-- One month
WHERE OrderDate >= DATE '2026-03-01'
  AND OrderDate <  DATE '2026-04-01'
```

```sql
-- One year
WHERE OrderDate >= DATE '2026-01-01'
  AND OrderDate <  DATE '2027-01-01'
```

---

# SARGable Rewrites

| Instead of | Write |
|------------|-------|
| `YEAR(d) = 2026` | `d >= '2026-01-01' AND d < '2027-01-01'` |
| `CAST(ts AS DATE) = '2026-03-15'` | `ts >= '2026-03-15' AND ts < '2026-03-16'` |
| `price * 1.18 > 1000` | `price > 1000 / 1.18` |
| `LEFT(code, 3) = 'ABC'` | `code LIKE 'ABC%'` |
| `UPPER(email) = 'A@X.COM'` | case-insensitive collation or expression index |
| `varchar_col = 123` | `varchar_col = '123'` |
| `COALESCE(s, 'New') = 'New'` | `s = 'New' OR s IS NULL` |
| `a = 1 OR a = 2 OR a = 3` | `a IN (1, 2, 3)` |
| `NOT IN (subquery)` | `NOT EXISTS (correlated subquery)` |

---

# Composite Index Rule

```text
Index (A, B, C)

WHERE A = ?                      ✅ seek
WHERE A = ? AND B = ?            ✅ seek
WHERE A = ? AND B > ?            ✅ seek + range
WHERE A = ? AND B > ? AND C = ?  ✅ seek + range, C as filter
WHERE B = ?                      ❌ no leading column
WHERE C = ?                      ❌ no leading column

Equality columns first, then the range column.
```

---

# Choosing a Predicate

```text
What are you filtering on?
    │
    ├── A single value ..................... =
    ├── Several specific values ............ IN
    ├── A range of numbers or dates ........ >= AND <  (or BETWEEN for whole values)
    ├── A text prefix ...................... LIKE 'abc%'
    ├── Text anywhere ...................... full-text / trigram index
    ├── A missing value .................... IS NULL
    ├── Two nullable values differing ...... IS DISTINCT FROM
    ├── Existence of related rows .......... EXISTS
    └── Absence of related rows ............ NOT EXISTS
```

---

# Visual Knowledge Map

```text
                              ┌──────────────────────┐
                              │  06 — WHERE Clause   │
                              └──────────┬───────────┘
                                         │
        ┌────────────────────┬───────────┼────────────┬─────────────────────┐
        │                    │           │            │                     │
  ┌─────▼─────┐      ┌───────▼──────┐ ┌──▼────────┐ ┌─▼──────────────┐ ┌────▼─────────┐
  │ Basics    │      │ Predicates   │ │ Logic     │ │ Subqueries     │ │ Performance  │
  │ 06.01     │      │ 06.03 Compare│ │ 06.04     │ │ 06.10          │ │ 06.11 Flow   │
  │ 06.02     │      │ 06.05 BETWEEN│ │ AND OR NOT│ │ EXISTS, IN     │ │ 06.12 SARG   │
  │ Syntax    │      │ 06.06 IN     │ │ 06.08     │ │ semi/anti-join │ │ Indexes      │
  └───────────┘      │ 06.07 LIKE   │ │ NULL, 3VL │ └────────────────┘ │ Plans        │
                     │ 06.09 Exprs  │ └───────────┘                    └──────────────┘
                     └──────────────┘
                                         │
                              ┌──────────▼───────────┐
                              │ 06.13 Mistakes &     │
                              │ Best Practices       │
                              └──────────────────────┘
```

---

# Concept Chain

```text
FROM produces rows
        │
        ▼
WHERE evaluates a predicate per row
        │
        ▼
Predicate result: TRUE / FALSE / UNKNOWN
        │
        ▼
Only TRUE rows continue
        │
        ▼
Optimizer turns SARGable predicates into index access
        │
        ▼
Fewer rows read → faster GROUP BY, SELECT, ORDER BY
```

---

# How the DBMS Executes This

```text
Parse → Bind → Normalize → Estimate selectivity → Plan → Execute

Plan decides for each predicate:
    Access predicate   → navigates an index (reads less)
    Filter predicate   → checked after reading (returns less)
```

---

# 🏗️ Architecture Insight

Every topic in this chapter comes back to one idea: a `WHERE` clause is a set of predicates that the engine is free to evaluate in the cheapest way that preserves their meaning. Correct meaning is your responsibility (NULLs, precedence, ranges); cheap evaluation is the optimizer's—if you give it SARGable predicates and suitable indexes.

---

# ⚡ Performance Tip

Three habits fix most slow filters: keep indexed columns bare, match data types, and use half-open ranges. Verify with the execution plan.

---

# 🔒 Security Note

Every value in a `WHERE` clause that comes from outside the database must be a parameter. No exceptions.

---

# 🌍 Production Consideration

Before running any `UPDATE` or `DELETE`, run its `WHERE` clause as a `SELECT COUNT(*)`, execute the change in a transaction, and compare row counts before committing.

---

# 🚀 Enterprise Practice

Turn this cheat sheet into automated checks: SQL linting for `= NULL`, unparenthesized `OR`, `NOT IN (subquery)`, functions on indexed columns, and missing `WHERE` clauses in data-modifying statements.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Not equal | `<>` | `<>`, `!=` | `<>`, `!=` | `<>`, `!=` | `<>`, `!=` | `<>`, `!=` |
| Case-insensitive `LIKE` | Collation | `ILIKE` | Default collations | Collation | ❌ | ASCII default |
| NULL-safe equality | `IS NOT DISTINCT FROM` | ✅ | `<=>` | ✅ (2022+) | ❌ | ✅ (3.39+), `IS` |
| Regular expressions | `SIMILAR TO`, `LIKE_REGEX` | `~` | `REGEXP_LIKE` | `REGEXP_LIKE` (2025+) | `REGEXP_LIKE` | Extension |
| `''` equals `NULL` | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Alias in `WHERE` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Date literal `DATE '...'` | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Expression indexes | — | ✅ | ✅ | Computed columns | ✅ | ✅ |
| Partial indexes | — | ✅ | ❌ | Filtered | ❌ | ✅ |

> **Portability Tip:** Portable `WHERE` clauses use `<>`, single-quoted strings, ISO dates, explicit `ESCAPE`, `IS NULL`, `NOT EXISTS`, and half-open ranges.

---

# Common Mistakes

- `= NULL` instead of `IS NULL`
- `AND`/`OR` without parentheses
- `NOT IN` with `NULL`s
- `BETWEEN` on date-times
- Functions or arithmetic on indexed columns
- Implicit type conversions
- Unescaped `_` or `%` in `LIKE`
- `UPDATE`/`DELETE` without a verified `WHERE`

---

# Best Practices

✔ Keep a row TRUE-only mindset: FALSE and UNKNOWN both remove rows.

✔ Parenthesize `OR`, prefer `IN` for lists, `NOT EXISTS` for absence.

✔ Use half-open ranges for all date-time filters.

✔ Keep columns bare and types matched.

✔ Parameterize everything external.

✔ Read the plan for every important filter.

---

# Interview Questions

## Basic

1. Which rows does `WHERE` return?
2. What is the precedence of `AND` versus `OR`?
3. Which predicate tests for a missing value?

## Intermediate

4. When would you use `EXISTS` instead of `IN`?
5. What is a half-open range, and why is it preferred for dates?
6. What does SARGable mean?

## Advanced

7. Explain three-valued logic with an example where a row disappears from both a filter and its negation.
8. Design a composite index for `WHERE TenantID = ? AND Status = ? AND CreatedAt >= ?`.
9. Walk through how an optimizer evaluates a `WHERE` clause from parsing to execution.

---

# Hands-on Exercises

## Exercise 1

Without looking back, write the SARGable form of: `WHERE YEAR(HireDate) = 2025 AND MONTH(HireDate) = 7`.

---

## Exercise 2

Fill in the result (TRUE, FALSE, or UNKNOWN):

```text
NULL = NULL
FALSE AND UNKNOWN
TRUE  OR  UNKNOWN
NOT UNKNOWN
5 NOT IN (1, 2, NULL)
```

---

## Exercise 3

For each requirement, choose the predicate type from the "Choosing a Predicate" tree:

1. Customers whose email starts with `admin`.
2. Orders from 1–7 March 2026 (timestamp column).
3. Products never ordered.
4. Employees without a manager.

---

## Exercise 4

Write a single query that returns active customers from India or Nepal, created in 2026, whose name starts with `S`, using only SARGable predicates.

---

# Related Topics

- **06.01 — Introduction to WHERE**
- **06.08 — NULL Handling in WHERE (Three-Valued Logic)**
- **06.12 — SARGability and Index-Friendly Predicates**
- **06.13 — Common WHERE Mistakes & Best Practices**
- **07.xx — JOINs**
- **08.xx — GROUP BY and HAVING**

---

# Summary

The `WHERE` clause keeps only rows whose predicate is TRUE. Comparison, range, list, pattern, `NULL`, and subquery predicates—combined with `AND`, `OR`, and `NOT` under three-valued logic—express nearly every filtering need. Correctness depends on handling `NULL`, precedence, and date-time ranges deliberately; performance depends on SARGable predicates and indexes shaped like the filters; and safety depends on parameters and verified data changes. This cheat sheet and knowledge map connect those ideas into a single reference for the rest of the handbook.
