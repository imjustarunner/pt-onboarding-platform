# Supervised billing and documentation review

Status: requirements and code audit, September 24, 2026. **Not implemented or approved for live use by this document.** Audit baseline: `ffdd887f` on `codex/claimmd-billing-workspace`.

The owner requires AI-supported billable documentation, supervisor-controlled cosign timing, audited claim corrections, configurable review of non-billable documents, and attested documentation-review time without double counting. These are supervised-billing launch requirements, not capabilities implied by the existing workspace.

## Current implementation and gaps

| Area | Current code | Required change |
| --- | --- | --- |
| Claim edits | `claimMdWorkflow.controller.js::correctClaim` permits POS, NPIs, taxonomy, charges and modifiers; requires a reason and revision check; saves encrypted before/after history in the transaction. | Include applicable policy evidence and distinguish claim corrections from clinical amendments; invalidate content review. |
| Standing overrides | `applyBillingClaimOverrides.service.js` applies claim/client/payer rules. | Require reasons, stable payer/product identifiers, effective dates, policy evidence and immutable rule versions. Current reasons are optional and payer matching uses substrings. |
| Signature timing | `signClinicalNote` marks supervised billable notes non-billable until cosign; drafts can exist beforehand. | Separate service billability, signature requirements and submission eligibility. No per-supervisee deferred-cosign setting exists. |
| Supervising identity | `pickClinicalCosignSupervisor` excludes billing-only assignments. `resolveClaimProviders` selects a supervisor billing NPI but retains the treating clinician rendering NPI. Claim creation then prefers the office group billing NPI. | Model treating clinician, supervising clinician, payer-required claim rendering identity and billing group separately. Do not call current supervisor billing end-to-end ready. |
| AI checks | `clinicalNoteContentReview.service.js` auto-passes `aiGenerated` and labels a regex checklist `ai_checked`. Note creation accepts generation metadata from the client. | Require server-verifiable AI evidence. `evaluateClaimReadiness` currently does not enforce AI assistance or content/claim consistency. |
| Non-billable review | Review-only types/metadata bypass cosign broadly; cosign rejects those notes and marks allowed notes billable. | Supervisor-owned review policy per document type, including treatment plans through their separate model/routes. Reviewing or cosigning must never convert a non-billable document to billable. |
| Amendments | Clinical addenda and billing-amendment records exist; claim corrections preserve signed notes. | Bind review/approval to the original note, every addendum and effective claim data. |
| Review time | Scheduled supervision, finalized-session credits and payroll-derived hours exist. | Separate attested documentation-review ledger, scheduling integration and bidirectional overlap controls are needed. |

## Required lifecycle

1. The treating provider finishes and signs the clinical document. Non-billable documents never create reimbursable claims simply because they are signed or reviewed.
2. The server resolves the required supervisor and policy by agency, supervisee, document type, payer/product, credential and date of service.
3. A billable note creates a draft claim. Draft creation is distinct from submission approval.
4. A genuine AI-assisted review evaluates current content and addenda against the effective service lines, duration/units, setting and delivery modality. Deterministic checks validate identifiers, dates, codes, permissions and signatures.
5. Findings route to billing or an authorized clinician. Billers correct supported claim fields or document payer formatting exceptions; clinical factual changes require a signed amendment/addendum.
6. Pre-submission cosign policy holds the claim. Explicitly permitted deferred cosign allows the provider signature to satisfy submission timing while an assigned, due-dated cosign task stays open.
7. A biller reviews the effective payload. The server rechecks all requirements and review freshness at transmission.
8. Later cosign records the actual signer/time without backdating or rewriting the submission audit. A supervisor's rejection after transmission creates an escalation/corrected-claim task.

## Supervisor settings

Per supervisee: **cosign before submission** or **cosign may follow submission where permitted**. Deferred submission is constrained by a separately maintained payer/credential rule, supporting reference and effective dates. Unknown permission holds submission. A supervisor setting or AI result cannot waive a mandatory supervision/signature requirement.

For discretionary review of non-billable documents: **all types**, **selected types**, or **none**. Individually select termination notes, treatment plans, contact notes and other registered types. Mandatory requirements still apply. Distinguish review acknowledgement from legal cosign. Disabling this review never disables AI requirements for billable claims.

Place controls in the supervisee's supervision settings. Assigned supervisors manage their supervisees; agency administrators manage agency requirements. Billing staff see claim hold/release explanations without acquiring clinical signing rights. Supervisors do not receive financial access merely by supervising, and provider-role financial exclusion remains enforced.

Version policy changes with actor, timestamp, reason and effective dates. Reevaluate open claims; preserve submitted claims' policy snapshots. Resolve clinical and billing supervisor assignments explicitly rather than assuming they are interchangeable.

## Claim corrections and payer exceptions

Keep actual encounter setting/modality, signed narrative and transmitted POS distinct. The office/group billing identity does not establish where care occurred. A school/office mismatch needs review against the actual encounter.

The biller sees original/proposed values and records actor, time, reason and supporting documentation. A payer-formatting exception additionally needs exact payer/product, service scope, modifiers, policy reference and effective dates. A successful payment or clearinghouse acceptance alone does not establish appropriate coding. Do not seed a blanket Kaiser 02-to-11 rule.

