---
title: "09.16 - Common Subquery Mistakes & Best Practices"
description: "A catalogue of subquery mistakes—NOT IN with NULLs, multi-row scalar subqueries, empty-result NULLs, accidental correlation, missing correlation, join-and-DISTINCT, NULL overwrites in UPDATE, fan-out, non-deterministic row limits and unindexed correlation—with symptoms, fixes and a review checklist."
chapter: 9
section: 9.16
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 35 min
lastUpdated: 2026-09-25
---

# 09.16 Common Subquery Mistakes & Best Practices

---

# Learning Objectives

After completing this section, you will be able to:

- Recognise the most common subquery mistakes from their symptoms.
- Explain the cause of each mistake.
- Apply the standard fix for each.
- Review a query containing subqueries with a checklist.

---

# How Subquery Mistakes Show Up

| Symptom | Likely mistake |
|---------|----------------|
| Exclusion query returns no rows | 1 — `NOT IN` with `NULL` |
| Query fails only in production, "more than one row" | 2 — multi-row scalar subquery |
| `NULL` where `0` was expected | 3 — empty scalar subquery |
| Filter matches every row | 4 — accidental correlation, or 5 — missing correlation |
| Duplicate rows, fixed with `DISTINCT` | 6 — join used as a membership test |
| Column wiped to `NULL` after an `UPDATE` | 7 — correlated update without `WHERE EXISTS` |
| Totals too large | 8 — fan-out in a derived table |
| "Latest" row changes between runs | 9 — non-deterministic row limit |
| Query slows sharply as data grows | 10 — unindexed per-row subquery |

---

# Mistake 1: NOT IN with a Nullable Column

```sql
-- ❌ Returns nothing once Orders.CustomerID contains NULL
SELECT c.CustomerID FROM Customers AS c
WHERE c.CustomerID NOT IN (SELECT o.CustomerID FROM Orders AS o);
```

**Cause:** `x NOT IN (…, NULL)` expands to `… AND x <> NULL`, which is never TRUE.

```sql
-- ✅
SELECT c.CustomerID FROM Customers AS c
WHERE NOT EXISTS (SELECT 1 FROM Orders AS o WHERE o.CustomerID = c.CustomerID);
```

---

# Mistake 2: Scalar Subquery That Can Return Several Rows

```sql
-- ❌ Works until a customer has a second address
SELECT o.OrderID,
       (SELECT a.City FROM Addresses AS a WHERE a.CustomerID = o.CustomerID) AS City
FROM Orders AS o;
```

**Cause:** nothing guarantees one row. The error appears only when data changes (and never on SQLite, which silently takes the first row).

```sql
-- ✅ State which row you want
(SELECT a.City FROM Addresses AS a
 WHERE a.CustomerID = o.CustomerID AND a.IsPrimary = TRUE)        -- with a unique constraint

-- ✅ Or pick deterministically
(SELECT a.City FROM Addresses AS a
 WHERE a.CustomerID = o.CustomerID
 ORDER BY a.CreatedAt DESC, a.AddressID DESC
 FETCH FIRST 1 ROW ONLY)
```

---

# Mistake 3: Treating an Empty Scalar Subquery as Zero

```sql
-- ❌ NULL for customers without orders; NULL + anything = NULL
SELECT c.CustomerID,
       (SELECT SUM(o.TotalAmount) FROM Orders o WHERE o.CustomerID = c.CustomerID) + c.OpeningBalance AS Balance
FROM Customers AS c;
```

**Cause:** no rows → aggregate over empty input → `NULL` (except `COUNT`).

```sql
-- ✅
COALESCE((SELECT SUM(o.TotalAmount) FROM Orders o WHERE o.CustomerID = c.CustomerID), 0) + c.OpeningBalance
```

---

# Mistake 4: Accidental Correlation

```sql
-- ❌ Refunds has no CustomerID column: the name binds to c.CustomerID
SELECT c.CustomerName FROM Customers AS c
WHERE c.CustomerID IN (SELECT CustomerID FROM Refunds);
-- → every customer, as long as Refunds is not empty
```

**Cause:** unresolved names are looked up in outer scopes.

```sql
-- ✅ Qualified: fails loudly if the column does not exist
WHERE c.CustomerID IN (SELECT r.CustomerID FROM Refunds AS r);
```

