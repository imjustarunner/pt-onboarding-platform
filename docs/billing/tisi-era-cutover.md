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

Live portal check on 2026-09-26: TISI / COCHA ERA enrollment returned an existing-receiver conflict. Claim.MD instructs the current receiving account to remove/stop its enrollment, or the account holder to open a Claim.MD support request. No transfer occurred; the first live directory check returned zero TISI ERAs. This is separate from CCHA professional claims, which require no electronic enrollment.

Provisioning: `node scripts/provision-claimmd-sync.mjs` previews the job; `--apply` creates/updates it and its 15-minute scheduler using the serving backend image and only the necessary billing/database/encryption configuration. Re-run after backend changes affecting this job or credential rotation. Its transmission mode is always disabled, and its agency allowlist is 377.

## BCBS and UnitedHealthcare enrollment update — September 26, 2026

The owner stopped TISI's old-account ERA enrollments for CO BCBS (00050) and UnitedHealthcare (87726), confirmed by screenshots dated September 26. Stopping delivery in the old account alone did not redirect ERAs to the new account.

| Payer | New account 31985 status | Evidence and next step |
| --- | --- | --- |
| CO BCBS — 00050 | Enrollment received; activation unverified | Quick Enroll submitted through the live portal, which displayed `ERA ENROLLMENT RECEIVED 09/26/26`. Await activation and verify actual ERA delivery. |
| UnitedHealthcare — 87726 | Enrollment received; activation unverified | The owner completed the Change of Vendor form. The confirmation screenshot at 9:57 PM displayed `ERA ENROLLMENT RECEIVED 09/26/26`. The app tracker was updated from signature required using that evidence. |

The owner confirmed that TISI already receives UnitedHealthcare payments through Optum Pay by direct deposit. No bank details or EFT instructions were changed. UHC's enrollment page advises allowing 45 business days for approval and the payment cycle before opening a missing-ERA ticket with the requested EOB evidence; this is guidance, not a guaranteed activation date.

Live Claim.MD directory checks confirmed professional claims and eligibility support for both payer IDs. No actual member eligibility request or claim was submitted during enrollment. The owner confirmed that the first two intended claims have never been submitted; they still require the app's original-claim review and approval. Verify a real eligibility response, claim acknowledgments and the first ERA before treating the migration as complete.

Both ERA tracker entries are `enrollment_received`. Audit records distinguish direct portal observation for BCBS from the owner's confirmation screenshot for UHC; neither is represented as a webhook or proof of activation. The earlier CCHA receiver conflict remains a separate outstanding item. These updates do not move ITSCO or NLU ERA delivery.
