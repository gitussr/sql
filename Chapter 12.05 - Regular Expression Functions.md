---
title: "12.05 - Regular Expression Functions"
description: "Pattern matching beyond LIKE: regular expression syntax, testing with REGEXP_LIKE and operators, extracting with REGEXP_SUBSTR, replacing with REGEXP_REPLACE, counting and locating matches, flags and case sensitivity, validation and cleaning patterns, performance and indexing, ReDoS risks, and vendor differences."
chapter: 12
section: 12.05
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 30 min
lastUpdated: 2026-09-26
---

# 12.05 Regular Expression Functions

---

# Learning Objectives

After completing this section, you will be able to:

- Explain when a regular expression is needed instead of `LIKE`.
- Read and write the common regular expression elements.
- Test, extract, replace, count and locate matches on each engine.
- Control case sensitivity and multi-line behaviour with flags.
- Use regular expressions to validate and clean data.
- Predict the performance of regular expression predicates and index for them where possible.

---

# When LIKE Is Not Enough

`LIKE` (Section 06.07) has two wildcards: `%` (any sequence) and `_` (one character). It cannot express "one or more digits", "either `.com` or `.org`", or "exactly five characters from A–Z".

```sql
-- LIKE: starts with 'SKU-' and anything after
WHERE Code LIKE 'SKU-%'

-- Regular expression: 'SKU-' followed by exactly 4 digits, and nothing else
WHERE Code ~ '^SKU-[0-9]{4}$'                 -- PostgreSQL
WHERE REGEXP_LIKE(Code, '^SKU-[0-9]{4}$')      -- MySQL 8.0+, Oracle, SQL Server 2025+
```

---

# Regular Expression Essentials

| Element | Meaning | Example | Matches |
|---------|---------|---------|---------|
| `.` | Any character | `a.c` | `abc`, `a-c` |
| `[abc]`, `[a-z]` | One character from a set or range | `[0-9]` | `7` |
| `[^…]` | One character not in the set | `[^0-9]` | `x` |
| `*` / `+` / `?` | 0 or more / 1 or more / 0 or 1 | `ab+` | `ab`, `abbb` |
| `{n}`, `{n,m}` | Exactly n / between n and m | `[0-9]{3}` | `042` |
| `^` / `$` | Start / end of string | `^A.*z$` | `Amaz` |
| `a\|b` | Alternation | `\.(com\|org)$` | `x.com` |
| `( … )` | Group (and capture) | `(ab)+` | `abab` |
| `\d`, `\w`, `\s` | Digit, word character, whitespace | `\d+` | `2026` |

Engines use POSIX-style or ICU/PCRE-style flavours. The elements above work almost everywhere; look-arounds, back-references in patterns and named groups do not.

---

# Testing for a Match

```sql
-- PostgreSQL operators
WHERE Email ~  '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'     -- matches (case-sensitive)
WHERE Email ~* '@EXAMPLE\.COM$'                     -- matches, case-insensitive
WHERE Email !~ '@'                                  -- does not match

-- Function form: PostgreSQL 15+, MySQL 8.0+, Oracle, SQL Server 2025+
WHERE REGEXP_LIKE(Email, '@example\.com$', 'i')

-- MySQL operators
WHERE Email REGEXP '@example\\.com$'                -- also RLIKE; note the doubled backslash in MySQL strings
```

The pattern matches **anywhere** in the string unless anchored with `^` and `$`. `REGEXP_LIKE(Code, '[0-9]{4}')` is true for `'ABC12345XYZ'`.

---

# Extracting Matches

```sql
-- First run of digits in a free-text phone number
SELECT REGEXP_SUBSTR(Phone, '[0-9]+')         FROM Customers;   -- MySQL, Oracle, PostgreSQL 15+, SQL Server 2025+
SELECT SUBSTRING(Phone FROM '[0-9]+')         FROM Customers;   -- PostgreSQL (all versions)
SELECT (REGEXP_MATCH(Phone, '[0-9]+'))[1]     FROM Customers;   -- PostgreSQL 10+: array of captures

-- The n-th match
SELECT REGEXP_SUBSTR('red|green|blue', '[^|]+', 1, 3);            -- 'blue'  (start 1, 3rd occurrence)

-- A capture group: the domain part of an email
SELECT SUBSTRING(Email FROM '@(.+)$')         FROM Customers;   -- PostgreSQL: returns the group
SELECT REGEXP_SUBSTR(Email, '@(.+)$', 1, 1, NULL, 1) FROM Customers;   -- Oracle: 6th argument = group number
```

---

# Replacing Matches

```sql
-- Keep only the digits of a phone number
SELECT REGEXP_REPLACE(Phone, '[^0-9]', '', 'g') FROM Customers;   -- PostgreSQL: 'g' = all occurrences
SELECT REGEXP_REPLACE(Phone, '[^0-9]', '')      FROM Customers;   -- MySQL, Oracle, SQL Server 2025+: all by default

-- Collapse runs of whitespace into one space
SELECT REGEXP_REPLACE(TRIM(ProductName), '\s+', ' ', 'g') FROM Products;   -- PostgreSQL

-- Reorder with back-references: 'Rao, Asha' → 'Asha Rao'
SELECT REGEXP_REPLACE(FullName, '^([^,]+),\s*(.+)$', '\2 \1') FROM People;   -- PostgreSQL, Oracle (MySQL: '$2 $1')
```

