# Plotline shared interview SMS activation handoff

**Awaiting the separate release chat. Not deployed.** This status applies to the new shared-sender implementation and app activation in this feature branch. Prior production actions are recorded separately below.

Branch: `codex/plotline-sms-activation-20261126`. The final chat handoff supplies its full commit SHA. No coordinator name or account ID is required.

## Resulting behavior

One platform-owned Plotline number can serve interview reminders for every agency using Plotline. The shared default must be explicit, and the number must have no agency owner, have purpose `platform_contact`, and carry both `interviewOnly` and `platformInterviewSender` registration flags. Existing agency-specific mappings keep their ownership checks. An explicit `null` agency mapping disables the program for that agency.

Each outgoing text still verifies the actual interview agency, current consent, exact recipient, sender and campaign, successful opt-in confirmation, active future appointment, RSVP, reminder settings, and QA recipient restrictions. Delivery retains the interview agency for attribution. The shared line remains restricted to interview messages and authenticated keyword replies. No old appointments or recipients are opted in by this feature.

The provisioning command defaults to printing a plan. Preview/apply modes refuse ordinary application, human, administrative, or overly privileged database accounts. They accept only the fixed procedure-only automation account. Apply also rechecks the exact live carrier campaign, linked number, HELP contact, and configured reply callback before inserting app records. The procedure never updates or deletes existing records, changes consent, or assumes a human audit identity.

## Prior actions before the release-only instruction

These actions had already happened before the user assigned deployment ownership to the separate release chat:

