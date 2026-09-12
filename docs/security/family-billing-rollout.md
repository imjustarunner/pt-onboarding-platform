# Family billing: finish the rollout

You have reported successful migrations. **Do not generate replacements for your existing intake, chat, or document keys.** Migrations add columns and tables; they do not encrypt historical records. The commands below run from the repository root.

## Your current setup (confirmed during this session)

You added `FAMILY_BILLING_ENCRYPTION_KEY_BASE64` and the `v1` key ID to GitHub secrets. **Keep that key; do not generate another.** The deployment workflow now forwards the three `FAMILY_BILLING_*` secrets to Cloud Run when set. Empty GitHub values preserve existing Cloud Run configuration. The workflow validates key length without printing it. Set `FAMILY_BILLING_ENCRYPTION_KEY_ID` to `v1` in GitHub as well. Retain previous keys if rotation is ever needed.

Your local `backend/.env` has a valid intake key but does not have the family billing key or key ID. Your successful dry run proves database access, while `--apply` requires the dedicated key locally. In your **zsh terminal**, paste the same key you saved in GitHub into this hidden prompt (input is not echoed or included in the command history):

```sh
read -rs 'FAMILY_BILLING_ENCRYPTION_KEY_BASE64?Paste the existing family billing key, then press Return: '
export FAMILY_BILLING_ENCRYPTION_KEY_BASE64
export FAMILY_BILLING_ENCRYPTION_KEY_ID=v1
```

These exports affect this terminal session only. From your current `backend` directory, run `npm run billing:check`. From the repository root, use the `npm --prefix backend ...` commands below. Never paste the key into chat. GitHub cannot reveal an existing secret value; use your retained copy/Secret Manager rather than generating a different key.

`DOCUMENTS_KMS_KEY` is also absent from the inspected local configuration. This does not block encryption of database columns, but encrypted uploads need the correct existing KMS resource and permissions in their runtime environment. Do not guess or replace a KMS resource to fix this.

Choose one source for the Cloud Run family variable: the configured GitHub secret forwarded by this workflow, **or** a manually bound Secret Manager reference with the GitHub value omitted. Do not configure conflicting literal and secret-reference values for the same variable. Secret Manager is preferable for longer-term key management; converting an existing literal must preserve the exact key bytes and ID.

## 1. First-time key setup only (skip if already configured)

If `FAMILY_BILLING_ENCRYPTION_KEY_BASE64` already contains a working key, keep it. Otherwise:

```sh
npm --prefix backend run billing:generate-key
```

This creates a random 32-byte key in a private temporary file and prints **only the file path**. It never prints the key or modifies your configuration. Import that file into Google Secret Manager as a new secret named `family-billing-encryption-key`. For example, after replacing the two placeholder values:

```sh
gcloud secrets create family-billing-encryption-key --project=YOUR_PROJECT --replication-policy=automatic --data-file=/PRIVATE/PATH/PRINTED/BY/THE/COMMAND
```

Do not rerun `create` over an existing secret, add a replacement version, or change an in-use key ID to fix an error. Check existing configuration first. Retain the secret in Secret Manager and remove the temporary file after successful import. Restrict `secretAccessor` to the backend runtime service account and the authorized migration operator, at this secret's scope.

In Cloud Run → `onboarding-backend` → Edit & deploy new revision → Variables & Secrets, reference that secret as:

- Environment variable: `FAMILY_BILLING_ENCRYPTION_KEY_BASE64`
- Secret: `family-billing-encryption-key`, pinned to the specific numeric version you created
- Ordinary environment variable: `FAMILY_BILLING_ENCRYPTION_KEY_ID=v1`
- Ordinary environment variable: `FAMILY_BILLING_AUTOMATION_ENABLED=false`

Keep the existing `INTAKE_RESPONSES_*`, `GUARDIAN_INTAKE_*`, and `DOCUMENTS_KMS_KEY` configuration unchanged. A Google KMS resource name is not interchangeable with the base64 family key. The deployment workflow uses `--update-env-vars`, so existing Secret Manager references survive code deployments; a manually bound key is not copied into the build image. Leave the matching GitHub key secret unset when using this binding method.

**The backfill process needs the same key and key ID as the deployed backend**, plus the existing intake key and database credentials. `DOCUMENTS_KMS_KEY` is separately required for encrypted file uploads. A secret's existence in Secret Manager does not automatically expose it to your terminal. Use your established authorized migration environment, loading secrets into environment variables without echoing them, shell tracing, or saving them in source control.

If the local cloud account needs reauthentication, run `gcloud auth login michael@plottwistco.com`. In this session the service account lacked Cloud Run read permission and the user credential required reauthentication; no production secrets or databases were inspected.

## 2. Run one read-only check

Run this in the same trusted environment used for the migrations, with explicit `DB_NAME`, `CLINICAL_DB_NAME`, `DB_HOST`, `DB_USER`, and `DB_PASSWORD` set. Both database names must be distinct. Preserve any separate clinical connection credentials.

```sh
npm --prefix backend run billing:check
```

It validates required encryption configuration, connects to the named databases, checks the family schema, authenticates existing encrypted family/intake records, and reports aggregate counts of legacy records still needing encryption. It does **not** modify records, generate payments, send messages, or validate cloud IAM/KMS permissions. A missing/wrong key or schema must be resolved before continuing. Do not create another key to bypass a decryption failure.

Verify that your successful migration run included **both** main migrations 1413–1416 and clinical migration 014 on the separate clinical database. Existing intake encryption migrations 725 and 726 are also prerequisites.

## 3. Backfill during the maintenance window

Confirm recoverable encrypted backups of both databases and pause intake/billing writes and workers using your established maintenance procedure. The CLI flags below attest that you have done this; they do not create backups or pause the app.

Replace `MAIN_DATABASE_NAME,CLINICAL_DATABASE_NAME` with the exact two names printed by the read-only check:

```sh
npm --prefix backend run billing:backfill -- --backup-confirmed --writes-paused --confirm-databases=MAIN_DATABASE_NAME,CLINICAL_DATABASE_NAME
npm --prefix backend run billing:check
```

The wrapper runs all three existing backfills in order and repeats the client PII batch until complete. It stops if a batch fails or makes no progress, verifies existing ciphertext again, and checks that pending counts are zero. It suppresses old scripts' raw driver errors to avoid logging patient data. If interrupted, rerun the check and resume with the same keys while writes remain paused. The three backfills are resumable, not one cross-database transaction.

Legacy card references are marked for re-verification and legacy automatic charging is disabled. This deliberately grants no new payer rights and does not infer consent. The existing direct intake scripts **write by default**; prefer this wrapper, whose default is read-only.

## 4. Verify before opening payment collection

Use a synthetic tenant/payer to verify login, private insurance upload/download, Stripe test-mode setup and payments, receipt downloads, guardian separation, and the branded payment-validation task. Confirm both server and web deployment jobs passed. A successful build or migration alone does not prove the live workflow works.

Keep automatic billing disabled until reconciliation and signed recurring consent have been verified. Billing/collections departmental email provisioning and send-as approval are separate setup tasks in the billing desk; they are not required to encrypt historical data. Review drafts before sending. Claim.MD sandbox acceptance remains separate from Stripe validation.

## What this does not certify

This migrates the specified database columns, not historical file objects, object versions, PDFs, exports, backups, or older ledgers. Review private bucket IAM, existing objects and their encryption, key permissions, retention, audit-log access, restoration, and vendor BAAs before representing the system as HIPAA compliant. See [security assessment boundaries](security-assessment-2026-09-11.md) and the [complete implementation notes](family-billing.md).
