---
title: "03.07.12 - Real-World Database Design Case Study: Student Management System"
description: "Learn how database keys are used together in a real Student Management System. This case study demonstrates Primary Keys, Foreign Keys, Composite Keys, Natural Keys, Surrogate Keys, and database relationships."
chapter: 3
section: 3.7.12
category: Real-World Database Design
difficulty: Intermediate
readingTime: 35 min
lastUpdated: 2026-07-27
---

# 03.07.12 Real-World Database Design Case Study

# Student Management System

---

## Learning Objectives

After completing this lesson, you will be able to:

- Design a real-world relational database
- Identify Primary Keys, Foreign Keys, and Composite Keys
- Apply Natural and Surrogate Keys appropriately
- Understand One-to-One, One-to-Many, and Many-to-Many relationships
- Design scalable databases following enterprise standards

---

# Scenario

A college wants to build a Student Management System.

The system should manage:

- Students
- Teachers
- Departments
- Courses
- Enrollments
- Subjects
- Exams
- Marks

Each student can enroll in multiple courses.

Each course can contain multiple students.

Teachers belong to departments.

Subjects belong to courses.

Students receive marks for every subject.

---

# Step 1 — Identify the Entities

```
Students

Teachers

Departments

Courses

Enrollments

Subjects

Exams

Marks
```

Each entity becomes a database table.

---

# Step 2 — Identify Relationships

```
Department

1
│
│
*
Teachers

---------------------

Department

1
│
│
*
Courses

---------------------

Course

1
│
│
*
Subjects

---------------------

Student

*
│
│
*
Course

↓

Enrollment Table

---------------------

Student

1
│
│
*
Marks

---------------------

Subject

1
│
│
*
Marks
```

---

# Step 3 — Enterprise ER Diagram

```text

                     +----------------------+
                     |     Departments      |
                     +----------------------+
                     | PK DepartmentID      |
                     | DepartmentName       |
                     +----------+-----------+
                                |
                1               |
                                | *
              +-----------------+----------------+
              |                                  |
              ▼                                  ▼

     +-------------------+              +-------------------+
     |     Teachers      |              |      Courses      |
     +-------------------+              +-------------------+
     | PK TeacherID      |              | PK CourseID       |
     | Name              |              | CourseName        |
     | FK DepartmentID   |              | FK DepartmentID   |
     +-------------------+              +---------+---------+
                                                  |
                                                  |1
                                                  |
                                                  |*
                                        +---------+----------+
                                        |      Subjects      |
                                        +--------------------+
                                        | PK SubjectID       |
                                        | SubjectName        |
                                        | FK CourseID        |
                                        +---------+----------+
                                                  |
                                                  |1
                                                  |
                                                  |*
                  +-------------------------------+------------------------+
                  |                                                        |
                  ▼                                                        ▼

          +----------------+                                    +----------------+
          |    Students    |                                    |     Marks      |
          +----------------+                                    +----------------+
          | PK StudentID   |<------------------------------+    | PK MarkID      |
          | RollNo UNIQUE  |                               |    | FK StudentID   |
          | Name           |                               +----| FK SubjectID   |
          | Email UNIQUE   |                                    | Marks          |
          +-------+--------+                                    +----------------+
                  |
                  |*
                  |
                  |*
          +-------+--------+
          |  Enrollments   |
          +----------------+
          | PK EnrollID    |
          | FK StudentID   |
          | FK CourseID    |
          | UNIQUE         |
          | (StudentID,    |
          |  CourseID)     |
          +----------------+
```

---

# Step 4 — Table Design

---

## Departments

| Column | Key |
|----------|-----|
| DepartmentID | Primary Key (Surrogate) |
| DepartmentName | Unique |

Relationship

```
Department

1

↓

Many Teachers

Many Courses
```

---

## Students

| Column | Key |
|----------|-----|
| StudentID | Primary Key (Surrogate) |
| RollNo | Natural Key + UNIQUE |
| Email | Alternate Key |
| Name | Normal Column |
| DOB | Normal Column |

---

### Why StudentID?

Roll numbers sometimes change.

Examples

- Student transfers
- New admission policy
- Migration
- Department change

StudentID never changes.

---

## Teachers

| Column | Key |
|----------|-----|
| TeacherID | Primary Key |
| DepartmentID | Foreign Key |

---

## Courses

| Column | Key |
|----------|-----|
| CourseID | Primary Key |
| DepartmentID | Foreign Key |

---

## Subjects

| Column | Key |
|----------|-----|
| SubjectID | Primary Key |
| CourseID | Foreign Key |

---

## Enrollments

| Column | Key |
|----------|-----|
| EnrollmentID | Primary Key |
| StudentID | Foreign Key |
| CourseID | Foreign Key |
| UNIQUE(StudentID, CourseID) | Composite Alternate Key |

---

### Why not Composite Primary Key?

Instead of

```
PRIMARY KEY
(
StudentID,
CourseID
)
```

Enterprise systems usually prefer

```
EnrollmentID

↓

Primary Key
```

and

```
UNIQUE
(
StudentID,
CourseID
)
```

This keeps Foreign Keys shorter and simplifies joins.

---

## Marks

| Column | Key |
|----------|-----|
| MarkID | Primary Key |
| StudentID | Foreign Key |
| SubjectID | Foreign Key |
| Marks | Data |

---

# Step 5 — SQL Example

## Students Table

```sql
CREATE TABLE Students
(
    StudentID INT AUTO_INCREMENT PRIMARY KEY,

    RollNo VARCHAR(20) UNIQUE NOT NULL,

    Name VARCHAR(100) NOT NULL,

    Email VARCHAR(100) UNIQUE,

    DOB DATE
);
```

---

## Departments

