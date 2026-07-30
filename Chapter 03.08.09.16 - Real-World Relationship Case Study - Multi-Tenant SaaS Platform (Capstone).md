---
title: "03.08.09.16 - Real-World Relationship Case Study: Multi-Tenant SaaS Platform (Capstone)"
description: "Learn how modern SaaS platforms such as GitHub, Notion, Slack, Jira, Shopify, and Salesforce are designed using relational databases. Explore multi-tenancy, organisations, workspaces, RBAC, subscriptions, billing, feature flags, API keys, webhooks, audit trails, and enterprise architecture."
chapter: 3
section: 3.8.9.16
category: Core SQL Concepts
difficulty: Expert
readingTime: 180 min
lastUpdated: 2026-07-27
---

# 03.08.09.16 Multi-Tenant SaaS Platform (Capstone)

---

# Learning Objectives

After completing this lesson, you will be able to:

- Design an enterprise SaaS database
- Understand multi-tenant architecture
- Model organisations and workspaces
- Design Role-Based Access Control (RBAC)
- Implement subscriptions and billing
- Understand feature flags
- Design API authentication
- Model audit logs
- Build scalable SaaS architecture
- Connect SQL fundamentals with real production systems

---

# Introduction

A modern SaaS platform serves **thousands—or even millions—of customers** from a shared software application.

Examples include:

- GitHub
- Notion
- Slack
- Jira
- Shopify
- Salesforce
- Linear
- Trello
- ClickUp
- Canva
- Monday.com

Although these products appear very different, they share many common database patterns.

---

# Business Requirements

The platform should support:

- Organisations (Tenants)
- Users
- Workspaces
- Teams
- Projects
- Tasks
- Comments
- Attachments
- Roles
- Permissions
- API Keys
- OAuth Clients
- Webhooks
- Subscription Plans
- Billing
- Invoices
- Payments
- Usage Tracking
- Feature Flags
- Notifications
- Audit Logs
- Activity Timeline

---

# Step 1 — Identify Entities

| Entity | Purpose |
|---------|----------|
| Organizations | Tenant companies |
| Users | Platform users |
| Workspaces | Team collaboration |
| Teams | Departments or groups |
| Projects | Business projects |
| Tasks | Individual work items |
| Comments | Discussions |
| Attachments | Uploaded files |
| Roles | User roles |
| Permissions | Access permissions |
| SubscriptionPlans | Pricing tiers |
| Subscriptions | Customer subscriptions |
| Invoices | Billing records |
| Payments | Payment transactions |
| APIKeys | API authentication |
| OAuthClients | Third-party integrations |
| FeatureFlags | Premium features |
| UsageRecords | Usage metering |
| Notifications | User alerts |
| AuditLogs | Security & compliance |

---

# Enterprise ER Diagram

```text
Organizations
      │
      ├──────── Workspaces
      │             │
      │             ├──────── Teams
      │             ├──────── Projects
      │             │        │
      │             │        ├──────── Tasks
      │             │        │        ├──── Comments
      │             │        │        └──── Attachments
      │             │
      │             └──────── ActivityTimeline
      │
      ├──────── Users
      │        │
      │        ├──────── Roles
      │        └──────── APIKeys
      │
      ├──────── Subscription
      │        ├──── Invoices
      │        └──── Payments
      │
      ├──────── FeatureFlags
      ├──────── UsageRecords
      ├──────── Webhooks
      └──────── AuditLogs
```

---

# Multi-Tenant Architecture

A tenant represents a customer organisation.

```text
Platform

↓

Organizations

↓

Users

↓

Projects

↓

Tasks
```

Every business record references an `OrganizationID` (TenantID).

---

# Three Multi-Tenant Strategies

## 1. Shared Database, Shared Schema

```text
One Database

↓

All Customers

↓

OrganizationID
```

Advantages

- Lowest cost
- Easy deployment
- Common in SaaS startups

Disadvantages

- Strong tenant isolation required

---

## 2. Shared Database, Separate Schemas

```text
One Database

↓

Schema A

Schema B

Schema C
```

Advantages

- Better isolation

Disadvantages

- Increased operational complexity

---

## 3. Separate Database per Tenant

```text
Tenant A

↓

Database A

Tenant B

↓

Database B
```

