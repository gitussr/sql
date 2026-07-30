---
title: "04.19 - SQL Execution Order"
description: "Understand the logical execution order of SQL statements, why SQL is written differently from how it executes, and how the query processor transforms SQL into an execution plan."
chapter: 4
section: 4.19
category: SQL Fundamentals
difficulty: Beginner → Intermediate
readingTime: 45 min
lastUpdated: 2026-07-30
---

# 04.19 SQL Execution Order

---

# Learning Objectives

After completing this lesson, you will be able to:

- Understand why SQL execution order differs from SQL syntax.
- Learn the logical execution order of a SELECT query.
- Understand how the query processor transforms SQL.
- Explain why aliases cannot always be referenced in earlier clauses.
- Understand optimizer rewrites.
- Prepare for advanced SELECT statements in Chapter 05.

---

# Introduction

One of the biggest misconceptions among beginners is that SQL executes **from top to bottom**.

Consider this query:

```sql
SELECT
    CustomerName,
    SUM(TotalAmount) AS TotalSales
FROM Orders
WHERE Status = 'Completed'
GROUP BY CustomerName
HAVING SUM(TotalAmount) > 5000
ORDER BY TotalSales DESC;
```

Most beginners assume SQL executes exactly as written.

It does **not**.

SQL has:

- **Written (syntactic) order**
- **Logical execution order**
- **Physical execution order**

Understanding the difference is essential for writing correct and efficient SQL.

---

# Three Different Orders

```text
Developer writes SQL
        │
        ▼
Written Order (Syntax)
        │
        ▼
Logical Execution Order
        │
        ▼
Optimizer
        │
        ▼
Physical Execution Plan
        │
        ▼
Result
```

These three stages are distinct.

---

# Written Order

This is the order developers write SQL.

```sql
SELECT
FROM
WHERE
GROUP BY
HAVING
ORDER BY;
```

This order is designed for readability.

---

# Logical Execution Order

The SQL standard defines a logical order for processing a `SELECT` query.

```text
1. FROM

2. JOIN

3. WHERE

4. GROUP BY

5. HAVING

6. SELECT

7. DISTINCT

8. ORDER BY

9. LIMIT / FETCH / TOP
```

This is the conceptual model every SQL developer should know.

---

# Why FROM Comes First

The database must first determine:

"What data are we working with?"

```sql
FROM Orders
```

Only after identifying the source rows can it apply filters or calculations.

---

# JOIN

After locating the tables, relationships are evaluated.

```sql
FROM Customers

JOIN Orders
ON Customers.CustomerID = Orders.CustomerID
```

The result is a combined working dataset.

---

# WHERE

Now rows are filtered.

```sql
WHERE Status = 'Completed'
```

Rows removed here never participate in grouping or aggregation.

---

# GROUP BY

Remaining rows are grouped.

```sql
GROUP BY CustomerID
```

Individual rows become groups.

---

# HAVING

After groups are created, aggregate filters are applied.

```sql
HAVING COUNT(*) > 5
```

Unlike `WHERE`, `HAVING` filters groups, not individual rows.

---

# SELECT

Only now are the requested columns calculated and projected.

```sql
SELECT
    CustomerName,
    COUNT(*)
```

This explains why aliases created in `SELECT` are generally unavailable in `WHERE`.

---

# DISTINCT

Duplicate rows are removed after projection.

```sql
SELECT DISTINCT
CustomerName
```

---

# ORDER BY

Sorting occurs after the result set has been constructed.

```sql
ORDER BY CustomerName
```

---

# LIMIT / FETCH / TOP

Finally, only the required rows are returned.

Examples:

```sql
LIMIT 10
```

```sql
FETCH FIRST 10 ROWS ONLY
```

```sql
TOP 10
```

---

# Visual Representation

```text
SQL Query

↓

FROM

↓

JOIN

↓

WHERE

↓

GROUP BY

↓

HAVING

↓

SELECT

↓

DISTINCT

↓

ORDER BY

↓

LIMIT
```

This diagram is worth memorizing.

---

# Why Aliases Don't Work in WHERE

Example:

```sql
SELECT
    Salary * 12 AS AnnualSalary
FROM Employees
WHERE AnnualSalary > 50000;
```

Error.

Why?

Because logically:

```text
WHERE

↓

SELECT
```

The alias doesn't exist yet.

Correct solution:

```sql
SELECT
    Salary * 12 AS AnnualSalary
FROM Employees
WHERE Salary * 12 > 50000;
```

Or use a subquery/CTE.

---

# Logical Order vs Physical Execution

Logical order describes **what** must happen.

Physical execution describes **how** the optimizer actually performs it.

For example:

```text
Logical

FROM

↓

WHERE

↓

SELECT
```

Optimizer may decide:

```text
Index Scan

↓

Predicate Pushdown

↓

Hash Join

↓

Projection
```

The result remains logically equivalent.

---

# Optimizer Transformations

