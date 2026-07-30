---
title: "03.09.04 - Status History Pattern"
description: "Learn the Status History Pattern, a database design pattern used to preserve every state transition of a business entity. Discover how enterprise systems track order progress, workflow changes, approvals, and audit-friendly histories."
chapter: 3
section: 3.9.4
category: Database Design Patterns
difficulty: Intermediate
readingTime: 35 min
lastUpdated: 2026-07-27
---

# 03.09.04 Status History Pattern

---

# Learning Objectives

After completing this lesson, you will be able to:

- Understand the Status History Pattern
- Know why storing only the current status is often insufficient
- Design history tables for business workflows
- Track complete lifecycle changes
- Improve auditing and reporting
- Implement status history in enterprise applications

---

# Definition

The **Status History Pattern** records **every status change** that occurs during the lifecycle of a business entity.

Instead of overwriting the current status, every transition is stored as a separate record in a dedicated history table.

This creates a complete timeline of how the entity evolved over time.

---

# Problem It Solves

Imagine an online order.

Initially:

```text
Order

Status = Pending
```

Later:

```text
Status = Paid
```

Then:

```text
Status = Packed
```

Then:

```text
Status = Shipped
```

Finally:

```text
Status = Delivered
```

If we keep updating only one column:

| OrderID | Status |
|---------:|---------|
|1001|Delivered|

we lose valuable information.

Questions we can no longer answer:

- When was payment received?
- How long was packing delayed?
- Who approved shipment?
- Was the order ever cancelled?
- How many status changes occurred?

---

# Solution

Store the **current status** in the main table for fast access.

Store **every status transition** in a separate history table.

```text
Orders

↓

OrderStatusHistory
```

---

# Visual Representation

```text
Orders
------------------------
OrderID (PK)
CustomerID
CurrentStatus

          ▲
          │
          │
OrderStatusHistory
------------------------
HistoryID (PK)
OrderID (FK)
Status
ChangedAt
ChangedBy
Remarks
```

---

# ER Diagram

```text
+-----------------------+
| Orders                |
+-----------------------+
| PK OrderID            |
| CustomerID            |
| CurrentStatus         |
+-----------------------+
          ▲
          │
          │
+----------------------------+
| OrderStatusHistory         |
+----------------------------+
| PK HistoryID               |
| FK OrderID                 |
| Status                     |
| ChangedAt                  |
| ChangedBy                  |
| Remarks                    |
+----------------------------+
```

Relationship

```text
Orders

1

────────────<

Many Status History Records
```

---

# SQL Implementation

## Step 1 — Create Master Table

```sql
CREATE TABLE Orders (
    OrderID INT PRIMARY KEY,
    CustomerID INT,
    CurrentStatus VARCHAR(30)
);
```

---

## Step 2 — Create Status History Table

```sql
CREATE TABLE OrderStatusHistory (
    HistoryID INT PRIMARY KEY,
    OrderID INT NOT NULL,
    Status VARCHAR(30),
    ChangedAt DATETIME,
    ChangedBy VARCHAR(100),
    Remarks VARCHAR(255),

    FOREIGN KEY (OrderID)
        REFERENCES Orders(OrderID)
);
```

---

## Step 3 — Insert Order

```sql
INSERT INTO Orders
VALUES
(1001,101,'Pending');
```

---

## Step 4 — Record Status Changes

```sql
INSERT INTO OrderStatusHistory
VALUES
(1,1001,'Pending','2026-07-27 09:00','System','Order created'),

(2,1001,'Paid','2026-07-27 09:10','Payment Gateway','Payment successful'),

(3,1001,'Packed','2026-07-27 11:15','Warehouse','Packed successfully'),

(4,1001,'Shipped','2026-07-27 16:30','Warehouse','Courier assigned');
```

---

## Step 5 — Retrieve Status Timeline

```sql
SELECT
    Status,
    ChangedAt,
    ChangedBy
FROM OrderStatusHistory
WHERE OrderID = 1001
ORDER BY ChangedAt;
```

### Output

| Status | Changed At | Changed By |
|---------|------------|------------|
| Pending | 09:00 | System |
| Paid | 09:10 | Payment Gateway |
| Packed | 11:15 | Warehouse |
| Shipped | 16:30 | Warehouse |

The history table preserves every transition, allowing users to reconstruct the complete lifecycle of the order.

---

# How It Works

Without the pattern:

```text
Pending

↓

Paid

↓

Packed

↓

Shipped

↓

Delivered
```

Only:

```text
Delivered
```

remains in the database.

---

With the pattern:

```text
Pending

↓

Paid

↓

Packed

↓

Shipped

↓

Delivered
```

Every step remains permanently available.

---

# Why Keep CurrentStatus?

Many developers ask:

> "If we have a history table, why keep `CurrentStatus`?"

Because retrieving the latest status from millions of history records every time would be expensive.

Enterprise systems typically store:

```text
Orders

↓

CurrentStatus
```

for fast queries.

The history table provides the complete audit trail.

---

# Real-World Examples

## E-Commerce

```text
Pending

↓

Paid

↓

Packed

↓

Shipped

↓

Delivered
```

---

## Banking

```text
Loan

↓

Submitted

↓

Verified

↓

Approved

↓

Disbursed
```

---

## HRMS

```text
Leave Request

↓

Submitted

↓

Manager Approved

↓

HR Approved

↓

Completed
```

---

## Hospital

```text
Appointment

↓

Booked

↓

Confirmed

↓

Checked In

↓

Completed
```

---

## Government

```text
Passport

↓

Applied

↓

Verified

↓

Police Clearance

↓

Issued
```

---

## Manufacturing

```text
Production Order

↓

Created

↓

Scheduled

↓

Running

↓

Completed
```

---

## CRM

