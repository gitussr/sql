---
title: "05.07 - DISTINCT"
description: "Learn how SQL DISTINCT removes duplicate rows, how database engines implement duplicate elimination, and when DISTINCT should or should not be used."
chapter: 5
section: 5.07
category: Data Query Language (DQL)
difficulty: Beginner → Advanced
readingTime: 60 min
lastUpdated: 2026-08-04
---

# 05.07 DISTINCT

---

# Learning Objectives

After completing this section, you will be able to:

- Understand the purpose of `DISTINCT`.
- Eliminate duplicate rows correctly.
- Understand duplicate elimination algorithms.
- Explain how `DISTINCT` differs from `GROUP BY`.
- Use `COUNT(DISTINCT ...)`.
- Understand how `NULL` behaves with `DISTINCT`.
- Analyze execution plans involving duplicate elimination.
- Apply enterprise best practices.

---

# What is DISTINCT?

`DISTINCT` removes duplicate rows from the result set.

Without DISTINCT:

```sql
SELECT
    Department
FROM Employees;
```

Result

| Department |
|------------|
| HR |
| IT |
| HR |
| Sales |
| IT |

With DISTINCT:

```sql
SELECT DISTINCT
    Department
FROM Employees;
```

Result

| Department |
|------------|
| HR |
| IT |
| Sales |

Each unique value appears only once.

---

# Why Do Duplicates Exist?

Duplicates naturally occur in relational databases.

Example:

Employees table

| Employee | Department |
|-----------|------------|
| Alice | HR |
| Bob | HR |
| Carol | IT |
| David | IT |
| Emma | Sales |

Multiple employees belong to the same department.

Selecting only the department produces duplicates.

---

# Basic Syntax

```sql
SELECT DISTINCT
    column_list
FROM table_name;
```

Example:

```sql
SELECT DISTINCT
    Country
FROM Customers;
```

---

# DISTINCT on Multiple Columns

`DISTINCT` considers the **entire selected row**.

Example:

```sql
SELECT DISTINCT
    Country,
    City
FROM Customers;
```

Result:

| Country | City |
|----------|------|
| India | Kolkata |
| India | Delhi |
| Australia | Sydney |

Only duplicate **Country + City** combinations are removed.

---

# Visual Representation

Without DISTINCT

```text
HR

IT

HR

Sales

IT
```

↓

With DISTINCT

```text
HR

IT

Sales
```

---

# 📍 Execution Order Reminder

Logical execution order:

```text
1. FROM
2. JOIN
3. WHERE
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT   ← Duplicate elimination occurs here
8. ORDER BY
9. LIMIT / FETCH / TOP
```

Notice that `DISTINCT` is applied **after projection** (`SELECT`) but **before sorting**.

---

# DISTINCT Works on the Final Projection

Example:

```sql
SELECT DISTINCT
    Department
FROM Employees;
```

Only the projected column is considered.

Compare:

```sql
SELECT DISTINCT
    EmployeeName,
    Department
FROM Employees;
```

Even if departments repeat, different employee names make each row unique.

---

# DISTINCT vs SELECT *

```sql
SELECT DISTINCT *
FROM Employees;
```

This removes duplicate **entire rows**.

Since most well-designed tables have a primary key, complete duplicate rows are uncommon.

Therefore:

```sql
SELECT DISTINCT *
```

is rarely useful in normalized OLTP databases.

---

# DISTINCT and NULL

According to the SQL standard, `NULL` values are treated as one unique value for duplicate elimination.

Example

| Bonus |
|-------|
| NULL |
| NULL |
| 1000 |
| 1000 |

Query:

```sql
SELECT DISTINCT
    Bonus
FROM Employees;
```

Result

| Bonus |
|-------|
| NULL |
| 1000 |

Only one `NULL` appears.

---

# DISTINCT vs GROUP BY

These queries often produce identical results:

```sql
SELECT DISTINCT
    Department
FROM Employees;
```