---

# Mistake 5: Missing Correlation

```sql
-- ❌ TRUE for every customer if any order is cancelled
SELECT c.CustomerName FROM Customers AS c
WHERE EXISTS (SELECT 1 FROM Orders AS o WHERE o.Status = 'Cancelled');
```

**Cause:** the subquery does not reference the outer row.

```sql
-- ✅
WHERE EXISTS (SELECT 1 FROM Orders AS o
              WHERE o.CustomerID = c.CustomerID
                AND o.Status = 'Cancelled');
```

A related variant: reusing the outer alias inside the subquery (`FROM Employees AS e … WHERE e.DepartmentID = e.DepartmentID`), which compares the inner row with itself.

---

# Mistake 6: Join Plus DISTINCT for a Membership Test

```sql
-- ❌ Join multiplies rows; DISTINCT hides it at extra cost
SELECT DISTINCT c.CustomerID, c.CustomerName
FROM Customers AS c
JOIN Orders AS o ON o.CustomerID = c.CustomerID
WHERE o.OrderDate >= DATE '2026-01-01';
```

**Cause:** a join returns one row per match.

```sql
-- ✅
SELECT c.CustomerID, c.CustomerName
FROM Customers AS c
WHERE EXISTS (SELECT 1 FROM Orders AS o
              WHERE o.CustomerID = c.CustomerID
                AND o.OrderDate >= DATE '2026-01-01');
```

---

# Mistake 7: Correlated UPDATE Without WHERE EXISTS

```sql
-- ❌ Products with no supplier price become NULL
UPDATE Products
SET ListPrice = (SELECT sp.NewPrice FROM SupplierPrices sp WHERE sp.ProductID = Products.ProductID);
```

**Cause:** the `UPDATE` touches every row; unmatched rows get an empty scalar subquery.

```sql
-- ✅
UPDATE Products
SET ListPrice = (SELECT sp.NewPrice FROM SupplierPrices sp WHERE sp.ProductID = Products.ProductID)
WHERE EXISTS (SELECT 1 FROM SupplierPrices sp WHERE sp.ProductID = Products.ProductID);
```

---

# Mistake 8: Fan-Out Inside a Derived Table

```sql
-- ❌ Order totals repeated once per order line
SELECT t.CustomerID, SUM(t.TotalAmount)
FROM (SELECT o.CustomerID, o.TotalAmount, oi.ProductID
      FROM Orders AS o
      JOIN OrderItems AS oi ON oi.OrderID = o.OrderID) AS t
GROUP BY t.CustomerID;
```

**Cause:** the derived table's grain is "one row per order line", but it carries an order-level measure.

```sql
-- ✅ Sum at the grain the measure belongs to
SELECT o.CustomerID, SUM(o.TotalAmount)
FROM Orders AS o
GROUP BY o.CustomerID;
```

State the grain of every derived table (Section 09.08).

---

# Mistake 9: Non-Deterministic Row Limits

```sql
-- ❌ Two orders on the same date: either may be returned
(SELECT o.OrderID FROM Orders o WHERE o.CustomerID = c.CustomerID
 ORDER BY o.OrderDate DESC
 FETCH FIRST 1 ROW ONLY)
```

**Cause:** `ORDER BY` does not identify a unique row.

```sql
-- ✅ Add a unique tiebreaker
 ORDER BY o.OrderDate DESC, o.OrderID DESC
```

Also: an `ORDER BY` inside a subquery **without** a row limit does nothing and should be removed.

---

# Mistake 10: Unindexed Per-Row Subquery

```sql
-- ❌ One scan of Orders per customer
SELECT c.CustomerID,
       (SELECT MAX(o.OrderDate) FROM Orders o WHERE o.CustomerID = c.CustomerID)
FROM Customers AS c;
```

**Cause:** the optimizer cannot decorrelate it (or chooses not to) and there is no index on `Orders(CustomerID)`.

```sql
-- ✅
CREATE INDEX IX_Orders_Customer_Date ON Orders (CustomerID, OrderDate);
```

---

# Mistake 11: Wrong Quantifier

