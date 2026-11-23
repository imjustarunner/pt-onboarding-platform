# Fax intake and referral directory links

## Inbound referral numbers

The Notifyre referral routes recognize ITSCO at **719-431-8895**, Next Level Up at **719-750-0350**, and The Inner Strength Institute at **719-302-2551**. A route belongs to the agency whose active slug matches the configuration. For additional lines, set `NOTIFYRE_REFERRAL_FAX_ROUTES_JSON` to a JSON object mapping E.164 receiving numbers to agency slugs. An explicit object replaces the built-in routes. An empty object disables them.

In Notifyre, subscribe the existing signed account webhook to **Fax Received**. The primary endpoint is `https://app.itsco.health/api/notifyre/webhook`. The AuricWell alias can accept the configured referral numbers if both routes use the same Notifyre account token. Maintain the carrier's signed BAA reference and keep the signing secret and API token in Secret Manager. Use HTTPS and preserve the raw callback bytes for signature verification. [Notifyre webhook setup](https://support.notifyre.com/creating-a-webhook)

The app acknowledges an authenticated callback after persisting the carrier receipt. A retry-safe worker downloads the PDF over the carrier API, encrypts it with the existing KMS-backed fax key, and opens a generic agency ticket for clear referrals. Billing, records requests, and other non-referrals stay in **Tickets → Fax intake review**. Unreadable or ambiguous faxes remain in that staff queue. Review the original before promoting a fax to a referral ticket. Fax contents and OCR stay out of ticket text, notifications, and logs.

Open a fax referral ticket to review the encrypted original and map the fields. Verify the referring organization against the directory, then choose an existing chart or create a new patient. Filing attaches the encrypted original, creates the incoming referral link, associates the ticket with the client, and marks the referral **Fax referral**. The original document and review accesses are audited. User verification is required before creating a chart, attaching a fax, or associating the referral with a sender.

The public contact pages label the existing main office number, the Notifyre sender eligible for appointment reminders, and the agency's active referral fax. A fax becomes visible after the carrier confirms the number on the same account and the required encryption configuration is available. The backend consumes only the fax event and keeps appointment and provider text assignments in place.

The client manager now offers **New client → From fax**. Select the agency and service organization, upload a downloaded fax, review source text and the original PDF/image, and assign the detected values to client, guardian, contact, insurance, or referring-practice fields. The mapper offers name buttons, an explicit ignore option, corrections, and manual fields. Duplicate field assignments and unreviewed intake block creation. A fax containing multiple detected patients must be split before creating a client.

Select an existing approved directory organization or find/add one using the business lookup. The existing directory approval policy still applies to staff proposals. Public lookup sends only the explicitly entered business name and city/state. It does not receive fax OCR, patient names, dates of birth, or client IDs. New public matches are suggestions for staff review, never automatic identity matches. Directory entries now include fax and source URL fields.

Saving uses the existing client-creation permissions, organization validation, status defaults, and duplicate checks. A transaction creates the client, encrypted guardian profile and demographics archive, original encrypted document metadata, incoming referral relationship, and consumed-draft marker together. The original document is encrypted with the existing KMS-wrapped AES-256-GCM mechanism and opens through the existing authenticated PHI document viewer. Retrying the same consumed draft returns the existing client. Guardian contacts are kept separate from client contacts; this flow does not grant portal access or opt anyone into reminders.

On existing client charts, **Contacts & relationships → Referrals** supports incoming and outgoing links, an original referral date, and an optional existing chart document. Staff can add past referrals without re-uploading the document, edit links, and remove a mistaken link without deleting the document. Reviewed fax fields, including insurance and referral reason, are readable from the encrypted archive in this panel; they do not automatically establish insurance coverage or create a diagnosis. The client list filters by directory company and direction. The directory shows linked clients in each viewer's client-access scope, with links to their charts. Each client can have one relationship per directory entry and direction; editing updates that relationship and its associated document/date.

## Deployment

Apply `database/migrations/1495_fax_intake_referral_links.sql` and `database/migrations/1875_inbound_fax_referrals.sql` with the repository migration runner. The inbound worker runs alongside the existing application schedulers.

Use the existing private GCS bucket, application credentials, `REFERRAL_KMS_KEY` (or `DOCUMENTS_KMS_KEY`), demographics encryption configuration (`CLIENT_PHI_ENCRYPTION_KEY_BASE64` or the existing chat key ring), and guardian intake encryption configuration. Fax intake fails closed if these encryption services are not configured. Operational chart fields such as client name, birth date, address, and phone continue using the application's existing database columns; the database's storage encryption and access controls remain necessary. Original faxes, temporary OCR drafts, guardian profiles, and the imported demographics archive are encrypted at the application layer. This change does not assert or certify HIPAA compliance.

Enable Cloud Vision and the existing PHI-approved Vertex configuration in the appropriate Google project. Suggestions call `callGeminiText` with `vertexOnly: true` and `sensitive: true`; there is no API-key fallback. If suggestions are unavailable, staff can map OCR text manually. Vision failure, unreadable pages, and oversized documents produce actionable errors. Supported uploads are PDF, PNG, and JPEG, up to 10 MB and 30 PDF pages. PDF OCR uses online batches of five pages and keeps coordinates for column interpretation; no unencrypted staging objects are written to GCS. [Cloud Vision online file annotation](https://docs.cloud.google.com/vision/docs/samples/vision-batch-annotate-files).

Drafts expire after 24 hours; the server's hourly job deletes unconsumed expired rows. Closing the mapper also attempts to discard its unconsumed draft. Consuming a draft immediately removes its encrypted payload, retaining the opaque identifier and client association for retries. Chart documents are not assigned the draft expiry. The stored document filename is an opaque fax identifier, not the uploaded filename. Error responses deliberately exclude OCR, SQL parameters, and cloud request payloads. No VirusTotal upload is used for PHI.

For general public business lookup, configure `GOOGLE_MAPS_API_KEY` with Places API (New). Lookup requests ask for business name, address, phone, website, and source URL. The known Alliance suggestion also works without this API. [Places Text Search documentation](https://developers.google.com/maps/documentation/places/web-service/text-search).

The included Alliance suggestion is **Alliance Urgent Care & Family Practice**, 9320 Grand Cordera Parkway #100, Colorado Springs, CO 80924, phone 719-282-6337, fax 719-282-0532. Contact details were checked on September 28, 2026 against the [practice's own website](https://www.alliancemedicalpractice.com/services/family-practice). It is not automatically inserted into any tenant or presumed to match a particular fax.

The manual upload remains available for faxes outside the configured carrier intake. Use synthetic test documents when checking receipt, OCR, encryption, routing, and chart filing in a deployed environment.

## Verification

From `backend`: `../frontend/node_modules/.bin/vitest run --config vitest.fax-intake.config.js`

From `frontend`: `./node_modules/.bin/vitest run src/components/clients/__tests__/FaxClientIntake.test.js`

Tests use synthetic records and mocked cloud/database services to cover all-page OCR, coordinate preservation, evidence grounding, multi-client rejection, field validation, encryption-only draft storage, transaction rollback, document attachment, retries, agency isolation, assigned-provider access, historical documents, outbound lookup minimization, review invalidation, and tenant-switch cleanup.
