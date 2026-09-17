---
title: "05.10 - SELECT into Variables (DBMS Differences)"
description: "Learn how different database systems assign query results to variables using SELECT. Understand ANSI SQL limitations, procedural SQL, vendor-specific syntax, and enterprise best practices."
chapter: 5
section: 5.10
category: SQL Programming
difficulty: Intermediate
readingTime: 45 min
lastUpdated: 2026-08-04
---

# 05.10 SELECT into Variables (DBMS Differences)

---

# Learning Objectives

After completing this section, you will be able to:

- Understand why SQL variables are vendor-specific.
- Distinguish ANSI SQL from procedural SQL.
- Assign query results to variables in major DBMSs.
- Understand session variables versus local variables.
- Explain how the execution engine populates variables.
- Write portable SQL by avoiding unnecessary vendor-specific constructs.

---

# Does ANSI SQL Support Variables?

No.

The SQL standard focuses primarily on **declarative data manipulation**, not procedural programming.

Standard SQL allows:

- Queries
- Joins
- Filtering
- Grouping
- Ordering

It does **not** define a universal syntax for local variables in ordinary SQL statements.

Variables belong to procedural extensions such as:

- PL/SQL (Oracle)
- T-SQL (SQL Server)
- PL/pgSQL (PostgreSQL)
- MySQL stored programs

---

# Why Use Variables?

Variables temporarily store values for later use.

Example:

```
Customer ID

↓

Store in Variable

↓

Use Later

↓

Generate Invoice

↓

Send Email

↓

Write Audit Record
```

Variables are common inside stored procedures, triggers, and functions.

---

# Standard SQL Approach

Instead of variables, standard SQL often uses:

```sql
SELECT
    CustomerName
FROM Customers
WHERE CustomerID = 10;
```

The application receives the result directly.

No database variable is required.

---

# SQL Server (T-SQL)

Declare:

```sql
DECLARE @Salary DECIMAL(10,2);
```

Assign:

```sql
SELECT
    @Salary = Salary
FROM Employees
WHERE EmployeeID = 1;
```

Use:

```sql
SELECT @Salary;
```

---

# Oracle (PL/SQL)

```sql
DECLARE
    v_salary NUMBER;
BEGIN
    SELECT Salary
    INTO v_salary
    FROM Employees
    WHERE EmployeeID = 1;
END;
```

Oracle uses:

```sql
SELECT ...

INTO variable
```

inside PL/SQL blocks.

---

# PostgreSQL (PL/pgSQL)

```sql
DECLARE
    v_salary NUMERIC;
BEGIN
    SELECT Salary
    INTO v_salary
    FROM Employees
    WHERE EmployeeID = 1;
END;
```

The syntax resembles Oracle but belongs to PL/pgSQL rather than plain SQL.

---

# MySQL Local Variables

Inside stored programs:

```sql
DECLARE salary DECIMAL(10,2);

SELECT Salary
INTO salary
FROM Employees
WHERE EmployeeID = 1;
```

---

# MySQL Session Variables

MySQL also supports session variables.

Example:

```sql
SELECT
    Salary
INTO @salary
FROM Employees
WHERE EmployeeID = 1;
```

Later:

```sql
SELECT
    @salary;
```

These variables exist for the current session and differ from local variables declared inside stored routines.

---

# SQLite

SQLite has no built-in SQL variable syntax.

Applications typically manage variables in the host programming language.

---

# Variable Scope

Variables differ by scope.

```text
Variables

│

├── Local

├── Block

├── Procedure

├── Session

└── Application
```

Each database system defines its own rules.

---

# Variables vs Aliases

Aliases:

```sql
SELECT
    Salary AS AnnualSalary;
```

Temporary output labels.

Variables:

```sql
@salary
```

Store values for reuse.

These concepts are unrelated.

---

# Single Row Requirement

Most variable assignment statements expect **exactly one row**.

Suppose:

```sql
SELECT
    Salary
INTO salary
FROM Employees;
```

If multiple rows are returned:

- Oracle raises an error.
- SQL Server may assign the last processed value, depending on the statement and context.
- Behavior varies across DBMSs.

Always ensure the query returns the intended number of rows.

---

# 📍 Execution Order Reminder

The query used for variable assignment still follows SQL's logical execution order.

```text
FROM
        ↓
JOIN
        ↓
WHERE
        ↓
GROUP BY
        ↓
HAVING
        ↓
SELECT
        ↓
Assign Variable
```

The variable receives its value only after the query result has been produced.

---

# How the DBMS Executes Variable Assignment

Example:

```sql
SELECT Salary
INTO salary
FROM Employees
WHERE EmployeeID = 1;
```

