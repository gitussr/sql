---
title: "03.08.09.08 - Real-World Relationship Case Study: Hotel Reservation System"
description: "Learn how enterprise hotel reservation systems are designed using relational databases. Explore reservations, room inventory, seasonal pricing, housekeeping, guests, billing, concurrency control, and enterprise architecture."
chapter: 3
section: 3.8.9.8
category: Core SQL Concepts
difficulty: Advanced
readingTime: 100 min
lastUpdated: 2026-07-27
---

# 03.08.09.08 Hotel Reservation System

## Learning Objectives

After completing this lesson, you will be able to:

- Design an enterprise hotel reservation database
- Model room inventory and availability
- Handle reservation conflicts
- Understand booking lifecycle management
- Apply Master–Detail patterns
- Design scalable multi-property hotel systems
- Learn database techniques used by Booking.com, Marriott, Hilton and Airbnb (hotel operations)

---

# Introduction

A Hotel Reservation System manages the complete guest journey—from booking a room to check-out and billing.

Modern hotel systems support:

- Multiple hotel properties
- Room inventory
- Online reservations
- Walk-in guests
- Seasonal pricing
- Housekeeping
- Billing
- Payments
- Loyalty programmes
- Restaurant and spa services

The biggest challenge is ensuring that **the same room cannot be booked twice for overlapping dates**.

Unlike social media systems, hotel reservation systems prioritise:

- Data consistency
- Concurrency control
- Inventory management
- Real-time availability

---

# Business Requirements

The hotel chain should support:

- Multiple hotels
- Room categories
- Individual rooms
- Guests
- Reservations
- Check-in / Check-out
- Housekeeping
- Billing
- Payments
- Promotions
- Loyalty members
- Additional hotel services
- Staff management

---

# Step 1 — Identify Entities

| Entity | Purpose |
|---------|----------|
| Hotels | Hotel properties |
| Rooms | Individual rooms |
| RoomTypes | Deluxe, Suite, Standard |
| Guests | Customer information |
| Reservations | Bookings |
| ReservationRooms | Rooms booked |
| Payments | Payment records |
| Invoices | Billing |
| Housekeeping | Cleaning schedule |
| Staff | Hotel employees |
| Services | Spa, Restaurant, Laundry |
| ReservationServices | Additional services |
| LoyaltyMembers | Rewards programme |
| SeasonalRates | Dynamic pricing |
| AuditLogs | Activity history |
| StatusHistory | Reservation lifecycle |

---

# Step 2 — Relationship Analysis

| Parent | Child | Relationship |
|----------|--------|-------------|
| Hotel → Rooms | One-to-Many |
| RoomType → Rooms | One-to-Many |
| Guest → Reservations | One-to-Many |
| Reservation → ReservationRooms | One-to-Many |
| Reservation → Payments | One-to-Many |
| Reservation → Invoices | One-to-One |
| Reservation → Services | Many-to-Many |
| Staff → Housekeeping | One-to-Many |
| Room → Housekeeping | One-to-Many |
| Guest → LoyaltyMember | One-to-One |

---

# Enterprise ER Diagram

```text
Hotels
   │
   ├──────── Rooms ───────── Housekeeping
   │            │
   │            ▼
   │       RoomTypes
   │
Guests
   │
   ▼
Reservations
      │
      ├──────── ReservationRooms
      ├──────── Payments
      ├──────── Invoice
      ├──────── StatusHistory
      └──────── ReservationServices
                      │
                      ▼
                   Services

Guests
     │
     ▼
LoyaltyMembers

AuditLogs
```

---

# Relationship Breakdown

## One-to-One

```
Reservation

↓

Invoice
```

Each completed reservation produces one invoice.

---

```
Guest

↓

Loyalty Member
```

Guests may optionally enrol in the loyalty programme.

---

## One-to-Many

```
Hotel

↓

Rooms
```

A hotel contains many rooms.

---

```
Guest

↓

Reservations
```

Guests can make multiple reservations.

---

```
Reservation

↓

Payments
```

Reservations may have deposits and final payments.

---

```
Room

↓

Housekeeping
```

Cleaning records belong to one room.

---

## Many-to-Many

### Reservations ↔ Rooms

```
Reservations

↓

ReservationRooms

↓

Rooms
```

One reservation may include multiple rooms.

One room appears in many reservations over time.

---

### Reservations ↔ Services

```
Reservations

↓

ReservationServices

↓

Services
```

Guests can purchase:

- Breakfast
- Spa
- Laundry
- Airport Transfer
- Parking

---

# Reservation Lifecycle

Every booking passes through several stages.

```text
Search

↓

Booked

↓

Confirmed

↓

Checked-In

↓

Checked-Out

↓

Completed
```

Possible alternatives:

```text
Booked

↓

Cancelled
```

or

```text
Booked

↓

No Show
```

Instead of storing only the current status, maintain a **StatusHistory** table.

---

# Room Availability

The most important business rule is:

> **A room cannot be reserved for overlapping dates.**

Example:

| Room | Check-In | Check-Out |
|------|----------|-----------|
| 205 | 1 Aug | 5 Aug |
| 205 | 3 Aug | ❌ Conflict |

The application checks for overlapping reservations before confirming a booking.

---

# Concurrency Control

Imagine two users booking Room 205 at exactly the same time.

Without proper transaction handling:

```
User A

↓

Room Available

↓

Book
```

```
User B

↓

Room Available

↓

Book
```

Both users could reserve the same room.

Enterprise systems prevent this by using:

- Database transactions
- Row-level locking (where supported)
- Appropriate transaction isolation levels
- Retry mechanisms when conflicts occur

