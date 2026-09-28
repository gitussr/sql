---
title: "14.03 - Multiple and Chained CTEs"
description: "Defining several CTEs in one WITH clause, chaining them so each step builds on the previous ones, joining CTEs to each other, referencing one CTE several times, branching and merging pipelines, naming and sizing steps, debugging a pipeline step by step, mixing recursive and non-recursive CTEs, and when a long chain becomes a readability or estimation problem."
chapter: 14
section: 14.03
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 20 min
lastUpdated: 2026-09-28
---

# 14.03 Multiple and Chained CTEs

---

# Learning Objectives

After completing this section, you will be able to:

- Define several CTEs in one `WITH` clause.
- Chain CTEs so each step builds on earlier ones.
- Join CTEs to each other and reference a CTE more than once.
- Debug a CTE pipeline one step at a time.
- Recognise when a chain has become too long.

---

# Several CTEs, One WITH

CTEs are separated by commas; `WITH` appears once:

```sql
WITH
    ActiveCustomers AS (
        SELECT CustomerID, CustomerName
        FROM Customers
        WHERE CustomerID IN (SELECT CustomerID FROM Orders
                             WHERE OrderDate >= DATE '2026-01-01')
    ),
    Orders2026 AS (
        SELECT CustomerID, OrderID, TotalAmount
        FROM Orders
        WHERE OrderDate >= DATE '2026-01-01' AND OrderDate < DATE '2027-01-01'
    )
SELECT a.CustomerName, COUNT(o.OrderID) AS Orders, SUM(o.TotalAmount) AS Revenue
FROM ActiveCustomers AS a
JOIN Orders2026      AS o ON o.CustomerID = a.CustomerID
GROUP BY a.CustomerName;
```

> Writing `WITH` a second time (`WITH A AS (…), WITH B AS (…)`) is a syntax error. One `WITH`, commas between definitions.

---

# Chaining: Each Step Uses the Previous

The real power is chaining. Here is a four-step cohort-retention analysis:

```sql
WITH
    FirstOrders AS (                                   -- 1. each customer's first order month
        SELECT CustomerID, MIN(DATE_TRUNC('month', OrderDate))::date AS CohortMonth
        FROM Orders
        GROUP BY CustomerID
    ),
    Activity AS (                                      -- 2. every month each customer ordered in
        SELECT DISTINCT CustomerID, DATE_TRUNC('month', OrderDate)::date AS ActiveMonth
        FROM Orders
    ),
    CohortActivity AS (                                -- 3. months since the cohort month
        SELECT f.CohortMonth,
               (EXTRACT(YEAR FROM AGE(a.ActiveMonth, f.CohortMonth)) * 12
              + EXTRACT(MONTH FROM AGE(a.ActiveMonth, f.CohortMonth)))::int AS MonthNumber,
               a.CustomerID
        FROM FirstOrders AS f
        JOIN Activity    AS a ON a.CustomerID = f.CustomerID
    ),
    CohortSizes AS (                                   -- 4. customers per cohort
        SELECT CohortMonth, COUNT(*) AS Customers
        FROM FirstOrders
        GROUP BY CohortMonth
    )
SELECT ca.CohortMonth, ca.MonthNumber,
       COUNT(DISTINCT ca.CustomerID)                             AS ActiveCustomers,
       ROUND(100.0 * COUNT(DISTINCT ca.CustomerID) / cs.Customers, 1) AS RetentionPct
FROM CohortActivity AS ca
JOIN CohortSizes    AS cs ON cs.CohortMonth = ca.CohortMonth
GROUP BY ca.CohortMonth, ca.MonthNumber, cs.Customers
ORDER BY ca.CohortMonth, ca.MonthNumber;
```

```text
            Orders
         ┌────┴─────┐
         ▼          ▼
   FirstOrders   Activity
      │   └───┬──────┘
      │       ▼
      │  CohortActivity
      ▼       │
  CohortSizes │
      └───┬───┘
          ▼
     final SELECT
```

Each step does one thing and has a name that says what. The dependency graph is visible in the text.

---

# Referencing a CTE More Than Once

`FirstOrders` above is used by two later CTEs. A CTE can also be referenced twice in the same `FROM`:

