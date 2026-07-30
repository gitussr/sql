---
title: "03.07.10 - Key Selection Decision Tree"
description: "Learn how to choose the right database key using a practical decision tree. This chapter summarizes all database key concepts and provides real-world design recommendations."
chapter: 3
section: 3.7.10
category: Core SQL Concepts
difficulty: Beginner
readingTime: 15 min
lastUpdated: 2026-07-27
---

# 03.07.10 Key Selection Decision Tree

## Learning Objectives

After completing this lesson, you will be able to:

- Choose the correct key for any database table
- Understand when to use Natural Keys
- Understand when to use Surrogate Keys
- Decide whether Composite Keys are appropriate
- Apply enterprise database design best practices
- Avoid common key selection mistakes

---

# Introduction

One of the most common questions in database design is:

> **Which key should I use?**

Should you use:

- Primary Key?
- Natural Key?
- Surrogate Key?
- Composite Key?

The answer depends on your data.

This chapter provides a practical decision tree that database architects commonly follow when designing relational databases.

---

# Key Selection Decision Tree

```text
                        Start
                          │
                          ▼
          Does the table need a unique identifier?
                          │
                 ┌────────┴────────┐
                 │                 │
                No                Yes
                 │                 │
        No Primary Key?      Does a unique business
       (rarely recommended)      identifier exist?
                                   │
                     ┌─────────────┴─────────────┐
                     │                           │
                    No                          Yes
                     │                           │
                     ▼                           ▼
          Create a Surrogate Key      Is it guaranteed to
          (AUTO_INCREMENT / UUID)     remain permanent?
                                       │
                          ┌────────────┴────────────┐
                          │                         │
                         No                        Yes
                          │                         │
                          ▼                         ▼
            Use Surrogate Key +          Use Natural Key
            UNIQUE Constraint            (Optional)
```

---

# Enterprise Decision Tree

Most enterprise systems simplify the decision even further.

```text
Need a Primary Key?

        │
        ▼

Use Surrogate Key

        │
        ▼

Keep all business identifiers

        │
        ▼

Apply UNIQUE constraints

        │
        ▼

Finished
```

This is the approach followed by most modern enterprise applications.

---

# Decision 1

## Is there a natural business identifier?

Examples

✅ Passport Number

✅ ISBN

✅ Vehicle VIN

✅ GSTIN

If **No**

Use a Surrogate Key.

---

# Decision 2

## Can the value ever change?

Examples

```
Email

Phone Number

Address
```

These values can change.

Avoid using them as Primary Keys.

---

Examples

```
ISBN

Passport Number

VIN
```

These rarely change.

Natural Keys may be appropriate.

---

# Decision 3

## Does more than one column identify the record?

Example

```
StudentID

+

CourseID
```

Neither column is unique.

Together,

they form a Composite Key.

---

# Decision 4

## Will other tables reference this record?

If the answer is **Yes**,

prefer a short, stable key.

This reduces:

- Index size
- Join complexity
- Storage requirements

Surrogate Keys usually perform better.

---

# Decision 5

## Is this an enterprise application?

Examples

- ERP
- CRM
- Banking
- HRMS
- Healthcare
- E-commerce
- SaaS
- Government Systems

Recommendation

```
Surrogate Key

+

UNIQUE Constraints
```

This is considered the industry standard.

---

# ER Diagram

## Recommended Enterprise Design

```text
+----------------------------+
|        Customers           |
+----------------------------+
| PK CustomerID              | ← Surrogate Key
| Email (UNIQUE)             |
| PassportNo (UNIQUE)        |
| MobileNo (UNIQUE)          |
| Name                       |
+----------------------------+
            │
            │ 1
            │
            │ *
+----------------------------+
|          Orders            |
+----------------------------+
| PK OrderID                 |
| FK CustomerID              |
| OrderDate                  |
+----------------------------+
```

Notice that relationships use the **Surrogate Key**, while business identifiers remain protected using **UNIQUE** constraints.

---

# Decision Matrix

| Situation | Recommended Key |
|------------|----------------|
| No existing unique identifier | Surrogate Key |
| Permanent business identifier | Natural Key |
| Multiple columns required | Composite Key |
| Enterprise application | Surrogate Key |
| Small academic project | Natural Key or Surrogate Key |
| Many-to-Many table | Composite Key |
| Distributed application | UUID Surrogate Key |
| Public API | Surrogate Key |

---

# Choosing the Right Key

## Scenario 1

Employee Database

Columns

```
EmployeeID

Email

Phone
```

Recommendation

```
Primary Key

↓

EmployeeID
```

Email

```
UNIQUE
```

Phone

```
UNIQUE (Optional)
```

---

## Scenario 2

Books Database

Columns

```
ISBN

Title

Author
```

Recommendation

```
ISBN

↓

Natural Key
```

---

## Scenario 3

Student Enrollment

Columns

```
StudentID

CourseID
```

Recommendation

```
Composite Primary Key

(StudentID, CourseID)
```

or

```
EnrollmentID

↓

Surrogate Key

+

UNIQUE(StudentID, CourseID)
```

The second design is more common in enterprise systems.

---

## Scenario 4

Orders

