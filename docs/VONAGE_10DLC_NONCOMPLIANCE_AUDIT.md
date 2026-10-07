# Vonage 10DLC compliance audit — October 7, 2026

This records a code review, read-only Vonage API checks, and targeted tests. It is not a guarantee against carrier enforcement. No messages were sent and no campaigns, numbers, purchases or subscriptions were changed by this audit.

## Account actions that remain open

Verified at approximately 14:09 UTC on October 7:

| Program | Brand / campaign | Carrier state | Linked numbers | Action |
| --- | --- | --- | --- | --- |
| ITSCO Service Communications | BRC2ZW3 / VCV2DNM4 | ACTIVE, traffic enabled | 0 | Complete HIPAA account provisioning and link the already purchased 719-716-3661 with HIPAA compliance. Keep app delivery inactive until verified. |
| ITSCO Staff Notifications and Voting | BRC2ZW3 / VCSVZ9AN | ACTIVE, traffic enabled | 0 | Assign a separate eligible number to this campaign, verify LINKED, then configure its signed staff enrollment. |
| Next Level Up Service Communications | BMF4RBM / VC23QD14 | ACTIVE, traffic enabled | 0 | Assign an eligible number under this brand and campaign; complete any applicable healthcare provisioning first. |
| Inner Strength service communications | B5N59D1 / VCA596DN | PENDING_REVIEW, traffic disabled | 0 | Wait for approval, then complete eligible number linking. |
| Skill Builders scheduling | BNZN49I / VCUQQE8K | TERMINATED, traffic disabled | Not queried | Leave terminated; do not route around the terminated program. |
| AuricWell / PlotTwistHQ | B85ZMGZ / BGVLJNC | Active brands; no campaigns returned | — | Brand verification alone does not authorize SMS. |

**Three active campaigns have no linked number.** Vonage's [current fines article](https://api.support.vonage.com/hc/en-us/articles/4406837782548-10-DLC-Non-Compliance-Fines) lists a $250 monthly non-use fee per unlinked campaign: potential $750/month across these three if assessed. This is exposure, not evidence that a fee has been charged. The [specific non-use notice](https://api.support.vonage.com/hc/en-us/articles/6833181835036-10DLC-Update-T-Mobile-Non-Use-Obligation-Fine-December-1st-2022) does not establish a fresh 60-day grace period for these campaigns. Ask Vonage for the account's actual assessment dates and treatment while HIPAA provisioning is pending. Sending dummy traffic does not fix missing linkage.

The earlier attempt to link the ITSCO number with HIPAA compliance received HTTP 403: HIPAA numbers were not enabled on the account. Do not remove that requirement to get around the rejection. Number linking and HIPAA readiness are distinct from campaign approval. A number purchased in the account is not automatically linked in TCR, and one number cannot serve two campaigns simultaneously.

### Correct ITSCO's registered HELP and opt-in responses

The live `VCV2DNM4.help_message` contains an unwanted prefix:

`Example: [ITSCO]: For HELP, please email at support@abc.com.`

Replace the **entire** HELP message field with:

> ITSCO: For help, contact support@itsco.health. Message frequency varies. Message and data rates may apply. Reply STOP to opt out.

The application's response already uses the real support contact and Vonage Opt-Out Assist is currently off. Nevertheless, the registration should contain the actual response. Campaign edits can trigger another review; this audit did not submit an edit to the approved campaign. The other three nonterminated campaigns' HELP responses did not contain this placeholder.

The same campaign's `opt_in_message` also contains the original `Example: [ITSCO]` text followed by a second confirmation, truncated at `STOP to o`. Replace the **entire** Opt-in Message field with this clean program-level confirmation:

> ITSCO: You subscribed to your selected service communications. Message frequency varies. Message and data rates may apply. Reply HELP for help, STOP to opt out.

The app's enrollment confirmations name the particular accepted purpose (for example, appointment reminders) and already include complete HELP/STOP instructions. Both replacement fields above fit within the 320-character limit. Review the saved values after editing so placeholder text is not appended again.

### Ownership and campaign scope

