---
title: "03.08.09.07 - Real-World Relationship Case Study: Enterprise Resource Planning (ERP) System"
description: "Learn how an enterprise-grade ERP system integrates Human Resources, Finance, Sales, Procurement, Inventory, Manufacturing, CRM, Projects, and Accounting using relational database concepts and enterprise architecture patterns."
chapter: 3
section: 3.8.9.7
category: Core SQL Concepts
difficulty: Advanced
readingTime: 120 min
lastUpdated: 2026-07-27
---

# 03.08.09.07 Enterprise Resource Planning (ERP) System

## Learning Objectives

After completing this lesson, you will be able to:

- Understand enterprise ERP architecture
- Design large-scale relational databases
- Integrate multiple business modules
- Build scalable database relationships
- Understand cross-module data flow
- Learn enterprise database design patterns
- Explore ERP architecture used by SAP, Oracle, Microsoft Dynamics, Odoo and ERPNext

---

# Introduction

An **Enterprise Resource Planning (ERP)** system integrates nearly every department within an organisation into one unified platform.

Instead of maintaining separate databases for HR, Sales, Inventory, Finance, Procurement, and Manufacturing, an ERP enables all departments to share a single source of truth.

Popular ERP solutions include:

- SAP S/4HANA
- Oracle Fusion ERP
- Microsoft Dynamics 365
- Odoo
- ERPNext
- NetSuite
- Infor ERP

ERP systems are used by:

- Manufacturers
- Hospitals
- Banks
- Retailers
- Logistics companies
- Universities
- Government agencies

---

# Business Requirements

The company needs a system to manage:

- Employees
- Departments
- Customers
- Suppliers
- Products
- Warehouses
- Inventory
- Sales
- Purchases
- Manufacturing
- Projects
- Accounting
- Payroll
- Assets
- CRM
- Reports

All modules must share common master data.

---

# ERP Modules

| Module | Purpose |
|---------|----------|
| HRMS | Employee management |
| CRM | Customer management |
| Sales | Sales orders |
| Procurement | Purchasing |
| Inventory | Stock management |
| Manufacturing | Production |
| Finance | Accounting |
| Payroll | Salary processing |
| Fixed Assets | Company assets |
| Projects | Project management |
| Reporting | Business intelligence |

---

# Step 1 — Identify Master Data

Master data changes infrequently but is shared across the organisation.

| Master Entity | Used By |
|---------------|---------|
| Employees | HR, Payroll, Projects |
| Customers | CRM, Sales, Finance |
| Suppliers | Procurement, Inventory |
| Products | Sales, Manufacturing |
| Warehouses | Inventory |
| Departments | HR, Finance |
| Cost Centres | Finance |
| Branches | All modules |
| Currency | Finance |
| Tax Codes | Sales & Procurement |

---

# Step 2 — Identify Transaction Data

Transaction data records day-to-day business operations.

| Transaction Entity | Module |
|--------------------|--------|
| Sales Orders | Sales |
| Purchase Orders | Procurement |
| Goods Receipts | Inventory |
| Stock Transfers | Inventory |
| Manufacturing Orders | Manufacturing |
| Journal Entries | Finance |
| Payroll Runs | Payroll |
| Expense Claims | HR |
| Project Tasks | Projects |
| Customer Invoices | Finance |

---

# High-Level Enterprise ER Diagram

```text
                        Branches
                            │
      ┌─────────────────────┼─────────────────────┐
      ▼                     ▼                     ▼
 Departments           Warehouses          Cost Centres
      │                     │
      ▼                     ▼
 Employees             Inventory
      │                     ▲
      │                     │
      ▼                     │
 Payroll             Products
      ▲                     ▲
      │                     │
      └─────────────┐ ┌─────┘
                    ▼ ▼
                Manufacturing
                    │
                    ▼
               Production Orders

Customers ───► Sales Orders ───► Invoices ───► Payments

Suppliers ───► Purchase Orders ───► Goods Receipts

Projects ───► Tasks

Finance ───► Journal Entries

Audit Logs ◄──────────── Every Module
```