> **PostgreSQL trap:** `REGEXP_REPLACE` replaces only the **first** match unless you pass the `'g'` flag (or, in 15+, a start position and occurrence `0`). Every other engine replaces all matches by default.

---

# Counting and Locating

```sql
-- How many digits does the phone contain?
SELECT REGEXP_COUNT(Phone, '[0-9]') FROM Customers;              -- Oracle, PostgreSQL 15+, SQL Server 2025+ (not MySQL)

-- Where does the first digit appear?
SELECT REGEXP_INSTR(Phone, '[0-9]') FROM Customers;              -- MySQL, Oracle, PostgreSQL 15+, SQL Server 2025+
```

MySQL has no `REGEXP_COUNT`; compute it as `CHAR_LENGTH(s) - CHAR_LENGTH(REGEXP_REPLACE(s, pattern, ''))` for single-character patterns.

---

# Flags

| Flag | Meaning | PostgreSQL | MySQL | Oracle | SQL Server 2025 |
|------|---------|------------|-------|--------|-----------------|
| `i` | Case-insensitive | ✅ | ✅ | ✅ | ✅ |
| `c` | Case-sensitive | ✅ | ✅ | ✅ | ✅ |
| `g` | All occurrences (replace) | ✅ | n/a (default) | n/a (default) | n/a (default) |
| `m` | `^`/`$` match at line breaks | `n` (also stops `.` matching newline) | ✅ | ✅ | ✅ |
| `n` / `s` | `.` matches newline | default | `n` | `n` | `s` |

On MySQL, a regular expression without a flag follows the column's collation—case-insensitive under the default `utf8mb4_0900_ai_ci`.

---

# Validation and Cleaning Patterns

```sql
-- Rows that fail a format rule (data-quality report)
SELECT CustomerID, Email
FROM Customers
WHERE Email IS NOT NULL
  AND NOT REGEXP_LIKE(Email, '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- Enforce a format on write (PostgreSQL)
ALTER TABLE Products
    ADD CONSTRAINT ck_sku_format CHECK (Sku ~ '^[A-Z]{3}-[0-9]{4}$');

-- Normalise before comparing: digits-only phone numbers
SELECT a.CustomerID, b.CustomerID
FROM Customers AS a
JOIN Customers AS b
  ON REGEXP_REPLACE(a.Phone, '[^0-9]', '', 'g') = REGEXP_REPLACE(b.Phone, '[^0-9]', '', 'g')
 AND a.CustomerID < b.CustomerID;                    -- possible duplicates (slow: see below)
```

Keep validation patterns simple. A "complete" email regex is thousands of characters and still wrong; check the basic shape in SQL and confirm ownership by sending an email.

---

# Visual Representation

```text
Phone = '(555) 010-2030 ext. 7'

REGEXP_LIKE(Phone, '[0-9]{3}')          → true
REGEXP_SUBSTR(Phone, '[0-9]+')          → '555'
REGEXP_SUBSTR(Phone, '[0-9]+', 1, 2)    → '010'
REGEXP_COUNT(Phone, '[0-9]')            → 11
REGEXP_REPLACE(Phone, '[^0-9]', '')     → '55501020307'
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN        ← regex in ON forces a nested loop comparison of every pair
3. WHERE       ← regex predicates are evaluated per examined row
4. GROUP BY
5. HAVING
6. WINDOW
7. SELECT      ← extraction and replacement for display
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

Put cheap, selective predicates before expensive ones in your reasoning—engines generally evaluate a regular expression only for rows that pass other filters, but they are not obliged to.

---

# How the DBMS Executes This

```text
REGEXP_LIKE(col, pattern)
  1. compile the pattern (once per statement when it is a constant)
  2. for each row: run the automaton over the string
  3. no B-tree index can answer an arbitrary pattern → full scan (or index scan + filter)

Exceptions:
  - PostgreSQL pg_trgm GIN/GiST indexes accelerate ~, ~*, LIKE and ILIKE
  - Anchored prefix patterns ('^ABC') can use a B-tree in PostgreSQL with a C collation or text_pattern_ops
