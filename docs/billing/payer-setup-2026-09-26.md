# Managed-agency payer setup — September 26, 2026

The owner supplied 43 payer rows and confirmed ITSCO NPI 1972246940 and Next Level Up NPI 1942945316. Both already matched the active agency billing-office profiles. TISI uses 1306688650. All three agencies now have tax IDs on file; this is a presence check, not payer validation.

The reviewed source catalog is [payer-import-2026-09-26.json](./payer-import-2026-09-26.json). It preserves all screenshot names as 36 setup records per agency (ITSCO 2, NLU 6, TISI 377). Existing TISI CO BCBS and UnitedHealthcare requests are reused. Screenshot network status, patient counts and the previous clearinghouse's connection indicators are not imported as verified facts for these agencies.

A read-only authenticated Claim.MD payer-list request returned 4,148 entries. Of the 36 setup records, 29 matched a current ID, three matched an alternate ID, and four have no supplied electronic ID. Claims, ERA, eligibility and secondary-claim capabilities are stored as directory information, never as agency enrollment or contracting status.

| Previous EHR route | Claim.MD candidate | Review required |
| --- | --- | --- |
| Complementary Healthcare Plan / CHP01 | HRYA1 — Heraya Health | Confirm exact member plan and submission instructions. |
| Rocky Mountain / SX141 | 87726 — United Health Care | Confirm plan, administrator and service date. Do not substitute Rocky Mountain PACE. |
| TRICARE East / TREST | 99727 — Tricare East | Directory specifies dates of service January 1, 2025 and later. |

The app displays both the previous and candidate IDs. It does not rewrite insurance policies or existing claims. Sources: [Claim.MD API payer list](https://api.claim.md/), [TRICARE East directory](https://www.claim.md/payer/99727), [United Health Care directory](https://www.claim.md/payer/87726).

“color” needs its full identity clarified. District 11 and Second Wind Funds require confirmation of the school/funding invoicing workflow; Second Wind was explicitly marked External in the source. Quantum health needs the actual claim administrator and card instructions. None receives a guessed payer ID.

## Workflow and deployment

Migration `1499_medical_payer_setup_details.sql` adds directory evidence alongside the existing agency-scoped setup requests. `backend/scripts/import-payer-setup-catalog.mjs` previews by default; `--apply` imports only setup data, and `--agencies=2,6,377` can narrow the catalog scope. It validates agency slug and active billing NPI before writing and uses a transaction. A repeat import updates the same records. No claim, enrollment, credentialing approval or bank routing is created by this script.

The managed Claim.MD configuration now covers agency IDs 2,6,377 using account 31985 and the existing secret. Claim transmission remains disabled. Payer enrollment no longer depends on that transmission switch: authorized billers can choose an agency-owned billing office and complete a Claim.MD enrollment form while claims remain on hold. Saved NPI/tax identity, agency billing access, and explicit ERA routing acknowledgement are still required. Claim submission retains the transmission gate, AI review and explicit biller approval.

Production verification: revision `onboarding-backend-05075-994` serves 100% of traffic with the expanded allowlist and unchanged backend image. The import saved 108 setup records with directory evidence. All three agencies' `medicalBillingEnabled` flags were false; the authorized setup enabled that single flag for each agency using a transaction, preserving all other flags and user permissions. No enrollments or claims were submitted. These operational changes are separate from deployment of the UI and enrollment-controller changes in this commit.

Setup records do not establish network participation. Payer signatures, provider validation and enrollment processing must be completed where required. ERA enrollment may move delivery from the previous clearinghouse, so routing acknowledgement is still explicit. See [Claim.MD provider enrollment guidance](https://docs.claim.md/docs/add-provider).

## Verification

- Unit tests cover leading-zero IDs, alternate-ID review, ambiguous matches, missing IDs and all 43 source names.
- A disposable MySQL test imports twice, verifies 36 records per agency, refuses a mismatched agency identity and confirms no claim/enrollment tables are created.
- Enrollment tests confirm setup can proceed with claim transmission disabled, while missing connections, foreign offices and unacknowledged ERA changes remain blocked.
- Claim submission regression tests preserve explicit approval and transmission controls.
- UI tests cover route-ID searches, separate transaction capabilities and no automatic enrollment calls.
- Validation completed: 34 automated tests passed and the production frontend build succeeded. A local browser preview using public payer fixtures rendered all 36 records, searched the SX141 alias, reviewed its candidate route, and fit a 390-pixel viewport without page overflow or browser errors.
