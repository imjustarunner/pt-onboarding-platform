Payroll provider connection and return approved PTO to pending
2026-11-25

Release scope
This branch contains implementation and validation only. Production integration,
deployment and any live payroll changes belong to the separate release process.
No production records were changed by this task. No new migration is required.
Deploy frontend and backend together after integrating with the current release.

Provider connection
Payroll and the Payroll Wizard now offer "Connect an imported provider" for an
open payroll. An authorized payroll reviewer selects a billing-report name and
an existing employee payroll profile, reviews the number of affected rows, and
explicitly confirms the employee performed the services. Archived profiles are
identified and can retain their compensation/history without restoring access.

Only the selected current Run 1, latest previous-period Run 2 and latest
two-periods-ago Run 3 snapshots are eligible. Earlier posted original reports,
accounts, agreements and posted payroll calculations stay unchanged. Each row
connection is appended to the existing import-row audit with the authenticated
reviewer's identity. A stale confirmation cannot be reused. The current payroll
is staged and its calculated summaries invalidated so it must be run again.

Connections are blocked for a posted destination, ambiguous source profiles,
nonzero calculated source pay, or existing manual pay/catch-up/override entries
or financial adjustments on either affected profile. Reconcile any manual
payment before recalculating services so they are not paid twice. This is a
reviewed connection of uploaded snapshots, not an account merge or a persistent
alias for future replacement imports. Newly imported snapshots may need review.

PTO recovery
Approved sick/training requests in an open payroll offer "Return to pending" in
Pending Submissions and the full Payroll PTO panel. Returning the selected
approval removes only its saved pay, restores only its leave hours, and appends
positive ledger reversals. Original usage entries remain. The request's dated
items become pending again for a later payroll. The current payroll must be
rerun. Other approved requests, including their different pay rates, remain.

Example: when both portions of a 25-hour request were approved to the same open
payroll, return the 10-hour approval and retain the 15-hour approval. A separate
2.5-hour approval remains, leaving 17.5 hours in that payroll. At $28/hour the
selected return removes $280. Choose the later payroll before reapproving the
returned 10 hours. Partial approval buttons now display the chosen hours.

Posted payroll, missing historical rate evidence, inconsistent balances/pay,
multi-period approval evidence and unsupported benefits require reviewed
correction rather than this recovery action. Approval history is retained in
append-only reversing ledger notes, with the actual reviewer on new entries.

Validation
- Backend payroll Vitest suite: 39 files, 349 tests passed.
- Frontend payroll Vitest suite: 14 files, 150 tests passed.
- Four changed Vue views/components parsed and compiled successfully.
- JavaScript syntax checks and git diff --check passed.
- Real MySQL: provider connection and PTO approval/return executed successfully
  using synthetic records in connection-local TEMPORARY TABLES only. No
  permanent production rows or schema were changed.
- Persistence tests cover audited row moves, protected original snapshots,
  archived-account preservation, agency/reviewer binding, stale confirmation,
  rollback on partial failure, saved-pay reconciliation, preservation of other
  PTO, return/reapproval and posted-payroll rejection.

The existing raw-import component tests emit missing-Pinia injection warnings;
the suite passes. No full public-site production build was run in this sparse
checkout; the release integration should perform its usual paired build/checks.
Local detailed test logs and MySQL validation evidence are retained at
/private/tmp/pt-payroll-provider-connect-evidence-20261125.
