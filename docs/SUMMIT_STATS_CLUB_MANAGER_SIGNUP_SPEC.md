# Summit Stats — Club Manager Signup & Club Creation Flow

## Overview

People from the **main website** should be able to **"Create Club Manager Account"** — a self-service signup that creates an admin account for an affiliation (club). Once they have that account, they can log in and **create a new club**. **Club creation is the starting point** for everything.

---

## Flow

```
Main Website
    │
    ▼
"Create Club Manager Account" (public signup)
    │
    ▼
User created: role=admin, no agency/club yet
    │
    ▼
User logs in
    │
    ▼
"Create your club" (first-time flow)
    │
    ▼
Club (affiliation) created under Summit Stats Team Challenge platform
    │
    ▼
User assigned as admin of that club
    │
    ▼
Club Manager can now: add teams, add users, create seasons, launch, manage store, etc.
```

---

## 1. Public "Create Club Manager Account"

### Requirements

- **Public** — No authentication required
- **Self-service** — Anyone can sign up to become a Club Manager
- **Creates** — User with `role: admin` (or dedicated `club_manager` role)
- **No club yet** — User has no agency/club assignment at signup; they create it after login

### Data Collected

- Email (login identifier)
- Password
- First name, Last name
- (Optional: phone, club name intent)

### Implementation Options

| Option | Description |
|--------|-------------|
| **A** | New endpoint `POST /api/auth/register-club-manager` — public, creates user with role=admin, no agencyIds |
| **B** | Extend `POST /api/auth/register` — when `role=club_manager` (or `intent=club_manager`), allow unauthenticated, skip agencyIds |
| **C** | Dedicated Summit Stats signup route — e.g. `/summit-stats/signup` that calls a special registration flow |

### Security

- Rate limiting on signup (prevent abuse)
- **Email verification required** — before club creation (see §8)
- CAPTCHA (optional for MVP)

---

## 2. Club Manager = Admin for Affiliation

- **Club Manager** is an **admin** account scoped to their **club** (affiliation)
- Permissions: `canManageAtOrganization` for affiliation → admins allowed (per existing logic)
- Club Manager can manage only the club(s) they are assigned to

---

## 3. Create New Club (First-Time Flow)

### Requirements

- **After login** — Club Manager (admin with no clubs yet) sees "Create your club"
- **Creates** — New organization with `organization_type: affiliation` (club)
- **Parent** — Club must be affiliated under the **Summit Stats Team Challenge platform agency**
- **Assignment** — Creating user is automatically assigned to the new club as admin

### Platform Agency

- Summit Stats Team Challenge needs a **platform agency** (organization_type=agency) — display name e.g. **Summit Stats Team Challenge**
- All clubs (affiliations) are children of this agency via `organization_affiliations`
- Config: `SUMMIT_STATS_PLATFORM_AGENCY_ID` or resolve by slug (e.g. `summit-stats`)

### Create Club API

| Current | Needed |
|---------|--------|
| `POST /api/agencies` requires `requireBackofficeAdmin` | New: `POST /api/summit-stats/clubs` or `POST /api/agencies` with special path for Club Managers |
| Child orgs need `affiliatedAgencyId` from existing admin | Club Manager provides club name/slug; platform agency is auto-resolved |

### Create Club Flow (Backend)

1. User is authenticated, role=admin
2. Check: user is authenticated; allow creating first club or additional clubs (see §6)
3. Validate: name, slug (unique)
4. Create agency row: `organization_type: 'affiliation'`, name, slug
5. Create `organization_affiliations`: agency_id = platform agency, organization_id = new club
6. Assign user to club: `user_agencies` (user_id, agency_id = new club id)
7. Return club

---

## 4. UI Flow

### Main Website (Public)

- **Landing page** — e.g. `/summit-stats` or `/challenges`
- **CTA** — "Create Club Manager Account" or "Get Started" / "Sign Up as Club Manager"
- **Signup form** — Email, password, first name, last name
- **Submit** → Account created → Redirect to login or auto-login

### Post-Login (First-Time Club Manager)

- **Dashboard check** — If user has no clubs (no agencies with organization_type=affiliation), show "Create your club" prompt
- **Create club form** — Club name, slug (optional, can auto-generate from name)
- **Submit** → Club created → User assigned → Redirect to club dashboard / challenges

### Post-Login (Existing Club Manager)

- Normal flow — See their club(s), manage seasons, teams, etc.

---

## 5. Implementation Phases

### Phase 1: Public Club Manager Signup

- Add `POST /api/auth/register-club-manager` (or extend register)
- Public, no auth required
- Creates user: role=admin, status=PENDING_SETUP or ACTIVE
- Optional: temp password + email with setup link
- Frontend: `/summit-stats/signup` or `/signup/club-manager` page

### Phase 2: Create Club (First-Time)

- Add `POST /api/summit-stats/clubs` (or equivalent)
- Auth required, role=admin
- Allow creating clubs (first club or additional — see §6 multi-club model)
- Creates affiliation under platform agency, assigns user
- Frontend: "Create your club" modal or page when user has no clubs

### Phase 3: Platform Configuration

- Ensure Summit Stats Team Challenge platform agency exists (migration or seed)
- Config: `SUMMIT_STATS_PLATFORM_AGENCY_ID` or slug
- Add `affiliation` to `createAgency` child-org handling if not already (for consistency)

---

## 6. Multi-Club Model

- **People can be in multiple clubs** — e.g., Belleville Running Club, ITSCO Fit Club. Same as joining any club.
- **Someone can establish multiple clubs** — A Club Manager can create more than one club.
- **Club admin can boot people** — Make them inactive for that club only. The person stays active for other clubs.

### Boot / Inactive Behavior

- When a club admin removes or deactivates a user for that club, the change is **club-scoped**.
- The user remains active in other clubs they belong to.
- Implementation: use `user_agencies` or club-scoped membership tables with `is_active` / `membership_status` per club.

---

## 7. Summit Stats Login Scoping

- **When people log in via Summit Stats Team Challenge**, their admin role is **automatically scoped**.
- **They can't do anything except create a club** — until they have at least one club.
- No access to platform-wide admin features; no access to other organizations.
- After creating a club: access is limited to that club (and any other clubs they manage or belong to).

---

## 8. Email Verification

- **Email verification** — required before club creation (or before full access).
- User signs up → receives verification email → verifies → can then create club and log in with full access.

---

## 9. Open Questions

- Should "Create Club Manager Account" be the only public signup, or should the main platform have other signup paths?
- Dedicated `club_manager` role vs. `admin` with club-only scope?
