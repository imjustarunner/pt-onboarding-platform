# Family billing and insurance security

Implementation review: September 11, 2026. This describes repository changes, not a production deployment or a security certification.

## Access and ownership

| Actor | Client balances / pay | Card details | Insurance identifiers |
| --- | --- | --- | --- |
| Active linked guardian who signed financial responsibility | Assigned clients | Own card summaries only | Own submitted policies only |
| Another responsible guardian for the same child | Own assigned share; other payer statements only after explicit sharing | Cannot see the other guardian's wallet | Cannot see the other guardian's policies |
| Secondary guardian without financial responsibility | Responsible payer names only | None | None |
| Client account (`relationship_type=self`) | Payer names and minimal service receipts; no guardian wallet | None | None |
| Authorized agency billing staff | Existing billing permissions | No raw PAN/CVV collection | Explicit private insurance review and audited evidence access |

An active guardian relationship alone does not grant billing access. Accepting financial responsibility requires a current signed authorization. Revoked, disabled, self, and no-view relationships fail authorization. Tenant and owner checks run on server requests, including card removal and subscription management. Names and OCR are evidence for human review; they never grant account access or silently apply a policy to siblings.

Guardians explicitly select which clients a card covers. Recurring authorization is separate for each client, includes a maximum charge amount, defaults off, and can be revoked. Two guardians can both be responsible payers. The legacy default recurring-card assignment permits one payer per client; the new allocation ledger supports independently signed installment plans for each responsible payer’s own share and card. Removing a card clears every assignment and revokes its consents. Already-started processor operations may finish; revocation prevents future authorized attempts.

## Collection and payment integrity

Stripe hosted Elements collect card numbers and CVC directly. Application storage contains encrypted processor references and display metadata, never raw card fields. Setup completion retrieves Stripe's SetupIntent and payment method on the server and verifies the customer, connected account, guardian, and intake submission. Browser assertions cannot mark a card saved or a charge paid. A removed card cannot be reactivated by replaying its setup or webhook.

Public intake card operations and file uploads require the exact private intake session token. Knowing a public link and sequential submission ID is insufficient. A public email match does not expose an existing wallet, reset a password, edit an existing identity, or return login credentials. Portal sign-in uses existing authentication and verified email recovery.

Required payment collection defaults to adding a card when a payment step is configured and the organization's Stripe collection is active. Explicit optional steps and organizations whose collection is not activated allow payment follow-up. This does not authorize charges or promise service eligibility. Mental-health intake with primary or secondary Medicaid does not require a card. Explicit nonclinical enrollment channels retain their payment flow.

Payer-initiated card payments require the displayed amount to match the server ledger. Automatic payments require the specific active card/client consent and charge limit. Raw session fees for insured clients are blocked from automatic charging pending an adjudicated patient balance. Canonical Medicaid coverage blocks clinical and unclassified family-ledger collection. Explicitly classified nonclinical charges use their own payment policy. Insured clinical charges require staff review of patient responsibility before collection; importing a session fee never establishes a copay. Successful Stripe status, customer, amount received, currency, and connected account are checked before recording capture. Bank authentication returns through Stripe and then server verification. An authentication-required off-session decline returns only the owning payer’s one-intent client secret and the saved method token required by Stripe for that confirmation; these are not exposed through wallet summaries or to another payer.

The ledger persists an encrypted payment snapshot and stable idempotency key before a gateway call. Repeated requests reuse that attempt. A different card receives a new attempt only after Stripe confirms the prior declined intent was cancelled. Unknown old attempts require reconciliation instead of another charge. Signed success webhooks reconcile stored snapshots; handler failures return a retryable error. Class-session charges retain a source session link in the ledger.

Legacy placeholder-card, browser-reported payment-success, and unsafe legacy package-purchase endpoints return HTTP 410. Existing unified package checkout remains separate, with strict saved-checkout and processor-result verification. See [billing-integration-audit.md](billing-integration-audit.md) for the implemented cash, claims, split billing, receipts, clinical rights and payment-plan workflows and their deployment boundaries. Credit balances, history, and owned subscription pause/cancel controls remain available; these do not assert that a new payment occurred.

