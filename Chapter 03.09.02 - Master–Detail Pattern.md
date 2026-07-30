---
title: "03.09.02 - Master–Detail Pattern"
description: "Learn the Master–Detail Pattern, one of the most widely used database design patterns for modelling parent-child relationships such as Orders & Order Items, Invoices & Invoice Lines, and Purchase Orders."
chapter: 3
section: 3.9.2
category: Database Design Patterns
difficulty: Beginner → Intermediate
readingTime: 35 min
lastUpdated: 2026-07-27
---

# 03.09.02 Master–Detail Pattern

---

# Learning Objectives

After completing this lesson, you will be able to:

- Understand the Master–Detail Pattern
- Design parent-child database structures
- Identify real-world master-detail relationships
- Implement foreign keys correctly
- Maintain transactional consistency
- Recognise this pattern in enterprise applications

---

# Definition

The **Master–Detail Pattern** (also known as the **Header–Line Pattern**) models a relationship where:

- One **Master** record represents the overall transaction.
- One or more **Detail** records represent the individual items belonging to that transaction.

The relationship is always **One-to-Many (1:N)**.

The Detail table cannot exist without its Master record.

---

# Problem It Solves

Imagine storing an online order like this:

| OrderID | Customer | Product | Qty |
|----------|-----------|----------|----:|
|1001|Alice|Laptop|1|
|1001|Alice|Mouse|2|
|1001|Alice|Keyboard|1|

Problems:

- Customer information is duplicated.
- Order date repeats.
- Shipping address repeats.
- Payment information repeats.
- Updating the order becomes difficult.

---

# Solution

Split the data into two tables.

```text
Orders

↓

OrderItems
```

The order information is stored once.

Each purchased product becomes a Detail record.

---

# Visual Representation

```text
Orders
---------------------
OrderID (PK)
CustomerID
OrderDate
TotalAmount

          ▲
          │
          │
OrderItems
---------------------
OrderItemID (PK)
OrderID (FK)
ProductID
Quantity
UnitPrice
```

---

# ER Diagram

```text
+----------------------+
| Orders               |
+----------------------+
| PK OrderID           |
| CustomerID           |
| OrderDate            |
| TotalAmount          |
+----------------------+
           ▲
           │
           │
+----------------------+
| OrderItems           |
+----------------------+
| PK OrderItemID       |
| FK OrderID           |
| ProductID            |
| Quantity             |
| UnitPrice            |
+----------------------+
```

Relationship

```text
Orders

1

────────────<

Many OrderItems
```

---

# SQL Implementation

## Step 1 — Create Master Table

```sql
CREATE TABLE Orders (
    OrderID INT PRIMARY KEY,
    CustomerID INT NOT NULL,
    OrderDate DATE,
    TotalAmount DECIMAL(10,2)
);
```

---

## Step 2 — Create Detail Table

```sql
CREATE TABLE OrderItems (
    OrderItemID INT PRIMARY KEY,
    OrderID INT NOT NULL,
    ProductID INT NOT NULL,
    Quantity INT,
    UnitPrice DECIMAL(10,2),

    FOREIGN KEY (OrderID)
        REFERENCES Orders(OrderID)
);
```

---

## Step 3 — Insert Master Record

```sql
INSERT INTO Orders
VALUES
(1001,5,'2026-07-27',1299.99);
```

---

## Step 4 — Insert Detail Records

```sql
INSERT INTO OrderItems
VALUES
(1,1001,201,1,999.99),
(2,1001,305,2,99.99),
(3,1001,415,1,100.02);
```

---

## Step 5 — Retrieve Complete Order

```sql
SELECT
    o.OrderID,
    o.OrderDate,
    oi.ProductID,
    oi.Quantity,
    oi.UnitPrice
FROM Orders o
JOIN OrderItems oi
ON o.OrderID = oi.OrderID;
```

### Output

| OrderID | OrderDate | ProductID | Qty | UnitPrice |
|---------:|------------|----------:|----:|----------:|
|1001|2026-07-27|201|1|999.99|
|1001|2026-07-27|305|2|99.99|
|1001|2026-07-27|415|1|100.02|

The **Orders** table stores transaction-level information, while **OrderItems** stores each individual product purchased.

---

# How It Works

Instead of storing:

```text
Order

Laptop

Mouse

Keyboard
```

The database stores:

```text
Orders

↓

OrderItems

↓

Each Product
```

The master record acts as the "header" of the transaction.

The detail records represent its individual components.

---

# Real-World Examples

The Master–Detail Pattern appears almost everywhere.

## E-Commerce

```text
Orders

↓

OrderItems
```

---

## Banking

```text
Transaction Batch

↓

Transaction Entries
```

---

## Accounting

```text
Invoice

↓

Invoice Items
```

---

## Purchasing

```text
Purchase Order

↓

Purchase Order Lines
```

---

## Hospital

```text
Patient Visit

↓

Treatments
```

---

## Airline

```text
Booking

↓

Passengers
```

---

## Restaurant

```text
Bill

↓

Ordered Items
```

---

## Manufacturing

```text
Production Order

↓

Production Steps
```

---

# Enterprise Examples

| System | Master | Detail |
|---------|---------|---------|
| ERP | Purchase Order | Purchase Order Items |
| CRM | Quotation | Quotation Items |
| Banking | Loan | EMI Schedule |
| Hospital | Admission | Treatments |
| LMS | Quiz | Questions |
| Government | Application | Documents |
| Logistics | Shipment | Shipment Packages |
| SaaS Billing | Invoice | Invoice Lines |

