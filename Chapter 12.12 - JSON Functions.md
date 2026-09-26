---
title: "12.12 - JSON Functions"
description: "Working with JSON in SQL: JSON storage types per engine, SQL/JSON path expressions, extracting scalars and fragments with JSON_VALUE, JSON_QUERY, -> and ->>, testing with JSON_EXISTS and containment, building JSON with JSON_OBJECT and JSON_ARRAY, modifying documents, shredding arrays into rows with JSON_TABLE and OPENJSON, JSON null versus SQL NULL, indexing JSON, and when not to use JSON."
chapter: 12
section: 12.12
category: Data Query Language (DQL)
difficulty: Intermediate → Advanced
readingTime: 35 min
lastUpdated: 2026-09-26
---

# 12.12 JSON Functions

---

# Learning Objectives

After completing this section, you will be able to:

- Choose how to store JSON on each engine.
- Write SQL/JSON path expressions.
- Extract scalar values and JSON fragments from documents.
- Test for keys and values.
- Build JSON objects and arrays from relational data.
- Turn JSON arrays into rows.
- Index JSON attributes used in predicates.
- Decide when JSON is the right model and when it is not.

---

# The Sample Data

```sql
-- Products.Attributes holds optional, product-specific attributes
INSERT INTO Products (ProductID, ProductName, CategoryID, ListPrice, Attributes) VALUES
(1, 'Trail Shoe', 3, 120.00, '{"color": "red",  "sizes": ["S", "M", "L"], "waterproof": true,  "weightGrams": 310}'),
(2, 'City Shoe',  3,  90.00, '{"color": "black", "sizes": ["M"],          "waterproof": false}'),
(3, 'Rain Jacket',4, 150.00, '{"color": "blue", "sizes": ["M", "L"], "waterproof": true, "care": {"wash": "cold"}}');
```

---

# JSON Storage Types

| Engine | Type | Notes |
|--------|------|-------|
| PostgreSQL | `jsonb` (binary, indexable), `json` (text, preserves formatting) | Prefer `jsonb` |
| MySQL | `JSON` | Stored in a binary format, validated on insert |
| SQL Server | `NVARCHAR(MAX)` + `CHECK (ISJSON(col) = 1)`; native `json` type in SQL Server 2025 / Azure SQL | |
| Oracle | `JSON` (21c+); earlier `VARCHAR2`/`CLOB`/`BLOB` + `CHECK (col IS JSON)` | |
| SQLite | `TEXT` (or `JSONB` blobs, 3.45+) + `CHECK (json_valid(col))` | JSON functions built in since 3.38 |

Validating on write—by the type or a check constraint—prevents a whole class of runtime errors in queries.

---

# Path Expressions

SQL/JSON paths (SQL:2016) are used by `JSON_VALUE`, `JSON_QUERY`, `JSON_EXISTS` and most vendor functions:

```text
$                 the whole document
$.color           member "color"
$.care.wash       nested member
$.sizes[0]        first array element (0-based)
$.sizes[*]        every array element
$."weight-kg"     member name with special characters
```

Keys are **case-sensitive**: `$.Color` does not find `"color"`.

---

# Extracting Values

Two kinds of result: a **scalar** as an SQL value (text, number), or a **fragment** as JSON.

```sql
-- Standard functions: Oracle, SQL Server, MySQL (JSON_VALUE 8.0.21+), PostgreSQL 17+
SELECT ProductName,
       JSON_VALUE(Attributes, '$.color')      AS Color,       -- 'red'   (SQL text)
       JSON_QUERY(Attributes, '$.sizes')      AS Sizes        -- '["S", "M", "L"]' (JSON)
FROM Products;

-- PostgreSQL operators
SELECT Attributes ->  'color'          AS ColorJson,   -- "red"  (jsonb, with quotes)
       Attributes ->> 'color'          AS Color,       -- red    (text)
       Attributes #>> '{care,wash}'    AS Wash,        -- cold
       Attributes -> 'sizes' ->> 0     AS FirstSize    -- S
FROM Products;

-- MySQL and SQLite operators take a path
SELECT Attributes ->  '$.color' AS ColorJson,          -- "red"
       Attributes ->> '$.color' AS Color               -- red
FROM Products;
```

The `->` versus `->>` distinction matters: `->` returns JSON (strings keep their quotes), `->>` returns plain text. Comparing `Attributes -> 'color' = 'red'` fails or never matches; use `->>`.

### Types of extracted values

Extracted scalars are text unless you ask otherwise:

