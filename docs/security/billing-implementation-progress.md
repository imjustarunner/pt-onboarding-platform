# Billing implementation progress

Implemented September 11, 2026 in the repository. Production rollout requires the configuration and migration steps in [family-billing.md](family-billing.md).

- [x] Common receivables, payer allocations, cash/card settlement, audited adjustments/refunds and private receipts
- [x] Reviewed claim copays/patient responsibility and existing session billing import, with source status reconciliation
- [x] Paid package credits, class membership and event registration through the shared settlement path; generic tutoring/coaching/consulting charges
- [x] Guardian split requests with affected-payer acceptance, staff sharing controls and alternating payer rules
- [x] Signed installment schedules, partial payments, cancellation and opt-in scheduled collection
- [x] Separate clinical guardian grants, recorded authority, birthday reviews, restriction requests and protected portal/acknowledgment paths
- [x] Migration payment/waiver tasks, owner-bound expiring links, login return and branded invitation drafts
- [x] Plan-aware aging, printable statements, reviewed email sending, tenant Workspace group/send-as provisioning
- [x] Automatic departmental PNG signatures using stored tenant logos, with readable text fallback
- [x] Staff and portal UI, synthetic integration tests, responsive browser checks and rollout documentation

Boundary: Claim.MD claim submission and reviewed patient responsibility are integrated; automatic ERA adjudication is not implemented. Existing practitioner public packets remain payment-in-full checkout with stricter validation; installment/per-session arrangements use the new signed family-billing workflow. Historical payments/insurance need reconciliation and the explicit backfill; no financial responsibility or recurring consent is inferred during migration. Production cards, emails, Workspace changes and claims were not exercised during development.
