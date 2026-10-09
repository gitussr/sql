---
title: "17.17 - View Cheat Sheet & Visual Knowledge Map"
description: "A one-stop reference for Chapter 17: view DDL on PostgreSQL, MySQL, SQL Server, Oracle and SQLite, merging and pushdown rules, updatability and check options, security options, dependency behaviour, materialized view and indexed view syntax, refresh methods, indexing rules, summary-table patterns, a decision guide for view versus materialized view versus summary table, and a knowledge map linking views to every earlier chapter."
chapter: 17
section: 17.17
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 20 min
lastUpdated: 2026-10-09
---

# 17.17 View Cheat Sheet & Visual Knowledge Map

---

# Learning Objectives

After completing this section, you will be able to:

- Recall view and materialized view syntax for every major engine at a glance.
- Apply the merging, updatability, security and refresh rules quickly.
- Choose between a view, a materialized view, an indexed view and a summary table.
- See how views connect to the rest of the handbook.

---

# View DDL

| Task | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|------|------------|-------|------------|--------|--------|
| Create | `CREATE VIEW v AS …` | same | same | same | same |
| Replace | `CREATE OR REPLACE VIEW` (compatible cols) | `CREATE OR REPLACE` / `ALTER VIEW` | `CREATE OR ALTER` / `ALTER VIEW` | `CREATE OR REPLACE` | drop + create |
| Drop | `DROP VIEW [IF EXISTS] v [CASCADE]` | `DROP VIEW [IF EXISTS]` | `DROP VIEW [IF EXISTS]` | `DROP VIEW` | `DROP VIEW [IF EXISTS]` |
| Rename | `ALTER VIEW … RENAME TO` | `RENAME TABLE` | `sp_rename` (avoid) | `RENAME` | — |
| Definition | `pg_get_viewdef` | `SHOW CREATE VIEW` | `OBJECT_DEFINITION` | `USER_VIEWS.TEXT` | `sqlite_master.sql` |
| Options | `security_barrier`, `security_invoker` | `ALGORITHM`, `SQL SECURITY` | `SCHEMABINDING`, `ENCRYPTION`, `VIEW_METADATA` | `WITH READ ONLY`, `FORCE`, `BEQUEATH` | `TEMP` |

```text
always:  explicit columns · aliases for expressions · no ORDER BY · source control + grants in migrations
```

---

# Merging and Pushdown

```text
mergeable          plain SELECT … FROM … JOIN … WHERE         → folded into the caller; costs nothing extra
barriers           GROUP BY · DISTINCT · window functions · LIMIT/TOP · UNION · volatile functions
pushdown allowed   grouping columns (GROUP BY) · PARTITION BY columns (windows) · each UNION branch
pushdown blocked   aggregate outputs · ranks · anything below LIMIT/TOP
join elimination   LEFT JOIN to unique key (most engines) · INNER JOIN via trusted FK (SQL Server, Oracle)
plan markers       PG Subquery Scan · MySQL <derivedN> · Oracle VIEW · SQLite CO-ROUTINE/MATERIALIZE
```

---

# Writes Through Views

```text
updatable      one base table (or key-preserved / one table per statement), plain columns,
               no GROUP BY / DISTINCT / window / set ops / LIMIT
inserts        hidden columns take defaults; NOT NULL without default → error
CHECK OPTION   new/changed rows must stay visible; CASCADED (default) checks every level, LOCAL only this one
INSTEAD OF     triggers make any view writable: SQL Server per statement (inserted/deleted),
               PostgreSQL/Oracle/SQLite per row (OLD/NEW); MySQL: not available
read-only      Oracle WITH READ ONLY; elsewhere grant SELECT only; SQLite views are always read-only
```

---

# Security

```text
columns        expose only what the role needs; mask in the SELECT list
rows           filter by CURRENT_USER, role, or session context (current_setting / SESSION_CONTEXT / SYS_CONTEXT)
privileges     definer rights (default) = security layer; invoker rights = shortcut only
must           REVOKE base tables; GRANT on the view; test with the restricted login
leaks          PostgreSQL security_barrier; row-level security (PG policies, SQL Server security policies, Oracle VPD)
pools          set and clear session context on every request
```

---

# Dependencies

```text
SELECT *       frozen at CREATE (SQLite re-parses)
drop column    PG: error · SQL Server: breaks (blocked if SCHEMABINDING) · Oracle: INVALID · MySQL/SQLite: breaks
find           information_schema.view_table_usage / view_column_usage · pg_depend
               · sys.dm_sql_referencing_entities · USER_DEPENDENCIES
fix-ups        sp_refreshview (SQL Server) · ALTER VIEW … COMPILE (Oracle)
change         expand → migrate callers → contract; verify all dependants
```

---

# Materialized Views and Indexed Views

