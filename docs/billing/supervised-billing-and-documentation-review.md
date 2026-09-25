# Supervised billing and documentation review

Status: implemented locally, September 24, 2026; **not deployed or verified with a live payer**. This release extends the Claim.MD workspace on `codex/claimmd-billing-workspace`.

## Implemented

- Versioned supervisor policies per agency/supervisee, with before-submission cosign as the default. Deferred cosign additionally requires a dated, verified payer/product rule. Clinical note billability is independent of cosign timing.
- Separate treating clinician, overseeing clinician, rendering identity, and group billing identity in claim preparation and the encrypted submission snapshot. Missing or unverified supervised mappings hold submission.
- Mandatory server-recorded AI content review of the signed note, addenda, and effective claim. Metadata flags and regex checklists cannot satisfy the submission gate. Changed clinical content, billing fields, overrides or policy versions invalidate review/approval.
- Claim-side overrides require exact payer/product scope or specific client/claim, effective dates, reason and policy reference. Replacement versions preserve encrypted audit history. Clinical facts remain in signed notes/addenda. POS/modifier findings permit a specifically documented billing resolution; clinical findings require clinical correction.
- Supervisor review settings and a clinical document queue in the supervision modal and user supervision tab. Non-billable types can have all, selected or no discretionary review. Configured payer-required types remain requested. Treatment plans and termination notes stay non-billable.
- Separate scheduled/attested/void documentation-review and RPO time. Shared per-person MySQL locks reject review/meeting overlaps across agencies and supervisees, including meeting creation, rescheduling, attendance additions, and status changes. No automatic payroll or licensure credit is awarded.
- Billing-only payer-policy editor and individual-NPI readiness roster. Supervisor status does not confer financial access.

Main migration: `1483_supervised_billing_policies.sql`. Clinical migration: `019_claim_documentation_reviews.sql` (requires the previous Claim.MD clinical migration `018`). Apply and verify in staging before rollout.

## Verified Colorado January change

HCPF’s [June 30, 2026 behavioral-health update](https://myemail.constantcontact.com/Health-First-Colorado-Behavioral-Health-Updates-June-2026.html?aid=9i8MEgGa9aY&soid=1120776134797) says that **January 1, 2027** begins the requirement for individual NPIs for all behavioral-health service providers, including pre-licensed and unlicensed professionals, and that the individual NPI must appear on the claim.

The announcement does **not** specify the 837 field/loop, whether the existing overseeing-provider mapping changes, or whether the transition is keyed to service date or submission date. Until confirmed, the implementation conservatively holds Colorado Medicaid supervised claims when either date reaches January 2027 unless a verified, applicable rule includes the service provider NPI. This is an application safeguard, not a claim that HCPF announced both date criteria.

Claim.MD’s [professional-claim field reference](https://docs.claim.md/docs/professional-claim-form-overview) documents `chg_supv_prov_npi` and associated supervising-provider names. The adapter supports these charge-level fields alongside the treating provider’s `prov_npi`, **only behind a verified dated payer rule**. No TISI/CCHA rule is pre-marked verified. Obtain Claim.MD/CCHA confirmation before enabling this proposed mapping; vendor documentation alone does not establish CCHA acceptance.

HCPF’s [Rendering Provider Oversight policy](https://hcpf.colorado.gov/sites/hcpf/files/Health%20First%20Colorado%20Behavioral%20Health%20Rendering%20Provider%20Oversight%20Policy_FINAL.pdf) and [December 2025 FAQ](https://hcpf.colorado.gov/sites/hcpf/files/FAQs%20on%20Rendering%20Provider%20Oversight_December%202025.pdf) distinguish Medicaid oversight from licensure supervision and do not impose a blanket cosign requirement on every note. Requirements from the particular contract, credential, service, or other regulation still apply. Minimum RPO described by the policy is one hour per 40 billable service hours for pre-licensed clinicians and one per 20 for unlicensed professionals; this release records RPO time but does not certify those ratios automatically.

## AI privacy enablement

The application locally removes known coverage/chart identifiers, calls Google Sensitive Data Protection de-identification, then sends the returned narrative and a whitelist of service code, units, POS and modifiers to Vertex. It does not send the patient/insurance object to the language model. Sensitive Vertex errors suppress response-body logging, and this workflow cannot fall back to the API-key endpoint.

Enable only after the organization has reviewed the processing arrangement, locations, IAM, retention/logging and redaction quality: `CLINICAL_AI_PRIVACY_APPROVED=true`, an approved `GCP_PROJECT_ID` (or existing equivalent), DLP `content:deidentify` and Vertex permissions/API enablement, and the existing clinical/billing encryption configuration. Missing privacy configuration, redaction failure, malformed/incomplete model output, or a missing fresh review holds submission. Redaction is not a guarantee that narrative contains no PHI; DLP itself processes sensitive content. No real patient narrative was sent during local verification.

## Remaining production checks and limits

- Confirm CCHA’s precise January mapping, deferred-cosign permission, product identifiers and effective periods. NPI checksum validation does not verify Type 1 ownership, licensure, credential eligibility, enrollment or group affiliation; these require verified source records.
- Exercise migrations and concurrent writes on disposable MySQL/staging, then use a **separate Claim.MD test account** for synthetic submission and response scenarios. The supplied account is production and was not used for test claims.
- Review-time entries are a separate ledger. Imported payroll/licensure totals without start/end intervals cannot be overlap-checked or credited by this release. Do not add these minutes to those totals automatically.
- Clinical review queues show the latest 100 signed notes and 100 active/final treatment plans. Mandatory document review is surfaced as requested work; separate treatment-plan activation/renewal policies still apply. Post-submission changes create a billing history follow-up event; an automated corrected-claim/appeal workflow is not supplied.
- Existing payments workspace limitations remain: ERA reconciliation/posting, reversal handling and payment reporting are separate unfinished work. Accepted claims are never labeled paid merely from an acknowledgement.

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

Implemented default: documentation-review minutes are separate from meeting hours, payroll compensation and licensure-supervision credit. Do not give a supervisee meeting attendance for work they did not attend. Any permitted credit conversion requires an explicit rule and traceable allocation.

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

## Payer-specific exceptions

The [2026 Kaiser Colorado billing manual](https://healthy.kaiserpermanente.org/content/dam/kporg/final/documents/community-providers/co/kpco-provider-manual-section-5-billing-and-payment.pdf) ties claims/payment to the agreement and applicable requirements. No blanket telehealth POS 02-to-11 instruction was verified. Record the product-specific instruction and effective period. A system accepting a code is not evidence that the code accurately represents the service.

## Local verification

136 targeted tests passed: 56 Claim.MD/supervised-billing backend tests, 30 adapter/security Node tests, 11 scheduling-access/readiness tests, and 39 frontend workspace/supervision/clinical-note tests. These cover permission boundaries, policy dates/versions, provider identities, AI failure and freshness gates, audited overrides, time overlap locks, and approval invalidation.

An isolated release copy excludes unrelated intake changes. Its production frontend build passes (existing large-chunk warnings remain). Synthetic Chrome checks at desktop and phone sizes exercise policy saving, NPI readiness, the document queue and scheduled/unattested review time; no runtime errors or horizontal page overflow remain. These are local checks, not live payer, real-MySQL concurrency, privacy-quality, or production deployment verification.
