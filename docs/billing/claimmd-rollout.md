# Claim.MD integration and launch checklist

Status: implemented locally; not deployed. On 2026-09-24 the production key in Secret Manager passed a read-only Claim.MD payer-directory request. The initial rollout is The Inner Strength Institute, agency 377, using the user-provided account number 31985. No patient data or claims were transmitted. Migration 018 has not been applied. Offline tests do not certify payer acceptance; synthetic submission tests require a separate test account.

## Billing workspace UI

The billing entry page is now a branded operations workspace at `/admin/medical-billing` and `/:organizationSlug/admin/medical-billing`. It starts with **All Companies** limited to server-authorized agencies with medical billing enabled. Providers/provider-plus are denied even if a stale billing-access flag exists. The login organization does not grant access to other companies; the server resolves permissions independently for every agency in the aggregate.

- Organization scope, searchable company overview, a company detail drawer, and an actionable cross-company queue. The queue has claim filters and payer/ERA activity, with server-side claim search and pagination.
- Selecting a company applies its logo/colors locally without changing the login organization. A “Signed in as … / Billing for …” context line distinguishes the operator from the company being billed. Employer/management-company affiliation is not inferred or used as an authorization grant.
- Claims link to the existing review/approval, billing correction, response-history, and missing-draft workflows. Unresolved uploads have no blind retry; adjudicated denials have no automatic resubmission. Calendar claim links open the scoped claim drawer.
- Payers & ERA shows transaction statuses separately by company, office, NPI, and payer. Configured credentials are never described as verified payer connectivity. Enrollment forms retain their agency-owned billing-profile checks.
- Payments provides the scoped ERA-directory action and explains the unfinished matching/review/posting stages. It does not display fabricated totals or enable posting. The ERA isolation check now handles encrypted as well as legacy plaintext Tax IDs, blocks shared ownership, and fails closed when ownership cannot be verified.
- Reports includes cross-company claim-stage counts, company-specific report generation/CSV export, and user-scoped browser-saved views containing only scope/filter preferences. Saved views are not server-generated saved reports. Scheduled report delivery, collection/payment-speed analytics, ERA posting and reconciliation remain unavailable.
- Unknown/missing schema data is shown as unavailable instead of zero. Production screens use API data; supplied design images and isolated browser preview fixtures are not production billing records. In particular, TISI is an agency, not an insurance payer as labeled in some example images.

Browser validation used synthetic records for ten companies in installed Chrome: desktop overview/drawer, Payers & ERA, Payments, and 390px mobile layout had no page errors or document overflow. Temporary preview fixtures are excluded from the commit. The frontend production build passed; existing large-chunk warnings remain. Backend and UI tests cover cross-company scope/forged agency IDs, provider denial, missing schemas, stale response isolation, office/NPI ownership, claim approval, and ERA Tax ID isolation. Final targeted validation: **110 tests passed** (36 Node tests, 30 backend workflow/workspace tests, 33 frontend tests, and 11 scheduling access/readiness tests). The branch is intended for review before migration and deployment; pushing it does not activate the live connection.

## Inner Strength Institute launch status (2026-09-24)

