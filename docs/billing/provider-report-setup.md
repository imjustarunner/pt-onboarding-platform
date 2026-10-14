# Provider setup from existing records

October 13, 2026: billing setup reads existing payroll provider/service-code history, canonical billing-report provider/payer history, credentialing, supervision, billing group NPIs, and saved electronic payer routes. Open Billing → Payers & ERA → Optional provider transitions, then use the existing setup for a provider/payer. The records refresh from their sources. No report line is converted into a new claim.

Exact saved payer aliases and explicit credentialing payer links can supply the electronic ID. Ambiguous or conflicting IDs stay unresolved. Payroll imports retain provider/service history but not payer routing; payer details therefore come from credentialing and the payer catalog. Recorded payment history does not certify current enrollment, network participation, or ERA routing.

Transitions are optional. Existing billing continues when no provider/payer transition is recorded. A recorded hold or service-date boundary is enforced during review and submission; changes invalidate old approvals. Activation requires reviewed cutover dates and confirmed TherapyNotes ERA delivery. Historical service dates never automatically become cutover dates. The release does not alter transmission modes, enrollment, or ERA destinations.

Individual claim NPIs now use the agency's credentialing fields, with the core user NPI as a fallback when those fields are empty. Billing offices can use an explicitly mapped credentialing group NPI; contradictory group identities block review rather than silently changing the billing identity. Production supervision/credential eligibility checks remain intact.

New H0002 work opens the general screening writer, which documents the clinician's supplied eligibility/fit determination, treatment needs, recommended options and next steps. It does not require a therapy appointment or receive a default 60-minute duration. Existing PSC-specific drafts retain their writer. Same-day screening and therapy drafts stay separate, and signed or claimed records are not reused for new documentation. Signing and claim review remain explicit actions.

## Production verification and release scope

The deployed database is `onboarding_stage` with `onboarding_stage_clinical`. It contains payroll history, provider credentials and the payer catalog. The checked agencies have no canonical billing-report rows yet. ITSCO source data resolves 131 provider/payer entries, 44 with an existing saved electronic ID. These counts are setup evidence, not a readiness certification.

ITSCO and NLU transmission modes are disabled; TISI is already live. Existing CCHA professional-claims enrollment records say `no_enrollment_required`. These saved records do not prove a new claim has reached a payer. No Colorado Access claims-enrollment record was found in the checked practices. The release submits no claims, enrollments, provider attestations, or bank/ERA changes.

This focused release is based on current production commit `1fe863333`, preserving newer payer catalog, supervision, remittance and other billing code absent from the older working checkout. The independent AuricWell application and its remaining canonical-documentation consolidation are not launched by this release.

Validation: billing regressions, focused frontend tests, and production builds for the main frontend and bundled public sites. A native disposable MySQL test verifies same-day service separation, provider/agency scoping, and exclusion of signed, claimed or cancelled records. No production data is used by the test.
