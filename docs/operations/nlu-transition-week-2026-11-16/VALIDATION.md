# Implementation and validation

Software status: prepared on `codex/nlu-transition-week-20261116`; not deployed.
Application implementation: `21495f65f`; integrated with main through `5ce7dfbd4`
in `7cb1d1e85`. Documentation-only follow-up retains the same application behavior.

## Implemented

- Per-practice encrypted weekly evidence, append-only revisions, current administrator
  membership checks, no-store responses and optimistic concurrency.
- Thirty-eight ordered tasks, owners/backups, prerequisite checks, unknown denominators,
  exceptions and cancellation-readiness reconciliation.
- Complete-roster ITSCO ranking by four-week completed sessions, upcoming sessions and
  stable ID; frozen groups of five; ordered Google/clinical/observation gates; existing
  booking controls honor the frozen review when explicitly activated.
- First-time START capture independent of accounts, encrypted original evidence,
  idempotent and ordered carrier events, audited pending review and verified linkage.
  Approval/disclosure, identity, guardian scope, saved phone, STOP and category choices
  remain required. No marketing or portal access is granted by this flow.
- Printable operating packet, provider-update draft, family instructions, 90-minute
  training, forty-four unverified live acceptance scenarios, migration/ERA manifests,
  readiness registers, Friday scorecard and tentative calendar drafts.

## Checks completed

| Validation | Result |
|---|---|
| Focused backend suite after integrating current main | 132 passed |
| Frontend components and existing workflow tests | 14 passed |
| Existing SMS carrier regression suite | 678 passed; 8 existing skipped cases |
| Native MySQL, isolated synthetic schema | 6 passed |
| Production compilation of the new panels | Passed |
| Chrome desktop/mobile fictional rehearsal | Passed; 390px without horizontal overflow; zero application API requests |
| Source syntax and whitespace checks | Passed |

Native tests exercise additive SQL/reapplication, encrypted persistence, concurrent
revision conflicts, frozen ranking configuration, account-independent START, duplicate
and delayed receipts, current guardian restrictions, reviewed grants and account-wide STOP.
The native test caught and corrected the new review path’s JSON restriction comparison.
No production client records, messages, claims or payments were used.

The preview compiles actual panel source with a virtual API and fictional people. It is
component/build evidence, not a full production deployment build or real carrier acceptance.
The full SMS suite’s initial loopback permission failure was resolved by running with local
network access; the completed result above includes the webhook mount tests.

## Work that still requires live access/evidence

The task verified the established Google Cloud login and read only backend release metadata
and public build IDs. At that observation, the backend reported `c158491d7` and the frontend
reported `5ce7dfbd4`. Other releases landed while this branch was being prepared. No production
deployment, DDL, service setting or traffic change was performed by this task.

The repository has no established scoped application automation identity for this work.
AGENTS.md prohibits impersonating a person, using an application superadministrator or
forging credentials/audit actors. Provider sends, real chart migration, account operations
and payer transfers therefore remain pending through an authorized access path.

Google Drive was not connected, and no TherapyNotes connector was found. No Drive backups,
TherapyNotes exports, account suspensions, ERA receiver changes or subscription cancellations
are represented as complete. The packet contains concrete materials for their authorized
operators, with every live acceptance case initially unverified.

Deployment order and rollback are in RUNBOOK.md. Apply migration 1828 before exposing the
board or enabling first-time START capture. Preserve the existing encryption key and history.
