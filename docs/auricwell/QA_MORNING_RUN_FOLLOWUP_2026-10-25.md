# AuricWell QA morning run fixes and retest instructions

Send this supplement to the Coordinator alongside the existing instructions. Keep the October 25 FAIL brief and screenshots. The supervisor pair now exists, and the four submitted packets have been located. The full daily journey still needs a successful retest before it can be called ready.

## Accounts and organization scope

Use ordinary staff login at https://app.itsco.health/auricwell-qa-demo/login. Primary testing uses the full ITSCO-style platform. The secondary interface is https://auricwell.com/app/auricwell-qa-demo, using the same platform credentials.

If the welcome briefing covers the page, finish loading it and click **Enter Dashboard**. The optional **Don't show this briefing again on this device** checkbox prevents it from covering subsequent pages in that browser. Dismiss it through the visible controls before testing the page underneath.

| Persona | User ID | Login | Access |
| --- | --- | --- | --- |
| Original provider | 1433 | qa.provider.auricwell@example.com | Provider |
| Support | 1434 | qa.support.auricwell@example.com | Support only |
| Clinical supervisor | 1438 | qa.provider.supervisor.auricwell@example.com | Provider with supervisor privileges for the assigned supervisee |
| Supervisee | 1439 | qa.provider.supervisee.auricwell@example.com | Provider |

All four staff identities have active membership only in demo agency **450**. School **451** is Cedar Grove K-8 — DEMO. Clinical organization **452**, Cedar Grove Counseling — DEMO, now supplies the office enrollment destination. Office location **9** remains Cedar Grove Counseling Office — DEMO. These are the permitted demo organizations; their affiliation does not grant organization settings access.

The owner has separate private `supervisor.json` and `supervisee.json` credential files in `secrets/auricwell-qa/`. Share each only with its assigned tester. Passwords are not in this document. Never share `setup.json`, the combined provisioning receipt, or administrator credentials with bots.

Clinical supervision assignment **123** links supervisor **1438** to supervisee **1439** in agency **450**. Agreement **413** is unsigned. Each assigned bot may complete the normal agreement and note review screens as its own fictional persona. Do not insert signatures or completed statuses directly into the database, use another person's identity, or treat the assignment itself as a successful cosign test. These fictional accounts do not represent verified professional licenses.

The Exchange notification roster contains exactly providers 1433, 1438 and 1439. The new providers must publish their own appropriate profile and availability before being expected to appear as selectable providers. The original provider currently has virtual working hours; in-person availability remains to be published and tested.

## Corrections to the enrollment evidence

| Journey | Packet | Retained clients |
| --- | --- | --- |
| School English | 1262 | 2259, Riley QA-SchoolEN-1025 |
| School Spanish | 1263 | 2260, Sam QA-SchoolES-1025 |
| Office English family | 1264 | 2261, Avery-Jr QA-OfficeFam-1025; 2262, Taylor QA-OfficeFam-1025 |
| Office Spanish self | 1265 | 2263, Dana QA-OfficeES-1025 |

All five records were saved in agency 450 with workflow status `PACKET`, no assigned provider, and no clearance to begin services. A submitted packet does not automatically become an assigned caseload. Support must locate it in the intake/client review workflow, check its operational readiness, and complete the permitted assignment or Exchange steps. Do not mark a client cleared merely to populate a provider list.

The three office clients were incorrectly associated with school 451 because the demo had only a school organization. Clinical organization 452 fixes the destination for subsequent office intake. The original five records and their documents remain unchanged as failure evidence; do not use those office records to claim that routing passed.

All four packets share guardian user **1437**, whose login is `testing@itsco.health`. That is one account, not four independent family identities. Do not use it for family-isolation acceptance tests. New QA enrollment rejects that shared inbox as the guardian identity and marks completed isolated QA guardians for their own test-email view.

## Separate account identity from email delivery

Use a unique `@example.com` login for each unrelated family or self-enrolling adult, such as `qa.guardian.school-en.20261026@example.com`, `qa.guardian.school-es.20261026@example.com`, `qa.guardian.office-family.20261026@example.com`, and `qa.client.office-es.20261026@example.com`. Siblings may share a guardian; unrelated households must not. Add a run suffix if an identity already exists. Keep each password or setup link private in the bot's credential store.

`testing@itsco.health` is the external delivery inbox only. Keep original `@example.com` recipients in account records and messages. For each invitation, assignment, confirmation, cancellation and reminder, verify both the recipient's **Messages → Email** view and actual arrival in the external inbox. A generated/sent receipt is not proof of delivery. Verify that another guardian or provider cannot read that recipient's email through a pasted message URL.

