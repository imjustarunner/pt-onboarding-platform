# Entries added after a note is signed

Implemented locally September 24, 2026. Apply clinical migration `021_typed_note_entries.sql` before deploying the backend and frontend together. It adds nullable fields so historical entries retain their original classification/signature evidence, rather than inventing a retrospective author signature.

## Terminology and policy

- **Addendum:** additional information that became available after the original entry, including an explanation of supporting material when applicable.
- **Amendment / correction:** identify the original error and document the corrected information; never overwrite the original signed narrative.
- **Late entry:** information recalled from the encounter but omitted from the original documentation, entered using the current date with the reason for the delay.

An amended record can contain any of these. A signature on the original does not turn every subsequent addition into a correction. Noridian's [Documentation Guidelines for Amended Medical Records](https://med.noridianmedicare.com/web/jeb/article-detail/-/view/10525/documentation-guidelines-for-amended-medical-records), updated June 12, 2025 and verified September 24, 2026, distinguishes the three and calls for attributable, currently dated, signed entries while retaining the original. CMS's [Program Integrity Manual, chapter 3, section 3.3.2.5](https://www.cms.gov/Regulations-and-Guidance/Guidance/Manuals/Downloads/pim83c03.pdf) describes Medicare review of amendments, corrections and delayed entries. These are documentation references, not a determination of every Colorado licensing board's or payer's requirements.

The agency's chosen rule is stricter: **every post-signature entry requires fresh supervisor approval**, including non-service notes with discretionary review disabled. That is an explicit product/agency policy, not a claim that all licensing rules impose the same requirement.

## Implemented behavior

The signed note form selects the type, captures entry text and a required reason, and requires the entry author's electronic attestation. The API enforces those fields. The authenticated user's identity and database timestamp record the new signature; callers cannot backdate it. The original remains intact. Old entries are labeled historical, without assigning signatures that were never captured.

The existing note transaction invalidates the previous supervisor cosign, retains its history, and requests fresh approval. Exact-version review includes type, reason and author signature; edits invalidate review. Clinical text and reasons pass through the same privacy processing before AI content review. Signing a new entry does not itself establish an AI review result.

Narrative entries do not create claims or transmit anything. Service code/unit proposals require the amendment/correction type and the existing separate service attestation. They follow the [claim correction workflow](claim-amendments-and-corrections.md) against the existing encounter/claim, including holds and supervisor/billing review. Never clone or reset a paid/submitted claim to create a second original.

The former Note Aid separate-copy amendment button opens the signed note's entry form. New separately labeled amendment copies are rejected at the note model boundary. Existing historical copies remain on file and require supervisor review. Older unsaved amendment drafts must be transferred to the original note's entry form; they are not silently converted or transmitted.

Full-note text copy and treatment-summary PDF exports include the original documentation plus the post-signature text, reasons, author identities and recorded timestamps. Original and entry signatures remain distinct.

## Remaining attachment work

This change implements **text entries**, not artwork/worksheet uploads. Supporting files need an authorized, tenant/client-scoped upload and read workflow, immutable file versions/digests bound to the entry and supervisor review, retention, and inclusion in record exports. A worksheet uploaded after signing is supporting material; the accompanying entry is classified by whether it supplies new information, corrects an error, or records omitted information. An arbitrary URL or mutable document link is not a signed attachment.

The existing treatment-summary print-upload reference is a separate workflow and is not a general-purpose addendum attachment mechanism. Do not describe it as one.
