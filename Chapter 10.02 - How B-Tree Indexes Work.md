---
title: "10.02 - How B-Tree Indexes Work"
description: "The B-tree (B+tree) structure behind database indexes: pages, root, branch and leaf levels, fan-out and height, searching, range scans along linked leaves, insertion and page splits, deletion, row locators, duplicates, NULLs and sort direction."
chapter: 10
section: 10.02
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 30 min
lastUpdated: 2026-09-25
---

# 10.02 How B-Tree Indexes Work

---

# Learning Objectives

After completing this section, you will be able to:

- Describe the root, branch and leaf levels of a B-tree index.
- Explain why a B-tree over millions of rows is only three or four levels deep.
- Trace an equality search and a range scan through the tree.
- Explain page splits and why they affect insert performance.
- Describe what a leaf entry contains (key and row locator).
- Explain how B-trees handle duplicates, `NULL`s and descending order.

---

# What is a B-Tree?

A **B-tree** is a balanced, sorted tree of fixed-size pages. Database indexes use the **B+tree** variant, in which:

- all keys with their row pointers live in the **leaf** pages;
- upper (**branch** and **root**) pages hold only separator keys that guide the search;
- leaf pages are **linked** to their neighbours, so a range can be read left to right;
- every leaf is at the same depth—the tree is always **balanced**.

"B-tree" in database documentation almost always means B+tree.

---

# The Structure

```text
Index on Orders(CustomerID)

Level 2 (root)                   ┌─────────────────────────┐
                                 │   40 000  │   80 000    │
                                 └─────┬───────────┬──────┬┘
                     ┌─────────────────┘           │      └─────────────────┐
Level 1 (branch) ┌───▼──────────────┐      ┌───────▼──────────┐   ┌────────▼─────────┐
                 │ 100 │ 200 │ …    │      │ 40 100 │ …       │   │ 80 100 │ …       │
                 └──┬─────┬─────────┘      └──────────────────┘   └──────────────────┘
          ┌─────────┘     └──────┐
Level 0 ┌─▼──────────────────┐ ┌─▼──────────────────┐
(leaf)  │ 1→r12  1→r98  2→r3 │⇄│ 100→r7 101→r55 … │⇄ …        linked leaf pages
        │ … 42→r102 42→r104  │ │                    │
        └────────────────────┘ └────────────────────┘
```

- **Root page:** one page, the entry point.
- **Branch pages:** separator keys and pointers to child pages.
- **Leaf pages:** every indexed key in sorted order, each with a **row locator**, and pointers to the previous and next leaf.

---

# Fan-Out and Height

A page holds many entries. With an 8 KB page and a small integer key, a branch page can point to several hundred children. That **fan-out** makes the tree very shallow:

```text
Fan-out ≈ 400 child pointers per page

Height 1:  1 root (= leaf)                          →        ~400 keys
Height 2:  1 root → 400 leaves                      →    ~160 000 keys
Height 3:  1 root → 400 branches → 160 000 leaves   →  ~64 000 000 keys
Height 4:                                           → ~25 600 000 000 keys
```

A lookup reads one page per level. For a table of 64 million rows, finding a key costs about **three page reads**—and the root and branch pages of a busy index are almost always cached in memory, so in practice it is often one physical read or none.

Wide keys reduce fan-out: a 200-byte `VARCHAR` key fits far fewer entries per page than a 4-byte `INT`, so the tree is taller and larger. This is one reason to prefer narrow index keys.

---

# Searching for a Value

```text
WHERE CustomerID = 42

root:    42 < 40 000       → go to child 1
branch:  42 < 100          → go to leaf 1
leaf:    scan to first 42  → 42→r102, 42→r104, 42→r877 …
         continue right while key = 42 (following leaf links if needed)
```

Each step is a binary search inside one page. The total work is *height + number of matching entries*.

---

# Range Scans

```text
WHERE CustomerID BETWEEN 100 AND 250

1. Search for 100, as above → first leaf entry ≥ 100
2. Read entries left to right
3. At the end of a leaf page, follow the "next" link
4. Stop at the first entry > 250
```

Because leaves are linked in key order, a range scan never goes back up the tree. The same mechanism serves `>`, `<`, `BETWEEN`, `LIKE 'prefix%'`, `ORDER BY` and "top N".

---

# What a Leaf Entry Contains

```text
Leaf entry = (key columns, row locator)

PostgreSQL, Oracle, SQL Server heap:  row locator = physical address (page, slot)
SQL Server clustered table, InnoDB:   row locator = clustering key (usually the primary key)
SQLite rowid table:                   row locator = rowid
```

