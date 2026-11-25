import pool from '../config/database.js';
import {agencyDocumentPresentation} from './documentAgencyBranding.js';
import {buildPublicAppUrl} from '../utils/publicPortalUrl.js';
import {handbookTenant} from './handbookTenant.js';
export const CONTRACT_HANDBOOK_REFERENCE_VERSION='contract-handbook-modal-2026-11-25';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fail=(message,status=404)=>Object.assign(new Error(message),{status});
const validId=value=>Number.isSafeInteger(Number(value))&&Number(value)>0;
export async function portalContractHandbookAgency(userId,versionId,db=pool) {
  if(!validId(userId)||!validId(versionId))throw fail('A valid published handbook reference is required.',400);
  // Derive company from the immutable publication and the token owner's active
  // membership. Do not accept an agency selected by the caller or pick an
  // arbitrary first membership when the candidate belongs to two companies.
  const [rows]=await db.execute(`SELECT a.id FROM agencies a
    JOIN user_agencies ua ON ua.agency_id=a.id
    JOIN workplace_handbook_versions v ON v.agency_id=a.id
    WHERE ua.user_id=? AND COALESCE(ua.is_active,1)=1 AND v.id=? AND v.is_draft=0 LIMIT 1`,[Number(userId),Number(versionId)]);
  if(!rows[0])throw fail('This handbook reference is not available to this candidate.',403);
  return rows[0].id;
}

export async function publishedContractHandbookIndex(agencyId,db=pool) {
  const [rows]=await db.execute(`SELECT d.id AS document_id,v.id AS version_id,v.version_number,v.published_at,v.source_revision
    FROM workplace_handbook_documents d JOIN workplace_handbook_versions v ON v.id=d.published_version_id
    WHERE d.agency_id=? AND v.agency_id=? AND v.is_draft=0 LIMIT 1`,[agencyId,agencyId]);
  if(!rows[0])return null;
  const [sections]=await db.execute('SELECT id,slug,title,parent_slug,source_page,body_html FROM workplace_handbook_sections WHERE version_id=? AND agency_id=? ORDER BY sort_order,id',[rows[0].version_id,agencyId]);
  return {...rows[0],sections};
}

export function contractHandbookAnchor(agency,index,section,text=section.title) {
  const href=buildPublicAppUrl(agency,`workplace-handbook?agencyId=${Number(agency.id)}&versionId=${index.version_id}#handbook-${encodeURIComponent(section.slug)}`);
  return `<a href="${esc(href)}" data-handbook-reference="true" data-handbook-agency-id="${Number(agency.id)}" data-handbook-section="${esc(section.slug)}" data-handbook-version-id="${Number(index.version_id)}" data-handbook-title="${esc(section.title)}">${esc(text)}</a>`;
}

const bySlug=(index,...slugs)=>slugs.map(slug=>index.sections.find(s=>s.slug===slug)).find(Boolean);

const SERVICE_RATE_SECTIONS = {
  'contract-clinical-session-rate': { title: 'Clinical Session Rate appendix', heading: 'Clinical Session Rate', code: /^(?:907|908)\d{2}(?:\s*×\s*2)?$/ },
  'contract-direct-care-rate': { title: 'Direct Care Rate appendix', heading: 'Direct Care Rate', code: /^H\d{4}$/ }
};

