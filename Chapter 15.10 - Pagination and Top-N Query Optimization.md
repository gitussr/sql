---
title: "15.10 - Pagination and Top-N Query Optimization"
description: "Making top-N and paged queries fast: indexes that match ORDER BY so the engine reads N rows and stops, top-N sorts, why OFFSET pagination gets slower with every page, keyset (seek) pagination with row-value comparisons and their expanded form, unique tiebreakers, previous-page and jump navigation, total counts and estimates, deferred joins for wide rows, and pagination syntax on each engine."
chapter: 15
section: 15.10
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 15.10 Pagination and Top-N Query Optimization

---

# Learning Objectives

After completing this section, you will be able to:

- Make top-N queries read only N rows with the right index.
- Explain why `OFFSET` pagination slows down with every page.
- Implement keyset pagination on every engine.
- Handle ties, previous pages and total counts efficiently.
- Use deferred joins for paginating wide rows.

---

# Top-N With a Matching Index

```sql
-- Latest 20 orders for a customer
SELECT OrderID, OrderDate, TotalAmount
FROM Orders
WHERE CustomerID = :c
ORDER BY OrderDate DESC, OrderID DESC
FETCH FIRST 20 ROWS ONLY;             -- LIMIT 20 (PostgreSQL, MySQL, SQLite) · TOP (20) (SQL Server)
```

```sql
CREATE INDEX ix_orders_customer_date ON Orders (CustomerID, OrderDate, OrderID);
```

```text
with the index:     seek to CustomerID = :c, read the index backwards, stop after 20 entries
without it:         find all the customer's orders, sort them, return 20
```

The index must match the **filter** (equality columns first) and then the **order** (the `ORDER BY` columns, in order). Most engines can read an index backwards, so `DESC` in the query works with an ascending index—except for mixed directions (`ORDER BY a ASC, b DESC`), which need an index declared the same way.

---

# Top-N Sort When No Index Matches

Without a suitable index the engine must look at every candidate row, but it does not need a full sort: a **top-N sort** keeps only the best N rows in a small heap.

```text
PostgreSQL:  Sort Method: top-N heapsort  Memory: 27kB
SQL Server:  Sort (Top N Sort)
MySQL:       filesort with priority queue
```

It is far cheaper than a full sort—but still reads every candidate row. For large tables, an index is the real fix.

---

# OFFSET Pagination Gets Slower Every Page

```sql
SELECT OrderID, OrderDate, TotalAmount
FROM Orders
WHERE CustomerID = :c
ORDER BY OrderDate DESC, OrderID DESC
OFFSET 20000 ROWS FETCH NEXT 20 ROWS ONLY;
```

```text
page 1:      read 20 rows,      return 20
page 100:    read 2,000 rows,   return 20
page 1,000:  read 20,000 rows,  return 20      ← OFFSET rows are read and thrown away
```

`OFFSET` has no way to jump: the engine must produce and discard every skipped row. Deep pages get slower linearly, and crawlers that walk every page cause quadratic total work. Results can also shift between requests—a newly inserted row pushes items to the next page, so users see duplicates or miss rows.

---

# Keyset (Seek) Pagination

Instead of "skip N rows", say "continue after the last row I saw":

```sql
-- first page
SELECT OrderID, OrderDate, TotalAmount
FROM Orders
WHERE CustomerID = :c
ORDER BY OrderDate DESC, OrderID DESC
FETCH FIRST 20 ROWS ONLY;
-- remember the last row's (OrderDate, OrderID) = ('2026-08-14', 88213)

-- next page: row-value comparison (PostgreSQL, MySQL, SQLite)
SELECT OrderID, OrderDate, TotalAmount
FROM Orders
WHERE CustomerID = :c
  AND (OrderDate, OrderID) < (:lastDate, :lastId)
ORDER BY OrderDate DESC, OrderID DESC
FETCH FIRST 20 ROWS ONLY;
```

SQL Server and Oracle do not support row-value `<`. Expand it:

```sql
WHERE CustomerID = @c
  AND (OrderDate < @lastDate
       OR (OrderDate = @lastDate AND OrderID < @lastId))
ORDER BY OrderDate DESC, OrderID DESC
OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY;          -- or SELECT TOP (20)
```

