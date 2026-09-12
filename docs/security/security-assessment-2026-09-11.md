# Security evidence and remaining production verification — September 11, 2026

This is an engineering verification record, **not a certification, independent penetration test, or a determination of HIPAA compliance**. HHS does not endorse private Security Rule certifications, and even external certification does not remove a regulated entity's obligations. [HHS certification FAQ](https://www.hhs.gov/hipaa/for-professionals/faq/2003/are-we-required-to-certify-our-organizations-compliance-with-the-standards/index.html).

## What was verified

The current family billing implementation uses authenticated AES-256-GCM envelopes, agency/owner-bound encryption contexts, explicit payer assignments, private guardian payment methods, signed recurring consent, server-side clinical disclosure scopes, Stripe-hosted card collection, and transaction/idempotency safeguards. The engineering details and earlier test coverage are in [family-billing.md](family-billing.md).

This session observed 36 passing targeted backend security/policy tests covering encryption boundaries, payment authorization/coverage policy, ledger rules, and guardian disclosure scopes. The full runner retained an open handle after reporting those passes and was stopped; a separate forced-exit run reported 24 passing tests. This is scoped regression coverage, not an audit of every application route or all tenant configurations.

The new rollout wrapper was exercised against a disposable MySQL 8.4 instance using the repository's real family billing migrations and synthetic records in distinct main and clinical databases. Checks covered missing apply acknowledgements, refusal of ambiguous database targets, read-only inspection, actual legacy-record encryption, repeat application, and rejection of wrong family/intake keys against existing ciphertext. No production records, real card transactions, insurance claims, or outgoing messages were used.

The preflight verifies ciphertext authentication for existing family and intake envelopes without printing patient data. It does not establish that every data field or historical artifact in the platform is encrypted. The wrapper runs the existing backfills, reports aggregate counts, and fails if pending records remain. It does not turn on automation or grant payer access.

## Production evidence still required

| Area | Remaining evidence |
| --- | --- |
| Encryption rollout | Successful production read-only check, confirmed recoverable backups and paused writes, successful backfill, zero pending counts, correct key references on the running revision |
| Stored files | Private GCS IAM, no unintended public object URLs, KMS permission checks, review of historical insurance/ID uploads, generated PDFs, object versions, exports and retention |
| Identity and roles | Live tests with separate tenants, staff roles, two guardians, payer-only and restricted clinical access; MFA/session policies; support-access logging and periodic access reviews |
| Payment processing | Stripe test-mode setup/decline/authentication/replay/reconciliation and receipt checks; processor account configuration; signed recurring consent before automated collection |
| Claims | Claim.MD sandbox validation, payer-specific requirements, explicit staff review; automatic ERA/secondary-claim adjudication is not supplied by this implementation |
| Operations | Backup restoration exercise, incident/breach response process, monitoring, patching, workforce training, retention/deletion policies, and documented risk assessment |
| Vendors | Appropriate BAAs and service configurations for providers that handle ePHI, including cloud services and applicable communications/document processing services |

The active local service account was denied Cloud Run read access, and the authenticated user account required reauthentication. Therefore live secret bindings, cloud IAM, object exposure, database state, BAAs, and production payment/claim flows were **not verified** in this session. No production backfills or key rotations were performed by this agent. The user reported a successful production dry run (no records changed). A local configuration-only check confirmed a valid intake key, absent family billing key/ID, and absent document KMS resource; it printed only presence/format status, never secret values. The GitHub deployment workflow was updated to forward the newly added family billing secrets.

HIPAA risk analysis covers confidentiality, integrity, and availability of all ePHI the organization creates, receives, maintains or transmits. Encryption is one safeguard, not a substitute for that assessment. [HHS risk-analysis guidance](https://www.hhs.gov/hipaa/for-professionals/security/guidance/guidance-risk-analysis/index.html). Cloud deployments also require appropriate BAAs and assessment of the actual cloud environment. [HHS cloud guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/health-information-technology/cloud-computing/index.html).

Use the [short rollout guide](family-billing-rollout.md) to complete the immediate database work, then collect the operational evidence above. An independent assessor can review that evidence and perform a separate penetration test; this document does not represent such an assessment.
