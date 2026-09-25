# Eligibility, other insurance, and secondary claims

Prepared September 25, 2026. Implementation is local; this document does not certify payer enrollment or a successful live claim. No real eligibility request, claim transmission, or card charge was made during this change.

## TISI setup checklist

Known setup: The Inner Strength Institute (TISI), agency 377, Windchime billing office 8, group NPI **1306688650**, Claim.MD account **31985** (production). The agency reports Medicaid enrollment and CCHA participation effective **September 15, 2024**. That participation date is not proof of EDI, ERA, or eligibility activation.

| Step | Owner | Completion evidence |
| --- | --- | --- |
| Verify the legal billing entity, Windchime address, group NPI, and tax ID in the office profile | Billing administrator | Matches the enrolled entity; enter the tax ID securely in the app |
| Confirm the existing server secret is bound to account 31985 and the correct billing agencies | Platform administrator | Server connection check; no API key in the browser, repository, or screenshots |
| Confirm the **eligibility** payer ID for Colorado Medicaid and for each commercial policy | Biller / Claim.MD | Claim.MD payer directory or support confirmation; do not assume the CCHA claims ID is the Medicaid eligibility ID |
| Enable eligibility for the payer, billing NPI and tax ID; finish any required payer enrollment | Claim.MD account administrator | Eligibility enabled/approved for that combination, followed by a successful authorized response |
| Confirm Colorado Medicaid Provider Web Portal access | Agency portal administrator | Named staff/delegates can verify members and view **Other Insurance**; use individual authorized accounts |
| Verify CCHA claims enrollment and ERA enrollment independently | Biller | Each transaction type has its own confirmed status; API authentication alone is insufficient |
| Save primary and secondary insurance for each client | Biller | Correct payer IDs, member/subscriber identity, relationship, effective dates; mark Medicaid explicitly where applicable |
| Verify every policy for the date of service | Biller | Saved dated Claim.MD response or payer portal/phone reference |
| Check Medicaid Other Insurance and ask the client about additional coverage | Biller / intake team | Investigate employer, spouse/parent, Medicare and other reported plans; verify any discovered carrier directly |
| Resolve payer order and document discrepancies | Biller | Signed-in reviewer saves dated verification; unresolved findings hold submission and collection |
| Exercise one authorized end-to-end production case after deployment | Billing administrator | Correct routing, clearinghouse response, payer acknowledgment, ERA, reconciliation; acceptance is not payment |

Use the separate **Eligibility payer ID (if different)** field when needed. It does not change the claims payer ID. If electronic eligibility is unavailable, use the payer portal or phone and record the verification evidence. Enrollment approval, an active response, benefit coverage, authorization, and payment are distinct facts.

The Claim.MD key belongs in the server's Google Cloud Secret Manager configuration. A GitHub secret is needed only if a deployment workflow explicitly requires it; copying the production key into CI is unnecessary for this feature.

## In-app workflow

Billing staff open the client's insurance editor, save any changes, choose the service date and billing office, and check primary and secondary separately. Responses and manual reviews are encrypted with client/agency-bound encryption contexts. No arbitrary patient payload is accepted from the browser. Reusing the same request key cannot issue a second vendor request.

The app distinguishes reported active/inactive coverage, ambiguous responses, and reported other payers. An absent other-payer result does **not** prove that no other coverage exists. There is no universal coverage-discovery guarantee and no direct Colorado Medicaid portal integration or credential scraping in this implementation.

A reviewer must document primary verification, secondary verification when present, investigation of other coverage, and payer order. Medicaid also requires an attestation that Other Insurance/TPL was reviewed. Commercial insurance recorded after Medicaid cannot be marked verified without correcting the order. This is a conservative rule; payer-specific exceptions require a separate documented workflow.

Claim preparation requires a dated verified review matching current insurance and client identity. New eligibility evidence—including a response that finishes after review—invalidates approval. A later unresolved investigation also blocks older dated reviews. A review older than seven days must be repeated before submission; **seven days is an application policy, not a statement of a statutory deadline**.

## Electronic secondary claims

1. Start from the transmitted primary claim and its actual ERA/EOB, not merely clearinghouse acceptance.
2. Confirm the payer has **not already crossed the claim over**. Follow destination-payer timing requirements.
3. Save the secondary policy and verify payer order and eligibility.
4. Open the primary claim in Billing Workspace and prepare its secondary draft. Enter the primary control number, ERA/EOB reference, adjudication date, and payment/adjustment amounts for every original line, including zero-payment denials.
5. Primary payment plus adjustments must equal each full billed line charge. The draft retains the original full charge; it does not send only the unpaid difference.
6. Review the separate secondary draft through the existing documentation, supervisor, AI, billing-override, enrollment, and submission approval workflow.
7. Reconcile the secondary response and final ERA/EOB before assigning patient responsibility.

The application creates at most one secondary child per primary, with its own Claim.MD remote ID and the same source note/session links. Preparing a draft sends nothing. Previously transmitted or deleted secondary claims cannot be recreated as new originals. Corrections remain in the reconciliation workflow. Changed primary billing revisions or changed coverage invalidate secondary preparation. There is no tertiary submission UI in this release.

Claim.MD receives the secondary destination, original primary subscriber/payer information, `payer_order=Secondary`, prior-payment totals/dates and line-level CAS adjustment fields. The primary control number is retained in encrypted review evidence; it is not incorrectly placed in the destination payer's replacement-claim ICN field. Confirm any additional payer-specific mapping requirements with Claim.MD before activating that payer. Automatic ERA-to-COB population and fully automatic remittance posting are not implemented by this change.

