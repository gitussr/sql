---
title: "07.17 - JOIN Cheat Sheet & Visual Knowledge Map"
description: "A complete JOIN reference: syntax for every join type, a Venn-style diagram set, a decision tree for choosing a join, cardinality and NULL rules, ON versus WHERE, algorithm selection, indexing rules, and a chapter-wide knowledge map."
chapter: 7
section: 7.17
category: Data Query Language (DQL)
difficulty: All Levels
readingTime: 25 min
lastUpdated: 2026-09-22
---

# 07.17 JOIN Cheat Sheet & Visual Knowledge Map

---

# Learning Objectives

After completing this section, you will be able to:

- Recall every join form from a single reference.
- Choose a join type from a decision tree.
- Recall the `ON` versus `WHERE` rule at a glance.
- Recall the `NULL` and cardinality rules.
- Locate any topic in the chapter from the knowledge map.

---

# Syntax Reference

```sql
-- INNER: matching pairs only
SELECT ... FROM A INNER JOIN B ON B.key = A.key;

-- LEFT: all of A
SELECT ... FROM A LEFT JOIN B ON B.key = A.key;

-- RIGHT: all of B
SELECT ... FROM A RIGHT JOIN B ON B.key = A.key;

-- FULL: all of both
SELECT ... FROM A FULL OUTER JOIN B ON B.key = A.key;

-- CROSS: every combination
SELECT ... FROM A CROSS JOIN B;

-- SELF: a table with itself
SELECT ... FROM T AS a INNER JOIN T AS b ON b.parent_id = a.id;

-- USING: identically named columns, merged in the output
SELECT ... FROM A INNER JOIN B USING (key);

-- Semi-join: A rows that have a match
SELECT ... FROM A WHERE EXISTS (SELECT 1 FROM B WHERE B.key = A.key);

-- Anti-join: A rows that have no match
SELECT ... FROM A WHERE NOT EXISTS (SELECT 1 FROM B WHERE B.key = A.key);

-- Multiple tables
SELECT ...
FROM A
INNER JOIN B ON B.a_id = A.id
LEFT  JOIN C ON C.b_id = B.id;
```

---

# The Joins at a Glance

```text
INNER JOIN                      LEFT JOIN
  A ┌───┬───┐ B                   A ┌───┬───┐ B
    │   │███│                       │███│███│
    │   │███│                       │███│███│
    └───┴───┘                       └───┴───┘
  matching pairs only            all of A, matches of B


RIGHT JOIN                      FULL OUTER JOIN
  A ┌───┬───┐ B                   A ┌───┬───┐ B
    │   │███│███                    │███│███│███
    │   │███│███                    │███│███│███
    └───┴───┘                       └───┴───┘
  all of B, matches of A         everything from both


CROSS JOIN                      ANTI-JOIN (NOT EXISTS)
  every A × every B               A ┌───┬───┐ B
  rows = |A| × |B|                  │███│   │
                                    │███│   │
                                    └───┴───┘
                                 A rows with no match
```

---

# Choosing a Join: Decision Tree

```text
What does the question ask for?

├─ "X and their Y"  (only where both exist)
│     → INNER JOIN
│
├─ "All X, with Y where available"
│     → LEFT JOIN
│
├─ "All Y, with X where available"
│     → LEFT JOIN, starting from Y
│
├─ "Everything from both, matched where possible"
│     → FULL OUTER JOIN
│
├─ "Every combination of X and Y"
│     → CROSS JOIN
│
├─ "X that have at least one Y"       (no Y columns needed)
│     → WHERE EXISTS
│
├─ "X that have no Y"
│     → WHERE NOT EXISTS
│
└─ "X compared with other X"
      → SELF JOIN (fixed depth) or recursive CTE (unknown depth)
```

---

# ON vs WHERE

```text
ON     decides which pairs MATCH        (step 2)
WHERE  decides which rows SURVIVE       (step 3)
```

| Condition applies to | Join type | Clause |
|----------------------|-----------|--------|
| Preserved (left) table | `LEFT JOIN` | `WHERE` |
| Optional (right) table | `LEFT JOIN` | `ON` |
| Either table | `INNER JOIN` | Either; use `WHERE` for filters |
| The relationship | Any | `ON` |
| "No match exists" | `LEFT JOIN` | `WHERE key IS NULL` |

```text
LEFT JOIN + WHERE on the optional table = INNER JOIN
```

---

# Cardinality Rules

| Relationship | Effect on row count |
|--------------|---------------------|
| 1:1 | Unchanged |
| N:1 (many rows → one lookup) | Unchanged |
| 1:N (one row → many) | Multiplies |
| N:M | Multiplies both ways |
| Two 1:N branches of one parent | `items × payments` — fan-out |
| No condition | Cartesian: left rows × right rows |

```text
After every join, ask: "one row per what?"
```

---

# NULL Rules

```text
NULL join key        → never matches (inner join drops the row)
Outer join, no match → right columns NULL-extended
NULL-extended row    → fails every WHERE comparison
COUNT(*)             → counts the manufactured row
COUNT(right_key)     → does not
SUM over no rows     → NULL, not 0
NOT IN (…, NULL)     → the whole result is empty
NOT EXISTS           → always safe
```

```sql
-- Tell a manufactured NULL from a stored one
WHERE o.OrderID IS NULL          -- no matching row at all (PK is NOT NULL)
```

---

# Algorithm Selection

| Algorithm | Needs | Cost | Best for |
|-----------|-------|------|----------|
| Nested loop | Index on the inner side | `outer × lookup` | Small outer, indexed inner |
| Hash join | Equality condition, memory | `build + probe` | Large unindexed inputs |
| Merge join | Sorted inputs | sort + one pass | Pre-sorted or clustered data |

