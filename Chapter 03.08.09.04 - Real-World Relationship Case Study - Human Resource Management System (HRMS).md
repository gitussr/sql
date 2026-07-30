---
title: "03.08.09.04 - Real-World Relationship Case Study: Human Resource Management System (HRMS)"
description: "Learn how an enterprise Human Resource Management System (HRMS) is designed using relational database concepts including employees, departments, attendance, payroll, leave management, performance reviews, and organisational hierarchy."
chapter: 3
section: 3.8.9.4
category: Core SQL Concepts
difficulty: Intermediate
readingTime: 65 min
lastUpdated: 2026-07-27
---

# 03.08.09.04 Human Resource Management System (HRMS)

## Learning Objectives

After completing this lesson, you will be able to:

- Analyse HR business requirements
- Design an enterprise HRMS database
- Model organisational hierarchies
- Design payroll and attendance systems
- Apply One-to-One, One-to-Many, Many-to-Many and Self-Referencing relationships
- Build scalable employee management systems

---

# Introduction

A **Human Resource Management System (HRMS)** manages the complete employee lifecycle—from recruitment to retirement.

Most enterprise HR systems such as:

- SAP SuccessFactors
- Oracle HCM
- Workday
- BambooHR
- Zoho People

are built on well-designed relational databases.

A modern HRMS manages:

- Employees
- Departments
- Managers
- Attendance
- Leave
- Payroll
- Performance Reviews
- Recruitment
- Training
- Assets
- Benefits

---

# Business Requirements

The company wants to build an HRMS that supports:

- Employee records
- Department management
- Manager hierarchy
- Attendance tracking
- Leave requests
- Payroll
- Performance evaluations
- Employee training
- Company assets
- Recruitment
- Employee benefits

---

# Step 1 — Identify Entities

| Entity | Purpose |
|----------|----------|
| Employees | Employee information |
| Departments | Company departments |
| Attendance | Daily attendance |
| LeaveRequests | Leave applications |
| Payroll | Salary processing |
| PerformanceReviews | Employee evaluations |
| TrainingPrograms | Employee learning |
| EmployeeTraining | Training enrolments |
| Assets | Company assets |
| EmployeeAssets | Asset assignments |
| Recruitment | Hiring candidates |
| Benefits | Insurance & allowances |

---

# Step 2 — Identify Relationships

| Parent | Child | Relationship |
|----------|--------|-------------|
| Department → Employees | One-to-Many |
| Employee → Attendance | One-to-Many |
| Employee → LeaveRequests | One-to-Many |
| Employee → Payroll | One-to-Many |
| Employee → PerformanceReviews | One-to-Many |
| Employee → Benefits | One-to-One |
| Employee ↔ TrainingPrograms | Many-to-Many |
| Employee ↔ Assets | Many-to-Many |
| Employee → Employee (Manager) | Self-Referencing |
| Recruitment → Employee | One-to-One |

---

# High-Level ER Diagram

```text
                 Departments
                      │
                      ▼
                 Employees
             ┌─────┼──────┬─────────────┐
             │     │      │             │
             ▼     ▼      ▼             ▼
      Attendance Leave Payroll Performance
             │
             ▼
         LeaveRequests

Employees
     │
     ▼
Benefits

Employees
     │
     ▼
EmployeeTraining
     ▲
     │
TrainingPrograms

Employees
     │
     ▼
EmployeeAssets
     ▲
     │
Assets

Recruitment
     │
     ▼
Employees

Employees
     ▲
     │
 ManagerID (Self Reference)
```

---

# Relationship Breakdown

## One-to-One

```
Employee

↓

Benefits
```

Each employee has one benefits profile.

---

```
Recruitment

↓

Employee
```

A successful candidate becomes one employee.

---

## One-to-Many

```
Department

↓

Employees
```

One department employs many employees.

---

```
Employee

↓

Attendance
```

Daily attendance belongs to one employee.

---

```
Employee

↓

Payroll
```

Each payroll record belongs to one employee.

---

```
Employee

↓

Leave Requests
```

Employees may submit multiple leave applications.

---

