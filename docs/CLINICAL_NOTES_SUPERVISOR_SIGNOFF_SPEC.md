# Clinical Notes & Supervisor Sign-Off

**This extends the main spec.** See `scheduling_booking_spec.md` §10.6 for the integrated flow (booking → clinical session → note → billing → supervisor sign-off).

This doc is a reference for the supervisor sign-off extension only.

## Flow summary

- Provider signs completed note → signature on note, tracked, on billing claim.
- Admin/staff set per-provider billing settings (e.g. "billing as supervisor").
- When required, signed notes auto-route to supervisor; `clinical_note_signoffs` tracks them.
- Momentum List: "Notes to sign" section for supervisors.

## Implementation status

| Phase | Status |
|-------|--------|
| Foundation (migration, stub API, Momentum List section) | Done |
| Provider sign → auto-create signoff when settings require | Pending |
| Supervisor sign-off UI | Pending |
| Billing integration | Pending |

## Key files

- `database/migrations/454_clinical_note_signoffs.sql`
- `backend/src/controllers/notesToSign.controller.js`
- `frontend/src/components/dashboard/NotesToSignSection.vue`
