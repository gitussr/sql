---
title: "03.07.05 - Composite Key"
description: "Learn what a Composite Key is, why multiple columns are sometimes required to uniquely identify a record, and when to use Composite Keys in relational databases."
chapter: 3
section: 3.7.5
category: Core SQL Concepts
difficulty: Beginner
readingTime: 20 min
lastUpdated: 2026-07-27
---

# 03.07.05 Composite Key

## Learning Objectives

After completing this lesson, you will be able to:

- Understand what a Composite Key is
- Learn why a single column is sometimes insufficient
- Create Composite Primary Keys
- Understand Composite Foreign Keys
- Differentiate Composite Keys from Single-Column Keys
- Follow best practices for Composite Keys

---

# Introduction

Imagine a university.

A student can enroll in multiple courses.

Likewise,

a course can have many students.

Enrollment Table

| StudentID | CourseID |
|-----------|----------|
|101|CS101|
|101|CS102|
|102|CS101|
|103|CS103|

Can **StudentID** alone identify a record?

No.

A student can enroll in multiple courses.

Can **CourseID** alone identify a record?

No.

Many students can enroll in the same course.

However,

```
StudentID + CourseID
```

together uniquely identify every enrollment.

This is called a **Composite Key**.

---

# What is a Composite Key?

A **Composite Key** is a key made up of **two or more columns** that together uniquely identify a record.

None of the individual columns can uniquely identify the row on their own.

---

# Simple Definition

```
One Column

↓

Not Unique

+

Another Column

↓

Unique

=

Composite Key
```

---

# Why Do We Need Composite Keys?

Suppose we have the following table.

| StudentID | CourseID |
|-----------|----------|
|101|CS101|
|101|CS102|
|101|CS103|

StudentID repeats.

---

CourseID also repeats.

| StudentID | CourseID |
|-----------|----------|
|101|CS101|
|102|CS101|
|103|CS101|

Neither column is unique.

But together

| StudentID | CourseID |
|-----------|----------|
|101|CS101|
|101|CS102|
|102|CS101|
|103|CS103|

Every combination is unique.

---

# Visual Representation

```
Enrollments
─────────────────────────────
StudentID
CourseID
Semester
Grade
─────────────────────────────

StudentID
      +

CourseID

↓

Composite Key
```

---

# Real-World Examples

| Table | Composite Key |
|--------|---------------|
| Enrollments | StudentID + CourseID |
| OrderItems | OrderID + ProductID |
| BookLoans | BookID + MemberID |
| FlightBookings | FlightNo + SeatNo |
| ExamResults | StudentID + SubjectID |

---

# SQL Example

```sql
CREATE TABLE Enrollments
(
    StudentID INT,
    CourseID VARCHAR(20),

    PRIMARY KEY
    (
        StudentID,
        CourseID
    )
);
```

---

## Explanation

The database checks both columns together.

```
StudentID

+

CourseID
```

Each combination must be unique.

---

# Valid Data

| StudentID | CourseID |
|-----------|----------|
|101|CS101|
|101|CS102|
|102|CS101|
|103|CS103|

Every combination is unique.

---

# Invalid Data

```sql
INSERT INTO Enrollments
VALUES
(
101,
'CS101'
);
```

Suppose this combination already exists.

Result

```
ERROR

Duplicate Primary Key.
```

The database rejects the insertion.

---

# Composite Primary Key

The most common use of a Composite Key is as a **Composite Primary Key**.

```sql
PRIMARY KEY
(
    StudentID,
    CourseID
)
```

This ensures:

- StudentID may repeat.
- CourseID may repeat.
- The combination cannot repeat.

---

# Composite Foreign Key

Composite Keys can also be referenced by Foreign Keys.

Example

```sql
FOREIGN KEY
(
    StudentID,
    CourseID
)
REFERENCES Enrollments
(
    StudentID,
    CourseID
);
```

Both columns must match an existing row in the parent table.

---

# Composite Key vs Primary Key

| Composite Key | Primary Key |
|---------------|-------------|
| Uses multiple columns | May use one or multiple columns |
| One type of Primary Key | General concept |
| Identifies records | Identifies records |

Every Composite Primary Key is a Primary Key.

Not every Primary Key is Composite.

---

# Composite Key vs Candidate Key

| Composite Key | Candidate Key |
|---------------|---------------|
| May contain multiple columns | May contain one or more columns |
| Describes structure | Describes eligibility |

A Composite Key can also be a Candidate Key if it uniquely identifies every row.

---

# Composite Key vs Surrogate Key

| Composite Key | Surrogate Key |
|---------------|---------------|
| Uses business data | Uses generated ID |
| Two or more columns | Usually one column |
| Larger indexes | Smaller indexes |
| More joins may require multiple columns | Simpler joins |

---

# Real-World Example

## Order Details

Orders

| OrderID | Customer |
|----------|----------|
|1001|John|
|1002|Alice|

Products