Execution:

```text
Read Table

↓

Apply WHERE

↓

Locate Row

↓

Project Salary

↓

Copy Value

↓

Store in Variable
```

The assignment occurs after the value has been retrieved.

---

# 🔬 Engine Deep Dive

Variables are generally managed by the procedural runtime rather than the relational engine itself.

```text
SQL Statement

        │

        ▼

Parser

        │

        ▼

Optimizer

        │

        ▼

Execution Engine

        │

        ▼

Return Result

        │

        ▼

Procedural Runtime

        │

        ▼

Assign Variable
```

The relational engine produces a value; the procedural environment stores it.

---

# 🏗️ Architecture Insight

Relational queries return result sets. Variables belong to procedural execution environments layered on top of the relational engine. Keeping these responsibilities separate helps database systems optimize set-based operations independently of procedural code.

---

# ⚡ Performance Tip

Avoid assigning values row by row when set-based SQL can accomplish the same task. Row-by-row procedural code ("RBAR"—Row By Agonizing Row) often performs significantly worse than a single set-oriented query.

---

# 🔒 Security Note

Variables may temporarily contain sensitive information such as account balances, authentication tokens, or personal data. Stored procedures should avoid exposing variable contents through debugging output or error messages.

---

# 🌍 Production Consideration

Enterprise applications usually fetch query results into variables in the application layer rather than inside SQL. Database variables are most useful within stored procedures, triggers, migration scripts, and administrative routines.

---

# 🚀 Enterprise Practice

Most enterprise development guidelines encourage keeping business logic in application services while reserving procedural database variables for operations that benefit from running close to the data, such as complex transactional workflows or batch processing.

---

# SQL Standard vs Vendor Differences

| Feature | ANSI SQL | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|-----------|------------|--------|------------|---------|---------|
| Local SQL variables | ❌ | PL/pgSQL | Stored Programs | T-SQL | PL/SQL | ❌ |
| `SELECT ... INTO variable` | ❌ | ✅ (PL/pgSQL) | ✅ (Stored Programs) | Uses assignment syntax and `SELECT ... INTO` has different meaning in T-SQL | ✅ (PL/SQL) | ❌ |
| Session variables | ❌ | Limited mechanisms | ✅ (`@var`) | Separate variable model | Package/session state | ❌ |

> **Portability Tip:** Variable syntax is one of the least portable areas of SQL. Write portable SQL by returning result sets to the application unless procedural database programming is explicitly required.

---

# Common Mistakes

### Mistake 1

Assuming variable syntax is standardized.

---

### Mistake 2

Confusing aliases with variables.

---

### Mistake 3

Ignoring the possibility that a query returns multiple rows.

---

### Mistake 4

Using procedural variables where a single set-based query would be simpler and faster.

---

# Best Practices

✔ Prefer set-based SQL.

✔ Use variables only when procedural logic requires them.

✔ Ensure queries used for assignment return the expected number of rows.

✔ Keep vendor-specific syntax isolated when portability matters.

✔ Document variable scope clearly in stored procedures.

---

# Interview Questions

## Basic

1. Does ANSI SQL define variables?
2. What is the difference between an alias and a variable?
3. Where are SQL variables commonly used?

### Intermediate

4. Explain the difference between session variables and local variables.
5. Why is variable syntax different across database systems?
6. Why should variable assignment queries usually return only one row?

### Advanced

7. Explain how procedural runtimes interact with the relational engine.
8. Why is row-by-row processing often discouraged in SQL?
9. When is it appropriate to use database variables instead of application variables?

---

# Hands-on Exercises

## Exercise 1

Write a T-SQL example that stores an employee's salary in a variable.

---

## Exercise 2

Write an Oracle PL/SQL block that retrieves a customer's email into a local variable.

---

## Exercise 3

Create a MySQL session variable containing today's date.

---

## Exercise 4

Explain why the following statement is **not portable SQL**:

```sql
SELECT Salary
INTO @salary
FROM Employees;
```

---

# Related Topics

- **05.05 — Column Aliases**
- **05.09 — SELECT Without FROM**
- **06.xx — WHERE Clause**
- **18.xx — Stored Procedures**
- **18.xx — Triggers**
- **19.xx — SQL Programming Extensions**

---

# Summary

Variable assignment is not part of portable ANSI SQL but is provided by procedural extensions such as PL/SQL, T-SQL, PL/pgSQL, and MySQL stored programs. Although syntax differs across vendors, the underlying idea is the same: execute a query, retrieve a value, and store it temporarily for procedural logic. Understanding this distinction helps you write portable SQL while taking advantage of vendor-specific programming features when appropriate.