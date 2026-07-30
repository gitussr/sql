---
title: "03.08.09.03 - Real-World Relationship Case Study: Hospital Management System"
description: "Learn how a modern Hospital Management System is designed using relational database concepts including patients, doctors, appointments, admissions, prescriptions, laboratory tests, billing, and medical records."
chapter: 3
section: 3.8.9.3
category: Core SQL Concepts
difficulty: Intermediate
readingTime: 65 min
lastUpdated: 2026-07-27
---

# 03.08.09.03 Hospital Management System

## Learning Objectives

After completing this lesson, you will be able to:

- Analyse healthcare business requirements
- Design a normalized hospital database
- Identify entities and relationships
- Apply One-to-One, One-to-Many, Many-to-Many, and Self-Referencing relationships
- Design scalable medical record systems
- Understand enterprise healthcare database architecture

---

# Introduction

A **Hospital Management System (HMS)** manages the complete lifecycle of patient care.

It stores information about:

- Patients
- Doctors
- Departments
- Appointments
- Admissions
- Medical Records
- Prescriptions
- Laboratory Tests
- Billing
- Payments
- Nurses
- Rooms
- Surgeries

Almost every modern hospital relies on relational databases because healthcare data must remain accurate, secure, and highly available.

---

# Business Requirements

The hospital should allow:

- Patient registration
- Doctor scheduling
- Appointment booking
- Department management
- Patient admissions
- Room allocation
- Electronic Medical Records (EMR)
- Prescriptions
- Laboratory investigations
- Billing and payments
- Surgery scheduling
- Nursing assignments

---

# Step 1 — Identify Entities

| Entity | Purpose |
|----------|----------|
| Patients | Patient information |
| Doctors | Doctor details |
| Departments | Medical departments |
| Appointments | Doctor visits |
| Admissions | Hospital stays |
| Rooms | Room allocation |
| Nurses | Nursing staff |
| MedicalRecords | Patient history |
| Prescriptions | Medicines |
| Medicines | Drug catalogue |
| PrescriptionItems | Medicines prescribed |
| LabTests | Test requests |
| TestResults | Laboratory reports |
| Bills | Billing information |
| Payments | Payment records |

---

# Step 2 — Identify Relationships

| Parent | Child | Relationship |
|----------|--------|-------------|
| Department → Doctors | One-to-Many |
| Patient → Appointments | One-to-Many |
| Doctor → Appointments | One-to-Many |
| Patient → Admissions | One-to-Many |
| Room → Admissions | One-to-Many |
| Patient → MedicalRecords | One-to-One |
| Patient → Bills | One-to-Many |
| Bill → Payments | One-to-Many |
| Patient → LabTests | One-to-Many |
| LabTests → TestResults | One-to-One |
| Prescription → PrescriptionItems | One-to-Many |
| Medicines → PrescriptionItems | One-to-Many |
| Doctors ↔ Patients | Many-to-Many (via Appointments) |
| Nurses ↔ Admissions | Many-to-Many |

---

# High-Level ER Diagram

```text
                 Departments
                      │
                      ▼
                  Doctors
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
     Appointments           Prescriptions
          ▲                       │
          │                       ▼
      Patients          PrescriptionItems
          │                       │
          │                       ▼
          │                  Medicines
          │
 ┌────────┼───────────────┐
 ▼        ▼               ▼
Medical Admissions     LabTests
Records      │             │
             ▼             ▼
          Rooms      TestResults
             │
             ▼
           Nurses

Patients
     │
     ▼
Bills
     │
     ▼
Payments
```

---

# Relationship Breakdown

## One-to-One

```
Patients

↓

MedicalRecords
```

Each patient has one master medical record.

---

```
LabTests

↓

TestResults
```

Each laboratory test produces one official result.

---

## One-to-Many

```
Department

↓

Doctors
```

One department employs many doctors.

---

```
Patient

↓

Appointments
```