| ProductID | Product |
|-----------|---------|
|201|Laptop|
|202|Mouse|

OrderItems

| OrderID | ProductID | Quantity |
|----------|-----------|----------|
|1001|201|1|
|1001|202|2|
|1002|201|1|

Neither `OrderID` nor `ProductID` is unique.

Together,

```
OrderID + ProductID
```

uniquely identify each order item.

---

# Advantages

- Models many-to-many relationships naturally.
- Prevents duplicate combinations.
- Uses meaningful business data.
- Eliminates unnecessary duplicate records.
- Preserves business rules.

---

# Disadvantages

- Larger indexes.
- More complex joins.
- Longer Foreign Keys.
- More storage for related tables.
- Harder to update if business values change.

---

# Best Practices

- Keep Composite Keys as small as possible.
- Use only when a single column cannot uniquely identify a row.
- Avoid using too many columns.
- Ensure every column contributes to uniqueness.
- Consider a Surrogate Key for very large systems.

---

# Common Mistakes

❌ Including unnecessary columns.

Example

```
StudentID

CourseID

Semester

```

If `StudentID + CourseID` is already unique,

adding `Semester` is unnecessary.

---

❌ Using Composite Keys with five or six columns.

This makes queries difficult to write and maintain.

---

❌ Choosing columns that frequently change.

Changing part of a Composite Key affects related tables.

---

# 💡 Did You Know?

Many enterprise databases use **both** approaches.

Example:

```
EnrollmentID

↓

Primary Key
```

and

```
StudentID

+

CourseID

↓

UNIQUE Constraint
```

This combines the simplicity of a Surrogate Key with the business rule that a student cannot enroll in the same course twice.

This hybrid design is common in ERP, CRM, HRMS and e-commerce systems.

---

# Quick Reference

| Property | Composite Key |
|-----------|---------------|
| Number of Columns | Two or More |
| Duplicate Values | ❌ Not Allowed |
| NULL Values | Depends on implementation (not allowed if part of a Primary Key) |
| Can Be Primary Key | ✅ Yes |
| Can Be Foreign Key | ✅ Yes |
| Used for Many-to-Many Tables | ✅ Very Common |

---

# Database Support

Composite Keys are supported by all major relational database systems.

| Database | Supported |
|-----------|-----------|
| MySQL | ✅ |
| PostgreSQL | ✅ |
| SQL Server | ✅ |
| Oracle | ✅ |
| SQLite | ✅ |

---

# Interview Questions

### What is a Composite Key?

A Composite Key is a key made up of two or more columns that together uniquely identify a record.

---

### Why do we use Composite Keys?

When no single column can uniquely identify each row.

---

### Can a Composite Key be a Primary Key?

Yes.

A Composite Primary Key is one of the most common uses of Composite Keys.

---

### Can a Composite Key be a Foreign Key?

Yes.

A Composite Foreign Key references a Composite Primary Key or Composite UNIQUE key in another table.

---

### Give a real-world example of a Composite Key.

`OrderID + ProductID` in an `OrderItems` table.

---

### What are the disadvantages of Composite Keys?

They increase index size, make joins more complex, and are harder to maintain if business values change.

---

# Hands-on Exercises

## Exercise 1

Create an `Enrollments` table using:

- StudentID
- CourseID

Make both columns together the Primary Key.

---

## Exercise 2

Insert the following data.

| StudentID | CourseID |
|-----------|----------|
|101|CS101|
|101|CS102|
|102|CS101|

Verify that all rows are accepted.

---

## Exercise 3

Attempt to insert the following row twice.

| StudentID | CourseID |
|-----------|----------|
|101|CS101|

Observe the database error.

---

## Exercise 4

Design Composite Keys for:

- Order Items
- Book Loans
- Hotel Room Reservations
- Flight Seat Bookings

Explain why multiple columns are required.

---

## Exercise 5

Research when a **Surrogate Key** is preferable to a Composite Key in large enterprise applications.

---

# Chapter Summary

In this lesson, you learned:

- What a Composite Key is
- Why Composite Keys are needed
- Composite Primary Keys
- Composite Foreign Keys
- Advantages and disadvantages
- Best practices
- Common mistakes

Composite Keys are essential when a combination of columns is required to uniquely identify a record. They are especially common in junction tables that model many-to-many relationships.

---

# Related Topics

### Previous Lessons

- **03.07.01** — Primary Key
- **03.07.02** — Foreign Key
- **03.07.03** — Candidate Key
- **03.07.04** — Alternate Key

### Next Lessons

- **03.07.06** — Super Key
- **03.07.07** — Surrogate Key
- **03.07.08** — Natural Key

### Recommended Reading

- Many-to-Many Relationships
- Junction (Bridge) Tables
- SQL Constraints
- Database Normalization
- Entity-Relationship (ER) Diagrams

---

# What's Next?

In **03.07.06 – Super Key**, you'll learn about the broadest type of key in relational databases, how Super Keys differ from Candidate Keys, and why minimality is an important concept in database design.