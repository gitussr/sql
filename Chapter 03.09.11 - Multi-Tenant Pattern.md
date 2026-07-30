---
title: "03.09.11 - Multi-Tenant Pattern"
description: "Learn the Multi-Tenant Pattern, an enterprise database architecture pattern that allows multiple customers (tenants) to securely share the same application while keeping their data isolated. Discover how SaaS products like Microsoft 365, Salesforce, Shopify, Slack, Notion, Jira, and GitHub Enterprise implement multi-tenancy."
chapter: 3
section: 3.9.11
category: Database Design Patterns
difficulty: Advanced
readingTime: 55 min
lastUpdated: 2026-07-28
---

# 03.09.11 Multi-Tenant Pattern

---

# Learning Objectives

After completing this lesson, you will be able to:

- Understand Multi-Tenant Architecture
- Differentiate tenants from users
- Learn the three major multi-tenant models
- Design tenant-aware databases
- Prevent cross-tenant data leakage
- Understand enterprise SaaS architectures

---

# Definition

A **Multi-Tenant Pattern** is a database architecture where **multiple independent customers (tenants)** use the **same application**, while their data remains completely isolated.

Each company believes it owns the application, but internally the database serves many organisations simultaneously.

Example:

```text
Cloud CRM

├── Company A
├── Company B
├── Company C
└── Company D
```

One application.

Many customers.

Complete data isolation.

---

# What is a Tenant?

A **Tenant** is an organisation or customer that owns its own data inside a shared application.

Examples:

| Application | Tenant |
|-------------|---------|
| Salesforce | Company |
| Slack | Workspace |
| Shopify | Store |
| Microsoft 365 | Organisation |
| Jira | Company |
| Notion | Workspace |
| GitHub Enterprise | Organisation |

---

# Problem It Solves

Suppose you build a CRM.

Customers:

```text
ABC Ltd

XYZ Pvt Ltd

Acme Inc

Global Corp
```

Creating a separate application for each customer means:

```text
CRM A

CRM B

CRM C

CRM D
```

Problems:

- High infrastructure cost
- Difficult maintenance
- Multiple deployments
- Duplicate code
- Complex upgrades

---

# Solution

Build one application.

Store all companies together.

```text
CRM

↓

TenantID
```

Every record belongs to a tenant.

---

# Visual Representation

```text
Application

↓

Tenant A

↓

Users

↓

Orders

↓

Invoices

↓

Products

--------------------------

Tenant B

↓

Users

↓

Orders

↓

Invoices
```

---

# ER Diagram

```text
+----------------------+
| Tenants              |
+----------------------+
| PK TenantID          |
| CompanyName          |
| Plan                 |
+----------------------+

        ▲

        │

        │

+----------------------+
| Customers            |
+----------------------+
| PK CustomerID        |
| FK TenantID          |
| Name                 |
+----------------------+

        ▲

        │

+----------------------+
| Orders               |
+----------------------+
| PK OrderID           |
| FK TenantID          |
| FK CustomerID        |
+----------------------+
```

Every business table contains **TenantID**.

---

# SQL Implementation

## Step 1 — Create Tenant Table

```sql
CREATE TABLE Tenants (

    TenantID INT PRIMARY KEY,

    CompanyName VARCHAR(100),

    Plan VARCHAR(30)
);
```

---

## Step 2 — Customers

```sql
CREATE TABLE Customers (

    CustomerID INT PRIMARY KEY,

    TenantID INT,

    CustomerName VARCHAR(100),

    FOREIGN KEY (TenantID)
        REFERENCES Tenants(TenantID)
);
```

---

## Step 3 — Orders

```sql
CREATE TABLE Orders (

    OrderID INT PRIMARY KEY,

    TenantID INT,

    CustomerID INT,

    Total DECIMAL(10,2),

    FOREIGN KEY (TenantID)
        REFERENCES Tenants(TenantID),

    FOREIGN KEY (CustomerID)
        REFERENCES Customers(CustomerID)
);
```

---

## Step 4 — Insert Tenant

```sql
INSERT INTO Tenants
VALUES
(1,'ABC Ltd','Professional'),

(2,'XYZ Ltd','Enterprise');
```

---

## Step 5 — Retrieve Tenant Orders

```sql
SELECT *

FROM Orders

WHERE TenantID = 1;
```

Only Company A's orders are returned.

---

# How It Works

Without Multi-Tenant

```text
CRM A

CRM B

CRM C

CRM D
```

With Multi-Tenant

```text
CRM

↓

TenantID

↓

Company Data
```

