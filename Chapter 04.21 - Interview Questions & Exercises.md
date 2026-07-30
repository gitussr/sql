---
title: "04.21 - Interview Questions & Exercises"
description: "Comprehensive interview questions, practical exercises, debugging scenarios, and enterprise case studies covering all SQL Fundamentals from Chapter 04."
chapter: 4
section: 4.21
category: SQL Fundamentals
difficulty: Beginner → Advanced
readingTime: 50 min
lastUpdated: 2026-07-30
---

# 04.21 Interview Questions & Exercises

---

# Learning Objectives

After completing this chapter, you should be able to:

- Explain SQL fundamentals confidently.
- Answer technical interview questions.
- Understand SQL processing internally.
- Apply enterprise SQL standards.
- Debug common SQL mistakes.
- Build confidence before moving to Chapter 05.

---

# Part 1 — Beginner Interview Questions

## SQL Basics

1. What is SQL?
2. What are the major SQL command categories?
3. Explain DDL, DML, DQL, DCL, and TCL.
4. What is ANSI SQL?
5. Why is SQL considered a declarative language?

---

## SQL Syntax

6. What are SQL clauses?
7. What is the difference between SQL statements and clauses?
8. What are SQL keywords?
9. What are SQL identifiers?
10. What are SQL reserved words?

---

## SQL Comments

11. Why are comments important?
12. Difference between single-line and multi-line comments?
13. Do comments affect execution?

---

## SQL Formatting

14. Why should SQL be formatted consistently?
15. Why are SQL keywords commonly capitalized?
16. What makes SQL readable?

---

# Part 2 — Intermediate Interview Questions

## SQL Processing Pipeline

17. What happens after SQL is submitted?

18. Explain:

- Lexer
- Parser
- Syntax Tree
- Optimizer
- Execution Engine

19. What is semantic analysis?

20. What is an execution plan?

---

## SQL Execution Order

21. Does SQL execute from top to bottom?

22. What is the logical execution order?

23. Why does FROM execute before SELECT?

24. Why can't aliases usually be used inside WHERE?

25. Difference between logical execution and physical execution?

---

## SQL Commands

26. Difference between:

- DELETE
- TRUNCATE
- DROP

27. Difference between COMMIT and ROLLBACK.

28. Difference between GRANT and REVOKE.

29. Difference between WHERE and HAVING.

30. Difference between DDL and DML.

---

# Part 3 — Advanced Interview Questions

31. Explain how a cost-based optimizer works.

32. What is predicate pushdown?

33. Why do execution plans differ between PostgreSQL and SQL Server?

34. Explain parser vs optimizer.

35. Why can two different SQL queries produce the same execution plan?

36. What is query rewriting?

37. Why doesn't SQL execution always match the written order?

38. Explain projection pruning.

39. Explain constant folding.

40. Explain join reordering.

---

# Part 4 — Architecture Questions

41. Explain the complete SQL lifecycle.

```text
SQL

↓

Parser

↓

Optimizer

↓

Execution Plan

↓

Storage Engine

↓

Buffer Manager

↓

Disk

↓

Result
```

42. Where are identifiers stored?

43. What is a system catalog?

44. What metadata does a database maintain?

45. Why is metadata important?

---

# Part 5 — Enterprise Questions

46. Why do companies enforce SQL naming conventions?

47. Why should constraints be explicitly named?

48. Why are code reviews important for SQL?

49. Why is SQL formatting part of engineering standards?

50. What problems arise from inconsistent naming?

51. Why should reserved words be avoided?

52. Why should production SQL contain documentation?

53. Why are execution plans reviewed before deployment?

---

# Part 6 — SQL Standard vs Vendor Differences

54. Why doesn't every DBMS support identical SQL syntax?

55. Compare:

- PostgreSQL
- MySQL
- SQL Server
- Oracle
- SQLite

with respect to:

- Identifier quoting
- Row limiting
- Auto-increment
- Reserved words

56. Why should developers learn ANSI SQL first?

---

# Part 7 — Practical Exercises

## Exercise 1

Classify the following statements:

```sql
CREATE TABLE

INSERT

UPDATE

SELECT

GRANT

ROLLBACK
```

Identify whether each belongs to DDL, DML, DQL, DCL, or TCL.

---