A patient may visit many times.

---

```
Doctor

↓

Appointments
```

A doctor sees many patients.

---

```
Patient

↓

Bills
```

Patients may receive multiple bills.

---

```
Bill

↓

Payments
```

Bills can be paid in instalments.

---

```
Patient

↓

Admissions
```

A patient may be admitted multiple times.

---

## Many-to-Many

### Doctors ↔ Patients

Resolved using:

```
Doctors

↓

Appointments

↓

Patients
```

---

### Nurses ↔ Admissions

Resolved using:

```
Nurses

↓

AdmissionNurses

↓

Admissions
```

Multiple nurses care for one patient.

One nurse cares for many patients.

---

# Database Tables

## Patients

| Column | Key |
|----------|-----|
| PatientID | Primary Key |
| NationalID | Unique |
| FullName | |
| DOB | |
| Gender | |
| BloodGroup | |

---

## Doctors

| Column | Key |
|----------|-----|
| DoctorID | Primary Key |
| DepartmentID | Foreign Key |
| FullName | |
| Specialization | |

---

## Departments

| Column | Key |
|----------|-----|
| DepartmentID | Primary Key |
| DepartmentName | Unique |

---

## Appointments

| Column | Key |
|----------|-----|
| AppointmentID | Primary Key |
| PatientID | Foreign Key |
| DoctorID | Foreign Key |
| AppointmentDate | |
| Status | |

---

## Admissions

| Column | Key |
|----------|-----|
| AdmissionID | Primary Key |
| PatientID | Foreign Key |
| RoomID | Foreign Key |
| AdmissionDate | |
| DischargeDate | |

---

## MedicalRecords

| Column | Key |
|----------|-----|
| RecordID | Primary Key |
| PatientID | Foreign Key |
| Allergies | |
| MedicalHistory | |

---

## Prescriptions

| Column | Key |
|----------|-----|
| PrescriptionID | Primary Key |
| AppointmentID | Foreign Key |
| DoctorID | Foreign Key |

---

## PrescriptionItems

| Column | Key |
|----------|-----|
| ItemID | Primary Key |
| PrescriptionID | Foreign Key |
| MedicineID | Foreign Key |
| Dosage | |
| Duration | |

---

## Bills

| Column | Key |
|----------|-----|
| BillID | Primary Key |
| PatientID | Foreign Key |
| TotalAmount | |
| BillDate | |

---

# Key Selection Strategy

All major tables use **Surrogate Keys**.

```
PatientID
DoctorID
AppointmentID
AdmissionID
BillID
```

Business identifiers such as:

- National ID
- Insurance Number
- Medical Registration Number

should use **UNIQUE** constraints instead of Primary Keys.

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
UNIQUE (NationalID)

UNIQUE (MedicalRegistrationNo)
```

---

# Cascade Strategy

| Parent | Child | Action | Reason |
|---------|-------|--------|--------|
| Patient | MedicalRecord | CASCADE | Record belongs only to patient |
| Patient | Appointments | RESTRICT | Medical history must remain |
| Patient | Bills | RESTRICT | Financial records cannot disappear |
| Patient | Admissions | RESTRICT | Legal requirement |
| Doctor | Appointments | RESTRICT | Preserve history |
| Prescription | PrescriptionItems | CASCADE | Items belong to prescription |
| Bill | Payments | RESTRICT | Financial audit |

Healthcare systems generally avoid cascading deletes for clinical and financial data to preserve legal and audit histories.

---

# Sample SQL Schema

```sql
CREATE TABLE Appointments
(
    AppointmentID INT AUTO_INCREMENT PRIMARY KEY,

    PatientID INT NOT NULL,

    DoctorID INT NOT NULL,

    AppointmentDate DATETIME NOT NULL,

    Status VARCHAR(20),

    FOREIGN KEY (PatientID)
        REFERENCES Patients(PatientID),

    FOREIGN KEY (DoctorID)
        REFERENCES Doctors(DoctorID)
);
```

### Explanation

- A patient can book many appointments.
- A doctor can attend many appointments.
- The `Appointments` table resolves the Many-to-Many relationship between doctors and patients.

---

# Sample Data Flow

```text
Patient Registration

