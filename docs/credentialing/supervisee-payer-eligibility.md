# Supervisee payer eligibility

A provider's own payer credential and permission to bill under that credential for a supervisee are separate decisions.

In **Credentialing Management → Providers → Review**, or **Provider profile → Payer credentials**, use **Available for supervisee billing**. It defaults on except for TRICARE/TriWest names, including parent-payer and linked billing-payer names. These are organization defaults; credentialing staff can change the checkbox after verifying the applicable contract. The provider's own credential remains in place.

An unchecked credential is excluded from the assigned billing supervisee's accepted-insurance list and blocks supervised claim review/transmission for its linked billing payer. Agency acceptance overrides cannot re-add an excluded credential by its recorded aliases. TRICARE/TriWest cannot be added through acceptance overrides without an actual direct or explicitly enabled inherited credential. Legacy free-text public-profile insurance tags cannot add payers back to the website or provider finder. Existing bachelor-level presentation restrictions still apply.

## Connect credentialing to billing

Open **Credentialing Management → Payers & connections → Map / review**. Choose the exact plan from the agency's configured, verified billing payer list and record the source reference. Missing or unverified routes must first be added/verified in Billing. A payer in another agency cannot be selected by editing the request.

A connection identifies the electronic route; it does not establish contracting, credentialing status, or clearinghouse enrollment. Those existing requirements remain separate. Historical unmapped credentials remain visible as historical records and retain their public labels, but cannot establish permission to submit a supervisee claim. Once mapped, public insurance labels use the connected billing payer name.

At the September 29, 2026 audit, ITSCO had 13 credentialing payer definitions and no existing electronic payer mappings. Review the exact plan/route before mapping; broad names such as Anthem, Kaiser, and United can represent multiple billing plans. Do not guess those connections from a similar name.

## Implementation and validation

Migration 1511 adds a nullable per-credential decision. NULL uses the payer-family default for both existing credentials and new/imported records. Older forms that omit the field preserve an explicit decision. No credentials, contracts, or existing claims are rewritten.

Claim review and transmission share the eligibility check, using the selected primary or secondary payer ID. A changed eligibility result is included in the claim review source hash, invalidating a stale approval. Missing mappings and contradictory duplicate credential decisions require review.

Run `CREDENTIAL_WORKSPACE_MYSQL_TEST=1 frontend/node_modules/.bin/vitest run --config backend/vitest.credentialing.config.js` for unit tests and the disposable local MySQL integration test. The latter requires the local test socket and never uses the production database.