```sql
-- PostgreSQL
CREATE MATERIALIZED VIEW mv AS SELECT … [WITH NO DATA];
CREATE UNIQUE INDEX ux_mv ON mv (key);
REFRESH MATERIALIZED VIEW [CONCURRENTLY] mv;

-- Oracle
CREATE MATERIALIZED VIEW LOG ON t WITH ROWID, SEQUENCE (cols) INCLUDING NEW VALUES;
CREATE MATERIALIZED VIEW mv BUILD IMMEDIATE REFRESH FAST ON DEMAND ENABLE QUERY REWRITE AS SELECT …;
EXEC DBMS_MVIEW.REFRESH('MV', 'F');

-- SQL Server
CREATE VIEW dbo.v WITH SCHEMABINDING AS SELECT key, COUNT_BIG(*) AS n, SUM(x) AS s FROM dbo.t GROUP BY key;
CREATE UNIQUE CLUSTERED INDEX ux_v ON dbo.v (key);
SELECT … FROM dbo.v WITH (NOEXPAND);
```

| | PostgreSQL MV | Oracle MV | SQL Server indexed view | Summary table |
|---|---------------|-----------|-------------------------|---------------|
| Freshness | Last refresh | Last refresh / on commit | Always current | Last refresh |
| Incremental | Extension | Fast refresh + MV logs | Automatic | Your SQL |
| Non-blocking reads | `CONCURRENTLY` | Atomic refresh | n/a | Swap / partitions |
| Rewrite of base queries | ❌ | ✅ | Enterprise | ❌ |
| Write-path cost | None | MV logs / on commit | Every write | None (or triggers) |

---

# Refresh Methods

```text
COMPLETE       rerun query; cost ∝ base size                         PG REFRESH · Oracle 'C' · rebuild
CONCURRENT     rerun + diff via unique index; readers not blocked     PG CONCURRENTLY
FAST           apply deltas from MV logs; cost ∝ changes              Oracle 'F' (check EXPLAIN_MVIEW)
ON COMMIT      deltas inside each transaction; always fresh           Oracle ON COMMIT · SQL Server indexed views
WATERMARK      recompute affected keys since last mark                summary tables, any engine
PARTITION      rebuild one partition, exchange/attach                 Oracle PCT, summaries
schedule       pg_cron · DBMS_SCHEDULER · SQL Agent · MySQL events — or trigger from the data load
monitor        RefreshLog (time, duration, status) · USER_MVIEWS · staleness alerts · "as of" labels
```

---

# Indexing

```text
base tables     index the combined view + caller predicate; partial/filtered index = view's filter
SARGable        expose raw columns; expression indexes for computed view columns
MV keys         UNIQUE on the natural key (PG CONCURRENTLY; SQL Server unique clustered)
MV reads        composite/covering indexes from the read queries' plans
cost            complete refresh: cheap · incremental/synchronous: per changed row per index
statistics      ANALYZE / DBMS_STATS / UPDATE STATISTICS after refresh
```

---

# Choosing the Tool

```text
data must be current, query fast enough            → VIEW
heavy query, read often, staleness OK              → MATERIALIZED VIEW (PG, Oracle)
heavy aggregate, must be current, writes moderate  → INDEXED VIEW (SQL Server) / ON COMMIT MV (Oracle)
no MVs, custom refresh, history, partitioning      → SUMMARY TABLE
filter must reach inside a barrier                 → parameterized function (inline TVF / SQL function)
one statement only                                 → CTE / derived table / temp table
per-user, very high read rate                      → application cache
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← view expanded (or MV read as a table, or base tables rewritten to an MV)
2. JOIN        ← merged view joins reordered with the caller's; unused joins eliminated
3. WHERE       ← merged, pushed through safe barriers, or applied above the view block
4. GROUP BY    ← view GROUP BY = barrier; MV GROUP BY already done at refresh
5. HAVING      ← outer filters on view aggregates
6. WINDOW      ← view windows = barrier except PARTITION BY columns
7. SELECT      ← unused view columns pruned; only plain columns writable
8. DISTINCT    ← barrier; also makes a view non-updatable
9. ORDER BY    ← in the caller only; MV indexes can supply it
10. LIMIT / FETCH / TOP   ← inside a view: blocks pushdown; outside: stops early above streaming plans
```

---

# How the DBMS Executes This

```text
VIEW:     parse → resolve → authorize (definer/invoker) → expand → merge/push/prune/eliminate
          → optimize → cache (outer query's plan) → execute on base tables
MV:       parse → resolve → authorize → plan as a table (its indexes, its statistics) → read stored rows
REWRITE:  base-table query → match fresh MV / indexed view (Oracle, SQL Server Ent.) → cheaper? use it
WRITE:    INSTEAD OF trigger? → else updatable? → base-table DML + view predicate → CHECK OPTION
REFRESH:  complete · concurrent diff · fast deltas · on commit · watermark · partition exchange
```

---

# Visual Knowledge Map

