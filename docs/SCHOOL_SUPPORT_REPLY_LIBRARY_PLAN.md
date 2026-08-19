# School Support Reply Library & Email Automation Plan

School-facing support email (`schoolreply@`, school group inboxes) → Ticket Desk → staff-approved reply. This plan adds a **reply library**, **learning from staff edits**, **source tracing**, and **multi-step response plans** on top of the existing inbound agent, AI drafts, and suggested actions.

## Current foundation (already shipped)

- Gmail inbound agent → `support_tickets` with school/client context
- AI draft on ticket (`ai_draft_response`, `ai_draft_metadata_json`)
- Suggested actions (contacts, staff accounts, packet upload)
- Staff answer → email reply from `schoolreply`
- Draft review states (`accepted` / `edited` / `rejected`)

## Phases

### Phase 1 — Reply library ✅ (this release)

**Goal:** Curated, searchable school reply templates staff can insert and promote from real tickets; inject into AI draft prompts.

| Deliverable | Detail |
|-------------|--------|
| Table | `school_support_reply_library` |
| API | CRUD + match-for-ticket + promote-from-ticket |
| Prompt wiring | `generate-response` + inbound status drafts |
| UI | Ticket Desk: browse/insert, manage entries, “Save answer to library” |

**Intent keys:** `school_status_request`, `school_reinit_update`, `new_staff_contact`, `packet_received`, `scheduling`, `general`

### Phase 2 — Learning from staff edits ✅

- When staff **edit** an AI draft before sending → auto-create a **pending proposal** for library review
- **Reject** on AI draft (with note) → stored as prompt guardrail for future drafts
- `support_ai_prompt_notes` injected into AI draft prompts
- Ticket Desk: **Proposals** tab in Reply library + badge count

### Phase 3 — Source tracing ✅

- Persist `sources[]` on every generated draft (client, checklist, library entry, prior ticket)
- Ticket Desk UI: “Draft based on: …” under AI draft banner and composer

### Phase 4 — Automated response plans ✅

- `support_ticket_response_plans` stores ordered multi-step plans per ticket
- Steps: match client → pull status → draft reply → suggested actions → send reply
- Built automatically on inbound email + Analyze / suggest-actions
- Ticket Desk: **Response plan** banner with step status and quick actions
- Approve/run gate unchanged for executable action items

### Phase 5 — Semantic retrieval ✅

- `school_support_reply_embeddings` stores meaning vectors for library entries + de-identified sent ticket answers
- Hybrid match: keyword scoring + cosine similarity (Gemini/Vertex embeddings)
- Auto-index on library create/update and when staff send school email replies
- **Gmail history backfill** pairs Sent mail with prior inbound school messages (`POST .../backfill-gmail-history`)
- **Reindex** also pulls `user_communications` sent from schoolreply identities
- AI drafts can surface **similar past replies** even when wording differs

## Key paths

| Area | Path |
|------|------|
| Library service | `backend/src/services/schoolSupportReplyLibrary.service.js` |
| API routes | `backend/src/routes/schoolSupportReplyLibrary.routes.js` |
| Ticket Desk UI | `frontend/src/components/tickets/SchoolSupportReplyLibraryModal.vue` |
| Inbound drafts | `backend/src/services/unifiedEmail/inboundEmailAgent.service.js` |
| Manual drafts | `backend/src/controllers/supportTickets.controller.js` |

## PHI / safety

- Library entries are agency-scoped; school-specific entries optional
- Promote-from-ticket is explicit staff action (never auto-publish)
- No model fine-tuning on raw ticket PHI without de-identification pipeline
