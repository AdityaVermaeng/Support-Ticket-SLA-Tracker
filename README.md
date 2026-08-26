# Support Ticket & SLA Tracker

A full-stack support ticket management system with automated SLA (Service Level Agreement) tracking, built for the **Burdenoff Product Engineering Intern** take-home assignment.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **API** | GraphQL Yoga (schema-first) |
| **Backend** | Node.js, TypeScript (strict mode) |
| **Database** | PostgreSQL 16 (via Docker) |
| **ORM** | Prisma 7 |
| **Auth** | JWT + bcrypt |
| **Frontend** | React 19 + Vite + TypeScript |
| **Testing** | Node.js built-in test runner |

## Architecture Overview

```
┌─────────────────┐     GraphQL      ┌──────────────────────────────┐
│   React Frontend│─────────────────▶│   GraphQL Yoga Server        │
│   (Vite)        │  /graphql        │                              │
└─────────────────┘                  │  ┌─ Resolvers (thin layer) ──┤
                                     │  │  ├── auth.resolvers.ts    │
                                     │  │  ├── ticket.resolvers.ts  │
                                     │  │  ├── comment.resolvers.ts │
                                     │  │  ├── dashboard.resolvers  │
                                     │  │  └── holiday.resolvers.ts │
                                     │  └──────────────────────────┤│
                                     │  ┌─ Services (business logic)│
                                     │  │  ├── auth.service.ts      │
                                     │  │  ├── ticket.service.ts    │
                                     │  │  ├── comment.service.ts   │
                                     │  │  ├── dashboard.service.ts │
                                     │  │  └── sla.service.ts ──────┤── SLA Engine
                                     │  └──────────────────────────┤│
                                     │         Prisma ORM           │
                                     └──────────┬───────────────────┘
                                                │
                                     ┌──────────▼───────────────────┐
                                     │   PostgreSQL 16 (Docker)     │
                                     └─────────────────────────────┘
```

### Design Decisions

- **Schema-first GraphQL**: `.graphql` files define the API contract; resolvers are separate TypeScript files
- **Thin resolvers**: All business logic lives in dedicated service modules; resolvers only authenticate, call services, and format errors
- **SLA isolation**: The SLA engine (`sla.service.ts`) is a pure calculation module with no database dependencies — holidays are injected from callers
- **Timezone-aware**: Business hours use `BUSINESS_TIMEZONE` env var (via `Intl.DateTimeFormat`) — not hardcoded UTC

## Database Schema

```prisma
enum UserRole   { REPORTER | AGENT | ADMIN }
enum TicketPriority { LOW | MEDIUM | HIGH | URGENT }
enum TicketStatus   { OPEN | IN_PROGRESS | RESOLVED | CLOSED }

model User    { id, name, email, passwordHash, role, createdTickets[], assignedTickets[], comments[] }
model Ticket  { id, title, description, priority, status, createdAt, updatedAt, firstResponseAt?, resolvedAt?, slaDeadline?, createdBy, assignedTo?, comments[] }
model Comment { id, content, createdAt, author, ticket }
model Holiday { id, date, name }
```

**Indexes**: `Ticket.status`, `Ticket.priority`, `Ticket.assignedToId`, `Ticket.createdAt`

## SLA Calculation

### Default Policies

| Priority | First Response | Resolution |
|----------|---------------|------------|
| URGENT | 1 business hour | 4 business hours |
| HIGH | 4 business hours | 24 business hours |
| MEDIUM | 8 business hours | 48 business hours |
| LOW | 24 business hours | 72 business hours |

### Business Hours

- **Days**: Monday – Friday
- **Hours**: 09:00 – 18:00 (9 hours/day = 540 minutes)
- **Timezone**: Configurable via `BUSINESS_TIMEZONE` (default: `Asia/Kolkata`)
- **Exclusions**: Weekends + configured holidays from the `Holiday` database table

### SLA States

| State | Condition |
|-------|-----------|
| **ON_TRACK** | 0%–75% of SLA budget consumed (inclusive of 75%) |
| **AT_RISK** | >75% consumed but deadline not yet passed |
| **BREACHED** | Deadline has passed |

### SLA Freezing

- **First Response**: Frozen when the first comment by someone *other than the reporter* is recorded. `firstResponseAt` is set once and never modified by later comments.
- **Resolution**: Frozen when ticket status becomes `RESOLVED`. `resolvedAt` is set once. A completed SLA that was ON_TRACK will **never** later become BREACHED.

### Remaining Time

`firstResponseRemainingMinutes` and `resolutionRemainingMinutes` represent **business time**, not wall-clock time. The frontend displays these values as-is without recalculating.

## Status Transitions

```
OPEN ──────────▶ IN_PROGRESS ──────▶ RESOLVED ──────▶ CLOSED
  │                  │                   │                │
  │                  ▼                   ▼                │
  ├─────────▶ RESOLVED           IN_PROGRESS             │
  ├─────────▶ CLOSED                                     │
  ◀──────────────────────────────────────────────────────┘
                                              (reopen to OPEN only)
```

**Blocked**: `CLOSED → IN_PROGRESS` (must reopen to `OPEN` first)

Invalid transitions return error code `INVALID_STATUS_TRANSITION`.

## Authentication

