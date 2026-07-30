---
title: "04.09 - Data Manipulation Language (DML) Deep Dive"
description: "Understand how Data Manipulation Language (DML) works internally. Learn about row versions, MVCC, write-ahead logging (WAL), undo/redo logs, locking, concurrency control, and how enterprise databases safely modify data."
chapter: 4
section: 4.9
category: SQL Fundamentals
difficulty: Intermediate
readingTime: 85 min
lastUpdated: 2026-07-29
---

# 04.09 Data Manipulation Language (DML) Deep Dive

---

# Learning Objectives

After completing this lesson, you will be able to:

- Understand the purpose of DML
- Learn how databases modify data internally
- Understand row storage and row versions
- Learn MVCC (Multi-Version Concurrency Control)
- Understand Write-Ahead Logging (WAL)
- Learn Undo and Redo logging
- Understand locking and concurrency
- Understand how enterprise databases safely process millions of updates

---

# What is DML?

**Data Manipulation Language (DML)** consists of SQL commands that **insert, modify, and delete data** stored inside database tables.

Unlike DDL, which changes the database structure, DML changes the **contents** of that structure.

Common DML commands include:

```text
INSERT

UPDATE

DELETE

MERGE
```

---

# DDL vs DML

Imagine a library.

DDL builds:

- Bookshelves
- Rooms
- Catalogues

DML performs the daily work:

- Add books
- Move books
- Replace books
- Remove books

The library structure remains the same.

Only the books change.

---

# Where Does DML Operate?

```text
Database

│

├── Metadata

└── Data Pages

       │

       ├── Row 1

       ├── Row 2

       ├── Row 3

       └── Row N
```

DDL modifies **metadata**.

DML modifies **rows stored in data pages**.

---

# Internal DML Workflow

Consider:

```sql
UPDATE Accounts

SET Balance = Balance - 500

WHERE AccountID = 100;
```

Internally:

```text
SQL

↓

Parser

↓

Optimizer

↓

Locate Row

↓

Acquire Lock / Version

↓

Modify Row

↓

Write Transaction Log

↓

Commit
```

Notice that the database performs many operations before the update becomes permanent.

---

# Data Pages

Rows are not stored randomly.

The storage engine organises them into **pages**.

```text
Table

│

├── Page 1

│     Row

│     Row

│     Row

│

├── Page 2

│

└── Page 3
```

A DML statement modifies one or more pages.

---

# Why Databases Don't Immediately Overwrite Data

Suppose two users edit the same row simultaneously.

Without protection:

```text
User A

↓

Update

↓

Overwrite

↓

User B

↓

Overwrite

↓

Data Lost
```

Modern databases prevent this through concurrency control.

---

# Row Versions

Instead of immediately replacing data, many databases create **multiple versions** of the same row.

Example:

```text
Version 1

Balance = 5000

↓

Version 2

Balance = 4500

↓

Version 3

Balance = 4000
```

Readers may still access older versions while new transactions continue.

---

# Multi-Version Concurrency Control (MVCC)

Many enterprise databases use **MVCC**.

Examples:

- PostgreSQL
- Oracle
- MariaDB (InnoDB)
- MySQL (InnoDB)

MVCC allows:

- Readers to continue reading
- Writers to continue writing

without blocking each other unnecessarily.

---

# MVCC Illustration

```text
Transaction A

↓

Reads Version 1

──────────────

Transaction B

↓

Creates Version 2

──────────────

Both Continue

↓

Old Version Removed Later
```

This greatly improves concurrency.

---

# Write-Ahead Logging (WAL)

Before modifying data, many databases first record the intended change in a transaction log.

```text
Transaction

↓

Write Log

↓

Flush Log

↓

Modify Data Page

↓

Commit
```

This is called **Write-Ahead Logging (WAL)**.

If the system crashes, the database can recover using the log.

---

# Why WAL Exists

Imagine a power failure.

Without WAL:

```text
Update Started

↓

Power Failure

↓

Half-written Data
```

Database becomes inconsistent.

With WAL:

```text
Update

↓

Log Written

↓

Crash

↓

Recovery Uses Log

↓

Consistent Database
```

---

# Undo Logs

Undo logs allow the database to reverse changes.

Example:

```text
Balance

5000

↓

4500

↓

Undo

↓

5000
```

Useful for:

- Rollbacks
- MVCC
- Consistent reads

---

# Redo Logs

Redo logs replay committed operations after a crash.

```text
Committed

↓

Crash

↓

Restart

↓

Redo Log Applied
```

Committed work is preserved.

---

# WAL vs Undo vs Redo

| Feature | Purpose |
|---------|---------|
| WAL | Records intended changes before data pages |
| Undo Log | Reverses uncommitted changes |
| Redo Log | Reapplies committed changes after recovery |

---

# Locking

Some operations require locks.

Common lock types include:

```text
Shared Lock

Exclusive Lock

Intent Lock

Schema Lock
```

These prevent conflicting operations.

---

# Row-Level Locking

```text
Orders

Row 101

↓

Locked

↓

Other Transactions Wait
```

Only the affected row is locked.

This provides excellent concurrency.

---

# Table-Level Locking

```text
Orders

↓

Entire Table Locked

↓

Everyone Waits
```

Generally avoided for OLTP systems because it reduces concurrency.

---

# Concurrency Control

Databases must balance:

- Performance
- Consistency
- Isolation

Concurrency control ensures that many users can safely modify data simultaneously.

---

# Transaction Lifecycle

```text
BEGIN

↓

INSERT

↓

UPDATE

↓

DELETE

↓

COMMIT

↓

Release Locks
```

