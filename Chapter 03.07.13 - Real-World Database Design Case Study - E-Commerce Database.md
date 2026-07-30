---
title: "03.07.13 - Real-World Database Design Case Study: E-Commerce Database"
description: "Learn how modern e-commerce platforms like Amazon, Shopify, WooCommerce, and Magento design relational databases using Primary Keys, Foreign Keys, Surrogate Keys, Natural Keys, Composite Keys, and enterprise best practices."
chapter: 3
section: 3.7.13
category: Real-World Database Design
difficulty: Intermediate
readingTime: 45 min
lastUpdated: 2026-07-27
---

# 03.07.13 Real-World Database Design Case Study

# E-Commerce Database Design

---

# Learning Objectives

After completing this lesson, you will be able to:

- Design a production-ready e-commerce database
- Understand relationships between customers, orders and products
- Implement Order Items using junction tables
- Choose appropriate database keys
- Apply enterprise database design principles
- Understand how platforms like Amazon, Shopify and WooCommerce organise data

---

# Business Requirements

An online shopping platform should manage:

- Customers
- Products
- Categories
- Orders
- Order Items
- Payments
- Shipping

The system should allow:

- One customer to place many orders
- One order to contain multiple products
- One product to appear in many orders
- Payment tracking
- Shipment tracking

---

# Step 1 — Identify the Entities

```
Customers

Categories

Products

Orders

OrderItems

Payments

Shipping
```

Each entity becomes a table.

---

# Step 2 — Identify Relationships

```
Customer

1
│
│
*
Orders

------------------

Category

1
│
│
*
Products

------------------

Orders

*
│
│
*
Products

↓

OrderItems

------------------

Orders

1
│
│
1

Payments

------------------

Orders

1
│
│
1

Shipping
```

---

# Step 3 — Enterprise ER Diagram

```text

                   +----------------------+
                   |      Categories      |
                   +----------------------+
                   | PK CategoryID        |
                   | CategoryName         |
                   +----------+-----------+
                              |
                              |1
                              |
                              |*
                   +----------+-----------+
                   |      Products        |
                   +----------------------+
                   | PK ProductID         |
                   | SKU (UNIQUE)         |
                   | ProductName          |
                   | Price                |
                   | FK CategoryID        |
                   +----------+-----------+
                              |
                              |
                              |
          +-------------------+-------------------+
          |                                       |
          |                                       |
          ▼                                       ▼

+----------------------+              +----------------------+
|      OrderItems      |              |       Orders         |
+----------------------+              +----------------------+
| PK OrderItemID       |              | PK OrderID           |
| FK OrderID           |<-------------| FK CustomerID        |
| FK ProductID         |              | OrderDate            |
| Quantity             |              | Status               |
| UnitPrice            |              +----------+-----------+
| UNIQUE(OrderID,      |                         |
|        ProductID)    |                         |
+----------------------+                         |
                                                  |
                                                  |
                               +------------------+------------------+
                               |                                     |
                               ▼                                     ▼

                      +------------------+                 +------------------+
                      |     Payments     |                 |     Shipping     |
                      +------------------+                 +------------------+
                      | PK PaymentID     |                 | PK ShippingID    |
                      | FK OrderID       |                 | FK OrderID       |
                      | Amount           |                 | Courier          |
                      | PaymentStatus    |                 | TrackingNumber   |
                      +------------------+                 +------------------+

                     ▲

                     │*

                     │

          +----------------------+
          |      Customers       |
          +----------------------+
          | PK CustomerID        |
          | Email (UNIQUE)       |
          | Phone (UNIQUE)       |
          | Name                 |
          +----------------------+

```

---

# Step 4 — Table Design

## Customers

| Column | Key |
|----------|-----|
| CustomerID | Primary Key (Surrogate) |
| Email | Alternate + Natural Key |
| Phone | Alternate Key |
| Name | Normal Column |

---

### Why CustomerID?

Customers may change:

- Email
- Phone
- Name

CustomerID never changes.

---

## Categories

| Column | Key |
|----------|-----|
| CategoryID | Primary Key |
| CategoryName | UNIQUE |

---

## Products

| Column | Key |
|----------|-----|
| ProductID | Primary Key |
| SKU | Natural Key + UNIQUE |
| CategoryID | Foreign Key |

