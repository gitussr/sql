---
title: "03.08.09.01 - Real-World Relationship Case Study: Student Management System"
description: "Design a production-style Student Management System using One-to-One, One-to-Many, Many-to-Many, Junction Tables, Self-Referencing Relationships, and Referential Integrity."
chapter: 3
section: 3.8.9.1
category: Core SQL Concepts
difficulty: Intermediate
readingTime: 40 min
lastUpdated: 2026-07-27
---

# 03.08.09.01 Student Management System

## Learning Objectives

After completing this lesson, you will be able to:

- Analyse business requirements
- Identify entities
- Design relationships
- Build an ER model
- Apply best practices
- Understand how a real database is structured

---

# Business Scenario

A university wants to build a Student Management System.

The system should manage:

- Students
- Teachers
- Departments
- Courses
- Enrolments
- Classrooms
- Exams
- Marks
- Attendance
- Student Profiles

Thousands of students may use the system simultaneously.

---

# Step 1 — Identify Entities

| Entity | Purpose |
|----------|----------|
| Students | Student information |
| Teachers | Faculty information |
| Departments | Academic departments |
| Courses | Subjects offered |
| Enrolments | Student-course relationships |
| Exams | Examination details |
| Marks | Student results |
| Attendance | Attendance records |
| StudentProfiles | Additional student details |
| Classrooms | Physical or virtual classrooms |

---

# Step 2 — Identify Relationships

| Relationship | Type |
|--------------|------|
| Department → Teachers | One-to-Many |
| Department → Courses | One-to-Many |
| Teacher → Courses | One-to-Many |
| Student ↔ Courses | Many-to-Many |
| Student → StudentProfile | One-to-One |
| Course → Exams | One-to-Many |
| Student → Attendance | One-to-Many |
| Student → Marks | One-to-Many |

---

# Relationship Overview

```text
Departments
      │
      ├──────────────┐
      ▼              ▼
Teachers         Courses
                     │
                     ▼
               Enrolments
               ▲         ▲
               │         │
          Students       │
               │         │
               ▼         │
      StudentProfile     │
               │         │
               ▼         ▼
         Attendance     Exams
                           │
                           ▼
                         Marks
```

---

# ER Diagram

```text
Departments
   │
   ├───────< Teachers
   │
   └───────< Courses
                 │
                 │
Students >── Enrolments ──< Courses
     │
     ├──── StudentProfile
     │
     ├──── Attendance
     │
     └──── Marks
                 ▲
                 │
               Exams
```

---

# One-to-One Relationship

## Students ↔ StudentProfile

```text
Students

1 ─────────────── 1

StudentProfile
```

Reason:

Each student has one profile.

The profile cannot exist without the student.

---

# One-to-Many Relationships

Department

↓

Teachers

---

Department

↓

Courses

---

Teacher

↓

Courses

---

Course

↓

Exams

---

Student

↓

Attendance

---

Student

↓

Marks

---

# Many-to-Many Relationship

Students

↕

Courses

Resolved by:

```
Enrolments
```

---

# Junction Table

## Enrolments

| Column | Description |
|----------|-------------|
| EnrollmentID | Primary Key |
| StudentID | FK |
| CourseID | FK |
| EnrollmentDate | Date |
| Semester | Semester |
| Status | Active/Completed |

---

# Referential Integrity

Every Foreign Key references an existing parent record.

Examples:

```
Teacher

↓

Department
```

```
Student

↓

Enrolments
```

```
Course

↓

Department
```

The database prevents orphan records.

---

# Recommended Cascade Actions

| Parent | Child | Action | Reason |
|---------|-------|--------|--------|
| Student | Profile | CASCADE | Profile has no meaning without a student |
| Student | Enrolments | RESTRICT | Preserve academic history |
| Department | Teachers | RESTRICT | Reassign teachers first |
| Department | Courses | RESTRICT | Prevent accidental data loss |
| Course | Exams | CASCADE | Exams belong to a course |

> **Note:** Cascade choices depend on institutional policies. Some universities archive historical data instead of deleting it.

---

# Sample Database Structure

```text
Departments
────────────
DepartmentID (PK)

Teachers
────────────
TeacherID (PK)
DepartmentID (FK)

Students
────────────
StudentID (PK)

StudentProfile
────────────
ProfileID (PK)
StudentID (FK)

Courses
────────────
CourseID (PK)
DepartmentID (FK)
TeacherID (FK)

Enrolments
────────────
EnrollmentID (PK)
StudentID (FK)
CourseID (FK)

Exams
────────────
ExamID (PK)
CourseID (FK)

Marks
────────────
MarkID (PK)
StudentID (FK)
ExamID (FK)

Attendance
────────────
AttendanceID (PK)
StudentID (FK)
CourseID (FK)
```

---

# Production Improvements

A real university system would also include:

- Academic Years
- Semesters
- Timetables
- Rooms
- Fee Payments
- Scholarships
- Hostel Management
- Library Integration
- Online Classes
- Notifications
- User Roles
- Audit Logs
- Document Uploads

This demonstrates how databases evolve without changing the core relationship model.

---

# Performance Considerations

- Index all Foreign Keys (`StudentID`, `CourseID`, `TeacherID`, `DepartmentID`).
- Use Junction Tables for enrolments rather than storing multiple courses in one field.
- Archive historical attendance and examination records if the database grows very large.
- Optimise reporting queries with appropriate indexes and execution plan analysis.

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB |
|---------|:-----:|:----------:|:----------:|:------:|:--------:|
| Foreign Keys | ✅ | ✅ | ✅ | ✅ | ✅ |
| Junction Tables | ✅ | ✅ | ✅ | ✅ | ✅ |
| Self-Referencing Relationships | ✅ | ✅ | ✅ | ✅ | ✅ |
| Recursive CTEs | ✅ | ✅ | ✅ | ✅ | ✅ |

---

# 💡 Did You Know?

Large universities often integrate the Student Management System with:

- Learning Management Systems (LMS)
- Library Management
- Finance & Payroll
- Hostel Management
- Identity & Access Management
- Student Mobile Apps

Although new modules are added, the underlying relationship model usually remains stable for many years.

---

# Interview Questions

1. Why is `Enrolments` a Junction Table?
2. Which relationships are One-to-One?
3. Why is `StudentProfile` separated from `Students`?
4. Which tables require Foreign Keys?
5. Why shouldn't student course names be stored in a single column?

---

# Hands-on Exercises

1. Draw the ER diagram for this system.
2. Create all tables using SQL.
3. Add Foreign Key constraints.
4. Insert sample data.
5. Write JOIN queries to display:
   - Student with enrolled courses
   - Teacher with department
   - Student marks by course
   - Attendance by semester

---

# Summary

This case study demonstrates how multiple relationship types work together in a real production system.

By combining One-to-One, One-to-Many, Many-to-Many, Junction Tables, Referential Integrity, and carefully chosen cascade actions, you can build a scalable Student Management System that reflects enterprise database design principles.

---

# Related Topics

### Previous Lessons

- 03.08.01 — One-to-One Relationship
- 03.08.02 — One-to-Many Relationship
- 03.08.03 — Many-to-Many Relationship
- 03.08.04 — Junction Tables
- 03.08.05 — Referential Integrity
- 03.08.06 — Cascade Actions
- 03.08.07 — Self-Referencing Relationships
- 03.08.08 — Relationship Design Best Practices

### Next Lesson

- **03.08.09.02 — Real-World Relationship Case Study: E-Commerce Platform**