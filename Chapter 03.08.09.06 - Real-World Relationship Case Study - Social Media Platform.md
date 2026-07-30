---
title: "03.08.09.06 - Real-World Relationship Case Study: Social Media Platform"
description: "Learn how a modern social media platform is designed using relational databases. Explore users, posts, comments, reactions, followers, messaging, notifications, hashtags, polymorphic relationships, denormalization, feed generation, and enterprise architecture."
chapter: 3
section: 3.8.9.6
category: Core SQL Concepts
difficulty: Advanced
readingTime: 95 min
lastUpdated: 2026-07-27
---

# 03.08.09.06 Social Media Platform

## Learning Objectives

After completing this lesson, you will be able to:

- Design a scalable social media database
- Model followers and friendships
- Build news feed relationships
- Design messaging systems
- Understand polymorphic relationships
- Apply soft deletes and audit logging
- Learn denormalization strategies
- Understand graph-like relationships in relational databases

---

# Introduction

Modern social media platforms process billions of records every day.

Examples include:

- Facebook
- Instagram
- Threads
- LinkedIn
- X (Twitter)
- Reddit

Unlike banking systems, social media platforms prioritize:

- High availability
- Massive scalability
- Fast feed generation
- Real-time notifications
- Low-latency reads

Most still rely heavily on relational databases for core transactional data, often complemented by specialised storage systems for caching, search, and analytics.

---

# Business Requirements

The platform should support:

- User registration
- User profiles
- Followers
- Friend requests
- Posts
- Images & Videos
- Comments
- Replies
- Likes & Reactions
- Hashtags
- Notifications
- Private Messages
- Groups
- Pages
- Story posts
- Saved posts
- Blocking users
- Reporting content

---

# Step 1 — Identify Entities

| Entity | Purpose |
|---------|----------|
| Users | User accounts |
| UserProfiles | Profile information |
| Posts | User posts |
| Media | Images & videos |
| Comments | Post comments |
| Reactions | Likes, Love, Haha, etc. |
| Followers | Follow relationships |
| FriendRequests | Friend requests |
| Messages | Private chats |
| Conversations | Chat sessions |
| Notifications | User notifications |
| Hashtags | Searchable topics |
| PostHashtags | Junction table |
| SavedPosts | Bookmark posts |
| Reports | Content reports |
| Blocks | User blocking |
| AuditLogs | Security logs |

---

# Step 2 — Relationship Analysis

| Parent | Child | Relationship |
|---------|--------|-------------|
| User → Posts | One-to-Many |
| User → Comments | One-to-Many |
| User → Notifications | One-to-Many |
| User → Messages | One-to-Many |
| User → SavedPosts | One-to-Many |
| Post → Comments | One-to-Many |
| Post → Media | One-to-Many |
| Post → Reactions | One-to-Many |
| Conversation → Messages | One-to-Many |
| Users ↔ Users | Many-to-Many (Followers) |
| Users ↔ Users | Many-to-Many (Friends) |
| Posts ↔ Hashtags | Many-to-Many |
| Users ↔ Posts | Many-to-Many (Saved Posts) |

---

# Enterprise ER Diagram

```text
Users
 │
 ├──────── UserProfiles
 ├──────── Posts
 │            │
 │            ├──────── Comments
 │            ├──────── Media
 │            ├──────── Reactions
 │            └──────── PostHashtags
 │                          │
 │                      Hashtags
 │
 ├──────── Notifications
 ├──────── SavedPosts
 ├──────── FriendRequests
 ├──────── Followers
 ├──────── Blocks
 └──────── Reports

Conversations
      │
      ▼
Messages

AuditLogs
```

---

# Relationship Breakdown

## One-to-One

```
Users

↓

UserProfiles
```

Each user owns one profile.

---

## One-to-Many

```
Users

↓

Posts
```

Users publish many posts.

---

```
Posts

↓

Comments
```

A post can receive thousands of comments.

---

```
Conversations

↓

Messages
```

One conversation contains many messages.

---

## Many-to-Many

### Followers

```
Users

↓

Followers

↓

Users
```

One user may follow millions of users.

One user may have millions of followers.

---

### Posts ↔ Hashtags

```
Posts

↓

PostHashtags

↓

Hashtags
```

A post can contain multiple hashtags.

A hashtag can belong to millions of posts.

---

# Polymorphic Relationships

One of the most common enterprise patterns.

Users can react to:

- Posts
- Comments
- Stories
- Photos
- Videos

Instead of creating five separate tables:

```
PostLikes

CommentLikes

PhotoLikes

StoryLikes
```

Many systems use:

```
Reactions

ReactionID

UserID

EntityType

EntityID

ReactionType
```

Example:

| EntityType | EntityID |
|------------|----------|
| Post | 101 |
| Comment | 25 |
| Story | 88 |

This is called a **Polymorphic Relationship**.

---

# Self-Referencing Relationships

Comments can reply to other comments.

```
CommentID

ParentCommentID
```

Example

```
Comment

↓

Reply

↓

Reply

↓

Reply
```

This creates threaded discussions.

---

# Feed Generation

The News Feed is the most complex feature.

Instead of:

```
SELECT *

FROM Posts

ORDER BY CreatedAt DESC;
```

Platforms rank posts using:

- Following relationships
- Relevance
- Engagement
- User interests
- Location
- Time decay
- Machine learning

The database provides the data, while ranking algorithms determine the order.

