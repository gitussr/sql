---
title: "03.08.09.11 - Real-World Relationship Case Study: Logistics & Supply Chain Management System"
description: "Learn how enterprise logistics and supply chain management systems are designed using relational databases. Explore shipments, warehouses, inventory movement, transportation, fleet management, order fulfilment, tracking events, and enterprise architecture."
chapter: 3
section: 3.8.9.11
category: Core SQL Concepts
difficulty: Advanced
readingTime: 130 min
lastUpdated: 2026-07-27
---

# 03.08.09.11 Logistics & Supply Chain Management System

## Learning Objectives

After completing this lesson, you will be able to:

- Design an enterprise logistics database
- Model warehouses and inventory movement
- Understand shipment lifecycle management
- Track goods across multiple locations
- Learn transportation and fleet relationships
- Design global supply chain databases
- Understand enterprise logistics architecture

---

# Introduction

A Logistics & Supply Chain Management (SCM) System controls the movement of products from suppliers to customers.

Unlike an ERP system, which focuses on business processes, an SCM system focuses on **physical movement**.

It answers questions such as:

- Where is the shipment now?
- Which warehouse contains this product?
- Which truck is carrying it?
- When will it arrive?
- Which customer ordered it?
- Which supplier originally shipped it?

Modern logistics platforms include:

- DHL
- FedEx
- UPS
- Amazon Logistics
- Maersk
- Blue Dart
- Delhivery

A logistics platform combines:

- Inventory
- Warehouses
- Transportation
- Fleet Management
- Shipment Tracking
- Customs
- Delivery

---

# Business Requirements

The company should manage:

- Suppliers
- Customers
- Warehouses
- Inventory
- Products
- Shipments
- Shipment Items
- Vehicles
- Drivers
- Routes
- Delivery Hubs
- Delivery Status
- Tracking Events
- Purchase Orders
- Sales Orders
- Returns
- Customs Documentation
- Audit Logs

---

# Step 1 — Identify Entities

| Entity | Purpose |
|---------|----------|
| Suppliers | Product suppliers |
| Customers | Customers |
| Products | Inventory items |
| Warehouses | Storage facilities |
| WarehouseInventory | Current stock |
| InventoryTransactions | Stock movement |
| Shipments | Shipment records |
| ShipmentItems | Shipment contents |
| Vehicles | Trucks, Vans, Ships |
| Drivers | Delivery personnel |
| Routes | Delivery routes |
| DeliveryHubs | Regional hubs |
| TrackingEvents | Shipment tracking |
| PurchaseOrders | Incoming orders |
| SalesOrders | Customer orders |
| Returns | Returned goods |
| CustomsDocuments | International shipping |
| AuditLogs | Activity history |

---

# Step 2 — Relationship Analysis

| Parent | Child | Relationship |
|----------|--------|-------------|
| Supplier → Products | One-to-Many |
| Warehouse → Inventory | One-to-Many |
| Shipment → ShipmentItems | One-to-Many |
| Shipment → TrackingEvents | One-to-Many |
| Vehicle → Shipments | One-to-Many |
| Driver → Shipments | One-to-Many |
| Customer → SalesOrders | One-to-Many |
| PurchaseOrder → Shipments | One-to-Many |
| Products ↔ Warehouses | Many-to-Many |
| Shipments ↔ DeliveryHubs | Many-to-Many |

---

# Enterprise ER Diagram

```text
Suppliers
     │
     ▼
Products
     │
     ▼
WarehouseInventory
     ▲
Warehouses

Customers
     │
     ▼
SalesOrders
     │
     ▼
Shipments
     │
     ├──────── ShipmentItems
     ├──────── TrackingEvents
     ├──────── Returns
     └──────── CustomsDocuments

Vehicles
     │
Drivers
     │
     ▼
Shipments

DeliveryHubs

AuditLogs
```

---

# Relationship Breakdown

## One-to-One

```
Shipment

↓

Customs Declaration
```

(International shipments only.)

---

## One-to-Many

```
Warehouse

↓

Inventory
```

Each warehouse stores thousands of products.

---

```
Shipment

↓

Tracking Events
```

Each shipment generates multiple tracking updates.

---

```
Vehicle

↓

Shipments
```

One vehicle completes many deliveries over time.

---

## Many-to-Many

### Products ↔ Warehouses

