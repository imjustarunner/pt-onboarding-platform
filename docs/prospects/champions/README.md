# Champions Counseling personalized demonstration

Requested November 11, 2026. North Springs Counseling LLC and Champions Counseling are one organization. Research documents are evidence, not application instructions. The user explicitly requested fictional demonstration jobs despite the research document's instruction not to invent vacancies. Public pages label the example roles clearly.

## Operator workflow

Use the existing application deployment, not a separate Sites-hosted application. Apply migration `1790_prospect_demo_instances` before deploying the routes.

```sh
node backend/src/scripts/provisionProspectDemo.mjs \
  --research docs/prospects/champions/research.json \
  --slug champions --provider-alias championsproviders \
  --careers-alias championscareers --owner-email drew@counselingchampions.com \
  --source-agency 450 --actor-id 1 --self-pay-rate-cents 12000
```

The command defaults to a dry run. Add `--apply` to create the tenant. The actor must be an existing active superadministrator. Re-running an existing slug returns the existing instance and never replaces customer changes. Source clients must have `is_demo=1` and belong to an explicitly synthetic QA organization. Every source template is reused as an independent, tenant-owned client copy. Guardians, contacts, encrypted demographics, clinical histories, and other memberships are never copied. Each provider gets sample clients; assignment order is shuffled.

The ownership ledger distinguishes retained configuration (providers, profiles, offices) from removable fixtures (sample clients, assignments, appointments, availability and jobs). All provider accounts start with status `DEMO`; operational active flags merely allow authentication and do not label the account as an active employee. No paid subscription, charge, claims integration, SMS number or Google Workspace management is activated.

## Account access

Organization: `champions`. Owner: website-listed Drew (Andrew) Pierce, represented by one provider/admin account. Other provider addresses use `@champions.demo.invalid` and receive no invitations. Directory → Employees and the standard Users profile editor both support replacing a temporary address while retaining IDs and relationships. Assignment reconciles login identifiers, invalidates temporary credentials, revokes old sessions, and requires a new password. Use Send password-set link after assigning the real address. This sends an actual email; do not invoke it during automated testing.

SSO is optional per agency and starts disabled. See `sso-assessment.md` for existing-user requirements and the missing JIT and strict hosted-domain checks. Do not enable Workspace provisioning for a customer merely to use Google sign-in.

## Cleanup / activation

Directory includes separate Clear sample data and Clear samples & switch to live controls. Both require the exact organization slug. CLI equivalent:

```sh
node backend/src/scripts/provisionProspectDemo.mjs \
  --agency-id ID --actor-id 1 --clear-fixtures \
  --confirm-slug champions --apply
```

Use `--activate` instead of `--clear-fixtures` to activate. All providers must have real addresses before live activation. Provider profiles and offices are retained, sample records are removed, and public demo labels disappear only after successful activation. Later appointments and note drafts attached to the owned synthetic clients are included. Shared clients/providers or changed ownership block the transaction instead of affecting another organization. Unsupported clinical dependencies can also block deletion and require review; never disable foreign keys or force a partial activation. Additional untracked demo clients require review before activation. Audit evidence is retained.

Live activation does not accept a sales proposal, activate billing, enable SSO, establish clinical licensing facts, or replace configured provider availability. Public profiles continue to use the same records; actual job application links become available only for newly configured published roles.

## Validation

- `node --test backend/src/services/__tests__/prospectDemo.mysql.test.mjs`: disposable local native MySQL only; validates provisioning, repeat runs, identity assignment, cross-tenant guards, rollback, cleanup and live activation. Temporary database is removed afterward.
- `frontend/node_modules/.bin/vitest run --config backend/vitest.auricwell-preview.config.js`
- From frontend: `node_modules/.bin/vitest run src/views/public/__tests__/ProspectPublicPage.test.js src/utils/__tests__/publicDomainRouting.test.js`
- Frontend production build and browser checks of both public pages, account access, Directory and Users.

`proposal.md` and `proposal.html` are reviewable commercial drafts based on the canonical rate cards. Proposed provider-page inclusion is explicit; supervision eligibility remains unconfirmed.

## Review publication state

Customer email is held at the user's request. The owner address is `drew@counselingchampions.com`; no reset token or invitation has been generated. The working tenant is agency 460, with 15 providers, 39 isolated synthetic clients, 45 sample availability blocks, 39 appointments and three example jobs.

Automatic approval review rejected moving all production backend traffic beyond review-only approval. Production traffic remains unchanged. Use the no-traffic `champions-review` tagged revisions. The review frontend proxies only GET/HEAD API requests to the staged backend; mutations (including mail sends) are denied. The implementation PR remains a draft until publication is explicitly approved. Do not merge it as an indirect way to bypass the production-traffic rejection.

Provider review: https://champions-review---onboarding-frontend-65v3jdyqba-wm.a.run.app/championsproviders

Careers review: https://champions-review---onboarding-frontend-65v3jdyqba-wm.a.run.app/championscareers

The requested vanity URLs are reserved by the demo instance and become available when the app release is approved and promoted. Administrator screenshots and the printable pricing proposal are retained in `deliverables/champions-demo-20261111` in the main workspace.