// Select standard service rows from the cited publication. The Testing appendix
// is a separate section with its own authorization requirements.
export function contractServiceRateSection(sections, slug) {
  if (slug === 'contract-service-quantities-and-timekeeping') {
    const appendix = sections.find(section => section.slug === 'colorado-billing-compensation-appendix');
    const topic = String(appendix?.body_html || '').split(/(?=<h2(?:\s|>))/i)
      .find(part => /^<h2[^>]*>Actual time, payer units and internal credits<\/h2>/i.test(part));
    if (!topic) return null;
    return { ...appendix, slug, title: 'Actual time, payer units and internal credits', parent_slug: appendix.slug, body_html: topic };
  }
  const rate = Object.hasOwn(SERVICE_RATE_SECTIONS, slug) && SERVICE_RATE_SECTIONS[slug];
  const appendix = sections.find(section => section.slug === 'colorado-billing-compensation-appendix');
  if (!rate || !appendix) return null;
  const html = String(appendix.body_html || '');
  const topics = html.split(/(?=<h2(?:\s|>))/i);
  const methodology = topics.find(topic => topic.startsWith('<h2>' + rate.heading));
  const inventory = topics.find(topic => /^<h2>Saved code inventory<\/h2>/i.test(topic));
  if (!methodology || !inventory) return null;
  const columns = inventory.match(/<thead>[\s\S]*?<\/thead>/i)?.[0];
  const rows = [...inventory.matchAll(/<tr(?:\s[^>]*)?>[\s\S]*?<\/tr>/gi)].filter(([row]) => {
    const code = row.match(/<t[dh](?:\s[^>]*)?>([^<]*)<\/t[dh]>/i)?.[1]?.trim();
    return code && rate.code.test(code) && row.includes(rate.heading);
  });
  if (!columns || !rows.length) return null;
  return {
    ...appendix, slug, title: rate.title, parent_slug: appendix.slug,
    body_html: methodology + '<h3>Service codes and compensation quantities</h3><p>Use only services approved for your assignment and payer. The code table by itself gives no authorization to provide or bill a service.</p>' +
      '<table>' + columns + '<tbody>' + rows.map(([row]) => row).join('') + '</tbody></table>'
  };
}

