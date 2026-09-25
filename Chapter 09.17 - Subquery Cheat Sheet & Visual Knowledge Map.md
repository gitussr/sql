---
title: "09.17 - Subquery Cheat Sheet & Visual Knowledge Map"
description: "A complete subquery reference: syntax for every subquery form, result shapes and where they fit, empty-set and NULL behaviour, choosing between IN, EXISTS, joins, derived tables, LATERAL and window functions, execution strategies, indexing rules, vendor syntax, and a chapter-wide knowledge map."
chapter: 9
section: 9.17
category: Data Query Language (DQL)
difficulty: All Levels
readingTime: 25 min
lastUpdated: 2026-09-25
---

# 09.17 Subquery Cheat Sheet & Visual Knowledge Map

---

# Learning Objectives

After completing this section, you will be able to:

- Recall every subquery form from a single reference.
- Recall how each form behaves with empty sets and `NULL`s.
- Choose the right tool for a question at a glance.
- Recall the execution strategies and indexing rules.
- Locate any topic in the chapter from the knowledge map.

---

# Syntax Reference

```sql
-- Scalar subquery: one value
SELECT p.ProductName FROM Products p
WHERE p.ListPrice > (SELECT AVG(ListPrice) FROM Products);

SELECT c.CustomerID,
       (SELECT COUNT(*) FROM Orders o WHERE o.CustomerID = c.CustomerID) AS Orders
FROM Customers c;

-- Membership
WHERE x IN     (SELECT col FROM T WHERE …)
WHERE x NOT IN (SELECT col FROM T WHERE col IS NOT NULL)      -- only with NULLs removed
WHERE (a, b) IN (SELECT a, b FROM T)                          -- not SQL Server

-- Existence
WHERE EXISTS     (SELECT 1 FROM T t WHERE t.k = outer.k)
WHERE NOT EXISTS (SELECT 1 FROM T t WHERE t.k = outer.k)

-- Quantified (not SQLite)
WHERE x > ALL  (SELECT col FROM T)
WHERE x > ANY  (SELECT col FROM T)       -- SOME is a synonym

-- Derived table
SELECT … FROM (SELECT k, COUNT(*) AS n FROM T GROUP BY k) AS t WHERE t.n > 1;

-- Filter on a window function
SELECT * FROM (SELECT …, ROW_NUMBER() OVER (PARTITION BY g ORDER BY d DESC) AS rn
               FROM T) AS t
WHERE t.rn = 1;

-- LATERAL / APPLY: a table per outer row
FROM P p CROSS JOIN LATERAL (SELECT … FROM C c WHERE c.pid = p.id ORDER BY … LIMIT 3) AS x
FROM P p LEFT JOIN LATERAL (…) AS x ON TRUE
FROM P p CROSS APPLY (SELECT TOP (3) … ) AS x        -- SQL Server
FROM P p OUTER APPLY (SELECT TOP (3) … ) AS x        -- SQL Server

-- HAVING with a subquery
GROUP BY g HAVING AVG(x) > (SELECT AVG(x) FROM T)

-- DML
INSERT INTO T2 (cols) SELECT cols FROM T1 WHERE …;
UPDATE T SET c = (SELECT … WHERE s.k = T.k) WHERE EXISTS (SELECT 1 FROM S s WHERE s.k = T.k);
DELETE FROM T WHERE NOT EXISTS (SELECT 1 FROM C WHERE C.k = T.k);
```

---

# Shapes and Positions

| Shape | Rows × columns | Allowed in |
|-------|----------------|-----------|
| Scalar | ≤ 1 × 1 | `SELECT`, `WHERE`, `HAVING`, `ORDER BY`, `SET`, `VALUES`, any expression |
| Column | N × 1 | `IN`, `NOT IN`, `ANY`, `SOME`, `ALL` |
| Row | 1 × M | Row-value comparison `(a, b) = (…)` |
| Table | N × M | `FROM`, `JOIN`, `LATERAL`, `APPLY`, `INSERT … SELECT`, `MERGE … USING` |
| Any | — | `EXISTS`, `NOT EXISTS` |

---

# Empty Sets and NULLs

| Expression | Empty subquery | Subquery contains `NULL` (no match) | Outer value `NULL` |
|------------|----------------|--------------------------------------|--------------------|
| Scalar `(…)` | `NULL` | — | — |
| `x IN (…)` | FALSE | UNKNOWN | UNKNOWN (FALSE if empty) |
| `x NOT IN (…)` | TRUE | **UNKNOWN → no rows** | UNKNOWN (TRUE if empty) |
| `EXISTS (…)` | FALSE | TRUE/FALSE (rows are counted) | depends on correlation |
| `NOT EXISTS (…)` | TRUE | TRUE/FALSE | TRUE when nothing matches `NULL` |
| `x > ALL (…)` | TRUE | UNKNOWN (unless some FALSE) | UNKNOWN |
| `x > ANY (…)` | FALSE | UNKNOWN (unless some TRUE) | UNKNOWN |

