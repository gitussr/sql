---
title: "08.17 - GROUP BY Cheat Sheet & Visual Knowledge Map"
description: "A complete aggregation reference: syntax for GROUP BY, HAVING, conditional aggregation and grouping sets, aggregate behaviour and NULL rules, the WHERE versus HAVING decision, fan-out rules, execution strategies, indexing rules, vendor syntax, and a chapter-wide knowledge map."
chapter: 8
section: 8.17
category: Data Query Language (DQL)
difficulty: All Levels
readingTime: 25 min
lastUpdated: 2026-09-24
---

# 08.17 GROUP BY Cheat Sheet & Visual Knowledge Map

---

# Learning Objectives

After completing this section, you will be able to:

- Recall every aggregation form from a single reference.
- Recall how each aggregate treats `NULL` and empty input.
- Decide between `WHERE` and `HAVING` at a glance.
- Recall the fan-out and pre-aggregation rules.
- Locate any topic in the chapter from the knowledge map.

---

# Syntax Reference

```sql
-- Whole-table aggregate: always exactly one row
SELECT COUNT(*), SUM(x), AVG(x), MIN(x), MAX(x) FROM T;

-- Grouped aggregate: one row per group
SELECT g, COUNT(*), SUM(x)
FROM T
WHERE row_condition
GROUP BY g
HAVING SUM(x) > 100
ORDER BY SUM(x) DESC;

-- Several grouping columns / expressions
SELECT a, b, COUNT(*) FROM T GROUP BY a, b;
SELECT DATE_TRUNC('month', d) AS m, SUM(x) FROM T GROUP BY DATE_TRUNC('month', d);

-- COUNT forms
COUNT(*)            -- rows
COUNT(x)            -- non-NULL x
COUNT(DISTINCT x)   -- different non-NULL x

-- Conditional aggregation
SUM(CASE WHEN s = 'A' THEN x ELSE 0 END)
COUNT(CASE WHEN s = 'A' THEN 1 END)
COUNT(*) FILTER (WHERE s = 'A')                  -- PostgreSQL, SQLite

-- Duplicates
SELECT k, COUNT(*) FROM T GROUP BY k HAVING COUNT(*) > 1;

-- Pre-aggregate a 1:N branch
SELECT p.id, COALESCE(c.total, 0)
FROM Parent p
LEFT JOIN (SELECT parent_id, SUM(x) AS total
           FROM Child GROUP BY parent_id) c ON c.parent_id = p.id;

-- Subtotals
GROUP BY ROLLUP (a, b)            -- (a,b), (a), ()
GROUP BY CUBE (a, b)              -- (a,b), (a), (b), ()
GROUP BY GROUPING SETS ((a, b), (a), ())
GROUPING(a)                       -- 1 on subtotal rows for a
```

---

# Aggregate Behaviour

| Aggregate | Skips `NULL` | Empty / all-`NULL` input | Notes |
|-----------|-------------|--------------------------|-------|
| `COUNT(*)` | — (counts rows) | `0` | |
| `COUNT(x)` | ✅ | `0` | |
| `COUNT(DISTINCT x)` | ✅ | `0` | Memory ∝ distinct values |
| `SUM(x)` | ✅ | `NULL` | Wrap in `COALESCE(…, 0)` |
| `AVG(x)` | ✅ | `NULL` | = `SUM(x) / COUNT(x)`; integer on SQL Server |
| `MIN(x)` / `MAX(x)` | ✅ | `NULL` | Any ordered type; index shortcut |
| `STRING_AGG` etc. | ✅ | `NULL` | Needs its own `ORDER BY` |
| `PERCENTILE_CONT(p)` | ✅ | `NULL` | Keeps every value |

```text
Empty input:  no GROUP BY  → 1 row     GROUP BY → 0 rows
NULL keys:    all NULLs form ONE group
```

---

# The SELECT List Rule

```text
After GROUP BY, every column in SELECT / HAVING / ORDER BY must be:

  ✅ a grouping column or expression
  ✅ inside an aggregate
  ✅ functionally dependent on a grouped PK   (PostgreSQL, MySQL only)
  ❌ anything else → error (or an arbitrary value on SQLite / permissive MySQL)
```

---

# WHERE vs HAVING

