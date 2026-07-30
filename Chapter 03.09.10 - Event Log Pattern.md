---
title: "03.09.10 - Event Log Pattern"
description: "Learn the Event Log Pattern, an enterprise database design pattern used to capture every important business event as an immutable record. Discover how Amazon, Uber, Netflix, Stripe, banking systems, ERP software, and modern microservices use event logs for auditing, event-driven architecture, analytics, replay, and system integration."
chapter: 3
section: 3.9.10
category: Database Design Patterns
difficulty: Advanced
readingTime: 50 min
lastUpdated: 2026-07-28
---

# 03.09.10 Event Log Pattern

---

# Learning Objectives

After completing this lesson, you will be able to:

- Understand the Event Log Pattern
- Differentiate Event Logs from Audit Logs
- Understand immutable event storage
- Learn how modern distributed systems communicate
- Recognise event-driven architecture
- Understand replayable business events
- Identify enterprise use cases

---

# Definition

The **Event Log Pattern** stores every important business event as an immutable record.

Unlike normal tables that store the **current state**, an Event Log stores **everything that happened**.

Example:

```text
Customer Registered

↓

Order Created

↓

Payment Received

↓

Order Packed

↓

Order Shipped

↓

Order Delivered
```

Nothing is modified.

Nothing is deleted.

Only new events are appended.

---

# Problem It Solves

Imagine an online shopping platform.

Traditional database:

```text
Orders

Status = Delivered
```

Questions arise:

- When was payment received?
- When was the parcel packed?
- Which warehouse processed it?
- Which courier collected it?
- What happened before delivery?

The current row cannot answer these questions.

---

# Solution

Instead of storing only the latest state,

record every event.

```text
Order Created

↓

Payment Successful

↓

Inventory Reserved

↓

Invoice Generated

↓

Package Packed

↓

Courier Assigned

↓

Order Delivered
```

The complete business history is preserved.

---

# Visual Representation

```text
Customer Places Order

↓

Order Created

↓

Payment Received

↓

Inventory Reserved

↓

Shipment Created

↓

Delivered

↓

Archived
```

Each step becomes a separate event.

---

# ER Diagram

```text
+--------------------------------------+
| EventLog                             |
+--------------------------------------+
| PK EventID                           |
| EventType                            |
| AggregateType                        |
| AggregateID                          |
| EventData (JSON)                     |
| CreatedBy                            |
| CreatedAt                            |
+--------------------------------------+
```

Unlike Audit Logs, Event Logs usually store business events rather than database changes.

---

# SQL Implementation

## Step 1 — Create Event Log

```sql
CREATE TABLE EventLog (

    EventID BIGINT PRIMARY KEY,

    AggregateType VARCHAR(50),

    AggregateID INT,

    EventType VARCHAR(100),

    EventData JSON,

    CreatedBy VARCHAR(100),

    CreatedAt DATETIME
);
```

---

## Step 2 — Customer Places Order

```sql
INSERT INTO EventLog
VALUES
(
1,
'Order',
1001,
'OrderCreated',
'{
  "CustomerID":101,
  "Total":249.99
}',
'System',
NOW()
);
```

---

## Step 3 — Payment Received

```sql
INSERT INTO EventLog
VALUES
(
2,
'Order',
1001,
'PaymentReceived',
'{
  "Amount":249.99,
  "Method":"Card"
}',
'Payment Service',
NOW()
);
```

---

## Step 4 — Order Shipped

```sql
INSERT INTO EventLog
VALUES
(
3,
'Order',
1001,
'OrderShipped',
'{
  "Courier":"DHL",
  "Tracking":"UK123456789"
}',
'Warehouse',
NOW()
);
```

---

## Step 5 — Retrieve Timeline

```sql
SELECT
EventType,
CreatedAt

FROM EventLog

WHERE AggregateID = 1001

ORDER BY CreatedAt;
```

### Output

| Event |
|--------|
|OrderCreated|
|PaymentReceived|
|OrderShipped|

The ordered events reconstruct the complete lifecycle of the order.

---

# How It Works

Traditional Database

```text
Current State

↓

Status = Delivered
```

Event Log

```text
Order Created

↓

Payment Received

↓

Packed

↓

Shipped

↓

Delivered
```

The current state can be rebuilt by replaying the events.

---

# Real-World Examples

## Amazon

```text
Order Created

↓

Payment Accepted

↓

Inventory Reserved

↓

Package Dispatched
```

---

## Uber

```text
Ride Requested

↓

Driver Accepted

↓

Ride Started

↓

Ride Completed
```

---

## Netflix

```text
Movie Started

↓

Paused

↓

Resumed

↓

Finished
```

---

## Banking

```text
Account Opened

↓

Deposit

↓

Withdrawal

↓

Transfer
```

---

## Hospital

```text
Patient Admitted

↓

Doctor Assigned

↓

Diagnosis Added

↓

Discharged
```

---

## ERP

```text
Purchase Requested

↓

Approved

↓

Received

↓

Paid
```

---

## SaaS

```text
Workspace Created

↓

User Invited

↓

Subscription Upgraded

↓

API Key Generated
```

---

# Enterprise Adoption

| Company | Uses Event Logs For |
|----------|---------------------|
| Amazon | Order lifecycle |
| Uber | Ride events |
| Netflix | Viewing history |
| Stripe | Payment events |
| Shopify | Order processing |
| GitHub | Repository activity |
| Slack | Message events |
| Salesforce | Business workflows |

---

# Event Log vs Audit Log

| Event Log | Audit Log |
|------------|-----------|
| Business events | Database changes |
| Drives workflows | Supports investigations |
| Often consumed by other systems | Mostly used internally |
| Enables replay | Records accountability |

