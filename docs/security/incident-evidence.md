# Incident evidence and account investigation

Status: implementation and local verification in progress; not deployed or verified against the production ingress/log-retention configuration.

## What IT can investigate

Open **Audit Center → Security investigation** as a current platform superadministrator. This is intentionally separate from agency activity reporting: cross-account IP/session evidence can cross organization boundaries and must not be exposed to an agency administrator solely because the actor belongs to their agency.

Filter by an exact user email/ID, client IP, session reference, time range, or file/denial/change/incomplete requests. Dates entered in the UI use the investigator's local timezone and are sent as UTC instants. Results show the timezone explicitly. Paging holds a fixed evidence snapshot; search again to include new activity. Select a request to inspect its received, authenticated, session-issued, link-issued and completed stages. **This IP** searches across users; **This session** follows one login; **This user** removes prior network/session constraints.

Export includes every stage of each matching request, not only its displayed summary. It preserves UTC timestamps, event/request IDs, actor identity/role, one-way session reference, IP provenance, endpoint, numeric resource IDs, outcome, byte count, and application version. The server rejects exports larger than 10,000 requests instead of silently truncating. The browser verifies the export checksum when the header is available and displays its own SHA-256 checksum for the incident record. A checksum protects a saved file against accidental alteration; it does not by itself prove the trustworthiness of the original database.

The screen also shows review leads from the last 24 hours: requests without a completion record after two minutes, and 25 or more successful file responses/link issuances per account/IP in a fixed 15-minute window. These thresholds are triage aids, not assertions of compromise. Long-running/streaming requests and legitimate exports can trigger them. The UI does not send notifications by itself.

## Evidence semantics and scope

| Evidence | Meaning | Does not establish |
|---|---|---|
| Received | The application persisted a request receipt before continuing | An authenticated identity or a completed operation |
| Authenticated | A verified authentication context was associated with the request before the protected handler | Which human controlled that credential |
| Session issued | The application recorded the new signed login before sending its cookie | Google's full authentication/MFA history |
| Data/change request succeeded | The handler returned a successful HTTP response | That every returned record was read, or that a requested change differed from prior state |
| File response / response sent | Node completed the response; the recorded bytes are application response bytes before any edge compression | That the browser received every byte, saved a file, or that it was a complete file rather than a range response |
| File metadata / metadata only | A HEAD request completed without a response body | That file content was transferred |
| Cache check / not modified | HTTP 304 returned without new file content | That the browser never previously obtained the file |
| Partial file response | HTTP 206 returned; validated numeric range/total fields are recorded when available | That the entire file was delivered |
| Download link / issued | A temporary signed storage link was issued/returned | That the link was subsequently used |
| Interrupted | The response closed before Node marked it finished | The exact number of bytes received by the remote party |
| Missing completion | A start/identity record exists without a terminal event | That no action occurred |

The central middleware covers API requests after body parsing, plus app-served `/uploads` requests, including unauthenticated denials and alternate portal identities. Noisy heartbeat/activity polling is excluded except explicit resume/logout. Health checks and CORS preflight are excluded. Stripe's raw-body webhook route is mounted earlier and remains outside this request timeline; its integration/domain records remain separate. Static frontend requests, direct object-storage retrievals, external services, and background jobs are not HTTP account activity in this timeline. Existing domain audit sources continue to supply semantic changes and background activity. Historical records are not backfilled with guessed actors, IPs, or outcomes.

The shared storage-link service also records link preparation with a one-way bucket/object reference, unique grant ID and expiry. For requests in the evidence context, it generates a V4 URL with signed `x-goog-custom-audit-request` and `x-goog-custom-audit-grant` parameters. Google Storage can include those identifiers in its Data Access audit log. They contain no account email or object name, and a caller cannot change/remove them without invalidating the signature. A reused/shared link still refers to its original issuance; neither ID proves which human used it. Background links retain their existing behavior. Work continuing after a response is outside that HTTP request trace.

