# Hiring documents and process settings — September 21, 2026

Hiring & Pre-Hire and Onboarding have separate settings views. Each shows its default package contents and opens a phase-filtered package editor in place. Switching views preserves unsaved settings. Pre-hire setups no longer present an onboarding package selector.

Default documents and job postings can use the shared rich-text document writer. “Write / paste document” stores formatted content in the pre-hire configuration, with organization printable branding or a selected letterhead. Preview and candidate signing use the same PDF renderer. The signed hire record retains the original rendered pages and the visible signature receipt. Uploaded files remain supported.

The job editor shows inherited default documents, allows per-job overrides and exclusions, and lists available tenant/platform document templates with included status and edit links. Videos, links and meetings can be added directly to a posting as pre-hire steps. Selected library documents are assigned as required signing tasks.

Candidates can fill flat PDFs by placing text, checkmarks and signature boxes. Entries can be dragged, resized and edited, with page navigation and mobile zoom. Existing configured/native fields retain their structured input flow. Server validation rejects invalid pages, out-of-bounds entries, empty entries and answers that cannot fit. Completed PDFs contain flattened visible entries and an attachment preserving the supplied values. The captured signature supplies every signature placement; arbitrary image URLs are not accepted.

The release includes the shared Library document writer and its dependencies from the concurrent document-editor work, including migration `1469_library_document_branding.sql`. Backend startup runs pending migrations; no production database was changed directly during local verification.

Validation: hiring/clinical backend suite (161 tests), Library controller suite (11), Library rendering/permissions node suite (7), frontend hiring/clinical/Library suite (43), production frontend compilation, and desktop/mobile Chrome checks. Browser checks verified page-to-page entry retention and extracted the candidate's entered name from the finalized PDF. No candidate invitations were sent during testing.
