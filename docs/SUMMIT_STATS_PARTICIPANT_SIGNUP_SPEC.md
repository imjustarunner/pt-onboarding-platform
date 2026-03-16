# Summit Stats — Participant Signup & Club Join Flow

## Overview

In addition to the **Club Manager** signup (create club), participants can join via a self-service flow:

1. **Create account** — Public signup for participants (role=provider)
2. **Search clubs** — Browse clubs on the Summit Stats platform
3. **Apply to join** — Request to join a club (direct assignment or approval flow)

This complements the invite flow where Club Managers add users directly.

---

## Flow

```
Main Website / Summit Stats
    │
    ▼
"Sign Up" or "Join a Club" (public)
    │
    ▼
Create account (email, password, name) → role=provider
    │
    ▼
Browse / Search clubs
    │
    ▼
Apply to join a club
    │
    ▼
User assigned to club (user_agencies)
    │
    ▼
Participant can: join teams, submit workouts, view leaderboards
```

---

## 1. Participant Signup

- **Public** — No authentication required
- **Creates** — User with `role: provider`, no agency assignment yet
- **Data** — Email, password, first name, last name
- **Endpoint** — `POST /api/auth/register-participant`

---

## 2. Club Search (Public)

- **Public** — No auth required to browse clubs
- **Returns** — List of clubs (affiliations under Summit Stats platform)
- **Endpoint** — `GET /api/summit-stats/clubs` (public route)
- **Filters** — Optional: search by name, slug

---

## 3. Apply to Join

- **Requires auth** — User must be logged in
- **Endpoint** — `POST /api/summit-stats/clubs/:id/apply`
- **Behavior** — Assigns user to club via `User.assignToAgency`
- **Future** — Approval flow: club_join_requests table, club manager approves/denies

---

## Routes

| Path | Purpose |
|------|---------|
| `/:slug/signup` | Participant signup (create account) |
| `/:slug/signup/club-manager` | Club Manager signup (existing) |
| `/:slug/clubs` | Browse/search clubs (public) |
| `/:slug/clubs/:id` | Club detail + Apply to join (auth for apply) |