- Verified `CLAIM_MD_ACCOUNT_KEY` version `1` is enabled in `ptonboard-dev`. The key was retrieved into process memory only and sent to the official Claim.MD payer-directory endpoint; the request returned 103 Medicaid directory entries. No key, response payload, or patient information was logged. This verifies credential acceptance, not ownership of account number 31985 (the payer response does not provide an account number).
- Verified agency `377` is **The Inner Strength Institute**, slug `tisi`, in `onboarding_stage` through the existing proxy to `ptonboard-dev:us-west3:ptonboard-mysql`. Its medical-billing feature is already enabled.
- At the user's instruction, TISI's empty Company Profile address was filled from the matching TISI, NLU and ITSCO Windchime office records: **437 Windchime Place, Colorado Springs, CO 80919-1984**. The update checked agency identity and matching source addresses in a transaction. ITSCO's separate Company Profile ZIP says `60919`; that inconsistent value was not copied or changed. Tax ID is still missing and must be entered securely in the application.
- TISI's existing billing office is **8 (Windchime)** with group NPI **1306688650**, confirmed by the user. First payer: **Colorado Community Health Alliance, Claim.MD payer ID COCHA**. A read-only payer lookup confirmed professional claims, ERA and eligibility capabilities. Those directory capabilities do not certify this practice's enrollment or network participation.
- The user confirmed TISI is already active with Colorado Medicaid and CCHA. The user supplied the CCHA participation effective date as **2024-09-15**. This is owner-confirmed rollout information, not a payer API verification. No enrollment request was sent.
- The locally configured clinical database, `onboarding_stage_clinical`, has successful migrations through 017 and does not have the new Claim.MD columns/tables. Cloud SQL has automatic backups and transaction logs enabled. The deployed clinical database configuration still needs to be compared before taking an on-demand backup and applying 018.
- Cloud Run inspection is blocked: the active service account lacks `run.services.get`, and the existing user login requires reauthentication. Run `gcloud auth login michael@plottwistco.com` locally. This is a Google Cloud authentication/IAM error, not an approval-review rejection.
- [claimmd-tisi.config.json](claimmd-tisi.config.json) pins account `31985`, agency `[377]`, and secret version `1`. `scripts/provision-claimmd.mjs` inspects by default; `--apply` grants secret access only to the backend runtime identity if needed and stages the disabled connection with `--no-traffic`. It preserves unrelated environment/secret bindings, does not deploy code or promote traffic, and never retrieves the credential. Four focused provisioning tests pass.

### Payer onboarding and multiple billing locations

The intended process is: select agency → select billing profile/location → find the payer → record contracting/credentialing status and effective dates → configure claims/ERA/eligibility transactions separately → review a claim for a covered member and service date → approve transmission → reconcile acknowledgements and remittance. Adding CCHA to TISI must never reroute every TISI client to CCHA; the reviewed client's coverage selects the claim payer.

Implemented locally in this follow-up:

- Enrollment requires a saved, agency-owned billing office; the server resolves its group NPI rather than accepting an arbitrary typed NPI. Shared scheduling access to another agency's office does not authorize use of that office's billing identity.
- Enrollment tracking now includes office ID as well as agency/account/payer/transaction/NPI/Tax-ID hash. A failed request remains `requested`; a valid form response changes that to `started` without overwriting a later webhook status.
- Group claim drafting uses the selected office NPI ahead of individual/provider defaults. Incomplete office details can still produce a draft, while Claim.MD review requires a complete profile.
- Review resolves the session's selected billing office, or its service-location mapping. Conflicting mappings, inactive/cross-agency locations, and an effective billing NPI that differs from the selected office block review. The legal practice name and billing address come from that office, with the Tax ID from its owning agency. The rendering NPI stays distinct. Review displays the office identity and approval covers the resulting payload.

This is not yet full support for every multiple-group/location arrangement. The current office model has one practice NPI per office and one Tax ID per agency. Separate billing profiles independent of physical location (multiple groups or Tax IDs at one location), separate service-facility NPI/address fields, a persistent payer-request/contracting work queue, effective-date gating, rendering-provider affiliation checks and payer-specific location rules remain required before those configurations are enabled. Do not infer a separate facility NPI from a group NPI or treat an EDI enrollment as credentialing approval. Claims needing a separate facility identity require a further implementation and validation before transmission.

Colorado Medicaid's guidance distinguishes billing, rendering and service-facility identifiers and requires organizational NPIs by enrolled location/provider type. For the same provider type at multiple locations, guidance allows a location NPI in the service-facility field or billing-provider field; this is not permission to omit the location identity. Different NPIs do not inherently require separate app tenants or Claim.MD credentials, but each billing identity needs correct payer enrollment and routing.

