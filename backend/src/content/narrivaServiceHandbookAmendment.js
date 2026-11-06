import { getClinicalServiceReference, listClinicalServiceReferences } from '../services/clinicalServiceReference.service.js';

export const NARRIVA_SERVICE_RELEASE = 'narriva-h2011-2026-11-v1';
export const H2011_HANDBOOK_SLUG = 'clinical-service-reference-h-codes';
const escape = text => String(text || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h2011 = getClinicalServiceReference('H2011');
export const H2011_HANDBOOK_TITLE = 'H-code service reference · H2011 crisis intervention';
export const H2011_HANDBOOK_HTML = `<h3>H2011 · Crisis intervention, 15-minute units</h3>
<p>October 2026 SBHS Billing Manual, effective October 1, 2026, page 80. This is base H2011 only; H2011 ET Mobile Crisis Response is a different service and is not enabled by this update.</p>
<p>${escape(h2011.serviceDescription)}</p><h4>Provider qualifications and ages</h4>
<p>${escape(h2011.providerQualifications)}</p><p>${escape(h2011.ageGroups)}</p>
<p>Bachelor’s-level providers are included in the supplied service-provider list. A degree, code menu or handbook entry alone does not establish individual competence, approved scope, supervision, payer enrollment or authorization.</p>
<h4>Time and documentation</h4><p>Minimum 8 minutes; 15-minute units. The application uses its existing 8-minute unit ladder, up to 16 units and 247 encounter minutes. The manual’s 15-minute maximum describes a unit, not a maximum encounter. At 248 minutes or more, billing must review S9485; the app does not automatically substitute or enable that code.</p>
<p>${escape(h2011.documentation)}</p><p>${escape(h2011.placesOfService)}</p>
<p>Crisis language prompts service-code review. Confirm the service actually delivered, duration, modality, participants, qualifications and documentation before changing H0004 to H2011 or an eligible psychotherapy service to 90839. Do not convert a claim automatically, create overlapping time or infer an additional payable service.</p>
<p>Record the reason for the crisis contact, interventions and response, relevant history and treatment needs, other concerns identified, and the follow-up or coordination plan. Follow current Service Documentation Standards. Existing agency rates, service restrictions and payer requirements remain in effect; this update creates no new fee or pay rate.</p>`;

export function clinicalServiceHandbookSections() {
  const rows = listClinicalServiceReferences().map(info => `<tr><td>${escape(info.code)}</td><td>${escape(info.title)}</td><td>${info.source.pages.length ? `October 2026 SBHS · p. ${info.source.pages.join(', ')}` : 'Not in supplied SBHS manual; use current agency/payer reference'}</td></tr>`).join('');
  return [
    { slug: 'clinical-service-reference', title: 'Service details and documentation references', parentSlug: null, status: 'ready', sourcePage: null,
      bodyHtml: `<p>Open Service information next to the selected service in Note Workspace to read the supplied description, documentation, ages, provider qualifications, places of service and source edition. These references describe services; they do not override agency approvals or authorize a claim. Codes absent from the supplied manual are explicitly identified rather than assigned invented requirements.</p><table><thead><tr><th>Code</th><th>Service</th><th>Supplied reference</th></tr></thead><tbody>${rows}</tbody></table>` },
    { slug: H2011_HANDBOOK_SLUG, title: H2011_HANDBOOK_TITLE, parentSlug: 'clinical-service-reference', status: 'ready', sourcePage: 80, bodyHtml: H2011_HANDBOOK_HTML }
  ];
}

/** Only add these independent sections; never rewrite another handbook policy. */
export function applyNarrivaServiceHandbookAmendment(source) {
  for (const section of clinicalServiceHandbookSections()) {
    if (!source.sections.some(existing => existing.slug === section.slug)) source.sections.push(section);
  }
}
