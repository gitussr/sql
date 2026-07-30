---
title: "03.09.07 - Versioning Pattern"
description: "Learn the Versioning Pattern, an enterprise database design pattern used to preserve multiple versions of data instead of overwriting records. Discover how document management systems, healthcare applications, ERP software, and SaaS platforms maintain historical versions while supporting auditing, rollback, and collaboration."
chapter: 3
section: 3.9.7
category: Database Design Patterns
difficulty: Intermediate → Advanced
readingTime: 40 min
lastUpdated: 2026-07-28
---

# 03.09.07 Versioning Pattern

---

# Learning Objectives

After completing this lesson, you will be able to:

- Understand the Versioning Pattern
- Distinguish versioning from auditing
- Design version-controlled database tables
- Support rollback and historical comparisons
- Preserve complete document history
- Recognise versioning in enterprise systems

---

# Definition

The **Versioning Pattern** stores **multiple versions** of the same business entity instead of replacing existing data.

Whenever an important record changes, a **new version** is created.

The previous version remains unchanged.

Instead of:

```text
Update Record
```

the database performs:

```text
Create New Version
```

This ensures the complete history of the record is preserved.

---

# Problem It Solves

Suppose a product description changes.

Original:

```text
Version 1

Gaming Laptop

16GB RAM
```

Later:

```text
Version 2

Gaming Laptop

32GB RAM
```

Later again:

```text
Version 3

Gaming Laptop

64GB RAM
```

If each update overwrites the previous one:

```sql
UPDATE Products
SET Description = '64GB RAM'
```

then Versions 1 and 2 are permanently lost.

Questions become impossible to answer:

- What did the product look like last month?
- Who approved Version 3?
- Can we restore Version 1?
- What exactly changed?

---

# Solution

Keep one record representing the current entity.

Store each revision as a separate version.

```text
Products

↓

ProductVersions
```

Every modification creates a new version rather than replacing existing data.

---

# Visual Representation

```text
Products
--------------------------
ProductID (PK)
CurrentVersion

          ▲
          │
          │
ProductVersions
--------------------------
VersionID (PK)
ProductID (FK)
VersionNumber
Description
CreatedBy
CreatedAt
```

---

# ER Diagram

```text
+----------------------+
| Products             |
+----------------------+
| PK ProductID         |
| CurrentVersion       |
+----------------------+
          ▲
          │
          │
+------------------------------+
| ProductVersions              |
+------------------------------+
| PK VersionID                 |
| FK ProductID                 |
| VersionNumber                |
| Description                  |
| CreatedBy                    |
| CreatedAt                    |
+------------------------------+
```

Relationship

```text
Products

1

────────────<

Many Versions
```

---

# SQL Implementation

## Step 1 — Create Main Table

```sql
CREATE TABLE Products (

    ProductID INT PRIMARY KEY,

    ProductName VARCHAR(100),

    CurrentVersion INT
);
```

---

## Step 2 — Create Version Table

```sql
CREATE TABLE ProductVersions (

    VersionID INT PRIMARY KEY,

    ProductID INT,

    VersionNumber INT,

    Description TEXT,

    CreatedBy VARCHAR(100),

    CreatedAt DATETIME,

    FOREIGN KEY (ProductID)
        REFERENCES Products(ProductID)
);
```

---

## Step 3 — Insert Product

```sql
INSERT INTO Products
VALUES
(101,'Gaming Laptop',1);
```

---

## Step 4 — Insert Version 1

```sql
INSERT INTO ProductVersions
VALUES
(
1,
101,
1,
'16GB RAM',
'Admin',
NOW()
);
```

---

## Step 5 — Create Version 2

```sql
INSERT INTO ProductVersions
VALUES
(
2,
101,
2,
'32GB RAM',
'Admin',
NOW()
);
```

Update current version.

```sql
UPDATE Products

SET CurrentVersion = 2

WHERE ProductID = 101;
```

---

## Step 6 — View Version History

```sql
SELECT
VersionNumber,
Description,
CreatedAt

FROM ProductVersions

WHERE ProductID = 101

ORDER BY VersionNumber;
```

### Output

| Version | Description |
|----------|-------------|
|1|16GB RAM|
|2|32GB RAM|

---

# How It Works

Without Versioning

```text
Version 1

↓

Update

↓

Lost Forever
```

With Versioning

```text
Version 1

↓

Version 2

↓

Version 3

↓

Version 4
```

Nothing is overwritten.

Every version remains available.

---

# Real-World Examples

## Google Docs

```text
Document

↓

Revision 1

↓

Revision 2

↓

Revision 3
```

---

## Microsoft Word

```text
Track Changes

↓

Multiple Revisions
```

---

## Git

```text
Commit

↓

Commit

↓

Commit
```

Git is one of the world's best-known versioning systems.

---

## ERP

```text
Purchase Order

↓

Version 1

↓

Version 2
```

---

## Hospital

```text
Medical Record

↓

Revision History
```

---

## Banking

```text
Loan Agreement

↓

Revised Terms
```

---

## CRM

```text
Sales Proposal

↓

Version 5
```

---

## SaaS

```text
Knowledge Base Article

↓

Version History
```

---

# Enterprise Examples

| System | Versioned Data |
|----------|----------------|
| ERP | Purchase Orders |
| CRM | Contracts |
| Hospital | Medical Records |
| Banking | Loan Documents |
| Government | Citizen Applications |
| LMS | Course Content |
| GitHub | Source Code |
| CMS | Web Pages |