```text
Needs an aggregate?  ── yes ──→ HAVING
        │
        no
        │
Changes what is summed? ── yes ──→ WHERE
        │
        no (grouping column only) ──→ WHERE (cheaper)

Qualify on all rows, report on some ──→ conditional aggregation + HAVING
```

| | `WHERE` | `HAVING` |
|---|---------|----------|
| Filters | Rows | Groups |
| Aggregates | ❌ | ✅ |
| Uses indexes | ✅ | Only if pushed down |

---

# Joins and Aggregates

```text
1. Name the grain after every join.
2. Sum a measure only from the table at the finest grain.
3. Two 1:N branches from one parent → pre-aggregate each first.
4. Count parents after a 1:N join with COUNT(DISTINCT parent_key).
5. After a LEFT JOIN, count the optional table's key, not *.
6. Never "fix" duplicates with SUM(DISTINCT …).
7. Reconcile the total with a direct SUM over the source.
```

```text
FAN TRAP                         CHASM TRAP
Parent (measure)                 Parent
   │ 1:N                          ├── 1:N Child A
Child                             └── 1:N Child B
→ parent measure repeated         → A × B rows per parent
```

---

# Choosing a Grouping Tool

```text
What do you need?
│
├── One summary row                      → aggregate, no GROUP BY
├── One row per category                 → GROUP BY
├── Keep only some categories            → + HAVING
├── Several subset totals side by side   → conditional aggregation
├── Subtotals along a hierarchy          → ROLLUP
├── Every margin                         → CUBE
├── Hand-picked levels                   → GROUPING SETS
├── Detail rows AND group totals         → window functions (Chapter 11)
└── The row holding the max per group    → ROW_NUMBER / join back / LATERAL
```

---

# Execution and Performance

| Strategy | Needs order | Memory | Output order | Stops early |
|----------|------------|--------|-------------|-------------|
| Hash aggregate | No | ∝ groups | None | No |
| Stream aggregate | Yes | One group | By key | Yes |
| Sort + stream | Produces it | ∝ input | By key | No |

```text
Index design:   (equality filters, grouping columns, range filters, measures)
                   seek               stream agg        in-index     covered
```

```text
Performance rules

1. Filter first with SARGable predicates.
2. Index in grouping order; cover the measures.
3. MIN / MAX from index ends.
4. Aggregate facts before joining dimensions.
5. Group by narrow keys.
6. Watch estimated vs actual groups, and spills.
7. Precompute repeated aggregations with additive measures.
```

---

# Vendor Quick Reference

| Feature | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|---------|-----------|-------|-----------|--------|--------|
| Functional dependency | ✅ | ✅ | ❌ | ❌ | bare columns |
| `GROUP BY` alias / position | ✅ | ✅ | ❌ | 23ai+ | ✅ |
| `SELECT` alias in `HAVING` | ❌ | ✅ | ❌ | ❌ | ✅ |
| `FILTER (WHERE …)` | ✅ | ❌ | ❌ | ❌ | ✅ (3.30+) |
| `ROLLUP` | ✅ | `WITH ROLLUP` | ✅ | ✅ | ❌ |
| `CUBE` / `GROUPING SETS` | ✅ | ❌ | ✅ | ✅ | ❌ |
| String aggregation | `STRING_AGG` | `GROUP_CONCAT` | `STRING_AGG` | `LISTAGG` | `GROUP_CONCAT` |
| Percentile aggregate | ✅ | ❌ | window only | ✅ | extension |
| `ANY_VALUE` | 16+ | ✅ | ❌ | ✅ | ❌ |
| `AVG(INT)` | numeric | decimal | **int** | number | real |

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE
4. GROUP BY    ← every grouping topic in this chapter happens here
5. HAVING      ← and every group filter here
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Parse  →  Bind  →  Rewrite  →  Optimize  →  Execute

Bind      SELECT list rule, functional dependency check

Rewrite   HAVING → WHERE pushdown (grouping columns),
          DISTINCT aggregates → two-step grouping,
          eager aggregation below joins (where provable)

Optimize  hash vs stream aggregate, parallel partial/final,
          driven by estimated number of groups

