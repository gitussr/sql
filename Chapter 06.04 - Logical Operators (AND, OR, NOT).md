---
title: "06.04 - Logical Operators (AND, OR, NOT)"
description: "Combine SQL predicates with AND, OR, and NOT. Learn truth tables, operator precedence, parentheses, De Morgan's laws, three-valued logic with UNKNOWN, evaluation order, and how logical structure affects index use."
chapter: 6
section: 6.04
category: Data Query Language (DQL)
difficulty: Beginner → Advanced
readingTime: 50 min
lastUpdated: 2026-09-19
---

# 06.04 Logical Operators (AND, OR, NOT)

---

# Learning Objectives

After completing this section, you will be able to:

- Combine predicates with `AND`, `OR`, and `NOT`.
- Read and apply SQL truth tables, including UNKNOWN.
- Apply operator precedence correctly.
- Use parentheses to express intent.
- Rewrite conditions with De Morgan's laws.
- Explain why SQL does not guarantee short-circuit evaluation.
- Understand how `OR` can affect index use.

---

# Why Logical Operators Matter

Real filters rarely have a single condition.

> "Active customers in India or Nepal who ordered in the last 30 days."

That sentence contains four predicates and three logical relationships. Getting the logic wrong returns the wrong customers—often without any error.

---

# AND

`AND` is TRUE only when **both** conditions are TRUE.

```sql
SELECT
    ProductName,
    Price,
    InStock
FROM Products
WHERE Price < 50
  AND InStock = 1;
```

Only products that are cheap **and** in stock are returned.

Each additional `AND` makes the filter **narrower**.

---

# OR

`OR` is TRUE when **at least one** condition is TRUE.

```sql
SELECT
    CustomerName,
    Country
FROM Customers
WHERE Country = 'India'
   OR Country = 'Nepal';
```

Each additional `OR` makes the filter **wider**.

---

# NOT

`NOT` reverses a condition.

```sql
SELECT
    OrderID,
    Status
FROM Orders
WHERE NOT Status = 'Cancelled';
```

This is equivalent to:

```sql
WHERE Status <> 'Cancelled'
```

`NOT` is most often used with other predicates:

```sql
WHERE NOT (Country = 'India' OR Country = 'Nepal')
```

```sql
WHERE Country NOT IN ('India', 'Nepal')
```

```sql
WHERE Email NOT LIKE '%@example.com'
```

```sql
WHERE ManagerID IS NOT NULL
```

---

# Truth Tables (Two-Valued View)

| A | B | A AND B | A OR B |
|---|---|---------|--------|
| TRUE | TRUE | TRUE | TRUE |
| TRUE | FALSE | FALSE | TRUE |
| FALSE | TRUE | FALSE | TRUE |
| FALSE | FALSE | FALSE | FALSE |

| A | NOT A |
|---|-------|
| TRUE | FALSE |
| FALSE | TRUE |

---

# Truth Tables with UNKNOWN

Because comparisons with `NULL` produce UNKNOWN, SQL uses **three-valued logic**.

## AND

| AND | TRUE | FALSE | UNKNOWN |
|-----|------|-------|---------|
| **TRUE** | TRUE | FALSE | UNKNOWN |
| **FALSE** | FALSE | FALSE | FALSE |
| **UNKNOWN** | UNKNOWN | FALSE | UNKNOWN |

## OR

| OR | TRUE | FALSE | UNKNOWN |
|----|------|-------|---------|
| **TRUE** | TRUE | TRUE | TRUE |
| **FALSE** | TRUE | FALSE | UNKNOWN |
| **UNKNOWN** | TRUE | UNKNOWN | UNKNOWN |

## NOT

| A | NOT A |
|---|-------|
| TRUE | FALSE |
| FALSE | TRUE |
| UNKNOWN | UNKNOWN |

Two rules are worth memorizing:

- `FALSE AND anything` is FALSE.
- `TRUE OR anything` is TRUE.

And one surprise: `NOT UNKNOWN` is still UNKNOWN, so `NOT` cannot "rescue" a row whose condition involves `NULL`.

---

# Operator Precedence

When operators appear together without parentheses, SQL evaluates them in this order:

```text
1. Arithmetic           * / %   then   + -
2. Comparison           =  <>  <  >  <=  >=  LIKE  IN  BETWEEN  IS
3. NOT
4. AND
5. OR
```

