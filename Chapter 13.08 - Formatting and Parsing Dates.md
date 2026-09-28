---
title: "13.08 - Formatting and Parsing Dates"
description: "Turning dates into text with TO_CHAR, DATE_FORMAT, FORMAT, CONVERT styles and strftime, and text into dates with TO_DATE, TO_TIMESTAMP, STR_TO_DATE, CONVERT, PARSE and TRY_CONVERT; format codes on each engine; ISO-8601 as the safe interchange format; ambiguous literals and session settings such as DATEFORMAT and NLS_DATE_FORMAT; locale-dependent names; Unix timestamps; validating dates on load; and why formatting belongs at the end of a query."
chapter: 13
section: 13.08
category: Data Query Language (DQL)
difficulty: Intermediate
readingTime: 25 min
lastUpdated: 2026-09-28
---

# 13.08 Formatting and Parsing Dates

---

# Learning Objectives

After completing this section, you will be able to:

- Format a date as text in any layout on each major engine.
- Parse text in a known layout into a date.
- Explain why ISO-8601 is the only safe format for literals and interchange.
- Recognise ambiguous literals and the session settings that change them.
- Convert Unix timestamps to and from dates.
- Validate dates while loading external data.

---

# Formatting: Date → Text

| Engine | Function | `2026-09-28 14:05` as `28/09/2026 14:05` |
|--------|----------|--------------------------------------------|
| PostgreSQL | `TO_CHAR(ts, fmt)` | `TO_CHAR(ts, 'DD/MM/YYYY HH24:MI')` |
| Oracle | `TO_CHAR(ts, fmt)` | `TO_CHAR(ts, 'DD/MM/YYYY HH24:MI')` |
| MySQL | `DATE_FORMAT(ts, fmt)` | `DATE_FORMAT(ts, '%d/%m/%Y %H:%i')` |
| SQL Server | `FORMAT(ts, fmt [, culture])` | `FORMAT(ts, 'dd/MM/yyyy HH:mm')` |
| SQL Server | `CONVERT(varchar, ts, style)` | `CONVERT(varchar(16), ts, 103) + ' ' + CONVERT(varchar(5), ts, 108)` |
| SQLite | `strftime(fmt, ts)` | `strftime('%d/%m/%Y %H:%M', ts)` |

---

# Format Codes

| Meaning | PostgreSQL / Oracle | MySQL | SQL Server `FORMAT` (.NET) | SQLite `strftime` |
|---------|---------------------|-------|----------------------------|-------------------|
| 4-digit year | `YYYY` | `%Y` | `yyyy` | `%Y` |
| Month 01–12 | `MM` | `%m` | `MM` | `%m` |
| Month name | `Month` / `Mon` | `%M` / `%b` | `MMMM` / `MMM` | — |
| Day 01–31 | `DD` | `%d` | `dd` | `%d` |
| Weekday name | `Day` / `Dy` | `%W` / `%a` | `dddd` / `ddd` | — |
| Hour 00–23 | `HH24` | `%H` | `HH` | `%H` |
| Hour 01–12 + AM/PM | `HH12` + `AM` | `%h` + `%p` | `hh` + `tt` | `%I` + `%p` (3.46+) |
| Minute | `MI` | `%i` | `mm` | `%M` |
| Second | `SS` | `%s` | `ss` | `%S` |
| Fraction | `MS` / `US` (PG), `FF3` (Oracle) | `%f` (µs) | `fff` | `%f` (SS.SSS) |
| ISO week | `IW` | `%v` | — (use `DATEPART(iso_week, d)`) | `%V` (3.46+) |

Every engine uses a different code for "minute": `MI`, `%i`, `mm`, `%M`. In SQL Server, `mm` is minutes and `MM` is months; in MySQL, `%M` is the month **name** and `%i` is minutes. Copying a format string between engines silently produces wrong text.

> PostgreSQL and Oracle pad month and day names to nine characters (`'May      '`). Prefix `FM` to suppress padding: `TO_CHAR(d, 'FMDay, FMDD FMMonth YYYY')` → `Monday, 28 September 2026`.

---

# SQL Server CONVERT Styles

