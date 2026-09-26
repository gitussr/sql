---
title: "12.14 - Execution Flow of Scalar Functions"
description: "How engines process scalar functions: name and overload resolution, implicit casts added at bind time, constant folding, where expressions are placed in a plan (scan, filter, projection), per-row versus per-statement evaluation of non-deterministic functions, evaluation order and error behaviour, expression evaluation techniques (interpreters, JIT, batch mode), cardinality estimates for function predicates, and reading functions in execution plans."
chapter: 12
section: 12.14
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 30 min
lastUpdated: 2026-09-26
---

# 12.14 Execution Flow of Scalar Functions

---

# Learning Objectives

After completing this section, you will be able to:

- Describe how a function call is resolved and type-checked.
- Explain constant folding and why it matters.
- Locate where a function is evaluated in an execution plan.
- Predict whether a non-deterministic function is evaluated per row or per statement.
- Explain why errors can occur for rows a query filters out.
- Explain how function predicates affect cardinality estimates, and improve them.

---

# The Life of a Function Call

```text
SELECT UPPER(CustomerName), ROUND(TotalAmount * 1.18, 2)
FROM Customers c JOIN Orders o ON o.CustomerID = c.CustomerID
WHERE LOWER(c.Email) LIKE '%@example.com' AND o.OrderDate >= DATE '2026-01-01'

1. Parse      function names and arguments recognised
2. Bind       names resolved to built-ins or UDFs, overload chosen by argument types,
              implicit casts inserted, result types computed
3. Rewrite    constants folded, COALESCE/NULLIF/IIF expanded to CASE, UDFs inlined
4. Optimise   predicates matched to indexes (only bare columns or indexed expressions),
              expressions placed at the cheapest operator, selectivity estimated
5. Execute    each expression evaluated per row at its operator
```

---

# Binding: Overloads and Implicit Casts

```sql
-- PostgreSQL chooses round(numeric, integer) because TotalAmount is numeric
SELECT ROUND(TotalAmount * 1.18, 2) FROM Orders;

-- PostgreSQL: there is no round(double precision, integer)
SELECT ROUND(RandomFloat, 2) FROM Measurements;       -- ERROR: function round(double precision, integer) does not exist
SELECT ROUND(RandomFloat::numeric, 2) FROM Measurements;
```

When argument types do not match any signature exactly, engines insert casts. The cast becomes part of the expression—so a function over a column can quietly become a function over a **converted** column (Section 12.08). SQL Server shows these as `CONVERT_IMPLICIT(…)` in plans.

---

# Constant Folding

Expressions without column references are computed **once**, during planning:

```sql
WHERE OrderDate >= CAST('2026-01-01' AS DATE)          -- cast done once
WHERE TotalAmount > 100 * 1.18                          -- becomes TotalAmount > 118.00
WHERE Email = LOWER('Asha@Example.com')                 -- becomes Email = 'asha@example.com'
```

Folding is why putting functions on the **constant** side of a predicate is free, and why it keeps predicates sargable. It also has a side effect: an error in a constant sub-expression (`1/0`) can be raised at planning time, even in a `CASE` branch that no row reaches.

Only deterministic (PostgreSQL: `IMMUTABLE`) functions are folded at plan time. `STABLE` functions such as `now()` are evaluated once per execution instead.

---

# Where Expressions Are Evaluated

The optimizer places each expression at a specific operator:

```text
Hash Join (o.CustomerID = c.CustomerID)
├── Seq Scan on Customers c
│     Filter: lower(Email) ~~ '%@example.com'        ← evaluated per scanned customer
└── Index Scan on Orders o using ix_orders_date
      Index Cond: OrderDate >= '2026-01-01'          ← no function: index range
Output (projection above the join):
      upper(c.CustomerName), round(o.TotalAmount * 1.18, 2)   ← per joined row
```

- **Index condition**: only bare columns (or expressions that exactly match an expression index).
- **Filter / residual predicate**: functions over columns, evaluated per row read.
- **Projection**: `SELECT`-list functions, evaluated per output row—usually after filters, so they touch the fewest rows.

SQL Server shows projection functions in **Compute Scalar** operators and often *defers* their evaluation until the value is actually needed (for example, after a `TOP`), so the operator's position in the plan is not always where the work happens.

---

# Per-Row or Per-Statement?

| Function | PostgreSQL | MySQL | SQL Server | Oracle |
|----------|------------|-------|------------|--------|
| Current timestamp (`NOW()`, `GETDATE()`, `SYSDATE`) | Once per **transaction** (`now()`); per call for `clock_timestamp()` | Once per statement (`NOW()`); per call for `SYSDATE()` | Once per **query reference** | Once per statement |
| Random (`RANDOM()`, `RAND()`) | Per row | Per row | **Once per query** (without a per-row seed) | Per row (`DBMS_RANDOM`) |
| `NEWID()` / `gen_random_uuid()` | Per row | Per row (`UUID()`) | Per row | Per row (`SYS_GUID()`) |

Evaluating the clock once per statement keeps all rows of an `INSERT … SELECT` consistent. Section 13.xx covers time functions in depth.

---

# Evaluation Order Is Not Guaranteed