Standing overrides must use stable identifiers, not fuzzy payer-name matching. Audit which rule version affected each line and show its effective result before approval. Do not silently reverse a manual correction with a standing rule.

A billing amendment explains a supported claim change without changing the signed note. A clinical addendum corrects or supplements clinical facts. Submitted claims follow the payer's corrected-claim/void workflow rather than unrestricted editing and resending.

## AI evidence and privacy

Every submitted billable claim requires genuine server-verifiable AI assistance/review. User-provided generation flags, regex checklists and supervisor checkboxes cannot satisfy it. Even AI-generated notes need a consistency check against the final claim and later edits.

Persist note/addenda/effective-claim digests, model/prompt/rules version, completion time, findings and resolution history. Digests stay in the application. Material edits invalidate review and approval. Missing, stale, malformed or unavailable review holds submission.

Evaluate clinical content and consistency, not patient identity. Omit names, DOB, member IDs, MRNs, addresses and other demographic identifiers from the prompt. Narrative can itself contain PHI; calling a task “content only” does not de-identify it. Implement and validate minimization/redaction, approved model processing, logging and retention before enablement. Do not claim a PHI-free flow merely because demographics were excluded. Identity/coverage verification stays in the separate authorized billing workflow.

AI findings support human review and cannot guarantee all errors are caught. Do not invent clinical facts or automatically change diagnoses. Payer exceptions require explicit resolution rather than globally suppressing discrepancy detection.

## Documentation-review time

Allow supervisors to schedule review blocks or directly record completed work. Planned time earns no completed-time credit until attested. Record agency, supervisor, supervisee, start/end/timezone, activity category, linked documents, actual minutes, attestation timestamp and amendment/void history. Attestation may occur later; work timestamps describe the actual work.

Proposed default pending the owner's answer: documentation-review minutes are separate from meeting hours, payroll compensation and licensure-supervision credit. Do not give a supervisee meeting attendance for work they did not attend. Any permitted credit conversion requires an explicit rule and traceable allocation.

Reject duplicate/overlapping counted time across review entries, individual/group supervision, imported credited work, supervisees and agencies. Check both creation orders, including later meeting creation/rescheduling/finalization. Handle partial overlap, timezones/DST, retries and simultaneous writes transactionally. Present conflicts for resolution without revealing another tenant's confidential details; do not silently double count or prorate.

## Acceptance cases before live enablement

- Fresh AI review + provider signature + valid deferred-cosign permission yields eligibility and an outstanding cosign task; pre-cosign mode blocks the same claim.
- Missing/expired permission, wrong supervisor, ineligible credential/group affiliation or wrong signer blocks submission.
- The group remains the billing entity; the payer-required rendering/supervising identity is mapped correctly; treating clinician remains in chart/audit.
- Missing/forged/stale AI evidence, model failure and unresolved clinical discrepancies block direct API submissions too.
- Supported POS corrections require a reason, preserve signed content and invalidate approval; payer exceptions stay within their product/date/service/modifier scope.
- Addenda invalidate prior review even if outgoing claim fields did not change.
- Non-billable review can be configured per type; cosign never changes billability; treatment plans are included.
- Supervisor rejection after transmission triggers follow-up rather than silent mutation of the sent claim.
- Cross-tenant access, provider access to financial amounts and unauthorized signing/policy changes are denied server-side.
- Review time requires actual-work attestation and rejects overlaps in either creation order without inflating meeting/licensure totals.

## Policy verification still needed

The owner reports that their Colorado workflow permits provider signature before later supervisor cosign. This audit has **not established a universal Colorado rule allowing submission before cosign**. Confirm the specific credential, payer/product, service and dates, including CCHA's requirements, before enabling it.

[HCPF behavioral-health guidance](https://hcpf.test.colorado.gov/bh-policies), under “Medicaid Supervision Policy,” distinguishes Medicaid billing supervision from licensure supervision and describes circumstances where the enrolled supervisor belongs in the claim rendering-provider field. This is why the current supervisor billing-NPI preference is insufficient. The accessible page is on HCPF's test host; obtain the applicable current policy/RAE confirmation before encoding production rules.

The [2026 Kaiser Colorado billing manual](https://healthy.kaiserpermanente.org/content/dam/kporg/final/documents/community-providers/co/kpco-provider-manual-section-5-billing-and-payment.pdf) ties claims/payment to the agreement and applicable requirements. This audit did not verify a blanket telehealth POS 02-to-11 instruction. Obtain the specific product's instruction/reference and effective period.

## Implementation order

1. Separate billability, provider identities and signature policy; implement supervisor settings and policy history.
2. Implement authenticated AI evidence, privacy boundary and submission consistency checks with amendment/override invalidation.
3. Complete audited payer exceptions, effective-payload preview and non-billable review queues, including treatment plans.
4. Add attested review-time ledger, scheduling integration and transactional overlap controls.
5. Test these cases with synthetic data, then verify TISI/CCHA before supervised live claims.
