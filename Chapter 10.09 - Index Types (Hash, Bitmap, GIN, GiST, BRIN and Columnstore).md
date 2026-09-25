---
title: "10.09 - Index Types (Hash, Bitmap, GIN, GiST, BRIN and Columnstore)"
description: "Beyond the B-tree: hash indexes, bitmap indexes, inverted indexes (GIN, full-text), GiST and SP-GiST for geometric and range data, BRIN block-range indexes, columnstore indexes, spatial and vector indexes—what each is for, how it works, and which engines provide it."
chapter: 10
section: 10.09
category: Data Query Language (DQL)
difficulty: Advanced
readingTime: 35 min
lastUpdated: 2026-09-25
---

# 10.09 Index Types (Hash, Bitmap, GIN, GiST, BRIN and Columnstore)

---

# Learning Objectives

After completing this section, you will be able to:

- Explain what B-trees cannot do and which index types fill those gaps.
- Describe hash, bitmap, inverted, GiST, BRIN and columnstore indexes.
- Match each index type to the queries and workloads it serves.
- Know which engines provide which types.
- Avoid specialised indexes where a B-tree would do.

---

# Why Other Index Types?

A B-tree answers questions about **one ordered value per row**: equals, less than, between, sorted. Many questions are not of that shape:

| Question | Why a B-tree struggles |
|----------|------------------------|
| Posts containing the word "index" | A text is many words, not one sortable value |
| Products whose `Tags` array contains `'sale'` | One row, many values |
| JSON documents with `"status": "active"` | Nested, schemaless structure |
| Deliveries within 5 km of a point | Two-dimensional "nearness" has no single sort order |
| Bookings overlapping a time range | Range overlap is not a point comparison |
| Revenue over 2 billion rows | Needs to read one column of many rows fast |
| Nearest embedding vectors | High-dimensional similarity |

Each specialised index type answers one family of these.

---

# Hash Indexes

A hash index stores a hash of the key in buckets. It supports **equality only**—no ranges, no ordering, no prefix matching.

```sql
-- PostgreSQL (crash-safe and replicated since version 10)
CREATE INDEX IX_Sessions_Token_Hash ON Sessions USING HASH (Token);

SELECT * FROM Sessions WHERE Token = $1;   -- ✅
SELECT * FROM Sessions WHERE Token > $1;   -- ❌ cannot use the hash index
```

| Engine | Hash index |
|--------|-----------|
| PostgreSQL | `USING HASH` |
| MySQL | `MEMORY` tables only; InnoDB has an internal *adaptive hash index* built automatically |
| SQL Server | Memory-optimised (In-Memory OLTP) tables only |
| Oracle | Hash clusters (a storage organisation, not an index) |
| SQLite | ❌ |

A B-tree is nearly as fast for equality and far more versatile, so hash indexes are niche: very long keys (hashes are small), pure-equality lookups on large tables.

---

# Bitmap Indexes

A bitmap index stores, for each distinct value, a bitmap with one bit per row:

```text
Status bitmap index
               rows: 1 2 3 4 5 6 7 8 …
'Pending'           0 1 0 0 1 0 0 0
'Shipped'           1 0 1 1 0 0 1 1
'Cancelled'         0 0 0 0 0 1 0 0

WHERE Status = 'Pending' AND Region = 'EU'   → AND the two bitmaps → rows 2, 5
```

- Compact for **low-cardinality** columns (status, gender, region, flags).
- Very fast `AND`/`OR`/`NOT` combinations across many columns—ideal for ad-hoc filters in data warehouses.
- **Terrible for concurrent writes:** one update locks a large part of a bitmap. Not for OLTP.

Persistent bitmap indexes exist in Oracle (Enterprise Edition). PostgreSQL has no bitmap *index* but builds bitmaps on the fly from B-trees during bitmap scans (Section 10.08).

```sql
-- Oracle
CREATE BITMAP INDEX BIX_Sales_Region ON Sales (RegionID);
```

---

# Inverted Indexes (GIN, Full-Text)

An **inverted index** maps each *element* (word, array element, JSON key/value) to the list of rows that contain it—like the index at the back of a book.

```text
Posts                                    Inverted index
1: "indexes make reads fast"             "fast"    → 1, 3
2: "joins combine tables"                "index"   → 1, 3        (after stemming)
3: "a fast index scan"                   "join"    → 2
                                         "table"   → 2
```

