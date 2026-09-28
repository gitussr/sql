---
title: "15.08 - Parameter Sniffing, Plan Caching and Prepared Statements"
description: "How engines cache and reuse execution plans, why parameterization matters, parameter sniffing and skewed data, symptoms of a bad sniffed plan, fixes on SQL Server (RECOMPILE, OPTIMIZE FOR, Query Store forcing, Parameter Sensitive Plan optimization), PostgreSQL custom versus generic plans and plan_cache_mode, Oracle bind peeking and adaptive cursor sharing, MySQL's lack of a plan cache, plan cache bloat from literals, and how local variables and caching interact."
chapter: 15
section: 15.08
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 30 min
lastUpdated: 2026-09-28
---

# 15.08 Parameter Sniffing, Plan Caching and Prepared Statements

---

# Learning Objectives

After completing this section, you will be able to:

- Explain why engines cache plans and how parameterization enables reuse.
- Describe parameter sniffing and why skewed data makes it dangerous.
- Recognise the symptoms of a bad cached plan.
- Apply the fixes available on SQL Server, PostgreSQL and Oracle.
- Avoid plan-cache bloat from unparameterized SQL.

---

# Why Cache Plans?

Optimizing a query can take milliseconds—sometimes more than running it. Engines cache plans and reuse them for later executions of the same statement:

```text
first execution:   parse → optimize (expensive) → execute → store plan
later executions:  look up plan → execute                  (compile cost saved)
```

| Engine | Plan cache |
|--------|------------|
| SQL Server | Global plan cache keyed by statement text (and SET options); also stored procedures |
| Oracle | Shared pool: shared cursors keyed by SQL text |
| PostgreSQL | Per-session, for prepared statements (and PL/pgSQL statements) only |
| MySQL | No plan cache for SQL; prepared statements skip parsing but are optimized per execution |
| SQLite | Per prepared statement (`sqlite3_prepare`), re-prepared when schema or statistics change |

---

# Parameterization

Reuse requires the same statement text:

```sql
-- ❌ Literals: each value is a new statement, compiled separately
SELECT * FROM Orders WHERE CustomerID = 42;
SELECT * FROM Orders WHERE CustomerID = 43;
SELECT * FROM Orders WHERE CustomerID = 44;

-- ✅ Parameters: one statement, one plan
SELECT * FROM Orders WHERE CustomerID = @CustomerID;     -- SQL Server (sp_executesql / driver parameters)
SELECT * FROM Orders WHERE CustomerID = $1;              -- PostgreSQL prepared statement
SELECT * FROM Orders WHERE CustomerID = :cust;           -- Oracle bind variable
```

Unparameterized SQL floods the cache with single-use plans ("plan cache bloat" on SQL Server, "hard parsing" and shared pool contention on Oracle) and burns CPU compiling. SQL Server's *optimize for ad hoc workloads* setting and *forced parameterization*, and Oracle's `CURSOR_SHARING = FORCE`, mitigate it for applications that cannot be changed. Parameters also prevent SQL injection.

---

# Parameter Sniffing

When a parameterized statement is first compiled, most engines look at ("sniff") the actual parameter values and optimize for them. The plan is then reused for **every** value.

```text
Customers.Country skew:  'IN' = 600,000 rows · 'NZ' = 760 rows

Monday 08:00  first call: Country = 'NZ'  → plan: index seek + lookups (perfect for 760 rows) → cached
Monday 08:01  call: Country = 'IN'        → same plan: 600,000 lookups → 40 seconds
```

Or the reverse: the first call is `'IN'`, a scan is cached, and every small-country call scans a million rows.

Sniffing is usually **good**—plans fit real values—and becomes a problem only when data is skewed and different values need different plans.

Symptoms:

- The same query is fast for some parameter values and slow for others.
- Performance changes suddenly after a restart, a statistics update, or a plan eviction ("it was fine yesterday").
- Running the query in a query window with literal values is fast, but the application is slow.

---

# Local Variables Are Not Sniffed (SQL Server)

```sql
DECLARE @country VARCHAR(50) = 'NZ';
SELECT * FROM Customers WHERE Country = @country;     -- value unknown at compile time → density-based average estimate
```

The optimizer uses the average rows per value (1 / NDV) instead of the actual value. This is sometimes used deliberately to get a "middle" plan—and often explains why a query tested with variables behaves differently from the same query in a stored procedure.

---

# Fixes on SQL Server