---

# Denormalization

News feeds cannot join dozens of tables for every request.

Instead:

```
Posts

↓

Feed Cache
```

Common denormalized values include:

- Like count
- Comment count
- Share count
- View count

These are updated asynchronously for faster reads.

---

# Soft Deletes

Posts are rarely removed permanently.

Instead:

```
DeletedAt

DeletedBy

DeleteReason
```

This allows:

- Recovery
- Moderation
- Appeals
- Legal compliance

---

# Audit Tables

Important events are recorded.

```
AuditLogs

↓

Login

Password Change

Role Change

Account Suspension
```

---

# Lookup Tables

Common lookup tables:

- Reaction Types
- Notification Types
- User Roles
- Privacy Levels
- Report Categories
- Media Types

These improve consistency and simplify maintenance.

---

# Status History

Instead of only storing:

```
AccountStatus

Active
```

Maintain history:

| UserID | Status | EffectiveFrom |
|--------|--------|---------------|
| 10 | Active | 2025-01-01 |
| 10 | Suspended | 2025-04-12 |
| 10 | Active | 2025-04-20 |

This supports moderation and auditing.

---

# Event-Driven Architecture

Many social media features are asynchronous.

Example:

```
User Likes Post

↓

Create Reaction

↓

Increase Like Count

↓

Generate Notification

↓

Update Feed Cache

↓

Analytics Event
```

These actions are often processed through message queues and background workers.

---

# Graph-Like Relationships

Followers naturally form a graph.

```
Alice

↓

Bob

↓

Charlie

↓

David

↓

Emma
```

Although stored in relational tables, applications often treat these connections as a graph for recommendations and mutual connections.

---

# Performance Considerations

Large social platforms optimise for read-heavy workloads.

Best practices:

- Index UserID, PostID, CreatedAt
- Cache feeds
- Partition posts by date
- Archive inactive content
- Use read replicas
- Optimise pagination
- Cache frequently accessed profiles

---

# Security Considerations

Protect user privacy by:

- Encrypting sensitive information
- Hashing passwords
- Implementing RBAC
- Applying rate limiting
- Recording audit logs
- Moderating abusive content
- Supporting account recovery

---

# Enterprise Architecture Notes

This case study introduces several concepts that become increasingly important at scale:

### Feed Cache

Precomputed feeds reduce expensive joins.

---

### CQRS

Separate write operations (creating posts) from read operations (viewing feeds).

---

### Event Sourcing

Store every user action as an event.

Examples:

- Post Created
- Comment Added
- User Followed
- Reaction Added

---

### Change Data Capture (CDC)

Database changes can trigger search indexing, analytics, and recommendation updates.

---

### Read Replicas

Millions of users primarily read content rather than write it.

Read replicas distribute this workload across multiple database servers.

---

### Microservices

Large platforms often split functionality into independent services:

- Authentication
- Feed
- Messaging
- Notifications
- Search
- Media Processing

Each service may own its own database.

---

# DBMS Compatibility

| Feature | MySQL | PostgreSQL | SQL Server | Oracle | MariaDB |
|---------|:-----:|:----------:|:----------:|:------:|:--------:|
| Foreign Keys | ✅ | ✅ | ✅ | ✅ | ✅ |
| Recursive CTE | ✅ | ✅ | ✅ | ✅ | ✅ |
| JSON Support | ✅ | ✅ | ✅ | ✅ | ✅ |
| Partitioning | ✅ | ✅ | ✅ | ✅ | ✅ |
| Window Functions | ✅ | ✅ | ✅ | ✅ | ✅ |

---

# 💡 Did You Know?

Large social media platforms rarely generate a user's news feed on demand. Instead, they often maintain precomputed or partially precomputed feeds and update them when users create posts or interact with content. This significantly reduces response times for users scrolling through their feed.

---

# Interview Questions

1. Why is Followers a Many-to-Many relationship?
2. What is a polymorphic relationship?
3. Why use soft deletes?
4. Why denormalize like counts?
5. Why are comments self-referencing?
6. What is feed caching?
7. What is CQRS?
8. Why use read replicas?

---

# Hands-on Exercises

### Exercise 1

Draw the complete ER diagram.

---

### Exercise 2

Design tables for:

- Users
- Posts
- Comments
- Followers
- Reactions
- Notifications

---

### Exercise 3

Design a polymorphic `Reactions` table supporting:

- Posts
- Comments
- Stories
- Photos

---

### Exercise 4

Design a scalable news feed architecture.

Identify which data should be cached and which should remain normalized.

---

### Exercise 5

Extend the platform by adding:

- Live Streaming
- Marketplace
- Communities
- Events
- AI Recommendations

Explain the additional entities and relationships.

---

# Summary

This case study explored how relational databases support modern social media platforms. Alongside core relationship types, you learned enterprise patterns such as polymorphic relationships, self-referencing comments, denormalization, feed caching, event-driven architecture, graph-like relationships, and microservice-oriented design.

---

# Related Topics

### Previous Lessons

- 03.08.09.01 — Student Management System
- 03.08.09.02 — E-Commerce Platform
- 03.08.09.03 — Hospital Management System
- 03.08.09.04 — Human Resource Management System (HRMS)
- 03.08.09.05 — Banking System

### Next Lesson

**03.08.09.07 — Real-World Relationship Case Study: ERP (Enterprise Resource Planning) System**