```sql
-- Month-over-month change: join the monthly totals to themselves
WITH Monthly AS (
    SELECT DATE_TRUNC('month', OrderDate)::date AS Month, SUM(TotalAmount) AS Revenue
    FROM Orders
    GROUP BY DATE_TRUNC('month', OrderDate)
)
SELECT cur.Month, cur.Revenue, prev.Revenue AS PrevRevenue,
       cur.Revenue - prev.Revenue AS Change
FROM Monthly AS cur
LEFT JOIN Monthly AS prev ON prev.Month = cur.Month - INTERVAL '1 month';
```

(`LAG` from Section 11.07 does this with one reference; the self-join form is shown because it works on every engine and illustrates multiple references.)

Whether a multiply-referenced CTE is computed once or once per reference depends on the engine—Section 14.13. On SQL Server, `Monthly` is computed twice here.

---

# Branch and Merge

Pipelines do not have to be linear. A common pattern computes several independent summaries and merges them:

```sql
WITH
    CustomerRevenue AS (SELECT CustomerID, SUM(TotalAmount) AS Revenue FROM Orders GROUP BY CustomerID),
    CustomerRefunds AS (SELECT CustomerID, SUM(RefundAmount) AS Refunds FROM Returns GROUP BY CustomerID),
    CustomerTickets AS (SELECT CustomerID, COUNT(*) AS Tickets FROM SupportTickets GROUP BY CustomerID)
SELECT c.CustomerID, c.CustomerName,
       COALESCE(r.Revenue, 0) AS Revenue,
       COALESCE(x.Refunds, 0) AS Refunds,
       COALESCE(t.Tickets, 0) AS Tickets
FROM Customers AS c
LEFT JOIN CustomerRevenue AS r ON r.CustomerID = c.CustomerID
LEFT JOIN CustomerRefunds AS x ON x.CustomerID = c.CustomerID
LEFT JOIN CustomerTickets AS t ON t.CustomerID = c.CustomerID;
```

Aggregating each fact table **before** joining avoids the fan-out problem of Section 08.11: joining the raw tables first would multiply revenue by the number of tickets.

---

# Debugging a Pipeline

Keep the `WITH` clause and swap the final `SELECT`:

```sql
WITH FirstOrders AS (…), Activity AS (…), CohortActivity AS (…), CohortSizes AS (…)
SELECT * FROM CohortActivity LIMIT 50;           -- inspect step 3

-- or check row counts of every step at once
SELECT 'FirstOrders', COUNT(*) FROM FirstOrders
UNION ALL SELECT 'Activity', COUNT(*) FROM Activity
UNION ALL SELECT 'CohortActivity', COUNT(*) FROM CohortActivity;
```

Unexpected row counts (a step that should have one row per customer but has more) point directly at the faulty join or grouping.

---

# Mixing Recursive and Non-Recursive CTEs

With `WITH RECURSIVE`, the keyword applies to the whole clause; individual CTEs are recursive only if they reference themselves:

```sql
WITH RECURSIVE
    Subtree AS (                                                   -- recursive
        SELECT CategoryID FROM Categories WHERE CategoryID = 10
        UNION ALL
        SELECT c.CategoryID FROM Categories AS c JOIN Subtree AS s ON c.ParentCategoryID = s.CategoryID
    ),
    SubtreeSales AS (                                              -- not recursive
        SELECT oi.ProductID, SUM(oi.Quantity * oi.UnitPrice) AS Sales
        FROM OrderItems AS oi
        JOIN Products   AS p ON p.ProductID = oi.ProductID
        WHERE p.CategoryID IN (SELECT CategoryID FROM Subtree)
        GROUP BY oi.ProductID
    )
SELECT * FROM SubtreeSales ORDER BY Sales DESC;
```

On SQL Server and Oracle, simply write `WITH`; recursion is detected from the self-reference.

---

# How Long Is Too Long?

A 5-step pipeline is easier to read than nested subqueries. A 25-step pipeline is not—and it can also hurt performance:

- Each inlined step multiplies the optimizer's search space; estimates compound errors step by step, so late steps may get badly wrong row estimates.
- Steps referenced several times may be recomputed.

Signs a chain should be split: estimates far from actual rows in late steps, the same expensive step referenced several times, or the query no longer fitting on a screen. Options: materialize an intermediate step into a temporary table (with statistics and indexes), or move stable steps into views.

