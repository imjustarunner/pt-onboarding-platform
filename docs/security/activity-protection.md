# Activity protection and review

Status: local implementation, not deployed. No real email, staff notification, production migration or production configuration change was performed. Existing evidence and MFA rollout gates still apply.

## Controls

The application now reserves protected operations in a shared MySQL transaction before delivering protected files/links or dispatching email. A per-account row lock serializes concurrent requests across tabs, sessions and backend instances. Administrators and superadmins have no exemption. Reservations remain consumed if downstream delivery fails: evidence of permission or an attempted response is not a claim of successful receipt.

Initial policy (code-defined; there is no administrator self-exemption setting):

| Operation | Default |
| --- | --- |
| Client file access | Five distinct resources per rolling 15 minutes; twenty-five per rolling 24 hours |
| Additional access after a threshold | Held pending review; a new sign-in does not clear the hold |
| Bulk/export operations recognized by the route guard | Review required before the first operation |
| Explicit clinical print controls | Review required before the app opens its print dialog |
| File-access approval | A designated privacy reviewer, a fresh authenticator verification within five minutes, maximum 20 additional operations, one hour, requesting session only |
| Email | Maximum 50 To/Cc/Bcc mailbox addresses per message; 50 recipient deliveries per 15 minutes and 200 per 24 hours for an attributed initiating account |
| Password attempts | Shared 15-minute account, network and account/network budgets, plus the existing database account lock after ten failed passwords |

Repeated access to the same file before a hold does not spend another allowance in the 15-minute window. A review hold also stops repeats. Different URLs for the same document can conservatively count as additional resources. File views count because a browser that receives a PDF can usually save or print it. Public/guardian/client/participant file flows are not converted into staff bulk-review workflows.

Staff see **Additional client-file access** in **Security & sign-in activity**. They submit a work-purpose explanation without client names and a requested quantity. Submitting a ticket never releases access. Only their own tickets/holds are visible. Designated reviewers use **Privacy review queue**, available from the security banner at `/privacy-review`. Superadmins designate reviewers under **Audit Center → Security investigation → Designated privacy reviewers**; designation is explicit and recorded, and no one can designate themselves. Admin/superadmin status alone does not grant approval authority. Pending requests and unreviewed blocks are also counted in the signed-in designated reviewer banner; it refreshes each minute while visible. These are in-app alerts, not email/SMS/push notifications. No external alert delivery is configured by this change.

Review requires a fresh code with “remember this device” off. A remembered-device proof alone cannot approve an exception. Self-approval and review of one's own attributed blocks are forbidden. Requests cannot exceed the requested quantity or twenty operations. Approval changes are atomic and recorded in append-only evidence. Acknowledging an alert does not release a file hold. A reviewed, justified file request grants a bounded allowance. Email hold release is an explicit separate checkbox; normal recipient limits still apply afterward. Two independently operated designated privacy-reviewer accounts are therefore an operational prerequisite; there is no self-approval fallback for a lone superadmin.

## Coverage and limits

- The authenticated request gate covers recognized file/download/export/PDF/CSV/ZIP paths, PHI document views, chart-artifact views, signed school packets and sensitive upload paths. It normalizes case and URL encoding. Protected storage reads and signed-link issuance additionally inspect `phi-documents`, `intake_signed` and `intake_uploads` objects. Additional storage objects in one request require additional reservations. Metadata lookups for printable-packet configuration are excluded.
- Clinical survey-trend and medical-record print buttons request approval before printing. Server PDF access is guarded for other print workflows. Browser menu printing, screenshots, copying already displayed information, and opening or printing an already downloaded file cannot be reliably intercepted or proven by a web application. A print-intent approval is not evidence of a physical print. Endpoint DLP/managed-device controls would be needed for stronger control outside the app.
- Route classification is conservative, not a proof that every application route has been reviewed. Newly added routes and alternate responses need an explicit protection decision and integration test. Existing plaintext/public endpoints, previously issued signed links and offline copies require separate containment. Do not claim that this feature retroactively revokes those copies or links.
- The limits count operations/resources, not pages, bytes or clients inside a single approved report. Reviewers must understand the requested export scope. The application does not currently enforce a data-volume or per-client allowlist on the contents of an approved report.
- All four direct Gmail dispatch sites in this repository invoke the recipient check. It counts To/Cc/Bcc mailbox addresses, not the expanded membership of Google Groups or external distribution lists. A single group address can reach many people. Gmail/Drive sharing performed outside the app is outside these controls. Google Workspace group expansion, outbound safeguards and Drive policies must be addressed separately before claiming that a 600-person send is universally impossible.
- Attributed app calls use the authenticated initiating account, including user switching, rather than a recipient user ID. Background unified email jobs can supply `generatedByUserId`. Unattributed background sends get the per-message ceiling but cannot be reliably charged to an individual account. Inventory queued jobs before rollout and preserve their verified initiating identity; never accept a browser-supplied initiator as trusted.
- Account/IP/session/time/route, quantity, block reason, approval reference and outcome are recorded. File resource names are hashed. Evidence can identify the account/session used, not establish which human controlled the device. IP trust is labeled. Database owners can alter policy/state; independent retained evidence remains necessary.

