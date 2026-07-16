## School Portal (Providers + School Staff)

### What this page is

The School Portal is a school-organization dashboard designed for scheduling + roster workflows while avoiding PHI exposure.

### Key areas

- **At a glance**: Summary stats (days supported, clients being seen, available slots, pending, waitlist, staff users).
- **Home cards**:
  - Providers
  - Days
  - Roster
  - Skill Builders (program groups at the school; ties to agency **Skill Builders** program + events — [`docs/SKILL_BUILDERS_PROGRAM_AND_AFFILIATIONS.md`](../SKILL_BUILDERS_PROGRAM_AND_AFFILIATIONS.md))
  - Events (canonical `company_events` school types via `/api/school-portal/:orgId/school-events`; school staff can post)
  - School staff
  - Docs / Links
  - Contact admin
- **Left navigation rail**: Appears after opening a section; use it to switch sections quickly.

### School events

- School portal parent events are **not** a separate store. They are `company_events` rows with types `school_back_to_school` / `school_spring_event` and `organization_id` = the school.
- Agency Caseload Hub Calendar / Events views read the same records (`/api/school-coverage/events`).
- See [`docs/SCHOOL_COVERAGE_HUB_DISCOVERY.md`](../SCHOOL_COVERAGE_HUB_DISCOVERY.md).

### Role differences

- **Provider**: Often sees “My roster” (their assigned clients) and provider-focused actions.
- **School staff**: Typically has logout available; may have broader roster / staff management access depending on permissions.