```text
equality? ── no ──→ nested loop
   │ yes
   ▼
small outer + indexed inner? ── yes ──→ nested loop
   │ no
   ▼
already sorted? ── yes ──→ merge join
   │ no
   ▼
hash join
```

---

# Index Rules

```text
1. Index every foreign key used in a join
2. Identical data types and collations on both sides
3. No functions or arithmetic on join columns
4. Composite indexes: equality columns first, range columns second
5. Covering indexes on hot paths (INCLUDE the selected columns)
6. Declare constraints — they enable join elimination
```

---

# Vendor Quick Reference

| Feature | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|---------|------------|--------|------------|---------|---------|
| `FULL OUTER JOIN` | ✅ | ❌ | ✅ | ✅ | 3.39+ |
| `RIGHT JOIN` | ✅ | ✅ | ✅ | ✅ | 3.39+ |
| `NATURAL JOIN` / `USING` | ✅ | ✅ | ❌ | ✅ | ✅ |
| `LATERAL` / `APPLY` | ✅ | 8.0.14+ | `APPLY` | ✅ | ❌ |
| Hash join | ✅ | 8.0.18+ | ✅ | ✅ | ❌ |
| Merge join | ✅ | ❌ | ✅ | ✅ | ❌ |
| FK auto-indexed | ❌ | ✅ | ❌ | ❌ | ❌ |
| `IS NOT DISTINCT FROM` | ✅ | `<=>` | 2022+ | ❌ | 3.39+ |

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN    ← every join in this chapter happens here
3. WHERE
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Parse  →  Bind  →  Rewrite  →  Optimize  →  Execute

Rewrite   predicate pushdown, subquery flattening,
          outer join simplification, join elimination

Optimize  join order + algorithm + access path,
          all driven by cardinality estimates

Execute   nested loop / hash / merge, per join
```

---

# Visual Knowledge Map

```text
                        CHAPTER 07 — JOINs
                                │
      ┌─────────────────┬───────┴────────┬──────────────────┐
      │                 │                │                  │
  FOUNDATIONS      JOIN TYPES        SEMANTICS         EXECUTION
      │                 │                │                  │
 07.01 Intro       07.03 INNER     07.11 ON vs WHERE   07.14 Algorithms
 07.02 Syntax      07.04 LEFT      07.12 NULLs         07.15 Performance
                   07.05 RIGHT     07.13 Semi/Anti          + Indexes
                   07.06 FULL
                   07.07 CROSS          │                   │
                   07.08 SELF           └─────────┬─────────┘
                   07.09 NATURAL                  │
                        + USING             07.16 Mistakes
                   07.10 Multi-table        07.17 Cheat Sheet
```

```text
Dependencies

  06.08 NULL / three-valued logic ──→ 07.04, 07.12, 07.13
  06.10 EXISTS                    ──→ 07.13
  06.12 SARGability               ──→ 07.15
  03.08 Relationships             ──→ 07.01, 07.10
  07.xx JOINs                     ──→ 08.xx GROUP BY and HAVING
```

---

# One-Page Summary

```text
JOIN TYPES
  INNER   matching pairs only
  LEFT    all of the left, NULL-extended right
  RIGHT   mirror of LEFT — prefer rewriting as LEFT
  FULL    all of both
  CROSS   every combination
  SELF    a table joined to itself, via aliases
  SEMI    EXISTS — left rows with a match, once each
  ANTI    NOT EXISTS — left rows with no match

RULES
  Relationships in ON, restrictions in WHERE
  Outer-join conditions on the optional table go in ON
  Keep the chain outer once it is outer
  Name the grain after every join
  Pre-aggregate 1:N branches before joining them
  NOT EXISTS, never NOT IN, for exclusion
  Index every foreign key; match the data types
  Qualify every column; name every table
```

---

# 🏗️ Architecture Insight

The whole chapter reduces to two questions asked of every join: *what is preserved*, and *what is the grain*. Join type answers the first; cardinality answers the second. Every mistake in Section 07.16 is a wrong answer to one of them.

---

# ⚡ Performance Tip

If you remember one performance rule from this chapter: index the foreign key, and make sure both sides of the condition have the same data type. Those two cover the majority of slow joins in real systems.

---

# 💡 Did You Know?

The Venn diagrams universally used to teach joins are not strictly accurate: they depict set overlap, while a join produces *pairs*, so a 1:N inner join can return more rows than either "circle" contains. The diagrams are a fine mental shortcut for which rows survive—and a poor one for how many rows come out.

---

# Related Topics

- **07.01 — Introduction to JOINs**
- **07.11 — ON vs WHERE (Join Conditions and Filters)**
- **07.14 — Execution Flow of JOINs (Join Algorithms)**
- **07.16 — Common JOIN Mistakes & Best Practices**
- **06.14 — WHERE Cheat Sheet & Visual Knowledge Map**
- **04.20 — SQL Cheat Sheet**
- **08.xx — GROUP BY and HAVING**

---

# Summary

This section condenses Chapter 07 into a single reference: the syntax of every join form, a diagram set, a decision tree from question to join type, the `ON` versus `WHERE` rule, the cardinality and `NULL` rules, algorithm selection, and the six indexing rules that decide join performance. Two questions carry the whole chapter—what does this join preserve, and what is the grain of its result—and the knowledge map shows where each section answers them, as well as how Chapter 07 builds on `NULL` logic and `EXISTS` from Chapter 06 and leads into grouping and aggregation in Chapter 08.
