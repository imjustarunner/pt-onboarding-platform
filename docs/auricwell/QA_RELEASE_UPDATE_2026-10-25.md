# New QA handoff update: operational support access

This is a separate supplement. The original bot instructions have not been edited. Forward this file with `QA_ADDENDUM_2026-10-25.md`.

**Unattended testing remains disabled.** The permission changes below are published; this does not certify the remaining enrollment, scheduling, delivery, supervision or record-isolation acceptance cases. Deployment and browser receipts are recorded below.

## Copy-and-send update

> A support role already exists. Use `qa.support.auricwell@example.com` through the normal demo login, never an administrator or superadmin preview. Its authorized organizations are AuricWell QA Mental Health — DEMO (450) and its affiliated Cedar Grove K-8 — DEMO school (451). The provider account belongs only to 450. Support coordinates clients, contacts, schedules, Client Exchange and basic account/status information. It must not read clinical note bodies or completed medical documents, sign/cosign notes, configure the agency, provision staff or grant privileges. The server now blocks the audited clinical and administrative routes. A browser-router rule that treated support as admin was also removed; support must be explicitly allowed on a route. Preserve the role and tenant denial checks in every run. Each synthetic person's Messages screen now includes their own original-recipient email copies; independently verify actual delivery to testing@itsco.health. Do not start unattended writes until the remaining acceptance gates pass. Keep setup-admin credentials owner-only.

## Published changes and evidence

The existing `/auricwell-qa-demo/admin` route now renders **Support Dashboard** for this role. Its URL is a legacy route name; authorization comes from the ordinary support account. No impersonation or elevated preview is used.

- `99927ca01b59fa8b0e439179da5ea3dd5fef9235`: server permission restrictions, status-only client view, fresh Exchange membership checks, explicit synthetic Exchange notification roster, recipient-specific QA email panel and the new handoff documents.
- `f42b5a9df0376e2a3a7a0daa5e9da644e6852f8d`: removes support's implicit browser admin access while retaining explicit operational access.
- `bf04e7b097561f997ff920f902d3d3ef9be90e80`: gives support its own operational navigation and shortcuts; removes clinical/admin shortcuts and background payroll/document/hiring requests; denies the completed uploaded-document inbox/download/assignment routes; preserves the email panel when an unchanged account profile refreshes.
- The first release's [backend deployment](https://github.com/imjustarunner/pt-onboarding-platform/actions/runs/40188712403) and [frontend deployment](https://github.com/imjustarunner/pt-onboarding-platform/actions/runs/40188712409) succeeded. Scheduling regressions in Denver/UTC and guardian billing/insurance checks also passed.
- Local backend suites passed: 165 QA/support/Exchange/scheduling cases after the uploaded-document restriction, 46 account-support cases and 14 policy/email/summary cases. Some suites overlap. The final frontend suite passed 61 cases, including settings denial and continued client/Exchange/schedule access. Production builds passed.

At 11:31 UTC on October 25, ordinary provider/support login and the deployed API preflight passed:

| Check | Observed result |
|---|---|
| Provider organizations | Only agency 450 |
| Support organizations | Only demo agency 450 and demo school 451 |
| Provider/support Exchange list for 450 | 200 |
| Provider/support own QA email inbox | 200 |
| Support client list | 200; zero visible active clients |
| Support contact documentation | 200 |
| Support clinical-note context | 403 |
| Support administrative people/settings snapshot | 403 |

The initial browser check displayed the new recipient email panel on desktop and mobile, but correctly failed because `/admin/settings` remained reachable. That failure is retained in `browser-verification-initial.json`. Investigation found the implicit support-to-admin router equivalence; the second commit fixes it. Final deployment and browser results follow below.

Evidence directory: `deliverables/qa-support-addendum/`. The earlier `verification.json` and `live-read-only.json` remain historical local/pre-change receipts; use the new `deployed-preflight.json`, final `browser-verification.json` and `release-verification.json` for this release. No password, session token or email body is included in those receipts.

## Remaining launch gates

1. Complete the four English/Spanish school/office enrollment and provider/support booking/cancellation cases with synthetic records, including direct record-level cross-tenant denials. Organization-list membership and a few denied endpoints do not certify the entire platform.
2. Prove portal invitations and approved blank document/questionnaire dispatch without giving support completed medical-content access. Exercise the status-only client panel with real synthetic session/note/claim statuses; the empty demo has no such evidence yet.
3. Trigger actual workflow emails, verify original-recipient copies for provider/support/guardian/client, deny other-person email reads, and independently verify receipt at testing@itsco.health. The inbox requires a unique `@example.com` login, the persisted `is_demo=1` flag, and active membership in synthetic-only agency 450. Confirm normal enrollment supplies that demo identity/membership for every new guardian/client; this propagation has not been proven with a new enrollment. If it is missing, stop and correct the scoped provisioning flow—never give bots admin access to patch accounts. Confirm provider SMS at +16189107000. An empty inbox or a logged transport attempt is not a delivery pass.
4. Owner-provision the supervisor/supervisee fixtures, quiz and eligible services/availability. Additional providers need an explicit Exchange roster and verified access to both interfaces; no bot receives staff-provisioning privileges.
5. Configure the external Grok coordinator for 05:00 America/Denver, a shared run lock, secret references, screenshots, mailbox checks and population counting. Enforce 30 total clients including archived records and 10 providers; these are runner/provisioning limits, not database quotas on every write path. Keep two future weekly appointments for timed reminder checks.

No client/provider fixtures were created, no test messages were sent and no daily scheduler was enabled during this audit. The owner can retain the existing demo logins; no credential reset or promotion is needed.

The initial mobile Messages screenshot showed the floating Live Chat control overlapping the channel area; its position changes with the email panel's expanded state. Track that layout issue separately. Screenshots are UI evidence, not a completed full messaging acceptance test.

## Final deployed verification
At 2026-10-25T12:01:46.165Z, the final read-only browser check passed against the deployed code. Both administrative settings URLs redirected the ordinary support account to its Support Dashboard. Clinical-note context, administrative configuration and the completed uploaded-document inbox returned 403. ITSCO's private organization lookup returned 404 by design, and its Client Exchange returned 403. No real-client response content was read or retained.
The dashboard showed the operational Support workspace. The check found zero forbidden clinical/admin dashboard links and zero background requests to the uploaded-document inbox or payroll summaries. The per-person email panel remained visible. There were no browser page errors or failed asset requests in the final check.
All final deployment/regression workflows succeeded:
- [Scheduling regressions](https://github.com/imjustarunner/pt-onboarding-platform/actions/runs/40190836512)
- [Deploy Frontend to Cloud Run](https://github.com/imjustarunner/pt-onboarding-platform/actions/runs/40190836506)
- [Deploy Backend to Cloud Run](https://github.com/imjustarunner/pt-onboarding-platform/actions/runs/40190836518)

The intermediate rollout attempt is retained in `browser-verification-during-rollout.json`: the checker initially expected 403 for an intentionally concealed organization lookup that correctly returns 404, and one page rendered blank before rollout completion. The final check accepts the documented 403/404 denial and passed after both services finished deploying. This was not counted as a successful test at the time.

Screenshots: [support dashboard after settings denial](../../deliverables/qa-support-addendum/support-settings-denied.png), [desktop Messages](../../deliverables/qa-support-addendum/support-messages-desktop.png), [mobile Messages](../../deliverables/qa-support-addendum/support-messages-mobile.png). These filenames identify the final capture; earlier JSON receipts retain their earlier observations.

**Result: the scoped access and UI checks passed; unattended daily launch remains blocked by the workflow/setup gates above.**