**`AND` binds more tightly than `OR`.**

---

# The Classic Precedence Bug

Requirement:

> Active customers from India or Nepal.

Incorrect:

```sql
SELECT
    CustomerName
FROM Customers
WHERE Country = 'India'
   OR Country = 'Nepal'
  AND IsActive = 1;
```

Because `AND` binds first, the database reads it as:

```sql
WHERE Country = 'India'
   OR (Country = 'Nepal' AND IsActive = 1)
```

Every customer from India is returned—**active or not**.

Correct:

```sql
SELECT
    CustomerName
FROM Customers
WHERE (Country = 'India' OR Country = 'Nepal')
  AND IsActive = 1;
```

No error is raised by the incorrect version. It simply returns the wrong rows.

---

# Visual Representation

```text
Without parentheses

            OR
          /    \
 Country='India'   AND
                 /     \
      Country='Nepal'  IsActive=1


With parentheses

             AND
           /     \
         OR       IsActive=1
       /    \
Country='India'  Country='Nepal'
```

---

# Parentheses Express Intent

Use parentheses whenever `AND` and `OR` appear in the same condition—even when precedence happens to give the right answer.

```sql
WHERE (Status = 'Pending' AND Priority = 'High')
   OR (Status = 'Escalated')
```

Parentheses cost nothing at runtime and make the intended logic obvious to the next reader.

---

# De Morgan's Laws

Two identities let you move `NOT` through a condition:

```text
NOT (A AND B)   ≡   (NOT A) OR  (NOT B)
NOT (A OR  B)   ≡   (NOT A) AND (NOT B)
```

Example:

```sql
WHERE NOT (Country = 'India' OR Country = 'Nepal')
```

is the same as:

```sql
WHERE Country <> 'India'
  AND Country <> 'Nepal'
```

These laws hold in SQL's three-valued logic as well. They are useful for simplifying conditions and for understanding how optimizers rewrite them.

---

# Evaluation Order Is Not Guaranteed

In many programming languages, `A AND B` stops if `A` is false (short-circuit evaluation).

SQL makes **no such guarantee**. The optimizer may evaluate predicates in any order.

```sql
SELECT *
FROM Accounts
WHERE Quantity <> 0
  AND Total / Quantity > 10;
```

Some engines may still evaluate `Total / Quantity` for rows where `Quantity = 0` and raise a division-by-zero error.

Use `CASE` (whose branches are evaluated in order in most databases) or `NULLIF` to make the expression safe on its own:

```sql
WHERE Total / NULLIF(Quantity, 0) > 10
```

---

# OR and Indexes

```sql
WHERE CustomerID = 42
   OR Email = 'a@example.com'
```

A single index cannot satisfy both branches. The optimizer may:

- scan the whole table,
- combine two index lookups (an *index union* or *bitmap OR*),
- or rewrite the query as a `UNION` internally.

When performance matters, you can express the intent explicitly:

```sql
SELECT * FROM Customers WHERE CustomerID = 42
UNION
SELECT * FROM Customers WHERE Email = 'a@example.com';
```

`OR` on the **same** column is usually fine and is often rewritten as `IN`:

```sql
WHERE Country IN ('India', 'Nepal')
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE   ← The whole AND/OR/NOT expression is evaluated here
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

A row passes `WHERE` only when the entire logical expression evaluates to TRUE.

---

# How the DBMS Executes This

```text
WHERE (Country = 'India' OR Country = 'Nepal') AND IsActive = 1

↓

Normalize expression
(OR on one column → IN list)

↓

Estimate selectivity of each part

↓

Use an index for the most selective part, if possible

↓

Evaluate remaining predicates as filters

↓

Keep rows where the whole expression is TRUE
```

---

# 🔬 Engine Deep Dive

Optimizers often convert conditions into **conjunctive normal form**—a list of conditions joined by `AND`:

```text
(A OR B) AND C AND D
    │         │    │
  term 1   term 2 term 3
