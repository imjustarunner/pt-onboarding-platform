# Plotline application consent and hiring notifications

Release handoff dated November 26, 2026 (America/Denver).

Branch: `codex/plotline-hiring-notifications-20261126`.
Base: `1b525b12fced19b47a1ce0b34e60ac64aa681a36`.
Resolve the branch to its full commit SHA when integrating; the external handoff includes the exact pushed SHA.

**Awaiting the separate release chat. Not deployed.**

This chat changes and tests source only. It has not merged or pushed main, deployed, dispatched or canceled deployment workflows, changed production or carrier data, impersonated an application user, or sent recipient messages. All delivery tests use synthetic recipients and mocked transports. SQL integration used a disposable local MySQL instance.

## Resulting behavior

An applicant can choose Email and text once on the application or available notification preference form. Email remains the default. The disclosure identifies Plotline People Operations and the hiring agency, describes all covered stages, and requires the applicant's mobile number, full name, control-of-number confirmation, and separate electronic signature. Existing staff review remains in place. Broader texts require successful enrollment confirmation as well as that review.

The confirmed choice for that applicant, agency, phone and current disclosure covers:

- Interview scheduling/rescheduling and existing interview reminders (seven days, 24 hours, one hour, five minutes, subject to current settings and time).
- Applicant notices after actual reference outreach and reference completion.
- Existing pre-hire and onboarding invitations and progress notices.
- Existing notices of newly assigned documents, training and tasks in the hiring portal.

Every shared-line text uses `Plotline People Operations · <actual hiring agency>: ...`. The number remains a platform contact number with no single-agency owner. Consent is never shared between hiring agencies. STOP is campaign-wide and remains authoritative. Email delivery proceeds independently of text choice or text failures.

References themselves continue receiving authorized reference emails through the existing process. The applicant's text choice does not enroll references. Applicant SMS contains generic reference progress only, with no names, answers, ratings, or confidential reference contents. A missing, failed or approval-held reference email does not produce an outreach-success text.

Interviews saved without sending invitations remain drafts for this purpose, including when text consent is reviewed later. Pending scheduling notices verify the persisted appointment start, actual candidate/agency, active status, RSVP, and candidate join link at delivery. Changed/canceled appointments do not send stale invitations. Repeated sends use a durable event key per appointment start and consent request. A future review can pick up an already-invited upcoming interview. Explicit reminder opt-outs are retained.

The new applicant notices use the existing `hire_notification_events` outbox. Pending enrollment does not consume the SMS delivery claim. Failed or ambiguous sends retain their failure status rather than automatically resending.

## Source map

- `backend/src/services/plotlineHiringSms.service.js`: shared sender resolution, agency-specific disclosure and current signed/reviewed/confirmed consent gate.
- `backend/src/services/hiringJourneyEvents.service.js`: durable scheduling/reference events and current appointment resolution.
- `hiringCommunication`, `smsConsentRequest`, `smsCompliance`, `hiringInterviewSms`, `hiringNotification`, interview scheduling/delivery and reference services: connected producers and final delivery authorization.
- `backend/src/utils/plotlineHiringCampaign.js`, `vonage10dlc.service.js`: bind broader activation to reviewed carrier content, including the online consent method, while retaining active campaign and linked-number checks on each send.
- `backend/src/scripts/upgradePlotlineHiringSender.mjs` and `backend/src/scripts/sql/plotline-hiring-sender-20261126.sql`: fixed sender-scope upgrade for a separate execute-only automation identity; default mode is a nonmutating plan.
- Frontend application choices and interview consent component: one application choice; the broad program does not ask the interviewer to record another verbal opt-in.
- `frontend/src/content/plotlineLegal.js`, `plotlineLegalHtml.js`, `PlotlineWebsite.vue`: public `/hiring-sms-consent`, updated `/privacy` and `/terms`, navigation/footer links. The original `/sms-consent` verbal script remains limited to interviews.

## Validation

Passed on this branch:

| Check | Result |
| --- | --- |
| Backend targeted regressions | 241 tests in 21 files, including the opt-in local SQL integration test |
| Frontend choice/interview components | 6 tests in 2 files |
| Public policy/proof renderer, packaging, sitemap, generated host routes, footer | 5 tests |
| Independent Plotline Vite production build | Passed; 12 packaged pages |
| Static public/product host generators | Passed using the built Plotline shell as a fixture for the shared app shell |
| Chrome checks: consent proof, privacy and terms at 375px and 1440px | 6 checks; HTTP 200, rendered brand image, one heading, no horizontal overflow, no runtime errors |
| Syntax checks and `git diff --check` | Passed |

Commands:

