# Finance Operations

Finance Operations manages program funding, spending requests, supporting evidence, approvals and external-payment reconciliation. QuickBooks remains the accounting system. It is separate from medical claims, patient balances and clinical supervision.

## Entry points and access

- `/finance-operations`: authorized organization portfolio and radial operations hub.
- `/mh4kidz/finance-operations`: MH4Kidz, managed by PlotTwistCo.
- `/rocky-mountain-mentors-demo/finance-operations`: fictional nonprofit demonstration.
- Navigation appears for platform admins and users with server-derived finance access. APIs independently verify active organization membership and delegation on every request.
- An enabled self-managed organization’s admins manage finance. A sponsored organization’s admins receive the program portal. Its designated managing organization’s admins and delegated finance managers oversee it.
- Explicit organization roles: manager, requester, viewer. Clinical/provider/billing roles alone confer no finance access. Delegation requires current membership. Managers cannot remove their own access through this screen.
- Sponsored portal: programs/budgets, expenses, recorded payments, shared documents, operational reports, support and reporting requests. Bank data, internal documents, fund structures, payment references and finance audit details stay manager-only.
- A manager’s preview toggle simulates portal navigation. Actual restricted users receive a server-projected response; hiding controls is not the access control.

## Workflow

1. Create programs and financial partners. Create restricted, unrestricted or reserve funds.
2. Record funds actually received with a unique reference. Awarded grants and cash received are separate.
3. Record grants, restrictions, award periods and report deadlines. Allocate budgets to programs, then assign allocations within those budgets.
4. Add program activities: mentor trainings, gatherings, mentoring cohorts, trips, scholarship experiences. Expense records can link activities, programs, staff, vendors and funding allocations.
5. Create an expense/reimbursement/scholarship draft. Attach a receipt, invoice or award document. Submit for review.
6. A different finance manager reviews restrictions and approves. Exact funding splits, permitted budget dates, available allocation and received funding are checked in an agency-serialized transaction. Approval reserves capacity.
7. Schedule payment; after payment occurs externally, record the payment reference/date and optional QuickBooks reference. These actions do not transfer funds. A reference can be recorded only once per organization. Paid records cannot be paid again or silently rewritten.
8. Match imported posted bank debits to already-recorded paid expenses with the exact amount and explicit confirmation of payee/reference. Bank imports do not create expenses or increase spending totals.

Draft/needs-information expense amendments require a reason and clear funding assignments for fresh review. Paid history is preserved. Budget/allocation amendments require a reason and concurrency check; paid or committed funding cannot be removed. Return to the accounting system for external payment reversals; this release does not execute refunds or mutate paid expenses.

## Documents and reports

Private, authenticated uploads accept PDF, PNG, JPEG, TXT or CSV up to 5 MB. Contents are encrypted using the existing family billing AES-GCM key, with tenant/document-specific authenticated context, and retained as immutable versions/records. Shared versus finance-team-only visibility is enforced on listing and download. No public download URLs are generated.

Operational CSVs: expenses, program budget vs. paid/committed/available, and manager-only grant utilization. Values cover all recorded periods; accounting statements and fiscal-period close remain in QuickBooks. CSV cells neutralize spreadsheet formula prefixes. Reporting/support requests accept responses and linked documents. Reports are not automatically emailed.

## Bank setup

1. Complete Stripe Financial Connections registration for the platform, configure its existing Stripe secret/publishable keys, and enable `BANK_FEEDS_ENABLED=true` in the backend deployment when ready. Use the existing scheduled bank-feed worker; it already dispatches by purpose.
2. A manager enables broader transaction consent in this organization’s Finance Operations Settings.
3. The bank account owner authorizes an account through Stripe’s hosted bank connection screen. Bank credentials are never entered into this app. Select the agency’s own account; live permissions and ownership are verified server-side.
4. The finance feed retains encrypted transaction descriptions/evidence for expense reconciliation. Medical billing’s separate `payer_deposit` feed continues to retain only verification evidence relevant to requested ERA deposits. Existing payer-feed accounts are not silently converted to broader access.
5. Imports follow available Stripe refreshes. Missing/pending/unverifiable transactions remain manual. Changed/voided matched evidence becomes “Needs review”; it never silently reverses a paid expense.
6. Disabling organization consent pauses imports. Disconnect revokes the corresponding Stripe connection. Pausing alone does not revoke Stripe authorization.

Live connection and retrieval require provider registration, configured deployment and owner authorization. Automated outbound ACH, card issuance, vendor onboarding, QuickBooks API synchronization, bank-to-fund deposit classification, scheduled financial report delivery and formal accounting statements are not implemented here. Manual payment recording and CSV handoff are available.

## Rollout and demo

Migration `1495_finance_operations.sql` depends on `1490_bank_transaction_feeds.sql`. It adds independent finance tables and a purpose discriminator to existing bank sessions/accounts. No existing clinical or billing records are converted.

`node backend/src/scripts/setupFinanceOperations.js` previews the intended existing organizations. `--apply` enables PlotTwistCo/MH4Kidz and idempotently creates the separate demo. It requires the configured encryption key and existing PlotTwistCo/MH4Kidz slugs. Platform admins can enable future organizations through the workspace setup form; enable a managing organization before assigning sponsored organizations.

The demo has three fictional grants ($120,000, $90,000, $65,000; $275,000 total), $220,000 in fictional receipts, four programs, twelve financial program activities, forty expenses, forty-four evidence documents, reporting requests and twelve simulated bank entries. Eight entries demonstrate completed matches. All amounts, partners, grants, receipts and payments are fictional. No real users or children are created, no calendar invitations/messages are sent, and no bank connections or transfers occur. The demo makes no representation that Rocky Mountain Mentors is legally a nonprofit. Live portfolio totals exclude demo organizations.

Initial configured database: `onboarding_stage`. PlotTwistCo agency 1 manages MH4Kidz 434 and the demo 437. Bank imports remain off. These are database setup records; UI availability also requires the main-branch deployment.

## Verification

- `NODE_ENV=test SKIP_DB_CONNECT=1 node --test src/services/finance/__tests__/reports.test.js` (backend).
- `NODE_ENV=test SKIP_DB_CONNECT=1 ../frontend/node_modules/.bin/vitest run src/services/__tests__/bankFeed.test.js` (backend).
- `npm test -- src/components/finance/__tests__/FinanceOperations.test.js src/views/admin/__tests__/BillingWorkspaceView.test.js` (frontend).
- `npm run build` (frontend; existing large-chunk warnings remain).
- MySQL integration test: `finance/__tests__/finance.mysql.test.js`, opt-in `FINANCE_MYSQL_TEST=1`, guarded to an empty disposable `finance_operations_test` database at 127.0.0.1:33316. It creates synthetic fixture tables and applies migrations 1490/1495, tests tenant separation, sponsor permissions, immutable/private evidence, seed idempotency, concurrent spending limits, approval separation, amendments, duplicate-payment prevention and reconciliation. Never point it at an application database.
- Desktop and 390px mobile browser review used only synthetic fixtures; no page errors or horizontal overflow were observed.
