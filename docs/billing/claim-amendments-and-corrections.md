# Amendments, service corrections and duplicate prevention

Implemented locally September 24, 2026. Not deployed; apply clinical migration `020_claim_service_changes.sql` after pending `018`/`019` and verify in staging.

| Change | Result |
|---|---|
| Narrative addendum only | Preserve original narrative; require renewed supervisor cosign. No claim creation, line changes, upload or automatic resubmission. |
| Correct service codes/units | Provider attests to the complete corrected service list in an addendum. Encrypted request enters billing review, and the existing encounter's claim is held. |
| Unsubmitted original | After current supervisor approval, billing may apply the proposal to the same draft ID. Biller explicitly reviews line charges, modifiers and diagnosis pointers. Revision changes invalidate prior review; fresh AI review and separate transmission approval remain required. |
| Previously uploaded, processing, rejected, paid, denied, adjusted or void | Preserve original submitted lines and payment status. Do not issue a second original. Record payer correction/reconciliation follow-up and retain the hold. |
| Approved amendment requires no billing change | Billing records a reasoned decision; for a previously transmitted claim, include payer/control and reconciliation references. This does not authorize another original submission. |
| External payer correction is reconciled | Billing attests to the completed follow-up and records original/corrected outcome and payment references. The task closes without sending a claim or posting money in the app. |

The billing queue's attention filter includes held corrections, including paid claims with pending work. The claim's paid status is not overwritten merely to display a follow-up. Supervisors/providers see clinical service corrections without financial claim data.

All claim creation paths use an encounter lock and reject a second original, including when an earlier claim is deleted, voided or linked to another note version. Submission rechecks open service changes and durable upload history while holding claim/note locks. An uncertain upload is not retried. Existing imported duplicate claims are not merged, and different encounters representing the same real-world visit still require duplicate-encounter detection and review.

Signed note payload/title updates are guarded at the model boundary. Metadata-only updates no longer implicitly replace note content with null. The former direct signed-encounter billing edit is blocked: clinical corrections use an amendment, while claim-only billing corrections use the reviewed billing editor. Previously uploaded claim fields are preserved there too.

## Verified payer/vendor guidance

CCHA's [May 2026 provider manual](https://www.cchacares.com/Dal/ebM), pp. 58–59 and 80–81, was opened successfully. Corrected submissions must carry the full service list and identify the original claim. Omitted services can be removed during adjustment. Electronic replacements use frequency code 7 and the payer's original claim/control number. Timely-filing rules apply. A correction can change prior reimbursement; payment/recoupment reconciliation is separate from submitting the correction.

[Claim.MD's duplicate-matching guidance](https://docs.claim.md/docs/how-does-claimmd-decide-when-to-update-a-claim-record-or-create-a-new-one) says its default matching includes procedure code and charge. Ask Claim.MD to configure the account's Duplicate Fields setting to `remote_claimid` before enabling reuploads that change those fields. The app's stable `PT-agency-claim` reference alone does not establish that the vendor enabled this setting, and matching a clearinghouse record does not substitute for payer replacement identifiers.

[Claim.MD's transmission guidance](https://docs.claim.md/docs/how-to-stop-transmissions) says a claim cannot be stopped after a transmission number is assigned. An app hold prevents subsequent app transmission; it cannot recall a claim already sent. Reconcile its status before deciding on a corrected claim or void.

## Current operational limit

This release implements amendment approval, service-change requests, draft application, persistent holds, audit decisions and duplicate-original blocking. **It does not transmit electronic replacements/voids or automatically post ERA adjustments/recoupments.** Handle submitted-claim corrections through the verified payer/Claim.MD workflow and record the reference here. Never reset a submitted claim to draft or clone it to bypass this restriction. Rejected uploads also require manual status reconciliation; rejection alone does not prove the payer never received a claim.

Before live corrected-claim automation: verify Claim.MD account matching, implement reviewed frequency/control-number mappings, preserve immutable submission attempts, reconcile superseded responses and remittances, and test timeout/replay/reversal scenarios using a separate test account. Record verified payments only once and reconcile corrections against the original balance; do not treat replacement charges as new revenue.

## Local verification

108 backend Claim.MD tests, 6 appointment/legacy-claim tests and 27 frontend billing/supervision tests passed. Coverage includes narrative-only amendments, code-change holds, signed-content preservation, current supervisor approval, legacy paid status, repeated original uploads, stale revisions, draft line/charge updates, external reconciliation attestation and provider/financial separation. Run migration and concurrent transaction tests on disposable MySQL/staging before production; local mock-based tests do not certify payer processing or database concurrency behavior. No live claim or replacement was transmitted.
