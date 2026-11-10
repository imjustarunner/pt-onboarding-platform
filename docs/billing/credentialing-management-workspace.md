# Credentialing management workspace

`/admin/credentialing` (also under the organization's URL prefix) opens an all-agency credentialing workspace. `/admin/credentialing/records` preserves the detailed editor for documents, payer contacts, provider credentials, effective dates, locations, and agency group NPIs. Existing panel deep links redirect to the records editor.

## Access and setup

1. Apply main migration `1496_credentialing_workspace.sql` before deploying this workspace. Existing credentialing migrations 534, 916 and 1012 and the current clinical billing schema are prerequisites. No production migration was run as part of implementation.
2. Assign credentialing access using the existing agency permission controls. Staff, support and admin users receive only their server-authorized credentialing agencies, including active affiliation descendants under existing rules. PlotTwistCo employment or the selected branding alone does not grant access to every tenant. Super admins can see active agencies.
3. Select an agency; use **Add / manage enrollment** to maintain providers, agency group NPIs, payer definitions, effective dates and documents. The editor now uses the same authorized agency directory as the management workspace.
4. Under **Payers & connections**, map each agency's payer definition to the verified Claim.MD electronic payer ID and record the source reference. Name similarity does not establish a match. This is an audited administrative mapping, not a payer-directory verification API call.
5. Review each provider/group credential. Record explicit status, follow-up/revalidation dates, next action, and evidence. For a provider credential, link the relevant agency group NPI. Group/location credential records remain independently tracked. A provider's workspace group link represents one billing context; it does not establish credentialing at all other locations or group NPIs.

Credentialing staff see provider identity, agency/payer credentials, electronic enrollment status, and aggregate claim counts by lifecycle. They do not receive patient identities, charges, balances, remittance amounts, portal secrets or raw claim payloads through this API. A separate billing permission is required to open the financial workspace. Existing detailed credential documents and portal access remain governed by the established credentialing permission.

## Status and linkage

- Historical effective/returned dates show **verification needed**, not automatically active. Explicit active status requires a recorded effective date that has started and a source reference.
- Credentialing/contracting status, claims enrollment, ERA enrollment and eligibility enrollment are distinct. Electronic enrollment rows must match the agency's current Claim.MD connection, agency, payer ID, group NPI and office. Missing data is displayed as unrecorded/unavailable.
- Claim linkage uses agency + electronic destination payer ID + billing group NPI, plus actual session provider for individual credentials. New primary claims save the destination ID during draft creation and submission; secondary claims already do so. Older claims without an ID are not guessed from payer names or silently backfilled. Counts are operational lifecycle counts, not proof of payment or credentialing eligibility.
- Changes to tracking or payer mappings require a source reference and append an audit event in the same database transaction. Source-row locking plus version checks prevents two initial saves from overwriting one another. Conflicts require refreshing the record.
- This workspace does not submit payer enrollments, send claims, change submission gates, verify CAQH, or verify payer enrollment automatically. Configurable team reminders supplement the recorded follow-up dates and link to the existing tools. Existing clinical/billing readiness checks still govern submission.

## Validation

Backend and frontend tests cover authorization, scope changes, safe response fields, current-account enrollment filtering, unavailable data, evidence/history, stale writes, and claim-submission regressions. The opt-in `credentialingWorkspace.mysql.test.js` applies the migration to a disposable local schema, queries synthetic records, and runs five concurrent initial saves (one accepted, four conflicts). It uses only the local test socket and removes its schema afterward.

## Payer documents, reminders and optional case email (November 9, 2026)

Apply migration `1783_credentialing_operations.sql` after the existing credentialing workspace migrations. This implementation does not run production migrations or activate customer add-ons.

- Payers have their own document collection in the detailed payer editor and workspace review drawer. PDF/image uploads (12 MB maximum) are encrypted before private storage and read through an authenticated, audited endpoint. Responses never contain the storage path or a public document URL. Document records are shared with the selected payer’s fee-schedule view through verified payer links; billing access alone never grants document access.
- Individual provider profiles, provider–payer credentials, agency group credentials, and payers can schedule multiple team reminders. Provider profile reminders cover license expiration even before any payer enrollment exists. Times are saved in UTC and displayed locally. The minute worker locks due reminders and commits authorized recipient notifications with delivery status. Overdue reminders with no current recipient remain pending. Complete or cancel reminders from their record.
- A provider–payer credential can optionally create one receive-only address using the practice’s configured receiving `app@` identity and the existing plus-address routing. Merely viewing, adding or importing a credential never creates email. Repeated creation returns the saved address. No new Google Group, outbound sender or mailbox credential is provisioned. The base app identity must have an active inbound route and its configured mail transport must actually deliver mail to the existing inbound agent.
- Exact, opaque case addresses select the record. Sender names, subjects, and payer names never infer a match. The existing encrypted support-ticket intake saves messages and attachments, tags the ticket `credentialing`, and links it to the provider–payer case. Receipt retries are deduplicated. Gmail threads cannot merge separate credentialing cases. Case addresses cannot send replies through the general ticket email endpoint, and they do not generate automatic reply drafts.
- Credentialing email and documents require agency-admin, super-admin, or explicit credentialing access. General support/collaborator/claimant access is insufficient. Credentialing email is kept out of the general support email review, and it cannot fall back to an unrelated team inbox. Notifications link to the record; opening it acknowledges that user’s notices.

## AuricWell add-ons

AuricWell now mounts the shared credentialing router and reuses the existing workspace, detailed editor, provider and group NPI credentials, contacts, interactions, license handling, CSV export and fee-schedule components. It does not maintain product-specific copies of those records. The authenticated product adapter requires the credentialing add-on, a practice `admin` or `credentialing` permission, and an active canonical staff identity. EHR-only identities retain their canonical role and cannot obtain a full-platform login or another agency’s access from this adapter.

The supervision add-on delegates scheduling, recurrence, personal room invitations, attendance finalization and completed-hour totals to the established supervision services. Clinical staff may view their own sessions and hours; supervision management requires the corresponding practice permission. Existing supervisor relationships still govern access to other providers’ completed hours.

Platform operators activate the two add-ons under the practice agreement in Settings. They are optional at every AuricWell tier; no add-on price is invented and activation does not authorize an automatic charge. Existing signed terms remain in effect. The November 9 commercial schedule is a review copy. Platform plan inclusion for supervision remains unchanged.

Validation includes authorization and tenant isolation, optional email creation, receipt deduplication, cross-case Gmail threads, receive-only enforcement, encrypted uploads and authenticated downloads, reminder delivery, fee-schedule document permissions, EHR-only product identities, existing supervision booking and recurrence, and the AuricWell production build. A browser smoke test against synthetic responses also opens the built workspace, detailed editor, optional email creation and completed supervision hours without runtime errors. Real MySQL and configured inbound-mail delivery still need staging verification before rollout; no external message or live migration is required for local unit tests.

## Release verification — November 9, 2026

Migration `1783_credentialing_operations` was applied through the migration runner to the live application's configured database. All four new tables and the existing schema prerequisites were verified. The release retains company-specific access overrides introduced on main: explicit local denials do not regain access through old affiliation grants or notification recipients. Add-ons remain opt-in; this deployment creates no case email addresses and changes no customer subscription terms.
