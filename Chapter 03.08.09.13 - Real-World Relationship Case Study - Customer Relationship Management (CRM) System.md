---
title: "03.08.09.13 - Real-World Relationship Case Study: Customer Relationship Management (CRM) System"
description: "Learn how enterprise Customer Relationship Management (CRM) systems are designed using relational databases. Explore leads, contacts, accounts, opportunities, activities, sales pipelines, quotations, customer support, and enterprise architecture."
chapter: 3
section: 3.8.9.13
category: Core SQL Concepts
difficulty: Advanced
readingTime: 125 min
lastUpdated: 2026-07-27
---

# 03.08.09.13 Customer Relationship Management (CRM) System

## Learning Objectives

After completing this lesson, you will be able to:

- Design an enterprise CRM database
- Model the complete customer lifecycle
- Understand sales pipeline relationships
- Build activity tracking systems
- Learn lead-to-customer conversion
- Design customer support workflows
- Understand timeline-based data modelling
- Explore enterprise CRM architecture

---

# Introduction

A **Customer Relationship Management (CRM)** system helps organisations build and maintain relationships with customers.

Unlike ERP systems that manage internal business operations, CRM systems focus on **sales, marketing, customer service, and customer engagement**.

Modern CRM platforms include:

- Salesforce
- Microsoft Dynamics CRM
- HubSpot CRM
- Zoho CRM
- SAP CRM
- Oracle CX
- Freshsales

CRM systems are widely used by:

- SaaS companies
- Banks
- Insurance companies
- Hospitals
- Educational institutions
- Retail businesses
- Real estate agencies

---

# Business Requirements

The CRM should manage:

- Leads
- Contacts
- Companies (Accounts)
- Sales Representatives
- Opportunities
- Sales Pipelines
- Activities
- Tasks
- Meetings
- Calls
- Emails
- Quotations
- Contracts
- Support Tickets
- Customer Feedback
- Campaigns
- Products
- Audit Logs

---

# Step 1 — Identify Entities

| Entity | Purpose |
|---------|----------|
| Leads | Potential customers |
| Accounts | Customer companies |
| Contacts | People within accounts |
| SalesRepresentatives | Sales team |
| Opportunities | Potential deals |
| SalesStages | Pipeline stages |
| Activities | Calls, emails, meetings |
| Tasks | Assigned work |
| Notes | Internal notes |
| Quotations | Sales quotations |
| Contracts | Signed agreements |
| Products | Products & services |
| Campaigns | Marketing campaigns |
| SupportTickets | Customer issues |
| Feedback | Customer satisfaction |
| AuditLogs | Activity history |

---

# Step 2 — Relationship Analysis

| Parent | Child | Relationship |
|---------|--------|-------------|
| Account → Contacts | One-to-Many |
| Account → Opportunities | One-to-Many |
| SalesRep → Leads | One-to-Many |
| SalesRep → Opportunities | One-to-Many |
| Opportunity → Quotations | One-to-Many |
| Opportunity → Activities | One-to-Many |
| Opportunity → Contracts | One-to-One |
| Customer → SupportTickets | One-to-Many |
| Campaign → Leads | One-to-Many |
| Opportunities ↔ Products | Many-to-Many |

---

# Enterprise ER Diagram

```text
Campaigns
     │
     ▼
Leads
     │
     ▼
Accounts
     │
     ├──────── Contacts
     ├──────── Opportunities
     │              │
     │              ├──────── Quotations
     │              ├──────── Activities
     │              ├──────── Tasks
     │              ├──────── Notes
     │              └──────── Contracts
     │
     └──────── SupportTickets
                    │
                    ▼
                 Feedback

Products
     ▲
     │
OpportunityProducts

SalesRepresentatives

AuditLogs
```

---

# CRM Customer Lifecycle

Every customer passes through a business lifecycle.

```text
Lead

↓

Qualified Lead

↓

Opportunity

↓

Quotation

↓

Negotiation

↓

Won

↓

Customer

↓

Support

↓

Loyal Customer
```

Alternative outcomes:

```text
Opportunity

↓

Lost
```

---

# Sales Pipeline