SQL is declarative: the standard does not promise that `WHERE` conditions are evaluated left to right, or that a filter runs before a projection's expressions.

```sql
-- May fail with a conversion error, even though non-numeric rows are "filtered out"
SELECT CAST(RawValue AS INT) AS Val
FROM Staging
WHERE RawValue NOT LIKE '%[^0-9]%';        -- SQL Server pattern: digits only
```

The optimizer may compute `CAST(RawValue AS INT)` for a row before (or without) applying the filter—for example when it moves the expression into a scan, or combines this query with an outer one. Safe forms:

```sql
SELECT TRY_CAST(RawValue AS INT) …                                         -- SQL Server
SELECT CASE WHEN RawValue NOT LIKE '%[^0-9]%' THEN CAST(RawValue AS INT) END …   -- any engine
```

`CASE` is the one construct whose evaluation order you can rely on for ordinary row values (with the constant-folding and aggregate exceptions from Section 12.10).

---

# How Expressions Are Computed

```text
Interpreted expression trees      most engines, most of the time
  ROUND(×(TotalAmount, 1.18), 2)   evaluated by walking a small tree per row

JIT compilation                   PostgreSQL 11+ (LLVM) for expensive queries,
                                  SQL Server natively compiled modules (in-memory OLTP)
  expression → machine code once, then run per row

Batch / vectorised mode           SQL Server batch mode, columnstore engines, DuckDB
  expression evaluated over ~1,000 values at a time, amortising overhead
```

Built-in functions evaluated this way cost nanoseconds per row. A few functions are notably heavier: regular expressions, linguistic collation comparisons, JSON parsing of text documents, SQL Server `FORMAT` (.NET), and every non-inlined UDF.

---

# Cardinality Estimates for Function Predicates

The optimizer has statistics on **columns**, not on arbitrary expressions:

```sql
WHERE LOWER(Email) = 'asha@example.com'     -- how many rows? The optimizer guesses.
WHERE ROUND(TotalAmount, 0) = 100           -- guess
WHERE LEFT(Phone, 3) = '555'                -- guess
```

Typical guesses are fixed fractions (PostgreSQL uses 0.5% for an unknown equality; SQL Server derives a guess from the row count). Bad guesses lead to bad join orders and memory grants. Ways to give the optimizer real statistics on an expression:

```sql
-- PostgreSQL: an expression index collects statistics on the expression
CREATE INDEX ix_customers_email_lower ON Customers (LOWER(Email));
-- PostgreSQL 14+: extended statistics on an expression, without an index
CREATE STATISTICS st_customers_email_lower ON (LOWER(Email)) FROM Customers;

-- SQL Server: statistics on a computed column (created automatically when it is queried)
ALTER TABLE Customers ADD EmailLower AS LOWER(Email);

-- Oracle: extended statistics on an expression
SELECT DBMS_STATS.CREATE_EXTENDED_STATS(USER, 'CUSTOMERS', '(LOWER(EMAIL))') FROM dual;
```

---

# Reading Functions in Plans

```text
PostgreSQL  EXPLAIN (VERBOSE)
  Seq Scan on customers  (rows=5000)
    Output: upper((customername)::text)
    Filter: (lower((email)::text) = 'asha@example.com'::text)

MySQL  EXPLAIN FORMAT=TREE
  -> Filter: (lower(customers.Email) = 'asha@example.com')
      -> Table scan on customers

SQL Server  (graphical plan / SHOWPLAN)
  Compute Scalar  [Expr1002] = Scalar Operator(upper([CustomerName]))
  Filter / Predicate: lower([Email]) = N'asha@example.com'
  Warning: Type conversion in expression (CONVERT_IMPLICIT(nvarchar(255), [Email], 0)) may affect "SeekPlan"
```

Signals to look for:

- A function on a column in a **Filter** above a full scan: a sargability problem.
- `CONVERT_IMPLICIT` or a cast on the column side: a type mismatch.
- A UDF call with a tiny estimated cost but a long actual time: a non-inlined function doing hidden work.

---

# Visual Representation

```text
               ┌────────────── constant side ──────────────┐
WHERE  LOWER(Email)          =          LOWER('Asha@Example.com')
       └── column side ──┘                        │
         evaluated per row                  folded once at plan time
         blocks plain index                 free
         needs expression index
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← table functions (JSON_TABLE, STRING_SPLIT) run here
2. JOIN        ← functions in ON: per candidate pair
3. WHERE       ← functions on columns: residual filters per row
4. GROUP BY    ← grouping expressions computed per row before hashing/sorting
5. HAVING
6. WINDOW
7. SELECT      ← projection functions: per output row (may be deferred)
8. DISTINCT
9. ORDER BY    ← sort keys computed once per row, not per comparison
10. LIMIT / FETCH / TOP
```

This is the logical order. Physically, the optimizer may move or defer expression evaluation—but it will not make a column-side function sargable.

---

# How the DBMS Executes This

