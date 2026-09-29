# SchoolCareBridge contracts, programs and billing

## Delivered surfaces

- Public program catalog: `/schoolcarebridge/programs` and embedded in Resources.
- Authenticated program operations: `/schoolcarebridge/app/operations`.
- Entry from partner workspaces, SchoolCareBridge administration and Platform Billing.
- Printable unsigned proposals in `contracts/`: platform/development agreement, BAA, and presenter/booking agreement, each as HTML and PDF. The app downloads the current saved commercial revision; the committed PDFs are the initial proposal, not a signed agreement.

The future SchoolCareBridge domain uses `/programs` and `/app/operations`. Existing intake registration URLs remain intact under the public-domain history adapter.

## Proposed commercial schedule

These numbers were proposed at the user's request; they are not executed pricing or a representation of fair market value.

| Item | Proposal |
|---|---|
| Standard school portal | $25 / month / school-agency affiliation |
| Standard provider slot | $10 / month / participating agency |
| Standard admin slot | $5 / month / participating agency |
| Platform share, March 31, 2027–March 30, 2028 | 50% of standard usage value |
| Platform share thereafter | 25% of standard usage value |
| Workshop delivery fee | 70% presenter; 20% MH4Kidz; 10% Plot Twist Co |
| Approved travel at cost | Paid to presenter; excluded from percentage base |
| Default invoice terms | Net 30 |

For one school, three providers and one administrator: standard monthly value is $60; MH4Kidz owes $30 during development and $15 thereafter, even if its customer charge is $0. Daily usage is prorated over calendar days; launch on March 31 incurs one day of March usage. No charges are created merely by migration, publication or preview.

The ITSCO complimentary agreement through March 31, 2027 is separate from MH4Kidz's platform obligation. This release does not rewrite that agreement or move existing ITSCO charges. Standalone partner tenants remain excluded from the legacy agency subscription job. New SchoolCareBridge platform invoices name MH4Kidz as debtor.

## Audit of existing programming

The audit examined `learning_program_classes`, `company_events`, active `intake_links`, Skill Builders public enrollment/event services, public intake enrollment, family-ledger event orders, Stripe/Connect processing, and Finance Operations.

Existing classes belong to an organization, not directly to an agency. Publication resolves active organization affiliations to MH4Kidz or an active SchoolCareBridge partner. Existing summer-style registration is retained through the eligible class/event intake link. The catalog checks current activity, enrollment windows and event registration state before exposing that link. Existing registration forms, participant records and payer rules remain authoritative. Per-participant cash balances use the existing family-ledger review/payment workflow; the new school booking invoice is a separate purchaser obligation and must not duplicate a participant charge.

Missing operational pieces were added as a focused workspace:

- Four labels: MH4Kidz Original, Community Partner, SchoolCareBridge Managed, MH4Kidz Sponsored. Owner, presenter, sponsor and funding mode are separate fields.
- Editable draft/public catalog, audiences, regions, delivery mode, travel inquiries, duration, capacity, presenter account and description.
- School-authorized requests with timezone/offset, attendance, language and arrangements, without collecting student health details.
- Revision-bound quotes, expiry, cancellation/refund terms, travel cap, presenter payment terms, cash contribution and requested subsidy.
- School acceptance; presenter availability attestation plus overlapping confirmed-booking checks. External calendar availability must still be checked by the coordinator.
- Finance-program links and idempotent presenter/platform expense drafts. Existing allocation, grant restriction, supporting-document, independent approval and available-funds checks apply in Finance Operations.
- Subsidized booking confirmation requires approved/scheduled/paid presenter and platform costs. A funding request is not a grant award or a disbursement.
- School invoices on confirmation, actual-delivery reporting, and the separate MH4Kidz platform fee invoice after completion.
- Processor-verified receipts, merchant/amount/currency matching, repeat-safe payment initiation, webhook replay handling, void/refund actions and retained audit history.

Presenter payouts remain explicit finance expenses. Paying a booking’s platform invoice requires its linked finance expense to be approved; verified payment settles that expense and retains its history. If the expense changes during processing, the payment is retained and an audit review entry is created. Cash receipts, processor costs and any subsequent refund adjustment must also be reconciled in the financial workspace; the invoice receipt is not a bank reconciliation. The new checkout collects school payments into MH4Kidz's configured Stripe connected account; it does not automatically transfer funds to presenters or take a hidden second platform application fee. Presenter payment must be completed and recorded through the existing finance payment workflow. Processor costs, tax treatment and any eligible grant indirect-cost allocation must be commercially reviewed, rather than fabricated from a percentage.

## Before signing / commercial activation