```sql
-- Wrong: compares as text, so '1000' < '310' is true
WHERE Attributes ->> 'weightGrams' > '500'

-- Right
WHERE CAST(Attributes ->> 'weightGrams' AS INT) > 500                     -- PostgreSQL, MySQL, SQLite
WHERE JSON_VALUE(Attributes, '$.weightGrams' RETURNING NUMBER) > 500      -- Oracle, PostgreSQL 17+ (MySQL: RETURNING UNSIGNED)
WHERE CAST(JSON_VALUE(Attributes, '$.weightGrams') AS INT) > 500          -- SQL Server
```

---

# Missing Keys, JSON null and SQL NULL

```text
Document                      JSON_VALUE(doc, '$.weightGrams')
{"weightGrams": 310}          '310'
{"weightGrams": null}         NULL     (JSON null → SQL NULL)
{}                            NULL     (missing key → SQL NULL, in lax mode)
```

In the default **lax** mode, a missing path returns `NULL`; in **strict** mode (`'strict $.weightGrams'`) it raises an error, which is useful for catching typos in paths during development. SQL Server's `JSON_VALUE` also returns `NULL` (lax) when the value is an object or array, or longer than 4,000 characters.

---

# Testing for Keys and Values

```sql
-- Does the document have a "care" member?
WHERE JSON_EXISTS(Attributes, '$.care')                  -- Oracle, PostgreSQL 17+, MySQL: JSON_CONTAINS_PATH
WHERE Attributes ? 'care'                                -- PostgreSQL jsonb
WHERE JSON_CONTAINS_PATH(Attributes, 'one', '$.care')    -- MySQL

-- Containment: is the product waterproof and available in size L?
WHERE Attributes @> '{"waterproof": true, "sizes": ["L"]}'          -- PostgreSQL jsonb (GIN-indexable)
WHERE JSON_CONTAINS(Attributes, '"L"', '$.sizes')                   -- MySQL
WHERE 'L' MEMBER OF (Attributes -> '$.sizes')                        -- MySQL 8.0.17+
WHERE EXISTS (SELECT 1 FROM OPENJSON(Attributes, '$.sizes') WHERE value = 'L')   -- SQL Server
```

---

# Building JSON

```sql
-- One object per row
SELECT JSON_OBJECT('id' VALUE CustomerID, 'name' VALUE CustomerName, 'email' VALUE Email)
FROM Customers;                                   -- standard syntax: Oracle, PostgreSQL 16+

SELECT JSON_OBJECT('id': CustomerID, 'name': CustomerName, 'email': Email) FROM Customers;   -- SQL Server 2022+ (colon syntax; also PostgreSQL 16+, Oracle)

SELECT JSON_OBJECT('id', CustomerID, 'name', CustomerName, 'email', Email) FROM Customers;   -- MySQL
SELECT json_build_object('id', CustomerID, 'name', CustomerName)          FROM Customers;   -- PostgreSQL
SELECT json_object('id', CustomerID, 'name', CustomerName)                FROM Customers;   -- SQLite

-- One array per group (aggregate)
SELECT o.CustomerID, JSON_ARRAYAGG(o.OrderID) AS OrderIDs      -- Oracle, MySQL, PostgreSQL 16+, SQL Server 2025+
FROM Orders AS o
GROUP BY o.CustomerID;
-- PostgreSQL alternatives: json_agg(o.OrderID), jsonb_agg(…)

-- SQL Server: whole result as JSON
SELECT CustomerID AS id, CustomerName AS name FROM Customers FOR JSON PATH;
```

Building JSON in SQL is useful for APIs that return nested documents in one round trip—for example, each order with an array of its items.

---

# Modifying Documents

```sql
-- PostgreSQL
UPDATE Products SET Attributes = jsonb_set(Attributes, '{color}', '"green"') WHERE ProductID = 1;
UPDATE Products SET Attributes = Attributes - 'care' WHERE ProductID = 3;          -- remove a key

-- MySQL
UPDATE Products SET Attributes = JSON_SET(Attributes, '$.color', 'green') WHERE ProductID = 1;
UPDATE Products SET Attributes = JSON_REMOVE(Attributes, '$.care') WHERE ProductID = 3;

-- SQL Server
UPDATE Products SET Attributes = JSON_MODIFY(Attributes, '$.color', 'green') WHERE ProductID = 1;

-- Oracle 21c+
UPDATE Products SET Attributes = JSON_TRANSFORM(Attributes, SET '$.color' = 'green') WHERE ProductID = 1;

-- SQLite
UPDATE Products SET Attributes = json_set(Attributes, '$.color', 'green') WHERE ProductID = 1;
```

Most engines rewrite the whole document on update. Frequently changing values inside large documents cause write amplification—another sign those values belong in columns.

---

# Shredding Arrays into Rows