```sql
-- PostgreSQL: full-text search
CREATE INDEX IX_Posts_Body_FTS ON Posts USING GIN (to_tsvector('english', Body));
SELECT PostID FROM Posts WHERE to_tsvector('english', Body) @@ to_tsquery('english', 'index & fast');

-- PostgreSQL: arrays and JSONB containment
CREATE INDEX IX_Products_Tags ON Products USING GIN (Tags);
SELECT * FROM Products WHERE Tags @> ARRAY['sale'];

CREATE INDEX IX_Events_Payload ON Events USING GIN (Payload jsonb_path_ops);
SELECT * FROM Events WHERE Payload @> '{"status": "active"}';

-- MySQL / SQL Server / Oracle / SQLite: full-text
CREATE FULLTEXT INDEX FT_Posts_Body ON Posts (Body);                       -- MySQL
-- SQL Server: CREATE FULLTEXT CATALOG … ; CREATE FULLTEXT INDEX ON Posts(Body) KEY INDEX PK_Posts;
-- Oracle: CREATE INDEX IX_Posts_Body ON Posts (Body) INDEXTYPE IS CTXSYS.CONTEXT;
-- SQLite: CREATE VIRTUAL TABLE PostsFTS USING fts5(Body);
```

GIN indexes are fast to search and slower to update (PostgreSQL buffers updates in a *pending list*). They also serve trigram similarity (`pg_trgm`), which makes `LIKE '%text%'` indexable.

---

# GiST and SP-GiST

**GiST** (Generalised Search Tree) is a balanced tree framework whose entries are *bounding predicates*—for example, bounding boxes. It supports "overlaps", "contains", "is near" and nearest-neighbour ordering.

```sql
-- PostgreSQL / PostGIS: deliveries within 5 km
CREATE INDEX IX_Deliveries_Location ON Deliveries USING GIST (Location);
SELECT * FROM Deliveries
WHERE ST_DWithin(Location, ST_MakePoint(77.59, 12.97)::geography, 5000);

-- Range types and exclusion constraints: no overlapping bookings per room
CREATE TABLE Bookings (
    RoomID INT,
    Period TSTZRANGE,
    EXCLUDE USING GIST (RoomID WITH =, Period WITH &&)     -- needs btree_gist
);
```

**SP-GiST** (space-partitioned GiST) supports unbalanced partitioning structures—quadtrees, k-d trees, radix trees—good for points and text prefixes.

Other engines provide spatial indexes under their own names: MySQL `SPATIAL INDEX` (R-tree), SQL Server spatial indexes (grid-based), Oracle Spatial (R-tree), SQLite R*Tree module.

---

# BRIN (Block Range Indexes)

A **BRIN** index stores only a summary—typically min and max—for each range of consecutive table pages.

```text
Table pages 1–128:    OrderDate min 2020-01-01  max 2020-02-03
Table pages 129–256:  OrderDate min 2020-02-03  max 2020-03-09
…

WHERE OrderDate = '2026-09-01' → skip every block range whose [min, max] excludes it
```

```sql
-- PostgreSQL
CREATE INDEX IX_Events_CreatedAt_BRIN ON Events USING BRIN (CreatedAt);
```

- **Tiny**: kilobytes for a table of hundreds of gigabytes.
- Only useful when the column is **correlated with physical order**—append-only time-series, logs, events.
- Returns candidate block ranges that must be scanned; far less precise than a B-tree.

Oracle's *zone maps* (Exadata / Autonomous) and the min/max metadata kept by columnstores and data-lake formats (Parquet) follow the same idea.

---

# Columnstore Indexes

A **columnstore** stores each column separately, compressed, in large segments with min/max metadata:

```text
Rowstore (pages of rows)                 Columnstore (segments of columns)
┌──────────────────────────────┐        OrderID    ▓▓▓▓▓▓▓▓  (compressed)
│ 101 | 42 | 2026-01-03 | 250  │        CustomerID ▓▓▓▓▓
│ 102 | 7  | 2026-01-04 |  80  │        OrderDate  ▓▓▓▓     (min/max per segment)
│ …                            │        Total      ▓▓▓▓▓▓
└──────────────────────────────┘

SELECT SUM(Total) … → reads only the Total (and filter) segments, in batches
```

