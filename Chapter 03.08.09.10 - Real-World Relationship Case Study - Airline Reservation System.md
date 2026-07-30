---
title: "03.08.09.10 - Real-World Relationship Case Study: Airline Reservation System"
description: "Learn how enterprise airline reservation systems are designed using relational databases. Explore flights, aircraft, passengers, bookings, seat inventory, ticketing, concurrency control, and enterprise architecture."
chapter: 3
section: 3.8.9.10
category: Core SQL Concepts
difficulty: Advanced
readingTime: 120 min
lastUpdated: 2026-07-27
---

# 03.08.09.10 Airline Reservation System

## Learning Objectives

After completing this lesson, you will be able to:

- Design an airline reservation database
- Model flight scheduling
- Manage seat inventory
- Prevent double booking
- Understand reservation workflows
- Learn enterprise concurrency patterns
- Explore distributed airline architecture
- Understand how global airline booking systems operate

---

# Introduction

An Airline Reservation System (ARS) manages every stage of a passenger's journey.

Modern airline systems support:

- Flight schedules
- Aircraft
- Airports
- Seat inventory
- Reservations
- Ticketing
- Check-in
- Boarding
- Baggage
- Crew management
- Payments
- Loyalty programmes

Examples include:

- Amadeus
- Sabre
- Travelport
- Lufthansa Systems

Unlike most booking systems, airline databases must support:

- Millions of concurrent users
- Real-time seat inventory
- Global availability
- Strict transactional consistency
- High availability

---

# Business Requirements

The airline should support:

- Multiple airlines
- Airports
- Aircraft
- Flights
- Flight schedules
- Passengers
- Reservations
- Tickets
- Seats
- Check-in
- Boarding
- Baggage
- Crew
- Payments
- Loyalty programmes

---

# Step 1 — Identify Entities

| Entity | Purpose |
|---------|----------|
| Airlines | Airline companies |
| Airports | Airport information |
| Aircraft | Aircraft fleet |
| Flights | Flight routes |
| FlightSchedules | Scheduled flights |
| Seats | Aircraft seating |
| Passengers | Passenger details |
| Reservations | Booking records |
| ReservationPassengers | Passenger list |
| Tickets | Issued tickets |
| BoardingPasses | Boarding documents |
| Baggage | Checked luggage |
| CrewMembers | Flight crew |
| Payments | Payment records |
| LoyaltyAccounts | Frequent flyer programme |
| StatusHistory | Reservation timeline |
| AuditLogs | System history |

---

# Step 2 — Relationship Analysis

| Parent | Child | Relationship |
|----------|--------|-------------|
| Airline → Aircraft | One-to-Many |
| Airline → Flights | One-to-Many |
| Airport → Flights | One-to-Many (Departure & Arrival) |
| Flight → FlightSchedules | One-to-Many |
| FlightSchedule → Seats | One-to-Many |
| Passenger → Reservations | One-to-Many |
| Reservation → Tickets | One-to-Many |
| Reservation → Payments | One-to-One |
| Ticket → BoardingPass | One-to-One |
| Ticket → Baggage | One-to-Many |
| Crew ↔ FlightSchedule | Many-to-Many |

---

# Enterprise ER Diagram

```text
Airlines
   │
   ├──────── Aircraft
   └──────── Flights
                │
                ▼
        FlightSchedules
          │    │    │
          │    │    ├──────── CrewAssignments
          │    │
          │    ├──────── Seats
          │
          ├──────── Reservations
          │          │
          │          ├──────── ReservationPassengers
          │          ├──────── Tickets
          │          ├──────── Payments
          │          └──────── StatusHistory
          │
          └──────── BoardingPasses

Passengers
     │
     ├──────── LoyaltyAccounts
     └──────── Baggage

AuditLogs
```

---

# Reservation Workflow

```text
Search Flights

↓

Select Flight

↓

Reserve Seats

↓

Payment

↓

Ticket Issued

↓

Check-In

↓

Boarding Pass

↓

Board Aircraft

↓

Flight Completed
```

