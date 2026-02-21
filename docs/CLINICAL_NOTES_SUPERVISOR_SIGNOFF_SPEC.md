# Clinical Notes & Supervisor Sign-Off

**This extends the main spec.** See `scheduling_booking_spec.md` §10.6 for the integrated flow (booking → clinical session → note → billing → supervisor sign-off).

This doc is a reference for the supervisor sign-off extension only.

## Flow summary

- Provider signs completed note → signature on note, tracked, on billing claim.
- Admin/staff set per-provider billing settings (e.g. "billing as supervisor").
- When required, signed notes auto-route to supervisor; `clinical_note_signoffs` tracks them.
- Momentum List: "Notes to sign" section for supervisors.

## Two paths: Payroll unpaid vs Clinical notes list

### 1. Payroll unpaid notes (all users)

When payroll ran with undone notes, the system surfaces this in the **running list** (digest, full list) as a categorized item:

- **Label:** "You had X unpaid notes when payroll ran - you're behind"
- **No link to payroll** — payroll is not something to interact with for this
- **Single task item** for non-clinical users (no clinical notes list)
- Appears in Top 3 Focus, Also on radar, and Full running list

### 2. Clinical notes list (clinical users only)

Gated by: user assigned to programs/clinical/learning that have clients and notes.

- **API:** `GET /me/clinical-notes-eligible?agencyId=` — returns `{ eligible: boolean }`
- **Eligible when:** agency has clinical org + (user has clients assigned OR supervises providers with clients)
- **Shows:** "Complete clinical notes" card, Notes to sign section, future clinical notes list

**Non-clinical users:** Only get the payroll unpaid-notes item in the running list. No clinical notes list.

## Clinical notes list (to be fleshed out)

- **Providers:** List for completing and signing notes
- **Supervisors:** List for cosigning supervisee notes (Notes to sign — already implemented)
- **Gate:** Only for users in clinical programs with clients and notes
- **Future:** Dedicated clinical notes page/list when applicable

## Implementation status

| Phase | Status |
|-------|--------|
| Foundation (migration, stub API, Momentum List section) | Done |
| Provider sign → auto-create signoff when supervisor assigned | Done |
| Supervisor sign-off UI | Done |
| Payroll unpaid → running list (no payroll link) | Done |
| Clinical notes eligibility gating | Done |
| Clinical notes list (full page) | Pending |
| Billing integration | Pending |

## Key files

- `database/migrations/454_clinical_note_signoffs.sql`
- `backend/src/controllers/notesToSign.controller.js` — list, count, sign, getClinicalNotesEligible
- `backend/src/controllers/clinicalData.controller.js` — auto-create signoff in createSessionNote
- `frontend/src/components/dashboard/NotesToSignSection.vue`
- `frontend/src/components/dashboard/MomentumListTab.vue` — payroll items, clinical eligibility, full list
