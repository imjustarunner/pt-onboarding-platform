# Monthly accountability

The restricted workspace is available in **Dashboard → Submit** and **My Payroll** only for the three verified work accounts: Michael Mendez (501), Rachel Finch (507), and Melissa Mendez (538). Existing payroll management or super-admin privileges are also required to configure permissions. Other managers, super admins, and duplicate personal accounts cannot open this workspace. API authorization checks the selected organization, approved participant, and signed-in actor on every report and receipt request. A verified superadmin can prepare the other approved participants’ drafts, manage receipts, and print them; only the participant can sign their own report.

## Rollout and setup

1. Apply `database/migrations/1507_accountability.sql` using the normal migration process, then deploy the backend and frontend. No existing financial tables or payroll claims are changed.
2. In the ITSCO organization, open Monthly accountability → Permissions & parameters. Select and explicitly enable the verified accounts for Rachel Finch, Michael Mendez, and Melissa Mendez.
3. In PlotTwistCO, separately enable Melissa Mendez's account. Grants, parameters, and monthly reports are organization-specific. Names do not authorize accounts. Server-side account/company restrictions cannot be bypassed by creating an ordinary grant. ITSCO (2) permits all three work accounts; PlotTwistCo (1) permits only Melissa as a report participant. An eligible manager among the three can administer either company.
4. Set each approved office address, plan wording, category allocation percentages, mileage rate, and certification. The initial recipient is **melissa@plottwistco.com**. Initial categories include mortgage interest, property taxes, homeowners insurance, utilities, phone, internet, and office supplies. Administrators can add categories and retain full-precision percentages. Existing plans have an Add property tax / homeowners insurance lines button; it reuses a configured housing percentage when available and otherwise starts at zero for review. Rates and plan wording require configuration; no tax rate or eligibility determination is supplied by the application.
5. Configure the organization's existing email sender/settings. The email template identifier used for sender resolution is `accountability_report`.

No accounts are automatically granted access by the migration. Private personal plan documents and setup data stay out of the repository. In Permissions & parameters, a verified superadmin can load an approved JSON setup file, review each plan, and save all of them in one transaction. The file uses `{ "plans": [{ "agencyId": 2, "userId": 501, "enabled": true, "settings": { ... } }] }`; settings follow the existing parameter schema. Review the mileage rate for the intended month and any still-unconfirmed allocations before submission. Signed snapshots remain unchanged by setup imports.

## Monthly use

Use **Person / company** to choose Michael–ITSCO, Melissa–ITSCO, or Melissa–PlotTwistCO in the same workspace; Rachel–ITSCO remains available to authorized superadmins as well. There is no need to change the dashboard organization. Ordinary participants see only their own company plans. The selected month stays selected when switching plans, but each plan has its own report, receipts, history, and percentages. Save or discard edits before switching.

Choose a month and open its draft. The monthly totals table displays every configured category, including property taxes and homeowners insurance. Enter the full bill amount to calculate its allocated reimbursement immediately; each line rounds to cents and then contributes to the total. When a category contains multiple bills, the total is read-only and the underlying entries remain editable under Receipts & details, preserving their records. Clearing an untouched summary line removes it instead of leaving a blank claim. Dates, vendors, and supporting records are completed under Receipts & details before signing. Edit expenses and mileage in spreadsheet-style rows, using Tab to move between cells. Add expenses, dates, vendors, amounts, and receipts by category. Add personal-vehicle business trips, or paste a CSV/tab-separated tracker with headers `Date, From, To, Purpose, Miles, Notes`. Dates may be `YYYY-MM-DD` or `M/D/YYYY`. Review imported rows before adding them. Exact matching date/from/to/purpose/miles entries are skipped during import; distinct trips can be entered manually. Imports do not post to payroll or copy existing reimbursed claims.

Use **Save monthly draft** to persist entries throughout the month. Saving is explicit. Partially completed rows can be saved and printed; required dates, amounts, business purposes, and receipts are enforced only on final submission. Invalid nonblank dates or negative amounts are rejected even in drafts. Uploading a receipt first saves the draft, then stores the receipt. Reports have version checks to prevent one browser from silently overwriting another browser's saved edits.

Preview or download the draft PDF. The PDF viewer supports printing. Printing or downloading never signs, submits, emails, or locks the draft: edit and reprint as often as needed. Blank amounts print as blanks, and the PDF is labeled as a working copy. Accept the configured certification, capture a signature, then choose **Submit signed report & email**. The server validates every entry and expense receipt, freezes the current parameters, generates a PDF with the signature and appended receipts, and locks the report. The exact stored signed PDF is used for printing, downloading, and email delivery.

Receipts accept PDF (unencrypted, maximum 20 pages), PNG, and JPEG; maximum 8 MB per file, 30 files and 12 MB source files per report. Final emailed PDF is capped at 15 MB. Files use private `accountability/` storage keys, served only through authorized API endpoints, not the general `/uploads` handler.

Delivery is tracked independently of signing. `sent` means the mail provider accepted the message, not proof the recipient opened it. Definite pre-send or policy failures may be retried using the same signed PDF. Concurrent/repeated sends are guarded. Queued, redirected, unknown, and interrupted `sending` statuses are not silently reported as sent and do not automatically resend. Operations must inspect existing email logs for these states before any manual recovery, to avoid duplicate delivery. Signed reports cannot be edited or deleted through this workflow.

## Verification

```sh
node --test backend/src/utils/__tests__/accountability.test.js
./frontend/node_modules/.bin/vitest run --config backend/vitest.accountability.config.js
cd frontend
npm test -- src/utils/__tests__/accountabilityMileage.test.js src/components/dashboard/__tests__/AccountabilityWorkspace.test.js
./node_modules/.bin/vite build
```

Tests use mocked email/storage/database boundaries; no live email is sent. Deployment, applying the migration, account grants, and a configured-environment delivery check remain separate rollout steps.