---

### Why SKU is not the Primary Key?

A SKU may change because of:

- Product migration
- Warehouse restructuring
- Supplier changes

Enterprise systems usually keep SKU as UNIQUE.

---

## Orders

| Column | Key |
|----------|-----|
| OrderID | Primary Key |
| CustomerID | Foreign Key |

Relationship

```
Customer

1

↓

Many Orders
```

---

## OrderItems

| Column | Key |
|----------|-----|
| OrderItemID | Primary Key |
| OrderID | Foreign Key |
| ProductID | Foreign Key |
| Quantity | Data |
| UnitPrice | Data |
| UNIQUE(OrderID, ProductID) | Composite Alternate Key |

---

### Why OrderItemID?

Instead of

```
PRIMARY KEY
(
OrderID,
ProductID
)
```

Enterprise databases often use

```
OrderItemID

↓

Primary Key

+

UNIQUE
(
OrderID,
ProductID
)
```

Benefits

- Smaller joins
- Easier referencing
- Simpler indexing

---

## Payments

| Column | Key |
|----------|-----|
| PaymentID | Primary Key |
| OrderID | Foreign Key |

---

## Shipping

| Column | Key |
|----------|-----|
| ShippingID | Primary Key |
| OrderID | Foreign Key |

---

# Step 5 — SQL Example

## Customers

```sql
CREATE TABLE Customers
(
    CustomerID INT AUTO_INCREMENT PRIMARY KEY,

    Name VARCHAR(100),

    Email VARCHAR(100) UNIQUE,

    Phone VARCHAR(20) UNIQUE
);
```

---

## Products

```sql
CREATE TABLE Products
(
    ProductID INT AUTO_INCREMENT PRIMARY KEY,

    SKU VARCHAR(50) UNIQUE,

    ProductName VARCHAR(100),

    Price DECIMAL(10,2),

    CategoryID INT,

    FOREIGN KEY(CategoryID)
    REFERENCES Categories(CategoryID)
);
```

---

## Orders

```sql
CREATE TABLE Orders
(
    OrderID INT AUTO_INCREMENT PRIMARY KEY,

    CustomerID INT,

    OrderDate DATETIME,

    Status VARCHAR(30),

    FOREIGN KEY(CustomerID)
    REFERENCES Customers(CustomerID)
);
```

---

## OrderItems

```sql
CREATE TABLE OrderItems
(
    OrderItemID INT AUTO_INCREMENT PRIMARY KEY,

    OrderID INT,

    ProductID INT,

    Quantity INT,

    UnitPrice DECIMAL(10,2),

    UNIQUE(OrderID, ProductID),

    FOREIGN KEY(OrderID)
    REFERENCES Orders(OrderID),

    FOREIGN KEY(ProductID)
    REFERENCES Products(ProductID)
);
```

---

# Step 6 — Sample Data

## Customers

| CustomerID | Name |
|------------|------|
|1|John|
|2|Alice|

---

## Products

| ProductID | Product |
|------------|---------|
|101|Laptop|
|102|Mouse|
|103|Keyboard|

---

## Orders

| OrderID | CustomerID |
|----------|------------|
|1001|1|
|1002|2|

---

## OrderItems

| OrderID | ProductID | Qty |
|----------|-----------|-----|
|1001|101|1|
|1001|102|2|
|1002|103|1|

---

# Step 7 — Identify Every Key

| Table | Primary | Foreign | Natural | Surrogate | Alternate | Composite |
|---------|----------|----------|----------|------------|------------|------------|
| Customers | CustomerID | — | Email | CustomerID | Phone | — |
| Categories | CategoryID | — | CategoryName | CategoryID | — | — |
| Products | ProductID | CategoryID | SKU | ProductID | SKU | — |
| Orders | OrderID | CustomerID | — | OrderID | — | — |
| OrderItems | OrderItemID | OrderID, ProductID | — | OrderItemID | UNIQUE(OrderID,ProductID) | Yes |
| Payments | PaymentID | OrderID | — | PaymentID | — | — |
| Shipping | ShippingID | OrderID | — | ShippingID | — | — |

---

# Step 8 — Relationship Summary