| Style | Output | Layout |
|-------|--------|--------|
| 23 | `2026-09-28` | ISO date |
| 112 | `20260928` | ISO basic |
| 126 | `2026-09-28T14:05:00` | ISO-8601 |
| 103 | `28/09/2026` | British/French |
| 101 | `09/28/2026` | US |
| 108 | `14:05:00` | Time |

`CONVERT` with a style is much faster than `FORMAT`, which calls into the .NET runtime per row. Avoid `FORMAT` on large result sets.

---

# Parsing: Text → Date

| Engine | Parse `'28/09/2026'` |
|--------|----------------------|
| PostgreSQL | `TO_DATE('28/09/2026', 'DD/MM/YYYY')` |
| Oracle | `TO_DATE('28/09/2026', 'DD/MM/YYYY')` |
| MySQL | `STR_TO_DATE('28/09/2026', '%d/%m/%Y')` |
| SQL Server | `CONVERT(date, '28/09/2026', 103)` or `TRY_CONVERT(date, '28/09/2026', 103)` |
| SQLite | Rearrange the text: `substr(s, 7, 4) \|\| '-' \|\| substr(s, 4, 2) \|\| '-' \|\| substr(s, 1, 2)` |

Timestamps: `TO_TIMESTAMP(s, fmt)` (PostgreSQL, Oracle), `STR_TO_DATE` with time codes (MySQL), `CONVERT(datetime2, s, style)` (SQL Server).

Parsing strictness varies:

- **PostgreSQL** `TO_DATE` is lenient: `TO_DATE('2026-02-30', 'YYYY-MM-DD')` raises an error, but many malformed strings are accepted with surprising results. Prefer a plain cast (`'2026-09-28'::date`) for ISO input, which is strict.
- **MySQL** `STR_TO_DATE` returns `NULL` with a warning for unparseable input—and in non-strict modes can return "zero dates" like `0000-00-00`.
- **SQL Server** `CONVERT` raises an error; `TRY_CONVERT` returns `NULL`.
- **Oracle** raises an error; 12.2+ supports `TO_DATE(s DEFAULT NULL ON CONVERSION ERROR, fmt)` and `VALIDATE_CONVERSION(s AS DATE, fmt)`.

---

# Ambiguous Literals

Is `'03/04/2026'` March 4 or April 3? It depends on the session:

```sql
-- SQL Server
SET DATEFORMAT mdy;  SELECT CAST('03/04/2026' AS date);   -- 2026-03-04
SET DATEFORMAT dmy;  SELECT CAST('03/04/2026' AS date);   -- 2026-04-03
SET LANGUAGE British; SELECT CAST('03/04/2026' AS date);  -- 2026-04-03 (language sets DATEFORMAT)
```

- SQL Server interprets strings using `SET DATEFORMAT`/`SET LANGUAGE`, which drivers and logins can change. Even `'2026-09-28'` is interpreted as year-**day**-month for `datetime` under some languages; only `'20260928'` and `'2026-09-28T14:05:00'` are safe for every type and setting.
- Oracle implicit conversions use `NLS_DATE_FORMAT` (often `DD-MON-RR`), so `WHERE OrderDate = '28-SEP-26'` works in one session and fails in another.
- PostgreSQL uses the `DateStyle` setting for ambiguous input such as `'03/04/2026'`.
- MySQL accepts only year-first forms for implicit conversion.

The rule: **write literals and interchange dates in ISO-8601**, and use typed literals where the engine supports them:

```sql
DATE '2026-09-28'                          -- PostgreSQL, MySQL, Oracle
TIMESTAMP '2026-09-28 14:05:00'            -- PostgreSQL, MySQL, Oracle
'20260928'                                 -- SQL Server date, always unambiguous
'2026-09-28T14:05:00'                      -- SQL Server datetime/datetime2, always unambiguous
```

---

# Unix Timestamps

