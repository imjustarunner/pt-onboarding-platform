# PlotTwistCo business journey

PlotTwistCo is the management and facilitation company. PlotTwistHQ is the digital platform supporting its organizational interventions and the company's daily operations.

## One settings home

Open **Settings** with a company selected. Its primary areas are **Business journey**, **Agreement & pricing**, **Business details**, **Booking & service types**, **Features**, **Team & roles**, and **Billing**. Settings search includes terms such as interview, training, contract, revenue share, company profile, and exit.

Old `company-profile` links lead to the settings home. Bookmarks to its individual sections lead to Business details, Features, or Payroll. The duplicate company setup overview is removed. Organization feature preferences and billable feature selections are available together in Features.

## Step by step

| Step | Work to complete | Owner / evidence |
| --- | --- | --- |
| 1. Interview & discovery | Interview the owner, identify current systems and challenges, select the support needed, and define success. | PlotTwistCo lead and business owner; discovery notes and agreed outcomes. |
| 2. Agreement & pricing | Agree scope, responsibilities, revenue definition, service charges, review cadence, and exit terms. Record the signed agreement reference and effective month. | PlotTwistCo administrator records signed commercial terms. |
| 3. Organization setup | Confirm business details and brand, services and booking, app features, team access, and billing readiness. | Implementation owner uses the linked settings. |
| 4. Onboard & train | Prepare onboarding packages, practice daily workflows, and confirm training and support readiness. | Training lead and each role owner. |
| 5. Launch | Walk through service delivery and billing, record baseline measures, and confirm owner/management approval. | Business owner and PlotTwistCo lead. |
| 6. Facilitate & manage | Establish management meetings and action owners, review outcomes and interventions, and reconcile monthly revenue and invoices. | PlotTwistCo lead; ongoing operation continues until exit is explicitly started. |
| 7. Transition & exit | Agree the final service month, deliver exports and procedures, complete final training, settle invoices, transfer access, and confirm handoff acceptance. | Transition owner and business owner. |

Each stage stores a responsible person, target date, notes/evidence, and task confirmations. Checklists record human confirmation; they do not themselves create staff accounts, complete training, sign contracts, export records, or revoke access. The linked existing tools perform those actions.

For public business enquiries, open **Platform settings → New company requests → Interview, agreement & onboarding plan**. Complete the interview and agreement checklist and record signed pricing before creating the owner's invitation. On activation, the same engagement is attached to the new company; the owner starts in Business journey. Existing companies can begin directly in Settings.

## Billing agreement

The default selected by the product owner is:

`monthly recurring charge = max(PlotTwistHQ app and usage charges + selected recurring PlotTwistCo services, contracted percentage × confirmed monthly revenue)`

Add one-time services only in their specified month. The revenue percentage is configurable per agreement; 10% is a draft starting value, not an activated price. Amounts are stored as integer USD cents and the percentage as basis points (1,000 basis points = 10%). Contracted management services use calendar months without automatic partial-month proration; existing app feature proration remains in the app's billing engine.

Example: $500 of app charges plus $300 of management services sets an $800 monthly minimum. At 10%, $5,000 of revenue results in $800; $8,000 results in $800; $12,000 results in $1,200. A $200 one-time setup service adds $200 only in its scheduled month. The monthly break-even revenue changes with app usage and selected services.

An agreement explicitly defines what revenue means and records a signed date and agreement reference. Draft terms never change billing. Advanced per-company options also support an explicit revenue threshold, additive pricing, or à-la-carte-only pricing where the signed agreement calls for it.

Platform administrators confirm revenue and its reconciliation source for every percentage-based billing month, including zero-revenue months. Missing confirmation blocks invoice creation. Company administrators can review commercial terms and update journey tasks, but cannot change prices or revenue confirmations.

Saved invoices snapshot the terms, revenue, and final charge lines. Those charge lines drive the billing screen, PDF, and QuickBooks invoice. Past invoiced financial inputs cannot be rewritten. Add an effective future agreement version for changed terms. A final service month can be recorded without rewriting earlier invoice amounts; invoice generation pauses after that month. This does not remove company access or settle unpaid invoices automatically.

The ordinary billing rollout, merchant setup, payment methods, invoice delivery, and collection controls remain in Billing. A management agreement does not connect a payment provider. Pre-workspace enquiries can record prices; invoice and payment actions become available in the activated company's billing account.

## Persistence and release

- Apply `database/migrations/1453_business_lifecycle.sql` before starting the updated backend. It creates engagement and revision-history tables without modifying existing company records or invoices.
- API: authenticated `GET/PUT /api/business-lifecycle/companies/:agencyId`; platform-only `GET/PUT /api/business-lifecycle/requests/:requestId`.
- Access requires company administrator membership in the exact company, or platform administrator status. Schools and other affiliated organizations use the parent company's journey.
- Writes use a revision number and a transaction. Concurrent stale saves return a conflict with the user's edits retained in the UI. Invoice creation takes the same company lock, checks its financial snapshot, and rechecks for an existing invoice before insertion.
- Enquiry-to-company transfer is part of the existing atomic activation transaction.
- Business notes are administrative records, not clinical notes. Keep clinical/client information in its dedicated workspace.

This change is local until the migration and updated application are deployed. Review each company's actual contract, service prices, selected app features, billing readiness, and revenue source before activating its terms.

## Verification

Backend policy tests cover the approved formula, custom percentages, break-even, one-time charges, the advanced methods, missing revenue, final service month, feature line reconciliation, and administrator access.

Disposable MySQL tests cover repeatable migration application, persistence and isolation, concurrent saves, audit rollback, immutable invoiced terms, future amendments, invoice locks, and complete business intake/activation transfer. Tests create and drop their own databases and use an explicit `PTCO_TEST_MYSQL_PORT` on localhost.

Frontend tests cover legacy destination redirects, search terms, progress persistence, scoped settings links, save conflicts, explicit exit planning, restricted financial editing, and stale responses after company switching.