| Parent | Child | Relationship |
|---------|-------|--------------|
| Customer | Orders | One-to-Many |
| Category | Products | One-to-Many |
| Order | OrderItems | One-to-Many |
| Product | OrderItems | One-to-Many |
| Order | Payment | One-to-One |
| Order | Shipping | One-to-One |
| Orders ↔ Products | Through OrderItems | Many-to-Many |

---

# Why OrderItems Exists

Imagine an order.

```
Order #1001

Laptop

Mouse

Keyboard
```

If product information were stored directly inside the **Orders** table, we'd either need multiple product columns or duplicate the order for each product.

Instead, the database separates order details into an **OrderItems** table.

```
Orders

↓

One Order

↓

OrderItems

↓

Many Products
```

This design:

- Eliminates redundancy
- Supports unlimited products per order
- Preserves data integrity
- Simplifies reporting

---

# Enterprise Design Pattern

```text
Customers

↓

Orders

↓

OrderItems

↓

Products
```

Almost every major e-commerce platform follows this structure.

---

# 💡 Did You Know?

Platforms such as **WooCommerce**, **Shopify**, **Magento**, **Adobe Commerce**, and many custom e-commerce systems all separate **Orders** from **Order Items**.

Why?

Because an order represents a transaction, while order items represent the individual products purchased within that transaction. This separation improves scalability, reporting, inventory management, and pricing flexibility.

---

# Best Practices

✅ Use integer Surrogate Keys.

✅ Keep SKU as UNIQUE.

✅ Store product prices inside OrderItems.

✅ Never calculate historical prices from the Products table.

✅ Use Foreign Keys.

✅ Prevent duplicate products within the same order using:

```sql
UNIQUE(OrderID, ProductID)
```

---

# Common Mistakes

❌ Storing multiple products in one Orders row.

---

❌ Not storing UnitPrice in OrderItems.

If product prices change later, historical orders become incorrect.

---

❌ Using Email as a Foreign Key.

---

❌ Allowing duplicate OrderID + ProductID combinations.

---

# Interview Questions

### Why do we need an OrderItems table?

Because one order can contain multiple products, and one product can appear in many orders.

---

### What relationship exists between Orders and Products?

Many-to-Many.

Implemented using the OrderItems junction table.

---

### Why store UnitPrice in OrderItems instead of Products?

To preserve the actual purchase price at the time of the order.

---

### Why isn't SKU used as the Primary Key?

SKUs can change due to business requirements, whereas Surrogate Keys remain stable.

---

### Why is CustomerID preferred over Email?

CustomerID never changes, while email addresses can.

---

# Hands-on Exercises

## Exercise 1

Create all seven tables.

---

## Exercise 2

Insert:

- 5 Customers
- 10 Products
- 3 Categories
- 10 Orders
- 20 OrderItems

---

## Exercise 3

Write SQL queries to:

- Show all orders for a customer.
- List products in an order.
- Calculate the total order value.
- Find the most sold product.
- Display orders awaiting shipment.

---

## Exercise 4

Extend the database by adding:

- Coupons
- Shopping Cart
- Product Reviews
- Wishlists
- Inventory
- Suppliers

Design the required tables and relationships.

---

# Chapter Summary

In this case study, you learned how a modern e-commerce database is designed using industry-standard relational database principles.

You applied:

- Primary Keys
- Foreign Keys
- Surrogate Keys
- Natural Keys
- Composite Keys
- Alternate Keys
- Junction Tables
- One-to-One Relationships
- One-to-Many Relationships
- Many-to-Many Relationships
- `UNIQUE` Constraints

This architecture closely resembles the design patterns used in production-grade e-commerce platforms and provides a scalable foundation for handling customers, products, orders, and fulfilment.

---

# Related Topics

### Previous Lessons

- 03.07.01 – Primary Key
- 03.07.02 – Foreign Key
- 03.07.05 – Composite Key
- 03.07.07 – Surrogate Key
- 03.07.08 – Natural Key
- 03.07.11 – Comparison of All Keys
- 03.07.12 – Student Management System

### Next Case Study

**03.07.14 – Banking System Database Design**

You'll learn how banks model customers, accounts, transactions, cards, and branches while maintaining data integrity, auditability, and security.