## Password sign-in and phishing

Password login was not unprotected: it already had an in-memory rate limiter, bcrypt verification, password rules and database lockout fields. This change adds persistent per-identifier, per-network and combined throttles; atomically updates failed-password counts; and removes best-effort fail-open behavior from the existing account lockout. Missing protection storage blocks password login. Unknown identifiers and requests with malformed credentials also consume the shared endpoint budget. Existing identifier-first organization discovery still has account-enumeration implications and is not claimed to be a privacy-preserving authentication protocol.

The login page displays public advice to use the saved work bookmark. It does **not** return a phone fragment, role, private email address or other account-specific hint before authentication. Such a hint can expose information and a phishing intermediary can reproduce it. CAPTCHA is not an authorization check and does not stop an attacker using valid stolen credentials. Authenticator codes are helpful but can also be relayed; passkeys/security keys remain a separate future feature, not part of this implementation. References: [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [NIST authentication guidance](https://pages.nist.gov/800-63-4/sp800-63b.html).

## Rollout gates

1. Apply migration 1459 alongside its prerequisites before deploying. Startup checks protection tables and existing account lockout columns. The complete local backend suite now passes on isolated upstream MySQL 8.0.44 as well as the earlier MySQL 9.5 run. Production is MySQL 8.0.44-google; its permissions, configuration and deployment migrations still require verification.
2. Keep the dedicated MFA key/schema prerequisites. Provision two real designated privacy reviewers and a verified operational recovery process before requiring approvals.
3. Validate real proxy ingress and IP attribution before network throttles go live. With an unverified proxy, the shared source limit deliberately uses the connection peer, which can group many legitimate users together. The identifier limit remains shared across sources. Do not trust arbitrary forwarded headers to improve apparent availability.
4. Inventory staff file/print/export routes, alternate API representations, prefetching, queued email jobs and group recipients. Test each role with a synthetic tenant and check that default thresholds permit the intended work. Guard client data before delivery; frontend-only print checks are not a security boundary against a modified browser.
5. Verify concurrent requests against multiple deployed instances, fresh reviewer MFA, rejection of self-approval, expiration/quantity/session binding, preserved client authorization, meaningful alerts and independently retained evidence. Confirm an unavailable database prevents risky actions and password login.
6. Add operational retention/cleanup for expired `auth_attempt_windows` (indexed by expiry); retain security evidence and review records according to policy. Monitor sustained blocks, storage growth and latency. In-app polling does not substitute for an independently monitored security alert channel.
7. Inform staff of the new workflow before activation. No staff messages were sent by this work.

## Local verification

The focused suite covers simultaneous file requests, repeated-file handling, persistent holds across sign-ins, recipient ceilings and split sends, Gmail dispatch refusal, self-review rejection, fresh-reviewer requirements, approval expiry/session/quantity binding, owner-only ticket access, database failure, multiple storage objects, repeated denied reads, shared login throttles, parallel password failures, and review UI failure states. The combined evidence/security regression suites passed 96 backend and 16 frontend checks before final acceptance. Production controls remain unverified and undeployed.

Final local checks: 96 backend and 16 frontend checks passed; the production frontend build passed; synthetic request/review screens passed desktop and 390-pixel mobile previews without browser errors or horizontal overflow. No production runtime or real-user workflow was exercised.

Subsequent compatibility check: all **99 backend checks** passed on upstream MySQL **8.0.44**, including three new startup-readiness checks. Four deployment-secret preservation checks passed. The macOS test instance used a private Unix socket with TCP disabled and `lower_case_table_names=2`; it does not reproduce Linux case sensitivity or Cloud SQL permissions. The earlier 16 frontend checks and build remain applicable; no frontend code changed in this compatibility check.
