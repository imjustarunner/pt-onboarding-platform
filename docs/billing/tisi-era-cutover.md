# TISI Claim.MD cutover

Claim submission and ERA delivery are separate. Claim.MD account 31985 serves several agencies; enable `CLAIM_MD_MODE_377=live` only for TISI, with the shared default and agencies 2/6 disabled. The runtime mode may reference the `CLAIM_MD_MODE` Secret Manager secret. Keeping the secret reference on Cloud Run lets deployment preserve it. App approval, current review digest, documentation and enrollment checks still apply to every submission.

## Payment workflow

Apply clinical migration 024 before deploying the remittance endpoints. Billing Workspace → Payments now imports agency-owned ERA records, reviews service-level adjustments, matches immutable submitted claims, and posts an adjudication after explicit billing approval. Matching requires the agency/account, billing NPI, payer, member ID, patient account, dates, services, modifiers, units and charges. A documented manual account-number match still requires the other identifiers to agree.

Original responses and matching explanations are encrypted. Posting is an immutable, uniquely keyed journal entry. Concurrent imports/posting and repeated clicks do not duplicate payments. A subsequent ERA for an already adjudicated claim, reversal, unbalanced data or provider-level adjustment remains manual review. No acknowledgment alone marks a claim paid. ERA posting does not prove a bank deposit.

The patient ledger is updated through a durable outbox. Primary and secondary share the original visit balance; existing copays stay credited. A complete balanced final adjudication with no PR adjustment closes patient responsibility at zero. Overpayments remain recorded for refund review, without fabricating a refund. Changed positive responsibility preserves paid amounts and holds any remaining balance for billing review. Pending charges, collections handoffs, amendments, secondary coverage and Medicaid collection protections continue to block inappropriate collection. Forwarded claims require final-payer review. A failed patient-ledger update does not lose the insurance posting and can be retried from Payments.

## Background operation

`node src/scripts/syncClaimMdResponses.js` retrieves responses and bounded ERA batches, then retries patient balance jobs. It never submits a claim or charges a card. Provision a Cloud Run Job and scheduler with the same database/encryption credentials as the backend; restrict its agency list to 377 for this cutover. The Payments import button provides an on-demand alternative and reports when more files remain. Sync rescans directory pages and skips durable imports instead of advancing a cursor past unimported history.

## Remaining cutover evidence

- Complete TISI's payer ERA enrollment/routing in Claim.MD. Do not move ITSCO/NLU ERA delivery.
- Verify an actual TISI ERA reaches account 31985 and the app.
- Review a real completed TISI claim, approve it, and verify clearinghouse and payer responses.
- Reconcile old-EHR open claims, collected copays and balances before retiring access. Legacy ERAs without an immutable submitted app claim remain unmatched; importing an ERA never creates a new claim or patient charge.
- Reversals, supplemental adjudications and provider-level adjustments require manual reconciliation; they are not automatically posted by this version.
- Medicare/TRICARE or other payer forms requiring authorized signatures must be completed by that official.

Validation: Node domain tests; MySQL tests for concurrent imports/posting, agency isolation, changed-source holds, copay preservation, zero closure, pending-payment blocks and outbox retries; existing submission, secondary-claim and workspace permission suites; frontend production build and real-component desktop/mobile browser checks.

Reference: https://api.claim.md/ (ERA list and ERA details). ERA import uses polling; enrollment callbacks are not ERA delivery callbacks.