```
Employee

↓

Performance Reviews
```

Managers evaluate employees periodically.

---

## Many-to-Many

### Employees ↔ Training Programs

Resolved using:

```text
Employees

↓

EmployeeTraining

↓

TrainingPrograms
```

Employees may attend many training programmes.

Training programmes contain many employees.

---

### Employees ↔ Assets

Resolved using:

```text
Employees

↓

EmployeeAssets

↓

Assets
```

An employee may receive multiple assets.

Assets are reassigned during their lifecycle.

---

## Self-Referencing Relationship

Every employee may report to another employee.

```text
CEO

│

├── HR Director

│      ├── HR Executive

│      └── Recruiter

│

└── IT Director

       ├── Software Engineer

       └── DevOps Engineer
```

Database:

| EmployeeID | Name | ManagerID |
|------------|------|-----------|
|1|CEO|NULL|
|2|HR Director|1|
|3|IT Director|1|
|4|Recruiter|2|
|5|Developer|3|

---

# Database Tables

## Employees

| Column | Key |
|----------|-----|
| EmployeeID | Primary Key |
| DepartmentID | Foreign Key |
| ManagerID | Self FK |
| EmployeeCode | Unique |
| FullName | |
| Email | Unique |
| HireDate | |

---

## Departments

| Column | Key |
|----------|-----|
| DepartmentID | Primary Key |
| DepartmentName | Unique |

---

## Attendance

| Column | Key |
|----------|-----|
| AttendanceID | Primary Key |
| EmployeeID | Foreign Key |
| AttendanceDate | |
| CheckIn | |
| CheckOut | |

---

## LeaveRequests

| Column | Key |
|----------|-----|
| LeaveID | Primary Key |
| EmployeeID | Foreign Key |
| LeaveType | |
| StartDate | |
| EndDate | |
| Status | |

---

## Payroll

| Column | Key |
|----------|-----|
| PayrollID | Primary Key |
| EmployeeID | Foreign Key |
| SalaryMonth | |
| BasicSalary | |
| Tax | |
| NetSalary | |

---

## PerformanceReviews

| Column | Key |
|----------|-----|
| ReviewID | Primary Key |
| EmployeeID | Foreign Key |
| ReviewerID | Foreign Key |
| ReviewDate | |
| Rating | |

---

# Key Selection Strategy

Use **Surrogate Keys** for all major entities.

```
EmployeeID
DepartmentID
PayrollID
LeaveID
AttendanceID
```

Business identifiers:

- EmployeeCode
- Email
- National Insurance Number (or local equivalent)

should use **UNIQUE** constraints.

---

# Constraints

Recommended constraints:

- PRIMARY KEY
- FOREIGN KEY
- UNIQUE
- NOT NULL
- CHECK

Example:

```sql
UNIQUE(EmployeeCode)

UNIQUE(Email)

CHECK(NetSalary >= 0)
```

---

# Cascade Strategy

| Parent | Child | Action | Reason |
|---------|-------|--------|--------|
| Employee | Attendance | CASCADE | Operational records |
| Employee | LeaveRequests | RESTRICT | HR history |
| Employee | Payroll | RESTRICT | Financial records |
| Employee | PerformanceReviews | RESTRICT | Audit history |
| Department | Employees | RESTRICT | Employees must be reassigned |
| Employee | Benefits | CASCADE | Benefits belong to employee |
| Training | EmployeeTraining | CASCADE | Junction table |
| Assets | EmployeeAssets | RESTRICT | Preserve asset history |

---

# Sample SQL Schema

```sql
CREATE TABLE Employees
(
    EmployeeID INT AUTO_INCREMENT PRIMARY KEY,

    DepartmentID INT NOT NULL,

    ManagerID INT NULL,

    EmployeeCode VARCHAR(20) UNIQUE,

    FullName VARCHAR(100),

    Email VARCHAR(100) UNIQUE,

    FOREIGN KEY (DepartmentID)
        REFERENCES Departments(DepartmentID),

    FOREIGN KEY (ManagerID)
        REFERENCES Employees(EmployeeID)
);
```

