---
title: "03.07.10 - Interview Questions & Exercises"
description: "Practice interview questions, scenario-based discussions, MCQs, SQL exercises, and real-world challenges covering all database key concepts."
chapter: 3
section: 3.7.10.01
category: Core SQL Concepts
difficulty: Beginner
readingTime: 30 min
lastUpdated: 2026-07-27
---

# 03.07.10 Interview Questions & Exercises

## Learning Objectives

After completing this lesson, you will be able to:

- Revise every database key
- Prepare for technical interviews
- Strengthen database design skills
- Apply keys in real-world scenarios
- Practice SQL implementation

---

# Quick Revision

| Key Type | Purpose |
|----------|----------|
| Primary Key | Official unique identifier |
| Foreign Key | Connects tables |
| Candidate Key | Minimal unique identifier |
| Alternate Key | Candidate Key not selected |
| Composite Key | Multiple columns identify one row |
| Super Key | Any unique column combination |
| Surrogate Key | System-generated identifier |
| Natural Key | Business identifier |

---

# Part A — Basic Interview Questions

### 1. What is a Primary Key?

A Primary Key uniquely identifies every row in a table.

---

### 2. Can a table have multiple Primary Keys?

No.

Only one Primary Key is allowed per table.

---

### 3. Can a Primary Key contain NULL?

No.

---

### 4. What is a Foreign Key?

A Foreign Key creates a relationship between two tables by referencing a Primary Key (or UNIQUE key) in another table.

---

### 5. Can a Foreign Key contain NULL?

Yes.

If the relationship is optional and the column allows `NULL`.

---

### 6. What is a Candidate Key?

A minimal column (or column combination) capable of uniquely identifying a record.

---

### 7. What is an Alternate Key?

A Candidate Key that was **not** chosen as the Primary Key.

---

### 8. What is a Composite Key?

A key made from two or more columns.

---

### 9. What is a Super Key?

A column or combination of columns that uniquely identifies a row, even if it contains unnecessary columns.

---

### 10. What is a Surrogate Key?

A database-generated identifier with no business meaning.

---

### 11. What is a Natural Key?

A real-world business value that uniquely identifies a record.

---

# Part B — Intermediate Interview Questions

### Why are Surrogate Keys preferred in enterprise systems?

Because they:

- Never change
- Produce smaller indexes
- Improve joins
- Simplify maintenance
- Are independent of business rules

---

### Why shouldn't Email usually be a Primary Key?

Because users can change email addresses.

---

### What is the difference between a Candidate Key and a Primary Key?

A Candidate Key **can** become the Primary Key.

The Primary Key is the Candidate Key selected by the database designer.

---

### Can a Composite Key also be a Primary Key?

Yes.

Example:

```sql
PRIMARY KEY(StudentID, CourseID)
```

---

### Is every Primary Key a Candidate Key?

Yes.

---

### Is every Candidate Key a Super Key?

Yes.

Every Candidate Key is also a Super Key because it uniquely identifies a row.

---

### Is every Super Key a Candidate Key?

No.

A Super Key may contain unnecessary columns.

---

### Can a Natural Key be the Primary Key?

Yes.

If it is stable, unique, and permanent.

---

# Part C — Advanced Interview Questions

### Why do large companies rarely use Natural Keys as Primary Keys?

Because business values can change, increasing maintenance costs and affecting related tables.

---

### Why do enterprise databases still store Natural Keys?

To enforce business uniqueness using `UNIQUE` constraints and provide meaningful identifiers.

---

### Why are Composite Keys common in junction tables?

Because junction tables often represent Many-to-Many relationships where the combination of two Foreign Keys uniquely identifies a record.

---

### Explain the relationship between Primary, Candidate, and Alternate Keys.

- Candidate Keys are all possible unique identifiers.
- One Candidate Key is selected as the Primary Key.
- The remaining Candidate Keys become Alternate Keys.

---

### Why should Primary Keys rarely be updated?

Updating a Primary Key may require updating every related Foreign Key, increasing complexity and risking data inconsistency.

---

# Part D — Scenario-Based Questions

## Scenario 1

Customer table

```text
CustomerID

Email

Phone
```

Which column should be the Primary Key?

**Answer**

`CustomerID`

Reason:

Email and phone numbers can change.

---

## Scenario 2

Books

```text
ISBN

Title

Author
```

Should ISBN be the Primary Key?

**Answer**

Yes, because ISBN is globally unique and stable.

---

## Scenario 3

Student Enrollment

```text
StudentID

CourseID
```

Should you use:

```
PRIMARY KEY(StudentID, CourseID)
```

or

```
EnrollmentID
```

**Recommended**

Enterprise systems usually prefer:

- `EnrollmentID` as the Primary Key
- `UNIQUE(StudentID, CourseID)`

---

## Scenario 4

Employee table

```text
EmployeeID

PAN

Email
```

Which column is the Natural Key?