Both primary and secondary responsibility resolve to **one visit balance**. Re-verification preserves allocations and payments. A changed total requires the existing audited adjustment/refund process. A previously paid copay is not billed again. Known secondary coverage prevents advance automatic verified-copay collection; final adjudication must be reviewed. Medicaid-protected clinical balances remain blocked from family collection.

## Care-team access and missed appointments

| User | Visible / permitted |
| --- | --- |
| Authorized care-team member without financial access | Primary/secondary insurer names, balance-present/review status and overdue age band; cancellation/no-show workflow participation |
| Clinical or billing supervisor without financial access | Same limited coverage/status view; existing authorized chart/supervision workflows, not claims, revenue, or balances in dollars |
| Billing staff or administrator with agency authorization | Coverage evidence, claims/COB workflow, balances, payments and reconciliation |
| Guardian/client or school staff | Cannot use the internal care-team summary endpoint; their separate existing authorized portal workflows apply |

The summary never returns dollar amounts, member IDs, claim IDs, transactions, or card details. Existing client-record access governs scope. Held or unreconciled items show billing review rather than an amount due. The status describes this application's ledger, not a reconciliation of historical EHR records.

Missed-appointment decisions remain in the scheduling workflow. The Medicaid protection now checks both encrypted policies rather than obsolete client fields. Unknown coverage holds a clinical missed-appointment fee for billing review. Participation in fee decisions does not confer access to agency revenue or claims.

Social-work Rule 1.14(C)(1)(e) requires collaboration with and approval by the approved supervisor for specified professional decisions, including fees and billing procedures. It is broader than simply allowing a no-show button. The rule does not itself prescribe full claims/revenue-screen access. This permission design is an implementation interpretation, not a determination that every supervision arrangement meets the rule; preserve the relevant supervisor's documented approval process.

## Deployment and verification

- Apply main migration **1486_client_coverage_verification.sql** and clinical migration **022_secondary_claims.sql**, after the earlier billing/readiness/supervision migrations.
- Keep family-billing encryption configured; the eligibility path validates encryption availability before contacting Claim.MD.
- Preserve existing tenant financial permissions and feature gates. No production gate was enabled by this work.
- Configure actual payer/NPI eligibility enrollment and verify the distinct claims/ERA statuses; activation remains **unconfirmed** until checked.
- Confirm Claim.MD account duplicate-matching behavior with distinct primary/secondary remote IDs before the first secondary transmission.
- Validate a real primary/secondary example with the payer, including a zero-payment primary adjudication where allowed. Do not send synthetic patients or test claims to the live account.
- Test authorized and unauthorized roles across two tenants. Verify delayed eligibility responses pause claims/collection, paid copays remain paid, and uncertainty does not become client debt.

Automated verification includes vendor-payload/unit tests, frontend privacy and navigation tests, a production frontend build, and disposable MySQL tests. The database tests exercise encrypted evidence, tenant scope, late responses, unique secondary ownership, a paid copay followed by final secondary responsibility, cash/card retries, refunds, and unchanged portal balances. Vendor calls are mocked; local passing tests are not payer certification.

To reproduce database checks, use only the guarded disposable `127.0.0.1:33316/family_billing_test` database with synthetic credentials. Load the fixture/migration sequence documented in `copays-and-client-balances-audit.md`, plus main 1486 and clinical 022. Run `familyBilling.mysql.test.js`, `familyLedger.mysql.test.js` and `familyLedger.sources.mysql.test.js` in that order on the same fresh fixture (the latter suites reuse payer authorizations). Run `familyCopays.mysql.test.js` and `coverageCoordination.mysql.test.js` each on a fresh fixture. Set both DB connections to the disposable database, `FAMILY_BILLING_MYSQL_TEST=1`, `NODE_ENV=test`, `SKIP_DB_CONNECT=1`, and a synthetic encryption key.

## Sources and link status

Checked September 25, 2026:

- [Claim.MD API](https://api.claim.md/): eligibility API parameters, payer/enrollment operations and published field-list download. [Official field list](https://www.claim.md/Claim.MD_Field_List.xlsx) downloaded and inspected for secondary-payment/CAS fields.
- [Claim.MD secondary and tertiary instructions](https://docs.claim.md/docs/how-do-i-handle-secondary-and-tertiary-claims), updated August 19, 2026: check crossover before submitting secondary, use primary payment and adjustment details, and confirm applicable waiting periods (including some Medicare-to-Blue-plan cases).
- [Colorado social-work rules, 4 CCR 726-1](https://www.sos.state.co.us/CCR/GenerateRulePdf.do?fileName=4+CCR+726-1&ruleVersionId=12110): official PDF retrieved successfully; Rule 1.14(C)(1)(e).
- [HCPF behavioral-health policies on its test-domain mirror](https://hcpf.test.colorado.gov/bh-policies): retrieved successfully. The TPL FAQ explains member disclosure, Medicaid portal Other Insurance checks, differing data-update timing, payer order and family-billing restrictions. **This is a test-domain copy; do not treat it as confirmation of the latest production policy.**
- The corresponding main HCPF page, general-information manual, verifying-eligibility quick guide, and January 2026 member-eligibility PDF returned **HTTP 403/access denied** during verification. They were not confirmed missing/404. Before activation, have the billing team confirm current production HCPF guidance from its accessible portal/manual and applicable CCHA/provider contracts.