---

# Seat Inventory

Every scheduled flight has its own seat inventory.

```text
Aircraft

↓

Seats

↓

FlightSchedule

↓

Available Seats
```

Example:

| Seat | Status |
|------|--------|
| 12A | Available |
| 12B | Reserved |
| 12C | Occupied |

Seat availability belongs to the **scheduled flight**, not simply to the aircraft model.

---

# Master–Detail Pattern

Reservations follow a Master–Detail design.

```text
Reservation

↓

ReservationPassengers
```

One booking may contain:

- One passenger
- Family booking
- Group booking

Each passenger receives an individual ticket.

---

# Reservation Lifecycle

```text
Searching

↓

Reserved

↓

Payment Pending

↓

Confirmed

↓

Ticket Issued

↓

Checked-In

↓

Boarded

↓

Completed
```

Alternative paths:

```text
Reserved

↓

Cancelled
```

or

```text
Reserved

↓

Expired
```

Store every state transition in a **StatusHistory** table.

---

# Concurrency Challenge

The biggest challenge:

Two customers select the last remaining seat simultaneously.

```text
Passenger A

↓

Seat 12A Available

↓

Reserve
```

```text
Passenger B

↓

Seat 12A Available

↓

Reserve
```

Without proper locking, both reservations may succeed.

---

# Optimistic Locking

Assume conflicts are uncommon.

Before updating:

```text
Seat Version = 15
```

Update only if the version is unchanged.

If another transaction modified the seat first:

```
Update Failed

↓

Retry
```

Best suited for systems with many reads and relatively few write conflicts.

---

# Pessimistic Locking

Immediately lock the selected seat.

```text
Seat 12A

↓

LOCK

↓

Payment

↓

Commit
```

Other users must wait until the transaction completes or rolls back.

Useful when conflicts are likely.

---

# Temporary Seat Hold (TTL)

Most airlines temporarily reserve seats while payment is being completed.

```text
Seat Reserved

↓

15-Minute Timer

↓

Payment?
```

If payment succeeds:

```
Confirmed
```

Otherwise:

```
Reservation Expired

↓

Seat Released
```

This prevents seats being blocked indefinitely.

---

# Idempotency

Suppose a payment request is retried because of a network timeout.

Without protection:

```text
£450 Charged

↓

Retry

↓

£450 Charged Again ❌
```

Instead:

```text
Idempotency Key

↓

Duplicate Request

↓

Return Existing Result
```

Idempotency ensures the same request is processed only once.

---

# Lookup Tables

Common lookup tables include:

- Cabin Class
- Seat Type
- Meal Preference
- Ticket Status
- Boarding Group
- Aircraft Type
- Airport Codes
- Payment Methods

---

# Soft Deletes

Tickets and reservations are rarely deleted.

Instead:

```text
Cancelled

CancelledAt

CancelledBy
```

Historical booking records remain available for auditing and customer support.

---

# Audit Logs

Important actions include:

- Reservation Created
- Seat Assigned
- Payment Completed
- Check-In
- Boarding Pass Printed
- Flight Changed
- Ticket Cancelled

---

# Eventual Consistency

Large airline systems synchronise data across:

- Airline website
- Mobile app
- Airport kiosks
- Global Distribution Systems (GDS)
- Partner travel agencies

Updates may propagate asynchronously while maintaining overall consistency.

---

# Distributed Transactions

A booking may involve:

```text
Reservation Service

↓

Payment Service

↓

Seat Inventory

↓

Ticket Service

↓

Notification Service
```

Modern systems often coordinate these services through reliable messaging and workflow orchestration rather than relying on a single database transaction.

---

# Performance Considerations

Enterprise airline systems benefit from:

- Indexes on FlightNumber, FlightDate, PassengerID
- Composite indexes for availability searches
- Partitioning historical bookings
- Read replicas for search
- Caching schedules
- Background ticket generation

---

# Common Production Challenges