```text
Scalar contract:  0 rows → NULL     1 row → value     2+ rows → ERROR (SQLite: first row)
```

---

# Choosing a Tool

```text
What do you need?
│
├── A single figure (average, max, total)               → scalar subquery
├── Rows that have at least one related row             → EXISTS / IN
├── Rows that have no related row                       → NOT EXISTS
├── Related columns returned                            → JOIN
├── One looked-up value per row                         → scalar subquery (correlated)
├── Several values from the same related row            → LATERAL / APPLY
├── Top N related rows per row                          → LATERAL / APPLY (indexed)
│                                                          or ROW_NUMBER() derived table
├── Several aggregates per parent                       → LEFT JOIN grouped derived table
├── Row compared with its group's figure                → correlated subquery,
│                                                          derived table or window function
├── Group compared with a population                    → subquery in HAVING
├── Filter on a computed column / window result         → derived table
└── "For every X"                                       → double NOT EXISTS or COUNT = COUNT
```

---

# Subquery vs JOIN

```text
Inner side unique (≤ 1 match)?   JOIN ≡ IN ≡ EXISTS
Inner side can match many?       JOIN repeats outer rows; IN / EXISTS do not
Need inner columns?              JOIN (or scalar / LATERAL)
Exclusion?                       NOT EXISTS  ≡  LEFT JOIN … WHERE right.pk IS NULL
                                 NOT IN only on NOT NULL columns
Correlated COUNT → LEFT JOIN?    COALESCE(n, 0) — the count bug
```

---

# Execution Strategies

| Strategy | When | Plan label |
|----------|------|-----------|
| Run once | Uncorrelated | InitPlan, constant scan, materialised subquery |
| Unnest | `IN`, `EXISTS`, `NOT EXISTS` with equality correlation | Semi Join, Anti Join |
| Decorrelate | Correlated scalar aggregate | Join + Aggregate |
| Merge | Simple derived table | (disappears) |
| Materialise / push down | Grouped / limited derived table | Subquery Scan, pushed predicates |
| Per row | Row limits, `OR`, nullable `NOT IN`, engine limits | SubPlan, `DEPENDENT SUBQUERY`, Apply, `FILTER` |

```text
Unnesting blockers:  LIMIT / TOP / FETCH · correlation inside OR · nullable NOT IN
                     non-deterministic functions · multi-level correlation (some engines)
```

---

# Performance Rules

```text
1. Index every correlation column (usually a foreign key).
2. Composite order: correlation → equality filters → range / sort → returned values.
3. Keep inner predicates SARGable; match correlation data types.
4. Read each child table once: one grouped derived table or one LATERAL,
   not several scalar subqueries.
5. Filter outer rows before per-row subqueries run.
6. Top N per group: LATERAL + (group, sort) index, or ROW_NUMBER() for most groups.
7. Check actual plans: executions × rows per execution.
```

---

# Vendor Quick Reference

| Feature | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|---------|-----------|-------|-----------|--------|--------|
| `ANY` / `ALL` | ✅ | ✅ | ✅ | ✅ | ❌ |
| Row-value `IN` | ✅ | ✅ | ❌ | ✅ | ✅ (3.15+) |
| Derived table alias | Optional (16+) | Required | Required | Optional (no `AS`) | Optional |
| `LIMIT` in `IN` subquery | ✅ | ❌ | `TOP` ✅ | ✅ | ✅ |
| `LATERAL` | ✅ | ✅ (8.0.14+) | `APPLY` | ✅ + `APPLY` (12c+) | ❌ |
| Multi-row scalar subquery | Error | Error | Error | Error | First row |
| Subquery on DML target | ✅ | ❌ (1093) | ✅ | ✅ | ✅ |
| `NOT IN` → anti-join | ❌ | ✅ (8.0.17+) | Null-aware | Null-aware | ❌ |
| Scalar decorrelation | Limited | Opt-in | ✅ | ✅ | ❌ |
| Per-row plan label | `SubPlan` | `DEPENDENT SUBQUERY` | Nested Loops (Apply) | `FILTER` | `CORRELATED … SUBQUERY` |

---

# 📍 Execution Order Reminder

```text
1. FROM        ← derived tables and LATERAL subqueries
2. JOIN        ← unnested subqueries end up here
3. WHERE       ← IN, EXISTS, ANY, ALL and scalar comparisons
4. GROUP BY
5. HAVING      ← group-versus-population subqueries
6. SELECT      ← scalar subqueries as columns
7. DISTINCT
8. ORDER BY    ← scalar subqueries as sort keys
9. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Parse  →  Bind  →  Rewrite  →  Optimize  →  Execute

Bind      scope resolution (outer references = correlation),
          shape checks (one column for IN, alias for derived tables)

Rewrite   uncorrelated scalars → InitPlans
          IN / EXISTS → semi-join · NOT EXISTS → anti-join
          correlated aggregates → LEFT JOIN + GROUP BY (+ count-bug guard)
          simple derived tables / views / CTEs → merged

Optimize  join order and algorithms for the rewritten query;
          remaining subqueries costed as per-row SubPlans

Execute   per-row subqueries with parameter binding and result caching
```