```sql
-- Standard JSON_TABLE: Oracle, MySQL 8.0+, PostgreSQL 17+
SELECT p.ProductName, s.Size
FROM Products AS p,
     JSON_TABLE(p.Attributes, '$.sizes[*]' COLUMNS (Size VARCHAR(5) PATH '$')) AS s;

-- PostgreSQL (all versions)
SELECT p.ProductName, s.Size
FROM Products AS p
CROSS JOIN LATERAL jsonb_array_elements_text(p.Attributes -> 'sizes') AS s(Size);

-- SQL Server
SELECT p.ProductName, s.value AS Size
FROM Products AS p
CROSS APPLY OPENJSON(p.Attributes, '$.sizes') AS s;

-- SQLite
SELECT p.ProductName, s.value AS Size
FROM Products AS p, json_each(p.Attributes, '$.sizes') AS s;
```

```text
┌─────────────┬──────┐
│ ProductName │ Size │
├─────────────┼──────┤
│ Trail Shoe  │ S    │
│ Trail Shoe  │ M    │
│ Trail Shoe  │ L    │
│ City Shoe   │ M    │
│ Rain Jacket │ M    │
│ Rain Jacket │ L    │
└─────────────┴──────┘
```

These are table functions correlated with each row—the `LATERAL` / `CROSS APPLY` pattern from Section 09.10.

---

# Indexing JSON

```sql
-- 1. Index one scalar attribute used in equality/range predicates
CREATE INDEX ix_products_color ON Products ((Attributes ->> 'color'));                -- PostgreSQL
ALTER TABLE Products ADD Color AS JSON_VALUE(Attributes, '$.color');                   -- SQL Server computed column
CREATE INDEX ix_products_color ON Products (Color);
CREATE INDEX ix_products_color ON Products ((CAST(Attributes ->> '$.color' AS CHAR(20)) COLLATE utf8mb4_bin));  -- MySQL functional index
CREATE INDEX ix_products_color ON Products (JSON_VALUE(Attributes, '$.color'));        -- Oracle

-- 2. Index the whole document for containment and key tests (PostgreSQL)
CREATE INDEX ix_products_attrs ON Products USING GIN (Attributes jsonb_path_ops);

-- 3. Index array members (MySQL 8.0.17+ multi-valued index)
CREATE INDEX ix_products_sizes ON Products ((CAST(Attributes -> '$.sizes' AS CHAR(5) ARRAY)));
```

The query must use the **same expression** as the index—`Attributes ->> 'color' = 'red'`, not `JSON_VALUE(Attributes, '$.color') = 'red'`, on PostgreSQL's expression index above.

---

# When Not to Use JSON

JSON columns are right for data that is optional, sparse, variable or passed through: product attributes that differ by category, API payloads, user preferences, audit snapshots.

They are wrong for data that is:

- **Joined** (foreign keys cannot point into JSON).
- **Constrained** (`NOT NULL`, `UNIQUE`, `CHECK` on individual values are awkward or impossible).
- **Aggregated or filtered on every query** (each access parses or navigates the document).
- **Updated independently and often** (the whole document is rewritten).

A common, healthy design is hybrid: core attributes as typed columns, the long tail in a JSON column, and promotion of a JSON attribute to a real column once queries start depending on it.

---

# Visual Representation

```text
Attributes = {"color": "red", "sizes": ["S","M","L"], "care": {"wash": "cold"}}

$.color          → "red"            JSON_VALUE  → red           (SQL scalar)
$.sizes          → ["S","M","L"]    JSON_QUERY  → ["S","M","L"] (JSON fragment)
$.sizes[1]       → "M"
$.care.wash      → "cold"
$.sizes[*]       → JSON_TABLE / OPENJSON / json_each → 3 rows
$.missing        → NULL (lax)  |  error (strict)
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← JSON_TABLE / OPENJSON / json_each turn arrays into rows here
2. JOIN
3. WHERE       ← JSON predicates: indexable only with an expression, GIN or multi-valued index
4. GROUP BY    ← GROUP BY an extracted attribute
5. HAVING
6. WINDOW
7. SELECT      ← JSON_OBJECT / JSON_ARRAYAGG build output documents
8. DISTINCT
9. ORDER BY
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Text JSON (PostgreSQL json, SQL Server NVARCHAR, SQLite TEXT):
    each access parses the document from the start          → cost grows with document size
Binary JSON (PostgreSQL jsonb, MySQL JSON, Oracle JSON, SQLite JSONB):
    stored pre-parsed with offsets → direct navigation to a key
Indexes:
    expression index on one path → B-tree seek on the extracted value
    GIN (PostgreSQL)             → posting lists of keys/values for @>, ?, @?
```

---

# 🏗️ Architecture Insight