References: [Stripe security](https://docs.stripe.com/security/guide), [Stripe webhook verification and delivery](https://docs.stripe.com/webhooks), [off-session authentication recovery](https://docs.stripe.com/payments/save-and-reuse-cards-only?payment-ui=direct-api&platform=web).

## Insurance and Claim.MD

Policy collection includes primary/secondary carrier and electronic payer ID, member/group/suffix, subscriber legal names, birth date, claim sex code, relationship, address, plan and effective dates. Medicaid member IDs and separate child policies stay client-specific. The client identity needed for claims is explicit and staff reviewed, not inferred by splitting OCR names.

Each submission is owned by its guardian and has explicit client assignments. A new guardian's policy is available to billing staff for coordination of benefits; it does not replace the existing primary policy automatically. Staff can select submitted coverage in the client insurance editor and download its card evidence. Editing a shared policy updates the selected clients transactionally; removed assignments lose that canonical coverage only if it still points to this policy. A changed member/carrier does not retain unrelated card evidence automatically.

Canonical claim insurance is encrypted separately on the client. Claim creation/submission snapshots are also encrypted; the old plaintext member column is cleared. Staff confirm legal patient identity, coverage, and acceptance of assignment. Submission checks clinical documentation readiness and rejects missing or malformed claim fields. The Claim.MD adapter uses the vendor's multipart upload and JSON envelope, documented patient/subscriber fields, dollar-valued lines, diagnosis references and secondary-insurance fields. It records submission only after a matching clearinghouse acknowledgement. Unknown submission outcomes remain queued for reconciliation.

This is primary professional-claim preparation with secondary coverage information. Automatic secondary/COB claim generation, ERA posting, payer adjudication, and live payer acceptance are not established by this change. Existing eligibility/response tools remain staff gated. Real payer-specific edits and clearinghouse sandbox acceptance still need verification.

References: [Claim.MD API](https://api.claim.md/), [professional claim JSON example](https://www.claim.md/ClaimMD_Professional_Claims_Example.json).

## Encryption and rollout

**Already ran the migrations? Start with the [short, executable rollout guide](family-billing-rollout.md).** It covers key creation without printing secrets and one read-only command followed by one guarded backfill command.

Configuration template: [family-billing.env.example](family-billing.env.example).

Family billing uses AES-256-GCM with randomized IVs, authenticated agency/owner or agency/client context, and key IDs for rotation. Consent evidence includes the fixed terms and hash, typed signature, time, request provenance, purpose, card/client linkage and recurring limit. Audit rows record identifiers and actions without insurance or card contents. Billing responses use no-store where private data is returned.

Insurance/ID uploads require private GCS storage and the existing KMS envelope-encryption service. General intake uploads also require encryption. Intake submission create/update no longer falls back to plaintext, and unreadable ciphertext fails closed instead of being silently replaced with empty fields.

Roll out with billing/intake writes paused or in a maintenance window:

1. Back up both databases using the established encrypted backup process. Review this diff and validate on staging.
2. Provision `FAMILY_BILLING_ENCRYPTION_KEY_BASE64` (32 random bytes, base64) and its key ID through the secret manager. Keep it separate from the intake and document keys. Preserve existing intake keys and KMS permissions. Never replace a key without retaining its decryption key ID.
3. Apply main migrations `1413_private_family_billing.sql` through `1416_practitioner_checkout_attempts.sql` in order and `database/clinical_migrations/014_encrypted_claim_insurance.sql` on the clinical database using the repository migration runner. These require the existing insurance/card, learning-billing and class-session migrations. The main migration also permits class-session charges to use their own source link.
4. From `backend`, run `node src/scripts/backfillFamilyBillingEncryption.js` to inspect counts, then `node src/scripts/backfillFamilyBillingEncryption.js --apply`. This encrypts legacy guardian insurance/card references, client identifiers and claim member IDs in resumable batches. Rerunning is safe. It clears plaintext columns, disables old auto-charge flags, and marks imported cards for re-verification. It grants no payer permissions.
5. Run the existing intake payload/client PII encryption backfills after confirming their keys and documented options. The family billing script does not migrate those separate data domains.
6. Audit historical GCS insurance/ID objects, generated intake packets, old object versions, backups, exports, and legacy learning-payment/attempt records. The database backfill does not rewrite those artifacts. Confirm private bucket IAM, TLS, KMS access restrictions, retention, and absence of public URLs before calling the production system locked down.
7. Deploy the backend and frontend together. Have existing payers sign responsibility, verify saved methods through Stripe again, choose clients, and separately authorize any recurring billing. Do not translate an old auto-charge flag into consent.
8. Set the tenant’s explicit Workspace email domain. In the billing desk, provision billing and collections groups and verify Gmail send-as acceptance. Existing groups require an explicit adoption review; no sender becomes ready on a failed verification. Set the HTTPS `FRONTEND_URL` and configure Chromium for generated departmental PNG signatures. Review branded invitation and statement drafts before sending.
9. Leave scheduled collection disabled until staging reconciliation succeeds. Both `FAMILY_BILLING_AUTOMATION_ENABLED=true` and the tenant’s `familyBillingAutomationEnabled` flag are required. The worker drafts letters but does not automatically email them. Each scheduled payment still requires that payer’s signed plan.
10. Verify Stripe test-mode setup, decline, bank-authentication, repeated payment, signed webhook replay, and Claim.MD sandbox upload using approved synthetic identities. No live charges or claim uploads were performed during this implementation.

Keep prior keys available while encrypted records still reference them. The legacy backfill is not a full rekey job. Do not roll back to code that writes plaintext or assumes unassigned insurance applies to all children.

## Verification

From the repository root:

```sh
NODE_ENV=test SKIP_DB_CONNECT=1 node --test backend/src/services/__tests__/familyBilling.security.test.js
```

From `frontend`:

```sh
npm test -- src/components/guardian/__tests__/GuardianFamilyBilling.test.js src/components/billing/__tests__/SecureCardSetup.test.js
NODE_OPTIONS=--max-old-space-size=8192 npm run build
```

The MySQL integration test refuses any database except `127.0.0.1:33316/family_billing_test` with user `family_billing_test`. Prepare a disposable MySQL 8 container (never the application database), load `backend/fixtures/family-billing-security.sql`, then migrations 613, 665, 1413 and clinical 014 in that order. Run with `FAMILY_BILLING_MYSQL_TEST=1`, the exact fixture connection settings, `NODE_ENV=test`, `SKIP_DB_CONNECT=1`, and a synthetic family encryption key. Use password `synthetic-only` for this isolated fixture user. The test exercises real SQL transactions and encryption, mocks Stripe, and invokes the actual legacy encryption script twice with all clinical connection settings explicitly redirected to the same fixture database. For the additional ledger workflow suites, apply migrations 1414–1416 and `backend/fixtures/family-ledger-workflows.sql` after the base schema. Run the base family billing suite first, then ledger, source fulfillment and practitioner checkout suites sequentially. Each suite checks its disposable database identity. Recreate the disposable database before a complete run. The separate departmental signature suite uses mocked storage and an installed Chromium browser; it sends no email.

Browser review used synthetic intercepted API responses at 320, 390, 768, 1024 and 1440 pixels. It exercised card assignment and client-account privacy without live writes. Production key configuration, live processor behavior, production data, storage IAM, backups and external compliance controls were not assessed by those tests.