```

---

# 🔬 Engine Deep Dive

PostgreSQL's trigram index extracts the three-character sequences a pattern **must** contain (for `'example\.com'`: `exa`, `xam`, `amp`, …), uses the index to find candidate rows containing all of them, then rechecks each candidate with the real regular expression. Patterns with long literal parts benefit most; patterns like `'[0-9]+'` have no required trigrams and still scan.

---

# 🏗️ Architecture Insight

Regular expressions are best at the edges: validating on write (`CHECK` constraints) and cleaning during import. Queries that use regular expressions to parse the same column repeatedly are telling you the column should be split or normalised when it is written.

---

# ⚡ Performance Tip

Filter with cheap, indexable predicates first and apply the regular expression to the remaining rows. Pre-compute cleaned values (digits-only phone) in a generated column with an index instead of joining on `REGEXP_REPLACE`.

---

# 🔒 Security Note

Never accept regular expressions from users without limits. Patterns with nested quantifiers such as `(a+)+$` can take exponential time on some engines (a "ReDoS" attack) and tie up a database session. Engines based on automata (PostgreSQL's engine largely, and RE2-style engines) are more resistant; backtracking engines are vulnerable. Set statement timeouts and prefer fixed, reviewed patterns.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Match test | `LIKE_REGEX` | `~`, `~*`, `REGEXP_LIKE` (15+) | `REGEXP`, `REGEXP_LIKE` (8.0+) | `REGEXP_LIKE` (2025+) | `REGEXP_LIKE` | `REGEXP` (needs extension) |
| Extract | `SUBSTRING_REGEX` | `SUBSTRING … FROM`, `REGEXP_SUBSTR` (15+) | `REGEXP_SUBSTR` | `REGEXP_SUBSTR` (2025+) | `REGEXP_SUBSTR` | ❌ |
| Replace | `TRANSLATE_REGEX` | `REGEXP_REPLACE` (first only without `g`) | `REGEXP_REPLACE` | `REGEXP_REPLACE` (2025+) | `REGEXP_REPLACE` | ❌ |
| Count | `OCCURRENCES_REGEX` | `REGEXP_COUNT` (15+) | ❌ | `REGEXP_COUNT` (2025+) | `REGEXP_COUNT` | ❌ |
| `SIMILAR TO` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Index support | ❌ | Trigram GIN/GiST | ❌ | ❌ | ❌ | ❌ |

Before 2025, SQL Server offered only `LIKE` with `[…]` character classes and `PATINDEX`, or CLR functions.

> **Portability Tip:** The `REGEXP_LIKE` / `REGEXP_SUBSTR` / `REGEXP_REPLACE` names are now shared by MySQL, Oracle, PostgreSQL 15+ and SQL Server 2025+, but default occurrence, flags and escaping still differ. Test each pattern on each engine.

---

# Common Mistakes

### Mistake 1

Forgetting `^` and `$`, so a "format check" matches any string that merely contains the pattern.

---

### Mistake 2

Calling PostgreSQL `REGEXP_REPLACE` without `'g'` and cleaning only the first character.

---

### Mistake 3

Assuming case sensitivity: MySQL follows the collation, others are case-sensitive by default.

---

### Mistake 4

Single backslashes in MySQL string literals, where `'\.'` becomes `'.'`.

---

### Mistake 5

Joining large tables on `REGEXP_REPLACE(…)` expressions.

---

# Best Practices

✔ Anchor validation patterns with `^` and `$`.

✔ Use `LIKE` when it can express the pattern—it is simpler and more often indexable.

✔ Store cleaned values in generated columns and index them.

✔ Use regular expressions in `CHECK` constraints to keep bad data out.

✔ Never run user-supplied patterns without timeouts.

---

# Interview Questions

## Basic

1. What can a regular expression express that `LIKE` cannot?
2. What do `^` and `$` mean?
3. How do you test a pattern in PostgreSQL?

## Intermediate

4. How do you keep only the digits of a string?
5. Why does PostgreSQL `REGEXP_REPLACE` sometimes change only one occurrence?
6. How do you extract a capture group?

## Advanced

7. Can an index speed up a regular expression predicate? When?
8. What is ReDoS and how do you defend against it?
9. How does collation affect MySQL regular expressions?

---

# Hands-on Exercises

## Exercise 1

List customers whose email does not have the basic `local@domain.tld` shape.

---

## Exercise 2

Return every phone number as digits only, on PostgreSQL and on MySQL.

---

## Exercise 3

Add a `CHECK` constraint that SKUs are three capital letters, a dash and four digits.

---

## Exercise 4

Extract the third element of a `|`-separated list with a regular expression.

---

# Related Topics

- **12.03 — Substrings, Searching and Replacing**
- **12.15 — Scalar Function Performance and Index Strategy**
- **06.07 — LIKE and Pattern Matching**
- **10.09 — Index Types (Hash, Bitmap, GIN, GiST, BRIN and Columnstore)**

---

# Summary

Regular expressions express patterns `LIKE` cannot: repetition counts, alternatives, character classes and anchors. Most engines now share the `REGEXP_LIKE`, `REGEXP_SUBSTR`, `REGEXP_REPLACE`, `REGEXP_INSTR` and `REGEXP_COUNT` names, with PostgreSQL also offering `~` operators and SQL Server joining in 2025; SQLite needs an extension. Defaults differ—PostgreSQL replaces only the first match without `'g'`, MySQL follows collation for case—so test patterns per engine. Regular-expression predicates usually scan, except with PostgreSQL trigram indexes, so use them to validate and clean data on write and keep repeated parsing out of hot queries.
