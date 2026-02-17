# Auditable Retention Playbook

Use this pattern for sensitive records where users need operational delete behavior, but the platform must preserve evidence and deter malicious tampering.

Primary targets:
- Billing claims
- Sessions
- Clinical documentation

This playbook is based on the `Admin Documentation` implementation now in the codebase.

## 1) Core policy

For regulated or high-risk records, do not hard-delete by default.

Required controls:
- Soft delete (hide from normal workflows)
- Explicit restore
- Legal hold and legal hold release
- Immutable admin audit events for each action
- Role-based restrictions

Optional (later):
- Controlled "final purge" workflow with dual authorization
- Retention windows and automatic purge eligibility

## 2) Data model pattern

Add the following columns to each sensitive table:
- `is_deleted` (bool, default false)
- `deleted_at` (timestamp nullable)
- `deleted_by_user_id` (nullable FK/int)
- `is_legal_hold` (bool, default false)
- `legal_hold_reason` (nullable text/varchar)
- `legal_hold_set_at` (timestamp nullable)
- `legal_hold_set_by_user_id` (nullable FK/int)
- `legal_hold_released_at` (timestamp nullable)
- `legal_hold_released_by_user_id` (nullable FK/int)

Index at minimum:
- `is_deleted`
- `is_legal_hold`
- `deleted_at`
- `legal_hold_set_at`

## 3) API behavior pattern

Implement endpoints like:
- `DELETE /.../:id` -> soft delete only
- `POST /.../:id/restore` -> restore deleted row
- `POST /.../:id/legal-hold` -> set legal hold (reason required)
- `POST /.../:id/legal-hold/release` -> release legal hold

Rules:
- Soft delete must fail if legal hold is active.
- Restore and legal hold actions should be backoffice/admin-only.
- "List" endpoints should default to active rows only.
- Add `includeDeleted=true` for privileged users when needed.

## 4) UI behavior pattern

In the same management surface (not hidden in a separate admin page), expose:
- Delete button labeled clearly as retention-safe, e.g. "Delete (retain audit copy)"
- "Show deleted entries" toggle for privileged users
- Restore action on deleted rows
- Place legal hold / Release legal hold actions
- Badges and metadata:
  - Deleted + who/when
  - Legal hold + who/when/reason

## 5) Audit logging pattern

Each lifecycle action must write to admin audit feed with:
- `action_type`
- actor user id
- target user id (or target entity owner)
- agency/org scope id
- metadata (record id, title/identifier, reason, and key flags)

Recommended action names (example):
- `*_deleted`
- `*_restored`
- `*_legal_hold_set`
- `*_legal_hold_released`

Add these action names to Audit Center filter options so operations teams can find them quickly.

## 6) Guardrails to deter abuse

Minimum controls:
- No hard delete path in normal product UI/API
- Audit event must fire on every privileged state change
- Legal hold blocks delete regardless of user role (except specialized legal/compliance override path if ever introduced)
- Confirmation prompts for destructive/retention actions
- Clear error messages when schema migrations are missing

Strongly recommended:
- Alerting on unusual delete volume by actor/user/team
- Reason required for legal hold set and optional reason for delete/restore
- Quarterly review of action logs by compliance owner

## 7) Rollout checklist per domain

Use this checklist for Billing Claims, Sessions, and Clinical Documentation:

1. Add migration with retention columns and indexes.
2. Update model methods:
   - find/list with active vs includeDeleted
   - softDelete
   - restore
   - setLegalHold
   - releaseLegalHold
3. Update controllers/routes with role gates and rule checks.
4. Add audit logging for all lifecycle actions.
5. Update UI with toggle, badges, and action buttons.
6. Add Audit Center action options.
7. Test matrix:
   - normal delete
   - delete blocked by legal hold
   - restore
   - hold set/release
   - includeDeleted visibility controls
   - audit rows emitted correctly

## 8) Current reference implementation

See:
- `backend/src/controllers/userAdminDocs.controller.js`
- `backend/src/models/UserAdminDoc.model.js`
- `backend/src/routes/userAdminDocs.routes.js`
- `frontend/src/components/admin/UserAdminDocsTab.vue`
- `frontend/src/views/admin/AuditCenterView.vue`
- `database/migrations/441_user_admin_docs_soft_delete_audit.sql`
- `database/migrations/442_user_admin_docs_legal_hold.sql`