```text
Plan time:
  bind → cast insertion → constant folding → UDF inlining → index matching → costing
Run time, per operator:
  scan:       evaluate pushed-down predicates on each row read
  filter:     evaluate residual predicates
  join:       evaluate ON expressions per candidate pair
  aggregate:  evaluate grouping keys and aggregate arguments per input row
  project:    evaluate SELECT-list expressions per output row
```

---

# 🔬 Engine Deep Dive

SQL Server's deferred Compute Scalar means a `SELECT dbo.Expensive(x) … ORDER BY y OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY` may evaluate the function for only 10 rows—or, if the sort key depends on the expression, for every row. PostgreSQL evaluates the target list at the node that produces the output; with `ORDER BY … LIMIT`, target-list functions not needed for sorting are typically evaluated only for the rows returned. When a function is expensive, check the actual row counts at the node that evaluates it.

---

# 🏗️ Architecture Insight

Knowing where expressions run lets you place work deliberately: filters on bare, indexed columns first; heavy formatting or UDF calls in an outer query over the final, small result; normalisation at write time so reads compare plain values. The same function can be negligible or dominant depending on how many rows reach it.

---

# ⚡ Performance Tip

Move expensive functions to the outermost query, after filtering, aggregation and `LIMIT`. A derived table that selects the 20 rows you need, wrapped by an outer `SELECT` that formats them, guarantees the function runs 20 times.

---

# 🔒 Security Note

Because evaluation order is not guaranteed, a function with side effects or errors can run on rows the user is not meant to see—before a security predicate filters them out. PostgreSQL's row-level security handles this with "leakproof" functions: only functions marked `LEAKPROOF` are evaluated before security quals. Do not mark a function leakproof if its errors or outputs can reveal argument values.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Guaranteed predicate order | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ (left to right in practice) |
| Constant folding | — | ✅ (`IMMUTABLE`) | ✅ | ✅ | ✅ | ✅ |
| JIT of expressions | — | ✅ (11+, LLVM) | ❌ | Native modules (in-memory) | ❌ (PL/SQL native compilation) | ❌ |
| Statistics on expressions | — | Expression index, `CREATE STATISTICS` (14+) | Functional index histograms | Computed columns | Extended statistics | Expression index (`ANALYZE`) |
| Plan shows functions | — | `EXPLAIN VERBOSE` | `EXPLAIN FORMAT=TREE` | Compute Scalar, predicates | `DBMS_XPLAN` predicates | `EXPLAIN QUERY PLAN` (limited) |

> **Portability Tip:** Never rely on predicate order to prevent errors on any engine. Use `CASE` or safe conversion functions.

---

# Common Mistakes

### Mistake 1

Assuming `WHERE` filters run before `SELECT`-list conversions on every row.

---

### Mistake 2

Believing a UDF is cheap because the plan says so.

---

### Mistake 3

Ignoring `CONVERT_IMPLICIT` warnings in plans.

---

### Mistake 4

Leaving the optimizer to guess the selectivity of function predicates on large tables.

---

### Mistake 5

Running expensive functions on every row before `LIMIT`.

---

# Best Practices

✔ Keep functions on the constant side of predicates so they fold.

✔ Guard risky conversions with `CASE` or `TRY_*` functions.

✔ Give the optimizer statistics on important expressions.

✔ Read plans for filters, implicit conversions and hidden UDF work.

✔ Apply expensive functions in an outer query over the final rows.

---

# Interview Questions

## Basic

1. What is constant folding?
2. Where in a plan is a `SELECT`-list function evaluated?
3. Is `NOW()` evaluated per row?

## Intermediate

4. Why can a query fail on a row that its `WHERE` clause excludes?
5. What does `CONVERT_IMPLICIT` in a SQL Server plan indicate?
6. Why does `RAND()` return the same value for every row on SQL Server?

## Advanced

7. How does the optimizer estimate `WHERE LOWER(Email) = …`, and how can you improve it?
8. What is a deferred Compute Scalar?
9. What is a leakproof function in PostgreSQL and why does it matter?

---

# Hands-on Exercises

## Exercise 1

Show the plan of `WHERE LOWER(Email) = …` and identify where the function is evaluated.

---

## Exercise 2

Compare estimated and actual rows for that predicate before and after adding an expression index.

---

## Exercise 3

Write a conversion query that can fail despite its `WHERE` filter, then make it safe.

---

## Exercise 4

Rewrite a query so an expensive function runs only on the 10 rows returned.

---

# Related Topics

- **12.13 — User-Defined Scalar Functions**
- **12.15 — Scalar Function Performance and Index Strategy**
- **05.12 — Execution Flow of SELECT**
- **06.11 — Execution Flow of WHERE**
- **10.12 — Selectivity, Cardinality and Statistics**
- **16.xx — Reading Execution Plans**

---

# Summary

A function call is resolved and type-checked at bind time, where implicit casts may be added; constant expressions are folded once at planning; and the optimizer places each remaining expression at an index condition, a filter, a join or a projection, where it runs per row. Non-deterministic functions are evaluated per row or per statement depending on the function and engine. Evaluation order is not guaranteed, so conversions must be guarded with `CASE` or safe functions. Function predicates get guessed selectivities unless expression indexes or extended statistics provide real ones, and plans reveal filters on functions, implicit conversions and hidden UDF costs.