The inspected campaigns use `R000000` (customer/own-business registration). All six brands returned `PRIVATE_PROFIT`, not sole proprietor. Per [Vonage's reseller rules](https://api.support.vonage.com/hc/en-us/articles/16376606152988-10DLC-Update-Reseller-ID-requirements-Jan-2025), owned legal entities may use customer registrations; independent customers require reseller handling. Do not apply these registrations to Kimi or another independent business because they use the app. The account API does not establish beneficial ownership or the correctness of EIN records.

The approved ITSCO service description includes scheduling, cancellations, care-team administrative exchanges, billing-account notices, portal links, callback numbers and separately opted-in staff notices. Its staff campaign includes internal announcements and nonpolitical polls; embedded links are declared, embedded phone numbers are **not**. NextLevelUp's service description includes client and staff scheduling, meeting links and administrative support. No inspected active campaign authorizes marketing. A broad ACCOUNT_NOTIFICATION use case does not authorize arbitrary content outside the submitted program description.

## Changes from this audit

1. Every outbound SMS now passes a fresh, read-only Vonage check immediately before transport. The exact brand/campaign must be ACTIVE with traffic enabled; the exact sending number must be LINKED. API failures, timeouts and rate limits fail closed. There is no stale-success cache, alternate-number retry or P2P fallback. This adds two carrier API reads per attempted send; callers report a failed/pending delivery if verification is unavailable.
2. The carrier-approved use cases must cover the declared app purpose. Reseller and keyword-owner settings must match. HIPAA provisioning is checked when required by the campaign or local `hipaaRequired` registration flag. This check is not a BAA or a determination that SMS is end-to-end encrypted; healthcare activation still needs the separate account review.
3. Explicit URLs and callback numbers are checked against the campaign's declared attributes. Recognized public shorteners, HTTP URLs and URLs with embedded credentials are rejected. The app does not claim to detect every obfuscated URL, phishing message, prohibited topic or misleading free-text statement. Staff must use full trusted links and approved administrative content; sensitive discussions belong in the secure app.
4. The opt-out footer checks for an actual instruction. Incidental wording such as “stop at the front desk” cannot suppress the footer.
5. Manual support forwarding sends a generic urgent alert with a secure-app link through the agency's workforce sender. Client initials, clinical notes and ticket content are not copied to personal-phone SMS. This alert still requires staff consent and enabled message alerts; the in-app ticket remains available if SMS fails.
6. Legacy poll sends and timed replies now pass their agency ID into the shared sender gate.
7. Staff preference saves no longer self-activate subscriptions. They retain the signed choices and wait for the existing administrator-reviewed SMS consent request. **No** choices take effect immediately as opt-outs. Previously self-activated staff preference permissions are also blocked at delivery until replaced by reviewed enrollment. The preferences page recognizes later reviewed activation without replacing its evidence or clearing STOP. An enrollment confirmation for someone who selected only message alerts uses that category instead of requiring general notifications.
8. `npm run sms:audit-vonage` in `backend/` provides a repeatable, paginated, read-only carrier inventory audit without needing the application database. It flags active unlinked campaigns, disabled traffic, sole-proprietor review needs and known example placeholders. Exit 0 = no listed findings, 2 = findings, 1 = incomplete/error. It is an operator check, not a scheduled monitoring job or certification.

## Existing protections verified by code and tests

| Risk in the Vonage notice | App protection / operational limit |
| --- | --- |
| Missing consent proof | Purpose-specific consent records and append-only permission events; signed form evidence; administrator review; exported signed-consent evidence. A phone number, employment, or an old Yes toggle is not a subscription. |
| Ignoring STOP | Campaign-wide suppression is checked before normal delivery, including across numbers on the same campaign. STOP/HELP are processed before poll and appointment replies. Preference edits cannot clear STOP. |
| Sending on the wrong business's campaign | Sender-agency checks and registration conflict checks prevent cross-agency brand/campaign sharing. Each independent business needs its own truthful registration. |
| Campaign/content evasion | Purpose checks, carrier state checks, separate marketing sender/consent, no automatic relinking of an existing sender to a new campaign, and no automatic failover after rejection. Free text still requires responsible sender review. |
| Snowshoeing / shared short codes / grey routing | The reviewed delivery path uses a single guarded Vonage SMS transport. No rotation to evade filtering, shared short-code delivery or P2P route was found in that path. Do not add these as workarounds. |
| Phishing, illegal or prohibited content | Sender identity and opt-out formatting are enforced. Link checks reduce specific risks but are not a semantic content classifier. No bulk advertising, purchased lists, impersonation, misleading links or prohibited offers should be sent. Review any carrier alert promptly and pause affected traffic rather than switching numbers. |

## Staff activation steps

1. Finish campaign/number configuration and verify carrier readiness.
2. Staff save Yes/No for notifications, message alerts and voting in their communication preferences. All No is allowed.
3. In **Texting Numbers → Consent requests**, an administrator issues the relevant staff SMS enrollment form. The recipient signs the purposes they accept.
4. The administrator checks the signature and authority and activates only accepted purposes. The application sends the required confirmation; a failed confirmation leaves permission inactive.
5. Keep the signed evidence and reviewed activation record. Preference categories, current phone, STOP, campaign readiness and delivery settings remain additional gates on every send.

The staff preference signature is retained, but it does not itself replace the reviewed campaign enrollment form. A streamlined single-form review queue can be added later without changing this requirement.

## Verification limits

- The read-only carrier audit completed across six brands and five campaigns. No account mutation or live SMS test was performed.
- The initial database read returned `PROTOCOL_CONNECTION_LOST`. After the local proxy restarted, a read-only retry succeeded against the configured **onboarding_stage** database. It contains two number records: ITSCO number ID 1 is marked active/clinical care but has no sender registration; the purchased number ID 2 is pending/inactive and also has no sender registration. The shared send gate blocks both.
- Aggregate checks in that database returned **0 sender registrations, 0 SMS recipient permissions, 0 SMS consent requests, 0 SMS permission events, and 0 outbound message-log rows**. These are the new SMS enrollment/delivery tables, not a count of all historical intake signatures. No records were changed, and no recipient identities or message bodies were retrieved. This does not establish the state of a different production database or messages sent outside the app.
- The deployed public program API and tested legal pages were reachable without signing in. Browser interaction and every customer's website content were not exhaustively tested in this pass.
- Carrier billing, BAA/HIPAA enablement, permitted content decisions, actual legal ownership, account-level routing and any traffic sent outside this app still require account/operator verification.
- Automated regression coverage includes consent/STOP, cross-agency checks, carrier rejection/suspension, purpose mismatches, number unlinking, HELP, content attributes, staff review and support alert privacy. Database integration tests requiring an available database remain skipped; the pre-existing directory-reuse test with a stale Google mock is excluded from this messaging run.
- Validation result: **518 backend messaging tests passed, 13 database integration tests skipped; 4 staff-preference frontend tests passed; production frontend build passed.** No database migration is required by these changes.

Do not label the system “fully compliant” or ready for healthcare traffic until the open account and database checks above are resolved.