```sh
PLOTLINE_HIRING_TEST_MYSQL_URL=mysql://root@127.0.0.1:33319 node frontend/node_modules/vitest/vitest.mjs run --config backend/vitest.plotline-hiring-notifications.config.js
node frontend/node_modules/vitest/vitest.mjs run --config frontend/vitest.plotline-hiring-notifications.config.mjs
cd frontend
node scripts/build-plotline-site.mjs
node scripts/build-public-domains.mjs
node scripts/build-product-domains.mjs
node --test scripts/plotline-legal.test.mjs
```

The SQL test requires a disposable local instance, exclusively on port 33319. It creates and drops its own random database and scoped user. With the opt-in URL absent, exactly that integration test is skipped. Local execution used installed MySQL **9.5.0**, not MySQL 8. Confirm the procedure on the release's MySQL version before production use. It verified preview/no writes, one apply, idempotent reapply, direct table access denial, human/admin caller denial, sender ownership conflict denial, preserved original consent and audit rows, and append-only automation attribution.

Initial runs exposed and resolved sparse-checkout missing imports and incomplete test mocks. A new reference-outreach test caught the prior helper treating a transport result without an accepted message ID as success; that helper is fixed and the final suite passes. MySQL initially could not initialize inside the filesystem sandbox; the disposable local instance worked with the approved local-process permission. The first host-route test lacked the separate product-host generation step; it passes after both normal generators run.

Skipped/limits:

- Full monolithic frontend build, whole-repository tests, and production MySQL 8 execution were not run. Dependencies were reused without installation; no postinstall/full-build duplication. The full frontend build is about 700 MiB and remains required for the coordinator's combined paired release.
- The unrelated existing SQLite hiring-resource tests were excluded from this targeted suite; installed Node 22.12 lacks their `node:sqlite` requirement.
- No live SMS, inbox, Vonage campaign/API changes, webhook registration, runtime configuration changes, or live readiness verification. These are deferred to the separate release chat.
- Generated routing was validated with a shell fixture, not a newly built main application bundle. The independent Plotline marketing bundle and all four policy/proof pages were actually built.

## Required release and activation work

No automatic database migration is added. Existing migrations 1538 (signed SMS consent), 1601 (hiring preferences/outbox), and 1862 (legacy interview consent) must already be installed. The outbox already supports the new event types in its VARCHAR columns.

1. Integrate this branch with the current release changes. Build and validate the combined backend/frontend. Deploy only through the separate release chat's paired release process. Initially leave `PLOTLINE_HIRING_SMS_CAMPAIGNS_JSON` unset to keep broader shared-line activation off.
2. Publish the frontend pages so `https://plotlinepo.com/hiring-sms-consent`, `/privacy`, and `/terms` are available without authentication or JavaScript. The build scripts generate exact host routes and sitemap entries. Verify those URLs in the released frontend.
3. Review the actual carrier registration for the **broader hiring journey and online application opt-in**, not just the previous live-operator interview program. If it is still narrow, update/reapprove it through the authorized release process before activation. An ACTIVE status alone is insufficient. Include all intended traffic types, optional signed online collection, both brand/agency identification, accurate samples, HELP/STOP, frequency, pricing, and public policy/evidence links.
4. The machine-checked carrier configuration must have `message_flow_details.consent_mechanisms` containing `method: ONLINE_FORM`, nonempty details, and `attachment: https://plotlinepo.com/hiring-sms-consent`. Use the structured carrier API form; a free-text-only message flow will fail closed. The description, consent methods, samples and related registration fields are fingerprinted. A later edit requires explicit rereview and a new digest. Keep the previous interview-only verbal method listed if still used for valid legacy interview consent.
5. First complete the prior sender registration handoff (`docs/releases/plotline-sms-activation-2026-11-26/README.md`) if the number is not registered in application data. Its immutable interview-only provisioner is unchanged. Then install the separate upgrade procedure from `backend/src/scripts/sql/plotline-hiring-sender-20261126.sql` as a reviewed schema operation. It upgrades only the existing fixed null-agency platform sender; it cannot create a number, move ownership, enroll anyone, modify consent/suppression, or rewrite audit events.
6. Provision a distinct database identity named `plotline_hiring_auto_20261126` with only USAGE and EXECUTE on `upgrade_plotline_hiring_sender_20261126` in the intended schema. No table privileges or application identity are needed. Keep credentials in Secret Manager references and run with actual IAM/SQL attribution. No human application user ID is used for the update or its audit record.
7. Review the carrier contents and obtain their canonical digest with `plotlineHiringCampaignDigest` from the exact GET campaign result. Do not hash a fabricated configuration, substitute another campaign, or copy an interview-only digest. Use `--preview --approval-digest=<reviewed SHA256>` with the scoped identity. Apply only after the coordinator has reviewed the resulting plan and the carrier approval. `--apply` rechecks the exact live carrier configuration, active traffic and linked number before calling the fixed procedure. Reapplying unchanged data is idempotent. Review the append-only automation audit; retain the original events.
8. Configure the backend:

