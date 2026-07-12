## My Dashboard (Overview)

### What this page is

“My Dashboard” is the user’s home hub for onboarding and day-to-day work.

For **agency / HR** users who have completed onboarding, the default landing is **Overview**: a mockup-style home with metric cards, today’s schedule, pay-period summary, events, notes snapshot, recent activity, and quick actions. The left rail remains the full-feature drill-in path for every existing section (Schedule, Submit, Payroll, Supervision, etc.).

### Layout

1. **Overview** (default post-onboarding, agency only — not Summit club / school portal / guardian)
   - Greeting + notification shortcut
   - Pay / notes / PTO / office live in **Last Pay Period Overview**; supervision hours live only on the Supervision metric card (drill-in to My Supervision)
   - Metric cards (schedule, pay period, notes, supervision, claims) — role-gated
   - Today’s schedule timeline → “View Full Schedule” opens My Schedule
   - Pay period overview → Payroll / last paycheck modal
   - Events → company events calendar / join URLs
   - Notes snapshot (D/I ratio) + recent activity + quick actions
2. **Left rail** — Overview, Schedule, Clients, Submit, etc. **Schools / Programs / Learning** (dynamic title) nests assigned portals plus School Portals, Program Portals, Skill Builders, and program hubs. **Payroll** and **Documents** live under **My Account** (not separate rail cards once onboarding is complete). Book Club is top-strip only.
3. Lifecycle chrome above the shell (announcements, supervision prompts, facilitator/survey strips) stays as-is

### My Supervision (supervisee)

- Progress toward required **individual + group** hours (from payroll-credited supervision on dashboard-summary), with remaining countdown
- Upcoming join links + past sessions with summary / transcript when available
- Empty session list does **not** mean the hour counters are fake — those counters are payroll accrual / baseline, while the list is video sessions

### Common rail sections

- **Checklist / Momentum List**: Required onboarding items, focus digest, notes-to-sign
- **Documents**: Upload/review required documents (when applicable)
- **Training**: Assigned modules and training focus
- **My Schedule (providers)**: Weekly schedule + availability grid (may be disabled per org). **Skill Builders** rail hub for eligible providers. **Events / Classes / Programs** opens a modal for eligible roles—see [`docs/SKILL_BUILDERS_PROGRAM_AND_AFFILIATIONS.md`](../SKILL_BUILDERS_PROGRAM_AND_AFFILIATIONS.md).
- **Submit (providers)**: Submission hub (mileage, reimbursement, PTO, time claims, availability)
- **My Account**: Personal account settings, credentials, preferences

### Notes / constraints

- Not all users see all sections (role + organization settings). Overview widgets use the same gates as the rail.
- Pre-hire / incomplete onboarding users keep the checklist-first experience (no Overview).
- Summit club, school portal, and guardian dashboards are separate surfaces and were not redesigned with Overview.
- Deep links (`?tab=my_schedule`, `?tab=submit`, …) still open the corresponding rail panel.