```sql
SELECT
    Department
FROM Employees
GROUP BY Department;
```

However, their purpose differs.

| DISTINCT | GROUP BY |
|-----------|----------|
| Removes duplicates | Creates groups |
| Simpler syntax | Enables aggregation |
| No aggregates required | Usually used with aggregates |

Choose the construct that best matches your intent.

---

# COUNT(DISTINCT)

Count unique values.

```sql
SELECT
    COUNT(DISTINCT Department)
FROM Employees;
```

Example:

Departments:

```
HR

IT

IT

Sales

HR
```

Result:

```
3
```

This is one of the most frequently used analytical functions.

---

# DISTINCT with Expressions

Example:

```sql
SELECT DISTINCT
    UPPER(Country)
FROM Customers;
```

The expression is evaluated first.

Duplicate elimination occurs afterward.

---

# DISTINCT After JOIN

Example:

```sql
SELECT DISTINCT
    c.CustomerName
FROM Customers c
JOIN Orders o
    ON c.CustomerID = o.CustomerID;
```

A customer with multiple orders appears only once.

This is a common reporting pattern.

---

# How the DBMS Executes DISTINCT

Query:

```sql
SELECT DISTINCT
    Department
FROM Employees;
```

Execution:

```text
FROM Employees

↓

Read rows

↓

Project Department

↓

Remove duplicates

↓

Return unique values
```

The database must compare projected values before returning the final result.

---

# Duplicate Elimination Algorithms

Database engines typically choose between two strategies.

## 1. Sort-Based DISTINCT

```text
Read Rows

↓

Sort

↓

Compare Adjacent Values

↓

Remove Duplicates
```

Advantages:

- Efficient when sorting is already required.
- Produces ordered intermediate data.

Disadvantages:

- May require significant memory.
- Large datasets can spill to disk.

---

## 2. Hash-Based DISTINCT

```text
Read Rows

↓

Hash Table

↓

Detect Existing Values

↓

Keep Only Unique Rows
```

Advantages:

- Often faster for unsorted data.
- Avoids full sorting.

Disadvantages:

- Depends on available memory.
- Hash tables may spill to disk if they exceed memory limits.

The optimizer chooses the algorithm based on data size, indexes, available memory, and estimated costs.

---

# DISTINCT and Indexes

Indexes can make duplicate elimination much cheaper.

Suppose an index exists on:

```text
Department
```

The optimizer may scan the index instead of the table.

Benefits:

- Less I/O.
- Smaller data reads.
- Possible index-only scan.
- Faster duplicate elimination.

---

# DISTINCT on Large Tables

Imagine:

```
500 million rows
```

Query:

```sql
SELECT DISTINCT
    Country
FROM Customers;
```

Only:

```
220 countries
```

exist.

The engine must still examine the projected values from all qualifying rows before determining the final set of unique countries.

---

# How the Optimizer Thinks

The optimizer estimates:

```text
Expected Number of Rows

↓

Expected Number of Unique Values

↓

Available Indexes

↓

Memory Availability

↓

Sort Cost

↓

Hash Cost

↓

Choose Cheapest Plan
```

Statistics play a major role in this decision.

---

# 🔬 Engine Deep Dive

Internally, `DISTINCT` becomes a duplicate elimination operator in the execution plan.

```text
Developer writes

SELECT DISTINCT Department

        │

        ▼

Parser builds query tree

        │

        ▼

Projection operator

        │

        ▼

Optimizer estimates cardinality

        │

        ▼

Choose

Hash Aggregate

or

Sort + Unique

        │

        ▼

Execution Engine

        │

        ▼

Return unique rows
```

Many execution plans display this operator explicitly as:

- Hash Aggregate
- Stream Aggregate
- Unique
- Sort + Unique

depending on the DBMS.

---

# 🏗️ Architecture Insight

`DISTINCT` is not merely a display feature—it is a relational operator that changes the cardinality of the result set. Removing duplicates may require sorting, hashing, memory allocation, and temporary storage, making it one of the first operations where optimizer cost estimates become especially important.