Choose **No** for synthetic client and guardian SMS. Do not reuse the owner's phone for client text subscriptions. The QA SMS delivery restriction permits only staff-purpose messages to the original provider's **+1 618 910 7000**; normal sender registration, consent and STOP checks still apply. The new providers have no phone number. Actual SMS delivery remains blocked until the demo's registered sender and provider opt-in are verified.

## Retest the reported failures

| Check | Expected behavior and evidence |
| --- | --- |
| Direct login | Open the login URL in a fresh browser, sign in normally, and reach the correct demo dashboard. Capture the final URL and any failing response. The previously reported domain error did not reproduce in the fresh provider check. |
| Session expiry | Distinguish an idle-session timeout from token expiry. The login token observed lasts 24 hours; the server separately enforces inactivity. The observed policy starts its countdown after 3 idle minutes and expires after another 10 minutes. Exercise the normal warning/re-authentication flow, save progress, and sign in again after expiry. Do not keep sessions alive through fake activity or bypasses. Report any expiry during sustained normal interaction. |
| Spanish links | Open each Spanish URL in a fresh browser and again after using an English form in the same browser. Initial UI and inherited form content should remain Spanish. Explicit language switching should still work. Check insurance fields, validation messages and payment follow-up text individually. |
| Phone paste | Paste `+1 618 910 7000` and expect `(618) 910-7000`; compare with `6189107000`. Invalid extra digits must stay invalid instead of becoming a different ten-digit number. Test formatting without opting synthetic clients into SMS. |
| Self-pay consent | With card collection unavailable, click payment follow-up without agreement or signature: stay on the step with an error. Repeat with only one completed, then both. Final submission must also reject missing authorization. Card deferral does not grant payment authorization or readiness for paid services. |
| Provider and slot | The QA directory should show only eligible providers from the three-person roster. Publish virtual/in-person availability through the provider's normal controls; capture it. Choose a compatible provider and actual opening through intake, then verify the hold/request and support assignment. A preference or hold is not a confirmed appointment. Check unavailable, occupied and incompatible openings. |
| Timezone | Intake preferences should default to the agency schedule zone, `America/Denver`; an explicit user change must persist. Virtual hours must label their zone. Log Time should use the saved account preference. Compare stored timestamps with displayed Mountain time, including dates across the November DST change. |
| Office routing | New office clients should use agency 450 and clinical organization 452; school clients should use school 451. Capture packet IDs, all client IDs and the assigned provider separately. |
| Training | The document-learning endpoint now loads current employment status before evaluating library access; ordinary login tokens omit that status. Retest the learning library and capture the failing endpoint if denied. Restricted documents and an unassigned quiz are not reasons to elevate a provider. Require a demo-scoped synthetic assignment before scoring quiz completion. |

Continue using the four existing enrollment URLs; this supplement does not replace them. Do not submit real payment details, transmit claims, or release payroll as part of these synthetic journeys.

## Support and supervision acceptance

Support must find the new packets, view contact and operational session/note/billing status, add contact notes, send portal/document/questionnaire invitations, see provider schedules, book on behalf of a provider, and follow cancellation steps. Capture actual saves and resulting notifications. Support must still be denied administrative settings, staff role changes, medical attachments, progress-note bodies, signing and cosigning. Verify denials with the retained demo client IDs; a hidden button alone is insufficient.

Use a newly valid synthetic client for Exchange and supervision. Support posts the Exchange listing and records matching criteria; an eligible provider views it and applies. Record unmatched criteria and rejection reasons, then verify permitted assignment. No notification may reach a real agency or provider.

The supervisee writes and signs a synthetic note through the normal workflow. The assigned supervisor reviews and cosigns it. Reload to verify author, version, reviewer and timestamps; test an amendment's review requirements. The original provider and support must be denied unauthorized clinical access. Capture whether support can see the note's status without its contents. Report unavailable or denied secondary-EHR actions separately and use the full platform for the primary supervision test.

## Daily limits and actionable brief

Keep the **5 a.m. America/Denver** run and retained records. Start the population count with **3 providers and 5 clients**; count retained/archived clients toward the **30-client maximum** and all provider identities toward **10 providers**. Count the office family as two clients. Reserve capacity before a multi-client submission. At the cap, reuse eligible retained synthetic records; bots must not create providers or obtain admin access to increase capacity.

Retain at least two scheduled synthetic sessions each week long enough to exercise reminders; use separate appointments for immediate cancellation tests. Capture intended reminder times in Denver and verify the recipient's email view and external inbox. Keep screenshots, packet/client/appointment IDs, steps, expected/actual results, response status, browser timezone and run timestamp. Redact passwords, login links, session tokens and clinical content from broadly shared evidence.

The bot's original manifest and screenshots remain on its computer at `/workspace/auricwell-qa/manifest.json` and `/workspace/qa-2026-10-25/`. Attach the relevant screenshots to each retest result. Local engineering evidence is under `deliverables/qa-morning-followup-2026-10-25/`.