Or:

```text
BEGIN

↓

UPDATE

↓

Error

↓

ROLLBACK
```

---

# Enterprise Banking Example

Suppose a customer transfers money.

```text
Debit Account

↓

Credit Account

↓

Insert Audit Record

↓

Commit
```

If the server crashes after the debit but before the credit:

Recovery logs ensure the database remains consistent.

---

# Enterprise DML Pipeline

```text
Application

↓

SQL Statement

↓

Parser

↓

Optimizer

↓

Execution Engine

↓

Storage Engine

↓

Transaction Log

↓

Data Pages

↓

Commit
```

---

# 🏗️ Architecture Insight

DML rarely modifies a table directly.

Instead, the storage engine coordinates:

- Buffer cache
- Data pages
- Index pages
- Transaction log
- Lock manager
- Recovery manager

This layered architecture allows databases to provide durability and concurrency while maintaining high performance.

---

# ⚡ Performance Tip

Small, targeted DML operations are generally more efficient than large, unfiltered modifications.

For example, an `UPDATE` with a selective `WHERE` clause typically affects fewer rows, generates less logging, and acquires fewer locks than an unrestricted update.

Batch processing is often preferred over one massive transaction when modifying very large datasets.

---

# 🔒 Security Note

Application users should rarely execute unrestricted `UPDATE` or `DELETE` statements.

Good practices include:

- Parameterized queries
- Role-based permissions
- Audit logging
- Change approval for sensitive tables

These measures help prevent accidental or malicious data modifications.

---

# 🌍 Production Consideration

High-volume systems continuously optimise DML workloads by using:

- Batch processing
- Partitioning
- Appropriate indexes
- Connection pooling
- Replication
- Background workers
- Queue-based processing

These techniques reduce contention and improve throughput.

---

# 🚀 Enterprise Practice

Large organisations treat every data modification as a business event.

A single customer update may involve:

- Updating the primary table
- Recording an audit log
- Publishing an event
- Updating search indexes
- Refreshing caches
- Triggering downstream services

Modern applications rarely execute isolated DML statements.

---

# DBMS Compatibility

| Feature | MySQL (InnoDB) | PostgreSQL | SQL Server | Oracle | MariaDB | SQLite |
|----------|:--------------:|:----------:|:----------:|:------:|:--------:|:------:|
| Row-Level Locking | ✅ | ✅ | ✅ | ✅ | ✅ | Limited |
| MVCC | ✅ | ✅ | Snapshot-based | ✅ | ✅ | ✅ |
| Write-Ahead Logging | Redo Log | WAL | Transaction Log | Redo Log | Redo Log | WAL Journal |
| Undo Mechanism | Undo Log | MVCC Tuples | Version Store | Undo Segments | Undo Log | Rollback Journal |

---

# Common Mistakes

- Assuming `UPDATE` immediately overwrites data.
- Ignoring transaction boundaries.
- Running large updates without filters.
- Holding transactions open for long periods.
- Forgetting that every modification generates logging overhead.

---

# Best Practices

✔ Keep transactions short.

✔ Modify only the required rows.

✔ Always include appropriate filtering conditions.

✔ Understand your DBMS's concurrency model.

✔ Monitor lock contention in production.

✔ Test large updates before deployment.

---

# 💡 Did You Know?

On many modern databases, an `UPDATE` is not always an in-place modification. Depending on the storage engine and concurrency model, the database may create a new row version, update indexes, write transaction logs, and defer cleanup of obsolete versions until they are no longer needed by active transactions.

---

# Quick Reference

| Concept | Purpose |
|----------|---------|
| DML | Modify table data |
| Data Pages | Store rows |
| MVCC | Concurrent reads and writes |
| WAL | Crash recovery |
| Undo Log | Rollback changes |
| Redo Log | Recover committed work |
| Locking | Prevent conflicting updates |
| Transactions | Group related changes |

---

# Interview Questions

## Basic

1. What is DML?
2. How is DML different from DDL?
3. What commands belong to DML?

### Intermediate

4. What is MVCC?
5. Why is Write-Ahead Logging important?
6. Explain the difference between Undo and Redo logs.

### Advanced

7. Why do databases create row versions?
8. Compare row-level and table-level locking.
9. Explain how a database recovers from a crash during an update.

---

# Hands-on Exercises

### Exercise 1

Research how PostgreSQL implements MVCC and compare it with InnoDB's MVCC implementation.

### Exercise 2

Draw the internal execution flow of an `UPDATE` statement from parser to commit.

### Exercise 3

Explain what happens if a server crashes immediately after a transaction log is written but before the modified data page reaches disk.

### Exercise 4

Investigate your preferred DBMS and identify which recovery mechanism it uses (WAL, redo logs, undo logs, version store, or rollback journal).

---

# Related Topics

- **04.07 — SQL Command Categories**
- **04.08 — Data Definition Language (DDL) Deep Dive**
- **04.10 — Data Query Language (DQL) Deep Dive**
- **04.12 — Transaction Control Language (TCL) Deep Dive**
- **07.xx — INSERT**
- **08.xx — UPDATE**
- **09.xx — DELETE**
- **10.xx — Transactions & ACID**

---

# Summary

Data Manipulation Language (DML) is responsible for changing the contents of database tables. Beneath every `INSERT`, `UPDATE`, or `DELETE`, the database performs a coordinated sequence of operations involving row storage, transaction logs, concurrency control, locking, and recovery mechanisms. Technologies such as MVCC, Write-Ahead Logging, and undo/redo logging allow modern database systems to maintain consistency, durability, and high concurrency even while processing millions of transactions concurrently.