---

# Advantages

✅ Eliminates duplicate data

✅ Easy to maintain

✅ Supports unlimited detail records

✅ Excellent for reporting

✅ Supports transactions

✅ Easy to extend

---

# Disadvantages

❌ Requires joins

❌ Parent must exist before children

❌ Cascading deletes require careful planning

❌ Transaction handling is important

---

# Performance Considerations

For high-volume transactional systems:

- Index foreign keys (`OrderID`)
- Insert Master before Details
- Use database transactions
- Batch insert detail rows
- Avoid unnecessary joins during reporting

Large enterprise systems often partition detail tables because they grow much faster than master tables.

---

# Best Practices

✔ Use surrogate keys for both tables.

✔ Keep summary information in the Master table.

✔ Store line-specific data in the Detail table.

✔ Use foreign keys to enforce integrity.

✔ Wrap inserts and updates inside a transaction.

✔ Calculate totals from detail rows where appropriate, or maintain cached totals carefully.

---

# Common Mistakes

## Storing Everything in One Table

❌ Bad

```text
Order

Customer

Product

Qty

Price

Order

Customer

Product

Qty

Price
```

Customer and order information are duplicated.

---

## Missing Foreign Key

Without a foreign key:

```text
OrderItems

OrderID = 1001
```

may reference an order that does not exist.

---

## Deleting the Master Incorrectly

Deleting the master record without handling its detail rows creates orphaned records.

Use appropriate `ON DELETE` actions or delete detail rows first.

---

## Mixing Header and Line Data

Avoid storing line-level information such as quantity or unit price in the master table.

Likewise, avoid storing customer name or order date in every detail row.

---

# Transaction Management

The Master–Detail Pattern should usually be executed inside a single transaction.

Example:

```text
BEGIN TRANSACTION

↓

Insert Order

↓

Insert Order Items

↓

Update Inventory

↓

Commit
```

If any step fails:

```text
ROLLBACK
```

This ensures the database remains consistent.

---

# ACID Perspective

This pattern naturally demonstrates the **ACID** properties of transactions.

- **Atomicity** – Either the order and all items are saved, or none are.
- **Consistency** – Foreign keys and constraints remain valid.
- **Isolation** – Concurrent users do not interfere with each other.
- **Durability** – Once committed, the order is permanently stored.

---

# When Should You Use This Pattern?

Use this pattern when:

- One record owns multiple child records.
- Child records cannot exist independently.
- Transactions involve multiple items.
- Reporting requires grouping related records.

---

# When Should You Avoid It?

Avoid this pattern when:

- The child data is optional and unrelated.
- There is only ever one child record.
- The relationship is Many-to-Many (use a Junction Table instead).

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB |
|---------|:-----:|:----------:|:----------:|:------:|:--------:|
| Foreign Keys | ✅ | ✅ | ✅ | ✅ | ✅ |
| Transactions | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cascade Delete | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cascade Update | ✅ | ✅ | ✅ | ✅ | ✅ |

---

# 💡 Did You Know?

Every time you receive an online shopping invoice, you're looking at a Master–Detail structure. The invoice header contains customer and billing information, while the invoice lines list each purchased product. The same pattern is used in accounting software, ERP systems, POS terminals, hospital billing systems, airline bookings, and manufacturing work orders.

---

# Interview Questions

## Basic

1. What is the Master–Detail Pattern?
2. Why is it also called the Header–Line Pattern?
3. What type of relationship does it represent?

## Intermediate

4. Why should detail records reference the master table using a foreign key?
5. Why should inserts be wrapped in a transaction?
6. When should totals be stored versus calculated?

## Advanced

7. How would you handle deleting a master record with thousands of detail records?
8. How would you optimise very large detail tables?
9. Why is this pattern fundamental to ERP and accounting systems?
10. Explain how the ACID properties apply to the Master–Detail Pattern.

---

# Hands-on Exercises

## Exercise 1

Design an Order Management System.

Create:

- Orders
- OrderItems

Draw the ER diagram.

---

## Exercise 2

Design an Invoice system.

Include:

- Invoices
- InvoiceItems

Write the SQL statements.

---

## Exercise 3

Design a Hospital Billing System.

Create:

- PatientBills
- BillItems

Explain why this is a Master–Detail relationship.

---

## Exercise 4

Design a Manufacturing Work Order.

Include:

- WorkOrders
- WorkOrderOperations

Explain the parent-child relationship.

---

## Exercise 5

Build a complete e-commerce order process.

Include:

- Customers
- Orders
- OrderItems
- Payments
- Shipments

Identify which tables follow the Master–Detail Pattern.

---

# Related Patterns

- **03.09.01 — Lookup (Reference) Table Pattern**
- **03.09.03 — Junction Table Pattern**
- **03.09.05 — Status History Pattern**
- **03.09.06 — Audit Log Pattern**

The Master–Detail Pattern is often combined with lookup tables for statuses and payment methods, status history for order tracking, and audit logs to record business events.

---

# Summary

The **Master–Detail Pattern** is one of the most important relational database design patterns. It models a parent-child relationship where a single master record owns multiple detail records. This approach reduces duplication, improves data integrity, supports transactional consistency, and scales well for enterprise applications. Whether you're building an e-commerce platform, ERP system, hospital application, or SaaS product, you'll encounter this pattern repeatedly.