---

# Versioning vs Audit Log

| Versioning | Audit Log |
|------------|-----------|
| Stores complete document versions | Stores change events |
| Allows rollback | Records user activity |
| Focus on business content | Focus on system actions |
| Multiple document revisions | Chronological event history |

---

# Versioning vs Status History

| Versioning | Status History |
|------------|----------------|
| Tracks content revisions | Tracks workflow stages |
| Multiple document versions | Multiple status changes |
| Rollback supported | Workflow analysis |

---

# Advantages

✅ Full history

✅ Rollback capability

✅ Easier collaboration

✅ Better auditing

✅ Regulatory compliance

✅ Historical comparison

---

# Disadvantages

❌ Larger storage requirements

❌ Additional complexity

❌ More joins

❌ Version management overhead

---

# Performance Considerations

Version tables can grow rapidly.

Recommended practices:

- Index `ProductID`
- Index `VersionNumber`
- Compress older versions
- Archive inactive versions
- Store only meaningful revisions

---

# Best Practices

✔ Never overwrite historical versions.

✔ Use sequential version numbers.

✔ Store:

- Version Number
- Created By
- Created At
- Change Summary

✔ Keep a pointer to the latest version.

✔ Combine with Audit Logs.

---

# Common Mistakes

## Updating Existing Versions

Never edit:

```text
Version 2
```

Create:

```text
Version 3
```

instead.

---

## Missing Version Numbers

Avoid relying solely on timestamps.

Explicit version numbers make comparisons easier.

---

## Storing Only Changed Fields

Unless implementing a differential versioning strategy, store a complete snapshot of each version.

This simplifies retrieval and rollback.

---

## Confusing Audit Logs with Versioning

Audit logs answer:

> Who changed the record?

Versioning answers:

> What did the record look like at Version 5?

---

# Typical Workflow

```text
Open Document

↓

Edit

↓

Save

↓

Create Version 6

↓

Update CurrentVersion

↓

Insert Audit Log
```

---

# Integration with Other Patterns

Versioning frequently works alongside:

| Pattern | Purpose |
|----------|---------|
| Audit Log | Who made the change |
| Status History | Workflow progression |
| Soft Delete | Recover deleted versions |
| Lookup Table | Document types |
| Event Log | Notify downstream systems |

---

# Security Considerations

Protect version history by:

- Restricting edit permissions
- Preventing modification of previous versions
- Encrypting sensitive revisions
- Recording approval information
- Logging version restores

---

# Compliance Considerations

Industries such as healthcare, finance, legal services, and government often require historical versions to be retained for several years.

Version history supports:

- Regulatory audits
- Legal evidence
- Document recovery
- Historical reporting

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB |
|---------|:-----:|:----------:|:----------:|:------:|:--------:|
| Foreign Keys | ✅ | ✅ | ✅ | ✅ | ✅ |
| Transactions | ✅ | ✅ | ✅ | ✅ | ✅ |
| JSON Support | ✅ | ✅ | ✅ | ✅ | ✅ |
| Partitioning | ✅ | ✅ | ✅ | ✅ | ✅ |

---

# 💡 Did You Know?

Google Docs, Microsoft 365, Git, Notion, Confluence, SharePoint, and many enterprise document management systems all use some form of the Versioning Pattern. Even if a user edits the same document hundreds of times, previous versions can often be viewed or restored without affecting the current version.

---

# Interview Questions

## Basic

1. What is the Versioning Pattern?
2. Why is it used?
3. How is it different from an Audit Log?

## Intermediate

4. Why shouldn't previous versions be modified?
5. What information should each version contain?
6. How would you restore Version 4?

## Advanced

7. Snapshot versioning vs differential versioning—which would you choose and why?
8. How would you design versioning for millions of documents?
9. How would versioning interact with Soft Delete?
10. How would you optimise storage for large binary document versions?

---

# Hands-on Exercises

## Exercise 1

Design a Product Versioning System.

Include:

- Products
- ProductVersions

---

## Exercise 2

Design a Hospital Medical Record system.

Support:

- Medical record revisions
- Doctor comments
- Approval history

---

## Exercise 3

Design a CMS.

Version:

- Articles
- Blog posts
- Landing pages

Support rollback.

---

## Exercise 4

Design a Contract Management System.

Store:

- Draft versions
- Approved versions
- Published versions

---

## Exercise 5

Design a SaaS Knowledge Base.

Support:

- Multiple editors
- Version comparison
- Restore previous versions
- Audit logging

Draw the ER diagram and explain how Versioning differs from Status History.

---

# Related Patterns

- **03.09.04 — Status History Pattern**
- **03.09.05 — Audit Log Pattern**
- **03.09.06 — Soft Delete Pattern**
- **03.09.08 — Hierarchical (Tree) Pattern**

Versioning is frequently combined with Audit Logs for accountability, Soft Delete for recovery, and Status History for workflow management to provide complete lifecycle tracking.

---

# Summary

The **Versioning Pattern** preserves every significant revision of a business entity by creating a new version instead of overwriting existing data. This enables rollback, historical comparison, collaboration, compliance, and long-term traceability. It is widely used in document management systems, content management systems, ERP software, healthcare applications, banking platforms, and SaaS products where preserving historical versions is essential.