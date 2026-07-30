---
title: "03.08.09.02 - Real-World Relationship Case Study: E-Commerce Platform"
description: "Learn how a production-grade E-Commerce platform is designed using relational database concepts including relationships, keys, constraints, junction tables, referential integrity, inventory management, payments, shipping, and order processing."
chapter: 3
section: 3.8.9.2
category: Core SQL Concepts
difficulty: Intermediate
readingTime: 60 min
lastUpdated: 2026-07-27
---

# 03.08.09.02 E-Commerce Platform

## Learning Objectives

After completing this lesson, you will be able to:

- Analyse a real-world E-Commerce system
- Identify business entities and relationships
- Design scalable database schemas
- Apply normalization principles
- Choose appropriate keys and constraints
- Design inventory, payment, and shipping relationships
- Understand enterprise database architecture

---

# Introduction

An E-Commerce platform is one of the best examples of relational database design because it combines nearly every type of relationship.

Major platforms such as:

- Amazon
- Shopify
- WooCommerce
- Magento (Adobe Commerce)
- BigCommerce
- Flipkart

all rely on carefully designed relational databases.

A single customer order may involve:

- Multiple products
- Multiple payments
- Shipping addresses
- Discounts
- Taxes
- Inventory updates
- Customer reviews
- Coupons
- Returns

Managing these efficiently requires a well-structured database.

---

# Business Requirements

The platform should support:

- Customer registration
- Multiple addresses
- Product catalogue
- Categories and subcategories
- Brands
- Suppliers
- Product inventory
- Shopping cart
- Orders
- Order items
- Payments
- Shipments
- Coupons
- Product reviews
- Wishlists

---

# Step 1 — Identify Entities

| Entity | Purpose |
|----------|----------|
| Customers | Customer accounts |
| Addresses | Billing & shipping addresses |
| Products | Product catalogue |
| Categories | Product categories |
| Brands | Product brands |
| Suppliers | Product suppliers |
| Inventory | Stock information |
| ShoppingCart | Active shopping cart |
| CartItems | Products in cart |
| Orders | Customer orders |
| OrderItems | Ordered products |
| Payments | Payment details |
| Shipments | Delivery tracking |
| Coupons | Discount codes |
| Reviews | Product reviews |
| Wishlist | Saved products |

---

# Step 2 — Identify Relationships

| Parent | Child | Relationship |
|----------|--------|-------------|
| Customer → Addresses | One-to-Many |
| Customer → Orders | One-to-Many |
| Customer → Reviews | One-to-Many |
| Customer → Wishlist | One-to-Many |
| Customer → ShoppingCart | One-to-One |
| Category → Products | One-to-Many |
| Brand → Products | One-to-Many |
| Supplier → Products | One-to-Many *(simplified)* |
| Product → Inventory | One-to-One |
| Order → Payments | One-to-Many |
| Order → Shipments | One-to-Many |
| Order → OrderItems | One-to-Many |
| Product → OrderItems | One-to-Many |
| ShoppingCart → CartItems | One-to-Many |
| Product → CartItems | One-to-Many |
| Customer ↔ Products (Wishlist) | Many-to-Many |
| Orders ↔ Products | Many-to-Many (resolved by OrderItems) |

> **Note:** In some enterprise systems, Products ↔ Suppliers is also a Many-to-Many relationship using a `ProductSuppliers` junction table. For simplicity, this case study uses One-to-Many.

---

# High-Level ER Diagram

```text
Customers
     │
     ├──────────────┐
     ▼              ▼
Addresses        Orders
                    │
      ┌─────────────┼─────────────┐
      ▼             ▼             ▼
Payments      Shipments     OrderItems
                                   │
                                   ▼
                               Products
                          ┌────────┼────────┐
                          ▼        ▼        ▼
                    Categories  Brands  Inventory
                          │
                          ▼
                       Reviews

Customers
     │
     ▼
ShoppingCart
     │
     ▼
CartItems
     │
     ▼
Products

Customers
     │
     ▼
Wishlist
     │
     ▼
Products
```

---

# Relationship Breakdown

## One-to-One

```
Products

↓

Inventory
```

Each product has one inventory record.

---

```
Customers

↓

ShoppingCart
```

Each customer has one active shopping cart.

---

## One-to-Many

```
Customer

↓

Orders
```

---

```
Customer

↓

Addresses
```

---

```
Category

↓

Products
```

---

```
Brand

↓

Products
```

---

```
Order

↓

Payments
```