```

Each `AND`-term can be handled independently:

- one term might drive an index seek,
- another might be pushed into a join,
- the rest are applied as filters.

A condition with a top-level `OR` offers far fewer of these opportunities, which is why deeply nested `OR` logic is often harder to optimize.

---

# 🏗️ Architecture Insight

Logical operators turn individual predicates into a Boolean expression tree. Because SQL is declarative, the engine is free to reorder, factor, and rewrite that tree as long as the result is logically equivalent—including under three-valued logic. Your job is to express the logic correctly; the optimizer's job is to find the cheapest way to evaluate it.

---

# ⚡ Performance Tip

Put the effort into making `AND` conditions selective and index-friendly. For `OR` across different columns, check the execution plan; if the engine falls back to a full scan, consider separate indexes, `UNION`, or restructuring the query.

---

# 🔒 Security Note

Classic SQL injection payloads such as `' OR '1'='1` work by injecting an `OR` into a concatenated `WHERE` clause, turning a narrow filter into one that is always TRUE. Parameters make this impossible because input is never parsed as SQL.

---

# 🌍 Production Consideration

Precedence bugs rarely cause errors—they cause incorrect results. They are therefore often found by users or auditors rather than by tests. Code reviews should check every condition that mixes `AND` and `OR` for explicit parentheses.

---

# 🚀 Enterprise Practice

Many teams enforce a lint rule: any `WHERE` clause containing both `AND` and `OR` must use parentheses around each `OR` group. Static SQL analysis tools can flag violations automatically in pull requests.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `AND`, `OR`, `NOT` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Three-valued logic | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `&&`, `\|\|`, `!` as logical operators | ❌ | ❌ | Deprecated synonyms | ❌ | ❌ | ❌ |
| `XOR` | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Guaranteed short-circuit evaluation | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

> **Portability Tip:** Use only `AND`, `OR`, and `NOT`. MySQL's `&&` and `||` synonyms are deprecated, and `||` means string concatenation in standard SQL.

---

# Common Mistakes

### Mistake 1

Mixing `AND` and `OR` without parentheses.

---

### Mistake 2

Expecting `NOT` to return rows where the original condition was UNKNOWN.

---

### Mistake 3

Relying on short-circuit evaluation to avoid errors such as division by zero.

---

### Mistake 4

Writing long chains of `OR` on the same column instead of `IN`.

---

# Best Practices

✔ Parenthesize every `OR` group.

✔ Use `IN` for multiple values of the same column.

✔ Apply De Morgan's laws to simplify negated conditions.

✔ Make expressions safe on their own rather than relying on evaluation order.

✔ Check execution plans for `OR` across different columns.

---

# Interview Questions

## Basic

1. What is the difference between `AND` and `OR`?
2. What does `NOT` do?
3. Which binds more tightly: `AND` or `OR`?

## Intermediate

4. What is `TRUE AND UNKNOWN`? What is `TRUE OR UNKNOWN`?
5. State De Morgan's laws and give a SQL example.
6. Why do parentheses matter even when the query runs without errors?

## Advanced

7. Why doesn't SQL guarantee short-circuit evaluation?
8. How can `OR` across different columns affect index usage?
9. What is conjunctive normal form, and why do optimizers use it?

---

# Hands-on Exercises

## Exercise 1

Return products that cost less than 20 and belong to category 5.

---

## Exercise 2

Return orders whose status is `Pending` or `On Hold`, placed in 2026.

---

## Exercise 3

Rewrite using De Morgan's laws, without `NOT`:

```sql
WHERE NOT (Price > 100 OR Discontinued = 1)
```

---

## Exercise 4

Explain what this query actually returns, then fix it:

```sql
SELECT *
FROM Employees
WHERE Department = 'IT'
   OR Department = 'HR'
  AND Salary > 70000;
```

---

# Related Topics

- **04.06 — SQL Operators and Expressions**
- **06.03 — Comparison Operators**
- **06.06 — IN and NOT IN**
- **06.08 — NULL Handling in WHERE (Three-Valued Logic)**
- **06.12 — SARGability and Index-Friendly Predicates**

---

# Summary

`AND`, `OR`, and `NOT` combine predicates into a single logical expression. Under SQL's three-valued logic, UNKNOWN propagates in specific ways—`FALSE AND UNKNOWN` is FALSE, `TRUE OR UNKNOWN` is TRUE, and `NOT UNKNOWN` remains UNKNOWN. Because `AND` binds more tightly than `OR`, conditions that mix them must use parentheses to express intent. SQL does not guarantee evaluation order, so expressions must be safe on their own. Understanding these rules—and how optimizers restructure logical expressions—is essential for correct and efficient filtering.
