import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { handbookTenant } from './handbookTenant.js';
import { cleanHandbookHtml, validateHandbookSections, parseHandbookMetadata } from './workplaceHandbookContent.js';
import { applyProviderRolesNovemberPolicy } from '../content/providerRolesNovember2026.js';
import { applyCollectiveHandbookReview, COLLECTIVE_HANDBOOK_RELEASE } from '../content/collectiveHandbookNovember2026.js';
import { testingReferenceCatalog } from '../content/testingHandbookReference.js';
import { agencyDocumentPresentation } from './documentAgencyBranding.js';
import { planTestingInventoryReferences } from './serviceCodeInventoryPresentation.js';

const legacyMappings = JSON.parse(fs.readFileSync(new URL('../content/handbooks/itsco-draft-updates.json', import.meta.url), 'utf8')).updates;
export const ownerReviewHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Plan only; it cannot publish, assign a contract, activate billing or change pay. */
export function planOwnerReviewedHandbookRelease(snapshot, { approvalFileHash, approvedOn = '2026-11-13' } = {}) {
  const { agency, document, version, sections, digests = [], entries = [], medical = [] } = snapshot;
  const tenant = handbookTenant(agency);
  if (!tenant || !document || !version) throw new Error('A configured company and its reviewed handbook edition are required.');
  const priorMetadata = parseHandbookMetadata(version.metadata_json);
  if (!version.is_draft && priorMetadata.ownerApproval?.release === COLLECTIVE_HANDBOOK_RELEASE) return { agency, alreadyFinal: true, versionId: version.id, versionNumber: version.version_number };
  if (!version.is_draft) throw new Error('Prepare a reviewed draft before publishing a new owner-review edition.');
  const source = { ...priorMetadata, sections: sections.map(s => ({ databaseId: s.id, slug: s.slug, title: s.title, bodyHtml: s.body_html || '', parentSlug: s.parent_slug || null, sourcePage: s.source_page, status: s.content_status })) };
  const rolePolicy = applyProviderRolesNovemberPolicy(source, [], tenant);
  const reviewed = applyCollectiveHandbookReview(source, rolePolicy.updates, tenant);
  const prepared = source.sections.map((s, index) => ({ ...s, bodyHtml: cleanHandbookHtml(s.bodyHtml), sortOrder: index }));
  validateHandbookSections(prepared.map(s => ({ slug: s.slug, title: s.title, parent_slug: s.parentSlug })));
  const nonready = prepared.filter(s => s.status !== 'ready' || !s.bodyHtml.trim());
  if (nonready.length) throw new Error(`Unfinished supplied sections require review: ${nonready.map(s => s.slug).join(', ')}`);
  const map = new Map(prepared.map(s => [s.slug, s]));
  const updatedEntries = [];
  const removedEntryIds = [];
  const orphanEntries = [];
  for (const entry of entries) {
    const mapping = legacyMappings.find(m => m.subject === entry.subject);
    const primary = entry.handbook_section_slug || mapping?.handbook_section_slug;
    if (source.removedSectionSlugs?.includes(primary)) { removedEntryIds.push(entry.id); continue; }
    const destinationSlugs = entry.handbook_section_slug ? [entry.handbook_section_slug] : mapping?.policy_section_slugs || [primary];
    const destinations = [...new Set(destinationSlugs)].map(slug => map.get(slug)).filter(Boolean);
    if (!destinations.length) { orphanEntries.push({ id: entry.id, subject: entry.subject, slug: primary }); continue; }
    const body = destinations.length === 1 ? destinations[0].bodyHtml : destinations.map(s => `<h3>${escape(s.title)}</h3>${s.bodyHtml}`).join('');
    updatedEntries.push({ ...entry, handbook_section_slug: destinations[0].slug, changed_content: body });
  }
  if (orphanEntries.length) throw new Error(`Unlinked update entries cannot be finalized: ${orphanEntries.map(e => `${e.id}:${e.subject}`).join('; ')}`);
  const november = digests.find(d => d.period_label === 'November 2026');
  if (digests.filter(d => d.period_label === 'November 2026').length > 1) throw new Error('Multiple November drafts require reconciliation.');
  const novemberAdditions = [];
  for (const update of reviewed.updates.filter(u => u.period_label === 'November 2026')) {
    const section = map.get(update.handbook_section_slug);
    if (!section) continue;
    const matches = updatedEntries.filter(e => e.digest_id === november?.id && e.handbook_section_slug === section.slug);
    const next = { subject: update.subject || section.title, rationale: update.rationale || 'Owner-approved November revision; this update reflects the current manual section.', changed_content: section.bodyHtml, handbook_section_slug: section.slug };
    if (matches.length) {
      Object.assign(matches[0], next);
      for (const duplicate of matches.slice(1)) removedEntryIds.push(duplicate.id);
    } else if (!novemberAdditions.some(e => e.handbook_section_slug === section.slug)) novemberAdditions.push(next);
  }
  // Every November reference is the exact final policy, not a copy from a
  // different company or an older source snapshot.
  const finalEntries = updatedEntries.filter(e => !removedEntryIds.includes(e.id));
  for (const entry of finalEntries) {
    if (entry.digest_id === november?.id) entry.changed_content = map.get(entry.handbook_section_slug).bodyHtml;
    else {
      const context = 'Finalized November 13, 2026 against the current manual. This was an unpublished October source draft; publication does not backdate terms, signatures or payroll changes.';
      entry.rationale = `${context} ${entry.rationale || ''}`.trim();
    }
  }
  const versionNumber = Number(snapshot.maxVersionNumber ?? version.version_number) + 1;
  const metadata = {
    ...priorMetadata, presentation: agencyDocumentPresentation(agency, priorMetadata.presentation || {}),
    testingReference: testingReferenceCatalog(), ownerReviewRelease: COLLECTIVE_HANDBOOK_RELEASE,
    excludedUnprovidedSections: source.ownerReviewExcludedEmptySections || [],
    ownerApproval: { release: COLLECTIVE_HANDBOOK_RELEASE, status: 'final', approvedOn, authority: 'Owner’s written chat instructions to apply the detailed review, approve all, finalize and initiate a new version.', reviewExportSha256: approvalFileHash || null, supersedesDraft: { id: version.id, version: version.version_number }, prospectiveMinimumWorkloadWaivedFrom: approvedOn }
  };
  const sourceRevision = ownerReviewHash({ release: COLLECTIVE_HANDBOOK_RELEASE, sections: prepared.map(s => [s.slug, s.title, s.bodyHtml, s.parentSlug]), metadata });
  return { agency, alreadyFinal: false, documentId: document.id, versionId: version.id, originalVersionNumber: version.version_number, versionNumber, sourceRevision, metadata,
    sections: prepared, removedSectionIds: sections.filter(s => !map.has(s.slug)).map(s => s.id),
    digests, novemberDigestId: november?.id || null, entries: finalEntries, novemberAdditions, removedEntryIds: [...new Set(removedEntryIds)],
    medicalInsertions: planTestingInventoryReferences(agency, medical), minimumWorkloadWaivedFrom: approvedOn };
}