A customer may pay using split payments, gift cards, or refunds.

---

```
Order

↓

Shipments
```

One order may be shipped in multiple packages.

---

```
Order

↓

OrderItems
```

---

## Many-to-Many

### Orders ↔ Products

Resolved using:

```
Orders

↓

OrderItems

↓

Products
```

---

### Customers ↔ Products (Wishlist)

Resolved using:

```
Customers

↓

Wishlist

↓

Products
```

---

# Database Tables

## Customers

| Column | Key |
|----------|-----|
| CustomerID | Primary Key |
| FirstName | |
| LastName | |
| Email | Unique |
| Phone | |

---

## Addresses

| Column | Key |
|----------|-----|
| AddressID | Primary Key |
| CustomerID | Foreign Key |
| AddressType | |
| City | |
| Country | |

---

## Categories

| Column | Key |
|----------|-----|
| CategoryID | Primary Key |
| ParentCategoryID | Self-Referencing FK |
| CategoryName | |

Supports unlimited category levels.

---

## Products

| Column | Key |
|----------|-----|
| ProductID | Primary Key |
| CategoryID | Foreign Key |
| BrandID | Foreign Key |
| SupplierID | Foreign Key |
| SKU | Unique |
| ProductName | |

---

## Inventory

| Column | Key |
|----------|-----|
| InventoryID | Primary Key |
| ProductID | Foreign Key |
| Quantity | |
| WarehouseLocation | |

---

## Orders

| Column | Key |
|----------|-----|
| OrderID | Primary Key |
| CustomerID | Foreign Key |
| OrderDate | |
| Status | |
| TotalAmount | |

---

## OrderItems

| Column | Key |
|----------|-----|
| OrderItemID | Primary Key |
| OrderID | Foreign Key |
| ProductID | Foreign Key |
| Quantity | |
| UnitPrice | |
| Discount | |

---

## Payments

| Column | Key |
|----------|-----|
| PaymentID | Primary Key |
| OrderID | Foreign Key |
| PaymentMethod | |
| Amount | |
| PaymentStatus | |

---

## Shipments

| Column | Key |
|----------|-----|
| ShipmentID | Primary Key |
| OrderID | Foreign Key |
| Courier | |
| TrackingNumber | |
| DeliveryStatus | |

---

# Key Selection Strategy

| Table | Primary Key |
|---------|-------------|
| Customers | CustomerID |
| Products | ProductID |
| Orders | OrderID |
| OrderItems | OrderItemID |
| Inventory | InventoryID |
| Shipments | ShipmentID |

All tables use **Surrogate Keys** (`INT AUTO_INCREMENT`) for simplicity and scalability.

Business identifiers such as:

- SKU
- Email
- TrackingNumber

should be protected using **UNIQUE** constraints rather than used as Primary Keys.

---

# Constraints

Recommended constraints include:

- PRIMARY KEY
- FOREIGN KEY
- UNIQUE
- NOT NULL
- CHECK (where supported)

Example:

```sql
UNIQUE (SKU)

UNIQUE (Email)

UNIQUE (OrderID, ProductID)
```

The final constraint prevents the same product from appearing multiple times within one order.

---

# Cascade Strategy

| Parent | Child | Recommended Action | Reason |
|---------|----------------|--------------|----------------|
| Customer | Addresses | CASCADE | Personal addresses are no longer needed |
| Customer | Orders | RESTRICT | Preserve order history |
| Orders | OrderItems | CASCADE | Items belong to the order |
| Orders | Payments | RESTRICT | Financial records must remain |
| Orders | Shipments | RESTRICT | Shipping history is retained |
| Products | Inventory | CASCADE | Inventory belongs to the product |
| Categories | Products | RESTRICT | Prevent accidental catalogue deletion |
| Products | Reviews | RESTRICT | Preserve customer reviews |

---

# Sample SQL Schema

```sql
CREATE TABLE OrderItems
(
    OrderItemID INT AUTO_INCREMENT PRIMARY KEY,

    OrderID INT NOT NULL,

    ProductID INT NOT NULL,

    Quantity INT NOT NULL,

    UnitPrice DECIMAL(10,2),

    Discount DECIMAL(10,2) DEFAULT 0,

    UNIQUE (OrderID, ProductID),

    FOREIGN KEY (OrderID)
        REFERENCES Orders(OrderID),

    FOREIGN KEY (ProductID)
        REFERENCES Products(ProductID)
);
```

### Explanation