---

# Visual Knowledge Map

```text
                            CHAPTER 09 — Subqueries
                                     │
      ┌──────────────────┬───────────┴──────────┬──────────────────────┐
      │                  │                      │                      │
  FOUNDATIONS        IN WHERE              AS TABLES              EXECUTION
      │                  │                      │                      │
09.01 Intro         09.04 IN / NOT IN     09.08 Derived tables   09.14 Unnesting
09.02 Syntax        09.05 EXISTS          09.10 LATERAL / APPLY        + decorrelation
09.03 Scalar        09.06 ANY / ALL                              09.15 Performance
09.07 Correlated                                                       + indexes
      │                  │                      │
      └──────────┬───────┴──────────┬───────────┘
                 │                  │
           09.09 Aggregates    09.11 INSERT / UPDATE / DELETE
           09.12 NULL          09.13 Subqueries vs JOINs
                 │
       ┌─────────┴─────────┐
  09.16 Mistakes      09.17 Cheat Sheet
```

```text
Dependencies

  06.06 IN and NOT IN                    ──→ 09.04
  06.08 NULL / three-valued logic        ──→ 09.04, 09.06, 09.12
  06.10 EXISTS (introduction)            ──→ 09.05
  06.12 SARGability                      ──→ 09.15
  07.13 Semi-joins and anti-joins        ──→ 09.05, 09.13, 09.14
  07.14 Join algorithms                  ──→ 09.14
  08.08 HAVING                           ──→ 09.09
  08.11 Aggregating across joins         ──→ 09.08, 09.13
  09.xx Subqueries                       ──→ 10.xx Indexes, 11.xx Window Functions
```

---

# One-Page Summary

```text
CONCEPTS
  A subquery is a query in parentheses whose result the outer query uses
  Shape decides position: value · column · row · table · EXISTS (any)
  Correlated = references the outer query; logically re-run per outer row
  Optimizers unnest IN / EXISTS into semi- and anti-joins

RULES
  Qualify every column; use distinct aliases inside and outside
  NOT EXISTS for exclusions; NOT IN only on NOT NULL columns
  Scalar subqueries: key, aggregate or ordered FETCH FIRST 1 — never "hope"
  Empty scalar → NULL; COALESCE only when none means 0
  EXISTS / IN for membership; JOIN only when you need the inner columns
  Pre-aggregate children in derived tables; state each derived table's grain
  Correlated UPDATE: SET (…) + WHERE EXISTS (…)
  Index correlation columns; read actual plans for per-row subqueries
```

---

# 🏗️ Architecture Insight

The chapter reduces to two questions asked of every subquery: *what shape does it return*, and *what does it depend on*? Shape decides where it may go and which `NULL` rules apply; dependency decides whether it runs once, per row or not at all. Every mistake in Section 09.16 is a wrong answer to one of them.

---

# ⚡ Performance Tip

If you remember one performance rule from this chapter: index the columns that subqueries correlate on. Almost every slow subquery is a per-row execution scanning a table that has no index on its foreign key.

---

# 💡 Did You Know?

Won Kim's 1982 paper on unnesting SQL subqueries turned correlated `COUNT` subqueries into joins—and silently lost rows whose count was zero. The flaw became known as the "count bug", and Richard Ganski and Harry Wong published a corrected approach in 1987 based on outer joins. Nearly four decades later, every optimizer that decorrelates subqueries still carries a guard for this case.

---

# Related Topics

- **09.01 — Introduction to Subqueries**
- **09.12 — NULL Handling in Subqueries**
- **09.13 — Subqueries vs JOINs**
- **09.16 — Common Subquery Mistakes & Best Practices**
- **08.17 — GROUP BY Cheat Sheet & Visual Knowledge Map**
- **07.17 — JOIN Cheat Sheet & Visual Knowledge Map**
- **10.xx — Indexes**
- **11.xx — Window Functions**

---

# Summary

This section condenses Chapter 09 into one reference: the syntax of scalar, membership, existence, quantified, derived-table, lateral and DML subqueries; where each shape may appear; how each behaves on empty sets and `NULL`s; how to choose between subqueries, joins, derived tables, `LATERAL` and window functions; how engines run subqueries once, per row or not at all; and which indexes make them fast. Two questions carry the whole chapter—what shape does the subquery return, and what does it depend on—and the knowledge map shows how the chapter builds on `IN`, `EXISTS`, three-valued logic, joins and aggregation, and leads into indexes and window functions.