```sql
-- ❌ Meant "not equal to any of them" — actually "differs from at least one"
WHERE p.CategoryID <> ANY (SELECT CategoryID FROM DiscontinuedCategories)

-- ✅
WHERE p.CategoryID <> ALL (SELECT CategoryID FROM DiscontinuedCategories WHERE CategoryID IS NOT NULL)
-- or, better:
WHERE NOT EXISTS (SELECT 1 FROM DiscontinuedCategories d WHERE d.CategoryID = p.CategoryID)
```

---

# Mistake 12: Deep Nesting Instead of Named Steps

Four or five levels of nested subqueries are legal but hard to review and test. Replace inner levels with derived tables whose aliases describe their grain, or with common table expressions, so each step can be run and checked independently.

---

# Review Checklist

```text
Shape
  □ Scalar subqueries return at most one row (key, aggregate or ordered limit)
  □ IN / ANY / ALL subqueries return exactly one column
  □ Derived tables have an alias and named columns

Correlation
  □ Every column inside every subquery is qualified
  □ Every EXISTS subquery has a correlation predicate (or a comment saying why not)
  □ Inner and outer aliases differ

NULL
  □ No NOT IN / <> ALL over a nullable column
  □ Empty scalar subqueries handled (COALESCE where "none" means 0)
  □ Rows with NULL keys accounted for in reports

Grain
  □ Membership tests use EXISTS / IN, not JOIN + DISTINCT
  □ Each derived table's grain is stated and matches its measures

DML
  □ Correlated SET subqueries paired with WHERE EXISTS
  □ UPDATE … FROM / MERGE sources unique on the key

Performance
  □ Correlation columns indexed
  □ Inner predicates SARGable, types matched
  □ Plan checked for per-row subqueries with scans
```

---

# Visual Representation

```text
                    Subquery mistakes
                           │
   ┌──────────────┬────────┼────────┬──────────────┐
   │              │        │        │              │
 NULL           SHAPE   CORRELATION GRAIN      PERFORMANCE
   │              │        │        │              │
 NOT IN        >1 row   accidental  JOIN+DISTINCT  unindexed
 empty → NULL  2 cols   missing     fan-out        per-row
 ALL + NULL    no alias same alias  UPDATE → NULL  repeated scans
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← derived-table grain mistakes (8) happen here
2. JOIN        ← join-for-membership duplicates (6) happen here
3. WHERE       ← NOT IN (1), correlation (4, 5) and quantifier (11) mistakes act here
4. GROUP BY
5. HAVING
6. SELECT      ← scalar subquery mistakes (2, 3, 9, 10) act here
7. DISTINCT    ← where mistake 6 is papered over
8. ORDER BY
9. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Mistake                    What the engine does
─────────────────────────  ────────────────────────────────────────────
NOT IN + NULL              evaluates correctly by the standard → empty result
Multi-row scalar           raises error at run time (SQLite: first row)
Accidental correlation     binds to outer scope silently
Missing correlation        evaluates subquery once; TRUE/FALSE for all rows
JOIN + DISTINCT            join, then hash/sort to deduplicate
Unindexed per-row          SubPlan with a full scan per outer row
```

None of these is an engine bug. In each case the database does exactly what the SQL says.

---

# 🔬 Engine Deep Dive

Several engines warn about some of these patterns. PostgreSQL's planner cannot turn a `NOT IN` into an anti-join, so the plan's hashed SubPlan is itself a hint. SQL Server's plan shows a warning icon for implicit conversions that prevent seeks. Linters such as SQLFluff flag unqualified columns in multi-table queries. None of these replaces the review checklist, but all are worth enabling.

---

# 🏗️ Architecture Insight

Most subquery mistakes are schema-dependent: `NOT IN` is safe on a `NOT NULL` column, a scalar lookup is safe on a unique key, a correlated subquery is fast on an indexed foreign key. Constraints and indexes are therefore the most effective prevention—they make whole classes of mistakes impossible or harmless, whoever writes the query.

---

# ⚡ Performance Tip

When a subquery-heavy query is slow, check mistakes 6 and 10 first: an unnecessary `DISTINCT` over a join, and a per-row subquery scanning an unindexed table, account for most slow subquery reports.

---

# 🔒 Security Note