- `OrderID` references the order.
- `ProductID` references the purchased product.
- `Quantity`, `UnitPrice`, and `Discount` describe the relationship.
- `UNIQUE (OrderID, ProductID)` prevents duplicate product rows within the same order.

---

# Sample Data Flow

```text
Customer

↓

Shopping Cart

↓

Cart Items

↓

Checkout

↓

Order

↓

Order Items

↓

Payment

↓

Shipment

↓

Delivery

↓

Review
```

---

# Performance Considerations

Enterprise E-Commerce systems often manage millions of products and orders.

Best practices:

- Index all Foreign Keys.
- Index `SKU`, `Email`, and `OrderDate`.
- Partition very large `Orders` tables by date where supported.
- Archive historical orders rather than deleting them.
- Cache product catalogue data.
- Optimise reporting queries with execution plans.

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB |
|---------|:-----:|:----------:|:----------:|:------:|:--------:|
| Foreign Keys | ✅ | ✅ | ✅ | ✅ | ✅ |
| Self-Referencing Categories | ✅ | ✅ | ✅ | ✅ | ✅ |
| Recursive CTEs | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cascade Actions | ✅ | ✅ | ✅ | ✅ | ✅ |
| CHECK Constraints | ✅ (8.0.16+) | ✅ | ✅ | ✅ | ✅ |

---

# Scalability Notes

As the platform grows, additional modules are typically introduced:

- Multi-vendor marketplace
- Multiple warehouses
- Inventory reservations
- Product variants (size, colour, etc.)
- Returns and refunds
- Loyalty programmes
- Gift cards
- Subscription products
- Tax calculation
- Multi-currency support
- Multi-language catalogue
- Recommendation engine
- Audit logs
- Event sourcing

The core relationship model remains largely unchanged, demonstrating the importance of a solid initial design.

---

# Security Considerations

Never store:

- Plain-text passwords
- Raw payment card information
- CVV values

Instead:

- Store password hashes.
- Use payment gateway tokens.
- Encrypt sensitive customer information where required.
- Apply role-based access control (RBAC) for administrative functions.

---

# 💡 Did You Know?

Large platforms such as Amazon may process millions of orders per day, but the core relational concepts remain the same:

- Customers place Orders.
- Orders contain OrderItems.
- Products belong to Categories.
- Payments and Shipments reference Orders.

The scale changes dramatically, but the underlying database design principles remain consistent.

---

# Interview Questions

1. Why is `OrderItems` a Junction Table?
2. Why shouldn't products be stored directly in the `Orders` table?
3. Why is `Inventory` separated from `Products`?
4. Why is `CategoryID` self-referencing?
5. Why should order history usually use `RESTRICT` instead of `CASCADE`?
6. Which columns should have indexes?
7. Why should `SKU` use a `UNIQUE` constraint instead of being the Primary Key?

---

# Hands-on Exercises

### Exercise 1

Draw the complete ER diagram for this E-Commerce platform.

---

### Exercise 2

Create all tables with appropriate Primary Keys, Foreign Keys, and constraints.

---

### Exercise 3

Insert sample data for:

- 20 Customers
- 100 Products
- 10 Categories
- 50 Orders
- 200 OrderItems

---

### Exercise 4

Write SQL queries to display:

- Customer order history
- Order details with products
- Inventory status
- Products by category
- Customer wishlist
- Shipment tracking information

---

### Exercise 5

Extend the design by adding:

- Returns
- Refunds
- Coupons
- Product Variants
- Warehouses

Explain the new relationships introduced.

---

# Summary

This case study demonstrated how a production-grade E-Commerce platform combines One-to-One, One-to-Many, Many-to-Many, Self-Referencing Relationships, Junction Tables, Referential Integrity, and Cascade Actions to create a scalable relational database.

Although enterprise platforms may add dozens of additional modules over time, the core relationship model remains the foundation of the entire system.

---

# Related Topics

### Previous Lessons

- 03.08.01 — One-to-One Relationship
- 03.08.02 — One-to-Many Relationship
- 03.08.03 — Many-to-Many Relationship
- 03.08.04 — Junction (Bridge) Tables
- 03.08.05 — Referential Integrity
- 03.08.06 — Cascade Actions
- 03.08.07 — Self-Referencing Relationships
- 03.08.08 — Relationship Design Best Practices
- 03.08.09.01 — Student Management System

### Next Lesson

**03.08.09.03 — Real-World Relationship Case Study: Hospital Management System**