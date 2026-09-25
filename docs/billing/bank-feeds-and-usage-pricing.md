# Bank feeds, eligibility scheduling and agency fees

Status, September 25, 2026: the Billing Workspace Settings cost planner is implemented. It is a calculator, not an invoice or live automation. It uses entered account-wide volumes, counts secondary policies separately, compares monthly/weekly/before-visit checks, and separates processor cost from proposed platform revenue. No settings are persisted and no payment or eligibility request is made by the planner.

Existing foundations: manual Claim.MD eligibility requests and dated coverage reviews; EFT evidence tracking; Stripe Connect payment methods supporting application fees; agency subscription invoices. Background eligibility scheduling, a metered clearinghouse usage ledger, applying medical-billing service fees to tenant invoices, bank-feed ingestion and automatic bank/ERA reconciliation are **not yet implemented**. Existing application-fee support does not mean fees have been configured across all app transactions.

## Account and pricing setup

Confirm the actual plan and additional-TIN charges for account 31985. Several agencies may share one clearinghouse account, but their included allowance must be counted once across the account. Allocate shared costs explicitly; never issue each tenant a separate vendor base charge unless that is an agreed service price. Preserve agency/TIN/NPI attribution for every transaction. Vendor cost and management-company price are distinct.

The planner uses the [Claim.MD public pricing table](https://www.claim.md/pricing): Unlimited $120/month with 1,000 included eligibility transactions, eligibility overage $0.02 Prime/$0.10 non-Prime; Small Volume $60 with 100 each and $0.50 overage; Basic $30 plus $0.30 each. Unlimited includes claims and ERAs. Additional Unlimited tax IDs have tiered monthly charges; enter the actual total from the contract. ERA counts are claim responses (CLP), not files. Confirm contractual rates and payer classification before invoicing.

Recommended billing design: agreed monthly agency service fee plus itemized metered services, or an explicitly contracted collections-based service fee. There is no universal standard rate. Show quantities, effective rates, credits and the price version on each invoice. Reconcile to vendor usage before finalizing charges. Do not bill an ambiguous network retry as a new completed service. Do not derive a collections fee from accepted claims or ERA amounts before the contracted collection event occurs.

For cards, [Stripe Connect pricing](https://stripe.com/connect/pricing) distinguishes models where Stripe bills the connected account versus platform-controlled pricing. Published domestic online card pricing starts at 2.9% + $0.30. The platform-controlled model also lists active-account and payout fees. Confirm which costs the actual account pays. A single percentage cannot cover every small payment because of the fixed fee. Example: $10,000 across 400 payments costs approximately $410 at 2.9% + $0.30; a proposed 1% platform fee adds $100, before any additional Connect fees. This is an illustration, not an activated rate or industry standard. Keep these agency expenses separate from patient responsibility; no automatic patient surcharge. Refunds and disputes need explicit fee reversals/credits and reconciliation.

## Background eligibility activation checklist

- Confirm payer eligibility availability/enrollment for the billing identity; verify TISI's access and check the Colorado Medicaid Provider Web Portal Other Insurance/TPL workflow.
- Configure per-agency scheduling, responsible biller, monthly check limit and account-wide allowance. Start with a user-selected frequency plus checks when coverage changes; pre-visit rules must use the actual service date. Do not interpret a cached check as verification for a different service date.
- Count each primary/secondary policy separately. Only enroll active clients with usable insurance and a valid billing location. Do not silently convert incomplete insurance to self-pay.
- Reserve budget and persist an idempotent job before the external request. Key by agency/client/policy fingerprint/service date/check period. Use one worker lease, bounded retries, visible unresolved requests and a pause control. Account for requests whose vendor charge is uncertain.
- Persist encrypted responses and new evidence in the existing review flow. New or conflicting findings require review; no automatic coverage attestation, payer reordering or release of collection holds. Absence of other coverage in a response is not proof that no other policy exists.
- Preview the expected checks/cost before enabling; show actual usage, failed checks and limits afterward. Reconcile vendor charges separately from the agency's service-price agreement.

## Chase bank connection and deposit reconciliation

[Stripe Financial Connections](https://docs.stripe.com/financial-connections/transactions) supports consented transaction access and daily refresh subscriptions. Live transactions require Financial Connections registration. Confirm that the specific Chase business account is supported in the connection flow; a Stripe payout bank or completed microdeposit verification is not automatically a transaction-feed connection. The public [transaction-feed price](https://stripe.com/financial-connections) is $0.30 per institution per account holder per month; verification, balance and ownership products have separate prices.

J.P. Morgan also offers [Business Direct Connect](https://developer.payments.jpmorgan.com/api/treasury/jp-morgan-business-direct-connect/overview), subject to its onboarding and consent requirements. Select the connection only after clarifying what the owner has already added/enabled.

Implementation requirements:

- Obtain consent from an authorized bank-account owner through the selected vendor's hosted connection flow. Do not collect Chase passwords in this app. Request only the read permissions needed for reconciliation, not payment initiation.
- Bind the connection session server-side to the authorized agency/account holder. Verify ownership of returned account IDs; never trust client-submitted IDs. A shared bank account needs explicit management-company permissions and agency allocation, not automatic visibility to all tenants.
- Store token references and encrypted transaction evidence, never bank login credentials. Financial roles only; clinical and billing supervisors without financial access cannot view deposits.
- Verify webhook signatures; handle duplicate/out-of-order events, paginated backfill, refresh failures, revocation, pending-to-posted changes and voided/reversed transactions. Maintain an idempotent transaction ledger and synchronization watermark.
- Match a posted deposit to ERA payment identity, amount, currency and payee/TIN/NPI mapping using a trustworthy trace when available. Amount/date alone is insufficient. Standard transaction descriptions may omit ACH addenda/trace data; require manual review in that case. Handle one deposit covering multiple remittances without allocating the same dollars twice.
- Keep ERA posting, bank settlement and claim balances as separate records. Receiving a bank transaction must never create a second patient payment or mark all claims paid. An account's connected status must never mark every payer's EFT as verified.
- For TISI/CCHA, preserve the existing direct-deposit setup. Bank-feed access does not require replacing EnrollSafe instructions or re-enrolling EFT.

Pending owner information: what was added, Chase account ownership/shared-versus-separate structure, actual Claim.MD plan, and monthly client/visit/card volumes. No live bank feed, recurring eligibility checks or new service fees were activated by this change.
