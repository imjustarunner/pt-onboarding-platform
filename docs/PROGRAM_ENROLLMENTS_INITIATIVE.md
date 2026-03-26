# Program enrollments initiative

This document defines **program-level enrollment** (individual services / becoming a client) vs **public events** (dated Skill Builders / company events), how they appear in the product, and how to configure them.

## Terminology

| Term | Meaning |
|------|---------|
| **Program (org)** | An `agencies` row with `organization_type = 'program'`, affiliated to a parent agency via `organization_affiliations`. |
| **Program enrollment** | Public onboarding for **individual** services, modeled as **`learning_program_classes`** on that program organization—not a `company_event`. |
| **Program event** | A **`company_events`** row scoped to the program (`organization_id` = program org) with registration via `intake_links.company_event_id`. |
| **Enroll hub** | A public page that shows **enrollments** (classes) **and** **events** for one program under an agency/portal URL. |

## Routing (canonical)

- **`/events`** (patterns: `/open-events/:agencySlug`, `/:slug/events`, program `…/programs/:programSlug/events`): **events only**. Always includes a prominent link to the matching **enroll** URL for families who need program enrollment instead of a dated event.
- **`/enroll`** (patterns: `/open-events/:agencySlug/enroll`, `/:slug/enroll`, `…/programs/:programSlug/enroll`): **enrollments + events** for discovery. Programs with **no** events still work: the enrollments section lists classes; the events section is empty.

## Data model (enrollment = learning class)

1. Create or use a **program organization** (affiliated to the agency).
2. Create a **`learning_program_classes`** row with:
   - `organization_id` = program org id
   - `status = 'active'`, `is_active = 1`
   - `registration_eligible = 1`
   - Enrollment window: `enrollment_opens_at` / `enrollment_closes_at` nullable (open if null / in range)
3. Create an **`intake_links`** row:
   - `learning_class_id` = class id
   - **`company_event_id` must be null** (so the link is not treated as an event registration)
   - `is_active = 1`
   - `form_type = smart_registration` (or intake with a registration step, per existing intake rules)
4. Public listing logic (backend `skillBuildersPublicEnrollments.service.js`) requires the above and picks a **`registration_public_key`** from the link the same way events do.

## APIs (public)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/public/skill-builders/agency/:slug/enroll/programs` | Affiliated program orgs for agency **enroll** landing. |
| GET | `/api/public/skill-builders/agency/:slug/programs/:programSlug/enroll` | Enrollments + events (agency slug path). |
| GET | `/api/public/skill-builders/portal/:portalSlug/programs/:programSlug/enroll` | Enrollments + events (portal slug may be agency or program org). |

## APIs (authenticated, admin / coordinator)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/skill-builders/directory/agency/:agencyId/affiliated-program-orgs` | Program orgs for **Programs & events** admin page (paths to share). |

## Admin UX

- **Directory → Programs & events** ([`SkillBuildersProgramsEventsView.vue`](../frontend/src/views/admin/SkillBuildersProgramsEventsView.vue)): **Skill Builders events** panel (unchanged) + **Program enrollments** guide with public path templates and link to **Intake links** under the agency slug.
- **Intake links**: scope links to **learning class** for program enrollment QR / URLs.

## Guardian & provider

- **Guardian dashboard**: Registration catalog already includes **learning_class** items; copy references the public **enroll** page pattern where providers share links.
- **Skill Builders event portal**: **Public enroll page** button links to `/{agencyPortalSlug}/programs/{programPortalSlug}/enroll` for staff to share with families.

## Programs with both enrollments and events

Use the **enroll hub** URL as the primary marketing link: families see **Program enrollments** first, then **Program events**. Event-only URL remains valid for “just the list of sessions.”

## Intake copy

For `smart_registration` links tied to a **class only** (`learning_class_id` set, `company_event_id` empty), [`PublicIntakeSigningView.vue`](../frontend/src/views/PublicIntakeSigningView.vue) uses **program enrollment** subtitle copy to distinguish individual service signup from group/event signup.

## Files touched (implementation index)

- Backend: [`skillBuildersPublicEnrollments.service.js`](../backend/src/services/skillBuildersPublicEnrollments.service.js), [`skillBuildersPublic.controller.js`](../backend/src/controllers/skillBuildersPublic.controller.js), [`publicSkillBuilders.routes.js`](../backend/src/routes/publicSkillBuilders.routes.js), [`skillBuildersSkillsGroup.service.js`](../backend/src/services/skillBuildersSkillsGroup.service.js) (`listAffiliatedProgramOrganizations`), [`skillBuildersProviderHub.controller.js`](../backend/src/controllers/skillBuildersProviderHub.controller.js) + routes.
- Frontend: [`router/index.js`](../frontend/src/router/index.js), [`PublicAgencyEnrollView.vue`](../frontend/src/views/public/PublicAgencyEnrollView.vue), [`PublicProgramEnrollHubView.vue`](../frontend/src/views/public/PublicProgramEnrollHubView.vue), [`PublicEventsListing.vue`](../frontend/src/components/public/PublicEventsListing.vue), [`SkillBuildersProgramEnrollmentsGuide.vue`](../frontend/src/components/availability/SkillBuildersProgramEnrollmentsGuide.vue).

## Regression checklist

- [ ] Agency **events** page shows link to **enroll**; **enroll** landing lists programs; program **enroll** hub shows sections for enrollments and events.
- [ ] Program with **no** classes: empty enrollments section, events still list if any.
- [ ] Program with **no** events: empty events list, enrollments still list if any.
- [ ] Intake link with `learning_class_id` only shows program-enrollment subtitle for smart registration.
- [ ] Admin **Programs & events** loads affiliated programs when agency selected; coordinator/staff with directory access receive 403 otherwise.

## Related docs

- [Skill Builders program, school linkage, and cross-sub-organization affiliations](SKILL_BUILDERS_PROGRAM_AND_AFFILIATIONS.md)
- [Registration catalog and guardian enrollment](REGISTRATION_AND_GUARDIAN.md)
- [Standards-aligned learning system initiative](STANDARDS_ALIGNED_LEARNING_SYSTEM_INITIATIVE.md)