This is distinct from returning a link to the caller, and from retrieving the object. Cloud Storage Data Access logging and actual retrieval correlation must be verified before claiming this coverage in production. See [Google's custom audit information documentation](https://docs.cloud.google.com/storage/docs/audit-logging#add_custom_information_to_audit_logs). For a synthetic request, use this Logs Explorer filter and compare the grant ID with the app's **link prepared** stage:

```text
resource.type="gcs_bucket"
protoPayload.methodName="storage.objects.get"
protoPayload.metadata.audit_context.audit_info."x-goog-custom-audit-request"="REQUEST_UUID"
```

Successful storage retrieval is still separate from evidence that a person saved or read the file. The investigation screen does not currently import storage audit records automatically.

The central records contain no request/response bodies, credentials, cookies, query strings, signed URLs, or filenames. Numeric resource IDs are taken only from explicitly named route parameters. Raw path components are redacted before the route matches. Browser/device strings are client-supplied claims. Account names, IPs and resource identifiers are restricted security data.

Response evidence distinguishes HEAD metadata, HTTP 204 empty responses, HTTP 304 cache validation, redirects and partial transfers. For HEAD/204/304, response-body bytes are zero even if a handler attempted to supply a body that Node suppresses. Declared content length is labeled separately; it is not treated as bytes delivered. HTTP 206 includes only validated numeric byte-range/total fields, never arbitrary header values. Multipart range responses remain labeled partial when no single range can be recorded. Metadata/cache-only responses do not count toward the successful file-transfer review signal. Personal session activity and the investigator view both display the distinction; prior records without this metadata remain unchanged.

## Durability, integrity, and failure handling

- Migration **1456** creates an append-only event table, indexed by request, user, email, IP, session and time. No cascading foreign keys erase evidence when an account/document is removed.
- Database triggers reject UPDATE and DELETE against evidence. A privileged database owner can still change the schema; this is not equivalent to independently retained storage.
- Request receipts and verified identities are awaited before proceeding. If either cannot be recorded, the request fails rather than silently continuing without attribution.
- Completion failures emit a structured CRITICAL `security_evidence_failure` log with request ID and error code. They leave earlier durable evidence in place. No SQL error text or credentials are included by this logger.
- Every committed event is also emitted as structured `security_evidence` output. Transactional revocation events are mirrored only after commit.
- Bootstrap validates the new storage and both append-only triggers before loading the application; startup failures also emit a structured CRITICAL evidence failure. Invalid proxy modes/addresses fail validation. SIGTERM stops accepting requests and drains pending writes within Cloud Run's shutdown window. The deployment workflow enables CPU allocation after responses so final event writes are not suspended between requests.
- Completion is necessarily observed after a response finishes. A process crash or storage outage can still leave an incomplete request. The UI makes that uncertainty explicit.

## Client IP trust

Default mode is **unverified**. It retains the connection peer and parsed forwarded addresses without pretending the shared proxy is the end device. Do not set `trust proxy = true` or use the leftmost X-Forwarded-For value as proof of origin.

`AUDIT_PROXY_MODE=google_lb` plus `AUDIT_GOOGLE_LB_IPS=<comma-separated exact frontend IPs>` selects the address immediately before the rightmost configured Google load balancer in the forwarded chain. This mode is valid **only after** the backend's ingress is restricted and the real proxy path has been verified. A caller that can reach the backend directly and supply its own header could otherwise forge this chain. `AUDIT_PROXY_MODE=direct` is only for a direct, non-proxied server.

Google documents an appended `<client-ip>,<load-balancer-ip>` suffix; Express documents that hop-count trust must match every permitted network path:

- https://docs.cloud.google.com/load-balancing/docs/https#x-forwarded-for_header
- https://expressjs.com/en/guide/behind-proxies/

Do not infer IP configuration merely from a familiar Google-owned address. Verify legitimate traffic through every application domain, the frontend service's API proxy if used, and mobile clients. Test both legitimate and spoofed prefix headers. Test that direct public backend access cannot bypass the approved ingress. Until these gates pass, keep unverified mode and its visible warning.

## Account containment

Select a request, choose **End all app sessions for this user**, and type the exact target user ID. The server checks the operator's current database role; a stale superadmin JWT, demo role, or tenant admin cannot use this endpoint. Self-revocation requires another administrator to avoid accidental loss of the incident responder's access.

The transaction writes a per-user JWT issuance cutoff, revokes initialized session-security records, revokes Quick View sessions and records the administrative action. Old JWTs are rejected even if no session-security row was initialized previously. Approved-employee tokens are checked through their signed email when mapped to a users-table account. Existing requests already executing cannot be recalled. New authentication is still permitted after the cutoff; suspension is a separate action. Google sessions, recovery methods, reusable portal/login links, third-party app sessions and signed storage links must be handled separately during containment.

## Local verification

```sh
node frontend/node_modules/vitest/vitest.mjs run --config backend/vitest.security-evidence.config.js
node frontend/node_modules/vitest/vitest.mjs run --config frontend/vite.config.js frontend/src/components/admin/__tests__/SecurityEvidencePanel.test.js
node --max-old-space-size=8192 frontend/node_modules/vite/bin/vite.js build --config frontend/vite.config.js
```

The MySQL integration suite is opt-in. It refuses arbitrary sockets/TCP credentials and accepts only `/private/tmp/pt-security-evidence-db.<suffix>/mysql.sock`. Start an isolated server with TCP disabled and set `EVIDENCE_TEST_SOCKET` for the backend test command. The suites create and drop only `security_evidence_test`, `account_security_test` and `activity_protection_test`; never point them at an app database. They verify migration reruns, append-only triggers, real HTTP file and link responses, attribution, pagination/filter SQL, signal queries, atomic revocation and personal account security.

On September 16, initial local testing used MySQL **9.5** because the existing Docker daemon was unresponsive. A subsequent isolated run passed all **99 backend checks on upstream MySQL 8.0.44**. A read-only database version query identified the deployed database as **8.0.44-google**. The local macOS run does not verify Cloud SQL permissions, Linux case sensitivity, production configuration or deployed behavior.

## Required rollout and acceptance gates

### Diagnosing missing security storage

From `backend`, run `npm run check-security`. This is read-only and checks the
configured database's required tables/columns, append-only triggers, proxy
configuration, and MFA key configuration. It exits nonzero with a fixed component
label and error code when setup is incomplete. It does not prove that an existing
MFA ciphertext can be decrypted or that cloud log retention is configured.

Both direct `npm start`/`npm run dev` and Cloud Run bootstrap require this security
preflight before creating the application or starting its maintenance jobs. A
received-phase `ER_NO_SUCH_TABLE` refers to the evidence insertion path; those
requests return 503 before reaching business handlers. Verify the database selected
by the failing process before running any migration. A healthy schema in a different
database does not repair that process.

Apply only missing prerequisites after reviewing the target: migration 667 for
login lockout columns; 1452 for session security; 1456 for evidence and revocations;
1458 for MFA and session history; 1459 for activity protection and reviewers. The
existing migration runner accepts `npm run migrate-one -- --migration=1456` (replace
the number as needed). Do not replay the whole migration history or baseline away a
missing schema. Partial migrations may require a reviewed `--force` rerun and a
fresh readiness check.

`MFA_KEY_NOT_CONFIGURED` requires a dedicated, persistent 32-byte key encoded as
base64 in `MFA_ENCRYPTION_KEY_BASE64`. Retrieve the established deployment key if
one exists. Do not replace it with a newly generated key when accounts are already
enrolled, and do not create different keys for processes sharing the same MFA
database. Production uses the pinned Secret Manager version configured in the
deployment workflow. Never paste the key into logs or incident reports.

September 17 diagnostic: the database selected by the workspace configuration had
all required security tables/columns and both evidence triggers, but zero evidence
rows; the local process configuration lacked the MFA key. No database or secret
changes were made during that check. Nineteen focused startup/readiness and
request-failure tests passed. This does not establish which process produced the
earlier missing-table logs.

The goal is not complete until these are verified against the deployed app:

First collect a read-only infrastructure inventory. The helper prints only selected configuration fields, never tokens or general environment variables. It exits with status 2 if a cloud check is unavailable; missing access must not be interpreted as a passing check:

```sh
node scripts/check-security-evidence-cloud.mjs \
  --project ptonboard-dev --account michael@plottwistco.com \
  --gcloud /Users/mendez/google-cloud-sdk/bin/gcloud
```

1. Run migration 1456 against a disposable database matching production MySQL; then apply it through the normal deployment migration path. Verify both triggers exist. Do not remove original incident evidence.
2. Verify database/storage startup failures prevent serving normal protected requests and produce actionable operational logs. Measure added database latency and storage growth under representative traffic; this records multiple rows per request.
3. Verify the real client-IP chain and backend ingress restriction before enabling verified Google proxy mode. Preserve a test proving an attacker-supplied XFF prefix cannot change the selected address.
4. Configure an independent Cloud Logging sink/retained destination for `jsonPayload.type="security_evidence"` and `"security_evidence_failure"`, with access and retention controlled separately from the app runtime. Choose retention according to the organization's policy. Confirm a synthetic event reaches the retained destination and survives removal of ordinary application logs.
5. Configure a notification policy for `security_evidence_failure` and operational review of sustained incomplete requests/high-volume signals. Verify delivery using a synthetic failure, not real customer data. No staff notifications are sent by this implementation.
6. Verify storage data-access logging for buckets serving signed links, including logging coverage for the actual authentication mechanism. Preserve a synthetic link issuance and its corresponding retrieval. If that cannot be correlated reliably, route sensitive downloads through an authenticated app handler; do not relabel a link issuance as a completed download.
7. In a synthetic tenant/account, exercise password and Google sign-in, session refresh/lock, sensitive reads, download and export, denied access, failed operation, interrupted transfer, and admin changes. Confirm readable actor/session/resource/outcome evidence and absence of credentials or content.
8. Confirm user/IP/session pivots, explicit timezone, exact filters, request stages, export checksum, export-limit errors, source warnings and inaccessible security views for tenant admins.
9. Confirm revocation rejects both an existing JWT and a previously unused old JWT, closes Quick View sessions, preserves the administrator's event and permits a fresh authorized login.
10. Confirm the deployed source version, both application builds, database migration, ingress controls, independently retained logs, monitoring and production smoke-test results. Only then mark the incident-evidence rollout complete.

## Remaining work at this checkpoint

Local code and tests are present. Upstream MySQL 8.0.44 compatibility passed. Production deployment, ingress validation, independent log retention/alerts, signed-storage retrieval correlation, Cloud SQL runtime verification, representative-load testing and production smoke checks have not yet been completed. The configured service-account identity lacks Cloud Run and Cloud Logging read access, and the saved user login needs reauthentication.

## Verification checkpoint — September 16, 2026

- 96 backend checks passed, including 34 isolated MySQL/HTTP integration checks, 3 startup-failure checks and 4 storage-signing checks using the real Google SDK with a disposable local key.
- 16 investigation, personal-security and protection-review UI checks passed. See [personal account security](personal-account-security.md) for authenticator setup, remembered devices, session history and the additional rollout gates.
- Desktop and 390-pixel mobile previews passed without browser errors or page overflow. The activity table scrolls horizontally on narrow screens.
- Production Vite build passed with the deployment-equivalent 8 GiB Node heap. The default 4 GiB build exhausted its heap.
- A 60-request synthetic download burst at concurrency 10 preserved all 60 completion records and triggered the high-volume review signal. Local p50 was 6.5 ms and p95 11.4 ms; this is not a production-load or cloud-database latency benchmark.
- Production infrastructure and deployed behavior remain unverified. No production data or configuration was changed by this work.

Activity volume limits, review tickets and persistent sign-in throttles are described in [activity protection](activity-protection.md). They are also local and require their own rollout verification.

## Deployment readiness guard

The deployment workflow now requires an existing dedicated `MFA_ENCRYPTION_KEY_BASE64` Secret Manager reference pinned to a numeric version. It inspects only the reference; it does not generate or rotate the encryption key. Existing Secret Manager references are preserved instead of being removed in an intermediate revision. For those keys, update the Secret Manager reference/version through the operational configuration process; changing a same-named GitHub secret will not replace the reference.

Candidate revisions receive no ordinary service traffic until their own tagged `/readyz` endpoint passes. Promotion targets the exact candidate revision. The HTTP startup probe also uses `/readyz`, which responds 503 until the application and security prerequisites load successfully. Startup error details stay in operator logs. Temporary candidate tags are removed after the check. This follows [Cloud Run startup probe behavior](https://docs.cloud.google.com/run/docs/configuring/healthchecks) and [deployment traffic controls](https://docs.cloud.google.com/sdk/gcloud/reference/run/deploy).

Readiness failure preserves the prior traffic allocation; it does **not** roll back schema migrations or background jobs that a candidate already ran. Review migration compatibility before deployment. Restricted ingress requires the CI runner to have a permitted network path to the candidate: inability to reach it blocks promotion and must not be fixed by weakening ingress. These workflow changes have passed YAML/shell syntax validation, four secret-preservation tests and three readiness tests, but have not been exercised against Cloud Run.

MySQL test archive provenance: official Oracle `mysql-8.0.44-macos15-arm64.tar.gz`, SHA-256 `e0a9b7a04051c570706ca4c7b8a8d6749ac984aab9eecfa41c6ca395a75a0c91`. The detached archive signature verified against Oracle's HTTPS-published key fingerprint `BCA43417C3B485DD128EC6D4B7B3B788A8D3785C`. macOS executable code-signature verification failed, so archive authenticity was checked using the detached signature instead; no macOS security settings were disabled. Tests used only disposable synthetic databases, not incident or production data.

## Transfer-evidence verification checkpoint

All **103 backend checks** passed on isolated MySQL 8.0.44, including real HTTP HEAD, 204, 304 and 206 responses and matching persisted byte/range evidence. All **17 interface checks** passed. The production frontend build passed in 53 seconds. These results supersede earlier local counts above. The latest read-only cloud check still failed to refresh the saved `michael@plottwistco.com` login; no production verification or deployment took place.
