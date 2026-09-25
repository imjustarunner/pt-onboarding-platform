# Copays and client balances: evaluation and implementation

Reviewed September 24–25, 2026. Scope: the application’s family ledger, older learning-charge checkout, client/guardian portal, Stripe payment and refund posting, claim responsibility, collections, receipts, and billing permissions. No production records, cards, claims, or payer accounts were changed. The reported behavior in the other EHR cannot be diagnosed conclusively without its payment/allocation history.

## The accounting rule

A provider’s charge to insurance is not the client’s debt. Missing insurance is an incomplete setup state, not a self-pay election. Claim acceptance is neither insurer payment nor proof of patient responsibility.

For one verified responsibility record:

`unpaid share = assigned patient responsibility − confirmed payments allocated to that share + confirmed refunds`

The amount currently collectible is zero while setup, coverage, amendments, disputes, refunds, or ledger discrepancies require review. Bank authentication and processing states are not payments. A successful card capture records patient payment; it is separate from the merchant’s eventual Stripe payout and processing fees.

An example: collect a verified $25 visit copay. If the payer later confirms $40 TOTAL responsibility, adjust the original balance to $40, preserve the $25 payment, and review the remaining $15. Do not create a second $40 invoice. If final responsibility is $20, return $5, record the refund, and reduce the original balance to $20. Refunds alone do not cancel a charge. The current implementation holds refunded balances until the associated adjustment is reviewed; it does not automatically collect that reopened amount.

## Findings and changes

| Finding | Consequence | Change |
| --- | --- | --- |
| Insurance review was required only when a member ID existed | Missing coverage could make a full fee collectible | Clinical/unknown services now require explicit billing readiness and a verified amount tied to the current coverage fingerprint |
| Portal totals summed review/held balances | A family could see a cash balance before setup was complete | Separate verified amount due from internal amounts; suppress unverified gross amounts in the API, not just the UI |
| The older Charges tab independently displayed source totals | Duplicate-looking bills and full clinical fees remained possible | Omit charges already in the shared ledger; hide unverified clinical amounts and block legacy clinical checkout |
| Coverage could change after a bill was released | Old verification could authorize a new payment incorrectly | Recheck current coverage at display and collection time; coverage changes invalidate readiness and amount verification |
| “Set up,” saved card, and recurring authorization were not one defined workflow | A saved card could be mistaken for permission to collect | Separate readiness, coverage basis, collection policy, payer assignment, and signed card authorization |
| Automatic payments covered installment plans but not ordinary copays | Verified copays required a different workflow | Add an automatic collector for posted, verified completed-visit copays; manual and after-remittance policies remain available |
| Cached paid totals could theoretically disagree with settlement records | Incorrect due amounts or another collection | Compare allocations against confirmed payments less confirmed refunds; discrepancies block display as debt and collection |
| Lost payment confirmation needed a clear staff action | Staff might initiate another charge | Add “Check Stripe payment,” which retrieves the saved intent and posts a confirmed success without charging again |
| A source charge could be captured through another payment path | The imported balance might remain collectible | Block collection when the source is already captured or another nonfailed payment exists |
| Receipts were generic | Families could not identify the visit or understand their remaining share | Immutable receipt snapshot includes client, agency, visit date when available, responsibility type/basis, assigned share, prior payments, current payment, and remaining amount at payment; confirmed refunds appear separately |
| Provider roles could carry an old billing-access flag | Financial access outside billing staff | Explicitly deny provider/provider-plus staff ledger access; remove provider-plus from older learning-billing management |
| Self accounts were categorically excluded | Adult clients could not take financial responsibility themselves | Adult self-linked accounts with a known DOB can consent and pay; children/unknown ages and restricted links remain blocked |
| Claim amendments and patient collection were separate | A corrected service could still trigger the old copay | Pending claim changes pause collection; resolved changes require fresh verification against the latest change request |

Existing protections retained: integer cents; deterministic split allocation; one responsibility source per claim; encrypted card references/consents/receipts; connected-account and customer binding; server-confirmed payment amount/currency/status; stable attempt keys; row-locked posting; idempotent duplicate webhook handling; separately recorded refunds; and responsible-payer/agency checks. There is no clinical narrative or diagnosis in Stripe payment metadata.

## Billing workflow

1. Billing staff opens **Family billing → Payment setup → Client billing readiness**. Select verified insurance or explicitly agreed self-pay, record verification evidence/terms, and mark setup ready. No card is charged by saving this form.
2. The responsible payer separately accepts financial responsibility, verifies and assigns their own Stripe card, and signs recurring authorization if automatic collection is wanted. Another guardian’s card cannot be substituted.
3. Staff posts the verified patient amount against the completed visit’s existing claim. Benefit verification supports a copay; deductible/coinsurance/final balances require staff-reviewed payer remittance evidence. Nothing is inferred from clearinghouse acceptance.
4. The client sees the verified share and explanation in the portal, can pay with Stripe, and can download/print the receipt after confirmation.
5. Automatic copays require the client’s selected policy, current setup/coverage, current signed recurring authorization and amount limit, an assigned active card for this agency, a completed visit, no conflicting plan/hold, and a reconciled ledger. Automatic collection is limited to copays; it does not silently collect newly increased final balances.
6. Enabling, resuming, or changing automatic billing starts a new eligibility boundary. Historical balances remain for manual review/payment. No bulk historical collection is triggered by completing intake.
7. Later ERA/EOB changes use the existing balance’s audited adjustment and review actions. Original payment receipts retain their original snapshot. Service-code amendments do not create new patient invoices.