Modern optimizers frequently rewrite queries.

Examples include:

- Predicate pushdown
- Join reordering
- Constant folding
- Projection pruning
- Subquery unnesting
- Index-only scans

These optimizations preserve query semantics while reducing execution cost.

---

# 🏗️ Architecture Insight

The logical execution order is defined by the SQL language, but the physical execution order is chosen by the query optimizer. The optimizer is free to reorder joins, push predicates closer to data, eliminate unnecessary operations, or choose different access methods as long as the final result matches the logical SQL semantics.

---

# ⚡ Performance Tip

Filtering rows early (through selective predicates and good indexing) usually reduces the amount of data processed by later stages such as grouping and sorting. Although the optimizer often performs predicate pushdown automatically, well-written SQL makes these optimizations easier.

---

# 🔒 Security Note

Execution order becomes especially important when implementing row-level security or security policies. Security predicates are generally applied before users see any rows, ensuring unauthorized data is filtered out regardless of the query structure.

---

# 🌍 Production Consideration

Large analytical queries may process billions of rows. Understanding logical execution order helps developers identify where expensive operations such as joins, aggregations, and sorts occur, making execution plans easier to interpret and optimize.

---

# 🚀 Enterprise Practice

Professional developers validate assumptions about execution order using **execution plans** rather than relying solely on query syntax. Understanding both logical and physical execution enables more effective performance tuning.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Logical Execution Order | Standardized | ✅ | ✅ | ✅ | ✅ | ✅ |
| Row Limiting | `FETCH FIRST` | `LIMIT` + `FETCH` | `LIMIT` | `TOP` + `OFFSET/FETCH` | `FETCH FIRST` | `LIMIT` |
| Optimizer Rewrites | Allowed | Extensive | Extensive | Extensive | Extensive | Moderate |

> **Note:** While the SQL standard defines the logical processing order, each database engine implements its own cost-based optimizer and physical execution strategies. As a result, execution plans may differ significantly between vendors even for identical SQL.

---

# Common Mistakes

- Assuming SQL executes from top to bottom.
- Using SELECT aliases in WHERE.
- Confusing WHERE with HAVING.
- Believing ORDER BY occurs before GROUP BY.
- Assuming execution plans always match the written SQL.

---

# Best Practices

✔ Learn the logical execution order by heart.

✔ Use WHERE for row filtering.

✔ Use HAVING only for aggregate filtering.

✔ Verify optimizer decisions with execution plans.

✔ Remember that logical order and physical execution are different concepts.

---

# 💡 Did You Know?

A query written in one order may be executed in a completely different physical order by the optimizer. Despite these transformations, the DBMS must still produce the same logical result defined by the SQL standard.

---

# Quick Reference

| Stage | Purpose |
|--------|---------|
| FROM | Select source tables |
| JOIN | Combine related tables |
| WHERE | Filter individual rows |
| GROUP BY | Form groups |
| HAVING | Filter groups |
| SELECT | Project output columns |
| DISTINCT | Remove duplicates |
| ORDER BY | Sort results |
| LIMIT / FETCH / TOP | Restrict returned rows |

---

# Interview Questions

## Basic

1. Does SQL execute from top to bottom?
2. What is the logical execution order of a SELECT statement?
3. Why can't SELECT aliases usually be referenced in the WHERE clause?

### Intermediate

4. Compare WHERE and HAVING in terms of execution order.
5. Explain the difference between logical execution order and physical execution order.
6. Why does ORDER BY occur after SELECT?

### Advanced

7. How does a cost-based optimizer transform a query while preserving logical correctness?
8. What is predicate pushdown, and why is it beneficial?
9. How would you explain SQL execution order to a new database engineer?

---

# Hands-on Exercises

### Exercise 1

Write a SELECT query that uses FROM, JOIN, WHERE, GROUP BY, HAVING, ORDER BY, and LIMIT. Identify the logical execution order of each clause.

### Exercise 2

Create a query that incorrectly references a SELECT alias in the WHERE clause. Fix it using both a repeated expression and a Common Table Expression (CTE).

### Exercise 3

Run the same query on two different DBMSs (e.g., PostgreSQL and MySQL). Compare the execution plans and identify differences in the chosen physical operations.

### Exercise 4

Using a sample dataset, predict how many rows remain after each logical stage (FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY).

---

# Related Topics

- **04.03 — SQL Processing Pipeline**
- **04.05 — SQL Clauses**
- **04.06 — SQL Operators & Expressions**
- **04.10 — Data Query Language (DQL) Deep Dive**
- **05.01 — SELECT Statement**

---

# Summary

Although SQL is written in a human-friendly order, it is processed according to a logical execution order defined by the SQL standard. The query optimizer is then free to choose a different physical execution strategy, provided it produces the same logical result. Understanding these three perspectives—written syntax, logical processing, and physical execution—is fundamental to writing correct, efficient, and enterprise-grade SQL queries.