- **Registration**: bcrypt password hashing (10 rounds), JWT token issuance
- **Login**: Email/password verification, JWT token
- **Authorization**: Server-side role enforcement via GraphQL context
- **Security**: Public registration blocks `ADMIN` role creation (silently downgrades to `REPORTER`)
- **Token**: 7-day expiry, sent as `Authorization: Bearer <token>` header

### Roles

| Role | Permissions |
|------|------------|
| **REPORTER** | Create tickets, comment on own tickets, view own tickets |
| **AGENT** | Assign tickets, change status, resolve tickets, comment on all tickets, view all tickets |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | (required) |
| `JWT_SECRET` | Secret key for JWT signing | `sla-tracker-secret-key-2026` |
| `BUSINESS_TIMEZONE` | IANA timezone for business hours | `Asia/Kolkata` |
| `PORT` | Backend server port | `5000` |

## Setup Instructions

### Prerequisites

- Node.js 20+
- Docker & Docker Compose

### 1. Start PostgreSQL

```bash
docker compose up -d
```

### 2. Install Dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 3. Configure Environment

```bash
# backend/.env (already provided with defaults)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/support_ticket_db?schema=public"
JWT_SECRET="sla-tracker-secret-key-2026"
BUSINESS_TIMEZONE="Asia/Kolkata"
```

### 4. Run Migrations

```bash
cd backend
npx prisma migrate deploy
```

### 5. Seed Database

```bash
cd backend
npm run seed
```

**Seed credentials:**
- `reporter@example.com` / `password123` (REPORTER)
- `agent@example.com` / `password123` (AGENT)

### 6. Start Backend

```bash
cd backend
npm run dev
```

Backend runs at `http://localhost:5000`. GraphQL endpoint: `http://localhost:5000/graphql`

### 7. Start Frontend

```bash
cd frontend
npm run dev
```

Frontend runs at `http://localhost:5173`

## Test Commands

```bash
# Run all tests (unit + integration)
cd backend
npm test

# TypeScript typecheck
npm run typecheck
```

**Note**: Integration tests require a running PostgreSQL instance (`docker compose up -d`).

## Example GraphQL Queries & Mutations

### Register

```graphql
mutation {
  register(name: "Jane", email: "jane@example.com", password: "password123", role: REPORTER) {
    token
    user { id name email role }
  }
}
```

### Login

```graphql
mutation {
  login(email: "reporter@example.com", password: "password123") {
    token
    user { id name email role }
  }
}
```

### List Tickets (with filters & pagination)

```graphql
query {
  tickets(status: OPEN, priority: URGENT, take: 10) {
    nodes {
      id title priority status
      createdBy { name }
      assignedTo { name }
      sla {
        firstResponseState resolutionState
        firstResponseRemainingMinutes resolutionRemainingMinutes
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
```

### Create Ticket

```graphql
mutation {
  createTicket(title: "Login broken", description: "Cannot sign in", priority: HIGH) {
    id title status
    sla { firstResponseDueAt resolutionDueAt firstResponseState }
  }
}
```

### Assign Ticket

```graphql
mutation {
  assignTicket(ticketId: "uuid-here", assigneeId: "agent-uuid") {
    id assignedTo { name }
  }
}
```

### Change Status

```graphql
mutation {
  changeTicketStatus(ticketId: "uuid-here", status: IN_PROGRESS) {
    id status
  }
}
```

### Resolve Ticket

```graphql
mutation {
  resolveTicket(ticketId: "uuid-here") {
    id status resolvedAt
    sla { resolutionState }
  }
}
```

### Add Comment

```graphql
mutation {
  addComment(ticketId: "uuid-here", content: "Looking into this now") {
    id content author { name role }
  }
}
```

### Dashboard

```graphql
query {
  dashboard {
    totalTickets openTickets inProgressTickets
    atRiskTickets breachedTickets
  }
}
```

### Holidays

```graphql
query {
  holidays { id date name }
}
```

## How I Would Extend This

1. **Real-time updates**: Add GraphQL subscriptions (Yoga supports SSE) for live SLA countdown and ticket status changes
2. **SLA escalation**: Auto-assign tickets approaching AT_RISK to available agents via a background cron job
3. **Audit trail**: Record all status changes and assignments in a separate `TicketHistory` table for compliance
4. **Email notifications**: Send alerts when tickets enter AT_RISK or BREACHED states using a queue (BullMQ/Redis)
5. **Configurable SLA policies**: Move SLA policies from code constants to a database table, editable by admins
6. **Analytics**: Time-series dashboard showing SLA compliance trends, average resolution times, agent performance
7. **File attachments**: Allow reporters to attach screenshots/logs to tickets via S3/Cloud Storage
8. **Rate limiting**: Add rate limiting to registration and login to prevent brute-force attacks

## Known Limitations

- **SLA state filtering**: The `slaState` filter on the tickets query computes SLA state for fetched tickets in memory, which could be inefficient for very large datasets. A materialized view or stored computed column would be more performant.
- **No WebSocket/SSE subscriptions**: SLA remaining time is refreshed by polling every 15 seconds rather than streaming.
- **Holiday management**: No GraphQL mutation to create/update/delete holidays — currently managed via seed data only.
- **Single timezone**: All business hours use one global timezone. Multi-timezone support would require per-team or per-ticket timezone configuration.