---

# Relationship Breakdown

## One-to-One

```
Employee

↓

Payroll Profile
```

---

```
Product

↓

Inventory Summary
```

---

## One-to-Many

```
Customer

↓

Sales Orders
```

---

```
Supplier

↓

Purchase Orders
```

---

```
Warehouse

↓

Inventory
```

---

```
Project

↓

Tasks
```

---

## Many-to-Many

### Employees ↔ Projects

Resolved by:

```
Employees

↓

ProjectAssignments

↓

Projects
```

---

### Products ↔ Warehouses

Resolved by:

```
Products

↓

Inventory

↓

Warehouses
```

---

### Products ↔ Suppliers

Resolved by:

```
Products

↓

ProductSuppliers

↓

Suppliers
```

One product may be supplied by many vendors.

One supplier may provide many products.

---

# Master–Detail Pattern

ERP systems heavily use the Master–Detail design.

Example:

```
SalesOrder

↓

SalesOrderItems
```

Another example:

```
PurchaseOrder

↓

PurchaseOrderItems
```

Manufacturing:

```
ProductionOrder

↓

ProductionSteps
```

Accounting:

```
JournalEntry

↓

JournalEntryLines
```

This pattern ensures consistency, flexibility, and auditability.

---

# Cross-Module Data Flow

Example:

```
Customer

↓

Sales Order

↓

Inventory Check

↓

Warehouse Allocation

↓

Invoice

↓

Payment

↓

Accounting Entry

↓

Financial Report
```

A single sales order updates multiple modules automatically.

---

# Lookup Tables

ERP systems centralise reference data.

Examples:

- Countries
- States
- Currency
- Units of Measure (UOM)
- Payment Methods
- Tax Codes
- Product Categories
- Employee Roles
- Order Status
- Shipping Methods

Lookup tables improve consistency and simplify maintenance.

---

# Audit Tables

Every important action is logged.

```
AuditLogs

↓

UserID

↓

Module

↓

Action

↓

OldValue

↓

NewValue

↓

Timestamp
```

Audit logs support compliance, troubleshooting, and security investigations.

---

# Soft Deletes

ERP systems rarely delete records.

Instead:

```
IsActive = FALSE

DeletedAt

DeletedBy
```

This preserves historical data and supports auditing.

---

# Status History

Instead of storing only the current status:

```
Purchase Order

Approved
```

Maintain a history:

```
Draft

↓

Submitted

↓

Approved

↓

Ordered

↓

Received

↓

Closed
```

This enables workflow tracking and reporting.

---

# Slowly Changing Dimensions (SCD)

Master data evolves over time.

Example:

Employee:

```
Department

Marketing

↓

Sales
```

Instead of overwriting the value, some analytical systems preserve historical versions using SCD techniques.

This allows reports such as:

- Employee count by department last year
- Historical salary analysis
- Department transfers over time

---

# Multi-Branch Architecture

Global organisations operate multiple branches.

```
Branch

↓

Departments

↓

Employees

↓

Sales

↓

Inventory
```

Every transactional record references a branch, enabling branch-level reporting and security.

---

# Multi-Tenant Architecture

Cloud ERP platforms often serve multiple companies.

```
Tenant

↓

Branches

↓

Modules

↓

Transactions
```

Every table includes:

```
TenantID
```

ensuring complete isolation between customers.

---

# Partitioning Strategy

Large ERP systems generate enormous transactional datasets.

Partition tables by:

- Financial Year
- Accounting Period
- Branch
- Company
- Region

Examples:

- Journal Entries
- Sales Orders
- Purchase Orders
- Inventory Movements
- Payroll

Partitioning improves performance, maintenance, and archival processes.

---

# Performance Considerations

Enterprise ERP systems benefit from:

- Indexing all Foreign Keys
- Composite indexes for common reports
- Materialized or indexed views (DBMS-dependent)
- Read replicas for analytics
- Batch processing for payroll and financial closing
- Optimised execution plans
- Archiving completed transactions
- Caching frequently accessed reference data

---

# Security Considerations