The implementation uses verified copay after a completed visit as an available option, not an automatically enabled default. New profiles default to manual collection. The alternative “wait for verified payer remittance” uses explicit staff attestation today; automated ERA interpretation/posting is not yet complete.

## Colorado and processor requirements checked

CCHA’s May 2026 manual prohibits member balance billing for covered services and describes coordination of benefits when commercial insurance is primary. TISI’s CCHA/Medicaid workflow must not become commercial-copay autopay, including when Medicaid is secondary. The application conservatively blocks collection for clinical/unknown services when Medicaid coverage is recorded. See [CCHA provider manual, pages 54–55](https://www.cchacares.com/Dal/ebM).

Saving a card and authorizing later charges are separate steps. Stripe’s documentation describes customer agreement for future merchant-initiated payments, and its webhook guidance explicitly requires handling duplicate deliveries. Our confirmed-payment ledger remains authoritative rather than a browser success screen. See [Stripe future payment consent](https://docs.stripe.com/payments/save-during-payment?locale=en-GB&mobile-ui=payment-element&platform=ios), [Stripe webhook guidance](https://docs.stripe.com/webhooks), and [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests).

The HCPF production policy page failed to load during this review; no conclusions here depend on a broken link or the HCPF test domain. The CCHA PDF linked above was opened and the relevant billing provisions checked.

## Validation and release boundary

Validated with synthetic records in disposable local MySQL 9.5, real SQL transactions, and mocked Stripe calls. This is not a live/test-mode Stripe certification or verification against the deployed production MySQL version.

Coverage includes missing insurance, historical balances, consent absence, card capture, repeated webhook posting, cash-entry concurrency, coverage changes, paused setup, after-remittance policy, receipts/refunds, ledger inconsistencies, Medicaid secondary, tenant isolation, and amendment holds plus re-verification. Existing payment, installment, session, package, and event workflows were exercised. Frontend tests cover held/paid totals, authentication retry keys, tenant changes, and readiness setup. The production frontend build passes with the existing bundle-size warnings.

Deployment needs main migration **1485**, existing family billing migrations **1413–1416**, and clinical **020** plus the earlier claim prerequisites. Existing clinical balances have no coverage fingerprint and therefore require review; do not bulk-mark them verified. Configure the server-side encryption key and agency Stripe Connect settings without exposing secrets in browser code.

The existing scheduler runs every 15 minutes only with `FAMILY_BILLING_AUTOMATION_ENABLED=true` AND the agency’s `familyBillingAutomationEnabled` flag. The client’s collection policy and signed authorization are additional requirements. No flag was enabled in production by this work.

Before enabling live automatic collections:

- Exercise an actual Stripe test-mode connected account and signed webhook delivery: success, decline, bank authentication, duplicate delivery, delayed confirmation, refund, revoked authorization, and mismatched tenant/account.
- Finish ERA matching/posting before claiming end-to-end automatic insurer reconciliation. Post final responsibility through review until then; a denial alone must not become patient debt.
- Reconcile historical payments from the prior EHR by service, payer, amount, date, and external transaction reference. A “paid” label without a matched payment is insufficient. This change does not migrate those records or manufacture receipts for them.
- Add reconciliation for refunds initiated outside this application, disputes/chargebacks, and processor-to-bank payout accounting. The current refund webhook handler reconciles application-originated refunds; it does not automatically import every Stripe dashboard adjustment. Processor exceptions require manual accounting review meanwhile.
- Build verified benefit/rate rules if copay amounts should be generated automatically for every visit. This release automatically COLLECTS posted verified copays; it does not infer a copay from an insurance card or automatically produce responsibility for every encounter.
- Add pagination/aggregate reporting before using the current limited balance list as a complete high-volume receivables report. PDF receipts are financial receipts, not diagnosis-bearing superbills; a separate authorized superbill workflow remains distinct.

## Reproducing the database tests

Use only a disposable `127.0.0.1:33316/family_billing_test` database and the synthetic fixture user, never application data. Load `backend/fixtures/family-billing-security.sql`, migrations 613, 665, 1413, clinical 014 and 020, main 1414–1416, `backend/fixtures/family-ledger-workflows.sql`, then 1485. The workflow fixture includes the current package columns and a minimal clinical-session schema.

Run `familyBilling.mysql.test.js`, `familyLedger.mysql.test.js`, `familyLedger.sources.mysql.test.js`, and `familyCopays.mysql.test.js` sequentially after a fresh fixture load. Set both main and clinical database variables to that same disposable database, `FAMILY_BILLING_MYSQL_TEST=1`, `NODE_ENV=test`, `SKIP_DB_CONNECT=1`, and a synthetic `FAMILY_BILLING_ENCRYPTION_KEY_BASE64`. The tests reject unexpected database identities and mock payment processor calls.
