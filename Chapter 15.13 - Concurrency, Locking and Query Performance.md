---
title: "15.13 - Concurrency, Locking and Query Performance"
description: "How concurrency affects query speed: locks and blocking, MVCC versus lock-based reads, isolation levels and their performance cost, read committed snapshot and snapshot isolation on SQL Server, lock escalation, deadlocks, long-running transactions and their effects on vacuum, undo and blocking, hot rows and contention, SELECT … FOR UPDATE and SKIP LOCKED for queues, indexes that shrink lock footprints, and how to diagnose blocking on each engine."
chapter: 15
section: 15.13
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 15.13 Concurrency, Locking and Query Performance

---

# Learning Objectives

After completing this section, you will be able to:

- Recognise when a query is slow because it waits, not because it works.
- Explain how MVCC and lock-based engines handle readers and writers.
- Choose isolation levels with their performance cost in mind.
- Prevent blocking caused by long transactions, lock escalation and missing indexes.
- Build high-throughput queues with `FOR UPDATE SKIP LOCKED`.
- Diagnose blocking and deadlocks on each engine.

---

# Working vs Waiting

```text
query elapsed 12.4 s
  CPU time          0.03 s
  logical reads     40
  wait: LCK_M_S     12.3 s   ← blocked by another session's lock
```

A query that does 40 reads cannot need 12 seconds of work. Tuning its plan will not help; the fix lies with the session holding the lock. Always compare elapsed time with CPU time and reads (Section 15.14) before optimizing the plan.

---

# Readers and Writers

| Engine | Default reads | Readers block writers? | Writers block readers? |
|--------|---------------|------------------------|------------------------|
| PostgreSQL | MVCC snapshot (read committed) | No | No |
| Oracle | MVCC (undo) | No | No |
| MySQL InnoDB | MVCC consistent reads (repeatable read) | No (plain `SELECT`) | No (plain `SELECT`) |
| SQL Server | Locking read committed (default on-premises) | Yes (briefly, shared locks) | **Yes** |
| SQL Server with RCSI | Row versions in tempdb | No | No |
| SQLite | Database-level locks; WAL mode lets readers proceed during a write | WAL: no | WAL: no; one writer at a time |

On SQL Server, enabling **read committed snapshot isolation** (`ALTER DATABASE … SET READ_COMMITTED_SNAPSHOT ON`; default in Azure SQL Database) removes most reader–writer blocking at the cost of tempdb version storage. It is often the single most effective concurrency change for OLTP workloads.

---

# Isolation Levels and Cost

```text
READ UNCOMMITTED   dirty reads; no read locks (SQL Server NOLOCK) — fast, but can return wrong/duplicate rows
READ COMMITTED     each statement sees committed data (default in PostgreSQL, SQL Server, Oracle)
REPEATABLE READ    rows read cannot change (MySQL default); more locks on locking engines
SNAPSHOT           transaction-level consistent snapshot (PostgreSQL RR, SQL Server SNAPSHOT)
SERIALIZABLE       as if transactions ran one at a time — range locks (SQL Server, MySQL)
                   or serialization failures to retry (PostgreSQL SSI)
```

Higher isolation means more locks held longer (locking engines) or more retries (PostgreSQL SSI). Choose the lowest level that is correct for each transaction.

> `WITH (NOLOCK)` / `READ UNCOMMITTED` is not a performance fix. It can skip rows, read rows twice during page splits, and return uncommitted data that is later rolled back. Use RCSI or snapshot isolation for non-blocking reads instead.

---

# Long-Running Transactions

A transaction left open affects everyone:

```text
Locking engines:   its locks block other writers (and readers) until commit
PostgreSQL:        VACUUM cannot remove row versions newer than its snapshot → table and index bloat
Oracle / InnoDB:   undo must be kept for its snapshot → undo growth, "snapshot too old" (Oracle)
All:               replication and log truncation can be held back
```

Common causes: an application that opens a transaction and then waits for user input or a remote call; an idle-in-transaction connection from a pool; a huge batch job in one transaction. Keep transactions short, do non-database work outside them, and monitor for idle transactions (`pg_stat_activity.state = 'idle in transaction'`, `idle_in_transaction_session_timeout` in PostgreSQL).

---

# Lock Escalation (SQL Server)

When a statement acquires many row or page locks (about 5,000 on one table), SQL Server may escalate to a **table lock**, blocking all other access:

```sql
UPDATE Orders SET Status = 'Archived' WHERE OrderDate < '2021-01-01';   -- millions of rows → table lock
```

Batching (Section 15.12) keeps each statement below the escalation threshold. `ALTER TABLE … SET (LOCK_ESCALATION = AUTO | DISABLE)` controls it per table (partition-level escalation with `AUTO` on partitioned tables).