JSON in a relational database gives you a schema-flexible column inside a schema-enforced table. Use it as a controlled escape hatch, with a check that the document is valid, documentation of the expected shape, and a process for promoting attributes to columns. A table that is "one ID and one JSON column" has usually given up the relational model's guarantees without gaining a document database's tooling.

---

# ⚡ Performance Tip

Filter on JSON attributes only through an index that matches the exact expression, cast extracted numbers before comparing them, and keep documents small—large documents make every extraction and every update more expensive.

---

# 🔒 Security Note

JSON built by concatenating strings (`'{"name": "' || CustomerName || '"}'`) breaks—or can be manipulated—when values contain quotes or backslashes. Always build JSON with `JSON_OBJECT`, `json_build_object` or `FOR JSON`, which escape values correctly. Likewise, never build JSON paths from user input without validation.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| JSON type | ✅ (SQL:2023) | `jsonb`, `json` | `JSON` | Text; `json` (2025+) | `JSON` (21c+) | Text / `JSONB` blob |
| `JSON_VALUE` / `JSON_QUERY` | ✅ | ✅ (17+) | `JSON_VALUE` (8.0.21+) | ✅ (2016+) | ✅ | ❌ (`json_extract`) |
| `->` / `->>` | ❌ | ✅ (key / index) | ✅ (path) | ❌ | ❌ | ✅ (3.38+) |
| `JSON_TABLE` | ✅ | ✅ (17+) | ✅ | `OPENJSON` | ✅ | `json_each` |
| `JSON_OBJECT` | ✅ | ✅ (16+) | ✅ (comma syntax) | ✅ (2022+) | ✅ | `json_object` |
| Whole-document index | ❌ | GIN | Multi-valued (arrays) | ❌ | JSON search index | ❌ |

> **Portability Tip:** JSON syntax is converging on the SQL/JSON standard (`JSON_VALUE`, `JSON_QUERY`, `JSON_EXISTS`, `JSON_TABLE`, `JSON_OBJECT`), but operators, modification functions and indexing remain vendor-specific. Keep JSON access in views or a data-access layer.

---

# Common Mistakes

### Mistake 1

Comparing `->` (JSON) instead of `->>` (text) with a string.

---

### Mistake 2

Comparing extracted numbers as text.

---

### Mistake 3

Using a different expression in the query than in the index.

---

### Mistake 4

Building JSON by string concatenation.

---

### Mistake 5

Storing relational, joined, constrained data in JSON.

---

# Best Practices

✔ Validate JSON on write with the JSON type or a check constraint.

✔ Extract scalars with `JSON_VALUE`/`->>` and cast them to the right type.

✔ Index the attributes you filter on, with the exact query expression.

✔ Build JSON with JSON functions, never concatenation.

✔ Promote frequently used attributes to real columns.

---

# Interview Questions

## Basic

1. What is the difference between `JSON_VALUE` and `JSON_QUERY`?
2. What does `$.sizes[0]` refer to?
3. What is the difference between `->` and `->>` in PostgreSQL?

## Intermediate

4. How do you turn a JSON array into rows on SQL Server and PostgreSQL?
5. What does `JSON_VALUE` return for a missing key?
6. How do you index a JSON attribute on SQL Server?

## Advanced

7. When is `jsonb` better than `json` in PostgreSQL?
8. When should data not be stored as JSON?
9. Why must the query expression match the index expression exactly?

---

# Hands-on Exercises

## Exercise 1

List products with their color and first size.

---

## Exercise 2

Find waterproof products available in size L, on one engine, using an index.

---

## Exercise 3

Return each customer as a JSON object with an array of their order IDs.

---

## Exercise 4

Produce one row per product and size from `Attributes.sizes`.

---

# Related Topics

- **12.08 — Type Conversion (CAST, CONVERT and TRY_CAST)**
- **12.15 — Scalar Function Performance and Index Strategy**
- **09.10 — LATERAL and CROSS APPLY**
- **10.09 — Index Types (Hash, Bitmap, GIN, GiST, BRIN and Columnstore)**
- **10.10 — Partial and Expression Indexes**

---

# Summary

Every major engine can store and query JSON: PostgreSQL `jsonb`, MySQL and Oracle `JSON`, SQL Server text (and a native type in 2025), SQLite text with built-in functions. SQL/JSON path expressions address members and array elements; `JSON_VALUE` and `->>` return scalars, `JSON_QUERY` and `->` return fragments; missing keys give `NULL` in lax mode. `JSON_OBJECT`, `JSON_ARRAYAGG` and `FOR JSON` build documents, vendor functions modify them, and `JSON_TABLE`, `OPENJSON` or `json_each` turn arrays into rows. Predicates on JSON need expression, GIN or multi-valued indexes that match the query exactly. JSON suits sparse, variable attributes; joined, constrained and heavily queried data belongs in columns.
