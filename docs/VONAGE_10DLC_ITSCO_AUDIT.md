# ITSCO / AuricWell SMS audit and registration proposal

**October 7 update:** Use the [current non-compliance audit](./VONAGE_10DLC_NONCOMPLIANCE_AUDIT.md) for live campaign/linkage findings and the HELP-field correction. The reseller discussion below describes independent customer businesses; Vonage permits customer registrations for legal entities the account owner owns.

Historical audit recorded October 4, 2026; current operator guidance updated October 5, 2026. **Use [the campaign walkthrough](./VONAGE_10DLC_CAMPAIGN_WALKTHROUGH.md) for all current dashboard fields and submission status.** Findings labeled “fixed locally” below describe that audit point, not a fresh deployment verification. The user confirmed that independent practices use AuricWell and identified the first legal business as **ITSCO, LLC**. The user also confirmed ITSCO as the client-facing name, https://www.itsco.health, support@itsco.health, and 500–2,000 outbound texts on busy days. This document supersedes the single-brand assumptions in `VONAGE_10DLC_PROVIDER_NUMBER_PLAN.md`.

## Registration architecture

AuricWell is the reseller/software provider. Obtain its reseller ID and tag the registrations of independent practices with it. Register ITSCO, LLC as its own business; enter its exact IRS identity/address/EIN directly into Vonage. Do not register independent practices under AuricWell's business identity. AuricWell's own account/security messages need their own appropriately registered sender. This follows the [Vonage guide supplied by the user](https://api.support.vonage.com/hc/en-us/articles/7990660170908-10DLC-Guide-of-guides).

Recommended starting point for ITSCO:

| Program | Proposed registration | App purposes | Consent |
| --- | --- | --- | --- |
| Service operations | Externally vetted **Mixed**, subject to actual qualification and throughput headroom | `care`, `reminders`, `workforce` | Separate recipient choices for each purpose; one campaign-wide STOP |
| Optional promotions | Separate Marketing campaign and dedicated number; Low Volume Mixed with Marketing if that is what the brand qualifies for | `marketing` | Separate affirmative written marketing permission |
| Optional polls and account security | Excluded from initial operations proposal | `polling`, `account_security` | Add matching qualified use cases/registrations and purpose-specific consent before use |

For operations, the proposed sub-use cases are **Customer Care** (two-way administrative/service coordination) and **Account Notification** (appointments and staff account/schedule updates). Validate the choices against ITSCO's actual Vonage qualification response. The previous plan's “Healthcare” selection is not listed on the current published [Vonage campaign use-case page](https://api.support.vonage.com/hc/en-us/articles/8032668573724-10DLC-Campaign-use-cases). Do not invent a dropdown option. This recommendation covers administrative coordination, not sending clinical records by SMS. In-app staff chat does not require an SMS campaign.

Keeping marketing separate is an AuricWell design choice, not a claim that carriers prohibit mixed marketing. It simplifies consent, STOP scope, and sender identity. All provider lines can be attached to the same ITSCO operations campaign when their traffic actually fits it; a campaign per clinician is unnecessary. A dedicated staff campaign remains an option if different STOP scope or volume warrants it.

## Findings and local changes

| Finding | Evidence / change | Status |
| --- | --- | --- |
| Notification/contact numbers returned before STOP/HELP | `vonageWebhook.controller.js` now handles keywords before event, appointment and clinical routing | Fixed locally |
| Inbound text could overwrite an existing STOP; YES meant global opt-in | Removed automatic recurring subscription; YES stays a response; bounded care replies do not grant reminders/marketing | Fixed locally |
| Clinical opt-out state only covered client IDs and individual DIDs | New phone/campaign permission ledger covers staff, contacts, guardians and unknown recipients; legacy opt-outs remain checked | Fixed locally |
| Direct producers skipped consistent consent | Every SDK send goes through `prepareSmsDelivery`; missing registration, unmatched purpose, STOP, unavailable storage or absent consent blocks delivery | Fixed locally |
| Reminders queried nonexistent consent columns | `appointmentReminder.service.js` uses the actual `session_sms_opt_in` field; central purpose consent is also required | Fixed locally |
| CANCEL conflicted with subscription cancellation | Reminder prompts now use Y/N/R; exact CANCEL is an opt-out keyword and wins over appointment routing | Fixed locally |
| Webhook signatures used reversed SDK arguments and ignored GET parameters | Corrected installed SDK call and merged query/body; signed inbound and status webhooks required in production | Fixed locally; Vonage signing must be enabled before release |
| A configured outbound attachment was silently dropped | SMS transport now rejects attachments instead of reporting a text-only send as an attachment send | Fixed locally; MMS transport remains unavailable |
| Staff SMS defaulted on; emergency paths bypassed channel preference | Default changed to off; urgent paths cannot bypass the shared consent/suppression gate | Fixed locally |
| Care number forwarding and return-from-vacation digest | Staff forwarding tagged `workforce`; emergency forward uses owned sending DID; digest unwraps number record correctly | Fixed locally |
| Carrier identity absent from number records | Added registered program configuration in Texting Numbers with carrier IDs, brand, evidence/policy links, and approval/linking attestations | Fixed locally; not automatic verification against Vonage |
| Ad hoc consent toggle lacked evidence | New admin workflow records method, exact disclosure, evidence reference, timestamp, purpose and actor, and sends subscription confirmation | Fixed locally; operators must verify evidence |
| Existing intake/preference toggles were not verifiable signatures | Added expiring signed links, optional per-purpose choices, encrypted evidence and explicit administrative review before activation | Fixed locally; existing recipients must complete or supply verified signed evidence |
| General platform legal documents may not identify ITSCO and its programs | `LegalDocumentView.vue` resolves shared platform documents, including Google Docs fallbacks; live policy content was not verified | Submission blocker |
| Intake provider section called ordinary texts “HIPAA-protected”; optional updates referenced affiliates | Removed that blanket SMS claim and affiliate marketing language in the default intake copy; custom saved overrides still require inspection | Default fixed; saved overrides unverified |
| Event and engagement polls can be mistaken for operational notifications | Explicit `polling` purpose; initial operations registration does not permit these sends | Blocked until separately declared/consented |
| Generic notifications and emergency broadcasts used a global sender | They now resolve an approved workforce sender for the agency; primary care/reminder paths also check agency ownership | Fixed locally; security and other explicit sender configurations still require correct registration |

The machine-readable [SMS send inventory](../deliverables/vonage-10dlc-itsco/sms-send-inventory.json) lists all discovered calls and their declared purposes. Coverage includes clinical compose, legacy compose, guardians/affiliated contacts, both appointment engines, session changes, join reminders, self-requested digests, ordinary notifications, emergency broadcasts, event invitations and polls, agency contact/staff campaigns, school ROI links, account reset links, auto-replies, support escalation, forwarding, and OOO digests. Email, push and internal chat are separate channels; this was an SMS readiness audit, not a whole-application security certification.

## Historical ITSCO operations submission draft — use the current walkthrough

**Brand / legal identity (confirmed):** ITSCO / ITSCO, LLC. Website: `https://www.itsco.health`. HELP contact: `support@itsco.health`.

**Campaign name:** ITSCO service communications.

**Description:**

> ITSCO, LLC uses AuricWell to send appointment reminders and schedule updates, answer client and guardian questions about ITSCO services, and send operational account and schedule notifications to ITSCO employees and contractors. Recipients select the types of messages they want. Client conversations are handled by authorized ITSCO staff through AuricWell. This program excludes promotional offers, surveys/voting, affiliate advertising and clinical records. Message frequency varies with appointments and recipient interactions.

**Samples (fictional; match the implemented sender prefix and STOP footer):**

1. ITSCO: Your appointment is Tuesday at 3:00 PM. Reply Y to confirm, N to cancel, or R to request another time. Reply STOP to opt out.
2. ITSCO: Thanks for contacting our care team. We can help you arrange a different appointment time. Reply STOP to opt out.
3. ITSCO: Your staff schedule has changed. Sign in to your ITSCO account to review the update. Reply STOP to opt out.

**Message flow for the implemented signed-link enrollment — publish and test before submitting:**

> During client onboarding or staff onboarding, an authorized ITSCO administrator issues an expiring private consent link in AuricWell. The link is provided by email, through onboarding, or in person; unsolicited SMS is not used to request consent. Clients or their authorized guardians see required, initially unselected Yes/No choices for care-team messages and appointment reminders. Staff see a separate required Yes/No workforce choice. No answer is inferred from leaving a field blank. Each signer supplies the covered phone number and their name, confirms authority, and electronically signs the exact version of the disclosure. They may decline every purpose without losing access to services. ITSCO reviews the signature and authority before activating only the selected purposes. The system retains encrypted signed evidence, disclosure version/hash, choices, collection time and review records, and sends a subscription confirmation. Marketing uses its own consent form and dedicated number. A recipient-initiated question permits a bounded conversational reply, not a recurring subscription. STOP suppresses the entire campaign across its numbers. HELP supplies ITSCO support. Documented START/UNSTOP restores existing subscriptions only. Public proof: [INSERT published client/staff example URLs]. SMS terms: [INSERT verified URL]. Privacy: [INSERT verified URL].

Public app examples after deployment: `/sms-consent/example/itsco`, `/sms-consent/example/itsco?audience=staff`, and `/sms-consent/example/itsco?program=marketing`. These render the same Vue component as the signing flow and cannot enroll anyone. Private links expire after 14 days; **do not submit expiring recipient links as carrier evidence**. Host blank examples/screenshots on a stable public URL instead. Submit guardian signing as the same client-purpose flow with authority explicitly recorded. If using paper consent as an additional channel, describe it separately and provide a matching blank signed-form example; do not claim unimplemented intake auto-enrollment.

**Keyword configuration:** STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, REVOKE, OPT OUT, OPTOUT; HELP, INFO; START, UNSTOP for documented reactivation. Do not list YES as an opt-in keyword. Configure the same supported keyword set with Vonage; verify any multiword keyword restrictions in the dashboard. Choose one response owner: app, or verified Vonage Opt-Out Assist. The app still maintains campaign-wide suppression because [Opt-Out Assist only blocks the particular number texted](https://developer.vonage.com/en/opt-out-assist/technical-details).

**Actual app STOP reply:** “ITSCO: You are unsubscribed and will receive no further messages from this program. Reply HELP for help.”

**Actual app HELP reply:** “ITSCO: For help, contact support@itsco.health. Message frequency varies. Message and data rates may apply. Reply STOP to opt out.”

**Actual reactivation reply:** “ITSCO: Texting is re-enabled for your existing subscriptions. Message frequency varies. Message and data rates may apply. Reply HELP for help, STOP to opt out.”

Select embedded links if any production message includes a portal/signing/help URL; select embedded phone numbers if used. Use real first-party links in final samples when applicable. Vonage expects matching live disclosure, policy links and recurring-program confirmation; inspect the [current requirements](https://api.support.vonage.com/hc/en-us/articles/12132309081500-10DLC-Campaign-requirements) before submission. The supplied guide notes approval/vetting and number linking as distinct steps.

## Historical optional marketing draft — use the current walkthrough

Description: ITSCO, LLC sends occasional announcements about ITSCO's own programs, enrollment openings and service availability to people who separately requested promotional texts. Consent is optional and is not a condition of care or purchase. No purchased lists, affiliate promotions or reuse of appointment consent. Use a dedicated Marketing-registered number.

Samples:

- ITSCO: Enrollment is open for our upcoming skills group. Contact support@itsco.health for program information. Reply STOP to opt out.
- ITSCO: We have new program openings this season. Contact our team to learn more. Reply STOP to opt out.

A dedicated marketing consent surface and individual promotional-message composer are implemented locally in Campaign registration and consent. Publish/test both and approve the marketing registration before use. Existing contact campaigns remain polling workflows and cannot be repurposed as marketing by changing their wording.

## Consent and policy evidence

Blank proof artifacts generated from the actual signing component:

- [Client/guardian choices PDF](../deliverables/vonage-10dlc-itsco/itsco-operations-consent-example.pdf)
- [Staff choices PDF](../deliverables/vonage-10dlc-itsco/itsco-staff-consent-example.pdf)
- [Separate marketing choice PDF](../deliverables/vonage-10dlc-itsco/itsco-marketing-consent-example.pdf)

Matching HTML and PNG files are beside each PDF. They contain no recipient information or manufactured signatures. Rebuild HTML with `cd frontend && node scripts/build-sms-consent-examples.mjs`. The included ITSCO terms/privacy paths are candidates from existing app routing, **not verified live policies**. Fix the real policies before presenting these as final registration evidence; regenerate screenshots after any wording/URL change.

Every receiving phone must have its own evidence: a guardian's signature does not enroll another parent, and a client's consent does not enroll staff. Signed evidence is encrypted; public examples expose no names or numbers. Unsigned requests remain blocked. Admins can refresh status, download evidence privately, attest review and activate selected choices. Never post signed patient forms in a public proof URL. The UI lists the latest 200 requests; the database retains older records. Retention/deletion and organizational access policies still need operational review.

A newer signed request for the same number/phone supersedes the older request. Concurrent review of the same request is blocked. Failed confirmation resets that purpose to disabled. A process crash during activation can leave `review_token` set: inspect the evidence, permission history and provider acceptance before an operator clears that token and retries; do not blindly replay. There is no transactional guarantee spanning the database and Vonage, so a confirmation may be repeated after an uncertain provider outcome.

Required policy work: identify ITSCO, LLC and ITSCO, explain its programs and STOP/HELP scope, state frequency/rates and carrier delivery disclaimer, provide a working support contact, and clearly explain mobile information and consent handling, including no third-party marketing sale/sharing. Verify actual data practices before publishing claims. A platform-only generic policy is not proof of an ITSCO-specific program. Do not describe campaign approval as healthcare privacy certification; confirm Vonage product/account/contract eligibility separately before allowing clinical data through SMS.

## Deployment and controlled acceptance

1. Apply migration `1538_sms_campaign_consent.sql` in a test database first. Do not automatically import old opt-ins. Preserve historical STOP records; runtime continues consulting legacy client and staff opt-outs.
2. Have Vonage enable SMS API signing for inbound messages **and delivery receipts**. Set `VONAGE_SIGNATURE_SECRET` and the exact matching `VONAGE_SIGNATURE_ALGORITHM` (default MD5HASH). Production now requires signing; deploying before this step will reject callbacks. See [Vonage signing documentation](https://developer.vonage.com/en/getting-started/concepts/signing-messages).
3. Finalize/publish the ITSCO-specific blank consent proof, policy pages, and contact details. Manually test no-login access on mobile and desktop. The web fetch confirmed a site title at `www.itsco.health`; it did not verify rendered policy contents or links.
4. Register reseller, verify the ITSCO brand, qualify throughput, submit the accurate program, wait for carrier activation, and link owned DIDs in Vonage. No registration or purchase has been performed by this audit.
5. Enter each approved DID in Texting Numbers → Campaign registration and consent. Use identical program identity, purposes and keyword owner for every number on the campaign. Uncheck approval/linking to suspend local sends. Configuration stores operator attestations; it does not query Vonage's current status automatically.
6. Verify encryption configuration, then issue private signing links for consenting test clients/guardians and staff. Complete the form, inspect its evidence, attest signer review and activate through the new panel. Enable the matching existing recipient delivery preference as well: ledger consent grants permission but does not override an off channel toggle or reminder preference.
7. Test subscription confirmation; appointment Y/N/R; inbound care and reply; staff notifications; missing-consent denial; STOP on a notification number; STOP across a second DID; HELP while stopped; ordinary inbound and YES remaining stopped; START restoring only prior subscriptions; a rejected marketing send on an operational number; and delivery receipts. Use synthetic content only. Check actual handset results, not just HTTP/provider acceptance.
8. Only after the pilot passes, issue consent links to the remaining recipients via non-SMS channels. Reconcile each required recipient against signed requests and active permissions. Existing intake/preference flags do not activate texting and are not migrated automatically; a dedicated signed link or verified signed paper record is required. This does not force anyone to consent: declining must preserve non-SMS service access.

Offline candidate validation (does not send, register, buy, or query Vonage):

```sh
cd backend
node src/scripts/smsReadiness.js registration ../deliverables/vonage-10dlc-itsco/operational-registration.draft.json
```

The supplied draft intentionally fails validation until missing IDs, links, DID ID and approval/linking are supplied. The operator CLI supports `consent` JSON and explicit `--apply --actor-user-id=N`; applying an opt-in sends its confirmation. Prefer the admin panel for normal use. Do not put recipient lists, signed forms, credentials or EINs into this repository.

## Validation scope / remaining blockers

Validation: **191 backend messaging tests across 29 files**, **7 frontend consent/admin tests across 2 files**, JavaScript syntax checks for 29 touched messaging files, and `git diff --check`. Local Chrome rendered all three blank examples and verified zero preselected choices. The discovered inventory has **38 transport call sites across 18 source files**.

Automated backend tests exercise shared suppression, unknown recipients, purpose separation, signed transport, bounded conversation replies, STOP precedence, missing-consent denial, MMS rejection and the send-call inventory. Frontend tests cover explicit required Yes/No choices, signature payloads and non-enrolling examples; the admin panel tests cover required review attestation and refreshing signature status. Tests use mocks, not a live database or carrier. No production database was modified, no real recipient was texted, no live Vonage dashboard/account was inspected, no carrier submission was filed, and no deployment took place.

Before claiming first-submission readiness: supply ITSCO's direct-registration legal fields and AuricWell reseller identity privately to Vonage, qualify throughput for the confirmed 500–2,000-text busy day (count SMS segments and carrier distribution), publish and verify the final consent/policy evidence, review saved overrides, test the migration and signed callbacks, and execute a handset pilot on approved numbers. Approval remains Vonage/carrier-controlled. The local safeguards intentionally block sending until the corresponding evidence and configuration are present.

## Signed consent is not a liability waiver

This implementation records messaging permission and electronic signatures. It does not substitute for clinical informed consent, a release of information, guardian authorization records, or employment agreements. Requiring signed SMS evidence here is the app's stricter operational policy; do not tell recipients that carriers universally require a signature for every conversational reply. No form makes unconsented marketing acceptable.


## Verified app identity and campaign update — October 4, 2026

The user reports external vetting completed for ITSCO, AuricWell, and NextLevelUp. This is user-reported status, not a direct Vonage account check. Next Level Up uses appointment reminders, client/staff communications, and occasional promotions.

Read-only live public app checks and repository evidence:

| Brand | Identity evidence | Public website | HELP contact to use in draft |
| --- | --- | --- | --- |
| ITSCO | ITSCO, LLC was confirmed by the user and appears in their Vonage screenshot | https://www.itsco.health | support@itsco.health |
| Next Level Up | Client services agreement identifies Next Level Up, LLC; live agency slug `nlu`, ID 6, returns Next Level Up | https://nextleveluplcc.com | support@nextleveluplcc.com; live agency phone 719-377-6577 |
| AuricWell | User identifies PlotTwistCo as the owner; live platform name is Plot Twist Co, and the live `plottwistco` organization returns PlotTwistCo | https://auricwell.com | support@plottwistco.com; live operator phone 833-756-8894 |

Next Level Up support email is recorded in `backend/src/content/nluOfficePolicyServicesAgreement.en.js`, not populated in the live agency's `support_team_email`. PlotTwistCo's support email and phone are populated in its live public agency configuration. AuricWell is a working public app shell; these checks do not verify a dedicated AuricWell support mailbox. Using its existing operator support contact is the draft recommendation. No messages were sent to test mailbox delivery.

Public read sources: `/api/agencies/slug/itsco`, `/api/agencies/slug/nlu`, `/api/agencies/slug/plottwistco`, `/api/public/marketing-pages/partners`, and `/api/platform-branding`, accessed through the app domains. Only business-identity fields were extracted from agency responses; tax IDs and unrelated settings were not printed or retained.

Ownership remains unproved by these records: `official_name`, `account_owner_user_id`, and `affiliated_agency_id` are blank on the checked agency records. An ITSCO employee-evaluation seed calls Next Level Up part of the ITSCO umbrella, but an affiliation or app administrator is not proof of legal ownership. PlotTwistCo's exact IRS legal spelling is also not populated. Use its verified Vonage legal record rather than inventing an LLC suffix. Per Vonage's reseller requirements, businesses the registrant owns can be their own campaigns; independently owned customer practices need reseller campaigns. This corrects any assumption that all AuricWell tenants necessarily require the same owner/reseller selection.

### Historical live submission blockers found — October 4

- `https://app.itsco.health/api/sms-numbers/consent-example/itsco` returned HTTP 401 anonymously.
- `https://app.nextleveluplcc.com/api/sms-numbers/consent-example/nlu` returned HTTP 401 anonymously. The local example implementation is ITSCO-specific; a Next Level Up public proof route was not previously implemented.
- Live platform branding returns null `terms_url` and `privacy_policy_url`; `LegalDocumentView.vue` falls back to Google Docs. A loaded page shell is not verification of brand-specific SMS policy content.
- Earlier direct retrieval of Google Docs was blocked. The owner subsequently supplied the full platform privacy policy, platform terms, and HIPAA notice as attachments; those supplied texts were reviewed and used for the native policy revisions below. No further Google retrieval was needed.
- Consequently, no proof or policy URL below is certified submission-ready. Do not use an ITSCO form as another brand's evidence.

### Current campaign field sheets — moved October 5, 2026

The old five field sheets and shared-keyword block have been replaced by the
[step-by-step campaign walkthrough](./VONAGE_10DLC_CAMPAIGN_WALKTHROUGH.md).
Start with Next Level Up; each campaign has dashboard steps 1–6 and post-approval step 7.
The updated guide includes Y/N/R, client session-login links, employee video/meeting
notifications, the optional billing addition, and the practice-versus-AuricWell distinction.

October 5 recheck: NLU privacy and SMS terms return full branded HTML with HTTP 200.
Its staff consent-example API still returns 401; local example routes are ITSCO-only.
The walkthrough identifies that unresolved evidence gap and does not claim the NLU
submission is ready. Historical blockers above must be read with this dated result.

## Native branded policies — October 4, 2026 revision

The owner expanded the policy request from ITSCO to each tenant. The app now supplies
native policy sets for ITSCO, Next Level Up, The Inner Strength Institute, Rise Revive,
MH4Kidz, Mental Range Collective, Kimi Cain Life Coaching, Plot Twist Co, AuricWell,
SchoolCareBridge, Michael V. Mendez Consulting, and Summit Stats Team Challenge.
Unknown organizations resolve their own public identity and receive a general service
privacy notice; a healthcare-provider status is never inferred from an `agency` type.

Review all 36 documents through `deliverables/tenant-legal/index.html`. Each set has
Privacy, Terms & SMS, and either a provider HIPAA notice or a service-specific health
information notice. The latter expressly does not purport to be a treating provider's
NPP. AuricWell identifies Plot Twist Co as its operator. SchoolCareBridge identifies
MH4Kidz. The supplied terms name NEXTLEVELUP, LLC; no corporate suffix was invented for
other businesses. Known logos and brand colors are used; a name wordmark is used when
no local logo is configured.

Clinical provider notices are supplied for ITSCO, NLU, TISI, and Rise Revive, whose app
content describes clinical services. Confirm legal provider identity and NPP adoption
for each before publication. MH4Kidz and SchoolCareBridge use coordination notices
rather than claiming every school or program record is HIPAA-covered. Kimi's notice
separates coaching from NLU clinical services. The fitness notice includes activity
integrations, audience visibility, disconnecting, and deletion requests.

ITSCO canonical destinations (native pages, no Google dependency):

- `https://www.itsco.health/itsco/privacypolicy`
- `https://www.itsco.health/itsco/terms` (SMS section: `#sms`)
- `https://www.itsco.health/itsco/platformhipaa`

Other tenants use their public origin plus `/{tenant}/privacypolicy`, `/{tenant}/terms`,
and `/{tenant}/platformhipaa`. Existing website privacy/terms paths resolve to the
native documents. Public web servers serve complete HTML for configured public hosts;
app/portal routes render the same source natively. Intake and portal footer defaults
now retain tenant scope. Explicit document overrides and previously signed packets
are not silently rewritten. The separate SMS proof route is still independently
configured; removing policy embeds does not manufacture consent evidence.

Content changes include:

- Separate service SMS and promotional consent; explicit unselected Yes/No choices
  allow declining every purpose. A phone number, waiver, notice acknowledgment, or
  website terms do not enroll a person in recurring texts.
- STOP/HELP, program-wide opt-out, re-enrollment limits, frequency, rates, carrier
  disclaimer, and the limits of ordinary SMS confidentiality.
- No sale or affiliate/third-party promotional sharing of mobile information or
  SMS consent; necessary vendor/carrier processing is explained separately.
- Complete provider access, amendment, restriction, accounting, confidential
  communication, representative, breach notification, paper-copy, and complaint
  rights. Notice acknowledgment is distinguished from authorization.
- Current Part 2 language, including treatment/payment/operations consent and the
  separate restrictions on proceedings against patients, without declaring all
  records to be Part 2 records or every practice to be a Part 2 program.
- Removed blanket promises of instant AI-data deletion, anonymity from initials,
  guaranteed SMS privacy, universal after-hours blocking, and exclusive access by
  one clinician. Vendors, recordings, retention, and technology uses remain subject
  to actual agreements and applicable safeguards.

Publication status and concrete review items:

1. These are local review copies; no deployment, database policy update, consent
   backfill, customer message, or carrier submission was made by this change.
2. Adopt the effective date on publication (draft version: 2026-10-04). Confirm each
   legal name, privacy contact, service scope, and documented NPP distribution process.
   ITSCO's officer/contact/address came from the supplied notice. Other tenants use
   their public configured email/phone or existing contact page. A contact-page fallback
   needs a working privacy-request route before an NPP is adopted. Rise currently has
   no verified direct privacy email/phone in the retrieved profile; this must be supplied
   for its final provider notice. Do not submit that draft as a completed NPP yet.
3. The policies are not proof of executed BAAs, a vendor security audit, account-level
   HIPAA eligibility, actual retention settings, legal ownership, or carrier approval.
   Validate those operational facts and the clinical notice/contact details for each
   practice before adopting its documents. No wording guarantees first-pass approval.
4. Existing custom intake text, uploaded signed agreements, and per-step URL overrides
   need a separate versioned migration if they contain old Google links or old wording;
   do not alter historical signed evidence. New footer/default links use native pages.
5. Publish the actual consent mechanism and examples as well as these policies; then
   verify all public URLs, STOP/HELP behavior, campaign registration, and number linkage.
   Until those checks pass, the campaign field sheets remain drafts.

Source basis reviewed October 4, 2026:

- HHS February 2026 provider model: https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/privacy-practices-health-care-provider/index.html
- HHS model notices and 2026 Part 2 updates: https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/model-notices-privacy-practices/index.html
- HHS Part 2: https://www.hhs.gov/hipaa/part-2/index.html
- Vonage campaign requirements: https://api.support.vonage.com/hc/en-us/articles/12132309081500-10DLC-Campaign-requirements

Rebuild review copies with `cd frontend && node scripts/build-tenant-legal-documents.mjs`.
Public site artifacts are generated by the normal frontend build. Public organization
profiles were read for contact and identity fields only; no private tenant data was
used in the review copies.

Validation for this policy revision: 62 focused frontend checks passed, the production
build passed with the existing Docker/CI 8 GB Node heap setting, and all 36 generated
canonical Nginx routes resolve to generated document files. Local HTTP checks verified
five brand-specific full HTML pages and an NLU redirect. ITSCO, NLU, and AuricWell were
visually inspected; ITSCO's three PDF copies are in `deliverables/tenant-legal/itsco/`.
Docker/Nginx runtime validation could not run because the local Docker daemon is not
running; no container or deployment was claimed. The local Node server checks are
separate from that deployment check.
