import { getPublishedHandbook } from './workplaceHandbook.service.js';
import { sourceForAgency } from './workplaceHandbookWorkflow.service.js';
import { handbookMetadata } from './workplaceHandbookContent.js';

// Optional reading may use the same company reference edition as the staff library.
// Acknowledgement still requires a published version; editable drafts stay private.
export async function getPortalHandbookEdition(agencyId, { referenceOnly = false } = {}) {
  const published = await getPublishedHandbook(agencyId);
  if (published?.version && published.sections?.length) return published;
  if (!referenceOnly) return null;
  const source = await sourceForAgency(agencyId);
  if (!source?.sections?.length) return null;
  return { beta: true, version: null, revision: source.revision,
    metadata: { ...handbookMetadata(source), beta: true }, sections: source.sections, updates: [] };
}
