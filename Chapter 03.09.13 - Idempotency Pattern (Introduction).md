---
title: "03.09.13 - Idempotency Pattern (Introduction)"
description: "Learn the Idempotency Pattern, an enterprise reliability pattern that ensures the same request can be processed multiple times without producing duplicate side effects. Discover how payment gateways, REST APIs, banking systems, e-commerce platforms, and distributed systems prevent duplicate orders, payments, and transactions."
chapter: 3
section: 3.9.13
category: Database Design Patterns
difficulty: Advanced
readingTime: 45 min
lastUpdated: 2026-07-28
---

# 03.09.13 Idempotency Pattern (Introduction)

---

# Learning Objectives

After completing this lesson, you will be able to:

- Understand what idempotency means
- Learn why duplicate requests occur
- Prevent duplicate business operations
- Understand Idempotency Keys
- Recognise enterprise use cases
- Understand the relationship between Outbox, Event Log and Idempotency

---

# Prerequisites

Before studying this chapter, you should understand:

- Database Transactions (ACID)
- Primary Keys
- Unique Constraints
- Event Log Pattern
- Outbox Pattern

---

# Definition

The **Idempotency Pattern** ensures that **performing the same operation multiple times produces exactly one business result.**

Whether a request arrives:

```text
1 Time

2 Times

10 Times

100 Times
```

the business operation is executed **only once**.

The client always receives the same response.

---

# What Does "Idempotent" Mean?

In mathematics:

```text
f(f(x)) = f(x)
```

Applying the operation repeatedly gives the same result.

In databases:

```text
Create Payment

↓

Repeat Request

↓

No Duplicate Payment
```

---

# Problem It Solves

Imagine a customer clicks:

```text
Pay Now
```

Unfortunately,

the network freezes.

The customer clicks again.

```text
Pay Now

↓

Pay Now

↓

Pay Now
```

Without idempotency:

```text
Payment #1

Payment #2

Payment #3
```

The customer is charged three times.

---

# Another Example

An online store receives:

```http
POST /orders
```

Because of a timeout,

the browser automatically retries.

The server receives:

```text
Request

↓

Request

↓

Request
```

Without protection:

```text
Order #1001

Order #1002

Order #1003
```

Three identical orders are created.

---

# The Solution

Assign every request a unique identifier.

Example:

```text
Idempotency-Key

↓

f72ab193-a1d4-4a61
```

When the server receives a request:

```text
Already Processed?

↓

YES

↓

Return Previous Response

↓

NO

↓

Process Request
```

No duplicate business operation occurs.

---

# Visual Representation

```text
Client

↓

POST /payments

↓

Idempotency Key

↓

Application

↓

Database

↓

Already Exists?

↓

YES → Return Existing Result

↓

NO → Process Payment
```

---

# ER Diagram

```text
+--------------------------------------+
| IdempotencyKeys                      |
+--------------------------------------+
| PK IdempotencyKey                    |
| RequestHash                          |
| ResponseData                         |
| Status                               |
| CreatedAt                            |
| ExpiresAt                            |
+--------------------------------------+
```

Each processed request is stored once.

---

# SQL Implementation

## Step 1 — Create Table

```sql
CREATE TABLE IdempotencyKeys (

    IdempotencyKey VARCHAR(100)
        PRIMARY KEY,

    RequestHash VARCHAR(255),

    ResponseData JSON,

    Status VARCHAR(30),

    CreatedAt DATETIME,

    ExpiresAt DATETIME
);
```

---

## Step 2 — Client Sends Request

```http
POST /payments

Idempotency-Key:
f72ab193-a1d4-4a61
```

---

## Step 3 — Check Existing Key

```sql
SELECT *

FROM IdempotencyKeys

WHERE IdempotencyKey =
'f72ab193-a1d4-4a61';
```

---

## Step 4 — First Request

No record exists.

Application:

```text
Process Payment

↓

Save Response

↓

Store Idempotency Key
```

---

## Step 5 — Second Request

The same key arrives.

Application:

```text
Already Exists

↓

Return Previous Response
```

No second payment occurs.

---

# Example Workflow

Without Idempotency

```text
Click

↓

Payment

↓

Click Again

↓

Payment Again

↓

Duplicate Charge
```

---

With Idempotency

```text
Click

↓

Payment

↓

Store Key

↓

Click Again

↓

Return Existing Result
```

Only one payment exists.

---

# Real-World Examples

## Stripe

Every payment request contains an:

```text
Idempotency-Key
```

Duplicate payment requests return the original result.

---

## PayPal

Duplicate payment attempts are ignored safely.

---

## Amazon

Repeated checkout requests do not create duplicate orders.

---

## Uber

Ride creation requests are protected against retries.

---

## Banking

Money transfers cannot execute twice because of network failures.

---

## Airline Reservation

Booking retries return the original booking instead of creating multiple reservations.

---

# Enterprise Adoption

| Company | Uses Idempotency For |
|----------|----------------------|
| Stripe | Payment APIs |
| PayPal | Payment Processing |
| Amazon | Orders |
| Shopify | Checkout |
| Uber | Ride Requests |
| Microsoft Azure | Resource Creation APIs |
| AWS | Cloud Resource Provisioning |
| Google Cloud | Infrastructure APIs |

---

# Where Do Duplicate Requests Come From?

Duplicates happen more often than many developers expect.

Common causes include:

- User double-clicks a button
- Mobile network reconnects
- Browser retries after timeout
- Reverse proxy retries
- Load balancer retries
- Message broker redelivery
- Background job retries
- API gateway retries

Idempotency protects against all of these situations.

---

# Idempotency vs Unique Constraint