Advantages

- Maximum isolation
- Easier customer-specific backups

Disadvantages

- Higher operational cost

---

# Workspace Model

Many SaaS applications support multiple workspaces.

Example:

```text
Acme Ltd

├── Marketing

├── Engineering

└── HR
```

Each workspace has its own projects, members, and settings.

---

# Role-Based Access Control (RBAC)

```text
User

↓

Role

↓

Permissions

↓

Action
```

Example:

| Role | Permissions |
|------|-------------|
| Owner | Full access |
| Admin | Workspace management |
| Manager | Project management |
| Member | Daily work |
| Guest | Limited access |

---

# Feature Flags

Different subscription plans unlock different features.

```text
Free

↓

Projects

Tasks

↓

Pro

↓

Automation

API

↓

Enterprise

↓

SSO

Audit Logs

Advanced Security
```

Feature flags allow new functionality to be enabled without changing the application code for every customer.

---

# Subscription Model

```text
Organization

↓

Subscription

↓

Invoice

↓

Payment
```

Subscription states include:

- Trial
- Active
- Suspended
- Cancelled
- Expired

---

# Usage Metering

Many SaaS products charge based on usage.

Examples:

- API requests
- Storage
- Active users
- Projects
- AI credits
- Emails sent

Example:

| Metric | Value |
|---------|------:|
| API Requests | 2,450,000 |
| Storage | 320 GB |
| Active Users | 128 |

Usage records support billing and analytics.

---

# API Keys

External applications access APIs using API keys.

```text
Organization

↓

API Key

↓

REST API
```

Each key includes:

- Key ID
- Secret (stored securely)
- Permissions
- Expiration
- Last Used

---

# OAuth Clients

Third-party integrations require delegated access.

Examples:

- Google
- Microsoft
- Slack
- GitHub

OAuth clients store:

- Client ID
- Redirect URI
- Allowed scopes

---

# Webhooks

Applications notify external systems automatically.

```text
Task Completed

↓

Webhook

↓

Customer Server
```

Common webhook events:

- User Created
- Invoice Paid
- Subscription Updated
- Project Archived

---

# Activity Timeline

Every important action becomes an event.

```text
Project Created

↓

Task Added

↓

Comment Posted

↓

File Uploaded

↓

Task Completed
```

A timeline improves collaboration and auditing.

---

# Soft Deletes

Instead of deleting projects:

```text
DeletedAt

DeletedBy

Restore Available
```

This protects against accidental data loss.

---

# Audit Logs

Security-sensitive actions are permanently recorded.

Examples:

- User Login
- Password Reset
- Permission Changed
- API Key Created
- Billing Updated
- SSO Configured

Audit logs are essential for enterprise compliance.

---

# Notification System

Users receive notifications for:

- Task assignments
- Comments
- Mentions
- Billing reminders
- Security alerts
- Subscription renewals

Notifications are typically processed asynchronously.

---

# Enterprise Architecture Notes

## CQRS

Separate transactional updates from dashboards and analytics.

---

## Event Sourcing

Examples:

- User Invited
- Project Created
- Subscription Renewed
- Payment Received
- Feature Enabled

---

## Change Data Capture (CDC)

Changes automatically update:

- Search indexes
- Analytics
- Email systems
- Webhooks
- Data warehouse

---

## Background Jobs

Long-running operations are processed asynchronously.

Examples:

- PDF generation
- Email sending
- Data export
- Backups
- Thumbnail generation

---

## Caching

Frequently cached data:

- User profiles
- Permissions
- Feature flags
- Project summaries
- Subscription details

---

## Search Engine

Full-text search is usually handled outside the transactional database.

Search indexes commonly include:

- Tasks
- Comments
- Documents
- Wiki pages
- Knowledge base articles

---

## Object Storage

Large files are stored separately.

Examples:

- Images
- PDFs
- Videos
- Attachments
- Backups

The database stores metadata and file references.

---

## Read Replicas

Read-heavy operations use replicas.

Examples:

- Dashboards
- Reports
- Search
- User profile pages

---

## Sharding

As the platform grows, tenants may be distributed across multiple database servers.

```text
Tenant A–M

↓

Shard 1

Tenant N–Z

↓

Shard 2
```