### Explanation

- `DepartmentID` connects employees to departments.
- `ManagerID` creates the organisational hierarchy.
- Top-level executives have `NULL` as their `ManagerID`.

---

# Sample Data Flow

```text
Candidate

↓

Recruitment

↓

Employee

↓

Department

↓

Attendance

↓

Leave

↓

Payroll

↓

Performance Review

↓

Promotion

↓

Retirement
```

---

# Performance Considerations

Enterprise HR systems often contain decades of employee history.

Best practices:

- Index all Foreign Keys.
- Index `EmployeeCode`.
- Index attendance by date.
- Archive former employees instead of deleting them.
- Optimise payroll queries for month-end processing.
- Use execution plans (`EXPLAIN`) to tune reporting queries.

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB |
|---------|:-----:|:----------:|:----------:|:------:|:--------:|
| Self-Referencing FK | ✅ | ✅ | ✅ | ✅ | ✅ |
| Foreign Keys | ✅ | ✅ | ✅ | ✅ | ✅ |
| Recursive CTE | ✅ | ✅ | ✅ | ✅ | ✅ |
| CHECK Constraints | ✅ (8.0.16+) | ✅ | ✅ | ✅ | ✅ |
| Cascade Actions | ✅ | ✅ | ✅ | ✅ | ✅ |

---

# Scalability Notes

Large organisations extend HRMS with modules such as:

- Recruitment & Applicant Tracking
- Employee Onboarding
- Time & Attendance Devices
- Payroll Integration
- Tax Management
- Expense Claims
- Travel Requests
- Learning Management System (LMS)
- Performance Management
- Succession Planning
- Workforce Analytics
- Employee Self-Service Portal
- Mobile HR Applications

These additions extend the schema without changing the core employee relationships.

---

# Security Considerations

HR databases contain confidential employee information.

Recommended practices:

- Encrypt salary and personal information.
- Implement Role-Based Access Control (RBAC).
- Restrict payroll access to authorised HR and finance staff.
- Record all updates in audit logs.
- Mask sensitive data in reports where appropriate.

---

# 💡 Did You Know?

Most enterprise HRMS solutions never permanently delete employee records after someone leaves the organisation.

Instead, they mark employees as **Inactive**, preserving employment history, payroll records, performance reviews, and legal documentation for compliance and auditing purposes.

---

# Interview Questions

1. Why is `ManagerID` a self-referencing Foreign Key?
2. Why should payroll records use `RESTRICT` instead of `CASCADE`?
3. Why are `EmployeeTraining` and `EmployeeAssets` Junction Tables?
4. Why should `EmployeeCode` be `UNIQUE` instead of the Primary Key?
5. Which tables should be indexed for performance?
6. Why are inactive employees often retained instead of deleted?

---

# Hands-on Exercises

### Exercise 1

Draw the complete ER diagram for the HRMS.

---

### Exercise 2

Create all tables with Primary Keys and Foreign Keys.

---

### Exercise 3

Insert sample data for:

- 10 Departments
- 100 Employees
- 500 Attendance records
- 200 Leave Requests
- 100 Payroll records

---

### Exercise 4

Write SQL queries to display:

- Employee hierarchy
- Department-wise employee count
- Monthly payroll summary
- Pending leave requests
- Employees assigned to company assets

---

### Exercise 5

Extend the schema by adding:

- Promotions
- Job Titles
- Office Locations
- Projects
- Timesheets
- Employee Certifications

Identify the new relationships and explain your design choices.

---

# Summary

This case study demonstrated how an enterprise Human Resource Management System combines self-referencing relationships, One-to-One, One-to-Many, Many-to-Many relationships, Junction Tables, Referential Integrity, and carefully selected cascade actions to manage the complete employee lifecycle. The same design principles scale from small businesses to multinational organisations.

---

# Related Topics

### Previous Lessons

- 03.08.09.01 — Student Management System
- 03.08.09.02 — E-Commerce Platform
- 03.08.09.03 — Hospital Management System

### Next Lesson

**03.08.09.05 — Real-World Relationship Case Study: Banking System**