---
title: "03.08.09.09 - Real-World Relationship Case Study: Food Delivery Platform"
description: "Learn how enterprise food delivery platforms like Uber Eats, DoorDash, Deliveroo, Swiggy, and Zomato are designed using relational databases. Explore restaurants, menus, orders, delivery partners, live tracking, payments, promotions, and modern enterprise architecture."
chapter: 3
section: 3.8.9.9
category: Core SQL Concepts
difficulty: Advanced
readingTime: 110 min
lastUpdated: 2026-07-27
---

# 03.08.09.09 Food Delivery Platform

## Learning Objectives

After completing this lesson, you will be able to:

- Design an enterprise food delivery database
- Model restaurant and menu relationships
- Understand order lifecycle management
- Design delivery partner workflows
- Handle live order tracking
- Learn location-aware database design
- Explore scalable marketplace architecture
- Apply enterprise database patterns used by modern delivery platforms

---

# Introduction

Modern food delivery platforms connect three different parties:

- Customers
- Restaurants
- Delivery Partners

Unlike traditional e-commerce systems, food delivery adds several real-time challenges:

- Live driver tracking
- Restaurant preparation
- Delivery assignment
- ETA prediction
- Dynamic pricing
- High transaction volume

Examples include:

- Uber Eats
- DoorDash
- Deliveroo
- Swiggy
- Zomato
- Foodpanda

These platforms rely heavily on relational databases for transactional consistency while using caches, search indexes, and streaming systems for real-time experiences.

---

# Business Requirements

The platform should support:

- Customers
- Restaurants
- Branches
- Menus
- Categories
- Food Items
- Orders
- Order Items
- Delivery Partners
- Live Tracking
- Payments
- Coupons
- Ratings
- Reviews
- Notifications
- Wallets
- Refunds

---

# Step 1 — Identify Entities

| Entity | Purpose |
|----------|----------|
| Customers | Customer accounts |
| Restaurants | Restaurant information |
| RestaurantBranches | Physical branches |
| MenuCategories | Starters, Drinks, Desserts |
| MenuItems | Individual food items |
| Orders | Customer orders |
| OrderItems | Ordered products |
| DeliveryPartners | Riders |
| Deliveries | Delivery assignments |
| Payments | Payment records |
| Coupons | Discount codes |
| Wallets | Customer wallet |
| Reviews | Ratings & reviews |
| Notifications | Alerts |
| StatusHistory | Order timeline |
| AuditLogs | Activity history |

---

# Step 2 — Relationship Analysis

| Parent | Child | Relationship |
|----------|--------|-------------|
| Restaurant → Branches | One-to-Many |
| Branch → MenuItems | One-to-Many |
| Customer → Orders | One-to-Many |
| Order → OrderItems | One-to-Many |
| Order → Payments | One-to-One |
| Order → Delivery | One-to-One |
| DeliveryPartner → Deliveries | One-to-Many |
| Customer → Reviews | One-to-Many |
| Restaurant → Reviews | One-to-Many |
| Customers ↔ Coupons | Many-to-Many |
| MenuItems ↔ Categories | Many-to-Many |

---

# Enterprise ER Diagram

```text
Customers
     │
     ├──────── Orders
     │             │
     │             ├──────── OrderItems
     │             ├──────── Payments
     │             ├──────── Deliveries
     │             └──────── StatusHistory
     │
     ├──────── Reviews
     ├──────── Wallet
     └──────── Notifications

Restaurants
      │
      ├──────── RestaurantBranches
      │                │
      │                └──────── MenuItems
      │                         │
      │                         ▼
      │                  MenuCategories
      │
      └──────── Reviews

DeliveryPartners
        │
        ▼
   Deliveries

Coupons

AuditLogs
```

---

# Relationship Breakdown

## One-to-One

```
Order

↓

Payment
```

Each completed order has one payment record.

---

```
Order

↓

Delivery
```

Each order is assigned to one delivery job.

---

## One-to-Many

```
Customer

↓

Orders
```

Customers can place many orders.

---

```
Restaurant

↓

Branches
```

A restaurant chain operates multiple branches.