```sql
CREATE TABLE Departments
(
    DepartmentID INT AUTO_INCREMENT PRIMARY KEY,

    DepartmentName VARCHAR(100) UNIQUE
);
```

---

## Courses

```sql
CREATE TABLE Courses
(
    CourseID INT AUTO_INCREMENT PRIMARY KEY,

    CourseName VARCHAR(100),

    DepartmentID INT,

    FOREIGN KEY (DepartmentID)
    REFERENCES Departments(DepartmentID)
);
```

---

## Enrollments

```sql
CREATE TABLE Enrollments
(
    EnrollmentID INT AUTO_INCREMENT PRIMARY KEY,

    StudentID INT,

    CourseID INT,

    UNIQUE(StudentID, CourseID),

    FOREIGN KEY(StudentID)
    REFERENCES Students(StudentID),

    FOREIGN KEY(CourseID)
    REFERENCES Courses(CourseID)
);
```

---

# Step 6 — Identify Every Key

| Table | Primary | Foreign | Natural | Surrogate | Alternate | Composite |
|---------|----------|----------|----------|------------|------------|------------|
| Students | StudentID | — | RollNo | StudentID | Email | — |
| Departments | DepartmentID | — | DepartmentName | DepartmentID | — | — |
| Teachers | TeacherID | DepartmentID | — | TeacherID | — | — |
| Courses | CourseID | DepartmentID | — | CourseID | — | — |
| Subjects | SubjectID | CourseID | — | SubjectID | — | — |
| Enrollments | EnrollmentID | StudentID, CourseID | — | EnrollmentID | UNIQUE(StudentID, CourseID) | Yes |
| Marks | MarkID | StudentID, SubjectID | — | MarkID | — | — |

---

# Step 7 — Relationship Summary

| Parent | Child | Relationship |
|---------|-------|--------------|
| Department | Teachers | One-to-Many |
| Department | Courses | One-to-Many |
| Course | Subjects | One-to-Many |
| Student | Enrollments | One-to-Many |
| Course | Enrollments | One-to-Many |
| Student | Marks | One-to-Many |
| Subject | Marks | One-to-Many |
| Student ↔ Course | Through Enrollments | Many-to-Many |

---

# Why Enterprise Systems Prefer This Design

Instead of this

```
RollNo

↓

Primary Key
```

they prefer

```
StudentID

↓

Primary Key
```

because

- Roll numbers may change
- Students may transfer departments
- Admission policies may change
- Data migrations become easier
- Foreign Keys remain stable

---

# 💡 Did You Know?

Most universities, colleges, and Learning Management Systems (LMS) such as Moodle internally use numeric IDs (Surrogate Keys) to identify students, courses, and teachers.

Even though users see values like **Student Roll Number**, **Registration Number**, or **Course Code**, the database usually stores relationships using internal numeric IDs for better performance and easier maintenance.

---

# Best Practices

✅ Use Surrogate Keys as Primary Keys.

✅ Keep Roll Numbers as `UNIQUE`.

✅ Never use student names as identifiers.

✅ Use Foreign Keys to maintain relationships.

✅ Prevent duplicate enrolments using a Composite `UNIQUE` constraint.

✅ Normalise the database to minimise redundancy.

---

# Common Mistakes

❌ Using Student Name as the Primary Key.

---

❌ Using Email as the Primary Key.

---

❌ Duplicating student information in multiple tables.

---

❌ Omitting Foreign Key constraints.

---

❌ Allowing duplicate student-course enrolments.

---

# Interview Questions

### Why is `StudentID` preferred over `RollNo` as the Primary Key?

Because `StudentID` is a stable Surrogate Key that never changes, while roll numbers may change due to institutional policies.

---

### Why is `(StudentID, CourseID)` marked as `UNIQUE`?

To ensure a student cannot enrol in the same course more than once.

---

### What relationship exists between Students and Courses?

Many-to-Many.

It is implemented through the `Enrollments` table.

---

### Why is the `Enrollments` table called a Junction Table?

Because it connects two tables (`Students` and `Courses`) to resolve a Many-to-Many relationship.

---

### Which table contains the most Foreign Keys?

In this design:

- `Enrollments`
- `Marks`

---

# Hands-on Exercises

## Exercise 1

Draw an ER diagram for this Student Management System.

---

## Exercise 2

Create all seven tables using SQL.

---

## Exercise 3

Insert sample data for:

- 3 Departments
- 5 Courses
- 10 Students
- 20 Subjects

---

## Exercise 4

Write SQL queries to:

- List all students in a course.
- Show all courses for a student.
- Display marks for each student.
- Find students who scored above 80%.

---

## Exercise 5

Extend the database by adding:

- Attendance
- Fee Payments
- Timetable
- Library
- Hostel
- Transport

Design the required tables and relationships.

---

# Chapter Summary

In this case study, you learned how a Student Management System is designed using real-world database principles.

You applied:

- Primary Keys
- Foreign Keys
- Surrogate Keys
- Natural Keys
- Composite Keys
- Alternate Keys
- One-to-Many Relationships
- Many-to-Many Relationships
- Junction Tables
- `UNIQUE` Constraints

This design closely reflects the architecture used in modern school, college, and university management systems.

---

# Related Topics

### Previous Lessons

- 03.07.01 – Primary Key
- 03.07.02 – Foreign Key
- 03.07.05 – Composite Key
- 03.07.07 – Surrogate Key
- 03.07.08 – Natural Key
- 03.07.11 – Comparison of All Keys

### Next Case Study

**03.07.13 – E-Commerce Database Design (Amazon / Shopify Style)**

You'll learn how products, customers, orders, carts, payments, shipping, inventory, and order items are modelled in a production-ready relational database.

---