---

# ⚡ Performance Tip

Avoid using `DISTINCT` to hide problems caused by incorrect joins. If duplicates originate from faulty join conditions, fix the join rather than masking the issue with duplicate elimination.

---

# 🔒 Security Note

`DISTINCT` does not affect authorization or data visibility. It changes only the shape of the returned result set. Security controls remain the responsibility of permissions, views, and row-level security.

---

# 🌍 Production Consideration

Business reports frequently require unique values for dropdown lists, filters, dashboards, and analytical summaries. In OLTP applications, however, unnecessary use of `DISTINCT` can add avoidable work to frequently executed queries.

---

# 🚀 Enterprise Practice

Experienced database engineers first investigate **why duplicates exist** before adding `DISTINCT`. In many systems, duplicate rows indicate missing join predicates, denormalized reporting queries, or data-quality issues rather than a genuine need for duplicate elimination.

---

# SQL Standard vs Vendor Differences

| Feature | ANSI SQL | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|-----------|------------|--------|------------|---------|---------|
| `DISTINCT` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-column DISTINCT | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `COUNT(DISTINCT ...)` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `DISTINCT ON (...)` | ❌ | ✅ (extension) | ❌ | ❌ | ❌ | ❌ |

> **Portability Tip:** `DISTINCT` is fully standardized. However, PostgreSQL's `DISTINCT ON (...)` is a vendor-specific extension that should not be used in portable SQL.

---

# Common Mistakes

### Mistake 1

Using `DISTINCT` to fix incorrect joins.

---

### Mistake 2

Believing `DISTINCT` sorts the result.

Sorting requires:

```sql
ORDER BY
```

---

### Mistake 3

Assuming `DISTINCT` is always inexpensive.

Large datasets may require substantial sorting or hashing.

---

### Mistake 4

Using `SELECT DISTINCT *` on normalized tables where primary keys already guarantee uniqueness.

---

# Best Practices

✔ Use `DISTINCT` only when uniqueness is part of the business requirement.

✔ Prefer fixing incorrect joins over masking duplicates.

✔ Create indexes on frequently deduplicated columns.

✔ Review execution plans for expensive duplicate elimination.

✔ Use `GROUP BY` when aggregation is required.

---

# Interview Questions

## Basic

1. What does `DISTINCT` do?
2. How does `DISTINCT` handle `NULL` values?
3. Can `DISTINCT` be applied to multiple columns?

### Intermediate

4. Explain the difference between `DISTINCT` and `GROUP BY`.
5. Why can `DISTINCT` become expensive on large datasets?
6. How do indexes help `DISTINCT` queries?

### Advanced

7. Compare sort-based and hash-based duplicate elimination.
8. Explain why `DISTINCT` is evaluated after `SELECT`.
9. Why is using `DISTINCT` to fix duplicate joins considered poor practice?

---

# Hands-on Exercises

## Exercise 1

Return a list of unique departments from an `Employees` table.

---

## Exercise 2

Return unique combinations of `Country` and `City`.

---

## Exercise 3

Count the number of unique product categories.

---

## Exercise 4

Explain why the following query may indicate a design problem:

```sql
SELECT DISTINCT
    c.CustomerName
FROM Customers c
JOIN Orders o
    ON c.CustomerID = o.CustomerID;
```

---

# Related Topics

- **05.06 — Expressions & Calculated Columns**
- **06.xx — WHERE Clause**
- **08.xx — GROUP BY**
- **08.xx — Aggregate Functions**
- **10.xx — Indexes**
- **15.xx — Query Optimization**

---

# Summary

`DISTINCT` removes duplicate rows from the projected result set, making it an essential tool for reporting and analytics. Internally, however, duplicate elimination is a sophisticated relational operation that may use sorting or hashing, consume memory, leverage indexes, and influence execution plans. Understanding how and when to use `DISTINCT`—and when to redesign a query instead—is a key step toward writing efficient, enterprise-grade SQL.