CRM systems organise opportunities using pipeline stages.

```text
Prospecting

↓

Qualification

↓

Proposal

↓

Negotiation

↓

Closed Won
```

or

```text
Closed Lost
```

Every stage is recorded rather than simply updating a single status field.

---

# Lead Conversion

One of the most important CRM operations.

```text
Lead

↓

Account

↓

Contact

↓

Opportunity
```

Instead of deleting the lead, the CRM records when and how it was converted.

---

# Relationship Breakdown

## One-to-One

```text
Opportunity

↓

Contract
```

A successful opportunity generally results in one signed contract.

---

## One-to-Many

```text
Account

↓

Contacts
```

A company may have many contacts.

---

```text
Opportunity

↓

Activities
```

Sales opportunities accumulate many interactions over time.

---

```text
Customer

↓

Support Tickets
```

Customers can create multiple support requests.

---

## Many-to-Many

### Opportunities ↔ Products

```text
Opportunities

↓

OpportunityProducts

↓

Products
```

A sales opportunity may involve several products.

The same product can appear in many opportunities.

---

# Activity Timeline

CRM systems are timeline-driven.

Every customer interaction becomes an activity.

```text
Lead Created

↓

Email Sent

↓

Phone Call

↓

Meeting

↓

Quotation

↓

Follow-Up

↓

Contract Signed
```

The timeline provides a complete history of customer engagement.

---

# Polymorphic Activities

One of the most common CRM database patterns.

Activities may belong to different entity types.

Instead of creating:

```text
LeadActivities

OpportunityActivities

CustomerActivities

TicketActivities
```

Many CRM systems use:

```text
Activities

ActivityID

EntityType

EntityID
```

Example:

| EntityType | EntityID |
|------------|----------|
| Lead | 1001 |
| Opportunity | 501 |
| Account | 220 |
| Ticket | 870 |

This enables one activity table to support many business objects.

---

# Master–Detail Pattern

Quotations follow the Master–Detail design.

```text
Quotation

↓

QuotationItems
```

Example:

```text
Quotation

↓

Software Licence

Training

Support
```

Each quotation contains multiple products or services.

---

# Support Workflow

After a sale, CRM systems continue tracking customer support.

```text
Customer

↓

Support Ticket

↓

Assigned Agent

↓

Investigation

↓

Resolved

↓

Closed
```

The support history becomes part of the customer's overall relationship timeline.

---

# Lookup Tables

Typical lookup tables include:

- Lead Sources
- Opportunity Stages
- Activity Types
- Contact Roles
- Ticket Priorities
- Ticket Status
- Industries
- Customer Types
- Contract Types

---

# Soft Deletes

CRM data is business-critical.

Instead of deleting:

```text
IsActive = FALSE

DeletedAt

DeletedBy
```

Historical interactions remain available for audits and reporting.

---

# Audit Logs

Record important events such as:

```text
Lead Created

↓

Opportunity Assigned

↓

Quotation Sent

↓

Contract Signed

↓

Ticket Closed
```

---

# Slowly Changing Dimensions (SCD)

Customer information evolves over time.

Examples:

- Company name
- Industry
- Annual revenue
- Sales representative
- Customer tier

Analytical systems often preserve historical values for trend analysis.

---

# Customer 360 View

Enterprise CRMs provide a **Customer 360** view.

```text
Customer

├── Contacts

├── Opportunities

├── Orders

├── Activities

├── Support

├── Contracts

├── Invoices

└── Payments
```

The goal is to display every customer interaction from one unified interface.

---

# Performance Considerations

Large CRM systems benefit from:

- Indexes on AccountID, ContactID, OpportunityID
- Full-text search for notes and activities
- Composite indexes for sales reporting
- Partitioning historical activities
- Read replicas for dashboards
- Caching customer profiles

---

# Common Production Challenges

## Duplicate Customers

The same customer may be entered multiple times using different spellings or email addresses.

Many CRM systems implement duplicate detection and merge functionality.

---

## Long Sales Cycles

Enterprise sales can last months or even years.

Every interaction must remain linked to the opportunity throughout its lifecycle.

---

