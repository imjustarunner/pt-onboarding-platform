import {TESTING_SERVICE_CODES,TESTING_SERVICE_POLICY_VERSION,testingCompensationBasis} from './testingServicePolicy.js';
import {TESTING_REFERENCE_VERSION,TESTING_ROOT_SLUG,TESTING_PROTOCOL_SLUG,TESTING_EXAMPLES_SLUG,TESTING_SECTION_SLUGS,testingExamplesHtml,testingExampleForCode} from './testingServiceExamples.js';
export {TESTING_ROOT_SLUG,TESTING_PROTOCOL_SLUG,TESTING_EXAMPLES_SLUG,TESTING_SECTION_SLUGS,TESTING_REFERENCE_VERSION};
export function testingReferenceCatalog() {
 return {referenceVersion:TESTING_REFERENCE_VERSION,compensationPolicyVersion:TESTING_SERVICE_POLICY_VERSION,activation:'prospective_signed_schedule_only',buckets:{credit:'Clinical Session Rate',hcode:'Direct Care Rate',indirect:'Approved administrative duties; no clinical CPT code substituted'},codes:TESTING_SERVICE_CODES.map(d=>({...d,compensationBasis:testingCompensationBasis(d),example:testingExampleForCode(d.code)}))};
}
export function testingReferenceSections(protocolHtml) {
 return [
  {slug:TESTING_ROOT_SLUG,title:'Testing — services, code examples and pay buckets',bodyHtml:`<p>Use this Testing area for qualifications, Medicaid-only testing requirements, code-specific activities, paid credits/time and source references. Clinical Session, Direct Care and indirect are compensation buckets; they do not change the clinical service or its claim code. Adoption is prospective through the completed individual agreement. Preserve existing signed terms and earned pay.</p><p><a href="#handbook-${TESTING_PROTOCOL_SLUG}">Qualifications, timing and service rules</a> · <a href="#handbook-${TESTING_EXAMPLES_SLUG}">Sourced examples and compensation buckets</a></p>`,status:'ready',parentSlug:null,sourcePage:null},
  {slug:TESTING_PROTOCOL_SLUG,title:'Testing qualifications, supervision and service rules',bodyHtml:protocolHtml,status:'ready',parentSlug:TESTING_ROOT_SLUG,sourcePage:null},
  {slug:TESTING_EXAMPLES_SLUG,title:'Testing code examples, sources and compensation buckets',bodyHtml:testingExamplesHtml(TESTING_SERVICE_CODES,testingCompensationBasis),status:'ready',parentSlug:TESTING_ROOT_SLUG,sourcePage:null}
 ];
}
export function testingDigestBody(sections) {
 return sections.filter(s=>TESTING_SECTION_SLUGS.includes(s.slug)).map(s=>`<h3>${s.title}</h3>${s.bodyHtml??s.body_html}`).join('');
}