---

# Missing Indexes Make Locks Bigger

```sql
UPDATE Orders SET Status = 'Shipped' WHERE TrackingNo = 'TRK-99812';     -- no index on TrackingNo
```

Without an index, the engine scans the table to find the row. On locking engines—and on InnoDB, which locks the index records it scans in locking reads and writes—the scan touches or locks far more rows than the one updated, blocking unrelated transactions. An index on `TrackingNo` makes the statement touch one row. Foreign key checks without indexes on the child column cause similar blocking during parent deletes.

---

# Hot Rows and Contention

```text
UPDATE Counters SET Value = Value + 1 WHERE Name = 'orders';   -- every transaction serializes on one row
```

Every writer waits for the previous one to commit. Fixes: sequences/identity columns instead of counter tables; sharded counters (N rows, summed on read); batching increments; or moving the counter to an in-memory store. The same applies to "last updated" columns on a parent row touched by every child insert.

---

# Queues With SKIP LOCKED

A table used as a job queue by several workers needs each worker to claim different rows without blocking:

```sql
-- PostgreSQL 9.5+, MySQL 8.0+, Oracle
BEGIN;
SELECT JobID, Payload
FROM Jobs
WHERE Status = 'Ready'
ORDER BY CreatedAt
FETCH FIRST 10 ROWS ONLY
FOR UPDATE SKIP LOCKED;          -- locked rows are skipped, not waited for
-- process, then:
UPDATE Jobs SET Status = 'Done' WHERE JobID IN (…);
COMMIT;

-- SQL Server
SELECT TOP (10) JobID, Payload
FROM Jobs WITH (UPDLOCK, READPAST, ROWLOCK)
WHERE Status = 'Ready'
ORDER BY CreatedAt;
```

With a partial index on ready jobs (`WHERE Status = 'Ready'`), each claim is a short seek, and workers never wait on each other.

---

# Deadlocks

```text
T1: UPDATE Customers … WHERE ID = 1   (locks row 1)      T2: UPDATE Orders … WHERE ID = 9   (locks row 9)
T1: UPDATE Orders … WHERE ID = 9      (waits for T2)     T2: UPDATE Customers … WHERE ID = 1 (waits for T1)
→ deadlock: the engine kills one transaction; the application must retry it
```

Reduce them by accessing tables and rows in a consistent order, keeping transactions short, indexing the columns used to find rows (fewer locks), and using appropriate isolation. Always write retry logic for deadlock and serialization errors.

---

# Diagnosing Blocking

```sql
-- PostgreSQL: who blocks whom
SELECT pid, pg_blocking_pids(pid) AS blocked_by, state, wait_event_type, wait_event, query
FROM pg_stat_activity
WHERE cardinality(pg_blocking_pids(pid)) > 0;

-- SQL Server
SELECT session_id, blocking_session_id, wait_type, wait_time, wait_resource
FROM sys.dm_exec_requests
WHERE blocking_session_id <> 0;

-- MySQL 8.0
SELECT * FROM sys.innodb_lock_waits;

-- Oracle
SELECT sid, blocking_session, event, seconds_in_wait FROM v$session WHERE blocking_session IS NOT NULL;
```

Deadlock details: PostgreSQL logs them (`log_lock_waits`, deadlock messages), SQL Server records them in the `system_health` Extended Events session, MySQL in `SHOW ENGINE INNODB STATUS`, Oracle in trace files and the alert log.

---

# Visual Representation

```text
   session A ──BEGIN── UPDATE Orders row 42 ────────────── (user thinks for 5 minutes) ──── COMMIT
   session B ─────────────── UPDATE Orders row 42 ░░░░░░░░░░░░ waiting ░░░░░░░░░░░░░░░░░░░ ✔
   session C ────────────────────── SELECT row 42 ░░░░ waiting (locking engines) ░░░░░░░░░░ ✔
                                                       reads old version (MVCC / RCSI)  ✔ immediately
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← table/page/row locks acquired as rows are read (locking engines, locking reads)
2. JOIN
3. WHERE       ← an index on the filter column limits how many rows are touched and locked
4. GROUP BY
5. HAVING
6. WINDOW
7. SELECT      ← FOR UPDATE [SKIP LOCKED | NOWAIT] decides what happens to locked rows
8. DISTINCT
9. ORDER BY    ← consistent access order reduces deadlocks
10. LIMIT / FETCH / TOP   ← small claims keep lock sets small
```

---

# How the DBMS Executes This