Execute   accumulate per group → finalise → HAVING → SELECT
```

---

# Visual Knowledge Map

```text
                      CHAPTER 08 — GROUP BY and HAVING
                                    │
      ┌───────────────────┬─────────┴─────────┬─────────────────────┐
      │                   │                   │                     │
 AGGREGATES          GROUPING           GROUP FILTERS           EXECUTION
      │                   │                   │                     │
08.01 Intro          08.05 Syntax        08.08 HAVING          08.14 Hash / Stream
08.02 Core five      08.06 Multi-col     08.09 WHERE vs        08.15 Performance
08.03 COUNT forms          + expressions       HAVING                + Indexes
08.04 NULLs          08.07 SELECT rule
08.13 Advanced                            ADVANCED
                                               │
                                          08.10 Conditional
                                          08.11 Across JOINs
                                          08.12 ROLLUP / CUBE
                                               │
                                     ┌─────────┴─────────┐
                                08.16 Mistakes      08.17 Cheat Sheet
```

```text
Dependencies

  05.07 DISTINCT                    ──→ 08.03, 08.05
  06.08 NULL / three-valued logic   ──→ 08.04, 08.08
  06.12 SARGability                 ──→ 08.09, 08.15
  07.04 LEFT JOIN                   ──→ 08.03, 08.04
  07.10 Joining Multiple Tables     ──→ 08.11
  07.14 Join Algorithms             ──→ 08.14
  08.xx GROUP BY and HAVING         ──→ 09.xx Subqueries, 11.xx Window Functions
```

---

# One-Page Summary

```text
CONCEPTS
  GROUP BY changes the grain: one row per group
  Aggregates skip NULL; only COUNT returns 0 on empty input
  NULL grouping keys form one group
  WHERE filters rows before grouping; HAVING filters groups after

RULES
  Name the grain before writing the query
  Every non-aggregated column is grouped (or depends on a grouped key)
  COUNT(*) rows · COUNT(x) values · COUNT(DISTINCT x) different values
  After a LEFT JOIN, count the optional table's key
  Sum only at the finest grain; pre-aggregate 1:N branches
  COALESCE(SUM(x), 0) for zero totals; decide what NULL means
  Cast before AVG / percentages to avoid integer division
  Store additive measures; never average averages
  Always ORDER BY; label ROLLUP subtotals with GROUPING()
```

---

# 🏗️ Architecture Insight

The whole chapter reduces to one question asked of every grouped query: *what does one row of this result represent?* Get the grain right and the SELECT list rule, the correct `COUNT`, the fan-out rules and the choice between `WHERE` and `HAVING` all follow. Every mistake in Section 08.16 is a wrong or unstated answer to that question.

---

# ⚡ Performance Tip

If you remember one performance rule from this chapter: reduce rows before grouping and groups before joining. A selective `WHERE` and a pre-aggregated fact table solve the large majority of slow grouped queries before any index tuning is needed.

---

# 💡 Did You Know?

The `CUBE` and `ROLLUP` operators were proposed in a 1996 paper by Jim Gray and colleagues, "Data Cube: A Relational Aggregation Operator Generalizing Group-By, Cross-Tab, and Sub-Totals". They were standardised with the SQL:1999 OLAP extensions, together with `GROUPING SETS`, and brought the OLAP cube into plain SQL.

---

# Related Topics

- **08.01 — Introduction to Aggregation and Grouping**
- **08.09 — WHERE vs HAVING**
- **08.11 — Aggregating Across JOINs (Fan-Out and Pre-Aggregation)**
- **08.16 — Common GROUP BY Mistakes & Best Practices**
- **07.17 — JOIN Cheat Sheet & Visual Knowledge Map**
- **06.14 — WHERE Cheat Sheet & Visual Knowledge Map**
- **09.xx — Subqueries**
- **11.xx — Window Functions**

---

# Summary

This section condenses Chapter 08 into a single reference: the syntax of grouped, conditional and multi-level aggregation, how each aggregate treats `NULL` and empty input, the SELECT list rule, the `WHERE` versus `HAVING` decision, the fan-out rules for aggregating across joins, the execution strategies and indexing rules that make grouped queries fast, and the vendor differences that matter. One question carries the whole chapter—what is the grain of this result—and the knowledge map shows where each section answers it, how Chapter 08 builds on `NULL` logic, `DISTINCT` and joins from earlier chapters, and how it leads into subqueries and window functions.