## Opportunity Ownership Changes

Sales representatives may change during negotiations.

Ownership history should be preserved for reporting and commission calculations.

---

## Multi-Channel Communication

Customers communicate through:

- Email
- Phone
- Chat
- SMS
- Video meetings
- Social media

The CRM should store all interactions in one timeline.

---

## Quotation Versioning

A quotation may go through several revisions.

Instead of overwriting the original quotation, maintain version history.

---

## Customer Merging

When duplicate accounts are merged, relationships with contacts, opportunities, tickets, and activities must remain intact.

---

# Enterprise Architecture Notes

## CQRS

Separate sales updates from analytical dashboards.

---

## Event Sourcing

Examples:

- Lead Created
- Opportunity Qualified
- Meeting Scheduled
- Contract Signed
- Ticket Closed

---

## Change Data Capture (CDC)

CRM updates automatically feed:

- Marketing platforms
- BI dashboards
- ERP systems
- Customer portals
- Email automation

---

## Read Replicas

Sales dashboards generate significantly more reads than writes.

Read replicas improve scalability.

---

## Polyglot Persistence

| Module | Storage |
|---------|---------|
| CRM Core | Relational Database |
| Search | Elasticsearch/OpenSearch |
| Cache | Redis |
| Email Attachments | Object Storage |
| Analytics | Data Warehouse |

---

## Integration Architecture

CRM systems commonly integrate with:

- ERP
- Accounting
- Email providers
- Marketing automation
- Helpdesk platforms
- Payment gateways

Most integrations occur through APIs or event-driven messaging.

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB |
|---------|:-----:|:----------:|:----------:|:------:|:--------:|
| Foreign Keys | ✅ | ✅ | ✅ | ✅ | ✅ |
| Transactions | ✅ | ✅ | ✅ | ✅ | ✅ |
| Full-Text Search | Basic | Excellent | Excellent | Excellent | Basic |
| Partitioning | ✅ | ✅ | ✅ | ✅ | ✅ |
| Window Functions | ✅ | ✅ | ✅ | ✅ | ✅ |

---

# 💡 Did You Know?

Many enterprise CRM platforms are **timeline-first systems**. Instead of focusing only on tables like Customers or Opportunities, they build a chronological history of every interaction—emails, calls, meetings, quotations, support tickets, and contracts—giving sales and support teams a complete view of the customer relationship.

---

# Interview Questions

1. What is the difference between a Lead and an Opportunity?
2. Why are Activities often implemented as a polymorphic table?
3. What is a Customer 360 view?
4. Why should quotations use the Master–Detail pattern?
5. Why preserve ownership history?
6. Why is duplicate detection important in CRM systems?
7. What is the purpose of a sales pipeline?
8. Why should CRM systems integrate with ERP?

---

# Hands-on Exercises

### Exercise 1

Draw the complete ER diagram for the CRM system.

---

### Exercise 2

Design tables for:

- Leads
- Accounts
- Contacts
- Opportunities
- Activities
- Quotations
- SupportTickets

---

### Exercise 3

Design the workflow:

Lead → Opportunity → Quotation → Contract → Customer Support

Identify where audit records and status history should be maintained.

---

### Exercise 4

Create lookup tables for:

- Lead Sources
- Opportunity Stages
- Ticket Priorities
- Customer Types
- Activity Types

---

### Exercise 5

Extend the CRM by adding:

- AI lead scoring
- Chatbot conversations
- Customer surveys
- Sales forecasting
- Partner management
- Territory management

Identify the additional entities and relationships.

---

# Summary

This case study demonstrated how enterprise CRM systems manage the complete customer lifecycle using relational databases. You explored lead conversion, sales pipelines, activity timelines, polymorphic relationships, customer support, quotation management, Customer 360 views, and enterprise integration patterns that enable organisations to build long-term customer relationships.

---

# Related Topics

### Previous Lessons

- 03.08.09.07 — Enterprise Resource Planning (ERP) System
- 03.08.09.12 — Manufacturing Execution System (MES)

### Next Lesson

**03.08.09.14 — Real-World Relationship Case Study: Learning Management System (LMS)**