```text
SQL Server wait statistics for a blocked query:
  LCK_M_U   waiting to acquire an update lock held by session 87
  session 87: status sleeping, open_transaction_count = 1, last request 4 minutes ago
→ the plan is irrelevant; the open transaction in session 87 is the problem
```

---

# 🏗️ Architecture Insight

Concurrency is a design property: short transactions, no user think-time inside transactions, idempotent retries, queue tables with `SKIP LOCKED` rather than polling with locks, avoidance of global hot rows, and snapshot-based reads for reporting. These choices matter more than any single query plan once a system is busy.

---

# ⚡ Performance Tip

On SQL Server OLTP databases suffering reader–writer blocking, evaluate read committed snapshot isolation before adding `NOLOCK` hints; it gives non-blocking reads without dirty reads.

---

# 🔒 Security Note

Long lock waits and deadlocks can be triggered deliberately by users who can open transactions (for example through an API that holds a transaction across requests). Set lock and statement timeouts (`lock_timeout`, `statement_timeout`, `SET LOCK_TIMEOUT`, `innodb_lock_wait_timeout`) so one session cannot stall others indefinitely.

---

# 🌍 Production Consideration

Load tests that run one user at a time hide concurrency problems. Test with realistic concurrency, including background jobs and reports running alongside OLTP traffic, and watch lock waits and deadlocks, not just average response time.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Non-blocking reads by default | ❌ | ✅ | ✅ | ❌ (RCSI optional) | ✅ | WAL mode |
| Default isolation | Serializable | Read committed | Repeatable read | Read committed | Read committed | Serializable |
| `SKIP LOCKED` | ❌ | ✅ | ✅ (8.0) | `READPAST` hint | ✅ | ❌ |
| Lock escalation | ❌ | ❌ | ❌ | ✅ | ❌ | Database-level locks |
| Lock timeout | ❌ | `lock_timeout` | `innodb_lock_wait_timeout` | `SET LOCK_TIMEOUT` | `WAIT n` / `NOWAIT` | `busy_timeout` |

> **Portability Tip:** Short transactions, consistent access order, indexed lookups and retry logic reduce contention on every engine. Locking behaviour itself differs fundamentally between MVCC and lock-based defaults.

---

# Common Mistakes

### Mistake 1

Tuning the plan of a query that is actually blocked.

---

### Mistake 2

Using `NOLOCK` to "fix" blocking.

---

### Mistake 3

Holding transactions open during user interaction or remote calls.

---

### Mistake 4

Updating millions of rows in one statement on SQL Server and escalating to a table lock.

---

### Mistake 5

Building queues without `SKIP LOCKED`, so workers block each other.

---

# Best Practices

✔ Compare elapsed time with CPU and reads to spot waiting.

✔ Keep transactions short; never wait for users inside one.

✔ Use snapshot-based reads (MVCC, RCSI) for reporting and OLTP reads.

✔ Index the columns used to find rows being updated or deleted.

✔ Use `SKIP LOCKED` for queues and retry on deadlocks.

---

# Interview Questions

## Basic

1. How can a query be slow without doing much work?
2. What is blocking?
3. What is a deadlock?

## Intermediate

4. How do MVCC engines avoid reader–writer blocking?
5. Why is `NOLOCK` dangerous?
6. How does a missing index increase blocking?

## Advanced

7. How do long-running transactions hurt PostgreSQL even when they hold no locks?
8. Design a job queue table that many workers can consume concurrently.

---

# Hands-on Exercises

## Exercise 1

Create a blocking chain between two sessions and find it with your engine's diagnostic views.

---

## Exercise 2

Build a job queue with `FOR UPDATE SKIP LOCKED` and run three workers against it.

---

## Exercise 3

On SQL Server, compare blocking with and without read committed snapshot isolation.

---

# Related Topics

- **15.12 — Optimizing Writes (Batch INSERT, UPDATE and DELETE)**
- **15.14 — Measuring Query Performance (Timing, I/O and Wait Statistics)**
- **10.13 — The Cost of Indexes (Writes, Storage and Locking)**
- **04.12 — Transaction Control Language (TCL) Deep Dive**

---

# Summary

Some slow queries do little work and simply wait—for locks, I/O or other resources—so compare elapsed time with CPU and reads before tuning plans. MVCC engines (PostgreSQL, Oracle, InnoDB) let readers and writers proceed independently; SQL Server does so with read committed snapshot isolation. Long transactions cause blocking, bloat and undo growth; large statements cause lock escalation; missing indexes enlarge lock footprints; hot rows serialize writers. Keep transactions short, index the rows you modify, use snapshot reads, `SKIP LOCKED` for queues, consistent access order and retries for deadlocks, and diagnose blocking with each engine's views.
