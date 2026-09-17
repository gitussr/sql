---
title: "05.03 - SELECT *"
description: "Understand the purpose of SELECT *, when it should be used, why it is discouraged in production systems, and its impact on performance, maintainability, and enterprise applications."
chapter: 5
section: 5.03
category: Data Query Language (DQL)
difficulty: Beginner → Advanced
readingTime: 40 min
lastUpdated: 2026-08-04
---

# 05.03 SELECT *

---

# Learning Objectives

After completing this section, you will be able to:

- Understand what `SELECT *` means.
- Know when it is appropriate.
- Understand why it is discouraged in production.
- Explain its performance implications.
- Understand its effect on indexes, APIs, ORMs, and schema evolution.
- Apply enterprise best practices.

---

# What Does `SELECT *` Mean?

The asterisk (`*`) is a **wildcard** that represents **all columns** from the specified table or view.

Example:

```sql
SELECT *
FROM Customers;
```

Instead of listing individual columns, the database expands `*` into every available column.

If the `Customers` table contains:

```text
CustomerID
CustomerName
Email
Phone
Country
Status
CreatedAt
UpdatedAt
```

the database internally treats the query approximately as:

```sql
SELECT
    CustomerID,
    CustomerName,
    Email,
    Phone,
    Country,
    Status,
    CreatedAt,
    UpdatedAt
FROM Customers;
```

The exact expansion occurs during query compilation based on the table metadata.

---

# Why Does SQL Support `*`?

`SELECT *` exists primarily for convenience.

Typical scenarios include:

- Learning SQL.
- Exploring unfamiliar tables.
- Debugging.
- Ad-hoc data analysis.
- Database administration.
- Interactive SQL consoles.

It reduces typing and allows quick inspection of data.

---

# Basic Example

```sql
SELECT *
FROM Employees;
```

Result:

| EmployeeID | EmployeeName | Department | Salary | HireDate |
|------------|--------------|------------|---------|----------|
| 101 | Alice | HR | 65000 | 2023-01-10 |
| 102 | Bob | IT | 78000 | 2022-07-15 |

All columns are returned.

---

# Visual Representation

```text
Customers Table

┌────────────────────────────┐
│ CustomerID                 │
│ CustomerName               │
│ Email                      │
│ Phone                      │
│ Country                    │
│ Status                     │
│ CreatedAt                  │
│ UpdatedAt                  │
└────────────────────────────┘

        │

SELECT *

        │

        ▼

Returns every column
```

---

# `SELECT *` Is Expanded by the Parser

Internally, the parser resolves the wildcard using the database catalog.

```text
SQL Text

↓

Parser

↓

Find table metadata

↓

Expand *

↓

Build internal query tree

↓

Optimizer

↓

Execution Plan
```

The optimizer works with the expanded column list, not the literal `*`.

---

# 📍 Execution Order Reminder

Although `SELECT *` appears first, column projection happens **after** the source rows have been identified.

```text
1. FROM
2. JOIN
3. WHERE
4. GROUP BY
5. HAVING
6. SELECT (* expands here)
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

The database must know **which rows exist** before projecting **which columns** to return.

---

# Advantages of `SELECT *`

### Simplicity

```sql
SELECT *
FROM Products;
```

Easy to write and read.

---

### Exploration

Useful when learning a new schema.

---

### Debugging

Helpful when checking data during development.

---

### Administration

Database administrators frequently use `SELECT *` for quick inspections.

---

# Disadvantages of `SELECT *`

## 1. Retrieves Unnecessary Data

Suppose a table contains 50 columns.

If an application only needs:

```text
CustomerName
Email
```

using:

```sql
SELECT *
FROM Customers;
```

returns all 50 columns.

This increases:

- Network traffic
- Memory usage
- CPU work
- Serialization cost

---

## 2. Reduced Readability

Compare:

```sql
SELECT *
FROM Orders;
```

with:

```sql
SELECT
    OrderID,
    CustomerID,
    OrderDate,
    TotalAmount
FROM Orders;
```

The second query immediately communicates its intent.

---

## 3. Schema Changes Can Break Applications

Imagine an API originally returns:

```text
ID
Name
Email
```

Later, a new column is added:

```text
PasswordHash
```

If the API uses:

```sql
SELECT *
```

the additional column may unintentionally be exposed.

Explicit column lists help avoid such risks.

---

## 4. Prevents Some Index-Only Scans

If an index contains only:

```text
CustomerID
CustomerName
```

then:

```sql
SELECT
    CustomerID,
    CustomerName
```

may be satisfied entirely from the index.

Using:

```sql
SELECT *
```

usually requires accessing the underlying table to retrieve the remaining columns.

This can increase disk I/O and reduce performance.

---

## 5. Increased Network Traffic

Every unnecessary column consumes bandwidth.

In distributed systems or cloud environments, reducing transferred data improves responsiveness and may lower infrastructure costs.

---

## 6. API Contract Instability

Applications often rely on stable response structures.

Using explicit column lists ensures predictable output.

---

# Real-World Examples

## Good for Exploration

```sql
SELECT *
FROM Customers
LIMIT 10;
```

Quickly inspect the table.

---

## Better for Production

```sql
SELECT
    CustomerID,
    CustomerName,
    Email
