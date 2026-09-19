---
title: "06.07 - LIKE and Pattern Matching"
description: "Search text with SQL LIKE: the % and _ wildcards, NOT LIKE, ESCAPE, case sensitivity and collations, ILIKE, regular expressions across databases, why leading wildcards defeat indexes, and when to use full-text search."
chapter: 6
section: 6.07
category: Data Query Language (DQL)
difficulty: Beginner → Advanced
readingTime: 50 min
lastUpdated: 2026-09-19
---

# 06.07 LIKE and Pattern Matching

---

# Learning Objectives

After completing this section, you will be able to:

- Match text patterns with `LIKE`.
- Use the `%` and `_` wildcards.
- Exclude patterns with `NOT LIKE`.
- Search for literal `%` and `_` characters with `ESCAPE`.
- Explain how collations affect case sensitivity.
- Compare `LIKE` with regular expressions and full-text search.
- Explain why leading wildcards prevent index seeks.

---

# What is LIKE?

`LIKE` compares a string with a **pattern**.

```sql
SELECT
    CustomerName
FROM Customers
WHERE CustomerName LIKE 'Sam%';
```

Returns names beginning with `Sam`: Sam, Samuel, Samantha, Samir.

---

# Wildcards

| Wildcard | Matches | Example | Matches |
|----------|---------|---------|---------|
| `%` | Any sequence of zero or more characters | `'Sam%'` | `Sam`, `Samuel` |
| `_` | Exactly one character | `'Sa_'` | `Sam`, `Sal` (not `Sa`, not `Sami`) |

Every other character matches itself.

---

# Common Patterns

| Pattern | Meaning | Example matches |
|---------|---------|-----------------|
| `'abc%'` | Starts with `abc` | `abcdef` |
| `'%abc'` | Ends with `abc` | `xyzabc` |
| `'%abc%'` | Contains `abc` | `xxabcxx` |
| `'a_c'` | `a`, any one character, `c` | `abc`, `a1c` |
| `'___'` | Exactly three characters | `abc`, `123` |
| `'_%'` | At least one character | anything non-empty |

---

# Starts With

```sql
SELECT
    ProductName
FROM Products
WHERE ProductName LIKE 'Wireless%';
```

---

# Ends With

```sql
SELECT
    Email
FROM Users
WHERE Email LIKE '%@example.com';
```

---

# Contains

```sql
SELECT
    Title
FROM Articles
WHERE Title LIKE '%database%';
```

---

# Fixed-Length Codes

```sql
SELECT
    ProductCode
FROM Products
WHERE ProductCode LIKE 'SKU-____';
```

Matches `SKU-` followed by exactly four characters.

---

# NOT LIKE

```sql
SELECT
    Email
FROM Users
WHERE Email NOT LIKE '%@example.com';
```

Returns users whose email does not end with `@example.com`.

As with other predicates, rows where `Email` is `NULL` are returned by **neither** `LIKE` nor `NOT LIKE`.

---

# Matching Literal % and _ with ESCAPE

To search for a literal wildcard character, declare an escape character:

```sql
SELECT
    Description
FROM Promotions
WHERE Description LIKE '%50\% off%' ESCAPE '\';
```

Here `\%` means "a real percent sign".

Underscores are a frequent surprise:

```sql
WHERE FileName LIKE 'report_2026%'
```

The `_` matches **any** character, so `report-2026.pdf` and `reportX2026.pdf` also match. To match only underscores:

```sql
WHERE FileName LIKE 'report\_2026%' ESCAPE '\'
```

> **Note:** MySQL uses `\` as the default escape character even without an `ESCAPE` clause. Declaring `ESCAPE` explicitly makes the intent portable.

---

# Case Sensitivity

Whether `LIKE 'sam%'` matches `Samuel` depends on the database and collation:

| Database | Default `LIKE` behavior |
|----------|-------------------------|
| PostgreSQL | Case-sensitive (use `ILIKE` for case-insensitive) |
| MySQL | Case-insensitive with default `_ci` collations |
| SQL Server | Depends on collation (default installs are case-insensitive) |
| Oracle | Case-sensitive |
| SQLite | Case-insensitive for ASCII letters only |

Portable case-insensitive matching:

```sql
WHERE LOWER(CustomerName) LIKE 'sam%'
```

This works everywhere, but applying `LOWER()` to the column prevents ordinary index use (Section 06.12). Case-insensitive collations or expression indexes are better long-term solutions.

---

# Leading Wildcards and Indexes

A B-tree index on `CustomerName` is sorted alphabetically.

```sql
WHERE CustomerName LIKE 'Sam%'
```

The engine can seek to `'Sam'` and read forwards—an efficient range scan:

```text
... │ Rita │ Sam │ Samantha │ Samuel │ Sara │ ...
              ▲                       ▲
           seek here              stop here
