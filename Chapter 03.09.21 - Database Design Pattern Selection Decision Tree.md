---
title: "03.09.14 - Database Design Pattern Selection Decision Tree"
description: "Learn how to choose the right database design pattern for real-world applications. This decision tree helps developers and architects identify the most suitable pattern based on business requirements, scalability, reliability, auditing, and distributed system needs."
chapter: 3
section: 3.9.14
category: Database Design Patterns
difficulty: Intermediate → Advanced
readingTime: 30 min
lastUpdated: 2026-07-28
---

# 03.09.14 Pattern Selection Decision Tree

---

# Learning Objectives

After completing this lesson, you will be able to:

- Choose the correct database design pattern for a given problem
- Avoid common design mistakes
- Understand when multiple patterns should be combined
- Think like a database architect
- Build scalable enterprise applications

---

# Introduction

One of the biggest mistakes beginners make is trying to solve **every problem with the same database design**.

For example:

```text
Need Comments

↓

Create Foreign Key
```

or

```text
Need History

↓

Duplicate Table
```

or

```text
Need Multiple Customers

↓

Create Multiple Databases
```

These solutions may work for small projects but become difficult to maintain as systems grow.

Professional database architects choose patterns based on the **business problem**, not personal preference.

---

# The Decision Tree

```text
Start
│
├── Need static reference data?
│       │
│       └── Lookup Table Pattern
│
├── Need Header + Line Items?
│       │
│       └── Master–Detail Pattern
│
├── Need Many-to-Many?
│       │
│       └── Junction Table Pattern
│
├── Need Workflow Tracking?
│       │
│       └── Status History Pattern
│
├── Need Security/Audit Trail?
│       │
│       └── Audit Log Pattern
│
├── Need Recoverable Delete?
│       │
│       └── Soft Delete Pattern
│
├── Need Historical Versions?
│       │
│       └── Versioning Pattern
│
├── Need Parent–Child Hierarchy?
│       │
│       └── Hierarchical Pattern
│
├── Need Reusable Comments/
│   Attachments/Tags?
│       │
│       └── Polymorphic Association
│
├── Need Business Event History?
│       │
│       └── Event Log Pattern
│
├── Need Reliable Event Publishing?
│       │
│       └── Outbox Pattern
│
├── Need Safe Retries?
│       │
│       └── Idempotency Pattern
│
├── Building SaaS?
│       │
│       └── Multi-Tenant Pattern
│
└── Need Distributed Scaling?
        │
        └── CQRS / Event Sourcing /
            Saga / Sharding
```

---

# Decision Matrix

| Requirement | Recommended Pattern |
|--------------|--------------------|
| Static values | Lookup Table |
| Invoice with items | Master–Detail |
| Students & Courses | Junction Table |
| Status changes | Status History |
| Track who changed data | Audit Log |
| Recover deleted records | Soft Delete |
| Preserve document revisions | Versioning |
| Tree structures | Hierarchical |
| Shared comments/files | Polymorphic |
| Business events | Event Log |
| Reliable messaging | Outbox |
| Retry-safe APIs | Idempotency |
| SaaS platform | Multi-Tenant |
| High-scale microservices | CQRS + Saga |

---

# Pattern Categories

Rather than memorising every pattern individually, group them by purpose.

---

# 1. Data Organisation

Used to organise relational data.

Patterns:

- Lookup Table
- Master–Detail
- Junction Table
- Hierarchical

Example

```text
ERP

↓

Departments

↓

Employees

↓

Projects
```

---

# 2. Historical Data

Used when information should never disappear.

Patterns:

- Status History
- Audit Log
- Versioning
- Event Log

Example

```text
Banking

↓

Money Transfer

↓

History

↓

Audit
```

---

# 3. Data Lifecycle

Used to control record lifespan.

Patterns:

- Soft Delete
- Versioning

Example

```text
Employee

↓

Resigned

↓

Soft Deleted

↓

Archived
```

---

# 4. Reusable Features

Used across many modules.

Patterns:

- Polymorphic Association
- Lookup Tables

Example

```text
Comments

↓

Products

Orders

Tickets

Articles
```

---

# 5. Enterprise Reliability

Used in distributed systems.

Patterns:

- Event Log
- Outbox
- Idempotency

Example

```text
Order

↓

Event

↓

Kafka

↓

Inventory

↓

Email
```

---

# 6. SaaS & Cloud

Used in cloud-native software.

Patterns:

- Multi-Tenant

Example

```text
Shopify

↓

Stores

↓

TenantID
```

---

# 7. Large-Scale Architecture

Usually introduced after mastering SQL fundamentals.

Patterns:

- CQRS
- Event Sourcing
- Saga
- Sharding
- Read Replicas
- Partitioning

---

# Which Patterns Work Together?

Enterprise systems rarely use just one pattern.

Example:

## E-Commerce

```text
Products

↓

Lookup Table

↓

Orders

↓

Master–Detail

↓

Audit Log

↓

Outbox

↓

Event Log

↓

Soft Delete
```

---

## Banking

```text
Accounts

↓

Status History

↓

Audit Log

↓

Versioning

↓

Event Log

↓

Idempotency

↓

Outbox
```

---

## Hospital

```text
Patients

↓

Versioning

↓

Audit Log

↓

Soft Delete

↓

Lookup Tables
```