```text
PLOTLINE_HIRING_SMS_CAMPAIGNS_JSON={"platform":{"from":"+17197165766","brandId":"BCGLCIL","campaignId":"VCZOP4JO","scope":"all_agencies"}}
```

The sender registration requires `platformHiringSender:true`, `hiringJourneyApproved:true`, `applicationOptInApproved:true`, `interviewOnly:false`, `hiringConsentVersion:"plotline-hiring-2026-11-26.1"`, and the reviewed `hiringJourneyApprovalDigest`. The fixed upgrade creates these flags. An invalid or mismatched explicit runtime map does not fall back to another sender for broad hiring notices. Retain the existing interview map if needed for rollback; upgraded shared senders resolve through the new map.

9. Verify the existing authenticated Vonage inbound webhook and application-owned STOP/HELP configuration from the earlier handoff, worker execution, and QA recipient restrictions. `opt_out_assist:false` remains application-owned. Do not enable duplicate carrier/app keyword responses.
10. Verify with authorized test recipients: email-only application, signed but pending review, reviewed confirmation, upcoming invitation/reschedule, canceled appointment, all reminder offsets, actual reference outreach/completion, pre-hire/onboarding invitation, newly assigned document, phone/agency mismatch, and STOP. Ensure email works throughout. No existing verbal interview-only or old agency consent is bulk converted; the applicant needs the current broader signed choice for the shared program.

The historical public number/brand/campaign values above are fixed in the upgrade plan. They are not a claim that this chat changed their current live configuration. Recheck readiness at release time. If the carrier requires a different approved campaign, this fixed upgrade must be revised and reviewed first; do not bypass the mismatch checks.

## Carrier registration wording for review

Suggested description: “Plotline People Operations sends optional transactional hiring notifications on behalf of the hiring organization named in an applicant's form. Messages identify both Plotline People Operations and that organization. Traffic includes interview scheduling and reminders with join links, reference outreach and completion progress, pre-hire and onboarding portal invitations and progress, and notices of documents or tasks assigned to that applicant. No marketing or confidential reference answers are sent.”

Suggested ONLINE_FORM detail: “Applicants choose Email and text in the identified organization's application or available notification preference form. Email only is selected by default. The form presents the full program description, message frequency and charges, HELP/STOP, terms and privacy links. Applicants enter their own US mobile number and full name and separately check control-of-number and electronic-signature confirmations. Both begin unchecked. We retain the organization, disclosure/version, number, signature, affirmative choices and timestamp. Staff review precedes enrollment confirmation; other hiring texts require confirmation to be accepted. Applying, providing a phone number, or declining optional texts does not enroll a person or affect their application or employment. One choice covers the listed stages for the named organization; other organizations require a separate choice.”

Use the actual implemented branded messages as samples; do not include real applicant names or private live links. Examples: “Plotline People Operations · ITSCO: Your interview is scheduled for [date/time]. Join: [branded candidate URL]. Reply STOP to opt out.”; “Plotline People Operations · ITSCO: We contacted your references for your application. Reply STOP to opt out.”; “Plotline People Operations · ITSCO: Your private pre-hire portal is ready. [personal portal URL] Keep this personal link private. Reply STOP to opt out.”

References: [Vonage campaign requirements](https://api.support.vonage.com/hc/en-us/articles/12132309081500-10DLC-Campaign-requirements), [Vonage campaign API and structured message flow](https://developer.vonage.com/en/api/10dlc). These support including every collection method and identifying the online evidence resource; the release coordinator must verify actual approval.

## Rollback and storage

Disable the new runtime map to stop broader shared-line enrollment/delivery; leaving it invalid also fails closed. Preserve outbox failure/sending receipts and consent/audit history. Restoring interview-only service needs a separately reviewed restoration of the original fixed registration and old runtime map; never bulk migrate broader grants to another campaign or silently erase STOP. This chat does not execute rollback in production.

Temporary dependencies are symlinks to the existing installation. The local DB, build outputs, browser server and checkout are removed after validation and push where safe. Screenshots and the exact-SHA release handoff are retained in the primary checkout's ignored `deliverables/plotline-hiring-notifications-2026-11-26/` folder. No unrelated worktree or personal artifacts are deleted.
