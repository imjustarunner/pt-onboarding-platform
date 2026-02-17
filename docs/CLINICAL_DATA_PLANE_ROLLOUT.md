# Clinical Data Plane Rollout

This rollout implements a separate clinical database path for booked clinical-session artifacts.

## Required Migrations

- Main DB:
  - `database/migrations/443_create_clinical_record_refs.sql`
- Clinical DB:
  - `database/clinical_migrations/001_create_clinical_data_plane.sql`

## Required Environment Variables

- `CLINICAL_DB_HOST`
- `CLINICAL_DB_PORT`
- `CLINICAL_DB_USER`
- `CLINICAL_DB_PASSWORD`
- `CLINICAL_DB_NAME`
- Optional: `CLINICAL_DB_CONNECTION_LIMIT`

If omitted, host/port/user/password fall back to the main DB env vars.

## New API Surface

- `POST /api/clinical-data/sessions/bootstrap`
- `GET /api/clinical-data/sessions/:sessionId/artifacts`
- `POST /api/clinical-data/sessions/:sessionId/notes`
- `POST /api/clinical-data/sessions/:sessionId/claims`
- `POST /api/clinical-data/sessions/:sessionId/documents`
- `DELETE /api/clinical-data/records/:recordType/:id`
- `POST /api/clinical-data/records/:recordType/:id/restore`
- `POST /api/clinical-data/records/:recordType/:id/legal-hold`
- `POST /api/clinical-data/records/:recordType/:id/legal-hold/release`

`recordType` must be one of `note`, `claim`, `document`.

## Eligibility Rules Enforced Server-Side

- user must have agency access
- `clients.client_type` must be `clinical`
- `office_events.status` must be `BOOKED`

## Audit Events Added

- `clinical_note_deleted`
- `clinical_note_restored`
- `clinical_note_legal_hold_set`
- `clinical_note_legal_hold_released`
- `clinical_claim_deleted`
- `clinical_claim_restored`
- `clinical_claim_legal_hold_set`
- `clinical_claim_legal_hold_released`
- `clinical_document_deleted`
- `clinical_document_restored`
- `clinical_document_legal_hold_set`
- `clinical_document_legal_hold_released`

## Manual Verification Checklist

1. Bootstrap session with a non-clinical client -> expect 409.
2. Bootstrap session with non-booked event -> expect 409.
3. Bootstrap session with booked + clinical client -> expect success.
4. Create note/claim/document -> expect rows in clinical DB + pointer row in main DB.
5. Delete any artifact -> expect `is_deleted=1` (not hard delete).
6. Set legal hold, then attempt delete -> delete blocked.
7. Restore deleted artifact -> visible in active list again.
8. Confirm actions appear in Audit Center using action filter.
9. Confirm `includeDeleted=true` only returns deleted rows for backoffice users.