1. Confirm each party's full legal name/address, notice contacts, governing state, effective date, MH4Kidz's HIPAA role, and upstream covered entities/data scope. Counsel should review the drafts and any upstream BAA chain. The contract does not turn FERPA education records into PHI or grant new access rights.
2. Review the proposed rates and document independent MH4Kidz approval and any conflicts. The platform fee compensates actual services, not clinical referrals or an unrestricted cut of all grant revenue.
3. Print/sign both agreements. Enable MH4Kidz Finance Operations if needed, upload the executed platform contract and BAA as separate PDF contract documents, then record execution against the exact reviewed revision. Unsigned terms stay editable; recorded executed terms are locked.
4. Configure MH4Kidz's Stripe connected merchant account for program collections and confirm the platform merchant is Plot Twist Co. Test in Stripe test mode before real collection. Existing platform and Connect webhook endpoints must receive `payment_intent.succeeded`, `refund.created` and `refund.updated`.
5. Add actual programs, presenter details, approved finance programs, funds/grants/budgets/allocations and registration sources. Nothing illustrative is seeded or published.
6. Ensure MH4Kidz has an active authorized administrator and finance approvers. Program administrators are platform superadmins or active MH4Kidz agency admins. A partner logo, agency affiliation, or school slug does not grant program-management access.

## Usage metering and invoicing

Migration `1506_schoolcarebridge_program_commerce.sql` is additive and repeatable. Apply after 1504 and 1505.

Schedule an authenticated POST once daily before rollout:

`/api/billing/schoolcarebridge-usage-snapshot`

Use the existing `x-billing-job-secret` / `BILLING_JOB_SECRET` mechanism. Keep secrets in the deployment's secret store; do not place them in documentation or logs. This endpoint records usage facts only. It does not invoice or collect. A manual capture button is also available to platform administrators. The first complete snapshot for a UTC date is retained; repeats reuse it. The zero-partner completion marker distinguishes an empty day from a missed collection.

The Usage tab previews a completed service month. It refuses invoice issuance for unexecuted terms, incomplete daily evidence, a current/future month or a zero balance. A unique billing key prevents a duplicate monthly invoice. Missing historical days must be reconciled from real historical evidence; current membership is never substituted silently. Invoice generation is a reviewed admin action in this release, not automatic collection.

## Validation

- Targeted backend suite: `node frontend/node_modules/vitest/vitest.mjs run --config backend/vitest.schoolcarebridge.config.js`.
- Synthetic MySQL workflow: `node backend/scripts/verifySchoolCareBridgeCommerce.mjs /tmp/scb-commerce-schema.sql`, against a disposable local server on 127.0.0.1:33479. Schema-only fixture includes the existing agencies, users/memberships, school assignments, billing accounts, registration sources and finance tables. The test creates/drops only `scb_test_commerce_20260928` and its fixture user. Stripe methods are stubbed; no real payments.
- Browser: `frontend/scripts/verify-schoolcarebridge-commerce.mjs`, with Vite at port 5179 and `VITE_API_URL=/api`. Uses synthetic responses, checks public catalog, school request, admin editor, contract rates, mobile widths, future host and school restrictions.
- Production frontend build and existing SchoolCareBridge/routing regressions.

The local machine ran out of disk space during Docker-based validation. Only this task's generated build output and failed temporary database were removed. Tests then ran on a separate temporary MySQL server. Existing databases and root-workspace source changes were not modified.

## Rollback

Do not delete paid invoices, receipts, contracts, usage evidence or audit rows. Unpublish affected offerings, disable commercial activity operationally, and roll back the application deployment while retaining the additive tables. Reconcile any processor transaction created during an interrupted request before retrying or voiding it. Refunds are explicit actions, never an effect of deployment rollback.

## Drafting references

The BAA structure follows the required safeguards, reporting, individual-rights support, subcontractor and termination subjects in [HHS Business Associate Contracts](https://www.hhs.gov/hipaa/for-professionals/covered-entities/sample-business-associate-agreement-provisions/index.html). Compensation review addresses the nonprofit's potential related-party concerns described in [IRS excess benefit transactions guidance](https://www.irs.gov/charities-non-profits/charitable-organizations/intermediate-sanctions-excess-benefit-transactions). These sources do not approve the proposed prices or replace review of the parties' actual facts and governing law.

## Release verification, September 28, 2026

Migration 1506 was applied successfully. The configured database was checked afterward: zero executed agreements, zero published offerings, zero invoices and zero payments. Backend targeted tests: 58 passed. Frontend targeted tests: 53 passed. Synthetic MySQL and browser flows passed, including the signed-out school’s return to its selected booking after email identification, school-branded login, and the general operations sign-in destination on expiry. The production frontend build passed; the existing partner/portal browser regression and live public-page smoke checks passed.

Daily metering scheduling is still pending Google Cloud reauthentication. The configured user account required interactive login; the available deployment service account lacked scheduler permissions. No IAM changes or alternate privileged credentials were used. The endpoint and manual capture are ready, but scheduled collection must be configured before rollout.