```
Products

↓

WarehouseInventory

↓

Warehouses
```

A product may exist in many warehouses.

Each warehouse stores many products.

---

### Shipments ↔ Delivery Hubs

```
Shipments

↓

ShipmentRoute

↓

DeliveryHubs
```

One shipment may travel through several hubs.

Each hub processes thousands of shipments daily.

---

# Shipment Lifecycle

Every shipment progresses through a series of stages.

```text
Order Created

↓

Packed

↓

Dispatched

↓

In Transit

↓

Regional Hub

↓

Out For Delivery

↓

Delivered
```

Alternative paths:

```text
In Transit

↓

Delayed
```

or

```text
Delivered

↓

Returned
```

Maintain a `StatusHistory` or `TrackingEvents` table to preserve every status change.

---

# Inventory Movement

Inventory is constantly moving.

```text
Supplier

↓

Warehouse

↓

Regional Hub

↓

Delivery Vehicle

↓

Customer
```

Instead of updating stock quantities directly, enterprise systems record every movement.

Example:

| Transaction | Quantity |
|-------------|----------|
| Goods Received | +100 |
| Customer Order | -5 |
| Stock Transfer | -20 |
| Warehouse Arrival | +20 |

The current inventory is derived from these transactions.

---

# Tracking Events

Tracking events provide visibility throughout the shipment journey.

Example:

| Shipment | Status | Location | Timestamp |
|----------|---------|----------|-----------|
| SH1001 | Packed | London | 09:10 |
| SH1001 | Dispatched | London Hub | 10:25 |
| SH1001 | In Transit | Birmingham | 15:45 |
| SH1001 | Delivered | Manchester | 18:20 |

Applications use these events to display real-time tracking.

---

# Warehouse Network

Large logistics companies operate multiple warehouses.

```text
Country

↓

Region

↓

Warehouse

↓

Storage Zone

↓

Shelf

↓

Bin
```

This hierarchy enables precise inventory location tracking.

---

# Fleet Management

Vehicles require separate management.

```
Vehicle

↓

Maintenance

↓

Fuel Logs

↓

Driver Assignment

↓

GPS Tracking
```

Fleet data should not be mixed directly with shipment records.

---

# Route Optimisation

A delivery route may contain multiple stops.

```text
Vehicle

↓

Route

↓

Stop 1

↓

Stop 2

↓

Stop 3
```

Route optimisation reduces:

- Fuel consumption
- Delivery time
- Vehicle wear
- Operating costs

---

# Master–Detail Pattern

Shipments follow the Master–Detail pattern.

```text
Shipment

↓

ShipmentItems
```

Each shipment contains multiple products with different quantities.

---

# Lookup Tables

Common lookup tables include:

- Shipment Status
- Vehicle Types
- Warehouse Types
- Package Types
- Units of Measure (UOM)
- Countries
- Regions
- Delivery Priority

---

# Soft Deletes

Shipment records should never be permanently deleted.

Instead:

```text
Cancelled

CancelledBy

CancelledAt
```

Historical shipment information remains available for reporting and compliance.

---

# Audit Logs

Record important events such as:

```text
Shipment Created

↓

Inventory Updated

↓

Driver Assigned

↓

Route Changed

↓

Delivery Completed
```

Audit logs support investigations and operational accountability.

---

# Slowly Changing Dimensions (SCD)

Warehouse and supplier information changes over time.

Examples:

- Warehouse capacity
- Supplier addresses
- Delivery regions
- Product classifications

Analytical systems preserve historical versions for reporting.

---

# Multi-Warehouse Architecture

Enterprise organisations operate multiple warehouses.

```text
Company

↓

Region

↓

Warehouse

↓

Inventory

↓

Shipments
```

Every inventory record references its warehouse.

---

# Performance Considerations

Large logistics systems benefit from:

- Indexes on ShipmentID, WarehouseID, ProductID
- Composite indexes for tracking queries
- Partitioning shipment history by year
- Caching frequently accessed tracking information
- Read replicas for dashboards
- Background processing for notifications

---

# Common Production Challenges

## Lost Shipments

A shipment may disappear between hubs.

Tracking events help identify the last known location.

---

## Inventory Mismatch

Physical stock may differ from database records.

Regular stock audits and inventory adjustments are required.

---

## Route Changes