| Idempotency | Unique Constraint |
|-------------|------------------|
| Prevents duplicate requests | Prevents duplicate values |
| Business operation level | Database column level |
| Returns original response | Returns database error |
| Handles retries gracefully | Does not preserve API response |

---

# Idempotency vs Transactions

| Transaction | Idempotency |
|--------------|-------------|
| Guarantees atomicity | Prevents duplicate execution |
| Protects one transaction | Protects repeated requests |
| Database feature | Application design pattern |

Both are required.

---

# Advantages

✅ Prevents duplicate payments

✅ Prevents duplicate orders

✅ Safe retries

✅ Better API reliability

✅ Essential for distributed systems

✅ Improves customer experience

---

# Disadvantages

❌ Additional storage

❌ Key expiration management

❌ More application logic

❌ Requires careful key generation

---

# Performance Considerations

Large APIs may process millions of idempotency keys.

Recommendations:

- Index the primary key
- Automatically expire old keys
- Store only required response data
- Archive long-term records if needed

Example:

```sql
CREATE INDEX idx_idempotency_expiry

ON IdempotencyKeys(ExpiresAt);
```

---

# Best Practices

✔ Require an `Idempotency-Key` for critical POST requests.

✔ Generate keys using UUIDs.

✔ Store the original response.

✔ Set expiration times for old keys.

✔ Verify that repeated requests have the same payload.

✔ Combine with database transactions.

---

# Common Mistakes

## Using Different Keys

Bad:

```text
Retry

↓

New Key
```

This creates duplicate operations.

---

## Ignoring Request Payload

If the same key arrives with different request data:

Reject the request.

---

## Unlimited Storage

Do not store keys forever.

Use expiration policies.

---

## Applying Idempotency Everywhere

GET requests are already naturally idempotent.

Idempotency is most valuable for:

- POST
- Payment APIs
- Resource creation
- Financial transactions

---

# Typical Workflow

```text
Client

↓

Generate UUID

↓

POST Request

↓

Check Idempotency Table

↓

Already Exists?

↓

YES

↓

Return Previous Response

↓

NO

↓

Execute Business Logic

↓

Save Response

↓

Return Response
```

---

# Relationship with Other Patterns

| Pattern | Purpose |
|----------|---------|
| Outbox | Reliable event publishing |
| Event Log | Business history |
| Audit Log | Compliance |
| Transactions | Atomic database changes |
| Saga | Distributed transaction coordination |

Idempotency is often used together with these patterns in modern distributed systems.

---

# Security Considerations

Protect against:

- Replay attacks
- Forged idempotency keys
- Key collisions
- Excessive storage growth
- Malicious retry flooding

Consider:

- Key expiration
- Authentication
- Rate limiting
- Request hashing

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB |
|---------|:-----:|:----------:|:----------:|:------:|:--------:|
| Primary Keys | ✅ | ✅ | ✅ | ✅ | ✅ |
| Unique Constraints | ✅ | ✅ | ✅ | ✅ | ✅ |
| JSON Support | ✅ | ✅ | ✅ | ✅ | ✅ |
| Transactions | ✅ | ✅ | ✅ | ✅ | ✅ |

---

# 💡 Did You Know?

Payment providers such as **Stripe**, **PayPal**, and many banking APIs strongly recommend (or require) idempotency for payment requests. Without it, a temporary network timeout or an automatic retry could result in duplicate financial transactions—one of the most serious failures in payment processing.

---

# Enterprise Design Considerations

Large-scale systems often extend the basic pattern by adding:

### Request Hash Validation

Ensures the same idempotency key is never reused with different request data.

---

### Response Caching

Stores the original HTTP response so repeated requests receive exactly the same result.

---

### Key Expiration

Automatically removes expired keys after a configurable retention period.

---

### Distributed Idempotency

Uses shared storage (database or distributed cache) so multiple application servers recognise the same request.

---

# Interview Questions

## Basic

1. What is idempotency?
2. Why are duplicate requests dangerous?
3. What is an Idempotency Key?

---

## Intermediate

4. Why is idempotency important for payment systems?
5. How is idempotency different from a unique constraint?
6. Why should request payloads be validated?

---

## Advanced

7. How would you implement idempotency in a REST API?
8. How would you handle idempotency in a distributed microservices architecture?
9. Explain how idempotency complements the Outbox Pattern.
10. How would you prevent replay attacks using idempotency keys?

---

# Hands-on Exercises

## Exercise 1

Design an idempotent payment API.

Include:

- Payment table
- Idempotency table
- Retry workflow

---

## Exercise 2

Design an order creation API that safely handles duplicate requests.

---

## Exercise 3

Compare:

- Transactions
- Unique Constraints
- Idempotency
- Outbox Pattern

Explain the role of each.

---

## Exercise 4

Design an airline ticket booking API that prevents duplicate reservations caused by retries.

---

## Exercise 5

Create a sequence diagram showing:

- Client
- API
- Database
- Idempotency Table

Explain how duplicate requests are safely handled.

---

# Related Patterns

- **03.09.10 — Event Log Pattern**
- **03.09.12 — Outbox Pattern**
- **03.09.14 — CQRS Pattern**
- **03.09.15 — Event Sourcing Pattern**
- **03.09.16 — Saga Pattern**

---

# Summary

The **Idempotency Pattern** ensures that repeated requests produce only one business outcome, even when users, browsers, networks, or distributed systems retry the same operation. It is a fundamental reliability pattern for payment gateways, e-commerce platforms, cloud APIs, and financial systems. By combining idempotency with transactions, the Outbox Pattern, and event-driven architecture, enterprise applications can safely process retries without creating duplicate orders, payments, or other critical business operations.