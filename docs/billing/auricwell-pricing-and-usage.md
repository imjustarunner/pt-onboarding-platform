# AuricWell pricing and usage review

Implemented October 14, 2026. Rates and calculation rules originate in `backend/src/constants/auricwellPricing.js`. Run `node scripts/plans/sync-auricwell-pricing.mjs` after a versioned rate change; `--check` verifies the frontend copy, commercial schedule and public agreement review copies. Prices are USD. Support/billing staff are included; Basic/Premium/Premium Plus interns are $20/$30/$40, qualifying only for required note signing/cosigning **and** billing under another clinician's license. An independently billing supervisor uses the provider rate.

## Where to use it

- Billing workspace → Settings: AuricWell plan and usage estimate, allowance thresholds, optional vendor-cost comparison, and per-practice billing-category review.
- Pricing review loads only when opened. It lists active affiliated employees, excludes demos/inactive/archived accounts, requires an explicit category for everyone, validates signing clinicians, and stores immutable revisions with the reviewing actor. Editing categories never changes app permissions.
- Migration **1624_auricwell_pricing_drafts** adds the review history. Saved drafts do not activate a subscription, issue invoices, collect payment, change negotiated prices or sign a contract.
- AuricWell product website and in-app plan comparison show the same rates and units. Printable agreement/BAA templates and the generated commercial schedule are available under `/auricwell/legal/`.

## Vendor research and budgeting

Sources checked October 14, 2026:

- [Vonage video pricing](https://www.vonage.com/communications-apis/video/pricing/): standard video is $0.00410 per participant-minute. Two participants for an hour cost $0.492 before other features. Recording, archiving, captions, transcription and connectors have additional rates. Trial credits are excluded from ongoing economics. Vonage lists its HIPAA/BAA offering as contact-sales pricing; verify the required account arrangement and add any related fees before relying on these margins.
- [Vonage SMS pricing](https://www.vonage.com/communications-apis/sms/pricing/) directs users to account pricing; rates vary by destination and number type. [Carrier fees](https://api.support.vonage.com/hc/en-us/articles/5672262029084-SMS-MMS-Verizon-Pass-through-Fees) and [10DLC charges](https://api.support.vonage.com/hc/en-us/articles/360058158511-10-DLC-Pricing-and-Fees) are separate factors. SMS budget **$0.02 per segment** in the calculator is an editable conservative planning assumption, **not a verified account quote**. [Vonage's API logging guidance](https://api.support.vonage.com/hc/en-us/articles/15152113905052-Price-of-a-multi-segment-SMS-Text-Message-is-different-on-the-SMS-API-logs-verses-the-Messages-API-logs) distinguishes segment-level SMS logs from combined Messages API costs. Avoid charging a combined report and its constituent segments twice.
- [Claim.MD pricing](https://www.claim.md/pricing): Basic $30/month with $0.30 each for claims, ERA claim responses and eligibility; Small Volume $60 with 100 of each and $0.50 overages; Unlimited $120 with unlimited claims/ERAs and 1,000 eligibility checks, then $0.02 Prime / $0.10 non-Prime checks. Additional tax IDs on Unlimited have tiered fees. Public prices are not an enterprise reseller quote. The calculator lets the operator select the actual account plan and add tax-ID/vendor fees.

Overages in this rate card are $0.012/video participant-minute, $0.03/US SMS segment and $0.60 each for claims, ERA claim responses and eligibility checks. The clearinghouse overage covers the highest ordinary published transaction rate above. Included quantities are deliberately modest at the base and grow with clinical seats. They are commercial rates selected for AuricWell, not representations of vendor rates. Supported payers are available at every tier after enrollment; payer count is not a price multiplier.

## Cost review and metering boundaries

The new calculator shows subscription, allowances, expected overages, vendor-cost bounds and contribution before hosting/support/other costs. The existing Claim.MD planner below it provides detailed payer/eligibility-frequency scenarios. Review at expected usage and at full allowance consumption, particularly for practices with only an included administrator.

Existing operational usage is not yet a complete invoice-grade source for these new pools: video attendance rollups do not prove all guest connections, and SMS message counts are not verified segment counts. Do not turn a forecast into automatic billing. Before activating a new contract, reconcile:

1. Video provider connection usage (including guests and duplicate device connections), separately from recordings/transcription.
2. SMS segments and actual costs from the configured account, combining client texts and SMS notifications once; account for inbound traffic and carrier fees.
3. Clearinghouse-acknowledged claim transmissions, ERA CLP responses and eligibility results, with stable vendor/source references and practice/tax-ID allocation. Deduplicate retries. Reconcile shared accounts before allocating costs to practices.
4. The monthly staff roster and signed pricing terms; preserve historical statements and invoice snapshots.

Use the dated commercial schedule and a completed order form before activation. No customer or vendor account was changed by this implementation. A separate implementation of reconciled vendor report ingestion and invoice allowance deduction is required before automatic billing under this rate card; existing billing remains in place.

## Agreements

[Service agreement](../legal/auricwell/PLATFORM_SERVICE_AGREEMENT.md), [BAA](../legal/auricwell/BUSINESS_ASSOCIATE_AGREEMENT.md), and [commercial schedule](../legal/auricwell/COMMERCIAL_SCHEDULE.md) are review templates. The existing direct ITSCO/AuricWell BAA draft has the same expanded service scope. Signed agreements are never overwritten. Privacy obligations apply to every tier; a pricing limit does not reduce them. Vendor names do not prove executed downstream BAAs. The BAA scope follows [HHS business associate contract requirements](https://www.hhs.gov/hipaa/for-professionals/covered-entities/sample-business-associate-agreement-provisions/index.html).