export function linkContractHandbookHtml(html,{agency,index,clauseKey=''}={}) {
  if(!index?.sections?.length)return html;
  const keys=String(clauseKey).toUpperCase();
  const standardRate = slug => contractServiceRateSection(index.sections,slug);
  const timekeeping = standardRate('contract-service-quantities-and-timekeeping');
  const supervision = bySlug(index,'supervision-procedures');
  const rolePolicy = bySlug(index,'counseling-and-psychotherapy-role-expectations','service-focus-assignment');
  const levelPolicy = bySlug(index,'compensation-level-expectations-and-review','pay-levels-and-provider-designation');
  const missedFeePolicy = bySlug(index,'missed-session-fee-compensation');
  const probationPolicy = bySlug(index,'compensation-introductory-probationary-compensation','employee-contract-policy');
  const genericPolicy = keys === 'SUPERVISION' ? supervision : /DUTIES|JOB_DESC|ROLE_/.test(keys) ? rolePolicy : null;
  const mappings=[
    [/(?:Workplace Handbook Testing area|Testing handbook reference)/gi,/PSYCHOLOGICAL_TESTING/.test(keys) ? bySlug(index,'testing-services') : null],
    [/Clinical Session Rate appendix/gi,standardRate('contract-clinical-session-rate')],
    [/(?:Direct Care Rate appendix|Workplace Handbook appendix)/gi,standardRate('contract-direct-care-rate')],
    [/Colorado Billing (?:&amp;|&) Compensation Appendix(?: of the Workplace Handbook)?/gi,timekeeping],
    [/timekeeping and actual work policy/gi,timekeeping],
    [/Workplace Handbook(?:’s|&#39;s) missed-session fee compensation policy|Workplace Handbook policy(?= communicated)|Workplace Handbook(?=\. Record actual direct)/gi,missedFeePolicy],
    [/Workplace Handbook(?:’s|&#39;s) Training Leave policy/gi,bySlug(index,'training-leave-accrual-and-requests','training-leave-benefit')],
    [/Workplace Handbook(?:’s|&#39;s) “School mileage reimbursement” policy/gi,bySlug(index,'mileage-reimbursement-policy','school-mileage-reimbursement')],
    [/Workplace Handbook(?:’s|&#39;s) School Support Hours policy/gi,bySlug(index,'school-support-activity-hours','school-service-support-time')],
    [/Workplace Handbook section “[^”]+”/gi,levelPolicy],
    [/paid sick leave policy/gi,bySlug(index,'sick-leave-accrual-and-protected-use','paid-time-off-and-colorado-sick-leave')],
    [/introductory compensation policy/gi,probationPolicy],
    [/Clinical Supervision and Oversight(?: policies)?/gi,supervision],
    [/Workplace Handbook/gi,genericPolicy]
  ].filter(([,section])=>section);
  let anchorDepth=0;
  const linked=String(html).split(/(<[^>]*>)/g).map(part=>{
    if(part.startsWith('<')){if(/^<a\b/i.test(part))anchorDepth++;if(/^<\/a\b/i.test(part))anchorDepth=Math.max(0,anchorDepth-1);return part}
    if(anchorDepth)return part;
    // A single expression avoids nesting a generic Handbook link inside a
    // longer Testing link that was already emitted for this text node.
    const expression=new RegExp(mappings.map(([pattern])=>`(?:${pattern.source})`).join('|'),'gi');
    return part.replace(expression,text=>{const mapping=mappings.find(([pattern])=>{pattern.lastIndex=0;return pattern.test(text)});return mapping?contractHandbookAnchor(agency,index,mapping[1],text.replace(/&amp;/gi,'&')):text});
  }).join('');
  const slugs=new Set();
  if(/COMP|PAY_TABLE/.test(keys))for(const slug of ['pay-levels-and-provider-designation','compensation-included-indirect-service-component','compensation-introductory-probationary-compensation','direct-care-automatic-indirect-correction'])slugs.add(slug);
  if(/BENEFIT|BEN_INTERN/.test(keys))for(const slug of ['benefits-tier-framework','adp-pay-statements-and-sick-leave-hours','bonus-tax-withholding-and-gross-pay'])slugs.add(slug);
  if(/DUTIES|JOB_DESC|ROLE_/.test(keys))for(const slug of ['career-pathways-job-titles-service-focus-and-compensation-structure','career-pathway-overview','service-focus-assignment'])slugs.add(slug);
  if(/PSYCHOLOGICAL_TESTING/.test(keys))for(const slug of ['testing-services','psychological-testing-and-telephone-protocol','testing-code-examples-and-pay-buckets'])slugs.add(slug);
  if(/CHILDCARE/.test(keys))slugs.add('childcare-role-and-supervision');
  if(/BACHELORS_COUNSELING|PSYCHOTHERAPY/.test(keys))slugs.add('counseling-and-psychotherapy-role-expectations');
  if(keys === 'SUPERVISION' && supervision) slugs.add(supervision.slug);
  if(/TUTORING/.test(keys)&&!['tisi','innerstrength','inner-strength'].includes(agency.slug))for(const section of index.sections)if(/tutoring/i.test(section.title)&&/pay|compensation|learning|pathway|service/i.test(section.title))slugs.add(section.slug);
  if(/SIG_BLOCK|SIGNATURE_BLOCK/.test(keys))slugs.add('employee-contract-policy');
  const references=[...slugs].map(slug=>bySlug(index,slug)).filter(Boolean);
  if(!references.length)return linked;
  const footer=`<aside class="contract-handbook-references"><p><strong>Related Workplace Handbook policies · version ${Number(index.version_number)}:</strong> ${references.map(section=>contractHandbookAnchor(agency,index,section)).join(' · ')}</p><p><small>Open a policy to review its exact section and publication version. These references do not change the individual rates or duties stated in this agreement.</small></p></aside>`;
  return /<\/body\s*>/i.test(linked)?linked.replace(/<\/body\s*>/i,footer+'</body>'):linked+footer;
}

/** Explicit new/save operation only. Reads and releases use the stored HTML.
 * The caller supplies its existing transaction, so no separate draft/version
 * lifecycle or payroll operation is created by adding the reference. */
export async function annotateCompensationHandbookHtml(html,{agencyId,agency,db=pool,serviceRoles=[]}={}) {
  if(!agency){const [rows]=await db.execute('SELECT id,slug,name,feature_flags,color_palette FROM agencies WHERE id=? LIMIT 1',[agencyId]);agency=rows[0];}
  if(!agency)throw fail('The compensation agreement company is unavailable.');
  if(!handbookTenant(agency))return {html,reference:null};
  if(Number(agency.id)!==Number(agencyId))throw fail('The compensation agreement company does not match its handbook.',409);
  const index=await publishedContractHandbookIndex(agencyId,db);
  if(!index)throw fail('Publish this company’s approved Workplace Handbook before saving a new compensation agreement with policy references.',409);
  const roleKeys=(Array.isArray(serviceRoles)?serviceRoles:[]).filter(role=>['psychotherapy','bachelors_counseling','childcare','tutoring','psychological_testing'].includes(role)).map(role=>`ROLE_${role.toUpperCase()}`);
  let linked=linkContractHandbookHtml(html,{agency,index,clauseKey:['COMP_CATEGORY_LEVEL_BENEFITS_POLICIES',...roleKeys].join(' ')});
  const palette=agencyDocumentPresentation(agency).agencyBrand;
  if(palette){
    const colors=[palette.primary,palette.secondary,palette.accent].filter(color=>/^#[a-f0-9]{6}$/i.test(color||''));
    const brightness=color=>{const n=parseInt(color.slice(1),16);return .2126*(n>>16)+.7152*((n>>8)&255)+.0722*(n&255)};
    const ink=colors.sort((a,b)=>brightness(a)-brightness(b))[0],n=parseInt(palette.primary.slice(1),16);
    const tint='#'+[n>>16,(n>>8)&255,n&255].map(channel=>Math.round(channel*.14+255*.86).toString(16).padStart(2,'0')).join('');
    const style=`<style data-agency-document-palette="${Number(agencyId)}">body,h1,h2,h3{color:${ink}}a{color:${ink}}th{background:${tint}}.contract-handbook-references{border-left:3px solid ${palette.accent};background:${tint};padding:10px 14px;margin:16px 0;font-size:13px}</style>`;
    linked=/<\/head\s*>/i.test(linked)?linked.replace(/<\/head\s*>/i,style+'</head>'):style+linked;
  }
  return {html:linked,
    reference:{policyVersion:CONTRACT_HANDBOOK_REFERENCE_VERSION,agencyId:Number(agencyId),documentId:index.document_id,versionId:index.version_id,versionNumber:index.version_number,sourceRevision:index.source_revision}};
}

// Caller authorizes the reader or portal token before invoking this read-only
// resolver. Agency and publication constraints are enforced again in SQL.
export async function readContractHandbookReference({agencyId,slug,versionId},db=pool) {
  if(!validId(agencyId)||!String(slug||'').trim()||String(slug).length>240||versionId&&!validId(versionId))throw fail('A valid company, handbook section and publication version are required.',400);
  const [versions]=await db.execute(`SELECT d.id AS document_id,v.id AS version_id,v.version_number,v.published_at,v.source_revision
    FROM workplace_handbook_documents d JOIN workplace_handbook_versions v ON v.document_id=d.id
    WHERE d.agency_id=? AND v.agency_id=? AND v.is_draft=0 AND ${versionId?'v.id=?':'v.id=d.published_version_id'} LIMIT 1`,versionId?[Number(agencyId),Number(agencyId),Number(versionId)]:[Number(agencyId),Number(agencyId)]);
  const version=versions[0];if(!version)throw fail('This published handbook version is not available for this company.');
  const [sections]=await db.execute('SELECT id,slug,title,parent_slug,source_page,body_html FROM workplace_handbook_sections WHERE version_id=? AND agency_id=? ORDER BY sort_order,id',[version.version_id,Number(agencyId)]);
  const section=sections.find(s=>s.slug===slug) || contractServiceRateSection(sections,slug);if(!section)throw fail('This section is not part of the referenced handbook version.');
  const [agencies]=await db.execute('SELECT id,name,slug,color_palette FROM agencies WHERE id=? LIMIT 1',[Number(agencyId)]);const agency=agencies[0];if(!agency)throw fail('Company not found.');
  const location=[];let cursor=section;const visited=new Set();while(cursor&&!visited.has(cursor.slug)){visited.add(cursor.slug);location.unshift({slug:cursor.slug,title:cursor.title});cursor=sections.find(s=>s.slug===cursor.parent_slug)}
  return {agency:{id:agency.id,name:agency.name,slug:agency.slug},document:{id:version.document_id,title:`${agency.name} Workplace Handbook`},
    version:{id:version.version_id,number:version.version_number,publishedAt:version.published_at,sourceRevision:version.source_revision},
    section:{id:section.id,slug:section.slug,title:section.title,parentSlug:section.parent_slug,sourcePage:section.source_page,bodyHtml:section.body_html},location,
    metadata:{presentation:agencyDocumentPresentation(agency)}};
}