```sql
-- SQL Server: add analytics to an OLTP table
CREATE NONCLUSTERED COLUMNSTORE INDEX NCCI_Orders
ON Orders (CustomerID, OrderDate, Status, TotalAmount);

-- SQL Server: whole table as a columnstore (data warehouse)
CREATE CLUSTERED COLUMNSTORE INDEX CCI_FactSales ON FactSales;
```

- Excellent for scans and aggregations over millions or billions of rows (10× compression, batch-mode execution).
- Poor for single-row lookups and frequent small updates.
- Available in SQL Server; Oracle offers the *In-Memory Column Store*; MySQL has HeatWave; PostgreSQL has columnar extensions (Citus columnar, and others).

---

# Vector Indexes

Embedding search ("find the 10 documents most similar to this one") uses approximate nearest-neighbour indexes such as **HNSW** and **IVFFlat**:

```sql
-- PostgreSQL with pgvector
CREATE INDEX IX_Docs_Embedding ON Docs USING hnsw (Embedding vector_cosine_ops);
SELECT DocID FROM Docs ORDER BY Embedding <=> $1 LIMIT 10;
```

These indexes trade exactness for speed—results are approximate—and are now offered by Oracle 23ai (vector indexes), SQL Server 2025 (vector type and indexes), MySQL HeatWave and SQLite extensions.

---

# Choosing an Index Type

| Workload | Index type |
|----------|-----------|
| Equality, ranges, sorting, uniqueness | B-tree (default) |
| Equality only on long keys | Hash (PostgreSQL) |
| Low-cardinality filters, read-mostly warehouse | Bitmap (Oracle) |
| Words in text, array elements, JSON keys | GIN / full-text |
| `LIKE '%text%'` | GIN or GiST with trigrams (PostgreSQL) |
| Geometry, ranges, overlap, nearest | GiST / SP-GiST / spatial (R-tree) |
| Huge append-only tables filtered by time | BRIN / zone maps |
| Analytics over many rows | Columnstore |
| Similarity search on embeddings | HNSW / IVF vector index |

If in doubt, it is a B-tree.

---

# Visual Representation

```text
B-tree       sorted keys           → point, range, order
Hash         buckets               → point
Bitmap       bit per row per value → AND / OR of low-cardinality filters
GIN          element → row lists   → contains / full-text
GiST         bounding predicates   → overlaps / near
BRIN         min/max per block     → skip blocks on correlated data
Columnstore  compressed columns    → scan and aggregate
Vector       graph / clusters      → approximate nearest neighbours
```

---

# 📍 Execution Order Reminder

```text
1. FROM        ← specialised indexes are access paths too, chosen here
2. JOIN
3. WHERE       ← only operators the index type supports can use it (@@, @>, &&, ST_DWithin …)
4. GROUP BY    ← columnstores accelerate aggregation in batch mode
5. HAVING
6. SELECT
7. DISTINCT
8. ORDER BY    ← GiST and vector indexes can deliver "nearest first" ordering
9. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
PostgreSQL operator classes decide index eligibility:

  column type + operator  →  operator class  →  index method
  text  =                 →  text_ops         →  btree, hash
  tsvector @@             →  tsvector_ops     →  gin, gist
  jsonb @>                →  jsonb_path_ops   →  gin
  geography ST_DWithin    →  gist_geography   →  gist
  vector <=>              →  vector_cosine_ops → hnsw, ivfflat

A predicate can use an index only if its operator belongs to the index's operator class.
```

---

# 🔬 Engine Deep Dive

PostgreSQL's index access method API makes index types pluggable: B-tree, hash, GiST, SP-GiST, GIN and BRIN ship in core, and extensions add more (pgvector's HNSW and IVFFlat, RUM, Bloom). Each method declares which operators it supports and whether it can return ordered results, check uniqueness or support index-only scans. That design is why so many specialised indexes appear in the PostgreSQL ecosystem first.

---

# 🏗️ Architecture Insight

Specialised indexes are often the difference between "the database can do it" and "we need a separate search engine". Full-text GIN indexes, JSONB containment and vector indexes let one database serve workloads that once required Elasticsearch or a vector store—at the cost of heavier writes and larger indexes. Decide consciously where that trade-off stops being worth it.

---

# ⚡ Performance Tip