```sql
-- seconds since 1970-01-01 UTC → timestamp
SELECT TO_TIMESTAMP(1790605800);                              -- PostgreSQL (timestamptz)
SELECT FROM_UNIXTIME(1790605800);                             -- MySQL (session time zone)
SELECT DATEADD(second, 1790605800, '1970-01-01');             -- SQL Server (UTC datetime)
SELECT TIMESTAMP '1970-01-01 00:00:00 UTC' + NUMTODSINTERVAL(1790605800, 'SECOND') FROM dual;  -- Oracle
SELECT datetime(1790605800, 'unixepoch');                     -- SQLite (UTC)

-- timestamp → seconds
SELECT EXTRACT(EPOCH FROM ts);          -- PostgreSQL
SELECT UNIX_TIMESTAMP(ts);              -- MySQL
SELECT DATEDIFF_BIG(second, '1970-01-01', ts);   -- SQL Server
SELECT unixepoch(ts);                   -- SQLite 3.38+
```

Many APIs send milliseconds, not seconds. `1790605800000` interpreted as seconds is a date tens of thousands of years in the future; divide by 1000 first.

---

# Validating Dates on Load

```sql
-- SQL Server: rows whose date text will not parse
SELECT * FROM StagingOrders
WHERE RawOrderDate IS NOT NULL
  AND TRY_CONVERT(date, RawOrderDate, 103) IS NULL;

-- PostgreSQL 16+
SELECT * FROM StagingOrders
WHERE RawOrderDate IS NOT NULL
  AND NOT pg_input_is_valid(RawOrderDate, 'date');

-- SQLite: date() returns NULL for invalid input; round-trip to reject normalised values
SELECT * FROM StagingOrders
WHERE RawOrderDate IS NOT date(RawOrderDate);
```

Validation catches not only garbage but impossible dates (`2026-02-30`), two-digit years, and swapped day and month where the day is above 12.

---

# Format Last

```sql
-- ❌ Formatting early: grouping and sorting on text
SELECT TO_CHAR(OrderDate, 'Mon YYYY') AS M, SUM(TotalAmount)
FROM Orders GROUP BY TO_CHAR(OrderDate, 'Mon YYYY') ORDER BY M;     -- 'Apr 2026' before 'Jan 2026'

-- ✅ Group and sort by the date, format only for output
SELECT TO_CHAR(M, 'Mon YYYY') AS MonthLabel, Revenue
FROM (
    SELECT DATE_TRUNC('month', OrderDate) AS M, SUM(TotalAmount) AS Revenue
    FROM Orders GROUP BY DATE_TRUNC('month', OrderDate)
) AS t
ORDER BY M;
```

Better still, return the date and let the application format it in the user's locale.

---

# Visual Representation

```text
      TEXT  ──── parse (TO_DATE, STR_TO_DATE, CONVERT style, TRY_CONVERT) ────▶  DATE
   '28/09/2026'           needs: the layout, strictness, error handling          2026-09-28
                                                                                    │
      TEXT  ◀─── format (TO_CHAR, DATE_FORMAT, FORMAT, strftime) ───────────────────┘
   'Monday, 28 September 2026'   needs: the layout, the language, the time zone

   between systems: ISO-8601 only  →  2026-09-28  ·  2026-09-28T14:05:00Z
```

---

# 📍 Execution Order Reminder

```text
1. FROM
2. JOIN        ← never join on formatted dates
3. WHERE       ← compare dates with typed literals, not formatted text
4. GROUP BY    ← group by the date or truncated date
5. HAVING
6. WINDOW
7. SELECT      ← format here, in the outermost query
8. DISTINCT
9. ORDER BY    ← order by the date value (an unformatted column or alias)
10. LIMIT / FETCH / TOP
```

---

# How the DBMS Executes This

```text
Literal '2026-09-28' compared with a DATE column:
  bind → convert the literal once using session settings → compare internally
TO_CHAR(OrderDate, fmt) in SELECT:
  per output row → calendar conversion → build a string (language lookup for names)
TO_CHAR(OrderDate, fmt) = 'Sep 2026' in WHERE:
  per row, for every scanned row → no index use → Filter
```

---

# 🏗️ Architecture Insight

Dates should cross system boundaries as typed values (driver parameters) or ISO-8601 text—never in a locale format. Keep formatting in the presentation layer, where the user's locale, language and time zone are known; SQL should hand dates over as dates.

---

# ⚡ Performance Tip

On SQL Server, `FORMAT` can be tens of times slower than `CONVERT` with a style, because it runs .NET code per row. On all engines, formatting in `WHERE` or `GROUP BY` costs a string build per row; group by dates and format only the final rows.