## Preventing Double Booking

The same seat must never be sold twice.

---

## Flight Delays

Flight schedules may change, requiring updates to passengers, crews, and connecting flights.

---

## Aircraft Changes

Replacing an aircraft can change seat layouts, requiring passenger seat reassignment.

---

## Overbooking

Airlines may intentionally sell more tickets than available seats based on historical no-show rates.

Business rules and operational procedures determine how these situations are managed.

---

## Connecting Flights

One passenger itinerary may contain several flight segments.

The database must preserve the relationship between all segments.

---

## Lost Connectivity

Airport systems may temporarily lose connectivity.

They must synchronise data safely when connections are restored.

---

# Enterprise Architecture Notes

## CQRS

Separate booking operations from flight search.

---

## Event Sourcing

Examples:

- Reservation Created
- Seat Held
- Payment Completed
- Ticket Issued
- Boarding Completed

---

## Saga Pattern

If payment succeeds but ticket generation fails:

```text
Payment

↓

Reservation

↓

Ticket

↓

Failure

↓

Compensation
```

The system executes compensating actions instead of rolling back a single distributed transaction.

---

## Read Replicas

Flight searches generate millions of read requests.

Read replicas improve scalability without affecting booking transactions.

---

## Polyglot Persistence

| Module | Storage |
|---------|---------|
| Reservations | Relational Database |
| Flight Search | Search Engine |
| Cache | Redis |
| Documents | Object Storage |
| Analytics | Data Warehouse |

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB |
|---------|:-----:|:----------:|:----------:|:------:|:--------:|
| Transactions | ✅ | ✅ | ✅ | ✅ | ✅ |
| Row-Level Locking | ✅ | ✅ | ✅ | ✅ | ✅ |
| Foreign Keys | ✅ | ✅ | ✅ | ✅ | ✅ |
| Partitioning | ✅ | ✅ | ✅ | ✅ | ✅ |
| Window Functions | ✅ | ✅ | ✅ | ✅ | ✅ |

---

# 💡 Did You Know?

Many airline reservation systems separate **flight search** from **booking**. Searching flights can be served by highly optimised read infrastructure, while seat allocation and ticket issuance occur within transactional systems that prioritise correctness over speed.

---

# Interview Questions

1. Why does each scheduled flight maintain its own seat inventory?
2. What is the difference between optimistic and pessimistic locking?
3. Why are temporary seat holds necessary?
4. What is an idempotency key?
5. Why is a `StatusHistory` table useful?
6. What is the Saga pattern?
7. Why are distributed transactions challenging?
8. Why should reservations use soft deletes?

---

# Hands-on Exercises

### Exercise 1

Draw the complete ER diagram for the airline reservation system.

---

### Exercise 2

Design tables for:

- Flights
- FlightSchedules
- Aircraft
- Seats
- Reservations
- Tickets
- BoardingPasses

---

### Exercise 3

Design a booking workflow from flight search to boarding.

Identify where transactions, locking, and idempotency are required.

---

### Exercise 4

Create lookup tables for:

- Cabin Class
- Meal Preference
- Ticket Status
- Airport Codes
- Aircraft Types

---

### Exercise 5

Extend the system by adding:

- Codeshare flights
- Multi-city itineraries
- Airport lounges
- Upgrade requests
- Standby passengers
- Carbon offset purchases

Identify the new entities and relationships.

---

# Summary

This case study demonstrated how enterprise airline reservation systems combine relational database modelling with advanced concurrency control, distributed workflows, and scalable architecture. Alongside SQL relationships, you explored seat inventory, optimistic and pessimistic locking, temporary reservations, idempotency, event-driven processing, and distributed transaction patterns used in real-world airline systems.

---

# Related Topics

### Previous Lessons

- 03.08.09.01 — Student Management System
- 03.08.09.09 — Food Delivery Platform

### Next Lesson

**03.08.09.11 — Real-World Relationship Case Study: Logistics & Supply Chain Management System**