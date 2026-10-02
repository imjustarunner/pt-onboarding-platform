# Meeting transcription and AI privacy

Meeting content must be encrypted before database writes. The shared AES-256-GCM key is `CLIENT_CHAT_ENCRYPTION_KEY_BASE64`; retain historical keys in `CLIENT_CHAT_ENCRYPTION_KEYS_JSON` when rotating it. Missing keys, failed encryption, and unreadable ciphertext stop processing. Legacy plaintext can be read until the backfill completes, but new content writes cannot fall back to plaintext.

Protected content includes team/supervision transcripts, summaries, goals, action items, recording references, personal notes, agenda text, meeting chat/polls/questions, recording summary sections, interview artifacts, tutoring transcripts/summaries, and clinical draft input/output. Attendance, scheduling, foreign keys and other operational metadata remain database fields; cloud database/storage encryption and access controls must cover the complete database and backups.

Session summaries, consolidation, and clinical note writing pass through `sessionAiPrivacy.service.js`. There is one shared policy for all non-client-session meetings, including staff, CPA, supervision, and interviews: participant names may be used in AI requests. Only start/pause/stop permissions and auto-start behavior vary. Client sessions have a separate policy: names are replaced with Client or Provider when the role is known, other identifiers are redacted, and no names are restored in AI note text. Known client/session identifiers are removed locally. Google Sensitive Data Protection inspects the remaining text in overlapping windows, and detected identifiers are removed before Vertex AI receives a prompt. Non-session meetings retain person names; their other detected identifiers use temporary tokens. Incomplete or failed inspection stops the request. No public API-key model fallback is allowed. Other redacted meeting details can be restored in application memory after generation for authorized attendees. Task owners retain their names under the shared non-session policy. This map is never stored or sent to the model. Clinical note generation keeps the replacements.

Automatic detection is risk reduction, not a certification that arbitrary free text meets HIPAA de-identification standards. Treat original and redacted data as sensitive throughout the approved processing environment. Outputs still require clinician review.

Team meetings use the authenticated audio-upload route and the configured Cloud Speech-to-Text service. General meetings still require the host to start transcription. Pause/stop changes invalidate in-flight audio using a persisted revision. Clinical/supervision recording retains its existing consent checks. Other browser dictation must enforce on-device recognition (`processLocally=true`); browsers without this capability cannot use browser-cloud dictation. Use the approved recording workflow instead.

Before production processing, the operator must verify:

- The executed Google Cloud BAA covers the actual account/projects and services used (Speech-to-Text, Sensitive Data Protection, Cloud Storage, Vertex AI), and any video/recording vendors are covered under the applicable agreements.
- Speech-to-Text data logging/training opt-in is disabled. Vertex AI model choice, retention, abuse monitoring and logging settings meet the organization's agreement and policy. Do not assume this is configured from a model name.
- Dedicated private audio storage, least-privilege service accounts, TLS, encrypted storage/backups, access audit logging, and a retention/deletion policy are configured. Temporary audio objects use random names and are deleted after recognition; configure bucket lifecycle cleanup for crashed requests or failed deletion, considering soft-delete/version retention.
- Enable the DLP API and grant the service account the necessary inspection permissions in the approved project. `GCP_PROJECT_ID` (or existing project alias) must identify it. Vertex must also be configured in the approved environment.
- Only after that review set the existing `CLINICAL_AI_PRIVACY_APPROVED=true` operator attestation. It does not verify a signed BAA automatically. Without it, audio processing and session AI requests are blocked.

Rollout: apply migration `1521_meeting_content_encryption.sql`, deploy the encrypted readers/writers with the encryption key configured, then run the backfill in the same environment:

```sh
node backend/src/scripts/backfillMeetingContentEncryption.js
node backend/src/scripts/backfillMeetingContentEncryption.js --apply
node backend/src/scripts/backfillMeetingContentEncryption.js
```

The default mode reports counts only. Apply uses locked batches and is safe to rerun; the final dry run should report zero remaining content rows. It does not rewrite historical backups or external Google Meet documents/recordings; handle those through the retention policy. Do not roll back to old plaintext-only readers after encrypting rows. No production migration, cloud configuration change, or backfill was performed during local implementation.

References: [HHS cloud guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/health-information-technology/cloud-computing/index.html), [Google Cloud HIPAA guidance](https://cloud.google.com/security/compliance/hipaa?hl=en), [Speech-to-Text data logging](https://docs.cloud.google.com/speech-to-text/docs/v1/enable-data-logging), [Sensitive Data Protection inspection](https://docs.cloud.google.com/sensitive-data-protection/docs/reference/rest/v2/projects.content/inspect).