---

# Visual Representation

```text
   WITH A AS ( … base tables … ),
        B AS ( … A … ),               linear chain:  A → B → C → SELECT
        C AS ( … B … ),
        D AS ( … A … )                branch:        A → D ─┐
   SELECT … FROM C JOIN D …           merge:         C ─────┴→ SELECT
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← each CTE reference is a FROM item; chained CTEs nest like derived tables
2. JOIN        ← join CTEs to tables and to each other (aggregate before joining)
3. WHERE
4. GROUP BY    ← each step can have its own grouping
5. HAVING
6. WINDOW
7. SELECT
8. DISTINCT
9. ORDER BY    ← order only the final result
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Inlining engines (PostgreSQL 12+, SQL Server, MySQL usually):
  C = f(B), B = g(A) → the plan for C contains B's plan, which contains A's plan
  A referenced from two branches → A's plan appears twice (unless materialized)
Materializing engines / cases:
  A computed once into a work table → both branches scan the work table
```

---

# 🏗️ Architecture Insight

The step names in a pipeline form a vocabulary—`ActiveCustomers`, `Orders2026`, `CohortSizes`. When the same steps appear in many reports, promote them to views so every report shares the same definition of "active customer".

---

# ⚡ Performance Tip

In branch-and-merge queries, aggregate each branch to the join key **before** joining. Joining raw detail tables first and aggregating afterwards multiplies rows and inflates sums.

---

# 🌍 Production Consideration

Long CTE pipelines in reports tend to grow over time as people append steps. Review them periodically: remove unused CTEs (most engines accept and ignore them, but they confuse readers) and check that estimates in late steps are still reasonable.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Multiple CTEs | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Forward references | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Mixed recursive/non-recursive | ✅ | ✅ (`WITH RECURSIVE` once) | ✅ | ✅ | ✅ | ✅ |
| Multiple references computed once | Implementation | Materialized if referenced 2+ times (12+) | Materialized once | Recomputed | Often materialized | Materialized once (default heuristics) |

> **Portability Tip:** Multiple chained CTEs are fully portable. Only the cost of referencing a CTE several times differs.

---

# Common Mistakes

### Mistake 1

Repeating `WITH` before each CTE.

---

### Mistake 2

Referencing a CTE defined later in the clause.

---

### Mistake 3

Joining raw detail CTEs and then aggregating (fan-out).

---

### Mistake 4

Chaining dozens of steps without checking estimates.

---

# Best Practices

✔ One `WITH`, one idea per CTE, descriptive names.

✔ Aggregate each branch before merging.

✔ Debug by selecting from intermediate CTEs.

✔ Materialize or promote to views when a chain grows long or reuses expensive steps.

---

# Interview Questions

## Basic

1. How do you define two CTEs in one query?
2. Can a CTE use another CTE?
3. How do you inspect an intermediate step?

## Intermediate

4. Why aggregate before joining in a branch-and-merge pipeline?
5. What happens on SQL Server when a CTE is referenced twice?
6. How do you mix recursive and non-recursive CTEs?

## Advanced

7. Why can long CTE chains produce poor plans?
8. When would you replace part of a pipeline with a temporary table?

---

# Hands-on Exercises

## Exercise 1

Build a three-step pipeline: 2026 orders → per-customer totals → customers above the median.

---

## Exercise 2

Merge revenue, refunds and ticket counts per customer without fan-out.

---

## Exercise 3

Write a cohort-retention query for your data and check each step's row count.

---

# Related Topics

- **14.02 — CTE Syntax and Scope**
- **14.04 — CTEs vs Subqueries, Derived Tables and Views**
- **14.13 — Materialization and Inlining (MATERIALIZED and NOT MATERIALIZED)**
- **08.11 — Aggregating Across JOINs (Fan-Out and Pre-Aggregation)**
- **11.07 — LAG and LEAD**

---

# Summary

One `WITH` clause can define any number of comma-separated CTEs, each able to use the ones before it. Chaining turns complex analysis into a readable pipeline of named steps; branches can be computed independently and merged, ideally after aggregating each to the join key to avoid fan-out. A CTE can be referenced several times, but whether it is computed once depends on the engine. Debug by selecting from intermediate steps, and split pipelines that grow long enough to hurt readability or estimates.