FROM Customers;
```

Only required data is returned.

---

## Reporting

```sql
SELECT
    Department,
    Salary
FROM Employees;
```

No unnecessary columns are transferred.

---

# How the DBMS Executes This

Consider:

```sql
SELECT *
FROM Customers;
```

Execution flow:

```text
SQL Statement
        │
        ▼
Parser
        │
        ▼
Expand *
        │
        ▼
Semantic Analysis
        │
        ▼
Optimizer
        │
        ▼
Execution Plan
        │
        ▼
Read Required Rows
        │
        ▼
Return All Columns
```

The optimizer never executes a literal `*`; it operates on the expanded column list.

---

# 🏗️ Architecture Insight

The wildcard is resolved before optimization. Once expanded, the optimizer evaluates access paths based on the actual columns required. This is why explicit column lists can enable more efficient execution strategies.

---

# ⚡ Performance Tip

On wide tables (dozens or hundreds of columns), retrieving only the required columns can significantly reduce:

- Disk reads
- Memory consumption
- Network transfer
- Query execution time

Always measure performance with execution plans rather than assuming.

---

# 🔒 Security Note

Avoid `SELECT *` on tables containing sensitive information such as:

- Password hashes
- Authentication tokens
- National IDs
- Medical records
- Salary details
- Financial information

Returning only approved columns reduces the risk of accidental data exposure.

---

# 🌍 Production Consideration

Many production systems expose database results through REST or GraphQL APIs.

Explicit column lists create stable API contracts and prevent unexpected changes when the schema evolves.

---

# 🚀 Enterprise Practice

Most organizations prohibit `SELECT *` in production code except for controlled administrative or diagnostic scenarios. Code review tools and SQL linters often flag wildcard usage automatically.

---

# SQL Standard vs Vendor Differences

| Feature | ANSI SQL | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|-----------|------------|--------|------------|---------|---------|
| `SELECT *` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `table.*` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `alias.*` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

Example:

```sql
SELECT
    c.*,
    o.OrderDate
FROM Customers AS c
JOIN Orders AS o
    ON c.CustomerID = o.CustomerID;
```

Here, only all columns from `Customers` are expanded, plus the explicitly selected `OrderDate`.

---

# Common Mistakes

### Mistake 1

Using `SELECT *` in production APIs.

---

### Mistake 2

Assuming `SELECT *` is always slower.

Reality: On small tables or administrative queries, the difference may be negligible. The impact depends on table width, indexes, storage, and workload.

---

### Mistake 3

Using `SELECT *` in joins.

```sql
SELECT *
FROM Customers
JOIN Orders
ON Customers.CustomerID = Orders.CustomerID;
```

This may return duplicate or unnecessary columns, making result sets harder to understand and increasing data transfer.

---

# Best Practices

✔ Use `SELECT *` only for exploration, debugging, and administrative tasks.

✔ Explicitly list required columns in production code.

✔ Keep API responses stable.

✔ Avoid retrieving sensitive data unnecessarily.

✔ Review execution plans for frequently executed queries.

✔ Consider index-only scans when selecting columns.

---

# Interview Questions

## Basic

1. What does `SELECT *` do?
2. What does the `*` wildcard represent?
3. Is `SELECT *` part of the SQL standard?

### Intermediate

4. Why is `SELECT *` discouraged in production?
5. How does `SELECT *` affect network usage?
6. How can `SELECT *` impact index-only scans?

### Advanced

7. At what stage does the database expand the `*` wildcard?
8. Why can schema evolution make `SELECT *` risky?
9. Explain why `SELECT *` may increase total query cost even when execution time appears similar.

---

# Hands-on Exercises

### Exercise 1

Rewrite the following query without using `*`:

```sql
SELECT *
FROM Employees;
```

---

### Exercise 2

List three situations where `SELECT *` is appropriate.

---

### Exercise 3

List three situations where `SELECT *` should be avoided.

---

### Exercise 4

Given a table with 100 columns, identify the potential disadvantages of using `SELECT *` when only five columns are needed.

---

# Related Topics

- **05.01 — Introduction to SELECT**
- **05.02 — SELECT Syntax**
- **05.04 — Selecting Specific Columns**
- **10.xx — Indexes and Covering Indexes**
- **15.xx — Query Optimization**

---

# Summary

The `SELECT *` wildcard provides a convenient way to retrieve every column from a table, making it valuable for exploration, debugging, and administrative work. However, production systems typically avoid it because it can increase network traffic, reduce readability, expose unintended data, hinder index-only scans, and make applications more fragile as schemas evolve. Professional SQL development favors explicit column lists that clearly express intent, improve maintainability, and enable the optimizer to choose more efficient execution strategies.