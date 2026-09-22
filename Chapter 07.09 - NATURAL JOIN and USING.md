---
title: "07.09 - NATURAL JOIN and USING"
description: "NATURAL JOIN and USING compared with ON: implicit column matching, merged join columns, why NATURAL JOIN is fragile under schema change, USING with SELECT *, portability gaps, and safe migration to explicit ON conditions."
chapter: 7
section: 7.09
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 30 min
lastUpdated: 2026-09-22
---

# 07.09 NATURAL JOIN and USING

---

# Learning Objectives

After completing this section, you will be able to:

- Explain what `NATURAL JOIN` matches, and how it decides.
- Use `USING` and describe how it merges the join column.
- Contrast both with an explicit `ON` condition.
- Explain why `NATURAL JOIN` breaks when a schema changes.
- Know where each form is unsupported.
- Rewrite legacy `NATURAL JOIN` code safely.

---

# NATURAL JOIN

`NATURAL JOIN` joins on **every column the two tables share by name**, with no condition written at all.

```sql
SELECT *
FROM Customers
NATURAL JOIN Orders;
```

If `Customers` and `Orders` share only `CustomerID`, this is equivalent to:

```sql
SELECT *
FROM Customers AS c
INNER JOIN Orders AS o
    ON o.CustomerID = c.CustomerID;
```

with one difference: the shared column appears **once** in the output, not twice.

```text
Customers(CustomerID, CustomerName, Country)
Orders   (OrderID, CustomerID, OrderDate, TotalAmount)

Shared column names: CustomerID

NATURAL JOIN → ON o.CustomerID = c.CustomerID
Output columns: CustomerID, CustomerName, Country, OrderID, OrderDate, TotalAmount
```

`NATURAL LEFT JOIN` and `NATURAL FULL JOIN` also exist, applying the same implicit matching.

---

# Why NATURAL JOIN Is Dangerous

The join condition is derived from column *names*, so it changes whenever the schema changes—silently.

**Scenario.** Both tables gain an audit column:

```sql
ALTER TABLE Customers ADD CreatedAt TIMESTAMP;
ALTER TABLE Orders    ADD CreatedAt TIMESTAMP;
```

The query text has not changed. Its meaning has:

```text
Before:  ON o.CustomerID = c.CustomerID
After:   ON o.CustomerID = c.CustomerID
        AND o.CreatedAt  = c.CreatedAt      ← added automatically
```

Almost no rows now match, and the query returns an empty or nearly empty result with no error.

Common columns that cause this: `CreatedAt`, `UpdatedAt`, `Status`, `Name`, `Description`, `IsActive`, `Version`, `TenantID`.

Other failure modes:

| Problem | Effect |
|---------|--------|
| No shared column names | Becomes a cross join (or an error, depending on the database) |
| Shared name, different meaning | `Customers.ID` vs `Products.ID`—joins nonsense |
| Renamed column | Join condition silently disappears |
| Reader cannot see the condition | Review and debugging require the full schema |

The verdict is near-unanimous in professional practice: **do not use `NATURAL JOIN` in application code.**

---

# USING

`USING` is the middle ground: you name the columns, but they must be identically named in both tables.

```sql
SELECT
    CustomerID,
    CustomerName,
    OrderID
FROM Customers
INNER JOIN Orders USING (CustomerID);
```

Equivalent to `ON o.CustomerID = c.CustomerID`, with the same column-merging behaviour as `NATURAL JOIN`, but the condition is explicit and immune to new columns.

Multiple columns are allowed:

```sql
SELECT *
FROM OrderItems
INNER JOIN Inventory USING (ProductID, WarehouseID);
```

---

# The Merged Column

`USING` produces one column for each joined name, and that column must be referenced **unqualified**:

```sql
-- ✅
SELECT CustomerID FROM Customers JOIN Orders USING (CustomerID);

-- ❌ In strict databases, the merged column may not be qualified
SELECT c.CustomerID FROM Customers c JOIN Orders o USING (CustomerID);
```

The merge is genuinely useful for outer joins, where the two key columns are each incomplete:

```sql
-- With ON: two columns, each NULL for rows from the other side
SELECT c.CustomerID, o.CustomerID
FROM Customers AS c
FULL OUTER JOIN Orders AS o ON o.CustomerID = c.CustomerID;

-- With USING: one complete column
SELECT CustomerID
FROM Customers
FULL OUTER JOIN Orders USING (CustomerID);
```

For a full outer join, `USING (key)` does the job of `COALESCE(c.key, o.key)` automatically.

---

# Comparison

| Aspect | `ON` | `USING` | `NATURAL JOIN` |
|--------|------|---------|----------------|
| Condition visible in the query | ✅ | ✅ | ❌ |
| Columns may have different names | ✅ | ❌ | ❌ |
| Survives a new shared column | ✅ | ✅ | ❌ |
| Join column merged in output | ❌ | ✅ | ✅ |
| Non-equality conditions | ✅ | ❌ | ❌ |
| Supported everywhere | ✅ | ❌ (not SQL Server) | ❌ (not SQL Server) |
| Recommended | ✅ | Situational | ❌ |

---

# USING with SELECT *

`USING` makes `SELECT *` slightly less bad, because the key is not duplicated:

```text
ON      → CustomerID, CustomerName, Country, OrderID, CustomerID, OrderDate, ...
                                                      ^^^^^^^^^^ duplicated

USING   → CustomerID, CustomerName, Country, OrderID, OrderDate, ...
```