↓

Appointment Booking

↓

Doctor Consultation

↓

Prescription

↓

Laboratory Tests

↓

Admission (if required)

↓

Billing

↓

Payment

↓

Discharge
```

---

# Performance Considerations

Hospital databases operate 24×7 and must deliver fast, reliable access.

Best practices:

- Index all Foreign Keys.
- Index appointment dates.
- Partition historical records where supported.
- Archive inactive medical records.
- Optimise reporting queries.
- Never compromise referential integrity for performance.

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB |
|---------|:-----:|:----------:|:----------:|:------:|:--------:|
| Foreign Keys | ✅ | ✅ | ✅ | ✅ | ✅ |
| Transactions | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cascade Actions | ✅ | ✅ | ✅ | ✅ | ✅ |
| CHECK Constraints | ✅ (8.0.16+) | ✅ | ✅ | ✅ | ✅ |
| Recursive CTE | ✅ | ✅ | ✅ | ✅ | ✅ |

---

# Scalability Notes

Enterprise hospital systems often expand to include:

- Pharmacy Management
- Blood Bank
- Radiology
- ICU Management
- Ambulance Tracking
- Insurance Claims
- Online Consultations
- Doctor Scheduling
- Bed Management
- Operation Theatre Scheduling
- Patient Portal
- Mobile Applications

These modules extend the schema while preserving the core relationship model.

---

# Security Considerations

Healthcare databases contain highly sensitive information.

Best practices include:

- Encrypt patient data at rest and in transit.
- Implement Role-Based Access Control (RBAC).
- Maintain detailed audit logs.
- Restrict access based on user roles.
- Comply with regional healthcare privacy regulations (for example, HIPAA in the United States or GDPR in Europe where applicable).

---

# 💡 Did You Know?

Large hospitals may process thousands of appointments and laboratory results every day.

Instead of deleting records, they typically mark them as inactive or archived. This preserves medical history, supports audits, and ensures compliance with legal and regulatory requirements.

---

# Interview Questions

1. Why is `Appointments` considered a Junction Table?
2. Why should medical records rarely be deleted?
3. Why are bills usually protected with `RESTRICT`?
4. Which relationships are One-to-One?
5. Why should `NationalID` use a `UNIQUE` constraint instead of being the Primary Key?
6. Why are audit logs essential in healthcare systems?

---

# Hands-on Exercises

### Exercise 1

Draw the complete ER diagram for the Hospital Management System.

---

### Exercise 2

Create all tables using SQL.

---

### Exercise 3

Insert sample data for:

- 50 Patients
- 20 Doctors
- 10 Departments
- 100 Appointments
- 40 Admissions

---

### Exercise 4

Write SQL queries to display:

- Doctor appointment schedules
- Patient medical history
- Outstanding bills
- Laboratory test reports
- Room occupancy

---

### Exercise 5

Extend the schema by adding:

- Pharmacy
- Insurance
- Ambulance Services
- Radiology
- Vaccination Records

Identify the new entities and relationships.

---

# Summary

This case study demonstrates how relational database concepts work together to support a modern Hospital Management System. By combining One-to-One, One-to-Many, Many-to-Many relationships, Junction Tables, Referential Integrity, and carefully selected cascade actions, the system can manage complex healthcare workflows while maintaining data integrity, scalability, and security.

---

# Related Topics

### Previous Lessons

- 03.08.09.01 — Student Management System
- 03.08.09.02 — E-Commerce Platform

### Next Lesson

**03.08.09.04 — Real-World Relationship Case Study: Human Resource Management System (HRMS)**