---

# Master–Detail Pattern

Reservations use the Master–Detail pattern.

```
Reservation

↓

ReservationRooms
```

Invoices also follow this design.

```
Invoice

↓

InvoiceItems
```

Examples of invoice items:

- Room Charges
- Breakfast
- Laundry
- Spa
- Taxes

---

# Seasonal Pricing

Hotels rarely use one fixed room price.

Pricing depends on:

- Holiday season
- Weekends
- Demand
- Local events
- Room category

Example table:

| Season | Standard | Deluxe |
|----------|---------|---------|
| Low | £90 | £140 |
| Peak | £180 | £260 |

---

# Lookup Tables

Common lookup tables include:

- Room Types
- Reservation Status
- Payment Methods
- Guest Types
- Countries
- Currency
- Service Types
- Tax Rates

---

# Soft Deletes

Reservations should not normally be deleted.

Instead:

```
Cancelled

CancelledBy

CancelledAt
```

This preserves booking history and supports reporting and dispute resolution.

---

# Audit Tables

Important actions are logged.

```
Reservation Created

↓

Payment Received

↓

Room Changed

↓

Check-In

↓

Check-Out

↓

Cancellation
```

Audit logs help investigate customer disputes and operational issues.

---

# Slowly Changing Dimensions (SCD)

Room prices and hotel details change over time.

Rather than overwriting historical values, analytical systems may preserve previous versions.

Examples:

- Historical room rates
- Previous hotel classifications
- Loyalty tier history

This enables accurate historical reporting.

---

# Multi-Property Architecture

Hotel groups operate multiple locations.

```
Hotel Group

↓

Hotels

↓

Rooms

↓

Reservations
```

Every reservation belongs to a hotel property.

Reports can then be generated by:

- Property
- City
- Country
- Region

---

# Performance Considerations

Large hotel platforms benefit from:

- Indexes on RoomID, HotelID, ReservationDate
- Composite indexes for availability searches
- Partitioning reservation history by year
- Caching room availability
- Read replicas for reporting
- Efficient pagination of guest history

---

# Security Considerations

Hotel systems store personal and payment information.

Recommended practices:

- Encrypt guest information.
- Never store sensitive payment data insecurely.
- Implement RBAC for hotel staff.
- Record administrative changes in audit logs.
- Regularly back up reservation data.

---

# Enterprise Architecture Notes

## CQRS

Reservation creation (writes) can be separated from availability searches (reads).

---

## Event Sourcing

Important events include:

- Reservation Created
- Payment Completed
- Check-In
- Room Changed
- Check-Out
- Reservation Cancelled

---

## Change Data Capture (CDC)

Reservation changes can automatically update:

- Revenue dashboards
- Housekeeping schedules
- Customer notification systems
- Business analytics

---

## Read Replicas

Searching room availability generates significantly more reads than writes.

Read replicas improve search performance without affecting reservation processing.

---

## Caching

Frequently cached data includes:

- Room availability
- Hotel information
- Seasonal pricing
- Popular destinations

---

## Microservices

Enterprise hotel platforms often separate:

- Reservation Service
- Billing Service
- Housekeeping Service
- Loyalty Service
- Payment Service
- Notification Service

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB |
|---------|:-----:|:----------:|:----------:|:------:|:--------:|
| Transactions | ✅ | ✅ | ✅ | ✅ | ✅ |
| Foreign Keys | ✅ | ✅ | ✅ | ✅ | ✅ |
| Row-Level Locking | ✅ | ✅ | ✅ | ✅ | ✅ |
| Partitioning | ✅ | ✅ | ✅ | ✅ | ✅ |
| Window Functions | ✅ | ✅ | ✅ | ✅ | ✅ |

---

# 💡 Did You Know?

Large hotel booking platforms rarely calculate room availability by scanning every reservation each time. Instead, they combine indexed reservation data, caching, and availability rules to return search results quickly while relying on database transactions to prevent double bookings during confirmation.

---

# Interview Questions

1. Why is `ReservationRooms` a Junction Table?
2. Why is concurrency control important in hotel booking systems?
3. Why shouldn't cancelled reservations be deleted?
4. What is the purpose of a `StatusHistory` table?
5. Why are seasonal rates stored separately from room information?
6. Why do hotel systems cache availability searches?
7. How do audit logs help resolve customer disputes?
8. Why are transactions essential during booking confirmation?

---

# Hands-on Exercises

### Exercise 1

Draw the complete ER diagram for the hotel reservation system.

---

### Exercise 2

Design tables for:

- Hotels
- Rooms
- Guests
- Reservations
- ReservationRooms
- Payments
- Housekeeping

---

### Exercise 3

Design a booking workflow:

Guest → Search → Reservation → Payment → Check-In → Check-Out → Invoice

Explain where database transactions should be used.

---

### Exercise 4

Design lookup tables for:

- Room Types
- Reservation Status
- Payment Methods
- Service Types
- Countries

---

### Exercise 5

Extend the system by adding:

- Online Travel Agency (OTA) integrations
- Conference room bookings
- Smart room devices
- Digital room keys
- Mobile check-in
- AI-based pricing recommendations

Identify the additional entities and relationships.

---

# Summary

This case study demonstrated how relational databases support enterprise hotel reservation systems. In addition to relationship modelling, you explored reservation lifecycles, room availability, concurrency control, master–detail patterns, seasonal pricing, audit logging, status history, multi-property architecture, and enterprise scalability techniques.

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

### Next Lesson

**03.08.09.09 — Real-World Relationship Case Study: Food Delivery Platform**