```
OrderID

CustomerID
```

Recommendation

```
OrderID

↓

Surrogate Key
```

---

# Industry Practice

## Small Projects

Typical choices

- Natural Key
- Composite Key
- Simple Integer ID

Examples

- Student Projects
- College Assignments
- Small Inventory Systems
- Library Systems

---

## Enterprise Applications

Typical choices

- Surrogate Keys
- UUIDs
- UNIQUE Constraints
- Composite UNIQUE Constraints

Examples

- Amazon
- Shopify
- Salesforce
- SAP ERP
- Oracle ERP
- Microsoft Dynamics
- Banking Systems
- Healthcare Systems

---

# Common Mistakes

❌ Using Email as a Primary Key

Emails change.

---

❌ Using Mobile Number

Phone numbers change.

---

❌ Using Composite Keys everywhere

Composite Keys increase complexity.

---

❌ Using long text columns as Primary Keys

Long indexes reduce performance.

---

❌ Ignoring UNIQUE constraints

Business identifiers should remain unique.

---

# 💡 Did You Know?

Many developers believe there is a single "best" key type.

There isn't.

Professional database designers choose keys based on:

- Business requirements
- Performance
- Stability
- Scalability
- Maintainability

The best design is the one that balances all of these factors.

---

# Enterprise Best Practices

✅ Use integer Surrogate Keys for Primary Keys.

✅ Protect business identifiers using `UNIQUE` constraints.

✅ Keep Foreign Keys short.

✅ Avoid updating Primary Keys.

✅ Use UUIDs for distributed systems.

✅ Document the purpose of every key.

✅ Review key choices during database design, not after deployment.

---

# Quick Reference

| Requirement | Recommended Solution |
|-------------|----------------------|
| Stable identifier | Surrogate Key |
| Existing permanent business identifier | Natural Key |
| Multiple identifying columns | Composite Key |
| Enterprise application | Surrogate Key + UNIQUE |
| Small application | Natural Key or Surrogate Key |
| Distributed system | UUID |
| Many-to-Many relationship | Composite Key or Surrogate Key + Composite UNIQUE |

---

# Summary Flowchart

```text
Need Unique Identifier
        │
        ▼
Existing Business Identifier?
        │
   Yes ─────────────── No
    │                   │
    ▼                   ▼
Permanent?         Surrogate Key
    │
Yes ───── No
 │          │
 ▼          ▼
Natural   Surrogate Key
 Key      + UNIQUE

Need Multiple Columns?

        │
     Yes ▼
Composite Key

Enterprise Project?

        │
     Yes ▼
Surrogate Key
+
UNIQUE Constraints
```

---

# Interview Questions

### Which key is recommended for enterprise applications?

Surrogate Keys are generally recommended because they are stable, compact and independent of business data.

---

### When should a Natural Key be used?

When a business identifier is unique, permanent and unlikely to change.

---

### When is a Composite Key required?

When no single column can uniquely identify a record.

---

### Why should Email usually not be a Primary Key?

Because email addresses can change over time.

---

### Why do enterprise systems still keep Natural Keys?

They are valuable business identifiers and are typically protected using `UNIQUE` constraints.

---

# Hands-on Exercises

## Exercise 1

For each scenario, choose the most appropriate key type:

| Scenario | Recommended Key |
|----------|-----------------|
| Library Books | ? |
| Employee Records | ? |
| Student Enrollments | ? |
| Banking Customers | ? |
| Flight Reservations | ? |

Explain your reasoning.

---

## Exercise 2

Design an **E-Commerce** database.

Choose appropriate keys for:

- Customers
- Products
- Orders
- OrderItems
- Categories

---

## Exercise 3

Take an existing database (e.g., a WordPress or WooCommerce database) and identify:

- Primary Keys
- Foreign Keys
- Natural Keys
- Surrogate Keys
- Composite Keys (if any)

---

# Chapter Summary

In this lesson, you learned:

- How to choose the right database key
- When to use Natural Keys
- When to use Surrogate Keys
- When Composite Keys are appropriate
- Enterprise database design strategies
- Common key selection mistakes
- Industry best practices

This chapter ties together all key concepts you've learned so far. Rather than memorizing definitions, focus on understanding **why** a particular key type is chosen for a given design. That's the mindset used by experienced database designers.

---

# Related Topics

### Previous Lessons

- **03.07.01** — Primary Key
- **03.07.02** — Foreign Key
- **03.07.03** — Candidate Key
- **03.07.04** — Alternate Key
- **03.07.05** — Composite Key
- **03.07.06** — Super Key
- **03.07.07** — Surrogate Key
- **03.07.08** — Natural Key

### Next Lessons

- **03.08** — Relationships in Databases
- **03.09** — Entity-Relationship (ER) Diagrams
- **03.10** — Database Normalization

### Recommended Reading

- Database Design Best Practices
- SQL Constraints
- Database Normalization
- Entity-Relationship (ER) Diagrams
- Primary Key Design Strategies

---

# What's Next?

In **03.08 – Relationships in Databases**, you'll learn how tables are connected using **One-to-One, One-to-Many, and Many-to-Many** relationships, and how Foreign Keys enforce those relationships in relational database systems.