This is a real convenience for interactive exploration. It is not a reason to use `SELECT *` in application code, for all the reasons in Section 05.03.

---

# Rewriting NATURAL JOIN Safely

The rewrite requires knowing which columns were actually being matched at the time the query was written:

```sql
-- Legacy
SELECT * FROM Customers NATURAL JOIN Orders;
```

```sql
-- Step 1: discover the shared column names
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'Customers'
INTERSECT
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'Orders';
```

```sql
-- Step 2: write them explicitly
SELECT
    c.CustomerID,
    c.CustomerName,
    o.OrderID,
    o.TotalAmount
FROM Customers AS c
INNER JOIN Orders AS o
    ON o.CustomerID = c.CustomerID;
```

```sql
-- Step 3: verify the row counts match before and after
SELECT COUNT(*) FROM Customers NATURAL JOIN Orders;
```

Do not skip step 3. If the counts differ, the natural join had already drifted to matching more columns than the author intended—and the "old" behaviour is the bug, not the baseline.

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN    ← implicit (NATURAL) or named (USING) conditions apply here
3. WHERE
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

The condition is resolved at parse and bind time, from the current schema—not from the schema that existed when the query was written. That is the whole risk of `NATURAL JOIN` in one sentence.

---

# How the DBMS Executes This

```text
NATURAL JOIN Orders

↓

Binder reads both tables' column lists

↓

Computes the intersection of column names
    → CustomerID, CreatedAt

↓

Builds the equi-join predicate for every shared column

↓

From here on: an ordinary inner join
```

There is no runtime cost to `NATURAL JOIN` or `USING`—both are resolved into a normal join predicate before optimization. The cost is entirely to the humans reading the query later.

---

# 🏗️ Architecture Insight

`NATURAL JOIN` assumes that identical column names always mean identical concepts. That assumption holds in textbook schemas and fails in real ones, where `Name`, `Status` and `CreatedAt` appear in dozens of tables with unrelated meanings. Explicit conditions encode the relationship the *designer* intended, independently of the naming conventions the schema happens to follow today.

---

# 🔒 Security Note

In a multi-tenant schema where every table carries `TenantID`, a `NATURAL JOIN` silently adds tenant matching—and a later rename of that column silently removes it. Isolation must never depend on a condition that the query does not state. Write tenant predicates explicitly.

---

# 🚀 Enterprise Practice

Most enterprise SQL standards ban `NATURAL JOIN` outright, and many also ban `USING`—the first for safety, the second for portability and for the surprise of an unqualifiable merged column. Static analysers such as SQLFluff flag both by default.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `NATURAL JOIN` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `USING (col)` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Qualifying a `USING` column | ❌ | ❌ | ✅ (allowed) | — | ❌ | ✅ |
| No shared columns in `NATURAL JOIN` | Cross join | Cross join | Cross join | — | Error | Cross join |

> **Portability Tip:** SQL Server supports neither form. Any query that must run on SQL Server as well as other databases has to use `ON`, which is a strong argument for using `ON` everywhere.

---

# Common Mistakes

### Mistake 1

Using `NATURAL JOIN` in application code and having it break when a shared audit column is added.

---

### Mistake 2

Assuming `NATURAL JOIN` matches only key columns. It matches every shared name.

---

### Mistake 3

Qualifying a `USING` column (`c.CustomerID`) in a database that forbids it.

---

### Mistake 4

Rewriting a `NATURAL JOIN` to `ON` without checking whether the row counts match first.

---

# Best Practices

✔ Use `ON` in application code, always.

✔ Reserve `USING` for interactive exploration and full-outer-join key merging.

✔ Never use `NATURAL JOIN` outside a teaching example.

✔ When rewriting a natural join, discover the shared columns first and compare row counts after.

✔ State multi-tenant and security predicates explicitly.

---

# Interview Questions

## Basic

1. What does `NATURAL JOIN` join on?
2. What is the difference between `USING` and `ON`?
3. Which major database supports neither?

## Intermediate

4. Why is `NATURAL JOIN` considered unsafe?
5. What happens to the join column with `USING`?
6. When is the merged column genuinely useful?

## Advanced

7. What does `NATURAL JOIN` do when the tables share no column names?
8. Why can a `USING` column not be qualified in most databases?
9. How would you safely rewrite a legacy `NATURAL JOIN`?

---

# Hands-on Exercises

## Exercise 1

Write the same customer/order join three ways: `ON`, `USING` and `NATURAL JOIN`.

---

## Exercise 2

Add a `CreatedAt` column to both tables and explain how each version's result changes.

---

## Exercise 3

Use `USING` in a full outer join and show that the key column is complete.

---

## Exercise 4

Write a query that lists the column names two tables share.

---

# Related Topics

- **07.02 — JOIN Syntax**
- **07.03 — INNER JOIN**
- **07.06 — FULL OUTER JOIN**
- **07.16 — Common JOIN Mistakes & Best Practices**
- **04.16 — SQL Naming Conventions and Coding Standards**
- **05.03 — SELECT ***

---

# Summary

`NATURAL JOIN` derives its condition from every column name the two tables share, which makes the join invisible in the query and unstable under schema change: adding a common audit column silently narrows the join to near-zero rows. `USING` keeps the shorthand and the merged join column while naming the columns explicitly, making it safe against new columns—though it requires identical names, forbids non-equality conditions, cannot be qualified, and does not exist in SQL Server. Explicit `ON` conditions work everywhere, express any condition, and state the relationship the schema designer intended; they are the right default in all application code.