---

# 🔒 Security Note

Never build SQL by concatenating a formatted date into the statement text. Besides injection risk, the text is reinterpreted using the server's session settings and can mean a different day. Pass dates as typed parameters.

---

# SQL Standard vs Vendor Differences

| Feature | SQL Standard | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
|----------|--------------|------------|--------|------------|---------|---------|
| Format | ❌ (`CAST` to text) | `TO_CHAR` | `DATE_FORMAT` | `FORMAT`, `CONVERT` style | `TO_CHAR` | `strftime` |
| Parse with layout | ❌ | `TO_DATE`, `TO_TIMESTAMP` | `STR_TO_DATE` | `CONVERT` style, `PARSE` | `TO_DATE`, `TO_TIMESTAMP` | ❌ |
| Safe parse | ❌ | `pg_input_is_valid` (16+) | `NULL` + warning | `TRY_CONVERT`, `TRY_PARSE` | `DEFAULT … ON CONVERSION ERROR` | `date()` → `NULL` |
| Typed literal | `DATE '…'` | ✅ | ✅ | ❌ | ✅ | ❌ |
| Session format setting | ❌ | `DateStyle` | — | `DATEFORMAT`, `LANGUAGE` | `NLS_DATE_FORMAT` | — |

> **Portability Tip:** ISO-8601 literals, `CAST(x AS DATE)` for ISO text, and returning dates unformatted to the application are portable. Format strings are not—every engine has its own codes.

---

# Common Mistakes

### Mistake 1

Using locale-dependent literals like `'03/04/2026'`.

---

### Mistake 2

Copying format strings between engines (`mm` vs `MM`, `%M` vs `%i`).

---

### Mistake 3

Grouping or sorting by formatted text.

---

### Mistake 4

Using SQL Server `FORMAT` on millions of rows.

---

### Mistake 5

Treating millisecond Unix timestamps as seconds.

---

# Best Practices

✔ Write literals as `DATE '2026-09-28'`, `'20260928'` or ISO-8601.

✔ Parse external text with an explicit layout and a safe-conversion function.

✔ Format last, preferably in the application.

✔ Use `CONVERT` styles rather than `FORMAT` on SQL Server.

✔ Exchange dates between systems in ISO-8601 with an explicit offset or `Z`.

---

# Interview Questions

## Basic

1. How do you format a date as `YYYY-MM-DD` on MySQL?
2. How do you parse `'28/09/2026'` on Oracle?
3. What is ISO-8601?

## Intermediate

4. Why is `'03/04/2026'` dangerous in a query?
5. What is the difference between `mm` and `MM` in SQL Server `FORMAT`?
6. How do you convert a Unix timestamp to a date on PostgreSQL?

## Advanced

7. Why is `'2026-09-28'` not always safe for SQL Server `datetime`?
8. Why should formatting happen in the outermost query?

---

# Hands-on Exercises

## Exercise 1

Format each order date as `Monday, 28 September 2026` on two engines.

---

## Exercise 2

Load a staging table with dates in `DD/MM/YYYY` text, reporting rows that do not parse.

---

## Exercise 3

Rewrite a monthly report that groups by `TO_CHAR(d, 'Mon YYYY')` so that months sort correctly.

---

# Related Topics

- **13.04 — Extracting Date Parts (EXTRACT, DATEPART and DATENAME)**
- **12.04 — Concatenation and String Formatting**
- **12.08 — Type Conversion (CAST, CONVERT and TRY_CAST)**
- **13.16 — Common Date and Time Mistakes & Best Practices**

---

# Summary

Formatting turns dates into text (`TO_CHAR`, `DATE_FORMAT`, `FORMAT`, `CONVERT` styles, `strftime`) and parsing turns text into dates (`TO_DATE`, `STR_TO_DATE`, `CONVERT`, `TRY_CONVERT`)—with a different set of format codes on every engine. Ambiguous literals are interpreted using session settings such as `DATEFORMAT` and `NLS_DATE_FORMAT`, so literals and interchange formats should always be ISO-8601 or typed literals. Validate external dates with safe conversion on load, watch for millisecond Unix timestamps, and format last—after grouping and sorting on real date values, or in the application.