---

## SaaS CRM

```text
Tenant

↓

Customers

↓

Audit Log

↓

Outbox

↓

Event Log

↓

Idempotency

↓

Versioning
```

---

# Enterprise Adoption

| Company | Patterns Commonly Used |
|----------|------------------------|
| Amazon | Master–Detail, Event Log, Outbox, Idempotency |
| Stripe | Audit Log, Event Log, Idempotency |
| Shopify | Multi-Tenant, Master–Detail, Outbox |
| Salesforce | Multi-Tenant, Audit Log, Versioning |
| Microsoft | Event Log, CQRS, Saga |
| Netflix | Event Log, CQRS, Sharding |
| Uber | Event Log, Saga, Idempotency |
| GitHub | Versioning, Audit Log, Polymorphic |

---

# Choosing the Simplest Solution

A common mistake is selecting an advanced pattern too early.

Instead:

```text
Simple Requirement

↓

Simple Pattern
```

For example:

Need product categories?

Use:

```text
Hierarchical Pattern
```

Not:

```text
Event Sourcing
```

Need comments?

Use:

```text
Polymorphic Association
```

Not:

```text
CQRS
```

Choose the simplest pattern that solves today's problem while allowing room to evolve.

---

# Best Practices

✔ Start with the business requirement.

✔ Prefer simple relational designs first.

✔ Add advanced patterns only when justified.

✔ Combine complementary patterns.

✔ Document architectural decisions.

✔ Review performance before increasing complexity.

---

# Common Mistakes

## Pattern-Driven Design

Bad

```text
I learned Saga today.

Everything will use Saga.
```

Architecture should be driven by business requirements.

---

## Reinventing Existing Patterns

Avoid inventing custom solutions for:

- Audit logging
- Version history
- Soft deletes
- Master–Detail relationships

Established patterns are well understood and easier to maintain.

---

## Ignoring Future Growth

Design for reasonable scalability, but don't over-engineer a small application.

---

## Using Every Pattern

Enterprise applications often use many patterns **across different modules**, but rarely all in the same workflow.

---

# 💡 Did You Know?

Large enterprise systems are built by **combining** patterns rather than relying on a single one. An e-commerce platform may use Master–Detail for orders, Hierarchical tables for categories, Audit Logs for compliance, Event Logs for business events, Outbox for reliable messaging, and Idempotency for payment APIs—all within the same application.

---

# Architecture Maturity Roadmap

```text
Beginner

↓

Tables

↓

Relationships

↓

Constraints

↓

Normalization

────────────────────────

Intermediate

↓

Lookup Tables

↓

Master–Detail

↓

Status History

↓

Audit Log

↓

Versioning

────────────────────────

Advanced

↓

Event Log

↓

Outbox

↓

Idempotency

↓

Multi-Tenant

────────────────────────

Enterprise

↓

CQRS

↓

Event Sourcing

↓

Saga

↓

Sharding

↓

Distributed Systems
```

---

# Interview Questions

## Basic

1. When should you use a Lookup Table?
2. What is the difference between Audit Log and Event Log?
3. When is Soft Delete preferable to Hard Delete?

---

## Intermediate

4. Which pattern would you use for an invoice system?
5. Why is Versioning different from Status History?
6. Why is Multi-Tenant important for SaaS?

---

## Advanced

7. Design the architecture for an online banking system using appropriate patterns.
8. Which patterns would you combine for an e-commerce platform?
9. Explain why Outbox and Idempotency are often used together.
10. How do you decide whether a project needs CQRS?

---

# Hands-on Exercises

## Exercise 1

Choose appropriate patterns for:

- Hospital Management System
- Learning Management System
- HRMS
- CRM

Explain your choices.

---

## Exercise 2

Design a modern e-commerce platform.

Identify where each of the following patterns is used:

- Lookup Table
- Master–Detail
- Audit Log
- Event Log
- Soft Delete
- Versioning
- Outbox
- Idempotency

---

## Exercise 3

A SaaS project management application needs:

- Multiple organisations
- Tasks
- Comments
- Notifications
- Activity history
- Reliable email sending

Choose the most appropriate database patterns.

---

## Exercise 4

Draw your own decision tree for selecting database design patterns based on business requirements.

---

# Related Topics

- **03.09.01 — Lookup Table Pattern**
- **03.09.02 — Master–Detail Pattern**
- **03.09.03 — Junction Table Pattern**
- **03.09.04 — Status History Pattern**
- **03.09.05 — Audit Log Pattern**
- **03.09.06 — Soft Delete Pattern**
- **03.09.07 — Versioning Pattern**
- **03.09.08 — Hierarchical Pattern**
- **03.09.09 — Polymorphic Association Pattern**
- **03.09.10 — Event Log Pattern**
- **03.09.11 — Multi-Tenant Pattern**
- **03.09.12 — Outbox Pattern**
- **03.09.13 — Idempotency Pattern**

---

# Summary

Selecting the right database design pattern is one of the defining skills of an experienced database designer or software architect. Rather than memorising patterns in isolation, focus on understanding the business problem first. Simple requirements usually need simple patterns, while large-scale distributed systems often combine multiple complementary patterns. As you progress through SQL and system design, this decision tree will serve as a practical guide for choosing patterns that are scalable, maintainable, and aligned with real-world enterprise architecture.