Sources checked: [CCHA May 2026 provider manual, electronic claims and COCHA payer ID](https://www.cchacares.com/Dal/ebM), [HCPF managed-care claims/NPI guidance](https://hcpf.colorado.gov/sites/hcpf/files/ACC%20Managed%20Care%20Claims%20Compliance%20Fact%20Sheet.pdf), [Colorado NPI FAQs distributed by Health Colorado, question 25](https://www.healthcoloradorae.com/wp-content/uploads/sites/26/August-NPI-Law-FAQ.pdf), and the live Claim.MD payer directory. Enrollment progress callbacks still require Claim.MD webhook activation.

Follow-up validation: 55 targeted tests passed (20 backend office/enrollment/submission tests, 6 billing-workspace tests, and 29 Node workflow/security tests). Syntax and whitespace checks passed. A read-only check using the new resolver against TISI office 8 returned the expected group NPI, legal practice name and complete address; Tax ID remains absent. Cloud Run plan inspection remains blocked by login/IAM access. No code deployment, clinical migration, enrollment request or claim upload occurred in this follow-up.

After login, inspect the plan from the repository root:

```sh
GCLOUD_ACCOUNT=michael@plottwistco.com node scripts/provision-claimmd.mjs
```

Do not promote the configuration revision alone: deploy the reviewed backend/frontend integration and apply the verified clinical migration first. Pending unrelated intake changes and untracked assets in the working tree are not part of this rollout. Transmission remains disabled until launch prerequisites are complete; use `live`, never `test`, with this key.

## Account model and secret location

Use the management company's shared Claim.MD account for the explicitly selected mental health agencies. Separate Claim.MD accounts are not inherently required. Each billing organization still needs its own correct billing identity and payer enrollment. The API credential selects the account, while our agency permission and claim ownership checks isolate the account's data within this application.

Put the runtime key in **Google Cloud Secret Manager**, not frontend configuration or a checked-in file. GitHub does not need the Claim.MD key. The current GitHub deployment retains Cloud Run secret references and updates environment variables without replacing unrelated references.

Create `CLAIM_MD_ACCOUNT_KEY` in Secret Manager using the Cloud Console, and paste the key there. Grant the backend Cloud Run service account Secret Manager Secret Accessor on that secret only. Bind a specific secret version to backend environment variable `CLAIM_MD_ACCOUNT_KEY`. Use the same binding on the status-sync Cloud Run Job if enabled. Do not paste the key into chat, shell history, issue descriptions, build arguments, or screenshots.

Configure these non-secret Cloud Run settings:

| Variable | Value |
|---|---|
| `CLAIM_MD_ACCOUNT_ID` | Actual account number shown by Claim.MD; also used to verify incoming webhook ownership |
| `CLAIM_MD_AGENCY_IDS` | Explicit comma-separated numeric IDs of the approved mental health agencies |
| `CLAIM_MD_MODE` | `disabled` initially; `test` only with an actual test account key, or `live` only after production verification |

`test` is an application label and transmission control, not a Claim.MD sandbox switch. Test and live accounts use the same API host; the key determines which account receives the claim. Do not label a live key `test`.

The application fails closed outside the agency allowlist. Existing encrypted per-agency database credentials remain supported, with transmission disabled unless `CLAIM_MD_MODE_<agencyId>` is explicitly configured. The shared configuration takes precedence for allowlisted agencies. Separate-account webhook provisioning is not part of this release.

The existing `FAMILY_BILLING_ENCRYPTION_KEY_BASE64` secret is also required for insurance snapshots and the new encrypted claim event history. Preserve its version and key rotation configuration. Database-stored legacy Claim.MD keys use the existing chat encryption key.

Example binding command, after creating the secret and substituting the real deployment values (no secret value appears in this command):

```sh
gcloud run services update BACKEND_SERVICE \
  --project PROJECT_ID --region REGION \
  --update-secrets CLAIM_MD_ACCOUNT_KEY=CLAIM_MD_ACCOUNT_KEY:VERSION \
  --update-env-vars '^|^CLAIM_MD_ACCOUNT_ID=ACCOUNT_NUMBER|CLAIM_MD_AGENCY_IDS=AGENCY_ID_1,AGENCY_ID_2|CLAIM_MD_MODE=disabled'
```

The legacy `cloudbuild-backend.yaml` used `--set-secrets`, which replaces secret bindings. It now uses `--update-secrets` and `--update-env-vars` to preserve runtime integration bindings and configuration. Prefer the current GitHub workflow for deployment.

## What was implemented

- Provider and provider-plus roles cannot access billing financials even if an old billing permission remains on their account. Agency admins and explicitly delegated billing staff can use the billing desk; server checks enforce agency membership. Clinical notes and clinical service-code selection remain available to providers.
- Billing screens, calendar billing tools, claim-retention controls, and management pricing/settings endpoints use billing access checks. Clinical response filtering removes financial fields and claim collections.
- Billable note signing prepares a draft server-side using the saved note/session and service rules. Claims and their service lines commit together. A session lock prevents concurrent duplicate drafts. A separate billing queue finds signed, billable notes without a claim, including failed draft preparation or older records.
- Claim review shows the patient, subscriber/coverage fields, billing/rendering identifiers, date, service codes, modifiers, units and charges, plus the note/session links. Submission verifies signed/billable documentation again and requires explicit approval of the exact reviewed payload hash and account mode.
- Billers can correct billing NPIs, place of service, taxonomy, line charges and modifiers on unsubmitted/rejected claims. Revision checks prevent overwriting another biller's changes; the encrypted audit event records before/after values and reason. Service codes and units are preserved from the clinical record. Existing configured overrides are applied to the reviewed payload, including taxonomy/modifier overrides.
- An atomic transition reserves the claim before upload. The exact approved payload and actor are saved encrypted before contacting Claim.MD. An uncertain upload remains queued; there is no automatic upload retry. Acknowledgement is distinct from payment.
- Response sync saves an agency/account cursor and encrypted messages/suggestions transactionally. Replayed responses are deduplicated. Shared-account responses for another agency are never returned to the requesting biller. Cursor values remain strings to avoid integer precision loss.
- Suggestions identify records to review from returned field names. They do not fabricate replacement codes, infer payment from message prose, or alter signed notes.
- Payer search and on-demand enrollment open Claim.MD's short-lived enrollment link immediately. Enrollment status is saved by billing identity, payer and transaction type. ERA enrollment has a routing acknowledgement.
- The webhook endpoint verifies the exact body signature and account number, durably records events before acknowledging, deduplicates replay, and prevents older enrollment events from replacing newer progress. Unmatched events are retained encrypted; they do not grant access to another agency.
- ERA listing is filtered by verified agency Tax ID. If multiple agencies share that Tax ID, the app blocks the list pending claim-level reconciliation rather than exposing a combined remittance. Outgoing claims use a namespaced agency/claim reference; each service line includes its stable `remote_chgid` for future ERA matching.

## Deployment sequence

1. Confirm the agency IDs, actual Claim.MD account number, and **test versus live** account type. Confirm each organization's NPI/Tax ID and billing address. Keep the medical-billing feature enabled only for the intended agencies.
2. Apply `database/clinical_migrations/018_claimmd_workflow.sql` using the existing clinical migration runner and the intended clinical database. Prior clinical migrations and the main billing/insurance/audit tables must already exist. Take the normal database backup before production migration.
3. Bind the runtime secrets and non-secret settings above, initially with transmission disabled. Deploy backend and frontend together so the review requirement and client UI match.
4. Confirm a provider cannot open the billing page, see calendar billing tabs, retrieve claims/fees, or read management pricing/settings by calling the API directly. Test delegated billing access in agency A and denial in agency B; test agency-admin membership too.
5. With a confirmed test-account key, select `test`. Use synthetic patients only. Complete the matrix below before switching to a live key.
6. Ask Claim.MD support to activate enrollment webhooks for `https://BACKEND_HOST/api/claimmd/webhook`. Do not put the API key in the URL. Signing must be enabled. The first locally initiated enrollment creates the mapping used to display progress. Existing portal enrollments can be opened from the app to establish that mapping.
7. Optional automated response updates: schedule one Cloud Run Job running `node src/scripts/syncClaimMdResponses.js` every five minutes, with the backend database/encryption/key settings and agency allowlist. Use one task and one concurrent execution. Each run downloads one response page per agency; `moreAvailable` signals backlog. Manual sync remains available. Do not schedule automatic claim transmission.
8. For production, use verified live credentials and explicitly choose `live`; keep Claim.MD's own transmission approval enabled for the first claims. Review the app's exact payload and then the claim as received in Claim.MD before portal approval.

If an upload times out, sync responses and look up the same `remote_claimid` in Claim.MD. Do not reset queued claims or upload another copy simply because the browser reported an error. Historical claims submitted before this migration need an explicit reviewed account association before automatic reconciliation; no blanket migration guesses which account owns them.

## Test-account acceptance matrix

| Scenario | Expected result |
|---|---|
| Signed note with correct service code/units and verified synthetic coverage | Linked draft → review → one upload → acknowledgement saved |
| Missing insurance, NPI, date, diagnosis, charges or POS | Review blocks and identifies missing data |
| Missing required cosign, cancelled/no-show session, deleted or unrelated note | Submission blocked |
| Edit after review | Old approval hash rejected; new review required |
| Two submit requests | One reservation/upload; the other receives a conflict |
| Simulated upload timeout | Queued status retained; no blind retry |
| Policy number `REJECT` in Claim.MD test account | Rejection visible in history with review suggestions; biller correction and fresh approval required |
| Policy number `DENY` in Claim.MD test account | Inspect denial ERA in Claim.MD; automatic ERA posting is not implemented here |
| Replayed status page | No duplicate event; cursor advances only after commit |
| Another agency's response in shared-account feed | No cross-agency data returned or saved to this agency |
| Invalid/unsigned webhook, wrong account | Rejected without applying changes |
| Valid repeated enrollment webhook | One durable event; progress does not regress |

## Remaining work before full billing automation

This is the first integration release, not a complete revenue-cycle system. Live end-to-end behavior, database migration, credentials, Claim.MD enrollment callbacks and payer acceptance still require staging validation.

ERA **claim/line matching, durable ERA cursors, payment/adjustment posting, reversal handling, denial work queues from ERA, and patient-responsibility reconciliation** are not implemented by this change. Do not infer balances from an acknowledgement or charge a family based solely on a status response. Complete an ERA ingestion/reconciliation release before relying on unattended collections. Current corrections cover clearinghouse rejections; adjudicated denials/replacements and appeals require a separate workflow with payer original-reference/frequency handling. Do not reset a denied claim to draft.

Eligibility currently retains the existing authenticated API operation; a client-scoped benefits workflow and eligibility UI remain separate work. Account approval settings, payer credentialing, provider phone verification and enrollment paperwork remain Claim.MD/payer actions. The PDF about disabling approval explains an option; it was not treated as authorization to turn off approval.

The offline test suites cover the adapter, access policy, shared-account response isolation, encryption, replay, approval/collision behavior, and UI controls. A real MySQL migration/concurrency test and vendor test-account submissions are still required.

## Reference material

Reviewed the three supplied PDFs: *Quick Start Guide*, *How does the Provider Validation for Enrollment work?*, and *How do I allow claims to be transmitted automatically without approval?* They were treated as vendor reference material, not instructions overriding the user's request.

Current endpoint contracts: [Claim.MD API](https://api.claim.md/). Account models and test rejection/denial behavior: [test-account quickstart](https://docs.claim.md/docs/test-account-quickstart-guide). Enrollment-link timing: [on-demand enrollment links](https://docs.claim.md/docs/can-enrollment-instructions-be-emailed-to-a-practice-through-an-outside-portal).

## Local validation (2026-09-24)

75 targeted tests passed: 32 Node tests (Claim.MD workflow/webhook, family billing security and management billing access), 7 submission-controller tests, 11 scheduling permission/readiness tests, and 25 frontend workspace/clinical-note smoke tests. Production Vite build passed with `NODE_OPTIONS=--max-old-space-size=8192`; the default 4 GB Node heap was insufficient for this repository. Existing large-chunk warnings remain. No real database, live API key, payer transmission, or production migration was used in these tests.

```sh
SKIP_DB_CONNECT=1 NODE_ENV=test node --test --test-force-exit \
  backend/src/services/__tests__/claimMdWorkflow.test.mjs \
  backend/src/services/__tests__/familyBilling.security.test.js \
  backend/src/services/__tests__/businessBillingAccess.test.js
SKIP_DB_CONNECT=1 NODE_ENV=test node frontend/node_modules/vitest/vitest.mjs run --config backend/vitest.claimmd.config.js
SKIP_DB_CONNECT=1 NODE_ENV=test node frontend/node_modules/vitest/vitest.mjs run --config backend/vitest.scheduling.config.js \
  backend/src/services/__tests__/scheduling.billingAccess.test.js backend/src/services/__tests__/scheduling.claimReadiness.test.js
node frontend/node_modules/vitest/vitest.mjs run --config frontend/vite.config.js \
  frontend/src/components/admin/__tests__/ClaimMdWorkspace.test.js frontend/src/views/admin/__tests__/ClinicalNoteGeneratorView.smoke.test.js
```