ERP databases store highly sensitive business information.

Recommended practices:

- Role-Based Access Control (RBAC)
- Row-level security where supported
- Encryption of payroll and financial data
- Multi-factor authentication
- Audit logging
- Approval workflows
- Database backups and disaster recovery plans

---

# Enterprise Architecture Notes

## CQRS

Separate command operations (creating orders) from query operations (dashboards and reports).

---

## Event Sourcing

Store business events such as:

- Sales Order Created
- Invoice Approved
- Payment Received
- Payroll Processed

---

## Change Data Capture (CDC)

Changes can automatically trigger:

- BI dashboards
- Data warehouses
- Search indexes
- Integration with external systems

---

## Read Replicas

Reporting workloads should use read replicas rather than the primary transactional database.

---

## Microservices

Large ERP platforms often separate modules into services:

- HR Service
- Finance Service
- Inventory Service
- CRM Service
- Manufacturing Service

Each service may own its own database while communicating through APIs or events.

---

## Polyglot Persistence

Not every module requires the same database technology.

Example:

| Module | Storage |
|---------|---------|
| Finance | Relational Database |
| Search | Elasticsearch/OpenSearch |
| Sessions | Redis |
| Documents | Object Storage |
| Analytics | Data Warehouse |

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB |
|---------|:-----:|:----------:|:----------:|:------:|:--------:|
| Foreign Keys | ✅ | ✅ | ✅ | ✅ | ✅ |
| Transactions | ✅ | ✅ | ✅ | ✅ | ✅ |
| Recursive CTE | ✅ | ✅ | ✅ | ✅ | ✅ |
| Partitioning | ✅ | ✅ | ✅ | ✅ | ✅ |
| Window Functions | ✅ | ✅ | ✅ | ✅ | ✅ |

---

# 💡 Did You Know?

Modern ERP systems rarely operate as a single monolithic application. While many began as monoliths, large enterprises often evolve them into modular or service-oriented architectures. Even then, the underlying relational database principles—keys, relationships, constraints, transactions, and data integrity—remain fundamental.

---

# Interview Questions

1. Why do ERP systems separate Master Data and Transaction Data?
2. What is the Master–Detail pattern?
3. Why are audit logs essential?
4. What is a Slowly Changing Dimension (SCD)?
5. Why use lookup tables?
6. Why partition large transactional tables?
7. What is multi-tenancy?
8. Why is RBAC critical in ERP systems?
9. How does CQRS improve scalability?
10. Why might an ERP use multiple storage technologies?

---

# Hands-on Exercises

### Exercise 1

Draw the complete ERP ER diagram.

---

### Exercise 2

Design tables for:

- Employees
- Customers
- Products
- Sales Orders
- Purchase Orders
- Inventory
- Journal Entries

---

### Exercise 3

Design the workflow for:

Customer → Sales Order → Invoice → Payment → Journal Entry

Explain how data flows between modules.

---

### Exercise 4

Create lookup tables for:

- Payment Methods
- Tax Codes
- Units of Measure
- Order Status
- Departments

---

### Exercise 5

Extend the ERP with:

- Quality Control
- Maintenance Management
- Fleet Management
- Budget Planning
- Business Intelligence

Identify the additional entities and relationships.

---

# Summary

This case study demonstrated how an Enterprise Resource Planning (ERP) system unifies multiple business domains into a single relational database ecosystem. Alongside core SQL concepts, you explored master data, transaction data, master–detail patterns, audit logging, status history, soft deletes, Slowly Changing Dimensions, partitioning, multi-branch and multi-tenant architectures, and modern enterprise design patterns.

---

# Related Topics

### Previous Lessons

- 03.08.09.01 — Student Management System
- 03.08.09.02 — E-Commerce Platform
- 03.08.09.03 — Hospital Management System
- 03.08.09.04 — Human Resource Management System (HRMS)
- 03.08.09.05 — Banking System
- 03.08.09.06 — Social Media Platform

### Next Lesson

**03.08.09.08 — Real-World Relationship Case Study: Airline Reservation System**