import DOMPurify from 'dompurify';
import { dedicatedAppHostForSlug, hostnameFromCustomDomain } from './publicPortalUrl.js';

const positive = value => (typeof value === 'number' || typeof value === 'string' && /^[1-9]\d*$/.test(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const slug = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,199}$/.test(value) ? value : null;
function descriptor(value, expectedAgencyId) {
  const agencyId = positive(value?.agencyId), sectionSlug = slug(value?.sectionSlug), expectedVersionId = positive(value?.expectedVersionId);
  if (!agencyId || !sectionSlug || !expectedVersionId || (positive(expectedAgencyId) && agencyId !== Number(expectedAgencyId))) return null;
  return { agencyId, sectionSlug, expectedVersionId, sectionTitle: typeof value.sectionTitle === 'string' ? value.sectionTitle.slice(0, 500) : '' };
}
export function referenceFromContractClick(event, { root, expectedAgencyId } = {}) {
  const link = event.target?.closest?.('a[data-handbook-reference="true"]');
  if (!link || (root && !root.contains(link))) return null;
  const result = descriptor({ agencyId: link.dataset.handbookAgencyId, sectionSlug: link.dataset.handbookSection,
    expectedVersionId: link.dataset.handbookVersionId, sectionTitle: link.dataset.handbookTitle || link.textContent }, expectedAgencyId);
  if (result) event.preventDefault();
  return result;
}
export function referenceFromContractMessage(event, iframe, { expectedAgencyId } = {}) {
  if (event.origin !== 'null' || !iframe?.contentWindow || event.source !== iframe.contentWindow || event.data?.type !== 'contract-handbook-reference') return null;
  return descriptor(event.data, expectedAgencyId);
}

/** Resolve only this company's handbook citations; the caller keeps its pinned version. */
export function handbookSectionFromHref(href, { agency, origin = globalThis.window?.location?.origin } = {}) {
  if (typeof href !== 'string') return null;
  const fragment = href.match(/^#handbook-([a-z0-9][a-z0-9-]{0,199})$/);
  if (fragment) return fragment[1];
  const agencySlug = String(agency?.slug || '').trim().toLowerCase();
  if (!slug(agencySlug) || !positive(agency?.id)) return null;
  let url, current;
  try { current = new URL(origin); url = new URL(href, current); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
  const section = url.hash.match(/^#handbook-([a-z0-9][a-z0-9-]{0,199})$/);
  const path = url.pathname.match(/^\/(?:([a-z0-9][a-z0-9-]{0,199})\/)?workplace-handbook\/?$/);
  if (!section || !path) return null;
  const requestedAgencies = url.searchParams.getAll('agencyId');
  if (requestedAgencies.length > 1 || requestedAgencies.length === 1 && positive(requestedAgencies[0]) !== Number(agency.id)) return null;
  const dedicatedHost = dedicatedAppHostForSlug(agencySlug);
  const customHost = hostnameFromCustomDomain(agency.custom_domain || agency.customDomain);
  const companyHost = !!(dedicatedHost && url.hostname === dedicatedHost || customHost && url.hostname === customHost);
  if (url.origin !== current.origin && !companyHost) return null;
  if (path[1]) {
    if (path[1] !== agencySlug && !(dedicatedHost && dedicatedAppHostForSlug(path[1]) === dedicatedHost)) return null;
  } else if (!companyHost && requestedAgencies.length !== 1) return null;
  return section[1];
}

/** A click bridge only: the isolated contract frame never receives credentials. */
export function contractHandbookSrcdoc(html) {
  const safe = DOMPurify.sanitize(String(html || ''), { WHOLE_DOCUMENT: true, ADD_TAGS: ['style'], ADD_ATTR: ['target'] });
  const bridge = `<script>document.addEventListener('click',function(event){var link=event.target.closest('a[data-handbook-reference="true"]');if(!link)return;event.preventDefault();parent.postMessage({type:'contract-handbook-reference',agencyId:Number(link.dataset.handbookAgencyId),sectionSlug:link.dataset.handbookSection,expectedVersionId:Number(link.dataset.handbookVersionId),sectionTitle:link.dataset.handbookTitle||link.textContent},'*');});<\/script>`;
  return /<\/body\s*>/i.test(safe) ? safe.replace(/<\/body\s*>/i, bridge + '</body>') : safe + bridge;
}