The difference matters for Section 10.04: with a physical address, finding the row is one page read; with a clustering key, it is a second B-tree search in the clustered index.

---

# Inserting and Page Splits

New keys go into the leaf page where they belong in sort order:

```text
Leaf page full:   [ 10 | 20 | 30 | 40 ]   insert 25

Split:            [ 10 | 20 | 25 ]  ⇄  [ 30 | 40 ]      new page allocated,
                                                         separator 30 added to parent
```

- If the parent is also full, it splits too; a root split adds a new level. This is the only way a B-tree grows taller, which keeps it balanced.
- Splits cost extra I/O and leave pages partly empty.
- Keys inserted in **increasing order** (identity columns, timestamps) always go to the rightmost leaf; engines optimise this case and pages end up full.
- Keys inserted in **random order** (random UUIDs) hit leaves all over the index, causing frequent splits, half-empty pages and poor cache locality.

---

# Deleting

Deleting a row removes (or marks) its leaf entry. Most engines do not immediately merge half-empty pages; the space is reused by later inserts or reclaimed by maintenance (`VACUUM`, index rebuilds—Section 10.14). PostgreSQL additionally keeps index entries for dead row versions until `VACUUM` removes them, because of its multi-version design.

---

# Duplicates

A non-unique index can hold many equal keys. Engines keep them in a deterministic order by treating the row locator as a hidden final key column (SQL Server calls this a *uniquifier* on clustered indexes; InnoDB appends the primary key). PostgreSQL 13+ additionally **deduplicates**, storing one key with a list of row locators, which shrinks indexes on low-cardinality columns considerably.

---

# NULLs in a B-Tree

| Engine | Are `NULL` keys stored? | Where do they sort? |
|--------|-------------------------|---------------------|
| PostgreSQL | ✅ | Last by default (`NULLS FIRST/LAST` configurable) |
| MySQL | ✅ | First |
| SQL Server | ✅ | First |
| Oracle | ❌ if **all** key columns are `NULL` | Last |
| SQLite | ✅ | First |

The Oracle row is important: a single-column Oracle B-tree index cannot answer `WHERE col IS NULL`, because those rows are not in it. The usual workaround is a composite index with a constant or `NOT NULL` second column: `CREATE INDEX … ON t (col, 0)`.

---

# Ascending and Descending

A B-tree can be read in either direction, so a single-column index serves both `ORDER BY col ASC` and `ORDER BY col DESC`. Direction matters only for composite indexes with **mixed** directions:

```sql
-- Needs (CustomerID ASC, OrderDate DESC) — or both reversed
ORDER BY CustomerID ASC, OrderDate DESC

CREATE INDEX IX_Orders_Cust_DateDesc ON Orders (CustomerID ASC, OrderDate DESC);
```

---

# Visual Representation

```text
               SEARCH (equality)                    RANGE SCAN

               root                                 root
                 │                                    │
               branch                               branch
                 │                                    │
               leaf ● 42 42 42                      leaf ● 100 120 … ─→ leaf … 250 ■
                                                         └──── follow leaf links ────┘
cost = height + matches                             cost = height + leaves in range
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← the B-tree is entered here when an index access path is chosen
2. JOIN        ← one B-tree search per outer row in an index nested loop join
3. WHERE       ← seek predicates choose the start and end points in the leaves
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY    ← reading leaves in order supplies sorted rows
9. LIMIT / FETCH / TOP  ← the leaf scan stops after N entries
```

---

# How the DBMS Executes This

```text
Index Scan using ix_orders_customerid on orders
  Index Cond: (customerid = 42)

1. Read root page (buffer cache)        ─┐
2. Read branch page (buffer cache)       ├─ descent: height pages
3. Read leaf page                       ─┘
4. For each matching entry:
       fetch table row by locator       ← often the dominant cost
5. Follow leaf link while key = 42
```

---

# 🔬 Engine Deep Dive

B-tree implementations add many refinements to the textbook structure: **prefix and suffix truncation** of separator keys (smaller branch pages, higher fan-out), **right-link pointers** (Lehman–Yao) so readers can proceed while a page is being split, **fill factor** settings that leave free space in leaves to delay splits, and **fast-path inserts** to the rightmost leaf for increasing keys. These are why real indexes are shallower and more concurrent than the basic algorithm suggests.

---

# 🏗️ Architecture Insight

