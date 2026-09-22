---
title: "Chapter 07 - JOINs"
description: "Master SQL JOINs: combining tables with INNER, LEFT, RIGHT, FULL, CROSS and self joins, ON versus WHERE, NULL behaviour, semi- and anti-joins, join algorithms, and the indexing strategy that makes multi-table queries fast."
chapter: 7
section: Introduction
category: Data Query Language (DQL)
difficulty: Beginner → Advanced
readingTime: 25 min
lastUpdated: 2026-09-22
---

# Chapter 07 — JOINs

> *"A database stores each fact in one place. A JOIN is how you put those facts back together."*

---

# Learning Objectives

By the end of this chapter, you will be able to:

- Explain why normalized databases require joins.
- Write `INNER`, `LEFT`, `RIGHT`, `FULL OUTER`, `CROSS` and self joins.
- Choose the correct join type for a question.
- Distinguish a join condition (`ON`) from a row filter (`WHERE`).
- Predict how `NULL` behaves in every join type.
- Use `USING` and `NATURAL JOIN`—and know when not to.
- Join three or more tables without losing or duplicating rows.
- Express "exists" and "does not exist" questions with semi- and anti-joins.
- Describe nested loop, hash and merge joins, and when each is chosen.
- Index and write joins so that they stay fast as tables grow.

---

# Introduction

Chapter 05 taught you how to **choose columns**. Chapter 06 taught you how to **choose rows**.

This chapter teaches you how to **combine tables**.

Real databases never keep everything in one table. Customers live in `Customers`, their orders in `Orders`, the lines of each order in `OrderItems`, and the catalogue in `Products`. That separation is deliberate: it stores each fact once, keeps updates cheap, and prevents contradictions.

The price of the design is that almost every interesting question spans tables:

- Which customers placed orders last month?
- Which products were never ordered?
- Which employees have no manager?
- What did each order cost, by customer and by country?

A `JOIN` answers these questions by matching rows in one table with rows in another and producing a single combined result.

Joins are also where most serious query bugs are born. A missing join condition multiplies your data. A `LEFT JOIN` filtered in the wrong clause silently becomes an inner join. A join on a nullable column quietly drops rows. This chapter treats each of those as a first-class topic.

---

# What is a JOIN?

A join takes two row sources, tests candidate pairs against a **join condition**, and produces the pairs that satisfy it.

```text
Customers                 Orders
┌────┬──────────┐         ┌─────┬────────────┬────────┐
│ ID │ Name     │         │ ID  │ CustomerID │ Amount │
├────┼──────────┤         ├─────┼────────────┼────────┤
│ 1  │ Ada      │         │ 101 │ 1          │ 250.00 │
│ 2  │ Grace    │         │ 102 │ 1          │  80.00 │
│ 3  │ Linus    │         │ 103 │ 2          │ 500.00 │
└────┴──────────┘         └─────┴────────────┴────────┘

            JOIN ON Customers.ID = Orders.CustomerID

┌────┬──────────┬─────┬────────┐
│ ID │ Name     │ ID  │ Amount │
├────┼──────────┼─────┼────────┤
│ 1  │ Ada      │ 101 │ 250.00 │
│ 1  │ Ada      │ 102 │  80.00 │
│ 2  │ Grace    │ 103 │ 500.00 │
└────┴──────────┴─────┴────────┘
```

Two observations explain most join behaviour:

1. **A row can appear more than once.** Ada has two orders, so Ada appears twice.
2. **A row can disappear.** Linus has no orders, so an inner join drops him. Keeping him is exactly what an outer join is for.

---

# Basic Syntax

```sql
SELECT column_list
FROM left_table
JOIN right_table
    ON join_condition;
```

Example:

```sql
SELECT
    c.CustomerName,
    o.OrderID,
    o.TotalAmount
FROM Customers AS c
INNER JOIN Orders AS o
    ON o.CustomerID = c.CustomerID;
```

Table aliases (`c`, `o`) are not decoration: once two tables are in play, every ambiguous column must be qualified, and aliases keep that readable.

---

# The Sample Schema

Every section of this chapter uses the same small schema.

```sql
CREATE TABLE Customers (
    CustomerID   INT PRIMARY KEY,
    CustomerName VARCHAR(100) NOT NULL,
    Country      VARCHAR(50)
);

CREATE TABLE Orders (
    OrderID     INT PRIMARY KEY,
    CustomerID  INT REFERENCES Customers(CustomerID),
    OrderDate   DATE          NOT NULL,
    TotalAmount DECIMAL(10,2) NOT NULL
);

CREATE TABLE Products (
    ProductID   INT PRIMARY KEY,
    ProductName VARCHAR(100) NOT NULL,
    CategoryID  INT
);

CREATE TABLE OrderItems (
    OrderItemID INT PRIMARY KEY,
    OrderID     INT REFERENCES Orders(OrderID),
    ProductID   INT REFERENCES Products(ProductID),
    Quantity    INT           NOT NULL,
    UnitPrice   DECIMAL(10,2) NOT NULL
);

CREATE TABLE Employees (
    EmployeeID   INT PRIMARY KEY,
    EmployeeName VARCHAR(100) NOT NULL,
    ManagerID    INT REFERENCES Employees(EmployeeID),
    DepartmentID INT
);
```

