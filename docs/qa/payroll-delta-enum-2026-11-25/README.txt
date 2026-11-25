Payroll comparison enum repair — release handoff

Parent release: 06bb01573a3929be9ba998d36f55119901280629
Branch: codex/payroll-delta-enum-20261125

Cause
The previous identity-review change returned identity_changed but omitted it from
payroll_run_deltas.delta_type. getPayrollPeriodRawAudit persists the computed
comparison before returning it, so MySQL rejected the insert and the GET failed.
The old replace method deleted the preceding derived comparison before inserting
its replacement, without a transaction.

Implementation
- Migration 1883 appends identity_changed without changing existing enum positions.
- Before that migration, the backend stores this known subtype as status_change
  with metadata.deltaType=identity_changed. The API response remains identity_changed.
- After migration, the backend uses the dedicated enum value immediately.
- Comparison replacement now commits atomically, is scoped by agency, and rolls
  back the deletion if the insertion fails. Other database errors are not hidden.

Release requirements
Production integration, migrations and deployment belong to the separate release
chat. No production schema or payroll rows were changed by this implementation.

Immediate unblock on the already released identity-review code: apply this one
migration through the normal migration runner in the release environment:
  node database/run-migrations.js --migration=1883_payroll_run_delta_identity_changed

The follow-up backend can be deployed before or after the migration because it
supports the old schema. No frontend change is needed for this follow-up.
There is no need to re-upload billing reports or rerun a posted payroll to repair
this enum error; it affects saving the derived comparison results.

Validation
- 332 backend payroll tests passed, including 7 new persistence regressions.
- Strict MySQL test with a connection-local temporary table passed for the legacy
  enum, the actual migration SQL, the new enum, and rollback after invalid data.
- Verified the permanent production enum remained unchanged by that test.
- JavaScript syntax and git diff whitespace checks passed.
