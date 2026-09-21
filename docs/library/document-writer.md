# Library document writer

The Library's **Create document** action opens the same rich-text editor used for existing branded documents, directly shared documents, and personal template copies. It supports headings, fonts and sizes, bold/italic/underline/strike, highlighting and text color, alignment, lists, checklists, links, tables, page breaks, undo/redo, spellcheck, and formatted paste. On phones, Formatting expands the toolbar.

Saved documents autosave after a one-second pause. Saves are serialized, including edits made while a request is pending. Every write checks the loaded version atomically. A conflict keeps the draft on screen and offers a personal copy or an explicit reload; it never silently overwrites the other writer. Closing or navigating away first attempts to save. Failed saves remain visible with retry and discard controls. Document bodies are not cached in browser storage. New documents must first be created with **Save document**.

**Make my copy** creates an independent personal document owned by the current user. **Share → Give Personal Copy** distributes individual copies to agency members and skips recipients who already have an active copy of that source. Copies retain the source reference, content and branding choice, but do not inherit its shared folder or permissions. Later edits to source content do not alter copies. Sharing can alternatively grant view or edit access to the original. Shared editing uses save-conflict detection; it does not provide live cursors or real-time text merging.

Letterhead choices include **Organization · Printable pages**, **Plain paper**, and named active letterhead templates. Organization branding uses `resolvePacketBrandChrome`, the same header, footer, watermark and font resolver used by printable packets. Administrators can create multiple named letterheads, preview them, and duplicate an existing version without changing the original. Header/footer, page size, orientation and margins are included in PDF previews and exports. Choose a distinct named version when a design needs to remain separate; letterhead designs themselves are not immutable snapshots.

Print preview and PDF download use the same backend rendering function, including unsaved content in preview. Headers and footers repeat, and automatic and explicit pagination are handled by Chromium. Word export includes content, tables, page breaks, header/footer and page numbers; Word may paginate or render custom CSS differently. The renderer fails explicitly when Chromium is unavailable rather than substituting an unbranded plain-text PDF.

Document HTML is sanitized on write, copy, read and render. Preview documents have a restrictive CSP. Personal-resource reads, exports and copies require ownership or a direct/folder share within the current agency. Recipient IDs are checked against agency membership. Uploaded PDFs/Word files and external Google links retain their existing view-only behavior; formatted text can be pasted into an app document. This feature does not import or synchronize Google documents.

## Rollout

Apply migration **1469_library_document_branding.sql** before starting the updated backend:

```sh
node database/run-migrations.js --migration=1469
```

This adds `branding_mode` and preserves existing documents' plain/named-letterhead choices. The existing `version` column provides concurrency tokens. Install the updated backend/frontend lockfiles and deploy both applications together. Chromium must be available using the existing PDF renderer configuration. No production migration or deployment was performed during implementation.

## Verification

```sh
cd frontend
npm test -- src/components/library/__tests__
NODE_OPTIONS=--max-old-space-size=8192 npx vite build
cd ..
NODE_ENV=test node --test backend/src/services/__tests__/libraryDocument.service.test.js
./frontend/node_modules/.bin/vitest run --root backend src/controllers/__tests__/libraryDocuments.test.js src/controllers/__tests__/letterheadVersions.test.js --environment node
```

Checks cover autosave serialization and failures, conflict-copy recovery, read-only editing, personal-copy ownership, agency boundaries, recipient membership, HTML sanitization, atomic version checks, letterhead scope, version duplication, and preserving omitted page settings. A local Chrome smoke test with mocked API responses also verified desktop/mobile editing, tables, checklists, letterhead selection and copy navigation. A separate real Chromium render produced a two-page branded PDF and a DOCX whose XML contained a table, explicit page break and header/footer parts. These checks do not replace a migration-backed staging smoke test with real user sessions.