```text
Customers ──1:N── Orders ──1:N── OrderItems ──N:1── Products

Employees ── self-referencing (ManagerID → EmployeeID)
```

---

# The JOIN Family

| Join | Keeps | Typical question |
|------|-------|------------------|
| `INNER JOIN` | Matching pairs only | "Customers **and** their orders" |
| `LEFT JOIN` | All left rows, plus matches | "All customers, **with** orders if any" |
| `RIGHT JOIN` | All right rows, plus matches | Mirror image of `LEFT JOIN` |
| `FULL OUTER JOIN` | All rows from both sides | "Everything, matched where possible" |
| `CROSS JOIN` | Every combination | "Every product in every size" |
| Self join | A table joined to itself | "Each employee and their manager" |
| Semi-join (`EXISTS`) | Left rows that have a match | "Customers **who have** ordered" |
| Anti-join (`NOT EXISTS`) | Left rows with no match | "Customers who have **never** ordered" |

```text
     INNER              LEFT              RIGHT              FULL

   A ┌───┬───┐ B      A ┌───┬───┐ B     A ┌───┬───┐ B     A ┌───┬───┐ B
     │   │███│          │███│███│         │   │███│███      │███│███│███
     │   │███│          │███│███│         │   │███│███      │███│███│███
     └───┴───┘          └───┴───┘         └───┴───┘         └───┴───┘

   only the overlap   all of A + overlap  overlap + all of B   everything
```

---

# 📍 Execution Order Reminder

Joins are resolved **before** filtering, grouping and projection:

```text
1. FROM
2. JOIN    ← Tables are combined here
3. WHERE
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

> Because joins run before `SELECT`, a join condition cannot use a `SELECT` alias. Because they run before `WHERE`, the difference between "combine" and "filter" changes results rather than style. Section 07.11 explores that in depth.

---

# How the DBMS Executes This

A join is never literally "every row against every row" unless the optimizer has no better option.

```text
SQL Statement
        │
        ▼
Parser
        │
        ▼
Join order chosen
(which table is read first?)
        │
        ▼
Join algorithm chosen
(Nested Loop / Hash Join / Merge Join)
        │
        ▼
Access path per table
(Index Seek / Index Scan / Table Scan)
        │
        ▼
Combined rows flow to WHERE
```

Three decisions—join order, join algorithm and access path—determine whether a join costs milliseconds or minutes. Sections 07.14 and 07.15 cover them in detail.

---

# Chapter Structure

| Section | Topic |
|---------|-------|
| 07.01 | Introduction to JOINs |
| 07.02 | JOIN Syntax |
| 07.03 | INNER JOIN |
| 07.04 | LEFT JOIN (LEFT OUTER JOIN) |
| 07.05 | RIGHT JOIN (RIGHT OUTER JOIN) |
| 07.06 | FULL OUTER JOIN |
| 07.07 | CROSS JOIN |
| 07.08 | SELF JOIN |
| 07.09 | NATURAL JOIN and USING |
| 07.10 | Joining Multiple Tables |
| 07.11 | ON vs WHERE (Join Conditions and Filters) |
| 07.12 | NULL Handling in JOINs |
| 07.13 | Semi-Joins and Anti-Joins (EXISTS and NOT EXISTS) |
| 07.14 | Execution Flow of JOINs (Join Algorithms) |
| 07.15 | JOIN Performance and Index Strategy |
| 07.16 | Common JOIN Mistakes & Best Practices |
| 07.17 | JOIN Cheat Sheet & Visual Knowledge Map |

---

# Real-World Examples

## E-Commerce

```sql
SELECT
    c.CustomerName,
    o.OrderID,
    o.TotalAmount
FROM Customers AS c
INNER JOIN Orders AS o
    ON o.CustomerID = c.CustomerID
WHERE o.OrderDate >= DATE '2026-09-01';
```

Orders placed this month, with the customer who placed them.

---

## Banking

```sql
SELECT
    a.AccountNumber,
    t.TransactionDate,
    t.Amount
FROM Accounts AS a
LEFT JOIN Transactions AS t
    ON t.AccountID = a.AccountID;
```

Every account, including those with no transactions at all.

---

## Hospital

```sql
SELECT
    p.PatientName,
    d.DoctorName
FROM Admissions AS a
INNER JOIN Patients AS p ON p.PatientID = a.PatientID
INNER JOIN Doctors  AS d ON d.DoctorID  = a.AttendingDoctorID;
```

Patients and their attending doctors—a three-table join.

---

## HRMS

```sql
SELECT
    e.EmployeeName,
    m.EmployeeName AS ManagerName