The application filters every query using the tenant identifier.

---

# Three Multi-Tenant Architectures

---

# 1. Shared Database, Shared Schema ⭐⭐⭐⭐⭐

One database.

One schema.

Shared tables.

```text
Orders

TenantID
```

Example

| OrderID | TenantID |
|----------|-----------|
|1|ABC|
|2|XYZ|
|3|ABC|

Advantages

- Lowest cost
- Simple deployment
- Easy scaling
- Most common SaaS model

Disadvantages

- Strong security required
- Every query must filter by TenantID

---

# 2. Shared Database, Separate Schemas

```text
Database

↓

Schema_A

Schema_B

Schema_C
```

Advantages

- Better isolation
- Easier backup
- Separate migrations

Disadvantages

- More administration

Common in enterprise SaaS.

---

# 3. Separate Database Per Tenant

```text
Customer A

↓

Database A

----------------

Customer B

↓

Database B
```

Advantages

- Maximum isolation
- Independent backups
- Easier compliance
- Better performance for large customers

Disadvantages

- Expensive
- Operational complexity

Used for enterprise customers.

---

# Architecture Comparison

| Architecture | Isolation | Cost | Complexity |
|--------------|:--------:|:----:|:----------:|
| Shared DB + Shared Schema | ⭐⭐ | ⭐⭐⭐⭐⭐ | Low |
| Shared DB + Separate Schema | ⭐⭐⭐⭐ | ⭐⭐⭐ | Medium |
| Separate Database | ⭐⭐⭐⭐⭐ | ⭐ | High |

---

# Real-World Examples

## Shopify

```text
Store A

↓

TenantID

Store B

↓

TenantID
```

---

## Slack

```text
Workspace

↓

Tenant
```

---

## Microsoft 365

```text
Organisation

↓

Tenant
```

---

## Salesforce

```text
Company

↓

Tenant
```

---

## Notion

```text
Workspace

↓

Tenant
```

---

## GitHub Enterprise

```text
Organisation

↓

Tenant
```

---

# Enterprise Adoption

| Company | Tenant |
|----------|---------|
| Salesforce | Company |
| Shopify | Store |
| Slack | Workspace |
| Atlassian Jira | Organisation |
| Microsoft 365 | Organisation |
| HubSpot | Company |
| Zendesk | Customer Account |
| Monday.com | Workspace |

---

# Tenant Isolation

Every query must include:

```sql
WHERE TenantID = ?
```

Never:

```sql
SELECT *

FROM Orders;
```

Always:

```sql
SELECT *

FROM Orders

WHERE TenantID = 15;
```

This is the most important rule in a multi-tenant application.

---

# Advantages

✅ Lower infrastructure cost

✅ Easier maintenance

✅ Single deployment

✅ Centralised upgrades

✅ Better scalability

---

# Disadvantages

❌ Data isolation is critical

❌ Security mistakes affect many customers

❌ More complex authorisation

❌ Tenant-aware queries required everywhere

---

# Performance Considerations

Large SaaS platforms may support:

```text
100

↓

1,000

↓

100,000

↓

Millions of Tenants
```

Recommendations:

- Index `TenantID`
- Composite indexes

Example

```sql
CREATE INDEX idx_orders_tenant

ON Orders(TenantID, OrderID);
```

- Partition by TenantID for very large systems
- Cache tenant metadata

---

# Best Practices

✔ Every business table contains `TenantID`.

✔ Validate tenant ownership before every operation.

✔ Never expose another tenant's data.

✔ Encrypt sensitive tenant data.

✔ Log tenant activity.

✔ Backup tenant data independently when required.

---

# Common Mistakes

## Missing Tenant Filter

Bad

```sql
SELECT *

FROM Orders;
```

This returns every customer's data.

---

## Trusting Client Input

Never trust:

```text
TenantID = 5
```

sent by the browser.

The application should derive the tenant from the authenticated user.

---

## Cross-Tenant Foreign Keys

Avoid relationships like:

```text
Customer (Tenant A)

↓

Order (Tenant B)
```

Every related record should belong to the same tenant.

---

## Hard-Coding Tenant IDs

Avoid:

```text
TenantID = 1
```

Always obtain the tenant from the authenticated session or access token.

---

# Typical Workflow

```text
User Login

↓

Authenticate

↓

Determine Tenant

↓

Execute Query

↓

WHERE TenantID = CurrentTenant

↓

Return Results
```

---

# Integration with Other Patterns

