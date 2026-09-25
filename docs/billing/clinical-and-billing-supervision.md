# Clinical supervision and billing oversight

Implemented September 24, 2026 on `codex/claimmd-billing-workspace`; not deployed and not validated with live claims. This extends existing supervisor assignments rather than adding a financial permission to clinicians.

| Assignment | Documentation responsibility | Financial access from assignment |
|---|---|---|
| Clinical | Shared chart review, treatment plans, case acknowledgement, clinical review time; cosign if no separate billing supervisor | None |
| Billing | Responsible note cosign, review policy, oversight time; can also review cases/plans | None |
| Both, same person | Both responsibilities, one required note cosign | None |
| Manager | No clinical access or signing authority from this assignment | None |

Billing assignments take precedence over an older claim-provider preference pointing at the clinical supervisor. Changing the responsible signer resets the effective documentation policy to conservative defaults until reviewed. Previously signed/submitted snapshots are not rewritten. Recheck pending cosign tasks when assignments change.

Non-service review switches remain per note type. Every clinical amendment/addendum requires a fresh responsible-supervisor cosign over the note and all addenda; case acknowledgement or clinical review never satisfies that signature. Payer requirements cannot be waived with an application toggle.

## Colorado source review

The [current social-work rules, 4 CCR 726-1](https://www.sos.state.co.us/CCR/GenerateRulePdf.do?fileName=4+CCR+726-1&ruleVersionId=12110), effective August 30, 2025, were opened successfully on September 24, 2026. Rule 1.14(C)(3) generally calls for an LCSW for licensure supervision, with limited Board-approved exceptions. Rule 1.14(C)(1)(e) requires substantive case/treatment involvement and includes fees and billing procedures. I found no blanket every-progress-note cosign requirement in the rules reviewed. This is not a finding that every payer, service or credential permits deferred cosign.

HCPF's [June 2025 behavioral-health update](https://myemail.constantcontact.com/Health-First-Colorado-Behavioral-Health-Updates-June-2025.html?aid=D7DATfOZfZw&soid=1120776134797), reopened successfully, expressly separates Medicaid oversight from DORA licensure supervision. The enrolled provider under whom services are billed must actually oversee treatment. Inference: separating application assignments is consistent with this distinction; it does not establish eligibility for a particular clinician or payer arrangement.

The January 2026 HCPF RPO FAQ was searchable but direct retrieval returned HTTP 403. That is an access failure, not proof of a deleted page, and its current text was not treated as freshly verified. Obtain the current policy and applicable payer/product terms before approving live supervised mappings. No automatic credential eligibility is inferred from a profile's degree/license label; verify the license, scope, enrollment and any Board exception.

## Case review and privacy boundaries

An authorized supervisor can build a case overview inside the app: clinical excerpts from up to 10 recently updated signed notes and 3 active/final treatment plans, with source links. The overview is not generative AI, a complete chart, or an approval of the treatment plan. It sends no chart content to an external model. Older shared notes/plans remain accessible through pagination. Treatment plans by another author are visible only within the same agency and an established supervisee case.

Access requires an active authenticated account, agency access and a clinical/billing assignment (or existing agency-admin/self read permission). Structured claim and financial fields are removed from serialized documents, including nested JSON. Free-text clinical narratives are not automatically redacted for financial statements entered by authors. Do not put claims/fee information in clinical prose.

The overview does not read the separate private supervision-note store. Explicitly restricted/private psychotherapy records are excluded. [HHS explains](https://www.hhs.gov/hipaa/for-professionals/faq/does-hipaa-provide-extra-protections-mental-health-information-compared-other-health.html) that separately maintained psychotherapy process notes have additional protections and differ from ordinary progress and treatment records. These controls support restricted access; they do not certify every external-supervisor disclosure as authorized. Validate the supervisor relationship and any additional applicable confidentiality restrictions before assigning access.

Document/overview reads and acknowledgements write actor, agency, supervisee, client reference, timestamp and content digest to the main audit database; no clinical narrative is copied there. Missing audit storage prevents disclosure. Changed source content invalidates the displayed current acknowledgement. Clinical review time is individual, cannot overlap recorded meetings/review blocks, and does not automatically award licensure or payroll credit. RPO entries require the responsible oversight supervisor; recording minutes alone does not establish policy compliance.

## Release checks

Local validation: 85 backend Claim.MD tests and 9 frontend supervision/cosign tests passed; the production frontend build passed with an 8 GB Node heap. Coverage includes separate/combined roles, tenant denial, financial filtering, mandatory amendments, source-version acknowledgements, audit failure, and discarding in-flight chart responses after an agency change. The build retains its existing chunk-size warnings.

Apply main migration `1484_supervision_case_review_events.sql` after `1483`, plus pending clinical `018`/`019`, through the established staging rollout. Exercise access with separate supervisors, both roles held by one person, an unrelated clinician, billing staff, and cross-agency membership. Validate that the clinical supervisor can read but cannot cosign for the billing supervisor; an amendment still blocks submission until the responsible signature is current. Verify audited reads and source-change acknowledgement invalidation on MySQL before production.