## Exercise 2

Rewrite the following poorly formatted query:

```sql
select * from customers where status='Active' order by customername;
```

Apply the formatting standards from this chapter.

---

## Exercise 3

Identify all identifiers:

```sql
SELECT
    CustomerName
FROM Customers;
```

---

## Exercise 4

Find all reserved words:

```sql
SELECT
FROM
WHERE
TABLE
GROUP
ORDER
```

Explain why they should not normally be used as object names.

---

## Exercise 5

Write the logical execution order for:

```sql
SELECT
    Department,
    COUNT(*)
FROM Employees
WHERE Salary > 50000
GROUP BY Department
HAVING COUNT(*) > 5
ORDER BY Department;
```

---

## Exercise 6

Rewrite the following using better naming conventions:

```text
tbl1

abc

temp

cust

ord
```

---

## Exercise 7

Add meaningful comments to this query:

```sql
SELECT *
FROM Orders
WHERE Status='Pending';
```

---

## Exercise 8

Identify formatting problems:

```sql
SELECT CustomerName,Email FROM Customers WHERE Country='India';
```

Rewrite it according to the style guide.

---

# Part 8 — Debugging Exercises

Explain why each query fails.

---

### Problem 1

```sql
SELECT AnnualSalary
FROM Employees
WHERE AnnualSalary > 100000;
```

---

### Problem 2

```sql
CREATE TABLE SELECT
(
    ID INT
);
```

---

### Problem 3

```sql
SELECT *
FROM Customers
HAVING Country = 'India';
```

---

### Problem 4

```sql
SELECT DISTINCT
CustomerName
FROM Customers
ORDER BY TotalSales;
```

Explain whether this is valid and under what conditions.

---

# Part 9 — Mini Case Studies

## Case Study 1

Your team has inherited a database where tables are named:

```text
tbl1

tbl2

x1

abc

zzz
```

Tasks:

- Identify the problems.
- Propose better names.
- Define a naming standard.
- Estimate long-term maintenance benefits.

---

## Case Study 2

Review this SQL coding style:

```sql
select customername,email from customers where country='India';
```

Rewrite it using the handbook's style guide.

---

## Case Study 3

Your organisation supports both PostgreSQL and SQL Server.

Discuss:

- SQL portability
- Vendor differences
- Naming conventions
- Reserved words
- Row limiting syntax

---

# Part 10 — Challenge Questions

1. Explain SQL execution order without writing SQL.
2. Explain the SQL processing pipeline using a restaurant analogy.
3. Design a SQL style guide for a software engineering company.
4. Design a naming convention for an ERP database.
5. Explain why SQL is declarative rather than procedural.
6. Explain why the optimizer can change the execution plan without changing the result.

---

# Self-Evaluation Checklist

You should now be able to answer **YES** to all of the following:

- [ ] I understand SQL syntax.
- [ ] I understand SQL command categories.
- [ ] I know the logical execution order.
- [ ] I understand the SQL processing pipeline.
- [ ] I understand identifiers and reserved words.
- [ ] I can follow SQL naming conventions.
- [ ] I can format SQL professionally.
- [ ] I know enterprise SQL documentation practices.
- [ ] I understand SQL portability across DBMSs.
- [ ] I can explain SQL fundamentals in a technical interview.

---

# SQL Standard vs Vendor Differences

> **Reminder:** While interview questions often use ANSI SQL, employers typically expect familiarity with the SQL dialect of the database they use (such as PostgreSQL, MySQL, SQL Server, Oracle, or SQLite). When answering interview questions, distinguish between **standard SQL concepts** and **vendor-specific syntax or features**.

---

# Related Topics

- **Chapter 03 — Database Design**
- **Chapter 04 — SQL Fundamentals**
- **Chapter 05 — SELECT Statement**
- **Chapter 10 — SQL Performance**
- **Chapter 12 — Transactions**
- **Chapter 15 — Query Optimization**

---

# Summary

This chapter serves as the capstone assessment for SQL Fundamentals. It combines conceptual questions, architecture discussions, debugging exercises, practical formatting tasks, enterprise case studies, and interview-style scenarios to reinforce everything covered in Chapter 04. Completing these exercises provides a solid foundation for writing production-quality SQL and prepares you for the practical, query-focused chapters that follow.