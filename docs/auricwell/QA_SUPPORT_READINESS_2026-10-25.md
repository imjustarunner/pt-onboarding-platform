# Support QA audit and launch status — October 25, 2026

This is a new engineering companion to `QA_ADDENDUM_2026-10-25.md`. It does not replace the prior handoff.

**Current decision: unattended daily testing is not yet cleared.** The source changes below are prepared in the isolated `codex/qa-support-audit-20261025` worktree. Deployment and post-deployment verification must be recorded separately before treating them as live.

## Live observations before these changes

- The normal login for `qa.support.auricwell@example.com` succeeded with user ID 1434 and role `support`.
- Its returned organization list contained only demo agency 450 and affiliated demo school 451. No admin/superadmin credential was used for the check.
- Client listing for the demo agency succeeded and returned zero clients. The affiliated school list was also accessible, as expected for this demo hierarchy.
- Exchange listing for agency 450 succeeded; a direct Exchange request against school 451 returned 403 because it is not a directly authorized Exchange agency.
- The clinical-note context returned 200 to support. This is a role-boundary gap, even with no clients present.
- The demo communications inbox endpoint returned 200. This does not prove per-person email copies or external delivery.

Machine-readable receipt: `deliverables/qa-support-addendum/live-read-only.json`. No private email body, password or session token is in that receipt.

## Findings and prepared changes

| Finding | Change | Validation / limitation |
|---|---|---|
| Shared backoffice gates include support | Explicit support-denial guards on agency configuration and sensitive account-management routes | Operational scheduling/contact routes retain their existing authorization; no global authentication rewrite |
| Staff profile editing could accept role/privilege fields from support | Support profile updates are restricted to ordinary self-profile fields; credential operations cannot target another staff member; staff membership/privilege operations denied | Tests cover attempted admin/superadmin, billing and supervisor grants |
| Full clinical-note routes were reachable to support | Clinical note generator/content, clinical data, PHI documents, intake-note pipeline, chart/signing and appointment clinical billing detail reject support | Contact documentation remains ahead of the clinical boundary and has route-level regression tests |
| Support needs note/claim status | New `/clients/:id/operational-status`, with current client account-support authorization and explicit metadata-only SQL/response | Latest persisted clinical note/claim per session, maximum 100 sessions; does not enumerate unsaved editor drafts or replace Scheduling |
| Exchange summaries could expose text derived from clinical notes/plans | Support receives operational summary fields without diagnoses or extracted clinical narratives; posting/withdrawal preserve the actor's role | Matching still uses its normal server-side clinical inputs; no matching bypass |
| Exchange agency authorization could trust cached agency data or inactive rows | Checks current active membership and agency status | No permission granted by request body, stale token or affiliated-school identity |
| Authenticated agency-by-ID read lacked a membership check | Non-superadmins must have the agency in their authorized agency list | Public branding endpoints remain a separate existing surface |
| Redirected mail was logged but not necessarily visible in the recipient's Messages | New recipient-specific QA email panel for staff, guardian and personal-client Messages; metadata list plus separately authorized body read | Original To or redirected Cc/Bcc recipient, active demo membership and synthetic-only flag required; no shared testing-mailbox access |
| Need up to ten synthetic Exchange providers | Exact provider ID/email roster, maximum ten, fail closed on malformed configuration | Existing single-provider behavior remains until owner configures the roster; no extra provider created automatically |

The email panel displays actual receipt statuses and uses a sandboxed HTML reader. It does not forge inbound messages or infer delivery from a `sent` status. To/Cc/Bcc recipient isolation and workflows missing communication logging must pass their own acceptance checks; they are not silently counted as covered.

## Gates still requiring live proof or setup

1. Publish the reviewed changes and repeat support/provider sign-in, allowed operational actions, denied clinical/admin actions and synthetic cross-tenant record tests. Local tests are not a live authorization certification.
2. Run the scope preflight and inspect account permissions, not just role names. Give bots only provider/support/family credentials. Keep setup-admin, database and cloud credentials owner-only. Never solve a blocked screen by granting a broader role.
3. Confirm support's complete portal/document/questionnaire dispatch workflow using approved blank templates, without medical-response/document read access. Completed PHI attachments are intentionally denied; do not re-enable their viewer to make dispatch pass.
4. Complete an actual enrollment and appointment canary, then correlate per-person email copies with arrival at testing@itsco.health and real provider SMS at +16189107000. Configure the sending identity, preferences, SMS sender/consent and office/provider/service eligibility through normal authorized setup where missing.
5. Provision the supervisor/supervisee pair and assignment. If expanding providers, configure the explicit Exchange roster and verify each new user's primary and secondary interface access before adding it to a run.
6. Install the Grok coordinator's daily lock, maximum-population checks, secret references, screenshot storage and email-reading job. Neither a document nor these code changes creates an external Grok schedule.
7. Assign the synthetic training/quiz and prove its attempts/completion state. Verify realistic service eligibility and calendar availability; report unsupported features rather than bypassing normal activation gates.
8. Retain two future weekly reminder appointments and verify their later delivery. Do not report this check passed during the morning booking step.

Scope limits: this audit covers the listed workflows and entry points. It is not a completed review of every endpoint in the platform, and no claim is made that a new QA quota is enforced by every database write path. The runner must enforce the documented population limits. The existing role label and organization list alone are insufficient to authorize an unattended launch.

## Local verification

Run from the isolated worktree:

```sh
frontend/node_modules/.bin/vitest run --config backend/vitest.qa-support.config.js
NODE_ENV=test SKIP_DB_CONNECT=1 node --test --test-force-exit backend/src/utils/__tests__/auricwellQaPolicy.test.js backend/src/utils/__tests__/supportExchangeSummary.test.js backend/src/utils/__tests__/hogwartsTestEmail.test.js
cd frontend
node_modules/.bin/vitest run --config vitest.qa-support.config.js
NODE_OPTIONS=--max-old-space-size=8192 npm run build
```

The initial frontend build exhausted Node's default heap; the rerun with an 8 GB limit completed. Final test/build counts and any post-deployment results belong in `deliverables/qa-support-addendum/verification.json` so they are not confused with the earlier live baseline.

## Publication follow-up — October 25, 2026

The earlier local-only status above is preserved as the original audit record. The code has since been committed, pushed to main and deployed. The completed scoped API/browser checks, screenshots and remaining launch gates are in the new [release update](QA_RELEASE_UPDATE_2026-10-25.md) and `deliverables/qa-support-addendum/release-verification.json`. Unattended daily testing remains disabled.