```sql
-- 1. Recompile every execution: always a fitted plan, CPU cost per call
SELECT * FROM Customers WHERE Country = @country OPTION (RECOMPILE);

-- 2. Optimize for a representative value, or for the average
SELECT * FROM Customers WHERE Country = @country OPTION (OPTIMIZE FOR (@country = 'US'));
SELECT * FROM Customers WHERE Country = @country OPTION (OPTIMIZE FOR UNKNOWN);

-- 3. Query Store (2016+): find the good plan and force it
EXEC sp_query_store_force_plan @query_id = 1234, @plan_id = 5678;

-- 4. Separate code paths for known big values
IF @country IN ('IN', 'US') EXEC dbo.GetCustomers_Large @country ELSE EXEC dbo.GetCustomers_Small @country;
```

SQL Server 2022's **Parameter Sensitive Plan (PSP) optimization** (compatibility level 160) automatically keeps several plans for a statement, chosen by the cardinality range of the parameter value—addressing the classic case without code changes.

---

# PostgreSQL: Custom and Generic Plans

PostgreSQL caches plans only for prepared statements (including those drivers create and PL/pgSQL). For the first five executions it builds a **custom plan** using the actual values; afterwards it compares the average custom-plan cost with a **generic plan** (built without values) and switches to the generic plan if it is not estimated to be more expensive.

```sql
PREPARE by_country(text) AS SELECT * FROM Customers WHERE Country = $1;
EXECUTE by_country('NZ');   -- executions 1–5: custom plans

-- PostgreSQL 12+: control the choice
SET plan_cache_mode = force_custom_plan;    -- always plan with actual values (like RECOMPILE)
SET plan_cache_mode = force_generic_plan;   -- always reuse the generic plan
SET plan_cache_mode = auto;                 -- default heuristic
```

Symptom of a bad generic plan: a prepared statement slows down from its sixth execution. Connection poolers and drivers that prepare statements automatically make this common; `force_custom_plan` per role or per session is the usual fix for skewed lookups.

---

# Oracle: Bind Peeking and Adaptive Cursor Sharing

Oracle peeks at bind values on the first hard parse. Since 11g, **adaptive cursor sharing** marks a cursor *bind-sensitive* when a histogram exists on a filtered column; if later executions process very different row counts, it becomes *bind-aware* and Oracle creates additional child cursors with plans for different selectivity ranges. **SQL plan baselines** (SQL Plan Management) and **SQL profiles** pin or guide plans when needed.

---

# MySQL

MySQL has no plan cache for ordinary statements: every execution is optimized with the actual values (prepared statements save parsing only). There is no parameter sniffing problem—and no compile-cost saving. MySQL 8.0 also removed the query **result** cache.

---

# Choosing a Fix

```text
Is the problem skewed data + one cached plan?
 ├─ executions are infrequent, compile is cheap        → recompile / custom plans
 ├─ one plan is acceptable for all values              → optimize for representative/unknown, or force it
 ├─ two clear classes of values (big / small)           → separate queries or procedures; PSP (SQL Server 2022)
 └─ plan flips after stats updates or restarts           → force a known-good plan (Query Store, baselines)
Always also check: statistics fresh? histogram present? index covering to make one plan good for all?
```

A covering index often makes the seek plan good even for large values, removing the conflict entirely.

---

# Visual Representation

```text
               first execution                    later executions
   @country = 'NZ' ──▶ optimize ──▶ plan: seek ──▶ cache ──▶ @country = 'NZ' ✔ fast
                                                        └──▶ @country = 'IN' ✘ 600,000 lookups

   fixes:  recompile each time ─ fitted plans, CPU cost
           optimize for X / unknown ─ one compromise plan
           several plans by value range ─ PSP (SQL Server 2022), adaptive cursor sharing (Oracle)
           force known-good plan ─ Query Store, SQL plan baselines
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← access path in the cached plan fixed at compile time
2. JOIN        ← join algorithm fixed at compile time (the usual victim of sniffing)
3. WHERE       ← parameter values decide real selectivity; the plan was built for the sniffed ones
4. GROUP BY    ← memory grants sized for sniffed row counts: spills for bigger values
5. HAVING
6. WINDOW
7. SELECT
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
SQL Server actual plan properties:
  Parameter List:  @country  Compiled Value = 'NZ'   Runtime Value = 'IN'
  Estimated rows 760 · Actual rows 600,000
→ classic sniffing signature: compiled value ≠ runtime value, estimate fits the compiled one
PostgreSQL: EXPLAIN EXECUTE by_country('IN') shows $1 in the plan → a generic plan is in use
```