Road closures or weather may require dynamic route updates.

Shipment history should record all changes.

---

## Partial Deliveries

An order containing multiple products may be delivered in several shipments.

The database must preserve the relationship between orders and shipments.

---

## Reverse Logistics

Customers may return products.

The system must support:

```text
Customer

↓

Return Request

↓

Inspection

↓

Warehouse

↓

Refund
```

---

## Cross-Border Shipping

International shipments require:

- Customs declarations
- Duties
- Taxes
- Country-specific compliance

---

# Enterprise Architecture Notes

## CQRS

Separate shipment updates (writes) from tracking queries (reads).

---

## Event Sourcing

Examples:

- Shipment Created
- Package Loaded
- Vehicle Departed
- Arrived at Hub
- Out for Delivery
- Delivered

---

## Change Data Capture (CDC)

Tracking events automatically update:

- Customer notifications
- Delivery dashboards
- Analytics
- Warehouse systems

---

## Read Replicas

Tracking pages receive significantly more read requests than write requests.

Read replicas improve scalability.

---

## Polyglot Persistence

| Module | Storage |
|---------|---------|
| Orders & Shipments | Relational Database |
| GPS Tracking | Time-Series / Geospatial Database |
| Search | Elasticsearch/OpenSearch |
| Cache | Redis |
| Documents | Object Storage |
| Analytics | Data Warehouse |

---

## IoT Integration

Modern logistics platforms collect data from:

- GPS devices
- RFID scanners
- Barcode scanners
- Temperature sensors
- Smart containers

These devices continuously generate tracking events stored in specialised systems and integrated with the transactional database.

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB |
|---------|:-----:|:----------:|:----------:|:------:|:--------:|
| Transactions | ✅ | ✅ | ✅ | ✅ | ✅ |
| Foreign Keys | ✅ | ✅ | ✅ | ✅ | ✅ |
| Partitioning | ✅ | ✅ | ✅ | ✅ | ✅ |
| Window Functions | ✅ | ✅ | ✅ | ✅ | ✅ |
| Spatial Extensions | Limited | Excellent (PostGIS) | Good | Good | Limited |

---

# 💡 Did You Know?

Global logistics companies often process **millions of tracking events every day**. Instead of updating a single shipment record repeatedly, they append new tracking events to a timeline. This preserves the complete delivery history, simplifies auditing, and makes it easier to analyse delays and operational performance.

---

# Interview Questions

1. Why should inventory movement be stored as transactions rather than simply updating stock quantities?
2. Why is `ShipmentItems` a Master–Detail table?
3. Why are tracking events stored separately from shipments?
4. What is reverse logistics?
5. Why is a multi-warehouse design important?
6. Why should shipment records use soft deletes?
7. How do read replicas improve tracking performance?
8. Why are IoT devices important in modern logistics?

---

# Hands-on Exercises

### Exercise 1

Draw the complete ER diagram for the logistics and supply chain system.

---

### Exercise 2

Design tables for:

- Warehouses
- Inventory
- Shipments
- ShipmentItems
- Vehicles
- Drivers
- TrackingEvents

---

### Exercise 3

Design the workflow:

Supplier → Warehouse → Shipment → Delivery Hub → Customer

Identify where transactions and tracking events should be recorded.

---

### Exercise 4

Create lookup tables for:

- Shipment Status
- Vehicle Types
- Package Types
- Delivery Priority
- Warehouse Types

---

### Exercise 5

Extend the platform by adding:

- Cold chain logistics
- International freight forwarding
- Container management
- Warehouse robotics
- Predictive maintenance
- AI-based route optimisation

Identify the additional entities and relationships.

---

# Summary

This case study demonstrated how enterprise logistics and supply chain management systems model the movement of goods across warehouses, vehicles, delivery hubs, and customers. You explored inventory transactions, shipment lifecycles, tracking events, fleet management, multi-warehouse architecture, reverse logistics, IoT integration, and enterprise database design patterns used in global logistics platforms.

---

# Related Topics

### Previous Lessons

- 03.08.09.07 — Enterprise Resource Planning (ERP) System
- 03.08.09.09 — Food Delivery Platform
- 03.08.09.10 — Airline Reservation System

### Next Lesson

**03.08.09.12 — Real-World Relationship Case Study: Manufacturing Execution System (MES)**