Mistakes 1, 4 and 5 are also security bugs when the subquery implements an access rule: a deny-list with `NOT IN` can deny everyone, an accidentally correlated allow-list can allow everyone, and an uncorrelated `EXISTS` can grant access based on someone else's row.

---

# 🌍 Production Consideration

Mistakes 1, 2 and 7 are data-triggered: code that passed every test starts failing after a guest checkout, a second address or a partial price file. Add test cases that include `NULL` foreign keys, duplicate child rows and unmatched rows to every suite that covers subquery-driven logic.

---

# SQL Standard vs Vendor Differences

| Behaviour | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|-----------|-----------|-------|-----------|--------|--------|
| Multi-row scalar subquery | Error | Error | Error | Error | First row used |
| `NOT IN` with `NULL` | Empty result | Empty result | Empty result | Empty result | Empty result |
| Reads target table in `UPDATE`/`DELETE` subquery | ✅ | ❌ error 1093 | ✅ | ✅ | ✅ |
| `ORDER BY` in subquery without limit | Ignored | Ignored | Error | Allowed in `FROM` | Ignored |
| Derived table alias | Optional (16+) | Required | Required | Optional | Optional |

> **Portability Tip:** Test subqueries on the production engine. SQLite in particular tolerates multi-row scalar subqueries and missing aliases that other engines reject.

---

# Common Mistakes

### Mistake 1

Fixing symptoms instead of causes—`DISTINCT` for duplicates, `COALESCE` over a wrong join—rather than restating the subquery at the right grain.

---

### Mistake 2

Testing only with clean data, without `NULL` keys, duplicates or unmatched rows.

---

# Best Practices

✔ Use `NOT EXISTS` for exclusions and `EXISTS` for membership.

✔ Qualify every column with a distinct alias.

✔ Back scalar subqueries with keys or aggregates; break ties in row limits.

✔ Pair correlated `SET` subqueries with `WHERE EXISTS`.

✔ State the grain of every derived table.

✔ Index correlation columns and read the plan.

✔ Include `NULL`, duplicate and no-match rows in test data.

---

# Interview Questions

## Basic

1. Why can `NOT IN` return no rows?
2. What happens when a scalar subquery finds two rows?
3. Why should every column in a subquery be qualified?

## Intermediate

4. How can an `UPDATE` with a correlated subquery wipe out data?
5. Why is `SELECT DISTINCT … JOIN` a warning sign?
6. What is the difference between `<> ANY` and `<> ALL`?

## Advanced

7. Which subquery mistakes are triggered by data rather than code, and how do you test for them?
8. How do schema constraints prevent subquery mistakes?
9. How can a subquery mistake become an access-control bug?

---

# Hands-on Exercises

## Exercise 1

For each of mistakes 1–5, write the incorrect query, construct data that exposes it, and write the fix.

---

## Exercise 2

Apply the review checklist to a report query from your own work or from Section 09.09.

---

## Exercise 3

Write test data for the `Orders` schema that contains a guest order, a customer with two orders on the same date, and a product with no sales. Run every example query in this chapter against it.

---

## Exercise 4

Find a correlated subquery in this chapter that would be slow without an index, create the index, and compare the plans.

---

# Related Topics

- **09.04 — IN and NOT IN with Subqueries**
- **09.07 — Correlated Subqueries**
- **09.11 — Subqueries in INSERT, UPDATE and DELETE**
- **09.12 — NULL Handling in Subqueries**
- **08.16 — Common GROUP BY Mistakes & Best Practices**
- **07.16 — Common JOIN Mistakes & Best Practices**

---

# Summary

Subquery mistakes fall into five families: `NULL` (the `NOT IN` trap, empty scalar results, `ALL` over `NULL`s), shape (multi-row scalar subqueries, extra columns, missing aliases), correlation (accidental, missing or self-referencing), grain (join-plus-`DISTINCT`, fan-out, correlated updates that overwrite with `NULL`) and performance (unindexed per-row subqueries, repeated scans). Each has a mechanical fix—`NOT EXISTS`, keys or aggregates, qualified columns, `EXISTS`, `WHERE EXISTS` on updates, indexes—and many become impossible with the right constraints. Review with the checklist and test with data that contains `NULL` keys, duplicates and unmatched rows.
