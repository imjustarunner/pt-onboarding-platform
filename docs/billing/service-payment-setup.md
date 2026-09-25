# Service prices, client authorization and company Stripe setup

The billing desk contains **Payment setup** and **Services & authorizations**. Access requires organization billing permission or an authorized administrator. Merchant onboarding and merchant dashboard access require an administrator; providers cannot retrieve Stripe merchant status.

## Workflow

1. An administrator selects the organization, opens Payment setup, and completes Stripe Connect. Stripe collects the legal business details, owners, statement descriptor and that organization's payout bank account. A shared Chase login does not mean shared agency accounts. Bank transaction feeds require separate Financial Connections consent.
2. Billing sets explicit self-pay service rates. Missing or blank prices remain unavailable; they are never treated as zero or inferred from missing insurance. Prices are versioned with change reasons. TISI's requested prices are 90837 at $110 per visit and 90834 at $75 per unit; two matching units total $150. These prices do not determine permissible insurance claim units.
3. Billing selects a client, their linked adult client/guardian account, service, verified copay or agreed self-pay, effective dates and supporting evidence. Self-pay uses the server's current rate and rejects a stale browser revision. Copays require recorded primary commercial coverage and no secondary coverage or Medicaid protection.
4. Creating the authorization assigns a secure dashboard task and prepares an invitation draft. Billing reviews and sends the existing branded notification from Collections. The recipient signs in, reviews the immutable price snapshot, signs the terms and, if requested, adds their own card through Stripe. No payment or automatic-payment consent is created by signing. A changed insurance fingerprint requires a new task before signing or posting.
5. Billing marks readiness only after verifying coverage or explicit self-pay. From Services & authorizations, select the completed signed task and a matching completed visit. The date, code and per-unit quantity must match. Self-pay is assigned to the signing payer; copays use the claim's existing payer-allocation workflow. A generic authorization task without service terms cannot post a service balance through this flow.
6. The balance appears in the client/guardian Billing dashboard with its explanation, date, prior payments and amount due. Existing Stripe payment, authentication recovery, cash reconciliation and printable-receipt workflows apply. Self-pay receipts include the signed service code and unit/visit price. Held or unverified balances are not presented as payable.

## Integrity boundaries

- Rates never change previously signed terms. Use a new authorization for a different price/date/quantity. Prior agreements remain in the task history.
- A clinical self-pay balance uses the clinical visit as its unique source. Concurrent posting and retries reuse that balance. A different amount requires the existing audited adjustment workflow.
- Self-pay posting and original claim submission lock the clinical session. An active insurance claim prevents self-pay posting/collection; an existing non-void self-pay balance prevents original insurance submission. Billing must reconcile switching between these routes. Clinical edits that change the service code or unit quantity hold collection.
- Secondary coverage, changed coverage, Medicaid protection, disputed balances and uncertain payments retain the existing collection holds. The flow does not submit claims, automatically charge cards or override payer rules.
- Automatic copays remain separately governed by agency deployment flags, client readiness and the payer's current signed recurring authorization. Self-pay posting is manual; no new self-pay scheduler was introduced.
- Stripe processing still requires live platform configuration, agency onboarding and working webhook delivery. UI/test success is not a live processor acceptance test.

## Rollout and verification

Apply main migration `1497_patient_service_rates.sql` before deploying. No clinical schema migration is needed. Do not populate prices for other organizations from TISI's values.

Frontend tests: `ServiceBillingSetup.test.js`, `FamilyWorkflows.test.js`, `FamilyLedgerPanel.test.js`, `FamilyBillingDesk.test.js`.

The real SQL suite is `backend/src/services/__tests__/patientServiceBilling.mysql.test.js`. It only runs with `PATIENT_SERVICE_MYSQL_TEST=1` and refuses anything except both database connections pointing to `127.0.0.1:33316/patient_service_test`, user `patient_service_test`. Use a disposable database and synthetic encryption key. Load the family billing fixture with its fixture database/user name replaced by `patient_service_test`, then migrations 613, 665, 1413, clinical 014, 1414, the family ledger workflows fixture, 1485, 1486 and 1497. Add the fixture-only clinical service-code/unit and claim-chain columns from `backend/fixtures/patient-service-billing.sql`. It tests SQL concurrency, tenant/payer isolation, immutable signed rates, visit matching, repeat copays, coverage changes, Medicaid protection and the self-pay/insurance exclusion checks without any gateway call.