```text
                              VIEWS AND MATERIALIZED VIEWS (Chapter 17)
          name a query (view) → or store its result (materialized view) → keep it correct and fresh
                                                 │
   ┌───────────────┬───────────────┬─────────────┴─────┬────────────────┬───────────────────┐
   ▼               ▼               ▼                   ▼                ▼                   ▼
 BASICS          EXPANSION       WRITES              SECURITY         DESIGN              MATERIALIZATION
 17.01, 17.02    17.03           17.04, 17.05        17.06            17.07, 17.08        17.09–17.13
 what, DDL,      merging,        updatable views,    columns, rows,   dependencies,       MVs, refresh,
 options,        pushdown,       CHECK OPTION,       definer rights,  schema binding,     indexed views,
 catalog         elimination     INSTEAD OF          barriers, RLS    layered stacks      rewrite, indexing,
                                                                                          summary tables
   └───────────────┴───────────────┴─────────────┬─────┴────────────────┴───────────────────┘
                                                 ▼
             EXECUTION 17.14 ── PERFORMANCE 17.15 ── MISTAKES 17.16 ── CHEAT SHEET 17.17

Connections to other chapters
  05.11 FROM Clause (Deep Dive)            ──→ 17.01 (a view is a named source in FROM)
  06.12 SARGability                        ──→ 17.15 (SARGable view columns)
  07.13 Semi-joins and anti-joins          ──→ 17.03 (join elimination and pushdown)
  08.12 ROLLUP, CUBE and GROUPING SETS     ──→ 17.13 (summary grains and roll-ups)
  09.08 Derived tables                     ──→ 17.03 (a view expands into a derived table)
  10.10 Partial and expression indexes     ──→ 17.15 (indexes matching view filters)
  11.14 Window function execution          ──→ 17.03 (windows as barriers)
  14.04 CTEs vs views                      ──→ 17.01 (statement scope vs catalog scope)
  14.13 CTE materialization                ──→ 17.09 (materializing inside vs across statements)
  15.04 Automatic query rewrites           ──→ 17.03, 17.11 (merging, pushdown, MV rewrite)
  16.xx Reading Execution Plans            ──→ 17.14 (views and MVs in plans)
  17.xx Views and Materialized Views       ──→ 18.xx Stored Procedures and Triggers
```

---

# One-Page Summary

```text
CONCEPTS
  View = stored query, no rows, always current, expanded before optimization
  Materialized view = stored result, fast to read, fresh only as of its last refresh

RULES
  Explicit columns, aliases, no ORDER BY; manage views as migrations with grants
  Keep views mergeable; filter on grouping/partition columns; declare keys for join elimination
  ≤ 3 layers; aggregate/window views are leaves; each table once when flattened
  Writable views: single table, plain columns, WITH CHECK OPTION; INSTEAD OF for the rest
  Security views: revoke tables, definer rights, barriers or RLS for untrusted callers
  Check dependants before table changes; expand and contract
  Materialize only inherent cost; choose refresh by change rate; unique key + read indexes;
  statistics after refresh; monitor and display freshness; reconcile summaries
```

---

# 🏗️ Architecture Insight

The chapter reduces to one idea: *a view names a query; a materialized view names a result*. Names give you stable interfaces, shared business rules and access control; stored results give you speed at the price of freshness. Use views for meaning, materialization for cost, and never confuse the two.

---

# ⚡ Performance Tip

If you remember one habit from this chapter: when a query on a view is slow, read the plan of the **outer** query and ask whether the filters reached the base tables, whether unused joins were eliminated, and whether any table is read twice.

---

# 💡 Did You Know?

PostgreSQL implements views as tables with a `SELECT` **rule** attached: the rewriter replaces every reference to the view with the rule's query. That is why view definitions live in the `pg_rewrite` catalog—and why, before `INSTEAD OF` triggers arrived in PostgreSQL 9.1, writable views were built with `CREATE RULE … DO INSTEAD`.

---

# Related Topics

- **17.01 — Introduction to Views**
- **17.09 — Materialized View Fundamentals**
- **17.16 — Common View Mistakes & Best Practices**
- **16.17 — Execution Plan Cheat Sheet & Visual Knowledge Map**
- **14.17 — CTE Cheat Sheet & Visual Knowledge Map**
- **18.xx — Stored Procedures and Triggers**

---

# Summary

This section condenses Chapter 17 into a single reference: view DDL and options on each engine; merging, pushdown and join-elimination rules with their plan markers; updatability, check options and `INSTEAD OF` triggers; security through grants, definer rights, barriers and row-level security; dependency behaviour and safe change; materialized view, indexed view and summary-table syntax; refresh methods and monitoring; indexing rules; and a decision guide for choosing between them. One idea carries the chapter—a view names a query, a materialized view names a result—and the knowledge map shows how views connect to earlier chapters and lead into stored procedures and triggers.