With the index `(CustomerID, OrderDate, OrderID)`, every page is a seek to the last position and a read of 20 entries—page 1,000 costs the same as page 1. (MySQL has historically optimized the row-value form less reliably than the expanded one on some versions; check the plan.)

---

# Tiebreakers Are Mandatory

```sql
ORDER BY OrderDate DESC                 -- ❌ many orders share a date: page boundaries are ambiguous
ORDER BY OrderDate DESC, OrderID DESC   -- ✅ unique ordering: every row has exactly one position
```

Both `OFFSET` and keyset pagination need a **unique** sort key. Without one, rows with equal sort values can appear on two pages or on none, and the order may differ between executions.

---

# Previous Page and Jumps

Previous page: reverse the comparison and the order, then reverse the result:

```sql
SELECT * FROM (
    SELECT OrderID, OrderDate, TotalAmount
    FROM Orders
    WHERE CustomerID = :c AND (OrderDate, OrderID) > (:firstDate, :firstId)
    ORDER BY OrderDate ASC, OrderID ASC
    FETCH FIRST 20 ROWS ONLY
) AS p
ORDER BY OrderDate DESC, OrderID DESC;
```

Keyset pagination cannot jump to "page 537" directly. Most interfaces don't need that (infinite scroll, next/previous, "load more"); where they do, combine a keyset for navigation with coarse jumps (by date: "orders from March 2026") rather than by page number.

---

# Total Counts

"Page 3 of 48,210" requires counting every matching row—often more expensive than the page itself.

```text
options:
  exact count on every request        expensive on large sets
  count once, cache it                stale but cheap
  estimate                            PostgreSQL: EXPLAIN row estimate / pg_class.reltuples;
                                      SQL Server: sys.partitions rows (whole table)
  "more results available"            fetch N + 1 rows; show "next" if the extra row exists
```

Fetching `N + 1` rows is the cheapest way to know whether a next page exists.

---

# Deferred Joins for Wide Rows

When rows are wide and the filter/order index is narrow, paginate over the index first, then fetch the full rows for just the page:

```sql
SELECT p.*
FROM (
    SELECT PostID
    FROM Posts
    WHERE AuthorID = :a
    ORDER BY CreatedAt DESC, PostID DESC
    OFFSET 2000 ROWS FETCH NEXT 20 ROWS ONLY      -- skipping happens in a narrow index-only scan
) AS ids
JOIN Posts AS p ON p.PostID = ids.PostID
ORDER BY p.CreatedAt DESC, p.PostID DESC;
```

The skipped rows are read from a covering index instead of the wide table, which makes `OFFSET` tolerable for moderate depths. Keyset pagination is still better when possible.

---

# Syntax by Engine

| Engine | Top N | Offset |
|--------|-------|--------|
| Standard | `FETCH FIRST n ROWS ONLY` | `OFFSET m ROWS FETCH NEXT n ROWS ONLY` |
| PostgreSQL | `LIMIT n` / `FETCH FIRST` | `LIMIT n OFFSET m` / standard |
| MySQL | `LIMIT n` | `LIMIT m, n` / `LIMIT n OFFSET m` |
| SQL Server | `TOP (n)` / `OFFSET 0 ROWS FETCH NEXT n ROWS ONLY` | `OFFSET … FETCH` (2012+, requires `ORDER BY`) |
| Oracle | `FETCH FIRST n ROWS ONLY` (12c+) | `OFFSET m ROWS FETCH NEXT n ROWS ONLY` (12c+) |
| SQLite | `LIMIT n` | `LIMIT n OFFSET m` |

`FETCH FIRST n ROWS WITH TIES` (PostgreSQL 13+, SQL Server `TOP (n) WITH TIES`, Oracle) includes rows tied with the last one.

---

# Visual Representation

```text
   OFFSET 2000 FETCH 20                         keyset after (date, id)
   index: ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░               index: ─────────────────●░░░░
          └──── 2000 read and discarded ─┘ └20┘                  seek ──┘ └20┘
   cost grows with page number                   cost constant per page
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN        ← deferred join: fetch wide rows only for the page's keys
3. WHERE       ← keyset condition (date, id) < (last) becomes part of the index seek
4. GROUP BY
5. HAVING
6. WINDOW
7. SELECT      ← narrow column list keeps the index covering
8. DISTINCT
9. ORDER BY    ← must be unique and match the index to avoid a sort
10. LIMIT / FETCH / TOP   ← row goal: read N (+1) rows and stop; OFFSET rows are still read
```