```

```sql
WHERE CustomerName LIKE '%sam%'
```

A match could be anywhere in the sorted order, so the engine must examine **every entry**:

```text
│ Adam │ Bosam │ Chris │ ... │ Wasam │ Zara │
  ▲──────────── scan everything ───────────▲
```

Rules of thumb:

- `'abc%'` — can use an index range scan.
- `'%abc'` and `'%abc%'` — cannot seek; usually a full scan.

---

# Searching Inside Text at Scale

For "contains" searches on large tables, use specialized features instead of `LIKE '%...%'`:

| Need | Feature |
|------|---------|
| Substring search | PostgreSQL trigram indexes (`pg_trgm`), which accelerate `LIKE '%x%'` |
| Word search, ranking, stemming | Full-text search: PostgreSQL `tsvector`, MySQL `FULLTEXT`, SQL Server Full-Text Search, Oracle Text, SQLite FTS5 |
| Search engine features | External engines such as Elasticsearch or OpenSearch |

---

# Regular Expressions

Some patterns cannot be expressed with `%` and `_`. Most databases offer regular expressions, with non-standard syntax:

```sql
-- PostgreSQL
WHERE Phone ~ '^[0-9]{10}$'
```

```sql
-- MySQL 8, Oracle
WHERE REGEXP_LIKE(Phone, '^[0-9]{10}$')
```

The SQL standard also defines `SIMILAR TO` (supported by PostgreSQL), but it is rarely used.

SQL Server's `LIKE` supports character classes as an extension:

```sql
WHERE ProductCode LIKE '[A-C]%'
```

and SQL Server 2025 adds `REGEXP_LIKE`.

---

# LIKE with Parameters

```sql
SELECT
    ProductName
FROM Products
WHERE ProductName LIKE ?;
```

The application supplies the whole pattern, for example `'Wire%'`.

If users type search text, **escape `%`, `_`, and the escape character** in their input before adding your own wildcards. Otherwise a user searching for `50%` gets unexpected results—and a user entering `%` can force expensive scans.

---

# Visual Representation

```text
Pattern:   S  a  m  %
           │  │  │  └── any sequence (including empty)
           │  │  └───── literal 'm'
           │  └──────── literal 'a'
           └─────────── literal 'S'

'Samuel'   S a m u e l   ✅
'Sam'      S a m         ✅ (% matches empty)
'Pam'      P ...         ❌
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN
3. WHERE   ← LIKE patterns are evaluated here
4. GROUP BY
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY
9. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
WHERE Name LIKE 'Sam%'

↓

Prefix is known: 'Sam'

↓

Rewrite as a range:
Name >= 'Sam' AND Name < 'San'
(collation permitting)

↓

Index range scan

↓

Re-check LIKE on each candidate
```

```text
WHERE Name LIKE '%sam%'

↓

No fixed prefix

↓

Full table or index scan

↓

Evaluate pattern on every row
```

---

# 🔬 Engine Deep Dive

Pattern matching itself is performed by a small matcher that walks the string and the pattern together:

```text
Pattern   S a m %
String    S a m u e l
          ✓ ✓ ✓ └─ % consumes the rest