FROM Employees AS e
LEFT JOIN Employees AS m
    ON m.EmployeeID = e.ManagerID;
```

Everyone, including the CEO, whose manager is `NULL`.

---

## Social Media

```sql
SELECT
    u.Username
FROM Users AS u
WHERE NOT EXISTS (
    SELECT 1
    FROM Posts AS p
    WHERE p.UserID = u.UserID
);
```

Users who have never posted—an anti-join.

---

# 🏗️ Architecture Insight

Joins are the runtime cost of normalization. Normalizing removes duplication and update anomalies at write time; joins pay part of that back at read time. The trade is almost always worth it—storage and CPU are cheap, contradictory data is not—but it is a trade. When read cost becomes the constraint, the answer is usually better indexes first, then pre-computed or materialized structures, and only rarely denormalization of the source tables.

---

# ⚡ Performance Tip

Join cost is driven by how many rows reach the join, not by how many the query returns. Filtering early, joining on indexed key columns, and selecting only the columns you need all shrink the intermediate result. A join that reads two million rows to return ten is doing far more work than the answer requires.

---

# 🔒 Security Note

Joins routinely cross authorization boundaries: one table holds the data, another holds ownership. Tenant and permission predicates must constrain the *joined* result, not just one side. A tenant check placed in the `ON` clause of an outer join, or combined with `OR` across tables, can expose rows belonging to other accounts. Section 07.11 shows exactly how that happens.

---

# 🌍 Production Consideration

The most damaging join bugs are silent. A missing join condition produces a Cartesian product, inflating totals rather than raising an error. A duplicated key in a lookup table doubles every downstream amount. Comparing row counts before and after adding a join, and validating totals against a known figure, catches these problems long before a report reaches a customer.

---

# 🚀 Enterprise Practice

Enterprise SQL standards almost always require explicit `JOIN ... ON` syntax, forbid comma-separated joins in the `FROM` clause, require every table to be aliased, and require every column in a multi-table query to be qualified. These rules exist because they make missing or wrong join conditions visible during code review instead of during an incident.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `INNER` / `LEFT` / `RIGHT JOIN` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `FULL OUTER JOIN` | ✅ | ✅ | ❌ (emulate) | ✅ | ✅ | ✅ (3.39+) |
| `CROSS JOIN` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `NATURAL JOIN` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `USING (col)` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `LATERAL` / `CROSS APPLY` | ✅ (`LATERAL`) | ✅ | ✅ (8.0.14+) | ✅ (`APPLY`) | ✅ | ❌ |

> **Portability Tip:** Explicit `INNER`, `LEFT` and `RIGHT JOIN ... ON` behave identically everywhere. `FULL OUTER JOIN`, `USING` and `NATURAL JOIN` are the portability hazards, and legacy operators—Oracle's `(+)` and SQL Server's `*=`—should never appear in new code.

---

# Common Mistakes

- Omitting the join condition and producing a Cartesian product.
- Filtering the right-hand table of a `LEFT JOIN` in `WHERE`, turning it into an inner join.
- Assuming a join returns one row per left row when the right table holds duplicates.
- Using `NATURAL JOIN`, which silently changes meaning when a column is added.
- Joining columns of different data types, disabling index use.
- Using `SELECT *` in a join and shipping duplicated key columns.

---

# Best Practices

✔ Always use explicit `JOIN ... ON` syntax.

✔ Alias every table and qualify every column.

✔ Join on indexed key columns of matching data types.

✔ Put join logic in `ON` and row filters in `WHERE`—except conditions on the optional side of an outer join.

✔ Know the cardinality of each join (1:1, 1:N, N:M) before you write it.

✔ Verify row counts and totals whenever a join is added to an existing query.

---

# 💡 Did You Know?

The relational join was defined by E. F. Codd in 1970 as an operation of relational algebra, years before SQL existed. The `JOIN ... ON` keyword only arrived with SQL-92; before that everyone wrote comma joins with the conditions in `WHERE`. That is why so much legacy SQL still looks that way—and why so much of it contains accidental Cartesian products.

---

# Related Topics

- **Chapter 06 — WHERE Clause**
- **05.11 — FROM Clause (Deep Dive)**
- **06.10 — EXISTS and Subqueries in WHERE (Introduction)**
- **06.12 — SARGability and Index-Friendly Predicates**
- **03.08 — Relationships in Databases**
- **08.xx — GROUP BY and HAVING**
- **10.xx — Indexes**

---

# Summary

A `JOIN` combines rows from two or more tables by testing candidate pairs against a join condition. Inner joins keep only matching pairs; outer joins preserve the rows of one or both sides and fill the missing half with `NULL`; cross joins produce every combination. Joins are evaluated early in the logical execution order, before `WHERE`, `GROUP BY` and `SELECT`, which is why the choice between a join condition and a filter changes results rather than just style. Understanding cardinality, `NULL` behaviour and the three join algorithms is what separates queries that merely return rows from queries that return the right rows, quickly.