---

# How the DBMS Executes This

```text
Keyset page (PostgreSQL):
  Limit (rows=20)
    -> Index Scan Backward using ix_orders_customer_date on orders
         Index Cond: ((customerid = 42) AND (ROW(orderdate, orderid) < ROW('2026-08-14', 88213)))
  Buffers: shared hit=5
OFFSET page 1,000:
  Limit (rows=20)
    -> Index Scan Backward … (actual rows=20020)     ← 20,000 rows produced and discarded
```

---

# 🏗️ Architecture Insight

Pagination is an API design decision. Cursor-based APIs (return an opaque "next" token encoding the last sort key) map directly to keyset pagination and stay fast at any depth; page-number APIs lock you into `OFFSET`. Choose cursor-based pagination for large or growing collections.

---

# ⚡ Performance Tip

Fetch one extra row (`LIMIT n + 1`) to decide whether to show a "next" link, instead of running a separate `COUNT(*)`.

---

# 🔒 Security Note

When encoding the last key into a client-visible cursor token, sign or encrypt it (or at least validate it on the server) so clients cannot tamper with it to read rows outside their permitted range. Always re-apply authorization filters in the query itself.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `FETCH FIRST` | ✅ | ✅ | ❌ (`LIMIT`) | `OFFSET … FETCH` | ✅ (12c+) | ❌ (`LIMIT`) |
| Row-value `<` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ (3.15+) |
| `WITH TIES` | ✅ | ✅ (13+) | ❌ | `TOP … WITH TIES` | ✅ | ❌ |
| Backward index scan | — | ✅ | ✅ (8.0 descending indexes) | ✅ | ✅ | ✅ |

> **Portability Tip:** The expanded keyset condition `(a < x OR (a = x AND b < y))` works on every engine; the row-value form is shorter where supported.

---

# Common Mistakes

### Mistake 1

Paginating deep into large result sets with `OFFSET`.

---

### Mistake 2

Sorting by a non-unique column.

---

### Mistake 3

Running `COUNT(*)` on every page request.

---

### Mistake 4

Missing an index that matches both the filter and the order.

---

### Mistake 5

Paginating with `SELECT *` over wide rows.

---

# Best Practices

✔ Index `(filter columns, order columns, tiebreaker)`.

✔ Use keyset pagination for large or deep collections.

✔ Always include a unique tiebreaker in `ORDER BY`.

✔ Fetch `N + 1` rows instead of counting.

✔ Use deferred joins when rows are wide.

---

# Interview Questions

## Basic

1. How do you return the top 10 rows on your engine?
2. Why does `OFFSET` get slower on later pages?
3. What is keyset pagination?

## Intermediate

4. Why must the `ORDER BY` be unique for pagination?
5. What index makes a "latest 20 orders per customer" query fast?
6. How do you write a keyset condition on SQL Server?

## Advanced

7. How do you implement "previous page" with keyset pagination?
8. What is a deferred join, and when does it help?

---

# Hands-on Exercises

## Exercise 1

Measure page 1 and page 1,000 with `OFFSET`, then with keyset pagination.

---

## Exercise 2

Implement next and previous pages for orders sorted by date with a tiebreaker.

---

## Exercise 3

Replace a total-count query with an `N + 1` fetch.

---

# Related Topics

- **15.05 — Choosing Access Paths (Scans, Seeks and Lookups)**
- **15.11 — Optimizing Aggregation and Sorting**
- **11.10 — Top-N per Group, Deduplication and QUALIFY**
- **10.11 — Indexing for JOIN, GROUP BY and ORDER BY**

---

# Summary

Top-N queries are fast when an index matches the filter and the `ORDER BY`, letting the engine read N rows and stop; otherwise a top-N sort still scans every candidate. `OFFSET` pagination reads and discards every skipped row, so it slows linearly and shifts under concurrent inserts. Keyset pagination continues from the last seen sort key—with a row-value comparison where supported or the expanded `OR` form elsewhere—and costs the same on every page, provided the ordering is unique. Fetch `N + 1` rows instead of counting, and use deferred joins when rows are wide.
