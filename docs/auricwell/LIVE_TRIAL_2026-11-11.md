# AuricWell small-caseload live trial — November 11, 2026

The release adds **Management → AuricWell → EHR Transition** to the shared application. It does not enable the independent AuricWell prototype, import a caseload automatically, change provider booking rollout, or activate school transition dates. Start with one provider and one client, review the chart and medical archive, then preview a small agenda before confirming appointments.

## Release provenance

- Base: `294a3c204fc7bf7463a0ea7bb6ad24c70f6697dd`, the production backend and frontend image before this release.
- Branch: `codex/auricwell-live-trial-20261111`; a sparse isolated worktree excluded unrelated local edits and migrations. Newer deployed intake, insurance, scheduling and navigation behavior was preserved through explicit conflict review.
- Services: `onboarding-backend` and `onboarding-frontend`, Google Cloud project `ptonboard-dev`, region `us-west3`. Use the ordinary shared-app deployment workflows; the prototype `deploy-auricwell` workflow is outside this release.
- Deployment revision/build evidence belongs to the GitHub Actions runs for the merge introducing this release. Backend candidates must pass their exact-revision readiness gate before traffic promotion. Verify frontend and backend point to that same merge commit.

## Verified production preparation

- A fresh Cloud SQL backup completed before DDL. Operation: `20c66452-8294-487b-823f-b10800000043`, instance `ptonboard-mysql`; description `Before AuricWell transition trial 2026-11-11`.
- Only `1786_school_appointment_transition.sql` was applied through the specific-migration runner. SHA-256: `a57ff6ce6bc9c83bea6e8c0af6ec78cc2dfd1dfc99e038159857a5ee43cf394f`.
- `migrations_log.success=1`, both target tables readable by the application account, and the exact `school_schedule_slot_identity_detach` trigger verified. The two new tables were empty after migration: no provider transition or appointment link was activated.
- Candidate baseline migration files were compared with successful live migration names before deployment; unrelated pending local SQL was excluded.
- Required intake encrypted-source columns, clinical original-plan date/source columns and goal/objective tables exist. The existing chat key passed an in-memory synthetic round trip using the application decoder; existing encryption material was preserved. Main/clinical pool limits are 20/10.
- Existing archive bucket has uniform bucket access, no public IAM grants, and no lifecycle deletion rule. No live medical-file upload or patient-data import was used for deployment validation.

## Validation

- Isolated release: 118 focused backend checks and 69 frontend checks passed; 14 opt-in native MySQL checks passed separately on a disposable instance. The public demo release gate passed three checks.
- Full `frontend/npm run build` passed using installed dependencies without a second installation/postinstall build. Production artifacts include public assets and the normal website packaging steps.
- New and existing client/document route module graphs loaded with deliberately unusable database credentials, so that check could not touch application data.
- Source and compiled sample browser rehearsals cover existing school chart enrichment, contacts, insurance, PDF volumes/manifest, agenda booking and linked school time edits without real API requests. Live health/authentication gates and asset/build identity must also be checked after deployment.

## Trial and rollback

Use the authenticated practice context and choose the provider; do not activate a whole agency merely to test one caseload. Historical intake/plan records remain unsigned until clinical review. Medical PDFs are stored as page volumes when needed; historical session extraction is deferred. Agenda confirmation uses normal appointment notifications and preserves existing bookings. School staff can move one occurrence; providers use the existing recurring editor. Regular staffing/day templates remain separately reviewed.

If application rollback is needed, return backend/frontend traffic to the previous paired release. Retain migration 1786 and any linked chart/appointment history; do not drop tables, remove the trigger, or delete client records to undo a deployment. The existing provider booking gate and per-school/provider transition date remain the activation controls.