---

```
Branch

↓

Menu Items
```

Each branch manages its own menu and availability.

---

```
Delivery Partner

↓

Deliveries
```

Drivers complete many deliveries over time.

---

## Many-to-Many

### Customers ↔ Coupons

```
Customers

↓

CustomerCoupons

↓

Coupons
```

Customers may receive multiple coupons.

Coupons can be issued to many customers.

---

### MenuItems ↔ Categories

```
MenuItems

↓

MenuItemCategories

↓

Categories
```

One food item may belong to multiple categories.

---

# Master–Detail Pattern

Orders use the classic Master–Detail design.

```
Orders

↓

OrderItems
```

Example

```
Order

↓

Burger

Fries

Soft Drink
```

Every order contains one or more order items.

---

# Order Lifecycle

Each order moves through several stages.

```text
Cart

↓

Placed

↓

Restaurant Accepted

↓

Preparing

↓

Ready for Pickup

↓

Picked Up

↓

On the Way

↓

Delivered
```

Alternative outcomes:

```text
Placed

↓

Cancelled
```

or

```text
Placed

↓

Payment Failed
```

A `StatusHistory` table stores every state transition.

---

# Delivery Assignment

When an order is ready:

```text
Restaurant

↓

Find Nearby Drivers

↓

Assign Driver

↓

Accept Delivery

↓

Pickup

↓

Deliver
```

The delivery partner assignment is stored separately from the order, allowing reassignment if necessary.

---

# Live Location Tracking

Delivery partners periodically send GPS coordinates.

Example:

| DeliveryID | Latitude | Longitude | Timestamp |
|------------|----------|-----------|-----------|
| 5001 | 51.5073 | -0.1277 | 18:10:15 |
| 5001 | 51.5082 | -0.1265 | 18:11:05 |

For scalability, high-frequency GPS data is often stored in specialised systems rather than the main transactional database.

---

# Lookup Tables

Common lookup tables include:

- Order Status
- Payment Methods
- Cuisine Types
- Vehicle Types
- Delivery Status
- Coupon Types
- Notification Types
- Restaurant Categories

---

# Soft Deletes

Restaurants and menu items are rarely removed permanently.

Instead:

```text
IsActive = FALSE

DeletedAt

DeletedBy
```

Historical orders continue to reference the original records.

---

# Audit Tables

Important events are recorded.

```text
Order Created

↓

Payment Completed

↓

Restaurant Accepted

↓

Driver Assigned

↓

Delivered

↓

Refund Issued
```

Audit logs support investigations and customer support.

---

# Slowly Changing Dimensions (SCD)

Restaurant information changes over time.

Examples:

- Delivery fees
- Operating hours
- Tax rates
- Cuisine categories

Historical reporting often requires preserving previous values rather than overwriting them.

---

# Multi-Tenant Architecture

A delivery platform may serve multiple brands or franchise groups.

```text
Tenant

↓

Restaurants

↓

Branches

↓

Orders
```

Each tenant's data remains isolated using a `TenantID`.

---

# Partitioning Strategy

Large delivery platforms generate millions of orders.

Partition large tables by:

- Month
- Year
- City
- Region

Examples:

- Orders
- Deliveries
- Payments
- Notifications

---

# Performance Considerations

Enterprise food delivery systems benefit from:

- Indexes on CustomerID, RestaurantID, DriverID and OrderDate
- Geospatial indexes (where supported) for nearby restaurant and driver searches
- Read replicas for customer-facing queries
- Caching menus and restaurant information
- Partitioning historical order data
- Background processing for notifications and receipts

---

# Security Considerations

Protect customer and restaurant data by:

- Encrypting personal information
- Using secure payment gateways
- Applying Role-Based Access Control (RBAC)
- Recording audit logs
- Limiting access to delivery partner information
- Detecting suspicious account activity

---

# Enterprise Architecture Notes

## CQRS

Separate order creation from order tracking and reporting.

---

## Event Sourcing

Common events include:

- Order Placed
- Payment Received
- Restaurant Accepted
- Driver Assigned
- Order Delivered
- Refund Processed

