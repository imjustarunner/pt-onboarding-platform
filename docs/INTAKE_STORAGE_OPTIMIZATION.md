# Intake Storage Optimization

This doc captures the storage layout for public intake submissions and the
levers we have to keep GCS spend in check without losing legal artifacts.

## What gets stored per submission

For every signed intake submission, the GCS bucket ends up with three classes of
PDF objects:

1. **Per-template signed PDFs** — `intake_signed/{submissionId}/{templateId}/...pdf`
   - One file per signed document template (HIPAA, Disclosure & Consent, ROI, etc.).
   - Each has its own `pdf_hash` recorded in `intake_submission_documents`.
   - **These are the legal artifacts**. Never delete.
2. **Per-client bundle** — `intake_signed/{submissionId}/client_{clientId}/...pdf`
   - The merge of one child's signed templates only.
   - Recorded in `intake_submission_clients.bundle_pdf_path`.
3. **Combined bundle** — `intake_signed/{submissionId}/bundle/intake-bundle-{submissionId}.pdf`
   - The merge of every signed template across all children, with the answers
     summary PDF prepended.
   - Recorded in `intake_submissions.combined_pdf_path`.
   - **This is a convenience artifact**, not a legal record. The per-template
     hashes are the source of truth; the combined hash is an audit log.

For a single-child submission with five templates, this historically meant
roughly 3× the unique content sat in GCS (per-template files + per-client bundle
+ combined bundle). For a HayCar-shaped submission (~10 MB of unique content)
that was ~30 MB stored.

## Optimizations applied

### Single-child per-client bundle dedup (shipped)

For submissions with exactly one child (the common case), the per-client bundle
upload is now skipped entirely. After the combined bundle saves, we copy its
path and hash into `intake_submission_clients.bundle_pdf_path` /
`bundle_pdf_hash` so all existing readers (per-child receipt download flow,
completion email per-child links, retention cleanup) keep working transparently.

Net storage savings: **~33% per single-child submission** (one fewer ~10 MB
object), zero behavior change for staff or parents.

For multi-child submissions the per-client bundle is still saved — each child
gets their own packet (page subset + only their templates) which legitimately
differs from the combined bundle.

See `publicIntake.controller.js` — search for `Single-child storage dedup`.

## Optimizations to consider next

### GCS lifecycle policy on bundles

The combined bundle (`intake_signed/*/bundle/`) is downloaded a handful of times
in the first week after submission and then almost never. With a lazy
regeneration helper in place (see "Lazy bundle regeneration" below), we can
safely set a GCS lifecycle rule to move or delete bundle objects after 30–60
days.

**Recommended bucket lifecycle rules** (set in the GCS console for the
`PTONBOARDFILES` bucket):

```yaml
- action: { type: SetStorageClass, storageClass: NEARLINE }
  condition:
    matchesPrefix: ["intake_signed/"]
    age: 30  # days

- action: { type: SetStorageClass, storageClass: COLDLINE }
  condition:
    matchesPrefix: ["intake_signed/"]
    age: 180  # days

- action: { type: SetStorageClass, storageClass: ARCHIVE }
  condition:
    matchesPrefix: ["intake_signed/"]
    age: 365  # days
```

Tier moves (Standard → Nearline → Coldline → Archive) drop per-GB cost without
touching object availability. A retrieval still works the same way for staff;
only egress + first-byte latency change.

Per Google's pricing as of 2026:
- Standard: $0.020/GB-month
- Nearline: $0.010/GB-month (50% off)
- Coldline: $0.004/GB-month (80% off)
- Archive: $0.0012/GB-month (94% off)

For 1 TB of intake PDFs aged into Archive, that's $1.20/month vs $20/month — a
~94% reduction without losing a single byte.

**Do not use lifecycle delete rules** on `intake_signed/*` until the lazy
regeneration helper below is in place. Per-template signed PDFs must always be
preserved; only the bundle aggregations are safely regeneratable.

### Lazy bundle regeneration (future PR)

Stop saving the combined bundle eagerly. When someone clicks "Download
Packet", check if the GCS object exists; if not, re-merge from the per-template
signed PDFs and upload. This combined with a 30-day lifecycle delete on
`intake_signed/*/bundle/` would drop ~50% of intake storage cost.

Open design questions for that PR:

1. **Answers PDF prefix.** The combined bundle currently includes a
   machine-generated answers summary as its first pages. That summary is built
   by `buildAnswersPdfBuffer()` in `publicIntake.controller.js`, which depends
   on a lot of in-controller helpers. To regenerate, this needs to either move
   to a service or accept that regenerated bundles lack the summary.
2. **Hash drift.** A regenerated bundle won't byte-match the original (PDF
   merge timestamps differ), so `combined_pdf_hash` will no longer match the
   live file. Need to either:
   - Drop `combined_pdf_hash` and rely solely on per-template hashes for
     integrity (recommended — the bundle is convenience-only).
   - Or update `combined_pdf_hash` on each regen and accept the drift.
3. **Email links.** The completion email contains a 7-day GCS signed URL. With
   eager save the URL works immediately. With lazy regen we'd need either to
   keep the eager save (and rely on lifecycle to delete later) or switch the
   email to point at a backend endpoint that triggers regen.

Recommendation: keep eager save at submission time + add a regen safety net
that fires when reads find a missing object (so older submissions whose bundles
have aged out of the bucket can still be downloaded).

### What's NOT worth chasing

- **`pdf-lib` `useObjectStreams: true`** — already the default in pdf-lib's
  `save()`, so passing it explicitly is a no-op.
- **Image recompression on signed PDFs** — would change the byte stream and
  invalidate `pdf_hash`, breaking the per-template integrity audit. Don't do
  this without re-signing.
- **HTML rendering for signed documents** — not legally defensible. Hashes
  cover specific PDF bytes; if we render HTML on demand with current CSS/fonts,
  any future style change would silently alter what the user "signed". Keep
  PDFs for anything legally binding. The non-binding answers summary is a
  fair candidate for HTML rendering in the admin viewer though.