**Answer**

`PAN`

---

## Scenario 5

Orders

```text
OrderID

CustomerID
```

Which column is the Foreign Key?

**Answer**

`CustomerID`

---

# Part E — Multiple Choice Questions

### 1. Which key uniquely identifies each record?

A. Foreign Key

B. Composite Key

C. Primary Key

D. Super Key

✅ **Answer:** C

---

### 2. Which key references another table?

A. Candidate Key

B. Primary Key

C. Foreign Key

D. Natural Key

✅ **Answer:** C

---

### 3. Which key is generated by the database?

A. Natural Key

B. Surrogate Key

C. Candidate Key

D. Alternate Key

✅ **Answer:** B

---

### 4. Which key may contain unnecessary columns?

A. Candidate Key

B. Primary Key

C. Super Key

D. Composite Key

✅ **Answer:** C

---

### 5. Which key represents business data?

A. Surrogate Key

B. Foreign Key

C. Natural Key

D. Composite Key

✅ **Answer:** C

---

# Part F — SQL Exercises

## Exercise 1

Create a `Customers` table with:

- Primary Key
- Email UNIQUE
- Phone UNIQUE

---

## Exercise 2

Create an `Orders` table with a Foreign Key to `Customers`.

---

## Exercise 3

Create a junction table named `Enrollments`.

Requirements

- StudentID
- CourseID
- Composite UNIQUE

---

## Exercise 4

Create a `Books` table using `ISBN` as the Primary Key.

---

## Exercise 5

Modify an existing table by adding a Foreign Key.

---

# Part G — Database Design Exercises

## Exercise 1

Design keys for:

- Hospital Management System
- Banking System
- Airline Reservation System

Identify:

- Primary Keys
- Foreign Keys
- Natural Keys
- Surrogate Keys

---

## Exercise 2

Design an Online Shopping System.

Choose keys for:

- Customers
- Products
- Orders
- OrderItems
- Payments

---

## Exercise 3

Create an ER Diagram for a Library Management System.

---

# Part H — Challenge Questions

### Challenge 1

Can a Composite Key also be a Candidate Key?

Explain with an example.

---

### Challenge 2

Can a Natural Key also be an Alternate Key?

Provide a real-world example.

---

### Challenge 3

Why is `UNIQUE(StudentID, CourseID)` often preferred over a Composite Primary Key in enterprise systems?

---

### Challenge 4

A company wants to use Email as the Primary Key.

Would you recommend this?

Explain your reasoning.

---

### Challenge 5

You are designing a Food Delivery App.

Choose the appropriate keys for:

- Users
- Restaurants
- Menu Items
- Orders
- Delivery Partners
- Payments

Justify every decision.

---

# 💡 Did You Know?

During senior software engineering interviews, you're rarely asked to define a Primary Key.

Instead, interviewers present a business scenario and ask:

> *"Design the database. Which keys would you choose, and why?"*

The quality of your reasoning is often more important than memorising definitions.

---

# Common Mistakes

❌ Memorising definitions without understanding use cases.

---

❌ Choosing Email or Phone as a Primary Key.

---

❌ Ignoring `UNIQUE` constraints.

---

❌ Overusing Composite Keys.

---

❌ Forgetting to enforce Foreign Key relationships.

---

# Best Practices

✅ Prefer Surrogate Keys for enterprise Primary Keys.

✅ Protect business identifiers using `UNIQUE`.

✅ Keep Foreign Keys small and stable.

✅ Use Composite Keys only when they simplify the design.

✅ Always think about long-term maintainability.

---

# Self-Assessment Checklist

Can you confidently answer **Yes** to these?

- [ ] I can explain every database key.
- [ ] I know when to use a Primary Key.
- [ ] I know when a Natural Key is appropriate.
- [ ] I understand why Surrogate Keys are common in enterprise systems.
- [ ] I can identify Composite Keys.
- [ ] I can explain Candidate vs Alternate Keys.
- [ ] I can design table relationships using Foreign Keys.
- [ ] I can justify my key choices in a database design interview.

---

# Chapter Summary

Congratulations! 🎉

You have completed the **Database Keys** section.

You can now:

- Distinguish between all major key types.
- Apply them in real-world database designs.
- Answer common interview questions.
- Build scalable relational databases using industry best practices.

This foundation prepares you for the next major topic: **Database Relationships**, where you'll learn how tables interact through One-to-One, One-to-Many, and Many-to-Many relationships.

---

# Related Topics

### Review

- Primary Key
- Foreign Key
- Candidate Key
- Alternate Key
- Composite Key
- Super Key
- Surrogate Key
- Natural Key
- Comparison of All Keys

### Next Chapter

**03.08 — Relationships in Databases**

You'll learn:

- One-to-One Relationships
- One-to-Many Relationships
- Many-to-Many Relationships
- Junction Tables
- Referential Integrity
- Cascading Actions