```

Patterns with several `%` wildcards may require backtracking, so complex patterns on long text columns cost more CPU per row. The dominant cost, however, is almost always the number of rows examined—which is why prefix patterns that allow index seeks matter so much more than the pattern's complexity.

---

# 🏗️ Architecture Insight

`LIKE` is designed for simple pattern checks on short strings, not for searching documents. When a product requirement says "search", it usually means word matching, relevance ranking, and typo tolerance—capabilities that belong to full-text search engines. Choosing the right tool early avoids painful performance problems later.

---

# ⚡ Performance Tip

Prefer prefix patterns (`'abc%'`) on indexed columns. For contains-searches on large tables, use trigram or full-text indexes. Avoid wrapping the column in `LOWER()` or `UPPER()` unless an expression index exists for that exact expression.

---

# 🔒 Security Note

Parameterizing a `LIKE` pattern prevents SQL injection but not **pattern injection**: a user can still supply `%` or `_` to broaden the search or trigger slow scans. Escape wildcard characters in user input and enforce minimum search lengths on public search forms.

---

# 🌍 Production Consideration

Search boxes backed by `LIKE '%term%'` perform well in development with small datasets and degrade sharply as tables grow. Monitor the execution plans of search queries and plan for trigram or full-text indexing before data volumes make the problem urgent.

---

# 🚀 Enterprise Practice

Enterprise systems typically separate lookup from search: exact and prefix lookups (codes, emails, usernames) use indexed equality or `LIKE 'prefix%'`, while free-text search is delegated to full-text indexes or a dedicated search service that is kept in sync with the database.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| `LIKE` with `%`, `_` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ESCAPE` clause | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Default escape character | None | `\` | `\` | None | None | None |
| Case-insensitive operator | — | `ILIKE` | Collation | Collation | `REGEXP_LIKE(..., 'i')` | `LIKE` (ASCII) |
| `[a-z]` classes in `LIKE` | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Regular expressions | `SIMILAR TO`, `LIKE_REGEX` | `~`, `SIMILAR TO` | `REGEXP_LIKE`, `REGEXP` | `REGEXP_LIKE` (2025+) | `REGEXP_LIKE` | `REGEXP` (extension required) |

> **Portability Tip:** Basic `LIKE` with `%`, `_`, and an explicit `ESCAPE` clause is portable. Case sensitivity, default escape characters, character classes, and regular expressions all vary by database.

---

# Common Mistakes

### Mistake 1

Forgetting that `_` is a wildcard when searching for names such as `report_2026`.

---

### Mistake 2

Using `LIKE '%term%'` for search on large tables without a suitable index.

---

### Mistake 3

Assuming `LIKE` is case-insensitive (or case-sensitive) on every database.

---

### Mistake 4

Using `LIKE` without wildcards when `=` is intended:

```sql
WHERE Country LIKE 'India'   -- works, but = is clearer
```

---

### Mistake 5

Passing raw user input as a pattern without escaping `%` and `_`.

---

# Best Practices

✔ Use `=` for exact matches and `LIKE` only for patterns.

✔ Prefer prefix patterns on indexed columns.

✔ Declare `ESCAPE` explicitly when matching literal wildcards.

✔ Escape wildcards in user-supplied search text.

✔ Use trigram or full-text indexes for contains-searches at scale.

✔ Handle case sensitivity with collations or expression indexes.

---

# Interview Questions

## Basic

1. What do `%` and `_` mean in a `LIKE` pattern?
2. How do you find strings that end with `.pdf`?
3. What does `NOT LIKE` return for `NULL` values?

## Intermediate

4. How do you search for a literal percent sign?
5. Why can `LIKE 'abc%'` use an index but `LIKE '%abc'` cannot?
6. How does case sensitivity of `LIKE` differ between PostgreSQL and MySQL?

## Advanced

7. How can a prefix `LIKE` be rewritten as a range predicate?
8. When should you use full-text search instead of `LIKE`?
9. What is pattern injection, and how do you prevent it?

---

# Hands-on Exercises

## Exercise 1

Return all customers whose email ends with `@gmail.com`.

---

## Exercise 2

Return all product codes of the form `P-` followed by exactly three characters.

---

## Exercise 3

Return all file names that contain the literal text `_final`.

---

## Exercise 4

A search page runs this query on a 20-million-row table and is slow:

```sql
WHERE ProductName LIKE '%' || ? || '%'
```

Describe two different ways to make it fast.

---

# Related Topics

- **06.03 — Comparison Operators**
- **06.09 — Filtering with Expressions and Functions**
- **06.12 — SARGability and Index-Friendly Predicates**
- **10.xx — Indexes**
- **12.xx — String Functions**

---

# Summary

`LIKE` matches strings against patterns built from literal characters and two wildcards: `%` for any sequence and `_` for exactly one character. `ESCAPE` allows literal wildcards to be matched, and collations determine case sensitivity, which varies between databases. Prefix patterns can use B-tree indexes as range scans, while leading wildcards force full scans. For substring and word searches on large data, trigram and full-text indexes—or a dedicated search engine—are the right tools.