| Item | Recorded result |
| --- | --- |
| Dedicated number | Purchased `+17197165766` / **719-716-5766** |
| Brand | `BCGLCIL` — Plotline People Operations / Plot Twist Co |
| Campaign | `VCZOP4JO` — Plotline People Operations — Interview Reminders |
| Last carrier verification | `ACTIVE`, traffic enabled, number `LINKED`, November 26, 2026 at 7:50 PM Mountain Time |
| Registered HELP contact | `support@plotlinepo.com` |
| Keyword ownership | Application-managed STOP and HELP; carrier opt-out assist is off |
| Last observed per-number reply URL | Unset; the release coordinator must configure and recheck it |
| Existing runtime flag | `PLOTLINE_INTERVIEW_SMS_CAMPAIGNS_JSON` was absent at the earlier configuration inspection |
| Earlier webhook fix | `be0364d9cb3d14da1438cb87d472b375a45a8b5a`, pushed to main before the release-only instruction |
| Earlier deployments | [Backend 45930296442](https://github.com/imjustarunner/pt-onboarding-platform/actions/runs/45930296442) and [frontend 45930296484](https://github.com/imjustarunner/pt-onboarding-platform/actions/runs/45930296484) started before that instruction and later completed successfully |
| Application provisioning | No new automation identity, number registration, consent, or runtime activation was applied in production |
| Recipient SMS | None sent |

The earlier webhook fix accepts an empty GET setup probe and continues rejecting unsigned message callbacks. Its prior deployment is distinct from this unmerged shared-sender feature. No running deployment was cancelled. Original provider action evidence is retained in the JSONL file beside this handoff.

## Validation

From the repository root:

```sh
node frontend/node_modules/vitest/vitest.mjs run --config backend/vitest.plotline-sms-activation.config.js
```

For the integration test, use a disposable local database on port **43327** and set `PLOTLINE_PROVISIONING_TEST_MYSQL_URL` to its test-only connection URL. The test creates and removes its own database and automation account. It rejects other hosts/ports and never loads `backend/.env`.

- 78 tests passed across six files with the database test enabled, using local MySQL **9.5.0**. These cover the signed webhook, two-agency delivery, mismatched agency and recipient rejection, STOP, generic SMS restrictions, existing SMS compliance, scoped credentials, fixed manifest and grant boundaries, real SQL execution, idempotency, conflicting ownership, and automation audit attribution.
- The ordinary run passed 77 tests and skipped the opt-in database test before a disposable database was available. That skip was resolved on local MySQL 9.5.
- Docker Desktop startup did not provide a usable Docker engine. Exact MySQL **8** execution was not completed here; repeat the integration test on the release environment’s MySQL version before provisioning.
- No production database writes, live SMS delivery test, app activation, or new-feature deployment occurred after the release-only instruction. Production readiness and a consented end-to-end interview SMS test remain the release coordinator’s checks.
- A full frontend build was not run for this backend-only feature. The coordinator owns combined validation and the paired backend/frontend release.

## Release requirements and order

1. Integrate this feature branch with current main and validate the combined changes. Deploy the paired backend/frontend release through the release chat’s normal process.
2. Verify existing schema migrations `1538_sms_campaign_consent.sql` and `1862_plotline_interview_sms_consent.sql` are applied. This feature adds no automatic data migration. Do not place the manual provisioning SQL in the automatic migration directory.
3. Recheck brand `BCGLCIL`, campaign `VCZOP4JO`, number `17197165766`, `ACTIVE`, `traffic_enabled=true`, and `LINKED` through the existing authorized Vonage integration. Preserve the approved campaign fields. Do not purchase another number or relink this number to another campaign.
4. Configure the number’s inbound SMS URL to `https://plottwisthq.com/api/vonage/inbound`. An empty GET should return `200 {"ready":true}`; message parameters without a valid Vonage signature must still return `403`. Confirm the number’s saved `moHttpUrl` exactly matches this URL. Keep production signature validation enabled.
5. Bootstrap the scoped identity below using the user’s authorized cloud operations access. Do not use an application superadministrator, human application session, JWT, or human audit actor.
6. Run the provisioner with `--preview`, inspect the result, and run `--apply` through the scoped identity. Apply performs read-only carrier and callback verification followed by the fixed procedure. It makes no recipient enrollments or SMS sends. Ownership/configuration conflicts stop the operation for review.
7. Update only `PLOTLINE_INTERVIEW_SMS_CAMPAIGNS_JSON` to the JSON in `runtime-config.json`, preserving all other service configuration. Per-agency keys may override or explicitly disable the shared default.
8. Verify the program is available for at least two real enabled agencies without exposing their interview or candidate data to one another. Use a controlled recipient with explicit interview text consent to test confirmation, reminders with the join link, HELP, STOP, and continued email/RSVP operation. Do not bulk-opt in existing interviews.

## Scoped identity bootstrap

The user explicitly authorized this scoped identity and an all-agency Plotline interview rollout. Creation and execution are deferred to the release coordinator under the later release-only instruction.

| Resource | Scope |
| --- | --- |
| Cloud service account | `plotline-sms-provisioning@ptonboard-dev.iam.gserviceaccount.com` |
| Database login | `plotline_sms_auto_20261126` |
| Procedure | `provision_plotline_sender_20261126` |
| Procedure SQL | `backend/src/scripts/sql/plotline-interview-sender-20261126.sql` |
| Fixed plan and hash | `backend/src/utils/plotlineInterviewSenderProvisioning.js`; the command’s `--plan` output includes the exact hash |
| App audit | `user_id=NULL`, `agency_id=NULL`, actor type `automation`, actual SQL session identity, fixed manifest hash, and a clearly labelled configured service account |

Use a dedicated generated password stored in Secret Manager and pass only its reference into the job. Grant this service account Cloud SQL connection access scoped to `ptonboard-mysql` and secret access only to its database credential and the necessary Vonage credential references. Cloud audit records must retain the actual operational IAM attribution. No application role is needed.

An authorized schema/bootstrap operator installs the immutable procedure in the intended application database and creates the dedicated database login. Generate/store the password without printing it or placing it in command arguments, repository files, or logs. Use parameterized SQL for credential creation. Grant **only EXECUTE on that one procedure**, with no table privileges or broad roles. `plotlineSenderGrantSql(database)` generates the grant safely. Do not drop/redefine an already applied procedure or overwrite an existing conflicting login/registration. Reconcile conflicts explicitly.

The procedure is SECURITY DEFINER so the invoker can perform only this manifest. It checks the actual login with `USER()`, requires the exact plan hash, binds the number/brand/campaign/purposes and null agency owner, refuses existing conflicts, and appends a single automation audit event. It is idempotent. Existing records and audit history are preserved.

Run the command from the deployed backend image in a job using that service account:

```sh
node src/scripts/provisionPlotlineInterviewSender.mjs --plan
node src/scripts/provisionPlotlineInterviewSender.mjs --preview
node src/scripts/provisionPlotlineInterviewSender.mjs --apply
```

Preview/apply require `DB_USER=plotline_sms_auto_20261126`, the intended `DB_NAME`, `DB_SOCKET` or `DB_HOST`/`DB_PORT`, and `DB_PASSWORD` via its secret reference. Apply also requires the existing authorized `VONAGE_API_KEY` and `VONAGE_API_SECRET` credential references for GET-only verification. The command never loads a broad local `.env` file, creates authentication tokens, purchases numbers, modifies carrier records, sets runtime flags, or sends SMS. Keep job retries at zero for this reviewed operational step.

Inspect the appended `automation_plotline_sender_registered` event, the actual SQL identity, null human actor columns, and the platform-owned number/registration after apply. The procedure-only account must be unable to select or update tables directly. Retire the one-time job’s access when the coordinator no longer needs it, preserving its audit evidence and the functioning app registration.