---

## Polyglot Persistence

| Module | Storage |
|---------|---------|
| Core Data | Relational Database |
| Cache | Redis |
| Search | Elasticsearch/OpenSearch |
| Files | Object Storage |
| Analytics | Data Warehouse |
| Monitoring | Time-Series Database |

---

# Common Production Challenges

## Tenant Isolation

A user must never access another organisation's data.

Every query must enforce tenant boundaries.

---

## Billing Accuracy

Subscription changes, upgrades, downgrades, and refunds should produce accurate invoices and maintain a complete financial history.

---

## Permission Escalation

RBAC should prevent users from granting themselves higher privileges.

---

## API Abuse

Rate limiting and usage quotas help protect the platform from excessive API requests.

---

## Large Organisations

Enterprise customers may have:

- Thousands of users
- Millions of tasks
- Hundreds of projects

Efficient indexing and partitioning become essential.

---

## Compliance

Enterprise customers often require:

- GDPR support
- SOC 2 compliance
- ISO 27001 controls
- Data retention policies
- Audit reporting

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB |
|---------|:-----:|:----------:|:----------:|:------:|:--------:|
| Transactions | ✅ | ✅ | ✅ | ✅ | ✅ |
| Foreign Keys | ✅ | ✅ | ✅ | ✅ | ✅ |
| JSON Support | ✅ | ✅ | ✅ | ✅ | ✅ |
| Partitioning | ✅ | ✅ | ✅ | ✅ | ✅ |
| Row-Level Security | Limited | Excellent | Good | Good | Limited |

---

# 💡 Did You Know?

Many successful SaaS products started with a **shared database and shared schema** architecture because it is simpler to build and operate. As the customer base grows, some platforms gradually introduce schema isolation, database sharding, or dedicated databases for large enterprise customers—all while preserving the same logical data model.

---

# Interview Questions

1. What is a multi-tenant application?
2. Compare the three multi-tenant database strategies.
3. Why should every business table include an `OrganizationID`?
4. What is the purpose of feature flags?
5. Why are API keys stored separately from users?
6. Why are audit logs critical in enterprise SaaS products?
7. When would you choose sharding?
8. Why use background jobs instead of processing everything synchronously?

---

# Hands-on Exercises

### Exercise 1

Draw the complete ER diagram for the SaaS platform.

---

### Exercise 2

Design tables for:

- Organizations
- Users
- Projects
- Tasks
- Roles
- Permissions
- Subscriptions
- Invoices
- APIKeys

---

### Exercise 3

Design the workflow:

Organization → Subscription → Workspace → Project → Task → Activity Timeline

Identify where transactions, audit logs, notifications, and background jobs should be triggered.

---

### Exercise 4

Design an RBAC schema that supports:

- Owners
- Administrators
- Managers
- Members
- Guests

Allow roles to evolve without changing application code.

---

### Exercise 5 (Capstone)

Design your own SaaS application (for example, Project Management, CRM, HRMS, LMS, Inventory, Healthcare, or E-commerce Admin).

Create:

- Core entities
- Primary and foreign keys
- Relationships
- Junction tables
- Lookup tables
- Audit tables
- Soft-delete strategy
- Multi-tenant model
- Subscription model
- API authentication
- Feature flag strategy

Present the complete ER diagram and justify your design decisions.

---

# Chapter 3 Wrap-Up

Throughout Chapter 3, you progressed from fundamental relational concepts to enterprise-grade database design.

You learned how to model:

- Databases and schemas
- Tables, rows, and columns
- Keys and constraints
- One-to-One, One-to-Many, and Many-to-Many relationships
- Junction tables
- Referential integrity
- Cascade actions
- Self-referencing relationships
- Real-world systems across education, healthcare, banking, logistics, ERP, CRM, government, and SaaS

These concepts form the foundation for designing robust relational databases that can support modern, scalable applications.

---

# Related Topics

### Previous Lessons

- 03.08.09.15 — Government e-Governance System
- 03.08.09.13 — Customer Relationship Management (CRM) System
- 03.08.09.11 — Logistics & Supply Chain Management System

### Next Chapter

**Chapter 04 — SQL Syntax & Query Fundamentals**