The B-tree's logarithmic depth is what makes relational databases scale for point lookups: a thousandfold increase in rows adds roughly one level. What does *not* scale logarithmically is the number of matching rows and the random reads to fetch them—so designs that keep "rows per lookup" small (selective keys, covering indexes) stay fast as data grows.

---

# ⚡ Performance Tip

Prefer narrow, ever-increasing keys for large, insert-heavy indexes—an `INT`/`BIGINT` identity or a time-ordered UUID (UUIDv7)—over random UUIDv4 values. Random keys scatter inserts across the whole index, causing page splits and filling the buffer cache with index pages.

---

# 🔒 Security Note

Deleted values can survive in index pages until the space is reused or the index is rebuilt, and they remain in older backups. For data that must be erased (for example under data-protection law), deletion procedures should include index rebuilds or equivalent storage-level guarantees.

---

# SQL Standard vs Vendor Differences

| Feature | PostgreSQL | MySQL (InnoDB) | SQL Server | Oracle | SQLite |
|---------|-----------|-------|-----------|--------|--------|
| Default index structure | B+tree | B+tree | B+tree | B+tree | B-tree / B+tree |
| Page size | 8 KB | 16 KB | 8 KB | 2–32 KB (8 KB typical) | 512 B–64 KB (4 KB default) |
| Key deduplication | ✅ (13+) | ❌ | ❌ (compression) | Prefix compression | ❌ |
| All-`NULL` keys indexed | ✅ | ✅ | ✅ | ❌ | ✅ |
| Fill factor setting | ✅ (default 90 for B-tree) | `innodb_fill_factor` | ✅ (`FILLFACTOR`) | `PCTFREE` | ❌ |

> **Portability Tip:** The B-tree behaves the same way on every engine for equality, ranges and ordering. The differences worth remembering are `NULL` handling on Oracle and the row locator type (Section 10.04).

---

# Common Mistakes

### Mistake 1

Believing an index lookup reads "the index" linearly—it descends a tree of a few levels.

---

### Mistake 2

Using long text columns as index keys where a narrow surrogate key would do.

---

### Mistake 3

Using random UUIDv4 primary keys on very large insert-heavy tables without considering page splits.

---

### Mistake 4

Expecting a single-column Oracle index to find `IS NULL` rows.

---

# Best Practices

✔ Keep index keys narrow.

✔ Prefer increasing keys for heavily inserted indexes.

✔ Create mixed-direction composite indexes only when a query needs that order.

✔ Remember that the cost of a lookup is the tree height plus the rows fetched.

---

# Interview Questions

## Basic

1. What are the root, branch and leaf levels of a B-tree?
2. Why is a B-tree over millions of rows only a few levels deep?
3. Why are leaf pages linked together?

## Intermediate

4. What is a page split and when does it happen?
5. What does a leaf entry point to?
6. Why can one ascending index serve `ORDER BY col DESC`?

## Advanced

7. Why do random UUID keys hurt insert performance and cache efficiency?
8. How does Oracle's treatment of `NULL` keys affect `IS NULL` queries?
9. What is B-tree deduplication and when does it help?

---

# Hands-on Exercises

## Exercise 1

Calculate the height of a B-tree with fan-out 300 for 1 million, 100 million and 10 billion keys.

---

## Exercise 2

On PostgreSQL, create an index on 1 million sequential and 1 million random UUID values and compare their sizes with `pg_relation_size`.

---

## Exercise 3

Trace, page by page, how the index in the diagram answers `WHERE CustomerID BETWEEN 90 AND 110`.

---

## Exercise 4

Find out how your engine sorts `NULL` in an index and whether `ORDER BY col NULLS FIRST` can use it.

---

# Related Topics

- **10.01 — Introduction to Indexes**
- **10.04 — Clustered and Nonclustered Indexes**
- **10.08 — Index Seeks, Scans and Lookups**
- **10.14 — Index Maintenance (Fragmentation, Rebuilds and Monitoring)**
- **07.14 — Execution Flow of JOINs (Join Algorithms)**

---

# Summary

A database B-tree (strictly, B+tree) is a balanced tree of pages: a root and branch levels hold separator keys, and linked leaf pages hold every key in sorted order with a row locator. High fan-out keeps the tree three or four levels deep even for billions of keys, so a lookup costs the tree height plus the matching entries, and a range scan descends once and then walks the leaves. Inserts may split pages, which is why narrow, increasing keys index best; deletes leave space to be reused or reclaimed. Duplicates, `NULL`s and sort direction are handled consistently, with Oracle's omission of all-`NULL` keys as the main exception.