---

## Change Data Capture (CDC)

Database changes automatically update:

- Customer notifications
- Restaurant dashboards
- Business analytics
- Loyalty programmes

---

## Read Replicas

Customer browsing and restaurant searches generate many more reads than writes.

Read replicas improve responsiveness.

---

## Caching

Frequently cached data includes:

- Restaurant listings
- Menus
- Popular dishes
- Coupons
- Estimated delivery times

---

## Microservices

Enterprise platforms often split into:

- Customer Service
- Restaurant Service
- Order Service
- Delivery Service
- Payment Service
- Notification Service
- Recommendation Service

Each service can own its own database while communicating through APIs or events.

---

## Polyglot Persistence

Different workloads may use different storage technologies.

| Module | Storage |
|---------|---------|
| Orders | Relational Database |
| Search | Elasticsearch/OpenSearch |
| Live Driver Locations | Geospatial Database |
| Cache | Redis |
| Images | Object Storage |
| Analytics | Data Warehouse |

---

# Common Production Challenges

## Preventing Duplicate Orders

A customer should not accidentally create the same order multiple times due to repeated button clicks or network retries.

---

## Driver Reassignment

If a driver declines or cancels a delivery, another driver must be assigned without losing order information.

---

## Restaurant Availability

Restaurants may temporarily pause orders because of:

- High demand
- Staff shortages
- Maintenance
- Public holidays

The system must update availability without affecting historical data.

---

## Dynamic Delivery Fees

Delivery charges may change based on:

- Distance
- Weather
- Traffic
- Peak demand
- Driver availability

---

## Partial Refunds

An order may require:

- Full refund
- Item refund
- Delivery fee refund

Financial records should remain auditable.

---

## Real-Time Notifications

Customers expect updates such as:

- Order accepted
- Driver on the way
- Delivered

These are typically processed asynchronously.

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

Many food delivery platforms separate **order processing** from **live tracking**. Orders are stored in a transactional relational database, while continuously changing GPS coordinates are often handled by specialised geospatial services or streaming systems to reduce load on the primary database.

---

# Interview Questions

1. Why is `OrderItems` a Master–Detail table?
2. Why should delivery assignments be stored separately from orders?
3. Why use a `StatusHistory` table?
4. Why are geospatial indexes useful?
5. Why should menu items use soft deletes?
6. How can duplicate orders be prevented?
7. Why cache restaurant menus?
8. Why are GPS updates often stored outside the primary transactional database?

---

# Hands-on Exercises

### Exercise 1

Draw the complete ER diagram for the food delivery platform.

---

### Exercise 2

Design tables for:

- Customers
- Restaurants
- MenuItems
- Orders
- OrderItems
- Deliveries
- Payments

---

### Exercise 3

Design the workflow:

Customer → Order → Restaurant → Driver → Delivery → Payment

Identify where transactions should be used.

---

### Exercise 4

Create lookup tables for:

- Cuisine Types
- Order Status
- Payment Methods
- Vehicle Types
- Coupon Types

---

### Exercise 5

Extend the platform by adding:

- Scheduled deliveries
- Group ordering
- Subscription plans
- Grocery delivery
- Drone or autonomous vehicle delivery
- AI-based restaurant recommendations

Identify the new entities and relationships.

---

# Summary

This case study demonstrated how enterprise food delivery platforms combine relational database design with real-time operational workflows. You explored order management, delivery assignment, live tracking, master–detail patterns, status history, geospatial considerations, caching, and modern enterprise architecture techniques for building scalable marketplace applications.

---

# Related Topics

### Previous Lessons

- 03.08.09.01 — Student Management System
- 03.08.09.02 — E-Commerce Platform
- 03.08.09.03 — Hospital Management System
- 03.08.09.04 — Human Resource Management System (HRMS)
- 03.08.09.05 — Banking System
- 03.08.09.06 — Social Media Platform
- 03.08.09.07 — Enterprise Resource Planning (ERP) System
- 03.08.09.08 — Hotel Reservation System

### Next Lesson

**03.08.09.10 — Real-World Relationship Case Study: Airline Reservation System**