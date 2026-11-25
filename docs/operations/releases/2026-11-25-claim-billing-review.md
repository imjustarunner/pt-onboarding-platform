# Claim billing review — implementation handoff

**Awaiting the separate release chat. Not deployed.**

Branch: `codex/claim-billing-review-20261125`.
Implementation base: `41933f0e2afe286000d16fc98abd86af56c99263`.
The final commit SHA is supplied in the implementation chat's handoff.
This branch does not integrate, merge, deploy, dispatch workflows, or change production data.

## Behavior

- The billing workspace has a direct eligible-claims queue and an application confirmation for submitting the eligible claims on the current page. Final submission checks remain mandatory; incomplete or excluded claims are held individually.
- Patient and claim links are separate. The signed-note viewer now opens its exact linked claim in the correct agency; the note composer offers billing-authorized users a claims-queue link after signing.
- The editor fills missing rendering NPI/taxonomy from configured, agency-scoped identities and verified payer/supervisor mapping. Saved identifiers remain recorded. Missing identifiers no longer block saving a charge draft; submission still requires a complete, valid identity and clinical review.
- Every changed line charge requires explicit confirmation. **This claim only** is initially selected. Updating matching defaults requires separately saving the chosen practice, payer, provider/payer, provider-type, or client rate. New claims inherit those defaults; saved historical charges do not change automatically. Rates do not grant clinical or payer credential permissions.
- **90791 = $135** in the platform starter and migrated current practice/legacy/service prices, including saved scope overrides. No other new charge amounts were supplied. Saved claim amounts and receipts remain unchanged until an explicit correction.
- A billing-only financial panel displays copay, coinsurance percentage, reviewed estimates, ledger payments/due amounts, and actual prior reimbursement records for the client/provider/payer. Unknown amounts remain unknown. Primary adjudication is not labeled final while secondary coverage is outstanding.
- Payer adjustments over $5, excluding the patient-responsibility portion, and payer payments exactly equal to the billed charge produce rate-review suggestions. Neither condition changes a rate automatically.
- Estimates create no receivable. A verified copay uses the existing ledger. Final manual patient responsibility requires private uploaded ERA/EOB proof, its source/reference, and explicit review. It uses the existing completed-visit, coverage, Medicaid, secondary-claim, and ledger guards; it does not fabricate payer payments, mark an app transmission, or run a card. External adjudication evidence is committed before posting a balance, so a failed ledger write cannot make the original claim eligible for resend.
- Superadmins can annotate a chart record as chart-only, entered in error, documented elsewhere, or in Therapy Notes. The composer saves unsigned content without fabricated clinical attestations. The exclusion annotation is append-only, blocks subsequent original/secondary/resubmitted claims and copay collection, removes unclaimed encounters from the billing queue, and closes unsent drafts with who/why details. Signed text and submitted history remain intact; queued transmissions require reconciliation first. If a draft attachment succeeds but its exclusion fails, it remains unsigned and the UI permits retrying the annotation on that same draft.
- Claim grouping remains **one encounter and payer**, with the encounter's service lines together. Separate visits are not combined into one claim per client.

## Validation

Final affected checks have **zero failures**. Counts below overlap; do not sum them as unique tests.

| Suite | Passed | Skipped |
| --- | ---: | ---: |
| Backend Claim.MD (`backend/vitest.claimmd.config.js`) | 693 | 8 |
| Backend fee schedules (`backend/vitest.fee-schedule.config.js`) | 68 | 4 |
| Backend attendance/copays (`backend/vitest.attendance-copays.config.js`) | 85 | 0 |
| Backend billing transactions (`backend/vitest.billing-transactions.config.js`) | 100 | 1 |
| Frontend claim billing review (`frontend/vitest.claim-billing-review.config.js`) | 174 | 0 |
| Frontend billing dashboard (`frontend/vitest.billing-dashboard.config.js`) | 90 | 0 |
| Dedicated synthetic MySQL migration/financial/audit tests | 4 | 0 |
| Existing synthetic MySQL fee tests, including new client/type inheritance | 3 | 0 |

The default suite skips are environment-gated MySQL cases. The four new migration cases and three fee cases were separately enabled and passed against a task-owned local MySQL 9.5 database with networking disabled. The remaining gated snapshot, assignment coverage, data-monitor, planned-import, payer-catalog, and work-queue MySQL cases were not run. The production MySQL version and combined release remain release-chat validation responsibilities.

Regression coverage includes initial claim-only confirmation, saving charges with blank identifiers, configured identity prefill without overwrites, client/tenant rate isolation, stale revisions, manual proof scope and required review, preserved payments on final zero responsibility, no final primary balance with pending secondary coverage, chart-only authorization, immutable annotations, and rollback when audit persistence fails. Initial outdated expectations and incomplete test mocks were corrected; no known failing check remains.

No large frontend production build was made in the sparse implementation checkout. Vue compilation and component behavior were exercised by the listed frontend suites. `git diff --check` passed. No live verification was attempted.

## Release requirements

1. Integrate this branch with the latest released code in the separate release chat. Preserve other chats' releases; resolve any migration-number collisions before running migrations.
2. Apply core migration `1882_owner_requested_90791_charge.sql` and clinical migrations `039_note_billing_exclusions.sql`, then `040_owner_requested_90791_charge.sql`, through the shared migration process. Complete the schema changes before this backend's billing queries/jobs run.
3. Core 1882 permits nullable human fee actors and adds `actor_automation_key`; its system rate changes use `github-actions:release-migration:1882` with a null human actor. It appends rate revisions rather than rewriting fee audit history. Clinical 039 adds the append-only exclusions table and triggers; 040 updates legacy 90791 prices.
4. Deploy a paired backend/frontend release. The new proof upload reuses existing private object storage, evidence storage, and family-billing encryption configuration. No new production secret or live data repair is included in this handoff.
5. Run the combined build/checks and verify live with authorized application access: separate patient/claim links, incomplete-identity charge save, initial claim-only confirmation, scope defaults, current 90791 prices, patient estimates versus final balances/proof, provider financial restrictions, and chart-only exclusions across queues/submission/copay collection. Verify eligibility/secondary-payment guards remain effective.

Production data, human sessions, and superadmin identities were not used for implementation/testing. Temporary checkout/database artifacts are removed after the named branch is pushed and retained.