| Pattern | Purpose |
|----------|---------|
| Audit Log | Tenant activity |
| Soft Delete | Tenant recovery |
| Versioning | Tenant document history |
| Event Log | Tenant business events |
| Lookup Tables | Shared reference data |

---

# Security Considerations

A **cross-tenant data leak** is one of the most severe failures in a SaaS application.

Protect against it by:

- Row-level security
- Tenant-aware APIs
- Authorization checks
- Query filters
- Secure backups
- Encryption
- Access logging

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB |
|---------|:-----:|:----------:|:----------:|:------:|:--------:|
| TenantID Filtering | ✅ | ✅ | ✅ | ✅ | ✅ |
| Row-Level Security | ❌ | ✅ | ✅ | ✅ | ❌ |
| Partitioning | ✅ | ✅ | ✅ | ✅ | ✅ |
| JSON Support | ✅ | ✅ | ✅ | ✅ | ✅ |

---

# 💡 Did You Know?

Microsoft Azure Active Directory (now **Microsoft Entra ID**), Microsoft 365, Salesforce, Shopify, Slack, Atlassian Cloud, HubSpot, and thousands of SaaS products are built using multi-tenant architectures. Some enterprise SaaS platforms even support **hybrid tenancy**, where smaller customers share infrastructure while large enterprise customers receive dedicated databases or even dedicated cloud clusters.

---

# Enterprise Design Considerations

As SaaS platforms grow, Multi-Tenant architecture expands beyond simply adding a `TenantID`.

Large-scale systems often include:

### Tenant Configuration

```text
Tenant

↓

Language

↓

Timezone

↓

Currency

↓

Branding

↓

Feature Flags
```

---

### Tenant-Level Security

Each tenant may have:

- Custom roles
- Custom permissions
- SSO (Single Sign-On)
- MFA (Multi-Factor Authentication)
- IP restrictions
- Audit retention policies

---

### Tenant-Level Customisation

Examples:

- Custom themes
- Email templates
- Workflow automation
- Business rules
- Approval chains
- Notification preferences

---

### Hybrid Deployment

Many SaaS providers support multiple deployment models simultaneously:

| Customer Size | Deployment |
|---------------|------------|
| Small Business | Shared Database |
| Medium Business | Shared DB + Separate Schema |
| Enterprise | Dedicated Database |
| Government / Healthcare | Dedicated Infrastructure |

This approach balances cost, scalability, and compliance requirements.

---

# Interview Questions

## Basic

1. What is a tenant?
2. What is Multi-Tenant Architecture?
3. Why is TenantID important?

---

## Intermediate

4. Compare the three multi-tenant architectures.
5. Why should TenantID never come directly from the client?
6. What is row-level security?

---

## Advanced

7. How would you migrate a customer from a shared database to a dedicated database?
8. How would you design indexes for 50 million tenant records?
9. How would you implement tenant-aware caching?
10. How would you prevent cross-tenant data leakage in a microservices architecture?

---

# Hands-on Exercises

## Exercise 1

Design a CRM supporting:

- Companies
- Users
- Customers
- Orders

Ensure every business table is tenant-aware.

---

## Exercise 2

Design a Learning Management System.

Support:

- Multiple schools
- Teachers
- Students
- Courses

Identify the tenant and shared reference tables.

---

## Exercise 3

Design an HRMS SaaS platform.

Support:

- Multiple companies
- Employees
- Payroll
- Attendance
- Leave Management

Explain how data isolation is maintained.

---

## Exercise 4

Compare the three multi-tenant architectures.

For each, explain:

- Cost
- Performance
- Security
- Maintenance
- Best use cases

---

## Exercise 5

Design a project management SaaS application similar to Jira or Asana.

Support:

- Multiple organisations
- Projects
- Tasks
- Comments
- Attachments

Explain how TenantID flows through the entire schema.

---

# Related Patterns

- **03.09.05 — Audit Log Pattern**
- **03.09.06 — Soft Delete Pattern**
- **03.09.07 — Versioning Pattern**
- **03.09.10 — Event Log Pattern**
- **03.09.12 — CQRS Pattern** *(Next Chapter)*

---

# Summary

The **Multi-Tenant Pattern** enables multiple organisations to securely share the same application while keeping their data completely isolated. It is the foundation of modern SaaS platforms such as Salesforce, Shopify, Slack, Microsoft 365, Jira, and Notion. By introducing a `TenantID` (or using separate schemas or databases), applications can scale to thousands or even millions of customers while maintaining security, performance, and operational efficiency. Designing tenant-aware tables, queries, indexes, and security controls is one of the most important skills for enterprise database architects.