Use `PASS`, `FAIL` or `BLOCKED` per journey. A morning brief must name the first blocking step, evidence location and responsible follow-up. Until assignment/booking, independent family access, dual-email receipt, reminders, support permissions, Exchange and cosigning have passed together, report the overall environment as **not yet fully verified**.

## Live verification added after the fixes

The intake, consent, identity, timezone and training corrections were published to `main` in `62693be96` and `1f739a5b7`. Both backend and frontend deployments succeeded. The scheduling regression workflow passed in both UTC and America/Denver, including its provider-offboarding job. A further dashboard correction in `18034fe57` supplies the agency ID when fetching note counts; the old request returned HTTP 400 and silently omitted drafts. The deployed request now returns HTTP 200 with agency 450.

| Verified on the deployed demo | Result |
| --- | --- |
| Four enrollment URLs | HTTP 200, correct English/Spanish link language, scheduling timezone America/Denver. Spanish start screens remained Spanish with an English browser preference saved. |
| Public virtual provider directory | Includes provider 1433 and excludes providers outside the explicit QA roster. This is directory eligibility, not a completed booking. |
| Provider and support direct login | Fresh ordinary password logins reached the demo dashboards. No superadmin credentials or impersonation were used. |
| Supervisor and supervisee | Both signed in to the full platform and the secondary EHR as providers. EHR context returned practice 450. Both could access their supervision agreement endpoint and their own email inbox. Requests for the real agency's Exchange were denied. |
| Support boundaries | Operational status for retained clients 2259, 2261 and 2263 was accessible. Clinical-note context, administrative settings and the real agency's Exchange were denied. |
| Provider learning and timezone | Document-learning and on-demand library endpoints returned HTTP 200. Saved account timezone and virtual-hours response both reported America/Denver. No training module is currently assigned; quiz completion remains untested. |
| Messages email view | The support email panel rendered with its own `@example.com` address. All staff's own email endpoints were accessible. The checked inboxes were empty, so these checks do **not** establish delivery or reminder success. |

The first browser pass retained two unexpected supervisor HTTP 403 responses and a stalled supervisee username step. A subsequent fresh-browser pass succeeded on all 12 pair checks without changing their roles or credentials. The cause of that initial interruption is unconfirmed; report it if repeated. Do not discard the earlier failed evidence. A separate optional Skill Builders assigned-events request returns HTTP 403 because that program is disabled in this demo; record this independently from learning-library access.

Engineering checks passed: **142 backend morning regressions, 165 backend support regressions, 84 frontend regressions and 19 Node tests**, plus the frontend production build. These checks do not substitute for completing the normal enrollment, assignment, booking, reminder, Exchange and cosign journeys.

Evidence files in `deliverables/qa-morning-followup-2026-10-25/` include `deployed-browser-verification.json` (initial pass, including failures), `supervision-browser-verification.json` (successful pair recheck), `input-and-agreement-verification.json`, and the accompanying screenshots. No new clients were submitted during these engineering browser checks. The existing five clients remain available for investigation.

The deeper agreement check found an additional issue: the agreement endpoint returned HTTP 200 with an empty list because the shared meeting policy excluded all demo users. Commit `8dbc9196c` allows only active, explicitly rostered QA clinicians with current membership in the verified agency 450. Ordinary demo accounts remain excluded. This does not grant access to real agencies or remove meeting invitation, ownership or signature requirements. The before-fix evidence is retained in `input-and-agreement-before-membership-fix.json`; the post-fix check must verify agreement **413** in the response, not just HTTP 200.

The deployed backend now returns unsigned agreement **413** to the supervisee, with supervisor **1438**, supervisee **1439** and agency **450**. The subsequent browser check exposed a separate routing defect: the agreement page's organization alias lacked the route metadata needed to preserve its agency, so ordinary providers were redirected to the dashboard. Commit `dd1ae03cd` defines the scoped route explicitly. Use **https://app.itsco.health/auricwell-qa-demo/supervision/agreements** after signing in. Retained before-fix evidence is in `supervision-before-route-fix.json`.

**Final verification, October 25 at 7:38 a.m. America/Denver:** both deployments at `dd1ae03cd` succeeded, and the scheduling workflow passed. Both providers opened the actual agreement screen through ordinary login, saw agreement 413 with the correct party roles, and were denied requests to inspect another agency's supervision records. The agreement remains unsigned for the bots' normal signing test. See `supervision-final-verification.json`, `release-verification.json`, and the two `*-agreement-final.png` screenshots. The [evidence index](../../deliverables/qa-morning-followup-2026-10-25/README.md) links the checks and screenshots.

The fixes and accounts are ready for the Coordinator's next retest. Keep the overall daily journey **not yet fully verified** until the acceptance work above passes; deployment success and account access alone are insufficient.
