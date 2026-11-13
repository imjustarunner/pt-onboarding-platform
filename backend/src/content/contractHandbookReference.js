/** Descriptive wording for newly rendered category/level agreements only.
 * Keep the internal service identifier, URLs and stored/signed documents intact.
 * Code mappings and clinical examples belong to the Workplace Handbook.
 */
export const CONTRACT_PRESENTATION_VERSION = 'handbook-service-reference-2026-11-13';
export function handbookReferencedContractHtml(html) {
  return String(html||'').split(/(<[^>]*>)/g).map(part=>part.startsWith('<')?part:part.replace(/\bH2014\b/g,'therapeutic skills services (Therapy + Tutoring component)')).join('');
}
