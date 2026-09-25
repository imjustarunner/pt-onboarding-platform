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
- This workspace does not submit payer enrollments, send claims, change submission gates, verify CAQH, or create automatic reminders. It organizes recorded follow-up dates and links to the existing tools. Existing clinical/billing readiness checks still govern submission.

## Validation

Backend and frontend tests cover authorization, scope changes, safe response fields, current-account enrollment filtering, unavailable data, evidence/history, stale writes, and claim-submission regressions. The opt-in `credentialingWorkspace.mysql.test.js` applies the migration to a disposable local schema, queries synthetic records, and runs five concurrent initial saves (one accepted, four conflicts). It uses only the local test socket and removes its schema afterward.