Example

Audit Log

```text
Salary Updated
```

Event Log

```text
Employee Promoted
```

---

# Event Log vs Status History

| Status History | Event Log |
|----------------|-----------|
| Tracks status changes | Tracks every business event |
| Workflow focused | Business process focused |
| Limited states | Unlimited event types |

---

# Advantages

✅ Complete business history

✅ Event replay

✅ Excellent debugging

✅ Analytics friendly

✅ Supports distributed systems

✅ Enables event-driven architecture

---

# Disadvantages

❌ More storage

❌ Higher complexity

❌ Requires event design

❌ More infrastructure in large systems

---

# Performance Considerations

Event logs can contain billions of records.

Recommendations:

- Use sequential IDs
- Partition by date
- Compress older events
- Store payloads as JSON where appropriate
- Archive historical events

Indexes:

```sql
CREATE INDEX idx_event_aggregate

ON EventLog(AggregateType, AggregateID);

CREATE INDEX idx_event_date

ON EventLog(CreatedAt);
```

---

# Best Practices

✔ Events are immutable.

✔ Never update events.

✔ Never delete events.

✔ Name events using past tense.

Good examples:

```text
OrderCreated

PaymentReceived

InvoiceGenerated

ShipmentDelivered
```

---

✔ Store timestamps in UTC.

✔ Include enough data to replay the event if needed.

---

# Common Mistakes

## Updating Events

Bad

```sql
UPDATE EventLog
```

Events represent history and should never change.

---

## Poor Event Names

Avoid:

```text
Update

Process

Change
```

Prefer:

```text
CustomerRegistered

OrderCancelled

PaymentCaptured
```

---

## Logging Technical Noise

Do not log every internal operation.

Focus on meaningful business events.

---

## Missing Event Metadata

Include:

- Event source
- User
- Timestamp
- Correlation ID
- Tenant ID (if multi-tenant)

---

# Typical Workflow

```text
Customer Places Order

↓

Save Order

↓

Create Event

↓

Publish Event

↓

Inventory Service Updates

↓

Email Service Sends Confirmation

↓

Analytics Service Records Sale
```

One event can trigger multiple independent services.

---

# Event-Driven Architecture

Modern microservices often communicate through events.

```text
Order Service

↓

OrderCreated Event

↓

Inventory Service

↓

Payment Service

↓

Email Service

↓

Analytics Service
```

None of these services call each other directly.

They simply react to events.

---

# Integration with Other Patterns

| Pattern | Purpose |
|----------|---------|
| Audit Log | Security tracking |
| Outbox Pattern | Reliable event publishing |
| Soft Delete | Record lifecycle |
| Versioning | Historical revisions |
| Multi-Tenant | Tenant-specific event streams |

---

# Security Considerations

Protect event logs by:

- Preventing modification
- Encrypting sensitive payloads
- Restricting access
- Digitally signing events (where required)
- Retaining events according to compliance rules

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB |
|---------|:-----:|:----------:|:----------:|:------:|:--------:|
| JSON Support | ✅ | ✅ | ✅ | ✅ | ✅ |
| Partitioning | ✅ | ✅ | ✅ | ✅ | ✅ |
| Transactions | ✅ | ✅ | ✅ | ✅ | ✅ |
| Generated Columns | ✅ | ✅ | ✅ | ✅ | ✅ |

---

# 💡 Did You Know?

Companies like **Amazon, Netflix, Uber, Stripe, and LinkedIn** rely heavily on event-driven architectures. Instead of directly calling dozens of services, an application publishes an event such as **OrderCreated** or **PaymentReceived**. Other services subscribe to these events and react independently, making the system more scalable, resilient, and easier to evolve.

---

# Interview Questions

## Basic

1. What is an Event Log?
2. How does it differ from an Audit Log?
3. Why are events immutable?

---

## Intermediate

4. What information should an event contain?
5. Why are event names usually written in the past tense?
6. What is event replay?

---

## Advanced

7. Explain Event Sourcing and how it differs from the Event Log Pattern.
8. How would you design an Event Log for a payment gateway?
9. What is the role of the Outbox Pattern in event-driven systems?
10. How would you partition billions of event records?

---

# Hands-on Exercises

## Exercise 1

Design an Event Log for an e-commerce application.

Capture:

- Order Created
- Payment Received
- Order Packed
- Order Delivered

---

## Exercise 2

Design a banking event stream.

Capture:

- Account Opened
- Deposit
- Withdrawal
- Transfer
- Account Closed

---

## Exercise 3

Design an LMS.

Capture:

- Student Registered
- Course Enrolled
- Lesson Completed
- Certificate Issued

---

## Exercise 4

Design a SaaS platform.

Capture:

- Workspace Created
- User Invited
- Subscription Changed
- API Key Generated

---

## Exercise 5

Compare these patterns:

- Audit Log
- Event Log
- Status History
- Versioning

Explain when each should be used in an enterprise application.

---

# Related Patterns

- **03.09.05 — Audit Log Pattern**
- **03.09.06 — Soft Delete Pattern**
- **03.09.07 — Versioning Pattern**
- **03.09.11 — Outbox Pattern** *(coming next)*
- **03.09.12 — Multi-Tenant Pattern**

---

# Summary

The **Event Log Pattern** records every significant business event as an immutable, chronological record. Unlike Audit Logs, which focus on who changed data, Event Logs capture what happened in the business domain and often drive communication between services. They form the foundation of event-driven architecture, support analytics, enable event replay, and are widely used by modern cloud platforms such as Amazon, Uber, Netflix, Stripe, and Shopify. Understanding this pattern is essential for designing scalable enterprise systems and microservice-based applications.