Before adding a search engine for `LIKE '%text%'` queries on PostgreSQL, try `CREATE INDEX … USING GIN (col gin_trgm_ops)` from the `pg_trgm` extension. It makes substring and similarity searches indexable with one DDL statement.

---

# 🔒 Security Note

Full-text and trigram indexes store tokens of every indexed document. Treat them as sensitive as the text itself, and remember that some extensions (and external search engines) keep separate copies that must be included in data-retention and deletion processes.

---

# SQL Standard vs Vendor Differences

| Index type | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|------------|-----------|-------|-----------|--------|--------|
| B-tree | ✅ | ✅ | ✅ | ✅ | ✅ |
| Hash | ✅ | `MEMORY` / adaptive (internal) | In-Memory OLTP | Hash clusters | ❌ |
| Bitmap (persistent) | ❌ (bitmap scans) | ❌ | ❌ | ✅ (EE) | ❌ |
| Full-text | GIN / GiST | `FULLTEXT` | Full-Text Search | Oracle Text | FTS5 |
| JSON / array | GIN | Multi-valued index (8.0.17+) | Via computed columns | JSON search index | ❌ |
| Spatial | GiST (PostGIS) | `SPATIAL` (R-tree) | Spatial | Oracle Spatial | R*Tree |
| Block range | BRIN | ❌ | ❌ (columnstore segments) | Zone maps | ❌ |
| Columnstore | Extensions | HeatWave | ✅ | In-Memory | ❌ |
| Vector | pgvector | HeatWave | 2025 | 23ai | Extensions |

> **Portability Tip:** Only B-tree indexes are portable. Specialised index types come with specialised query operators, so queries that use them are engine-specific too.

---

# Common Mistakes

### Mistake 1

Using a hash index where queries also need ranges or ordering.

---

### Mistake 2

Creating bitmap indexes on OLTP tables with concurrent updates.

---

### Mistake 3

Creating a BRIN index on a column whose values are not correlated with physical order.

---

### Mistake 4

Expecting a GIN index to be used by an operator it does not support (e.g. `=` on a whole JSON value vs `@>`).

---

### Mistake 5

Reaching for a specialised index when a B-tree would serve the query.

---

# Best Practices

✔ Default to B-trees; choose other types only for the query shapes they serve.

✔ Match the query operator to the index's operator class.

✔ Use GIN for text, arrays and JSON; GiST for spatial and range data.

✔ Use BRIN only for huge, naturally ordered tables.

✔ Keep columnstores for analytical scans, not point lookups.

---

# Interview Questions

## Basic

1. What can a hash index do that a B-tree cannot, and vice versa?
2. What is a full-text index?
3. What is a columnstore index for?

## Intermediate

4. Why are bitmap indexes unsuitable for OLTP?
5. When is a BRIN index useful?
6. Which index type supports "contains this array element"?

## Advanced

7. What is an operator class and why does it matter for index use?
8. How does GiST support exclusion constraints on overlapping ranges?
9. Why are vector indexes approximate?

---

# Hands-on Exercises

## Exercise 1

On PostgreSQL, create a GIN full-text index on a text column and compare the plan and timing of a word search with and without it.

---

## Exercise 2

Make `WHERE ProductName LIKE '%phone%'` use an index with `pg_trgm`.

---

## Exercise 3

Create a BRIN index on a large append-only events table and compare its size with a B-tree on the same column.

---

## Exercise 4

On SQL Server, add a nonclustered columnstore index to `Orders` and compare an aggregation query before and after.

---

# Related Topics

- **10.02 — How B-Tree Indexes Work**
- **10.08 — Index Seeks, Scans and Lookups**
- **10.10 — Partial and Expression Indexes**
- **06.07 — LIKE and Pattern Matching**
- **08.14 — Execution Flow of GROUP BY (Hash and Stream Aggregation)**

---

# Summary

B-trees serve ordered, single-valued lookups; other index types serve other query shapes. Hash indexes answer equality only; bitmap indexes combine low-cardinality filters in read-mostly warehouses; inverted indexes (GIN, full-text) map words, array elements and JSON keys to rows; GiST and SP-GiST handle geometry, ranges and nearest-neighbour queries; BRIN summarises blocks of naturally ordered huge tables; columnstores compress columns for analytical scans; and vector indexes find approximate nearest embeddings. Each works only with the operators it supports and has its own write cost, so B-tree remains the default and specialised types are chosen per workload.