```text
Lead

↓

New

↓

Qualified

↓

Proposal

↓

Won
```

---

# Enterprise Examples

| System | Entity | History Table |
|---------|---------|---------------|
| ERP | Purchase Order | PurchaseOrderStatusHistory |
| Banking | Loan | LoanStatusHistory |
| CRM | Opportunity | OpportunityStatusHistory |
| Hospital | Admission | AdmissionStatusHistory |
| Airline | Flight | FlightStatusHistory |
| Logistics | Shipment | ShipmentStatusHistory |
| SaaS | Support Ticket | TicketStatusHistory |

---

# Advantages

✅ Complete business history

✅ Supports compliance

✅ Improves reporting

✅ Enables workflow analytics

✅ Helps troubleshooting

✅ Provides accountability

---

# Disadvantages

❌ More storage required

❌ Additional insert operations

❌ Slightly more complex reporting

❌ Requires synchronization with current status

---

# Performance Considerations

Status history tables grow continuously.

Best practices:

- Index `OrderID`.
- Index `ChangedAt`.
- Archive historical records if required.
- Partition very large history tables.
- Store only meaningful transitions.

Avoid writing duplicate history records.

---

# Best Practices

✔ Keep only the latest status in the main table.

✔ Store every transition in the history table.

✔ Record:

- Previous status
- New status
- Timestamp
- User/System
- Optional remarks

✔ Use lookup tables for status values.

✔ Record changes inside the same database transaction.

---

# Common Mistakes

## Only Updating Current Status

```text
Pending

↓

Paid

↓

Delivered
```

Older states disappear forever.

---

## No Timestamp

Without `ChangedAt`, you cannot determine when the transition occurred.

---

## Missing User Information

Always capture who made the change.

```text
ChangedBy
```

supports auditing and accountability.

---

## Duplicate Status Records

Avoid recording repeated transitions such as:

```text
Paid

↓

Paid

↓

Paid
```

unless there is a legitimate business reason.

---

# Typical Workflow

```text
Create Order

↓

Pending

↓

Payment Received

↓

Packed

↓

Quality Check

↓

Shipped

↓

Delivered
```

Each arrow represents one record inserted into the history table.

---

# Current Status vs Status History

| Current Status | Status History |
|----------------|----------------|
| Latest value only | Complete timeline |
| Fast to query | Rich historical data |
| Frequently updated | Append-only |
| Operational use | Reporting & auditing |

Enterprise systems often use **both** together.

---

# Integration with Other Patterns

Status History works particularly well with:

| Pattern | Why |
|---------|-----|
| Lookup Table | Store valid status values |
| Master–Detail | Track lifecycle of master records |
| Audit Log | Record who changed the status |
| Soft Delete | Preserve history after logical deletion |
| Event Log | Publish status change events |

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB |
|---------|:-----:|:----------:|:----------:|:------:|:--------:|
| Foreign Keys | ✅ | ✅ | ✅ | ✅ | ✅ |
| Transactions | ✅ | ✅ | ✅ | ✅ | ✅ |
| Indexing | ✅ | ✅ | ✅ | ✅ | ✅ |
| Partitioning | ✅ | ✅ | ✅ | ✅ | ✅ |

---

# 💡 Did You Know?

Companies like **Amazon**, **FedEx**, **DHL**, and **UPS** don't simply store that a package is "Delivered." They maintain a detailed tracking history showing every checkpoint—from warehouse processing and regional sorting facilities to out-for-delivery events and the final delivery confirmation. This is a real-world implementation of the Status History Pattern.

---

# Interview Questions

## Basic

1. What is the Status History Pattern?
2. Why is storing only the current status insufficient?
3. Why is a separate history table used?

## Intermediate

4. Why keep both `CurrentStatus` and a history table?
5. What information should a history record contain?
6. How does this pattern improve reporting?

## Advanced

7. How would you prevent duplicate status transitions?
8. How would you design a status workflow for a banking loan approval system?
9. Should status values be hard-coded or stored in a lookup table? Why?
10. How would you archive a history table containing billions of records?

---

# Hands-on Exercises

## Exercise 1

Design an Order Tracking system.

Create:

- Orders
- OrderStatusHistory

Record every status transition.

---

## Exercise 2

Design a Leave Management workflow.

Track:

- Submitted
- Manager Approved
- HR Approved
- Completed
- Rejected

---

## Exercise 3

Design a Logistics Shipment Tracking system.

Include:

- Shipment
- ShipmentStatusHistory

Record location and timestamp for every update.

---

## Exercise 4

Design a Hospital Appointment workflow.

Track:

- Scheduled
- Confirmed
- Checked In
- Consultation Started
- Completed
- Cancelled

---

## Exercise 5

Build a Ticket Management System.

Include:

- Tickets
- TicketStatusHistory

Store:

- Previous Status
- New Status
- Changed By
- Changed At
- Remarks

Draw the ER diagram and explain why the Status History Pattern is essential.

---

# Related Patterns

- **03.09.01 — Lookup (Reference) Table Pattern**
- **03.09.02 — Master–Detail Pattern**
- **03.09.06 — Audit Log Pattern**
- **03.09.07 — Soft Delete Pattern**
- **03.09.11 — Event Log Pattern**

Status History is frequently combined with Audit Logs to record *who* made a change and with Event Logs to notify other systems when a status transition occurs.

---

# Summary

The **Status History Pattern** preserves the complete lifecycle of a business entity by storing every status transition instead of overwriting a single status column. It enables auditing, compliance, workflow analysis, troubleshooting, and historical reporting while keeping the current status readily available for fast operational queries. This pattern is fundamental to enterprise systems such as e-commerce platforms, banking applications, ERP software, logistics systems, healthcare solutions, and SaaS products.