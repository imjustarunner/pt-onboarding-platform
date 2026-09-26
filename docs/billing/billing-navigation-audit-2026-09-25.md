# Billing and scheduling navigation audit — September 25, 2026

The employee screenshots exposed separate configuration, workflow and presentation problems. This change preserves billing authorization and signed clinical records.

| Report | Finding and change |
| --- | --- |
| Claim.MD says not configured | The serving backend lacked the secret binding and account allowlist. With explicit approval, runtime access was granted and the unchanged-code configuration revision `onboarding-backend-05072-ssk` activated at 100% traffic. Account 31985 is limited to agency 377; transmission remains disabled. |
| Two payers listed | CO BCBS and UnitedHealthcare are setup requests, not verified enrollments. A read-only database check found no TISI enrollment records. Directory selection and enrollment remain required. |
| Insurance will not save | Browser-required subscriber fields blocked partial staff saves. The staff editor now permits partial records, shows success/errors and lists remaining claim fields. Public intake requirements remain in place. |
| Repeated client and subscriber information | Missing claim identity fields are filled from scoped client demographics, without overwriting populated claim fields. Self-subscriber identity follows the client identity; dependent subscriber fields remain separate. Imported names must still be reviewed. |
| Office selection disappears or wrong building appears | Office choices are filtered by agency, including explicit shared-office affiliation. The appointment editor's office takes precedence over the calendar toolbar. Request sequences prevent stale room/metadata responses from overwriting newer selections. A physical location is not substituted for telehealth. |
| Room availability disagrees with booking | Availability checks now convert office-local windows to UTC, preserve minutes and recurrence wall time through DST, and handle available assignments consistently with booking checks. Final booking still rechecks conflicts. |
| No tentative claims | Scheduled clinical sessions and canonical appointments now appear in Scheduled / planned claims before an actual claim exists. Persistent appointment/session/office IDs prevent duplicate work. Canceled and already-claimed sessions are excluded. No claim or patient charge is created just by viewing planned work. External calendar imports alone do not establish a verified clinical appointment. |
| October 1 displays September 30 | Browser date-only rendering preserves the calendar date. The medical-record timeline also converts scheduled UTC instants to the source or agency timezone before matching date-only billing records. |
| Opening another provider's calendar launches Note Aid | External calendar cards are identified as external; their Note Aid shortcut is hidden and guarded on another provider's schedule. Viewing an entry does not start the session. Linked clinical workflows retain their existing permissions. |
| Stacked multi-provider schedule | Staff schedule comparison now offers Day by provider with a separate column per clinician and explicit event type, source and time. It uses the existing authorized schedule summaries and preserves typed/busy privacy restrictions. |
| Provider profile Billing tab | This tab controls provider self-pay rates; it is distinct from client insurance and the agency claim workspace. No insurance setup should be entered as a provider self-pay rate. |

## TISI launch status

Read-only checks on September 25 found Windchime office 8 active, group NPI 1306688650 and a complete billing address. TISI's tax ID was absent and `CLINICAL_AI_PRIVACY_APPROVED` was not set in the serving runtime. These prevent a submission-ready claim even if transmission mode is changed. The account is production, not a sandbox.

Enter the tax ID as an administrator under **Settings → Business details / Company Profile → Contact → Practice profile → Tax ID type / EIN**, then save. A direct link is included in the scoped billing workspace. Keep the tax ID in the application, not chat or source control.

Remaining launch work: save and verify the agency tax identity; validate and enable the private AI claim-content review service; select each exact payer route and complete applicable claims/ERA/eligibility enrollment; then review the exact first claim, enable live transmission, and submit with explicit biller approval. Claim acceptance and paid/reconciled status remain separate. ERA posting/reconciliation is not made production-ready by this UI change.

## Validation

- Frontend regression checks cover staff insurance saves, self-subscriber synchronization, public intake, billing authorization, claim approval, calendar instants and office selection.
- Backend tests cover room booking, schedule privacy, agency billing access, planned-service deduplication and date handling.
- A synthetic MySQL integration test checks both appointment linkage directions, tenant isolation, cancellation and already-claimed exclusions, local service dates and no accidental claim creation. It uses a uniquely named disposable database on localhost port 33316.
- The three planned-service queries were checked with EXPLAIN against the deployed schema without retrieving patient records.
- Chrome preview with synthetic records passed desktop and mobile checks: five correctly typed events, no duplicate self-subscriber fields, and no page overflow. The schedule scrolls horizontally on narrow screens.
- Production frontend build passed with the repository's existing large-chunk warnings.
- No real claim, payer enrollment, payment or remittance posting was performed during this audit.