---

# 🏗️ Architecture Insight

Skewed values often deserve different handling in the application too: a tenant with 60% of all data, a "global" category, the default status. Treating them as separate paths—separate queries, separate caches, even separate tables or partitions—avoids forcing one plan to serve incompatible workloads.

---

# ⚡ Performance Tip

On SQL Server, `OPTION (RECOMPILE)` on an infrequent, expensive, skew-sensitive report is almost free relative to its run time. On a statement executed thousands of times per second, the compile cost dominates—prefer a forced plan or better index there.

---

# 🔒 Security Note

Parameterization is both a performance and a security practice. Concatenating values to "fix" parameter sniffing reintroduces SQL injection risk; use `RECOMPILE`, custom plans or plan forcing instead.

---

# 🌍 Production Consideration

Plans are evicted by restarts, memory pressure, statistics updates and schema changes, after which the next caller's values decide the new plan. Capture plan history (Query Store, `pg_stat_statements` with `auto_explain`, AWR) so you can see which plan was in use when performance changed.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Plan cache | ❌ | Session, prepared only | ❌ | Global | Global | Per statement |
| Sniffing | ❌ | Custom plans (first 5) | n/a | ✅ | Bind peeking | May re-prepare when bound values matter (STAT4 builds) |
| Multiple plans per statement | ❌ | ❌ | n/a | PSP (2022) | Adaptive cursor sharing | ❌ |
| Force recompile | ❌ | `force_custom_plan` | Always | `OPTION (RECOMPILE)` | Hints, invalidation | Re-prepare |
| Pin a plan | ❌ | `pg_hint_plan` (extension) | ❌ | Query Store, plan guides | Baselines, profiles | ❌ |

> **Portability Tip:** Parameterize everywhere. Sniffing behaviour and fixes are engine-specific; MySQL alone avoids the problem by never caching plans.

---

# Common Mistakes

### Mistake 1

Concatenating literals into SQL, flooding the plan cache.

---

### Mistake 2

Testing with local variables and concluding the procedure's plan is fine.

---

### Mistake 3

Adding `RECOMPILE` to a statement executed thousands of times per second.

---

### Mistake 4

Blaming sniffing when statistics are stale.

---

### Mistake 5

Ignoring PostgreSQL's switch to a generic plan after five executions.

---

# Best Practices

✔ Parameterize all application SQL.

✔ Diagnose sniffing by comparing compiled and runtime values.

✔ Choose the fix by execution frequency and skew.

✔ Consider covering indexes that make one plan good for all values.

✔ Keep plan history to explain sudden changes.

---

# Interview Questions

## Basic

1. Why do databases cache execution plans?
2. What is parameterization?
3. What is parameter sniffing?

## Intermediate

4. Why is parameter sniffing a problem only with skewed data?
5. What does `OPTION (RECOMPILE)` do, and what does it cost?
6. How does PostgreSQL decide between custom and generic plans?

## Advanced

7. How do SQL Server 2022 PSP optimization and Oracle adaptive cursor sharing address sniffing?
8. Why might a query be fast in a query window and slow from the application?

---

# Hands-on Exercises

## Exercise 1

Create a skewed column and reproduce parameter sniffing with a stored procedure or prepared statement.

---

## Exercise 2

Apply two different fixes and compare CPU and duration over 1,000 executions.

---

## Exercise 3

On PostgreSQL, observe the switch to a generic plan on the sixth execution with `EXPLAIN EXECUTE`.

---

# Related Topics

- **15.03 — Statistics, Cardinality Estimation and the Cost Model**
- **15.09 — Optimizer Hints and Plan Guides**
- **15.14 — Measuring Query Performance (Timing, I/O and Wait Statistics)**
- **05.10 — SELECT into Variables (DBMS Differences)**

---

# Summary

Engines cache plans to avoid recompiling, which requires parameterized SQL; unparameterized literals bloat caches and waste CPU. Cached plans are built for the parameter values seen at compile time (sniffing, bind peeking, custom plans), which is ideal for uniform data and harmful for skewed data where different values need different plans. Fixes range from recompiling or custom plans, through optimizing for representative values and forcing known-good plans, to multiple plans per statement (SQL Server 2022 PSP, Oracle adaptive cursor sharing)—chosen by execution frequency and skew, and always after checking statistics and indexes.
